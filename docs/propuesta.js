'use strict';
/* Propuesta de valor por oportunidad (ticket 03, §8).
   Se construye SOLO con datos del CV verificado (cv-datos.js). Cada aportación
   necesita una experiencia del CV que la respalde: si no la encuentra, no aparece.
   Nada se comparte: la usuaria la edita y la aprueba antes de usarla. */

const PROPUESTA = {
  gestion: {
    aportaciones: [
      ['Planificar y controlar el proyecto de principio a fin: alcance, plazos, hitos y costes.', /Planificación, seguimiento y control/],
      ['Coordinar equipos multidisciplinares, proveedores y cliente desde un único punto de contacto.', /coordinación de equipos multidisciplinares/],
      ['Traducir las necesidades del cliente en requisitos y planes de ejecución.', /definición funcional/],
      ['Preparar memorias técnicas, presupuestos y propuestas.', /Memorias técnicas/],
    ],
    transferibles: [['Gestión de proveedores y compras', 'Gárgola Lab'], ['Coordinación entre departamentos en entorno internacional, en inglés y francés', 'Hotel Arts Barcelona'], ['Implantación de sistemas con ERP y automatización de procesos', 'Grumatel Soluciones']],
    inicio: ['Plan de proyecto, cronograma e hitos', 'Seguimiento de alcance, costes y riesgos', 'Coordinación con proveedores y cliente'],
  },
  museo: {
    aportaciones: [
      ['Dirigir proyectos de musealización: contenidos, producción, montaje y relación con el cliente público.', /musealización/],
      ['Integrar recursos digitales y 3D en el discurso expositivo.', /Museo virtual/],
      ['Controlar plazos y presupuesto con varios proveedores a la vez.', /Planificación, seguimiento y control/],
      ['Preparar presupuestos, fichas técnicas y planos.', /Fichas técnicas, planos y presupuestos/],
    ],
    transferibles: [['Coordinación de eventos con varios departamentos y el cliente', 'Hotel Arts Barcelona'], ['Contenidos y divulgación digital', 'marketing digital'], ['Base técnica de ingeniería para montaje e instalaciones', 'Ingeniería Técnica Industrial']],
    inicio: ['Planificación de producción y montaje', 'Coordinación de proveedores y contenidos', 'Control de plazos y presupuesto'],
  },
  geo: {
    aportaciones: [
      ['Dirigir campañas de batimetría y fotogrametría hasta la entrega de modelos.', /batimetría y fotogrametría/],
      ['Coordinar el procesamiento de nubes de puntos y el análisis 3D.', /nubes de puntos|análisis 3D/],
      ['Aplicar machine learning al análisis del territorio.', /machine learning/],
      ['Diseñar plataformas para visualizar y analizar los datos del territorio.', /RURAL IA 3D/],
    ],
    transferibles: [['Base de ingeniería', 'Ingeniería Técnica Industrial'], ['Desarrollo de plataformas web', 'Gárgola Lab'], ['Presupuestos y planos con Presto y AutoCAD', 'INABAT y trabajo como autónoma']],
    inicio: ['Planificación de campañas de captura', 'Coordinación del procesamiento y los entregables', 'Relación con el cliente'],
  },
  ia: {
    aportaciones: [
      ['Dirigir el desarrollo de plataformas de gemelo digital y análisis 3D.', /RURAL IA 3D/],
      ['Llevar proyectos de machine learning de la idea a la entrega, con socios tecnológicos y financiación pública.', /ForestScape/],
      ['Definir requisitos funcionales y seguir el desarrollo de software.', /definición funcional/],
      ['Integrar la IA generativa en el día a día del equipo.', /IA generativa/],
    ],
    transferibles: [['Transformación digital con ERP y ecommerce', 'Grumatel Soluciones'], ['Orientación a datos y KPIs', 'Grumatel Soluciones'], ['Gestión de proveedores tecnológicos', 'Gárgola Lab']],
    inicio: ['Backlog y requisitos', 'Seguimiento del desarrollo y de las entregas', 'Coordinación entre la parte técnica y el negocio'],
  },
  industrial: {
    aportaciones: [
      ['Llevar proyectos de instalaciones: presupuestos, planos y supervisión de obra.', /instalaciones eléctricas/],
      ['Coordinar contratistas y proveedores.', /coordinación con contratistas|negociación con proveedores/],
      ['Elaborar presupuestos con Presto y planos con AutoCAD.', /Presto/],
      ['Dirigir proyectos técnicos en entornos portuarios.', /Puerto de Vigo/],
    ],
    transferibles: [['Dirección de proyectos técnicos actuales', 'Gárgola Lab'], ['Formación en BIM con Revit (en curso)', 'Structuralia'], ['Gestión de compras', 'Gárgola Lab']],
    inicio: ['Presupuestos y planificación', 'Coordinación de contratistas', 'Seguimiento de la ejecución'],
  },
  marketing: {
    aportaciones: [
      ['Implantar un ecommerce integrado con el ERP y automatizar procesos.', /ecommerce integrado/],
      ['Planificar campañas y medir resultados con pruebas A/B y KPIs.', /pruebas A\/B/],
      ['Coordinar equipos de desarrollo web, diseño y contenido.', /equipos de desarrollo/],
      ['Lanzar tiendas online y campañas en Google Ads y redes sociales.', /Google Ads/],
    ],
    transferibles: [['Gestión de proyectos', 'Máster en Project Management y CAPM'], ['Base técnica de ingeniería', 'Ingeniería Técnica Industrial'], ['IA generativa aplicada', 'Gárgola Lab']],
    inicio: ['Plan del proyecto digital', 'KPIs y cuadro de mando', 'Coordinación de equipos web'],
  },
};

