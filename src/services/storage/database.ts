import type { Chapter } from '../../types/story';
import { readChapters } from './chapters';
import { readJson } from './local';

export const DATABASE_NAME = 'truyen-library';
export type Store = 'chapters' | 'books' | 'positions' | 'audio' | 'meta';
let database: Promise<IDBDatabase> | undefined;
export function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Trình duyệt không cho phép lưu offline.'));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('chapters', { keyPath: 'url' });
      db.createObjectStore('books', { keyPath: 'id' });
      db.createObjectStore('positions', { keyPath: 'id' });
      const audio = db.createObjectStore('audio', { keyPath: 'id' });
      audio.createIndex('accessed', 'accessed');
      db.createObjectStore('meta', { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { window.dispatchEvent(new CustomEvent('reader-storage-error', { detail: 'Đóng tab Truyện cũ để cập nhật thư viện offline.' })); };
  });
  return database;
}
export async function getRecord<T>(store: Store, key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store);
    const request = transaction.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function getRecords<T>(store: Store): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function writeRecords(store: Store, values: unknown[], remove: string[] = []): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    const target = transaction.objectStore(store);
    transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error || new Error('Không lưu được dữ liệu.'));
    transaction.onerror = () => {};
    try { values.forEach(value => target.put(value)); remove.forEach(key => target.delete(key)); }
    catch (error) { transaction.abort(); reject(error); }
  });
}
export function storageFailure(error: unknown) {
  if (typeof indexedDB === 'undefined') return;
  window.dispatchEvent(new CustomEvent('reader-storage-error', { detail: error instanceof DOMException && error.name === 'QuotaExceededError'
    ? 'Bộ nhớ offline đã đầy. Xóa âm thanh đã tải trong Thư viện rồi thử lại; dữ liệu cũ vẫn được giữ.' : 'Không lưu được thư viện offline. Hãy xuất bản sao trước khi đóng trang.' }));
}
/** The marker and legacy data commit together. Keep localStorage as a recovery backup. */
export async function migrateLibrary(): Promise<Chapter[]> {
  const db = await openDatabase();
  const legacy = readChapters();
  const positions = readJson<Record<string, unknown>>('reader_progress', {});
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['chapters', 'positions', 'meta'], 'readwrite');
    const meta = transaction.objectStore('meta');
    const check = meta.get('legacy-v1');
    check.onsuccess = () => {
      if (check.result) return;
      for (const chapter of legacy) transaction.objectStore('chapters').put(chapter);
      for (const [id, value] of Object.entries(positions)) {
        if (value && typeof value === 'object') transaction.objectStore('positions').put({ ...value, id });
      }
      meta.put({ id: 'legacy-v1', timestamp: Date.now(), chapters: legacy.length });
    };
    transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error);
  });
  return getRecords<Chapter>('chapters');
}
