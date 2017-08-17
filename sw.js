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

self.addEventListener('fetch', function(event) {
//Retrieval from cache
    event.respondWith(caches.open(CACHE_NAME + CACHE_VERSION.toString()).then(function(cache) {
        return cache.match(event.request).then(function(response) {
            var fetchPromise = fetch(event.request).then(function(networkResponse) {
                //If there's a response from the network, update the cache
                if (networkResponse) {
                    cache.put(event.request, networkResponse.clone()).catch(
                                TypeError, function(e) {}       //Suppress TypeError
                        );
                }
                return networkResponse;
            }, function (e) {
                //Rejected promise will be ignored, it means we're offline
                ;
            });

            //Respond primarily from the cache, or secondarily the network
            return response || fetchPromise;
        });
    }));
});



