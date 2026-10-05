import { Dialog } from '../../components/Dialog';
import type { BookmarkEntry } from '../../types/story';
export function BookmarkDialog({ bookmarks, onLoad, onRemove, onClear, onClose }: {
  bookmarks: BookmarkEntry[]; onLoad: (bookmark: BookmarkEntry) => void;
  onRemove: (id: string) => void; onClear: () => void; onClose: () => void;
}) {
  return <Dialog title="Đánh dấu" onClose={onClose}>
    {!bookmarks.length && <p className="text-sm text-slate-500">Đánh dấu một chương để quay lại đoạn đang đọc.</p>}
    {bookmarks.map(bookmark => <div key={bookmark.url} className="flex gap-2 border rounded-lg p-3">
      <button onClick={() => onLoad(bookmark)} className="flex-1 text-left text-sm"><p>{bookmark.title}</p><p className="text-xs text-slate-500">Đoạn {(bookmark.chunkIndex || 0) + 1}</p></button>
      <button aria-label={`Bỏ đánh dấu ${bookmark.title}`} onClick={() => onRemove(bookmark.url)} className="text-xs text-red-600">Bỏ</button>
    </div>)}
    {!!bookmarks.length && <button onClick={onClear} className="text-xs text-red-600">Xóa tất cả đánh dấu</button>}
  </Dialog>;
}
