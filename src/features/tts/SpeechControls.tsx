import { ChevronLeft, ChevronRight, Pause, Play, Settings2, Square } from 'lucide-react';
import type { SpeechReader } from './useSpeechReader';
export function SpeechControls({ speech, count, autoNext, onAutoNext }: {
  speech: SpeechReader; count: number; autoNext: boolean; onAutoNext: () => void;
}) {
  const vietnamese = speech.voices.filter(voice => /^vi(?:-|$)/i.test(voice.lang));
  return <section aria-label="Điều khiển giọng đọc" className="speech-player">
    {!speech.supported ? <p role="status" className="field-hint">Trình duyệt này chưa hỗ trợ TTS. Bạn vẫn có thể đọc nội dung.</p> : <>
      <div className="speech-main">
        <button className="icon-button" aria-label="Đoạn trước" disabled={!count || speech.paragraph === 0} onClick={() => speech.selectParagraph(speech.paragraph - 1)}><ChevronLeft size={20}/></button>
        <button disabled={!count} onClick={speech.toggle} className="button-primary speech-play">{speech.status === 'playing' ? <Pause size={17}/> : <Play size={17}/>}<span>{speech.status === 'playing' ? 'Tạm dừng' : speech.status === 'paused' ? 'Tiếp tục nghe' : 'Nghe truyện'}</span></button>
        <button className="icon-button" aria-label="Dừng đọc" disabled={speech.status === 'idle'} onClick={speech.stop}><Square size={16}/></button>
        <button className="icon-button" aria-label="Đoạn sau" disabled={!count || speech.paragraph >= count - 1} onClick={() => speech.selectParagraph(speech.paragraph + 1)}><ChevronRight size={20}/></button>
        <details className="speech-options"><summary className="icon-button" aria-label="Tùy chọn giọng đọc" title="Giọng và tốc độ"><Settings2 size={18}/></summary>
          <div className="speech-options-panel">
            <h3>Giọng đọc</h3>
            <label className="field-label">Giọng<select aria-label="Giọng đọc" value={speech.voiceURI} onChange={event => speech.setVoice(event.target.value)}><option value="">Tiếng Việt mặc định</option>{[...vietnamese, ...speech.voices.filter(voice => !vietnamese.includes(voice))].map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select></label>
            <label className="field-label">Tốc độ<select aria-label="Tốc độ đọc" value={speech.rate} onChange={event => speech.setRate(Number(event.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
            {!vietnamese.length && !speech.voiceURI && <p className="field-hint">Giọng tiếng Việt phụ thuộc thiết bị. Chọn một giọng có sẵn nếu giọng mặc định không phát được.</p>}
          </div>
        </details>
      </div>
      <div className="speech-meta"><span>{count ? speech.paragraph + 1 : 0}<span className="muted"> / {count} đoạn</span><span className="rate-label"> · {speech.rate}×</span></span><label><input type="checkbox" checked={autoNext} onChange={onAutoNext}/>Hết chương, nghe tiếp</label></div>
      {!!count && <div className="speech-progress" role="progressbar" aria-label="Vị trí nghe" aria-valuemin={0} aria-valuemax={count} aria-valuenow={speech.paragraph + 1}><span style={{ width: `${((speech.paragraph + 1) / count) * 100}%` }}/></div>}
    </>}
    {speech.error && <p role="alert" className="inline-message">{speech.error}</p>}
  </section>;
}
