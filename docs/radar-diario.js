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

function pintarRadarDiario() {
  const cont = el('div', 'radar-diario');
  const lista = D.ops.filter((o) => pasa(o));
  const porPri = ordenar([...lista]);
  const inf = D.informe;
  const hoy = hoyISO();
  const nuevas = lista.filter((o) => o.fechas.detectada === hoy);
  const pend = Object.values(ST.est).filter((e) => ['interes', 'pendiente', 'borrador'].includes(e.estado)).length;
  const siete = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  // Cabecera
  const cab = el('div', 'r-cab');
  const f = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  cab.append(el('p', 'r-fecha', f.charAt(0).toUpperCase() + f.slice(1)));
  cab.append(el('p', 'r-resumen', nuevas.length ? `${nuevas.length} oportunidad${nuevas.length === 1 ? '' : 'es'} nueva${nuevas.length === 1 ? '' : 's'} desde ayer` : 'Sin novedades desde la última actualización: estas son tus prioridades vigentes.'));
  cont.append(cab);

  // Cifras reales (cada una lleva a la lista filtrada)
  const cifras = el('div', 'r-cifras');
  const cifra = (n, txt, fn) => { const b = boton('', 'r-cifra', fn); b.append(el('b', null, String(n)), el('span', null, txt)); return b; };
  const ir = (hash, f) => () => { limpiar(); if (f) f(); sincronizarChips(); location.hash = hash; pintar(); };
  cifras.append(
    cifra(nuevas.length, 'nuevas hoy', ir('explorar', () => F.rapidos.add('nuevas'))),
    cifra(lista.filter((o) => o.verificacion === 'vacante_confirmada' && puntuar(o).total >= 60).length, 'ofertas compatibles', ir('empleo', () => { F.minimo = 60; })),
    cifra(lista.filter((o) => o.subtipo === 'senal_empresa' || (o.subtipo === 'adjudicacion' && (o.senal?.valor ?? 0) >= 50)).length, 'empresas interesantes', ir('empresas')),
    cifra(lista.filter((o) => o.subtipo === 'adjudicacion' && (o.fechas.publicada || '') >= siete).length, 'adjudicaciones (7 días)', ir('proyectos', () => F.subtipos.add('adjudicacion'))),
    cifra(lista.filter((o) => o.modalidad === 'remoto').length, 'en remoto', ir('explorar', () => F.rapidos.add('remoto'))),
    cifra(lista.filter((o) => o.ubicacion.comunidad === 'Asturias').length, 'en Asturias', ir('explorar', () => F.rapidos.add('asturias'))),
    cifra(pend, 'candidaturas pendientes', () => { location.hash = 'guardados'; }));
  cont.append(cifras);

  // Acciones del informe
  if (inf?.acciones?.length) {
    const s = el('section', 'r-bloque r-acciones');
    s.append(el('h3', null, 'Tus 3 acciones prioritarias'));
    const ol = el('ol', 'acciones-r');
    inf.acciones.forEach((a) => { const li = el('li'); li.append(D.porId.has(a.id) ? boton(a.texto, 'enlace', () => abrirFicha(a.id)) : el('span', null, a.texto)); ol.append(li); });
    s.append(ol);
    cont.append(s);
  }

  const izq = el('div', 'r-col');
  const der = el('div', 'r-col');
  izq.append(bloqueLista('Las mejores para ti', 'Ordenadas por prioridad: combina encaje, señal de la empresa, ubicación, actualidad, salario y acceso con tus pesos.', porPri.slice(0, 10), 'Ninguna oportunidad cumple los filtros.', true));
  const nuevasOf = nuevas.filter((o) => o.tipo === 'empleo');
  izq.append(bloqueLista('Nuevas ofertas de empleo', null, ordenar(nuevasOf).slice(0, 6), 'Hoy no hay ofertas de empleo nuevas que encajen.'));
  const emp = lista.filter((o) => o.subtipo === 'senal_empresa' || o.subtipo === 'adjudicacion').sort((a, b) => (b.senal?.valor ?? 0) - (a.senal?.valor ?? 0) || puntuar(b).total - puntuar(a).total);
  der.append(bloqueLista('Empresas que podrían necesitarte', 'Hechos verificados (adjudicaciones, BORME) y la hipótesis de RADAR: no son vacantes.', emp.slice(0, 6), 'Sin empresas destacadas con estos filtros.'));
  der.append(bloqueLista('Adjudicaciones relevantes', null, ordenar(lista.filter((o) => o.subtipo === 'adjudicacion' && (o.fechas.publicada || '') >= siete)).slice(0, 5), 'No hay adjudicaciones relevantes en los últimos 7 días.'));
  der.append(bloqueLista('Para candidatura espontánea', 'Empresas con contacto verificado o recién creadas.', ordenar(lista.filter((o) => (o.subtipo === 'adjudicacion' && o.contacto?.email) || o.subtipo === 'senal_empresa')).slice(0, 5), 'Sin candidatos claros hoy.'));
  const cols = el('div', 'r-cols'); cols.append(izq, der); cont.append(cols);

  // Estado de las fuentes
  const fu = el('section', 'r-bloque r-fuentes');
  fu.append(el('h3', null, 'Estado de las fuentes'));
  fu.append(el('p', 'nota', 'Si una fuente falla, aquí se ve. Un error no significa que no haya oportunidades: solo que hoy no se ha podido consultar.'));
  const t = el('table', 'tabla-fuentes');
  const th = el('tr'); ['Fuente', 'Estado', 'Última consulta correcta', 'Detalle'].forEach((x) => th.append(el('th', null, x)));
  const thead = el('thead'); thead.append(th);
  const tb = el('tbody');
  const ESTADO = { ok: 'Correcta', error: 'Error', sin_configurar: 'Sin configurar' };
  Object.entries(D.fuentes || {}).sort((a, b) => ({ error: 0, ok: 1, sin_configurar: 2 }[a[1].estado] - { error: 0, ok: 1, sin_configurar: 2 }[b[1].estado])).forEach(([n, f]) => {
    const tr = el('tr', 'f-' + f.estado);
    tr.append(el('td', null, n), el('td', 'f-est', ESTADO[f.estado] || f.estado), el('td', null, f.ultima_correcta ? relativo(f.ultima_correcta) : '—'),
      el('td', null, f.estado === 'error' ? f.error : f.detalle || ''));
    tb.append(tr);
  });
  if (!tb.childNodes.length) { const tr = el('tr'); const td = el('td', null, 'Todavía no hay registro de fuentes: aparecerá tras la próxima ejecución diaria.'); td.colSpan = 4; tr.append(td); tb.append(tr); }
  t.append(thead, tb);
  fu.append(t);
  cont.append(fu);

  $('#res-n').textContent = `${lista.length} oportunidades vigentes · ${nuevas.length} nuevas`;
  $('#rejilla').replaceChildren(cont);
}
