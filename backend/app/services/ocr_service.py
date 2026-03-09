import os
import json
import asyncio
from typing import List
import fitz

from app.core.config import settings
from app.models.schemas import Paragraph


class OCRService:
    def __init__(self):
        self.api_key = settings.siliconflow_api_key
        self.base_url = settings.siliconflow_base_url
        self.model = settings.ocr_model
    
    async def extract_from_images(self, file_path: str) -> List[Paragraph]:
        doc = fitz.open(file_path)
        all_paragraphs = []
        para_id = 1
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            images = page.get_images()
            
            if images:
                image_path = self._extract_page_image(file_path, page_num)
                
                try:
                    text = await self._ocr_image(image_path)
                    if text.strip():
                        all_paragraphs.append(Paragraph(
                            id=para_id,
                            type="body",
                            original=text.strip(),
                            translation="",
                            page_number=page_num + 1
                        ))
                        para_id += 1
                finally:
                    if os.path.exists(image_path):
                        os.remove(image_path)
            else:
                text = page.get_text().strip()
                if text:
                    all_paragraphs.append(Paragraph(
                        id=para_id,
                        type="body",
                        original=text,
                        translation="",
                        page_number=page_num + 1
                    ))
                    para_id += 1
        
        doc.close()
        return all_paragraphs
    
    def _extract_page_image(self, file_path: str, page_num: int) -> str:
        doc = fitz.open(file_path)
        page = doc[page_num]
        
        zoom = 2.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        output_path = f"/tmp/pdf_translator/ocr_page_{page_num}_{os.getpid()}.png"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        pix.save(output_path)
        
        doc.close()
        return output_path
    
    async def _ocr_image(self, image_path: str) -> str:
        import aiohttp
        
        with open(image_path, "rb") as f:
            image_base64 = self._encode_image(f.read())
        
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}},
                        {"type": "text", "text": "Extract all text from this image. Return only the extracted text without any explanations or formatting."}
                    ]
                }
            ],
            "max_tokens": 4096
        }
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"OCR API error: {error_text}")
                
                result = await response.json()
                return result["choices"][0]["message"]["content"]
    
    def _encode_image(self, image_bytes: bytes) -> str:
        import base64
        return base64.b64encode(image_bytes).decode('utf-8')
