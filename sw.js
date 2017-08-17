const CACHE_NAME = "websensor-video";
const CACHE_VERSION = 1;

self.addEventListener('install', function(event) {
//Caching
  event.waitUntil(
    caches.open(CACHE_NAME + CACHE_VERSION.toString()).then(function(cache) {
      return cache.addAll([
        'index.html',
        'sw.js',
        'scripts/app.js',
        'scripts/three.min.js',
        'scripts/fft.js',
        'resources/forward2.mp4',
        'resources/backward2.mp4'
      ]);
    })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
  );
});

this.addEventListener('fetch', function(event) {
//Retrieval from cache
        event.respondWith(caches.match(event.request).then(function(response) {
                if (response !== undefined) {
                        return response;
                } else {
                        return fetch(event.request).then(function (response) {
                /*//Response may be used only once so need to save clone to put one copy in cache and serve second one
                let responseClone = response.clone();
                caches.open(CACHE_NAME + CACHE_VERSION.toString()).then(function (cache) {
                                cache.put(event.request, responseClone).catch(
                                TypeError, function(e) {}       //Suppress TypeError
                                );
                }*/);
                return response;
                })
                }
        }));
});


