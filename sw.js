const CACHE = 'moe-01c2b1e132', FILES = ["./","index.html","graph.js","map.js","spellcore.js","synccore.js","mobile-api.js","manifest.webmanifest","icons/icon-256.png"];
// cache: 'reload' — брать файлы с сервера, а не старые копии из кэша браузера
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Google и YouTube — мимо кэша
  // сначала сеть (обновления приходят сразу), без сети — сохранённая копия
  // ponytail: при очень плохой сети ждём ответа сервера; если станет мешать — добавить тайм-аут
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
