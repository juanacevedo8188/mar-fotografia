// GET /.netlify/functions/order-status?token=...
// Devuelve el estado del pedido. Si está aprobado (y dentro de los 30 días),
// genera links firmados a los ORIGINALES que vencen en 1 hora.
const { U, H, json, q } = require('../lib/supa');

const LINK_DAYS = 30;     // días que el cliente puede volver a descargar
const SIGN_SECONDS = 3600; // vida de cada link firmado

exports.handler = async (e) => {
  const token = (e.queryStringParameters || {}).token || '';
  if (!/^[a-f0-9]{36}$/.test(token)) return json(400, { error: 'Link inválido' });

  try {
    const [o] = await q(
      `orders?token=eq.${token}&select=status,total,photo_ids,created_at,approved_at,note,buyer_name,events(title)`
    );
    if (!o) return json(404, { error: 'Pedido no encontrado' });

    const out = {
      status: o.status,
      total: o.total,
      count: o.photo_ids.length,
      created_at: o.created_at,
      note: o.note,
      event: o.events ? o.events.title : null,
      buyer: (o.buyer_name || '').split(' ')[0],
    };

    if (o.status === 'aprobado') {
      const days = (Date.now() - new Date(o.approved_at || o.created_at).getTime()) / 864e5;
      if (days > LINK_DAYS) {
        out.expired = true;
      } else {
        const photos = await q(
          `photos?id=in.(${o.photo_ids.join(',')})&select=id,original_path,thumb_path,file_name`
        );
        const r = await fetch(`${U}/storage/v1/object/sign/originals`, {
          method: 'POST',
          headers: H,
          body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths: photos.map((p) => p.original_path) }),
        });
        if (!r.ok) throw new Error('Sign: ' + (await r.text()));
        const signed = await r.json();
        const byPath = Object.fromEntries(signed.map((x) => [x.path, x.signedURL]));

        out.downloads = photos.map((p, i) => {
          const rel = byPath[p.original_path];
          const fname = p.file_name || `foto-${i + 1}.jpg`;
          return {
            thumb_path: p.thumb_path,
            name: fname,
            url: rel ? `${U}/storage/v1${rel}&download=${encodeURIComponent(fname)}` : null,
          };
        });
      }
    }
    return json(200, out);
  } catch (err) {
    console.error(err);
    return json(500, { error: 'No se pudo consultar el pedido' });
  }
};
