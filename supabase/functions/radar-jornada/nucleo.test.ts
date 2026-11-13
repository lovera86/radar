// Pruebas del núcleo del orquestador. Ejecutar:  npx tsx --test supabase/functions/radar-jornada/nucleo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cerrarJornada, claveBandeja, claveEmpresa, costeDe, deduplicar, elegirCandidatas, esPersona, madrid, planificar, puntuar, quedaPresupuesto, senalDesdeItem, tocaJornada, trasFallo, type Config, type ItemPuntuable } from "./nucleo.ts";

const base: Config = { hora: 7, dias: [1, 2, 3, 4, 5], presupuesto_dia: 0.2, max_ia: 2, max_tareas: 60, duracion_max_min: 90, umbral: 65, agentes_off: [], pausada: false };

test("madrid: hora de invierno y de verano", () => {
  assert.deepEqual(madrid(new Date("2026-11-12T06:30:00Z")), { fecha: "2026-11-12", hora: 7, dia: 4 }); // jueves, UTC+1
  assert.deepEqual(madrid(new Date("2026-07-13T05:10:00Z")), { fecha: "2026-07-13", hora: 7, dia: 1 }); // lunes, UTC+2
  assert.equal(madrid(new Date("2026-11-12T23:30:00Z")).fecha, "2026-11-13"); // ya es viernes en Madrid
});

test("tocaJornada: respeta hora, días, pausa y no repite", () => {
  const jueves0730 = new Date("2026-11-12T06:30:00Z");
  assert.equal(tocaJornada(base, jueves0730, false).toca, true);
  assert.equal(tocaJornada(base, new Date("2026-11-12T05:30:00Z"), false).toca, false); // 06:30 en Madrid
  assert.equal(tocaJornada(base, jueves0730, true).toca, false);                         // ya hay jornada hoy
  assert.equal(tocaJornada({ ...base, pausada: true }, jueves0730, false).toca, false);
  assert.equal(tocaJornada(base, new Date("2026-11-14T08:00:00Z"), false).toca, false);   // sábado
  assert.equal(tocaJornada({ ...base, dias: [6] }, new Date("2026-11-14T08:00:00Z"), false).toca, true);
  assert.equal(tocaJornada(base, new Date("2026-11-12T12:00:00Z"), false).toca, false);   // 13:00: fuera de franja
});

test("planificar: Detector y Analista; se quitan los desactivados", () => {
  assert.deepEqual(planificar(base).map((t) => t.agente), ["detector", "analista"]);
  assert.deepEqual(planificar({ ...base, agentes_off: ["detector"] }).map((t) => t.agente), ["analista"]);
});

test("trasFallo: reintenta hasta el máximo", () => {
  assert.equal(trasFallo({ id: "1", agente: "detector", clave: "x", intentos: 1, max_intentos: 3, estado: "en_curso" }, "red").estado, "pendiente");
  assert.equal(trasFallo({ id: "1", agente: "detector", clave: "x", intentos: 3, max_intentos: 3, estado: "en_curso" }, "red").estado, "fallida");
});

test("cerrarJornada", () => {
  assert.equal(cerrarJornada([{ estado: "hecha" }, { estado: "pendiente" }]), "en_curso");
  assert.equal(cerrarJornada([{ estado: "hecha" }, { estado: "omitida" }]), "completada");
  assert.equal(cerrarJornada([{ estado: "hecha" }, { estado: "fallida" }]), "con_errores");
});

test("deduplicar: entre jornadas y dentro de la misma lista", () => {
  const r = deduplicar([{ clave: "a" }, { clave: "b" }, { clave: "a" }, { clave: "c" }], new Set(["b"]));
  assert.deepEqual(r.nuevas.map((x) => x.clave), ["a", "c"]);
  assert.deepEqual(r.repetidas, ["b"]);
});

