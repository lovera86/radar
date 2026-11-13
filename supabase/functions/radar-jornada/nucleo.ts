// Núcleo del orquestador de RADAR: lógica pura (sin red ni base de datos) para poder probarla.
// La usa index.ts (función «radar-jornada»).

export type Config = {
  hora: number; dias: number[]; presupuesto_dia: number; max_ia: number; max_tareas: number;
  duracion_max_min: number; umbral: number; agentes_off: string[]; pausada: boolean;
};
export type TareaPlan = { agente: string; clave: string; prioridad: number; entrada: Record<string, unknown> };
export type Tarea = { id: string; agente: string; clave: string; intentos: number; max_intentos: number; estado: string };

export const AGENTES = {
  director: "Planifica la jornada, reparte tareas, vigila límites y consolida el informe.",
  detector: "Revisa las fuentes y guarda señales nuevas con su fuente y fecha.",
  investigador: "Profundiza en las señales prioritarias y separa hechos de hipótesis.",
  analista: "Puntúa el encaje de forma explicable y detecta duplicados.",
  conector: "Busca el canal de contacto profesional, siempre con su fuente.",
  estratega: "Propone el enfoque y el siguiente paso.",
  comercial: "Prepara borradores; nunca envía nada.",
} as const;

/* Fecha, hora y día de la semana en Madrid (con su horario de verano). */
export function madrid(ahora: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(ahora).map((x) => [x.type, x.value]));
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, dia: dias[p.weekday] };
}

/* ¿Hay que empezar hoy la jornada programada? */
export function tocaJornada(c: Config, ahora: Date, yaExisteHoy: boolean): { toca: boolean; motivo: string } {
  if (c.pausada) return { toca: false, motivo: "RADAR está en pausa" };
  if (yaExisteHoy) return { toca: false, motivo: "La jornada de hoy ya existe" };
  const m = madrid(ahora);
  if (!c.dias.includes(m.dia)) return { toca: false, motivo: "Hoy no es un día activo" };
  if (m.hora < c.hora) return { toca: false, motivo: `Aún no son las ${c.hora}:00` };
  if (m.hora > c.hora + 3) return { toca: false, motivo: "Ya ha pasado la franja de la jornada" };
  return { toca: true, motivo: "Hora de empezar" };
}

/* Plan de la jornada. El Detector revisa las fuentes y el Analista elige qué investigar;
   el Analista añade a la cola las tareas del Investigador (una por empresa elegida). */
export function planificar(c: Config): TareaPlan[] {
  const plan: TareaPlan[] = [
    { agente: "detector", clave: "detectar:radar", prioridad: 100, entrada: { fuente: "radar" } },
    { agente: "analista", clave: "analizar:radar", prioridad: 90, entrada: {} },
  ];
  return plan.filter((t) => !c.agentes_off.includes(t.agente)).slice(0, c.max_tareas);
}

/* Qué pasa con una tarea que ha fallado: vuelve a la cola o se da por fallida. */
export function trasFallo(t: Tarea, error: string): { estado: "pendiente" | "fallida"; error: string } {
  return { estado: t.intentos >= t.max_intentos ? "fallida" : "pendiente", error: error.slice(0, 500) };
}

/* Estado final de una jornada a partir de sus tareas. */
export function cerrarJornada(tareas: { estado: string }[]): "en_curso" | "completada" | "con_errores" {
  if (tareas.some((t) => t.estado === "pendiente" || t.estado === "en_curso")) return "en_curso";
  return tareas.some((t) => t.estado === "fallida") ? "con_errores" : "completada";
}

export function claveEmpresa(nombre: string, nif?: string): string {
  if (nif) return nif.toUpperCase().trim();
  return nombre.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(sociedad limitada( unipersonal)?|sociedad anonima|s\.?l\.?u?|s\.?a\.?u?)\.?$/g, "").replace(/[^a-z0-9]/g, "");
}

