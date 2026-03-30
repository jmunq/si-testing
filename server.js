#!/usr/bin/env node
/**
 * Local HTTPS server for Session Replay testing.
 * - Serves static files (index.html, login.html, profile.html, etc.)
 * - Proxies Qualtrics Session Replay ingestion to avoid CORS when testing locally.
 *
 * Run: node server.js
 * Then open: https://localhost:8443
 * (Accept the self-signed cert in the browser.)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8443;
const HOST = '0.0.0.0';
const QUALTRICS_ORIGIN = 'https://sr.st3.qualtrics.com';
const PROXY_PREFIX = '/sr-proxy';

const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('Missing cert.pem or key.pem. Generate with:');
  console.error('  openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"');
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function serveStatic(filePath, res) {
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function proxyToQualtrics(req, res, pathname, search) {
  const targetPath = pathname.replace(/^\/sr-proxy/, '');
  const targetUrl = `${QUALTRICS_ORIGIN}${targetPath}${search || ''}`;
  const parsed = url.parse(targetUrl);

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: parsed.path,
    method: req.method,
    headers: { ...req.headers, host: parsed.host },
    rejectUnauthorized: false,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    delete headers['transfer-encoding'];
    headers['access-control-allow-origin'] = req.headers.origin || '*';
    headers['access-control-allow-credentials'] = 'true';
    res.writeHead(proxyRes.statusCode || 200, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq);
}

function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.startsWith(PROXY_PREFIX)) {
    proxyToQualtrics(req, res, pathname, parsed.search);
    return;
  }

  // Multi-page routing: each "process" is a separate HTML document (like the real site).
  // Navigating between processes causes a full page load, re-requesting SIE and all assets.
  if (pathname.includes('/CreateSecureThingsProcess')) {
    serveStatic(path.join(__dirname, 'secure-things.html'), res);
    return;
  }
  if (pathname.includes('/CreateGadgetQuotePublicProcess')) {
    serveStatic(path.join(__dirname, 'gadget-quote.html'), res);
    return;
  }

  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!path.extname(filePath)) {
    if (!pathname.endsWith('/')) filePath += '.html';
    else filePath = path.join(filePath, 'index.html');
  }
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveStatic(filePath, res);
}

const server = https.createServer(
  {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  },
  handleRequest
);

server.listen(PORT, HOST, () => {
  console.log(`HTTPS server running at https://${HOST}:${PORT}`);
  console.log('Open that URL in your browser and accept the self-signed certificate.');
  console.log('Session Replay requests are proxied to avoid CORS.');
});
