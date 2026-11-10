'use strict';
/* Mi Radar Diario (ticket 04): lo importante de hoy en pocos segundos.
   Solo datos reales; si una fuente falla, se dice, y no se confunde con «no hay oportunidades». */

D.informe = null;
D.fuentes = {};
(async () => {
  const [inf, fu] = await Promise.all([
    fetch('data/informe.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    fetch('data/fuentes.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
  ]);
  D.informe = inf; D.fuentes = fu;
  if (typeof VISTA !== 'undefined' && VISTA === 'radar' && D.ops.length) pintar();
})();

/* Tres indicadores separados */
function indicadores3(o) {
  const cr = Object.fromEntries(puntuar(o).partes.map((x) => [x.k, x]));
  return {
    fit: Math.round((cr.encaje.valor ?? 0) * 100), fitM: cr.encaje.motivos || [],
    senal: o.senal?.valor ?? Math.round((cr.necesidad.valor ?? 0) * 100), senalM: o.senal?.motivos || cr.necesidad.motivos || [],
    prioridad: puntuar(o).total,
  };
}

function relativo(iso) {
  if (!iso) return 'nunca';
  const h = Math.round((Date.now() - Date.parse(iso)) / 36e5);
  if (h < 1) return 'hace menos de una hora';
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function filaRadar(o, i) {
  const ind = indicadores3(o);
  const li = el('li', 'fila-r');
  const b = boton('', 'fila-r-b', () => abrirFicha(o.id));
  b.append(el('span', 'fila-r-n', i != null ? String(i + 1) : '•'));
  const t = el('div', 'fila-r-t');
  const cab = el('div', 'fila-r-cab');
  cab.append(el('span', 'fila-r-tit', o.titulo));
  if (o.nueva) cab.append(el('span', 'badge-nueva', 'Nueva'));
  t.append(cab);
  t.append(el('small', null, [o.organizacion.nombre, lugarCorto(o)].filter(Boolean).join(' · ')));
  const raz = razones(o).slice(0, 2);
  if (raz.length) t.append(el('small', 'fila-r-raz', '✓ ' + raz.join(' · ')));
  t.append(el('small', 'fila-r-meta', [NATURALEZA[o.verificacion], o.fuentes[0]?.nombre, 'detectada ' + fecha(o.fechas.detectada || o.fechas.consultada)].filter(Boolean).join(' · ')));
  const ps = el('div', 'fila-r-p');
  const pill = (n, v, cls) => { const s = el('span', 'pill ' + cls); s.append(el('b', null, String(v)), ' ' + n); return s; };
  ps.append(pill('prioridad', ind.prioridad, 'p-pri'), pill('encaje', ind.fit, 'p-fit'), pill('señal', ind.senal, 'p-sen'));
  b.append(t, ps);
  li.append(b);
  return li;
}

function bloqueLista(titulo, nota, ops, vacio, numerada) {
  const s = el('section', 'r-bloque');
  s.append(el('h3', null, titulo));
  if (nota) s.append(el('p', 'nota', nota));
  const ol = el('ol', 'lista-r');
  if (ops.length) ops.forEach((o, i) => ol.append(filaRadar(o, numerada ? i : null)));
  else ol.append(el('li', 'vacio-r', vacio));
  s.append(ol);
  return s;
}


/* ---------- Rediseño «Mi radar»: centro de decisiones ---------- */
const ICONO = {
  maleta: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>',
  edificio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/></svg>',
  portatil: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
  enviar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  rayo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  bombilla: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/></svg>',
  calendario: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  flecha: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  externo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};
const icoR = (k) => { const s = el('span', 'ico'); s.innerHTML = ICONO[k]; return s; };
const decidida = (o) => ['enviada', 'respuesta', 'entrevista', 'descartada', 'cerrada'].includes(ST.est[o.id]?.estado) || ST.ocultas?.[o.id];
const corta = (s, n) => (s && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s || '');
const nombreEmp = (s) => (s || '').replace(/,?\s*(SOCIEDAD LIMITADA( UNIPERSONAL)?|SOCIEDAD ANONIMA|S\.?L\.?U?|S\.?A\.?U?)\.?\s*$/i, '');

function explicacion(o) {
  const enc = (puntuar(o).partes.find((x) => x.k === 'encaje')?.motivos || []).map((m) => m.replace(/^(puesto|tema): /, ''));
  const geo = puntuar(o).partes.find((x) => x.k === 'geografia');
  const partes = [];
  if (enc.length) partes.push(`Encaja con tu experiencia en ${enc.slice(0, 3).join(', ')}`);
  if (geo?.valor >= 0.6 && geo.motivos?.[0]) partes.push(geo.motivos[0]);
  if (o.verificacion === 'vacante_confirmada') partes.push('es una vacante publicada');
  else partes.push('es una oportunidad potencial, no una vacante');
  const t = partes.join('; ');
  return t.charAt(0).toUpperCase() + t.slice(1) + '.';
}

function siguientesMovimientos(lista, principal) {
  const mov = [];
  const usados = new Set();
  const vac = lista.filter((o) => o.verificacion === 'vacante_confirmada' && !decidida(o));
  if (principal && !decidida(principal)) {
    mov.push({ o: principal, ico: 'enviar', titulo: `Aplicar a ${principal.organizacion.nombre || corta(principal.titulo, 40)}`, motivo: 'La oportunidad con mayor prioridad para ti.' });
    usados.add(principal.id);
  }
  const adj = ordenar(lista.filter((o) => o.subtipo === 'adjudicacion' && o.contacto?.email && !decidida(o) && !usados.has(o.id)));
  if (adj[0]) { mov.push({ o: adj[0], ico: 'edificio', titulo: `Contactar con ${corta(nombreEmp(adj[0].organizacion.nombre), 36)}`, motivo: 'Acaba de ganar un proyecto de tu perfil y tiene correo verificado.' }); usados.add(adj[0].id); }
  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const lic = lista.filter((o) => o.subtipo === 'licitacion_abierta' && o.pide_pm && (o.fechas.plazo || '') >= manana && puntuar(o).total >= 55 && !decidida(o) && !usados.has(o.id))
    .sort((a, b) => a.fechas.plazo.localeCompare(b.fechas.plazo));
  if (lic[0]) { mov.push({ o: lic[0], ico: 'lupa', titulo: 'Ofrecerte para una licitación', motivo: `Puntúa al jefe de proyecto; ofertas hasta el ${fecha(lic[0].fechas.plazo)}.` }); usados.add(lic[0].id); }
  if (mov.length < 3) {
    const otra = vac.find((o) => !usados.has(o.id));
    if (otra) mov.push({ o: otra, ico: 'enviar', titulo: `Aplicar a ${otra.organizacion.nombre || corta(otra.titulo, 40)}`, motivo: 'Otra vacante con prioridad alta.' });
  }
  return mov.slice(0, 3);
}

function insight(lista) {
  const top = ordenar(lista.filter((o) => o.verificacion === 'vacante_confirmada')).slice(0, 10);
  if (top.length >= 5) {
    const rem = top.filter((o) => o.modalidad === 'remoto' || o.modalidad === 'hibrido').length;
    const cuenta = {};
    top.forEach((o) => sectoresDe(o).forEach((s) => { cuenta[s] = (cuenta[s] || 0) + 1; }));
    const [sec, n] = Object.entries(cuenta).filter(([k]) => k !== 'gestion').sort((a, b) => b[1] - a[1])[0] || [];
    if (sec && n >= 3) return { texto: `${n} de tus 10 vacantes con más prioridad son del sector «${SECTORES[sec][0]}».`, enlace: 'Ver ese sector', fn: () => { limpiar(); F.sectores.add(sec); sincronizarChips(); location.hash = 'empleo'; } };
    if (rem >= 5) return { texto: `${rem} de tus 10 vacantes con más prioridad son en remoto o híbridas.`, enlace: 'Ver las remotas', fn: () => { limpiar(); F.rapidos.add('remoto'); sincronizarChips(); location.hash = 'empleo'; } };
  }
  const lic = lista.filter((o) => o.subtipo === 'licitacion_abierta' && o.pide_pm && (o.fechas.plazo || '') >= hoyISO()).length;
  if (lic) return { texto: `Hay ${lic} licitación${lic === 1 ? '' : 'es'} abierta${lic === 1 ? '' : 's'} que puntúa${lic === 1 ? '' : 'n'} la experiencia del jefe de proyecto: puedes ofrecerte a las empresas que se presenten.`, enlace: 'Ver licitaciones', fn: () => { limpiar(); F.subtipos.add('licitacion_abierta'); sincronizarChips(); location.hash = 'proyectos'; } };
  return null;
}

function tarjetaPrincipal(o) {
  const ind = indicadores3(o);
  const c = el('article', 'r-mejor');
  c.tabIndex = 0;
  const vis = visual(o, true); vis.classList.add('r-mejor-vis');
  const cu = el('div', 'r-mejor-c');
  const badge = el('span', 'r-badge'); badge.append(icoR('rayo'), 'Tu mejor oportunidad'); cu.append(badge);
  cu.append(el('h2', null, o.titulo));
  cu.append(el('p', 'r-mejor-org', [o.organizacion.nombre, lugarCorto(o)].filter(Boolean).join(' · ')));
  cu.append(el('p', 'r-mejor-exp', explicacion(o)));
  const chips = el('div', 'r-chips');
  chips.append(el('span', 'r-chip', `Encaje ${ind.fit}`), el('span', 'r-chip', `Señal ${ind.senal}`));
  if (o.modalidad !== 'desconocida') chips.append(el('span', 'r-chip', MODALIDAD[o.modalidad]));
  const sec = sectoresDe(o).find((s) => s !== 'gestion' && s !== 'publico'); if (sec) chips.append(el('span', 'r-chip', SECTORES[sec][0]));
  cu.append(chips);
  const pie = el('div', 'r-mejor-pie');
  const det = el('span', 'r-det'); det.append(icoR('calendario'), 'Detectada ' + relativo((o.fechas.detectada || o.fechas.consultada) + 'T08:00:00Z'));
  const cta = boton('', 'btn grande r-cta', () => abrirFicha(o.id)); cta.append(icoR('externo'), el('span', null, 'Ver oportunidad y preparar candidatura'));
  pie.append(det, cta);
  cu.append(pie);
  const nota = el('div', 'r-nota'); nota.append(el('b', null, String(ind.prioridad)), el('span', null, '/ 100 prioridad'));
  nota.title = 'Prioridad: dónde invertir tu tiempo. No es una probabilidad de contratación.';
  c.append(cu, vis, nota);
  c.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === c) abrirFicha(o.id); });
  return c;
}