const PROPUESTA_EN = {
  gestion: ['Plan and control the project end to end: scope, schedule, milestones and costs.', 'Coordinate multidisciplinary teams, suppliers and the client as a single point of contact.', 'Translate the client\'s needs into requirements and delivery plans.', 'Prepare technical reports, budgets and proposals.'],
  museo: ['Lead museum projects: content, production, installation and relations with public-sector clients.', 'Integrate digital and 3D resources into the exhibition narrative.', 'Control schedule and budget across several suppliers at once.', 'Prepare budgets, technical sheets and drawings.'],
  geo: ['Lead bathymetry and photogrammetry campaigns through to model delivery.', 'Coordinate point cloud processing and 3D analysis.', 'Apply machine learning to land analysis.', 'Design platforms to visualise and analyse land data.'],
  ia: ['Lead the development of digital twin and 3D analysis platforms.', 'Take machine learning projects from idea to delivery, with technology partners and public funding.', 'Define functional requirements and follow software development.', 'Bring generative AI into the team\'s daily work.'],
  industrial: ['Run installation projects: budgets, drawings and site supervision.', 'Coordinate contractors and suppliers.', 'Prepare budgets with Presto and drawings with AutoCAD.', 'Lead technical projects in port environments.'],
  marketing: ['Implement an ecommerce platform integrated with the ERP and automate processes.', 'Plan campaigns and measure results with A/B tests and KPIs.', 'Coordinate web development, design and content teams.', 'Launch online shops and Google Ads and social media campaigns.'],
};

const sinHtml = (s) => String(s).replace(/<[^>]+>/g, '');

function textoOportunidad(o) {
  return [o.titulo, o.cliente, (o.etiquetas || []).join(' '), o.descripcion, (o.criterios_adjudicacion || []).map((c) => c.texto).join(' ')].filter(Boolean).join(' ');
}

