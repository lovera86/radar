'use strict';
/* RADAR aprende de tus decisiones.
   Compara lo que descartas («No me interesa», deslizar a la izquierda, quitar) con lo
   que guardas, marcas con interés o envías, y busca rasgos que se repiten: palabras del
   puesto, empresa, zona, modalidad, tipo y sector. Cuando un rasgo aparece en al menos
   3 descartes y casi nunca en lo que te interesa (o al revés), lo PROPONE. Solo se
   aplica si lo aceptas, y nunca oculta nada: sube o baja la prioridad, explicado en la ficha. */

PREF.reglas = PREF.reglas || [];
PREF.sugNo = PREF.sugNo || {};

const APR_STOP = new Set(('para como con del los las una unos unas por sus que mas sin sobre entre desde hacia hasta segun este esta estos estas ' +
  'the and for with from your our you are will have plaza plazas puesto puestos empleo oferta trabajo h/m (h/m) m/f h-m ' +
  'senior junior sr jr').split(' '));
const APR_POS = ['interes', 'pendiente', 'borrador', 'enviada', 'respuesta', 'entrevista'];
const APR_EFECTO = { palabra: 0.2, org: 0.25, subtipo: 0.15, sector: 0.15, comunidad: 0.3, modalidad: 0.25 };

/* Rasgos de una oportunidad (o de su instantánea si ya no está en las fuentes). */
function rasgosDe(id) {
  const o = D.porId.get(id);
  const sn = ST.snap[id] || {};
  const titulo = o?.titulo || sn.titulo || '';
  const org = o?.organizacion?.nombre || sn.org || '';
  const r = new Map();
  const add = (tipo, valor, etiqueta) => { if (valor) r.set(tipo + ':' + valor, { tipo, valor, etiqueta: etiqueta || valor }); };
  [...new Set(norm(titulo).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9+]+/))].filter((w) => w.length >= 4 && !APR_STOP.has(w) && !/^\d+$/.test(w)).forEach((w) => add('palabra', w));
  if (org) add('org', norm(org).replace(/[^a-z0-9]+/g, ' ').trim(), org);
  const sub = o?.subtipo || sn.subtipo;
  if (sub) add('subtipo', sub, SUBTIPOS[sub]?.nombre || sub);
  if (o) {
    if (o.ubicacion?.comunidad && !['Remoto', 'Estatal / otras', 'Sin especificar'].includes(o.ubicacion.comunidad) && o.modalidad !== 'remoto') add('comunidad', o.ubicacion.comunidad);
    if (o.modalidad && o.modalidad !== 'desconocida') add('modalidad', o.modalidad, MODALIDAD[o.modalidad]);
    sectoresDe(o).filter((s) => s !== 'gestion').forEach((s) => add('sector', s, SECTORES[s]?.[0] || s));
  }
  return r;
}

function decisiones() {
  const neg = new Set([...Object.entries(ST.est).filter(([, e]) => e.estado === 'descartada').map(([id]) => id), ...Object.keys(ST.ocultas || {})]);
  const pos = new Set([...Object.keys(ST.fav), ...Object.entries(ST.est).filter(([, e]) => APR_POS.includes(e.estado)).map(([id]) => id)]);
  neg.forEach((id) => pos.delete(id));
  return { neg: [...neg], pos: [...pos] };
}

function sugerenciasAprendizaje() {
  const { neg, pos } = decisiones();
  const cuenta = new Map();
  const sumar = (ids, campo) => ids.forEach((id) => rasgosDe(id).forEach((x, k) => { const c = cuenta.get(k) || { ...x, n: 0, p: 0 }; c[campo]++; cuenta.set(k, c); }));
  sumar(neg, 'n'); sumar(pos, 'p');
  const activas = new Set(PREF.reglas.map((r) => r.tipo + ':' + r.valor));
  const out = [];
  cuenta.forEach((c, k) => {
    if (activas.has(k) || PREF.sugNo[k]) return;
    if (c.tipo === 'comunidad' && PREF.zonas.includes(c.valor)) return;
    if (c.n >= 3 && (c.p === 0 || (c.n >= 5 && c.n >= 4 * c.p))) out.push({ ...c, k, signo: -1, fuerza: c.n - c.p });
    else if (c.p >= 3 && c.n === 0 && ['palabra', 'org', 'sector', 'subtipo'].includes(c.tipo)) out.push({ ...c, k, signo: 1, fuerza: c.p });
  });
  // Si una palabra y su empresa dicen lo mismo, basta con una; prioriza lo más claro.
  return out.sort((a, b) => b.fuerza - a.fuerza).slice(0, 8);
}

function textoRegla(r) {
  const que = {
    palabra: `ofertas con «${r.etiqueta}» en el título`,
    org: `oportunidades de ${r.etiqueta}`,
    subtipo: `«${r.etiqueta}»`,
    sector: `el sector «${r.etiqueta}»`,
    comunidad: `puestos presenciales o híbridos en ${r.etiqueta}`,
    modalidad: `la modalidad «${r.etiqueta}»`,
  }[r.tipo] || r.etiqueta;
  return que;
}

