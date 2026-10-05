export function speechError(error: unknown, signal?: AbortSignal): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (signal?.aborted || name === 'AbortError' || name === 'TimeoutError') {
    return 'Nguồn giọng đọc phản hồi quá lâu hoặc kết nối bị gián đoạn. Thử lại hoặc chọn nguồn giọng khác.';
  }
  if (name === 'NotAllowedError') return 'Trình duyệt chưa cho phép phát âm thanh. Bấm Nghe truyện để thử lại.';
  if (error instanceof TypeError) return 'Không kết nối được nguồn giọng đọc. Kiểm tra mạng và thử lại.';
  return error instanceof Error ? error.message : 'Không phát được giọng đọc. Thử lại hoặc chọn nguồn giọng khác.';
}
