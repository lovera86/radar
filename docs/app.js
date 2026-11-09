'use strict';

const PERFIL = {
  nombre: 'Rocío Lovera García',
  email: 'rlovera86@gmail.com',
  linkedin: 'linkedin.com/in/rociolovera',
};
const NORTE = ['Asturias', 'Galicia', 'Cantabria', 'País Vasco', 'Navarra', 'Castilla y León'];

const estado = { filas: [], zona: '', minimo: 0, texto: '', vista: '' };

/* Candidaturas enviadas: se guardan en este navegador (clave del contrato -> fecha). */
const CLAVE_APLICADAS = 'radar-aplicadas';
const aplicadas = (() => { try { return JSON.parse(localStorage.getItem(CLAVE_APLICADAS)) || {}; } catch (e) { return {}; } })();
function guardarAplicadas() { try { localStorage.setItem(CLAVE_APLICADAS, JSON.stringify(aplicadas)); } catch (e) { /* sin almacenamiento */ } }
function marcar(r, si) {
  if (si) aplicadas[r.clave] = new Date().toISOString().slice(0, 10); else delete aplicadas[r.clave];
  guardarAplicadas(); chipsVista(); pintar();
}
const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 864e5);
const $ = (s) => document.querySelector(s);
const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const eur = (v) => (v == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v));
const eurCorto = (v) => (v >= 1e6 ? (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' M€' : Math.round(v / 1e3).toLocaleString('es-ES') + ' k€');
const fecha = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const enlace = (href, txt, cls) => { const a = el('a', cls || 'btn sec', txt); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };

async function cargar() {
  try {
    const [filas, meta] = await Promise.all([
      fetch('data/panel.json', { cache: 'no-store' }).then((r) => r.json()),
      fetch('data/meta.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    ]);
    estado.filas = filas;
    resumen(meta);
    chipsZona();
    chipsVista();
    pintar();
  } catch (e) {
    $('#lista').replaceChildren(el('p', 'vacio', 'No se han podido cargar las oportunidades. Vuelve a intentarlo en unos minutos.'));
  }
}

function resumen(meta) {
  const f = estado.filas;
  $('#st-n').textContent = f.length.toLocaleString('es-ES');
  $('#st-norte').textContent = f.filter((r) => NORTE.includes(r.comunidad)).length.toLocaleString('es-ES');
  $('#st-importe').textContent = eurCorto(f.reduce((s, r) => s + (r.importe || 0), 0));
  $('#st-fecha').textContent = meta.actualizado ? new Date(meta.actualizado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
}

function chipsZona() {
  const cuenta = new Map();
  estado.filas.forEach((r) => cuenta.set(r.comunidad, (cuenta.get(r.comunidad) || 0) + 1));
  const zonas = [['', 'Toda España'], ['__norte', 'Norte de España']];
  ['Asturias', 'Galicia'].forEach((z) => zonas.push([z, z]));
  [...cuenta.entries()].sort((a, b) => b[1] - a[1])
    .filter(([z]) => z && !['Asturias', 'Galicia', 'Sin especificar'].includes(z)).slice(0, 6)
    .forEach(([z]) => zonas.push([z, z]));
  const cont = $('#f-zona');
  cont.replaceChildren(...zonas.map(([v, t]) => {
    const b = el('button', 'chip' + (v === estado.zona ? ' on' : ''), t);
    b.type = 'button'; b.dataset.v = v;
    const n = v === '' ? estado.filas.length : v === '__norte' ? estado.filas.filter((r) => NORTE.includes(r.comunidad)).length : (cuenta.get(v) || 0);
    b.append(el('span', null, ' · ' + n));
    return b;
  }));
}

function chipsVista() {
  const n = estado.filas.filter((r) => aplicadas[r.clave]).length;
  const ops = [['', 'Todas', estado.filas.length], ['no', 'Pendientes', estado.filas.length - n], ['si', 'Aplicadas', n]];
  $('#f-vista').replaceChildren(...ops.map(([v, t, c]) => {
    const b = el('button', 'chip' + (v === estado.vista ? ' on' : ''), t);
    b.type = 'button'; b.dataset.v = v; b.append(el('span', null, ' · ' + c));
    return b;
  }));
}

function filtradas() {
  const t = norm(estado.texto);
  return estado.filas.filter((r) =>
    r.puntuacion >= estado.minimo
    && (!estado.zona || (estado.zona === '__norte' ? NORTE.includes(r.comunidad) : r.comunidad === estado.zona))
    && (!estado.vista || (estado.vista === 'si') === Boolean(aplicadas[r.clave]))
    && (!t || norm([r.empresa, r.contrato, r.cliente, r.region].join(' ')).includes(t)))
    .sort((a, b) => b.puntuacion - a.puntuacion || String(b.fecha).localeCompare(String(a.fecha)));
}

function anillo(p) {
  const NS = 'http://www.w3.org/2000/svg', r = 26, c = 2 * Math.PI * r;
  const d = el('div', 'anillo');
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('aria-hidden', 'true');
  const mk = (cls, extra) => { const ci = document.createElementNS(NS, 'circle'); ci.setAttribute('cx', 32); ci.setAttribute('cy', 32); ci.setAttribute('r', r); ci.setAttribute('class', cls); Object.entries(extra || {}).forEach(([k, v]) => ci.setAttribute(k, v)); return ci; };
  svg.append(mk('fondo'), mk('valor', { 'stroke-dasharray': `${c * p / 100} ${c}` }));
  d.append(svg, el('b', null, p));
  d.setAttribute('role', 'img'); d.setAttribute('aria-label', `Encaje ${p} sobre 100`);
  return d;
}

function tarjeta(r) {
  const hecha = aplicadas[r.clave];
  const art = el('article', 'op ' + (r.puntuacion >= 80 ? 'alto' : r.puntuacion >= 60 ? 'medio' : 'bajo') + (hecha ? ' hecha' : ''));
  const cuerpo = el('div');
  const h = el('h3', null, r.empresa);
  cuerpo.append(h);
  if (r.ciudad_empresa) cuerpo.append(el('span', 'ciudad', r.ciudad_empresa));
  cuerpo.append(el('p', 'proyecto', r.contrato));
  if (r.cliente) cuerpo.append(el('p', 'cliente', 'Cliente: ' + r.cliente));
  const meta = el('div', 'meta');
  meta.append(el('span', 'importe', eur(r.importe)), el('span', null, r.region), el('span', null, 'Adjudicado ' + fecha(r.fecha)));
  cuerpo.append(meta);
  if (r.encaje) {
    const tags = el('div', 'tags');
    r.encaje.split(', ').filter(Boolean).slice(0, 5).forEach((t) => tags.append(el('span', 'tag', t)));
    cuerpo.append(tags);
  }
  const acc = el('div', 'acciones');
  const b = el('button', 'btn', 'Aplicar'); b.type = 'button'; b.onclick = () => abrirFicha(r);
  const bH = el('button', 'btn sec marca' + (hecha ? ' on' : ''), hecha ? '✓ Aplicado · ' + fecha(hecha) : 'Marcar aplicado');
  bH.type = 'button'; bH.setAttribute('aria-pressed', hecha ? 'true' : 'false');
  bH.title = hecha ? 'Pulsa para desmarcar' : 'Marca que ya has enviado tu candidatura';
  bH.onclick = () => marcar(r, !hecha);
  acc.append(b, bH);
  if (hecha && diasDesde(hecha) >= 7) acc.append(el('span', 'insistir', 'Han pasado ' + diasDesde(hecha) + ' días: toca insistir'));
  if (/^https:\/\//.test(r.url || '')) acc.append(enlace(r.url, 'Ver licitación'));
  if (r.email) acc.append(el('span', 'contacto-ok', '✓ contacto verificado'));
  cuerpo.append(acc);
  art.append(anillo(r.puntuacion), cuerpo);
  return art;
}

function pintar() {
  const filas = filtradas();
  $('#cuenta').textContent = `${filas.length} de ${estado.filas.length}`;
  const lista = $('#lista');
  if (!filas.length) lista.replaceChildren(el('p', 'vacio', 'Ningún contrato cumple estos filtros. Prueba con otra zona o con un encaje menor.'));
  else lista.replaceChildren(...filas.map(tarjeta));
  empresas(filas);
}

function empresas(filas) {
  const m = new Map();
  filas.forEach((r) => m.set(r.empresa, (m.get(r.empresa) || 0) + 1));
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = top.length ? top[0][1] : 1;
  $('#empresas').replaceChildren(...top.map(([n, c]) => {
    const li = el('li');
    const fila = el('div', 'fila'); fila.append(el('span', null, n), el('span', null, c));
    const barra = el('div', 'barra'); const i = el('i'); i.style.width = (100 * c / max) + '%'; barra.append(i);
    li.append(fila, barra);
    return li;
  }));
}

function tema(r) {
  const t = norm(r.encaje + ' ' + r.contrato);
  if (/fotogram|batimetr|lidar|nube|cartograf|topograf|ortofoto|dron|teledetec/.test(t))
    return 'proyectos de batimetría, fotogrametría y procesamiento de nubes de puntos para el análisis 3D del territorio';
  if (/musealiz|museograf|exposici|museo|interpretacion|expositiv/.test(t))
    return 'proyectos de musealización como el del Observatorio Marino del Puerto de Vigo (Atlántida) y el museo virtual del Parque Natural de Corrubedo';
  if (/inteligencia artificial|machine learning|aprendizaje|gemelo|digital twin|visor 3d/.test(t))
    return 'proyectos de inteligencia artificial y gemelos digitales, como ForestScape 3D Analytics y la plataforma RURAL IA 3D';
  return 'proyectos de ingeniería, transformación digital e inteligencia artificial';
}

function correo(r) {
  const corto = r.contrato.length > 70 ? r.contrato.slice(0, 68).replace(/\s+\S*$/, '') + '…' : r.contrato;
  const asunto = `Project Manager para el proyecto «${corto}»`;
  const cuerpo = `Hola, equipo de ${r.empresa}:

He visto que habéis resultado adjudicatarios del contrato «${r.contrato}»${r.cliente ? ' para ' + r.cliente : ''}. ¡Enhorabuena!

Soy Project Manager, con formación en Ingeniería Técnica Industrial (Mecánica), Máster en Project Management por la Universitat Politècnica de València y certificación CAPM. En Gárgola Lab dirijo ${tema(r)}, coordinando alcance, plazos, costes, proveedores y relación con el cliente.

Si para ejecutar este proyecto, o los que vengan, necesitáis reforzar el equipo con alguien que lo coordine de principio a fin, me encantaría hablar con vosotros. Os adjunto mi CV.

Un saludo,
${PERFIL.nombre}
${PERFIL.email}
${PERFIL.linkedin}`;
  return { asunto, cuerpo };
}

function copiar(btn, texto) {
  const original = btn.textContent;
  const hecho = (t) => { btn.textContent = t; setTimeout(() => { btn.textContent = original; }, 1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => hecho('Copiado'), () => hecho('Copia a mano'));
  else hecho('Copia a mano');
}

function abrirFicha(r) {
  const { asunto, cuerpo } = correo(r);
  $('#ap-titulo').textContent = r.empresa;
  $('#ap-proyecto').textContent = r.contrato;
  const c = $('#ap-contacto');
  c.replaceChildren();
  c.append(el('p', 'campo', 'Email'));
  c.append(r.email ? el('p', 'dato', r.email) : el('p', 'aviso', 'Aún no hay un email verificado. Busca a la persona en LinkedIn o la web de la empresa.'));
  if (r.telefono) c.append(el('p', 'campo', 'Teléfono de la empresa'), el('p', 'dato', r.telefono));
  const empresaLimpia = r.empresa.replace(/,?\s*(S\.?L\.?U?|S\.?A\.?|UTE)\.?$/i, '');
  const busq = $('#ap-busqueda');
  busq.replaceChildren(enlace('https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(empresaLimpia + ' proyectos'), 'Responsable en LinkedIn'));
  busq.append(r.web ? enlace(r.web, 'Web de contacto') : enlace('https://www.google.com/search?q=' + encodeURIComponent(r.empresa + ' ' + (r.ciudad_empresa || '') + ' contacto'), 'Buscar su web'));
  $('#ap-asunto').textContent = asunto;
  $('#ap-mensaje').textContent = cuerpo;
  const acc = $('#ap-acciones');
  const gmail = 'https://mail.google.com/mail/?view=cm&fs=1' + (r.email ? '&to=' + encodeURIComponent(r.email) : '') + '&su=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
  const bM = el('button', 'btn sec', 'Copiar mensaje'); bM.type = 'button'; bM.onclick = () => copiar(bM, cuerpo);
  const bA = el('button', 'btn sec', 'Copiar asunto'); bA.type = 'button'; bA.onclick = () => copiar(bA, asunto);
  const bG = enlace(gmail, 'Abrir en Gmail', 'btn');
  bG.addEventListener('click', () => { if (!aplicadas[r.clave]) { marcar(r, true); bG.after(el('span', 'contacto-ok', '✓ Marcada como aplicada')); } });
  acc.replaceChildren(bG, bM, bA);
  if (r.email) { const bE = el('button', 'btn sec', 'Copiar email'); bE.type = 'button'; bE.onclick = () => copiar(bE, r.email); acc.append(bE); }
  const d = $('#aplicar');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

/* Filtros */
$('#f-zona').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  estado.zona = b.dataset.v; chipsZona(); pintar();
});
$('#f-encaje').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  estado.minimo = +b.dataset.v;
  $('#f-encaje').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
  pintar();
});
$('#f-vista').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  estado.vista = b.dataset.v; chipsVista(); pintar();
});
$('#f-texto').addEventListener('input', (e) => { estado.texto = e.target.value; pintar(); });
$('#aplicar').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

/* Nube de puntos de la cabecera */
(function nube() {
  const cv = $('#nube'); const ctx = cv.getContext('2d');
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, puntos, t = 0;
  const h = (u, v) => 0.55 * Math.sin(u * 2.1 + 0.6) * Math.cos(v * 1.7) + 0.3 * Math.sin(u * 5.3 + v * 3.1) + 0.15 * Math.cos(u * 9.7 - v * 6.2);
  function init() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    puntos = Array.from({ length: Math.round(W * H / 90) }, () => ({ u: rnd(), v: rnd() }));
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of puntos) {
      const depth = 0.35 + 0.65 * p.v;
      const x = p.u * W;
      const y = H * (1.02 - 0.8 * p.v) - 60 * depth * h(p.u * 3.2 + t, p.v * 2.5);
      const a = (0.08 + 0.35 * depth) * (0.35 + 0.65 * Math.min(1, x / (W * 0.5)));
      ctx.fillStyle = `rgba(143,211,199,${a})`;
      ctx.fillRect(x, y, 1 + depth, 1 + depth);
    }
    t += 0.0012;
    if (!quieto && !document.hidden) requestAnimationFrame(frame);
  }
  init(); frame();
  window.addEventListener('resize', () => { init(); if (quieto) frame(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !quieto) requestAnimationFrame(frame); });
})();

cargar();