type Item = {
  id: string; tipo: string; subtipo?: string; titulo: string;
  organizacion?: { nombre?: string; nif?: string }; cliente?: string;
  fechas?: { publicada?: string | null; detectada?: string | null; consultada?: string | null };
  fuentes?: { nombre?: string; url?: string; consultada?: string }[];
  datos?: { campo: string; valor: unknown; origen: string }[];
  hipotesis?: { necesidades?: string[] };
};

/* Una oportunidad de RADAR convertida en señal para la memoria: hechos y deducciones por separado. */
export function senalDesdeItem(it: Item) {
  const org = it.organizacion?.nombre || it.cliente || "";
  const datos = it.datos || [];
  const fecha = it.fechas?.publicada || it.fechas?.detectada || null;
  return {
    clave: it.id,
    empresa: org || null,
    empresa_clave: org ? claveEmpresa(org, it.organizacion?.nif) : null,
    tipo: it.subtipo || it.tipo,
    titulo: it.titulo.slice(0, 500),
    fecha: fecha ? fecha.slice(0, 10) : null,
    fuente: it.fuentes?.[0] || null,
    hechos: datos.filter((d) => d.origen === "confirmado" && d.valor != null).map((d) => ({ campo: d.campo, valor: d.valor })),
    hipotesis: [
      ...datos.filter((d) => d.origen === "inferido" && d.valor != null).map((d) => `${d.campo}: ${d.valor}`),
      ...(it.hipotesis?.necesidades || []).map((n) => `Podría necesitar: ${n}`),
    ],
  };
}

/* Separa lo nuevo de lo que la memoria ya conoce (por clave estable de la fuente). */
export function deduplicar<T extends { clave: string }>(lista: T[], conocidas: Set<string>) {
  const vistas = new Set<string>();
  const nuevas: T[] = []; const repetidas: string[] = [];
  for (const s of lista) {
    if (vistas.has(s.clave)) continue;
    vistas.add(s.clave);
    if (conocidas.has(s.clave)) repetidas.push(s.clave); else nuevas.push(s);
  }
  return { nuevas, repetidas };
}

/* ¿Queda presupuesto para otra llamada de IA? */
export function quedaPresupuesto(c: Config, gastado: number, estimado: number): boolean {
  return gastado + estimado <= Number(c.presupuesto_dia) + 1e-9;
}

// ---------------------------------------------------------------------------
// Analista: puntuación explicable y elección de las empresas del día (sin IA)
// ---------------------------------------------------------------------------
type Criterio = { valor: number | null; motivos?: string[]; sin_info?: boolean };
export type ItemPuntuable = Item & {
  ubicacion?: { texto?: string; comunidad?: string }; importe?: number;
  criterios?: Record<string, Criterio>; ciudad_empresa?: string;
};
export const PESOS: Record<string, number> = { encaje: 0.35, geografia: 0.25, necesidad: 0.15, acceso: 0.15, calidad: 0.1 };
const NOMBRE_CRITERIO: Record<string, string> = { encaje: "Encaje con tu perfil", geografia: "Zona", necesidad: "Posible necesidad", acceso: "Canal de contacto", calidad: "Actualidad" };

