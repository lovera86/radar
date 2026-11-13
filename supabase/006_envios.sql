-- RADAR · Equipo de agentes, fase 3: envío automático de presentaciones con límites.
-- Ejecutar una vez en Supabase → SQL Editor (después de 005_agentes.sql).
--
-- Qué añade:
--   config_jornada  modo de envío (apagado / ensayo / real), fin del ensayo, máximo de envíos
--                   al día, puntuación mínima para enviar, hechos del perfil, firma y CV.
--   envios          cada presentación o seguimiento: a quién, de dónde sale el correo, el texto,
--                   la revisión de la IA y su estado. Una empresa solo recibe una presentación.
--   ajustes_internos.cartero  secreto con el que el «cartero» (GitHub Actions) recoge la cola.

alter table public.config_jornada
  add column if not exists envio_modo text not null default 'ensayo' check (envio_modo in ('apagado', 'ensayo', 'real')),
  add column if not exists ensayo_hasta date,
  add column if not exists max_envios int not null default 3 check (max_envios between 0 and 10),
  add column if not exists umbral_envio int not null default 80 check (umbral_envio between 0 and 100),
  add column if not exists perfil_hechos jsonb not null default '[]',   -- hechos del CV que se pueden citar
  add column if not exists firma jsonb not null default '{}',           -- { nombre, email, linkedin, telefono } (privado)
  add column if not exists cv_ruta text;                                -- CV que se adjunta (bucket «cv», privado)

-- Ensayo de 3 días desde hoy; una investigación con IA al día deja presupuesto para redactar.
update public.config_jornada set ensayo_hasta = current_date + 3 where ensayo_hasta is null;
update public.config_jornada set max_ia = 1 where max_ia = 2;

create table if not exists public.envios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clave text not null,                      -- oportunidad (misma clave que la bandeja)
  empresa text not null,
  empresa_clave text not null,
  tipo text not null default 'presentacion' check (tipo in ('presentacion', 'seguimiento')),
  modo text not null check (modo in ('ensayo', 'real')),
  para text not null,                       -- correo publicado por la empresa
  fuente_correo text not null,              -- página donde aparece ese correo
  asunto text not null,
  cuerpo text not null,
  revision jsonb not null default '{}',     -- { aprobado, problemas[] } del segundo repaso
  estado text not null default 'listo' check (estado in ('listo', 'enviado', 'bloqueado', 'fallido', 'cancelado', 'respondido')),
  en_respuesta_a uuid references public.envios (id) on delete set null,
  message_id text,
  error text,
  creado timestamptz not null default now(),
  enviado timestamptz
);
-- Nunca dos presentaciones reales a la misma empresa
create unique index if not exists envios_una_presentacion on public.envios (user_id, empresa_clave)
  where tipo = 'presentacion' and modo = 'real' and estado in ('listo', 'enviado', 'respondido');
create index if not exists envios_estado on public.envios (estado, creado);

alter table public.envios enable row level security;
drop policy if exists "envios: leer lo propio" on public.envios;
create policy "envios: leer lo propio" on public.envios for select to authenticated using (user_id = auth.uid());
drop policy if exists "envios: cancelar lo propio" on public.envios;
create policy "envios: cancelar lo propio" on public.envios for update to authenticated
  using (user_id = auth.uid() and estado = 'listo') with check (user_id = auth.uid() and estado in ('listo', 'cancelado'));

insert into public.ajustes_internos (clave, valor)
values ('cartero', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (clave) do nothing;

-- Copia este valor en GitHub → Settings → Secrets → Actions → secreto RADAR_CARTERO
select valor as copia_esto_en_github_radar_cartero from public.ajustes_internos where clave = 'cartero';
