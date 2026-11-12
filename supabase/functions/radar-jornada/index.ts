// RADAR · función «radar-jornada»: el orquestador del equipo de agentes.
//
// Dos formas de llamarla:
//   - Programada: pg_cron la llama cada 5 minutos por la mañana con la cabecera x-radar-cron
//     (un secreto que solo vive en la base de datos). Si toca, crea la jornada de hoy y avanza.
//   - Manual (desde RADAR, con tu sesión de administración): { accion: "lanzar" | "paso" |
//     "pausar" | "reanudar" | "reintentar", tarea_id? }.
//
// Cada llamada trabaja como mucho ~100 segundos: coge tareas de la cola de una en una
// (reclamar_tarea, sin que dos llamadas cojan la misma), las ejecuta y deja registro. Si algo
// falla, la tarea vuelve a la cola hasta 3 intentos. Las escrituras son idempotentes.
// Nada de lo que hace esta función envía mensajes ni actúa fuera de RADAR.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { cerrarJornada, deduplicar, madrid, planificar, senalDesdeItem, tocaJornada, trasFallo, type Config } from "./nucleo.ts";

const WEB = "https://lovera86.github.io/radar";
const ORIGENES = ["https://lovera86.github.io", "http://localhost:8765"];
const LIMITE_MS = 100_000;

const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGENES.includes(o) ? o : ORIGENES[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
});
const responder = (cuerpo: unknown, estado: number, o: string | null) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors(o), "Content-Type": "application/json" } });

// Servicio: escribe en la memoria por encima de los permisos por fila (solo dentro de esta función).
const srv = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Jornada = { id: string; user_id: string; fecha: string; origen: string; estado: string; inicio: string; plan: unknown; coste: number };
type Ctx = { user_id: string; jornada: Jornada; config: Config };

async function evento(ctx: Ctx, agente: string, tipo: string, texto: string, datos?: unknown, tarea_id?: string) {
  await srv.from("eventos").insert({ user_id: ctx.user_id, jornada_id: ctx.jornada.id, tarea_id: tarea_id ?? null, agente, tipo, texto, datos: datos ?? null });
}

async function config(user_id: string): Promise<Config> {
  const { data } = await srv.from("config_jornada").select("*").eq("user_id", user_id).maybeSingle();
  if (data) return data as Config;
  const { data: nueva, error } = await srv.from("config_jornada").insert({ user_id }).select("*").single();
  if (error) throw error;
  return nueva as Config;
}

// ---------------------------------------------------------------------------
// Agentes
// ---------------------------------------------------------------------------
type Resultado = { salida: Record<string, unknown>; coste?: number };
const AGENTES: Record<string, (ctx: Ctx, entrada: Record<string, unknown>, tarea_id: string) => Promise<Resultado>> = {

  // Detector: lee lo que la recogida diaria de RADAR ha publicado y guarda las señales nuevas.
  async detector(ctx, _entrada, tarea_id) {
    const r = await fetch(`${WEB}/data/oportunidades.json?t=${Date.now()}`, { headers: { "User-Agent": "RADAR-agentes" } });
    if (!r.ok) throw new Error(`No se ha podido leer la recogida diaria (HTTP ${r.status})`);
    const items = await r.json();
    if (!Array.isArray(items)) throw new Error("La recogida diaria no tiene el formato esperado");
    const senales = items.filter((it) => it?.id && it?.titulo).map(senalDesdeItem);

    const conocidas = new Set<string>();
    for (let i = 0; i < senales.length; i += 200) {
      const { data, error } = await srv.from("senales").select("clave").eq("user_id", ctx.user_id).in("clave", senales.slice(i, i + 200).map((s) => s.clave));
      if (error) throw error;
      (data || []).forEach((x) => conocidas.add(x.clave));
    }
    const { nuevas, repetidas } = deduplicar(senales, conocidas);
    const ahora = new Date().toISOString();
    if (nuevas.length) {
      const filas = nuevas.map((s) => ({ ...s, user_id: ctx.user_id, agente: "detector", primera_vez: ahora, ultima_vez: ahora }));
      // upsert por clave: si la tarea se reintenta, no se duplica nada
      const { error } = await srv.from("senales").upsert(filas, { onConflict: "user_id,clave", ignoreDuplicates: true });
      if (error) throw error;
    }
    for (let i = 0; i < repetidas.length; i += 200) {
      await srv.from("senales").update({ ultima_vez: ahora }).eq("user_id", ctx.user_id).in("clave", repetidas.slice(i, i + 200));
    }
    const porTipo: Record<string, number> = {};
    nuevas.forEach((s) => { porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1; });
    await evento(ctx, "detector", "deteccion", `Revisadas ${senales.length} señales: ${nuevas.length} nuevas y ${repetidas.length} ya conocidas`, { porTipo }, tarea_id);
    return { salida: { revisadas: senales.length, nuevas: nuevas.length, ya_conocidas: repetidas.length, por_tipo: porTipo } };
  },
};

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------
async function crearJornada(user_id: string, origen: "programada" | "manual", c: Config): Promise<Jornada | null> {
  const fecha = madrid(new Date()).fecha;
  const plan = planificar(c);
  const { data: j, error } = await srv.from("jornadas").insert({ user_id, fecha, origen, estado: "en_curso", plan }).select("*").single();
  if (error) {
    if (error.code === "23505") return null; // la jornada programada de hoy ya existe (otra llamada se adelantó)
    throw error;
  }
  if (plan.length) {
    const { error: e2 } = await srv.from("tareas").upsert(plan.map((t) => ({ ...t, jornada_id: j.id, user_id })), { onConflict: "jornada_id,clave", ignoreDuplicates: true });
    if (e2) throw e2;
  }
  const ctx = { user_id, jornada: j as Jornada, config: c };
  await evento(ctx, "director", "plan", `Jornada ${origen} creada con ${plan.length} tarea${plan.length === 1 ? "" : "s"}: ${plan.map((t) => t.agente).join(", ") || "ninguna"}`, { plan });
  return j as Jornada;
}

