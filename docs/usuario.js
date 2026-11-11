'use strict';
/* Perfil de la persona que usa RADAR (piloto multiusuario, fase 1).
   Cada probador carga un archivo de perfil (.json) que se guarda SOLO en su navegador
   (clave «radar-usuario»). Sin perfil cargado, RADAR usa el perfil por defecto (el de
   cv-datos.js), así que la web de siempre no cambia.
   Este archivo se carga después de cv-datos.js (y de cv-datos-en.js y propuesta.js si
   la página los usa) y antes de app.js / cv.js. */

const USUARIO = (() => {
  try {
    const p = JSON.parse(localStorage.getItem('radar-usuario'));
    return p && p.version === 1 && p.nombre && p.cv ? p : null;
  } catch (e) { return null; }
})();
const RADAR_CONTACTO_PILOTO = 'rlovera86@gmail.com';

function rxPerfil(s) { try { return s instanceof RegExp ? s : new RegExp(s, 'i'); } catch (e) { return /(?!)/; } }
const sinEtiquetas = (s) => String(s || '').replace(/<[^>]+>/g, '');
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Reemplaza el contenido de un objeto constante sin cambiar su identidad. */
function vaciarYAsignar(obj, nuevo) { Object.keys(obj).forEach((k) => { delete obj[k]; }); Object.assign(obj, nuevo); }

function cvDesdePerfil(p, cv) {
  return {
    nombre: p.nombre, ciudad: cv.ciudad || p.ciudad || '', email: p.email || '', linkedin: p.linkedin || '',
    temas: Object.fromEntries(Object.entries(cv.temas || {}).map(([k, t]) => [k, { ...t, detectar: rxPerfil(t.detectar || k) }])),
    experiencia: (cv.experiencia || []).map((x) => ({ ...x, vinetas: (x.vinetas || []).map((v) => (typeof v === 'string' ? { t: v, temas: Object.keys(cv.temas || {}) } : v)) })),
    formacion: cv.formacion || [], idiomas: cv.idiomas || '', extra: cv.extra || '',
  };
}

/* Si el perfil no trae propuesta para un enfoque, se arma con sus propias viñetas del CV
   (así cada aportación tiene siempre una experiencia que la respalda). */
function propuestaPorDefecto(cv, tema) {
  const vin = cv.experiencia.flatMap((x) => x.vinetas.filter((v) => (v.temas || []).includes(tema)).map((v) => ({ v, x })));
  const usar = (vin.length ? vin : cv.experiencia.flatMap((x) => x.vinetas.map((v) => ({ v, x })))).slice(0, 4);
  return {
    aportaciones: usar.map(({ v }) => { const t = sinEtiquetas(v.t).replace(/\.$/, ''); return [t + '.', new RegExp(escRx(t.slice(0, 40)))]; }),
    transferibles: cv.experiencia.slice(0, 3).map((x) => [x.puesto, x.empresa]),
    inicio: ['Conocer el equipo, los procesos y las prioridades', 'Plan de trabajo de las primeras semanas', 'Primeros resultados medibles'],
  };
}

if (USUARIO) {
  vaciarYAsignar(CV, cvDesdePerfil(USUARIO, USUARIO.cv));
  if (typeof CV_EN !== 'undefined') {
    if (USUARIO.cv_en) vaciarYAsignar(CV_EN, { ...cvDesdePerfil(USUARIO, USUARIO.cv_en), ciudad: USUARIO.cv_en.ciudad || CV.ciudad });
    else vaciarYAsignar(CV_EN, { ...CV, sinIngles: true });
  }
  if (typeof PROPUESTA !== 'undefined') {
    const nueva = {};
    const en = {};
    Object.keys(CV.temas).forEach((k) => {
      const p = USUARIO.propuesta?.[k];
      nueva[k] = p ? { ...p, aportaciones: (p.aportaciones || []).map(([t, r]) => [t, rxPerfil(r)]) } : propuestaPorDefecto(CV, k);
      en[k] = p ? (p.aportaciones || []).map((a) => a[2] || a[0]) : nueva[k].aportaciones.map((a) => a[0]);
    });
    vaciarYAsignar(PROPUESTA, nueva);
    if (typeof PROPUESTA_EN !== 'undefined') vaciarYAsignar(PROPUESTA_EN, en);
  }
  document.documentElement.classList.add('con-usuario');
  if (USUARIO.proyectos === false) document.documentElement.classList.add('sin-proyectos');
}

/* Datos de la persona para el resto de la web. */
const REGION = USUARIO?.region || 'Asturias';
const NOMBRE_CORTO = USUARIO?.nombreCorto || (USUARIO ? USUARIO.nombre.split(' ')[0] : 'Rocío');
const SELLOS = USUARIO?.sellos || ['Ingeniería Técnica Industrial', 'Máster en Project Management', 'CAPM (PMI)', 'Inglés C2'];
const CV_TEXTO = () => norm(JSON.stringify([CV.formacion, CV.idiomas, CV.extra, CV.temas && Object.values(CV.temas).map((t) => [t.perfil, t.habilidades])]));
/* Nivel de un idioma según el CV, p. ej. «Inglés (… C2)». */
const idiomaCV = (patron) => (String(CV.idiomas || '').split('·').map((x) => x.trim()).find((x) => new RegExp(patron, 'i').test(x)) || '');

