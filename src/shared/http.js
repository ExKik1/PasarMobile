'use strict';

const http = require('http');

/**
 * Helper HTTP berbasis modul bawaan Node.js (tanpa Express/axios).
 * Tujuannya supaya proyek bisa berjalan tanpa dependency eksternal sama sekali.
 */

/**
 * Mengirim HTTP request dan menunggu response (synchronous dari sudut pandang pemanggil).
 * Mengembalikan Promise berisi { status, body }.
 */
function request(options, payload) {
  return new Promise((resolve, reject) => {
    const data = payload != null ? JSON.stringify(payload) : null;
    const req = http.request(
      {
        method: options.method || 'GET',
        host: options.host || '127.0.0.1',
        port: options.port,
        path: options.path || '/',
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(options.headers || {}),
        },
        timeout: options.timeout || 5000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let body = raw;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch (_) {
            /* biarkan sebagai string mentah */
          }
          resolve({ status: res.statusCode, body });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });

    if (data) req.write(data);
    req.end();
  });
}

/**
 * Membuat server JSON sederhana dengan routing berbasis "METHOD path".
 * routes: { 'POST /api/x': async (body, req) => ({ status, body }) }
 */
function createJsonServer(routes) {
  return http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      const key = `${req.method} ${req.url.split('?')[0]}`;
      const handler = routes[key];
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (!handler) {
        return send(404, { error: 'NOT_FOUND', path: key });
      }

      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (_) {
        return send(400, { error: 'INVALID_JSON' });
      }

      try {
        const result = await handler(parsed, req);
        send(result.status || 200, result.body);
      } catch (err) {
        send(500, { error: 'INTERNAL_ERROR', message: err.message });
      }
    });
  });
}

module.exports = { request, createJsonServer };
