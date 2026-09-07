/* ============================================================================
 *  Service worker - offline + PWA support.
 *
 *  Strategy: NETWORK-FIRST for HTML and data so players always get fresh
 *  versions, with a cached fallback for offline play. Static assets are also
 *  cached opportunistically so the experience is fast and resilient.
 * ============================================================================ */

'use strict';

var CACHE = 'green-hills-v2';

var PRECACHE = [
    './',
    './index.html',
    './engine.js',
    './style.css',
    './level1.json',
    './manifest.json',
    './favicon.png',
    './icons/Icon-192.png',
    './icons/Icon-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return cache.addAll(PRECACHE).catch(function () {});
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (key) {
                if (key !== CACHE) return caches.delete(key);
            }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') return;

    var request = event.request;
    var isNavigation = request.mode === 'navigate';

    /* Network-first for navigations and JSON data; cache as fallback. */
    if (isNavigation || /\.(json|html)$/.test(new URL(request.url).pathname)) {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    if (response && response.ok) {
                        var clone = response.clone();
                        caches.open(CACHE).then(function (cache) {
                            cache.put(request, clone);
                        });
                    }
                    return response;
                })
                .catch(function () {
                    return caches.match(request).then(function (cached) {
                        return cached || caches.match('./index.html');
                    });
                })
        );
        return;
    }

    /* Cache-first for static assets, with network fallback that updates the cache. */
    event.respondWith(
        caches.match(request).then(function (cached) {
            if (cached) return cached;
            return fetch(request).then(function (response) {
                if (response && response.ok) {
                    var clone = response.clone();
                    caches.open(CACHE).then(function (cache) {
                        cache.put(request, clone);
                    });
                }
                return response;
            });
        })
    );
});
