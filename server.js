#!/usr/bin/env node
/* ============================================================================
 *  Minimal, dependency-free static file server for the platformer.
 *
 *  Usage:
 *    npm start            (serves . on port 8080)
 *    node server.js 9000  (custom port)
 *
 *  Serves the current directory with safe path resolution and basic
 *  content-type mapping. Suitable for local dev and lightweight hosting.
 * ============================================================================ */

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT = __dirname;
var PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);

var MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

var server = http.createServer(function (req, res) {
    var pathname = decodeURIComponent(url.parse(req.url).pathname);
    if (pathname === '/' ) pathname = '/index.html';

    /* Security: resolve and ensure the requested file stays inside ROOT. */
    var filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, function (err, stat) {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        var ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, function () {
    console.log('Green Hills platformer serving at http://localhost:' + PORT);
});
