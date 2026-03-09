from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    siliconflow_api_key: str
    siliconflow_base_url: str = "https://api.siliconflow.cn/v1"
    ocr_model: str = "PaddlePaddle/PaddleOCR-VL-1.5"
    translation_model: str = "Qwen/Qwen3-8B"
    
    database_url: str = "sqlite:///./pdf_translator.db"
    
    upload_dir: str = "/tmp/pdf_translator/uploads"
    output_dir: str = "/tmp/pdf_translator/outputs"
    
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    
    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
