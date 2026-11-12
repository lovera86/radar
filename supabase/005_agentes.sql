-- RADAR · equipo de agentes, fase 1: memoria compartida, cola de tareas, jornadas y programación.
-- Se ejecuta una vez en SQL Editor (es seguro volver a ejecutarlo).
-- Los agentes escriben con la función «radar-jornada» (rol de servicio). Desde la web cada
-- persona solo lee lo suyo y solo cambia su configuración y el estado de sus oportunidades.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- Configuración de la jornada ----------
create table if not exists public.config_jornada (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hora int not null default 7 check (hora between 0 and 23),          -- hora de inicio (Europe/Madrid)
  dias int[] not null default '{1,2,3,4,5}',                          -- 1 = lunes … 7 = domingo
  presupuesto_dia numeric(6,2) not null default 0.20,                 -- dólares de IA por jornada
  max_ia int not null default 2 check (max_ia between 0 and 20),      -- oportunidades investigadas con IA por jornada
  max_tareas int not null default 60 check (max_tareas between 1 and 500),
  duracion_max_min int not null default 90,
  umbral int not null default 65 check (umbral between 0 and 100),   -- puntuación mínima para «validada»
  agentes_off text[] not null default '{}',                          -- agentes desactivados
  pausada boolean not null default false,                            -- parada de emergencia
  actualizado timestamptz not null default now()
);

-- ---------- Jornadas (ejecuciones) ----------
create table if not exists public.jornadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  origen text not null default 'programada' check (origen in ('programada', 'manual')),
  estado text not null default 'planificada' check (estado in ('planificada', 'en_curso', 'completada', 'con_errores', 'pausada', 'cancelada')),
  plan jsonb not null default '[]',
  resumen jsonb not null default '{}',
  coste numeric(8,4) not null default 0,
  inicio timestamptz not null default now(),
  fin timestamptz
);
create unique index if not exists jornadas_una_programada_al_dia on public.jornadas (user_id, fecha) where origen = 'programada';
create index if not exists jornadas_user_inicio on public.jornadas (user_id, inicio desc);

-- ---------- Cola de tareas ----------
create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.jornadas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  agente text not null,
  clave text not null,                    -- idempotencia: una tarea igual no se crea dos veces en la jornada
  entrada jsonb not null default '{}',
  salida jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecha', 'fallida', 'omitida')),
  prioridad int not null default 50,
  intentos int not null default 0,
  max_intentos int not null default 3,
  error text,
  coste numeric(8,4) not null default 0,
  creado timestamptz not null default now(),
  empezada timestamptz,
  terminada timestamptz,
  unique (jornada_id, clave)
);
create index if not exists tareas_pendientes on public.tareas (estado, prioridad desc, creado) where estado in ('pendiente', 'en_curso');

-- ---------- Memoria compartida ----------
create table if not exists public.senales (
  user_id uuid not null references auth.users (id) on delete cascade,
  clave text not null,                    -- identificador estable de la fuente: no se guarda dos veces
  empresa text,
  empresa_clave text,
  tipo text not null,
  titulo text not null,
  fecha date,
  fuente jsonb,                           -- { nombre, url, consultada }
  resumen text,
  hechos jsonb not null default '[]',     -- datos confirmados por la fuente
  hipotesis jsonb not null default '[]',  -- lo que se deduce (nunca como hecho)
  agente text not null,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  primary key (user_id, clave)
);
create index if not exists senales_empresa on public.senales (user_id, empresa_clave);

create table if not exists public.oportunidades (
  user_id uuid not null references auth.users (id) on delete cascade,
  clave text not null,
  tipo text not null,                     -- empleo, proyecto, empresa
  titulo text not null,
  organizacion text,
  datos jsonb not null default '{}',
  puntuacion int,
  explicacion jsonb not null default '{}',
  estado text not null default 'nueva' check (estado in ('nueva', 'investigando', 'validada', 'priorizada', 'seguimiento', 'borrador', 'aprobacion', 'contactada', 'respuesta', 'convertida', 'descartada')),
  agente text,
  senales text[] not null default '{}',
  siguiente text,
  ultima_verificacion timestamptz,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (user_id, clave)
);

