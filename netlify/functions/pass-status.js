// GET /.netlify/functions/pass-status?token=...
// Estado del pase, sus fechas y los links a las fotos ya entregadas.
// No devuelve la huella facial ni el comprobante.
const { json, q } = require('../lib/supa');

exports.handler = async (e) => {
  const token = (e.queryStringParameters || {}).token || '';
  if (!/^[a-f0-9]{36}$/.test(token)) return json(400, { error: 'Link inválido' });
  try {
    const [ps] = await q(`passes?token=eq.${token}&select=id,status,total,base,discount,event_ids,note,buyer_name,created_at`);
    if (!ps) return json(404, { error: 'Pase no encontrado' });
    const events = ps.event_ids.length
      ? await q(`events?id=in.(${ps.event_ids.join(',')})&select=id,title,date,location&order=date.asc`)
      : [];
    const orders = await q(`orders?pass_id=eq.${ps.id}&status=eq.aprobado&select=event_id,token,photo_ids`);
    return json(200, {
      status: ps.status, total: ps.total, base: ps.base, discount: ps.discount, note: ps.note,
      created_at: ps.created_at, buyer: (ps.buyer_name || '').split(' ')[0], events,
      deliveries: orders.map((o) => ({ event_id: o.event_id, token: o.token, count: o.photo_ids.length })),
    });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'No se pudo consultar el pase' });
  }
};
