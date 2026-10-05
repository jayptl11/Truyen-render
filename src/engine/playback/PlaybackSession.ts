import type { AudioProvider, TtsVoice } from '../../types/tts';
import type { SpeechOptions, SpeechStatus } from '../../features/tts/useSpeechReader';
import { releaseLocalTts, synthesizeAudio } from '../../services/tts/audio';
import { speechError } from '../../services/tts/errors';
import { SpeechAudioBuffer, speechSegmentKey, type SpeechSegment } from '../../services/tts/buffer';
import { playbackPosition, savePlaybackPosition } from '../../services/storage/positions';
import { splitSpeechText, textFingerprint } from './segments';

export type PlaybackPhase = 'idle' | 'preparing' | 'playing' | 'paused' | 'reconnecting' | 'completed';
interface Snapshot { status: SpeechStatus; phase: PlaybackPhase; paragraph: number; part: number; loading: boolean; loadingMessage: string; error: string; seconds: number; duration: number; bufferedSeconds: number }
interface Settings { options: SpeechOptions; voice?: TtsVoice; rate: number; provider: AudioProvider }
interface Deck { audio: HTMLAudioElement; url: string; key: string }
interface Upcoming { key: string; paragraphs: string[] }

/** One session owns playback, cancellation and position. React only subscribes to it. */
export class PlaybackSession {
  private snapshot: Snapshot = { status: 'idle', phase: 'idle', paragraph: 0, part: 0, loading: false, loadingMessage: '', error: '', seconds: 0, duration: 0, bufferedSeconds: 0 };
  private listeners = new Set<() => void>();
  private settings!: Settings;
  private buffer = new SpeechAudioBuffer(synthesizeAudio, [1000, 2000], { entries: 24, bytes: 24 * 1024 * 1024 });
  private generation = 0;
  private piece = 0;
  private current?: Deck;
  private prepared?: Deck;
  private upcoming?: Upcoming;
  private continuation = false;
  private savedSeconds = 0;
  private durations = new Map<string, number>();
  private lastCheckpoint = 0;
  private bufferUnsubscribe?: () => void;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(values: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...values }; this.listeners.forEach(listener => listener()); }
  updateSettings(settings: Settings) {
    this.settings = this.settings && this.settings.options.contentKey !== settings.options.contentKey ? { ...settings, options: this.settings.options } : settings;
    if (this.current) this.current.audio.playbackRate = settings.rate;
  }
  configure(settings: Settings) {
    const keep = this.continuation; this.continuation = false;
    this.checkpoint(); this.generation++;
    this.clearDeck(this.current); this.current = undefined;
    if (!keep) { this.clearDeck(this.prepared); this.prepared = undefined; }
    if (!keep) this.buffer.cancelPending();
    this.settings = settings;
    if (this.prepared && (!settings.voice || this.prepared.key !== speechSegmentKey(this.segment(this.parts(0)[0] || '')))) {
      this.clearDeck(this.prepared); this.prepared = undefined;
    }
    if (this.upcoming?.key === settings.options.contentKey) this.upcoming = undefined;
    let paragraph = Math.min(Math.max(0, settings.options.initialParagraph), Math.max(0, settings.options.paragraphs.length - 1));
    let part = 0; this.savedSeconds = 0;
    const saved = playbackPosition(settings.options.contentKey);
    const fingerprint = textFingerprint(settings.options.paragraphs.join('\n'));
    if (!keep && saved && saved.paragraph === paragraph && saved.fingerprint === fingerprint && saved.voice === this.voiceKey()) {
      paragraph = saved.paragraph; part = Math.max(0, saved.part); this.savedSeconds = Math.max(0, saved.seconds);
    }
    this.update({ status: 'idle', phase: 'idle', paragraph, part, seconds: this.savedSeconds, duration: 0, loading: false, error: '', bufferedSeconds: 0 });
    this.bufferUnsubscribe?.(); this.bufferUnsubscribe = this.buffer.subscribe(() => this.prepareNext());
  }
  private voiceKey() { return `${this.settings.provider}:${this.settings.voice?.id || ''}`; }
  private segment(text: string): SpeechSegment { return { provider: this.settings.provider, voice: this.settings.voice!, text }; }
  private parts(paragraph: number) { return splitSpeechText(this.settings.options.paragraphs[paragraph] || '', this.settings.provider === 'piper' ? 240 : 1200); }
  private estimate(segment: SpeechSegment) { return this.durations.get(speechSegmentKey(segment)) || Math.max(2, segment.text.split(/\s+/).length / 3); }
  private ahead(): SpeechSegment[] {
    if (!this.settings.voice) return [];
    const result: SpeechSegment[] = [];
    let seconds = 0;
    const append = (paragraphs: string[], start: number, part: number) => {
      for (let line = start; line < paragraphs.length && result.length < 20 && seconds < 45; line++) {
        const pieces = splitSpeechText(paragraphs[line], this.settings.provider === 'piper' ? 240 : 1200);
        for (let index = line === start ? part : 0; index < pieces.length && result.length < 20 && seconds < 45; index++) {
          const segment = this.segment(pieces[index]); result.push(segment); seconds += this.estimate(segment) / this.settings.rate;
        }
      }
    };
    append(this.settings.options.paragraphs, this.snapshot.paragraph, this.snapshot.part + 1);
    if (this.upcoming) append(this.upcoming.paragraphs, 0, 0);
    return result;
  }
  private fill() { this.buffer.prefetch(this.ahead()); this.prepareNext(); }
  private prepareNext() {
    const ahead = this.ahead();
    const available = ahead.reduce((sum, segment) => sum + (this.buffer.peek(segment) ? this.estimate(segment) / this.settings.rate : 0), 0);
    if (available !== this.snapshot.bufferedSeconds) this.update({ bufferedSeconds: available });
    const next = ahead[0]; if (!next) return;
    const key = speechSegmentKey(next);
    if (this.prepared?.key === key || this.current?.key === key) return;
    const blob = this.buffer.peek(next); if (!blob) return;
    this.clearDeck(this.prepared);
    this.prepared = this.makeDeck(blob, key);
    this.prepared.audio.preload = 'auto'; this.prepared.audio.load();
  }
  private makeDeck(blob: Blob, key: string): Deck {
    const audio = new Audio(); const url = URL.createObjectURL(blob); audio.src = url;
    return { audio, url, key };
  }
  private clearDeck(deck?: Deck) {
    if (!deck) return;
    deck.audio.onended = null; deck.audio.onerror = null; deck.audio.ontimeupdate = null; deck.audio.onloadedmetadata = null;
    deck.audio.pause(); deck.audio.removeAttribute('src'); deck.audio.load(); URL.revokeObjectURL(deck.url);
  }
  private clearDecks() { this.clearDeck(this.current); this.clearDeck(this.prepared); this.current = undefined; this.prepared = undefined; }
  private checkpoint() {
    // stop() already saved the audible position; do not overwrite it with the
    // reset transport when another chapter is configured or the tab closes.
    if (this.snapshot.status === 'idle' && !this.current) return;
    if (!this.settings?.options.contentKey || !this.settings.voice || !this.settings.options.paragraphs.length) return;
    const { paragraph, part } = this.snapshot;
    savePlaybackPosition({ id: this.settings.options.contentKey, paragraph, part, seconds: this.current?.audio.currentTime || this.savedSeconds,
      fingerprint: textFingerprint(this.settings.options.paragraphs.join('\n')), voice: this.voiceKey(), timestamp: Date.now() });
  }
  prepareChapter = () => { this.continuation = true; };
  restorePosition = (paragraph: number) => { this.configure({ ...this.settings, options: { ...this.settings.options, initialParagraph: paragraph } }); };
  queueChapter = (key: string, paragraphs: string[]) => {
    this.upcoming = paragraphs.length ? { key, paragraphs } : undefined;
    if (this.snapshot.status === 'playing') this.fill();
  };
  pause = () => {
    this.checkpoint(); this.generation++; this.current?.audio.pause();
    if (this.snapshot.loading) this.buffer.cancelPending();
    this.update({ status: 'paused', phase: 'paused', loading: false });
  };
  prepareDownload = () => { this.pause(); this.buffer.cancelPending(); };
  stop = () => {
    this.checkpoint(); this.generation++; this.buffer.clear(); this.clearDecks(); releaseLocalTts(); this.savedSeconds = 0;
    this.continuation = false; this.upcoming = undefined;
    this.update({ status: 'idle', phase: 'idle', part: 0, seconds: 0, loading: false, error: '', bufferedSeconds: 0 });
  };
  destroy = () => { this.checkpoint(); this.generation++; this.buffer.clear(); this.clearDecks(); releaseLocalTts(); this.bufferUnsubscribe?.(); };
  private failed(message: string) {
    this.checkpoint(); this.generation++; this.buffer.cancelPending(); this.clearDeck(this.current); this.current = undefined;
    this.update({ status: 'paused', phase: 'paused', loading: false, error: `${message} Bấm Tiếp tục nghe để thử lại phần đang chờ.` });
  }
  play = (at?: number) => { this.start(at, false); };
  toggle = () => { if (this.snapshot.status === 'playing') this.pause(); else this.start(undefined, true); };
  private start(at?: number, resume = false) {
    if (!this.settings.voice) { this.update({ error: 'Chọn một giọng trước khi nghe.' }); return; }
    if (!this.settings.options.paragraphs.length) return;
    this.generation++;
    if (!resume) { this.clearDeck(this.current); this.current = undefined; this.savedSeconds = 0; }
    const token = this.generation;
    const paragraph = Math.min(Math.max(0, at ?? this.snapshot.paragraph), this.settings.options.paragraphs.length - 1);
    this.update({ status: 'playing', error: '', paragraph, part: resume ? this.snapshot.part : 0 });
    const currentSession = () => token === this.generation && this.snapshot.status === 'playing';
    const speak = async (line: number, part: number): Promise<void> => {
      if (!currentSession()) return;
      if (line >= this.settings.options.paragraphs.length) {
        this.savedSeconds = 0; this.clearDeck(this.current); this.current = undefined;
        this.update({ status: 'idle', phase: 'completed', loading: false, seconds: 0 });
        this.checkpoint(); this.settings.options.onComplete(); return;
      }
      const parts = this.parts(line);
      if (part >= parts.length) { await speak(line + 1, 0); return; }
      const piece = ++this.piece;
      const currentPiece = () => currentSession() && piece === this.piece;
      this.update({ paragraph: line, part }); this.settings.options.onParagraph(line);
      const segment = this.segment(parts[part]); const key = speechSegmentKey(segment);
      try {
        if (this.current?.key !== key) {
          this.clearDeck(this.current); this.current = undefined;
          if (this.prepared?.key === key) { this.current = this.prepared; this.prepared = undefined; }
          else {
            this.update({ loading: true, phase: 'preparing', loadingMessage: 'Đang chuẩn bị giọng đọc…' });
            const blob = await this.buffer.get(segment, message => { if (currentPiece()) this.update({ loadingMessage: message, phase: message.includes('kết nối lại') ? 'reconnecting' : 'preparing' }); });
            if (!currentPiece()) return;
            this.current = this.makeDeck(blob, key);
          }
        }
        if (!currentPiece()) return;
        const audio = this.current.audio;
        audio.playbackRate = this.settings.rate;
        const metadata = () => {
          if (!currentPiece()) return;
          const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
          if (duration) this.durations.set(key, duration);
          if (this.savedSeconds > 0) { audio.currentTime = duration ? Math.min(this.savedSeconds, Math.max(0, duration - 0.05)) : this.savedSeconds; this.savedSeconds = 0; }
          this.update({ duration }); this.prepareNext();
        };
        audio.onloadedmetadata = metadata;
        if (audio.readyState >= 1 || typeof audio.readyState !== 'number') metadata();
        audio.ontimeupdate = () => {
          if (!currentPiece()) return;
          this.update({ seconds: audio.currentTime });
          if (Date.now() - this.lastCheckpoint > 1000) { this.lastCheckpoint = Date.now(); this.checkpoint(); }
        };
        let ended = false;
        audio.onended = () => {
          if (!currentPiece() || ended) return;
          ended = true; this.savedSeconds = 0;
          this.clearDeck(this.current); this.current = undefined;
          this.update({ seconds: 0, duration: 0 }); void speak(line, part + 1);
        };
        audio.onerror = () => { if (currentPiece() && audio.error) this.failed('Không phát được âm thanh.'); };
        this.update({ loading: false, phase: 'playing' });
        await audio.play();
        if (currentPiece()) this.fill();
      } catch (error) { if (currentPiece()) this.failed(speechError(error)); }
    };
    void speak(paragraph, this.snapshot.part);
  }
  selectParagraph = (index: number) => {
    const bounded = Math.min(Math.max(0, index), Math.max(0, this.settings.options.paragraphs.length - 1));
    if (this.snapshot.status === 'playing') this.play(bounded);
    else {
      this.generation++; this.buffer.cancelPending(); this.clearDecks(); this.savedSeconds = 0;
      this.update({ paragraph: bounded, part: 0, seconds: 0, duration: 0 }); this.settings.options.onParagraph(bounded); this.checkpoint();
    }
  };
  seekSeconds = (seconds: number) => {
    if (!this.current || !Number.isFinite(this.current.audio.duration)) return;
    this.current.audio.currentTime = Math.min(Math.max(0, seconds), this.current.audio.duration);
    this.update({ seconds: this.current.audio.currentTime }); this.checkpoint();
  };
  changeVoice() {
    const playing = this.snapshot.status === 'playing'; this.generation++; this.buffer.clear(); this.clearDecks(); releaseLocalTts(); this.savedSeconds = 0;
    const saved = playbackPosition(this.settings.options.contentKey);
    const restore = !playing && saved && saved.paragraph === this.snapshot.paragraph && saved.voice === this.voiceKey() && saved.fingerprint === textFingerprint(this.settings.options.paragraphs.join('\n'));
    if (restore) this.savedSeconds = saved.seconds;
    this.update({ part: restore ? saved.part : 0, seconds: this.savedSeconds, loading: false, bufferedSeconds: 0, ...(playing ? { status: 'paused', phase: 'paused' } as const : {}) });
  }
  changeRate() { if (this.current) this.current.audio.playbackRate = this.settings.rate; if (this.snapshot.status === 'playing') this.fill(); }
}
