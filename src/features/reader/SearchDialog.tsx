import { Dialog } from '../../components/Dialog';
export function SearchDialog({ query, onQuery, onSearch, results, paragraphs, onResult, onClose }: {
  query: string; onQuery: (query: string) => void; onSearch: () => void;
  results: number[]; paragraphs: string[]; onResult: (index: number) => void; onClose: () => void;
}) {
  return <Dialog title="Tìm trong chương" onClose={onClose}>
    <div className="search-form"><input aria-label="Từ khóa tìm kiếm" value={query} onChange={event => onQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onSearch(); }} placeholder="Nhập từ khóa…"/><button className="button-primary" onClick={onSearch}>Tìm</button></div>
    <p className="field-hint">{results.length ? `${results.length} đoạn có từ khóa` : query ? 'Chưa có kết quả. Nhấn Tìm để tìm trong chương.' : 'Tìm tên nhân vật hoặc một đoạn bạn muốn đọc lại.'}</p>
    <ul className="search-results">{results.map(index => <li key={index}><button onClick={() => onResult(index)}><span className="eyebrow">Đoạn {index + 1}</span><p>{paragraphs[index]}</p></button></li>)}</ul>
  </Dialog>;
}
