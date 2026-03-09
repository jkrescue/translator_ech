from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
import uuid
import fitz
import io

from app.models.schemas import (
    TranslationResponse, TranslationStatus, Paragraph, LayoutElement, ElementType
)
from app.tasks.translation_tasks import process_pdf_translation
from app.services.pdf_service import PDFService
from app.services.layout_service import LayoutDetectionService

router = APIRouter()

tasks_storage = {}


@router.get("/pdf/{task_id}/page/{page_num}")
async def get_pdf_page_image(task_id: str, page_num: int, dpi: int = 150):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_info = tasks_storage[task_id]
    file_path = task_info.get("file_path")
    
    if not file_path or not file_path.endswith('.pdf'):
        raise HTTPException(status_code=404, detail="PDF file not found")
    
    try:
        doc = fitz.open(file_path)
        
        if page_num < 1 or page_num > len(doc):
            doc.close()
            raise HTTPException(status_code=400, detail="Invalid page number")
        
        page = doc[page_num - 1]
        
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        img_bytes = pix.tobytes("png")
        
        doc.close()
        
        return StreamingResponse(
            io.BytesIO(img_bytes),
            media_type="image/png",
            headers={
                "Content-Disposition": f"inline; filename=page_{page_num}.png"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to render PDF: {str(e)}")


@router.get("/pdf/{task_id}/info")
async def get_pdf_info(task_id: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_info = tasks_storage[task_id]
    file_path = task_info.get("file_path")
    
    if not file_path or not file_path.endswith('.pdf'):
        raise HTTPException(status_code=404, detail="PDF file not found")
    
    try:
        doc = fitz.open(file_path)
        page_count = len(doc)
        
        pages_info = []
        for page_num in range(page_count):
            page = doc[page_num]
            pages_info.append({
                "page_number": page_num + 1,
                "width": page.rect.width,
                "height": page.rect.height
            })
        
        doc.close()
        
        return {
            "page_count": page_count,
            "pages": pages_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get PDF info: {str(e)}")


@router.post("/upload", response_model=TranslationResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    # VERSION 2 - DEBUG
    import sys
    print(f"UPLOAD_PDF VERSION 2 - Python {sys.version}", flush=True)
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    task_id = str(uuid.uuid4())
    file_path = f"/tmp/pdf_translator/uploads/{task_id}.pdf"
    
    import os
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    pdf_service = PDFService()
    layout_service = LayoutDetectionService()
    
    layout_response = None
    page_count = None
    
    try:
        import fitz
        doc = fitz.open(file_path)
        page_count = len(doc)
        doc.close()
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[DEBUG] PDF page count: {page_count}")
        
        layout_elements = layout_service.detect_layout(file_path)
        logger.info(f"[DEBUG] Layout elements count: {len(layout_elements)}")
        
        layout_response = []
        for idx, elem in enumerate(layout_elements):
            element_type = elem.element_type.value if hasattr(elem.element_type, 'value') else str(elem.element_type)
            should_translate = element_type not in ['image', 'table', 'chart']
            
            layout_response.append(LayoutElement(
                id=idx + 1,
                element_type=element_type,
                bbox=list(elem.bbox) if elem.bbox else None,
                page_number=elem.page_number,
                content=elem.content,
                table_data=elem.table_data,
                translation="",
                should_translate=should_translate
            ))
        
        logger.info(f"[DEBUG] Layout response count: {len(layout_response)}")
        
        tasks_storage[task_id] = {
            "status": "pending",
            "filename": file.filename,
            "file_path": file_path,
            "progress": 0,
            "layout": layout_response,
            "page_count": page_count
        }
        logger.info(f"[DEBUG] Task stored successfully")
    except Exception as e:
        logger.error(f"[DEBUG] Error in upload_pdf: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")
    
    task = process_pdf_translation.apply_async(
        args=[task_id, file_path, "text"],
        task_id=task_id
    )
    
    print(f"RETURNING - layout_response type: {type(layout_response)}, page_count: {page_count}", flush=True)
    
    return TranslationResponse(
        task_id=task_id,
        status="pending",
        message="Translation task created",
        layout=layout_response,
        page_count=page_count
    )


@router.get("/tasks/{task_id}/status", response_model=TranslationStatus)
async def get_task_status(task_id: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_info = tasks_storage[task_id]
    
    return TranslationStatus(
        task_id=task_id,
        status=task_info.get("status", "pending"),
        progress=task_info.get("progress", 0),
        filename=task_info.get("filename", "")
    )


@router.get("/tasks/{task_id}/result")
async def get_translation_result(task_id: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_info = tasks_storage[task_id]
    
    if task_info.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Translation not completed")
    
    return {
        "paragraphs": task_info.get("paragraphs", []),
        "layout": task_info.get("layout", []),
        "page_count": task_info.get("page_count", 1)
    }


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    tasks_storage[task_id]["status"] = "cancelled"
    return {"message": "Task cancelled"}
