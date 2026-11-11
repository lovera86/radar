-- RADAR · solo pueden crear cuenta los correos dados de alta (pestaña Piloto) o de administración.
-- Sustituye a las invitaciones: con este filtro, el registro puede estar activado sin riesgo.
-- Se ejecuta una vez en SQL Editor. Después: Authentication → Hooks → «Before User Created»
-- → Postgres → función public.antes_de_crear_usuario → activar.

create or replace function public.antes_de_crear_usuario(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  correo citext := lower(coalesce(event -> 'user' ->> 'email', ''))::citext;
begin
  if exists (select 1 from public.altas where email = correo)
     or exists (select 1 from public.administradores where email = correo) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Este correo no tiene acceso al piloto de RADAR.'));
end $$;

revoke all on function public.antes_de_crear_usuario(jsonb) from public, anon, authenticated;
grant execute on function public.antes_de_crear_usuario(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
