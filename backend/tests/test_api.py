import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "services" in data


def test_upload_invalid_file():
    response = client.post(
        "/api/upload",
        files={"file": ("test.txt", b"test content", "text/plain")}
    )
    assert response.status_code == 400


def test_upload_pdf_without_file():
    response = client.post("/api/upload")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_translate_text():
    response = client.post(
        "/api/translate",
        json={"text": "Hello world", "source_lang": "en", "target_lang": "zh"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "translation" in data


def test_get_task_status_not_found():
    response = client.get("/api/tasks/nonexistent-task-id")
    assert response.status_code == 404
