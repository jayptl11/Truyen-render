import { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { AiProvider } from '../../types/story';
const PROVIDER_NAMES: Record<AiProvider, string> = { gemini: 'Gemini', groq: 'Groq', qwen: 'Qwen', deepseek: 'DeepSeek', chatgpt: 'ChatGPT' };
interface Props {
  keys: Record<AiProvider, string[]>;
  priority: AiProvider[];
  onKey: (provider: AiProvider, index: number, value: string) => void;
  onMove: (provider: AiProvider, direction: -1 | 1) => void;
  onReset: () => void;
  onClose: () => void;
}
export function ApiKeySettings({ keys, priority, onKey, onMove, onReset, onClose }: Props) {
  const [provider, setProvider] = useState<AiProvider>(priority.find(p => keys[p].some(Boolean)) || 'gemini');
  const [advanced, setAdvanced] = useState(false);
  return <section aria-label="Cài đặt AI" className="ai-settings space-y-3">
    <div className="flex justify-between items-center"><h2 className="font-semibold text-sm">AI dùng để dịch (tùy chọn)</h2><button aria-label="Đóng cài đặt AI" onClick={onClose}><X size={18}/></button></div>
    <p className="text-xs text-slate-600">Đọc và nghe bản gốc không cần API key. Khóa được lưu trên thiết bị này; chi phí tùy nhà cung cấp.</p>
    <label className="block text-xs">Nhà cung cấp
      <select className="block w-full p-2 mt-1 border rounded" value={provider} onChange={e => setProvider(e.target.value as AiProvider)}>
        {priority.map(p => <option key={p} value={p}>{PROVIDER_NAMES[p]}{keys[p].some(Boolean) ? ' · Đã cấu hình' : ''}</option>)}
      </select>
    </label>
    <label className="block text-xs">API key
      <input aria-label={`${PROVIDER_NAMES[provider]} API key`} type="password" autoComplete="off" value={keys[provider][0] || ''} onChange={e => onKey(provider, 0, e.target.value)} className="block w-full mt-1 p-2 rounded border" placeholder="Nhập khóa của bạn"/>
    </label>
    <button onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="text-xs underline">{advanced ? 'Ẩn' : 'Mở'} cấu hình nâng cao</button>
    {advanced && <div className="space-y-3">
      {[1, 2].map(index => <input key={index} aria-label={`${PROVIDER_NAMES[provider]} khóa dự phòng ${index}`} type="password" autoComplete="off" value={keys[provider][index] || ''} onChange={e => onKey(provider, index, e.target.value)} className="w-full p-2 text-xs rounded border" placeholder={`Khóa dự phòng ${index}`}/>)}
      <div className="flex justify-between text-xs"><span>Thứ tự thử khi dịch</span><button onClick={onReset} className="underline">Đặt lại</button></div>
      {priority.map((p, index) => <div key={p} className="flex items-center gap-2 text-xs">
        <span className="flex-1">{index + 1}. {PROVIDER_NAMES[p]} · {keys[p].some(Boolean) ? 'Có khóa' : 'Chưa có khóa'}</span>
        <button aria-label={`Tăng ưu tiên ${PROVIDER_NAMES[p]}`} disabled={!index} onClick={() => onMove(p, -1)} className="disabled:opacity-20"><ChevronUp size={18}/></button>
        <button aria-label={`Giảm ưu tiên ${PROVIDER_NAMES[p]}`} disabled={index === priority.length - 1} onClick={() => onMove(p, 1)} className="disabled:opacity-20"><ChevronDown size={18}/></button>
      </div>)}
    </div>}
  </section>;
}
