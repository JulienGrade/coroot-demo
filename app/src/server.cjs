const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { catalog, payment, priceOrder, readFault } = require('./workload.cjs');

function createServer({ role, pool, catalogUrl, paymentUrl, faultPath, version = '1.0', logger = console.log }) {
  const publicFiles = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/client.js': ['client.js', 'text/javascript; charset=utf-8'],
    '/assets/Comfortaa.ttf': ['assets/Comfortaa.ttf', 'font/ttf'],
  };

  async function upstream(base, path, requestId) {
    const response = await fetch(base + path, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Dépendance HTTP ${response.status}`);
    return body;
  }

  return http.createServer(async (req, res) => {
    const started = performance.now();
    const requestId = randomUUID();
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-app-version', version);
    res.setHeader('x-content-type-options', 'nosniff');
    res.on('finish', () => {
      if (!url.pathname.startsWith('/health/')) {
        logger(JSON.stringify({ time: new Date().toISOString(), service: role, version,
          level: res.statusCode >= 500 ? 'error' : 'info', message: 'http_request_completed',
          request_id: requestId, parent_request_id: req.headers['x-request-id'] || null,
          method: req.method, path: url.pathname, status: res.statusCode,
          duration_ms: Math.round(performance.now() - started) }));
      }
    });
    function json(status, body) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    }
    try {
      if (req.method === 'GET' && url.pathname === '/health/live') return json(200, { live: true });
      if (req.method === 'GET' && url.pathname === '/health/ready') {
        if (role === 'catalog') await pool.query('SELECT 1 FROM products LIMIT 1');
        return json(200, { ready: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/info') return json(200, { service: role, version });
      if (role === 'gateway' && req.method === 'GET' && publicFiles[url.pathname]) {
        const [file, type] = publicFiles[url.pathname];
        res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'");
        const data = await readFile(`${__dirname}/../public/${file}`);
        res.writeHead(200, { 'Content-Type': type });
        return res.end(data);
      }
      if (req.method === 'GET' && url.pathname === '/api/products') {
        if (role === 'catalog') return json(200, await catalog(pool, readFault(faultPath)));
        if (role === 'gateway') return json(200, await upstream(catalogUrl, '/api/products', requestId));
      }
      if (role === 'payment' && req.method === 'POST' && url.pathname === '/api/pay') {
        const result = payment(readFault(faultPath), version, Number(url.searchParams.get('amount')));
        return json(result.status, result.body);
      }
      if (role === 'gateway' && req.method === 'POST' && url.pathname === '/api/checkout') {
        const products = await upstream(catalogUrl, '/api/products', requestId);
        const total = priceOrder([{ ...products[0], quantity: 1 }]);
        const response = await fetch(`${paymentUrl}/api/pay?amount=${total}`, {
          method: 'POST', headers: { 'x-request-id': requestId }, signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`Paiement HTTP ${response.status}`);
        const receipt = await response.json();
        return json(201, { order_id: randomUUID(), product: products[0].name, ...receipt });
      }
      return json(404, { error: 'Route inconnue' });
    } catch (error) {
      logger(JSON.stringify({ time: new Date().toISOString(), service: role,
        level: 'error', message: 'upstream_request_failed',
        request_id: requestId, event: 'request_failed', error: error.message,
        cause_code: error.cause?.code || null, cause_message: error.cause?.message || null }));
      return json(503, { error: 'Service temporairement indisponible', request_id: requestId });
    }
  });
}

if (require.main === module) {
  const { Pool } = require('pg');
  const role = process.env.ROLE;
  if (!['gateway', 'catalog', 'payment'].includes(role)) throw new Error('ROLE invalide');
  const pool = role === 'catalog' ? new Pool({ max: 6, connectionTimeoutMillis: 1000,
    statement_timeout: 2500, query_timeout: 3000, application_name: 'catalog' }) : null;
  pool?.on('error', error => console.error(JSON.stringify({
    time: new Date().toISOString(), level: 'error', message: 'sql_connection_lost',
    service: role, event: 'sql_pool_error', code: error.code,
  })));
  const server = createServer({ role, pool, version: process.env.APP_VERSION || '1.0',
    catalogUrl: process.env.CATALOG_URL, paymentUrl: process.env.PAYMENT_URL,
    faultPath: process.env.FAULT_PATH });
  server.listen(3000, '0.0.0.0');
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  process.on('SIGTERM', () => {
    server.close(async () => { await pool?.end(); process.exit(0); });
    setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 8000).unref();
  });
}

module.exports = { createServer };
