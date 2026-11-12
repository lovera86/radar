'use strict';
/* RADAR · equipo de agentes (fase 1). Pestaña «Agentes» de Mi perfil, solo administración:
   configuración de la jornada diaria, pausa de emergencia, ejecución manual, equipo e historial.
   Los agentes trabajan en el servidor (función «radar-jornada») aunque el navegador esté cerrado. */

const AG_EQUIPO = [
  ['director', 'Director', 'Planifica la jornada, reparte tareas, vigila límites y escribe el informe.', true],
  ['detector', 'Detector', 'Revisa las fuentes de cada mañana y guarda las señales nuevas, sin repetir las que ya conoce.', true],
  ['investigador', 'Investigador', 'Profundiza en las señales prioritarias y separa hechos de hipótesis.', false],
  ['analista', 'Analista', 'Puntúa el encaje de forma explicable y descarta duplicados.', false],
  ['conector', 'Conector', 'Busca el contacto profesional adecuado, siempre con su fuente.', false],
  ['estratega', 'Estratega', 'Propone el enfoque: qué ofrecer, por qué ahora y el siguiente paso.', false],
  ['comercial', 'Comercial', 'Prepara borradores de presentación y seguimiento. Nunca envía nada.', false],
];
const AG_DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const AG_ESTADO = { planificada: 'Planificada', en_curso: 'En curso', completada: 'Completada', con_errores: 'Con errores', pausada: 'En pausa', cancelada: 'Cancelada' };

