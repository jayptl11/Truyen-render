import { useEffect } from 'react';

/** Keep the application within the visible viewport when a mobile keyboard opens. */
export function useViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const previous = root.style.getPropertyValue('--app-height');
    const measure = () => {
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height || window.innerHeight;
      root.style.setProperty('--app-height', `${height}px`);
      const editing = document.activeElement?.matches('input, textarea, select');
      root.dataset.keyboard = editing && window.innerHeight - height > 100 ? 'open' : 'closed';
    };
    measure();
    viewport?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);
    return () => {
      viewport?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('focusin', measure);
      document.removeEventListener('focusout', measure);
      if (previous) root.style.setProperty('--app-height', previous); else root.style.removeProperty('--app-height');
      delete root.dataset.keyboard;
    };
  }, []);
}
