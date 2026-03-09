import React, { useState } from 'react';
import { X, Download, FileText, Code2, Hash, CheckCircle } from 'lucide-react';
import { Paragraph } from '../data/content';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: Paragraph[];
  documentName: string;
}

type Format = 'txt' | 'html' | 'md';
type ContentType = 'bilingual' | 'translation' | 'original';

const FORMATS: { id: Format; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'txt',
    label: 'TXT 纯文本',
    desc: '双语对照纯文本，兼容性最佳',
    icon: <FileText size={16} />,
  },
  {
    id: 'html',
    label: 'HTML 网页',
    desc: '带样式的双栏对照网页文件',
    icon: <Code2 size={16} />,
  },
  {
    id: 'md',
    label: 'Markdown',
    desc: '适合开发者和笔记软件使用',
    icon: <Hash size={16} />,
  },
];

const CONTENT_TYPES: { id: ContentType; label: string; desc: string }[] = [
  { id: 'bilingual', label: '双语对照', desc: '原文 + 译文' },
  { id: 'translation', label: '仅译文', desc: '只导出中文翻译' },
  { id: 'original', label: '仅原文', desc: '只导出英文原文' },
];

function generateTxt(content: Paragraph[], type: ContentType, docName: string): string {
  const date = new Date().toLocaleDateString('zh-CN');
  const header = `${'='.repeat(50)}\n双语对照翻译\n文档：${docName}\n翻译日期：${date}\n${'='.repeat(50)}\n\n`;

  const lines = content
    .filter((p) => p.type === 'body' || p.type === 'abstract')
    .map((p, i) => {
      const n = i + 1;
      if (type === 'bilingual') {
        return `[${n}] 原文\n${p.original}\n\n[${n}] 译文\n${p.translation}\n\n${'—'.repeat(40)}\n`;
      }
      if (type === 'translation') return `[${n}]\n${p.translation}\n`;
      return `[${n}]\n${p.original}\n`;
    })
    .join('\n');

  return header + lines;
}

function generateHtml(content: Paragraph[], type: ContentType, docName: string): string {
  const date = new Date().toLocaleDateString('zh-CN');
  const bodyParagraphs = content.filter((p) => p.type === 'body' || p.type === 'abstract');

  const rows = bodyParagraphs
    .map((p, i) => {
      if (type === 'bilingual') {
        return `<tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;vertical-align:top;font-size:14px;color:#1f2937;line-height:1.8;">${p.original}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e8eef8;vertical-align:top;font-size:14px;color:#1e1b4b;line-height:1.8;background:#f8f9ff;">${p.translation}</td>
        </tr>`;
      }
      if (type === 'translation') {
        return `<tr><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1e1b4b;line-height:1.8;">${p.translation}</td></tr>`;
      }
      return `<tr><td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1f2937;line-height:1.8;">${p.original}</td></tr>`;
    })
    .join('');

  const headers =
    type === 'bilingual'
      ? `<th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:2px solid #e5e7eb;width:50%;">原文（英语）</th>
         <th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;background:#eef2ff;border-bottom:2px solid #e0e7ff;width:50%;">译文（中文）</th>`
      : `<th style="padding:12px 16px;text-align:left;font-size:12px;color:#6b7280;background:#f9fafb;border-bottom:2px solid #e5e7eb;">${type === 'translation' ? '中文译文' : '英文原文'}</th>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${docName} - 翻译文稿</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; background: #f5f5f0; }
  .container { max-width: 1100px; margin: 0 auto; }
  .header { background: linear-gradient(135deg,#1a1f36,#0d111f); color: #e2e8f0; padding: 24px 32px; border-radius: 12px 12px 0 0; }
  .header h1 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
  .header p { margin: 0; font-size: 13px; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 0 0 12px 12px; overflow: hidden; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📄 ${docName}</h1>
    <p>翻译日期：${date} &nbsp;·&nbsp; 共 ${bodyParagraphs.length} 段</p>
  </div>
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body>
</html>`;
}

