const { pbkdf2Sync, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');

function readFault(path) {
  if (!path) return 'normal';
  // Un fichier absent ou invalide doit être visible dans les logs du serveur.
  const value = readFileSync(path, 'utf8').trim();
  if (!['normal', 'sql', 'cpu'].includes(value)) {
    throw new Error('Mode de démonstration invalide');
  }
  return value;
}

function priceOrder(items) {
  return items.reduce((total, item) => total + item.price_cents * item.quantity, 0);
}

async function catalog(pool, mode) {
  // Le délai est exécuté dans PostgreSQL pour rendre la dépendance observable.
  if (mode === 'sql') await pool.query('SELECT pg_sleep(0.7)');
  const result = await pool.query('SELECT id, name, price_cents FROM products ORDER BY id');
  return result.rows;
}

function payment(mode, version, amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { status: 400, body: { error: 'Montant invalide' } };
  }
  if (version === '2.0') {
    return { status: 503, body: { error: 'Régression de la règle de paiement' } };
  }
  if (mode === 'cpu') {
    // Travail synchrone borné. La fonction apparaît dans le profil CPU si disponible.
    pbkdf2Sync('demo', 'coroot', 450000, 32, 'sha256');
  }
  return { status: 200, body: { payment_id: randomUUID(), amount_cents: amount } };
}

module.exports = { readFault, priceOrder, catalog, payment };
