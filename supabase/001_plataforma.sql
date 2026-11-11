-- RADAR · plataforma online (piloto). Base de datos de Supabase (región UE).
-- Se ejecuta una sola vez en Supabase → SQL Editor → New query → pegar → Run.
-- No contiene datos personales: los perfiles y CV se suben después desde RADAR.
--
-- Qué guarda:
--   administradores  correos con permiso de administración (Rocío)
--   altas            perfiles que prepara la administradora antes de que la persona entre
--   perfiles         perfil de cada persona con cuenta (CV estructurado, búsqueda, zona)
--   estado           lo que la persona hace en RADAR (guardadas, estados, notas, preferencias)
--   consentimientos  aceptación de la política de privacidad, con versión y fecha
--   storage «cv»     CV originales (PDF o Word), privados
--
-- Seguridad: Row Level Security en todas las tablas. Cada persona solo ve lo suyo.
-- La administración ve perfiles, altas y un resumen de uso, nunca las notas personales.

create extension if not exists citext;

-- ---------- tablas ----------
create table if not exists public.administradores (
  email citext primary key
);

create table if not exists public.altas (
  email citext primary key,
  datos jsonb not null,
  cv_ruta text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table if not exists public.perfiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  datos jsonb not null,
  cv_ruta text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table if not exists public.estado (
  user_id uuid not null references auth.users (id) on delete cascade,
  clave text not null check (clave in ('radar-v2', 'radar-perfil', 'radar-pesos')),
  valor jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (user_id, clave)
);

create table if not exists public.consentimientos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  aceptado timestamptz not null default now(),
  unique (user_id, version)
);

-- La hora de cada cambio la pone el servidor (no el reloj del dispositivo).
create or replace function public.poner_actualizado() returns trigger
language plpgsql as $$ begin new.actualizado := now(); return new; end $$;
drop trigger if exists estado_actualizado on public.estado;
create trigger estado_actualizado before insert or update on public.estado
  for each row execute function public.poner_actualizado();
drop trigger if exists altas_actualizado on public.altas;
create trigger altas_actualizado before insert or update on public.altas
  for each row execute function public.poner_actualizado();

-- ---------- funciones de apoyo ----------
-- ¿La persona conectada es administradora? (correo confirmado y en la lista)
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.administradores a
    where a.email = (auth.jwt() ->> 'email')::citext
  ) and auth.uid() is not null;
$$;

-- Al entrar por primera vez, la persona recoge el perfil que se le preparó (por su correo).
-- Si ya tiene perfil, lo devuelve. Si la administración lo ha actualizado después, lo renueva.
create or replace function public.reclamar_perfil() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  correo citext := (auth.jwt() ->> 'email')::citext;
  a public.altas;
  p public.perfiles;
begin
  if auth.uid() is null then return null; end if;
  select * into a from public.altas where email = correo;
  select * into p from public.perfiles where user_id = auth.uid();
  if a.email is not null and (p.user_id is null or a.actualizado > p.actualizado) then
    insert into public.perfiles (user_id, email, datos, cv_ruta, actualizado)
    values (auth.uid(), correo, a.datos, a.cv_ruta, a.actualizado)
    on conflict (user_id) do update set datos = excluded.datos, cv_ruta = excluded.cv_ruta, email = excluded.email, actualizado = excluded.actualizado;
    select * into p from public.perfiles where user_id = auth.uid();
  end if;
  if p.user_id is null then return null; end if;
  return jsonb_build_object('datos', p.datos, 'cv_ruta', p.cv_ruta, 'actualizado', p.actualizado, 'admin', public.es_admin());
end $$;