/* Validación básica de un perfil antes de guardarlo. Devuelve una lista de problemas. */
function validarPerfil(p) {
  const e = [];
  if (!p || typeof p !== 'object') return ['El archivo no contiene un perfil.'];
  if (p.version !== 1) e.push('Versión de perfil no reconocida (se espera "version": 1).');
  if (!p.nombre) e.push('Falta el nombre.');
  if (!p.region) e.push('Falta la comunidad autónoma («region»).');
  if (!p.cv || !p.cv.temas || !Object.keys(p.cv.temas).length) e.push('El CV necesita al menos un enfoque en «cv.temas».');
  if (!p.cv?.experiencia?.length) e.push('El CV necesita experiencia («cv.experiencia»).');
  if (!p.busqueda?.puestos || !Object.keys(p.busqueda.puestos).length) e.push('Faltan los puestos que busca («busqueda.puestos»).');
  Object.entries(p.cv?.temas || {}).forEach(([k, t]) => { try { new RegExp(t.detectar || k, 'i'); } catch (x) { e.push(`La expresión «detectar» del enfoque ${k} no es válida.`); } });
  (p.roles || []).forEach((r) => { try { new RegExp(r.rx, 'i'); } catch (x) { e.push(`La expresión del rol «${r.nombre}» no es válida.`); } });
  return e;
}

function cargarPerfilDesdeArchivo(file, alTerminar) {
  const r = new FileReader();
  r.onload = () => {
    let p = null;
    try { p = JSON.parse(r.result); } catch (x) { alTerminar(['No se ha podido leer el archivo: no es un perfil de RADAR.']); return; }
    const errores = validarPerfil(p);
    if (errores.length) { alTerminar(errores); return; }
    try {
      localStorage.setItem('radar-usuario', JSON.stringify(p));
      if (p.preferencias) {
        const actual = JSON.parse(localStorage.getItem('radar-perfil') || '{}');
        localStorage.setItem('radar-perfil', JSON.stringify({ ...p.preferencias, ...actual }));
      }
      localStorage.removeItem('radar-demo');
    } catch (x) { alTerminar(['El navegador no permite guardar datos (¿modo privado?).']); return; }
    alTerminar([]);
  };
  r.readAsText(file);
}

/* ---------- Puntuación con el perfil de la persona (solo si hay perfil cargado) ----------
   La recogida diaria puntúa con el perfil por defecto. Con un perfil cargado, el encaje,
   la zona y los requisitos se recalculan aquí con SUS puestos, temas y zona. */
function geografiaPerfil(com, mod) {
  const cerca = typeof NORTE !== 'undefined' ? NORTE : [];
  const c = (v, m, sin) => ({ valor: sin ? null : v, motivos: m, sin_info: Boolean(sin) });
  if (mod === 'remoto' || com === 'Remoto') return c(1, ['en remoto']);
  if (com === REGION) return c(1, ['en ' + REGION]);
  if (cerca.includes(com)) return c(mod === 'hibrido' ? 0.7 : 0.6, [`en ${com} (zona cercana)`]);
  if (mod === 'hibrido') return c(0.5, [com ? `híbrido en ${com}: habría que ir a la oficina algunos días` : 'híbrido sin ciudad indicada']);
  if (com === 'Estatal / otras') return c(0.5, ['ámbito estatal: plazas en varias provincias']);
  if (com && com !== 'Sin especificar') return c(0.25, [`presencial fuera de ${REGION} (${com})`]);
  return c(0, [], true);
}

function encajePerfil(o) {
  const b = USUARIO.busqueda || {};
  const rxP = (k) => new RegExp('(^|[^a-z0-9])' + escRx(norm(k)));
  const tTit = norm(o.titulo).replace(/\/as?\b|\(as?\)/g, '');
  const tTodo = norm([o.titulo, (o.etiquetas || []).join(' '), o.cliente, (o.descripcion || '').slice(0, 3000)].join(' '));
  let rol = Object.entries(b.puestos || {}).filter(([k]) => rxP(k).test(tTit)).sort((x, y) => y[1] - x[1])[0];
  let enTexto = false;
  if (!rol) { rol = Object.entries(b.puestos || {}).filter(([k]) => rxP(k).test(tTodo)).sort((x, y) => y[1] - x[1])[0]; enTexto = Boolean(rol); }
  const temas = Object.keys(b.temas || {}).filter((k) => rxP(k).test(tTodo));
  const motivos = [];
  let v;
  if (rol) { v = 0.3 + 0.4 * Math.min(rol[1], 45) / 45 * (enTexto ? 0.6 : 1); motivos.push(`puesto: ${rol[0]}${enTexto ? ' (en la descripción)' : ''}`); }
  else { v = o.tipo === 'empleo' ? 0.15 : 0.2; motivos.push('no coincide con los puestos que buscas'); }
  v += 0.08 * Math.min(temas.length, 4);
  temas.slice(0, 4).forEach((x) => motivos.push(`tema: ${x}`));
  const ex = (b.excluir || []).find((k) => rxP(k).test(tTit));
  if (ex) { v *= 0.4; motivos.push(`contiene «${ex}», que no buscas`); }
  return { valor: Math.round(Math.max(0, Math.min(1, v)) * 100) / 100, motivos, sin_info: false };
}

function recalcularParaUsuario(o, c) {
  if (!USUARIO || o.externa) return;
  c.encaje = encajePerfil(o);
  if (c.geografia) c.geografia = geografiaPerfil(o.ubicacion?.comunidad, o.modalidad);
  if (c.acceso) {
    if (/oposicion|contrato_publico/.test(o.subtipo)) c.acceso = { valor: 0.6, motivos: ['revisa la titulación y los requisitos en las bases'], sin_info: false };
    else if (o.tipo === 'empleo') {
      const sen = /\bsenior\b|\bsr\b|director|head of|lead\b/.test(norm(o.titulo));
      c.acceso = { valor: sen ? 0.55 : 0.7, motivos: [sen ? 'puesto sénior: revisa los años de experiencia que piden' : 'candidatura directa por el portal'], sin_info: false };
    }
  }
}
