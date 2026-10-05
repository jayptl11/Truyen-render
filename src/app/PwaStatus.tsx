import { useEffect, useState } from 'react';
interface InstallPrompt extends Event { prompt: () => Promise<void> }
export function PwaStatus() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    window.addEventListener('beforeinstallprompt', install);
    if (import.meta.env?.PROD && 'serviceWorker' in navigator) {
      let disposed = false;
      void navigator.serviceWorker.register('/sw.js').then(registration => {
        const check = () => { if (!disposed && registration.waiting && navigator.serviceWorker.controller) setUpdate(registration.waiting); };
        check(); registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check));
      }).catch(() => {});
      return () => { disposed = true; window.removeEventListener('beforeinstallprompt', install); };
    }
    return () => window.removeEventListener('beforeinstallprompt', install);
  }, []);
  if (dismissed || !prompt && !update) return null;
  return <div className="pwa-notice" role="status"><span>{update ? 'Có bản cập nhật mới.' : 'Cài Truyện để mở nhanh.'}</span><button className="text-button" onClick={() => {
    if (update) { navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true }); update.postMessage('ACTIVATE_UPDATE'); }
    else { void prompt?.prompt(); setPrompt(null); }
  }}>{update ? 'Cập nhật' : 'Cài'}</button><button aria-label="Để sau" className="text-button" onClick={() => setDismissed(true)}>Để sau</button></div>;
}