async function agLlamar(cuerpo) {
  const { data, error } = await RADAR_NUBE.functions.invoke('radar-jornada', { body: cuerpo });
  if (error) {
    let msg = 'No se ha podido conectar con los agentes.';
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (e) { /* sin JSON */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function seccionAgentes(tarjeta) {
  if (!RADAR_NUBE || !NUBE_SESION || !NUBE_ADMIN) return;
  const cont = tarjeta('Jornada diaria', 'Cada mañana el equipo trabaja solo en el servidor, aunque tengas el navegador cerrado. Nada se envía sin tu aprobación.');
  const cuerpo = el('div', 'ag'); cuerpo.append(el('p', 'nota', 'Cargando…'));
  cont.append(cuerpo);
  const equipo = tarjeta('Equipo de agentes', 'Cada agente es un papel con sus instrucciones y límites. Se activan por fases.');
  const historial = tarjeta('Historial de jornadas', 'Qué se hizo, cuánto duró y cuánto costó cada jornada.');
  const hist = el('div', 'adm-tabla'); historial.append(hist);
  agPintar(cuerpo, equipo, hist);
}

async function agPintar(cuerpo, equipo, hist) {
  const uid = NUBE_SESION.user.id;
  let { data: c, error } = await RADAR_NUBE.from('config_jornada').select('*').eq('user_id', uid).maybeSingle();
  if (error) { cuerpo.replaceChildren(el('p', 'bj-aviso', 'Falta crear las tablas de los agentes (supabase/005_agentes.sql).')); return; }
  if (!c) {
    const r = await RADAR_NUBE.from('config_jornada').insert({ user_id: uid }).select('*').single();
    c = r.data;
  }
  const { data: js } = await RADAR_NUBE.from('jornadas').select('id,fecha,origen,estado,resumen,coste,inicio,fin').eq('user_id', uid).order('inicio', { ascending: false }).limit(10);
  const ultima = (js || [])[0];

  // ---------- Estado y controles ----------
  const estado = el('div', 'ag-estado');
  const luz = el('span', 'ag-luz ' + (c.pausada ? 'off' : 'on'));
  const txt = el('div');
  txt.append(el('b', null, c.pausada ? 'En pausa' : `Activa: ${c.dias.map((d) => AG_DIAS[d - 1]).join(' ')} a las ${String(c.hora).padStart(2, '0')}:00`),
    el('small', null, ultima ? `Última jornada: ${fechaHora(ultima.inicio)} · ${AG_ESTADO[ultima.estado] || ultima.estado}` : 'Todavía no se ha ejecutado ninguna jornada.'));
  estado.append(luz, txt);
  const acc = el('div', 'acciones');
  const msg = el('p', 'nube-msg'); msg.setAttribute('role', 'status');
  const lanzar = boton('Lanzar jornada ahora', 'btn', async () => {
    lanzar.disabled = true; msg.textContent = 'El equipo está trabajando… (puede tardar un minuto)';
    try {
      let r = await agLlamar({ accion: 'lanzar' });
      for (let i = 0; i < 5 && r.jornada?.estado === 'en_curso'; i++) r = await agLlamar({ accion: 'paso' });
      const s = r.jornada?.resumen || {};
      msg.textContent = `${AG_ESTADO[r.jornada?.estado] || 'Hecho'}: ${s.senales_nuevas ?? 0} señales nuevas, ${s.senales_conocidas ?? 0} ya conocidas.`;
    } catch (e) { msg.textContent = e.message; }
    lanzar.disabled = false;
    agPintar(cuerpo, equipo, hist);
  });
  const pausa = boton(c.pausada ? 'Reanudar' : 'Pausar (parada de emergencia)', 'btn sec', async () => {
    try { await agLlamar({ accion: c.pausada ? 'reanudar' : 'pausar' }); } catch (e) { msg.textContent = e.message; }
    agPintar(cuerpo, equipo, hist);
  });
  if (c.pausada) lanzar.disabled = true;
  acc.append(lanzar, pausa);

  // ---------- Configuración ----------
  const f = el('form', 'ag-config');
  const campo = (t, input, ayuda) => { const l = el('label'); l.append(el('span', null, t), input); if (ayuda) l.append(el('small', null, ayuda)); f.append(l); return input; };
  const hora = el('select'); hora.id = 'ag-hora';
  for (let h = 5; h <= 11; h++) { const o = el('option', null, `${String(h).padStart(2, '0')}:00`); o.value = h; o.selected = c.hora === h; hora.append(o); }
  campo('Hora de inicio (España)', hora, 'La recogida de datos termina hacia las 06:15.');
  const dias = el('div', 'ag-dias');
  AG_DIAS.forEach((d, i) => { const l = el('label'); const x = el('input'); x.type = 'checkbox'; x.value = i + 1; x.checked = c.dias.includes(i + 1); x.id = 'ag-dia-' + (i + 1); l.append(x, d); dias.append(l); });
  const ld = el('div', 'ag-campo'); ld.append(el('span', null, 'Días'), dias); f.append(ld);
  const pres = el('input'); pres.type = 'number'; pres.min = '0'; pres.max = '5'; pres.step = '0.05'; pres.value = c.presupuesto_dia; pres.id = 'ag-pres';
  campo('Presupuesto de IA por jornada ($)', pres, '0,20 $ al día laborable ≈ 4,50 $ al mes.');
  const maxia = el('input'); maxia.type = 'number'; maxia.min = '0'; maxia.max = '20'; maxia.value = c.max_ia; maxia.id = 'ag-maxia';
  campo('Oportunidades investigadas con IA por jornada', maxia, 'Se activa en la fase 2.');
  const umbral = el('input'); umbral.type = 'number'; umbral.min = '0'; umbral.max = '100'; umbral.value = c.umbral; umbral.id = 'ag-umbral';
  campo('Puntuación mínima para «validada»', umbral);
  const guardar = el('button', 'btn sec', 'Guardar configuración'); guardar.type = 'submit';
  f.append(guardar);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = [...dias.querySelectorAll('input:checked')].map((x) => +x.value);
    const { error: er } = await RADAR_NUBE.from('config_jornada').update({ hora: +hora.value, dias: d, presupuesto_dia: Math.min(5, Math.max(0, +pres.value || 0)),
      max_ia: Math.min(20, Math.max(0, +maxia.value || 0)), umbral: Math.min(100, Math.max(0, +umbral.value || 0)), actualizado: new Date().toISOString() }).eq('user_id', uid);
    msg.textContent = er ? 'No se ha podido guardar: ' + er.message : '✓ Configuración guardada';
    if (!er) agPintar(cuerpo, equipo, hist);
  });
  const det = el('details', 'ag-det'); det.append(el('summary', null, 'Configurar la jornada'), f);
  cuerpo.replaceChildren(estado, acc, msg, det);

  // ---------- Equipo ----------
  const lista = el('ul', 'ag-equipo');
  AG_EQUIPO.forEach(([k, n, d, activo]) => {
    const li = el('li', activo ? 'activo' : 'pronto');
    const off = (c.agentes_off || []).includes(k);
    li.append(el('span', 'ag-luz ' + (activo && !off ? 'on' : 'off')));
    const t = el('div'); t.append(el('b', null, n), el('small', null, d)); li.append(t);
    if (!activo) li.append(el('span', 'bj-estado', 'Fase 2'));
    else if (k !== 'director') {
      li.append(boton(off ? 'Activar' : 'Desactivar', 'enlace', async () => {
        const nuevo = off ? c.agentes_off.filter((x) => x !== k) : [...(c.agentes_off || []), k];
        await RADAR_NUBE.from('config_jornada').update({ agentes_off: nuevo }).eq('user_id', uid);
        agPintar(cuerpo, equipo, hist);
      }));
    } else li.append(el('span', 'bj-estado', 'Siempre'));
    lista.append(li);
  });
  equipo.querySelector('.ag-equipo')?.remove();
  equipo.append(lista);

  // ---------- Historial ----------
  if (!js?.length) { hist.replaceChildren(el('p', 'nota', 'Sin jornadas todavía. Pulsa «Lanzar jornada ahora» para probar.')); return; }
  const t = el('table');
  const cab = el('tr'); ['Inicio', 'Tipo', 'Estado', 'Duración', 'Señales nuevas', 'Coste', ''].forEach((x) => cab.append(el('th', null, x))); t.append(cab);
  js.forEach((j) => {
    const tr = el('tr');
    const dur = j.fin ? Math.max(1, Math.round((Date.parse(j.fin) - Date.parse(j.inicio)) / 1000)) + ' s' : '—';
    const ver = boton('Ver', 'enlace', () => agDetalle(j));
    tr.append(el('td', null, fechaHora(j.inicio)), el('td', null, j.origen === 'manual' ? 'Manual' : 'Programada'), el('td', null, AG_ESTADO[j.estado] || j.estado),
      el('td', 'num', dur), el('td', 'num', String(j.resumen?.senales_nuevas ?? '—')), el('td', 'num', Number(j.coste || 0).toFixed(2) + ' $'));
    const td = el('td'); td.append(ver); tr.append(td);
    t.append(tr);
  });
  hist.replaceChildren(t);
}

async function agDetalle(j) {
  const [{ data: ts }, { data: ev }] = await Promise.all([
    RADAR_NUBE.from('tareas').select('id,agente,estado,intentos,error,salida,empezada,terminada').eq('jornada_id', j.id).order('creado'),
    RADAR_NUBE.from('eventos').select('agente,tipo,texto,creado').eq('jornada_id', j.id).order('creado'),
  ]);
  const d = el('dialog', 'bj-mini ag-detalle');
  d.append(boton('Cerrar', 'enlace bj-cerrar', () => d.close()), el('h3', null, `Jornada del ${fecha(j.fecha)}`), el('p', 'nota', `${j.origen === 'manual' ? 'Manual' : 'Programada'} · ${AG_ESTADO[j.estado] || j.estado}`));
  const ul = el('ul', 'ag-tareas');
  (ts || []).forEach((t) => {
    const li = el('li');
    li.append(el('b', null, `${t.agente}: ${t.estado}`), el('small', null, `${t.intentos} intento${t.intentos === 1 ? '' : 's'}${t.error ? ' · ' + t.error : ''}`));
    if (t.estado === 'fallida') li.append(boton('Reintentar', 'btn sec mini', async () => {
      try { await agLlamar({ accion: 'reintentar', tarea_id: t.id }); d.close(); pintar(); } catch (e) { alert(e.message); }
    }));
    ul.append(li);
  });
  const h = el('ol', 'bj-hist');
  (ev || []).forEach((e) => { const li = el('li'); li.append(el('small', null, fechaHora(e.creado) + ' · ' + (e.agente || '')), ' ', e.texto); h.append(li); });
  d.append(el('h4', null, 'Tareas'), ul, el('h4', null, 'Registro'), h);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}
