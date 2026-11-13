// Pruebas del núcleo del orquestador. Ejecutar:  npx tsx --test supabase/functions/radar-jornada/nucleo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cerrarJornada, elegirOfertas, enAsturias, salarioValido, zonaEmpresa, zonaOferta, claveBandeja, claveEmpresa, correoDeItem, costeDe, firmaTexto, modoEnvio, seguimientosDebidos, sinTelefonos, textoSeguimiento, deduplicar, elegirCandidatas, esPersona, madrid, planificar, puntuar, quedaPresupuesto, senalDesdeItem, tocaJornada, trasFallo, type Config, type ItemPuntuable } from "./nucleo.ts";

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

test("modoEnvio: ensayo hasta su fecha, luego real; pausa y apagado mandan", () => {
  const c = { ...base, envio_modo: "ensayo" as const, ensayo_hasta: "2026-11-16" };
  assert.equal(modoEnvio(c, "2026-11-16"), "ensayo");
  assert.equal(modoEnvio(c, "2026-11-17"), "real");
  assert.equal(modoEnvio({ ...c, pausada: true }, "2026-11-17"), "apagado");
  assert.equal(modoEnvio({ ...c, envio_modo: "apagado" }, "2026-11-17"), "apagado");
  assert.equal(modoEnvio(base, "2026-11-17"), "apagado"); // sin la fase 3 instalada no se envía
});

test("correoDeItem: solo correos comprobados en la web oficial", () => {
  const ok = adj("Topcad", "B27245091", 0.9, 1, { contacto: { email: "Topcad@topcad.com" }, fuentes: [{ nombre: "PLACSP", url: "https://x" }, { nombre: "Web oficial de la empresa", url: "https://topcad.com/contacto" }] });
  ok.criterios!.acceso = { valor: 0.75, motivos: ["correo verificado en la web oficial de la empresa"] };
  assert.deepEqual(correoDeItem(ok), { email: "topcad@topcad.com", fuente: "https://topcad.com/contacto" });
  assert.equal(correoDeItem({ ...ok, fuentes: [{ nombre: "PLACSP", url: "https://x" }] }), null);
  assert.equal(correoDeItem({ ...ok, contacto: { email: "no es un correo" } }), null);
  const sinVerificar = { ...ok, criterios: { ...ok.criterios, acceso: { valor: 0.5, motivos: ["correo encontrado"] } } };
  assert.equal(correoDeItem(sinVerificar), null);
  const r = elegirCandidatas([ok], new Set(), 5, 0);
  assert.equal(r.elegidas[0].email, "topcad@topcad.com");
});

test("sinTelefonos y firma: el teléfono solo en la firma", () => {
  assert.equal(sinTelefonos("Llámeme al 612 345 678 o +34 612345678."), "Llámeme al  o .");
  assert.equal(firmaTexto({ nombre: "Rocío", telefono: "600 000 000", email: "r@x.com" }), "Rocío\nTel. 600 000 000\nr@x.com");
});

test("seguimientosDebidos: uno solo, a los 10 días, sin respuesta y solo envíos reales", () => {
  const e = (id: string, extra: object) => ({ id, tipo: "presentacion", modo: "real", estado: "enviado", enviado: "2026-11-01T09:00:00Z", empresa: "A", para: "a@a.com", asunto: "Hola", en_respuesta_a: null, ...extra });
  const lista = [e("1", {}), e("2", { enviado: "2026-11-10T09:00:00Z" }), e("3", { estado: "respondido" }), e("4", { modo: "ensayo" }), e("5", {}), e("6", { tipo: "seguimiento", en_respuesta_a: "5" })];
  assert.deepEqual(seguimientosDebidos(lista, new Date("2026-11-13T10:00:00Z")).map((x) => x.id), ["1"]);
  assert.match(textoSeguimiento({ empresa: "Topcad" }, { nombre: "Rocío" }), /Topcad[\s\S]*Rocío$/);
});

const oferta = (titulo: string, extra: Partial<ItemPuntuable> = {}): ItemPuntuable => ({
  id: `emp:${titulo}`, tipo: "empleo", subtipo: "oferta", titulo, organizacion: { nombre: "Empresa SA" },
  ubicacion: { texto: "Oviedo", comunidad: "Asturias" }, modalidad: "desconocida", contacto: { email: "rrhh@empresa.es" },
  fuentes: [{ nombre: "EURES", url: "https://eures/x" }], fechas: { publicada: "2026-11-10" },
  criterios: { encaje: { valor: 0.9 }, geografia: { valor: 1 }, necesidad: { valor: 1 }, acceso: { valor: 0.9 }, calidad: { valor: 0.8 } },
  ...extra,
});

test("zonas: presencial solo en Asturias; fuera, solo remoto", () => {
  assert.equal(zonaOferta(oferta("A")), true);
  assert.equal(zonaOferta(oferta("B", { ubicacion: { texto: "Madrid", comunidad: "Madrid" }, modalidad: "presencial" })), false);
  assert.equal(zonaOferta(oferta("C", { ubicacion: { texto: "Madrid", comunidad: "Madrid" }, modalidad: "hibrido" })), false);
  assert.equal(zonaOferta(oferta("D", { ubicacion: { texto: "Remoto (abierto a España)", comunidad: "Remoto" }, modalidad: "remoto" })), true);
  assert.equal(enAsturias("Pola de Siero"), true); assert.equal(enAsturias("Gijón"), true); assert.equal(enAsturias("A Coruña"), false);
  assert.equal(zonaEmpresa(adj("X", "B1", 0.9, 1, { ubicacion: { comunidad: "Galicia", texto: "A Coruña" }, ciudad_empresa: "Lugo" })), false);
  assert.equal(zonaEmpresa(adj("X", "B1", 0.9, 1, { ubicacion: { comunidad: "Galicia", texto: "A Coruña" }, ciudad_empresa: "Llanera (Asturias)" })), true);
});

test("salarioValido: desde 35.000 € cuando se publica", () => {
  assert.equal(salarioValido(null), true);
  assert.equal(salarioValido("30.000 - 34.000 € brutos/año"), false);
  assert.equal(salarioValido("35.000-42.000 €"), true);
  assert.equal(salarioValido("40k"), true);
  assert.equal(salarioValido("1.800 € al mes"), false);   // 25.200 € al año
  assert.equal(salarioValido("2.800 €/mes"), true);       // 39.200 € al año
  assert.equal(salarioValido("según valía"), true);
});

test("elegirOfertas: correo de la oferta, zona, salario, sin piloto y sin repetir", () => {
  const items = [
    oferta("Project Manager"), oferta("PM Madrid", { ubicacion: { texto: "Madrid", comunidad: "Madrid" }, modalidad: "presencial" }),
    oferta("Sin correo", { contacto: null }), oferta("Piloto", { solo_piloto: true }), oferta("Mal pagado", { salario: { texto: "20.000 €" } }),
    oferta("Ya enviada"), oferta("Remota", { ubicacion: { texto: "Remoto", comunidad: "Remoto" }, modalidad: "remoto", contacto: { email: "jobs@remota.io" } }),
  ];
  const r = elegirOfertas(items, new Set(["emp:Ya enviada"]), 5, 70);
  assert.deepEqual(r.map((c) => c.puesto), ["Project Manager", "Remota"]);
  assert.equal(r[0].tipo, "oferta"); assert.equal(r[0].email, "rrhh@empresa.es");
  assert.equal(elegirOfertas(items, new Set(["correo:rrhh@empresa.es"]), 5, 70).map((c) => c.puesto).join(), "Remota");
});
