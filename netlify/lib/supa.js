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

// Misma fórmula que el front:
// total = min( floor(n/k)·P + (n mod k)·p , ceil(n/k)·P )
function calcTotal(n, s, ev) {
  const p = ev && ev.price_photo != null ? +ev.price_photo : +s.price_photo || 0;
  const k = +s.pack_size || 0;
  const P = +s.pack_price || 0;
  if (k > 1 && P > 0) {
    const mixed = Math.floor(n / k) * P + (n % k) * p;
    const allPacks = Math.ceil(n / k) * P;
    return Math.min(mixed, allPacks);
  }
  return n * p;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = { U, K, H, json, q, calcTotal, UUID };
