// ガクツク Service Worker — アプリ本体はキャッシュ優先、CDN/モデル/フォントは stale-while-revalidate
const CACHE = 'gakutsuku-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CDN_HOSTS = ['cdn.jsdelivr.net', 'esm.run', 'storage.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(e.request.method !== 'GET') return;

  // アプリ本体（同一オリジン）: キャッシュ優先 + 裏で更新
  if(url.origin === location.origin){
    e.respondWith(
      caches.match(e.request).then(hit => {
        const update = fetch(e.request)
          .then(res => { if(res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
          .catch(() => hit);
        return hit || update;
      })
    );
    return;
  }

  // CDN・モデル・音源・フォント: stale-while-revalidate（2回目以降はオフラインでも動く）
  if(CDN_HOSTS.some(h => url.hostname.endsWith(h))){
    e.respondWith(
      caches.match(e.request).then(hit => {
        const update = fetch(e.request)
          .then(res => { if(res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
          .catch(() => hit);
        return hit || update;
      })
    );
  }
});
