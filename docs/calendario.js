'use strict';
/* Fechas al calendario: plazos de inscripción y de ofertas, exámenes, entrevistas y
   recordatorios para insistir. Dos formas: Google Calendar (enlace con el evento ya
   relleno) y archivo .ics para cualquier calendario, con avisos 3 días y 1 día antes.
   No se envía nada por sí solo: el evento se crea cuando la usuaria lo guarda. */

ST.entrevistas = ST.entrevistas || {};

const calPad = (n) => String(n).padStart(2, '0');
const calDia = (iso) => iso.replace(/-/g, '').slice(0, 8);
const calSiguiente = (iso) => { const [y, m, d] = iso.split('-').map(Number); const f = new Date(y, m - 1, d + 1); return `${f.getFullYear()}${calPad(f.getMonth() + 1)}${calPad(f.getDate())}`; };
const calUtc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const calLocal = (d) => `${d.getFullYear()}${calPad(d.getMonth() + 1)}${calPad(d.getDate())}T${calPad(d.getHours())}${calPad(d.getMinutes())}00`;
const calInicio = (ev) => { const [y, m, d] = ev.fecha.split('-').map(Number); const [h, mi] = (ev.hora || '00:00').split(':').map(Number); return new Date(y, m - 1, d, h, mi); };

/* Eventos de una oportunidad, solo con fechas que constan (o calculadas de las bases, marcadas como tales). */
function eventosDe(o) {
  const out = [];
  const hoy = hoyISO();
  const org = o.organizacion?.nombre || '';
  const url = o.accion?.url || o.fuentes?.[0]?.url || '';
  const base = { id: o.id, org, url };
  if (o.fechas?.plazo && o.fechas.plazo >= hoy) {
    const pref = /oposicion|contrato_publico/.test(o.subtipo) ? 'Fin de inscripción' : o.subtipo === 'licitacion_abierta' ? 'Fin de plazo de ofertas' : 'Cierra la oferta';
    out.push({ ...base, tipo: 'plazo', titulo: `${pref}: ${o.titulo}`, corto: pref, fecha: o.fechas.plazo, avisos: true,
      nota: /oposicion|contrato_publico/.test(o.subtipo) ? 'Fecha calculada con las bases: confírmala en la sede oficial.' : '' });
  }
  if (/oposicion|contrato_publico/.test(o.subtipo) && typeof analisisDe === 'function') {
    const a = analisisDe(o);
    if (a?.examen.fecha && a.examen.fecha >= hoy) out.push({ ...base, tipo: 'examen', titulo: `Examen: ${o.titulo}`, corto: 'Examen', fecha: a.examen.fecha, avisos: true });
    else if (a?.examen.minimo && a.examen.minimo >= hoy) out.push({ ...base, tipo: 'examen-min', titulo: `Posible inicio del examen: ${o.titulo}`, corto: 'Examen (fecha más temprana posible)', fecha: a.examen.minimo, avisos: true, nota: 'Las bases fijan esta fecha como mínima; la exacta se publicará más adelante.' });
  }
  const e = ST.est[o.id];
  if (e?.estado === 'enviada') {
    const env = [...e.hist].reverse().find((h) => h.e === 'enviada');
    if (env) {
      const d = new Date(env.f); d.setDate(d.getDate() + 7);
      const iso = `${d.getFullYear()}-${calPad(d.getMonth() + 1)}-${calPad(d.getDate())}`;
      if (iso >= hoy) out.push({ ...base, tipo: 'insistir', titulo: `Insistir si no hay respuesta: ${o.titulo}`, corto: 'Insistir si no hay respuesta', fecha: iso, avisos: false, nota: 'Una semana después de enviar la candidatura.' });
    }
  }
  const en = ST.entrevistas[o.id];
  if (en?.fecha && en.fecha >= hoy) out.push({ ...base, tipo: 'entrevista', titulo: `Entrevista: ${o.titulo}${org ? ' (' + org + ')' : ''}`, corto: 'Entrevista', fecha: en.fecha, hora: en.hora || '', duracion: 60, lugar: en.lugar || '', avisos: true });
  return out;
}

