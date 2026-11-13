'use strict';
/* RADAR 2.0 · Oportunidades: empresas que podrían necesitar tu perfil aunque no tengan
   una oferta publicada. Bandeja tipo CRM ligera con ficha, encaje explicable, contacto con
   fuente, presentación personalizada y envío solo con tu aprobación.

   Reglas (ticket RADAR 2.0):
   - Una señal es un hecho con fuente y fecha; la necesidad de contratar es siempre una
     hipótesis («oportunidad potencial»).
   - El contacto se toma de fuentes legítimas y siempre con su fuente; nunca se adivina un correo.
   - Nada se envía sin aprobación: RADAR prepara, tú apruebas y envías.
   - Todo queda registrado (eventos con fecha) y la bandeja se guarda en tu cuenta.

   Datos: ST.bandeja[clave] y ST.excluidas[clave] (se guardan con tu cuenta, como el resto). */

const BJ_ESTADOS = [
  ['detectada', 'Detectada'], ['investigando', 'Investigando'], ['validada', 'Validada'], ['borrador', 'Borrador preparado'],
  ['aprobacion', 'Pendiente de aprobación'], ['enviada', 'Enviada'], ['respuesta', 'Respuesta recibida'],
  ['seguimiento', 'Seguimiento pendiente'], ['reunion', 'Reunión'], ['descartada', 'Descartada'],
];
const BJ_NOMBRE = Object.fromEntries(BJ_ESTADOS);
const BJ_ACTIVOS = ['detectada', 'investigando', 'validada', 'borrador', 'aprobacion', 'enviada', 'respuesta', 'seguimiento', 'reunion'];
const BJ_SIGUIENTE = {
  detectada: 'Revisar la señal y decidir si investigar', investigando: 'Buscar el contacto adecuado y su fuente', validada: 'Generar la presentación',
  borrador: 'Revisar y aprobar el mensaje', aprobacion: 'Aprobar el mensaje', enviada: 'Esperar respuesta', respuesta: 'Contestar y proponer una llamada',
  seguimiento: 'Decidir si haces un seguimiento', reunion: 'Preparar la reunión', descartada: '',
};
const BJ_DIAS_SEGUIMIENTO = 10;
let BJ_PESTANA = 'bandeja';
let BJ_FILTRO = 'activas';

function bjDatos() {
  ST.bandeja = ST.bandeja || {};
  ST.excluidas = ST.excluidas || {};
  ST.bandejaFiltros = ST.bandejaFiltros || { zona: 'norte', tipo: 'todas' };
  return ST.bandeja;
}
function bjEvento(op, tipo, texto, extra) {
  op.eventos = op.eventos || [];
  op.eventos.push({ f: new Date().toISOString(), tipo, texto, ...(extra || {}) });
  op.actualizado = new Date().toISOString();
}
function bjGuardar() { guardarST(); }
const bjSinHtml = (s) => String(s || '').replace(/<[^>]+>/g, '');
const bjMasDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- De lo que detecta RADAR a una oportunidad ---------- */

/* Señales verificables de una empresa, con fuente, fecha y por qué podría generar necesidad. */
function bjSenales(e) {
  const s = [];
  e.ganados.forEach((o) => s.push({
    tipo: 'adjudicacion', fecha: o.fechas.publicada || o.fechas.detectada,
    titulo: `Ha ganado «${o.titulo}»${o.cliente ? ' para ' + o.cliente : ''}${o.importe ? ' (' + eur(o.importe) + ')' : ''}`,
    fuente: o.fuentes?.[0] || null, motivo: 'Al ganar un contrato tiene que organizar el equipo que lo ejecuta.', id: o.id,
    contrato: o.titulo, cliente: o.cliente || '',
  }));
  e.candidata.forEach((o) => s.push({
    tipo: 'candidata', fecha: o.fechas.detectada, titulo: `Suele presentarse a contratos como «${o.titulo}» (en licitación)`,
    fuente: o.fuentes?.[0] || null, motivo: 'Si gana, necesitará equipo. Que se presente es una deducción de RADAR, no un hecho.', id: o.id, inferida: true,
  }));
  (e.borme || []).forEach((g) => s.push({
    tipo: g.tipo === 'constitucion' ? 'constitucion' : 'borme', fecha: g.fecha,
    titulo: g.tipo === 'constitucion' ? `Empresa constituida${g.objeto ? ': ' + g.objeto.slice(0, 140) : ''}` : g.titulo,
    fuente: g.fuente ? { nombre: g.fuente.nombre, url: g.fuente.url, consultada: g.fuente.consultada } : null,
    motivo: g.categoria === 'aviso' ? 'Aviso: puede indicar dificultades, no crecimiento.' : g.tipo === 'constitucion' ? 'Una empresa que empieza puede necesitar sus primeros perfiles.' : 'Un cambio societario de crecimiento puede traer nuevas necesidades.',
    aviso: g.categoria === 'aviso',
  }));
  // Primero los hechos verificados (lo más reciente arriba); después avisos y deducciones.
  const rango = (x) => (x.inferida ? 2 : x.aviso ? 1 : 0);
  return s.sort((a, b) => rango(a) - rango(b) || String(b.fecha || '').localeCompare(String(a.fecha || '')));
}

/* Texto con el que se compara el perfil: lo que hace la empresa según sus señales. */
const bjTextoEmpresa = (e) => [e.nombre, ...e.ganados.map((o) => o.titulo + ' ' + (o.etiquetas || []).join(' ')), ...e.candidata.map((o) => o.titulo), ...(e.borme || []).map((g) => g.objeto || g.titulo || '')].join(' ');

function bjTemaPerfil(texto) {
  let mejor = null; let n = 0;
  Object.entries(CV.temas || {}).forEach(([k, t]) => {
    const rx = rxPerfil(t.detectar || k);
    const m = (texto.match(new RegExp(rx.source, 'gi')) || []).length;
    if (m > n) { n = m; mejor = k; }
  });
  return { tema: mejor, coincidencias: n };
}

