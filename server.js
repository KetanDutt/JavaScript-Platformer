#!/usr/bin/env node
/* ============================================================================
 *  Minimal, dependency-free static file server for the platformer.
 *
 *  Usage:
 *    npm start             (serves the project on port 8080)
 *    node server.js 9000   (custom port)
 *
 *  Includes:
 *    - Safe path resolution (no path traversal)
 *    - Static MIME types
 *    - Security headers (nosniff, referrer-policy, frame-options)
 *    - Optional gzip for common text assets (uses Node's built-in zlib)
 *    - Redirects '/' to '/index.html'
 *    - Graceful file-not-found handling
 * ============================================================================ */

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');
var zlib = require('zlib');

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
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8'
};

var GZIP_TYPES = ['.html', '.js', '.css', '.json', '.txt', '.md', '.svg', '.xml', '.ico'];

function send(req, res, status, headers, body) {
    headers = headers || {};
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['Referrer-Policy'] = 'same-origin';
    res.writeHead(status, headers);
    res.end(body);
}

var server = http.createServer(function (req, res) {
    var pathname;
    try {
        pathname = decodeURIComponent(url.parse(req.url).pathname);
    } catch (e) {
        send(req, res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');
        return;
    }

    if (pathname === '/') pathname = '/index.html';

    /* Security: resolve and guarantee the requested file stays inside ROOT. */
    var filePath = path.normalize(path.join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
        send(req, res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
        return;
    }

    fs.stat(filePath, function (err, stat) {
        if (err || !stat.isFile()) {
            send(req, res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '404 Not Found');
            return;
        }

        var ext = path.extname(filePath).toLowerCase();
        var type = MIME[ext] || 'application/octet-stream';
        var cacheControl = ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'no-cache';
        var headers = {
            'Content-Type': type,
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'"
        };

        var acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '') &&
            GZIP_TYPES.indexOf(ext) !== -1;

        if (req.method === 'HEAD') {
            headers['Content-Length'] = String(stat.size);
            send(req, res, 200, headers, undefined);
            return;
        }

        if (acceptsGzip) {
            fs.readFile(filePath, function (readErr, data) {
                if (readErr) {
                    send(req, res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Read error');
                    return;
                }
                zlib.gzip(data, function (gzipErr, buf) {
                    if (gzipErr || buf.length >= data.length) {
                        headers['Content-Length'] = String(data.length);
                        send(req, res, 200, headers, data);
                    } else {
                        headers['Content-Encoding'] = 'gzip';
                        headers['Content-Length'] = String(buf.length);
                        headers['Vary'] = 'Accept-Encoding';
                        send(req, res, 200, headers, buf);
                    }
                });
            });
            return;
        }

        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, function () {
    console.log('Green Hills platformer serving at http://localhost:' + PORT);
});
