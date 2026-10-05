import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const bundle = buildSync({ entryPoints: ['api/story.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const serviceBundle = buildSync({ entryPoints: ['server/story.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
function load(code, overrides = {}) {
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: name => overrides[name] || require(name), Buffer, URL, TextDecoder, AbortSignal, AbortController });
  return module.exports;
}
function getService(overrides) { return load(serviceBundle, overrides); }

test('server rejects private, metadata, reserved and credential-bearing destinations', () => {
  const service = getService();
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2002:7f00:1::', '2001:db8::1']) {
    assert.equal(service.isPublicAddress(ip), false, ip);
  }
  assert.equal(service.isPublicAddress('8.8.8.8'), true);
  assert.equal(service.isPublicAddress('2606:4700:4700::1111'), true);
  for (const url of ['http://127.1/', 'http://2130706433/', 'http://[::1]/', 'https://localhost/', 'https://x.local/', 'file:///etc/passwd', 'https://user:pass@example.com/', 'https://example.com:8080/']) {
    assert.throws(() => service.validateSourceUrl(url), error => error.code === 'INVALID_URL', url);
  }
  assert.equal(service.validateSourceUrl('https://webnovel.vn/tien-nghich/chuong-1/').hostname, 'webnovel.vn');
});

test('DNS checks run before connecting, including private records in mixed DNS results', async () => {
  let requests = 0;
  const service = getService({
    'node:dns/promises': { lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }] },
    'node:https': { request: () => { requests++; throw Error('must not connect'); } },
  });
  await assert.rejects(service.fetchStoryPage('https://example.com/chapter'), error => error.code === 'INVALID_URL');
  assert.equal(requests, 0);
});

test('cancelling during DNS resolution does not wait for stalled DNS', async () => {
  const service = getService({ 'node:dns/promises': { lookup: () => new Promise(() => {}) } });
  const controller = new AbortController();
  const task = service.fetchStoryPage('https://example.com/chapter', controller.signal);
  controller.abort();
  await assert.rejects(task, error => error.status === 504);
});

test('API returns HTML and final URL, bounds pages, and rechecks redirect destinations', async t => {
  const text = '<html><h1>Chương 1</h1><div class="chapter-content"><p>Một đoạn truyện.</p></div></html>';
  const origin = createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/chapter' }); res.end(); }
    else if (req.url === '/private') { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); }
    else if (req.url === '/blocked') { res.writeHead(403); res.end('Forbidden'); }
    else if (req.url === '/large') { res.setHeader('Content-Type', 'text/html'); res.end('x'.repeat(2 * 1024 * 1024 + 1)); }
    else if (req.url === '/compressed') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Encoding', 'gzip'); res.end(gzipSync(text)); }
    else if (req.url === '/compressed-large') { res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Encoding', 'gzip'); res.end(gzipSync('x'.repeat(3 * 1024 * 1024))); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(text); }
  });
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => origin.close(resolve)));
  const pinned = [];
  const routeToFixture = (url, options, callback) => {
    options.lookup(url.hostname, {}, (error, address) => { assert.equal(error, null); pinned.push(address); });
    options.lookup(url.hostname, { all: true }, (error, addresses) => { assert.equal(error, null); assert.equal(addresses[0].address, '8.8.8.8'); });
    return request(`http://127.0.0.1:${origin.address().port}${url.pathname}`, { ...options, lookup: undefined }, callback);
  };
  const handler = load(bundle, {
    'node:dns/promises': { lookup: async () => [{ address: '8.8.8.8', family: 4 }] },
    'node:https': { request: routeToFixture },
    'node:http': { request: routeToFixture },
  }).default;
  const api = createServer((req, res) => { void handler(req, res); });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => api.close(resolve)));
  const call = (path, options) => fetch(`http://127.0.0.1:${api.address().port}/api/story${path === null ? '' : `?url=${encodeURIComponent('https://example.com' + path)}`}`, options);
  const success = await call('/redirect');
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { html: text, sourceUrl: 'https://example.com/chapter' });
  assert.match(success.headers.get('cache-control'), /s-maxage=300/);
  assert.ok(pinned.every(ip => ip === '8.8.8.8'));
  assert.equal((await (await call('/compressed')).json()).html, text);
  assert.equal((await call('/private')).status, 400);
  assert.equal((await (await call('/blocked')).json()).code, 'SOURCE_BLOCKED');
  assert.equal((await call('/large')).status, 413);
  assert.equal((await call('/compressed-large')).status, 422);
  assert.equal((await call(null)).status, 400);
  assert.equal((await call('/chapter', { method: 'POST' })).status, 405);
});