/* Encaje explicable: puntuación orientativa, por qué, evidencias del CV, carencias e incertidumbres. */
function bjEncaje(e) {
  const fuentes = [...e.ganados, ...e.candidata];
  const crit = (k) => Math.max(0, ...fuentes.map((o) => o.criterios?.[k]?.valor ?? 0));
  const texto = bjTextoEmpresa(e);
  const { tema, coincidencias } = bjTemaPerfil(texto);
  const evid = [];
  if (tema) {
    CV.experiencia.forEach((x) => (x.vinetas || []).forEach((v) => {
      const t = typeof v === 'string' ? v : v.t;
      const temas = typeof v === 'string' ? [] : v.temas || [];
      if (temas.includes(tema) && evid.length < 3) evid.push(`${bjSinHtml(t)} (${x.puesto}, ${x.empresa})`);
    }));
  }
  const encaje = fuentes.length ? Math.max(crit('encaje'), coincidencias ? 0.6 : 0.3) : (coincidencias ? Math.min(0.9, 0.5 + 0.1 * coincidencias) : 0.3);
  // Que se presente a licitaciones abiertas es una deducción: pesa menos que haber ganado.
  const necesidad = e.ganados.length ? Math.max(0.4, ...e.ganados.map((o) => o.criterios?.necesidad?.valor ?? 0)) : e.candidata.length ? 0.35 : 0.3;
  // La zona se mide con lo que ha ganado (si no hay, con donde se presenta); «España» no es una zona.
  const comunidades = new Set((e.ganados.length ? e.ganados : fuentes).map((o) => o.ubicacion?.comunidad).filter((c) => c && c !== 'España'));
  const enZona = !comunidades.size || comunidades.has(REGION) || [...comunidades].some((c) => (PREF.zonas || []).includes(c));
  const geo = enZona ? 1 : 0.5;
  const contacto = bjContactoDetectado(e);
  const acceso = contacto?.email ? 0.9 : contacto?.web ? 0.6 : 0.3;
  const avisos = (e.borme || []).some((g) => g.categoria === 'aviso');
  let puntos = Math.round(100 * (0.45 * encaje + 0.25 * necesidad + 0.15 * geo + 0.15 * acceso));
  if (avisos) puntos = Math.max(0, puntos - 25);

  const porque = [];
  if (tema) porque.push(`Su actividad coincide con tu enfoque «${CV.temas[tema].nombre}».`);
  if (e.ganados.length) porque.push(`Ha ganado ${e.ganados.length} contrato${e.ganados.length > 1 ? 's' : ''} relacionado${e.ganados.length > 1 ? 's' : ''} con tu perfil.`);
  if (enZona && comunidades.size) porque.push(`Trabaja en ${[...comunidades].join(', ')}, una zona que aceptas.`);
  const carencias = [];
  if (!tema) carencias.push('Ninguna experiencia de tu CV coincide claramente con su actividad.');
  if (!enZona) carencias.push(`Trabaja en ${[...comunidades].join(', ')}, fuera de las zonas que has marcado.`);
  if (avisos) carencias.push('Hay un aviso en el BORME (concurso, disolución o similar): revisa antes de escribir.');
  const dudas = ['No hay ninguna vacante publicada: es una oportunidad potencial, no una necesidad confirmada.'];
  if (!contacto?.email) dudas.push('No hay un correo verificado: hay que investigar el contacto.');
  const ultima = bjSenales(e)[0]?.fecha;
  if (ultima && (Date.now() - Date.parse(ultima)) / 864e5 > 60) dudas.push(`La señal más reciente es de hace ${Math.round((Date.now() - Date.parse(ultima)) / 864e5)} días.`);
  const confianza = avisos ? 'baja' : puntos >= 70 && contacto?.email && tema ? 'alta' : puntos >= 55 && tema ? 'media' : 'baja';
  return { puntos, tema, porque, evidencias: evid, carencias, dudas, confianza };
}

function bjContactoDetectado(e) {
  const c = e.contacto;
  if (!c || (!c.email && !c.web)) return null;
  return { email: c.email || '', web: c.web || '', nombre: '', cargo: '', fuente: c.email ? 'Web oficial de la empresa (contactos verificados de RADAR)' : 'Web de la empresa', comprobado: '' };
}

function bjNueva(e) {
  return {
    k: e.k, empresa: e.nombre, nif: e.nif || '', ciudad: e.ciudad || '', origen: 'radar', estado: 'detectada',
    creado: new Date().toISOString(), actualizado: new Date().toISOString(),
    senales: bjSenales(e), encaje: bjEncaje(e), contacto: bjContactoDetectado(e), fuenteOp: (e.ganados[0] || e.candidata[0])?.origen || null,
    mensajes: [], siguiente: { accion: BJ_SIGUIENTE.detectada, fecha: hoyISO() }, eventos: [],
  };
}

/* ---------- Vista ---------- */
/* Propuestas del equipo de agentes: lo que el Analista eligió y el Investigador investigó por la
   mañana (tabla «oportunidades» del servidor) entra en tu bandeja una sola vez. Lo que ya está en
   la bandeja o descartaste no se vuelve a traer. */
let BJ_AGENTES_LEIDO = false;
async function bjTraerDeAgentes() {
  if (BJ_AGENTES_LEIDO || typeof RADAR_NUBE === 'undefined' || !RADAR_NUBE || !NUBE_SESION) return 0;
  BJ_AGENTES_LEIDO = true;
  const { data, error } = await RADAR_NUBE.from('oportunidades').select('clave,titulo,datos,puntuacion,explicacion,actualizado,estado')
    .in('estado', ['validada', 'borrador', 'aprobacion', 'contactada', 'respuesta']).order('actualizado', { ascending: false }).limit(40);
  if (error || !data?.length) return 0;
  const datos = bjDatos();
  // Estado del servidor → estado de la bandeja (envío automático de la fase 3)
  const EST = { validada: 'validada', borrador: 'borrador', aprobacion: 'aprobacion', contactada: 'enviada', respuesta: 'respuesta' };
  const orden = ['validada', 'borrador', 'aprobacion', 'enviada', 'respuesta'];
  const avanzar = (op, r) => {
    const nuevo = EST[r.estado];
    if (orden.indexOf(nuevo) <= orden.indexOf(op.estado) || !orden.includes(op.estado)) return false;
    op.estado = nuevo;
    op.siguiente = { accion: nuevo === 'enviada' ? 'Esperar respuesta (seguimiento automático a los 10 días)' : nuevo === 'respuesta' ? 'Contestar y proponer una llamada' : 'Revisar el mensaje en Mi perfil → Agentes', fecha: hoyISO() };
    bjEvento(op, nuevo, nuevo === 'enviada' ? 'Presentación enviada automáticamente con tu CV' : nuevo === 'respuesta' ? 'La empresa ha respondido: mira tu correo' : 'Presentación preparada por tus agentes');
    op.actualizado = new Date().toISOString();
    return true;
  };
  let cambios = 0;
  data.forEach((r) => { const op = datos[r.clave]; if (op && op.origen === 'agentes' && avanzar(op, r)) cambios++; });
  const emp = new Map(empresasDetectadas().map((e) => [e.k, e]));
  let n = 0;
  data.forEach((r) => {
    if (datos[r.clave] || ST.excluidas[r.clave]) return;
    const c = r.datos?.candidata || {};
    const e = emp.get(r.clave);
    const op = bjNueva(e || { k: r.clave, nombre: r.titulo, nif: c.nif, ciudad: c.ciudad, ganados: [], candidata: [], borme: [], contacto: null });
    op.origen = 'agentes';
    op.agentes = { puntos: r.puntuacion, motivos: r.explicacion?.motivos || [], fecha: r.actualizado };
    if (!e) {
      // La empresa ya no está en la recogida de hoy: sus hechos vienen de lo que guardó el Analista.
      op.recalcular = true;
      op.senales = (c.hechos || []).map((h, i) => ({ tipo: 'adjudicacion', titulo: 'Ha ganado ' + h, fuente: c.fuentes?.[i] || c.fuentes?.[0] || null, motivo: 'Al ganar un contrato tiene que organizar el equipo que lo ejecuta.' }));
    }
    if (r.datos?.investigacion && typeof iaAplicarInvestigacion === 'function') iaAplicarInvestigacion(op, r.datos.investigacion);
    op.estado = 'validada';
    op.siguiente = { accion: 'Revisar la propuesta de tus agentes', fecha: hoyISO() };
    bjEvento(op, 'alta', `Propuesta por tu equipo de agentes (${r.puntuacion} puntos) el ${fechaCorta(r.actualizado)}`);
    avanzar(op, r);
    datos[r.clave] = op; n++;
  });
  if (n || cambios) bjGuardar();
  return n + cambios;
}
document.addEventListener('radar-nube-lista', () => {
  bjTraerDeAgentes().then((n) => { if (n && typeof VISTA !== 'undefined' && VISTA === 'bandeja') pintar(); });
});

