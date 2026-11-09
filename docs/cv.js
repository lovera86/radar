'use strict';
/* CV adaptado: lee la oferta del radar (?l=lista&k=clave&e=empresa), elige el
   enfoque que mejor encaja, ordena la experiencia y genera un A4 listo para PDF. */

const $ = (s) => document.querySelector(s);
const sinPunto = (s) => String(s || '').replace(/\.+$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ARCHIVOS = { emp: 'empleos', pub: 'publico', adj: 'panel', ab: 'abiertas' };
const params = new URLSearchParams(location.search);
const lista = params.get('l') || '';
const clave = params.get('k') || '';
const empresaParam = params.get('e') || '';
const leer = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };

function describir(o) {
  if (!o) return { puesto: '', empresa: empresaParam, texto: '', objetivo: '' };
  const corto = (s) => (s.length > 90 ? s.slice(0, 88).replace(/\s+\S*$/, '') + '…' : s);
  if (lista === 'emp') {
    return { puesto: o.titulo, empresa: o.empresa, texto: [o.titulo, o.encaje, o.empresa].join(' '),
      objetivo: `Incorporarme como ${o.titulo}${o.empresa ? ' en ' + sinPunto(o.empresa) : ''}.` };
  }
  if (lista === 'adj') {
    return { puesto: 'Project Manager', empresa: o.empresa, texto: [o.contrato, o.encaje, o.cliente].join(' '),
      objetivo: `Dirigir la ejecución del proyecto «${corto(o.contrato)}»${o.empresa ? ' para ' + sinPunto(o.empresa) : ''}.` };
  }
  if (lista === 'ab') {
    const emp = empresaParam || '';
    return { puesto: 'Jefa de proyecto', empresa: emp, texto: [o.contrato, o.encaje, (o.criterios || []).map((c) => c.texto).join(' ')].join(' '),
      objetivo: `Formar parte de la oferta${emp ? ' de ' + emp : ''} a «${corto(o.contrato)}» como jefa de proyecto.` };
  }
  const [resol, plaza] = (o.titulo || '').split(' — ');
  return { puesto: plaza || resol, empresa: o.organismo, texto: [o.titulo, o.encaje].join(' '), objetivo: '' };
}

function elegirTema(texto) {
  const puntos = Object.entries(CV.temas).map(([k, t]) => {
    const m = texto.match(new RegExp(t.detectar.source, 'gi'));
    return [k, (m ? m.length : 0) + (k === 'gestion' ? 0.5 : 0)];
  }).sort((a, b) => b[1] - a[1]);
  return { principal: puntos[0][0], secundario: puntos[1][1] >= 2 ? puntos[1][0] : '' };
}

const LEGIBLE = { museograf: 'Museografía', musealiz: 'Musealización', exposici: 'Exposiciones', exposicion: 'Exposiciones', museo: 'Museos', fotogrametr: 'Fotogrametría',
  batimetr: 'Batimetría', cartograf: 'Cartografía', topograf: 'Topografía', lidar: 'LiDAR', gis: 'GIS', bim: 'BIM', pmo: 'PMO',
  'nube de puntos': 'Nubes de puntos', 'nubes de puntos': 'Nubes de puntos', 'inteligencia artificial': 'Inteligencia artificial', 'ia generativa': 'IA generativa',
  'gemelo digital': 'Gemelo digital', 'digital twin': 'Gemelo digital', digitalizacion: 'Digitalización', 'transformacion digital': 'Transformación digital',
  innovacion: 'Innovación', ingenieria: 'Ingeniería', energia: 'Energía', capm: 'CAPM', 'puntúa el jefe de proyecto': 'Dirección de proyecto',
  'gestión de proyectos': 'Gestión de proyectos', 'ingeniería técnica': 'Ingeniería técnica' };
const legible = (s) => LEGIBLE[s.toLowerCase()] || s.charAt(0).toUpperCase() + s.slice(1);

function palabrasClave(o) {
  if (!o || !o.encaje) return [];
  const fuera = /asturias|galicia|madrid|remoto|teletrabajo|universidad|coru|vasco|navarra|cantabria|^es\d|^cpv|tema afín|puesto técnico|grupo a2/i;
  return [...new Set(o.encaje.split(', ').map((s) => s.trim()).filter((s) => s && !fuera.test(s)).map(legible))].slice(0, 6);
}