function calDescripcion(ev) {
  return [ev.org, ev.nota, ev.url ? 'Enlace: ' + ev.url : '', 'Añadido desde RADAR.'].filter(Boolean).join('\n');
}

function enlaceGoogle(ev) {
  let fechas;
  if (ev.hora) {
    const i = calInicio(ev); const f = new Date(i.getTime() + (ev.duracion || 60) * 60000);
    fechas = `${calLocal(i)}/${calLocal(f)}`;
  } else fechas = `${calDia(ev.fecha)}/${calSiguiente(ev.fecha)}`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.titulo, dates: fechas, details: calDescripcion(ev) + (ev.avisos ? '\nConsejo: añade un aviso unos días antes.' : ''), ctz: 'Europe/Madrid' });
  if (ev.lugar) p.set('location', ev.lugar);
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

function icsTexto(eventos) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const plegar = (l) => { const out = []; let x = l; while (x.length > 74) { out.push(x.slice(0, 74)); x = ' ' + x.slice(74); } out.push(x); return out.join('\r\n'); };
  const ahora = calUtc(new Date());
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RADAR//Fechas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  eventos.forEach((ev) => {
    lineas.push('BEGIN:VEVENT', `UID:${hash(ev.id + ev.tipo)}-${calDia(ev.fecha)}@radar`, `DTSTAMP:${ahora}`);
    if (ev.hora) {
      const i = calInicio(ev);
      lineas.push(`DTSTART:${calUtc(i)}`, `DTEND:${calUtc(new Date(i.getTime() + (ev.duracion || 60) * 60000))}`);
    } else lineas.push(`DTSTART;VALUE=DATE:${calDia(ev.fecha)}`, `DTEND;VALUE=DATE:${calSiguiente(ev.fecha)}`, 'TRANSP:TRANSPARENT');
    lineas.push(`SUMMARY:${esc(ev.titulo)}`, `DESCRIPTION:${esc(calDescripcion(ev))}`);
    if (ev.lugar) lineas.push(`LOCATION:${esc(ev.lugar)}`);
    if (ev.url) lineas.push(`URL:${ev.url}`);
    if (ev.avisos) {
      // Avisos a las 9:00 tres días antes y el día anterior (o 1 h antes si tiene hora).
      const avisos = ev.hora ? ['-P1D', '-PT1H'] : ['-P2DT15H', '-PT15H'];
      avisos.forEach((t) => lineas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.titulo)}`, `TRIGGER:${t}`, 'END:VALARM'));
    }
    lineas.push('END:VEVENT');
  });
  lineas.push('END:VCALENDAR');
  return lineas.map(plegar).join('\r\n') + '\r\n';
}

function descargarIcs(eventos, nombre) {
  const blob = new Blob([icsTexto(eventos)], { type: 'text/calendar;charset=utf-8' });
  const a = el('a'); a.href = URL.createObjectURL(blob);
  a.download = (nombre || 'radar-fechas').replace(/[^\w\-áéíóúñ ]+/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) + '.ics';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function botonesCalendario(ev) {
  const d = el('div', 'cal-bts');
  const g = enlace(enlaceGoogle(ev), 'Google Calendar', 'cal-b');
  g.setAttribute('aria-label', 'Añadir a Google Calendar: ' + ev.titulo);
  const i = boton('.ics (con avisos)', 'cal-b', () => descargarIcs([ev], ev.titulo));
  i.setAttribute('aria-label', 'Descargar para otro calendario: ' + ev.titulo);
  d.append(g, i);
  return d;
}

function filaEvento(ev, conTitulo) {
  const f = el('div', 'cal-ev cal-' + ev.tipo);
  const t = el('div', 'cal-ev-t');
  const cuando = fecha(ev.fecha) + (ev.hora ? ' · ' + ev.hora : '');
  t.append(el('b', null, conTitulo ? ev.titulo : ev.corto), el('small', null, [cuando, ev.nota].filter(Boolean).join(' · ')));
  f.append(el('span', 'cal-ico', '📅'), t, botonesCalendario(ev));
  return f;
}

/* Bloque «Fechas» de la ficha, con la entrevista editable. */
function seccionFechas(o) {
  const s = el('section', 'cal-sec');
  s.append(el('h4', null, 'Fechas para tu calendario'));
  const evs = eventosDe(o);
  evs.forEach((ev) => s.append(filaEvento(ev)));
  if (!evs.length) s.append(el('p', 'nota', o.subtipo === 'oferta' ? 'Esta oferta no publica fecha de cierre. Si te llaman para una entrevista, añádela aquí.' : 'Sin fechas próximas. Analiza la convocatoria para calcular el plazo y el examen.'));
  if (o.tipo === 'empleo' || ST.est[o.id]) {
    const det = el('details', 'cal-entrevista');
    const en = ST.entrevistas[o.id] || {};
    det.open = Boolean(en.fecha) || ['respuesta', 'entrevista'].includes(ST.est[o.id]?.estado);
    det.append(el('summary', null, en.fecha ? 'Cambiar la entrevista' : 'Añadir una entrevista'));
    const fila = el('div', 'cal-form');
    const fi = el('input'); fi.type = 'date'; fi.value = en.fecha || ''; fi.min = hoyISO(); fi.setAttribute('aria-label', 'Fecha de la entrevista');
    const hi = el('input'); hi.type = 'time'; hi.value = en.hora || ''; hi.step = 900; hi.setAttribute('aria-label', 'Hora');
    const li = el('input'); li.placeholder = 'Lugar o enlace (opcional)'; li.value = en.lugar || ''; li.setAttribute('aria-label', 'Lugar o enlace de la entrevista');
    fila.append(fi, hi, li);
    const acc = el('div', 'acciones');
    acc.append(boton('Guardar entrevista', 'btn mini', () => {
      if (!fi.value) { fi.focus(); return; }
      ST.entrevistas[o.id] = { fecha: fi.value, hora: hi.value, lugar: li.value.trim() };
      if (!['entrevista', 'descartada', 'cerrada'].includes(ST.est[o.id]?.estado)) setEstado(o.id, 'entrevista', `Entrevista el ${fecha(fi.value)}${hi.value ? ' a las ' + hi.value : ''}`);
      guardarST(); abrirFicha(o.id); pintar();
      setTimeout(() => $('#ficha .cal-sec')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    }));
    if (en.fecha) acc.append(boton('Quitar', 'enlace quitar', () => { delete ST.entrevistas[o.id]; guardarST(); abrirFicha(o.id); pintar(); }));
    det.append(fila, acc);
    s.append(det);
  }
  return s;
}

/* «Próximas fechas» en Seguimiento: lo guardado o con estado, y las entrevistas. */
function seccionProximasFechas() {
  const ids = new Set([...Object.keys(ST.fav), ...Object.keys(ST.est), ...Object.keys(ST.entrevistas)]);
  const evs = [...ids].map((id) => D.porId.get(id)).filter(Boolean).flatMap(eventosDe).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  const s = el('section', 'cal-prox');
  const cab = el('div', 'cols-cab');
  cab.append(el('h3', null, 'Próximas fechas'));
  if (evs.length) cab.append(boton('Descargar todas (.ics)', 'btn sec mini', () => descargarIcs(evs, 'radar-proximas-fechas')));
  s.append(cab);
  if (!evs.length) { s.append(el('p', 'nota', 'Cuando guardes oportunidades con plazo, envíes candidaturas o añadas entrevistas, sus fechas aparecerán aquí para llevarlas a tu calendario.')); return s; }
  const lista = el('div', 'cal-lista');
  evs.slice(0, 12).forEach((ev) => {
    const f = filaEvento(ev, true);
    const b = f.querySelector('.cal-ev-t b');
    const bt = boton(b.textContent, 'enlace titulo-g', () => abrirFicha(ev.id)); b.replaceWith(bt);
    lista.append(f);
  });
  s.append(lista);
  if (evs.length > 12) s.append(el('p', 'nota', `Y ${evs.length - 12} más en el archivo de todas las fechas.`));
  s.append(el('p', 'nota', 'El archivo .ics funciona con Google Calendar (Importar), Outlook y el calendario del móvil, e incluye avisos.'));
  return s;
}
