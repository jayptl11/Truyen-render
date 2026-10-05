import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export function FocusReader({ paragraphs, fontSize, onFontSize, onClose, footer }: {
  paragraphs: string[]; fontSize: number; onFontSize: (size: number) => void; onClose: () => void; footer: ReactNode;
}) {
  return <section className="focus-reader" aria-label="Đọc tập trung">
    <header className="focus-toolbar"><span className="eyebrow">Đọc tập trung</span><div><button className="icon-button" aria-label="Giảm cỡ chữ" onClick={() => onFontSize(Math.max(14, fontSize - 2))}>A−</button><button className="icon-button" aria-label="Tăng cỡ chữ" onClick={() => onFontSize(Math.min(32, fontSize + 2))}>A+</button><button className="icon-button" aria-label="Thoát đọc tập trung" onClick={onClose}><X size={20}/></button></div></header>
    <div className="reading-scroll"><article className="reading-document" style={{ fontSize }}>{paragraphs.map((paragraph, index) => <p key={index} className="reading-paragraph">{paragraph}</p>)}</article></div>
    {footer}
  </section>;
}
