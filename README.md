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

## Búsqueda por selfie (reconocimiento facial)

**Fotógrafo:** al subir fotos, el navegador detecta todas las caras y guarda un descriptor de 128 números por cara en la tabla `faces`. Con la opción "caras chicas/lejanas", además de la foto entera analiza 4 recortes superpuestos, para remadores lejos (es más lento). Las fotos subidas antes se procesan con el botón **"Detectar caras (N pendientes)"**.

**Cliente:** toca "Buscame con una selfie", acepta el consentimiento y se saca una foto. La imagen **se analiza en su celular y no se sube**: al servidor solo viaja el descriptor, que no se guarda.

**Comparación:** distancia euclídea entre descriptores, `d = ‖a − b‖₂`, calculada con pgvector. Se considera la misma persona si `d < 0,55` (face-api sugiere 0,6; usamos un valor más estricto para traer menos fotos de otras personas). El servidor no acepta umbrales mayores a 0,6.

**Privacidad (Ley 25.326):** los descriptores son datos biométricos. La tabla `faces` no tiene lectura pública, y el público solo puede llamar a `match_faces`, que devuelve ids de fotos y nunca vectores. Al borrar una foto o un evento se borran sus caras.

**Limitaciones en SUP:** con gorra, anteojos de sol, de perfil o muy lejos, la cara puede no detectarse o no coincidir. Por eso la búsqueda por dorsal sigue siendo la principal en competencias.

**Librería:** [face-api](https://github.com/vladmandic/face-api) (MIT), alojada en `vendor/face-api/`, sin CDN externa. Solo se descarga cuando alguien usa la búsqueda: el cliente baja unos 7 MB la primera vez y el fotógrafo unos 13 MB. Después quedan en caché.

## Módulos

En **Panel → Ajustes → Módulos** el fotógrafo prende o apaga cada sección: Calendario, Pase de fechas, Chat de ayuda, Búsqueda por selfie, Transmisiones en vivo y Quién soy. Lo que se apaga desaparece de la web, del menú y del panel.

## Calendario y pase de fechas

- **Calendario** (`#/calendario`): muestra los eventos publicados con fecha de hoy en adelante. Los eventos que ya pasaron quedan como galerías en la portada.
- **Pase:** el cliente marca las fechas a las que va y paga una sola vez por transferencia, con comprobante, igual que un pedido.
  `Pase = (Σ precio de cada fecha en el pase) × (1 − d)`, con `d` según la escala del fotógrafo (por ejemplo `2:10, 3:15, 4:20`).
- **Todo se configura en Panel → Pases:** escala de descuentos, precio por fecha por defecto, fotos incluidas (0 = todas), texto de presentación y regla si el abonado no sale en las fotos. En cada evento se carga además el precio de esa fecha dentro del pase, el cupo de abonados y si la fecha entra en el pase.
- **Entrega:** en cada evento, "Abonados en esta fecha" lista a cada abonado con sus fotos ya encontradas por dorsal o por selfie. Con "Revisar y entregar" se crea un pedido aprobado sin costo y se le manda el link por WhatsApp. El cliente ve todas sus entregas en `#/mi-pase/<token>`.
- **Datos biométricos:** la selfie del pase se guarda como descriptor (nunca la foto) y solo con consentimiento explícito. La tabla `passes` no tiene lectura pública; el cupo se consulta con la función `pass_counts`, que devuelve solo cantidades.
- El servidor (`create-pass`) recalcula el precio, valida que las fechas sigan disponibles y controla el cupo.

## Pendiente

- Lectura automática de dorsales con OCR al subir, para no cargarlos a mano.
- Mercado Pago con aprobación automática por webhook.
