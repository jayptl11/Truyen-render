import { Maximize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { SpeechControls } from './SpeechControls';
import type { TtsReader } from './useTtsReader';
import { readJson } from '../../services/storage/local';
import { setWakeLock } from './usePlaybackIntegration';
export function CompactPlayer({ speech, title, onOpen, onExpand, floating = false }: { speech: TtsReader; title: string; onOpen: () => void; onExpand: () => void; floating?: boolean }) {
  return <section className={`compact-player ${floating ? 'compact-floating' : ''}`} aria-label="Đang nghe"><button className="compact-title" onClick={onOpen}><small>{speech.loading ? speech.loadingMessage : speech.status === 'paused' ? 'Đã tạm dừng' : 'Đang nghe'}</small><strong>{title}</strong></button><button aria-label={speech.status === 'playing' ? 'Tạm dừng phiên nghe' : 'Tiếp tục phiên nghe'} className="icon-button" onClick={speech.toggle}>{speech.status === 'playing' ? <Pause size={19}/> : <Play size={19}/>}</button><button aria-label="Mở trình nghe" className="icon-button" onClick={onExpand}><Maximize2 size={17}/></button></section>;
}
export function ExpandedPlayer({ speech, title, count, autoNext, onAutoNext, onClose, previous, next, onSettings }: { speech: TtsReader; title: string; count: number; autoNext: boolean; onAutoNext: () => void; onClose: () => void; previous?: () => void; next?: () => void; onSettings: () => void }) {
  const [wake, setWake] = useState(() => readJson('reader_wake_lock', false));
  return <Dialog title="Trình nghe" onClose={onClose}><div className="listening-title"><span className="eyebrow">{speech.provider} · {speech.rate}×</span><h3>{title}</h3><p className="field-hint">Đoạn {speech.paragraph + 1} / {count}{speech.bufferedSeconds > 0 ? ` · khoảng ${Math.round(speech.bufferedSeconds)} giây đã chuẩn bị` : ''}</p></div>
    {speech.duration > 0 && <label className="audio-seek">Vị trí trong phần đang đọc<input type="range" aria-label="Tua âm thanh" min={0} max={speech.duration} step={0.1} value={Math.min(speech.seconds, speech.duration)} onChange={event => speech.seekSeconds(Number(event.target.value))}/><small>{Math.floor(speech.seconds)} / {Math.round(speech.duration)} giây</small></label>}
    <div className="chapter-transport"><button className="button-secondary" disabled={!previous} onClick={previous}><SkipBack size={16}/>Chương trước</button><button className="button-secondary" disabled={!next} onClick={next}>Chương sau<SkipForward size={16}/></button></div>
    <SpeechControls speech={speech} count={count} autoNext={autoNext} onAutoNext={onAutoNext}/>
    <label className="download-audio"><input type="checkbox" checked={wake} onChange={event => { setWake(event.target.checked); setWakeLock(event.target.checked); }}/>Giữ màn hình sáng khi nghe</label><button className="text-button" onClick={onSettings}>Hẹn giờ ngủ và giới hạn chương</button>
  </Dialog>;
}
