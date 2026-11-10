'use strict';
/* Analizar una oferta externa: la usuaria pega el enlace y el texto de una oferta de
   cualquier portal. RADAR la puntúa con los mismos criterios que las ofertas que
   recoge cada día (config.json → data/perfil-busqueda.json), la guarda en este
   navegador y prepara CV adaptado, propuesta de valor y carta de motivación.
   Nada se envía a ningún sitio: todo se calcula aquí. */

ST.externas = ST.externas || {};
ST.cartas = ST.cartas || {};
let PERFIL_BUSQUEDA = null;
fetch('data/perfil-busqueda.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => { PERFIL_BUSQUEDA = j; }).catch(() => {});

const EXT_PROVINCIAS = {
  'Asturias': ['asturias', 'gijon', 'xixon', 'oviedo', 'aviles', 'llanera', 'siero', 'mieres', 'langreo'],
  'Galicia': ['galicia', 'coruna', 'lugo', 'ourense', 'pontevedra', 'vigo', 'santiago de compostela', 'ferrol'],
  'Cantabria': ['cantabria', 'santander', 'torrelavega'],
  'País Vasco': ['pais vasco', 'euskadi', 'bizkaia', 'vizcaya', 'gipuzkoa', 'guipuzcoa', 'alava', 'araba', 'bilbao', 'donostia', 'san sebastian', 'vitoria'],
  'Navarra': ['navarra', 'pamplona'],
  'Castilla y León': ['castilla y leon', 'leon', 'burgos', 'valladolid', 'palencia', 'salamanca', 'zamora', 'soria', 'segovia', 'avila', 'ponferrada'],
  'Madrid': ['madrid'],
  'Cataluña': ['barcelona', 'cataluna', 'catalunya', 'girona', 'tarragona', 'lleida'],
  'Comunitat Valenciana': ['valencia', 'alicante', 'castellon'],
  'Andalucía': ['andalucia', 'sevilla', 'malaga', 'granada', 'cordoba', 'cadiz', 'huelva', 'almeria', 'jaen'],
  'Aragón': ['aragon', 'zaragoza', 'huesca', 'teruel'],
};
const EXT_NORTE = ['Asturias', 'Galicia', 'Cantabria', 'País Vasco', 'Navarra', 'Castilla y León'];
const critE = (v, m, sin) => ({ valor: sin ? null : Math.round(Math.max(0, Math.min(1, v)) * 100) / 100, motivos: m, sin_info: Boolean(sin) });
const rxPalabra = (k) => new RegExp('(^|[^a-z0-9])' + norm(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

function extFuente(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const conocidos = { linkedin: 'LinkedIn', indeed: 'Indeed', infojobs: 'InfoJobs', tecnoempleo: 'Tecnoempleo', glassdoor: 'Glassdoor', jobandtalent: 'Jobandtalent', welcometothejungle: 'Welcome to the Jungle', greenhouse: 'Greenhouse', lever: 'Lever', workday: 'Workday', domestika: 'Domestika' };
    const k = Object.keys(conocidos).find((x) => h.includes(x));
    return k ? conocidos[k] : h;
  } catch (e) { return 'Oferta aportada por ti'; }
}

function extComunidad(texto) {
  const t = norm(texto);
  for (const [c, claves] of Object.entries(EXT_PROVINCIAS)) if (claves.some((k) => new RegExp('\\b' + k + '\\b').test(t))) return c;
  return '';
}

function extModalidad(texto) {
  const t = norm(texto);
  if (/hibrid|hybrid/.test(t)) return 'hibrido';
  if (/remot|teletrabajo|remote|anywhere|desde casa/.test(t)) return 'remoto';
  if (/presencial|on-?site/.test(t)) return 'presencial';
  return 'desconocida';
}

function extSalario(texto) {
  const m = texto.match(/(\d{2,3}(?:[.,]\d{3})|\d{2,3}\s?[kK])(\s*(?:-|–|a|y)\s*(\d{2,3}(?:[.,]\d{3})|\d{2,3}\s?[kK]))?\s*(?:€|eur|euros)?(?:\s*(?:brutos?|b\/a|\/año|anuales?|al año))?/i);
  if (!m || !/€|eur|bruto|anual|año|salario|k\b/i.test(texto.slice(Math.max(0, m.index - 40), m.index + m[0].length + 25))) return '';
  return m[0].trim();
}

function extGeografia(com, mod) {
  if (mod === 'remoto') return critE(1, ['en remoto']);
  if (com === 'Asturias') return critE(1, ['en Asturias']);
  if (EXT_NORTE.includes(com)) return critE(mod === 'hibrido' ? 0.7 : 0.6, [`en ${com} (norte)`].concat(mod === 'hibrido' ? ['híbrido'] : []));
  if (mod === 'hibrido') return critE(0.5, [com ? `híbrido en ${com}: habría que ir a la oficina algunos días` : 'híbrido sin ciudad indicada: confirma dónde está la oficina']);
  if (com) return critE(0.25, [`presencial fuera de Asturias (${com})`]);
  return critE(0, [], true);
}

function extSalarioCrit(texto) {
  if (!texto) return critE(0, [], true);
  const nums = (texto.match(/\d{2,3}(?:[.,]\d{3})+|\d{2,3}(?=\s?[kK])|\d{4,6}/g) || []).map((n) => +n.replace(/[.,]/g, '')).map((n) => (n < 1000 ? n * 1000 : n));
  if (!nums.length) return critE(0.5, [`salario publicado: ${texto}`]);
  const tope = Math.max(...nums);
  return critE(tope >= 40000 ? 1 : tope >= 32000 ? 0.8 : tope >= 26000 ? 0.6 : 0.35, [`salario publicado: ${texto}`]);
}

/* Construye una oportunidad con el mismo modelo que las del radar. */
function construirExterna(d) {
  const cfg = PERFIL_BUSQUEDA || { puestos: { 'project manager': 45, 'jefe de proyecto': 45, 'pmo': 35 }, temas: {}, lugares: {}, excluir: [] };
  const titulo = d.puesto.trim();
  const texto = [titulo, d.texto].join('\n');
  const tTit = norm(titulo); const tTodo = norm(texto);
  let rol = Object.entries(cfg.puestos).filter(([k]) => rxPalabra(k).test(tTit)).sort((a, b) => b[1] - a[1])[0];
  let rolEnTexto = false;
  if (!rol) { rol = Object.entries(cfg.puestos).filter(([k]) => rxPalabra(k).test(tTodo)).sort((a, b) => b[1] - a[1])[0]; rolEnTexto = Boolean(rol); }
  const temasE = Object.keys(cfg.temas).filter((k) => rxPalabra(k).test(tTodo));
  let enc = 0.3 + (rol ? 0.4 * rol[1] / 45 * (rolEnTexto ? 0.6 : 1) : 0) + 0.08 * Math.min(temasE.length, 4);
  const encM = [];
  if (rol) encM.push(`puesto: ${rol[0]}${rolEnTexto ? ' (en la descripción, no en el título)' : ''}`);
  else encM.push('el título no coincide con tus roles principales');
  temasE.slice(0, 5).forEach((x) => encM.push(`tema: ${x}`));
  if (/ingl[eé]s|english/.test(tTodo) && /Inglés/.test(CV.idiomas)) encM.push('piden inglés: tienes C2 (Cambridge Proficiency)');
  if (/franc[eé]s|french/.test(tTodo) && /Francés/.test(CV.idiomas)) encM.push('piden francés: tienes el DELF');
  const pideCapm = /capm/.test(tTodo);
  if (pideCapm || /pmbok|\bpmi\b/.test(tTodo)) { enc += 0.05; encM.push(pideCapm ? 'mencionan la CAPM: la tienes' : 'mencionan PMI/PMBOK: tienes la CAPM'); }

  let acc = 0.7; const accM = [];
  const excl = (cfg.excluir || []).find((k) => rxPalabra(k).test(tTit));
  if (excl) { acc -= 0.3; accM.push(`el título incluye «${excl}»: puede no corresponder a tu nivel o perfil`); }
  if (/\bsenior\b|\bsr\b|director|head of|lead\b/.test(tTit)) { acc = Math.min(acc, 0.55); accM.push('puesto sénior: revisa los años de experiencia que piden'); }
  if (/\bpmp\b/.test(tTodo) && !pideCapm) {
    if (/(valorable|se valorara|deseable|plus)[^.]{0,40}\bpmp\b/.test(tTodo)) { acc = Math.min(acc, 0.65); accM.push('valoran el PMP; tienes la CAPM (mismo organismo, nivel inicial)'); }
    else { acc -= 0.1; accM.push('piden PMP; tienes la CAPM (mismo organismo, nivel inicial)'); }
  }
  const anos = [...tTodo.matchAll(/(\d{1,2})\s*\+?\s*(?:anos|years)/g)].map((m) => +m[1]).filter((n) => n > 0 && n < 30);
  if (anos.length) { const n = Math.max(...anos); if (n >= 8) { acc -= 0.1; accM.push(`piden ${n} años de experiencia: comprueba si los cubres`); } else { acc = Math.min(acc, 0.65); accM.push(`piden ${n} años de experiencia: comprueba que los cubres`); } }
  if (/aleman|german|italiano|portugues/.test(tTodo)) { acc = Math.min(acc, 0.6); accM.push('piden otro idioma que no figura en tu CV'); }
  if (!accM.length) accM.push('no se ven requisitos que choquen con tu perfil');

  const lugarTxt = d.lugar || '';
  const com = extComunidad(lugarTxt) || extComunidad(texto.slice(0, 600));
  const mod = extModalidad(lugarTxt + ' ' + texto.slice(0, 1500));
  const sal = extSalario(d.texto || '');
  const fuente = d.url ? extFuente(d.url) : 'Oferta aportada por ti';
  const hoy = hoyISO();
  const id = 'ext:' + (hash(d.url || titulo + '|' + d.empresa) >>> 0).toString(36);
  const datos = [
    { campo: 'Empresa', valor: d.empresa || '', origen: d.empresa ? 'confirmado' : 'desconocido' },
    { campo: 'Ubicación', valor: lugarTxt || com || '', origen: lugarTxt ? 'confirmado' : com ? 'inferido' : 'desconocido' },
    { campo: 'Modalidad', valor: mod === 'desconocida' ? '' : mod, origen: mod === 'desconocida' ? 'desconocido' : 'inferido' },
  ];
  if (sal) datos.push({ campo: 'Salario', valor: sal, origen: 'inferido' });
  const conocidos = datos.filter((x) => x.valor).length;
  return {
    id, externa: true, origen: { lista: 'ext', clave: id },
    tipo: 'empleo', subtipo: 'oferta', verificacion: 'vacante_confirmada',
    titulo, organizacion: { nombre: d.empresa || '', nif: '' },
    ubicacion: { texto: lugarTxt || (mod === 'remoto' ? 'En remoto' : com), comunidad: mod === 'remoto' && !com ? 'Remoto' : com }, modalidad: mod,
    salario: { texto: sal || null }, importe: null,
    fechas: { publicada: null, plazo: null, consultada: hoy, detectada: hoy },
    fuentes: [{ nombre: fuente, url: d.url || '', consultada: hoy }],
    datos, etiquetas: [rol?.[0], ...temasE].filter(Boolean), descripcion: (d.texto || '').trim().slice(0, 6000),
    encaje: [rol?.[0], ...temasE].filter(Boolean).join(', '),
    criterios: {
      encaje: critE(enc, encM),
      necesidad: critE(1, ['vacante publicada (la has encontrado tú)']),
      geografia: extGeografia(com, mod),
      calidad: critE(d.url ? 0.8 : 0.6, [d.url ? 'oferta con enlace a la publicación' : 'sin enlace a la publicación', 'fecha de publicación: la que indique el portal']),
      salario: extSalarioCrit(sal),
      acceso: critE(acc, accM),
    },
    confianza: conocidos >= 4 ? 'alta' : conocidos >= 2 ? 'media' : 'baja',
    accion: { tipo: 'preparar_candidatura', url: d.url || '' },
  };
}

/* Las ofertas analizadas viven con el resto (en este navegador). */
function cargarExternas() {
  Object.values(ST.externas).forEach((o) => { if (!D.porId.has(o.id)) { D.ops.push(o); D.porId.set(o.id, o); } });
}
function guardarExterna(o) {
  ST.externas[o.id] = o;
  const i = D.ops.findIndex((x) => x.id === o.id);
  if (i >= 0) D.ops[i] = o; else D.ops.push(o);
  D.porId.set(o.id, o);
  delete o._p;
  guardarST();
}
function eliminarExterna(id) {
  delete ST.externas[id];
  D.ops = D.ops.filter((x) => x.id !== id);
  D.porId.delete(id);
  guardarST();
}

/* Intento de leer el enlace: solo funciona si el portal lo permite (CORS). */
async function leerEnlace(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = [].concat(JSON.parse(s.textContent)).flatMap((x) => x['@graph'] || [x]).find((x) => x['@type'] === 'JobPosting');
        if (j) {
          const desc = new DOMParser().parseFromString(j.description || '', 'text/html').body.textContent.trim();
          const loc = [].concat(j.jobLocation || []).map((l) => [l.address?.addressLocality, l.address?.addressRegion].filter(Boolean).join(', ')).filter(Boolean).join(' · ');
          return { puesto: j.title || '', empresa: j.hiringOrganization?.name || '', lugar: (j.jobLocationType === 'TELECOMMUTE' ? 'Remoto' : '') || loc, texto: desc };
        }
      } catch (e) { /* JSON-LD no válido */ }
    }
    const titulo = doc.querySelector('meta[property="og:title"]')?.content || doc.title || '';
    const texto = (doc.querySelector('main, article') || doc.body)?.textContent.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000) || '';
    return texto.length > 200 ? { puesto: titulo, empresa: '', lugar: '', texto } : null;
  } catch (e) {
    return null;
  } finally { clearTimeout(t); }
}