function tarjetaMini(o) {
  const ind = indicadores3(o);
  const a = el('article', 'r-mini');
  const cab = el('div', 'r-mini-cab');
  cab.append(boton(o.titulo, 'r-mini-t', () => abrirFicha(o.id)), botonFav(o));
  a.append(cab, el('p', 'r-mini-org', [o.organizacion.nombre, lugarCorto(o)].filter(Boolean).join(' · ')));
  const b = el('div', 'r-mini-barra'); const bar = el('div', 'barra'); const i = el('i'); i.style.width = ind.fit + '%'; bar.append(i);
  b.append(bar, el('span', null, 'Encaje '), el('b', null, String(ind.fit)));
  a.append(b);
  const pie = el('p', 'r-mini-pie');
  pie.append(el('b', null, '★ Prioridad ' + ind.prioridad), ' · Detectada el ' + fecha(o.fechas.detectada || o.fechas.consultada));
  if (o.nueva) pie.append(' ', el('span', 'badge-nueva', 'Nueva'));
  a.append(pie);
  return a;
}

function pintarRadarDiario() {
  const cont = el('div', 'r2');
  // El panel no depende de los filtros de otras vistas: muestra todo lo vigente (sin descartadas ni quitadas).
  const lista = D.ops.filter((o) => ST.est[o.id]?.estado !== 'descartada' && !ST.ocultas?.[o.id]);
  const vacantes = ordenar(lista.filter((o) => o.verificacion === 'vacante_confirmada'));
  const pendientes = vacantes.filter((o) => !decidida(o));
  const principal = pendientes[0] || ordenar(lista.filter((o) => !decidida(o)))[0];
  const hoy = hoyISO();
  const nuevas = lista.filter((o) => o.fechas.detectada === hoy);
  const compatibles = vacantes.filter((o) => puntuar(o).total >= 60);
  const empresasObj = lista.filter((o) => o.subtipo === 'senal_empresa' || o.subtipo === 'noticia_empresa' || (o.subtipo === 'adjudicacion' && (o.senal?.valor ?? 0) >= 50));
  const remotas = vacantes.filter((o) => o.modalidad === 'remoto');

  // Cabecera
  const h = new Date().getHours();
  const hero = el('section', 'r2-hero');
  const hi = el('div', 'r2-hero-in');
  hi.append(el('h1', null, `${h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'}, Rocío.`));
  hi.append(el('p', 'r2-sub', nuevas.length
    ? `RADAR ha detectado ${nuevas.length} oportunidad${nuevas.length === 1 ? '' : 'es'} nueva${nuevas.length === 1 ? '' : 's'} desde ayer. Esta es la que más te conviene ahora.`
    : 'Sin novedades desde la última actualización. Estas son tus prioridades vigentes.'));
  const act = el('p', 'r2-fecha'); act.append(icoR('calendario'), D.meta.actualizado ? 'Actualizado ' + new Date(D.meta.actualizado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha de actualización');
  hi.append(act);
  const kpis = el('div', 'r2-kpis');
  const kpi = (ic, n, txt, fn) => { const b = boton('', 'r2-kpi', fn); const t = el('span', 'r2-kpi-t'); t.append(el('b', null, String(n)), el('span', null, txt)); b.append(icoR(ic), t, icoR('flecha')); return b; };
  const ir = (hash, f) => () => { limpiar(); if (f) f(); sincronizarChips(); location.hash = hash; };
  kpis.append(kpi('maleta', compatibles.length, 'Ofertas compatibles', ir('empleo', () => { F.minimo = 60; })),
    kpi('edificio', empresasObj.length, 'Empresas objetivo', ir('empresas')),
    kpi('portatil', remotas.length, '100% remoto', ir('empleo', () => F.rapidos.add('remoto'))));
  hi.append(kpis);
  hero.append(hi);
  cont.append(hero);

  // Cuerpo
  const grid = el('div', 'r2-grid');
  const izq = el('div', 'r2-izq');
  const der = el('div', 'r2-der');
  if (principal) izq.append(tarjetaPrincipal(principal));
  else izq.append(el('div', 'vacio', 'No hay oportunidades que cumplan tus filtros ahora mismo. Revisa «Mi perfil» o vuelve mañana.'));

  const otras = el('section', 'r2-otras');
  const oc = el('div', 'r2-sec-cab');
  oc.append(el('h3', null, 'Otras oportunidades compatibles'));
  const ver = el('a', 'enlace r2-ver', 'Ver todas las ofertas →'); ver.href = '#empleo'; oc.append(ver);
  otras.append(oc);
  const grid2 = el('div', 'r2-minis');
  const resto = pendientes.filter((o) => o !== principal).slice(0, 4);
  if (resto.length) resto.forEach((o) => grid2.append(tarjetaMini(o)));
  else grid2.append(el('p', 'vacio-r', 'No hay más vacantes pendientes con estos filtros.'));
  otras.append(grid2);
  izq.append(otras);

  const mov = el('section', 'r2-mov');
  const mc = el('h3'); mc.append(icoR('rayo'), 'Tu siguiente movimiento'); mov.append(mc);
  const ol = el('ol');
  const movs = siguientesMovimientos(lista, principal);
  movs.forEach((m, i) => {
    const li = el('li');
    const b = boton('', 'r2-mov-b', () => abrirFicha(m.o.id));
    const t = el('span', 'r2-mov-t'); t.append(el('b', null, m.titulo), el('small', null, m.motivo));
    b.append(el('span', 'r2-mov-n', String(i + 1)), icoR(m.ico), t, icoR('flecha'));
    li.append(b); ol.append(li);
  });
  if (!movs.length) ol.append(el('li', 'vacio-r', 'No hay acciones pendientes: has revisado todo lo prioritario.'));
  mov.append(ol);
  der.append(mov);

  const ins = insight(lista);
  if (ins) {
    const s = el('section', 'r2-insight');
    const hh = el('h3'); hh.append(icoR('bombilla'), 'Insight de RADAR'); s.append(hh);
    s.append(el('p', null, ins.texto), boton(ins.enlace + ' →', 'enlace', ins.fn));
    der.append(s);
  }

  // Vista secundaria: más cifras y estado de las fuentes
  const mas = el('details', 'r2-mas');
  mas.append(el('summary', null, 'Más cifras y estado de las fuentes'));
  const pend = Object.values(ST.est).filter((e) => ['interes', 'pendiente', 'borrador'].includes(e.estado)).length;
  const siete = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const ul = el('ul', 'r2-cifras');
  [[nuevas.length, 'nuevas hoy'], [lista.filter((o) => o.subtipo === 'adjudicacion' && (o.fechas.publicada || '') >= siete).length, 'adjudicaciones en 7 días'],
    [lista.filter((o) => o.ubicacion.comunidad === 'Asturias').length, 'en Asturias'], [pend, 'candidaturas pendientes'], [lista.length, 'oportunidades vigentes']]
    .forEach(([n, t]) => { const li = el('li'); li.append(el('b', null, String(n)), ' ' + t); ul.append(li); });
  mas.append(ul);
  const t = el('table', 'tabla-fuentes');
  const th = el('tr'); ['Fuente', 'Estado', 'Última consulta correcta', 'Detalle'].forEach((x) => th.append(el('th', null, x)));
  const thead = el('thead'); thead.append(th);
  const tb = el('tbody');
  const ESTADO = { ok: 'Correcta', error: 'Error', sin_configurar: 'Sin configurar' };
  const ordenE = { error: 0, ok: 1, sin_configurar: 2 };
  Object.entries(D.fuentes || {}).sort((a, b) => ordenE[a[1].estado] - ordenE[b[1].estado]).forEach(([n, f]) => {
    const tr = el('tr', 'f-' + f.estado);
    tr.append(el('td', null, n), el('td', 'f-est', ESTADO[f.estado] || f.estado), el('td', null, f.ultima_correcta ? relativo(f.ultima_correcta) : '—'), el('td', null, f.estado === 'error' ? f.error : f.detalle || ''));
    tb.append(tr);
  });
  if (!tb.childNodes.length) { const tr = el('tr'); const td = el('td', null, 'El registro de fuentes aparecerá tras la próxima ejecución diaria.'); td.colSpan = 4; tr.append(td); tb.append(tr); }
  t.append(thead, tb);
  mas.append(el('p', 'nota', 'Un error en una fuente no significa que no haya oportunidades: solo que hoy no se ha podido consultar.'), t);
  if (Object.values(D.fuentes || {}).some((f) => f.estado === 'error')) mas.open = true;
  der.append(mas);

  grid.append(izq, der);
  cont.append(grid);
  $('#res-n').textContent = '';
  $('#rejilla').replaceChildren(cont);
}
