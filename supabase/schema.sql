-- =========================================================
-- FotoSUP — esquema completo. Correr una vez en Supabase:
-- Dashboard → SQL Editor → pegar todo → Run.
-- =========================================================
create extension if not exists pgcrypto;

-- ---------- Administradores ----------
create table if not exists admins (
  user_id uuid primary key references auth.users on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- ---------- Ajustes (una sola fila) ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  site_name text default 'Tu Marca Foto',
  tagline text default 'Fotografía de stand up paddle y eventos',
  watermark_text text,
  alias text,
  cbu text,
  titular text,
  whatsapp text,          -- solo números, con código de país: 5493411234567
  instagram text,         -- usuario sin @
  youtube text,           -- URL del canal
  price_photo numeric not null default 0,
  pack_size int,          -- ej: 5
  pack_price numeric,     -- precio de ese pack completo
  live_active boolean not null default false,
  live_title text,
  live_url text,          -- URL de YouTube (video en vivo o canal)
  updated_at timestamptz default now()
);
insert into settings (id) values (1) on conflict do nothing;

-- ---------- Eventos ----------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'competencia' check (kind in ('competencia','evento')),
  location text,
  date date,
  price_photo numeric,    -- opcional: pisa el precio general
  cover_path text,
  published boolean not null default false,
  created_at timestamptz default now()
);

-- ---------- Fotos ----------
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  thumb_path text not null,     -- bucket público "previews" (con marca de agua)
  preview_path text not null,   -- bucket público "previews" (con marca de agua)
  original_path text not null,  -- bucket PRIVADO "originals"
  file_name text,
  bibs text[] not null default '{}',  -- dorsales que aparecen en la foto
  tag text,                            -- Largada, Boya 1, Llegada, Podio...
  sort int default 0,
  taken_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists photos_event_idx on photos (event_id, sort);
create index if not exists photos_bibs_idx on photos using gin (bibs);

-- ---------- Pedidos ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(18), 'hex'),
  event_id uuid references events on delete set null,
  photo_ids uuid[] not null,
  total numeric not null,
  buyer_name text,
  buyer_phone text,
  buyer_email text,
  receipt_path text,            -- bucket PRIVADO "receipts"
  status text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado')),
  note text,
  created_at timestamptz default now(),
  approved_at timestamptz
);
create index if not exists orders_status_idx on orders (status, created_at desc);

-- ---------- Agenda de transmisiones ----------
create table if not exists live_schedule (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  url text
);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table admins enable row level security;
alter table settings enable row level security;
alter table events enable row level security;
alter table photos enable row level security;
alter table orders enable row level security;
alter table live_schedule enable row level security;

drop policy if exists "admins self" on admins;
create policy "admins self" on admins for select using (user_id = auth.uid());

drop policy if exists "settings read" on settings;
create policy "settings read" on settings for select using (true);
drop policy if exists "settings admin" on settings;
create policy "settings admin" on settings for update using (is_admin()) with check (is_admin());

drop policy if exists "events read" on events;
create policy "events read" on events for select using (published or is_admin());
drop policy if exists "events admin" on events;
create policy "events admin" on events for all using (is_admin()) with check (is_admin());

drop policy if exists "photos read" on photos;
create policy "photos read" on photos for select using (
  exists (select 1 from events e where e.id = event_id and (e.published or is_admin()))
);
drop policy if exists "photos admin" on photos;
create policy "photos admin" on photos for all using (is_admin()) with check (is_admin());

-- Pedidos: el público NO accede directo. Crea/consulta vía Netlify Functions.
drop policy if exists "orders admin" on orders;
create policy "orders admin" on orders for all using (is_admin()) with check (is_admin());

drop policy if exists "schedule read" on live_schedule;
create policy "schedule read" on live_schedule for select using (true);
drop policy if exists "schedule admin" on live_schedule;
create policy "schedule admin" on live_schedule for all using (is_admin()) with check (is_admin());

-- =========================================================
-- Storage
-- =========================================================
insert into storage.buckets (id, name, public) values
  ('previews',  'previews',  true),   -- miniaturas y vistas con marca de agua
  ('originals', 'originals', false),  -- originales: solo con link firmado tras aprobar
  ('receipts',  'receipts',  false)   -- comprobantes de transferencia
on conflict (id) do nothing;

drop policy if exists "fotosup admin select" on storage.objects;
create policy "fotosup admin select" on storage.objects for select to authenticated
  using (bucket_id in ('previews','originals','receipts') and public.is_admin());
drop policy if exists "fotosup admin insert" on storage.objects;
create policy "fotosup admin insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('previews','originals') and public.is_admin());
drop policy if exists "fotosup admin update" on storage.objects;
create policy "fotosup admin update" on storage.objects for update to authenticated
  using (bucket_id in ('previews','originals') and public.is_admin());
drop policy if exists "fotosup admin delete" on storage.objects;
create policy "fotosup admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('previews','originals','receipts') and public.is_admin());

-- =========================================================
-- Último paso (manual): crear el usuario del fotógrafo en
-- Authentication → Users → Add user, y después:
--   insert into admins (user_id)
--   select id from auth.users where email = 'MAIL_DEL_FOTOGRAFO';
-- =========================================================