test("senalDesdeItem: separa hechos de hipótesis y guarda la fuente", () => {
  const s = senalDesdeItem({
    id: "ad:1", tipo: "proyecto", subtipo: "adjudicacion", titulo: "Control fotogramétrico",
    organizacion: { nombre: "TOPCAD INGENIERIA SLU", nif: "b27245091" }, fechas: { publicada: "2026-10-06" },
    fuentes: [{ nombre: "PLACSP", url: "https://contrataciondelestado.es/x" }],
    datos: [{ campo: "Importe", valor: 114777, origen: "confirmado" }, { campo: "Necesidad de PM", valor: "posible", origen: "inferido" }],
    hipotesis: { necesidades: ["Jefe/a de proyecto"] },
  });
  assert.equal(s.empresa_clave, "B27245091");
  assert.deepEqual(s.hechos, [{ campo: "Importe", valor: 114777 }]);
  assert.deepEqual(s.hipotesis, ["Necesidad de PM: posible", "Podría necesitar: Jefe/a de proyecto"]);
  assert.equal(s.fuente?.url, "https://contrataciondelestado.es/x");
});

test("claveEmpresa sin NIF ignora la forma jurídica", () => {
  assert.equal(claveEmpresa("Grusamar Ingeniería y Consulting, S.L.U."), claveEmpresa("GRUSAMAR INGENIERIA Y CONSULTING"));
});

test("quedaPresupuesto", () => {
  assert.equal(quedaPresupuesto(base, 0.1, 0.1), true);
  assert.equal(quedaPresupuesto(base, 0.15, 0.1), false);
});

const adj = (nombre: string, nif: string, enc: number, geo: number, extra: Partial<ItemPuntuable> = {}): ItemPuntuable => ({
  id: `adj:${nombre}:${enc}`, tipo: "proyecto", subtipo: "adjudicacion", titulo: `Contrato de ${nombre}`,
  organizacion: { nombre, nif }, fechas: { publicada: "2026-11-01" }, fuentes: [{ nombre: "PLACSP", url: "https://contrataciondelestado.es/x" }],
  criterios: { encaje: { valor: enc, motivos: ["tema: obra civil"] }, geografia: { valor: geo, motivos: ["en Asturias"] }, necesidad: { valor: 0.4 }, acceso: { valor: 0.75 }, calidad: { valor: 0.5 }, salario: { valor: null, sin_info: true } },
  ...extra,
});

test("puntuar: media ponderada explicable, ignorando lo que no tiene dato", () => {
  const p = puntuar(adj("A", "B1", 0.9, 1));
  assert.equal(p.puntos, Math.round(100 * (0.35 * 0.9 + 0.25 * 1 + 0.15 * 0.4 + 0.15 * 0.75 + 0.1 * 0.5)));
  assert.equal(p.motivos[0].criterio, "Encaje con tu perfil");
  assert.equal(puntuar({ ...adj("A", "B1", 0.9, 1), criterios: { encaje: { valor: 0.8 } } }).puntos, 80);
});

test("elegirCandidatas: umbral, sin repetir, sin personas y como mucho el cupo", () => {
  const items = [
    adj("Alta SL", "B11111111", 0.9, 1), adj("Alta SL", "B11111111", 0.6, 1), // misma empresa: se agrupa
    adj("Media SL", "B22222222", 0.75, 1), adj("Baja SL", "B33333333", 0.2, 0.2),
    adj("Ya en bandeja SL", "B44444444", 0.9, 1), adj("SUAREZ FERNANDEZ, IVAN", "12345678Z", 0.9, 1),
    { ...adj("Oferta", "B55555555", 0.9, 1), subtipo: "oferta" },
  ];
  const r = elegirCandidatas(items, new Set(["B44444444"]), 2, 65);
  assert.deepEqual(r.elegidas.map((c) => c.empresa), ["Alta SL", "Media SL"]);
  assert.equal(r.elegidas[0].hechos.length, 2);
  assert.equal(r.por_encima, 2);
  assert.equal(elegirCandidatas(items, new Set(), 0, 65).elegidas.length, 0);
});

test("esPersona y claveBandeja (misma clave que la bandeja del navegador)", () => {
  assert.equal(esPersona("12345678Z"), true); assert.equal(esPersona("X1234567L"), true); assert.equal(esPersona("B27245091"), false);
  assert.equal(claveBandeja("TOPCAD", "B27245091"), "B27245091");
  assert.equal(claveBandeja("Grusamar Ingeniería, S.L.U."), "grusamaringenieriaslu");
});

test("costeDe: tokens, caché y búsquedas", () => {
  assert.equal(costeDe([{ input_tokens: 20000, output_tokens: 2000, server_tool_use: { web_search_requests: 2 } }]), 0.08);
  assert.equal(costeDe([{ input_tokens: 10000 }, { input_tokens: 10000, cache_read_input_tokens: 50000 }]), 0.05);
});
