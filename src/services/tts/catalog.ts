import type { TtsVoice } from '../../types/tts';

// Piper model names are from the pinned library catalog. Its metadata does not
// identify speaker gender, so these voices remain "unknown".
export const PIPER_VOICES: TtsVoice[] = [
  { id: 'vi_VN-vais1000-medium', name: 'VAIS 1000 · neural', language: 'vi-VN', gender: 'unknown', downloadBytes: 63206154 },
  { id: 'vi_VN-25hours_single-low', name: '25hours · neural', language: 'vi-VN', gender: 'unknown', downloadBytes: 63108702 },
  { id: 'vi_VN-vivos-x_low', name: 'VIVOS · neural', language: 'vi-VN', gender: 'unknown', downloadBytes: 27795005 },
  { id: 'en_US-lessac-medium', name: 'Lessac · neural', language: 'en-US', gender: 'unknown', downloadBytes: 63201294 },
  { id: 'en_GB-alan-low', name: 'Alan · neural', language: 'en-GB', gender: 'unknown', downloadBytes: 63108696 },
];

const languages = [
  ['vi-VN', 'vi'], ['en-US', 'en-us'], ['en-GB', 'en-gb'], ['fr-FR', 'fr'],
  ['de-DE', 'de'], ['es-ES', 'es'], ['it-IT', 'it'], ['pt-BR', 'pt-br'], ['zh-CN', 'cmn'],
] as const;
export const ESPEAK_VOICES: TtsVoice[] = languages.flatMap(([language, voice]) => [
  { id: `${voice}+m1`, name: 'Nam · tổng hợp', language, gender: 'male' as const },
  { id: `${voice}+f2`, name: 'Nữ · tổng hợp', language, gender: 'female' as const },
]);
