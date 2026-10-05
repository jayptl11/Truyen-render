import { getRecord, getRecords, writeRecords } from './database';
export interface CachedAudio { id: string; blob: Blob; bytes: number; accessed: number; pinned: boolean }
const LIMIT = 80 * 1024 * 1024;
let writes: Promise<unknown> = Promise.resolve();
export async function audioCacheId(key: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`audio-v2:${key}`));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function cachedAudio(id: string): Promise<Blob | undefined> {
  const entry = await getRecord<CachedAudio>('audio', id).catch(() => undefined);
  if (!entry?.blob?.size) return;
  // Touches and eviction share a queue so a late touch cannot recreate an evicted clip.
  writes = writes.catch(() => {}).then(async () => {
    const current = await getRecord<CachedAudio>('audio', id);
    if (current) await writeRecords('audio', [{ ...current, accessed: Date.now() }]);
  }).catch(() => {});
  return entry.blob;
}
export function storeAudio(id: string, blob: Blob, pinned = false): Promise<void> {
  const task = writes.catch(() => {}).then(async () => {
    const entries = await getRecords<CachedAudio>('audio');
    let bytes = entries.filter(entry => entry.id !== id).reduce((sum, entry) => sum + entry.bytes, 0) + blob.size;
    const remove: string[] = [];
    for (const entry of entries.filter(entry => !entry.pinned && entry.id !== id).sort((a, b) => a.accessed - b.accessed)) {
      if (bytes <= LIMIT) break;
      bytes -= entry.bytes; remove.push(entry.id);
    }
    if (bytes > LIMIT) throw new Error('Âm thanh đã ghim chiếm hết 80 MB. Bỏ ghim hoặc xóa trước khi tải thêm.');
    await writeRecords('audio', [{ id, blob, bytes: blob.size, accessed: Date.now(), pinned: pinned || entries.some(e => e.id === id && e.pinned) }], remove);
  });
  writes = task; return task;
}
export async function audioStorageInfo() {
  await writes.catch(() => {});
  const entries = await getRecords<CachedAudio>('audio');
  return { bytes: entries.reduce((sum, item) => sum + item.bytes, 0), count: entries.length, pinned: entries.filter(item => item.pinned).length };
}
export async function clearAudioCache() {
  const task = writes.catch(() => {}).then(async () => { const entries = await getRecords<CachedAudio>('audio'); await writeRecords('audio', [], entries.map(item => item.id)); });
  writes = task; return task;
}
