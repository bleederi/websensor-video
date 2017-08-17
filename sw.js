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
    event.respondWith(caches.open(CACHE_NAME + CACHE_VERSION.toString()).then(function(cache) {
        return cache.match(event.request).then(function(response) {
            //console.log("cache request: " + event.request.url);
            var fetchPromise = fetch(event.request).then(function(networkResponse) {
                // if we got a response from the cache, update the cache
                //console.log("fetch completed: " + event.request.url, networkResponse);
                if (networkResponse) {
                    //console.debug("updated cached page: " + event.request.url, networkResponse);
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            }, function (e) {
                // rejected promise - just ignore it, we're offline
                //console.log("Error in fetch()", e);
                ;
            });

            // respond from the cache, or the network
            return response || fetchPromise;
        });
    }));
});



