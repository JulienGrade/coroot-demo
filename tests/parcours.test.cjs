const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createServer } = require('../app/src/server.cjs');
const { catalog } = require('../app/src/workload.cjs');

test('Le parcours HTTP traverse les services et distingue les quatre incidents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'parcelflow-'));
  const faultPath = join(directory, 'mode');
  await writeFile(faultPath, 'normal');
  const queries = [];
  const events = [];
  const pool = { async query(sql) {
    queries.push(sql);
    return { rows: [{ id: 1, name: 'Clavier', price_cents: 8900 }] };
  } };
  const options = { faultPath, logger: event => events.push(JSON.parse(event)) };
  const servers = [];
  async function start(params) {
    const server = createServer({ ...options, ...params });
    servers.push(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    const catalogUrl = await start({ role: 'catalog', pool });
    const paymentUrl = await start({ role: 'payment' });
    const gatewayUrl = await start({ role: 'gateway', catalogUrl, paymentUrl });
    assert.equal((await fetch(gatewayUrl)).status, 200);
    const normal = await fetch(gatewayUrl + '/api/checkout', { method: 'POST' });
    assert.equal(normal.status, 201);
    assert.equal((await normal.json()).amount_cents, 8900);
    assert.ok(events.some(event => event.service === 'payment' && event.parent_request_id));
    assert.ok(events.length > 0);
    assert.ok(events.every(event => event.level === 'info' && event.message));
    await writeFile(faultPath, 'sql');
    assert.equal((await fetch(gatewayUrl + '/api/products')).status, 200);
    assert.ok(queries.includes('SELECT pg_sleep(0.7)'));
    await writeFile(faultPath, 'cpu');
    assert.equal((await fetch(gatewayUrl + '/api/checkout', { method: 'POST' })).status, 201);
    await writeFile(faultPath, 'normal');
    const badPaymentUrl = await start({ role: 'payment', version: '2.0' });
    const badGatewayUrl = await start({ role: 'gateway', catalogUrl, paymentUrl: badPaymentUrl });
    assert.equal((await fetch(badPaymentUrl + '/health/ready')).status, 200);
    assert.equal((await fetch(badGatewayUrl + '/api/products')).status, 200);
    assert.equal((await fetch(badGatewayUrl + '/api/checkout', { method: 'POST' })).status, 503);
    const unavailableUrl = await start({ role: 'gateway', catalogUrl, paymentUrl: 'http://127.0.0.1:1' });
    assert.equal((await fetch(unavailableUrl + '/health/live')).status, 200);
    assert.equal((await fetch(unavailableUrl + '/api/checkout', { method: 'POST' })).status, 503);
    const failure = events.find(event => event.event === 'request_failed' && event.error === 'fetch failed');
    assert.equal(failure.level, 'error');
    assert.equal(failure.message, 'upstream_request_failed');
    assert.ok(failure.cause_message);
    assert.equal((await fetch(gatewayUrl + '/api/checkout')).status, 404);
  } finally {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('Une panne SQL fait échouer la readiness sans couper la liveness', async () => {
  const server = createServer({ role: 'catalog', logger: () => {}, pool: {
    async query() { throw new Error('SQL indisponible'); },
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/health/live')).status, 200);
    assert.equal((await fetch(base + '/health/ready')).status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('Catalogue et délai SQL exécutés sur PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL absent, intégration PostgreSQL non exécutée',
}, async () => {
  const { Pool } = require('../app/node_modules/pg');
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query('CREATE TEMP TABLE products (id int, name text, price_cents int)');
    await pool.query("INSERT INTO products VALUES (1, 'Clavier', 8900)");
    const started = performance.now();
    const products = await catalog(pool, 'sql');
    assert.ok(performance.now() - started >= 650);
    assert.equal(products[0].price_cents, 8900);
  } finally {
    await pool.end();
  }
});
