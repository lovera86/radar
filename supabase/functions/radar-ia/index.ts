// RADAR · servicio de IA (Supabase Edge Function «radar-ia»).
//
// La web nunca ve la clave de Claude: vive como secreto del proyecto (ANTHROPIC_API_KEY).
// Solo la usan cuentas de administración (tabla administradores), con un límite diario.
//
// Acciones (POST JSON { accion, ... }):
//   perfil_cv     texto del CV → perfil estructurado; cada dato lleva su cita literal del CV,
//                 y el servidor comprueba que la cita está en el texto (verificado sí/no).
//   investigar    empresa → web oficial, actividad, señales recientes y canal de contacto,
//                 buscando en la web. Solo se devuelven URL que la búsqueda ha visitado de
//                 verdad y correos que aparecen literalmente en una página leída.
//   presentacion  señales + hechos del perfil → mensaje único para esa empresa; el modelo
//                 solo puede usar los hechos que se le pasan y dice cuáles ha usado.
//
// Reglas (ticket RADAR 2.0): no inventar vacantes, necesidades, contactos ni correos;
// distinguir hechos de hipótesis; nada se envía desde aquí.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODELO = "claude-opus-5-5";
const LIMITE_DIARIO = 15;
const ORIGENES = ["https://lovera86.github.io", "http://localhost:8765"];

const cors = (origen: string | null) => ({
  "Access-Control-Allow-Origin": origen && ORIGENES.includes(origen) ? origen : ORIGENES[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const responder = (cuerpo: unknown, estado: number, origen: string | null) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors(origen), "Content-Type": "application/json" } });

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase().trim();

const anthropic = new Anthropic(); // lee ANTHROPIC_API_KEY de los secretos del proyecto

// Llamada común: Claude Opus 5.5 con respaldo automático si el modelo declina la petición.
async function pedir(params: {
  system: string;
  user: string;
  esquema?: Record<string, unknown>;
  herramientas?: Anthropic.Beta.BetaToolUnion[];
  esfuerzo?: "low" | "medium" | "high";
  maxTokens?: number;
}) {
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: params.user }];
  let respuesta: Anthropic.Beta.BetaMessage | null = null;
  const bloques: Anthropic.Beta.BetaContentBlock[] = [];
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    respuesta = await anthropic.beta.messages.create({
      model: MODELO,
      max_tokens: params.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: params.system,
      messages: mensajes,
      output_config: {
        effort: params.esfuerzo ?? "medium",
        ...(params.esquema ? { format: { type: "json_schema", schema: params.esquema } } : {}),
      },
      ...(params.herramientas ? { tools: params.herramientas } : {}),
    });
    bloques.push(...respuesta.content);
    if (respuesta.stop_reason !== "pause_turn") break;
    mensajes.push({ role: "assistant", content: respuesta.content });
  }
  if (!respuesta) throw new Error("Sin respuesta");
  if (respuesta.stop_reason === "refusal") throw new Error("La IA no ha podido responder a esta petición.");
  if (respuesta.stop_reason === "max_tokens") throw new Error("La respuesta era demasiado larga. Inténtalo con menos texto.");
  const texto = respuesta.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("");
  return { texto, bloques, uso: respuesta.usage };
}

function jsonDe(texto: string): unknown {
  const m = texto.match(/```json\s*([\s\S]*?)```/) || texto.match(/(\{[\s\S]*\})\s*$/);
  return JSON.parse(m ? m[1] : texto);
}

