import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { Chapter } from '../../types/story';
interface Props {
  chapters: Chapter[]; selected: string[];
  onToggle: (id: string) => void; onSelectAll: () => void;
  onDelete: () => void; onClear: () => void;
  onOpen: (id: string) => void; onClose: () => void;
}
export function LibraryDialog(props: Props) {
  const [query, setQuery] = useState('');
  const chapters = props.chapters.filter(c => `${c.title} ${c.webName}`.toLowerCase().includes(query.toLowerCase()));
  return <Dialog title="Thư viện chương" onClose={props.onClose} wide>
    <input aria-label="Tìm trong thư viện" value={query} onChange={e => setQuery(e.target.value)} className="w-full border rounded-lg p-2" placeholder="Tìm tên chương hoặc nguồn truyện"/>
    <div className="flex flex-wrap gap-3 text-xs">
      <span>{props.chapters.length} chương · {props.selected.length} đã chọn</span>
      <button onClick={props.onSelectAll} className="underline">Chọn tất cả</button>
      <button disabled={!props.selected.length} onClick={props.onDelete} className="text-red-600 disabled:opacity-30">Xóa chương đã chọn</button>
      <button disabled={!props.chapters.length} onClick={props.onClear} className="text-red-600 disabled:opacity-30">Xóa thư viện</button>
    </div>
    {!chapters.length && <p className="text-sm text-slate-500">{query ? 'Không tìm thấy chương.' : 'Lấy nội dung hoặc dán văn bản để lưu chương đầu tiên. Không cần dịch.'}</p>}
    <ul className="space-y-2">{chapters.map(chapter => <li key={chapter.url} className="flex items-center gap-3 rounded-lg border p-3">
      <input type="checkbox" aria-label={`Chọn ${chapter.title}`} checked={props.selected.includes(chapter.url)} onChange={() => props.onToggle(chapter.url)}/>
      <button onClick={() => props.onOpen(chapter.url)} className="text-left min-w-0 flex-1">
        <p className="font-medium text-sm truncate">{chapter.title}</p>
        <p className="text-xs text-slate-500 mt-1 break-all">{chapter.webName} · {chapter.translatedContent ? 'Có bản dịch' : 'Bản gốc'}</p>
        <p className="text-xs text-slate-400">{new Date(chapter.timestamp).toLocaleString('vi-VN')}</p>
      </button>
    </li>)}</ul>
  </Dialog>;
}
