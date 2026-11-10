'use strict';
/* Mapa de oportunidades: sitúa cada oportunidad en su municipio o provincia y
   agrupa las que coinciden en un mismo punto. Usa Leaflet (se carga al abrir). */

const LUGARES = {
  // Asturias: municipios
  'gijon': [43.532, -5.661], 'oviedo': [43.3614, -5.8494], 'aviles': [43.5547, -5.9248], 'llanera': [43.4566, -5.8573],
  'siero': [43.392, -5.663], 'langreo': [43.296, -5.69], 'mieres': [43.25, -5.776], 'navia': [43.54, -6.72],
  'cangas del narcea': [43.177, -6.548], 'candamo': [43.42, -6.07], 'ibias': [43.04, -6.86], 'ribera de arriba': [43.30, -5.86],
  'llanes': [43.42, -4.75], 'villaviciosa': [43.48, -5.43], 'castrillon': [43.56, -5.98], 'valdes': [43.54, -6.54],
  'luarca': [43.54, -6.54], 'tineo': [43.33, -6.41], 'ayuntamiento de grado': [43.39, -6.07], 'corvera': [43.53, -5.88], 'carreno': [43.58, -5.77],
  'universidad de oviedo': [43.3614, -5.8494], 'principado de asturias': [43.3614, -5.8494], 'autoridad portuaria de gijon': [43.56, -5.70], 'autoridad portuaria de aviles': [43.582, -5.925], 'oscar niemeyer': [43.556, -5.917], 'cudillero': [43.563, -6.146], 'salas': [43.41, -6.26], 'pravia': [43.49, -6.11], 'colunga': [43.49, -5.27], 'ribadesella': [43.46, -5.06], 'cangas de onis': [43.35, -5.13], 'lena': [43.15, -5.82], 'aller': [43.17, -5.62], 'laviana': [43.25, -5.56], 'noreña': [43.39, -5.71], 'gozon': [43.62, -5.83], 'boal': [43.43, -6.82], 'tapia de casariego': [43.57, -6.94], 'vegadeo': [43.47, -7.05], 'allande': [43.27, -6.61], 'belmonte de miranda': [43.28, -6.21], 'morcin': [43.26, -5.89],
  // Galicia y norte
  'ribadeo': [43.535, -7.04], 'vigo': [42.2406, -8.7207], 'santiago de compostela': [42.8782, -8.5448], 'ferrol': [43.4832, -8.2369],
  'a coruna': [43.3623, -8.4115], 'coruna': [43.3623, -8.4115], 'lugo': [43.0097, -7.556], 'ourense': [42.3358, -7.8639], 'pontevedra': [42.431, -8.6444],
  'santander': [43.4623, -3.81], 'cantabria': [43.4623, -3.81], 'torrelavega': [43.35, -4.05],
  'bilbao': [43.263, -2.935], 'bizkaia': [43.263, -2.935], 'vizcaya': [43.263, -2.935], 'zamudio': [43.283, -2.866],
  'donostia': [43.3183, -1.9812], 'san sebastian': [43.3183, -1.9812], 'gipuzkoa': [43.3183, -1.9812], 'guipuzcoa': [43.3183, -1.9812],
  'vitoria': [42.8467, -2.6716], 'alava': [42.8467, -2.6716], 'araba': [42.8467, -2.6716],
  'pamplona': [42.8125, -1.6458], 'navarra': [42.8125, -1.6458], 'logrono': [42.4627, -2.445], 'la rioja': [42.4627, -2.445],
  'leon': [42.5987, -5.5671], 'ponferrada': [42.546, -6.5962], 'palencia': [42.0095, -4.5288], 'burgos': [42.3439, -3.6969],
  'valladolid': [41.6523, -4.7245], 'zamora': [41.5035, -5.7446], 'salamanca': [40.9701, -5.6635], 'segovia': [40.9429, -4.1088],
  'soria': [41.7666, -2.479], 'avila': [40.6565, -4.6818],
  // Resto
  'madrid': [40.4168, -3.7038], 'barcelona': [41.3874, 2.1686], 'girona': [41.9794, 2.8214], 'tarragona': [41.1189, 1.2445], 'lleida': [41.6176, 0.62],
  'zaragoza': [41.6488, -0.8891], 'huesca': [42.1401, -0.4089], 'teruel': [40.3457, -1.1065],
  'valencia': [39.4699, -0.3763], 'alicante': [38.3452, -0.481], 'castellon': [39.9864, -0.0513], 'murcia': [37.9922, -1.1307],
  'sevilla': [37.3891, -5.9845], 'malaga': [36.7213, -4.4214], 'granada': [37.1773, -3.5986], 'cordoba': [37.8882, -4.7794],
  'cadiz': [36.5271, -6.2886], 'huelva': [37.2614, -6.9447], 'almeria': [36.834, -2.4637], 'jaen': [37.7796, -3.7849],
  'badajoz': [38.8794, -6.9707], 'caceres': [39.4753, -6.3724], 'toledo': [39.8628, -4.0273], 'ciudad real': [38.9848, -3.9274],
  'albacete': [38.9943, -1.8585], 'cuenca': [40.0704, -2.1374], 'guadalajara': [40.6329, -3.1669],
  'palma de mallorca': [39.5696, 2.6502], 'baleares': [39.5696, 2.6502], 'illes balears': [39.5696, 2.6502],
  'las palmas': [28.1235, -15.4363], 'gran canaria': [28.1235, -15.4363], 'santa cruz de tenerife': [28.4636, -16.2518], 'tenerife': [28.4636, -16.2518],
  'ceuta': [35.8894, -5.3213], 'melilla': [35.2923, -2.9381],
};
// Comunidades: si solo se sabe la comunidad, su capital.
const COMUNIDADES = {
  'asturias': 'oviedo', 'galicia': 'santiago de compostela', 'pais vasco': 'vitoria', 'euskadi': 'vitoria', 'castilla y leon': 'valladolid',
  'cataluna': 'barcelona', 'catalunya': 'barcelona', 'comunitat valenciana': 'valencia', 'comunidad valenciana': 'valencia', 'andalucia': 'sevilla',
  'aragon': 'zaragoza', 'extremadura': 'badajoz', 'castilla-la mancha': 'toledo', 'castilla la mancha': 'toledo', 'canarias': 'las palmas',
  'region de murcia': 'murcia',
};
const CLAVES_LUGAR = Object.keys(LUGARES).sort((a, b) => b.length - a.length);
const normL = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

