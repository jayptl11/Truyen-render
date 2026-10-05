import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SpeechOptions } from './useSpeechReader';
import type { AudioProvider, TtsVoice } from '../../types/tts';
import { PlaybackSession } from '../../engine/playback/PlaybackSession';
export function useAudioReader(options: SpeechOptions, voice: TtsVoice | undefined, rate: number, provider: AudioProvider = 'edge') {
  const [session] = useState(() => new PlaybackSession());
  const settings = { options, voice, rate, provider };
  const previousVoice = useRef(`${provider}:${voice?.id || ''}`);
  // Callback changes do not recreate the playing chapter.
  useEffect(() => { session.updateSettings(settings); });
  useEffect(() => { session.configure({ options, voice, rate, provider }); }, [session, options.contentKey, options.initialParagraph, options.paragraphs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = `${provider}:${voice?.id || ''}`;
    if (previousVoice.current !== key) { previousVoice.current = key; session.changeVoice(); }
  }, [session, provider, voice?.id]);
  useEffect(() => { session.changeRate(); }, [session, rate]);
  useEffect(() => { const checkpoint = () => session.pause(); window.addEventListener('pagehide', checkpoint); return () => { window.removeEventListener('pagehide', checkpoint); session.destroy(); }; }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { ...state, stop: session.stop, play: session.play, toggle: session.toggle, selectParagraph: session.selectParagraph,
    prepareChapter: session.prepareChapter, queueChapter: session.queueChapter, seekSeconds: session.seekSeconds, prepareDownload: session.prepareDownload,
    restorePosition: session.restorePosition };
}
