/* ============================================================================
 *  Service worker — offline + PWA support.
 *
 *  Strategy: NETWORK-FIRST for everything.
 *  - While online, always fetch the freshest version (no stale caches during
 *    development).
 *  - When offline, fall back to the cached copy so the game still loads.
 *
 *  This keeps the experience fresh for players and safe to iterate on.
 * ============================================================================ */

'use strict';

var CACHE = 'green-hills-v1';

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return cache.addAll([
                './',
                './index.html',
                './engine.js',
                './style.css',
                './level1.json',
                './manifest.json',
                './favicon.png',
                './icons/Icon-192.png',
                './icons/Icon-512.png'
            ]).catch(function () {});
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

    event.respondWith(
        fetch(event.request)
            .then(function (response) {
                /* Cache a clean copy of successful responses. */
                if (response && response.ok) {
                    var clone = response.clone();
                    caches.open(CACHE).then(function (cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(function () {
                return caches.match(event.request).then(function (cached) {
                    return cached || caches.match('./index.html');
                });
            })
    );
});
