import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, Download, Headphones, Link, RefreshCw, Trash2 } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import type { Book, Chapter } from '../../types/story';
import { bookIdentity, fetchBook, mergeCatalog, searchSource, SOURCES, type SourceSearchResult } from '../../services/storySources/books';
import { fetchRawStoryData } from '../../services/storySources/client';
import { createChapter } from '../../services/storage/chapters';
import { audioStorageInfo, clearAudioCache } from '../../services/storage/audioCache';
import { errorMessage } from '../../services/errors';
interface Props {
  initialTab?: 'books' | 'sources';
  chapters: Chapter[]; books: Book[]; selected: string[];
  onToggle: (id: string) => void; onSelectAll: () => void; onDelete: () => void; onClear: () => void;
  onOpen: (id: string) => void; onClose: () => void;
  onBook: (book: Book) => void; onRemoveBook: (book: Book) => void; onChapter: (chapter: Chapter) => void;
  onDownloadAudio: (chapter: Chapter, signal: AbortSignal) => Promise<void>; canDownloadAudio: boolean;
  activeChapter: string; player?: React.ReactNode;
}
export function LibraryDialog(props: Props) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'books' | 'chapters' | 'sources'>(props.initialTab || 'books');
  const [bookId, setBookId] = useState('');
  const [catalogPage, setCatalogPage] = useState(0);
  const book = props.books.find(item => item.id === bookId);
  const catalog = useMemo(() => (book?.chapters || []).filter(item => item.title.toLowerCase().includes(query.toLowerCase())), [book, query]);
  const page = Math.min(catalogPage, Math.max(0, Math.ceil(catalog.length / 100) - 1));
  const [link, setLink] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [results, setResults] = useState<SourceSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [task, setTask] = useState('');
  const [range, setRange] = useState({ from: 1, to: 20 });
  const [includeAudio, setIncludeAudio] = useState(false);
  const [audioInfo, setAudioInfo] = useState({ count: 0, bytes: 0, pinned: 0 });
  const controller = useRef<AbortController | null>(null);
  const current = useRef(props); useEffect(() => { current.current = props; });
  useEffect(() => { void audioStorageInfo().then(setAudioInfo).catch(() => {}); return () => { controller.current?.abort(); }; }, []);
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setError('');
    try { await action(request.signal); }
    catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)); }
    finally { if (controller.current === request) { setTask(''); void audioStorageInfo().then(setAudioInfo).catch(() => {}); } }
  };
  const importBook = (url = link) => { void run(async signal => { setTask('Đang lấy thông tin và mục lục…'); const incoming = await fetchBook(url, signal); signal.throwIfAborted(); const existing = current.current.books.find(item => bookIdentity(item.id) === bookIdentity(incoming.id)); const saved = existing ? mergeCatalog(existing, incoming) : incoming; props.onBook(saved); setBookId(saved.id); setCatalogPage(0); setQuery(''); setTab('books'); }); };
  const updateCatalog = (all: boolean, refresh = false) => {
    if (!book) return;
    void run(async signal => {
      let merged = book; let url: string | null = refresh ? book.catalogUrl || book.id : book.catalogNext;
      const visited = new Set<string>();
      while (url) {
        if (visited.has(url)) throw new Error('Nguồn lặp lại trang mục lục. Mục lục đã tải vẫn được giữ.');
        visited.add(url); setTask(`Đang tải mục lục · ${merged.chapters.length} chương`);
        const incoming = await fetchBook(url, signal); signal.throwIfAborted();
        merged = mergeCatalog(merged, incoming); props.onBook(merged); url = all ? merged.catalogNext : null;
      }
    });
  };
  const download = () => {
    if (!book) return;
    void run(async signal => {
      if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 1 || range.to < range.from) throw new Error('Chọn khoảng chương hợp lệ.');
      const references = book.chapters.filter(item => item.index >= range.from && item.index <= range.to);
      if (!references.length) throw new Error('Khoảng này chưa có trong mục lục. Tải thêm mục lục trước.');
      for (let index = 0; index < references.length; index++) {
        signal.throwIfAborted(); const reference = references[index];
        setTask(`Đang tải ${index + 1}/${references.length} · ${reference.title}`);
        let chapter = current.current.chapters.find(item => item.url === reference.url);
        if (!chapter) { const data = await fetchRawStoryData(reference.url, signal); signal.throwIfAborted(); chapter = createChapter(reference.url, data); props.onChapter(chapter); }
        if (includeAudio) await props.onDownloadAudio(chapter, signal);
      }
    });
  };
  const chapters = props.chapters.filter(c => `${c.title} ${c.webName}`.toLowerCase().includes(query.toLowerCase()));
  const books = props.books.filter(item => `${item.title} ${item.author} ${item.source}`.toLowerCase().includes(query.toLowerCase()));
  const stored = new Set(props.chapters.map(item => item.url));
  const activeBook = props.books.find(item => item.chapters.some(chapter => chapter.url === props.activeChapter));
  return <Dialog title="Thư viện" onClose={props.onClose} wide>
    <div className="library-tabs" role="tablist" aria-label="Trang thư viện">{([['books', 'Truyện'], ['chapters', 'Chương đã lưu'], ['sources', 'Nguồn truyện']] as const).map(([value, label]) => <button role="tab" aria-selected={tab === value} key={value} onClick={() => { setTab(value); setBookId(''); }}>{label}</button>)}</div>
    {task && <div className="library-task" role="status"><span>{task}</span><button className="text-button" onClick={() => controller.current?.abort()}>Tạm ngừng tải</button></div>}
    {error && <p role="alert" className="inline-message">{error}</p>}
    {tab === 'sources' ? <section className="source-catalog">
      <h3>Tìm trên Webnovel.vn</h3><form className="book-import" onSubmit={event => { event.preventDefault(); void run(async signal => { setTask('Đang tìm truyện…'); const found = await searchSource(sourceQuery, signal); signal.throwIfAborted(); setResults(found); setSearched(true); }); }}><input aria-label="Tên truyện trên nguồn" required value={sourceQuery} onChange={event => setSourceQuery(event.target.value)} placeholder="Tên truyện hoặc tác giả"/><button className="button-secondary" disabled={!!task}>Tìm truyện trên nguồn</button></form>
      {searched && !results.length && <p className="field-hint">Không tìm thấy truyện. Thử tên khác hoặc dán liên kết bên dưới.</p>}
      <ul className="source-search-results">{results.map(result => <li key={result.url}><button disabled={!!task} onClick={() => importBook(result.url)}><strong>{result.title}</strong><span>Thêm vào thư viện →</span></button></li>)}</ul>
      <h3>Thêm bằng liên kết từ nhiều website</h3><p className="field-hint">Dán liên kết trang truyện để lấy tên, bìa và mục lục trong HTML. Nếu chỉ có liên kết chương, dùng Thêm chương ở thanh điều hướng.</p>
      <form onSubmit={event => { event.preventDefault(); importBook(); }} className="book-import"><input aria-label="Liên kết trang truyện" type="url" required placeholder="https://webnovel.vn/tien-nghich/" value={link} onChange={event => setLink(event.target.value)}/><button className="button-primary" disabled={!!task}><Link size={16}/>Thêm truyện vào thư viện</button></form>
      {SOURCES.map(source => <article className="source-card" key={source.id}><strong>{source.name}</strong><p className="field-hint">{source.description}</p><a href={source.origin} target="_blank" rel="noreferrer">Mở nguồn để tìm truyện ↗</a></article>)}
      <p className="field-hint">Website khác vẫn dùng bộ nhận diện nội dung chung, không giới hạn ở danh sách này. Trang cần đăng nhập, xác minh hoặc tải truyện bằng JavaScript có thể cần tích hợp riêng.</p>
    </section> : tab === 'books' ? book ? <section className="book-detail">
      <button className="text-button" onClick={() => setBookId('')}><ChevronLeft size={16}/>Tất cả truyện</button>
      <div className="book-heading"><BookCover book={book}/><div><span className="eyebrow">{book.source}</span><h3>{book.title}</h3><p>{book.author}</p><p className="field-hint">{book.chapters.length} chương trong mục lục · {book.chapters.filter(item => stored.has(item.url)).length} đã tải{book.catalogNext ? ' · còn trang tiếp' : ''}</p></div></div>
      {book.description && <details className="book-description"><summary>Giới thiệu</summary><p>{book.description}</p></details>}
      <div className="catalog-actions"><button className="button-secondary" disabled={!!task} onClick={() => updateCatalog(false, true)}><RefreshCw size={15}/>Cập nhật</button>{book.catalogNext && <><button className="button-secondary" disabled={!!task} onClick={() => updateCatalog(false)}>Tải trang mục lục tiếp</button><button className="text-button" disabled={!!task} onClick={() => updateCatalog(true)}>Tải hết mục lục</button></>}<button aria-label="Xóa truyện khỏi thư viện" className="icon-button" onClick={() => { if (window.confirm('Xóa truyện và các chương đã tải trên thiết bị?')) { props.onRemoveBook(book); setBookId(''); } }}><Trash2 size={16}/></button></div>
      <details className="download-panel"><summary><Download size={16}/>Tải để đọc / nghe offline</summary><div className="download-range"><label>Từ chương<input type="number" aria-label="Tải từ chương" min={1} value={range.from} onChange={event => setRange({ ...range, from: Number(event.target.value) })}/></label><label>Đến chương<input type="number" aria-label="Tải đến chương" min={range.from} value={range.to} onChange={event => setRange({ ...range, to: Number(event.target.value) })}/></label></div><label className="download-audio"><input type="checkbox" checked={includeAudio} disabled={!props.canDownloadAudio} onChange={event => setIncludeAudio(event.target.checked)}/>Kèm âm thanh theo giọng đang chọn</label><p className="field-hint">Tải lại sẽ dùng các chương và âm thanh đã lưu. Nghe offline cần đúng nguồn, giọng và bản gốc đã tải. Âm thanh được ghim, tối đa 80 MB; giọng trình duyệt không hỗ trợ tải âm thanh riêng.</p><button className="button-primary" disabled={!!task || (includeAudio && !props.canDownloadAudio)} onClick={download}><Download size={16}/>Tải khoảng chương</button></details>
      <input aria-label="Tìm chương trong mục lục" placeholder="Tìm chương…" value={query} onChange={event => setQuery(event.target.value)}/>
      {catalog.length > 100 && <div className="catalog-actions"><span>{page * 100 + 1}–{Math.min((page + 1) * 100, catalog.length)} / {catalog.length} chương</span><button className="button-secondary" disabled={page === 0} onClick={() => setCatalogPage(page - 1)}>100 chương trước</button><button className="button-secondary" disabled={(page + 1) * 100 >= catalog.length} onClick={() => setCatalogPage(page + 1)}>100 chương tiếp</button></div>}
      <ol className="chapter-catalog">{catalog.slice(page * 100, (page + 1) * 100).map(reference => <li key={reference.url}><button aria-current={reference.url === props.activeChapter ? 'true' : undefined} onClick={() => props.onOpen(reference.url)}><span>{reference.title}</span><small>{stored.has(reference.url) ? 'Đã tải' : 'Trực tuyến'}</small></button></li>)}</ol>
    </section> : <section>
      <div className="section-row"><div><span className="eyebrow">Trên thiết bị này</span><h3>Tủ truyện của bạn</h3></div><button className="button-secondary" onClick={() => setTab('sources')}>+ Thêm truyện</button></div>
      {activeBook && <button className="continue-book" onClick={() => props.onOpen(props.activeChapter)}><Headphones size={20}/><span><strong>Tiếp tục đọc / nghe</strong><small>{activeBook.title}</small></span></button>}
      <input aria-label="Tìm truyện trong thư viện" placeholder="Tên truyện, tác giả hoặc nguồn…" value={query} onChange={event => setQuery(event.target.value)}/>
      {!books.length && <p className="library-empty">Thêm một truyện từ nguồn hoặc mở chương để bắt đầu. Bản gốc luôn có thể đọc và nghe ngay.</p>}
      <div className="book-grid">{books.map(item => <button className="book-card" key={item.id} onClick={() => { setBookId(item.id); setCatalogPage(0); setQuery(''); }}><BookCover book={item}/><strong>{item.title}</strong><span>{item.author || item.source}</span><small>{item.chapters.filter(reference => stored.has(reference.url)).length} chương đã tải</small></button>)}</div>
    </section> : <section>
      <input aria-label="Tìm trong thư viện" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm tên chương hoặc nguồn truyện"/>
      <div className="catalog-actions"><span>{props.chapters.length} chương · {props.selected.length} đã chọn</span><button onClick={props.onSelectAll} className="text-button">Chọn tất cả</button><button disabled={!props.selected.length} onClick={props.onDelete} className="text-button">Xóa chương đã chọn</button><button disabled={!props.chapters.length} onClick={props.onClear} className="text-button">Xóa thư viện</button></div>
      {!chapters.length && <p className="field-hint">{query ? 'Không tìm thấy chương.' : 'Thư viện chưa có chương đã tải.'}</p>}
      <ul className="saved-chapters">{chapters.map(chapter => <li key={chapter.url}><input type="checkbox" aria-label={`Chọn ${chapter.title}`} checked={props.selected.includes(chapter.url)} onChange={() => props.onToggle(chapter.url)}/><button onClick={() => props.onOpen(chapter.url)}><strong>{chapter.title}</strong><small>{chapter.webName} · {chapter.translatedContent ? 'Có bản dịch' : 'Bản gốc'}</small></button></li>)}</ul>
    </section>}
    <details className="offline-storage"><summary>Bộ nhớ âm thanh · {(audioInfo.bytes / 1048576).toFixed(1)} MB</summary><p className="field-hint">{audioInfo.count} phần âm thanh · {audioInfo.pinned} đã ghim. Các phần chưa ghim tự dọn khi đạt 80 MB.</p><button className="text-button" disabled={!!task || !audioInfo.count} onClick={() => { if (window.confirm('Xóa âm thanh đã tải? Các chương và bản dịch vẫn được giữ.')) void run(async () => { await clearAudioCache(); }); }}>Xóa bộ nhớ âm thanh</button></details>
    {props.player}
  </Dialog>;
}
function BookCover({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false);
  return book.cover && !failed ? <img className="book-cover" src={book.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span className="book-cover book-cover-placeholder"><BookOpen size={30} strokeWidth={1}/><span>{book.title}</span></span>;
}
