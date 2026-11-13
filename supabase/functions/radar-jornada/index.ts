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
import { cerrarJornada, COSTE_ESTIMADO_INVESTIGACION, deduplicar, elegirCandidatas, elegirOfertas, firmaTexto, madrid, modoEnvio, planificar, quedaPresupuesto, seguimientosDebidos, senalDesdeItem, sinTelefonos, textoSeguimiento, tocaJornada, zonaEmpresa, trasFallo, type Candidata, type Config, type EnvioResumen, type ItemPuntuable } from "./nucleo.ts";
import { investigarEmpresa, redactarPresentacion, revisarPresentacion } from "./ia.ts";

const WEB = "https://lovera86.github.io/radar";
const ORIGENES = ["https://lovera86.github.io", "http://localhost:8765"];
const LIMITE_MS = 100_000;
const AGENTES_IA = new Set(["investigador", "comercial"]);
const COSTE_ESTIMADO_REDACCION = 0.03;
const ESTADOS_TRABAJADOS = new Set(["borrador", "aprobacion", "enviada", "respuesta", "seguimiento", "reunion", "descartada"]); // como mucho una llamada de IA por ejecución, y solo al principio
const MARGEN_IA_MS = 20_000;

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
type Resultado = { salida: Record<string, unknown>; coste?: number; omitida?: string };

async function leerRecogida(): Promise<ItemPuntuable[]> {
  const r = await fetch(`${WEB}/data/oportunidades.json?t=${Date.now()}`, { headers: { "User-Agent": "RADAR-agentes" } });
  if (!r.ok) throw new Error(`No se ha podido leer la recogida diaria (HTTP ${r.status})`);
  const items = await r.json();
  if (!Array.isArray(items)) throw new Error("La recogida diaria no tiene el formato esperado");
  return items;
}

/* Empresas que no deben recibir una presentación: descartadas, ya trabajadas en tu bandeja o ya contactadas. */
async function noContactar(user_id: string): Promise<Set<string>> {
  const no = new Set<string>();
  const { data: est } = await srv.from("estado").select("valor").eq("user_id", user_id).eq("clave", "radar-v2").maybeSingle();
  const v = (est?.valor || {}) as { bandeja?: Record<string, { estado?: string }>; excluidas?: Record<string, unknown> };
  Object.keys(v.excluidas || {}).forEach((k) => no.add(k));
  Object.entries(v.bandeja || {}).forEach(([k, o]) => { if (ESTADOS_TRABAJADOS.has(String(o?.estado))) no.add(k); });
  const { data: env } = await srv.from("envios").select("empresa_clave,para").eq("user_id", user_id).eq("tipo", "presentacion").in("estado", ["listo", "enviado", "respondido"]);
  (env || []).forEach((e) => { no.add(e.empresa_clave); no.add(`correo:${e.para}`); });
  return no;
}

/* Cuántas presentaciones más caben hoy (preparadas hoy + tareas del Comercial en cola). */
async function cupoEnviosHoy(ctx: Ctx): Promise<number> {
  const max = ctx.config.max_envios ?? 3;
  const desde = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { count: hechos } = await srv.from("envios").select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user_id).eq("tipo", "presentacion").neq("estado", "cancelado").gte("creado", desde);
  const { count: enCola } = await srv.from("tareas").select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user_id).eq("agente", "comercial").in("estado", ["pendiente", "en_curso"]);
  return Math.max(0, max - (hechos || 0) - (enCola || 0));
}

async function encolarComercial(ctx: Ctx, cs: Candidata[], tarea_id?: string) {
  if (!cs.length || ctx.config.agentes_off.includes("comercial") || modoEnvio(ctx.config, madrid(new Date()).fecha) === "apagado") return 0;
  const cupo = await cupoEnviosHoy(ctx);
  const elegidas = cs.slice(0, cupo);
  if (!elegidas.length) return 0;
  const { error } = await srv.from("tareas").upsert(elegidas.map((c, i) => ({
    jornada_id: ctx.jornada.id, user_id: ctx.user_id, agente: "comercial", clave: `presentar:${c.k}`,
    prioridad: 70 - i, entrada: c, max_intentos: 1,
  })), { onConflict: "jornada_id,clave", ignoreDuplicates: true });
  if (error) throw error;
  await evento(ctx, "comercial", "plan", `Presentaciones a preparar: ${elegidas.map((c) => c.empresa).join(", ")}`, null, tarea_id);
  return elegidas.length;
}

