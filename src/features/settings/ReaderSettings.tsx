import { Dialog } from '../../components/Dialog';
interface Props {
  onClose: () => void;
  autoNext: boolean; onAutoNext: () => void;
  autoTranslate: boolean; onAutoTranslate: (enabled: boolean) => void;
  timeLeft: number | null; chapterLimit: number; chapterCount: number;
  onTimer: (minutes: number) => void; onLimit: (chapters: number) => void; onCancelTimer: () => void;
  onAnalysis: (type: 'summary' | 'explain') => void;
  onBatch: () => void; onStats: () => void; onDiagnostics: () => void; onAI: () => void;
}
export function ReaderSettings(props: Props) {
  return <Dialog title="Cài đặt đọc và nghe" onClose={props.onClose}>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={props.autoNext} onChange={props.onAutoNext}/> Hết chương, nghe tiếp chương sau</label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={props.autoTranslate} onChange={e => props.onAutoTranslate(e.target.checked)}/> Dịch khi tải chương mới (cần API key)</label>
    <section className="space-y-2"><h3 className="font-medium text-sm">Hẹn giờ dừng giọng đọc</h3>
      <div className="flex flex-wrap gap-2">{[15, 30, 45, 60].map(minutes => <button key={minutes} onClick={() => props.onTimer(minutes)} className="px-3 py-2 bg-slate-100 rounded text-xs">{minutes} phút</button>)}</div>
      <div className="flex flex-wrap gap-2">{[1, 5, 10].map(chapters => <button key={chapters} onClick={() => props.onLimit(chapters)} className="px-3 py-2 bg-slate-100 rounded text-xs">Dừng sau {chapters} chương</button>)}</div>
      {(props.timeLeft !== null || props.chapterLimit > 0) && <p role="status" className="text-xs text-amber-700">{props.timeLeft !== null ? `Còn ${Math.floor(props.timeLeft / 60)}:${String(props.timeLeft % 60).padStart(2, '0')}` : `Còn ${Math.max(0, props.chapterLimit - props.chapterCount)} chương`} <button onClick={props.onCancelTimer} className="underline ml-2">Hủy hẹn giờ</button></p>}
    </section>
    <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-medium">Công cụ AI (tùy chọn)</h3><div className="flex gap-2 flex-wrap">
      <button onClick={() => props.onAnalysis('summary')} className="text-xs bg-slate-100 p-2 rounded">Tóm tắt chương</button>
      <button onClick={() => props.onAnalysis('explain')} className="text-xs bg-slate-100 p-2 rounded">Giải nghĩa từ</button>
      <button onClick={props.onBatch} className="text-xs bg-slate-100 p-2 rounded">Dịch hàng loạt</button>
      <button onClick={props.onAI} className="text-xs bg-slate-100 p-2 rounded">Cấu hình AI</button>
    </div></section>
    <div className="flex gap-4 text-xs"><button onClick={props.onStats} className="underline">Thống kê</button><button onClick={props.onDiagnostics} className="underline">Nhật ký lỗi</button></div>
    <p className="text-xs text-slate-500">TTS dùng giọng của thiết bị. Phát khi khóa màn hình phụ thuộc trình duyệt.</p>
  </Dialog>;
}
