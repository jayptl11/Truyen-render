import type { ReactNode, RefObject } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReaderVersion } from '../../types/story';
interface Props {
  version: ReaderVersion; hasTranslation: boolean; onVersion: (version: ReaderVersion) => void;
  paragraphs: string[]; selectedParagraph: number; onSelectParagraph: (index: number) => void;
  highlightedParagraph: number | null;
  containerRef: RefObject<HTMLDivElement | null>; paragraphRefs: RefObject<(HTMLParagraphElement | null)[]>;
  fontSize: number; theme: 'light' | 'dark' | 'sepia'; loading: boolean;
  previous: string | null; next: string | null; onNavigate: (url: string) => void; onScroll: () => void;
  onAdd: () => void; toolbar: ReactNode; footer: ReactNode; children?: ReactNode;
}
export function ReaderView({ version, hasTranslation, onVersion, paragraphs, selectedParagraph, highlightedParagraph, onSelectParagraph, containerRef, paragraphRefs, fontSize, theme, loading, previous, next, onNavigate, onScroll, onAdd, toolbar, footer, children }: Props) {
  return <>
    {toolbar}
    {!!paragraphs.length && <div className="reader-version-bar">
      <div role="group" aria-label="Phiên bản nội dung"><button aria-pressed={version === 'original'} onClick={() => onVersion('original')}>Bản gốc</button><button disabled={!hasTranslation} aria-pressed={version === 'translated'} onClick={() => onVersion('translated')}>Bản dịch</button></div>
      <span>Chọn đoạn để nghe từ đó</span>
    </div>}
    <div className="reading-body" data-theme={theme}>
      <div ref={containerRef} onScroll={onScroll} className="reading-scroll">
        {paragraphs.length ? <article className="reading-document" style={{ fontSize: `${fontSize}px` }} aria-label={version === 'original' ? 'Nội dung bản gốc' : 'Nội dung bản dịch'}>
          {paragraphs.map((text, index) => <p key={index} ref={element => { paragraphRefs.current[index] = element; }} className={`reading-paragraph ${index === selectedParagraph ? 'is-selected' : ''} ${index === highlightedParagraph ? 'is-search-result' : ''} ${index === 0 && (text.startsWith('Chương') || text.length < 100) ? 'chapter-title' : ''}`} aria-current={index === selectedParagraph ? 'true' : undefined}>
            <button onClick={() => onSelectParagraph(index)} aria-label={`Nghe từ đoạn ${index + 1}`}>{text}</button>
          </p>)}
          <nav className="chapter-navigation" aria-label="Chuyển chương">
            {previous && <button className="button-secondary" disabled={loading} onClick={() => onNavigate(previous)}><ChevronLeft size={17}/>Chương trước</button>}
            {next && <button className="button-primary" disabled={loading} onClick={() => onNavigate(next)}>Chương sau<ChevronRight size={17}/></button>}
            {!next && <span className="field-hint">Bạn đã đến cuối chương.</span>}
          </nav>
        </article> : <div className="reader-empty">
          <div className="empty-book" aria-hidden="true"><BookOpen size={46} strokeWidth={1}/></div>
          <span className="eyebrow">Không vội, cứ đọc thôi.</span>
          <h2>Bắt đầu một câu chuyện.</h2>
          <p>Thêm liên kết hoặc dán nội dung.<br/>Đọc và nghe ngay, dịch khi bạn cần.</p>
          <button className="button-secondary" onClick={onAdd}>Thêm chương<ArrowRight size={17}/></button>
          <span className="empty-footnote">Vị trí đọc được lưu trên thiết bị của bạn.</span>
        </div>}
      </div>
      {loading && <div role="status" className="loading-notice">Đang lấy nội dung…</div>}
      {children}
    </div>
    {footer}
  </>;
}
