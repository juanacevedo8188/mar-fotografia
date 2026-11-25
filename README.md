# FotoSUP

Web para un fotógrafo de competencias de SUP y eventos: galerías por evento, búsqueda por dorsal, venta de fotos con cobro por transferencia (alias) aprobado a mano, descarga protegida y transmisiones en vivo.

HTML/CSS/JS vanilla en un solo archivo, **Supabase** (base de datos, storage y login) y **Netlify Functions** (sin dependencias npm).

## Cómo funciona la protección de fotos

| Qué | Dónde | Quién lo ve |
|---|---|---|
| Miniatura 640 px + marca de agua | bucket público `previews` | Todos |
| Vista 1400 px + marca de agua | bucket público `previews` | Todos |
| **Original** | bucket **privado** `originals` | Solo con link firmado, después de aprobar el pago |

- La marca de agua se **graba en la imagen** (canvas) en el navegador del fotógrafo al subir, no es un overlay de CSS.
- El original nunca llega al navegador del cliente antes del pago. Cuando el fotógrafo aprueba, `order-status` genera links firmados que vencen en 1 h y se pueden renovar durante 30 días.
- El total del pedido se recalcula en el servidor (`create-order`), así que no se puede manipular desde el navegador.

## Flujo de compra

1. El cliente entra al evento, busca por dorsal o por momento y elige sus fotos.
2. Ve el alias, el CBU y el monto exacto, transfiere y sube el comprobante.
3. Recibe un link a su pedido (`#/pedido/<token>`) y puede avisarle al fotógrafo por WhatsApp.
4. El fotógrafo, en `#/admin` → Pedidos, ve el comprobante y las fotos. **Antes de aprobar, verifica la plata en el home banking**: un comprobante se falsifica fácil. Al aprobar se abre WhatsApp con el link de descarga para el cliente.

Precio: `total = min(⌊n/k⌋·P + (n mod k)·p , ⌈n/k⌉·P)`, con p = precio por foto, k = fotos por pack y P = precio del pack.

## Instalación

1. **Supabase**: crear un proyecto, ir a SQL Editor y correr `supabase/schema.sql`.
2. Authentication → Users → *Add user*, con el email y la contraseña del fotógrafo. Después, en SQL:
   ```sql
   insert into admins (user_id) select id from auth.users where email = 'MAIL_DEL_FOTOGRAFO';
   ```
3. En `index.html`, completar `CONFIG.SUPABASE_URL` y `CONFIG.SUPABASE_ANON_KEY` (Project Settings → API). La anon key es pública; la seguridad la dan las políticas RLS.
4. **Netlify**: importar el repo. En Site settings → Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (secreta: **solo** acá, nunca en el HTML)
5. Entrar a `/#/admin`, cargar los ajustes (alias, precios, WhatsApp) y crear el primer evento.

Sin `CONFIG`, la web corre en **modo demo** con datos de ejemplo, para mostrarla sin backend.

## En vivo

Panel → En vivo: tildar "Estoy transmitiendo AHORA" y pegar el link del vivo de YouTube. Aparece un banner en la portada y el reproductor en `#/vivo`. Desde ahí también se carga la agenda de próximas transmisiones.

## Pendiente (etapa 2)

- Búsqueda por selfie: embeddings faciales calculados en el navegador y guardados en Supabase con pgvector. La selfie no sale del celular.
- Lectura automática de dorsales con OCR al subir, para no cargarlos a mano.
- Mercado Pago con aprobación automática por webhook.
