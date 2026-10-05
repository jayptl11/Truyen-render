import type { ReactNode } from 'react';
import { ArrowRight, Link, FileText, RotateCw, ArrowUpRight } from 'lucide-react';
import type { Chapter, TranslationStyle } from '../../types/story';
interface Props {
  mode: 'url' | 'manual'; onMode: (mode: 'url' | 'manual') => void;
  url: string; onUrl: (url: string) => void;
  content: string; onContent: (content: string) => void;
  loading: boolean; translating: boolean; error: string;
  onFetch: () => void; onRead: () => void; onTranslate: () => void; onCancel: () => void;
  style: TranslationStyle; onStyle: (style: TranslationStyle) => void;
  settings: ReactNode; onSettings: () => void;
  recent: Chapter[]; onChapter: (id: string) => void; onLibrary: () => void;
}
export function SourcePanel(props: Props) {
  return <div className="source-inner">
    <div className="section-heading"><span className="eyebrow">Bắt đầu ở đây</span><h1>Thêm một chương.</h1><p>Lấy nội dung từ liên kết, hoặc dán văn bản của bạn.</p></div>
    <div className="source-tabs" role="group" aria-label="Nguồn nội dung">
      <button aria-pressed={props.mode === 'url'} onClick={() => props.onMode('url')}><Link size={17}/>Liên kết</button>
      <button aria-pressed={props.mode === 'manual'} onClick={() => props.onMode('manual')}><FileText size={17}/>Dán văn bản</button>
    </div>
    {props.mode === 'url' ? <div className="source-form">
      <label htmlFor="story-url" className="field-label">Liên kết chương truyện</label>
      <input id="story-url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" autoComplete="url" spellCheck={false} value={props.url} onChange={event => props.onUrl(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !props.loading) props.onFetch(); }} placeholder="Dán link chương truyện…" aria-describedby="source-hint"/>
      <button aria-label="Lấy nội dung truyện" className="button-primary source-submit" disabled={props.loading || props.translating} onClick={props.onFetch}>{props.loading ? <RotateCw size={18} className="loading-icon"/> : <ArrowRight size={18}/>}<span>{props.loading ? 'Đang lấy nội dung' : 'Lấy nội dung'}</span></button>
      <p id="source-hint" className="field-hint">Đọc và nghe bản gốc không cần API key.</p>
      {!!props.content && <details className="original-preview"><summary>Nội dung đã lấy <span>{props.content.length.toLocaleString('vi-VN')} ký tự</span></summary><textarea aria-label="Nội dung gốc" value={props.content} readOnly rows={6}/></details>}
    </div> : <div className="source-form">
      <label htmlFor="manual-text" className="field-label">Nội dung truyện</label>
      <textarea id="manual-text" value={props.content} onChange={event => props.onContent(event.target.value)} placeholder="Dán nội dung chương truyện vào đây…" rows={8}/>
      <button className="button-primary source-submit" disabled={props.loading || props.translating || !props.content.trim()} onClick={props.onFetch}><BookMark/><span>Đọc / nghe bản gốc</span></button>
      <p className="field-hint">Văn bản được lưu vào thư viện trên thiết bị này.</p>
    </div>}
    {props.error && <p role="alert" className="inline-message">{props.error}</p>}
    {(props.loading || props.translating) && <button className="text-button cancel-task" onClick={props.onCancel}>Hủy tác vụ</button>}
    {!!props.content && <button className="button-secondary open-reader" onClick={props.onRead}>Mở trang đọc<ArrowUpRight size={17}/></button>}
    <section className="translation-option" aria-label="Dịch tùy chọn">
      <div className="section-row"><h2>Cần bản dịch?</h2><button className="text-button" onClick={props.onSettings}>Cấu hình AI</button></div>
      <div className="translation-actions"><label className="sr-only" htmlFor="translation-style">Phong cách dịch</label><select id="translation-style" value={props.style} onChange={event => props.onStyle(event.target.value as TranslationStyle)}><option value="ancient">Cổ trang</option><option value="modern">Hiện đại</option></select><button className="button-secondary" disabled={props.loading || props.translating || !props.content.trim()} onClick={props.onTranslate}>{props.translating ? 'Đang dịch…' : 'Dịch (tùy chọn)'}</button></div>
      {props.settings}
    </section>
    <section className="recent-chapters">
      <div className="section-row"><h2>Gần đây</h2><button className="text-button" onClick={props.onLibrary}>Thư viện<ArrowUpRight size={14}/></button></div>
      {props.recent.length ? <ul>{props.recent.slice(0, 3).map(chapter => <li key={chapter.url}><button onClick={() => props.onChapter(chapter.url)}><span className="recent-book"><FileText size={18} strokeWidth={1.5}/></span><span className="recent-copy"><strong>{chapter.title}</strong><span>{chapter.webName} · {chapter.translatedContent ? 'Có bản dịch' : 'Bản gốc'}</span></span><ArrowRight size={16}/></button></li>)}</ul> : <p className="field-hint">Các chương bạn mở sẽ xuất hiện ở đây.</p>}
    </section>
  </div>;
}
function BookMark() { return <FileText size={18}/>; }
