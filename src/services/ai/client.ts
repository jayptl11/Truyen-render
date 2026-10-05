import type { AiProvider, TranslationStyle } from '../../types/story';
import { errorMessage } from '../errors';
import { PROVIDERS } from './providers';

export const AI_PROVIDERS: AiProvider[] = ['gemini', 'groq', 'qwen', 'deepseek', 'chatgpt'];
export const DEFAULT_AI_PRIORITY = AI_PROVIDERS;
export function normalizeAiPriority(value: unknown): AiProvider[] {
  const list = Array.isArray(value) ? value.filter((p): p is AiProvider => AI_PROVIDERS.includes(p as AiProvider)) : [];
  return [...new Set([...list, ...AI_PROVIDERS])];
}
export interface TranslationOptions {
  keys: Record<AiProvider, string[]>;
  priority: AiProvider[];
  style: TranslationStyle;
  signal?: AbortSignal;
}
function prompt(style: TranslationStyle): string {
  return `Viết lại văn bản convert Hán Việt sang tiếng Việt mượt mà, ${style === 'ancient'
    ? 'phong cách cổ trang. Xưng hô: hắn/y/nàng/ta/ngươi.'
    : 'phong cách hiện đại tự nhiên. Xưng hô: anh/em/cậu/tớ tùy ngữ cảnh.'}
Giữ đầy đủ nội dung và cấu trúc đoạn văn, tên nhân vật và số chương. Chỉ trả kết quả, không thêm lời giới thiệu.`;
}
interface GeminiResult { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] }
interface ChatResult { choices?: { finish_reason?: string; message?: { content?: string } }[] }
async function request(provider: AiProvider, model: string, key: string, text: string, instruction: string, signal?: AbortSignal): Promise<Response> {
  const config = PROVIDERS[provider];
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
  if (provider === 'gemini') {
    const body = JSON.stringify({ contents: [{ parts: [{ text: `${instruction}\n\n${text}` }] }] });
    const call = (version: string) => fetch(`${config.endpoint}/${version}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: requestSignal,
    });
    const result = await call('v1beta');
    return result.status === 404 ? call('v1') : result;
  }
  return fetch(config.endpoint, {
    method: 'POST', signal: requestSignal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: instruction }, { role: 'user', content: text }],
      temperature: 0.25, ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}) }),
  });
}
async function generate(text: string, instruction: string, options: TranslationOptions): Promise<string> {
  let lastError = 'Chưa cấu hình API key.';
  for (const provider of normalizeAiPriority(options.priority)) {
    const keys = options.keys[provider].map(key => key.trim()).filter(Boolean);
    for (const key of keys) {
      for (const model of PROVIDERS[provider].models) {
        options.signal?.throwIfAborted();
        try {
          const response = await request(provider, model, key, text, instruction, options.signal);
          if (!response.ok) {
            lastError = `${provider}/${model}: HTTP ${response.status}${response.status === 402 ? ' (cần thanh toán)' : response.status === 429 ? ' (hết hạn mức)' : ''}`;
            // An invalid key or billing requirement cannot be fixed by switching model.
            if ([401, 403, 402].includes(response.status)) break;
            continue;
          }
          const data = await response.json() as GeminiResult & ChatResult;
          const candidate = data.candidates?.[0];
          const choice = data.choices?.[0];
          if (candidate?.finishReason === 'MAX_TOKENS' || choice?.finish_reason === 'length') {
            lastError = `${provider}/${model}: bản dịch bị cắt do giới hạn độ dài. Hãy chia nội dung thành phần nhỏ hơn.`;
            continue;
          }
          const result = provider === 'gemini' ? candidate?.content?.parts?.map(part => part.text || '').join('') : choice?.message?.content;
          if (typeof result === 'string' && result.trim()) return result.trim();
          lastError = `${provider}/${model}: kết quả trống.`;
        } catch (error) {
          if (options.signal?.aborted) throw error;
          // Exclude request URLs/keys from messages shown to users and diagnostics.
          lastError = `${provider}/${model}: ${error instanceof DOMException && error.name === 'TimeoutError' ? 'hết thời gian chờ' : 'không gọi được API'}`;
        }
      }
    }
  }
  throw new Error(lastError);
}
export async function translateText(text: string, options: TranslationOptions): Promise<string> {
  const result = await generate(text, prompt(options.style), options);
  return result.replace(/^(Đây là bản dịch|Dưới đây là|Bản dịch:).{0,50}\n/i, '').replace(/\*\*/g, '').trim();
}
export async function analyzeText(text: string, type: 'summary' | 'explain', options: TranslationOptions): Promise<string> {
  try {
    return await generate(text, type === 'summary' ? 'Tóm tắt nội dung chương truyện thành 3–5 ý chính bằng tiếng Việt.' : 'Giải thích các thuật ngữ Tiên Hiệp/Hán Việt khó hiểu trong chương bằng tiếng Việt.', options);
  } catch (error) { throw new Error(errorMessage(error)); }
}