function temasOportunidad(o) {
  const t = textoOportunidad(o);
  const puntos = Object.entries(CV.temas).map(([k, x]) => [k, (t.match(new RegExp(x.detectar.source, 'gi')) || []).length + (k === 'gestion' ? 0.5 : 0)]).sort((a, b) => b[1] - a[1]);
  return { principal: puntos[0][0], secundario: puntos[1][1] >= 2 ? puntos[1][0] : '' };
}

function ocultosPerfil() { try { return (JSON.parse(localStorage.getItem('radar-perfil')) || {}).ocultos || {}; } catch (e) { return {}; } }

function buscarEvidencia(rx) {
  const oc = ocultosPerfil();
  for (const x of CV.experiencia) {
    const v = x.vinetas.find((b, i) => !oc[`${x.empresa}|${i}`] && rx.test(sinHtml(b.t)));
    if (v) return { texto: sinHtml(v.t), cita: `${x.puesto} · ${x.empresa}` };
  }
  return null;
}

function construirPropuesta(o) {
  const tema = temasOportunidad(o);
  const P = PROPUESTA[tema.principal];
  const S = tema.secundario ? PROPUESTA[tema.secundario] : null;
  const aport = [];
  const usadas = new Set();
  const conEn = (lista, k) => lista.map(([t, rx], i) => [t, rx, (PROPUESTA_EN[k] || [])[i] || t]);
  for (const [t, rx, en] of [...conEn(P.aportaciones, tema.principal), ...(S ? conEn(S.aportaciones.slice(0, 2), tema.secundario) : [])]) {
    if (aport.length >= 4) break;
    const ev = buscarEvidencia(rx);
    if (!ev || usadas.has(ev.texto)) continue;  // sin respaldo en el CV: no se incluye
    usadas.add(ev.texto);
    aport.push({ t, en, cita: ev.cita, evidencia: ev.texto });
  }
  const validar = [];
  const c = o.criterios || {};
  (c.acceso?.valor != null && c.acceso.valor < 0.7 ? c.acceso.motivos : []).forEach((m) => validar.push(m));
  (c.geografia?.valor != null && c.geografia.valor < 0.6 ? c.geografia.motivos : []).forEach((m) => validar.push(m));
  if (o.modalidad === 'desconocida' && o.tipo === 'empleo') validar.push('modalidad de trabajo (no se indica)');
  if (o.tipo === 'empleo' && !o.salario?.texto) validar.push('salario y condiciones (no se publican)');
  if (o.tipo === 'proyecto') validar.push('si de verdad necesitan reforzar la dirección del proyecto (es una hipótesis, no una vacante)');
  return {
    tema: tema.principal,
    resumen: CV.temas[tema.principal].perfil,
    aportaciones: aport,
    transferibles: [...P.transferibles, ...(S ? S.transferibles.slice(0, 1) : [])].slice(0, 4),
    inicio: P.inicio,
    validar: [...new Set(validar)].map((m) => m.replace(/^./, (x) => x.toUpperCase())),
  };
}

function propuestaATexto(p) {
  const l = (arr, f) => arr.map((x) => '- ' + f(x)).join('\n');
  return [
    'Resumen',
    p.resumen,
    '',
    'Qué podría aportar',
    l(p.aportaciones, (a) => `${a.t} (${a.cita})`),
    '',
    'Capacidades transferibles',
    l(p.transferibles, ([t, d]) => `${t} (${d})`),
    '',
    'Desde el primer día',
    l(p.inicio, (t) => t),
    '',
    'A validar en una conversación',
    l(p.validar.length ? p.validar : ['Nada destacable con los datos disponibles'], (t) => t),
  ].join('\n');
}

/* Extrae «Qué podría aportar» de un texto aprobado, sin las citas, para el correo. */
function aportacionesParaCorreo(texto) {
  const m = texto.match(/Qué podría aportar\n([\s\S]*?)(\n\n|$)/);
  if (!m) return '';
  return m[1].split('\n').filter((x) => x.trim().startsWith('-')).map((x) => x.replace(/\s*\([^)]*\)\s*$/, '')).join('\n');
}
