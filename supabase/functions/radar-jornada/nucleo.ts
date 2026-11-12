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

/* Plan de la jornada. Fase 1: el Detector. Las fases siguientes añaden el resto de agentes. */
export function planificar(c: Config): TareaPlan[] {
  const plan: TareaPlan[] = [
    { agente: "detector", clave: "detectar:radar", prioridad: 100, entrada: { fuente: "radar" } },
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
