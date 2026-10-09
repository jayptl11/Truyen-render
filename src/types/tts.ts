export type TtsProvider = 'device' | 'google' | 'edge' | 'vieneu' | 'piper' | 'espeak';
export type AudioProvider = 'edge' | 'vieneu' | 'piper' | 'espeak';
export type VoiceGender = 'male' | 'female' | 'unknown';
export type GenderFilter = VoiceGender | 'all';
export interface TtsVoice { id: string; name: string; language: string; gender: VoiceGender; downloadBytes?: number; modelId?: string; speakerId?: number; notice?: string }
