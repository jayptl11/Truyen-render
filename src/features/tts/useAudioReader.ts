import { useCallback, useEffect, useRef, useState } from 'react';
import { splitSpeechText } from './useSpeechReader';
import type { SpeechOptions, SpeechStatus } from './useSpeechReader';
import type { AudioProvider, TtsVoice } from '../../types/tts';
import { releaseLocalTts, synthesizeAudio } from '../../services/tts/audio';
import { speechError } from '../../services/tts/errors';

export function useAudioReader(options: SpeechOptions, voice: TtsVoice | undefined, rate: number, provider: AudioProvider = 'edge') {
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [paragraph, setParagraph] = useState(options.initialParagraph);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const state = useRef({ status: 'idle' as SpeechStatus, paragraph: options.initialParagraph, part: 0 });
  const settings = useRef({ options, voice, rate, provider });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
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
    generation.current++; controller.current?.abort(); controller.current = null;
    releaseLocalTts();
    clearAudio(); state.current.part = 0; changeStatus('idle'); setLoading(false);
  }, [clearAudio, changeStatus]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); releaseLocalTts(); clearAudio(); }, [clearAudio]);
  useEffect(() => {
    generation.current++; controller.current?.abort(); releaseLocalTts(); clearAudio();
    const token = generation.current;
    state.current = { status: 'idle', paragraph: Math.min(Math.max(0, options.initialParagraph), Math.max(0, options.paragraphs.length - 1)), part: 0 };
    queueMicrotask(() => {
      if (token === generation.current) { setParagraph(state.current.paragraph); setStatus('idle'); setLoading(false); setError(''); }
    });
  }, [options.contentKey, options.initialParagraph, options.paragraphs.length, clearAudio]);
  const pause = useCallback(() => {
    generation.current++; controller.current?.abort(); controller.current = null;
    audioRef.current?.pause(); changeStatus('paused'); setLoading(false);
  }, [changeStatus]);
  const start = useCallback((at?: number, resume = false) => {
    const { options: current, voice: selected, provider: source } = settings.current;
    if (!selected) { setError('Chọn một giọng trước khi nghe.'); return; }
    if (!current.paragraphs.length) return;
    if (!resume) stop();
    else { generation.current++; controller.current?.abort(); }
    const token = generation.current;
    const index = Math.min(Math.max(0, at ?? state.current.paragraph), current.paragraphs.length - 1);
    const firstPart = resume ? state.current.part : 0;
    changeStatus('playing'); setError('');
    const isCurrent = () => token === generation.current && state.current.status === 'playing';
    const speak = async (line: number, part: number): Promise<void> => {
      if (!isCurrent()) return;
      if (line >= current.paragraphs.length) { clearAudio(); changeStatus('idle'); settings.current.options.onComplete(); return; }
      const parts = splitSpeechText(current.paragraphs[line], source === 'piper' ? 240 : 1200);
      if (part >= parts.length) { await speak(line + 1, 0); return; }
      state.current.paragraph = line; state.current.part = part;
      setParagraph(line); settings.current.options.onParagraph(line);
      const key = JSON.stringify([source, selected.id, parts[part]]);
      let requestSignal: AbortSignal | undefined;
      try {
        if (audioKey.current !== key || !audioUrl.current) {
          clearAudio(); setLoading(true);
          const request = new AbortController(); controller.current = request;
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(source === 'piper' ? 180000 : source === 'espeak' ? 60000 : 26000)]);
          requestSignal = signal;
          const blob = await synthesizeAudio(source, parts[part], selected, signal, message => { if (isCurrent()) setLoadingMessage(message); });
          if (!isCurrent()) return;
          if (!blob.size || !/audio\//.test(blob.type)) throw new Error('Nguồn giọng đọc không trả về âm thanh hợp lệ.');
          const url = URL.createObjectURL(blob);
          audioUrl.current = url; audioKey.current = key;
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = url;
        }
        if (!isCurrent()) return;
        const audio = audioRef.current!;
        setLoading(false); audio.playbackRate = settings.current.rate;
        let ended = false;
        audio.onended = () => {
          if (!isCurrent() || ended) return;
          ended = true;
          clearAudio(); void speak(line, part + 1);
        };
        audio.onerror = () => {
          if (!isCurrent()) return;
          stop(); setError('Không phát được âm thanh. Thử lại hoặc chọn nguồn giọng khác.');
        };
        await audio.play();
      } catch (failure) {
        if (!isCurrent()) return;
        const message = speechError(failure, requestSignal);
        stop(); setError(message);
      }
    };
    void speak(index, firstPart);
  }, [stop, clearAudio, changeStatus]);
  const play = useCallback((at?: number) => start(at), [start]);
  const toggle = useCallback(() => {
    if (state.current.status === 'playing') pause();
    else start(undefined, state.current.status === 'paused');
  }, [pause, start]);
  const selectParagraph = useCallback((index: number) => {
    const bounded = Math.min(Math.max(0, index), Math.max(0, settings.current.options.paragraphs.length - 1));
    if (state.current.status === 'playing') play(bounded);
    else {
      generation.current++; controller.current?.abort(); clearAudio();
      state.current.paragraph = bounded; state.current.part = 0; setParagraph(bounded);
      settings.current.options.onParagraph(bounded);
    }
  }, [clearAudio, play]);
  const voiceKey = `${provider}:${voice?.id || ''}`;
  const previousVoice = useRef(voiceKey);
  useEffect(() => {
    if (previousVoice.current !== voiceKey) {
      previousVoice.current = voiceKey;
      generation.current++; controller.current?.abort(); clearAudio();
      releaseLocalTts();
      if (state.current.status === 'playing') {
        state.current.status = 'paused';
        const token = generation.current;
        queueMicrotask(() => { if (token === generation.current) { setStatus('paused'); setLoading(false); } });
      }
    }
  }, [voiceKey, clearAudio]);
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate]);
  return { status, paragraph, loading, loadingMessage, error, stop, play, toggle, selectParagraph };
}
