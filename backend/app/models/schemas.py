from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class PDFType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    MIXED = "mixed"


class ElementType(str, Enum):
    TITLE = "title"
    TEXT = "text"
    TABLE = "table"
    IMAGE = "image"
    CHART = "chart"
    HEADER = "header"
    FOOTER = "footer"
    PAGE_NUMBER = "page_number"


class LayoutElement(BaseModel):
    id: int
    element_type: str
    bbox: Optional[List[float]] = None
    page_number: int = 1
    content: str = ""
    table_data: Optional[List[List[str]]] = None
    image_data: Optional[str] = None
    translation: str = ""
    should_translate: bool = True


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Paragraph(BaseModel):
    id: int
    type: str = "body"
    original: str
    translation: str
    page_number: int = 1
    

class TranslationTask(BaseModel):
    task_id: str
    filename: str
    status: str = "pending"
    pdf_type: str
    file_path: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    progress: int = 0
    total_paragraphs: int = 0
    paragraphs: List[Paragraph] = []
    error: Optional[str] = None


class TranslationResponse(BaseModel):
    task_id: str
    status: str
    message: str
    layout: Optional[List[LayoutElement]] = None
    page_count: Optional[int] = None


class TranslationStatus(BaseModel):
    task_id: str
    status: str
    progress: int
    filename: str
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    services: dict


class TranslationRequest(BaseModel):
    text: str
    source_lang: str = "en"
    target_lang: str = "zh"
