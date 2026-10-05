import { parseStoryHtml } from './extract';
import { loadSource } from './transport';
export { storyUrl } from './profiles';
export { parseStoryHtml } from './extract';
export async function fetchRawStoryData(value: string, signal?: AbortSignal) {
  return loadSource(value, ({ html, url }) => parseStoryHtml(html, url), signal);
}
