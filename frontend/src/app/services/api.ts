const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface Paragraph {
  id: number;
  type: string;
  original: string;
  translation: string;
  page_number?: number;
}

export interface LayoutElement {
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

export interface TranslationTask {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  filename: string;
  error?: string;
  layout?: LayoutElement[];
  page_count?: number;
}

export interface TranslationResult {
  paragraphs: Paragraph[];
  layout?: LayoutElement[];
  page_count?: number;
}

export interface PDFPageInfo {
  page_number: number;
  width: number;
  height: number;
}

export interface PDFInfo {
  page_count: number;
  pages: PDFPageInfo[];
}

export async function uploadPDF(file: File): Promise<TranslationTask> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }

  return response.json();
}

export async function getTaskStatus(taskId: string): Promise<TranslationTask> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get task status');
  }

  return response.json();
}

export async function getTranslationResult(taskId: string): Promise<TranslationResult> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/result`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get translation result');
  }

  return response.json();
}

export async function cancelTask(taskId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/cancel`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to cancel task');
  }
}

export async function exportTranslation(
  taskId: string,
  format: 'txt' | 'html' | 'md'
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/export/${taskId}/${format}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to export translation');
  }

  return response.blob();
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error('Health check failed');
  }

  return response.json();
}

export function pollTaskStatus(
  taskId: string,
  onUpdate: (task: TranslationTask) => void,
  onComplete: (result: TranslationResult) => void,
  onError: (error: Error) => void,
  interval: number = 1000
): () => void {
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;

    try {
      const status = await getTaskStatus(taskId);
      onUpdate(status);

      if (status.status === 'completed') {
        const result = await getTranslationResult(taskId);
        onComplete(result);
      } else if (status.status === 'failed') {
        onError(new Error(status.error || 'Translation failed'));
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  };

  const intervalId = setInterval(poll, interval);
  poll();

  return () => {
    cancelled = true;
    clearInterval(intervalId);
  };
}

export async function getPDFInfo(taskId: string): Promise<PDFInfo> {
  const response = await fetch(`${API_BASE_URL}/api/pdf/${taskId}/info`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get PDF info');
  }

  return response.json();
}

export async function getPDFPageImage(taskId: string, pageNum: number, dpi: number = 150): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/pdf/${taskId}/page/${pageNum}?dpi=${dpi}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get PDF page image');
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