/* Misma clave que usa la bandeja en el navegador (empresasDetectadas): NIF o nombre normalizado. */
export function claveBandeja(nombre: string, nif?: string): string {
  return nif || nombre.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* Un NIF que empieza por número o por X, Y, Z es de una persona (autónomo): no se investiga a personas. */
export const esPersona = (nif?: string) => Boolean(nif) && /^[0-9XYZ]/i.test(String(nif).trim());

/* Puntuación 0-100 con su explicación: media ponderada de los criterios que tienen dato. */
export function puntuar(it: ItemPuntuable): { puntos: number; motivos: { criterio: string; valor: number; motivos: string[] }[]; sin_info: string[] } {
  let suma = 0; let pesos = 0;
  const motivos: { criterio: string; valor: number; motivos: string[] }[] = []; const sin_info: string[] = [];
  for (const [k, w] of Object.entries(PESOS)) {
    const c = it.criterios?.[k];
    if (!c || c.valor == null) { sin_info.push(NOMBRE_CRITERIO[k]); continue; }
    suma += w * c.valor; pesos += w;
    motivos.push({ criterio: NOMBRE_CRITERIO[k], valor: Math.round(100 * c.valor), motivos: c.motivos || [] });
  }
  return { puntos: pesos ? Math.round((100 * suma) / pesos) : 0, motivos, sin_info };
}

export type Candidata = {
  k: string; empresa: string; nif: string; ciudad: string; puntos: number;
  motivos: { criterio: string; valor: number; motivos: string[] }[]; sin_info: string[];
  hechos: string[]; fuentes: { nombre?: string; url?: string }[]; items: string[];
};

/* Empresas adjudicatarias que merecen investigarse hoy: por encima del umbral, sin repetir
   las que ya están en tu bandeja, descartadas o investigadas, y nunca personas físicas. */
export function elegirCandidatas(items: ItemPuntuable[], yaVistas: Set<string>, max: number, umbral: number): { elegidas: Candidata[]; por_encima: number } {
  const porEmpresa = new Map<string, Candidata>();
  for (const it of items) {
    if (it.subtipo !== "adjudicacion" || !it.organizacion?.nombre) continue;
    const nif = it.organizacion.nif || "";
    if (esPersona(nif)) continue;
    const k = claveBandeja(it.organizacion.nombre, nif);
    if (yaVistas.has(k)) continue;
    const p = puntuar(it);
    const hecho = `${it.titulo.slice(0, 160)}${it.cliente ? ` (cliente: ${it.cliente})` : ""}${it.importe ? `, ${Math.round(it.importe).toLocaleString("es-ES")} €` : ""}${it.fechas?.publicada ? `, ${it.fechas.publicada}` : ""}`;
    const prev = porEmpresa.get(k);
    if (prev) {
      prev.hechos.push(hecho); prev.items.push(it.id);
      if (it.fuentes?.[0]) prev.fuentes.push(it.fuentes[0]);
      if (p.puntos > prev.puntos) Object.assign(prev, { puntos: p.puntos, motivos: p.motivos, sin_info: p.sin_info });
      continue;
    }
    porEmpresa.set(k, {
      k, empresa: it.organizacion.nombre, nif, ciudad: it.ciudad_empresa || it.ubicacion?.texto || "",
      puntos: p.puntos, motivos: p.motivos, sin_info: p.sin_info, hechos: [hecho], fuentes: it.fuentes?.[0] ? [it.fuentes[0]] : [], items: [it.id],
    });
  }
  const encima = [...porEmpresa.values()].filter((c) => c.puntos >= umbral)
    .sort((a, b) => b.puntos - a.puntos || b.hechos.length - a.hechos.length || a.empresa.localeCompare(b.empresa));
  return { elegidas: encima.slice(0, Math.max(0, max)), por_encima: encima.length };
}

// ---------------------------------------------------------------------------
// Coste de una llamada de IA (precios de lista en dólares)
// ---------------------------------------------------------------------------
export const PRECIO = { entrada: 2 / 1e6, salida: 10 / 1e6, cache_escritura: 2.5 / 1e6, cache_lectura: 0.2 / 1e6, busqueda: 0.01 }; // Claude Sonnet 5.5
export const COSTE_ESTIMADO_INVESTIGACION = 0.09;
export type Uso = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number | null } | null };
export function costeDe(usos: Uso[]): number {
  let c = 0;
  for (const u of usos) {
    c += (u.input_tokens || 0) * PRECIO.entrada + (u.output_tokens || 0) * PRECIO.salida
      + (u.cache_creation_input_tokens || 0) * PRECIO.cache_escritura + (u.cache_read_input_tokens || 0) * PRECIO.cache_lectura
      + (u.server_tool_use?.web_search_requests || 0) * PRECIO.busqueda;
  }
  return Math.round(c * 10000) / 10000;
}