function ubicar(textos) {
  for (const t of textos) {
    const n = normL(t).trim();
    if (!n) continue;
    if (COMUNIDADES[n]) return { punto: LUGARES[COMUNIDADES[n]], lugar: COMUNIDADES[n] };
    const k = CLAVES_LUGAR.find((c) => new RegExp('\\b' + c + '\\b').test(n));
    if (k) return { punto: LUGARES[k], lugar: k };
  }
  for (const t of textos) {
    const n = normL(t);
    const c = Object.keys(COMUNIDADES).find((x) => n.includes(x));
    if (c) return { punto: LUGARES[COMUNIDADES[c]], lugar: COMUNIDADES[c] };
  }
  return null;
}

const TIPOS_MAPA = {
  oferta: { nombre: 'Ofertas de empleo', color: '#0f766e' },
  publico: { nombre: 'Empleo público', color: '#6b5bd2' },
  licitacion_abierta: { nombre: 'Licitaciones abiertas', color: '#b8651a' },
  adjudicacion: { nombre: 'Proyectos adjudicados', color: '#2b6cb0' },
  senal_empresa: { nombre: 'Señales de empresa', color: '#9a4a8f' },
  noticia_empresa: { nombre: 'Noticias de expansión', color: '#c2417a' },
};
const grupoTipo = (o) => (o.subtipo === 'oposicion' || o.subtipo === 'contrato_publico' ? 'publico' : o.subtipo);

