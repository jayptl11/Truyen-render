import { readJson, writeJson } from './local';
import { writeRecords } from './database';
export interface PlaybackPosition { id: string; paragraph: number; part: number; seconds: number; fingerprint: string; voice: string; timestamp: number }
export function playbackPosition(id: string): PlaybackPosition | undefined {
  return readJson<Record<string, PlaybackPosition>>('reader_playback_positions', {})[id];
}
export function savePlaybackPosition(position: PlaybackPosition) {
  const records = readJson<Record<string, PlaybackPosition>>('reader_playback_positions', {});
  records[position.id] = position;
  writeJson('reader_playback_positions', Object.fromEntries(Object.entries(records).sort((a, b) => a[1].timestamp - b[1].timestamp).slice(-1000)));
  void writeRecords('positions', [position]).catch(() => {});
}
