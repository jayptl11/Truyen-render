import type { Book, Chapter } from '../../types/story';

export function orderExportChapters(chapters: Chapter[], books: Book[]): Chapter[] {
  const order = new Map(books.flatMap((book, bookIndex) => book.chapters.map(chapter => [chapter.url, { bookIndex, index: chapter.index }] as const)));
  return [...chapters].sort((a, b) => {
    const left = order.get(a.url), right = order.get(b.url);
    return (left?.bookIndex ?? books.length) - (right?.bookIndex ?? books.length)
      || (left?.index ?? 0) - (right?.index ?? 0) || a.timestamp - b.timestamp;
  });
}

/** Escape story text before inserting it in a print document. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
export function downloadText(text: string): void {
  const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `truyen-${Date.now()}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printText(text: string): boolean {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.document.write(`<!doctype html><html lang="vi"><head><title>In truyện</title><style>body{font-family:Georgia,serif;margin:2cm;line-height:1.8}p{white-space:pre-wrap}@media print{body{margin:1cm}}</style></head><body>${text.split(/\n{2,}/).map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}</body></html>`);
  popup.document.close();
  setTimeout(() => popup.print(), 250);
  return true;
}
