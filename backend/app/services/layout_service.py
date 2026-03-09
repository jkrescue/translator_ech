from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import fitz
import re
import pdfplumber
from collections import Counter


class ElementType(str, Enum):
    TITLE = "title"
    PARAGRAPH = "paragraph"
    SIDEBAR = "sidebar"
    TABLE = "table"
    IMAGE = "image"
    CHART = "chart"
    HEADER = "header"
    FOOTER = "footer"
    PAGE_NUMBER = "page_number"
    LIST_ITEM = "list_item"
    CAPTION = "caption"


@dataclass
class LayoutElement:
    element_type: ElementType
    bbox: tuple
    page_number: int
    content: str = ""
    confidence: float = 1.0
    table_data: Optional[List[List[str]]] = None
    image_data: Optional[str] = None
    font_size: Optional[float] = None
    font_weight: Optional[str] = None
    reading_order: int = 0


@dataclass
class PageStructure:
    page_number: int
    width: float
    height: float
    elements: List[LayoutElement] = field(default_factory=list)
    pdf_type: str = "digital"


class LayoutDetectionService:
    def __init__(self):
        self.column_threshold = 50
        self.header_threshold = 0.12
        self.footer_threshold = 0.12
        self.sidebar_threshold = 0.35
    
    def detect_layout(self, file_path: str) -> List[LayoutElement]:
        doc = fitz.open(file_path)
        page_count = len(doc)
        doc.close()
        
        page_structures = self._analyze_all_pages(file_path)
        
        all_elements = []
        for ps in page_structures:
            all_elements.extend(ps.elements)
        
        organized_elements = self._organize_by_reading_order(all_elements)
        
        for idx, elem in enumerate(organized_elements):
            elem.reading_order = idx
        
        return organized_elements
    
    def _analyze_all_pages(self, file_path: str) -> List[PageStructure]:
        page_structures = []
        
        doc = fitz.open(file_path)
        page_count = len(doc)
        
        with pdfplumber.open(file_path) as pdf:
            for page_num in range(page_count):
                page = doc[page_num]
                pdf_page = pdf.pages[page_num]
                
                page_width = page.rect.width
                page_height = page.rect.height
                
                text = page.get_text()
                has_text = bool(text and text.strip())
                
                images = page.get_images()
                has_images = len(images) > 0
                
                if has_text and not has_images:
                    pdf_type = "digital"
                elif has_images and not has_text:
                    pdf_type = "scanned"
                else:
                    pdf_type = "mixed"
                
                ps = PageStructure(
                    page_number=page_num + 1,
                    width=page_width,
                    height=page_height,
                    pdf_type=pdf_type
                )
                
                if pdf_type in ["digital", "mixed"]:
                    elements = self._extract_digital_page(pdf_page, page, page_num, page_width, page_height)
                else:
                    elements = self._extract_from_image(page, page_num, page_width, page_height)
                
                ps.elements = elements
                page_structures.append(ps)
        
        doc.close()
        
        return page_structures
    
    def _extract_digital_page(self, pdf_page, fitz_page, page_num: int, page_width: float, page_height: float) -> List[LayoutElement]:
        elements = []
        
        images = self._detect_images_with_plumber(pdf_page, fitz_page, page_num, page_width, page_height)
        elements.extend(images)
        
        tables = self._detect_tables_with_plumber(pdf_page, page_num, page_width, page_height)
        elements.extend(tables)
        
        text_blocks = self._extract_text_blocks(fitz_page, page_num, page_width, page_height, images, tables)
        elements.extend(text_blocks)
        
        elements = self._filter_overlapping_elements(elements)
        
        return elements
    
    def _detect_images_with_plumber(self, pdf_page, fitz_page, page_num: int, page_width: float, page_height: float) -> List[LayoutElement]:
        elements = []
        
        # Get images from fitz page
        images = fitz_page.get_images(full=True)
        
        if not images:
            return elements
        
        doc = fitz_page.parent
        
        # Get image bounding boxes from page display list
        image_list = fitz_page.get_image_info()
        
        for img_index, img_info in enumerate(image_list):
            try:
                bbox = img_info.get("bbox")
                if not bbox:
                    continue
                
                x0, y0, x1, y1 = bbox
                width = x1 - x0
                height = y1 - y0
                
                # Filter out small images (likely icons)
                if width < 30 or height < 30:
                    continue
                
                # Filter out images that are too large (likely page backgrounds)
                if width > page_width * 0.95 and height > page_height * 0.95:
                    continue
                
                content = f"[图片 {img_index + 1}]"
                
                element = LayoutElement(
                    element_type=ElementType.IMAGE,
                    bbox=(x0, y0, x1, y1),
                    page_number=page_num + 1,
                    content=content
                )
                elements.append(element)
                
            except Exception as e:
                continue
        
        return elements
    
    def _find_image_bbox_from_pixmap(self, text_bbox: tuple, img_width: int, img_height: int) -> Optional[tuple]:
        x0, y0, x1, y1 = text_bbox
        
        if img_width > 50 and img_height > 50:
            return (x0 - 10, y0 - 10, x0 + img_width + 10, y0 + img_height + 10)
        
        return None
    
    def _detect_tables_with_plumber(self, pdf_page, page_num: int, page_width: float, page_height: float) -> List[LayoutElement]:
        elements = []
        
        try:
            tables = pdf_page.extract_tables()
            
            if tables:
                for table_idx, table in enumerate(tables):
                    if table and len(table) > 0:
                        bbox = self._get_table_bbox(pdf_page, table_idx)
                        
                        if bbox:
                            table_text = self._table_to_text(table)
                            
                            element = LayoutElement(
                                element_type=ElementType.TABLE,
                                bbox=bbox,
                                page_number=page_num + 1,
                                content=table_text[:500] if len(table_text) > 500 else table_text,
                                table_data=table
                            )
                            elements.append(element)
        except Exception as e:
            pass
        
        return elements
    
    def _detect_table_by_text_pattern(self, text: str, page_width: float, page_num: int) -> List[LayoutElement]:
        elements = []
        
        if not text:
            return elements
        
        lines = text.split('\n')
        
        table_indicators = [
            r'FP\d+',
            r'TFLOPS',
            r'GB\b',
            r'TB/s',
            r'\d+W\b',
            r'GPU Memory',
            r'Bandwidth',
        ]
        
        table_data = []
        in_table = False
        
        for line in lines:
            line = line.strip()
            if not line:
                if table_data:
                    if len(table_data) >= 2:
                        bbox = (50, 100, page_width - 50, 100 + len(table_data) * 20 + 30)
                        element = LayoutElement(
                            element_type=ElementType.TABLE,
                            bbox=bbox,
                            page_number=page_num + 1,
                            content='\n'.join(table_data[:15]),
                            table_data=[row.split() for row in table_data[:15]]
                        )
                        elements.append(element)
                    table_data = []
                in_table = False
                continue
            
            if 'Technical Specifications' in line:
                in_table = True
                continue
            
            is_table_line = False
            for pattern in table_indicators:
                if re.search(pattern, line, re.IGNORECASE):
                    is_table_line = True
                    break
            
            if in_table and is_table_line:
                table_data.append(line)
            elif is_table_line:
                if not table_data:
                    in_table = True
                table_data.append(line)
        
        if table_data and len(table_data) >= 2:
            bbox = (50, 100, page_width - 50, 100 + len(table_data) * 20 + 30)
            element = LayoutElement(
                element_type=ElementType.TABLE,
                bbox=bbox,
                page_number=page_num + 1,
                content='\n'.join(table_data[:15]),
                table_data=[row.split() for row in table_data[:15]]
            )
            elements.append(element)
        
        return elements
    
    def _get_table_bbox(self, pdf_page, table_idx: int) -> Optional[tuple]:
        try:
            page_height = pdf_page.height
            page_width = pdf_page.width
            
            y_pos = (table_idx * 100) % (page_height - 200)
            return (50, y_pos + 50, page_width - 50, y_pos + 150)
        except:
            return None
    
    def _table_to_text(self, table: List[List[str]]) -> str:
        lines = []
        for row in table:
            if row:
                lines.append(" | ".join(str(cell) for cell in row))
        return "\n".join(lines)
    
    def _detect_table_candidates(self, blocks: List, page_width: float) -> List[LayoutElement]:
        elements = []
        
        table_patterns = [
            r'^\s*\|.*\|\s*$',
            r'^\s*-+\s*[-+\|]+\s*-+',
            r'^\s*(FP\d|TFLOPS|GB|TB|W)',
        ]
        
        for i, block in enumerate(blocks):
            if hasattr(block, 'text'):
                text = block.text.strip()
            else:
                continue
            
            is_table = any(re.match(pattern, text, re.IGNORECASE) for pattern in table_patterns)
            
            if is_table:
                bbox = (block.x0, block.top, block.x1, block.bottom)
                element = LayoutElement(
                    element_type=ElementType.TABLE,
                    bbox=bbox,
                    page_number=1,
                    content=text[:300],
                    table_data=[[text]]
                )
                elements.append(element)
        
        return elements
    
    def _extract_text_blocks(self, fitz_page, page_num: int, page_width: float, page_height: float, 
                            images: List[LayoutElement], tables: List[LayoutElement]) -> List[LayoutElement]:
        elements = []
        
        blocks = fitz_page.get_text("blocks")
        
        image_bboxes = [img.bbox for img in images if img.bbox]
        table_bboxes = [tbl.bbox for tbl in tables if tbl.bbox]
        
        header_elements = []
        footer_elements = []
        body_elements = []
        
        for block in blocks:
            x0, y0, x1, y1, text, block_no, block_type = block[:7]
            
            if not text or len(text.strip()) < 2:
                continue
            
            if self._is_in_bbox((x0, y0, x1, y1), image_bboxes):
                continue
            
            if self._is_in_bbox((x0, y0, x1, y1), table_bboxes):
                continue
            
            bbox = (x0, y0, x1, y1)
            
            y_position = y0 / page_height
            x_position = x0 / page_width
            block_width = x1 - x0
            
            element_type, font_size = self._classify_text_block(
                text, y_position, x_position, block_width, page_width, page_height
            )
            
            element = LayoutElement(
                element_type=element_type,
                bbox=bbox,
                page_number=page_num + 1,
                content=text.strip(),
                font_size=font_size
            )
            
            if y_position < self.header_threshold:
                header_elements.append(element)
            elif y_position > (1 - self.footer_threshold):
                footer_elements.append(element)
            else:
                if element_type == ElementType.SIDEBAR:
                    body_elements.append(element)
                else:
                    body_elements.append(element)
        
        elements.extend(header_elements)
        elements.extend(body_elements)
        elements.extend(footer_elements)
        
        return elements
    
    def _classify_text_block(self, text: str, y_pos: float, x_pos: float, block_width: float, 
                            page_width: float, page_height: float) -> Tuple[ElementType, Optional[float]]:
        text_clean = text.strip()
        text_lower = text_clean.lower()
        
        if len(text_clean) < 60 and (
            text_clean.isupper() or
            re.match(r'^(Chapter|Section|\d+\.)', text_clean, re.IGNORECASE) or
            'abstract' in text_lower or
            'introduction' in text_lower or
            re.match(r'^(Abstract|Introduction|Conclusion|References)', text_clean, re.IGNORECASE)
        ):
            return ElementType.TITLE, 18.0
        
        if re.match(r'^(fig\.|figure|图表|图\d)', text_lower):
            return ElementType.CAPTION, 10.0
        
        if re.match(r'^(\d+[\.\)]|[a-z]\.|[ivx]+\))', text_clean.lower().strip()):
            return ElementType.LIST_ITEM, 11.0
        
        if block_width < page_width * self.sidebar_threshold and x_pos > page_width * 0.6:
            return ElementType.SIDEBAR, 11.0
        
        if re.match(r'^\d+$', text_clean.strip()):
            return ElementType.PAGE_NUMBER, 10.0
        
        if y_pos > 0.88:
            return ElementType.FOOTER, 9.0
        
        return ElementType.PARAGRAPH, 11.0
    
    def _is_in_bbox(self, bbox: tuple, bboxes: List[tuple]) -> bool:
        if not bboxes:
            return False
        
        x0, y0, x1, y1 = bbox
        center_x = (x0 + x1) / 2
        center_y = (y0 + y1) / 2
        
        for bb in bboxes:
            bx0, by0, bx1, by1 = bb
            if bx0 <= center_x <= bx1 and by0 <= center_y <= by1:
                return True
        return False
    
    def _filter_overlapping_elements(self, elements: List[LayoutElement]) -> List[LayoutElement]:
        filtered = []
        
        priority_types = {ElementType.TABLE, ElementType.IMAGE, ElementType.TITLE}
        
        for elem in elements:
            overlaps = False
            keep_element = True
            
            for existing in filtered:
                if self._bboxes_overlap(elem.bbox, existing.bbox):
                    if elem.element_type in priority_types and existing.element_type not in priority_types:
                        filtered.remove(existing)
                        break
                    elif existing.element_type in priority_types and elem.element_type not in priority_types:
                        keep_element = False
                        break
                    elif elem.element_type == existing.element_type:
                        if len(elem.content or '') > len(existing.content or ''):
                            filtered.remove(existing)
                            break
                        else:
                            keep_element = False
                            break
                    else:
                        overlaps = True
                        break
            
            if not overlaps and keep_element:
                filtered.append(elem)
        
        return filtered
    
    def _bboxes_overlap(self, bbox1: tuple, bbox2: tuple) -> bool:
        x0_1, y0_1, x1_1, y1_1 = bbox1
        x0_2, y0_2, x1_2, y1_2 = bbox2
        
        return not (x1_1 < x0_2 or x0_1 > x1_2 or y1_1 < y0_2 or y0_1 > y1_2)
    
    def _extract_from_image(self, fitz_page, page_num: int, page_width: float, page_height: float) -> List[LayoutElement]:
        elements = []
        
        images = fitz_page.get_images()
        
        for img_index, img in enumerate(images):
            bbox = (50, 50, page_width - 50, page_height - 50)
            element = LayoutElement(
                element_type=ElementType.IMAGE,
                bbox=bbox,
                page_number=page_num + 1,
                content=f"[扫描页图片 {img_index + 1}]"
            )
            elements.append(element)
        
        return elements
    
    def _organize_by_reading_order(self, elements: List[LayoutElement]) -> List[LayoutElement]:
        sorted_elements = sorted(
            elements,
            key=lambda e: (
                e.page_number,
                e.bbox[1],
                e.bbox[0]
            )
        )
        
        return sorted_elements
    
    def render_translated_pdf(
        self,
        original_pdf_path: str,
        translated_elements: List[LayoutElement],
        output_path: str = "/tmp/pdf_translator/translated_output.pdf"
    ) -> str:
        doc = fitz.open(original_pdf_path)
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_elements = [e for e in translated_elements if e.page_number == page_num + 1]
            
            for elem in page_elements:
                if elem.bbox and elem.content:
                    x0, y0, x1, y1 = elem.bbox
                    
                    if elem.element_type == ElementType.IMAGE:
                        continue
                    
                    if elem.element_type == ElementType.TABLE:
                        continue
                    
                    fontsize = elem.font_size if elem.font_size else 10
                    
                    page.insert_text(
                        (x0, y0 + fontsize),
                        elem.content,
                        fontsize=fontsize,
                        color=(0, 0, 0)
                    )
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        doc.save(output_path)
        doc.close()
        
        return output_path


import os