-- Resumen del piloto para la administración: quién tiene cuenta y cuánto lo usa.
-- Solo cuenta guardadas y candidaturas; no lee notas ni textos personales.
create or replace function public.resumen_piloto() returns table (
  email text, nombre text, alta timestamptz, con_cuenta boolean, ultimo_uso timestamptz,
  guardadas int, candidaturas int, consentimiento timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.email::text,
         coalesce(p.datos ->> 'nombre', a.datos ->> 'nombre'),
         a.creado,
         p.user_id is not null,
         (select max(e.actualizado) from public.estado e where e.user_id = p.user_id),
         coalesce((select count(*) from public.estado e, jsonb_object_keys(coalesce(e.valor -> 'fav', '{}'::jsonb)) where e.user_id = p.user_id and e.clave = 'radar-v2'), 0)::int,
         coalesce((select count(*) from public.estado e, jsonb_each(coalesce(e.valor -> 'est', '{}'::jsonb)) s
                   where e.user_id = p.user_id and e.clave = 'radar-v2' and s.value ->> 'estado' in ('enviada', 'respuesta', 'entrevista')), 0)::int,
         (select max(c.aceptado) from public.consentimientos c where c.user_id = p.user_id)
  from public.altas a
  left join public.perfiles p on p.email = a.email
  where public.es_admin()
  order by a.creado;
$$;

-- Derecho de supresión: la persona borra su cuenta y todos sus datos.
-- (Los archivos de CV se borran desde RADAR antes de llamar a esta función.)
create or replace function public.borrar_mi_cuenta() returns void
language plpgsql security definer set search_path = public as $$
declare correo citext := (auth.jwt() ->> 'email')::citext;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  delete from public.altas where email = correo;
  delete from auth.users where id = auth.uid();  -- perfiles, estado y consentimientos se borran en cascada
end $$;

revoke all on function public.reclamar_perfil() from public, anon;
revoke all on function public.resumen_piloto() from public, anon;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.reclamar_perfil() to authenticated;
grant execute on function public.resumen_piloto() to authenticated;
grant execute on function public.borrar_mi_cuenta() to authenticated;
grant execute on function public.es_admin() to authenticated;

-- ---------- permisos por fila ----------
alter table public.administradores enable row level security;
alter table public.altas enable row level security;
alter table public.perfiles enable row level security;
alter table public.estado enable row level security;
alter table public.consentimientos enable row level security;

-- administradores: nadie la lee ni la cambia desde la web (se gestiona en el SQL Editor).

drop policy if exists "altas: administración" on public.altas;
create policy "altas: administración" on public.altas for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "perfiles: la propia persona lee" on public.perfiles;
create policy "perfiles: la propia persona lee" on public.perfiles for select to authenticated
  using (user_id = auth.uid() or public.es_admin());

drop policy if exists "estado: solo la propia persona" on public.estado;
create policy "estado: solo la propia persona" on public.estado for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "consentimientos: leer" on public.consentimientos;
create policy "consentimientos: leer" on public.consentimientos for select to authenticated
  using (user_id = auth.uid() or public.es_admin());
drop policy if exists "consentimientos: aceptar" on public.consentimientos;
create policy "consentimientos: aceptar" on public.consentimientos for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- almacén de CV (privado) ----------
-- Ruta de cada archivo: <correo en minúsculas>/<nombre del archivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv', 'cv', false, 10485760, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false;

drop policy if exists "cv: administración" on storage.objects;
create policy "cv: administración" on storage.objects for all to authenticated
  using (bucket_id = 'cv' and public.es_admin()) with check (bucket_id = 'cv' and public.es_admin());

drop policy if exists "cv: la propia persona" on storage.objects;
create policy "cv: la propia persona" on storage.objects for select to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = lower(auth.jwt() ->> 'email'));

drop policy if exists "cv: la propia persona borra" on storage.objects;
create policy "cv: la propia persona borra" on storage.objects for delete to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = lower(auth.jwt() ->> 'email'));

-- ---------- último paso (a mano) ----------
-- Añade tu correo como administradora (el mismo con el que entrarás en RADAR):
--   insert into public.administradores (email) values ('tu-correo@ejemplo.com');
