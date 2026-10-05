import { Dialog } from '../../components/Dialog';
import type { ReadingStats } from './useReadingStats';
export function StatsDialog({ stats, onClear, onClose }: { stats: ReadingStats; onClear: () => void; onClose: () => void }) {
  const recent = Object.entries(stats.dailyReads).slice(-7).reverse();
  return <Dialog title="Thời gian với truyện" onClose={onClose}>
    <div className="reading-metrics"><div><strong>{stats.totalChapters}</strong><span>Chương đã nghe hết</span></div><div><strong>{Math.floor(stats.totalTime / 60)}</strong><span>Phút đọc và nghe</span></div></div>
    <h3 className="field-label">Hoạt động gần đây</h3>
    {recent.length ? <ul className="reading-activity">{recent.map(([date, count]) => <li key={date}><span>{new Date(date).toLocaleDateString('vi-VN')}</span><div><span style={{ width: `${Math.min(100, count * 20)}%` }}/></div><strong>{count}</strong></li>)}</ul> : <p className="field-hint">Chưa có dữ liệu. Mở một chương để bắt đầu.</p>}
    <button className="text-button" onClick={onClear}>Xóa thống kê trên thiết bị</button>
  </Dialog>;
}
