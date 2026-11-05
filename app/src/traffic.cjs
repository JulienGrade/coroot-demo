const { setTimeout: delay } = require('node:timers/promises');
const target = process.env.TARGET_URL || 'http://gateway:3000';
let running = true;
let total = 0;
let failedTotal = 0;
let failedWindow = 0;
let durations = [];
process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });

async function worker() {
  while (running) {
    const checkout = Math.random() < 0.6;
    const started = performance.now();
    try {
      const response = await fetch(target + (checkout ? '/api/checkout' : '/api/products'), {
        method: checkout ? 'POST' : 'GET', signal: AbortSignal.timeout(6000),
      });
      await response.arrayBuffer();
      if (!response.ok) {
        failedTotal++;
        failedWindow++;
      }
    } catch {
      failedTotal++;
      failedWindow++;
    }
    total++;
    durations.push(performance.now() - started);
    await delay(200);
  }
}
const report = setInterval(() => {
  durations.sort((a, b) => a - b);
  console.log(JSON.stringify({ time: new Date().toISOString(),
    level: 'info', message: 'traffic_summary', service: 'traffic',
    total, failed_total: failedTotal, failed_window: failedWindow,
    window: '10s', count: durations.length,
    p95_ms: Math.round(durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] || 0) }));
  durations = [];
  failedWindow = 0;
}, 10000);
Promise.all(Array.from({ length: 4 }, () => worker())).finally(() => clearInterval(report));
