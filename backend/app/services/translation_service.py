import asyncio
from typing import List

from app.core.config import settings
from app.models.schemas import Paragraph


class TranslationService:
    def __init__(self):
        self.api_key = settings.siliconflow_api_key
        self.base_url = settings.siliconflow_base_url
        self.model = settings.translation_model
    
    async def translate_batch(self, paragraphs: List[Paragraph]) -> List[Paragraph]:
        if not paragraphs:
            return []
        
        texts_to_translate = [p.original for p in paragraphs]
        
        translated = await self._batch_translate(texts_to_translate)
        
        for para, trans in zip(paragraphs, translated):
            para.translation = trans
        
        return paragraphs
    
    async def translate_single(self, text: str, source_lang: str = "en", target_lang: str = "zh") -> str:
        import aiohttp
        
        system_prompt = f"""You are a professional translator. Translate the following {source_lang} text to {target_lang}.
Requirements:
1. Maintain the original meaning and tone
2. Keep proper nouns in their original form
3. Use natural, fluent {target_lang} expressions
4. Preserve paragraph structure
5. Do not add any explanations or comments"""
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "max_tokens": 4096,
            "temperature": 0.3
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
                    raise Exception(f"Translation API error: {error_text}")
                
                result = await response.json()
                return result["choices"][0]["message"]["content"].strip()
    
    async def _batch_translate(self, texts: List[str], batch_size: int = 5) -> List[str]:
        results = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_tasks = [self.translate_single(text) for text in batch]
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            for result in batch_results:
                if isinstance(result, Exception):
                    results.append(f"[Translation error: {str(result)}]")
                else:
                    results.append(result)
        
        return results
    
    async def translate_texts(self, texts: List[str]) -> List[str]:
        if not texts:
            return []
        
        return await self._batch_translate(texts)
    
    async def translate_with_context(
        self,
        paragraphs: List[Paragraph],
        context: str = ""
    ) -> List[Paragraph]:
        if not paragraphs:
            return []
        
        context_prompt = context if context else ""
        
        import aiohttp
        
        full_text = "\n\n".join([f"[{p.id}] {p.original}" for p in paragraphs])
        
        system_prompt = f"""You are a professional document translator. Translate the following English document to Chinese.

{context_prompt}

Requirements:
1. Maintain the original document structure and format
2. Translate section titles appropriately
3. Keep proper nouns (names, technical terms) in their original form
4. Use formal, academic Chinese expressions
5. Preserve paragraph numbering

Format your response as follows:
[{para_id}] translated_text

Only output the translation, no explanations."""
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_text}
            ],
            "max_tokens": 8192,
            "temperature": 0.3
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
                    raise Exception(f"Translation API error: {error_text}")
                
                result = await response.json()
                translated_text = result["choices"][0]["message"]["content"]
        
        translated_paragraphs = self._parse_translated_text(translated_text, paragraphs)
        
        return translated_paragraphs
    
    def _parse_translated_text(self, translated_text: str, original_paras: List[Paragraph]) -> List[Paragraph]:
        lines = translated_text.split('\n')
        current_id = None
        current_translation = []
        
        para_translations = {}
        
        for line in lines:
            line = line.strip()
            if line.startswith('[') and ']' in line:
                if current_id is not None and current_translation:
                    para_translations[current_id] = ' '.join(current_translation)
                
                id_str = line.split(']')[0][1:]
                try:
                    current_id = int(id_str)
                except ValueError:
                    continue
                current_translation = [line.split(']', 1)[1].strip()]
            elif current_id is not None and line:
                current_translation.append(line)
        
        if current_id is not None and current_translation:
            para_translations[current_id] = ' '.join(current_translation)
        
        for para in original_paras:
            if para.id in para_translations:
                para.translation = para_translations[para.id]
            else:
                para.translation = f"[{para.original[:50]}...]"
        
        return original_paras
