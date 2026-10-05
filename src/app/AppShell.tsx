import type { ReactNode } from 'react';
import { BookOpen, Library, Plus, Settings2 } from 'lucide-react';
import { useViewport } from './useViewport';
interface Props {
  theme: 'light' | 'dark' | 'sepia'; active: 'input' | 'reader'; onView: (view: 'input' | 'reader') => void;
  onLibrary: () => void; onSettings: () => void;
  source: ReactNode; reader: ReactNode; children?: ReactNode;
}
export function AppShell({ theme, active, onView, onLibrary, onSettings, source, reader, children }: Props) {
  useViewport();
  const navigation = <>
    <button onClick={() => onView('input')} aria-current={active === 'input' ? 'page' : undefined}><Plus size={19}/><span>Thêm truyện</span></button>
    <button onClick={() => onView('reader')} aria-current={active === 'reader' ? 'page' : undefined}><BookOpen size={19}/><span>Đọc</span></button>
    <button onClick={onLibrary}><Library size={19}/><span>Thư viện</span></button>
    <button onClick={onSettings}><Settings2 size={19}/><span>Cài đặt</span></button>
  </>;
  return <div className="app-shell" data-view={active} data-theme={theme}>
    <a className="skip-link" href={active === 'input' ? '#source-panel' : '#reader-panel'}>Đến nội dung chính</a>
    <header className="app-header">
      <button className="brand" onClick={() => onView('input')} aria-label="Truyện — trang bắt đầu"><BookOpen size={24} strokeWidth={1.5}/><span>Truyện<span className="brand-caption">đọc & nghe</span></span></button>
      <nav className="desktop-navigation" aria-label="Điều hướng chính">{navigation}</nav>
      <span className="header-note">Một chương, một khoảng nghỉ.</span>
    </header>
    <main className="app-workspace">
      <aside id="source-panel" className="source-panel" tabIndex={-1} aria-label="Thêm nội dung truyện">{source}</aside>
      <section id="reader-panel" className="reader-panel" tabIndex={-1} aria-label="Trang đọc và nghe">{reader}</section>
    </main>
    <nav className="mobile-navigation" aria-label="Điều hướng chính">{navigation}</nav>
    {children}
  </div>;
}
