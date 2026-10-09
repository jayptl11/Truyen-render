import type { TtsVoice } from '../../types/tts';

// Piper model names are from the pinned library catalog. Its metadata does not
// identify speaker gender, so these voices remain "unknown".
export const PIPER_VOICES: TtsVoice[] = [
  { id: 'vi_VN-vais1000-medium', name: 'VAIS 1000 · neural', language: 'vi-VN', gender: 'unknown', downloadBytes: 63206154 },
  { id: 'vi_VN-25hours_single-low', name: '25hours · neural', language: 'vi-VN', gender: 'unknown', downloadBytes: 63108702, notice: '25hours: giấy phép dữ liệu chưa rõ; cần xác minh trước khi dùng thương mại.' },
  ...Array.from({ length: 65 }, (_, speakerId): TtsVoice => ({
    id: speakerId === 0 ? 'vi_VN-vivos-x_low' : `vi_VN-vivos-x_low#${speakerId}`,
    modelId: 'vi_VN-vivos-x_low', speakerId, name: `VIVOS · giọng ${speakerId + 1}`,
    language: 'vi-VN', gender: 'unknown', downloadBytes: 27795005,
    notice: '65 giọng VIVOS dùng chung một model 28 MB. Dữ liệu có giấy phép phi thương mại (CC BY-NC-SA 4.0).',
  })),
  { id: 'en_US-lessac-medium', name: 'Lessac · neural', language: 'en-US', gender: 'unknown', downloadBytes: 63201294 },
  { id: 'en_GB-alan-low', name: 'Alan · neural', language: 'en-GB', gender: 'unknown', downloadBytes: 63108696 },
];

const languages = [
  ['vi-VN', 'vi'], ['en-US', 'en-us'], ['en-GB', 'en-gb'], ['fr-FR', 'fr'],
  ['de-DE', 'de'], ['es-ES', 'es'], ['it-IT', 'it'], ['pt-BR', 'pt-br'], ['zh-CN', 'cmn'],
] as const;
const variants = [
  ['m1', 'Nam 1', 'male'], ['f2', 'Nữ 2', 'female'],
  ['m2', 'Nam 2', 'male'], ['m3', 'Nam 3', 'male'],
  ['f1', 'Nữ 1', 'female'], ['f3', 'Nữ 3', 'female'],
] as const;
export const ESPEAK_VOICES: TtsVoice[] = languages.flatMap(([language, voice]) => variants.map(([variant, name, gender]) => ({
  id: `${voice}+${variant}`, name: `${name} · tổng hợp`, language, gender,
})));
