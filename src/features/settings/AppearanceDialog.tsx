import { Dialog } from '../../components/Dialog';
export function AppearanceDialog({ theme, fontSize, onTheme, onFontSize, onClose }: {
  theme: 'light' | 'dark' | 'sepia'; fontSize: number;
  onTheme: (theme: 'light' | 'dark' | 'sepia') => void; onFontSize: (size: number) => void; onClose: () => void;
}) {
  return <Dialog title="Giao diện đọc" onClose={onClose}>
    <fieldset className="appearance-themes"><legend className="field-label">Nền trang</legend>{([{ value: 'light', label: 'Sáng' }, { value: 'sepia', label: 'Giấy' }, { value: 'dark', label: 'Tối' }] as const).map(option => <button key={option.value} aria-pressed={theme === option.value} data-swatch={option.value} onClick={() => onTheme(option.value)}>{option.label}</button>)}</fieldset>
    <label className="font-size-control"><span className="field-label">Cỡ chữ <strong>{fontSize}px</strong></span><input aria-label="Cỡ chữ đọc" type="range" min={14} max={32} value={fontSize} onChange={event => onFontSize(Number(event.target.value))}/></label>
    <p className="font-preview" style={{ fontSize }}>Một câu chuyện hay luôn có chỗ cho bạn.</p>
  </Dialog>;
}
