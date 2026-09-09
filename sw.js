/* ============================================================================
 *  Service worker - offline + PWA support.
 *
 *  Strategy
 *  ---------
 *  - PRECACHE: install-time cache of all critical static assets.
 *  - RUNTIME:  network-first for navigations, JSON, and level data so users
 *              always get fresh content; cache-first for hashed / static
 *              assets to make repeat loads instant.
 *  - Old caches are deleted on activation.
 * ============================================================================ */

'use strict';

var CACHE = 'green-hills-v3';
var RUNTIME_CACHE = 'green-hills-runtime-v3';

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
                if (key !== CACHE && key !== RUNTIME_CACHE) return caches.delete(key);
            }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;

    var url = new URL(request.url);
    var sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin) return;   /* ignore third-party requests */

    var isNavigation = request.mode === 'navigate';
    var isLevelData = /\.json$/.test(url.pathname);
    var isHTML = /\.html$/.test(url.pathname) || isNavigation;

    /* Network-first for navigations, HTML, and level data. */
    if (isNavigation || isLevelData || isHTML) {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    if (response && response.ok) {
                        var clone = response.clone();
                        caches.open(RUNTIME_CACHE).then(function (cache) {
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
                    caches.open(RUNTIME_CACHE).then(function (cache) {
                        cache.put(request, clone);
                    });
                }
                return response;
            }).catch(function () {
                /* If the asset is not in the cache and the network is down,
                   return a tiny 503 so the app can still render. */
                return new Response('', { status: 503, statusText: 'Offline' });
            });
        })
    );
});