// ---------------------------------------------------------------------------
// 1. Perfil a partir del CV
// ---------------------------------------------------------------------------
const cita = { type: "string", description: "Fragmento copiado literalmente del CV que respalda el dato" };
const ESQUEMA_PERFIL = {
  type: "object",
  additionalProperties: false,
  required: ["nombre", "titular", "ubicacion", "experiencia", "formacion", "idiomas", "certificaciones", "competencias", "logros", "sectores", "inferencias", "preferencias"],
  properties: {
    nombre: { type: "string" },
    titular: { type: "string", description: "Titular profesional tal como aparece en el CV, o vacío" },
    ubicacion: { type: "string" },
    experiencia: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["puesto", "empresa", "fechas", "cita", "funciones"],
        properties: {
          puesto: { type: "string" }, empresa: { type: "string" }, fechas: { type: "string" }, cita,
          funciones: { type: "array", items: { type: "object", additionalProperties: false, required: ["texto", "cita"], properties: { texto: { type: "string" }, cita } } },
        },
      },
    },
    formacion: { type: "array", items: { type: "object", additionalProperties: false, required: ["titulo", "centro", "fechas", "cita"], properties: { titulo: { type: "string" }, centro: { type: "string" }, fechas: { type: "string" }, cita } } },
    idiomas: { type: "array", items: { type: "object", additionalProperties: false, required: ["idioma", "nivel", "cita"], properties: { idioma: { type: "string" }, nivel: { type: "string" }, cita } } },
    certificaciones: { type: "array", items: { type: "object", additionalProperties: false, required: ["nombre", "cita"], properties: { nombre: { type: "string" }, cita } } },
    competencias: { type: "array", items: { type: "object", additionalProperties: false, required: ["nombre", "cita"], properties: { nombre: { type: "string" }, cita } } },
    logros: { type: "array", description: "Solo resultados que el CV enuncia (cifras, premios, mejoras). Nunca inventados.", items: { type: "object", additionalProperties: false, required: ["texto", "cita"], properties: { texto: { type: "string" }, cita } } },
    sectores: { type: "array", items: { type: "object", additionalProperties: false, required: ["nombre", "cita"], properties: { nombre: { type: "string" }, cita } } },
    inferencias: { type: "array", description: "Lecturas razonables que NO están escritas en el CV, con su base", items: { type: "object", additionalProperties: false, required: ["texto", "base"], properties: { texto: { type: "string" }, base: { type: "string" } } } },
    preferencias: { type: "array", description: "Disponibilidad, movilidad, carné, modalidad... solo si el CV las menciona", items: { type: "object", additionalProperties: false, required: ["texto", "cita"], properties: { texto: { type: "string" }, cita } } },
  },
};

async function perfilCV(texto: string) {
  if (!texto || texto.length < 200) throw new Error("El CV está vacío o no se ha podido leer el texto.");
  if (texto.length > 60000) throw new Error("El CV es demasiado largo (más de 60.000 caracteres).");
  const { texto: salida, uso } = await pedir({
    esfuerzo: "medium",
    system: [
      "Extraes un perfil profesional estructurado a partir de un CV, en español.",
      "Reglas estrictas:",
      "- Solo hechos que estén escritos en el CV. No inventes experiencia, títulos, idiomas, niveles, cifras ni resultados.",
      "- Cada dato lleva en «cita» un fragmento copiado literalmente del CV (mismas palabras), de 3 a 25 palabras.",
      "- Lo que deduzcas y no esté escrito va en «inferencias», con su base. Nunca lo mezcles con los hechos.",
      "- No incluyas teléfono, DNI, fecha de nacimiento, estado civil, foto ni datos de salud aunque aparezcan.",
      "- Si un apartado no existe en el CV, devuelve una lista vacía.",
    ].join("\n"),
    user: `<cv>\n${texto}\n</cv>\n\nExtrae el perfil.`,
    esquema: ESQUEMA_PERFIL,
  });
  const p = JSON.parse(salida) as Record<string, any>;
  const base = norm(texto);
  const comprobar = (o: any) => { if (o && typeof o === "object" && "cita" in o) o.verificado = Boolean(o.cita) && base.includes(norm(o.cita)); };
  for (const k of ["experiencia", "formacion", "idiomas", "certificaciones", "competencias", "logros", "sectores", "preferencias"]) {
    for (const o of p[k] || []) { comprobar(o); for (const f of o.funciones || []) comprobar(f); }
  }
  return { perfil: p, uso };
}

// ---------------------------------------------------------------------------
// 2. Investigar una empresa en la web
// ---------------------------------------------------------------------------
const ESQUEMA_INVESTIGACION_TXT = `{
  "web_oficial": "URL o vacío",
  "actividad": "qué hace la empresa, en 1-2 frases, según su web",
  "senales": [{ "titulo": "...", "fecha": "AAAA-MM-DD o vacío", "url": "URL de la fuente", "fuente": "medio o web", "resumen": "...", "motivo": "por qué podría generar necesidad de perfiles (hipótesis)" }],
  "contacto": { "email": "solo si aparece literalmente en una página oficial leída, si no vacío", "formulario": "URL del formulario o vacío", "pagina": "URL de la página de contacto o empleo", "persona": "nombre y cargo solo si figuran en la web oficial o en una nota de prensa de la empresa, si no vacío", "fuente_url": "URL donde aparece el contacto" },
  "dudas": ["lo que no se ha podido confirmar"]
}`;