/* Recibe oportunidades del modelo común; devuelve puntos agrupados y las que no se pueden situar. */
function agrupar(ops) {
  const grupos = new Map();
  const sinLugar = [];
  for (const o of ops) {
    const textos = o.tipo === 'empleo' && o.subtipo === 'oferta' ? [o.ubicacion.texto, o.ubicacion.comunidad]
      : o.tipo === 'empleo' ? [o.resolucion, o.ubicacion.texto, o.organizacion.nombre, o.ubicacion.comunidad === 'Asturias' ? 'asturias' : '']
        : [o.cliente, o.ubicacion.texto !== o.ubicacion.comunidad ? o.ubicacion.texto : '', o.titulo, o.ubicacion.texto, o.ubicacion.comunidad];
    const u = o.modalidad === 'remoto' ? null : ubicar(textos);
    if (!u) { sinLugar.push(o); continue; }
    const k = u.punto.join(',');
    if (!grupos.has(k)) grupos.set(k, { punto: u.punto, lugar: u.lugar, items: [] });
    grupos.get(k).items.push(o);
  }
  return { grupos: [...grupos.values()], sinLugar };
}

let mapa = null, capa = null, cargando = null;

function cargarLeaflet() {
  if (window.L) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise((ok, mal) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = ok; js.onerror = mal;
    document.head.append(js);
  });
  return cargando;
}

function oscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}


function popup(g) {
  const caja = document.createElement('div');
  caja.className = 'pop';
  const h = document.createElement('p');
  h.className = 'pop-lugar';
  h.textContent = g.lugar.replace(/\b\w/g, (c) => c.toUpperCase()) + ' · ' + g.items.length + (g.items.length === 1 ? ' oportunidad' : ' oportunidades');
  caja.append(h);
  const ul = document.createElement('ul');
  g.items.slice(0, 12).forEach((o) => {
    const li = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = 'pop-chip'; chip.style.background = TIPOS_MAPA[grupoTipo(o)].color; chip.textContent = puntuar(o).total;
    chip.title = TIPOS_MAPA[grupoTipo(o)].nombre;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = (o.titulo + (o.organizacion.nombre ? ' · ' + o.organizacion.nombre : '')).slice(0, 120);
    b.addEventListener('click', () => window.abrirFicha(o.id));
    li.append(chip, b);
    ul.append(li);
  });
  caja.append(ul);
  if (g.items.length > 12) { const m = document.createElement('p'); m.className = 'nota'; m.textContent = `y ${g.items.length - 12} más en la lista`; caja.append(m); }
  return caja;
}

function icono(g) {
  const tipos = [...new Set(g.items.map(grupoTipo))];
  const n = g.items.length;
  const tam = Math.min(46, 22 + Math.sqrt(n) * 7);
  const fondo = tipos.length === 1 ? TIPOS_MAPA[tipos[0]].color
    : `conic-gradient(${tipos.map((t, i) => `${TIPOS_MAPA[t].color} ${(i / tipos.length) * 360}deg ${((i + 1) / tipos.length) * 360}deg`).join(',')})`;
  return L.divIcon({
    className: 'pin',
    html: `<span style="width:${tam}px;height:${tam}px;background:${fondo}">${n}</span>`,
    iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2], popupAnchor: [0, -tam / 2],
  });
}

async function pintarMapa(listas, alSinLugar) {
  const cont = document.getElementById('mapa');
  try { await cargarLeaflet(); } catch (e) { cont.textContent = 'No se ha podido cargar el mapa. Comprueba la conexión.'; return; }
  if (!mapa) {
    mapa = L.map(cont, { scrollWheelZoom: false, zoomControl: true }).setView([42.2, -4.2], 6);
    const base = oscuro() ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base';
    L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${base}/MapServer/tile/{z}/{y}/{x}`, {
      attribution: 'Mapa base &copy; Esri, HERE, Garmin, &copy; OpenStreetMap', maxZoom: 16,
    }).addTo(mapa);
    capa = L.layerGroup().addTo(mapa);
    mapa.on('focus', () => mapa.scrollWheelZoom.enable());
    mapa.on('blur', () => mapa.scrollWheelZoom.disable());
  }
  setTimeout(() => mapa.invalidateSize(), 50);
  capa.clearLayers();
  const { grupos, sinLugar } = agrupar(listas);
  grupos.forEach((g) => L.marker(g.punto, { icon: icono(g), title: g.lugar }).bindPopup(popup(g), { maxWidth: Math.min(340, cont.clientWidth - 50), autoPanPadding: [12, 12] }).addTo(capa));
  alSinLugar(sinLugar);
  return grupos.length;
}

function centrarAsturias() { if (mapa) mapa.setView([43.38, -5.85], 9); }
function centrarEspana() { if (mapa) mapa.setView([40.2, -3.7], 6); }
