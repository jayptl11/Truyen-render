import { ChevronLeft, ChevronRight, Pause, Play, Settings2, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { TtsReader } from './useTtsReader';
import type { GenderFilter, TtsProvider } from '../../types/tts';
function languageName(language: string) {
  try { return new Intl.DisplayNames(['vi'], { type: 'language' }).of(language) || language; }
  catch { return language; }
}
export function SpeechControls({ speech, count, autoNext, onAutoNext, onExpand }: {
  speech: TtsReader; count: number; autoNext: boolean; onAutoNext: () => void; onExpand?: () => void;
}) {
  const optionsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const measure = () => {
      const details = optionsRef.current;
      if (details) {
        const clip = details.closest('.reader-panel, .dialog-body');
        const top = Math.max(0, clip?.getBoundingClientRect().top || 0);
        details.style.setProperty('--speech-options-height', `${Math.max(48, details.getBoundingClientRect().top - top - 20)}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const details = optionsRef.current;
    details?.addEventListener('toggle', measure);
    window.visualViewport?.addEventListener('resize', measure);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    const player = optionsRef.current?.closest('.speech-player');
    const shell = optionsRef.current?.closest('.app-shell');
    if (player) observer?.observe(player);
    if (shell) observer?.observe(shell);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); details?.removeEventListener('toggle', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);
  return <section aria-label="Điều khiển giọng đọc" className="speech-player">
    {!speech.supported && <p role="status" className="field-hint">Trình duyệt này chưa hỗ trợ TTS. Bạn vẫn có thể đọc nội dung hoặc chọn Edge.</p>}
    <>
      <div className="speech-main">
        <button className="icon-button" aria-label="Đoạn trước" disabled={!count || speech.paragraph === 0} onClick={() => speech.selectParagraph(speech.paragraph - 1)}><ChevronLeft size={20}/></button>
        <button disabled={!count || !speech.canPlay} onClick={speech.toggle} className="button-primary speech-play">{speech.status === 'playing' ? <Pause size={17}/> : <Play size={17}/>}<span>{speech.status === 'playing' ? 'Tạm dừng' : speech.status === 'paused' ? 'Tiếp tục nghe' : 'Nghe truyện'}</span></button>
        <button className="icon-button" aria-label="Dừng đọc" disabled={speech.status === 'idle'} onClick={speech.stop}><Square size={16}/></button>
        <button className="icon-button" aria-label="Đoạn sau" disabled={!count || speech.paragraph >= count - 1} onClick={() => speech.selectParagraph(speech.paragraph + 1)}><ChevronRight size={20}/></button>
        <details ref={optionsRef} className="speech-options"><summary className="icon-button" aria-label="Tùy chọn giọng đọc" title="Giọng và tốc độ"><Settings2 size={18}/></summary>
          <div className="speech-options-panel">
            <div className="section-row"><h3>Giọng đọc</h3>{onExpand && <button className="text-button" onClick={onExpand}>Mở trình nghe</button>}</div>
            <label className="field-label">Nguồn TTS<select aria-label="Nguồn TTS" value={speech.provider} onChange={event => speech.setProvider(event.target.value as TtsProvider)}><option value="device">Giọng trên thiết bị</option><option value="edge">Microsoft Edge · trực tuyến</option><option value="vieneu">VieNeu v3 Turbo · máy chủ riêng</option><option value="piper">Piper · neural trên thiết bị</option><option value="espeak">eSpeak NG · trên thiết bị</option><option value="google" disabled={!speech.googleAvailable}>Google · trên thiết bị{!speech.googleAvailable ? ' (chưa có)' : ''}</option></select></label>
            <label className="field-label">Ngôn ngữ<select aria-label="Ngôn ngữ đọc" disabled={speech.catalogLoading || !speech.languages.length} value={speech.language} onChange={event => speech.setLanguage(event.target.value)}>{speech.languages.length ? speech.languages.map(language => <option key={language} value={language}>{languageName(language)}</option>) : <option value={speech.language}>{speech.catalogLoading ? 'Đang tải ngôn ngữ…' : 'Chưa có ngôn ngữ'}</option>}</select></label>
            <label className="field-label">Nam / nữ<select aria-label="Giới tính giọng đọc" value={speech.gender} disabled={speech.catalogLoading} onChange={event => speech.setGender(event.target.value as GenderFilter)}><option value="all">Tất cả</option><option value="male" disabled={!speech.genders.includes('male')}>Nam</option><option value="female" disabled={!speech.genders.includes('female')}>Nữ</option>{speech.genders.includes('unknown') && <option value="unknown">Chưa có thông tin</option>}</select></label>
            <label className="field-label">Giọng<select aria-label="Giọng đọc" disabled={speech.catalogLoading || !speech.voices.length} value={speech.voiceURI} onChange={event => speech.setVoice(event.target.value)}>{speech.voices.length ? speech.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>) : <option value="">{speech.catalogLoading ? 'Đang tải giọng…' : 'Không có giọng phù hợp'}</option>}</select></label>
            <label className="field-label">Tốc độ<select aria-label="Tốc độ đọc" value={speech.rate} onChange={event => speech.setRate(Number(event.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
            {speech.catalogError && <div role="alert" className="field-hint">{speech.catalogError}<button className="text-button" onClick={speech.retryCatalog}>Tải lại danh sách giọng</button></div>}
            <p className="field-hint">{speech.provider === 'edge' ? 'Edge dùng mạng và không cần API key. Truyện được gửi đến dịch vụ giọng đọc Microsoft, gồm phần kế tiếp được chuẩn bị trước.'
              : speech.provider === 'vieneu' ? 'VieNeu v3 Turbo là model miễn phí. Nội dung được gửi đến máy chủ VieNeu của ứng dụng để tạo giọng; âm thanh đã tải có thể nghe offline.'
              : speech.provider === 'piper' ? `Piper đọc ngay trên thiết bị, không gửi truyện đi. Lần đầu tải giọng khoảng ${Math.ceil((speech.voiceDownloadBytes || 0) / 1000000)} MB và bộ chạy; lần sau dùng lại khi trình duyệt giữ bộ nhớ. Giọng chưa có thông tin nam/nữ.`
              : speech.provider === 'espeak' ? 'eSpeak NG tải bộ đọc khoảng 19 MB lần đầu, xử lý ngay trên thiết bị. Giọng nam/nữ là các biến thể tổng hợp, nghe kém tự nhiên hơn Edge và Piper.'
              : 'Giọng phụ thuộc trình duyệt và thiết bị. Một số giọng không cung cấp thông tin nam/nữ.'}</p>
            {speech.selectedVoice?.notice && <p className="field-hint">{speech.selectedVoice.notice}</p>}
          </div>
        </details>
      </div>
      <div className="speech-meta"><span>{count ? speech.paragraph + 1 : 0}<span className="muted"> / {count} đoạn</span><span className="rate-label"> · {speech.rate}×</span></span><label><input type="checkbox" checked={autoNext} onChange={onAutoNext}/>Hết chương, nghe tiếp</label></div>
      {!!count && <div className="speech-progress" role="progressbar" aria-label="Vị trí nghe" aria-valuemin={0} aria-valuemax={count} aria-valuenow={speech.paragraph + 1}><span style={{ width: `${((speech.paragraph + 1) / count) * 100}%` }}/></div>}
      {speech.loading && <p role="status" className="field-hint speech-loading">{speech.loadingMessage || 'Đang chuẩn bị giọng đọc…'}</p>}
    </>
    {speech.error && <p role="alert" className="inline-message">{speech.error}</p>}
  </section>;
}