function pintar(o, info, tema) {
  const t = CV.temas[tema.principal];
  const tel = leer('radar-telefono');
  const conObjetivo = $('#con-objetivo').checked && info.objetivo;
  const puntua = (v) => (v.temas.includes(tema.principal) ? 2 : 0) + (tema.secundario && v.temas.includes(tema.secundario) ? 1 : 0);

  const otras = [];
  const trabajos = CV.experiencia.map((x, i) => {
    const vin = x.vinetas.map((v, j) => ({ ...v, p: puntua(v), j }));
    const utiles = vin.filter((v) => v.p > 0).sort((a, b) => b.p - a.p || a.j - b.j);
    if (!x.siempre && !utiles.length) { otras.push(`${x.puesto} · ${x.empresa} (${x.fechas.replace(/[a-z.]+ /g, '')})`); return ''; }
    const max = i === 0 ? 6 : 3;
    const elegidas = (utiles.length ? utiles : vin.slice(0, 1)).slice(0, max);
    return `<div class="trabajo">
      <div class="trabajo-cab"><div><span class="puesto">${esc(x.puesto)}</span> · <span class="empresa">${esc(x.empresa)}</span>${x.nota ? ' (' + esc(x.nota) + ')' : ''}</div><div class="fechas">${esc(x.fechas)}</div></div>
      <ul>${elegidas.map((v) => `<li>${v.t}</li>`).join('')}</ul></div>`;
  }).join('');

  const claves = palabrasClave(o);
  const habilidades = [...t.habilidades];
  if (tema.secundario) CV.temas[tema.secundario].habilidades.slice(0, 3).forEach((h) => { if (!habilidades.includes(h)) habilidades.push(h); });

  $('#hoja').innerHTML = `
    <div class="cabecera">
      <h1>${esc(CV.nombre)}</h1>
      <div class="titular" contenteditable="true">${esc(t.titular)}</div>
      <div class="contacto"><span>${esc(CV.ciudad)}</span>${tel ? `<span>${esc(tel)}</span>` : ''}<span>${esc(CV.email)}</span><span>${esc(CV.linkedin)}</span></div>
    </div>
    ${conObjetivo ? `<p class="objetivo" contenteditable="true"><b>Objetivo:</b> ${esc(info.objetivo)}</p>` : ''}
    <h2>Perfil</h2>
    <p contenteditable="true">${esc(t.perfil)}</p>
    <p contenteditable="true">${esc(t.perfil2)}</p>
    <h2>Competencias</h2>
    <div class="chips">${claves.map((c) => `<span class="clave">${esc(c)}</span>`).join('')}${habilidades.map((h) => `<span>${esc(h)}</span>`).join('')}</div>
    <h2>Experiencia</h2>
    ${trabajos}
    ${otras.length ? `<p class="otra"><b>Otra experiencia:</b> ${otras.map(esc).join(' · ')}</p>` : ''}
    <h2>Formación y certificaciones</h2>
    <div class="rejilla">${CV.formacion.map((f) => `<div class="edu"><b>${esc(f.t)}</b><br>${esc(f.d)}</div>`).join('')}</div>
    <h2>Idiomas y otros</h2>
    <p>${esc(CV.idiomas)} · ${esc(CV.extra)}</p>`;
}

async function iniciar() {
  let o = null;
  if (ARCHIVOS[lista] && clave) {
    try {
      const filas = await fetch(`data/${ARCHIVOS[lista]}.json`, { cache: 'no-store' }).then((r) => r.json());
      o = filas.find((r) => r.clave === clave) || null;
    } catch (e) { o = null; }
  }
  const info = describir(o);
  const cab = $('#oferta');
  cab.innerHTML = o
    ? `<b>CV para: ${esc(info.puesto)}</b><span>${esc(info.empresa || '')}</span>`
    : '<b>CV general</b><span>Abre esta página desde el botón «CV adaptado» de una oportunidad para adaptarlo.</span>';
  const auto = elegirTema(info.texto);
  const sel = $('#tema');
  sel.innerHTML = Object.entries(CV.temas).map(([k, t]) => `<option value="${k}"${k === auto.principal ? ' selected' : ''}>${esc(t.nombre)}${k === auto.principal && o ? ' (recomendado)' : ''}</option>`).join('');
  const tema = { ...auto };
  const telefono = $('#telefono');
  telefono.value = leer('radar-telefono');
  const repintar = () => pintar(o, info, tema);
  sel.addEventListener('change', () => { tema.principal = sel.value; tema.secundario = auto.principal !== sel.value ? auto.principal : auto.secundario; repintar(); });
  $('#con-objetivo').addEventListener('change', repintar);
  telefono.addEventListener('change', () => { guardar('radar-telefono', telefono.value.trim()); repintar(); });
  $('#pdf').addEventListener('click', () => window.print());
  document.title = `CV Rocío Lovera${info.empresa ? ' - ' + info.empresa : ''}`.replace(/[\\/:*?"<>|]/g, '');
  repintar();
}

iniciar();
