import asyncio
from celery import Task
from app.core.celery import celery_app
from app.services.pdf_service import PDFService
from app.services.ocr_service import OCRService
from app.services.translation_service import TranslationService
from app.services.layout_service import LayoutDetectionService


class TranslationTaskWithCallback(Task):
    def on_success(self, retval, task_id, args, kwargs):
        print(f"Task {task_id} completed successfully")
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        print(f"Task {task_id} failed: {exc}")


@celery_app.task(bind=True, base=TranslationTaskWithCallback)
def process_pdf_translation(self, task_id: str, file_path: str, pdf_type: str):
    from app.api.translation import tasks_storage
    
    pdf_service = PDFService()
    ocr_service = OCRService()
    translation_service = TranslationService()
    layout_service = LayoutDetectionService()
    
    try:
        if pdf_type == "text":
            paragraphs = pdf_service.extract_text(file_path)
        elif pdf_type == "image":
            paragraphs = asyncio.run(ocr_service.extract_from_images(file_path))
        else:
            text_paras = pdf_service.extract_text(file_path)
            image_paras = asyncio.run(ocr_service.extract_from_images(file_path))
            paragraphs = text_paras + image_paras
        
        self.update_state(state="TRANSLATING", meta={"progress": 30})
        
        layout_elements = layout_service.detect_layout(file_path)
        
        translatable_elements = []
        for elem in layout_elements:
            element_type = elem.element_type.value if hasattr(elem.element_type, 'value') else str(elem.element_type)
            if element_type not in ['image', 'table', 'chart'] and elem.content.strip():
                translatable_elements.append(elem)
        
        if translatable_elements:
            texts_to_translate = [elem.content for elem in translatable_elements]
            translated_texts = asyncio.run(translation_service.translate_texts(texts_to_translate))
            
            for elem, translated in zip(translatable_elements, translated_texts):
                elem.content = translated
        
        self.update_state(state="COMPLETING", meta={"progress": 90})
        
        layout_response = []
        for idx, elem in enumerate(layout_elements):
            element_type = elem.element_type.value if hasattr(elem.element_type, 'value') else str(elem.element_type)
            should_translate = element_type not in ['image', 'table', 'chart']
            
            # For images and tables, keep original content as display text
            original_content = elem.content
            if not should_translate:
                if element_type == 'table':
                    original_content = "[表格]"
                elif element_type == 'image':
                    original_content = elem.content or f"[图片 {idx + 1}]"
            
            layout_response.append({
                "id": idx + 1,
                "element_type": element_type,
                "bbox": list(elem.bbox) if elem.bbox else None,
                "page_number": elem.page_number,
                "content": original_content,
                "table_data": elem.table_data,
                "translation": elem.content if should_translate else original_content,
                "should_translate": should_translate
            })
        
        if task_id in tasks_storage:
            tasks_storage[task_id]["status"] = "completed"
            tasks_storage[task_id]["progress"] = 100
            tasks_storage[task_id]["layout"] = layout_response
            tasks_storage[task_id]["paragraphs"] = [{"id": p.id, "type": p.type, "original": p.original, "translation": p.translation, "page_number": p.page_number} for p in paragraphs]
        
        return {
            "status": "completed",
            "task_id": task_id,
            "layout": layout_response,
            "paragraphs": [{"id": p.id, "type": p.type, "original": p.original, "translation": p.translation, "page_number": p.page_number} for p in paragraphs]
        }
    
    except Exception as e:
        if task_id in tasks_storage:
            tasks_storage[task_id]["status"] = "failed"
            tasks_storage[task_id]["error"] = str(e)
        return {
            "status": "failed",
            "task_id": task_id,
            "error": str(e)
        }


@celery_app.task
def health_check_task():
    return {"status": "healthy"}
