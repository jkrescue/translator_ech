import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  ArrowLeftRight, MousePointer2, Settings,
  Copy, Check, AlignLeft, Languages,
  Clock, Upload, Download, Loader2,
} from 'lucide-react';
import { articleContent, lookupWord, Paragraph } from './data/content';
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

// Pre-load demo content for demo document IDs
const DEMO_IDS = new Set(['demo-llm-2024', 'demo-transformer', 'demo-nlp', 'demo-rl', 'demo-gpt4']);

export default function App() {
  const [currentContent, setCurrentContent] = useState<Paragraph[]>(articleContent);
  const [currentDocId, setCurrentDocId] = useState('demo-llm-2024');
  const [currentDocName, setCurrentDocName] = useState('large_language_models.pdf');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(0);

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

  // ── File upload handler ──
  const handleFileUpload = async (file: File) => {
    const docId = `doc-${Date.now()}`;
    const docName = file.name;

    setIsTranslating(true);
    setActiveParagraph(null);

    let paragraphs: Paragraph[] = [];

    if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      // Actually read .txt file
      try {
        const text = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = (e) => res((e.target?.result as string) || '');
          reader.onerror = rej;
          reader.readAsText(file, 'UTF-8');
        });
        const rawParas = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 10);
        paragraphs = rawParas.map((p, i) => ({
          id: i + 1,
          type: 'body' as const,
          original: p,
          translation: '翻译中...',
        }));
        setCurrentContent(paragraphs);
        // Simulate translation
        setTimeout(() => {
          setCurrentContent((prev) =>
            prev.map((para) => ({
              ...para,
              translation: para.original.length > 0 ? '（演示模式：请接入翻译API以显示实际译文）' : '',
            }))
          );
          setIsTranslating(false);
          setTranslateProgress(100);
        }, 1800);
      } catch {
        setCurrentContent(articleContent);
        setIsTranslating(false);
      }
    } else {
      // PDF / DOCX → use demo content
      paragraphs = articleContent;
      setCurrentContent(articleContent);
      setTimeout(() => {
        setIsTranslating(false);
        setTranslateProgress(100);
      }, 1600);
    }

    setCurrentDocId(docId);
    setCurrentDocName(docName);
    documentContentsRef.current.set(docId, paragraphs.length > 0 ? paragraphs : articleContent);

    addDocument({
      id: docId,
      name: docName,
      uploadedAt: Date.now(),
      size: file.size,
      type: file.name.toLowerCase().endsWith('.txt') ? 'txt' : file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
      pageCount: Math.max(1, Math.ceil((paragraphs.length || articleContent.length) / 6)),
      paragraphCount: paragraphs.length || articleContent.length,
    });
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
          <button className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <div className="px-2 py-0.5 rounded text-slate-300" style={{ fontSize: '12px', background: 'rgba(255,255,255,0.08)' }}>
            第 1 页 / 共 1 页
          </div>
          <button className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
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
          <div className="py-8 px-8 flex justify-center">
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
              <div className="absolute bottom-4 left-0 right-0 flex justify-center" style={{ color: '#9ca3af', fontSize: '11px' }}>1</div>

              {currentContent.map((para, idx) => {
                const isActive = activeParagraph === para.id;
                const isHovered = hoveredId === para.id;
                const canClick = isClickable(para.type);
                const colorIdx = idx % PARA_COLORS.length;

                return (
                  <div
                    key={para.id}
                    ref={(el) => { if (el) leftRefs.current.set(para.id, el); else leftRefs.current.delete(para.id); }}
                    className={`relative group transition-all duration-200 ${canClick ? 'cursor-pointer' : ''}`}
                    style={{
                      borderRadius: 4,
                      padding: canClick ? '4px 8px 4px 6px' : '2px 4px',
                      margin: canClick ? '2px -8px 2px -6px' : '0 -4px',
                      background: isActive ? 'rgba(251,191,36,0.18)' : isHovered && canClick ? 'rgba(251,191,36,0.08)' : 'transparent',
                      borderLeft: isActive && canClick
                        ? `3px solid ${PARA_COLORS[colorIdx]}`
                        : isHovered && canClick
                        ? '3px solid rgba(251,191,36,0.4)'
                        : canClick ? '3px solid transparent' : undefined,
                    }}
                    onClick={() => canClick && handleParagraphClick(para.id, 'left')}
                    onMouseEnter={() => canClick && setHoveredId(para.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {canClick && (
                      <button
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                        style={{ background: 'rgba(0,0,0,0.06)', zIndex: 2 }}
                        onClick={(e) => { e.stopPropagation(); handleCopy(para.original, para.id); }}
                        title="复制原文"
                      >
                        {copiedId === para.id ? <Check size={10} style={{ color: '#10b981' }} /> : <Copy size={10} style={{ color: '#9ca3af' }} />}
                      </button>
                    )}
                    {isActive && canClick && (
                      <span
                        className="absolute -left-6 top-1/2 -translate-y-1/2 text-white rounded"
                        style={{ background: PARA_COLORS[colorIdx], fontSize: '9px', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}
                      >
                        {para.id}
                      </span>
                    )}
                    <ParaText para={para} side="original" zoom={zoom} />
                  </div>
                );
              })}
            </div>
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
              {currentContent.map((para, idx) => {
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
              })}
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