async function investigar(datos: { empresa: string; ciudad?: string; web?: string; senales?: string[] }) {
  if (!datos.empresa) throw new Error("Falta el nombre de la empresa.");
  const { texto, bloques, uso } = await pedir({
    esfuerzo: "medium",
    maxTokens: 16000,
    herramientas: [
      { type: "web_search_20260209", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "ES" } },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
    ],
    system: [
      "Investigas una empresa española para preparar un contacto profesional legítimo con ella.",
      "Busca su web oficial, a qué se dedica, señales recientes y verificables (contratos, proyectos, ampliaciones, nuevas instalaciones, financiación, contratación) y su canal de contacto corporativo.",
      "Reglas estrictas:",
      "- Cada señal lleva la URL de una página que hayas consultado y su fecha si la tiene. Sin fuente, no es una señal.",
      "- Nunca adivines ni construyas un correo (nada de nombre@dominio deducido). Solo correos escritos tal cual en una página oficial que hayas leído; si no hay, deja el correo vacío y da el formulario o la página de contacto.",
      "- No busques perfiles personales en redes sociales ni datos personales. Una persona solo si su nombre y cargo están en la web oficial o en una nota de prensa de la empresa.",
      "- No afirmes que la empresa necesita contratar: el motivo de cada señal es una hipótesis.",
      "- Si dudas de que una página sea de esta empresa (otra con nombre parecido), dilo en «dudas».",
      `Termina tu respuesta con un único bloque \`\`\`json con esta forma:\n${ESQUEMA_INVESTIGACION_TXT}`,
    ].join("\n"),
    user: [
      `Empresa: ${datos.empresa}`,
      datos.ciudad ? `Ubicación conocida: ${datos.ciudad}` : "",
      datos.web ? `Web conocida: ${datos.web}` : "",
      datos.senales?.length ? `Lo que ya sabemos (fuentes oficiales):\n- ${datos.senales.slice(0, 6).join("\n- ")}` : "",
    ].filter(Boolean).join("\n"),
  });
  const r = jsonDe(texto) as Record<string, any>;

  // URL y textos que la búsqueda ha visto de verdad
  const vistas = new Set<string>();
  const textos: string[] = [];
  const recorrer = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach(recorrer); return; }
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") vistas.add(o.url.replace(/\/$/, ""));
    if (o.type === "text" && typeof o.data === "string") textos.push(o.data);
    if (typeof o.text === "string") textos.push(o.text);
    Object.values(o).forEach(recorrer);
  };
  bloques.filter((b) => b.type === "web_search_tool_result" || b.type === "web_fetch_tool_result").forEach(recorrer);
  const vista = (u?: string) => Boolean(u) && vistas.has(String(u).replace(/\/$/, ""));
  const leido = norm(textos.join(" "));

  r.senales = (r.senales || []).filter((s: any) => vista(s.url));
  const c = r.contacto || {};
  const avisos: string[] = [];
  if (c.email && !leido.includes(norm(c.email))) { avisos.push(`Se descartó el correo ${c.email} porque no aparece en ninguna página leída.`); c.email = ""; }
  if (c.fuente_url && !vista(c.fuente_url)) c.fuente_url = "";
  if ((c.email || c.persona) && !c.fuente_url) { avisos.push("El contacto no tenía una fuente comprobable y se ha descartado."); c.email = ""; c.persona = ""; }
  for (const k of ["formulario", "pagina"]) if (c[k] && !vista(c[k])) c[k] = "";
  if (r.web_oficial && !vista(r.web_oficial) && ![...vistas].some((u) => u.startsWith(String(r.web_oficial).replace(/\/$/, "")))) r.web_oficial = "";
  r.contacto = c;
  r.dudas = [...(r.dudas || []), ...avisos];
  r.consultada = new Date().toISOString().slice(0, 10);
  return { investigacion: r, uso };
}

// ---------------------------------------------------------------------------
// 3. Presentación personalizada
// ---------------------------------------------------------------------------
const ESQUEMA_MENSAJE = {
  type: "object",
  additionalProperties: false,
  required: ["asunto", "cuerpo", "hechos_usados", "senal_usada"],
  properties: {
    asunto: { type: "string" },
    cuerpo: { type: "string" },
    hechos_usados: { type: "array", items: { type: "string" }, description: "Identificadores de los hechos del perfil que el mensaje menciona" },
    senal_usada: { type: "string", description: "Identificador de la señal de la empresa que motiva el contacto" },
  },
};

