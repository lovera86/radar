-- RADAR · registro de uso de la IA (para el límite diario y para saber cuánto cuesta).
-- Se ejecuta una vez en SQL Editor. No guarda textos, solo qué acción y cuántos tokens.

create table if not exists public.ia_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  accion text not null,
  tokens_entrada int,
  tokens_salida int,
  creado timestamptz not null default now()
);
create index if not exists ia_uso_user_creado on public.ia_uso (user_id, creado);

alter table public.ia_uso enable row level security;
drop policy if exists "ia_uso: la propia persona" on public.ia_uso;
create policy "ia_uso: la propia persona" on public.ia_uso for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