/* Lo que ya se ha gastado hoy en IA, sumando todas las jornadas del día (también las manuales). */
async function gastadoHoy(user_id: string): Promise<number> {
  const { data: js } = await srv.from("jornadas").select("id").eq("user_id", user_id).eq("fecha", madrid(new Date()).fecha);
  const ids = (js || []).map((j) => j.id);
  if (!ids.length) return 0;
  const { data: ts } = await srv.from("tareas").select("coste").in("jornada_id", ids);
  return (ts || []).reduce((s, t) => s + Number(t.coste || 0), 0);
}
const AGENTES: Record<string, (ctx: Ctx, entrada: Record<string, unknown>, tarea_id: string) => Promise<Resultado>> = {

  // Detector: lee lo que la recogida diaria de RADAR ha publicado y guarda las señales nuevas.
  async detector(ctx, _entrada, tarea_id) {
    const items = await leerRecogida();
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

  // Analista: puntúa las empresas con los criterios de RADAR y elige las que se investigan hoy.
  // No usa IA. No repite empresas que ya están en tu bandeja, que descartaste o que ya se investigaron.
  async analista(ctx, _entrada, tarea_id) {
    const uid = ctx.user_id;
    const items = await leerRecogida();
    const yaVistas = new Set<string>();
    const { data: ops } = await srv.from("oportunidades").select("clave").eq("user_id", uid);
    (ops || []).forEach((o) => yaVistas.add(o.clave));
    const { data: est } = await srv.from("estado").select("valor").eq("user_id", uid).eq("clave", "radar-v2").maybeSingle();
    const v = (est?.valor || {}) as { bandeja?: Record<string, unknown>; excluidas?: Record<string, unknown> };
    Object.keys(v.bandeja || {}).forEach((k) => yaVistas.add(k));
    Object.keys(v.excluidas || {}).forEach((k) => yaVistas.add(k));

    const desde = new Date(Date.now() - 20 * 3600_000).toISOString();
    const { count: hoyYa } = await srv.from("oportunidades").select("clave", { count: "exact", head: true })
      .eq("user_id", uid).in("agente", ["analista", "investigador"]).gte("creado", desde);
    const cupo = Math.max(0, ctx.config.max_ia - (hoyYa || 0));
    const empresas = items.filter(zonaEmpresa); // presencial solo en Asturias
    const { elegidas, por_encima } = elegirCandidatas(empresas, yaVistas, cupo, ctx.config.umbral);
    const investigar = !ctx.config.agentes_off.includes("investigador");

    if (elegidas.length) {
      const ahora = new Date().toISOString();
      const filas = elegidas.map((c) => ({
        user_id: uid, clave: c.k, tipo: "empresa", titulo: c.empresa, organizacion: c.empresa,
        datos: { candidata: c }, puntuacion: c.puntos, explicacion: { motivos: c.motivos, sin_info: c.sin_info },
        estado: investigar ? "investigando" : "priorizada", agente: "analista", senales: c.items,
        siguiente: investigar ? "La investiga el Investigador" : "Investigar la empresa", actualizado: ahora,
      }));
      const { error } = await srv.from("oportunidades").upsert(filas, { onConflict: "user_id,clave", ignoreDuplicates: true });
      if (error) throw error;
      if (investigar) {
        const tareas = elegidas.map((c, i) => ({
          jornada_id: ctx.jornada.id, user_id: uid, agente: "investigador", clave: `investigar:${c.k}`,
          prioridad: 80 - i, entrada: c, max_intentos: 1, // la IA cuesta dinero: no se reintenta sola
        }));
        const { error: e2 } = await srv.from("tareas").upsert(tareas, { onConflict: "jornada_id,clave", ignoreDuplicates: true });
        if (e2) throw e2;
      }
    }
    // A quién presentarse hoy: encaje alto y correo comprobado en la web oficial de la empresa.
    const umbralEnvio = ctx.config.umbral_envio ?? 80;
    const no = await noContactar(uid);
    const ofertas = elegirOfertas(items, no, 50, umbralEnvio);
    const paraEnviar = [
      ...ofertas, // candidaturas a ofertas que dan un correo: van primero
      ...elegirCandidatas(empresas, no, 50, umbralEnvio).elegidas.filter((c) => c.email && c.email_fuente && !no.has(`correo:${c.email}`)),
    ];
    const enviar = await encolarComercial(ctx, paraEnviar, tarea_id);
    const lista = elegidas.map((c) => `${c.empresa} (${c.puntos})`).join(", ");
    await evento(ctx, "analista", "priorizacion", elegidas.length
      ? `${por_encima} empresas nuevas superan tu umbral de ${ctx.config.umbral}; elegidas hoy: ${lista}`
      : cupo === 0 ? "Hoy ya se ha cubierto el cupo de empresas investigadas" : `Ninguna empresa nueva supera tu umbral de ${ctx.config.umbral}`,
      { elegidas: elegidas.map((c) => ({ empresa: c.empresa, puntos: c.puntos, motivos: c.motivos })) }, tarea_id);
    return { salida: { por_encima, elegidas: elegidas.map((c) => ({ k: c.k, empresa: c.empresa, puntos: c.puntos })), presentaciones: enviar } };
  },

  // Investigador: busca en la web la empresa elegida (IA, dentro del presupuesto del día).
  async investigador(ctx, entrada, tarea_id) {
    const c = entrada as unknown as Candidata;
    const gastado = await gastadoHoy(ctx.user_id);
    if (!quedaPresupuesto(ctx.config, gastado, COSTE_ESTIMADO_INVESTIGACION)) {
      await srv.from("oportunidades").update({ estado: "priorizada", siguiente: "Investigar la empresa (sin presupuesto hoy)", actualizado: new Date().toISOString() }).eq("user_id", ctx.user_id).eq("clave", c.k);
      await evento(ctx, "investigador", "limite", `Sin presupuesto para investigar ${c.empresa}: gastado hoy ${gastado.toFixed(3)} $ de ${Number(ctx.config.presupuesto_dia).toFixed(2)} $`, null, tarea_id);
      return { salida: { empresa: c.empresa }, omitida: "Presupuesto del día agotado" };
    }
    const { investigacion: inv, coste } = await investigarEmpresa({ empresa: c.empresa, ciudad: c.ciudad, hechos: c.hechos });
    const ahora = new Date().toISOString();
    const { error } = await srv.from("oportunidades").update({
      estado: "validada", agente: "investigador", datos: { candidata: c, investigacion: inv },
      siguiente: "Revisar la propuesta y decidir si contactar", ultima_verificacion: ahora, actualizado: ahora,
    }).eq("user_id", ctx.user_id).eq("clave", c.k);
    if (error) throw Object.assign(new Error(error.message), { coste });
    const k = inv.contacto;
    const fuente = k.fuente_url || k.pagina || k.formulario || "";
    if (fuente && (k.email || k.formulario || k.pagina)) {
      const [nombre, ...cargo] = String(k.persona || "").split(",");
      await srv.from("contactos").upsert({
        user_id: ctx.user_id, empresa_clave: c.k, nombre: nombre?.trim() || null, cargo: cargo.join(",").trim() || null,
        email: k.email || null, web: inv.web_oficial || null, formulario: k.formulario || null, fuente,
        verificado: inv.consultada, confianza: k.email ? "alta" : "media", agente: "investigador",
      }, { onConflict: "user_id,empresa_clave" });
    }
    if (k.email && k.fuente_url && c.puntos >= (ctx.config.umbral_envio ?? 80) && !(await noContactar(ctx.user_id)).has(c.k)) {
      await encolarComercial(ctx, [{ ...c, email: k.email.toLowerCase(), email_fuente: k.fuente_url }], tarea_id);
    }
    const canal = k.email ? "correo publicado" : k.formulario ? "formulario" : k.pagina ? "página de contacto" : "sin canal publicado";
    await evento(ctx, "investigador", "investigacion", `${c.empresa}: ${inv.senales.length} señal${inv.senales.length === 1 ? "" : "es"} con fuente, ${canal} · ${coste.toFixed(3)} $`, { dudas: inv.dudas }, tarea_id);
    return { salida: { empresa: c.empresa, senales: inv.senales.length, canal }, coste };
  },

  // Comercial: redacta la presentación, un segundo repaso la revisa y, si la aprueba, queda lista
  // para el cartero. Nunca envía nada por sí mismo.
  async comercial(ctx, entrada, tarea_id) {
    const c = entrada as unknown as Candidata;
    const cfg = ctx.config;
    const modo = modoEnvio(cfg, madrid(new Date()).fecha);
    const omitir = async (motivo: string) => { await evento(ctx, "comercial", "aviso", `${c.empresa}: ${motivo}`, null, tarea_id); return { salida: { empresa: c.empresa }, omitida: motivo }; };
    if (modo === "apagado") return omitir("el envío automático está apagado");
    if (!c.email || !c.email_fuente) return omitir("no hay un correo publicado por la empresa");
    const noC = await noContactar(ctx.user_id);
    if (noC.has(c.k) || noC.has(`correo:${c.email}`)) return omitir("ya se le escribió o la descartaste");
    const oferta = c.tipo === "oferta" ? { puesto: c.puesto || "", descripcion: c.descripcion, url: c.url } : undefined;
    const hechos = (cfg.perfil_hechos || []).slice(0, 25);
    const firma = cfg.firma || {};
    if (hechos.length < 3 || !firma.nombre || !firma.email) return omitir("faltan tu perfil o tu firma: abre RADAR una vez con tu sesión y se copian solos");
    if (modo === "real" && !cfg.cv_ruta) return omitir("falta el CV para adjuntar (Mi perfil → Agentes → CV para enviar)");
    if (!quedaPresupuesto(cfg, await gastadoHoy(ctx.user_id), COSTE_ESTIMADO_REDACCION)) return omitir("sin presupuesto de IA hoy");

    const { data: op } = await srv.from("oportunidades").select("datos").eq("user_id", ctx.user_id).eq("clave", c.k).maybeSingle();
    const inv = (op?.datos as { investigacion?: { senales?: { titulo: string; fecha?: string; fuente?: string }[]; actividad?: string } } | null)?.investigacion;
    const senales = [
      ...c.hechos.map((h, i) => ({ id: `s${i + 1}`, texto: oferta ? h : `Ha ganado el contrato: ${h}` })),
      ...(inv?.senales || []).map((x, i) => ({ id: `w${i + 1}`, texto: `${x.titulo}${x.fecha ? ` (${x.fecha})` : ""}${x.fuente ? `, según ${x.fuente}` : ""}` })),
      ...(inv?.actividad ? [{ id: "a1", texto: `Actividad de la empresa según su web: ${inv.actividad}` }] : []),
    ].slice(0, 8);

    let coste = 0;
    const r = await redactarPresentacion({ empresa: c.empresa, senales, hechos, nombre: firma.nombre, oferta });
    coste += r.coste;
    const cuerpoIA = sinTelefonos(r.datos.cuerpo);
    const problemas: string[] = [];
    if (/[\[\]{}]|XXX|<[a-z]/i.test(cuerpoIA + r.datos.asunto)) problemas.push("Contiene marcadores sin rellenar");
    const palabras = cuerpoIA.split(/\s+/).length;
    if (palabras < 60 || palabras > 260) problemas.push(`Longitud anómala (${palabras} palabras)`);
    const rv = await revisarPresentacion({ empresa: c.empresa, asunto: r.datos.asunto, cuerpo: cuerpoIA, senales, hechos, oferta }).catch((e) => { coste += Number(e?.coste || 0); return null; });
    if (rv) coste += rv.coste; else problemas.push("No se pudo hacer el segundo repaso");
    if (rv && !rv.datos.aprobado) problemas.push(...(rv.datos.problemas.length ? rv.datos.problemas : ["El repaso no lo aprobó"]));
    const aprobado = problemas.length === 0;
    const cuerpo = `${cuerpoIA}\n\nUn saludo,\n${firmaTexto(firma)}`;

    const { error } = await srv.from("envios").insert({
      user_id: ctx.user_id, clave: c.k, empresa: c.empresa, empresa_clave: c.k, tipo: "presentacion", modo,
      para: c.email, fuente_correo: c.email_fuente, asunto: r.datos.asunto.slice(0, 160), cuerpo,
      revision: { aprobado, problemas, hechos_usados: r.datos.hechos_usados, senal_usada: r.datos.senal_usada, senales, puntos: c.puntos, tipo: c.tipo || "empresa", puesto: c.puesto, url: c.url },
      estado: aprobado ? "listo" : "bloqueado",
    });
    if (error) throw Object.assign(new Error(error.code === "23505" ? "Ya hay una presentación para esta empresa" : error.message), { coste });
    const ahora = new Date().toISOString();
    await srv.from("oportunidades").upsert({
      user_id: ctx.user_id, clave: c.k, tipo: oferta ? "empleo" : "empresa", titulo: oferta ? `${c.puesto} · ${c.empresa}` : c.empresa, organizacion: c.empresa, puntuacion: c.puntos,
      explicacion: { motivos: c.motivos, sin_info: c.sin_info }, datos: { candidata: c, ...(inv ? { investigacion: inv } : {}) },
      estado: aprobado ? "aprobacion" : "borrador", agente: "comercial", senales: c.items, actualizado: ahora,
      siguiente: aprobado ? (modo === "real" ? "Se enviará en el próximo reparto" : "Ensayo: te llegará una copia a ti") : "Revisar el borrador (el repaso lo bloqueó)",
    }, { onConflict: "user_id,clave" });
    await evento(ctx, "comercial", aprobado ? "presentacion" : "bloqueo",
      aprobado ? `${oferta ? `Candidatura «${c.puesto}» en ` : ""}${c.empresa}: lista (${modo === "real" ? "envío real" : "ensayo"}) para ${c.email}` : `${c.empresa}: el repaso la bloqueó: ${problemas.join("; ")}`,
      { problemas }, tarea_id);
    return { salida: { empresa: c.empresa, aprobado, modo }, coste };
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
  let iaHecha = false;
  while (Date.now() - inicio < LIMITE_MS) {
    // Una investigación tarda hasta ~1,5 min: solo se empieza al principio de la ejecución
    // (la siguiente llamada programada, 5 minutos después, sigue con la próxima).
    if (iaHecha || Date.now() - inicio > MARGEN_IA_MS) {
      const { data: sig } = await srv.from("tareas").select("agente").eq("jornada_id", j.id).eq("estado", "pendiente")
        .order("prioridad", { ascending: false }).order("creado").limit(1).maybeSingle();
      if (sig && AGENTES_IA.has(sig.agente)) break;
    }
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
      if (AGENTES_IA.has(t.agente)) iaHecha = true;
      const r = await ejecutar(ctx, t.entrada || {}, t.id);
      await srv.from("tareas").update({ estado: r.omitida ? "omitida" : "hecha", salida: r.salida, coste: r.coste ?? 0, terminada: new Date().toISOString(), error: r.omitida ?? null }).eq("id", t.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const coste = Number((e as { coste?: number })?.coste || 0); // lo gastado en IA cuenta aunque falle
      const f = trasFallo(t, msg);
      await srv.from("tareas").update({ estado: f.estado, error: f.error, coste, terminada: f.estado === "fallida" ? new Date().toISOString() : null }).eq("id", t.id);
      if (t.agente === "investigador" && f.estado === "fallida") {
        await srv.from("oportunidades").update({ estado: "priorizada", siguiente: "Investigar la empresa (falló la investigación automática)" }).eq("user_id", ctx.user_id).eq("clave", String((t.entrada || {}).k || ""));
      }
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
  const inv = tareas.filter((t) => t.agente === "investigador" && t.estado === "hecha").map((t) => String((t.salida as Record<string, unknown>)?.empresa || ""));
  const resumen = {
    investigadas: inv.length, propuestas: inv,
    presentaciones: tareas.filter((t) => t.agente === "comercial" && t.estado === "hecha" && (t.salida as Record<string, unknown>)?.aprobado).map((t) => String((t.salida as Record<string, unknown>)?.empresa || "")),
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

async function cartero(body: Record<string, unknown>) {
  const ahora = new Date();
  if (body.accion === "cola") {
    const { data: cfgs } = await srv.from("config_jornada").select("*");
    const usuarios = [];
    for (const c of (cfgs || []) as (Config & { user_id: string })[]) {
      const modo = modoEnvio(c, madrid(ahora).fecha);
      if (modo === "apagado") continue;
      // Lo que lleva más de 3 días esperando ya no se envía (la señal puede haber caducado).
      await srv.from("envios").update({ estado: "cancelado", error: "Caducado: más de 3 días en cola" })
        .eq("user_id", c.user_id).eq("estado", "listo").lt("creado", new Date(ahora.getTime() - 3 * 86400_000).toISOString());
      const { data: listos } = await srv.from("envios").select("id,modo,empresa,para,asunto,cuerpo,fuente_correo")
        .eq("user_id", c.user_id).eq("estado", "listo").eq("tipo", "presentacion").order("creado").limit(c.max_envios ?? 3);
      const { data: todos } = await srv.from("envios").select("id,tipo,modo,estado,enviado,empresa,para,asunto,en_respuesta_a,message_id")
        .eq("user_id", c.user_id).gte("creado", new Date(ahora.getTime() - 60 * 86400_000).toISOString());
      const lista = (todos || []) as (EnvioResumen & { message_id: string | null })[];
      let cv_url: string | null = null;
      if (c.cv_ruta) {
        const { data: u } = await srv.storage.from("cv").createSignedUrl(c.cv_ruta, 3600);
        cv_url = u?.signedUrl ?? null;
      }
      usuarios.push({
        user_id: c.user_id, modo, firma: c.firma || {}, cv_url, cv_nombre: c.cv_ruta ? c.cv_ruta.split("/").pop() : null,
        envios: listos || [],
        seguimientos: modo === "real" ? seguimientosDebidos(lista, ahora).map((e) => ({ ...e, cuerpo: textoSeguimiento(e, c.firma || {}) })) : [],
        abiertos: lista.filter((e) => e.modo === "real" && e.estado === "enviado" && e.tipo === "presentacion").map((e) => ({ id: e.id, para: e.para, enviado: e.enviado, empresa: e.empresa })),
        firma_texto: firmaTexto(c.firma || {}),
      });
    }
    return { ok: true, usuarios };
  }
  const id = String(body.id || "");
  const { data: env } = await srv.from("envios").select("id,user_id,clave,modo,tipo,empresa,para,asunto").eq("id", id).maybeSingle();
  if (!env) return { error: "Envío no encontrado" };
  if (body.accion === "marcar") {
    const estado = body.estado === "enviado" ? "enviado" : "fallido";
    await srv.from("envios").update({ estado, enviado: estado === "enviado" ? ahora.toISOString() : null, message_id: body.message_id ?? null, error: body.error ? String(body.error).slice(0, 500) : null }).eq("id", id);
    if (estado === "enviado" && env.modo === "real") {
      await srv.from("oportunidades").update({ estado: "contactada", siguiente: "Esperar respuesta (seguimiento automático a los 10 días)", actualizado: ahora.toISOString() }).eq("user_id", env.user_id).eq("clave", env.clave);
    }
    return { ok: true };
  }
  if (body.accion === "seguimiento") {
    await srv.from("envios").insert({
      user_id: env.user_id, clave: env.clave, empresa: env.empresa, empresa_clave: env.clave, tipo: "seguimiento", modo: "real",
      para: env.para, fuente_correo: "seguimiento", asunto: String(body.asunto || `Re: ${env.asunto}`), cuerpo: String(body.cuerpo || ""),
      estado: "enviado", enviado: ahora.toISOString(), en_respuesta_a: env.id, message_id: body.message_id ?? null,
    });
    return { ok: true };
  }
  if (body.accion === "respondido") {
    await srv.from("envios").update({ estado: "respondido" }).eq("id", id);
    await srv.from("oportunidades").update({ estado: "respuesta", siguiente: "Contestar y proponer una llamada", actualizado: ahora.toISOString() }).eq("user_id", env.user_id).eq("clave", env.clave);
    return { ok: true };
  }
  return { error: "Acción desconocida" };
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

    // ---- Cartero (GitHub Actions): recoge la cola y marca lo enviado ----
    if (body.modo === "cartero") {
      const { data: s } = await srv.from("ajustes_internos").select("valor").eq("clave", "cartero").maybeSingle();
      if (!s?.valor || req.headers.get("x-radar-cartero") !== s.valor) return responder({ error: "No autorizado" }, 401, o);
      return responder(await cartero(body), 200, o);
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