function aplicarRegla(s) {
  PREF.reglas.push({ tipo: s.tipo, valor: s.valor, etiqueta: s.etiqueta, signo: s.signo, n: s.signo < 0 ? s.n : s.p, f: new Date().toISOString() });
  guardarPref();
}

/* Se llama desde ajustados(): aplica las reglas aceptadas, con su motivo. */
function aplicarAprendizaje(o, c) {
  if (!PREF.reglas.length) return;
  let rasgos = null;
  PREF.reglas.forEach((r) => {
    rasgos = rasgos || rasgosDe(o.id);
    if (!rasgos.has(r.tipo + ':' + r.valor)) return;
    const crit = ['comunidad', 'modalidad'].includes(r.tipo) ? c.geografia : c.encaje;
    if (!crit || crit.valor == null) return;
    const ef = (APR_EFECTO[r.tipo] || 0.15) * (r.signo < 0 ? 1 : 0.5);
    crit.valor = Math.max(0, Math.min(1, crit.valor + (r.signo < 0 ? -ef : ef)));
    crit.motivos.push(`aprendido de tus decisiones: ${r.signo < 0 ? 'sueles descartar' : 'sueles guardar'} ${textoRegla(r)}`);
  });
}

/* Pestaña «Aprendizaje» de Mi perfil. */
function seccionAprendizaje(tarjeta, repintar) {
  const { neg, pos } = decisiones();
  const t = tarjeta('Lo que RADAR ha aprendido de ti', 'Compara lo que descartas con lo que guardas o envías. Solo propone cambios con al menos 3 decisiones parecidas, y no aplica nada sin tu permiso. Nunca oculta ofertas: solo cambia el orden.');
  const cifras = el('div', 'apr-cifras');
  [[neg.length, 'descartadas'], [pos.length, 'guardadas o en curso'], [PREF.reglas.length, 'reglas activas']].forEach(([n, x]) => { const d = el('div'); d.append(el('b', null, String(n)), el('small', null, x)); cifras.append(d); });
  t.append(cifras);

  const sug = sugerenciasAprendizaje();
  const s = tarjeta(sug.length ? `Sugerencias (${sug.length})` : 'Sugerencias');
  if (!sug.length) s.append(el('p', 'nota', neg.length + pos.length < 6 ? 'Todavía hay pocas decisiones. Sigue usando «Me interesa», «No me interesa» y Descubrir, y RADAR irá encontrando patrones.' : 'Ahora mismo no hay patrones claros en tus decisiones.'));
  sug.forEach((x) => {
    const f = el('div', 'apr-sug ' + (x.signo < 0 ? 'baja' : 'sube'));
    const tx = el('div');
    tx.append(el('b', null, x.signo < 0 ? `Bajar ${textoRegla(x)}` : `Subir ${textoRegla(x)}`),
      el('small', null, x.signo < 0 ? `Has descartado ${x.n}${x.p ? ` y guardado solo ${x.p}` : ' y no has guardado ninguna'}.` : `Has guardado o enviado ${x.p} y no has descartado ninguna.`));
    const acc = el('div', 'pf-seg');
    acc.append(boton('Aplicar', 'pf-seg-b on', () => { aplicarRegla(x); repintar(); }),
      boton('No, gracias', 'pf-seg-b', () => { PREF.sugNo[x.k] = new Date().toISOString(); guardarPref(); repintar(); }));
    f.append(tx, acc);
    s.append(f);
  });

  const a = tarjeta('Reglas activas');
  if (!PREF.reglas.length) a.append(el('p', 'nota', 'Ninguna todavía. Las sugerencias que apliques aparecerán aquí y podrás quitarlas cuando quieras.'));
  PREF.reglas.forEach((r, i) => {
    const f = el('div', 'apr-sug ' + (r.signo < 0 ? 'baja' : 'sube'));
    const tx = el('div');
    tx.append(el('b', null, (r.signo < 0 ? 'Bajan ' : 'Suben ') + textoRegla(r)), el('small', null, `Desde el ${fechaCorta(r.f)} · basada en ${r.n} decisiones`));
    f.append(tx, boton('Quitar', 'pf-seg-b', () => { PREF.reglas.splice(i, 1); guardarPref(); repintar(); }));
    a.append(f);
  });
  if (Object.keys(PREF.sugNo).length) a.append(boton(`Volver a proponer las ${Object.keys(PREF.sugNo).length} sugerencias rechazadas`, 'enlace', () => { PREF.sugNo = {}; guardarPref(); repintar(); }));
}

/* Aviso discreto en Hoy cuando hay algo nuevo que proponer. */
function avisoAprendizaje() {
  const sug = sugerenciasAprendizaje();
  if (!sug.length) return null;
  const d = el('div', 'apr-aviso');
  d.append(el('span', 'apr-aviso-i', '✦'), el('span', null, `RADAR ha aprendido de tus decisiones: ${sug.length === 1 ? 'tiene 1 sugerencia' : `tiene ${sug.length} sugerencias`} para ordenar mejor tus oportunidades.`),
    boton('Revisar', 'btn mini', () => { PF_TAB = 'aprende'; try { localStorage.setItem('radar-perfil-tab', 'aprende'); } catch (e) { /* sin almacenamiento */ } location.hash = 'perfil'; }));
  return d;
}
