import { Bookmark, Download, Maximize2, MoreHorizontal, Palette, Search, Settings2 } from 'lucide-react';
interface Props {
  title: string; hasContent: boolean; bookmarked: boolean; status: string;
  onBookmark: () => void; onBookmarks: () => void; onSearch: () => void; onExport: () => void;
  onFocus: () => void; onAppearance: () => void; onSettings: () => void;
}
export function ReaderToolbar(props: Props) {
  return <header className="reader-toolbar">
    <div className="reader-heading"><span className="eyebrow">{props.status || 'Trang đọc'}</span><h2 title={props.title}>{props.title || 'Chưa có chương đang đọc'}</h2></div>
    <div className="reader-tools">
      <button className="icon-button" title="Giao diện" aria-label="Giao diện" onClick={props.onAppearance}><Palette size={19}/></button>
      <details className="reader-menu"><summary className="icon-button" aria-label="Công cụ đọc" title="Công cụ đọc"><MoreHorizontal size={21}/></summary>
        <div className="reader-menu-panel" onClick={event => { event.currentTarget.parentElement?.removeAttribute('open'); }}>
          <button disabled={!props.hasContent} title={props.bookmarked ? 'Bỏ đánh dấu' : 'Đánh dấu'} onClick={props.onBookmark}><Bookmark size={17} fill={props.bookmarked ? 'currentColor' : 'none'}/>{props.bookmarked ? 'Bỏ đánh dấu' : 'Đánh dấu chương'}</button>
          <button onClick={props.onBookmarks}><Bookmark size={17}/>Các chương đánh dấu</button>
          <button disabled={!props.hasContent} onClick={props.onSearch}><Search size={17}/>Tìm trong chương</button>
          <button disabled={!props.hasContent} onClick={props.onExport}><Download size={17}/>Xuất nội dung</button>
          <button disabled={!props.hasContent} onClick={props.onFocus}><Maximize2 size={17}/>Đọc tập trung</button>
          <button onClick={props.onSettings}><Settings2 size={17}/>Cài đặt đọc và nghe</button>
        </div>
      </details>
    </div>
  </header>;
}
