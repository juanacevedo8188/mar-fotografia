// POST /.netlify/functions/create-pass
// Body: { event_ids[], name, phone, email?, bib?, embedding?(128 números), consent?, receipt: { data(base64), type } }
// El precio, el descuento y el cupo se validan acá: el cliente no los puede alterar.
const { U, H, json, q, passTotal, uploadReceipt, UUID } = require('../lib/supa');

exports.handler = async (e) => {
  if (e.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!U) return json(500, { error: 'Servidor sin configurar' });

  try {
    const b = JSON.parse(e.body || '{}');
    const ids = [...new Set(Array.isArray(b.event_ids) ? b.event_ids : [])];
    const name = String(b.name || '').trim().slice(0, 120);
    const phone = String(b.phone || '').replace(/\D/g, '').slice(0, 20);
    const email = String(b.email || '').trim().slice(0, 160);
    const bib = String(b.bib || '').replace(/\D/g, '').slice(0, 10);

    if (!ids.length || ids.length > 40 || !ids.every((x) => UUID.test(x))) return json(400, { error: 'Elegí al menos una fecha' });
    if (name.length < 2 || phone.length < 8) return json(400, { error: 'Completá nombre y WhatsApp' });

    const [s] = await q('settings?id=eq.1&select=mod_passes,mod_calendar,pass_tiers,pass_price_default');
    if (!s || s.mod_passes === false || s.mod_calendar === false) return json(400, { error: 'Los pases no están disponibles' });

    // "hoy" en Argentina (UTC−3), para no rechazar fechas del día por la noche
    const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const evs = await q(`events?id=in.(${ids.join(',')})&published=eq.true&pass_enabled=eq.true&date=gte.${today}&select=id,title,pass_price,pass_quota`);
    if (evs.length !== ids.length) return json(400, { error: 'Alguna de las fechas ya no está disponible. Volvé al calendario.' });

    // cupo por fecha
    const r = await fetch(`${U}/rest/v1/rpc/pass_counts`, { method: 'POST', headers: H, body: '{}' });
    const counts = Object.fromEntries((r.ok ? await r.json() : []).map((x) => [x.event_id, +x.n]));
    const full = evs.find((ev) => +ev.pass_quota > 0 && (counts[ev.id] || 0) >= +ev.pass_quota);
    if (full) return json(409, { error: `No quedan lugares para ${full.title}` });

    // huella facial: solo con consentimiento y con formato válido
    let embedding = null;
    if (b.consent === true && Array.isArray(b.embedding)) {
      if (b.embedding.length !== 128 || !b.embedding.every((v) => Number.isFinite(v) && Math.abs(v) < 10)) return json(400, { error: 'Selfie inválida' });
      embedding = '[' + b.embedding.map((v) => (+v).toFixed(6)).join(',') + ']';
    }

    const t = passTotal(evs, s);
    const receipt_path = await uploadReceipt(b.receipt);

    const [ps] = await q('passes', {
      method: 'POST',
      body: JSON.stringify({
        event_ids: ids, base: t.base, discount: t.discount, total: t.total,
        buyer_name: name, buyer_phone: phone, buyer_email: email || null, bib: bib || null,
        selfie_embedding: embedding, consent: !!embedding, receipt_path,
      }),
    });
    return json(200, { token: ps.token, total: t.total });
  } catch (err) {
    console.error(err);
    return json(err.status || 500, { error: err.status ? err.message : 'No se pudo crear el pase. Probá de nuevo.' });
  }
};
