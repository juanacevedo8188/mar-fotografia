// Utilidades compartidas por las funciones. Sin dependencias (Node 18+ trae fetch).
const { randomUUID } = require('crypto');
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

// Pase de fechas: precio de cada fecha (el del evento o el de Ajustes)
// y descuento según la escala "fechas:%".  Pase = Σ precios × (1 − d)
function passTiers(s) {
  return String(s.pass_tiers || '').split(/[,;\n]+/)
    .map((t) => t.split(':').map((x) => parseFloat(String(x).replace('%', ''))))
    .filter(([n, d]) => n >= 1 && d >= 0 && d < 100)
    .sort((a, b) => a[0] - b[0]);
}
function passTotal(evs, s) {
  const price = (e) => (e.pass_price != null ? +e.pass_price : +s.pass_price_default || 0);
  const base = evs.reduce((a, e) => a + price(e), 0);
  let d = 0;
  for (const [n, pct] of passTiers(s)) if (evs.length >= n) d = pct;
  return { base, discount: d, total: Math.round(base * (1 - d / 100)) };
}

const RECEIPT_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
// Sube un comprobante (base64) al bucket privado "receipts" y devuelve su ruta
async function uploadReceipt(receipt) {
  if (!receipt || !receipt.data || !RECEIPT_EXT[receipt.type]) throw Object.assign(new Error('Falta el comprobante (JPG, PNG, WEBP o PDF)'), { status: 400 });
  const buf = Buffer.from(receipt.data, 'base64');
  if (buf.length > 4.5 * 1024 * 1024) throw Object.assign(new Error('El comprobante pesa demasiado (máx. 4,5 MB)'), { status: 413 });
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${RECEIPT_EXT[receipt.type]}`;
  const up = await fetch(`${U}/storage/v1/object/receipts/${path}`, {
    method: 'POST', headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': receipt.type }, body: buf,
  });
  if (!up.ok) throw new Error('Upload comprobante: ' + (await up.text()));
  return path;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = { U, K, H, json, q, calcTotal, passTotal, uploadReceipt, UUID };
