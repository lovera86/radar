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
const idiomaParam = params.get('lang') || '';
let IDIOMA = 'es';
const leer = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };

function describir(o) {
  if (!o) return { puesto: '', empresa: empresaParam, texto: '', objetivo: '' };
  const corto = (s) => (s.length > 90 ? s.slice(0, 88).replace(/\s+\S*$/, '') + '…' : s);
  if (lista === 'ext') {
    const empresa = o.organizacion?.nombre || '';
    return { puesto: o.titulo, empresa, texto: [o.titulo, o.encaje, o.descripcion].join(' '),
      objetivo: `Incorporarme como ${o.titulo}${empresa ? ' en ' + sinPunto(empresa) : ''}.`,
      objetivoEn: `To join ${empresa ? sinPunto(empresa) + ' ' : ''}as ${o.titulo}.` };
  }
  if (lista === 'emp') {
    return { puesto: o.titulo, empresa: o.empresa, texto: [o.titulo, o.encaje, o.empresa, o.descripcion || ''].join(' '),
      objetivo: `Incorporarme como ${o.titulo}${o.empresa ? ' en ' + sinPunto(o.empresa) : ''}.`,
      objetivoEn: `To join ${o.empresa ? sinPunto(o.empresa) + ' ' : ''}as ${o.titulo}.` };
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
const LEGIBLE_EN = { 'digital twin': 'Digital twin', 'nube de puntos': 'Point clouds', 'nubes de puntos': 'Point clouds', 'inteligencia artificial': 'Artificial intelligence', 'ia generativa': 'Generative AI', 'gemelo digital': 'Digital twin', 'transformacion digital': 'Digital transformation',
  'transformación digital': 'Digital transformation', digitalizacion: 'Digitalisation', innovacion: 'Innovation', ingenieria: 'Engineering', industria: 'Industry', energia: 'Energy',
  museo: 'Museums', museograf: 'Museography', musealiz: 'Museum design', patrimonio: 'Heritage', exposici: 'Exhibitions', fotogrametr: 'Photogrammetry', cartograf: 'Cartography',
  batimetr: 'Bathymetry', topograf: 'Surveying', puerto: 'Ports', naval: 'Naval', 'jefe de proyecto': 'Project management', 'jefa de proyecto': 'Project management',
  'jefe de proyectos': 'Project management', 'gestión de proyectos': 'Project management', 'director de proyecto': 'Project management', 'i+d': 'R&D' };
const legible = (s) => (IDIOMA === 'en' && LEGIBLE_EN[s.toLowerCase()]) || LEGIBLE[s.toLowerCase()] || s.charAt(0).toUpperCase() + s.slice(1);
const TXT = {
  es: { perfil: 'Perfil', comp: 'Competencias', exp: 'Experiencia', otra: 'Otra experiencia', form: 'Formación y certificaciones', idi: 'Idiomas y otros', obj: 'Objetivo' },
  en: { perfil: 'Profile', comp: 'Skills', exp: 'Experience', otra: 'Other experience', form: 'Education and certifications', idi: 'Languages and other', obj: 'Objective' },
};

function palabrasClave(o) {
  if (!o || !o.encaje) return [];
  const fuera = /asturias|galicia|madrid|remoto|teletrabajo|universidad|coru|vasco|navarra|cantabria|^es\d|^cpv|tema afín|puesto técnico|grupo a2/i;
  return [...new Set(o.encaje.split(', ').map((s) => s.trim()).filter((s) => s && !fuera.test(s)).map(legible))].slice(0, 6);
}

function pintar(o, info, tema) {
  const C = IDIOMA === 'en' ? CV_EN : CV;
  const L = TXT[IDIOMA];
  document.documentElement.lang = IDIOMA;
  const t = C.temas[tema.principal];
  const tel = leer('radar-telefono');
  const objetivo = IDIOMA === 'en' ? info.objetivoEn : info.objetivo;
  const conObjetivo = $('#con-objetivo').checked && objetivo;
  const puntua = (v) => (v.temas.includes(tema.principal) ? 2 : 0) + (tema.secundario && v.temas.includes(tema.secundario) ? 1 : 0);

  const otras = [];
  const trabajos = C.experiencia.map((x, i) => {
    let oc = {}; try { oc = (JSON.parse(localStorage.getItem('radar-perfil')) || {}).ocultos || {}; } catch (e) { oc = {}; }
    const vin = x.vinetas.map((v, j) => ({ ...v, p: puntua(v), j })).filter((v) => !oc[`${x.clave || x.empresa}|${v.j}`]);
    const utiles = vin.filter((v) => v.p > 0).sort((a, b) => b.p - a.p || a.j - b.j);
    if (!x.siempre && !utiles.length) { otras.push(`${x.puesto} · ${x.empresa} (${x.fechas.replace(/[a-z.]+ /g, '')})`); return ''; }
    const max = i === 0 ? 5 : 2;
    const elegidas = (utiles.length ? utiles : vin.slice(0, 1)).slice(0, max);
    return `<div class="trabajo">
      <div class="trabajo-cab"><div><span class="puesto">${esc(x.puesto)}</span> · <span class="empresa">${esc(x.empresa)}</span>${x.nota ? ' (' + esc(x.nota) + ')' : ''}</div><div class="fechas">${esc(x.fechas)}</div></div>
      <ul>${elegidas.map((v) => `<li>${v.t}</li>`).join('')}</ul></div>`;
  }).join('');

  const claves = palabrasClave(o);
  const habilidades = [...t.habilidades];
  if (tema.secundario) C.temas[tema.secundario].habilidades.slice(0, 3).forEach((h) => { if (!habilidades.includes(h)) habilidades.push(h); });

  $('#hoja').innerHTML = `
    <div class="cabecera">
      <h1>${esc(CV.nombre)}</h1>
      <div class="titular" contenteditable="true">${esc(t.titular)}</div>
      <div class="contacto"><span>${esc(C.ciudad)}</span>${tel ? `<span>${esc(tel)}</span>` : ''}<span>${esc(CV.email)}</span><span>${esc(CV.linkedin)}</span></div>
    </div>
    ${conObjetivo ? `<p class="objetivo" contenteditable="true"><b>${L.obj}:</b> ${esc(objetivo)}</p>` : ''}
    <h2>${L.perfil}</h2>
    <p contenteditable="true">${esc(t.perfil)}</p>
    <p contenteditable="true">${esc(t.perfil2)}</p>
    <h2>${L.comp}</h2>
    <div class="chips">${claves.map((c) => `<span class="clave">${esc(c)}</span>`).join('')}${habilidades.map((h) => `<span>${esc(h)}</span>`).join('')}</div>
    <h2>${L.exp}</h2>
    ${trabajos}
    ${otras.length ? `<p class="otra"><b>${L.otra}:</b> ${otras.map(esc).join(' · ')}</p>` : ''}
    <h2>${L.form}</h2>
    <div class="rejilla">${C.formacion.map((f) => `<div class="edu"><b>${esc(f.t)}</b><br>${esc(f.d)}</div>`).join('')}</div>
    <h2>${L.idi}</h2>
    <p>${esc(C.idiomas)} · ${esc(C.extra)}</p>`;
}

async function iniciar() {
  let o = null;
  if (lista === 'ext' && clave) {
    try { o = (JSON.parse(localStorage.getItem('radar-v2')) || {}).externas?.[clave] || null; } catch (e) { o = null; }
  } else if (ARCHIVOS[lista] && clave) {
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
  IDIOMA = idiomaParam === 'en' || idiomaParam === 'es' ? idiomaParam : (o ? idiomaTexto(info.texto) : 'es');
  const selIdioma = $('#idioma');
  if (CV_EN.sinIngles) { IDIOMA = 'es'; selIdioma.querySelector('[value="en"]').disabled = true; selIdioma.title = 'Tu perfil todavía no tiene versión en inglés.'; }
  selIdioma.value = IDIOMA;
  if (o && !idiomaParam && IDIOMA === 'en') cab.insertAdjacentHTML('beforeend', '<span> · Oferta en inglés: CV en inglés (puedes cambiarlo).</span>');
  const nombresTema = () => { const C = IDIOMA === 'en' ? CV_EN : CV; [...sel.options].forEach((op) => { op.textContent = C.temas[op.value].nombre + (op.value === auto.principal && o ? (IDIOMA === 'en' ? ' (recommended)' : ' (recomendado)') : ''); }); };
  const telefono = $('#telefono');
  telefono.value = leer('radar-telefono');
  const repintar = () => pintar(o, info, tema);
  sel.addEventListener('change', () => { tema.principal = sel.value; tema.secundario = auto.principal !== sel.value ? auto.principal : auto.secundario; repintar(); });
  $('#con-objetivo').addEventListener('change', repintar);
  selIdioma.addEventListener('change', () => { IDIOMA = selIdioma.value; nombresTema(); actualizarTitulo(); repintar(); });
  nombresTema();
  telefono.addEventListener('change', () => { guardar('radar-telefono', telefono.value.trim()); repintar(); });
  $('#pdf').addEventListener('click', () => window.print());
  const actualizarTitulo = () => { document.title = `CV ${CV.nombre}${IDIOMA === 'en' ? ' (EN)' : ''}${info.empresa ? ' - ' + info.empresa : ''}`.replace(/[\\/:*?"<>|]/g, ''); };
  actualizarTitulo();
  repintar();
}

iniciar();
