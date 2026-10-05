import { useCallback, useEffect, useRef, useState } from 'react';
import { readJson, writeJson } from '../../services/storage/local';

export type SpeechStatus = 'idle' | 'playing' | 'paused';
/** Short utterances avoid browser limits on long chapters. Paragraph indices stay stable. */
export function splitSpeechText(text: string, limit = 240): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const sample = rest.slice(0, limit + 1);
    const punctuation = Math.max(sample.lastIndexOf('. '), sample.lastIndexOf('! '), sample.lastIndexOf('? '), sample.lastIndexOf('; '));
    const boundary = punctuation > limit / 3 ? punctuation + 1 : sample.lastIndexOf(' ');
    const cut = boundary > 0 ? boundary : limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

interface SpeechOptions {
  paragraphs: string[];
  contentKey: string;
  initialParagraph: number;
  onParagraph: (paragraph: number) => void;
  onComplete: () => void;
}
export function useSpeechReader(options: SpeechOptions) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState(() => readJson<string>('reader_tts_voice', ''));
  const [rate, setRateState] = useState(() => {
    const saved = readJson<number>('reader_tts_rate', 1);
    return typeof saved === 'number' && saved >= 0.5 && saved <= 2 ? saved : 1;
  });
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [paragraph, setParagraph] = useState(options.initialParagraph);
  const [error, setError] = useState('');
  const optionsRef = useRef(options);
  const generation = useRef(0);
  const paragraphRef = useRef(options.initialParagraph);
  const settingsRef = useRef({ rate, voiceURI, voices });
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const statusRef = useRef<SpeechStatus>('idle');
  useEffect(() => { optionsRef.current = options; });
  useEffect(() => { settingsRef.current = { rate, voiceURI, voices }; }, [rate, voiceURI, voices]);
  const changeStatus = useCallback((value: SpeechStatus) => { statusRef.current = value; setStatus(value); }, []);
  const stop = useCallback(() => {
    generation.current++;
    if (supported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    changeStatus('idle');
  }, [supported, changeStatus]);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener('voiceschanged', update);
    return () => { synth.removeEventListener('voiceschanged', update); stop(); };
  }, [supported, stop]);

  useEffect(() => {
    generation.current++;
    if (supported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    const token = generation.current;
    const index = Math.min(Math.max(0, options.initialParagraph), Math.max(0, options.paragraphs.length - 1));
    paragraphRef.current = index;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed && token === generation.current) { changeStatus('idle'); setParagraph(index); setError(''); }
    });
    return () => { disposed = true; };
  }, [options.contentKey, options.initialParagraph, options.paragraphs.length, supported, changeStatus]);

  const play = useCallback((start?: number) => {
    if (!supported) { setError('Trình duyệt này không hỗ trợ đọc văn bản.'); return; }
    const paragraphs = optionsRef.current.paragraphs;
    if (!paragraphs.length) return;
    stop();
    setError('');
    const token = generation.current;
    const index = Math.min(Math.max(0, start ?? paragraphRef.current), paragraphs.length - 1);
    changeStatus('playing');
    const speakParagraph = (at: number) => {
      if (token !== generation.current) return;
      if (at >= paragraphs.length) {
        changeStatus('idle'); utteranceRef.current = null;
        optionsRef.current.onComplete();
        return;
      }
      paragraphRef.current = at;
      setParagraph(at);
      optionsRef.current.onParagraph(at);
      const parts = splitSpeechText(paragraphs[at]);
      const speakPart = (part: number) => {
        if (token !== generation.current) return;
        if (part >= parts.length) { speakParagraph(at + 1); return; }
        const utterance = new SpeechSynthesisUtterance(parts[part]);
        const settings = settingsRef.current;
        const voice = settings.voices.find(v => v.voiceURI === settings.voiceURI)
          || settings.voices.find(v => /^vi(?:-|$)/i.test(v.lang));
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || 'vi-VN';
        utterance.rate = settings.rate;
        utterance.onend = () => { if (token === generation.current) speakPart(part + 1); };
        utterance.onerror = event => {
          if (token !== generation.current || ['canceled', 'interrupted'].includes(event.error)) return;
          generation.current++; changeStatus('idle');
          setError(`Không phát được giọng đọc (${event.error}). Hãy chọn giọng khác hoặc thử lại.`);
        };
        utteranceRef.current = utterance;
        try { window.speechSynthesis.speak(utterance); } catch {
          generation.current++; changeStatus('idle'); setError('Không khởi động được giọng đọc.');
        }
      };
      speakPart(0);
    };
    speakParagraph(index);
  }, [supported, stop, changeStatus]);
  const toggle = useCallback(() => {
    if (!supported) return;
    if (statusRef.current === 'playing') { window.speechSynthesis.pause(); changeStatus('paused'); }
    else if (statusRef.current === 'paused') { window.speechSynthesis.resume(); changeStatus('playing'); }
    else play();
  }, [supported, changeStatus, play]);
  const selectParagraph = useCallback((index: number) => {
    const bounded = Math.min(Math.max(0, index), Math.max(0, optionsRef.current.paragraphs.length - 1));
    if (statusRef.current !== 'idle') play(bounded);
    else {
      paragraphRef.current = bounded; setParagraph(bounded);
      optionsRef.current.onParagraph(bounded);
    }
  }, [play]);
  const setRate = (value: number) => {
    settingsRef.current.rate = value; setRateState(value); writeJson('reader_tts_rate', value);
    if (statusRef.current === 'playing') play();
  };
  const setVoice = (value: string) => {
    settingsRef.current.voiceURI = value; setVoiceURI(value); writeJson('reader_tts_voice', value);
    if (statusRef.current === 'playing') play();
  };
  return { supported, voices, voiceURI, rate, status, paragraph, error, play, toggle, stop, selectParagraph, setRate, setVoice };
}
export type SpeechReader = ReturnType<typeof useSpeechReader>;
