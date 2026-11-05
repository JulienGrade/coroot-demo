const { setTimeout: delay } = require('node:timers/promises');
const target = process.env.TARGET_URL || 'http://gateway:3000';
let running = true;
let total = 0;
let errors = 0;
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
      if (!response.ok) errors++;
    } catch {
      errors++;
    }
    total++;
    durations.push(performance.now() - started);
    await delay(200);
  }
}
const report = setInterval(() => {
  durations.sort((a, b) => a - b);
  console.log(JSON.stringify({ time: new Date().toISOString(), total, errors,
    window: '10s', count: durations.length,
    p95_ms: Math.round(durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] || 0) }));
  durations = [];
}, 10000);
Promise.all(Array.from({ length: 4 }, () => worker())).finally(() => clearInterval(report));
