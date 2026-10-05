/** Static HTML layouts. A profile does not grant access to protected chapters. */
export interface SourceProfile {
  id: string; name: string; hosts: string[]; content: string[]; catalog: string[];
}
export const SOURCE_PROFILES: SourceProfile[] = [
  { id: 'webnovel', name: 'Webnovel.vn', hosts: ['webnovel.vn'], content: ['#chapter-content', '.chapter-content'], catalog: ['#chapterList a[href]'] },
  { id: 'mtruyen', name: 'MTruyen.net', hosts: ['mtruyen.net'], content: ['#chapter-content', '#chapter_content', '.chapter-content', '.chapter_content', '#content-chapter', '.content-chapter', '#truyen-content', '.truyen-content', '#noidung'], catalog: ['.chapter-list a[href]', '.list-chapter a[href]', '.list-chapters a[href]', '#list-chapter a[href]', '#chapters a[href]'] },
  { id: 'truyenfull', name: 'Truyện Full', hosts: ['truyenfull.vn', 'truyenfull.io', 'truyenfull.vision'], content: ['#chapter-c', '.chapter-c'], catalog: ['.list-chapter a[href]'] },
  { id: 'truyenyy', name: 'Truyện YY', hosts: ['truyenyy.com', 'truyenyy.vip'], content: ['#inner_chap_content_1', '.chap-content'], catalog: ['.novel-detail .weui-cells a[href]', 'tbody tr a[href]'] },
  { id: 'tangthuvien', name: 'Tàng Thư Viện', hosts: ['tangthuvien.vn'], content: ['.box-chap'], catalog: ['.chapter-list a[href]', '.list-chapter a[href]'] },
];
export function profileFor(value: string) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  return SOURCE_PROFILES.find(profile => profile.hosts.some(host => hostname === host || hostname.endsWith(`.${host}`)));
}
export function storyUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Chỉ hỗ trợ liên kết HTTP hoặc HTTPS không có thông tin đăng nhập.');
  url.hash = '';
  return url.href;
}
export function fold(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function chapterNumber(value: string): number | null {
  let decoded = value; try { decoded = decodeURI(value); } catch { /* Match literal malformed URLs conservatively. */ }
  const match = fold(decoded).match(/(?:chuong|chapter|chap)[\s_=:-]*(\d+)/);
  return match ? Number(match[1]) : null;
}
/** Only group chapters when the URL supplies an unambiguous chapter component. */
export function inferredBookUrl(value: string): string | null {
  const url = new URL(value);
  const match = url.pathname.match(/^(.*\/)(?:chuong|chapter|chap)[-_]?\d+[^/]*\/?$/i);
  if (!match) {
    const chapter = ['chapter', 'chap', 'chuong'].find(key => /^\d+$/.test(url.searchParams.get(key) || ''));
    const hasBook = ['book', 'book_id', 'story', 'story_id', 'novel', 'truyen_id'].some(key => url.searchParams.has(key));
    if (!chapter || !hasBook) return null;
    url.searchParams.delete(chapter); url.hash = ''; return url.href;
  }
  if (match[1] === '/') return null;
  url.pathname = match[1]; url.search = ''; url.hash = '';
  return url.href;
}
export function sameBookLink(candidate: string, source: string): boolean {
  const link = new URL(candidate); const origin = new URL(source);
  if (link.origin !== origin.origin || link.href === origin.href) return false;
  const root = inferredBookUrl(source);
  return !root || withinBook(candidate, root);
}
export function withinBook(candidate: string, root: string): boolean {
  const link = new URL(candidate); const book = new URL(root); const path = book.pathname.replace(/\/$/, '');
  return link.origin === book.origin && (link.pathname.replace(/\/$/, '') === path || link.pathname.startsWith(`${path}/`))
    && [...book.searchParams].every(([key, value]) => link.searchParams.get(key) === value);
}
