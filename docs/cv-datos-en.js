'use strict';
/* English version of the CV. Same structure and order as cv-datos.js: the topic
   tags (temas), the "siempre" flag and the hidden-item keys (clave) are copied
   from the Spanish data, so only the wording changes. Nothing is added. */

const CV_EN_TEMAS = {
  gestion: {
    nombre: 'Project management / PMO',
    titular: 'Project Manager · PMO · Technical and digital transformation projects',
    perfil: 'Project Manager with a degree in Technical Industrial Engineering (Mechanical), a Master\'s in Project Management from the Universitat Politècnica de València and the CAPM certification (PMI). Over 10 years in technical and digital transformation projects. I plan, coordinate and control projects end to end: scope, schedule, costs, risks, suppliers and client relations, using predictive (PMBOK) and agile (Scrum) methodologies.',
    perfil2: 'I bridge technical teams, development and business, and use generative AI tools (Claude, Claude Code) every day to speed up planning, documentation and tracking.',
    habilidades: ['Planning and control (scope, schedule, cost, risk)', 'PMBOK · CAPM', 'Scrum / Agile', 'Microsoft Project', 'Supplier and procurement management', 'KPIs and executive reporting', 'ERP', 'Generative AI (Claude, Claude Code)'],
  },
  museo: {
    nombre: 'Museums and heritage',
    titular: 'Project Manager · Museum, exhibition and heritage projects with digital technology',
    perfil: 'Project Manager specialising in museum and outreach projects with technology: I led the museum project for the Marine Observatory at the Port of Vigo (Atlántida) and the virtual museum of Corrubedo Natural Park. Technical Industrial Engineer, Master\'s in Project Management (UPV) and CAPM certification.',
    perfil2: 'I coordinate content, exhibition design, production, installation, suppliers and public-sector clients while controlling schedule and budget, and I integrate digital resources (3D, virtual reality, digital twins) into the exhibition narrative.',
    habilidades: ['Museum project management', 'Content, design and production coordination', 'Installation and suppliers', 'Public procurement', 'Virtual museums and 3D content', 'Budgeting and cost control', 'AutoCAD · Revit', 'Microsoft Project'],
  },
  geo: {
    nombre: 'Geomatics, LiDAR and photogrammetry',
    titular: 'Project Manager · Land data capture: LiDAR, photogrammetry and bathymetry',
    perfil: 'Project Manager for land data capture and analysis projects: bathymetry, photogrammetry, point clouds and digital twins. I manage projects from field campaign planning to the delivery of models and results. Technical Industrial Engineer, Master\'s in Project Management (UPV) and CAPM certification.',
    perfil2: 'I coordinate field, processing and development teams, suppliers and clients, and I have led 3D analysis and machine learning platforms for forest management (ForestScape 3D Analytics, RURAL IA 3D).',
    habilidades: ['Bathymetry and photogrammetry', 'Point clouds and 3D models', 'Digital twins of the territory', 'Geospatial analysis', 'Applied machine learning', 'Field campaign planning', 'AutoCAD · Revit', 'Schedule and cost control'],
  },
  ia: {
    nombre: 'AI, data and digital product',
    titular: 'Project Manager · Artificial intelligence, digital twins and digital product',
    perfil: 'Project Manager for artificial intelligence and digital product projects: I lead the development of digital twin and 3D analysis platforms with machine learning (RURAL IA 3D, ForestScape 3D Analytics). Technical Industrial Engineer, Master\'s in Project Management (UPV) and CAPM certification, with previous experience in digital transformation, ecommerce and ERP.',
    perfil2: 'I use generative AI every day (Claude, Claude Code, Cowork, skills and automation) to define, prototype and build web tools, and I translate business needs into requirements, backlog and deliveries.',
    habilidades: ['AI and data project management', 'Applied machine learning', 'Digital twins', 'Generative AI (Claude, Claude Code, Cowork)', 'Functional definition and backlog', 'Scrum / Agile', 'ERP and ecommerce integrations', 'KPIs and analytics'],
  },
  industrial: {
    nombre: 'Engineering and industry',
    titular: 'Project Manager · Engineering, installations and infrastructure',
    perfil: 'Technical Industrial Engineer (Mechanical) and Project Manager, with a Master\'s in Project Management (UPV) and CAPM certification. Experience in low, medium and high voltage electrical installation projects, site supervision and, in recent years, management of technical projects in port and natural environments.',
    perfil2: 'I plan and control scope, schedule and costs, coordinate contractors and suppliers, prepare budgets (Presto) and drawings (AutoCAD), and I am currently training in BIM with Revit.',
    habilidades: ['Technical project management', 'LV/MV/HV electrical installations', 'Site supervision', 'Budgeting (Presto)', 'AutoCAD · Revit (BIM)', 'Contractor coordination', 'Safety and regulations', 'Microsoft Project'],
  },
  marketing: {
    nombre: 'Digital marketing and martech',
    titular: 'Project Manager · Digital transformation, ecommerce and digital marketing',
    perfil: 'Digital transformation Project Manager with over 8 years in digital marketing and ecommerce: online shops integrated with ERP, Google Ads and social media campaigns, SEO, email marketing and metrics analysis. Technical Industrial Engineer, Master\'s in Project Management (UPV) and CAPM certification.',
    perfil2: 'I combine project management, a technical background and a data-driven approach: I define KPIs, run A/B tests and coordinate web development, design and content teams.',
    habilidades: ['Ecommerce (WooCommerce, Magento) + ERP', 'Google Ads · SEO · SEM', 'Analytics and KPIs', 'A/B testing', 'Email marketing (Mailchimp)', 'Process automation', 'Web team management', 'Generative AI'],
  },
};