async function presentacion(d: {
  empresa: string; destinatario?: string;
  senales: { id: string; texto: string }[];
  hechos: { id: string; texto: string }[];
  firma: { nombre: string; email?: string; linkedin?: string };
  carencias?: string[];
}) {
  if (!d.empresa || !d.senales?.length || !d.hechos?.length) throw new Error("Faltan la empresa, sus señales o los hechos del perfil.");
  const { texto, uso } = await pedir({
    esfuerzo: "medium",
    system: [
      "Redactas en español una presentación breve (120-180 palabras) de una persona candidata a una empresa concreta, para un correo.",
      "Reglas estrictas:",
      "- Usa solo los hechos del perfil y las señales que se te dan. No inventes experiencia, cifras, títulos ni resultados.",
      "- No digas ni insinúes que la empresa tiene una vacante o que necesita contratar: es un contacto proactivo.",
      "- Empieza explicando qué señal motiva el contacto (con su fecha si la hay), sigue con 1-2 hechos del perfil que sean pertinentes para esa empresa y termina proponiendo una llamada breve.",
      "- Incluye solo lo pertinente para esta empresa. No exageres el encaje.",
      "- Trato de usted. Si no hay nombre de destinatario, dirígete al equipo.",
      "- Firma con el nombre y, si se dan, el correo y LinkedIn. Nunca un teléfono.",
      "- Menciona que se adjunta el CV.",
    ].join("\n"),
    user: [
      `Empresa: ${d.empresa}`,
      `Destinatario: ${d.destinatario || "(sin nombre: dirígete al equipo)"}`,
      "Señales de la empresa:", ...d.senales.map((s) => `[${s.id}] ${s.texto}`),
      "Hechos del perfil:", ...d.hechos.map((h) => `[${h.id}] ${h.texto}`),
      d.carencias?.length ? `Carencias conocidas (no las ocultes con exageraciones): ${d.carencias.join("; ")}` : "",
      `Firma: ${[d.firma.nombre, d.firma.email, d.firma.linkedin].filter(Boolean).join(" · ")}`,
    ].filter(Boolean).join("\n"),
    esquema: ESQUEMA_MENSAJE,
  });
  const m = JSON.parse(texto) as { asunto: string; cuerpo: string; hechos_usados: string[]; senal_usada: string };
  const ids = new Set(d.hechos.map((h) => h.id));
  m.hechos_usados = (m.hechos_usados || []).filter((x) => ids.has(x));
  if (/(\+34|\b[6-9]\d{2}[\s.]?\d{3}[\s.]?\d{3}\b)/.test(m.cuerpo)) m.cuerpo = m.cuerpo.replace(/(\+34\s?)?\b[6-9]\d{2}[\s.]?\d{3}[\s.]?\d{3}\b/g, "");
  return { mensaje: m, uso };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const origen = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origen) });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405, origen);
  try {
    const auth = req.headers.get("Authorization") || "";
    const clavePublica = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, clavePublica, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return responder({ error: "Entra con tu correo para usar la IA." }, 401, origen);
    const { data: admin } = await sb.rpc("es_admin");
    if (admin !== true) return responder({ error: "La IA de RADAR solo está activada para la cuenta de administración." }, 403, origen);

    const hoy = new Date().toISOString().slice(0, 10);
    const { count } = await sb.from("ia_uso").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).gte("creado", hoy);
    if ((count ?? 0) >= LIMITE_DIARIO) return responder({ error: `Has llegado al límite de ${LIMITE_DIARIO} usos de IA por hoy.` }, 429, origen);

    const body = await req.json();
    let resultado: { uso: Anthropic.Beta.BetaUsage } & Record<string, unknown>;
    if (body.accion === "perfil_cv") resultado = await perfilCV(String(body.texto || ""));
    else if (body.accion === "investigar") resultado = await investigar(body);
    else if (body.accion === "presentacion") resultado = await presentacion(body);
    else return responder({ error: "Acción desconocida" }, 400, origen);

    await sb.from("ia_uso").insert({ user_id: u.user.id, accion: body.accion, tokens_entrada: resultado.uso.input_tokens, tokens_salida: resultado.uso.output_tokens });
    const { uso: _uso, ...resto } = resultado;
    return responder(resto, 200, origen);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return responder({ error: "La IA está saturada en este momento. Prueba en un minuto." }, 429, origen);
    if (e instanceof Anthropic.AuthenticationError) return responder({ error: "La clave de Claude no es válida. Revisa el secreto ANTHROPIC_API_KEY en Supabase." }, 500, origen);
    if (e instanceof Anthropic.APIError) return responder({ error: `Error de la IA (${e.status}). Inténtalo de nuevo.` }, 502, origen);
    return responder({ error: e instanceof Error ? e.message : "Error inesperado" }, 500, origen);
  }
});
