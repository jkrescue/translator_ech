from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os
import uuid
import asyncio
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Dict

from app.core.config import settings
from app.models.schemas import (
    TranslationStatus, Paragraph,
    TranslationResponse, HealthResponse
)

app = FastAPI(title="PDF Translator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.services.pdf_service import PDFService
from app.services.translation_service import TranslationService
from app.services.ocr_service import OCRService

pdf_service = PDFService()
translation_service = TranslationService()
ocr_service = OCRService()

tasks_storage: Dict = {}
executor = ThreadPoolExecutor(max_workers=2)


def process_translation_sync(task_id: str, file_path: str, pdf_type: str):
    """同步处理翻译任务"""
    try:
        tasks_storage[task_id]["status"] = "processing"
        tasks_storage[task_id]["progress"] = 10
        
        if pdf_type == "text":
            paragraphs = pdf_service.extract_text(file_path)
        elif pdf_type == "image":
            paragraphs = asyncio.run(ocr_service.extract_from_images(file_path))
        else:
            text_paras = pdf_service.extract_text(file_path)
            image_paras = asyncio.run(ocr_service.extract_from_images(file_path))
            paragraphs = text_paras + image_paras
        
        tasks_storage[task_id]["progress"] = 50
        tasks_storage[task_id]["total_paragraphs"] = len(paragraphs)
        
        translated = asyncio.run(translation_service.translate_batch(paragraphs))
        
        tasks_storage[task_id]["progress"] = 90
        tasks_storage[task_id]["paragraphs"] = [
            {
                "id": p.id,
                "type": p.type,
                "original": p.original,
                "translation": p.translation,
                "page_number": p.page_number
            }
            for p in translated
        ]
        tasks_storage[task_id]["status"] = "completed"
        tasks_storage[task_id]["progress"] = 100
        tasks_storage[task_id]["completed_at"] = datetime.now().isoformat()
        
    except Exception as e:
        tasks_storage[task_id]["status"] = "failed"
        tasks_storage[task_id]["error"] = str(e)
        print(f"Translation error: {e}")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        services={
            "ocr": "available",
            "translation": "available",
            "pdf_processor": "available"
        }
    )


@app.post("/api/upload", response_model=TranslationResponse)
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    task_id = str(uuid.uuid4())
    file_path = os.path.join(settings.upload_dir, f"{task_id}.pdf")
    os.makedirs(settings.upload_dir, exist_ok=True)
    
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    pdf_type = pdf_service.detect_pdf_type(file_path)
    
    tasks_storage[task_id] = {
        "status": "pending",
        "filename": file.filename,
        "file_path": file_path,
        "pdf_type": pdf_type,
        "progress": 0,
        "paragraphs": []
    }
    
    executor.submit(process_translation_sync, task_id, file_path, pdf_type)
    
    return TranslationResponse(
        task_id=task_id,
        status="pending",
        message="Translation task created successfully"
    )


@app.get("/api/tasks/{task_id}", response_model=TranslationStatus)
async def get_task_status(task_id: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_info = tasks_storage[task_id]
    
    return TranslationStatus(
        task_id=task_id,
        status=task_info.get("status", "pending"),
        progress=task_info.get("progress", 0),
        filename=task_info.get("filename", ""),
        error=task_info.get("error")
    )


@app.get("/api/tasks/{task_id}/result")
async def get_translation_result(task_id: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_info = tasks_storage[task_id]
    
    if task_info.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Translation not completed")
    
    return {"paragraphs": task_info.get("paragraphs", [])}


@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    tasks_storage[task_id]["status"] = "cancelled"
    return {"message": "Task cancelled"}


@app.get("/api/export/{task_id}/{format}")
async def export_translation(task_id: str, format: str):
    if task_id not in tasks_storage:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_info = tasks_storage[task_id]
    
    if task_info.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Translation not completed")
    
    paragraphs_data = task_info.get("paragraphs", [])
    paragraphs = [Paragraph(**p) for p in paragraphs_data]
    
    output_path = pdf_service.generate_output(
        paragraphs,
        task_info.get("filename", "document"),
        format
    )
    
    return FileResponse(
        output_path,
        filename=f"{task_info.get('filename', 'document').split('.')[0]}_translated.{format}",
        media_type="application/octet-stream"
    )


from app.models.schemas import TranslationRequest

@app.post("/api/translate")
async def translate_text(request: TranslationRequest):
    result = await translation_service.translate_single(
        request.text,
        request.source_lang,
        request.target_lang
    )
    return {"translation": result}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
