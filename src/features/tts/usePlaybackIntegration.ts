import { useEffect, useRef, useState } from 'react';
import type { Book } from '../../types/story';
import type { TtsReader } from './useTtsReader';
import { readJson, writeJson } from '../../services/storage/local';
export function usePlaybackIntegration(speech: TtsReader, title: string, book?: Book, previous?: () => void, next?: () => void) {
  const latest = useRef({ speech, previous, next });
  useEffect(() => { latest.current = { speech, previous, next }; });
  const [wakeEnabled, setWakeEnabled] = useState(() => readJson('reader_wake_lock', false));
  useEffect(() => {
    const update = () => setWakeEnabled(readJson('reader_wake_lock', false));
    window.addEventListener('reader-wake-setting', update); return () => window.removeEventListener('reader-wake-setting', update);
  }, []);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const media = navigator.mediaSession;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => { if (latest.current.speech.status !== 'playing') latest.current.speech.toggle(); },
      pause: () => { if (latest.current.speech.status === 'playing') latest.current.speech.toggle(); },
      stop: () => latest.current.speech.stop(),
      previoustrack: () => latest.current.previous?.(), nexttrack: () => latest.current.next?.(),
      seekbackward: event => latest.current.speech.seekSeconds(latest.current.speech.seconds - (event.seekOffset || 10)),
      seekforward: event => latest.current.speech.seekSeconds(latest.current.speech.seconds + (event.seekOffset || 10)),
      seekto: event => { if (typeof event.seekTime === 'number') latest.current.speech.seekSeconds(event.seekTime); },
    };
    for (const [action, handler] of Object.entries(handlers)) { try { media.setActionHandler(action as MediaSessionAction, handler); } catch { /* Browser may only support transport controls. */ } }
    return () => { for (const action of Object.keys(handlers)) { try { media.setActionHandler(action as MediaSessionAction, null); } catch { /* Unsupported. */ } } };
  }, []);
  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: book?.author || 'Truyện · Đọc & Nghe', album: book?.title || '', artwork: book?.cover ? [{ src: book.cover }] : [] });
  }, [title, book?.title, book?.author, book?.cover]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = speech.status === 'idle' ? 'none' : speech.status;
    if (speech.duration > 0) { try { navigator.mediaSession.setPositionState({ duration: speech.duration, playbackRate: speech.rate, position: Math.min(speech.seconds, speech.duration) }); } catch { /* Some browsers have no seek support. */ } }
    else { try { navigator.mediaSession.setPositionState(); } catch { /* Optional. */ } }
  }, [speech.status, speech.seconds, speech.duration, speech.rate]);
  useEffect(() => {
    if (!wakeEnabled || speech.status !== 'playing' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined; let disposed = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || disposed || lock && !lock.released) return;
      try { const granted = await navigator.wakeLock.request('screen'); if (disposed) await granted.release(); else lock = granted; } catch { /* User agent can deny a lock, playback still works. */ }
    };
    void acquire(); document.addEventListener('visibilitychange', acquire);
    return () => { disposed = true; document.removeEventListener('visibilitychange', acquire); void lock?.release(); };
  }, [wakeEnabled, speech.status]);
}
export function setWakeLock(enabled: boolean) { writeJson('reader_wake_lock', enabled); window.dispatchEvent(new Event('reader-wake-setting')); }
