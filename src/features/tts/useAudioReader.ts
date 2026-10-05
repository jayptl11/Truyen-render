import { useCallback, useEffect, useRef, useState } from 'react';
import { splitSpeechText } from './useSpeechReader';
import type { SpeechOptions, SpeechStatus } from './useSpeechReader';
import type { AudioProvider, TtsVoice } from '../../types/tts';
import { releaseLocalTts, synthesizeAudio } from '../../services/tts/audio';
import { speechError } from '../../services/tts/errors';
import { SpeechAudioBuffer, speechSegmentKey } from '../../services/tts/buffer';
import type { SpeechSegment } from '../../services/tts/buffer';

export function useAudioReader(options: SpeechOptions, voice: TtsVoice | undefined, rate: number, provider: AudioProvider = 'edge') {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [paragraph, setParagraph] = useState(options.initialParagraph);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const state = useRef({ status: 'idle' as SpeechStatus, paragraph: options.initialParagraph, part: 0 });
  const settings = useRef({ options, voice, rate, provider });
  const generation = useRef(0);
  const partGeneration = useRef(0);
  const [buffer] = useState(() => new SpeechAudioBuffer(synthesizeAudio));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef('');
  const audioKey = useRef('');
  useEffect(() => { settings.current = { options, voice, rate, provider }; });
  const changeStatus = useCallback((next: SpeechStatus) => { state.current.status = next; setStatus(next); }, []);
  const clearAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = ''; audioKey.current = '';
  }, []);
  const stop = useCallback(() => {
    generation.current++; buffer.clear();
    releaseLocalTts();
    clearAudio(); state.current.part = 0; changeStatus('idle'); setLoading(false); setError('');
  }, [buffer, clearAudio, changeStatus]);
  useEffect(() => () => { generation.current++; buffer.clear(); releaseLocalTts(); clearAudio(); }, [buffer, clearAudio]);
  useEffect(() => {
    generation.current++; buffer.clear(); releaseLocalTts(); clearAudio();
    const token = generation.current;
    state.current = { status: 'idle', paragraph: Math.min(Math.max(0, options.initialParagraph), Math.max(0, options.paragraphs.length - 1)), part: 0 };
    queueMicrotask(() => {
      if (token === generation.current) { setParagraph(state.current.paragraph); setStatus('idle'); setLoading(false); setError(''); }
    });
  }, [options.contentKey, options.initialParagraph, options.paragraphs.length, buffer, clearAudio]);
  const pause = useCallback(() => {
    generation.current++; buffer.cancelPending();
    audioRef.current?.pause(); changeStatus('paused'); setLoading(false);
  }, [buffer, changeStatus]);
  const holdFailure = useCallback((message: string) => {
    generation.current++; buffer.cancelPending(); clearAudio();
    changeStatus('paused'); setLoading(false);
    setError(`${message} Bấm Tiếp tục nghe để thử lại phần đang chờ.`);
  }, [buffer, clearAudio, changeStatus]);
  const start = useCallback((at?: number, resume = false) => {
    const { options: current, voice: selected, provider: source } = settings.current;
    if (!selected) { setError('Chọn một giọng trước khi nghe.'); return; }
    if (!current.paragraphs.length) return;
    generation.current++;
    if (!resume) { clearAudio(); state.current.part = 0; }
    const token = generation.current;
    const index = Math.min(Math.max(0, at ?? state.current.paragraph), current.paragraphs.length - 1);
    const firstPart = resume ? state.current.part : 0;
    changeStatus('playing'); setError('');
    const isCurrent = () => token === generation.current && state.current.status === 'playing';
    const limit = source === 'piper' ? 240 : 1200;
    const ahead = (line: number, part: number): SpeechSegment[] => {
      const segments: SpeechSegment[] = [];
      while (line < current.paragraphs.length && segments.length < 2) {
        const parts = splitSpeechText(current.paragraphs[line], limit);
        while (part < parts.length && segments.length < 2) {
          segments.push({ provider: source, voice: selected, text: parts[part++] });
        }
        line++; part = 0;
      }
      return segments;
    };
    const speak = async (line: number, part: number): Promise<void> => {
      if (!isCurrent()) return;
      if (line >= current.paragraphs.length) { clearAudio(); changeStatus('idle'); settings.current.options.onComplete(); return; }
      const parts = splitSpeechText(current.paragraphs[line], limit);
      if (part >= parts.length) { await speak(line + 1, 0); return; }
      const piece = ++partGeneration.current;
      const isPartCurrent = () => isCurrent() && piece === partGeneration.current;
      state.current.paragraph = line; state.current.part = part;
      setParagraph(line); settings.current.options.onParagraph(line);
      const segment = { provider: source, voice: selected, text: parts[part] };
      const key = speechSegmentKey(segment);
      try {
        if (audioKey.current !== key || !audioUrl.current) {
          clearAudio(); setLoading(true);
          setLoadingMessage('Đang chuẩn bị giọng đọc…');
          const blob = await buffer.get(segment, message => { if (isPartCurrent()) setLoadingMessage(message); });
          if (!isPartCurrent()) return;
          const url = URL.createObjectURL(blob);
          audioUrl.current = url; audioKey.current = key;
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = url;
        }
        if (!isPartCurrent()) return;
        const audio = audioRef.current!;
        setLoading(false); audio.playbackRate = settings.current.rate;
        let ended = false;
        audio.onended = () => {
          if (!isPartCurrent() || ended) return;
          ended = true;
          clearAudio(); void speak(line, part + 1);
        };
        audio.onerror = () => {
          if (!isPartCurrent() || !audio.error) return;
          holdFailure('Không phát được âm thanh.');
        };
        await audio.play();
        if (isPartCurrent()) buffer.prefetch(ahead(line, part + 1));
      } catch (failure) {
        if (!isPartCurrent()) return;
        const message = speechError(failure);
        holdFailure(message);
      }
    };
    void speak(index, firstPart);
  }, [buffer, holdFailure, clearAudio, changeStatus]);
  const play = useCallback((at?: number) => start(at), [start]);
  const toggle = useCallback(() => {
    if (state.current.status === 'playing') pause();
    else start(undefined, state.current.status === 'paused');
  }, [pause, start]);
  const selectParagraph = useCallback((index: number) => {
    const bounded = Math.min(Math.max(0, index), Math.max(0, settings.current.options.paragraphs.length - 1));
    if (state.current.status === 'playing') play(bounded);
    else {
      generation.current++; buffer.cancelPending(); clearAudio();
      state.current.paragraph = bounded; state.current.part = 0; setParagraph(bounded);
      settings.current.options.onParagraph(bounded);
    }
  }, [buffer, clearAudio, play]);
  const voiceKey = `${provider}:${voice?.id || ''}`;
  const previousVoice = useRef(voiceKey);
  useEffect(() => {
    if (previousVoice.current !== voiceKey) {
      previousVoice.current = voiceKey;
      generation.current++; buffer.clear(); clearAudio();
      releaseLocalTts();
      if (state.current.status === 'playing') {
        state.current.status = 'paused';
        const token = generation.current;
        queueMicrotask(() => { if (token === generation.current) { setStatus('paused'); setLoading(false); } });
      }
    }
  }, [voiceKey, buffer, clearAudio]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate]);
  return { status, paragraph, loading, loadingMessage, error, stop, play, toggle, selectParagraph };
}
