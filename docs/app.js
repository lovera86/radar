'use strict';
/* RADAR · explorar oportunidades.
   Datos: data/oportunidades.json (modelo común generado por unificar.py).
   Lo personal (favoritos, estados, búsquedas, pesos) vive solo en este navegador. */

const PERFIL = { nombre: 'Rocío Lovera García', email: 'rlovera86@gmail.com', linkedin: 'linkedin.com/in/rociolovera' };
const NORTE = ['Asturias', 'Galicia', 'Cantabria', 'País Vasco', 'Navarra', 'Castilla y León'];
const PESOS_BASE = { encaje: 30, necesidad: 20, geografia: 15, calidad: 15, salario: 10, acceso: 10 };
const CRITERIOS = {
  encaje: 'Encaje con tu experiencia', necesidad: 'Necesidad real de contratar', geografia: 'Ubicación y modalidad',
  calidad: 'Calidad y actualidad', salario: 'Salario y condiciones', acceso: 'Probabilidad de acceso',
};
const SUBTIPOS = {
  oferta: { nombre: 'Oferta de empleo', clase: 't-oferta' },
  oposicion: { nombre: 'Oposición', clase: 't-publico' },
  contrato_publico: { nombre: 'Contrato público', clase: 't-publico' },
  licitacion_abierta: { nombre: 'Licitación abierta', clase: 't-licitacion' },
  adjudicacion: { nombre: 'Proyecto adjudicado', clase: 't-adjudicacion' },
  senal_empresa: { nombre: 'Señal de empresa', clase: 't-empresa' },
};
const VERIF = {
  vacante_confirmada: 'Vacante publicada',
  proyecto_en_licitacion: 'Oportunidad potencial · no publicada. Licitación abierta: nadie ha ofrecido todavía un puesto.',
  proyecto_adjudicado: 'Oportunidad potencial · no publicada. Proyecto adjudicado: puede necesitar dirección, pero no es una vacante.',
  necesidad_potencial: 'Oportunidad potencial · no publicada. Señal del Registro Mercantil (BORME): es un hecho sobre la empresa, no una vacante.',
};
const NATURALEZA = { vacante_confirmada: 'Vacante publicada', proyecto_en_licitacion: 'Potencial · no publicada', proyecto_adjudicado: 'Potencial · no publicada', necesidad_potencial: 'Potencial · no publicada' };
const ESTADOS = [
  ['interes', 'Me interesa'], ['pendiente', 'Pendiente de revisar'], ['borrador', 'Borrador preparado'], ['enviada', 'Enviada / contactada'],
  ['respuesta', 'Respuesta recibida'], ['entrevista', 'Entrevista'], ['descartada', 'Descartada'], ['cerrada', 'Cerrada'],
];
const NOMBRE_ESTADO = Object.fromEntries(ESTADOS);
const MODALIDAD = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial', desconocida: 'Modalidad sin indicar' };
const VISTAS = {
  explorar: { titulo: 'Explorar', intro: 'Todas las oportunidades juntas, ordenadas por lo bien que encajan contigo.' },
  empleo: { titulo: 'Empleo', intro: 'Ofertas publicadas y plazas públicas: vacantes confirmadas a las que te puedes inscribir.', tipo: 'empleo' },
  proyectos: { titulo: 'Proyectos', intro: 'Licitaciones abiertas y contratos recién adjudicados: no son vacantes, son proyectos que alguien tendrá que dirigir.', tipo: 'proyecto' },
  empresas: { titulo: 'Empresas', intro: 'Empresas con señales verificables de actividad en tu sector. Una señal no es una vacante: es un buen motivo para escribirles.' },
  mapa: { titulo: 'Mapa', intro: 'Dónde están las oportunidades. Las remotas o sin ubicación fiable aparecen aparte, sin marcador.' },
  guardados: { titulo: 'Guardados y candidaturas', intro: 'Lo que has guardado y en qué punto está cada candidatura o contacto.' },
  descubrir: { titulo: 'Descubrir', intro: 'Una oportunidad cada vez, de la que más encaja a la que menos. Solo salen las que aún no has revisado.' },
  perfil: { titulo: 'Mi perfil', intro: 'Lo que RADAR sabe de ti y cómo lo usa. Tus preferencias y pesos cambian la compatibilidad de todas las oportunidades al momento. Se guarda solo en este navegador.' },
};

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const enlace = (href, txt, cls) => { const a = el('a', cls || 'btn sec', txt); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };
const boton = (txt, cls, fn) => { const b = el('button', cls || 'btn sec', txt); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
const eur = (v) => (v == null ? '' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v));
const fecha = (s) => (s ? new Date(s.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const hoyISO = () => new Date().toISOString().slice(0, 10);
const dias = (iso) => (iso ? Math.round((Date.parse(hoyISO()) - Date.parse(iso.slice(0, 10))) / 864e5) : null);
const cvUrl = (l, k, e) => 'cv.html?' + new URLSearchParams({ l, k, ...(e ? { e } : {}) }).toString();
const leer = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (e) { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const iniciales = (s) => (String(s || '').replace(/\b(S\.?L\.?U?|S\.?A\.?|UTE|DE|DEL|LA|LAS|LOS|Y)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || 'R').toUpperCase();

/* ---------- estado personal (solo este navegador) ---------- */
const ST = leer('radar-v2', { fav: {}, est: {}, busq: [], migrado: false });
ST.prop = ST.prop || {};
ST.vistas = ST.vistas || {};
ST.ocultas = ST.ocultas || {};
ST.snap = ST.snap || {};
if (!ST.col) {
  ST.col = {};
  [['mejores', 'Mis mejores oportunidades'], ['remoto', 'Trabajo remoto'], ['empresas', 'Empresas para contactar'], ['proyectos', 'Proyectos interesantes'], ['pendientes', 'Candidaturas pendientes']]
    .forEach(([k, n]) => { ST.col[k] = { nombre: n, items: {} }; });
}
const PESOS = { ...PESOS_BASE, ...leer('radar-pesos', {}) };
const PREF = { zonas: [], modalidades: [], salarioMin: '', disponibilidad: '', permiso: '', roles: {}, evitar: '', ocultos: {}, ...leer('radar-perfil', {}) };
const ROLES = [
  { k: 'program', nombre: 'Program Manager', rx: /program(me)? manager/i, por: 'Has dirigido varios proyectos a la vez en Gárgola Lab (Atlántida, RURAL IA 3D, ForestScape).' },
  { k: 'product', nombre: 'Product Manager / Product Owner', rx: /product (manager|owner)/i, por: 'Definiste la estructura y los requisitos de la plataforma RURAL IA 3D y de herramientas web con IA.' },
  { k: 'pmo', nombre: 'PMO', rx: /\bpmo\b/i, por: 'Máster en Project Management, CAPM y control de alcance, plazos y costes.' },
  { k: 'innovacion', nombre: 'Innovation Manager / gestión de I+D', rx: /innovaci|innovation|i\+d/i, por: 'ForestScape 3D Analytics: I+D con el CTAG y financiación del IGAPE.' },
  { k: 'digital', nombre: 'Digital Transformation Manager', rx: /transformaci[oó]n digital|digital transformation|digitalizaci/i, por: 'Ecommerce integrado con ERP y automatización de procesos en Grumatel.' },
  { k: 'delivery', nombre: 'Delivery / Service Delivery Manager', rx: /delivery manager/i, por: 'Coordinación de equipos de desarrollo y entregas con el cliente.' },
];
const guardarPref = () => { escribir('radar-perfil', PREF); D.ops.forEach((o) => { delete o._p; }); };
const guardarST = () => { escribir('radar-v2', ST); contadorGuardados(); };

function instantanea(id) {
  const o = D.porId.get(id);
  if (o) ST.snap[id] = { titulo: o.titulo, org: o.organizacion.nombre, url: o.fuentes[0]?.url || '', subtipo: o.subtipo, plazo: o.fechas.plazo || null };
}
function setEstado(id, e, nota) {
  instantanea(id);
  const prev = ST.est[id];
  if (prev && prev.estado === e) return;
  const h = prev ? prev.hist : [];
  ST.est[id] = { estado: e, hist: [...h, { e, f: new Date().toISOString(), ...(nota ? { nota } : {}) }] };
  guardarST();
}
/* Quitar de Guardados: borra favorito, colecciones y estado, y la deja oculta para que no vuelva a salir. */
function quitarGuardado(id) {
  instantanea(id);
  delete ST.fav[id];
  delete ST.est[id];
  Object.values(ST.col).forEach((c) => { delete c.items[id]; });
  ST.ocultas[id] = new Date().toISOString();
  guardarST();
}
function recuperarOculta(id) { delete ST.ocultas[id]; guardarST(); }

function toggleFav(id) {
  instantanea(id);
  if (ST.fav[id]) delete ST.fav[id]; else ST.fav[id] = new Date().toISOString();
  guardarST();
}

/* ---------- datos ---------- */
const D = { ops: [], meta: {}, porId: new Map(), senales: [] };

/* Ajustes según tu perfil: se aplican sobre los criterios calculados en origen y se explican. */
function ajustados(o) {
  const c = {};
  Object.entries(o.criterios).forEach(([k, v]) => { c[k] = { ...v, motivos: [...(v.motivos || [])] }; });
  const t = norm(o.titulo);
  if (PREF.zonas.length && c.geografia && o.ubicacion.comunidad && PREF.zonas.includes(o.ubicacion.comunidad) && (c.geografia.valor ?? 0) < 0.85) {
    c.geografia.valor = 0.85; c.geografia.motivos.push(`${o.ubicacion.comunidad} está entre las zonas que aceptas`);
  }
  if (PREF.modalidades.length && o.modalidad !== 'desconocida' && c.geografia?.valor != null) {
    if (PREF.modalidades.includes(o.modalidad)) { c.geografia.valor = Math.min(1, c.geografia.valor + 0.1); c.geografia.motivos.push('modalidad que prefieres'); } else { c.geografia.valor = Math.max(0, c.geografia.valor - 0.25); c.geografia.motivos.push('modalidad que no prefieres'); }
  }
  const min = parseInt(PREF.salarioMin, 10);
  if (min && o.salario?.texto) {
    const nums = (o.salario.texto.match(/\d{2,3}(?:[.,]\d{3})+|\d{4,6}/g) || []).map((n) => +n.replace(/[.,]/g, '')).map((n) => (n < 1000 ? n * 1000 : n));
    if (nums.length && Math.max(...nums) < min) { c.salario.valor = 0.15; c.salario.motivos.push(`por debajo de tu mínimo (${min.toLocaleString('es-ES')} €)`); }
  }
  if (c.encaje) {
    const rol = ROLES.find((r) => PREF.roles[r.k] === true && r.rx.test(o.titulo));
    if (rol) { c.encaje.valor = Math.min(1, (c.encaje.valor ?? 0) + 0.12); c.encaje.motivos.push(`rol que has aceptado: ${rol.nombre}`); }
    const rech = ROLES.find((r) => PREF.roles[r.k] === false && r.rx.test(o.titulo));
    if (rech) { c.encaje.valor = Math.max(0, (c.encaje.valor ?? 0) - 0.2); c.encaje.motivos.push(`rol que has descartado: ${rech.nombre}`); }
    const evitar = PREF.evitar.split(',').map((x) => norm(x).trim()).filter(Boolean);
    const e = evitar.find((x) => t.includes(x));
    if (e) { c.encaje.valor = Math.max(0, (c.encaje.valor ?? 0) - 0.3); c.encaje.motivos.push(`contiene «${e}», que no quieres priorizar`); }
  }
  return c;
}

function puntuar(o) {
  if (o._p) return o._p;
  let s = 0, w = 0;
  const crits = ajustados(o);
  const partes = Object.entries(CRITERIOS).map(([k]) => {
    const c = crits[k] || { valor: null, sin_info: true, motivos: [] };
    const peso = PESOS[k] || 0;
    if (c.valor != null) { s += c.valor * peso; w += peso; }
    return { k, ...c, peso };
  });
  o._p = { total: w ? Math.round(100 * s / w) : 0, partes };
  return o._p;
}

function migrarAntiguas() {
  if (ST.migrado) return;
  const viejas = leer('radar-aplicadas', {});
  for (const [clave, f] of Object.entries(viejas)) {
    const o = D.ops.find((x) => x.origen.clave === clave);
    if (o && !ST.est[o.id]) ST.est[o.id] = { estado: 'borrador', hist: [{ e: 'borrador', f: f + 'T12:00:00Z', nota: 'Marcada como aplicada en la versión anterior. Confirma si llegaste a enviarla.' }] };
  }
  ST.migrado = true;
  guardarST();
}

async function cargar() {
  try {
    const [ops, meta, senales] = await Promise.all([
      fetch('data/oportunidades.json', { cache: 'no-store' }).then((r) => r.json()),
      fetch('data/meta.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch('data/empresas.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    ]);
    D.ops = ops; D.meta = meta; D.senales = senales;
    ops.forEach((o) => D.porId.set(o.id, o));
    migrarAntiguas();
    $('#actualizado').textContent = meta.actualizado ? 'Actualizado ' + new Date(meta.actualizado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
    sugerencias();
    opcionesAvanzadas();
    contadorGuardados();
    ruta();
  } catch (e) {
    $('#rejilla').replaceChildren(el('p', 'vacio', 'No se han podido cargar las oportunidades. Recarga la página en unos minutos.'));
  }
}

/* ---------- filtros ---------- */
const F = { que: '', donde: '', modalidad: '', tipo: '', rapidos: new Set(), subtipos: new Set(), fuentes: new Set(), confianza: new Set(), estados: new Set(), minimo: 0 };
let VISTA = 'explorar', MODO = 'rejilla', ORDEN = 'relevancia';

function texto(o) {
  return o._t || (o._t = norm([o.titulo, o.organizacion.nombre, o.cliente, (o.etiquetas || []).join(' '), o.ubicacion.texto, o.ubicacion.comunidad,
    SUBTIPOS[o.subtipo]?.nombre, o.fuentes.map((f) => f.nombre).join(' '), (o.candidatas || []).map((c) => c.empresa).join(' ')].join(' ')));
}
const conContacto = (o) => Boolean(o.contacto?.email || (o.candidatas || []).some((c) => c.email));

function pasa(o, sinTipo) {
  const p = puntuar(o);
  const tipo = VISTAS[VISTA].tipo || F.tipo;
  if (!sinTipo && tipo && o.tipo !== tipo) return false;
  if (F.que) { const t = texto(o); if (!norm(F.que).split(/\s+/).filter(Boolean).every((w) => t.includes(w))) return false; }
  if (F.donde === 'asturias' && o.ubicacion.comunidad !== 'Asturias') return false;
  if (F.donde === 'norte' && !NORTE.includes(o.ubicacion.comunidad)) return false;
  if (F.donde === 'remoto' && o.modalidad !== 'remoto') return false;
  if (F.modalidad && o.modalidad !== F.modalidad) return false;
  for (const r of F.rapidos) {
    if (r === 'remoto' && o.modalidad !== 'remoto') return false;
    if (r === 'asturias' && o.ubicacion.comunidad !== 'Asturias') return false;
    if (r === 'alto' && p.total < 70) return false;
    if (r === 'contacto' && !conContacto(o)) return false;
    if (r === 'nuevas' && !(dias(o.fechas.publicada) != null && dias(o.fechas.publicada) <= 7)) return false;
    if (r === 'plazo' && !(o.fechas.plazo && o.fechas.plazo >= hoyISO())) return false;
    if (r === 'salario' && !o.salario?.texto) return false;
  }
  if (F.subtipos.size && !F.subtipos.has(o.subtipo)) return false;
  if (F.fuentes.size && !o.fuentes.some((f) => F.fuentes.has(f.nombre))) return false;
  if (F.confianza.size && !F.confianza.has(o.confianza)) return false;
  if (F.minimo && p.total < F.minimo) return false;
  if (F.estados.size) {
    const e = ST.est[o.id]?.estado || 'sin';
    if (!(F.estados.has(e) || (F.estados.has('guardada') && ST.fav[o.id]))) return false;
  }
  if (VISTA === 'guardados' && !ST.fav[o.id] && !ST.est[o.id]) return false;
  if (VISTA !== 'guardados' && !F.estados.size && (ST.est[o.id]?.estado === 'descartada' || ST.ocultas[o.id])) return false;
  return true;
}

function ordenar(lista) {
  const fpub = (o) => o.fechas.publicada || '';
  const cmp = {
    relevancia: (a, b) => puntuar(b).total - puntuar(a).total || fpub(b).localeCompare(fpub(a)),
    encaje: (a, b) => (b.criterios.encaje.valor ?? 0) - (a.criterios.encaje.valor ?? 0) || puntuar(b).total - puntuar(a).total,
    recientes: (a, b) => fpub(b).localeCompare(fpub(a)) || puntuar(b).total - puntuar(a).total,
    plazo: (a, b) => (a.fechas.plazo || '9999').localeCompare(b.fechas.plazo || '9999') || puntuar(b).total - puntuar(a).total,
  }[ORDEN];
  return lista.sort(cmp);
}

const RAPIDOS = { remoto: 'Remoto', asturias: 'Asturias', alto: 'Encaje alto (70+)', contacto: 'Con contacto', nuevas: 'Últimos 7 días', plazo: 'Plazo abierto', salario: 'Con salario' };
const DONDE = { asturias: 'Asturias', norte: 'Norte de España', remoto: 'En remoto' };

function etiquetasActivas() {
  const t = [];
  if (F.que) t.push([`«${F.que}»`, () => { F.que = ''; $('#q-que').value = ''; }]);
  if (F.donde) t.push([DONDE[F.donde], () => { F.donde = ''; $('#q-donde').value = ''; }]);
  if (F.modalidad) t.push([MODALIDAD[F.modalidad], () => { F.modalidad = ''; $('#q-modalidad').value = ''; }]);
  if (F.tipo && !VISTAS[VISTA].tipo) t.push([F.tipo === 'empleo' ? 'Empleo' : 'Proyectos', () => { F.tipo = ''; $('#q-tipo').value = ''; }]);
  F.rapidos.forEach((r) => t.push([RAPIDOS[r], () => F.rapidos.delete(r)]));
  F.subtipos.forEach((s) => t.push([SUBTIPOS[s].nombre, () => F.subtipos.delete(s)]));
  F.fuentes.forEach((s) => t.push([s, () => F.fuentes.delete(s)]));
  F.confianza.forEach((s) => t.push(['Confianza ' + s, () => F.confianza.delete(s)]));
  F.estados.forEach((s) => t.push([s === 'guardada' ? 'Guardadas' : s === 'sin' ? 'Sin estado' : NOMBRE_ESTADO[s], () => F.estados.delete(s)]));
  if (F.minimo) t.push([`Encaje ${F.minimo}+`, () => { F.minimo = 0; }]);
  return t;
}

function pintarActivos() {
  const cont = $('#activos');
  const t = etiquetasActivas();
  cont.replaceChildren();
  if (ST.busq.length) {
    const g = el('div', 'busq');
    g.append(el('span', 'etq', 'Tus búsquedas'));
    ST.busq.forEach((b, i) => {
      const c = boton(b.nombre, 'chip suave', () => { aplicarBusqueda(b.f); });
      const x = boton('✕', 'chip-x', () => { ST.busq.splice(i, 1); guardarST(); pintarActivos(); });
      x.setAttribute('aria-label', 'Borrar búsqueda ' + b.nombre);
      const w = el('span', 'busq-i'); w.append(c, x); g.append(w);
    });
    cont.append(g);
  }
  if (!t.length) return;
  const fila = el('div', 'activos-fila');
  t.forEach(([txt, quitar]) => {
    const b = boton(txt + ' ✕', 'tag-activo', () => { quitar(); sincronizarChips(); pintar(); });
    b.setAttribute('aria-label', 'Quitar filtro ' + txt);
    fila.append(b);
  });
  fila.append(boton('Limpiar todo', 'enlace', () => { limpiar(); pintar(); }));
  fila.append(boton('Guardar esta búsqueda', 'enlace', () => {
    ST.busq.push({ nombre: t.map((x) => x[0]).join(' · ').slice(0, 60), f: volcar() });
    guardarST(); pintarActivos();
  }));
  cont.append(fila);
}

function volcar() {
  return { que: F.que, donde: F.donde, modalidad: F.modalidad, tipo: F.tipo, rapidos: [...F.rapidos], subtipos: [...F.subtipos], fuentes: [...F.fuentes], confianza: [...F.confianza], estados: [...F.estados], minimo: F.minimo };
}
function aplicarBusqueda(b) {
  limpiar();
  Object.assign(F, { que: b.que, donde: b.donde, modalidad: b.modalidad, tipo: b.tipo, minimo: b.minimo, rapidos: new Set(b.rapidos), subtipos: new Set(b.subtipos), fuentes: new Set(b.fuentes), confianza: new Set(b.confianza), estados: new Set(b.estados) });
  $('#q-que').value = F.que; $('#q-donde').value = F.donde; $('#q-modalidad').value = F.modalidad; $('#q-tipo').value = F.tipo;
  sincronizarChips(); pintar();
}
function limpiar() {
  Object.assign(F, { que: '', donde: '', modalidad: '', tipo: '', minimo: 0 });
  ['rapidos', 'subtipos', 'fuentes', 'confianza', 'estados'].forEach((k) => F[k].clear());
  ['#q-que', '#q-donde', '#q-modalidad', '#q-tipo'].forEach((s) => { $(s).value = ''; });
  sincronizarChips();
}
function sincronizarChips() {
  $$('#rapidos .chip[data-f]').forEach((c) => { const on = F.rapidos.has(c.dataset.f); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  $$('#filtros input[type=checkbox]').forEach((i) => { i.checked = F[i.name].has(i.value); });
  $('#f-minimo').value = F.minimo; $('#f-minimo-v').textContent = F.minimo;
  const n = F.subtipos.size + F.fuentes.size + F.confianza.size + F.estados.size + (F.minimo ? 1 : 0);
  $('#abrir-filtros').classList.toggle('on', n > 0);
}

function opcionesAvanzadas() {
  const grupo = (id, name, items) => $(id).replaceChildren(...items.map(([v, t]) => {
    const l = el('label', 'op'); const i = el('input'); i.type = 'checkbox'; i.name = name; i.value = v;
    i.addEventListener('change', () => { if (i.checked) F[name].add(v); else F[name].delete(v); sincronizarChips(); pintar(); });
    l.append(i, ' ', t); return l;
  }));
  const cuenta = (fn) => (v) => D.ops.filter((o) => fn(o, v)).length;
  const nSub = cuenta((o, v) => o.subtipo === v);
  grupo('#f-subtipo', 'subtipos', Object.entries(SUBTIPOS).filter(([k]) => nSub(k)).map(([k, s]) => [k, `${s.nombre} (${nSub(k)})`]));
  const fuentes = [...new Set(D.ops.flatMap((o) => o.fuentes.map((f) => f.nombre)))].filter(Boolean).sort();
  const nF = cuenta((o, v) => o.fuentes.some((f) => f.nombre === v));
  grupo('#f-fuente', 'fuentes', fuentes.map((f) => [f, `${f} (${nF(f)})`]));
  grupo('#f-confianza', 'confianza', [['alta', 'Alta: casi todos los datos confirmados'], ['media', 'Media: algún dato inferido o sin modalidad'], ['baja', 'Baja: faltan varios datos']]);
  grupo('#f-estado', 'estados', [['guardada', 'Guardadas'], ['sin', 'Sin estado'], ...ESTADOS]);
}

function sugerencias() {
  const s = new Set();
  D.ops.forEach((o) => { (o.etiquetas || []).forEach((t) => { if (t.length > 3 && !/^(cpv|es\d)/i.test(t)) s.add(t); }); if (o.tipo === 'empleo' && o.organizacion.nombre) s.add(o.organizacion.nombre); });
  ['Project Manager', 'jefe de proyecto', 'PMO', 'museografía', 'LiDAR', 'batimetría', 'inteligencia artificial', 'gemelo digital'].forEach((x) => s.add(x));
  $('#sugerencias').replaceChildren(...[...s].sort().slice(0, 200).map((t) => { const o = el('option'); o.value = t; return o; }));
}

/* ---------- tarjetas ---------- */
function visual(o, grande) {
  const v = el('div', 'visual ' + (SUBTIPOS[o.subtipo]?.clase || ''));
  const h = hash(o.organizacion.nombre || o.titulo);
  v.style.setProperty('--x', (h % 70 + 15) + '%');
  v.style.setProperty('--y', ((h >> 8) % 60 + 20) + '%');
  v.style.setProperty('--r', ((h >> 16) % 30 + 22) + 'px');
  v.append(el('span', 'tipo-badge', SUBTIPOS[o.subtipo]?.nombre || o.tipo));
  v.append(el('span', 'ini' + (grande ? ' grande' : ''), iniciales(o.organizacion.nombre || o.titulo)));
  return v;
}

function botonFav(o) {
  const b = el('button', 'fav' + (ST.fav[o.id] ? ' on' : ''));
  b.type = 'button';
  b.setAttribute('aria-pressed', ST.fav[o.id] ? 'true' : 'false');
  b.setAttribute('aria-label', (ST.fav[o.id] ? 'Quitar de guardados: ' : 'Guardar: ') + o.titulo);
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.1C1.4 8 3.5 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.5 0 5.6 3.5 4.3 6.9-1.8 4.5-9.3 9.1-9.3 9.1z"/></svg>';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFav(o.id);
    const on = Boolean(ST.fav[o.id]);
    $$(`.fav[data-id="${CSS.escape(o.id)}"]`).forEach((x) => { x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    if (VISTA === 'guardados') pintar();
  });
  b.dataset.id = o.id;
  return b;
}

function frescura(o) {
  if (o.fechas.plazo) {
    const q = -dias(o.fechas.plazo);
    return q < 0 ? 'plazo cerrado' : q === 0 ? 'cierra hoy' : `cierra en ${q} día${q === 1 ? '' : 's'}`;
  }
  const d = dias(o.fechas.publicada);
  if (d == null) return '';
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}

function lugarCorto(o) {
  let t = o.ubicacion.texto && o.ubicacion.texto.length < 50 ? o.ubicacion.texto : o.ubicacion.comunidad || '';
  t = [...new Set(t.split(/\s*,\s*/).filter(Boolean))].join(', ');
  const mod = o.modalidad !== 'desconocida' && !norm(t).includes(norm(MODALIDAD[o.modalidad]).slice(0, 5)) ? MODALIDAD[o.modalidad] : '';
  return [t, mod].filter(Boolean).join(' · ');
}

function tarjeta(o) {
  const p = puntuar(o);
  const a = el('article', 'tarjeta');
  a.tabIndex = 0;
  a.setAttribute('role', 'button');
  a.setAttribute('aria-label', `${SUBTIPOS[o.subtipo]?.nombre}: ${o.titulo}. ${o.organizacion.nombre}. Encaje ${p.total}.`);
  const vis = visual(o);
  vis.append(botonFav(o));
  const c = el('div', 'cuerpo');
  c.append(el('h3', null, o.titulo));
  if (o.organizacion.nombre) c.append(el('p', 'org', o.organizacion.nombre));
  const lugar = lugarCorto(o);
  if (lugar) c.append(el('p', 'lugar', lugar));
  const extra = o.salario?.texto || (o.importe ? eur(o.importe) + (o.subtipo === 'adjudicacion' ? ' adjudicados' : ' de licitación') : o.subtipo === 'oferta' ? 'Salario no especificado' : '');
  if (extra) c.append(el('p', 'extra', extra));
  const raz = razones(o);
  if (raz.length) { const ul = el('ul', 'razones'); raz.forEach((r) => ul.append(el('li', null, r))); c.append(ul); }
  const pie = el('div', 'pie-t');
  const nota = el('span', 'nota-encaje ' + (p.total >= 75 ? 'alta' : p.total >= 60 ? 'media' : 'baja'));
  nota.title = 'Compatibilidad estimada con tu perfil. No es una probabilidad de contratación.';
  nota.append(el('b', null, String(p.total)), ' compatibilidad');
  pie.append(nota, el('span', 'conf conf-' + o.confianza, 'confianza ' + o.confianza));
  const fr = frescura(o);
  if (fr) pie.append(el('span', 'fresco' + (/cierra (hoy|en [1-3] )/.test(fr) ? ' urge' : ''), fr));
  c.append(pie);
  c.append(el('span', 'naturaleza' + (o.verificacion === 'vacante_confirmada' ? '' : ' potencial'), [NATURALEZA[o.verificacion], o.fuentes[0]?.nombre].filter(Boolean).join(' · ')));
  const est = ST.est[o.id];
  if (est) c.append(el('span', 'estado-chip e-' + est.estado, NOMBRE_ESTADO[est.estado]));
  const acc = el('div', 'acc-t');
  const bI = boton(est?.estado === 'interes' ? '✓ Me interesa' : 'Me interesa', 'b-int' + (est?.estado === 'interes' ? ' on' : ''), (e) => {
    e.stopPropagation();
    if (ST.est[o.id]?.estado === 'interes') { delete ST.est[o.id]; guardarST(); } else setEstado(o.id, 'interes', 'Solo queda registrado en RADAR: la empresa no recibe nada.');
    pintar();
  });
  bI.title = 'Lo apunta en tus candidaturas. No se comunica a la empresa.';
  const bN = boton('No me interesa', 'b-no', (e) => { e.stopPropagation(); setEstado(o.id, 'descartada', 'Descartada desde la tarjeta'); pintar(); });
  bN.title = 'La oculta de Explorar. La recuperas en Guardados.';
  acc.append(bI, bN);
  c.append(acc);
  a.append(vis, c);
  const abrir = () => abrirFicha(o.id);
  a.addEventListener('click', abrir);
  a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  return a;
}

function razones(o) {
  const out = [];
  const cr = Object.fromEntries(puntuar(o).partes.map((x) => [x.k, x]));
  const enc = cr.encaje;
  (enc.motivos || []).slice(0, 2).forEach((m) => out.push(m.replace(/^(puesto|tema): /, '').replace(/^./, (c) => c.toUpperCase())));
  const geo = cr.geografia;
  if (geo.valor >= 0.6 && geo.motivos?.[0]) out.push(geo.motivos[0].replace(/^./, (c) => c.toUpperCase()));
  else if (o.criterios.necesidad.valor >= 0.75 && o.subtipo !== 'oferta') out.push(o.criterios.necesidad.motivos.at(-1).replace(/^./, (c) => c.toUpperCase()));
  return out.slice(0, 3);
}

/* ---------- vistas ---------- */
function pintar() {
  pintarActivos();
  const v = VISTAS[VISTA];
  $('#titulo-vista').textContent = v.titulo;
  $('#intro').textContent = v.intro;
  $('#campo-tipo').hidden = Boolean(v.tipo) || VISTA === 'empresas';
  $('#atajos').hidden = VISTA !== 'empleo';
  if (VISTA === 'empleo' && !$('#atajos').childNodes.length) {
    $('#atajos').append(el('span', 'etq', 'Buscar también en (24 h)'),
      enlace('https://www.linkedin.com/jobs/search/?keywords=project%20manager&location=Asturias%2C%20Espa%C3%B1a&f_TPR=r86400', 'LinkedIn · Asturias', 'btn sec mini'),
      enlace('https://www.linkedin.com/jobs/search/?keywords=project%20manager&location=Espa%C3%B1a&f_WT=2&f_TPR=r86400', 'LinkedIn · remoto', 'btn sec mini'),
      enlace('https://es.indeed.com/jobs?q=project+manager&l=Asturias&fromage=1', 'Indeed · Asturias', 'btn sec mini'),
      enlace('https://www.infojobs.net/jobsearch/search-results/list.xhtml?keyword=project%20manager&sinceDate=_24_HOURS', 'InfoJobs', 'btn sec mini'),
      enlace('https://www.tecnoempleo.com/ofertas-trabajo/?te=project+manager', 'Tecnoempleo', 'btn sec mini'));
  }
  if (VISTA === 'empresas') { $('#mejores').hidden = true; return pintarEmpresas(); }
  if (VISTA === 'descubrir') { $('#mejores').hidden = true; $('#rejilla').hidden = false; $('#vista-mapa').hidden = true; return pintarDescubrir(); }
  if (VISTA === 'perfil') { $('#mejores').hidden = true; $('#rejilla').hidden = false; $('#vista-mapa').hidden = true; return pintarPerfil(); }
  if (VISTA === 'guardados') { $('#mejores').hidden = true; $('#rejilla').hidden = false; $('#vista-mapa').hidden = true; return pintarGuardados(); }
  const lista = ordenar(D.ops.filter((o) => pasa(o)));
  const total = D.ops.filter((o) => pasa(o, false) || true).length;
  $('#res-n').textContent = `${lista.length} de ${D.ops.filter((o) => !v.tipo || o.tipo === v.tipo).length} oportunidades`;
  const verMapa = MODO === 'mapa' || VISTA === 'mapa';
  $('#rejilla').hidden = verMapa;
  $('#vista-mapa').hidden = !verMapa;
  $$('.vista-btns button').forEach((b) => { const on = b.dataset.vista === (verMapa ? 'mapa' : 'rejilla'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if (verMapa) { $('#mejores').hidden = true; return pintarVistaMapa(lista); }
  const rej = $('#rejilla');
  if (!lista.length) {
    const vacio = el('div', 'vacio');
    vacio.append(el('p', null, VISTA === 'guardados' ? 'Todavía no has guardado nada. Pulsa el corazón de una tarjeta para guardarla.' : 'Ninguna oportunidad cumple todos estos filtros.'));
    if (etiquetasActivas().length) vacio.append(boton('Quitar todos los filtros', 'btn', () => { limpiar(); pintar(); }));
    rej.replaceChildren(vacio);
    return void total;
  }
  rej.replaceChildren(...lista.map(tarjeta));
  const mej = $('#mejores');
  const sinFiltros = !etiquetasActivas().length;
  if (VISTA === 'explorar' && sinFiltros && ORDEN === 'relevancia') {
    const top = lista.filter((o) => puntuar(o).total >= 70 && o.verificacion === 'vacante_confirmada').slice(0, 4);
    const pot = lista.filter((o) => puntuar(o).total >= 70 && o.verificacion !== 'vacante_confirmada').slice(0, 4);
    mej.replaceChildren();
    if (top.length) {
      mej.append(el('h3', null, 'Tus mejores matches'), el('p', null, 'Vacantes publicadas con mayor compatibilidad estimada. Abre una para ver por qué encaja y qué falta.'));
      const r = el('div', 'rejilla'); top.forEach((o) => r.append(tarjeta(o))); mej.append(r);
    }
    if (pot.length) {
      const h = el('h3', null, 'Oportunidades potenciales · no publicadas'); h.style.marginTop = '26px';
      mej.append(h, el('p', null, 'Proyectos que alguien tendrá que dirigir. No son vacantes: son un buen motivo para presentarte.'));
      const r = el('div', 'rejilla'); pot.forEach((o) => r.append(tarjeta(o))); mej.append(r);
    }
    if (mej.childNodes.length) { const h = el('h3', null, 'Todas las oportunidades'); h.style.marginTop = '30px'; mej.append(h); }
    mej.hidden = !mej.childNodes.length;
  } else mej.hidden = true;
}

function pintarVistaMapa(lista) {
  $('#mini-lista').replaceChildren(...lista.slice(0, 40).map((o) => {
    const li = el('li');
    const b = boton('', 'mini', () => abrirFicha(o.id));
    b.append(el('b', null, String(puntuar(o).total)), el('span', 'mini-t', o.titulo), el('small', null, [SUBTIPOS[o.subtipo]?.nombre, o.organizacion.nombre].filter(Boolean).join(' · ')));
    li.append(b);
    return li;
  }));
  $('#leyenda').replaceChildren(...Object.entries(TIPOS_MAPA).map(([, t]) => { const s = el('span', 'ley'); const p = el('i'); p.style.background = t.color; s.append(p, t.nombre); return s; }));
  pintarMapa(lista, (sin) => {
    const p = $('#mapa-sin');
    p.textContent = sin.length ? `${sin.length} sin marcador (remotas, de ámbito estatal o sin ubicación fiable): están en la lista.` : '';
  });
}

function pintarEmpresas() {
  $('#rejilla').hidden = false; $('#vista-mapa').hidden = true;
  const emp = new Map();
  const clave = (nombre, nif) => nif || norm(nombre).replace(/[^a-z0-9]/g, '');
  D.ops.forEach((o) => {
    if (o.subtipo === 'adjudicacion') {
      const k = clave(o.organizacion.nombre, o.organizacion.nif);
      const e = emp.get(k) || { nombre: o.organizacion.nombre, nif: o.organizacion.nif, ciudad: o.ciudad_empresa, contacto: o.contacto, ganados: [], candidata: [], importe: 0 };
      e.ganados.push(o); e.importe += o.importe || 0;
      if (o.contacto?.email) e.contacto = o.contacto;
      emp.set(k, e);
    }
    if (o.subtipo === 'licitacion_abierta') {
      (o.candidatas || []).forEach((c) => {
        const k = clave(c.empresa, c.nif);
        const e = emp.get(k) || { nombre: c.empresa, nif: c.nif, ciudad: c.ciudad_empresa, contacto: c.email ? { email: c.email, web: c.web } : null, ganados: [], candidata: [], importe: 0 };
        e.candidata.push(o);
        emp.set(k, e);
      });
    }
  });
  const claveE = (n) => norm(n).replace(/\b(sociedad limitada( unipersonal)?|sociedad anonima|s\.?l\.?u?|s\.?a\.?u?)\.?$/g, '').replace(/[^a-z0-9]/g, '');
  const porNombre = new Map([...emp.values()].map((e) => [claveE(e.nombre), e]));
  D.senales.forEach((g) => {
    const k = claveE(g.empresa_radar || g.empresa);
    let e = porNombre.get(k);
    if (!e) {
      if (g.tipo !== 'constitucion') return;
      e = { nombre: g.empresa, ciudad: [g.municipio, g.provincia].filter(Boolean).join(', '), contacto: null, ganados: [], candidata: [], importe: 0, nueva: true };
      emp.set('borme:' + g.id, e); porNombre.set(k, e);
    }
    (e.borme = e.borme || []).push(g);
  });
  const t = norm(F.que);
  const lista = [...emp.values()]
    .filter((e) => !t || norm(e.nombre + ' ' + e.ganados.map((g) => g.titulo).join(' ')).includes(t))
    .filter((e) => !F.rapidos.has('contacto') || e.contacto?.email)
    .filter((e) => !F.rapidos.has('asturias') && F.donde !== 'asturias' || e.ganados.some((g) => g.ubicacion.comunidad === 'Asturias'))
    .sort((a, b) => peso(b) - peso(a));
  function peso(e) { return e.ganados.length * 2 + e.candidata.length + (e.contacto?.email ? 1 : 0) + (e.borme || []).filter((g) => g.categoria === 'crecimiento').length * 2 + (e.nueva ? Math.max(...e.borme.map((g) => g.puntuacion)) / 40 : 0); }
  $('#res-n').textContent = `${lista.length} empresas con señales`;
  $('#rejilla').replaceChildren(...lista.slice(0, 60).map(tarjetaEmpresa));
}

function tarjetaEmpresa(e) {
  const a = el('article', 'tarjeta empresa');
  a.tabIndex = 0; a.setAttribute('role', 'button');
  const pseudo = { subtipo: 'empresa', organizacion: { nombre: e.nombre }, titulo: e.nombre };
  const vis = visual(pseudo);
  vis.className = 'visual t-empresa';
  vis.querySelector('.tipo-badge').textContent = 'Empresa';
  const c = el('div', 'cuerpo');
  c.append(el('h3', null, e.nombre));
  if (e.ciudad) c.append(el('p', 'lugar', e.ciudad));
  const ul = el('ul', 'senales');
  if (e.ganados.length) ul.append(el('li', 'hecho', `Ha ganado ${e.ganados.length} contrato${e.ganados.length > 1 ? 's' : ''} de tu perfil${e.importe ? ` (${eur(e.importe)})` : ''}`));
  if (e.candidata.length) ul.append(el('li', 'inferido', `Suele ganar contratos como ${e.candidata.length} licitación${e.candidata.length > 1 ? 'es' : ''} abierta${e.candidata.length > 1 ? 's' : ''} ahora`));
  (e.borme || []).slice(0, 3).forEach((g) => ul.append(el('li', g.categoria === 'aviso' ? 'aviso' : 'hecho', g.tipo === 'constitucion' ? `Empresa constituida (BORME, ${fecha(g.fecha)})` : `${g.titulo} (BORME, ${fecha(g.fecha)})`)));
  ul.append(el('li', e.contacto?.email ? 'hecho' : 'desconocido', e.contacto?.email ? 'Correo verificado en su web oficial' : 'Sin correo verificado'));
  c.append(ul);
  c.append(el('p', 'hipotesis', e.nueva ? 'Hipótesis: al empezar podría necesitar perfiles como el tuyo.' : 'Hipótesis: podría necesitar dirección de proyecto para ejecutarlos.'));
  a.append(vis, c);
  const abrir = () => abrirEmpresa(e);
  a.addEventListener('click', abrir);
  a.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } });
  return a;
}

/* ---------- ficha ---------- */
function filaDato(d) {
  const tr = el('tr');
  tr.append(el('th', null, d.campo));
  const td = el('td');
  const v = d.valor == null || d.valor === '' ? 'Sin información' : typeof d.valor === 'number' ? eur(d.valor) : /^\d{4}-\d{2}-\d{2}/.test(d.valor) ? fecha(d.valor) : String(d.valor);
  td.append(el('span', null, v), ' ', el('span', 'origen o-' + (d.valor == null || d.valor === '' ? 'desconocido' : d.origen), d.valor == null || d.valor === '' ? 'sin dato' : d.origen === 'inferido' ? 'inferido' : d.origen === 'desconocido' ? 'sin dato' : 'confirmado'));
  tr.append(td);
  return tr;
}

function desglose(o) {
  const p = puntuar(o);
  const box = el('div', 'desglose');
  p.partes.forEach((x) => {
    const fila = el('div', 'crit' + (x.valor == null ? ' sin' : ''));
    const cab = el('div', 'crit-cab');
    cab.append(el('span', null, CRITERIOS[x.k]), el('span', 'crit-v', x.valor == null ? 'sin información' : `${Math.round(x.valor * 100)} / 100 · peso ${x.peso}%`));
    const barra = el('div', 'barra'); const i = el('i'); i.style.width = (x.valor == null ? 0 : x.valor * 100) + '%'; barra.append(i);
    fila.append(cab, barra);
    if (x.motivos?.length) fila.append(el('p', 'crit-m', x.motivos.join(' · ')));
    else if (x.valor == null) fila.append(el('p', 'crit-m', 'No hay datos: no resta puntos, pero baja la confianza.'));
    box.append(fila);
  });
  return box;
}

function analisis(o) {
  const box = el('div', 'analisis');
  const bloque = (titulo, items, vacio) => {
    const d = el('div'); d.append(el('h4', null, titulo));
    const ul = el('ul'); (items.length ? items : [vacio]).forEach((t) => ul.append(el('li', null, t))); d.append(ul); return d;
  };
  const c = Object.fromEntries(puntuar(o).partes.map((x) => [x.k, x]));
  const fuertes = [...(c.encaje.motivos || []), ...(c.geografia.valor >= 0.6 ? c.geografia.motivos : []), ...(c.acceso.valor >= 0.7 ? c.acceso.motivos : [])];
  const dudas = [...(c.acceso.valor < 0.7 ? c.acceso.motivos : []), ...(c.geografia.valor != null && c.geografia.valor < 0.6 ? c.geografia.motivos : [])];
  const sin = Object.entries(c).filter(([, x]) => x.valor == null).map(([k]) => CRITERIOS[k]);
  box.append(bloque('Por qué encaja', fuertes.map((m) => m.replace(/^./, (x) => x.toUpperCase())), 'No hay coincidencias claras con tu perfil.'));
  box.append(bloque('Qué conviene comprobar o no coincide', dudas.map((m) => m.replace(/^./, (x) => x.toUpperCase())), 'Nada destacable con los datos disponibles.'));
  if (sin.length) box.append(bloque('Sin información', sin, ''));
  return box;
}

function seccionPropuesta(o) {
  const s = el('section', 'propuesta'); s.id = 'fi-propuesta';
  const cab = el('div', 'prop-cab');
  cab.append(el('h3', null, 'Tu propuesta de valor'));
  const estadoP = el('span', 'prop-estado');
  cab.append(estadoP);
  s.append(cab);
  s.append(el('p', 'nota', 'Hecha solo con datos de tu CV: cada aportación indica de qué experiencia sale, y si no hay experiencia que la respalde no aparece. No se comparte con nadie: revísala, edítala y apruébala antes de usarla.'));
  const cuerpo = el('div', 'prop-cuerpo');
  const area = el('textarea', 'prop-texto'); area.rows = 16; area.hidden = true;
  area.setAttribute('aria-label', 'Editar la propuesta de valor');
  s.append(cuerpo, area);
  const acc = el('div', 'acciones');
  s.append(acc);

  const generada = () => construirPropuesta(o);
  const pintarP = () => {
    const g = ST.prop[o.id];
    cuerpo.replaceChildren();
    estadoP.textContent = g?.aprobada ? 'Aprobada el ' + new Date(g.f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : g ? 'Editada · sin aprobar' : 'Borrador · sin aprobar';
    estadoP.className = 'prop-estado ' + (g?.aprobada ? 'ok' : 'pend');
    if (g) { cuerpo.append(el('pre', 'prop-pre', g.texto)); return; }
    const p = generada();
    const bloque = (titulo, items, f) => {
      const d = el('div', 'prop-b'); d.append(el('h4', null, titulo));
      const ul = el('ul'); items.forEach((x) => ul.append(f(x))); d.append(ul); return d;
    };
    cuerpo.append(el('p', 'prop-resumen', p.resumen));
    if (p.aportaciones.length) cuerpo.append(bloque('Qué podría aportar', p.aportaciones, (a) => { const li = el('li', null, a.t + ' '); const c = el('span', 'cita', a.cita); c.title = 'Del CV: ' + a.evidencia; li.append(c); return li; }));
    cuerpo.append(bloque('Capacidades transferibles', p.transferibles, ([t, d]) => { const li = el('li', null, t + ' '); li.append(el('span', 'cita', d)); return li; }));
    cuerpo.append(bloque('Desde el primer día', p.inicio, (t) => el('li', null, t)));
    cuerpo.append(bloque('A validar en una conversación', p.validar.length ? p.validar : ['Nada destacable con los datos disponibles'], (t) => el('li', null, t)));
  };
  const editar = boton('Editar', 'btn sec mini', () => {
    if (area.hidden) {
      area.value = ST.prop[o.id]?.texto || propuestaATexto(generada());
      area.hidden = false; cuerpo.hidden = true; editar.textContent = 'Guardar cambios';
      area.focus();
    } else {
      ST.prop[o.id] = { texto: area.value, f: new Date().toISOString(), aprobada: false };
      guardarST(); area.hidden = true; cuerpo.hidden = false; editar.textContent = 'Editar'; pintarP();
    }
  });
  const aprobar = boton('Aprobar esta versión', 'btn mini', () => {
    const texto = !area.hidden ? area.value : ST.prop[o.id]?.texto || propuestaATexto(generada());
    ST.prop[o.id] = { texto, f: new Date().toISOString(), aprobada: true };
    guardarST(); area.hidden = true; cuerpo.hidden = false; editar.textContent = 'Editar'; pintarP();
  });
  const copiarB = boton('Copiar', 'btn sec mini', function () { copiar(this, ST.prop[o.id]?.texto || propuestaATexto(generada())); });
  const rehacer = boton('Volver a generar', 'enlace', () => { delete ST.prop[o.id]; guardarST(); area.hidden = true; cuerpo.hidden = false; editar.textContent = 'Editar'; pintarP(); });
  acc.append(aprobar, editar, copiarB, rehacer);
  pintarP();
  return s;
}

function abrirFicha(id) {
  const o = D.porId.get(id);
  if (!o) return;
  const p = puntuar(o);
  const cuerpo = $('#ficha-cuerpo');
  cuerpo.replaceChildren();
  const cab = visual(o, true);
  cab.classList.add('ficha-visual');
  cuerpo.append(cab);
  const g = el('div', 'ficha-grid');
  const izq = el('div', 'ficha-izq');
  const der = el('aside', 'ficha-der');

  izq.append(el('p', 'eyebrow', SUBTIPOS[o.subtipo]?.nombre));
  const h = el('h2', null, o.titulo); h.id = 'fi-titulo'; izq.append(h);
  const sub = [o.organizacion.nombre, o.cliente && o.cliente !== o.organizacion.nombre ? 'para ' + o.cliente : '', lugarCorto(o)].filter(Boolean).join(' · ');
  izq.append(el('p', 'ficha-sub', sub));
  if (o.resolucion) izq.append(el('p', 'ficha-res', o.resolucion));

  izq.append(el('h3', null, 'Datos'));
  const tb = el('table', 'datos'); const tbody = el('tbody');
  o.datos.forEach((d) => tbody.append(filaDato(d)));
  tb.append(tbody); izq.append(tb);

  if (o.descripcion) {
    izq.append(el('h3', null, 'Descripción'));
    const d = el('p', 'descripcion', o.descripcion.length >= 590 ? o.descripcion + '…' : o.descripcion);
    izq.append(d, el('p', 'nota', 'Extracto publicado en ' + (o.fuentes[0]?.nombre || 'la fuente') + '. La oferta completa está en el enlace.'));
  }
  izq.append(el('h3', null, 'Análisis de encaje'));
  izq.append(analisis(o));
  izq.append(seccionPropuesta(o));
  izq.append(el('h3', null, 'Por qué RADAR la puntúa así'));
  izq.append(desglose(o));
  const faltan = p.partes.filter((x) => x.valor == null).map((x) => CRITERIOS[x.k].toLowerCase());
  const desconocidos = o.datos.filter((d) => d.origen === 'desconocido' || d.valor == null || d.valor === '').map((d) => d.campo.toLowerCase());
  if (faltan.length || desconocidos.length) izq.append(el('p', 'falta', 'Falta información sobre: ' + [...new Set([...faltan, ...desconocidos])].join(', ') + '. Por eso la confianza es ' + o.confianza + '.'));

  if (o.subtipo === 'licitacion_abierta' && o.candidatas?.length) {
    const s = el('section', 'candidatas'); s.id = 'fi-candidatas';
    s.append(el('h3', null, 'Empresas que suelen ganar contratos así'));
    s.append(el('p', 'nota', 'Inferido a partir de los contratos parecidos que han ganado. No sabemos si se presentarán a esta licitación.'));
    o.candidatas.forEach((c) => {
      const f = el('div', 'cand');
      const n = el('div'); n.append(el('b', null, c.empresa), el('small', null, [c.ciudad_empresa, c.email ? 'correo verificado' : 'sin correo verificado'].filter(Boolean).join(' · ')));
      f.append(n, boton('Ofrecerme', 'btn sec mini', () => abrirContacto(o, c)));
      s.append(f);
    });
    izq.append(s);
  }

  izq.append(el('h3', null, 'Fuentes'));
  const fu = el('ul', 'fuentes');
  o.fuentes.forEach((f) => { const li = el('li'); li.append(f.url ? enlace(f.url, f.nombre, 'enlace') : el('span', null, f.nombre), el('small', null, ' · consultada el ' + fecha(f.consultada))); fu.append(li); });
  izq.append(fu);

  // Panel de acción
  const nota = el('div', 'panel-nota');
  nota.append(el('b', 'n-' + (p.total >= 75 ? 'alta' : p.total >= 60 ? 'media' : 'baja'), String(p.total)), el('span', null, 'compatibilidad estimada con tu perfil · no es una probabilidad de contratación'));
  der.append(nota);
  der.append(el('p', 'conf conf-' + o.confianza, 'Confianza ' + o.confianza));
  der.append(el('p', 'verif v-' + o.verificacion, VERIF[o.verificacion] || ''));
  const acc = el('div', 'panel-acc');
  if (o.tipo === 'empleo') {
    if (o.accion.url) acc.append(enlace(o.accion.url, o.subtipo === 'oferta' ? 'Ver oferta e inscribirme' : 'Ver convocatoria y requisitos', 'btn grande'));
    acc.append(enlace(cvUrl(o.origen.lista, o.origen.clave), 'CV adaptado (PDF)'));
    acc.append(boton('Ver mi propuesta de valor', 'btn sec', () => $('#fi-propuesta')?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    acc.append(el('p', 'nota', 'Cuando te inscribas, marca abajo «Enviada». RADAR no lo marca solo.'));
  } else if (o.subtipo === 'senal_empresa') {
    acc.append(boton('Preparar presentación espontánea', 'btn grande', () => abrirContacto(o)));
    acc.append(enlace('https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(o.organizacion.nombre.replace(/,?\s*(SOCIEDAD LIMITADA|S\.?L\.?U?|S\.?A\.?)\.?$/i, '')), 'Buscar responsables en LinkedIn'));
    acc.append(enlace('https://www.google.com/search?q=' + encodeURIComponent(o.organizacion.nombre + ' ' + (o.ubicacion.texto || '')), 'Buscar su web'));
    if (o.accion.url) acc.append(enlace(o.accion.url, 'Ver el BORME'));
  } else if (o.subtipo === 'adjudicacion') {
    acc.append(boton('Preparar contacto con la empresa', 'btn grande', () => abrirContacto(o)));
    acc.append(enlace(cvUrl('adj', o.origen.clave), 'CV adaptado (PDF)'));
    if (o.accion.url) acc.append(enlace(o.accion.url, 'Ver la adjudicación'));
  } else {
    acc.append(boton('Analizar y ofrecerme a una empresa', 'btn grande', () => { $('#fi-candidatas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    if (o.accion.url) acc.append(enlace(o.accion.url, 'Ver licitación y pliegos'));
  }
  const fav = boton(ST.fav[o.id] ? '♥ Guardada' : '♡ Guardar', 'btn sec', () => { toggleFav(o.id); fav.textContent = ST.fav[o.id] ? '♥ Guardada' : '♡ Guardar'; pintar(); });
  const fila2 = el('div', 'acciones');
  fila2.append(fav, boton('Me interesa', 'btn sec', () => { setEstado(o.id, 'interes', 'Solo queda registrado en RADAR: la empresa no recibe nada.'); sel.value = 'interes'; historial(); pintar(); }),
    boton('No me interesa', 'btn sec', () => { setEstado(o.id, 'descartada', 'Descartada desde la ficha'); sel.value = 'descartada'; historial(); pintar(); }));
  acc.append(fila2);
  der.append(acc);
  der.append(selectorColecciones(o.id));

  const est = el('div', 'panel-est');
  const lab = el('label', null, 'Estado');
  const sel = el('select'); sel.append(new Option('Sin estado', ''));
  ESTADOS.forEach(([v, t]) => sel.append(new Option(t, v)));
  sel.value = ST.est[o.id]?.estado || '';
  sel.addEventListener('change', () => { if (sel.value) setEstado(o.id, sel.value); else { delete ST.est[o.id]; guardarST(); } historial(); pintar(); });
  lab.append(sel); est.append(lab);
  const hist = el('ol', 'historial');
  const historial = () => hist.replaceChildren(...(ST.est[o.id]?.hist || []).slice().reverse().map((x) => {
    const li = el('li'); li.append(el('b', null, NOMBRE_ESTADO[x.e] || x.e), ' · ' + new Date(x.f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }));
    if (x.nota) li.append(el('small', null, x.nota));
    return li;
  }));
  historial();
  est.append(hist);
  der.append(est);

  g.append(izq, der);
  cuerpo.append(g);
  const d = $('#ficha');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  history.replaceState(null, '', '#' + VISTA + '/o/' + encodeURIComponent(o.id));
  if (!ST.vistas[o.id]) { ST.vistas[o.id] = new Date().toISOString(); guardarST(); }
}

function abrirEmpresa(e) {
  const cuerpo = $('#ficha-cuerpo');
  cuerpo.replaceChildren();
  const vis = visual({ subtipo: 'empresa', organizacion: { nombre: e.nombre }, titulo: e.nombre }, true);
  vis.className = 'visual t-empresa ficha-visual';
  vis.querySelector('.tipo-badge').textContent = 'Empresa';
  cuerpo.append(vis);
  const g = el('div', 'ficha-grid'); const izq = el('div', 'ficha-izq'); const der = el('aside', 'ficha-der');
  izq.append(el('p', 'eyebrow', 'Empresa con señales'));
  const h = el('h2', null, e.nombre); h.id = 'fi-titulo'; izq.append(h);
  if (e.ciudad) izq.append(el('p', 'ficha-sub', e.ciudad));
  izq.append(el('h3', null, 'Señales observadas'));
  const ul = el('ul', 'senales grande');
  e.ganados.forEach((o) => { const li = el('li', 'hecho'); li.append(boton(`Ganó «${o.titulo.slice(0, 90)}»${o.importe ? ' · ' + eur(o.importe) : ''} · ${fecha(o.fechas.publicada)}`, 'enlace', () => abrirFicha(o.id))); ul.append(li); });
  e.candidata.forEach((o) => { const li = el('li', 'inferido'); li.append(boton(`Podría presentarse a «${o.titulo.slice(0, 90)}» (inferido)`, 'enlace', () => abrirFicha(o.id))); ul.append(li); });
  (e.borme || []).forEach((g) => {
    const li = el('li', g.categoria === 'aviso' ? 'aviso' : 'hecho');
    const txt = g.tipo === 'constitucion' ? `Constituida el ${fecha(g.fecha)} en ${g.municipio || g.provincia}. Objeto: ${(g.objeto || '').slice(0, 220)}` : `${g.titulo} inscrita el ${fecha(g.fecha)}${g.ampliacion ? ' (capital ' + g.ampliacion + ' €)' : ''}`;
    li.append(enlace(g.fuente.url, txt + ' · BORME', 'enlace'));
    ul.append(li);
  });
  izq.append(ul);
  izq.append(el('p', 'hipotesis', 'Hipótesis de RADAR, no un hecho: con estos proyectos podría necesitar reforzar la dirección de proyectos. No hay ninguna vacante confirmada.'));
  der.append(el('p', 'verif v-proyecto_adjudicado', 'Señal de empresa: no es una vacante'));
  const acc = el('div', 'panel-acc');
  const ref = e.ganados[0] || e.candidata[0] || (e.borme && D.ops.find((o) => o.origen.lista === 'senal' && e.borme.some((g) => g.id === o.origen.clave)));
  if (ref) acc.append(boton('Preparar presentación espontánea', 'btn grande', () => abrirContacto(ref, e.ganados[0] ? null : { empresa: e.nombre, email: e.contacto?.email, web: e.contacto?.web, ciudad_empresa: e.ciudad })));
  if (e.contacto?.web) acc.append(enlace(e.contacto.web, 'Web oficial'));
  acc.append(enlace('https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(e.nombre.replace(/,?\s*(S\.?L\.?U?|S\.?A\.?|UTE)\.?$/i, '') + ' proyectos'), 'Buscar responsables en LinkedIn'));
  der.append(acc);
  g.append(izq, der); cuerpo.append(g);
  const d = $('#ficha'); if (!d.open) d.showModal(); d.scrollTop = 0;
}

/* ---------- contacto (correo preparado) ---------- */
function tema(o) {
  const t = norm((o.etiquetas || []).join(' ') + ' ' + o.titulo);
  if (/fotogram|batimetr|lidar|nube|cartograf|topograf|ortofoto|dron|teledetec/.test(t)) return 'proyectos de batimetría, fotogrametría y procesamiento de nubes de puntos para el análisis 3D del territorio';
  if (/musealiz|museograf|exposici|museo|interpretacion|expositiv/.test(t)) return 'proyectos de musealización como el del Observatorio Marino del Puerto de Vigo (Atlántida) y el museo virtual del Parque Natural de Corrubedo';
  if (/inteligencia artificial|machine learning|aprendizaje|gemelo|digital twin|visor 3d/.test(t)) return 'proyectos de inteligencia artificial y gemelos digitales, como ForestScape 3D Analytics y la plataforma RURAL IA 3D';
  return 'proyectos de ingeniería, transformación digital e inteligencia artificial';
}
const firma = () => `Un saludo,\n${PERFIL.nombre}\n${PERFIL.email}\n${PERFIL.linkedin}`;
const corto = (s, n) => (s.length > n ? s.slice(0, n - 2).replace(/\s+\S*$/, '') + '…' : s);

function extraPropuesta(o) {
  const g = ST.prop[o.id];
  if (!g?.aprobada) return '';
  const a = aportacionesParaCorreo(g.texto);
  return a ? `\n\nEn concreto, podría aportar:\n${a}` : '';
}

function correo(o, empresa) {
  const extra = extraPropuesta(o);
  if (o.subtipo === 'senal_empresa') {
    const nueva = /^Empresa nueva/.test(o.titulo);
    const temas = (o.etiquetas || []).slice(0, 2).join(' y ');
    return {
      asunto: `Project Manager para ${nueva ? 'vuestros primeros proyectos' : 'vuestra nueva etapa'}`,
      cuerpo: `Hola, equipo de ${empresa}:\n\n${nueva ? `He visto en el BORME que acabáis de poner en marcha la empresa${temas ? `, con actividad en ${temas}` : ''}. ¡Enhorabuena por el arranque!` : `He visto en el BORME que ${empresa} sigue creciendo y me alegro mucho.`}\n\nSoy Project Manager, con formación en Ingeniería Técnica Industrial (Mecánica), Máster en Project Management por la Universitat Politècnica de València y certificación CAPM. En Gárgola Lab dirijo ${tema(o)}, coordinando alcance, plazos, costes, proveedores y relación con el cliente.${extra}\n\nNo sé si ahora mismo buscáis a alguien, pero si en esta etapa necesitáis a una persona que coordine vuestros proyectos de principio a fin, me encantaría conoceros. Os adjunto mi CV.\n\n${firma()}`,
    };
  }
  if (o.subtipo === 'licitacion_abierta') {
    const crit = (o.criterios_adjudicacion || []).find((c) => /jefe|direc|coordin|responsable|equipo|experiencia/i.test(c.texto));
    const valora = crit ? `Entre los criterios de adjudicación se valora «${crit.texto}»${crit.peso ? ` (${crit.peso.toLocaleString('es-ES')} puntos)` : ''}. ` : '';
    return {
      asunto: `Jefa de proyecto para vuestra oferta: «${corto(o.titulo, 60)}»`,
      cuerpo: `Hola, equipo de ${empresa}:\n\nEstá abierta la licitación «${o.titulo}»${o.cliente ? ' de ' + o.cliente : ''}, con plazo de ofertas hasta el ${fecha(o.fechas.plazo)}. Por vuestra trayectoria imagino que podéis estar preparando oferta.\n\n${valora}Si os presentáis, me gustaría formar parte de vuestra propuesta como Project Manager o jefa de proyecto. Puedo aportar CV, títulos y certificados para que cuenten en la valoración.\n\nSoy Ingeniera Técnica Industrial (Mecánica), con Máster en Project Management por la Universitat Politècnica de València y certificación CAPM. En Gárgola Lab dirijo ${tema(o)}, coordinando alcance, plazos, costes, proveedores y relación con el cliente.${extra}\n\nSi os encaja, hablamos cuando queráis. Os adjunto mi CV.\n\n${firma()}`,
    };
  }
  return {
    asunto: `Project Manager para el proyecto «${corto(o.titulo, 70)}»`,
    cuerpo: `Hola, equipo de ${empresa}:\n\nHe visto que habéis resultado adjudicatarios del contrato «${o.titulo}»${o.cliente ? ' para ' + o.cliente : ''}. ¡Enhorabuena!\n\nSoy Project Manager, con formación en Ingeniería Técnica Industrial (Mecánica), Máster en Project Management por la Universitat Politècnica de València y certificación CAPM. En Gárgola Lab dirijo ${tema(o)}, coordinando alcance, plazos, costes, proveedores y relación con el cliente.${extra}\n\nSi para ejecutar este proyecto, o los que vengan, necesitáis reforzar el equipo con alguien que lo coordine de principio a fin, me encantaría hablar con vosotros. Os adjunto mi CV.\n\n${firma()}`,
  };
}

function copiar(btn, txt) {
  const original = btn.textContent;
  const hecho = (t) => { btn.textContent = t; setTimeout(() => { btn.textContent = original; }, 1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => hecho('Copiado'), () => hecho('Copia a mano')); else hecho('Copia a mano');
}

function abrirContacto(o, cand) {
  const empresa = cand ? cand.empresa : o.organizacion.nombre;
  const email = cand ? cand.email : o.contacto?.email;
  const web = cand ? cand.web : o.contacto?.web;
  const tel = cand ? '' : o.contacto?.telefono;
  const ciudad = cand ? cand.ciudad_empresa : o.ciudad_empresa;
  const nombreCorto = empresa.replace(/,?\s*(SOCIEDAD LIMITADA( UNIPERSONAL| LABORAL| PROFESIONAL)?|SOCIEDAD ANONIMA|S\.?L\.?U?|S\.?A\.?U?|SLU|SL|SA)\.?\s*$/i, '').replace(/\b([A-ZÁÉÍÓÚÑ])([A-ZÁÉÍÓÚÑ]+)\b/g, (m, a, b) => (m.length > 3 ? a + b.toLowerCase() : m));
  const { asunto, cuerpo } = correo(o, nombreCorto);
  $('#ap-eyebrow').textContent = o.subtipo === 'licitacion_abierta' ? 'Ofrecerte para su oferta' : 'Preparar contacto';
  $('#ap-titulo').textContent = empresa;
  $('#ap-proyecto').textContent = o.titulo;
  const c = $('#ap-contacto');
  c.replaceChildren(el('p', 'campo', 'Email'), email ? el('p', 'dato', email) : el('p', 'aviso', 'No hay un correo verificado. Busca a la persona en LinkedIn o en la web de la empresa.'));
  if (tel) c.append(el('p', 'campo', 'Teléfono de la empresa'), el('p', 'dato', tel));
  const limpia = empresa.replace(/,?\s*(S\.?L\.?U?|S\.?A\.?|UTE)\.?$/i, '');
  $('#ap-busqueda').replaceChildren(
    enlace('https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(limpia + ' proyectos'), 'Responsable en LinkedIn'),
    web ? enlace(web, 'Web de la empresa') : enlace('https://www.google.com/search?q=' + encodeURIComponent(empresa + ' ' + (ciudad || '') + ' contacto'), 'Buscar su web'));
  $('#ap-asunto').textContent = asunto;
  $('#ap-mensaje').textContent = cuerpo;
  $('#ap-prop').textContent = ST.prop[o.id]?.aprobada ? '✓ Incluye las aportaciones de tu propuesta de valor aprobada.' : 'Si apruebas tu propuesta de valor en la ficha, sus aportaciones se añaden a este mensaje.';
  const gmail = 'https://mail.google.com/mail/?view=cm&fs=1' + (email ? '&to=' + encodeURIComponent(email) : '') + '&su=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
  const bG = enlace(gmail, 'Abrir en Gmail', 'btn');
  bG.addEventListener('click', () => {
    const e = ST.est[o.id]?.estado;
    if (!e || e === 'pendiente') { setEstado(o.id, 'borrador', `Correo preparado para ${empresa}`); bG.after(el('span', 'ok', '✓ Borrador preparado. Cuando lo envíes, márcalo como «Enviada».')); }
  });
  const bEnv = boton('Ya lo he enviado', 'btn sec', () => { setEstado(o.id, 'enviada', `Correo enviado a ${empresa}`); bEnv.textContent = '✓ Marcada como enviada'; bEnv.disabled = true; pintar(); });
  const acc = $('#ap-acciones');
  acc.replaceChildren(bG, enlace(cvUrl(o.origen.lista, o.origen.clave, cand ? empresa : ''), 'CV adaptado (PDF)'),
    boton('Copiar mensaje', 'btn sec', function () { copiar(this, cuerpo); }), boton('Copiar asunto', 'btn sec', function () { copiar(this, asunto); }));
  if (email) acc.append(boton('Copiar email', 'btn sec', function () { copiar(this, email); }));
  acc.append(bEnv);
  $('#aplicar').showModal();
}

/* ---------- guardados, colecciones y candidaturas ---------- */
let COL_ACTIVA = '';
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');

function selectorColecciones(id) {
  const box = el('details', 'colecciones');
  const n = Object.values(ST.col).filter((c) => c.items[id]).length;
  box.append(el('summary', null, n ? `En ${n} colección${n > 1 ? 'es' : ''}` : 'Añadir a una colección'));
  const lista = el('div', 'col-lista');
  Object.entries(ST.col).forEach(([k, c]) => {
    const l = el('label', 'op'); const i = el('input'); i.type = 'checkbox'; i.checked = Boolean(c.items[id]);
    i.addEventListener('change', () => {
      instantanea(id);
      if (i.checked) { c.items[id] = new Date().toISOString(); if (!ST.fav[id]) ST.fav[id] = c.items[id]; } else delete c.items[id];
      guardarST();
      const m = Object.values(ST.col).filter((x) => x.items[id]).length;
      box.querySelector('summary').textContent = m ? `En ${m} colección${m > 1 ? 'es' : ''}` : 'Añadir a una colección';
      if (VISTA === 'guardados') pintar();
    });
    l.append(i, ' ', c.nombre); lista.append(l);
  });
  box.append(lista);
  return box;
}

function datosGuardado(id) {
  const o = D.porId.get(id);
  const sn = ST.snap[id] || {};
  const titulo = o?.titulo || sn.titulo || id;
  const org = o?.organizacion.nombre || sn.org || '';
  const plazo = o?.fechas.plazo || sn.plazo;
  let aviso = '';
  if (!o) aviso = 'Ya no aparece en las fuentes: puede haber caducado o haberse retirado.';
  else if (plazo && plazo < hoyISO()) aviso = 'El plazo terminó el ' + fecha(plazo) + '.';
  return { o, titulo, org, url: o?.fuentes[0]?.url || sn.url, subtipo: o?.subtipo || sn.subtipo, aviso };
}

function siguientePaso(id) {
  const e = ST.est[id];
  if (!e) return 'Revisa la ficha y decide si te interesa.';
  const ult = e.hist[e.hist.length - 1];
  const d = Math.floor((Date.now() - Date.parse(ult.f)) / 864e5);
  return {
    interes: 'Prepara la candidatura o el contacto.',
    pendiente: 'Revisa la ficha y decide.',
    borrador: 'Envíalo y márcalo como «Enviada».',
    enviada: d >= 7 ? `Sin respuesta en ${d} días: toca insistir con un mensaje breve.` : `Enviada hace ${d} día${d === 1 ? '' : 's'}: espera unos días.`,
    respuesta: 'Contesta y propón una conversación.',
    entrevista: 'Prepara la entrevista con tu propuesta de valor.',
    descartada: '', cerrada: '',
  }[e.estado] || '';
}

function filaGuardado(id) {
  const g = datosGuardado(id);
  const li = el('li', 'fila-g');
  li.dataset.id = id;
  const izq = el('div', 'fila-g-t');
  const t = g.o ? boton(g.titulo, 'enlace titulo-g', () => abrirFicha(id)) : el('span', 'titulo-g', g.titulo);
  izq.append(t, el('small', null, [SUBTIPOS[g.subtipo]?.nombre, g.org, ST.fav[id] ? 'guardada el ' + fechaCorta(ST.fav[id]) : ''].filter(Boolean).join(' · ')));
  if (g.aviso) izq.append(el('small', 'aviso-g', g.aviso));
  const paso = siguientePaso(id);
  if (paso) izq.append(el('small', 'paso-g' + (/insistir/.test(paso) ? ' urge' : ''), '→ ' + paso));
  const der = el('div', 'fila-g-c');
  const sel = el('select'); sel.setAttribute('aria-label', 'Estado de ' + g.titulo);
  sel.append(new Option('Sin estado', '')); ESTADOS.forEach(([v, n]) => sel.append(new Option(n, v)));
  sel.value = ST.est[id]?.estado || '';
  sel.addEventListener('change', () => { if (sel.value) setEstado(id, sel.value); else { delete ST.est[id]; guardarST(); } pintar(); });
  der.append(sel);
  const pie = el('div', 'fila-g-acc');
  if (g.url) pie.append(enlace(g.url, 'Fuente', 'enlace'));
  const q = boton('Quitar', 'enlace quitar', () => {
    quitarGuardado(id);
    li.classList.add('quitada');
    li.replaceChildren(el('span', 'nota', `«${g.titulo.slice(0, 60)}» quitada. `), boton('Deshacer', 'enlace', () => {
      recuperarOculta(id);
      const prev = ultimoQuitado;
      if (prev && prev.id === id) { if (prev.fav) ST.fav[id] = prev.fav; if (prev.est) ST.est[id] = prev.est; prev.cols.forEach((k) => { if (ST.col[k]) ST.col[k].items[id] = prev.fechaCol[k]; }); guardarST(); }
      pintar();
    }));
    setTimeout(() => { if (li.isConnected && li.classList.contains('quitada')) pintar(); }, 6000);
  });
  q.setAttribute('aria-label', 'Quitar de Guardados: ' + g.titulo);
  q.addEventListener('click', () => {}, { capture: true });
  pie.append(q);
  der.append(pie);
  li.append(izq, der);
  return li;
}
let ultimoQuitado = null;
document.addEventListener('click', (e) => {
  const b = e.target.closest('.quitar');
  if (!b) return;
  const li = b.closest('.fila-g'); const id = li?.dataset.id;
  if (id) ultimoQuitado = { id, fav: ST.fav[id] || null, est: ST.est[id] ? JSON.parse(JSON.stringify(ST.est[id])) : null,
    cols: Object.entries(ST.col).filter(([, c]) => c.items[id]).map(([k]) => k),
    fechaCol: Object.fromEntries(Object.entries(ST.col).filter(([, c]) => c.items[id]).map(([k, c]) => [k, c.items[id]])) };
}, true);

function indicadores(ids) {
  const box = el('section', 'indicadores');
  box.append(el('h3', null, 'Tu actividad'));
  const est = (e) => Object.values(ST.est).filter((x) => x.estado === e || x.hist.some((h) => h.e === e)).length;
  const pasos = [
    ['Detectadas', D.ops.length], ['Revisadas', Object.keys(ST.vistas).filter((k) => D.porId.has(k)).length],
    ['Guardadas o con interés', ids.length], ['Borradores preparados', est('borrador')], ['Enviadas / contactos', est('enviada')],
    ['Respuestas', est('respuesta')], ['Entrevistas', est('entrevista')],
  ];
  const max = Math.max(1, ...pasos.map((x) => x[1]));
  const ol = el('ol', 'embudo');
  pasos.forEach(([n, v]) => {
    const li = el('li'); const b = el('div', 'emb-b'); const i = el('i'); i.style.width = Math.max(v ? 2 : 0, (100 * v) / max) + '%'; b.append(i);
    li.append(el('span', 'emb-n', n), b, el('b', null, String(v))); ol.append(li);
  });
  box.append(ol);
  // por canal
  const canales = {};
  Object.entries(ST.est).forEach(([id, e]) => {
    const sub = datosGuardado(id).subtipo || 'otro';
    const c = canales[sub] || (canales[sub] = { enviadas: 0, respuestas: 0 });
    if (e.hist.some((h) => h.e === 'enviada')) c.enviadas++;
    if (e.hist.some((h) => h.e === 'respuesta' || h.e === 'entrevista')) c.respuestas++;
  });
  const filas = Object.entries(canales).filter(([, c]) => c.enviadas);
  if (filas.length) {
    const t = el('table', 'canales');
    const th = el('tr'); ['Canal', 'Enviadas', 'Con respuesta'].forEach((x) => th.append(el('th', null, x)));
    const tb = el('tbody'); filas.forEach(([k, c]) => { const tr = el('tr'); tr.append(el('td', null, SUBTIPOS[k]?.nombre || k), el('td', null, String(c.enviadas)), el('td', null, String(c.respuestas))); tb.append(tr); });
    const thead = el('thead'); thead.append(th); t.append(thead, tb);
    box.append(el('h4', null, 'Qué canal te funciona'), t);
    const total = filas.reduce((a, [, c]) => a + c.enviadas, 0);
    box.append(el('p', 'nota', total < 10 ? `Con ${total} envío${total === 1 ? '' : 's'} todavía no se pueden sacar conclusiones: hacen falta al menos 10 por canal.` : 'Compara los canales con prudencia: son tus propios datos, no una estadística general.'));
    const validos = filas.filter(([, c]) => c.enviadas >= 10);
    if (validos.length >= 2) {
      const tasa = ([, c]) => c.respuestas / c.enviadas;
      const orden = validos.sort((x, y) => tasa(y) - tasa(x));
      const [mejor, peor] = [orden[0], orden.at(-1)];
      if (tasa(mejor) > tasa(peor) * 1.5) {
        const sug = el('div', 'sugerencia');
        sug.append(el('b', null, 'Propuesta de RADAR'), el('p', null, `«${SUBTIPOS[mejor[0]]?.nombre || mejor[0]}» te responde más (${mejor[1].respuestas} de ${mejor[1].enviadas}) que «${SUBTIPOS[peor[0]]?.nombre || peor[0]}» (${peor[1].respuestas} de ${peor[1].enviadas}). Podrías dedicarle más tiempo filtrando por ese tipo en Explorar.`),
          el('p', 'nota', 'Es una sugerencia con tus datos; RADAR no cambia nada solo.'),
          boton('Ver solo ' + (SUBTIPOS[mejor[0]]?.nombre || mejor[0]), 'btn sec mini', () => { limpiar(); F.subtipos.add(mejor[0]); sincronizarChips(); location.hash = 'explorar'; }));
        box.append(sug);
      }
    }
  } else box.append(el('p', 'nota', 'Cuando marques candidaturas como «Enviada» y luego «Respuesta» o «Entrevista», aquí verás qué canal te da mejores resultados.'));
  return box;
}

function pintarGuardados() {
  const ids = [...new Set([...Object.keys(ST.fav), ...Object.keys(ST.est), ...Object.values(ST.col).flatMap((c) => Object.keys(c.items))])];
  $('#res-n').textContent = `${ids.length} oportunidad${ids.length === 1 ? '' : 'es'} guardada${ids.length === 1 ? '' : 's'} o con estado`;
  const cont = el('div', 'guardados');
  cont.append(indicadores(ids));

  // colecciones
  const cols = el('section', 'cols');
  const cab = el('div', 'cols-cab'); cab.append(el('h3', null, 'Colecciones'));
  cab.append(boton('+ Nueva colección', 'btn sec mini', () => {
    const n = prompt('Nombre de la colección'); if (!n || !n.trim()) return;
    const k = 'c' + Date.now().toString(36); ST.col[k] = { nombre: n.trim().slice(0, 60), items: {} }; COL_ACTIVA = k; guardarST(); pintar();
  }));
  cols.append(cab);
  const chips = el('div', 'chips-col');
  const chipC = (k, nombre, n) => { const b = boton(`${nombre} · ${n}`, 'chip' + (COL_ACTIVA === k ? ' on' : ''), () => { COL_ACTIVA = k; pintar(); }); return b; };
  chips.append(chipC('', 'Todas las guardadas', Object.keys(ST.fav).length));
  Object.entries(ST.col).forEach(([k, c]) => chips.append(chipC(k, c.nombre, Object.keys(c.items).length)));
  cols.append(chips);
  if (COL_ACTIVA && ST.col[COL_ACTIVA]) {
    const c = ST.col[COL_ACTIVA];
    const gest = el('div', 'acciones col-gest');
    gest.append(boton('Renombrar', 'enlace', () => { const n = prompt('Nuevo nombre', c.nombre); if (n && n.trim()) { c.nombre = n.trim().slice(0, 60); guardarST(); pintar(); } }),
      boton('Eliminar colección', 'enlace', () => { if (confirm(`¿Eliminar la colección «${c.nombre}»? Las oportunidades siguen guardadas.`)) { delete ST.col[COL_ACTIVA]; COL_ACTIVA = ''; guardarST(); pintar(); } }));
    cols.append(gest);
  }
  const enCol = COL_ACTIVA && ST.col[COL_ACTIVA] ? Object.entries(ST.col[COL_ACTIVA].items).sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id)
    : Object.entries(ST.fav).sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id);
  const ulc = el('ul', 'lista-g');
  if (enCol.length) enCol.forEach((id) => ulc.append(filaGuardado(id)));
  else ulc.append(el('li', 'vacio-g', COL_ACTIVA ? 'Esta colección está vacía. Añade oportunidades desde su ficha.' : 'Pulsa el corazón de una tarjeta para guardarla.'));
  cols.append(ulc);
  cont.append(cols);

  // candidaturas por estado
  const cand = el('section', 'candidaturas');
  cand.append(el('h3', null, 'Candidaturas y contactos'));
  const porEstado = {};
  Object.entries(ST.est).forEach(([id, e]) => { (porEstado[e.estado] = porEstado[e.estado] || []).push(id); });
  const orden = ['interes', 'pendiente', 'borrador', 'enviada', 'respuesta', 'entrevista', 'descartada', 'cerrada'];
  let alguna = false;
  orden.forEach((e) => {
    const lista = (porEstado[e] || []).sort((a, b) => (ST.est[b].hist.at(-1).f).localeCompare(ST.est[a].hist.at(-1).f));
    if (!lista.length) return;
    alguna = true;
    const g = el('details', 'grupo-e'); g.open = !['descartada', 'cerrada'].includes(e);
    g.append(el('summary', null, `${NOMBRE_ESTADO[e]} · ${lista.length}`));
    if (e === 'descartada' || e === 'cerrada') {
      g.append(boton(`Quitar todas las ${e === 'descartada' ? 'descartadas' : 'cerradas'} de esta lista`, 'enlace vaciar', () => {
        if (!confirm(`¿Quitar ${lista.length} oportunidad${lista.length === 1 ? '' : 'es'} de la lista? No volverán a salir en Explorar ni en Descubrir. Puedes recuperarlas con «Ver quitadas».`)) return;
        lista.forEach(quitarGuardado); pintar();
      }));
    }
    const ul = el('ul', 'lista-g'); lista.forEach((id) => ul.append(filaGuardado(id))); g.append(ul);
    cand.append(g);
  });
  if (!alguna) cand.append(el('p', 'nota', 'Aún no hay candidaturas. Usa «Me interesa» o cambia el estado desde la ficha de una oportunidad.'));
  const ocultas = Object.keys(ST.ocultas);
  if (ocultas.length) {
    const g = el('details', 'grupo-e');
    g.append(el('summary', null, `Quitadas · ${ocultas.length}`));
    g.append(el('p', 'nota', 'No salen en Explorar ni en Descubrir. Si recuperas una, vuelve a aparecer.'));
    const ul = el('ul', 'lista-g');
    ocultas.forEach((id) => {
      const d = datosGuardado(id);
      const li = el('li', 'fila-g');
      li.append(el('div', 'fila-g-t', d.titulo), boton('Recuperar', 'enlace', () => { recuperarOculta(id); pintar(); }));
      ul.append(li);
    });
    g.append(ul);
    cand.append(g);
  }
  cont.append(cand);

  $('#rejilla').replaceChildren(cont);
}

/* ---------- Mi perfil ---------- */
const ZONAS_PERFIL = ['Asturias', 'Galicia', 'Cantabria', 'País Vasco', 'Navarra', 'Castilla y León', 'Madrid', 'Cataluña', 'Comunitat Valenciana', 'Andalucía', 'Aragón'];

function pintarPerfil() {
  $('#res-n').textContent = '';
  const cont = el('div', 'perfil');
  const repintar = () => { guardarPref(); pintar(); };
  const sec = (titulo, nota) => { const s = el('section', 'p-sec'); s.append(el('h3', null, titulo)); if (nota) s.append(el('p', 'nota', nota)); return s; };
  const chk = (txt, on, fn) => { const l = el('label', 'op'); const i = el('input'); i.type = 'checkbox'; i.checked = on; i.addEventListener('change', () => fn(i.checked)); l.append(i, ' ', txt); return l; };

  // completitud
  const campos = [
    ['Experiencia', CV.experiencia.length > 0], ['Formación', CV.formacion.length > 0], ['Idiomas', Boolean(CV.idiomas)],
    ['Zonas que aceptas', PREF.zonas.length > 0], ['Modalidad preferida', PREF.modalidades.length > 0], ['Salario mínimo orientativo', Boolean(PREF.salarioMin)],
    ['Disponibilidad para incorporarte', Boolean(PREF.disponibilidad)], ['Permiso de trabajo en la UE', Boolean(PREF.permiso)],
    ['Roles adyacentes revisados', ROLES.every((r) => r.k in PREF.roles)],
  ];
  const hechos = campos.filter((x) => x[1]).length;
  const comp = sec('Perfil completo al ' + Math.round((100 * hechos) / campos.length) + ' %');
  const barra = el('div', 'emb-b'); const bi = el('i'); bi.style.width = (100 * hechos) / campos.length + '%'; barra.append(bi); comp.append(barra);
  const falta = campos.filter((x) => !x[1]).map((x) => x[0]);
  comp.append(el('p', 'nota', falta.length ? 'Falta: ' + falta.join(', ') + '. No resta puntos: solo ayuda a afinar.' : 'Tienes todo lo necesario.'));
  cont.append(comp);

  // preferencias
  const pref = sec('Preferencias', 'Cambian la compatibilidad de todas las oportunidades. Cada ajuste aparece explicado en la ficha.');
  pref.append(el('h4', null, 'Zonas que aceptas (además de Asturias y remoto)'));
  const zonas = el('div', 'opciones col2');
  ZONAS_PERFIL.filter((z) => z !== 'Asturias').forEach((z) => zonas.append(chk(z, PREF.zonas.includes(z), (on) => { PREF.zonas = on ? [...PREF.zonas, z] : PREF.zonas.filter((x) => x !== z); repintar(); })));
  pref.append(zonas);
  pref.append(el('h4', null, 'Modalidad que prefieres'));
  const mods = el('div', 'opciones');
  [['remoto', 'Remoto'], ['hibrido', 'Híbrido'], ['presencial', 'Presencial']].forEach(([k, n]) => mods.append(chk(n, PREF.modalidades.includes(k), (on) => { PREF.modalidades = on ? [...PREF.modalidades, k] : PREF.modalidades.filter((x) => x !== k); repintar(); })));
  pref.append(mods);
  const campo = (lbl, key, ph, tipo) => {
    const l = el('label', 'p-campo'); l.append(el('span', null, lbl));
    const i = el('input'); i.type = tipo || 'text'; i.value = PREF[key] || ''; i.placeholder = ph || '';
    i.addEventListener('change', () => { PREF[key] = i.value.trim(); repintar(); });
    l.append(i); return l;
  };
  pref.append(campo('Salario bruto anual mínimo orientativo (€)', 'salarioMin', 'p. ej. 32000', 'number'),
    campo('Disponibilidad para incorporarte', 'disponibilidad', 'p. ej. inmediata, 15 días'),
    campo('Permiso de trabajo en la UE', 'permiso', 'sí / no'),
    campo('Palabras que no quieres priorizar (separadas por comas)', 'evitar', 'p. ej. comercial, junior'));
  cont.append(pref);

  // roles adyacentes
  const roles = sec('Roles a los que podrías optar', 'Deducidos por RADAR a partir de lo que has hecho, no de tus títulos anteriores. Acepta los que te interesen (suben la compatibilidad de esas ofertas) o recházalos (la bajan).');
  ROLES.forEach((r) => {
    const f = el('div', 'rol');
    const t = el('div'); t.append(el('b', null, r.nombre), ' ', el('span', 'origen o-inferido', 'inferido'), el('small', null, r.por));
    const b = el('div', 'acc-t');
    const si = boton(PREF.roles[r.k] === true ? '✓ Me interesa' : 'Me interesa', PREF.roles[r.k] === true ? 'on' : '', () => { PREF.roles[r.k] = PREF.roles[r.k] === true ? undefined : true; if (PREF.roles[r.k] === undefined) delete PREF.roles[r.k]; repintar(); });
    const no = boton(PREF.roles[r.k] === false ? '✓ No' : 'No', PREF.roles[r.k] === false ? 'on' : '', () => { PREF.roles[r.k] = PREF.roles[r.k] === false ? undefined : false; if (PREF.roles[r.k] === undefined) delete PREF.roles[r.k]; repintar(); });
    b.append(si, no); f.append(t, b); roles.append(f);
  });
  cont.append(roles);

  // pesos
  const pesos = sec('Cómo se calcula la compatibilidad', 'Pesos relativos de cada criterio. Se reparten en proporción y los criterios sin información no cuentan.');
  Object.entries(CRITERIOS).forEach(([k, n]) => {
    const l = el('label', 'peso'); l.append(el('span', null, n));
    const r = el('input'); r.type = 'range'; r.min = 0; r.max = 50; r.step = 5; r.value = PESOS[k];
    const out = el('output', null, PESOS[k] + ' %');
    r.addEventListener('input', () => { out.textContent = r.value + ' %'; });
    r.addEventListener('change', () => { PESOS[k] = +r.value; escribir('radar-pesos', PESOS); D.ops.forEach((o) => { delete o._p; }); pintar(); });
    l.append(r, out); pesos.append(l);
  });
  pesos.append(boton('Volver a los pesos iniciales (30/20/15/15/10/10)', 'enlace', () => { Object.assign(PESOS, PESOS_BASE); escribir('radar-pesos', PESOS); D.ops.forEach((o) => { delete o._p; }); pintar(); }));
  cont.append(pesos);

  // datos del CV
  const cv = sec('Tu experiencia según el CV', 'Esto es lo que RADAR usa para la propuesta de valor y el CV adaptado. Si un dato no quieres que se use, desmárcalo. Para corregir o añadir algo, pídemelo y lo actualizo en el CV.');
  CV.experiencia.forEach((x) => {
    const d = el('details', 'exp'); d.open = CV.experiencia.indexOf(x) < 2;
    d.append(el('summary', null, `${x.puesto} · ${x.empresa} · ${x.fechas}`));
    x.vinetas.forEach((v, i) => {
      const id = `${x.empresa}|${i}`;
      const l = el('label', 'op exp-v' + (PREF.ocultos[id] ? ' oculto' : ''));
      const c = el('input'); c.type = 'checkbox'; c.checked = !PREF.ocultos[id];
      c.addEventListener('change', () => { if (c.checked) delete PREF.ocultos[id]; else PREF.ocultos[id] = true; guardarPref(); l.classList.toggle('oculto', !c.checked); });
      l.append(c, ' ', el('span', null, v.t.replace(/<[^>]+>/g, '')), ' ', el('span', 'origen o-confirmado', 'CV'));
      d.append(l);
    });
    cv.append(d);
  });
  cv.append(el('h4', null, 'Formación'));
  const ul = el('ul', 'p-lista'); CV.formacion.forEach((f) => { const li = el('li'); li.append(el('b', null, f.t), ' · ' + f.d, ' ', el('span', 'origen o-confirmado', 'CV')); ul.append(li); }); cv.append(ul);
  cv.append(el('h4', null, 'Idiomas y otros'), el('p', null, CV.idiomas + ' · ' + CV.extra));
  cont.append(cv);

  $('#rejilla').replaceChildren(cont);
}

/* ---------- contador ---------- */
function contadorGuardados() {
  const n = new Set([...Object.keys(ST.fav), ...Object.keys(ST.est)]).size;
  $('#n-guardados').textContent = n ? String(n) : '';
}

/* ---------- navegación ---------- */
function ruta() {
  const [v, , id] = location.hash.replace(/^#/, '').split('/');
  const movil = window.matchMedia('(max-width: 640px)').matches;
  VISTA = VISTAS[v] ? v : movil ? 'descubrir' : 'explorar';
  if (typeof cerrarHoja === 'function' && VISTA !== 'descubrir') cerrarHoja();
  $$('.nav a').forEach((a) => { const on = a.dataset.v === VISTA; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.body.dataset.vista = VISTA;
  pintar();
  if (id) abrirFicha(decodeURIComponent(id));
}

/* ---------- eventos ---------- */
window.addEventListener('hashchange', ruta);
$('#buscador').addEventListener('submit', (e) => {
  e.preventDefault();
  F.que = $('#q-que').value.trim(); F.donde = $('#q-donde').value; F.modalidad = $('#q-modalidad').value; F.tipo = $('#q-tipo').value;
  pintar();
  $('.resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
['#q-donde', '#q-modalidad', '#q-tipo'].forEach((s) => $(s).addEventListener('change', () => { F.donde = $('#q-donde').value; F.modalidad = $('#q-modalidad').value; F.tipo = $('#q-tipo').value; pintar(); }));
let tq; $('#q-que').addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => { F.que = $('#q-que').value.trim(); pintar(); }, 250); });
$('#rapidos').addEventListener('click', (e) => {
  const b = e.target.closest('.chip[data-f]'); if (!b) return;
  const f = b.dataset.f; if (F.rapidos.has(f)) F.rapidos.delete(f); else F.rapidos.add(f);
  sincronizarChips(); pintar();
});
$('#abrir-filtros').addEventListener('click', () => $('#filtros').showModal());
$('#f-minimo').addEventListener('input', (e) => { F.minimo = +e.target.value; $('#f-minimo-v').textContent = F.minimo; sincronizarChips(); pintar(); });
$('#limpiar-filtros').addEventListener('click', () => { limpiar(); pintar(); });
$('#ver-resultados').addEventListener('click', () => $('#filtros').close());
$('#orden').addEventListener('change', (e) => { ORDEN = e.target.value; pintar(); });
$$('.vista-btns button').forEach((b) => b.addEventListener('click', () => { MODO = b.dataset.vista; if (VISTA === 'mapa' && MODO === 'rejilla') { location.hash = 'explorar'; return; } pintar(); }));
$$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
$('#ficha').addEventListener('close', () => { if (/\/o\//.test(location.hash)) history.replaceState(null, '', '#' + VISTA); });
$('#exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ radar: ST, pesos: PESOS, exportado: new Date().toISOString() }, null, 1)], { type: 'application/json' });
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `radar-mis-datos-${hoyISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#importar').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.radar && d.radar.fav && d.radar.est) { Object.assign(ST, d.radar); guardarST(); pintar(); alert('Copia importada.'); } else alert('Ese archivo no es una copia de RADAR.');
  } catch (err) { alert('No se ha podido leer el archivo.'); }
});
window.abrirFicha = abrirFicha;

cargar();
