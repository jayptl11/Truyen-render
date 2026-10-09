import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
export function FocusReader({ paragraphs, contentKey, selectedParagraph, highlightedParagraph, onSelectParagraph, containerRef, paragraphRefs, onScroll, fontSize, onFontSize, onClose, footer }: {
  contentKey: string; selectedParagraph: number; highlightedParagraph: number | null; onSelectParagraph: (index: number) => void;
  containerRef: RefObject<HTMLDivElement | null>; paragraphRefs: RefObject<(HTMLParagraphElement | null)[]>; onScroll: () => void;
  paragraphs: string[]; fontSize: number; onFontSize: (size: number) => void; onClose: () => void; footer: ReactNode;
}) {
  const previousContent = useRef<string | null>(null);
  useEffect(() => {
    const restoring = previousContent.current !== contentKey;
    previousContent.current = contentKey;
    paragraphRefs.current[selectedParagraph]?.scrollIntoView?.({ block: restoring ? 'start' : 'nearest' });
  }, [contentKey, selectedParagraph, paragraphRefs]);
  return <section className="focus-reader" aria-label="Đọc tập trung">
    <header className="focus-toolbar"><span className="eyebrow">Đọc tập trung</span><div><button className="icon-button" aria-label="Giảm cỡ chữ" onClick={() => onFontSize(Math.max(14, fontSize - 2))}>A−</button><button className="icon-button" aria-label="Tăng cỡ chữ" onClick={() => onFontSize(Math.min(32, fontSize + 2))}>A+</button><button className="icon-button" aria-label="Thoát đọc tập trung" onClick={onClose}><X size={20}/></button></div></header>
    <div ref={containerRef} onScroll={onScroll} tabIndex={0} aria-label="Nội dung đọc tập trung" className="reading-scroll">
      <article className="reading-document" style={{ fontSize }}>
        {paragraphs.map((paragraph, index) => <p key={index} ref={element => { paragraphRefs.current[index] = element; }} className={`reading-paragraph ${index === selectedParagraph ? 'is-selected' : ''} ${index === highlightedParagraph ? 'is-search-result' : ''}`} aria-current={index === selectedParagraph ? 'true' : undefined}>
          <button onClick={() => onSelectParagraph(index)} aria-label={`Nghe từ đoạn ${index + 1}`}>{paragraph}</button>
        </p>)}
      </article>
    </div>
    {footer}
  </section>;
}
