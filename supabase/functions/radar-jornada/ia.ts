// IA del equipo de agentes: investigación de una empresa con búsqueda web.
// Usa Claude Sonnet 5.5 (más barato que el modelo de los botones manuales) con pocas
// búsquedas, para que dos investigaciones al día quepan en el presupuesto de la jornada.
// Mismas reglas que «radar-ia»: solo URL visitadas de verdad, correos que aparecen tal cual
// en una página leída, nada de datos personales, y las necesidades siempre como hipótesis.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { costeDe, type Uso } from "./nucleo.ts";

const MODELO = "claude-sonnet-5-5";
const anthropic = new Anthropic({ timeout: 110_000, maxRetries: 1 }); // lee ANTHROPIC_API_KEY

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").toLowerCase().trim();

const FORMA = `{
  "web_oficial": "URL o vacío",
  "actividad": "qué hace la empresa, en 1-2 frases, según su web",
  "senales": [{ "titulo": "...", "fecha": "AAAA-MM-DD o vacío", "url": "URL de la fuente", "fuente": "medio o web", "resumen": "...", "motivo": "por qué podría generar necesidad de perfiles (hipótesis)" }],
  "contacto": { "email": "solo si aparece literalmente en una página oficial leída, si no vacío", "formulario": "URL del formulario o vacío", "pagina": "URL de la página de contacto o empleo", "persona": "nombre y cargo solo si figuran en la web oficial o en una nota de prensa de la empresa, si no vacío", "fuente_url": "URL donde aparece el contacto" },
  "dudas": ["lo que no se ha podido confirmar"]
}`;

export type Investigacion = {
  web_oficial: string; actividad: string;
  senales: { titulo: string; fecha?: string; url: string; fuente?: string; resumen?: string; motivo?: string }[];
  contacto: { email?: string; formulario?: string; pagina?: string; persona?: string; fuente_url?: string };
  dudas: string[]; consultada: string; modelo: string;
};

export async function investigarEmpresa(d: { empresa: string; ciudad?: string; hechos: string[] }): Promise<{ investigacion: Investigacion; coste: number }> {
  const mensajes: Anthropic.MessageParam[] = [{
    role: "user",
    content: [
      `Empresa: ${d.empresa}`,
      d.ciudad ? `Ubicación conocida: ${d.ciudad}` : "",
      d.hechos.length ? `Lo que ya sabemos (fuentes oficiales):\n- ${d.hechos.slice(0, 5).join("\n- ")}` : "",
    ].filter(Boolean).join("\n"),
  }];
  const system = [
    "Investigas una empresa española para preparar un contacto profesional legítimo con ella.",
    "Busca su web oficial, a qué se dedica, señales recientes y verificables (contratos, proyectos, ampliaciones, nuevas instalaciones, financiación, contratación) y su canal de contacto corporativo.",
    "Sé breve y eficiente: con dos búsquedas y una o dos páginas leídas suele bastar.",
    "Reglas estrictas:",
    "- Cada señal lleva la URL de una página que hayas consultado y su fecha si la tiene. Sin fuente, no es una señal.",
    "- Nunca adivines ni construyas un correo (nada de nombre@dominio deducido). Solo correos escritos tal cual en una página oficial que hayas leído; si no hay, deja el correo vacío y da el formulario o la página de contacto.",
    "- No busques perfiles personales en redes sociales ni datos personales. Una persona solo si su nombre y cargo están en la web oficial o en una nota de prensa de la empresa.",
    "- No afirmes que la empresa necesita contratar: el motivo de cada señal es una hipótesis.",
    "- Si dudas de que una página sea de esta empresa (otra con nombre parecido), dilo en «dudas».",
    `Termina tu respuesta con un único bloque \`\`\`json con esta forma:\n${FORMA}`,
  ].join("\n");

  const usos: Uso[] = [];
  const bloques: Anthropic.ContentBlock[] = [];
  let r: Anthropic.Message | null = null;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    r = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 6000,
      system,
      messages: mensajes,
      output_config: { effort: "low" },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 2, user_location: { type: "approximate", country: "ES" } },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, max_content_tokens: 6000 },
      ],
    });
    usos.push(r.usage as Uso);
    bloques.push(...r.content);
    if (r.stop_reason !== "pause_turn") break;
    mensajes.push({ role: "assistant", content: r.content });
  }
  const coste = costeDe(usos);
  if (!r) throw Object.assign(new Error("Sin respuesta de la IA"), { coste });
  if (r.stop_reason === "refusal") throw Object.assign(new Error("La IA no ha podido investigar esta empresa."), { coste });

  const texto = bloques.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
  const m = texto.match(/```json\s*([\s\S]*?)```/) || texto.match(/(\{[\s\S]*\})\s*$/);
  let inv: Investigacion;
  try { inv = JSON.parse(m ? m[1] : texto); } catch { throw Object.assign(new Error("La IA no devolvió el resultado en el formato esperado."), { coste }); }

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

  inv.senales = (inv.senales || []).filter((s) => vista(s.url)).slice(0, 5);
  const c = inv.contacto || {};
  const avisos: string[] = [];
  if (c.email && !leido.includes(norm(c.email))) { avisos.push(`Se descartó el correo ${c.email} porque no aparece en ninguna página leída.`); c.email = ""; }
  if (c.fuente_url && !vista(c.fuente_url)) c.fuente_url = "";
  if ((c.email || c.persona) && !c.fuente_url) { avisos.push("El contacto no tenía una fuente comprobable y se ha descartado."); c.email = ""; c.persona = ""; }
  for (const k of ["formulario", "pagina"] as const) if (c[k] && !vista(c[k])) c[k] = "";
  if (inv.web_oficial && !vista(inv.web_oficial) && ![...vistas].some((u) => u.startsWith(String(inv.web_oficial).replace(/\/$/, "")))) inv.web_oficial = "";
  inv.contacto = c;
  inv.dudas = [...(inv.dudas || []), ...avisos];
  inv.consultada = new Date().toISOString().slice(0, 10);
  inv.modelo = MODELO;
  return { investigacion: inv, coste };
}