function pintarBandeja() {
  const datos = bjDatos();
  $('#res-n').textContent = '';
  const cont = el('div', 'bj');
  const todas = Object.values(datos);
  const activas = todas.filter((o) => BJ_ACTIVOS.includes(o.estado));
  const hoy = hoyISO();
  const accionHoy = activas.filter((o) => o.siguiente?.fecha && o.siguiente.fecha <= hoy && !['enviada'].includes(o.estado) || o.estado === 'respuesta');
  const detectadas = bjDetectadas();

  const kpis = el('div', 'bj-kpis');
  const kpi = (n, t, fn) => { const b = boton('', 'bj-kpi', fn); b.append(el('b', null, String(n)), el('span', null, t)); kpis.append(b); };
  kpi(detectadas.length, 'nuevas para revisar', () => { BJ_PESTANA = 'nuevas'; pintar(); });
  kpi(activas.length, 'en tu bandeja', () => { BJ_PESTANA = 'bandeja'; BJ_FILTRO = 'activas'; pintar(); });
  kpi(accionHoy.length, 'necesitan tu acción', () => { BJ_PESTANA = 'bandeja'; BJ_FILTRO = 'accion'; pintar(); });
  kpi(todas.filter((o) => ['respuesta', 'reunion'].includes(o.estado)).length, 'respuestas y reuniones', () => { BJ_PESTANA = 'bandeja'; BJ_FILTRO = 'respuesta'; pintar(); });
  cont.append(kpis);

  const tabs = el('div', 'pf-tabs bj-tabs'); tabs.setAttribute('role', 'tablist');
  [['bandeja', `Mi bandeja (${activas.length})`], ['nuevas', `Detectadas por RADAR (${detectadas.length})`]].forEach(([k, n]) => {
    const b = boton(n, 'pf-tab' + (BJ_PESTANA === k ? ' on' : ''), () => { BJ_PESTANA = k; pintar(); });
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', BJ_PESTANA === k); tabs.append(b);
  });
  const acc = el('div', 'bj-tabs-acc');
  acc.append(boton('+ Añadir empresa a mano', 'btn sec mini', bjAnadirManual), Object.assign(enlace('#empresas', 'Todas las señales de empresas', 'enlace'), { target: '' }));
  const fila = el('div', 'bj-tabs-fila'); fila.append(tabs, acc);
  cont.append(fila);

  if (!BJ_AGENTES_LEIDO) bjTraerDeAgentes().then((n) => { if (n && VISTA === 'bandeja') pintar(); });
  if (BJ_PESTANA === 'nuevas') cont.append(bjVistaNuevas(detectadas));
  else cont.append(bjVistaBandeja(todas, accionHoy));
  if (typeof NUBE_SESION !== 'undefined' && !NUBE_SESION) cont.append(el('p', 'nota bj-nota', 'Sin cuenta, tu bandeja se guarda solo en este navegador. Entra con tu correo para tenerla también en el móvil.'));
  $('#rejilla').replaceChildren(cont);
}

function bjDetectadas() {
  const datos = bjDatos();
  const f = ST.bandejaFiltros;
  const norte = new Set(['Asturias', 'Galicia', 'Cantabria', 'País Vasco', 'Navarra', 'Castilla y León', REGION, ...(PREF.zonas || [])]);
  return empresasDetectadas()
    .filter((e) => !datos[e.k] && !ST.excluidas[e.k])
    .filter((e) => {
      const coms = [...e.ganados, ...e.candidata].map((o) => o.ubicacion?.comunidad).filter(Boolean);
      if (f.zona === 'region') return !coms.length ? (e.ciudad || '').includes(REGION) || (e.borme || []).some((g) => g.comunidad === REGION) : coms.includes(REGION);
      if (f.zona === 'norte') return !coms.length || coms.some((c) => norte.has(c));
      return true;
    })
    .filter((e) => f.tipo === 'todas' || (f.tipo === 'adjudicacion' && e.ganados.length) || (f.tipo === 'nueva' && e.nueva) || (f.tipo === 'contacto' && e.contacto?.email))
    .map((e) => ({ e, enc: bjEncaje(e) }))
    .sort((a, b) => b.enc.puntos - a.enc.puntos);
}

