'use strict';
/* Datos del CV y versiones por tipo de puesto. Cada viñeta lleva temas: el CV
   adaptado ordena y elige las que mejor encajan con la oferta. Sin teléfono:
   se añade en el navegador de cada una y no se publica. */

const CV = {
  nombre: 'Rocío Lovera García',
  ciudad: 'Gijón (Asturias)',
  email: 'rlovera86@gmail.com',
  linkedin: 'linkedin.com/in/rociolovera',

  temas: {
    gestion: {
      nombre: 'Gestión de proyectos / PMO',
      detectar: /project manag|jef[ea] de proyecto|gestor[a]? de proyecto|pmo|program manag|coordinador[a]? de proyecto|direcci[oó]n de proyecto|delivery|product owner|scrum/i,
      titular: 'Project Manager · PMO · Gestión de proyectos técnicos y de transformación digital',
      perfil: 'Project Manager con formación en Ingeniería Técnica Industrial (Mecánica), Máster en Project Management por la Universitat Politècnica de València y certificación CAPM (PMI). Más de 10 años en proyectos técnicos y de transformación digital. Planifico, coordino y controlo proyectos de principio a fin: alcance, cronograma, costes, riesgos, proveedores y relación con el cliente, con metodologías predictivas (PMBOK) y ágiles (Scrum).',
      perfil2: 'Hago de puente entre los equipos técnicos, el desarrollo y el negocio, y uso a diario herramientas de IA generativa (Claude, Claude Code) para acelerar la planificación, la documentación y el seguimiento.',
      habilidades: ['Planificación y control (alcance, plazos, costes, riesgos)', 'PMBOK · CAPM', 'Scrum / Agile', 'Microsoft Project', 'Gestión de proveedores y compras', 'KPIs e informes a dirección', 'ERP', 'IA generativa (Claude, Claude Code)'],
    },
    museo: {
      nombre: 'Musealización y patrimonio',
      detectar: /muse[oí]|museogr|musealiz|exposici|patrimonio|interpretaci[oó]n|cultural|expositiv|centro de visitantes|divulgaci/i,
      titular: 'Project Manager · Musealización, exposiciones y patrimonio con tecnología digital',
      perfil: 'Project Manager especializada en proyectos de musealización y divulgación con tecnología: he dirigido la musealización del Observatorio Marino del Puerto de Vigo (Atlántida) y el museo virtual del Parque Natural de Corrubedo. Ingeniera Técnica Industrial, Máster en Project Management (UPV) y certificación CAPM.',
      perfil2: 'Coordino contenidos, diseño expositivo, producción, montaje, proveedores y cliente público, controlando plazos y presupuesto, e integro recursos digitales (3D, realidad virtual, gemelos digitales) en el discurso expositivo.',
      habilidades: ['Dirección de proyectos de musealización', 'Coordinación de contenidos, diseño y producción', 'Montaje y proveedores', 'Contratación pública', 'Museo virtual y contenidos 3D', 'Presupuestos y control de costes', 'AutoCAD · Revit', 'Microsoft Project'],
    },
    geo: {
      nombre: 'Geomática, LiDAR y fotogrametría',
      detectar: /lidar|fotogram|batimetr|nube[s]? de puntos|cartograf|topogra|gis\b|geoespacial|teledetecci|ortofoto|dron|levantamiento|escaneo|territorio|forestal/i,
      titular: 'Project Manager · Captura de datos del territorio: LiDAR, fotogrametría y batimetría',
      perfil: 'Project Manager en proyectos de captura y análisis de datos del territorio: batimetría, fotogrametría, nubes de puntos y gemelos digitales. Dirijo proyectos desde la planificación de campañas hasta la entrega de modelos y resultados. Ingeniera Técnica Industrial, Máster en Project Management (UPV) y certificación CAPM.',
      perfil2: 'Coordino equipos de campo, procesamiento y desarrollo, proveedores y cliente, y he dirigido plataformas de análisis 3D y machine learning para la gestión forestal (ForestScape 3D Analytics, RURAL IA 3D).',
      habilidades: ['Batimetría y fotogrametría', 'Nubes de puntos y modelos 3D', 'Gemelos digitales del territorio', 'Análisis geoespacial', 'Machine learning aplicado', 'Planificación de campañas de campo', 'AutoCAD · Revit', 'Control de plazos y costes'],
    },
    ia: {
      nombre: 'IA, datos y producto digital',
      detectar: /inteligencia artificial|\bia\b|machine learning|\bml\b|llm|gemelo digital|digital twin|software|plataforma|producto digital|datos|data|anal[ií]tica|innovaci|i\+d|digitalizaci|transformaci[oó]n digital/i,
      titular: 'Project Manager · Inteligencia artificial, gemelos digitales y producto digital',
      perfil: 'Project Manager de proyectos de inteligencia artificial y producto digital: dirijo el desarrollo de plataformas de gemelo digital y análisis 3D con machine learning (RURAL IA 3D, ForestScape 3D Analytics). Ingeniera Técnica Industrial, Máster en Project Management (UPV) y certificación CAPM, con experiencia previa en transformación digital, ecommerce y ERP.',
      perfil2: 'Uso a diario IA generativa (Claude, Claude Code, Cowork, skills y automatización) para definir, prototipar y desarrollar herramientas web, y traduzco necesidades de negocio en requisitos, backlog y entregas.',
      habilidades: ['Dirección de proyectos de IA y datos', 'Machine learning aplicado', 'Gemelos digitales', 'IA generativa (Claude, Claude Code, Cowork)', 'Definición funcional y backlog', 'Scrum / Agile', 'Integraciones ERP y ecommerce', 'KPIs y analítica'],
    },
    industrial: {
      nombre: 'Ingeniería e industria',
      detectar: /industrial|ingenier|instalaci|\bobras?\b|el[eé]ctric|mec[aá]nic|energ[ií]a|naval|puerto|portuari|fabricaci|manufactur|mantenimiento|infraestructura|construcci|bim|revit/i,
      titular: 'Project Manager · Ingeniería, instalaciones e infraestructuras',
      perfil: 'Ingeniera Técnica Industrial (Mecánica) y Project Manager, con Máster en Project Management (UPV) y certificación CAPM. Experiencia en proyectos de instalaciones eléctricas de baja, media y alta tensión, supervisión de obra y, en los últimos años, dirección de proyectos técnicos en entornos portuarios y naturales.',
      perfil2: 'Planifico y controlo alcance, plazos y costes, coordino contratistas y proveedores, elaboro presupuestos (Presto) y planos (AutoCAD), y me estoy formando en BIM con Revit.',
      habilidades: ['Dirección de proyectos técnicos', 'Instalaciones eléctricas BT/MT/AT', 'Supervisión de obra', 'Presupuestos (Presto)', 'AutoCAD · Revit (BIM)', 'Coordinación de contratistas', 'Seguridad y normativa', 'Microsoft Project'],
    },
    marketing: {
      nombre: 'Marketing digital y martech',
      detectar: /marketing|martech|ecommerce|e-commerce|anal[ií]tica web|google analytics|tag manager|\bseo\b|\bsem\b|\bcrm\b|campa[nñ]a|digital marketing|growth|contenido/i,
      titular: 'Project Manager · Transformación digital, ecommerce y marketing digital',
      perfil: 'Project Manager de transformación digital con más de 8 años en marketing digital y ecommerce: implantación de tiendas online integradas con ERP, campañas en Google Ads y redes sociales, SEO, email marketing y análisis de métricas. Ingeniera Técnica Industrial, Máster en Project Management (UPV) y certificación CAPM.',
      perfil2: 'Combino gestión de proyectos, base técnica y orientación a datos: defino KPIs, hago pruebas A/B y coordino equipos de desarrollo web, diseño y contenido.',
      habilidades: ['Ecommerce (WooCommerce, Magento) + ERP', 'Google Ads · SEO · SEM', 'Analítica y KPIs', 'Pruebas A/B', 'Email marketing (Mailchimp)', 'Automatización de procesos', 'Gestión de equipos web', 'IA generativa'],
    },
  },

  experiencia: [
    {
      puesto: 'Project Manager', empresa: 'Gárgola Lab', nota: 'ingeniería, captura de datos del territorio e IA', fechas: 'may. 2025 – actualidad', siempre: true,
      vinetas: [
        { t: '<b>Atlántida, Observatorio Marino del Puerto de Vigo:</b> Project Manager del proyecto de musealización.', temas: ['museo', 'gestion', 'industrial'] },
        { t: '<b>Museo virtual del Parque Natural de Corrubedo</b> y lagunas de Carregal y Vixán (Xunta de Galicia).', temas: ['museo', 'ia'] },
        { t: '<b>ForestScape 3D Analytics:</b> machine learning y análisis 3D para la gestión forestal, con el CTAG y financiación del IGAPE (IA360, NextGenerationEU).', temas: ['ia', 'geo'] },
        { t: '<b>RURAL IA 3D:</b> dirección del proyecto y diseño de la estructura de una plataforma web de gemelo digital del territorio (visualización de bosques, conteo de árboles, análisis geoespacial).', temas: ['ia', 'geo', 'gestion'] },
        { t: 'Proyectos de <b>batimetría y fotogrametría</b> con procesamiento de nubes de puntos.', temas: ['geo', 'industrial'] },
        { t: 'Planificación, seguimiento y control de alcance, plazos, hitos y costes; coordinación de equipos multidisciplinares, proveedores y clientes.', temas: ['gestion', 'museo', 'geo', 'ia', 'industrial', 'marketing'] },
        { t: 'Desarrollo de nuevas herramientas web con IA generativa: definición funcional, arquitectura y seguimiento del desarrollo.', temas: ['ia', 'marketing', 'gestion'] },
        { t: 'Memorias técnicas, presupuestos y propuestas; selección de tecnologías y proveedores; gestión de compras.', temas: ['gestion', 'industrial', 'museo', 'geo'] },
      ],
    },
    {
      puesto: 'Project Manager de Transformación Digital', empresa: 'Grumatel Soluciones', fechas: 'ene. 2024 – mar. 2025', siempre: true,
      vinetas: [
        { t: 'Implantación de un ecommerce integrado con el ERP y automatización de procesos internos, con reducción de costes operativos.', temas: ['ia', 'marketing', 'gestion'] },
        { t: 'Coordinación de los equipos de desarrollo y mantenimiento web; gestión de precios y tarifas en el ERP.', temas: ['gestion', 'ia', 'marketing'] },
        { t: 'Campañas online y email marketing con pruebas A/B; seguimiento de KPIs de conversión, satisfacción y posventa.', temas: ['marketing'] },
      ],
    },
    {
      puesto: 'Project Manager y Marketing Digital', empresa: 'Autónoma', fechas: 'ene. 2022 – ene. 2024', siempre: true,
      vinetas: [
        { t: 'Diseño y dirección de proyectos de digitalización y mejora de procesos para empresas; desarrollo de páginas web.', temas: ['gestion', 'ia', 'marketing'] },
        { t: 'Fichas técnicas, planos y presupuestos con AutoCAD y Presto; negociación con proveedores.', temas: ['industrial', 'museo', 'geo'] },
        { t: 'Estrategias de marketing digital y contenidos para web y redes sociales.', temas: ['marketing'] },
      ],
    },
    {
      puesto: 'Especialista en Marketing Digital', empresa: 'Framesi España', fechas: 'mar. 2019 – dic. 2021',
      vinetas: [
        { t: 'Puesta en marcha de la tienda online (WooCommerce), campañas en redes sociales y Google Ads, SEO y análisis de métricas.', temas: ['marketing', 'ia'] },
      ],
    },
    {
      puesto: 'Especialista en Marketing Digital', empresa: 'Tablas Surf Shop', fechas: 'jun. 2016 – may. 2018',
      vinetas: [
        { t: 'Plan de marketing digital (SEO, SEM, redes, email marketing), contenidos y tienda online (Magento).', temas: ['marketing'] },
      ],
    },
    {
      puesto: 'Coordinadora de Eventos y Conferencias', empresa: 'Hotel Arts Barcelona', fechas: 'nov. 2015 – feb. 2016',
      vinetas: [
        { t: 'Coordinación entre cliente y departamentos del hotel para eventos y conferencias, en entorno internacional (inglés y francés).', temas: ['museo', 'gestion'] },
      ],
    },
    {
      puesto: 'Project Engineer', empresa: 'INABAT', nota: 'ingeniería de alta y baja tensión', fechas: 'sep. 2008 – dic. 2009', siempre: true,
      vinetas: [
        { t: 'Proyectos de instalaciones eléctricas de baja, media y alta tensión: presupuestos (Presto), planos (AutoCAD), supervisión de obra y coordinación con contratistas.', temas: ['industrial', 'gestion', 'geo'] },
      ],
    },
  ],

  formacion: [
    { t: 'Máster en Project Management', d: 'Universitat Politècnica de València · 2015 – 2016' },
    { t: 'Ingeniería Técnica Industrial (Mecánica)', d: 'Escuela Politécnica de Córdoba · 2005 – 2011' },
    { t: 'Certificado CAPM (PMI)', d: 'CEOLEVEL · 2025' },
    { t: 'Agile Project Management', d: 'Fundación Esplai · 2025' },
    { t: 'Curso Superior en BIM con Revit', d: 'Structuralia · 2025 – 2026' },
    { t: 'Marketing Digital y Community Management', d: 'Deusto Formación' },
  ],

  idiomas: 'Español (nativo) · Inglés (Cambridge Certificate of Proficiency, C2) · Francés (DELF)',
  extra: 'Permiso de conducir B y vehículo propio',
};
