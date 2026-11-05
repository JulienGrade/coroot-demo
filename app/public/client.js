async function request(path, method) {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  const started = performance.now();
  document.querySelector('#status').textContent = 'Requête en cours…';
  try {
    const response = await fetch(path, { method, signal: AbortSignal.timeout(7000) });
    const data = await response.json();
    document.querySelector('#status').textContent = `HTTP ${response.status} · ${Math.round(performance.now() - started)} ms`;
    document.querySelector('#result').textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    document.querySelector('#status').textContent = 'Accès interrompu ou délai dépassé.';
    document.querySelector('#result').textContent = error.message;
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}
document.querySelector('#products').addEventListener('click', () => request('/api/products', 'GET'));
document.querySelector('#checkout').addEventListener('click', () => request('/api/checkout', 'POST'));
