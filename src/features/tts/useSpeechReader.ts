import { useCallback, useEffect, useRef, useState } from 'react';
import { readJson, writeJson } from '../../services/storage/local';

export type SpeechStatus = 'idle' | 'playing' | 'paused';
import { splitSpeechText } from '../../engine/playback/segments';
export { splitSpeechText } from '../../engine/playback/segments';

export interface SpeechOptions {
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
  const offsetRef = useRef(0);
  const statusRef = useRef<SpeechStatus>('idle');
  useEffect(() => { optionsRef.current = options; });
  useEffect(() => { settingsRef.current = { rate, voiceURI, voices }; }, [rate, voiceURI, voices]);
  const changeStatus = useCallback((value: SpeechStatus) => { statusRef.current = value; setStatus(value); }, []);
  const stop = useCallback(() => {
    generation.current++;
    utteranceRef.current = null;
    offsetRef.current = 0;
    changeStatus('idle');
    if (supported) window.speechSynthesis.cancel();
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
    statusRef.current = 'idle';
    offsetRef.current = 0;
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

  const beginPlayback = useCallback((start?: number, resumeOffset = 0) => {
    if (!supported) { setError('Trình duyệt này không hỗ trợ đọc văn bản.'); return; }
    const paragraphs = optionsRef.current.paragraphs;
    if (!paragraphs.length) return;
    stop();
    setError('');
    const token = generation.current;
    const index = Math.min(Math.max(0, start ?? paragraphRef.current), paragraphs.length - 1);
    changeStatus('playing');
    // Clear a browser/OS pause left over from a previous speech session.
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    const speakParagraph = (at: number) => {
      if (token !== generation.current || statusRef.current !== 'playing') return;
      if (at >= paragraphs.length) {
        changeStatus('idle'); utteranceRef.current = null; offsetRef.current = 0;
        optionsRef.current.onComplete();
        return;
      }
      paragraphRef.current = at;
      setParagraph(at);
      optionsRef.current.onParagraph(at);
      let offset = at === index ? Math.min(resumeOffset, paragraphs[at].length) : 0;
      const parts = splitSpeechText(paragraphs[at].slice(offset)).map(text => {
        const from = paragraphs[at].indexOf(text, offset);
        offset = from + text.length;
        return { text, from };
      });
      const speakPart = (part: number) => {
        if (token !== generation.current || statusRef.current !== 'playing') return;
        if (part >= parts.length) { speakParagraph(at + 1); return; }
        const { text, from } = parts[part];
        offsetRef.current = from;
        const utterance = new SpeechSynthesisUtterance(text);
        const settings = settingsRef.current;
        const voice = settings.voices.find(v => v.voiceURI === settings.voiceURI)
          || settings.voices.find(v => /^vi(?:-|$)/i.test(v.lang));
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || 'vi-VN';
        utterance.rate = settings.rate;
        const isCurrent = () => token === generation.current && statusRef.current === 'playing' && utteranceRef.current === utterance;
        utterance.onboundary = event => {
          if (isCurrent() && Number.isInteger(event.charIndex) && event.charIndex >= 0 && event.charIndex < text.length) {
            offsetRef.current = from + event.charIndex;
          }
        };
        utterance.onend = () => {
          if (!isCurrent()) return;
          utteranceRef.current = null;
          speakPart(part + 1);
        };
        utterance.onerror = event => {
          if (!isCurrent()) return;
          utteranceRef.current = null;
          generation.current++; changeStatus('idle');
          if (['canceled', 'interrupted'].includes(event.error)) return;
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
  const play = useCallback((start?: number) => beginPlayback(start), [beginPlayback]);
  const toggle = useCallback(() => {
    if (!supported) return;
    if (statusRef.current === 'playing') {
      // Native pause is unreliable on some mobile voices. Cancel the utterance
      // and invalidate its callbacks before calling into the speech engine.
      generation.current++;
      utteranceRef.current = null;
      changeStatus('paused');
      window.speechSynthesis.cancel();
    }
    else if (statusRef.current === 'paused') beginPlayback(undefined, offsetRef.current);
    else play();
  }, [supported, changeStatus, play, beginPlayback]);
  const selectParagraph = useCallback((index: number) => {
    const bounded = Math.min(Math.max(0, index), Math.max(0, optionsRef.current.paragraphs.length - 1));
    if (statusRef.current === 'playing') play(bounded);
    else {
      paragraphRef.current = bounded; offsetRef.current = 0; setParagraph(bounded);
      optionsRef.current.onParagraph(bounded);
    }
  }, [play]);
  const setRate = useCallback((value: number) => {
    if (settingsRef.current.rate === value) return;
    settingsRef.current.rate = value; setRateState(value); writeJson('reader_tts_rate', value);
    if (statusRef.current === 'playing') play();
  }, [play]);
  const setVoice = useCallback((value: string) => {
    if (settingsRef.current.voiceURI === value) return;
    settingsRef.current.voiceURI = value; setVoiceURI(value); writeJson('reader_tts_voice', value);
    if (statusRef.current === 'playing') play();
  }, [play]);
  return { supported, voices, voiceURI, rate, status, paragraph, error, play, toggle, stop, selectParagraph, setRate, setVoice };
}
export type SpeechReader = ReturnType<typeof useSpeechReader>;
