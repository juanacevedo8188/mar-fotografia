// POST /.netlify/functions/create-order
// Body: { event_id, photo_ids[], name, phone, email?, receipt: { data(base64), type } }
// El total se recalcula acá: el cliente no puede mandar un precio trucho.
const { U, K, json, q, calcTotal, UUID } = require('../lib/supa');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

exports.handler = async (e) => {
  if (e.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!U || !K) return json(500, { error: 'Servidor sin configurar' });

  try {
    const b = JSON.parse(e.body || '{}');
    const ids = [...new Set(Array.isArray(b.photo_ids) ? b.photo_ids : [])];
    const name = String(b.name || '').trim().slice(0, 120);
    const phone = String(b.phone || '').replace(/\D/g, '').slice(0, 20);
    const email = String(b.email || '').trim().slice(0, 160);

    if (!UUID.test(b.event_id || '')) return json(400, { error: 'Evento inválido' });
    if (!ids.length || ids.length > 300 || !ids.every((x) => UUID.test(x)))
      return json(400, { error: 'Selección de fotos inválida' });
    if (name.length < 2 || phone.length < 8) return json(400, { error: 'Completá nombre y WhatsApp' });
    if (!b.receipt || !b.receipt.data || !EXT[b.receipt.type])
      return json(400, { error: 'Falta el comprobante (JPG, PNG, WEBP o PDF)' });

    const [ev] = await q(`events?id=eq.${b.event_id}&published=eq.true&select=id,price_photo,pack_size,pack_price`);
    if (!ev) return json(404, { error: 'Evento no encontrado' });

    const photos = await q(`photos?event_id=eq.${ev.id}&id=in.(${ids.join(',')})&select=id`);
    if (photos.length !== ids.length) return json(400, { error: 'Algunas fotos no pertenecen al evento' });

    const [s] = await q('settings?id=eq.1&select=price_photo,pack_size,pack_price');
    const total = calcTotal(ids.length, s || {}, ev);

    const buf = Buffer.from(b.receipt.data, 'base64');
    if (buf.length > 4.5 * 1024 * 1024) return json(413, { error: 'El comprobante pesa demasiado (máx. 4,5 MB)' });

    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${EXT[b.receipt.type]}`;
    const up = await fetch(`${U}/storage/v1/object/receipts/${path}`, {
      method: 'POST',
      headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': b.receipt.type },
      body: buf,
    });
    if (!up.ok) throw new Error('Upload comprobante: ' + (await up.text()));

    const [o] = await q('orders', {
      method: 'POST',
      body: JSON.stringify({
        event_id: ev.id,
        photo_ids: ids,
        total,
        buyer_name: name,
        buyer_phone: phone,
        buyer_email: email || null,
        receipt_path: path,
      }),
    });

    return json(200, { token: o.token, total });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'No se pudo crear el pedido. Probá de nuevo.' });
  }
};
