// Utilidades compartidas por las funciones. Sin dependencias (Node 18+ trae fetch).
const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY; // NUNCA exponer en el front

const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

async function q(path, opt = {}) {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    ...opt,
    headers: { ...H, Prefer: 'return=representation', ...(opt.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

// Misma regla que el front: cada evento tiene sus precios y, si falta
// alguno, se usa el valor por defecto de Ajustes. Pack de 0 = sin pack.
// total = min( floor(n/k)·P + (n mod k)·p , ceil(n/k)·P )
function calcTotal(n, s, ev) {
  const pick = (key) => (ev && ev[key] != null ? +ev[key] : +s[key] || 0);
  const p = pick('price_photo');
  const k = pick('pack_size');
  const P = pick('pack_price');
  if (k > 1 && P > 0) {
    const mixed = Math.floor(n / k) * P + (n % k) * p;
    const allPacks = Math.ceil(n / k) * P;
    return Math.min(mixed, allPacks);
  }
  return n * p;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = { U, K, H, json, q, calcTotal, UUID };
