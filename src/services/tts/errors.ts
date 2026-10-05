export class SpeechRequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = 'SpeechRequestError'; this.status = status; }
}
export function retryableSpeechError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? error.name : '';
  if (['AbortError', 'TimeoutError', 'TypeError'].includes(String(name))) return true;
  return error instanceof SpeechRequestError && [408, 429, 500, 502, 503, 504].includes(error.status);
}

export function speechError(error: unknown, signal?: AbortSignal): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (signal?.aborted || name === 'AbortError' || name === 'TimeoutError') {
    return 'Nguồn giọng đọc phản hồi quá lâu hoặc kết nối bị gián đoạn. Thử lại hoặc chọn nguồn giọng khác.';
  }
  if (name === 'NotAllowedError') return 'Trình duyệt chưa cho phép phát âm thanh. Bấm Nghe truyện để thử lại.';
  if (error instanceof TypeError) return 'Không kết nối được nguồn giọng đọc. Kiểm tra mạng và thử lại.';
  return error instanceof Error ? error.message : 'Không phát được giọng đọc. Thử lại hoặc chọn nguồn giọng khác.';
}