const CV_EN_EXPERIENCIA = [
  { puesto: 'Project Manager', nota: 'engineering, land data capture and AI', fechas: 'May 2025 – present', v: [
    '<b>Atlántida, Marine Observatory at the Port of Vigo:</b> Project Manager for the museum project.',
    '<b>Virtual museum of Corrubedo Natural Park</b> and the Carregal and Vixán lagoons (Xunta de Galicia).',
    '<b>ForestScape 3D Analytics:</b> machine learning and 3D analysis for forest management, with CTAG and IGAPE funding (IA360, NextGenerationEU).',
    '<b>RURAL IA 3D:</b> project management and structural design of a web platform for a digital twin of the territory (forest visualisation, tree counting, geospatial analysis).',
    '<b>Bathymetry and photogrammetry</b> projects with point cloud processing.',
    'Planning, monitoring and control of scope, schedule, milestones and costs; coordination of multidisciplinary teams, suppliers and clients.',
    'Development of new web tools with generative AI: functional definition, architecture and development follow-up.',
    'Technical reports, budgets and proposals; technology and supplier selection; procurement management.',
  ] },
  { puesto: 'Digital Transformation Project Manager', fechas: 'Jan 2024 – Mar 2025', v: [
    'Implementation of an ecommerce platform integrated with the ERP and automation of internal processes, reducing operating costs.',
    'Coordination of the web development and maintenance teams; price and rate management in the ERP.',
    'Online and email marketing campaigns with A/B testing; tracking of conversion, satisfaction and after-sales KPIs.',
  ] },
  { puesto: 'Project Manager and Digital Marketing', empresa: 'Freelance', fechas: 'Jan 2022 – Jan 2024', v: [
    'Design and management of digitalisation and process improvement projects for companies; website development.',
    'Technical sheets, drawings and budgets with AutoCAD and Presto; supplier negotiation.',
    'Digital marketing and content strategies for websites and social media.',
  ] },
  { puesto: 'Digital Marketing Specialist', fechas: 'Mar 2019 – Dec 2021', v: [
    'Launch of the online shop (WooCommerce), social media and Google Ads campaigns, SEO and metrics analysis.',
  ] },
  { puesto: 'Digital Marketing Specialist', fechas: 'Jun 2016 – May 2018', v: [
    'Digital marketing plan (SEO, SEM, social media, email marketing), content and online shop (Magento).',
  ] },
  { puesto: 'Events and Conferences Coordinator', fechas: 'Nov 2015 – Feb 2016', v: [
    'Coordination between clients and hotel departments for events and conferences in an international environment (English and French).',
  ] },
  { puesto: 'Project Engineer', nota: 'high and low voltage engineering', fechas: 'Sep 2008 – Dec 2009', v: [
    'Low, medium and high voltage electrical installation projects: budgets (Presto), drawings (AutoCAD), site supervision and coordination with contractors.',
  ] },
];

const CV_EN = {
  ...CV,
  ciudad: 'Gijón (Asturias), Spain',
  temas: Object.fromEntries(Object.entries(CV.temas).map(([k, t]) => [k, { ...t, ...CV_EN_TEMAS[k] }])),
  experiencia: CV.experiencia.map((x, i) => {
    const tr = CV_EN_EXPERIENCIA[i] || {};
    return { ...x, clave: x.empresa, puesto: tr.puesto || x.puesto, empresa: tr.empresa || x.empresa, nota: x.nota ? tr.nota || x.nota : undefined, fechas: tr.fechas || x.fechas,
      vinetas: x.vinetas.map((v, j) => ({ ...v, t: (tr.v && tr.v[j]) || v.t })) };
  }),
  formacion: [
    { t: 'Master\'s Degree in Project Management', d: 'Universitat Politècnica de València · 2015 – 2016' },
    { t: 'Technical Industrial Engineering (Mechanical)', d: 'Escuela Politécnica de Córdoba · 2005 – 2011' },
    { t: 'CAPM Certification (PMI)', d: 'CEOLEVEL · 2025' },
    { t: 'Agile Project Management', d: 'Fundación Esplai · 2025' },
    { t: 'Advanced Course in BIM with Revit', d: 'Structuralia · 2025 – 2026' },
    { t: 'Digital Marketing and Community Management', d: 'Deusto Formación' },
  ],
  idiomas: 'Spanish (native) · English (Cambridge Certificate of Proficiency, C2) · French (DELF)',
  extra: 'Driving licence (B) and own vehicle',
};

/* Idioma de un texto: 'en' si predominan las palabras funcionales en inglés. */
function idiomaTexto(texto) {
  const s = ' ' + String(texto || '').toLowerCase().replace(/[^a-záéíóúñü']+/g, '  ') + ' ';
  const en = (s.match(/ (the|and|with|you|your|will|our|we|for|of|to|is|are|experience|skills|team|role|working) /g) || []).length;
  const es = (s.match(/ (el|la|los|las|de|del|con|para|que|y|una|un|en|experiencia|equipo|puesto|trabajo) /g) || []).length;
  return en >= 6 && en > es * 1.3 ? 'en' : 'es';
}
