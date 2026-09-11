const CACHE_NAME = 'spotjob-v7';
const APP_SHELL = [
  './',
  './index.html',
  './jobseeker.html',
  './owner.html',
  './manifest.webmanifest',
  './manifest-partner.webmanifest',
  './manifest-owner.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './js/legal.js',
  './js/schema.js',
  './js/matching.js',
  './js/workflow.js',
  './js/seed.js',
  './js/dom.js',
  './js/store.js',
  './js/ui-partner.js',
  './js/ui-owner.js',
  './js/ui-admin.js',
  './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

// 정상 응답(200번대)만 저장 — 404·500이 캐시에 남아 계속 보이는 일을 막음
function saveToCache(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
  }
  return response;
}

// 같은 출처 파일은 모두 네트워크 우선 — HTML과 JS가 서로 다른 버전으로 섞이지 않게 하고,
// 오프라인일 때만 저장본을 쓴다. 외부 파일(구글 폰트·카카오 이미지)은 브라우저 기본 동작에 맡김
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => saveToCache(request, response))
      .catch(() => caches.match(request, { ignoreSearch: true }).then(cached => {
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
