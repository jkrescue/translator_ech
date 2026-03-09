import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  ArrowLeftRight, MousePointer2, Settings,
  Copy, Check, AlignLeft, Languages,
  Clock, Upload, Download, Loader2, Image, Table,
} from 'lucide-react';
import { articleContent, lookupWord, Paragraph as ParagraphType } from './data/content';
import * as api from './services/api';
import type { Paragraph as ApiParagraph, LayoutElement as ApiLayoutElement } from './services/api';
import { WordTooltip } from './components/WordTooltip';
import { HistorySidebar } from './components/HistorySidebar';
import { UploadModal } from './components/UploadModal';
import { ExportModal } from './components/ExportModal';
import { useDocumentHistory, DocumentSummary } from './hooks/useDocumentHistory';

interface TooltipState {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  translation: string;
  example?: string;
  x: number;
  y: number;
}

const PARA_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#14b8a6', '#6366f1', '#f97316', '#84cc16',
];

interface Paragraph {
  id: number;
  type: string;
  original: string;
  translation: string;
}

interface LayoutElement {
  id: number;
  element_type: string;
  bbox?: number[];
  page_number: number;
  content: string;
  table_data?: string[][];
  image_data?: string;
  translation: string;
  should_translate: boolean;
}

// Pre-load demo content for demo document IDs
const DEMO_IDS = new Set(['demo-llm-2024', 'demo-transformer', 'demo-nlp', 'demo-rl', 'demo-gpt4']);