function bjVistaNuevas(lista) {
  const w = el('div', 'bj-nuevas');
  const f = ST.bandejaFiltros;
  const filtros = el('div', 'bj-filtros');
  const sel = (id, etq, ops, k) => {
    const l = el('label', 'bj-sel'); l.append(el('span', null, etq));
    const s = el('select'); s.id = id;
    ops.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.selected = f[k] === v; s.append(o); });
    s.addEventListener('change', () => { f[k] = s.value; bjGuardar(); pintar(); });
    l.append(s); filtros.append(l);
  };
  sel('bj-zona', 'Territorio', [['region', REGION], ['norte', 'Norte y tus zonas'], ['toda', 'Toda España']], 'zona');
  sel('bj-tipo', 'Señal', [['todas', 'Todas'], ['adjudicacion', 'Ha ganado contratos'], ['nueva', 'Empresa nueva'], ['contacto', 'Con correo verificado']], 'tipo');
  filtros.append(el('span', 'nota', 'Los filtros se guardan.'));
  w.append(filtros);
  if (!lista.length) { w.append(el('p', 'bj-vacio', 'No hay empresas nuevas con estos filtros. RADAR revisa adjudicaciones, licitaciones y el BORME cada mañana.')); return w; }
  const g = el('div', 'bj-grid');
  lista.slice(0, 40).forEach(({ e, enc }) => {
    const c = el('article', 'bj-card');
    const top = el('div', 'bj-card-top');
    top.append(el('span', 'bj-pot', 'Oportunidad potencial'), bjPillEncaje(enc));
    c.append(top, el('h3', null, e.nombre));
    if (e.ciudad) c.append(el('p', 'nota', e.ciudad));
    const s = bjSenales(e)[0];
    if (s) {
      const p = el('p', 'bj-senal' + (s.inferida ? ' inferida' : ''));
      p.append(el('b', null, s.inferida ? 'Deducción: ' : 'Hecho: '), s.titulo.slice(0, 170) + (s.titulo.length > 170 ? '…' : ''), el('small', null, ` · ${s.fuente?.nombre || 'fuente'} · ${fecha(s.fecha)}`));
      c.append(p);
    }
    c.append(el('p', 'nota', enc.porque[0] || enc.carencias[0] || ''));
    const acc = el('div', 'bj-card-acc');
    acc.append(boton('Añadir a mi bandeja', 'btn mini', () => { const op = bjNueva(e); bjEvento(op, 'alta', 'Añadida desde las señales de RADAR'); bjDatos()[e.k] = op; bjGuardar(); bjAbrir(e.k); pintar(); }),
      boton('Ver ficha', 'btn sec mini', () => bjAbrirDetectada(e)),
      boton('No me interesa', 'enlace', () => { ST.excluidas[e.k] = { empresa: e.nombre, f: new Date().toISOString(), motivo: 'No me interesa' }; bjGuardar(); pintar(); }));
    c.append(acc);
    g.append(c);
  });
  w.append(g);
  return w;
}

function bjPillEncaje(enc) {
  const p = el('span', 'bj-encaje ' + enc.confianza);
  p.append(el('b', null, String(enc.puntos)), ` encaje · confianza ${enc.confianza}`);
  return p;
}
function bjPillEstado(estado) { return el('span', 'bj-estado e-' + estado, BJ_NOMBRE[estado] || estado); }

function bjVistaBandeja(todas, accionHoy) {
  const w = el('div', 'bj-lista');
  const chips = el('div', 'bj-chips');
  [['activas', 'Activas'], ['accion', 'Necesitan acción'], ['respuesta', 'Respuestas y reuniones'], ['enviadas', 'Enviadas'], ['descartadas', 'Descartadas']].forEach(([k, t]) => {
    chips.append(boton(t, 'chip' + (BJ_FILTRO === k ? ' on' : ''), () => { BJ_FILTRO = k; pintar(); }));
  });
  w.append(chips);
  const lista = todas.filter((o) => ({
    activas: BJ_ACTIVOS.includes(o.estado), accion: accionHoy.includes(o), respuesta: ['respuesta', 'reunion'].includes(o.estado),
    enviadas: ['enviada', 'seguimiento'].includes(o.estado), descartadas: o.estado === 'descartada',
  })[BJ_FILTRO]).sort((a, b) => String(a.siguiente?.fecha || '9').localeCompare(String(b.siguiente?.fecha || '9')) || b.encaje.puntos - a.encaje.puntos);
  if (!todas.length) {
    const v = el('div', 'bj-vacio');
    v.append(el('p', null, 'Tu bandeja está vacía. Empieza por las empresas que RADAR ha detectado: cada una tiene una señal con fuente y fecha.'), boton('Ver empresas detectadas', 'btn', () => { BJ_PESTANA = 'nuevas'; pintar(); }));
    w.append(v); return w;
  }
  if (!lista.length) { w.append(el('p', 'bj-vacio', 'Nada en este filtro.')); return w; }
  const t = el('div', 'bj-tabla');
  const cab = el('div', 'bj-fila bj-cab');
  ['Empresa', 'Señal', 'Encaje', 'Contacto', 'Estado', 'Última actividad', 'Siguiente acción'].forEach((x) => cab.append(el('span', null, x)));
  t.append(cab);
  lista.forEach((o) => {
    const f = el('div', 'bj-fila'); f.tabIndex = 0; f.setAttribute('role', 'button');
    const emp = el('span', 'bj-c-emp'); emp.append(el('b', null, o.empresa), el('small', null, [o.origen === 'agentes' ? 'Propuesta por tus agentes' : '', o.ciudad || ''].filter(Boolean).join(' · ')));
    const s = o.senales[0];
    f.append(emp, el('span', 'bj-c-senal', s ? s.titulo.slice(0, 90) + (s.titulo.length > 90 ? '…' : '') : 'Añadida a mano'), bjPillEncaje(o.encaje),
      el('span', 'bj-c-contacto ' + (o.contacto?.email || o.contacto?.formulario ? 'ok' : 'falta'), o.contacto?.email ? '✓ ' + (o.contacto.nombre || o.contacto.email) : o.contacto?.formulario ? '✓ Formulario web' : 'Pendiente'),
      bjPillEstado(o.estado), el('span', 'bj-c-fecha', fechaCorta(o.actualizado)));
    const sig = el('span', 'bj-c-sig' + (o.siguiente?.fecha && o.siguiente.fecha <= hoyISO() ? ' hoy' : ''));
    sig.append(o.siguiente?.accion || '—', o.siguiente?.fecha ? el('small', null, ' · ' + fechaCorta(o.siguiente.fecha)) : '');
    f.append(sig);
    const abrir = () => bjAbrir(o.k);
    f.addEventListener('click', abrir);
    f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } });
    t.append(f);
  });
  w.append(t);
  return w;
}

