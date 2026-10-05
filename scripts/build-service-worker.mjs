import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('dist/assets')).filter(file => /\.(js|css|woff2?)$/.test(file)).map(file => `/assets/${file}`);
const html = await readFile('dist/index.html', 'utf8');
const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
const assets = ['/index.html', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png', ...files];
await writeFile('dist/sw.js', `const CACHE = 'truyen-shell-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('truyen-shell-') && key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])));
self.addEventListener('message', event => { if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch { return (await caches.open(CACHE)).match('/index.html', { ignoreVary: true }); }
    })()); return;
  }
  if (ASSETS.includes(url.pathname)) event.respondWith(caches.open(CACHE).then(async cache => await cache.match(request, { ignoreVary: true }) || fetch(request)));
});
`);
