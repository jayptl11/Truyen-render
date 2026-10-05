export function splitSpeechText(text: string, limit = 240): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const sample = rest.slice(0, limit + 1);
    const punctuation = Math.max(sample.lastIndexOf('. '), sample.lastIndexOf('! '), sample.lastIndexOf('? '), sample.lastIndexOf('; '));
    const boundary = punctuation > limit / 3 ? punctuation + 1 : sample.lastIndexOf(' ');
    const cut = boundary > 0 ? boundary : limit;
    parts.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
export function textFingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${text.length}:${hash >>> 0}`;
}
