import os
from typing import List, Dict, Tuple
import fitz
from app.models.schemas import Paragraph, PDFType
from app.core.config import settings
from app.services.layout_service import LayoutDetectionService, LayoutElement, ElementType


class PDFService:
    def __init__(self):
        self.layout_service = LayoutDetectionService()
    
    def detect_pdf_type(self, file_path: str) -> str:
        doc = fitz.open(file_path)
        
        has_text = False
        has_images = False
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text().strip()
            if text:
                has_text = True
            
            images = page.get_images()
            if images:
                has_images = True
            
            if has_text and has_images:
                break
        
        doc.close()
        
        if has_text and has_images:
            return "mixed"
        elif has_images:
            return "image"
        else:
            return "text"
    
    def detect_layout(self, file_path: str) -> List[LayoutElement]:
        return self.layout_service.detect_layout(file_path)
    
    def extract_text(self, file_path: str) -> List[Paragraph]:
        layout_elements = self.detect_layout(file_path)
        
        doc = fitz.open(file_path)
        paragraphs = []
        para_id = 1
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            
            blocks = page.get_text("blocks")
            for block in blocks:
                block_text = block[4].strip()
                if block_text and len(block_text) > 10:
                    para_type = self._detect_paragraph_type(block_text, para_id)
                    paragraphs.append(Paragraph(
                        id=para_id,
                        type=para_type,
                        original=block_text,
                        translation="",
                        page_number=page_num + 1
                    ))
                    para_id += 1
        
        doc.close()
        return paragraphs
    
    def extract_with_layout(self, file_path: str) -> Dict[str, any]:
        layout_elements = self.detect_layout(file_path)
        
        paragraphs = []
        tables = []
        images = []
        
        for elem in layout_elements:
            if elem.element_type == ElementType.TABLE:
                tables.append({
                    'bbox': elem.bbox,
                    'page': elem.page_number,
                    'data': elem.table_data
                })
            elif elem.element_type == ElementType.IMAGE:
                images.append({
                    'bbox': elem.bbox,
                    'page': elem.page_number
                })
            elif elem.element_type in [ElementType.TEXT, ElementType.TITLE, ElementType.COLUMN_1, ElementType.COLUMN_2]:
                paragraphs.append(Paragraph(
                    id=len(paragraphs) + 1,
                    type=self._map_element_type(elem.element_type),
                    original=elem.content,
                    translation="",
                    page_number=elem.page_number
                ))
        
        return {
            'paragraphs': paragraphs,
            'tables': tables,
            'images': images,
            'layout': layout_elements
        }
    
    def _map_element_type(self, element_type: ElementType) -> str:
        mapping = {
            ElementType.TITLE: 'title',
            ElementType.TEXT: 'body',
            ElementType.HEADER: 'body',
            ElementType.FOOTER: 'body',
            ElementType.COLUMN_1: 'body',
            ElementType.COLUMN_2: 'body',
            ElementType.TABLE: 'body',
            ElementType.IMAGE: 'body',
            ElementType.CHART: 'body',
            ElementType.PAGE_NUMBER: 'body'
        }
        return mapping.get(element_type, 'body')
    
    def _detect_paragraph_type(self, text: str, para_id: int) -> str:
        text_lower = text.lower().strip()
        
        if para_id == 1:
            return "title"
        
        if text_lower.startswith("abstract") or text_lower == "abstract":
            return "abstract-label"
        
        if text_lower.startswith("introduction") or text_lower.startswith("1."):
            return "section"
        
        if text_lower.startswith("keywords") or text_lower.startswith("keyword"):
            return "keywords-label"
        
        if len(text) < 100 and text.isupper():
            return "section"
        
        return "body"
    
    def render_page_to_image(self, file_path: str, page_num: int, dpi: int = 150) -> str:
        doc = fitz.open(file_path)
        page = doc[page_num]
        
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        output_path = f"/tmp/pdf_translator/page_{page_num}_{os.getpid()}.png"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        pix.save(output_path)
        
        doc.close()
        return output_path
    
    def generate_output(self, paragraphs: List[Paragraph], filename: str, format: str) -> str:
        os.makedirs(settings.output_dir, exist_ok=True)
        
        base_name = filename.rsplit('.', 1)[0]
        output_path = os.path.join(settings.output_dir, f"{base_name}_translated.{format}")
        
        if format == "txt":
            self._generate_txt(paragraphs, output_path)
        elif format == "html":
            self._generate_html(paragraphs, output_path)
        elif format == "md":
            self._generate_md(paragraphs, output_path)
        
        return output_path
    
    def _generate_txt(self, paragraphs: List[Paragraph], output_path: str):
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("=" * 50 + "\n")
            f.write("Bilingual Translation\n")
            f.write("=" * 50 + "\n\n")
            
            for para in paragraphs:
                if para.type in ['body', 'abstract']:
                    f.write(f"[{para.id}] Original:\n{para.original}\n\n")
                    f.write(f"[{para.id}] Translation:\n{para.translation}\n\n")
                    f.write("-" * 40 + "\n\n")
    
    def _generate_html(self, paragraphs: List[Paragraph], output_path: str):
        html_content = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Translation</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 12px; border: 1px solid #ddd; vertical-align: top; }
        .original { background: #fafafa; }
        .translation { background: #f0f7ff; }
    </style>
</head>
<body>
    <table>
"""
        for para in paragraphs:
            if para.type in ['body', 'abstract']:
                html_content += f"""        <tr>
            <td class="original">{para.original}</td>
            <td class="translation">{para.translation}</td>
        </tr>
"""
        
        html_content += """    </table>
</body>
</html>"""
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
    
    def _generate_md(self, paragraphs: List[Paragraph], output_path: str):
        with open(output_path, 'w', encoding='utf-8') as f:
            for para in paragraphs:
                if para.type in ['body', 'abstract']:
                    f.write(f"## Paragraph {para.id}\n\n")
                    f.write(f"**Original:**\n{para.original}\n\n")
                    f.write(f"**Translation:**\n{para.translation}\n\n")
                    f.write("---\n\n")
