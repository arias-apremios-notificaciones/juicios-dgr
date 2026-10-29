/* Juicios DGR — service worker: guarda la app para abrirla sin señal.
   Los datos no pasan por acá (son de otro dominio y viven en la copia local). */
var CACHE = 'jdgr-v26';
var ARCHIVOS = ['./', 'index.html', 'estilos.css', 'app.js', 'buscar.js', 'imprimir.js', 'manifest.webmanifest',
                'icons/icono.svg', 'icons/icono-180.png', 'icons/icono-192.png', 'icons/icono-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Primero la red (para tener siempre la última versión); si no hay señal, la copia guardada.
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    var copia = r.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});
