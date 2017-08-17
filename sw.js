const CACHE_VERSION = 1;

self.addEventListener('install', function(event) {
//Caching
  event.waitUntil(
    caches.open(CACHE_VERSION.toString()).then(function(cache) {
      return cache.addAll([
        'index.html',
        'sw.js',
        'scripts/app.js',
        'scripts/three.min.js',
        'scripts/fft.js',
        'resources/forward2.mp4',
        'resources/backward2.mp4',
      ]);
    })
  );
});

this.addEventListener('fetch', function(event) {
//Retrieval from cache
        try {
                event.respondWith(caches.match(event.request).then(function(response) {
                if (response !== undefined) {
                        return response;
                } else {
                        return fetch(event.request).then(function (response) {
                //Response may be used only once so need to save clone to put one copy in cache and serve second one
                let responseClone = response.clone();
                caches.open(CACHE_VERSION.toString()).then(function (cache) {
                        cache.put(event.request, responseClone);
                });
                return response;
                })
                }
                }));
        } catch(err) {
                console.log("Error:", err);
        }
});

