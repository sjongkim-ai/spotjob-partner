const CACHE_NAME = 'spotjob-v6';
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
  './icon-512.png'
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

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // 외부 파일(구글 폰트·카카오 이미지)은 브라우저 기본 동작에 맡김
  if (new URL(request.url).origin !== self.location.origin) return;

  // 페이지(HTML)는 네트워크 우선 → 수정 사항이 바로 반영되고, 오프라인일 때만 저장본 사용
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => saveToCache(request, response))
        .catch(() => caches.match(request, { ignoreSearch: true }).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // 아이콘·매니페스트 등 정적 파일은 저장본 우선
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => saveToCache(request, response)))
  );
});
