import React, { useState } from 'react';
import { X, Trash2, Clock, FileText, Upload, Search, ChevronRight } from 'lucide-react';
import {
  DocumentSummary,
  formatFileSize,
  getRelativeTime,
} from '../hooks/useDocumentHistory';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentSummary[];
  currentDocId: string;
  onSelectDocument: (doc: DocumentSummary) => void;
  onDeleteDocument: (id: string) => void;
  onNewUpload: () => void;
}

const FILE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  pdf: { bg: '#fee2e2', color: '#dc2626', label: 'PDF' },
  txt: { bg: '#dbeafe', color: '#2563eb', label: 'TXT' },
  docx: { bg: '#e9d5ff', color: '#7c3aed', label: 'DOC' },
  other: { bg: '#e5e7eb', color: '#6b7280', label: 'FILE' },
};

function groupByDate(docs: DocumentSummary[]) {
  const today0 = new Date().setHours(0, 0, 0, 0);
  const yesterday0 = today0 - 86_400_000;
  const lastWeek0 = today0 - 7 * 86_400_000;

  return {
    today: docs.filter((d) => d.uploadedAt >= today0),
    yesterday: docs.filter((d) => d.uploadedAt >= yesterday0 && d.uploadedAt < today0),
    lastWeek: docs.filter((d) => d.uploadedAt >= lastWeek0 && d.uploadedAt < yesterday0),
    older: docs.filter((d) => d.uploadedAt < lastWeek0),
  };
}

interface DocItemProps {
  doc: DocumentSummary;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function DocItem({ doc, isActive, onSelect, onDelete }: DocItemProps) {
  const [hovered, setHovered] = useState(false);
  const badge = FILE_BADGE[doc.type] ?? FILE_BADGE.other;

  return (
    <div
      className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group"
      style={{
        background: isActive
          ? 'rgba(99,102,241,0.18)'
          : hovered
          ? 'rgba(255,255,255,0.08)'
          : 'transparent',
        borderLeft: isActive ? '2px solid #818cf8' : '2px solid transparent',
      }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* File type badge */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold"
        style={{ background: badge.bg, color: badge.color, fontSize: '10px', letterSpacing: '0.03em' }}
      >
        {badge.label}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{
            fontSize: '13px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#c7d2fe' : '#e2e8f0',
          }}
        >
          {doc.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span style={{ fontSize: '11px', color: '#64748b' }}>{getRelativeTime(doc.uploadedAt)}</span>
          <span style={{ color: '#334155', fontSize: '11px' }}>·</span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>{doc.pageCount} 页</span>
          <span style={{ color: '#334155', fontSize: '11px' }}>·</span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>{formatFileSize(doc.size)}</span>
        </div>
      </div>

      {/* Active indicator or delete */}
      {isActive ? (
        <ChevronRight size={14} style={{ color: '#818cf8', shrink: 0 }} />
      ) : hovered ? (
        <button
          className="p-1 rounded-lg transition-colors"
          style={{ background: 'rgba(239,68,68,0.15)' }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="删除记录"
        >
          <Trash2 size={13} style={{ color: '#f87171' }} />
        </button>
      ) : null}
    </div>
  );
}

export function HistorySidebar({
  isOpen,
  onClose,
  documents,
  currentDocId,
  onSelectDocument,
  onDeleteDocument,
  onNewUpload,
}: HistorySidebarProps) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? documents.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : documents;

  const sorted = [...filtered].sort((a, b) => b.uploadedAt - a.uploadedAt);
  const groups = groupByDate(sorted);

  const renderGroup = (label: string, docs: DocumentSummary[]) => {
    if (docs.length === 0) return null;
    return (
      <div key={label} className="mb-4">
        <p
          className="px-3 mb-1"
          style={{ fontSize: '11px', color: '#475569', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          {label}
        </p>
        <div className="space-y-0.5">
          {docs.map((doc) => (
            <DocItem
              key={doc.id}
              doc={doc}
              isActive={doc.id === currentDocId}
              onSelect={() => onSelectDocument(doc)}
              onDelete={() => onDeleteDocument(doc.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className="fixed top-0 left-0 h-full z-50 flex flex-col"
        style={{
          width: 300,
          background: 'linear-gradient(180deg, #0f172a 0%, #1a1f36 100%)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2">
            <Clock size={16} style={{ color: '#818cf8' }} />
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#e2e8f0' }}>文档历史</span>
            <span
              className="px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: '11px', fontWeight: 600 }}
            >
              {documents.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: '#64748b' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-3 shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Search size={13} style={{ color: '#475569' }} />
            <input
              type="text"
              placeholder="搜索文档..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none"
              style={{ fontSize: '13px', color: '#cbd5e1' }}
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X size={12} style={{ color: '#475569' }} />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-1 pb-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <FileText size={28} style={{ color: '#334155' }} />
              <p style={{ fontSize: '13px', color: '#475569' }}>暂无文档记录</p>
            </div>
          ) : (
            <>
              {renderGroup('今天', groups.today)}
              {renderGroup('昨天', groups.yesterday)}
              {renderGroup('最近 7 天', groups.lastWeek)}
              {renderGroup('更早', groups.older)}
            </>
          )}
        </div>

        {/* Footer: Upload button */}
        <div className="px-3 py-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => { onClose(); onNewUpload(); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
            }}
          >
            <Upload size={15} />
            上传新文档
          </button>
        </div>
      </div>
    </>
  );
}
