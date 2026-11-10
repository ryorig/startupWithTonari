const CACHE_NAME = 'tonari-pwa-v55';

const APP_SHELL = [
  './',
  './index.html',
  './company.html',
  './projects.html',
  './guide.html',
  './faq.html',
  './about.html',
  './lp.css?v=lp-figma-43',
  './lp.js?v=lp-figma-43',
  './arrow3d.js?v=7',
  './assets/lp/fonts/noto-sans-jp-800-arrow-labels.woff',
  './portfolio-kidssafe.html',
  './portfolio-paravellum.html',
  './portfolio-sora-no-tokei.html',
  './privacy.html',
  './styles.css?v=lp-reference-38',
  './script.js?v=registration-methods-2',
  './manifest.webmanifest',
  './assets/logo.png',
  './assets/favicon.png',
  './assets/favicon-192.png',
  './assets/favicon-512.png',
  './assets/header-logo.png',
  './assets/hero-logo-vertical.png',
  './assets/hero-startup-image.jpg',
  './assets/hero-startup-visual.jpg',
  './assets/problem-illustration.png',
  './assets/problem-section.png',
  './assets/our-product-overview.png',
  './assets/representative.jpg',
  './assets/partner-akatsuki-latest.webp',
  './assets/partner-nict.webp',
  './assets/partner-program-clean.png',
  './assets/partner-mic-clean.png',
  './assets/partner-japan-clean.png',
  './assets/partner-sanyo-clean.png',
  './assets/pitch-deck.pdf',
  './assets/portfolio-code4fukui.png',
  './assets/portfolio-paravellum.webp',
  './assets/portfolio-convex.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }))
  );
});
