import { useState, useEffect } from 'react';

export interface DocumentSummary {
  id: string;
  name: string;
  uploadedAt: number;
  size: number;
  type: 'pdf' | 'txt' | 'docx' | 'other';
  pageCount: number;
  paragraphCount: number;
  isDemo?: boolean;
}

const STORAGE_KEY = 'pdf_translate_history_v1';

const now = Date.now();
const DEMO_HISTORY: DocumentSummary[] = [
  {
    id: 'demo-llm-2024',
    name: 'large_language_models.pdf',
    uploadedAt: now - 1000 * 60 * 25,
    size: 1_248_312,
    type: 'pdf',
    pageCount: 8,
    paragraphCount: 27,
    isDemo: true,
  },
  {
    id: 'demo-transformer',
    name: 'attention_is_all_you_need.pdf',
    uploadedAt: now - 1000 * 60 * 60 * 4,
    size: 876_544,
    type: 'pdf',
    pageCount: 11,
    paragraphCount: 34,
    isDemo: true,
  },
  {
    id: 'demo-nlp',
    name: 'introduction_to_nlp.txt',
    uploadedAt: now - 1000 * 60 * 60 * 28,
    size: 42_800,
    type: 'txt',
    pageCount: 4,
    paragraphCount: 18,
    isDemo: true,
  },
  {
    id: 'demo-rl',
    name: 'reinforcement_learning_survey.pdf',
    uploadedAt: now - 1000 * 60 * 60 * 24 * 3,
    size: 2_104_832,
    type: 'pdf',
    pageCount: 18,
    paragraphCount: 45,
    isDemo: true,
  },
  {
    id: 'demo-gpt4',
    name: 'gpt4_technical_report.pdf',
    uploadedAt: now - 1000 * 60 * 60 * 24 * 7,
    size: 3_564_032,
    type: 'pdf',
    pageCount: 24,
    paragraphCount: 61,
    isDemo: true,
  },
];

export function useDocumentHistory() {
  const [history, setHistory] = useState<DocumentSummary[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DocumentSummary[];
        const ids = new Set(parsed.map((d) => d.id));
        const missingDemos = DEMO_HISTORY.filter((d) => !ids.has(d.id));
        return [...parsed, ...missingDemos];
      }
    } catch {}
    return DEMO_HISTORY;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  const addDocument = (doc: DocumentSummary) => {
    setHistory((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)].slice(0, 30));
  };

  const removeDocument = (id: string) => {
    setHistory((prev) => prev.filter((d) => d.id !== id));
  };

  return { history, addDocument, removeDocument };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 86_400_000 * 2) return '昨天';
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}