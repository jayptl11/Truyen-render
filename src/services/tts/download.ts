import type { Chapter } from '../../types/story';
import type { AudioProvider, TtsVoice } from '../../types/tts';
import { audioCacheId, cachedAudio, storeAudio } from '../storage/audioCache';
import { SpeechAudioBuffer } from './buffer';
import { synthesizeAudio } from './audio';
import { splitSpeechText } from '../../engine/playback/segments';
/** Cache keys omit playback rate: the same clip can be played at any speed. */
export async function downloadChapterAudio(chapter: Chapter, provider: AudioProvider, voice: TtsVoice, signal: AbortSignal) {
  const buffer = new SpeechAudioBuffer(synthesizeAudio);
  const abort = () => buffer.cancelPending(); signal.addEventListener('abort', abort, { once: true });
  try {
    for (const paragraph of chapter.content.replace(/\*\*/g, '').split(/\n+/).map(value => value.trim()).filter(Boolean)) {
      for (const text of splitSpeechText(paragraph, provider === 'piper' ? 240 : 1200)) {
        signal.throwIfAborted();
        const id = await audioCacheId(JSON.stringify([provider, voice.id, voice.language, text]));
        const blob = await cachedAudio(id) || await buffer.get({ provider, voice, text }, () => {});
        signal.throwIfAborted(); await storeAudio(id, blob, true);
      }
    }
  } finally { signal.removeEventListener('abort', abort); buffer.clear(); }
}
