import type { AiProvider } from '../../types/story';
export interface ProviderConfig {
  endpoint: string;
  models: string[];
  maxTokens?: number;
}
/** Provider-specific settings live here; reader and TTS never depend on them. */
export const PROVIDERS: Record<AiProvider, ProviderConfig> = {
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite', 'gemini-2.0-flash-lite-001'],
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['qwen/qwen3-32b', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'openai/gpt-oss-20b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.1-8b-instant'],
    maxTokens: 8192,
  },
  qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
  deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', models: ['deepseek-chat'] },
  chatgpt: { endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o'], maxTokens: 4000 },
};
