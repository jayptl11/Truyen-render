import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

const MAX_BYTES = 2 * 1024 * 1024;
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
// Only globally routable IPv6 unicast addresses are accepted.
const publicV6 = new BlockList();
publicV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');

export class StoryFetchError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 502, code = 'SOURCE_ERROR') { super(message); this.status = status; this.code = code; }
}
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return publicV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}
export function validateSourceUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new StoryFetchError('Liên kết truyện không hợp lệ.', 400, 'INVALID_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || value.length > 4096) {
    throw new StoryFetchError('Chỉ hỗ trợ liên kết HTTP/HTTPS công khai, không có thông tin đăng nhập hoặc cổng riêng.', 400, 'INVALID_URL');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || (isIP(hostname) && !isPublicAddress(hostname))) {
    throw new StoryFetchError('Không hỗ trợ địa chỉ mạng nội bộ.', 400, 'INVALID_URL');
  }
  return url;
}

async function requestPage(url: URL, signal: AbortSignal): Promise<{ status: number; location?: string; html: string }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); reject(signal.reason); return; }
    lookup(hostname, { all: true, verbatim: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
    throw new StoryFetchError('Nguồn truyện không trỏ đến địa chỉ mạng công khai.', 400, 'INVALID_URL');
  }
  // A public IPv6 record may be unreachable from the hosting region. Try each
  // checked address under the same overall deadline; never perform a second DNS lookup.
  const candidates = [...addresses].sort((a, b) => a.family - b.family).slice(0, 4);
  let failure: unknown;
  for (const address of candidates) {
    signal.throwIfAborted();
    try { return await requestAddress(url, address, candidates.length > 1 ? AbortSignal.any([signal, AbortSignal.timeout(6500)]) : signal); }
    catch (error) {
      if (signal.aborted || error instanceof StoryFetchError) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (!['ABORT_ERR', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code)) throw error;
      failure = error;
    }
  }
  if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'ABORT_ERR') throw new StoryFetchError('Website nguồn phản hồi quá chậm sau khi thử các địa chỉ kết nối. Thử lại sau.', 504, 'SOURCE_TIMEOUT');
  throw failure;
}

function requestAddress(url: URL, address: LookupAddress, signal: AbortSignal): Promise<{ status: number; location?: string; html: string }> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      signal,
      // Pin the connection to the checked IP; keep hostname for TLS and Host.
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      headers: {
        'User-Agent': 'TruyenReader/1.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
        'Accept-Language': 'vi,en;q=0.8',
      },
    }, response => {
      const status = response.statusCode || 502;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy(); resolve({ status, location: response.headers.location, html: '' }); return;
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        reject(new StoryFetchError(status === 403 || status === 429
          ? `Website nguồn từ chối tải nội dung (HTTP ${status}). Có thể cần mở trang gốc để xác minh hoặc đăng nhập.`
          : `Website nguồn trả về HTTP ${status}.`, 502, status === 403 || status === 429 ? 'SOURCE_BLOCKED' : 'SOURCE_ERROR'));
        return;
      }
      const type = response.headers['content-type'] || '';
      if (type && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) {
        response.destroy(); reject(new StoryFetchError('Nguồn không trả về trang HTML.', 422, 'INVALID_CONTENT')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { response.destroy(new StoryFetchError('Trang nguồn quá lớn (tối đa 2 MB).', 413, 'PAGE_TOO_LARGE')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          let body = Buffer.concat(chunks);
          const encoding = response.headers['content-encoding'];
          const options = { maxOutputLength: MAX_BYTES };
          if (encoding === 'gzip') body = gunzipSync(body, options);
          else if (encoding === 'br') body = brotliDecompressSync(body, options);
          else if (encoding === 'deflate') body = inflateSync(body, options);
          const prefix = body.subarray(0, 4096).toString('ascii');
          const metaCharset = prefix.match(/<meta\b[^>]*charset\s*=\s*["']?([a-z\d_-]+)/i)?.[1];
          const charset = type.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] || metaCharset || 'utf-8';
          resolve({ status, html: new TextDecoder(charset).decode(body) });
        } catch { reject(new StoryFetchError('Không giải mã được nội dung trang nguồn.', 422, 'INVALID_CONTENT')); }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

export async function fetchStoryPage(value: string, signal?: AbortSignal): Promise<{ html: string; sourceUrl: string }> {
  const timeout = AbortSignal.timeout(20000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let url = validateSourceUrl(value);
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      combined.throwIfAborted();
      const page = await requestPage(url, combined);
      if (page.location) { url = validateSourceUrl(new URL(page.location, url).href); continue; }
      if (!page.html.trim()) throw new StoryFetchError('Website nguồn trả về nội dung trống.', 422, 'INVALID_CONTENT');
      return { html: page.html, sourceUrl: url.href };
    }
    throw new StoryFetchError('Website nguồn chuyển hướng quá nhiều lần.');
  } catch (error) {
    if (error instanceof StoryFetchError) throw error;
    if (combined.aborted) throw new StoryFetchError('Website nguồn không phản hồi trong 20 giây. Thử lại sau hoặc mở trang gốc để kiểm tra.', 504, 'SOURCE_TIMEOUT');
    throw new StoryFetchError('Server không kết nối được đến website nguồn. Thử lại sau.', 502, 'SOURCE_UNREACHABLE');
  }
}
