import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    root?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !root) return;
      const nodes = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')];
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) { event.preventDefault(); first.focus(); }
    };
    root?.addEventListener('keydown', onKey);
    return () => { root?.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className="dialog-backdrop" onClick={onClose}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()} className={`dialog-card ${wide ? 'dialog-wide' : ''}`}>
      <div className="dialog-heading"><h2 id={titleId} className="dialog-title">{title}</h2><button aria-label={`Đóng ${title}`} onClick={onClose} className="icon-button"><X size={20}/></button></div>
      <div className="dialog-body space-y-4">{children}</div>
    </div>
  </div>;
}
