import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readJson, writeJson } from '../../services/storage/local';
import { useSpeechReader } from './useSpeechReader';
import type { SpeechOptions } from './useSpeechReader';
import { useAudioReader } from './useAudioReader';
import type { GenderFilter, TtsProvider, TtsVoice } from '../../types/tts';

interface Selection { provider: TtsProvider; language: string; gender: GenderFilter; voice: string }
function savedSelection(): Selection {
  const saved = readJson<Partial<Selection>>('reader_tts_selection', {});
  return { provider: ['device', 'google', 'edge'].includes(saved.provider || '') ? saved.provider! : 'device',
    language: typeof saved.language === 'string' ? saved.language : 'vi-VN',
    gender: ['all', 'male', 'female', 'unknown'].includes(saved.gender || '') ? saved.gender! : 'all',
    voice: typeof saved.voice === 'string' ? saved.voice : readJson<string>('reader_tts_voice', '') };
}
export function useTtsReader(options: SpeechOptions) {
  const device = useSpeechReader(options);
  const [selection, setSelection] = useState(savedSelection);
  const [edgeVoices, setEdgeVoices] = useState<TtsVoice[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [retry, setRetry] = useState(0);
  const devices = useMemo(() => device.voices.map((voice): TtsVoice => ({ id: voice.voiceURI, name: voice.name, language: voice.lang.replace(/_/g, '-'), gender: 'unknown' })), [device.voices]);
  const googleVoices = useMemo(() => devices.filter(voice => /google/i.test(voice.name + ' ' + voice.id)), [devices]);
  useEffect(() => {
    if (selection.provider !== 'edge') return;
    const controller = new AbortController();
    const token = controller.signal;
    queueMicrotask(() => { if (!token.aborted) { setCatalogLoading(true); setCatalogError(''); } });
    void fetch('/api/tts', { signal: AbortSignal.any([token, AbortSignal.timeout(13000)]) }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tải được danh sách giọng Edge.');
      if (!Array.isArray(data.voices)) throw new Error('Danh sách giọng Edge không hợp lệ.');
      const voices = data.voices.filter((v: TtsVoice) => v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.language === 'string' && ['male', 'female', 'unknown'].includes(v.gender));
      if (!voices.length) throw new Error('Edge chưa có giọng đọc khả dụng.');
      if (!token.aborted) setEdgeVoices(voices);
    }).catch(error => { if (!token.aborted) setCatalogError(error instanceof Error ? error.message : 'Không tải được giọng Edge.'); })
      .finally(() => { if (!token.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [selection.provider, retry]);
  const voices = selection.provider === 'edge' ? edgeVoices : selection.provider === 'google' ? googleVoices : devices;
  const languages = useMemo(() => [...new Set(voices.map(v => v.language))].sort(), [voices]);
  const language = languages.includes(selection.language) ? selection.language : languages.find(lang => lang === 'vi-VN') || languages[0] || selection.language;
  const languageVoices = voices.filter(v => v.language === language);
  const filteredVoices = languageVoices.filter(v => selection.gender === 'all' || v.gender === selection.gender);
  const chosen = filteredVoices.find(v => v.id === selection.voice) || filteredVoices[0];
  const chosenId = chosen?.id;
  const { setVoice: setDeviceVoice } = device;
  useEffect(() => { if (selection.provider !== 'edge' && chosenId) setDeviceVoice(chosenId); }, [chosenId, selection.provider, setDeviceVoice]);
  const edge = useAudioReader(options, selection.provider === 'edge' ? chosen : undefined, device.rate);
  const current = selection.provider === 'edge' ? edge : device;
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; });
  const update = useCallback((values: Partial<Selection>) => setSelection(previous => {
    const next = { ...previous, ...values }; writeJson('reader_tts_selection', next); return next;
  }), []);
  const setProvider = (provider: TtsProvider) => {
    const position = currentRef.current.paragraph;
    device.stop(); edge.stop(); device.selectParagraph(position); edge.selectParagraph(position);
    update({ provider, voice: '', gender: 'all', language: 'vi-VN' });
  };
  const setLanguage = (language: string) => update({ language, voice: '', gender: 'all' });
  const setGender = (gender: GenderFilter) => update({ gender, voice: '' });
  const setVoice = (voice: string) => update({ voice });
  const play = (start?: number) => {
    if (selection.provider === 'google' && !chosen) return;
    current.play(start);
  };
  return { ...device, ...current, supported: selection.provider === 'edge' || device.supported,
    voices: filteredVoices, voiceURI: chosen?.id || '', setVoice, play,
    provider: selection.provider, setProvider, language, languages, setLanguage,
    gender: selection.gender, genders: [...new Set(languageVoices.map(v => v.gender))], setGender,
    googleAvailable: googleVoices.length > 0, catalogLoading: selection.provider === 'edge' && catalogLoading,
    catalogError: selection.provider === 'edge' ? catalogError : '', retryCatalog: () => setRetry(value => value + 1),
    loading: selection.provider === 'edge' && edge.loading,
    canPlay: selection.provider === 'edge' ? !!chosen && !catalogLoading : selection.provider === 'google' ? !!chosen : device.supported,
  };
}
export type TtsReader = ReturnType<typeof useTtsReader>;
