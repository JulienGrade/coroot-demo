const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { join } = require('node:path');

test('Le bilan de trafic sain est un message info avec zéro échec', { timeout: 20000 }, async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(req.method === 'POST' ? 201 : 200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, [join(__dirname, '../app/src/traffic.cjs')], {
    env: { ...process.env, TARGET_URL: `http://127.0.0.1:${server.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  try {
    const report = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Bilan de trafic absent')), 15000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.includes('\n')) {
          clearTimeout(timeout);
          resolve(JSON.parse(output.split('\n')[0]));
        }
      });
    });
    assert.equal(report.level, 'info');
    assert.equal(report.message, 'traffic_summary');
    assert.equal(report.service, 'traffic');
    assert.equal(report.failed_total, 0);
    assert.equal(report.failed_window, 0);
    assert.ok(report.count > 0);
    assert.equal(Object.hasOwn(report, 'errors'), false);
  } finally {
    child.kill('SIGTERM');
    await closed;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
