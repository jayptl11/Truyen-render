/** All persistence goes through this adapter so storage failures are visible. */
export const storage = {
  getItem(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch {
      window.dispatchEvent(new CustomEvent('reader-storage-error', {
        detail: 'Không lưu được dữ liệu trên thiết bị (bộ nhớ đầy hoặc bị chặn). Hãy xuất bản sao trước khi đóng trang.',
      }));
    }
  },
  removeItem(key: string): void {
    try { localStorage.removeItem(key); } catch {
      window.dispatchEvent(new CustomEvent('reader-storage-error', { detail: 'Không xóa được dữ liệu đã lưu trên thiết bị.' }));
    }
  },
};
export function readJson<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) || 'null');
    return value !== null && (!validate || validate(value)) ? value as T : fallback;
  } catch { return fallback; }
}
export function writeJson(key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}