async function procesar(j: Jornada, inicio: number) {
  const c = await config(j.user_id);
  const ctx: Ctx = { user_id: j.user_id, jornada: j, config: c };
  if (c.pausada) {
    await srv.from("jornadas").update({ estado: "pausada" }).eq("id", j.id);
    await evento(ctx, "director", "pausa", "Jornada detenida: RADAR está en pausa");
    return;
  }
  // Duración máxima: lo que quede pendiente se omite
  if (Date.now() - Date.parse(j.inicio) > c.duracion_max_min * 60_000) {
    await srv.from("tareas").update({ estado: "omitida", error: "Duración máxima de la jornada superada" }).eq("jornada_id", j.id).in("estado", ["pendiente", "en_curso"]);
    await evento(ctx, "director", "limite", `Se ha superado la duración máxima (${c.duracion_max_min} min): tareas pendientes omitidas`);
  }
  while (Date.now() - inicio < LIMITE_MS) {
    const { data: t, error } = await srv.rpc("reclamar_tarea", { p_jornada: j.id });
    if (error) throw error;
    if (!t?.id) break;
    const ejecutar = AGENTES[t.agente];
    try {
      if (!ejecutar) throw new Error(`Agente desconocido: ${t.agente}`);
      if (c.agentes_off.includes(t.agente)) {
        await srv.from("tareas").update({ estado: "omitida", terminada: new Date().toISOString(), error: "Agente desactivado" }).eq("id", t.id);
        continue;
      }
      const r = await ejecutar(ctx, t.entrada || {}, t.id);
      await srv.from("tareas").update({ estado: "hecha", salida: r.salida, coste: r.coste ?? 0, terminada: new Date().toISOString(), error: null }).eq("id", t.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const f = trasFallo(t, msg);
      await srv.from("tareas").update({ estado: f.estado, error: f.error, terminada: f.estado === "fallida" ? new Date().toISOString() : null }).eq("id", t.id);
      await evento(ctx, t.agente, "error", `${f.estado === "fallida" ? "Falló definitivamente" : "Falló, se reintentará"}: ${f.error}`, null, t.id);
    }
  }
  await consolidar(ctx);
}

async function consolidar(ctx: Ctx) {
  const { data: ts } = await srv.from("tareas").select("agente,estado,salida,coste,error").eq("jornada_id", ctx.jornada.id);
  const tareas = ts || [];
  const estado = cerrarJornada(tareas);
  const coste = tareas.reduce((s, t) => s + Number(t.coste || 0), 0);
  const det = tareas.find((t) => t.agente === "detector" && t.estado === "hecha")?.salida as Record<string, unknown> | undefined;
  const resumen = {
    tareas: { total: tareas.length, hechas: tareas.filter((t) => t.estado === "hecha").length, fallidas: tareas.filter((t) => t.estado === "fallida").length, omitidas: tareas.filter((t) => t.estado === "omitida").length },
    senales_nuevas: det?.nuevas ?? null, senales_conocidas: det?.ya_conocidas ?? null,
    errores: tareas.filter((t) => t.error).map((t) => `${t.agente}: ${t.error}`),
  };
  const cambios: Record<string, unknown> = { resumen, coste };
  if (estado !== "en_curso") { cambios.estado = estado; cambios.fin = new Date().toISOString(); }
  await srv.from("jornadas").update(cambios).eq("id", ctx.jornada.id).neq("estado", "pausada");
  if (estado !== "en_curso" && ctx.jornada.estado === "en_curso") {
    await evento(ctx, "director", "cierre", estado === "completada" ? "Jornada completada" : "Jornada terminada con errores", resumen);
  }
}

async function jornadasAbiertas(user_id?: string) {
  let q = srv.from("jornadas").select("*").eq("estado", "en_curso").gte("inicio", new Date(Date.now() - 24 * 3600_000).toISOString());
  if (user_id) q = q.eq("user_id", user_id);
  const { data } = await q.order("inicio");
  return (data || []) as Jornada[];
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const o = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(o) });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405, o);
  const inicio = Date.now();
  try {
    const body = await req.json().catch(() => ({}));

    // ---- Llamada programada (pg_cron) ----
    if (body.modo === "cron") {
      const { data: s } = await srv.from("ajustes_internos").select("valor").eq("clave", "cron").maybeSingle();
      if (!s?.valor || req.headers.get("x-radar-cron") !== s.valor) return responder({ error: "No autorizado" }, 401, o);
      const { data: cfgs } = await srv.from("config_jornada").select("*");
      const informe: Record<string, string> = {};
      for (const c of (cfgs || []) as (Config & { user_id: string })[]) {
        const hoy = madrid(new Date()).fecha;
        const { data: ya } = await srv.from("jornadas").select("id").eq("user_id", c.user_id).eq("fecha", hoy).eq("origen", "programada").maybeSingle();
        const d = tocaJornada(c, new Date(), Boolean(ya));
        informe[c.user_id] = d.motivo;
        if (d.toca) await crearJornada(c.user_id, "programada", c);
      }
      for (const j of await jornadasAbiertas()) {
        if (Date.now() - inicio > LIMITE_MS) break;
        await procesar(j, inicio);
      }
      return responder({ ok: true, informe }, 200, o);
    }

    // ---- Llamada manual desde RADAR ----
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return responder({ error: "Entra con tu correo para usar los agentes." }, 401, o);
    const { data: admin } = await sb.rpc("es_admin");
    if (admin !== true) return responder({ error: "Los agentes solo están activados para la cuenta de administración." }, 403, o);
    const uid = u.user.id;
    const c = await config(uid);

    if (body.accion === "pausar" || body.accion === "reanudar") {
      await srv.from("config_jornada").update({ pausada: body.accion === "pausar", actualizado: new Date().toISOString() }).eq("user_id", uid);
      if (body.accion === "reanudar") await srv.from("jornadas").update({ estado: "en_curso" }).eq("user_id", uid).eq("estado", "pausada");
      return responder({ ok: true, pausada: body.accion === "pausar" }, 200, o);
    }
    if (body.accion === "reintentar" && body.tarea_id) {
      const { data: t } = await srv.from("tareas").select("id,jornada_id,intentos,max_intentos").eq("id", body.tarea_id).eq("user_id", uid).maybeSingle();
      if (!t) return responder({ error: "Tarea no encontrada" }, 404, o);
      await srv.from("tareas").update({ estado: "pendiente", error: null, max_intentos: t.intentos + 1 }).eq("id", t.id);
      await srv.from("jornadas").update({ estado: "en_curso", fin: null }).eq("id", t.jornada_id);
    }
    if (body.accion === "lanzar") {
      if (c.pausada) return responder({ error: "RADAR está en pausa. Reanúdalo para lanzar una jornada." }, 409, o);
      const abiertas = await jornadasAbiertas(uid);
      if (!abiertas.length) await crearJornada(uid, "manual", c);
    }
    for (const j of await jornadasAbiertas(uid)) {
      if (Date.now() - inicio > LIMITE_MS) break;
      await procesar(j, inicio);
    }
    const { data: ult } = await srv.from("jornadas").select("id,fecha,origen,estado,resumen,coste,inicio,fin").eq("user_id", uid).order("inicio", { ascending: false }).limit(1).maybeSingle();
    return responder({ ok: true, jornada: ult }, 200, o);
  } catch (e) {
    return responder({ error: e instanceof Error ? e.message : "Error inesperado" }, 500, o);
  }
});
