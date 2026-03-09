# PDF Translator

A PDF document translation tool with OCR and AI-powered translation capabilities.

## Features

- PDF text extraction (text-based and scanned images)
- OCR using PaddleOCR-VL-1.5 (via SiliconFlow)
- Translation using Qwen3-8B (via SiliconFlow)
- Async task processing with Celery + Redis
- Bilingual PDF output

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: FastAPI (Python)
- **Task Queue**: Celery + Redis
- **OCR**: PaddleOCR-VL-1.5 (SiliconFlow API)
- **Translation**: Qwen/Qwen3-8B (SiliconFlow API)

## Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Redis
- SiliconFlow API Key

### Environment Variables

Create `backend/.env`:

```env
SILICONFLOW_API_KEY=your-api-key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
OCR_MODEL=PaddlePaddle/PaddleOCR-VL-1.5
TRANSLATION_MODEL=Qwen/Qwen3-8B
DATABASE_URL=sqlite:///./pdf_translator.db
UPLOAD_DIR=/tmp/pdf_translator/uploads
OUTPUT_DIR=/tmp/pdf_translator/outputs
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
```

### Running with Docker

```bash
# Build and run all services
docker-compose up --build

# Or run individually
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# Redis (for Celery)
docker run -d -p 6379:6379 redis:7-alpine

# Celery Worker
cd backend && celery -A app.core.celery worker --loglevel=info
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/upload` | POST | Upload PDF for translation |
| `/api/tasks/{task_id}` | GET | Get task status |
| `/api/tasks/{task_id}/result` | GET | Get translation result |
| `/api/tasks/{task_id}/cancel` | POST | Cancel translation |
| `/api/export/{task_id}/{format}` | GET | Export translation (txt/html/md) |
| `/api/translate` | POST | Translate text directly |

## Architecture

```
User Upload → FastAPI → Celery Task → OCR/Translation → Result
     ↓              ↓           ↓
   Frontend     Redis      Workers
```