export default function App() {
  const [currentContent, setCurrentContent] = useState<Paragraph[]>(articleContent);
  const [currentLayout, setCurrentLayout] = useState<LayoutElement[] | null>(null);
  const [currentDocId, setCurrentDocId] = useState('demo-llm-2024');
  const [currentDocName, setCurrentDocName] = useState('large_language_models.pdf');
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [pdfPageImages, setPdfPageImages] = useState<Map<number, string>>(new Map());
  const [isLoadingPdfImages, setIsLoadingPdfImages] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [wordTranslateEnabled, setWordTranslateEnabled] = useState(true);
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const [leftPanelWidth, setLeftPanelWidth] = useState(50); // percentage

  const [showHistory, setShowHistory] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const leftRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const rightRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const isSyncScrolling = useRef(false);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentContentsRef = useRef<Map<string, Paragraph[]>>(
    new Map(DEMO_IDS.size ? Array.from(DEMO_IDS).map((id) => [id, articleContent]) : [])
  );

  const { history, addDocument, removeDocument } = useDocumentHistory();

  // ── Bidirectional paragraph click ──
  const handleParagraphClick = useCallback((id: number, side: 'left' | 'right') => {
    setActiveParagraph(id);
    const targetRefs = side === 'left' ? rightRefs : leftRefs;
    const el = targetRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ── Sync scroll ──
  useEffect(() => {
    if (!syncScrollEnabled) return;
    const handleLeftScroll = () => {
      if (isSyncScrolling.current) return;
      const L = leftPanelRef.current, R = rightPanelRef.current;
      if (!L || !R) return;
      isSyncScrolling.current = true;
      R.scrollTop = (L.scrollTop / (L.scrollHeight - L.clientHeight)) * (R.scrollHeight - R.clientHeight);
      setTimeout(() => { isSyncScrolling.current = false; }, 50);
    };
    const handleRightScroll = () => {
      if (isSyncScrolling.current) return;
      const L = leftPanelRef.current, R = rightPanelRef.current;
      if (!L || !R) return;
      isSyncScrolling.current = true;
      L.scrollTop = (R.scrollTop / (R.scrollHeight - R.clientHeight)) * (L.scrollHeight - L.clientHeight);
      setTimeout(() => { isSyncScrolling.current = false; }, 50);
    };
    leftPanelRef.current?.addEventListener('scroll', handleLeftScroll);
    rightPanelRef.current?.addEventListener('scroll', handleRightScroll);
    return () => {
      leftPanelRef.current?.removeEventListener('scroll', handleLeftScroll);
      rightPanelRef.current?.removeEventListener('scroll', handleRightScroll);
    };
  }, [syncScrollEnabled]);

  // ── Word selection translate ──
  useEffect(() => {
    if (!wordTranslateEnabled) { setTooltip(null); return; }
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const text = selection.toString().trim();
      if (!text || text.length > 80) return;
      const entry = lookupWord(text);
      if (!entry && text.split(/\s+/).length > 4) return;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setTooltip({
        word: text,
        phonetic: entry?.phonetic || '',
        partOfSpeech: entry?.partOfSpeech || '',
        translation: entry?.translation || (text.split(/\s+/).length === 1 ? '（未收录词汇）' : `「${text}」`),
        example: entry?.example,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [wordTranslateEnabled]);

  // ── Translation progress animation ──
  useEffect(() => {
    if (!isTranslating) { setTranslateProgress(0); return; }
    setTranslateProgress(5);
    const t1 = setTimeout(() => setTranslateProgress(40), 200);
    const t2 = setTimeout(() => setTranslateProgress(70), 700);
    const t3 = setTimeout(() => setTranslateProgress(90), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isTranslating]);

  // ── Divider drag resize ──
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newPct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPanelWidth(Math.min(Math.max(newPct, 20), 80));
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const pollingRef = React.useRef<(() => void) | null>(null);

  // ── File upload handler ──
  const handleFileUpload = async (file: File) => {
    const docId = `doc-${Date.now()}`;
    const docName = file.name;

    // Reset states for new document
    setIsTranslating(true);
    setActiveParagraph(null);
    setTranslateProgress(5);
    setCurrentPage(1);
    setTotalPages(1);
    setPdfPageImages(new Map());
    setCurrentLayout(null);
    setCurrentContent([]);

    try {
      if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        const text = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = (e) => res((e.target?.result as string) || '');
          reader.onerror = rej;
          reader.readAsText(file, 'UTF-8');
        });
        const rawParas = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 10);
        const paragraphs: Paragraph[] = rawParas.map((p, i) => ({
          id: i + 1,
          type: 'body' as const,
          original: p,
          translation: '翻译中...',
        }));
        setCurrentContent(paragraphs);
        
        // Call translation API for text
        const translated = await Promise.all(
          paragraphs.map(async (para) => {
            try {
              // Simple translation endpoint
              const response = await fetch(`${api.API_BASE_URL}/api/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: para.original, source_lang: 'en', target_lang: 'zh' }),
              });
              if (response.ok) {
                const result = await response.json();
                return { ...para, translation: result.translation || '翻译失败' };
              }
            } catch {}
            return { ...para, translation: para.original };
          })
        );
        
        setCurrentContent(translated);
        setIsTranslating(false);
        setTranslateProgress(100);
        
        documentContentsRef.current.set(docId, translated);
        addDocument({
          id: docId,
          name: docName,
          uploadedAt: Date.now(),
          size: file.size,
          type: 'txt',
          pageCount: 1,
          paragraphCount: translated.length,
        });
      } else {
        // PDF - use backend API
        const task = await api.uploadPDF(file);
        setCurrentTaskId(task.task_id);
        
        // Update page count immediately
        if (task.page_count) {
          setTotalPages(task.page_count);
        }
        
        // Process layout data immediately
        if (task.layout && task.layout.length > 0) {
          const layoutElements: LayoutElement[] = task.layout.map((elem: ApiLayoutElement) => ({
            id: elem.id,
            element_type: elem.element_type,
            bbox: elem.bbox,
            page_number: elem.page_number,
            content: elem.content,
            table_data: elem.table_data,
            image_data: elem.image_data,
            translation: elem.translation || '',
            should_translate: elem.should_translate,
          }));
          setCurrentLayout(layoutElements);
          
          // Create paragraphs from layout for translation view
          const paragraphsFromLayout: Paragraph[] = layoutElements
            .filter(elem => elem.should_translate && elem.content)
            .map((elem, idx) => ({
              id: idx + 1,
              type: elem.element_type === 'title' ? 'title' : 'body',
              original: elem.content,
              translation: '翻译中...',
            }));
          
          if (paragraphsFromLayout.length > 0) {
            setCurrentContent(paragraphsFromLayout);
          }
        }
        
        // Load PDF page images in background
        setIsLoadingPdfImages(true);
        
        const loadPageImages = async () => {
          if (!task.page_count || task.page_count <= 0) {
            setIsLoadingPdfImages(false);
            return;
          }
          
          const pageImages = new Map<number, string>();
          
          // Load all pages
          const loadPromises = [];
          for (let pageNum = 1; pageNum <= task.page_count; pageNum++) {
            loadPromises.push(
              api.getPDFPageImage(task.task_id, pageNum, 150)
                .then(imageUrl => {
                  pageImages.set(pageNum, imageUrl);
                })
                .catch(error => {
                  console.error(`Failed to load page ${pageNum}:`, error);
                })
            );
          }
          
          // Wait for all images to load
          await Promise.all(loadPromises);
          
          setPdfPageImages(pageImages);
          setIsLoadingPdfImages(false);
        };
        
        // Start loading images
        loadPageImages();
        
        // Poll for status
        pollingRef.current = api.pollTaskStatus(
          task.task_id,
          (status) => {
            setTranslateProgress(status.progress);
          },
          (result) => {
            const paragraphs: ParagraphType[] = result.paragraphs.map((p: ApiParagraph) => ({
              id: p.id,
              type: p.type || 'body',
              original: p.original,
              translation: p.translation,
            }));
            
            if (result.layout) {
              const layoutElements: LayoutElement[] = result.layout.map((elem: ApiLayoutElement) => ({
                id: elem.id,
                element_type: elem.element_type,
                bbox: elem.bbox,
                page_number: elem.page_number,
                content: elem.content,
                table_data: elem.table_data,
                image_data: elem.image_data,
                translation: elem.translation || elem.content,
                should_translate: elem.should_translate,
              }));
              setCurrentLayout(layoutElements);
              
              for (const elem of layoutElements) {
                if (elem.should_translate && elem.translation) {
                  const paraIdx = paragraphs.findIndex(p => p.original === elem.content);
                  if (paraIdx >= 0) {
                    paragraphs[paraIdx].translation = elem.translation;
                  }
                }
              }
            }
            
            setCurrentContent(paragraphs);
            documentContentsRef.current.set(docId, paragraphs);
            setIsTranslating(false);
            setTranslateProgress(100);
            addDocument({
              id: docId,
              name: docName,
              uploadedAt: Date.now(),
              size: file.size,
              type: 'pdf',
              pageCount: result.page_count || Math.max(1, Math.ceil(paragraphs.length / 6)),
              paragraphCount: paragraphs.length,
            });
          },
          (error) => {
            console.error('Translation error:', error);
            setIsTranslating(false);
            setCurrentContent(articleContent);
          },
          2000
        );
      }
    } catch (error) {
      console.error('Upload error:', error);
      setIsTranslating(false);
      setCurrentContent(articleContent);
    }

    setCurrentDocId(docId);
    setCurrentDocName(docName);
  };

  // ── Select from history ──
  const handleSelectDocument = (doc: DocumentSummary) => {
    const stored = documentContentsRef.current.get(doc.id);
    if (stored) {
      setCurrentContent(stored);
    } else if (doc.isDemo || DEMO_IDS.has(doc.id)) {
      setCurrentContent(articleContent);
    } else {
      setCurrentContent([{
        id: 1,
        type: 'body',
        original: '该文档内容已不在当前会话内存中，请重新上传文件以查看翻译内容。',
        translation: '该文档内容已不在当前会话内存中，请重新上传文件以查看翻译内容。',
      }]);
    }
    setCurrentDocId(doc.id);
    setCurrentDocName(doc.name);
    setActiveParagraph(null);
    setShowHistory(false);
  };

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const isClickable = (type: string) => ['abstract', 'body'].includes(type);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#f0f2f5', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Translation progress bar ── */}
      {isTranslating && (
        <div className="fixed top-0 left-0 right-0 z-50" style={{ height: 3 }}>
          <div
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              width: `${translateProgress}%`,
              transition: 'width 0.5s ease',
              boxShadow: '0 0 8px rgba(99,102,241,0.6)',
            }}
          />
        </div>
      )}

      {/* ── Toolbar ── */}
      <header
        className="flex items-center gap-2 px-3 shrink-0 select-none"
        style={{
          height: 52,
          background: 'linear-gradient(135deg, #1a1f36 0%, #0d111f 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 pr-3" style={{ borderRight: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
            <Languages size={15} className="text-white" />
          </div>
          <span className="text-white font-semibold" style={{ fontSize: '14px' }}>PDF 翻译</span>
        </div>

        {/* History button */}
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
          style={{
            background: showHistory ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
            color: showHistory ? '#a5b4fc' : '#94a3b8',
            fontSize: '12px',
          }}
          title="文档历史"
        >
          <Clock size={13} />
          <span>历史</span>
        </button>

        {/* File info */}
        <div
          className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1 rounded-lg cursor-pointer transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)' }}
          onClick={() => setShowHistory(true)}
          title="切换文档"
        >
          <FileText size={13} className="text-slate-400 shrink-0" />
          <span className="text-slate-300 truncate" style={{ fontSize: '13px' }}>{currentDocName}</span>
          {isTranslating && <Loader2 size={12} className="text-blue-400 shrink-0 animate-spin" />}
          <span className="text-slate-600 shrink-0" style={{ fontSize: '12px' }}>· 英语 → 中文</span>
        </div>

        {/* Upload button */}
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
          style={{
            background: 'rgba(59,130,246,0.12)',
            color: '#93c5fd',
            fontSize: '12px',
            border: '1px solid rgba(59,130,246,0.25)',
          }}
          title="上传文档"
        >
          <Upload size={13} />
          <span>上传</span>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-white/10" />

        {/* Page nav */}
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            disabled={currentPage <= 1}
          >
            <ChevronLeft size={14} />
          </button>
          <div className="px-2 py-0.5 rounded text-slate-300" style={{ fontSize: '12px', background: 'rgba(255,255,255,0.08)' }}>
            第 {currentPage} 页 / 共 {totalPages} 页
          </div>
          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            disabled={currentPage >= totalPages}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-white/10" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(z - 10, 70))} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <ZoomOut size={14} />
          </button>
          <span className="text-slate-300 w-10 text-center" style={{ fontSize: '12px' }}>{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 10, 150))} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <ZoomIn size={14} />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-white/10" />

        {/* Feature toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSyncScrollEnabled(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all"
            style={{
              background: syncScrollEnabled ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.07)',
              border: syncScrollEnabled ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: syncScrollEnabled ? '#93c5fd' : '#94a3b8',
              fontSize: '12px',
            }}
          >
            <ArrowLeftRight size={12} />
            <span>同步</span>
          </button>
          <button
            onClick={() => setWordTranslateEnabled(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all"
            style={{
              background: wordTranslateEnabled ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)',
              border: wordTranslateEnabled ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: wordTranslateEnabled ? '#c4b5fd' : '#94a3b8',
              fontSize: '12px',
            }}
          >
            <MousePointer2 size={12} />
            <span>滑词</span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-white/10" />

        {/* Export */}
        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
          style={{
            background: 'rgba(16,185,129,0.12)',
            color: '#6ee7b7',
            fontSize: '12px',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
          title="导出翻译文稿"
        >
          <Download size={13} />
          <span>导出</span>
        </button>

        {/* Settings */}
        <button className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <Settings size={15} />
        </button>
      </header>

      {/* ── Panel Labels ── */}
      <div className="flex shrink-0" style={{ height: 30, background: '#e8eaf0', borderBottom: '1px solid #d1d5db' }}>
        <div className="flex items-center justify-center gap-2" style={{ width: `${leftPanelWidth}%`, borderRight: '1px solid #d1d5db' }}>
          <AlignLeft size={11} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '0.05em', fontWeight: 500 }}>原文（英语）</span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Languages size={11} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '0.05em', fontWeight: 500 }}>
            译文（中文）
            {isTranslating && (
              <span className="ml-2 inline-flex items-center gap-1" style={{ color: '#6366f1' }}>
                <Loader2 size={10} className="animate-spin" />
                翻译中...
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden relative">

        {/* ── Left panel ── */}
        <div ref={leftPanelRef} className="overflow-y-auto" style={{ width: `${leftPanelWidth}%`, background: '#e8eaf0' }}>
          <div className="py-4 px-4 flex justify-center">
            <LeftPanelContent
              pdfPageImages={pdfPageImages}
              isLoadingPdfImages={isLoadingPdfImages}
              currentPage={currentPage}
              currentLayout={currentLayout}
              currentContent={currentContent}
              activeParagraph={activeParagraph}
              hoveredId={hoveredId}
              copiedId={copiedId}
              zoom={zoom}
              onParagraphClick={(id) => handleParagraphClick(id, 'left')}
              onHover={setHoveredId}
              onCopy={handleCopy}
              taskId={currentTaskId}
            />
          </div>
        </div>

        {/* ── Divider ── */}
        <div
          className="flex flex-col items-center justify-center shrink-0 relative"
          style={{ width: 4, background: 'linear-gradient(to bottom, #d1d5db, #c8cacd)', cursor: 'col-resize' }}
          onMouseDown={(e) => {
            e.preventDefault();
            isDragging.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        >
          <div
            className="absolute rounded-full flex flex-col items-center justify-center gap-0.5"
            style={{ width: 20, height: 40, background: '#c4c8cf', border: '1px solid #b8bcc4', left: -8, zIndex: 10, cursor: 'col-resize' }}
            onMouseDown={(e) => {
              e.preventDefault();
              isDragging.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
          >
            {[0, 1, 2].map(i => <div key={i} style={{ width: 2, height: 2, borderRadius: '50%', background: '#888' }} />)}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div ref={rightPanelRef} className="flex-1 overflow-y-auto relative" style={{ background: '#eef2ff' }}>
          {/* Translating overlay */}
          {isTranslating && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
              style={{ background: 'rgba(238,242,255,0.85)', backdropFilter: 'blur(2px)' }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}
              >
                <Loader2 size={26} className="text-white animate-spin" />
              </div>
              <p style={{ fontWeight: 600, color: '#3730a3', fontSize: '15px' }}>正在翻译文档...</p>
              <div className="w-40 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(99,102,241,0.15)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    width: `${translateProgress}%`,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
              <p style={{ fontSize: '12px', color: '#6366f1' }}>{translateProgress}%</p>
            </div>
          )}

          <div className="py-8 px-8 flex justify-center">
            <div
              className="w-full max-w-2xl"
              style={{ fontSize: `${14 * zoom / 100}px`, lineHeight: 1.8 }}
            >
              {currentLayout && currentLayout.length > 0 ? (
                currentLayout
                  .filter(elem => elem.page_number === currentPage)
                  .map((elem, idx) => {
                    const isActive = activeParagraph === elem.id;
                    const isHovered = hoveredId === elem.id;
                    const isLoading = !elem.translation && elem.should_translate;
                    
                    if (elem.element_type === 'table') {
                      return (
                        <div
                          key={elem.id}
                          className="relative my-4 p-3 rounded border"
                          style={{
                            background: '#f9fafb',
                            borderColor: '#e5e7eb',
                          }}
                        >
                          <div className="flex items-center gap-1 mb-2 text-xs text-gray-500">
                            <Table size={12} />
                            <span>表格（不翻译）</span>
                          </div>
                          {elem.table_data && (
                            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                              <tbody>
                                {elem.table_data.map((row, rowIdx) => (
                                  <tr key={rowIdx}>
                                    {row.map((cell, cellIdx) => (
                                      <td
                                        key={cellIdx}
                                        className="border px-2 py-1"
                                        style={{ borderColor: '#e5e7eb' }}
                                      >
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    }
                    
                    if (elem.element_type === 'image') {
                      return (
                        <div
                          key={elem.id}
                          className="relative my-4 p-3 rounded border flex items-center justify-center"
                          style={{
                            background: '#f9fafb',
                            borderColor: '#e5e7eb',
                            minHeight: 100,
                          }}
                        >
                          <div className="flex flex-col items-center gap-1 text-gray-400">
                            <Image size={24} />
                            <span className="text-xs">{elem.content || '[图片不翻译]'}</span>
                          </div>
                        </div>
                      );
                    }
                    
                    if (elem.element_type === 'title') {
                      return (
                        <h2
                          key={elem.id}
                          className="text-center mb-4"
                          style={{ 
                            fontSize: `${20 * zoom / 100}px`, 
                            fontWeight: 700,
                            color: '#312e81',
                          }}
                        >
                          {elem.translation || elem.content || '翻译中...'}
                        </h2>
                      );
                    }
                    
                    if (elem.should_translate) {
                      return (
                        <div
                          key={elem.id}
                          className={`relative group my-1 p-2 rounded-lg ${isActive ? 'ring-2 ring-indigo-500' : ''}`}
                          style={{
                            background: isActive ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.6)',
                            padding: '8px 14px',
                          }}
                        >
                          {isLoading ? (
                            <div
                              className="rounded"
                              style={{ height: '1.8em', background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.15) 50%, rgba(99,102,241,0.08) 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}
                            />
                          ) : (
                            <p className="text-justify" style={{ fontSize: `${13.5 * zoom / 100}px`, lineHeight: 1.8, color: '#1e1b4b' }}>
                              {elem.translation || elem.content}
                            </p>
                          )}
                        </div>
                      );
                    }
                    
                    return null;
                  })
              ) : (
                currentContent.map((para, idx) => {
                  const isActive = activeParagraph === para.id;
                  const isHovered = hoveredId === para.id;
                  const canClick = isClickable(para.type);
                  const colorIdx = idx % PARA_COLORS.length;
                  const isLoading = para.translation === '翻译中...';

                  return (
                    <div
                      key={para.id}
                      ref={(el) => { if (el) rightRefs.current.set(para.id, el); else rightRefs.current.delete(para.id); }}
                      className={`relative group transition-all duration-200 rounded-lg mb-1 ${canClick ? 'cursor-pointer' : ''}`}
                      style={{
                        padding: canClick ? '8px 14px' : '4px 8px',
                        background: isActive
                          ? 'rgba(99,102,241,0.12)'
                          : isHovered && canClick
                          ? 'rgba(99,102,241,0.06)'
                          : canClick ? 'rgba(255,255,255,0.6)' : 'transparent',
                        borderTop: isActive && canClick ? '1px solid rgba(99,102,241,0.35)' : isHovered && canClick ? '1px solid rgba(99,102,241,0.2)' : canClick ? '1px solid rgba(99,102,241,0.08)' : '1px solid transparent',
                        borderRight: isActive && canClick ? '1px solid rgba(99,102,241,0.35)' : isHovered && canClick ? '1px solid rgba(99,102,241,0.2)' : canClick ? '1px solid rgba(99,102,241,0.08)' : '1px solid transparent',
                        borderBottom: isActive && canClick ? '1px solid rgba(99,102,241,0.35)' : isHovered && canClick ? '1px solid rgba(99,102,241,0.2)' : canClick ? '1px solid rgba(99,102,241,0.08)' : '1px solid transparent',
                        borderLeft: isActive && canClick ? `3px solid ${PARA_COLORS[colorIdx]}` : isHovered && canClick ? '1px solid rgba(99,102,241,0.2)' : canClick ? '1px solid rgba(99,102,241,0.08)' : '1px solid transparent',
                        boxShadow: isActive && canClick ? '0 2px 12px rgba(99,102,241,0.12)' : 'none',
                      }}
                      onClick={() => canClick && handleParagraphClick(para.id, 'right')}
                      onMouseEnter={() => canClick && setHoveredId(para.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      {canClick && (
                        <button
                          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                          style={{ background: 'rgba(99,102,241,0.1)', zIndex: 2 }}
                          onClick={(e) => { e.stopPropagation(); handleCopy(para.translation, para.id + 1000); }}
                          title="复制译文"
                        >
                          {copiedId === para.id + 1000 ? <Check size={10} style={{ color: '#10b981' }} /> : <Copy size={10} style={{ color: '#9ca3af' }} />}
                        </button>
                      )}
                      {isActive && canClick && (
                        <span
                          className="absolute -left-6 top-1/2 -translate-y-1/2 text-white rounded text-center"
                          style={{ background: PARA_COLORS[colorIdx], fontSize: '9px', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}
                        >
                          {para.id}
                        </span>
                      )}
                      {isLoading ? (
                        <div
                          className="rounded"
                          style={{ height: '1.8em', background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.15) 50%, rgba(99,102,241,0.08) 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}
                        />
                      ) : (
                        <ParaText para={para} side="translation" zoom={zoom} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Word tooltip */}
        {tooltip && <WordTooltip {...tooltip} onClose={() => setTooltip(null)} />}
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ height: 26, background: '#1a1f36', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: '#64748b' }}
      >
        <div className="flex items-center gap-4">
          <span>{activeParagraph !== null ? `已定位：第 ${activeParagraph} 段` : '点击段落可双向定位'}</span>
          {wordTranslateEnabled && <span style={{ color: '#7c3aed' }}>● 滑词翻译</span>}
          {syncScrollEnabled && <span style={{ color: '#2563eb' }}>● 同步滚动</span>}
        </div>
        <div className="flex items-center gap-3">
          <span>共 {currentContent.length} 个段落</span>
          <span style={{ color: '#374151' }}>·</span>
          <span>英语 → 简体中文</span>
        </div>
      </div>

      {/* ── Overlays ── */}
      <HistorySidebar
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        documents={history}
        currentDocId={currentDocId}
        onSelectDocument={handleSelectDocument}
        onDeleteDocument={removeDocument}
        onNewUpload={() => setShowUpload(true)}
      />
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onConfirm={handleFileUpload}
      />
      <ExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        content={currentContent}
        documentName={currentDocName}
      />

      {/* Shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ── Para text renderer ──
interface ParaTextProps {
  para: Paragraph;
  side: 'original' | 'translation';
  zoom: number;
}

function ParaText({ para, side, zoom }: ParaTextProps) {
  const text = side === 'original' ? para.original : para.translation;
  const isTranslation = side === 'translation';

  switch (para.type) {
    case 'title':
      return <h1 className="text-center mb-2" style={{ fontSize: `${20 * zoom / 100}px`, fontWeight: 700, color: isTranslation ? '#312e81' : '#111827', lineHeight: 1.4 }}>{text}</h1>;
    case 'authors':
      return <p className="text-center mb-1" style={{ fontSize: `${12.5 * zoom / 100}px`, color: isTranslation ? '#4338ca' : '#374151', fontStyle: isTranslation ? 'normal' : 'italic' }}>{text}</p>;
    case 'affiliation':
      return <p className="text-center mb-5" style={{ fontSize: `${11 * zoom / 100}px`, color: '#9ca3af', lineHeight: 1.6 }}>{text}</p>;
    case 'keywords-label':
      return <span style={{ fontSize: `${12 * zoom / 100}px`, fontWeight: 600, color: isTranslation ? '#4338ca' : '#374151', marginRight: 4 }}>{text}</span>;
    case 'keywords':
      return <span className="block mb-6" style={{ fontSize: `${12 * zoom / 100}px`, color: '#6b7280', fontStyle: 'italic' }}>{text}</span>;
    case 'abstract-label':
      return (
        <>
          <hr style={{ borderColor: '#e5e7eb', margin: `${8 * zoom / 100}px 0` }} />
          <p className="mb-2" style={{ fontSize: `${13 * zoom / 100}px`, fontWeight: 700, color: isTranslation ? '#3730a3' : '#111827', letterSpacing: '0.06em', textTransform: isTranslation ? 'none' : 'uppercase' }}>{text}</p>
        </>
      );
    case 'abstract':
      return <p className="mb-3 text-justify" style={{ fontSize: `${12.5 * zoom / 100}px`, color: isTranslation ? '#1e1b4b' : '#374151', paddingLeft: `${16 * zoom / 100}px`, paddingRight: `${16 * zoom / 100}px`, lineHeight: 1.75 }}>{text}</p>;
    case 'section':
      return (
        <>
          <hr style={{ borderColor: '#e5e7eb', margin: `${12 * zoom / 100}px 0 ${8 * zoom / 100}px` }} />
          <p style={{ fontSize: `${14 * zoom / 100}px`, fontWeight: 700, color: isTranslation ? '#3730a3' : '#111827', marginBottom: `${6 * zoom / 100}px` }}>{text}</p>
        </>
      );
    default:
      return <p className="text-justify" style={{ fontSize: `${13.5 * zoom / 100}px`, color: isTranslation ? '#1e1b4b' : '#1f2937', lineHeight: 1.8 }}>{text}</p>;
  }
}

// ── Left Panel Content Component ──
interface LeftPanelContentProps {
  pdfPageImages: Map<number, string>;
  isLoadingPdfImages: boolean;
  currentPage: number;
  currentLayout: LayoutElement[] | null;
  currentContent: Paragraph[];
  activeParagraph: number | null;
  hoveredId: number | null;
  copiedId: number | null;
  zoom: number;
  onParagraphClick: (id: number) => void;
  onHover: (id: number | null) => void;
  onCopy: (text: string, id: number) => void;
  taskId?: string | null;
}

function LeftPanelContent({
  pdfPageImages,
  isLoadingPdfImages,
  currentPage,
  currentLayout,
  currentContent,
  activeParagraph,
  hoveredId,
  copiedId,
  zoom,
  onParagraphClick,
  onHover,
  onCopy,
  taskId,
}: LeftPanelContentProps) {
  const [pageImageUrl, setPageImageUrl] = React.useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = React.useState(false);

  // Load page image dynamically when page changes
  React.useEffect(() => {
    if (pdfPageImages.has(currentPage)) {
      setPageImageUrl(pdfPageImages.get(currentPage) || null);
    } else if (taskId && !pdfPageImages.has(currentPage)) {
      // Try to load the page image dynamically
      setIsLoadingPage(true);
      api.getPDFPageImage(taskId, currentPage, 150)
        .then(url => {
          setPageImageUrl(url);
        })
        .catch(err => {
          console.error('Failed to load page image:', err);
          setPageImageUrl(null);
        })
        .finally(() => {
          setIsLoadingPage(false);
        });
    } else {
      setPageImageUrl(null);
    }
  }, [currentPage, pdfPageImages, taskId]);

  // Show loading state
  if (isLoadingPdfImages || isLoadingPage) {
    return (
      <div className="flex items-center justify-center" style={{ height: 800 }}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <span className="text-sm text-gray-500">加载PDF页面...</span>
        </div>
      </div>
    );
  }

  // Show page image + full content
  if (pageImageUrl) {
    return (
      <div className="w-full flex flex-col items-center">
        {/* PDF Page Image */}
        <div className="relative" style={{ maxWidth: 700 }}>
          <img
            src={pageImageUrl}
            alt={`Page ${currentPage}`}
            style={{
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
          {/* Overlay layout elements on top of the image */}
          {currentLayout && (
            <LayoutOverlay 
              layout={currentLayout} 
              currentPage={currentPage}
              activeParagraph={activeParagraph}
              onParagraphClick={onParagraphClick}
              onHover={onHover}
            />
          )}
        </div>
        
        {/* Full Page Content - All Elements */}
        {currentLayout && currentLayout.filter(e => e.page_number === currentPage).length > 0 && (
          <div className="mt-6 w-full max-w-2xl bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
              页面 {currentPage} 完整内容
            </h3>
            <PageContentList 
              layout={currentLayout}
              currentPage={currentPage}
              activeParagraph={activeParagraph}
              onParagraphClick={onParagraphClick}
              onHover={onHover}
            />
          </div>
        )}
      </div>
    );
  }

  // Otherwise, show the text-based layout
  return (
    <div
      className="w-full max-w-2xl shadow-xl rounded-sm relative"
      style={{
        background: '#ffffff',
        padding: `${48 * zoom / 100}px ${56 * zoom / 100}px`,
        fontSize: `${14 * zoom / 100}px`,
        lineHeight: 1.75,
        color: '#1a1a2e',
        minHeight: 800,
      }}
    >
      <div className="absolute bottom-4 left-0 right-0 flex justify-center" style={{ color: '#9ca3af', fontSize: '11px' }}>
        {currentPage}
      </div>

      {currentLayout && currentLayout.length > 0 ? (
        currentLayout
          .filter((elem) => elem.page_number === currentPage)
          .map((elem) => {
            const isActive = activeParagraph === elem.id;

            if (elem.element_type === 'table') {
              return (
                <div
                  key={elem.id}
                  className="relative my-4 p-3 rounded border"
                  style={{
                    background: '#f9fafb',
                    borderColor: '#e5e7eb',
                  }}
                >
                  <div className="flex items-center gap-1 mb-2 text-xs text-gray-500">
                    <Table size={12} />
                    <span>表格</span>
                  </div>
                  {elem.table_data && (
                    <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                        {elem.table_data.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {row.map((cell, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="border px-2 py-1"
                                style={{ borderColor: '#e5e7eb' }}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            }

            if (elem.element_type === 'image') {
              return (
                <div
                  key={elem.id}
                  className="relative my-4 p-3 rounded border flex items-center justify-center"
                  style={{
                    background: '#f9fafb',
                    borderColor: '#e5e7eb',
                    minHeight: 100,
                  }}
                >
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    <Image size={24} />
                    <span className="text-xs">{elem.content || '[图片]'}</span>
                  </div>
                </div>
              );
            }

            if (elem.element_type === 'title') {
              return (
                <h2
                  key={elem.id}
                  className="text-center mb-4"
                  style={{ fontSize: `${20 * zoom / 100}px`, fontWeight: 700 }}
                >
                  {elem.content}
                </h2>
              );
            }

            if (elem.should_translate && elem.content) {
              return (
                <div
                  key={elem.id}
                  className={`relative group my-1 ${isActive ? 'bg-yellow-50' : ''}`}
                  style={{
                    padding: '4px 8px',
                    cursor: 'pointer',
                  }}
                  onClick={() => onParagraphClick(elem.id)}
                  onMouseEnter={() => onHover(elem.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <p className="text-justify" style={{ fontSize: `${13.5 * zoom / 100}px`, lineHeight: 1.8 }}>
                    {elem.content}
                  </p>
                </div>
              );
            }

            return null;
          })
      ) : (
        currentContent.map((para) => {
          const isActive = activeParagraph === para.id;
          const canClick = ['abstract', 'body'].includes(para.type);

          return (
            <div
              key={para.id}
              className={`relative group my-1 ${canClick ? 'cursor-pointer' : ''} ${isActive ? 'bg-yellow-50' : ''}`}
              style={{
                padding: '4px 8px',
              }}
              onClick={() => canClick && onParagraphClick(para.id)}
              onMouseEnter={() => canClick && onHover(para.id)}
              onMouseLeave={() => onHover(null)}
            >
              {canClick && (
                <button
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                  style={{ background: 'rgba(0,0,0,0.06)', zIndex: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy(para.original, para.id);
                  }}
                  title="复制原文"
                >
                  {copiedId === para.id ? (
                    <Check size={10} style={{ color: '#10b981' }} />
                  ) : (
                    <Copy size={10} style={{ color: '#9ca3af' }} />
                  )}
                </button>
              )}
              <p className="text-justify" style={{ fontSize: `${13.5 * zoom / 100}px`, lineHeight: 1.8 }}>
                {para.original}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Layout Overlay Component ──
interface LayoutOverlayProps {
  layout: LayoutElement[];
  currentPage: number;
  activeParagraph: number | null;
  onParagraphClick: (id: number) => void;
  onHover: (id: number | null) => void;
}

function LayoutOverlay({
  layout,
  currentPage,
  activeParagraph,
  onParagraphClick,
  onHover,
}: LayoutOverlayProps) {
  const pageElements = layout.filter(e => e.page_number === currentPage);
  
  // Find the page dimensions from bbox
  let maxX = 0, maxY = 0;
  pageElements.forEach(elem => {
    if (elem.bbox) {
      maxX = Math.max(maxX, elem.bbox[2]);
      maxY = Math.max(maxY, elem.bbox[3]);
    }
  });
  
  if (maxX === 0 || maxY === 0) return null;
  
  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      {pageElements.map(elem => {
        if (!elem.bbox || elem.element_type === 'paragraph' || elem.element_type === 'title') return null;
        
        const [x0, y0, x1, y1] = elem.bbox;
        const left = (x0 / maxX) * 100;
        const top = (y0 / maxY) * 100;
        const width = ((x1 - x0) / maxX) * 100;
        const height = ((y1 - y0) / maxY) * 100;
        
        const isActive = activeParagraph === elem.id;
        
        let borderColor = '#3b82f6';
        let bgColor = 'rgba(59, 130, 246, 0.1)';
        
        if (elem.element_type === 'table') {
          borderColor = '#10b981';
          bgColor = 'rgba(16, 185, 129, 0.1)';
        } else if (elem.element_type === 'image') {
          borderColor = '#f59e0b';
          bgColor = 'rgba(245, 158, 11, 0.1)';
        } else if (elem.element_type === 'chart') {
          borderColor = '#8b5cf6';
          bgColor = 'rgba(139, 92, 246, 0.1)';
        }
        
        return (
          <div
            key={elem.id}
            className="absolute pointer-events-auto cursor-pointer transition-all"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              border: `2px solid ${isActive ? '#ef4444' : borderColor}`,
              backgroundColor: isActive ? 'rgba(239, 68, 68, 0.2)' : bgColor,
              borderRadius: '4px',
            }}
            onClick={() => onParagraphClick(elem.id)}
            onMouseEnter={() => onHover(elem.id)}
            onMouseLeave={() => onHover(null)}
            title={`${elem.element_type} ${elem.content ? '- ' + elem.content.substring(0, 50) : ''}`}
          >
            <div 
              className="absolute -top-5 left-0 px-1 py-0.5 text-xs text-white rounded"
              style={{ backgroundColor: borderColor }}
            >
              {elem.element_type === 'table' ? '表' : elem.element_type === 'image' ? '图' : elem.element_type === 'chart' ? '图表' : elem.element_type}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Layout Elements List Component ──
interface LayoutElementsListProps {
  layout: LayoutElement[];
  currentPage: number;
}

function LayoutElementsList({ layout, currentPage }: LayoutElementsListProps) {
  const pageElements = layout.filter(e => 
    e.page_number === currentPage && 
    (e.element_type === 'table' || e.element_type === 'image' || e.element_type === 'chart')
  );
  
  if (pageElements.length === 0) return null;
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        页面元素 ({pageElements.length})
      </h4>
      <div className="space-y-2">
        {pageElements.map(elem => (
          <div 
            key={elem.id}
            className="flex items-center gap-2 p-2 rounded bg-gray-50"
          >
            {elem.element_type === 'table' ? (
              <Table size={16} className="text-green-500" />
            ) : elem.element_type === 'image' ? (
              <Image size={16} className="text-amber-500" />
            ) : (
              <Image size={16} className="text-purple-500" />
            )}
            <span className="text-sm text-gray-600">
              {elem.element_type === 'table' ? '表格' : elem.element_type === 'image' ? '图片' : '图表'}
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              {elem.content?.substring(0, 30) || '未命名'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page Content List Component ──
// Shows all page elements: text, tables, images, titles, etc.
interface PageContentListProps {
  layout: LayoutElement[];
  currentPage: number;
  activeParagraph: number | null;
  onParagraphClick: (id: number) => void;
  onHover: (id: number | null) => void;
}

function PageContentList({
  layout,
  currentPage,
  activeParagraph,
  onParagraphClick,
  onHover,
}: PageContentListProps) {
  const pageElements = layout.filter(e => e.page_number === currentPage);
  
  if (pageElements.length === 0) {
    return <div className="text-gray-400 text-sm text-center py-4">暂无内容</div>;
  }
  
  return (
    <div className="space-y-4">
      {pageElements.map(elem => {
        const isActive = activeParagraph === elem.id;
        
        // Table element
        if (elem.element_type === 'table') {
          return (
            <div
              key={elem.id}
              className="relative p-4 rounded-lg border-2 border-green-200 bg-green-50"
            >
              <div className="flex items-center gap-2 mb-3 text-green-700 font-medium">
                <Table size={16} />
                <span>表格</span>
              </div>
              {elem.table_data && elem.table_data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm bg-white rounded" style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      {elem.table_data.map((row, rowIdx) => (
                        <tr key={rowIdx} className={rowIdx === 0 ? 'bg-gray-100' : ''}>
                          {row.map((cell, cellIdx) => (
                            <td
                              key={cellIdx}
                              className="border border-gray-300 px-3 py-2"
                              style={{ 
                                fontWeight: rowIdx === 0 ? 600 : 400,
                                backgroundColor: rowIdx === 0 ? '#f3f4f6' : 'transparent'
                              }}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic">{elem.content || '[表格数据]'}</div>
              )}
            </div>
          );
        }
        
        // Image element
        if (elem.element_type === 'image') {
          return (
            <div
              key={elem.id}
              className="relative p-4 rounded-lg border-2 border-amber-200 bg-amber-50"
            >
              <div className="flex items-center gap-2 mb-2 text-amber-700 font-medium">
                <Image size={16} />
                <span>图片</span>
                <span className="text-xs text-amber-500 ml-2">(不翻译)</span>
              </div>
              <div className="flex items-center justify-center py-6 bg-white rounded border border-amber-200">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Image size={32} />
                  <span className="text-sm">{elem.content || '[图片]'}</span>
                </div>
              </div>
            </div>
          );
        }
        
        // Chart element
        if (elem.element_type === 'chart') {
          return (
            <div
              key={elem.id}
              className="relative p-4 rounded-lg border-2 border-purple-200 bg-purple-50"
            >
              <div className="flex items-center gap-2 mb-2 text-purple-700 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                </svg>
                <span>图表</span>
                <span className="text-xs text-purple-500 ml-2">(不翻译)</span>
              </div>
              <div className="flex items-center justify-center py-6 bg-white rounded border border-purple-200">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                  <span className="text-sm">{elem.content || '[图表]'}</span>
                </div>
              </div>
            </div>
          );
        }
        
        // Title element
        if (elem.element_type === 'title') {
          return (
            <h2
              key={elem.id}
              className={`text-xl font-bold text-gray-800 py-2 ${isActive ? 'bg-yellow-100' : ''}`}
              onClick={() => onParagraphClick(elem.id)}
              onMouseEnter={() => onHover(elem.id)}
              onMouseLeave={() => onHover(null)}
            >
              {elem.content}
            </h2>
          );
        }
        
        // Sidebar element
        if (elem.element_type === 'sidebar') {
          return (
            <div
              key={elem.id}
              className={`relative p-3 rounded border-l-4 border-blue-400 bg-blue-50 ${isActive ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => onParagraphClick(elem.id)}
              onMouseEnter={() => onHover(elem.id)}
              onMouseLeave={() => onHover(null)}
            >
              <div className="text-xs text-blue-500 mb-1 font-medium">侧栏</div>
              <p className="text-sm text-gray-700">{elem.content}</p>
            </div>
          );
        }
        
        // Header/Footer/Page Number - show smaller
        if (elem.element_type === 'header' || elem.element_type === 'footer' || elem.element_type === 'page_number') {
          return (
            <div
              key={elem.id}
              className="text-xs text-gray-400 py-1 text-center"
            >
              {elem.element_type === 'header' && <span className="text-gray-500">[页眉]</span>}
              {elem.element_type === 'footer' && <span className="text-gray-500">[页脚]</span>}
              <span className="mx-2">{elem.content}</span>
            </div>
          );
        }
        
        // Caption element
        if (elem.element_type === 'caption') {
          return (
            <div
              key={elem.id}
              className={`text-sm text-gray-500 italic py-1 text-center ${isActive ? 'bg-yellow-100' : ''}`}
              onClick={() => onParagraphClick(elem.id)}
              onMouseEnter={() => onHover(elem.id)}
              onMouseLeave={() => onHover(null)}
            >
              {elem.content}
            </div>
          );
        }
        
        // List item
        if (elem.element_type === 'list_item') {
          return (
            <div
              key={elem.id}
              className={`flex gap-2 py-1 ${isActive ? 'bg-yellow-100' : ''}`}
              onClick={() => onParagraphClick(elem.id)}
              onMouseEnter={() => onHover(elem.id)}
              onMouseLeave={() => onHover(null)}
            >
              <span className="text-gray-500 select-none">•</span>
              <p className="text-sm text-gray-700 flex-1">{elem.content}</p>
            </div>
          );
        }
        
        // Default: paragraph/text content
        if (elem.should_translate && elem.content) {
          return (
            <div
              key={elem.id}
              className={`relative group py-2 px-2 rounded cursor-pointer transition-colors ${isActive ? 'bg-yellow-100 ring-1 ring-yellow-400' : 'hover:bg-gray-100'}`}
              onClick={() => onParagraphClick(elem.id)}
              onMouseEnter={() => onHover(elem.id)}
              onMouseLeave={() => onHover(null)}
            >
              <p className="text-sm text-gray-800 leading-relaxed">{elem.content}</p>
            </div>
          );
        }
        
        // Skip elements without content
        return null;
      })}
    </div>
  );
}