import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { TranslationStyle } from '../../types/story';
import type { useBatchTranslation } from './useBatchTranslation';
type Batch = ReturnType<typeof useBatchTranslation>;
export function BatchDialog({ batch, initialUrl, hasKeys, onConfigure, onClose }: {
  batch: Batch; initialUrl: string; hasKeys: boolean; onConfigure: () => void; onClose: () => void;
}) {
  const [url, setUrl] = useState(batch.state?.startUrl || initialUrl);
  const [count, setCount] = useState(batch.state?.count || 10);
  const [style, setStyle] = useState<TranslationStyle>(batch.state?.style || 'ancient');
  return <Dialog title="Dịch hàng loạt" onClose={onClose}>
    <p className="text-sm text-slate-500">Dịch và lưu chương vào thư viện. Tiến độ được giữ lại khi tạm dừng hoặc gặp lỗi.</p>
    {!hasKeys && <button onClick={onConfigure} className="text-indigo-600 underline text-sm">Cấu hình API key để dịch</button>}
    <label className="block text-sm">Liên kết chương đầu<input aria-label="Liên kết chương đầu" disabled={batch.running} value={url} onChange={e => setUrl(e.target.value)} className="w-full border rounded p-2 mt-1"/></label>
    <div className="flex gap-3">
      <label className="text-sm flex-1 min-w-0">Số chương<input type="number" min={1} max={500} disabled={batch.running} value={count} onChange={e => setCount(Number(e.target.value))} className="w-full border rounded p-2 mt-1"/></label>
      <label className="text-sm flex-1 min-w-0">Phong cách<select disabled={batch.running} value={style} onChange={e => setStyle(e.target.value as TranslationStyle)} className="w-full border rounded p-2 mt-1"><option value="ancient">Cổ trang</option><option value="modern">Hiện đại</option></select></label>
    </div>
    <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={batch.autoResume} onChange={e => batch.setAutoResume(e.target.checked)}/> Tiếp tục tác vụ đang dở khi mở lại ứng dụng</label>
    <div className="flex flex-wrap gap-2">
      {batch.running ? <button onClick={batch.stop} className="bg-amber-100 text-amber-800 rounded px-4 py-2">Tạm dừng</button> : <>
        <button disabled={!hasKeys} onClick={() => { void batch.start(url, count, style); }} className="bg-indigo-600 text-white rounded px-4 py-2 disabled:opacity-30">Bắt đầu dịch</button>
        {batch.state && <><button disabled={!hasKeys} onClick={() => { void batch.resume(); }} className="bg-slate-100 rounded px-4 py-2">Tiếp tục {batch.state.translated}/{batch.state.count}</button><button onClick={batch.clear} className="text-red-600 text-xs">Bỏ tác vụ</button></>}
      </>}
    </div>
    {!!batch.progress.total && <div role="status" className="space-y-2">
      <p className="text-sm">Đã xử lý {batch.progress.current}/{batch.progress.total} chương</p>
      <progress max={batch.progress.total} value={batch.progress.current} className="w-full"/>
      <p className="text-xs text-slate-500 break-all">{batch.progress.currentUrl}</p>
      {batch.progress.error && <p role="alert" className="text-sm text-red-600">{batch.progress.error}</p>}
    </div>}
  </Dialog>;
}