/* ---------- Ficha de oportunidad ---------- */
function bjDialogo() {
  let d = $('#bj-ficha');
  if (!d) {
    d = el('dialog', 'bj-ficha'); d.id = 'bj-ficha';
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  return d;
}

function bjAbrirDetectada(e) {
  const op = bjNueva(e);
  bjPintarFicha(op, true, e);
}
function bjAbrir(k) {
  const op = bjDatos()[k];
  if (op) bjPintarFicha(op, false);
}

function bjPintarFicha(op, previa, e) {
  const d = bjDialogo();
  const cuerpo = el('div', 'bj-f');
  const cerrar = boton('Cerrar', 'enlace bj-cerrar', () => d.close());
  const cab = el('header', 'bj-f-cab');
  const tit = el('div');
  tit.append(el('p', 'eyebrow', previa ? 'Oportunidad potencial · detectada por RADAR' : op.origen === 'agentes' ? 'Oportunidad potencial · propuesta por tus agentes' : 'Oportunidad potencial'), el('h2', null, op.empresa));
  if (op.ciudad) tit.append(el('p', 'nota', op.ciudad));
  const est = el('div', 'bj-f-est');
  est.append(bjPillEstado(op.estado), bjPillEncaje(op.encaje));
  cab.append(tit, est);
  cuerpo.append(cerrar, cab);

  // Acciones
  const acc = el('div', 'bj-f-acc');
  if (previa) {
    acc.append(boton('Añadir a mi bandeja', 'btn', () => { bjEvento(op, 'alta', 'Añadida desde las señales de RADAR'); bjDatos()[op.k] = op; bjGuardar(); bjPintarFicha(op, false); pintar(); }),
      boton('No me interesa', 'btn sec', () => { ST.excluidas[op.k] = { empresa: op.empresa, f: new Date().toISOString(), motivo: 'No me interesa' }; bjGuardar(); d.close(); pintar(); }));
  } else bjAcciones(op, acc);
  cuerpo.append(acc);

  // Por qué la eligió el Analista
  if (op.agentes?.motivos?.length) {
    const ba = bjBloque(cuerpo, `Por qué te la proponen tus agentes · ${op.agentes.puntos} puntos`, 'Puntuación de RADAR con sus criterios. No es una vacante: es una empresa con señales de actividad.');
    const ula = el('ul', 'bj-senales');
    op.agentes.motivos.forEach((m) => ula.append(el('li', null, `${m.criterio}: ${m.valor}/100${m.motivos?.length ? ' · ' + m.motivos.join(', ') : ''}`)));
    ba.append(ula);
  }

  // Por qué ahora
  const b1 = bjBloque(cuerpo, 'Por qué ahora', 'Hechos con su fuente. La necesidad de contratar es una hipótesis: no hay vacante publicada.');
  const ul = el('ul', 'bj-senales');
  const rango = (x) => (x.inferida ? 2 : x.aviso ? 1 : 0);
  const orden = [...op.senales].sort((a, b) => rango(a) - rango(b) || String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const deducciones = orden.filter((x) => x.inferida);
  orden.filter((x) => !x.inferida || deducciones.indexOf(x) < 3).forEach((s) => {
    const li = el('li', s.aviso ? 'aviso' : s.inferida ? 'inferida' : 'hecho');
    li.append(el('span', 'bj-tag', s.aviso ? 'Aviso' : s.inferida ? 'Deducción de RADAR' : s.ia ? 'Encontrado con IA · comprueba la fuente' : s.tipo === 'manual' ? 'Añadido por ti' : 'Hecho verificado'), el('b', null, s.titulo));
    if (s.resumen) li.append(el('span', 'bj-resumen', s.resumen));
    const meta = el('small');
    meta.append(fecha(s.fecha) + ' · ');
    if (s.fuente?.url) meta.append(enlace(s.fuente.url, (s.fuente.nombre || 'Fuente') + ' ↗', 'enlace'));
    else meta.append(s.fuente?.nombre || 'Fuente indicada a mano');
    if (s.fuente?.consultada) meta.append(` · consultada el ${fecha(s.fuente.consultada)}`);
    li.append(meta, el('p', 'bj-motivo', 'Hipótesis: ' + s.motivo));
    ul.append(li);
  });
  if (deducciones.length > 3) ul.append(el('li', 'inferida', `Y ${deducciones.length - 3} licitaciones abiertas más a las que suele presentarse (deducción de RADAR).`));
  if (!op.senales.length) ul.append(el('li', 'inferida', 'Sin señales registradas.'));
  b1.append(ul);

  // Encaje
  const en = op.encaje;
  const b2 = bjBloque(cuerpo, 'Encaje con tu perfil', `Puntuación orientativa ${en.puntos}/100 · confianza ${en.confianza}.`);
  const col = el('div', 'bj-encaje-grid');
  const lista = (t, xs, cls) => { const d2 = el('div', 'bj-col ' + cls); d2.append(el('h4', null, t)); const u = el('ul'); (xs.length ? xs : ['—']).forEach((x) => u.append(el('li', null, x))); d2.append(u); col.append(d2); };
  lista('Por qué encaja', en.porque, 'ok');
  lista('Evidencias de tu CV', en.evidencias, 'ev');
  lista('Lo que falta', en.carencias, 'falta');
  lista('Incertidumbres', en.dudas, 'duda');
  b2.append(col);

  // Contacto
  const b3 = bjBloque(cuerpo, 'Contacto', 'Solo datos profesionales de fuentes legítimas, siempre con su fuente. RADAR no adivina correos.');
  b3.append(bjContacto(op, previa));
  if (!previa && typeof iaBloqueInvestigacion === 'function') iaBloqueInvestigacion(op, bjBloque(cuerpo, 'Investigación con IA', 'Busca en la web su sitio oficial, señales recientes con fuente y un canal de contacto publicado. Solo se guardan fuentes que la búsqueda ha visitado de verdad.'));

  // Mensaje
  if (!previa) {
    const b4 = bjBloque(cuerpo, 'Presentación', 'Mensaje único para esta empresa, basado solo en datos reales de tu perfil y de su señal. Nada se envía sin tu aprobación.');
    b4.append(bjMensaje(op));
    const b5 = bjBloque(cuerpo, 'Historial', 'Todo lo que ha pasado con esta oportunidad.');
    const h = el('ol', 'bj-hist');
    [...(op.eventos || [])].reverse().forEach((ev) => { const li = el('li'); li.append(el('small', null, fechaHora(ev.f)), ' ', ev.texto); h.append(li); });
    b5.append(h);
  }
  d.replaceChildren(cuerpo);
  if (!d.open) d.showModal();
}

function bjBloque(padre, titulo, nota) {
  const s = el('section', 'bj-bloque');
  s.append(el('h3', null, titulo));
  if (nota) s.append(el('p', 'nota', nota));
  padre.append(s);
  return s;
}

function bjCambiarEstado(op, estado, texto, sig) {
  const antes = op.estado;
  op.estado = estado;
  op.siguiente = sig || { accion: BJ_SIGUIENTE[estado], fecha: estado === 'descartada' ? '' : hoyISO() };
  bjEvento(op, 'estado', texto || `${BJ_NOMBRE[antes]} → ${BJ_NOMBRE[estado]}`);
  bjGuardar();
  bjPintarFicha(op, false);
  pintar();
}

function bjAcciones(op, acc) {
  const e = op.estado;
  if (e === 'detectada') acc.append(boton('Investigar', 'btn', () => bjCambiarEstado(op, 'investigando')));
  if (['detectada', 'investigando'].includes(e)) acc.append(boton('Validar oportunidad', e === 'investigando' ? 'btn' : 'btn sec', () => {
    if (!op.contacto?.email && !op.contacto?.formulario) { alert('Antes de validarla, añade un contacto con su fuente (o el formulario de su web).'); return; }
    bjCambiarEstado(op, 'validada');
  }));
  if (['validada', 'investigando'].includes(e) || (e === 'detectada' && op.contacto)) acc.append(boton('Generar presentación', 'btn sec', () => { bjGenerarMensaje(op); bjCambiarEstado(op, 'borrador', 'Presentación generada (versión ' + op.mensajes.length + ')'); }));
  if (['enviada', 'seguimiento'].includes(e)) acc.append(boton('Marcar respuesta', 'btn', () => {
    const t = prompt('¿Qué han respondido? (resumen breve para tu historial)');
    if (t == null) return;
    bjCambiarEstado(op, 'respuesta', 'Respuesta recibida: ' + (t || 'sin resumen'), { accion: BJ_SIGUIENTE.respuesta, fecha: hoyISO() });
  }));
  if (['respuesta', 'enviada', 'seguimiento'].includes(e)) acc.append(boton('Reunión acordada', 'btn sec', () => {
    const f = prompt('Fecha de la reunión (AAAA-MM-DD):', bjMasDias(7));
    if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
    bjCambiarEstado(op, 'reunion', 'Reunión acordada para el ' + fecha(f), { accion: 'Reunión con ' + op.empresa, fecha: f });
  }));
  if (e !== 'descartada') acc.append(boton('Descartar', 'btn sec', () => {
    const m = prompt('¿Por qué la descartas? (queda en el historial)', 'No encaja');
    if (m == null) return;
    if (confirm('¿Quieres que RADAR no vuelva a proponerte esta empresa?')) ST.excluidas[op.k] = { empresa: op.empresa, f: new Date().toISOString(), motivo: m };
    bjCambiarEstado(op, 'descartada', 'Descartada: ' + m, { accion: '', fecha: '' });
  }));
  else acc.append(boton('Recuperar', 'btn sec', () => { delete ST.excluidas[op.k]; bjCambiarEstado(op, 'investigando', 'Recuperada'); }));
}

/* ---------- Contacto ---------- */
function bjContacto(op, previa) {
  const w = el('div', 'bj-contacto');
  const c = op.contacto;
  if (c && (c.email || c.web || c.formulario)) {
    const dl = el('dl', 'bj-dl');
    const fila = (t, v) => { if (!v) return; dl.append(el('dt', null, t)); const dd = el('dd'); dd.append(v); dl.append(dd); };
    fila('Persona', [c.nombre, c.cargo].filter(Boolean).join(' · '));
    fila('Correo', c.email);
    if (c.web) fila('Web', enlace(c.web, c.web.replace(/^https?:\/\//, '').slice(0, 60) + ' ↗', 'enlace'));
    if (c.formulario) fila('Formulario', enlace(c.formulario, 'Formulario de contacto ↗', 'enlace'));
    fila('Fuente', c.fuente + (c.comprobado ? ` · comprobado el ${fecha(c.comprobado)}` : ''));
    w.append(dl);
  } else {
    w.append(el('p', 'bj-pendiente', 'Pendiente de investigar: no hay un contacto fiable. No escribas a un correo adivinado.'));
  }
  const q = encodeURIComponent(op.empresa.replace(/,?\s*(S\.?L\.?U?|S\.?A\.?U?|SOCIEDAD LIMITADA( UNIPERSONAL)?|SOCIEDAD ANONIMA)\.?$/i, ''));
  const ayuda = el('p', 'nota');
  ayuda.append('Dónde buscar: ', enlace(`https://www.google.com/search?q=${q}+contacto`, 'su web oficial ↗', 'enlace'), ' · ',
    enlace(`https://www.linkedin.com/search/results/companies/?keywords=${q}`, 'su página de empresa en LinkedIn ↗', 'enlace'),
    '. Según el caso, el responsable adecuado es dirección de proyectos, operaciones, ingeniería, RR. HH. o dirección general.');
  w.append(ayuda);
  if (!previa) w.append(boton(c ? 'Corregir contacto' : 'Añadir contacto con su fuente', 'btn sec mini', () => bjEditarContacto(op)));
  return w;
}

function bjEditarContacto(op) {
  const d = el('dialog', 'bj-mini');
  const f = el('form', 'adm-form');
  const c = op.contacto || {};
  const campo = (id, t, v, tipo, req) => { const l = el('label'); const i = el('input'); i.id = id; i.type = tipo || 'text'; i.value = v || ''; if (req) i.required = true; l.append(el('span', null, t), i); f.append(l); return i; };
  const nombre = campo('bjc-nombre', 'Persona (opcional)', c.nombre);
  const cargo = campo('bjc-cargo', 'Cargo (opcional)', c.cargo);
  const email = campo('bjc-email', 'Correo profesional', c.email, 'email');
  const web = campo('bjc-web', 'Web de la empresa', c.web, 'url');
  const form = campo('bjc-form', 'Formulario de contacto (si no hay correo)', c.formulario, 'url');
  const fuente = campo('bjc-fuente', 'Fuente: dónde lo has visto (obligatorio)', c.fuente, 'text', true);
  fuente.placeholder = 'p. ej. página «Contacto» de su web, firma de un anuncio oficial…';
  const msg = el('p', 'nube-msg');
  const acc = el('div', 'acciones');
  const ok = el('button', 'btn', 'Guardar contacto'); ok.type = 'submit';
  acc.append(ok, boton('Cancelar', 'btn sec', () => d.close()));
  f.append(msg, acc);
  d.append(el('h3', null, 'Contacto de ' + op.empresa), el('p', 'nota', 'Solo datos profesionales que hayas visto publicados. Si no encuentras un correo, usa el formulario de su web.'), f);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!email.value && !form.value && !web.value) { msg.textContent = 'Indica al menos un correo, un formulario o la web.'; return; }
    op.contacto = { nombre: nombre.value.trim(), cargo: cargo.value.trim(), email: email.value.trim(), web: web.value.trim(), formulario: form.value.trim(), fuente: fuente.value.trim(), comprobado: hoyISO() };
    bjEvento(op, 'contacto', `Contacto ${c.email || c.formulario ? 'corregido' : 'añadido'}: ${op.contacto.email || op.contacto.formulario || op.contacto.web} (fuente: ${op.contacto.fuente})`);
    const en = op.encaje; en.dudas = en.dudas.filter((x) => !/correo verificado/.test(x));
    bjGuardar(); d.close(); bjPintarFicha(op, false); pintar();
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

/* ---------- Presentación ---------- */
function bjGenerarMensaje(op) {
  const tema = op.encaje.tema && CV.temas[op.encaje.tema] ? CV.temas[op.encaje.tema] : Object.values(CV.temas)[0];
  const s = op.senales.find((x) => !x.inferida && !x.aviso) || op.senales[0];
  const corto = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t).replace(/[.\s]+$/, '');
  const nombreCorto = op.empresa.replace(/,?\s*(S\.?L\.?U?|S\.?A\.?U?|SOCIEDAD LIMITADA( UNIPERSONAL)?|SOCIEDAD ANONIMA)\.?$/i, '');
  const hecho = !s ? `he visto la actividad de ${nombreCorto} en mi sector`
    : s.tipo === 'adjudicacion' && s.contrato ? `he visto que ${nombreCorto} ha ganado el contrato «${corto(s.contrato, 110)}»${s.cliente ? ' de ' + s.cliente : ''} (${fecha(s.fecha)})`
    : s.tipo === 'adjudicacion' ? `he visto que ${nombreCorto} ${s.titulo.replace(/^Ha ganado/, 'ha ganado')} (${fecha(s.fecha)})`
      : s.tipo === 'constitucion' ? `he visto en el BORME que ${op.empresa} se ha constituido recientemente (${fecha(s.fecha)})`
        : s.tipo === 'manual' ? `he visto que ${s.titulo.charAt(0).toLowerCase() + s.titulo.slice(1)}`
          : `he visto en el BORME una novedad de ${op.empresa}: ${s.titulo.toLowerCase()} (${fecha(s.fecha)})`;
  const evid = op.encaje.evidencias.slice(0, 2).map((x) => '· ' + x.replace(/ \([^)]*\)$/, ''));
  const saludo = op.contacto?.nombre ? `Hola, ${op.contacto.nombre.split(' ')[0]}:` : `Hola, equipo de ${op.empresa.replace(/,?\s*(S\.?L\.?U?|S\.?A\.?U?|SOCIEDAD LIMITADA( UNIPERSONAL)?|SOCIEDAD ANONIMA)\.?$/i, '')}:`;
  const cuerpo = [
    saludo, '',
    `${op.contacto?.nombre ? 'Le escribo' : 'Les escribo'} porque ${hecho}.`, '',
    `Soy ${CV.nombre}. ${bjSinHtml(tema.perfil)}`,
    ...(evid.length ? ['', 'Algunas cosas que he hecho y que pueden ser útiles en un proyecto así:', ...evid] : []), '',
    `Si en los próximos meses necesitan reforzar el equipo, me gustaría presentarme. Adjunto mi CV.`,
    '¿Tendrían 15 minutos para una llamada?', '',
    'Un saludo,', CV.nombre, [PERFIL.email, PERFIL.linkedin].filter(Boolean).join(' · '),
  ].join('\n');
  const asunto = `${tema.nombre}${s?.tipo === 'adjudicacion' ? ' para sus nuevos proyectos' : ''} · ${CV.nombre}`;
  op.mensajes = op.mensajes || [];
  op.mensajes.push({ v: op.mensajes.length + 1, asunto, cuerpo, destinatario: op.contacto?.email || '', adjunto: 'CV adaptado (' + tema.nombre + ')', creado: new Date().toISOString(), estado: 'borrador' });
}

function bjMensaje(op) {
  const w = el('div', 'bj-msg');
  const m = op.mensajes?.[op.mensajes.length - 1];
  if (!m) {
    w.append(el('p', 'nota', op.contacto ? 'Aún no hay presentación.' : 'Primero añade un contacto con su fuente; después genera la presentación.'));
    if (op.estado !== 'descartada') {
      const a = el('div', 'acciones');
      a.append(boton('Generar con plantilla', 'btn sec', () => { bjGenerarMensaje(op); bjCambiarEstado(op, 'borrador', 'Presentación generada (versión 1)'); }));
      if (typeof iaBotonRedactar === 'function') iaBotonRedactar(op, a);
      w.append(a);
    }
    return w;
  }
  const aprobado = m.estado === 'aprobado' || m.estado === 'enviado';
  const para = el('input'); para.type = 'email'; para.id = 'bjm-para'; para.value = m.destinatario; para.disabled = aprobado;
  const asunto = el('input'); asunto.id = 'bjm-asunto'; asunto.value = m.asunto; asunto.disabled = aprobado;
  const cuerpo = el('textarea'); cuerpo.id = 'bjm-cuerpo'; cuerpo.rows = 14; cuerpo.value = m.cuerpo; cuerpo.disabled = aprobado;
  const campo = (t, i) => { const l = el('label', 'bj-campo'); l.append(el('span', null, t), i); w.append(l); };
  if (m.ia) w.append(el('p', 'bj-tag', 'Redactado con IA a partir de estos datos:'));
  if (m.base?.length) { const u = el('ul', 'ia-base'); m.base.forEach((x) => u.append(el('li', null, x))); w.append(u); }
  campo('Para', para); campo('Asunto', asunto); campo(`Mensaje · versión ${m.v}${m.estado === 'enviado' ? ' · enviada el ' + fecha(m.enviado) : aprobado ? ' · aprobada' : ''}`, cuerpo);
  const adj = el('p', 'nota');
  const cvLink = op.fuenteOp ? cvUrl(op.fuenteOp.lista, op.fuenteOp.clave, op.empresa) : 'cv.html';
  adj.append('Adjunto: ', enlace(cvLink, m.adjunto + ' ↗', 'enlace'), '. Descárgalo en PDF y adjúntalo al enviar. Incluye solo lo pertinente para esta empresa.');
  w.append(adj);
  const avisoDup = Object.values(bjDatos()).find((o) => o !== op && o.estado !== 'descartada' && (o.mensajes || []).some((x) => x.estado === 'enviado' && x.destinatario && x.destinatario === para.value));
  if (avisoDup) w.append(el('p', 'bj-aviso', `Ya escribiste a ${para.value} desde «${avisoDup.empresa}». Evita mensajes duplicados.`));
  const acc = el('div', 'acciones');
  const guardarVersion = () => {
    const cambio = para.value !== m.destinatario || asunto.value !== m.asunto || cuerpo.value !== m.cuerpo;
    if (!cambio) return m;
    const n = { ...m, v: op.mensajes.length + 1, destinatario: para.value.trim(), asunto: asunto.value, cuerpo: cuerpo.value, creado: new Date().toISOString(), estado: 'borrador' };
    op.mensajes.push(n);
    bjEvento(op, 'mensaje', `Mensaje editado (versión ${n.v})`);
    return n;
  };
  if (!aprobado) {
    acc.append(boton('Guardar cambios', 'btn sec', () => { guardarVersion(); bjGuardar(); bjPintarFicha(op, false); }));
    if (typeof iaBotonRedactar === 'function') iaBotonRedactar(op, acc);
    acc.append(boton('Aprobar este mensaje', 'btn', () => {
      const n = guardarVersion();
      if (!n.destinatario && !op.contacto?.formulario) { alert('Falta el destinatario. Añade un contacto con su fuente o usa su formulario web.'); return; }
      if (n.destinatario && op.contacto?.email && n.destinatario !== op.contacto.email && !confirm(`El destinatario (${n.destinatario}) no es el contacto registrado (${op.contacto.email}). ¿Tienes una fuente para esa dirección?`)) return;
      n.estado = 'aprobado'; n.aprobado = new Date().toISOString();
      op.estado = 'aprobacion';
      op.siguiente = { accion: 'Enviar el mensaje aprobado', fecha: hoyISO() };
      bjEvento(op, 'aprobacion', `Aprobaste la versión ${n.v} para ${n.destinatario || 'su formulario web'}`);
      bjGuardar(); bjPintarFicha(op, false); pintar();
    }));
  } else if (m.estado === 'aprobado') {
    if (m.destinatario) {
      const gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(m.destinatario) + '&su=' + encodeURIComponent(m.asunto) + '&body=' + encodeURIComponent(m.cuerpo);
      const g = enlace(gmail, 'Abrir en Gmail para enviar', 'btn');
      g.addEventListener('click', () => { bjEvento(op, 'gmail', `Abriste el mensaje (versión ${m.v}) en Gmail`); bjGuardar(); });
      acc.append(g);
    } else if (op.contacto?.formulario) acc.append(enlace(op.contacto.formulario, 'Abrir su formulario', 'btn'));
    acc.append(boton('Ya lo he enviado', 'btn sec', () => {
      m.estado = 'enviado'; m.enviado = new Date().toISOString(); m.canal = m.destinatario ? 'Gmail' : 'Formulario web';
      op.estado = 'enviada';
      op.siguiente = { accion: 'Si no responden, valorar un seguimiento', fecha: bjMasDias(BJ_DIAS_SEGUIMIENTO) };
      bjEvento(op, 'envio', `Enviado por ${m.canal} a ${m.destinatario || 'su formulario'} (versión ${m.v}, adjunto: ${m.adjunto})`);
      bjGuardar(); bjPintarFicha(op, false); pintar();
    }));
    acc.append(boton('Volver a editar', 'enlace', () => { m.estado = 'borrador'; op.estado = 'borrador'; bjEvento(op, 'mensaje', `Aprobación retirada (versión ${m.v})`); bjGuardar(); bjPintarFicha(op, false); pintar(); }));
  } else if (m.estado === 'enviado' && ['enviada', 'seguimiento'].includes(op.estado)) {
    acc.append(boton('Preparar un seguimiento', 'btn sec', () => {
      const n = { v: op.mensajes.length + 1, destinatario: m.destinatario, asunto: 'Re: ' + m.asunto.replace(/^Re: /, ''), adjunto: m.adjunto, creado: new Date().toISOString(), estado: 'borrador',
        cuerpo: [m.cuerpo.split('\n')[0], '', `Le escribí hace unos días sobre ${op.empresa}. Por si se perdió entre otros correos, me sigue interesando hablar si en algún momento necesitan reforzar el equipo.`, '', 'Un saludo,', CV.nombre].join('\n') };
      op.mensajes.push(n); op.estado = 'seguimiento';
      bjEvento(op, 'mensaje', `Seguimiento preparado (versión ${n.v}). No se enviará sin tu aprobación.`);
      bjGuardar(); bjPintarFicha(op, false); pintar();
    }));
  }
  w.append(acc);
  if (op.mensajes.length > 1) {
    const det = el('details', 'bj-versiones');
    det.append(el('summary', null, `Versiones anteriores (${op.mensajes.length - 1})`));
    op.mensajes.slice(0, -1).reverse().forEach((x) => { const p = el('pre'); p.textContent = `v${x.v} · ${x.estado} · ${fechaHora(x.creado)}\nPara: ${x.destinatario}\nAsunto: ${x.asunto}\n\n${x.cuerpo}`; det.append(p); });
    w.append(det);
  }
  return w;
}

/* ---------- Añadir a mano ---------- */
/* Basta con el nombre. Si la IA está activa, RADAR la investiga sola al añadirla; si no,
   queda «pendiente de investigar» hasta que tenga al menos una señal con fuente. */
function bjAnadirManual() {
  const d = el('dialog', 'bj-mini');
  const f = el('form', 'adm-form');
  const campo = (id, t, tipo, req, ph) => { const l = el('label'); const i = el('input'); i.id = id; i.type = tipo || 'text'; if (req) i.required = true; if (ph) i.placeholder = ph; l.append(el('span', null, t), i); f.append(l); return i; };
  const nombre = campo('bjm-empresa', 'Empresa', 'text', true, 'p. ej. TOPCAD Ingeniería');
  const ciudad = campo('bjm-ciudad', 'Ciudad o zona (opcional)', 'text');
  const web = campo('bjm-web', 'Web de la empresa (opcional)', 'url', false, 'https://…');
  const conIA = typeof iaActiva === 'function' && iaActiva();
  const acc = el('div', 'acciones');
  const ok = el('button', 'btn', conIA ? 'Añadir e investigar con IA' : 'Añadir a mi bandeja'); ok.type = 'submit';
  acc.append(ok, boton('Cancelar', 'btn sec', () => d.close()));
  f.append(acc);
  d.append(el('h3', null, 'Añadir una empresa'), el('p', 'nota', conIA
    ? 'Solo el nombre. RADAR buscará su web, señales recientes con fuente y un contacto publicado.'
    : 'Solo el nombre. Quedará pendiente de investigar hasta que tenga una señal con fuente.'), f);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const k = 'manual:' + norm(nombre.value).replace(/[^a-z0-9]/g, '');
    const ya = Object.values(bjDatos()).find((o) => o.k === k || norm(o.empresa).replace(/[^a-z0-9]/g, '').startsWith(k.slice(7)));
    if (ya) { d.close(); bjAbrir(ya.k); return; }
    const e = { k, nombre: nombre.value.trim(), ciudad: ciudad.value.trim(), ganados: [], candidata: [], borme: [], contacto: null };
    const op = bjNueva(e);
    op.origen = 'manual';
    op.senales = [];
    if (web.value) op.contacto = { nombre: '', cargo: '', email: '', web: web.value.trim(), formulario: '', fuente: 'Indicada por ti', comprobado: hoyISO() };
    op.siguiente = { accion: 'Investigar la empresa', fecha: hoyISO() };
    bjEvento(op, 'alta', 'Añadida a mano');
    bjDatos()[k] = op; bjGuardar(); d.close(); BJ_PESTANA = 'bandeja'; pintar(); bjAbrir(k);
    if (conIA && typeof iaInvestigar === 'function') iaInvestigar(op);
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

/* Encaje de una empresa añadida a mano: se recalcula con lo que se sabe de ella. */
function bjRecalcularManual(op) {
  if (op.origen !== 'manual' && !op.recalcular) return;
  op.encaje = bjEncaje({ k: op.k, nombre: op.empresa, ciudad: op.ciudad, ganados: [], candidata: [], contacto: op.contacto,
    borme: op.senales.map((s) => ({ objeto: `${s.titulo} ${s.resumen || ''} ${op.investigacion?.actividad || ''}`, fecha: s.fecha })) });
  if (!op.senales.length) op.encaje.dudas.unshift('Aún no tiene ninguna señal con fuente: pendiente de investigar.');
}