/* ---------- panel «Analizar oferta» ---------- */
function abrirAnalizar() {
  const d = $('#analizar');
  $('#an-res').hidden = true;
  $('#an-form').hidden = false;
  $('#an-aviso').textContent = '';
  if (!d.open) d.showModal();
  $('#an-url').focus();
}

function avisoAnalizar(txt, url) {
  const p = $('#an-aviso');
  p.replaceChildren(txt);
  if (url) { p.append(' '); p.append(enlace(url, 'Abrir la oferta ↗', 'enlace')); }
}

async function probarEnlace() {
  const url = $('#an-url').value.trim();
  if (!/^https?:\/\//i.test(url)) return;
  const portal = extFuente(url);
  avisoAnalizar('Intentando leer la oferta…');
  const r = await leerEnlace(url);
  if (r) {
    if (!$('#an-puesto').value) $('#an-puesto').value = r.puesto.replace(/\s*[|–-]\s*[^|–-]*$/, '').trim();
    if (!$('#an-empresa').value) $('#an-empresa').value = r.empresa;
    if (!$('#an-lugar').value) $('#an-lugar').value = r.lugar;
    if (!$('#an-texto').value) $('#an-texto').value = r.texto;
    avisoAnalizar('Oferta leída. Revisa los datos y pulsa «Analizar oferta».');
  } else {
    avisoAnalizar(`${portal} no deja que otras webs lean sus ofertas. Abre la oferta, copia la descripción completa y pégala abajo.`, url);
  }
}

/* Si los campos están vacíos, propone puesto y empresa a partir de las primeras líneas pegadas. */
function sugerirDesdeTexto() {
  const lineas = $('#an-texto').value.split('\n').map((x) => x.trim()).filter(Boolean);
  if (!lineas.length) return;
  if (!$('#an-puesto').value && lineas[0].length <= 100) $('#an-puesto').value = lineas[0];
  if (!$('#an-empresa').value && lineas[1] && lineas[1].length <= 60 && !/[.:]$/.test(lineas[1])) $('#an-empresa').value = lineas[1].replace(/\s*·.*$/, '');
  if (!$('#an-lugar').value) { const l = lineas.slice(0, 6).find((x) => extComunidad(x) || /remot|híbrid|hibrid/i.test(x)); if (l && l.length < 80) $('#an-lugar').value = l; }
}

function pintarResultado(o) {
  const p = puntuar(o);
  const res = $('#an-res');
  res.replaceChildren();
  const cab = el('div', 'an-cab');
  const t = el('div');
  t.append(el('p', 'eyebrow', 'Oferta analizada · ' + o.fuentes[0].nombre), el('h3', null, o.titulo));
  const sub = [o.organizacion.nombre, lugarYModalidad(o)].filter(Boolean).join(' · ');
  if (sub) t.append(el('p', 'ficha-sub', sub));
  const n = el('div', 'panel-nota');
  n.append(el('b', 'n-' + (p.total >= 75 ? 'alta' : p.total >= 60 ? 'media' : 'baja'), String(p.total)), el('span', null, 'prioridad · encaje ' + nivelEncaje(o)));
  cab.append(t, n);
  res.append(cab, analisis(o));
  const acc = el('div', 'an-acc');
  const bot = (ico, titulo, sub2, fn, href) => {
    const b = href ? el('a', 'an-boton') : el('button', 'an-boton');
    if (href) { b.href = href; b.target = '_blank'; b.rel = 'noopener'; } else { b.type = 'button'; b.addEventListener('click', fn); }
    const s = el('span', 'an-ico', ico); s.setAttribute('aria-hidden', 'true');
    const tx = el('span', 'an-tx'); tx.append(el('b', null, titulo), el('small', null, sub2));
    b.append(s, tx);
    return b;
  };
  acc.append(
    bot('📄', 'CV adaptado', 'A4 listo para guardar en PDF', null, cvUrl('ext', o.id)),
    bot('✦', 'Propuesta de valor', 'Qué aportas, con pruebas de tu CV', () => abrirFichaEn(o.id, 'fi-propuesta')),
    bot('✉', 'Carta de motivación', 'Borrador para revisar y enviar', () => abrirFichaEn(o.id, 'fi-carta')));
  res.append(acc);
  const pie = el('div', 'acciones an-pie');
  const fav = boton(ST.fav[o.id] ? '♥ En Seguimiento' : '♡ Guardar en Seguimiento', 'btn sec', () => { toggleFav(o.id); fav.textContent = ST.fav[o.id] ? '♥ En Seguimiento' : '♡ Guardar en Seguimiento'; pintar(); });
  pie.append(boton('Ver ficha completa', 'btn sec', () => abrirFichaEn(o.id)), fav, boton('Analizar otra oferta', 'enlace', () => { $('#an-form').reset(); abrirAnalizar(); }));
  res.append(pie, el('p', 'nota', 'Guardada solo en este navegador. La encontrarás en Oportunidades (fuente «' + o.fuentes[0].nombre + '») y, si la guardas, en Seguimiento.'));
  $('#an-form').hidden = true;
  res.hidden = false;
  $('#analizar').scrollTop = 0;
}

function abrirFichaEn(id, seccion) {
  const d = $('#analizar');
  if (d.open) d.close();
  abrirFicha(id);
  if (!seccion) return;
  setTimeout(() => {
    const s = document.getElementById(seccion);
    if (!s) return;
    const cap = s.closest('details'); if (cap) cap.open = true;
    s.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

$('#abrir-analizar').addEventListener('click', abrirAnalizar);
$('#an-url').addEventListener('change', probarEnlace);
$('#an-leer').addEventListener('click', probarEnlace);
$('#an-texto').addEventListener('change', sugerirDesdeTexto);
$('#an-form').addEventListener('submit', (e) => {
  e.preventDefault();
  sugerirDesdeTexto();
  const datos = { url: $('#an-url').value.trim(), texto: $('#an-texto').value, puesto: $('#an-puesto').value, empresa: $('#an-empresa').value.trim(), lugar: $('#an-lugar').value.trim() };
  if (!datos.puesto.trim()) { avisoAnalizar('Indica el puesto para poder analizarla.'); $('#an-puesto').focus(); return; }
  if (!datos.texto.trim()) { avisoAnalizar('Pega el texto de la oferta: sin él solo se puede valorar el título.'); $('#an-texto').focus(); return; }
  const o = construirExterna(datos);
  instantanea(o.id);
  guardarExterna(o);
  instantanea(o.id);
  guardarST();
  pintarResultado(o);
  pintar();
});

/* ---------- carta de motivación ---------- */
const CARTA_SECTOR = { gestion: 'la dirección de proyectos', museo: 'proyectos de musealización y patrimonio', geo: 'proyectos de datos geoespaciales y 3D', ia: 'proyectos de tecnología e inteligencia artificial', industrial: 'proyectos de ingeniería e instalaciones', marketing: 'proyectos de transformación digital' };

function generarCarta(o) {
  const pr = construirPropuesta(o);
  const empresa = (o.organizacion.nombre || '').trim();
  const aprobada = ST.prop[o.id]?.aprobada ? aportacionesParaCorreo(ST.prop[o.id].texto) : '';
  const aport = aprobada || pr.aportaciones.map((a) => '- ' + a.t).join('\n');
  let perfil = CV.temas[pr.tema].perfil;
  if (/^[A-Z][^.]{0,60} con /.test(perfil)) perfil = 'Soy ' + perfil;
  const partes = [
    `${empresa ? 'Estimado equipo de ' + empresa : 'Estimado equipo de selección'}:`,
    `Me pongo en contacto con ustedes para presentar mi candidatura al puesto de ${o.titulo}.`,
    perfil,
  ];
  if (aport) partes.push('Por lo que describe la oferta, creo que podría aportar desde el primer momento:\n' + aport);
  partes.push(`Me motiva la posibilidad de seguir desarrollando mi carrera en ${CARTA_SECTOR[pr.tema]}${empresa ? ' en ' + empresa : ''} y de poner esta experiencia al servicio de su equipo.`);
  if (PREF.disponibilidad) partes.push(`Mi disponibilidad para incorporarme es ${PREF.disponibilidad.replace(/\.$/, '')}.`);
  partes.push('Adjunto mi currículum y quedo a su disposición para ampliar cualquier información en una entrevista.');
  partes.push(firma());
  return partes.join('\n\n');
}

function imprimirCarta(texto, o) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc2 = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let tel = ''; try { tel = localStorage.getItem('radar-telefono') || ''; } catch (e) { tel = ''; }
  const fechaHoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Carta de motivación - ${esc2(o.organizacion.nombre || o.titulo)}</title>
<style>@page{size:A4;margin:22mm 20mm}body{font:11pt/1.55 "IBM Plex Sans","Segoe UI",sans-serif;color:#18232d;max-width:170mm;margin:0 auto}
.rem{margin-bottom:10mm}.rem b{font-size:14pt;display:block}.rem span{color:#5d6a75;font-size:10pt}.fecha{text-align:right;margin-bottom:8mm;color:#5d6a75}
p{margin:0 0 4mm;white-space:pre-wrap}</style></head><body>
<div class="rem"><b>${esc2(CV.nombre)}</b><span>${esc2([CV.ciudad, tel, CV.email, CV.linkedin].filter(Boolean).join(' · '))}</span></div>
<div class="fecha">Gijón, ${fechaHoy}</div>
${texto.split(/\n{2,}/).map((x) => `<p>${esc2(x)}</p>`).join('')}
<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function seccionCarta(o) {
  const s = el('section', 'carta'); s.id = 'fi-carta';
  const guardada = ST.cartas[o.id];
  s.append(el('p', 'nota', 'Borrador hecho solo con datos de tu CV y tu propuesta de valor (la aprobada, si la hay). Revísalo y personalízalo: RADAR no envía nada.'));
  const area = el('textarea', 'prop-texto'); area.rows = 16;
  area.setAttribute('aria-label', 'Carta de motivación');
  area.value = guardada?.texto || generarCarta(o);
  const estado = el('p', 'nota', guardada ? 'Editada el ' + fechaHora(guardada.f) : 'Sin guardar: es el borrador generado.');
  const acc = el('div', 'acciones');
  acc.append(
    boton('Guardar cambios', 'btn mini', () => { ST.cartas[o.id] = { texto: area.value, f: new Date().toISOString() }; guardarST(); estado.textContent = 'Editada el ' + fechaHora(ST.cartas[o.id].f); }),
    boton('Copiar', 'btn sec mini', function () { copiar(this, area.value); }),
    boton('Descargar PDF', 'btn sec mini', () => imprimirCarta(area.value, o)),
    boton('Volver a generar', 'enlace', () => { delete ST.cartas[o.id]; guardarST(); area.value = generarCarta(o); estado.textContent = 'Sin guardar: es el borrador generado.'; }));
  s.append(area, estado, acc);
  return s;
}
