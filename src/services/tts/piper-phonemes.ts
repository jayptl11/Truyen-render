export interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  phoneme_id_map: Record<string, number[]>;
  num_symbols: number;
  num_speakers: number;
}

/** Use each model's alphabet, as Piper does, rather than the WASM's default IDs. */
export function piperPhonemeIds(phonemes: string[], config: PiperConfig): number[] {
  const map = config.phoneme_id_map;
  if (!map['^'] || !map['_'] || !map['$']) throw new Error('Cấu hình âm vị Piper thiếu ký hiệu bắt đầu/kết thúc.');
  const ids = [...map['^']];
  let mapped = 0;
  for (const phoneme of phonemes) {
    // Older Vietnamese models do not include the tone digits emitted by newer eSpeak.
    // Piper's reference implementation skips symbols absent from the model alphabet.
    if (!Object.hasOwn(map, phoneme)) continue;
    ids.push(...map[phoneme], ...map['_']); mapped++;
  }
  ids.push(...map['$']);
  if (!mapped) throw new Error('Model Piper không nhận diện được âm vị của đoạn này.');
  if (ids.some(id => !Number.isInteger(id) || id < 0 || id >= config.num_symbols)) {
    throw new Error('Bảng âm vị không khớp model Piper. Thử tải lại model hoặc chọn giọng khác.');
  }
  return ids;
}
