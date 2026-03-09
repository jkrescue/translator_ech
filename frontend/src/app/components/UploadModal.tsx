import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { formatFileSize } from '../hooks/useDocumentHistory';

const ACCEPTED = ['.pdf', '.txt', '.docx'];

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (file: File) => void;
}

export function UploadModal({ isOpen, onClose, onConfirm }: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext)) return `不支持的格式，请上传 PDF、TXT 或 DOCX 文件`;
    if (file.size > 50 * 1024 * 1024) return '文件大小超过 50MB 限制';
    return '';
  };

  const handleFile = (file: File) => {
    const err = validateFile(file);
    if (err) { setError(err); setSelectedFile(null); return; }
    setError('');
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleConfirm = () => {
    if (!selectedFile) return;
    onConfirm(selectedFile);
    setSelectedFile(null);
    setError('');
    onClose();
  };

  const getFileBadgeColor = (name: string) => {
    if (name.endsWith('.pdf')) return { bg: '#fee2e2', color: '#dc2626', label: 'PDF' };
    if (name.endsWith('.txt')) return { bg: '#dbeafe', color: '#2563eb', label: 'TXT' };
    return { bg: '#e9d5ff', color: '#7c3aed', label: 'DOC' };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal card */}
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#fff' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
            >
              <Upload size={15} className="text-white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>上传文档</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <X size={16} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone or file info */}
          {!selectedFile ? (
            <div
              className="rounded-xl border-2 border-dashed transition-all cursor-pointer select-none"
              style={{
                borderColor: isDragging ? '#3b82f6' : error ? '#fca5a5' : '#e5e7eb',
                background: isDragging
                  ? 'rgba(59,130,246,0.04)'
                  : error
                  ? 'rgba(252,165,165,0.06)'
                  : '#fafafa',
                padding: '36px 24px',
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.docx"
                className="hidden"
                onChange={handleInputChange}
              />
              <div className="flex flex-col items-center gap-3 text-center">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all"
                  style={{
                    background: isDragging ? 'rgba(59,130,246,0.15)' : 'rgba(99,102,241,0.08)',
                  }}
                >
                  <Upload
                    size={26}
                    style={{ color: isDragging ? '#3b82f6' : '#6366f1' }}
                  />
                </div>
                <div>
                  <p style={{ fontWeight: 600, color: '#111827', fontSize: '14px' }}>
                    {isDragging ? '松开鼠标以上传' : '拖拽文件到此处'}
                  </p>
                  <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: 3 }}>
                    或{' '}
                    <span style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                      点击选择文件
                    </span>
                  </p>
                  <p style={{ color: '#d1d5db', fontSize: '12px', marginTop: 8 }}>
                    PDF · TXT · DOCX &nbsp;·&nbsp; 最大 50 MB
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}
            >
              {/* File type badge */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold"
                style={{
                  background: getFileBadgeColor(selectedFile.name).bg,
                  color: getFileBadgeColor(selectedFile.name).color,
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                }}
              >
                {getFileBadgeColor(selectedFile.name).label}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>
                  {selectedFile.name}
                </p>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 1 }}>
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle size={16} style={{ color: '#16a34a' }} />
                <button
                  className="p-1 rounded hover:bg-green-100 transition-colors ml-1"
                  onClick={() => setSelectedFile(null)}
                  title="重新选择"
                >
                  <X size={13} style={{ color: '#6b7280' }} />
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#fef2f2' }}>
              <AlertCircle size={14} style={{ color: '#dc2626' }} />
              <span style={{ fontSize: '13px', color: '#dc2626' }}>{error}</span>
            </div>
          )}

          {/* Language selector */}
          <div>
            <p style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500, marginBottom: 8 }}>
              翻译方向
            </p>
            <div
              className="flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl"
              style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}
            >
              <span
                className="px-2.5 py-1 rounded-lg"
                style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '13px', fontWeight: 600 }}
              >
                英语
              </span>
              <span style={{ color: '#9ca3af', fontSize: '16px' }}>→</span>
              <span
                className="px-2.5 py-1 rounded-lg"
                style={{ background: '#ede9fe', color: '#6d28d9', fontSize: '13px', fontWeight: 600 }}
              >
                中文
              </span>
            </div>
          </div>

          {/* Notice */}
          <p
            className="px-3 py-2 rounded-lg"
            style={{ fontSize: '11px', color: '#6b7280', background: '#f9fafb', lineHeight: 1.6 }}
          >
            💡 演示模式：PDF 文件将使用内置示例内容展示翻译效果；TXT 文件将读取实际内容。
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl transition-colors"
              style={{
                border: '1px solid #e5e7eb',
                color: '#6b7280',
                fontSize: '14px',
                fontWeight: 500,
                background: '#fff',
              }}
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedFile}
              className="px-5 py-2 rounded-xl flex items-center gap-2 transition-all"
              style={{
                background: selectedFile ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : '#f3f4f6',
                color: selectedFile ? '#fff' : '#9ca3af',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: selectedFile ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
              }}
            >
              <Upload size={14} />
              开始翻译
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}