function generateMarkdown(content: Paragraph[], type: ContentType, docName: string): string {
  const date = new Date().toLocaleDateString('zh-CN');
  const bodyParagraphs = content.filter((p) => p.type === 'body' || p.type === 'abstract');
  const title = content.find((p) => p.type === 'title');

  let out = `# ${title ? (type === 'translation' ? title.translation : title.original) : docName}\n\n`;
  out += `> 📄 **文档：** ${docName}  \n> 📅 **翻译日期：** ${date}  \n> 📊 **共 ${bodyParagraphs.length} 段落**\n\n---\n\n`;

  bodyParagraphs.forEach((p, i) => {
    if (type === 'bilingual') {
      out += `### 第 ${i + 1} 段\n\n**原文：**\n\n${p.original}\n\n**译文：**\n\n${p.translation}\n\n---\n\n`;
    } else if (type === 'translation') {
      out += `${p.translation}\n\n`;
    } else {
      out += `${p.original}\n\n`;
    }
  });

  return out;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportModal({ isOpen, onClose, content, documentName }: ExportModalProps) {
  const [format, setFormat] = useState<Format>('txt');
  const [contentType, setContentType] = useState<ContentType>('bilingual');
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen) return null;

  const baseName = documentName.replace(/\.(pdf|txt|docx)$/i, '');
  const previewParagraphs = content.filter((p) => p.type === 'body' || p.type === 'abstract').slice(0, 2);

  const handleDownload = () => {
    const ext = format;
    const filename = `${baseName}_翻译.${ext}`;

    let text = '';
    if (format === 'txt') {
      text = generateTxt(content, contentType, documentName);
      downloadFile(text, filename, 'text/plain');
    } else if (format === 'html') {
      text = generateHtml(content, contentType, documentName);
      downloadFile(text, filename, 'text/html');
    } else {
      text = generateMarkdown(content, contentType, documentName);
      downloadFile(text, filename, 'text/markdown');
    }

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: '#fff', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <Download size={15} className="text-white" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>导出翻译文稿</p>
              <p className="truncate" style={{ fontSize: '11px', color: '#9ca3af', maxWidth: 240 }}>
                {documentName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <X size={16} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Format selection */}
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: 10 }}>
              导出格式
            </p>
            <div className="space-y-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    border: format === f.id ? '1.5px solid #6366f1' : '1.5px solid #f3f4f6',
                    background: format === f.id ? 'rgba(99,102,241,0.05)' : '#fafafa',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: format === f.id ? 'rgba(99,102,241,0.12)' : '#f3f4f6',
                      color: format === f.id ? '#6366f1' : '#6b7280',
                    }}
                  >
                    {f.icon}
                  </div>
                  <div className="flex-1">
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{f.label}</p>
                    <p style={{ fontSize: '11px', color: '#9ca3af' }}>{f.desc}</p>
                  </div>
                  {format === f.id && <CheckCircle size={16} style={{ color: '#6366f1' }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Content type */}
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: 10 }}>
              内容选项
            </p>
            <div className="flex gap-2">
              {CONTENT_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => setContentType(ct.id)}
                  className="flex-1 py-2.5 rounded-xl text-center transition-all"
                  style={{
                    border: contentType === ct.id ? '1.5px solid #6366f1' : '1.5px solid #f3f4f6',
                    background: contentType === ct.id ? 'rgba(99,102,241,0.07)' : '#fafafa',
                    color: contentType === ct.id ? '#4f46e5' : '#6b7280',
                  }}
                >
                  <p style={{ fontSize: '12px', fontWeight: 600 }}>{ct.label}</p>
                  <p style={{ fontSize: '10px', marginTop: 1, opacity: 0.7 }}>{ct.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              内容预览
            </p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid #f3f4f6', background: '#fafafa' }}
            >
              {previewParagraphs.slice(0, 1).map((p) => (
                <div key={p.id}>
                  {(contentType === 'bilingual' || contentType === 'original') && (
                    <div className="px-4 py-3" style={{ borderBottom: contentType === 'bilingual' ? '1px solid #f3f4f6' : 'none' }}>
                      <p style={{ fontSize: '10px', color: '#9ca3af', marginBottom: 4, fontWeight: 600 }}>
                        原文
                      </p>
                      <p style={{ fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
                        {p.original.slice(0, 120)}{p.original.length > 120 ? '...' : ''}
                      </p>
                    </div>
                  )}
                  {(contentType === 'bilingual' || contentType === 'translation') && (
                    <div className="px-4 py-3" style={{ background: contentType === 'bilingual' ? 'rgba(238,242,255,0.6)' : 'transparent' }}>
                      <p style={{ fontSize: '10px', color: '#9ca3af', marginBottom: 4, fontWeight: 600 }}>
                        译文
                      </p>
                      <p style={{ fontSize: '12px', color: '#1e1b4b', lineHeight: 1.7 }}>
                        {p.translation.slice(0, 100)}{p.translation.length > 100 ? '...' : ''}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              <div
                className="px-4 py-2 flex items-center justify-between"
                style={{ borderTop: '1px solid #f3f4f6' }}
              >
                <span style={{ fontSize: '11px', color: '#d1d5db' }}>
                  共 {content.filter((p) => p.type === 'body' || p.type === 'abstract').length} 段内容
                </span>
                <span style={{ fontSize: '11px', color: '#d1d5db' }}>仅显示首段预览</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid #f3f4f6' }}
        >
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>
            文件名：{baseName}_翻译.{format}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl transition-colors"
              style={{ border: '1px solid #e5e7eb', color: '#6b7280', fontSize: '14px', background: '#fff' }}
            >
              取消
            </button>
            <button
              onClick={handleDownload}
              className="px-5 py-2 rounded-xl flex items-center gap-2 transition-all"
              style={{
                background: downloaded
                  ? 'linear-gradient(135deg,#10b981,#059669)'
                  : 'linear-gradient(135deg,#10b981,#059669)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
              }}
            >
              {downloaded ? (
                <>
                  <CheckCircle size={14} />
                  已下载
                </>
              ) : (
                <>
                  <Download size={14} />
                  下载导出
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
