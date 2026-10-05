import { Dialog } from '../../components/Dialog';
import type { DiagnosticLog } from './useDiagnostics';
export function DiagnosticsDialog({ logs, onClear, onClose }: { logs: DiagnosticLog[]; onClear: () => void; onClose: () => void }) {
  return <Dialog title="Nhật ký lỗi" onClose={onClose} wide>
    <div className="section-row"><span className="field-hint">{logs.length} bản ghi gần nhất</span><button className="text-button" onClick={onClear}>Xóa nhật ký</button></div>
    {!logs.length && <p className="field-hint">Chưa có bản ghi.</p>}
    <ul className="diagnostic-list">{logs.map((log, index) => <li key={index} data-level={log.type}><span>{log.timestamp} · {log.type}</span><pre>{log.message}</pre></li>)}</ul>
  </Dialog>;
}
