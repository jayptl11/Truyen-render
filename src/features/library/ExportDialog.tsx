import { Dialog } from '../../components/Dialog';
import type { Chapter } from '../../types/story';
export function ExportDialog({ chapters, selected, onToggle, onAll, onClose, hasCurrent, onTxt, onPdf, separator, onSeparator }: {
  chapters: Chapter[]; selected: string[]; onToggle: (id: string) => void; onAll: () => void; onClose: () => void;
  hasCurrent: boolean; onTxt: () => void; onPdf: () => void;
  separator: 'none' | 'line'; onSeparator: (separator: 'none' | 'line') => void;
}) {
  return <Dialog title="Xuất nội dung" onClose={onClose}>
    <p className="text-xs text-slate-500">Xuất phiên bản đang chọn (bản gốc hoặc bản dịch). Chương chưa dịch luôn dùng bản gốc.</p>
    <label className="text-sm block">Ngăn cách chương<select value={separator} onChange={e => onSeparator(e.target.value as 'none' | 'line')} className="border rounded ml-2 p-1"><option value="none">Dòng trống</option><option value="line">Đường kẻ</option></select></label>
    {!!chapters.length && <><button onClick={onAll} className="text-xs underline">Chọn tất cả chương</button>
      <div className="space-y-2">{chapters.map(chapter => <label key={chapter.url} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={selected.includes(chapter.url)} onChange={() => onToggle(chapter.url)}/><span className="truncate">{chapter.title}</span></label>)}</div></>}
    <p className="text-sm">{selected.length ? `${selected.length} chương đã chọn` : hasCurrent ? 'Xuất chương đang đọc' : 'Chọn chương để xuất'}</p>
    <div className="flex gap-2"><button disabled={!hasCurrent && !selected.length} onClick={onTxt} className="rounded px-4 py-2 bg-indigo-600 text-white disabled:opacity-30">Tải TXT</button><button disabled={!hasCurrent && !selected.length} onClick={onPdf} className="rounded px-4 py-2 bg-slate-100 disabled:opacity-30">In / PDF</button></div>
  </Dialog>;
}