create table if not exists public.contactos (
  user_id uuid not null references auth.users (id) on delete cascade,
  empresa_clave text not null,
  nombre text, cargo text, email text, web text, formulario text,
  fuente text not null,                   -- dónde se ha visto: sin fuente no hay contacto
  verificado date,
  confianza text check (confianza in ('alta', 'media', 'baja')),
  agente text,
  primary key (user_id, empresa_clave)
);

-- ---------- Auditoría ----------
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  jornada_id uuid references public.jornadas (id) on delete cascade,
  tarea_id uuid references public.tareas (id) on delete set null,
  agente text,
  tipo text not null,
  texto text not null,
  datos jsonb,
  creado timestamptz not null default now()
);
create index if not exists eventos_jornada on public.eventos (jornada_id, creado);

-- ---------- Secreto interno del programador (no sale de la base de datos) ----------
create table if not exists public.ajustes_internos (clave text primary key, valor text not null);
insert into public.ajustes_internos (clave, valor)
values ('cron', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (clave) do nothing;

-- ---------- Reclamar la siguiente tarea (sin que dos llamadas cojan la misma) ----------
create or replace function public.reclamar_tarea(p_jornada uuid) returns public.tareas
language plpgsql security definer set search_path = public as $$
declare t public.tareas;
begin
  -- Tareas que se quedaron a medias (fallo o tiempo agotado) vuelven a la cola.
  update public.tareas set estado = 'pendiente'
   where jornada_id = p_jornada and estado = 'en_curso' and empezada < now() - interval '10 minutes';
  select * into t from public.tareas
   where jornada_id = p_jornada and estado = 'pendiente'
   order by prioridad desc, creado
   for update skip locked limit 1;
  if t.id is null then return null; end if;
  update public.tareas set estado = 'en_curso', empezada = now(), intentos = intentos + 1 where id = t.id returning * into t;
  return t;
end $$;
revoke all on function public.reclamar_tarea(uuid) from public, anon, authenticated;

-- ---------- Permisos por fila ----------
alter table public.config_jornada enable row level security;
alter table public.jornadas enable row level security;
alter table public.tareas enable row level security;
alter table public.senales enable row level security;
alter table public.oportunidades enable row level security;
alter table public.contactos enable row level security;
alter table public.eventos enable row level security;
alter table public.ajustes_internos enable row level security;   -- sin políticas: solo el servidor

drop policy if exists "config: la propia persona" on public.config_jornada;
create policy "config: la propia persona" on public.config_jornada for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['jornadas', 'tareas', 'senales', 'oportunidades', 'contactos', 'eventos'] loop
    execute format('drop policy if exists "%1$s: leer lo propio" on public.%1$I', t);
    execute format('create policy "%1$s: leer lo propio" on public.%1$I for select to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "oportunidades: cambiar estado" on public.oportunidades;
create policy "oportunidades: cambiar estado" on public.oportunidades for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tu configuración inicial (la cuenta de administración).
insert into public.config_jornada (user_id)
select u.id from auth.users u join public.administradores a on a.email = lower(u.email)::citext
on conflict (user_id) do nothing;

-- ---------- Programación: cada 5 minutos por la mañana (UTC), la función decide si toca ----------
-- 04:00–09:55 UTC = 05:00–10:55 en invierno y 06:00–11:55 en verano (hora de España).
select cron.unschedule(jobid) from cron.job where jobname = 'radar-jornada';
select cron.schedule('radar-jornada', '*/5 4-9 * * *', $$
  select net.http_post(
    url := 'https://newalycxqyaounbhinhb.supabase.co/functions/v1/radar-jornada',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-radar-cron', (select valor from public.ajustes_internos where clave = 'cron')),
    body := '{"modo":"cron"}'::jsonb,
    timeout_milliseconds := 150000);
$$);
