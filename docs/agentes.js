'use strict';
/* RADAR · equipo de agentes (fase 3). Pestaña «Agentes» de Mi perfil, solo administración:
   configuración de la jornada diaria, pausa de emergencia, ejecución manual, equipo e historial.
   Los agentes trabajan en el servidor (función «radar-jornada») aunque el navegador esté cerrado. */

const AG_EQUIPO = [
  ['director', 'Director', 'Planifica la jornada, reparte tareas, vigila límites y escribe el informe.', true],
  ['detector', 'Detector', 'Revisa las fuentes de cada mañana y guarda las señales nuevas, sin repetir las que ya conoce.', true],
  ['analista', 'Analista', 'Puntúa las empresas con los criterios de RADAR y elige las que merece la pena investigar hoy, sin repetir. Sin IA.', true],
  ['investigador', 'Investigador', 'Investiga en la web las empresas elegidas: señales con fuente, actividad y canal de contacto publicado. Usa IA dentro de tu presupuesto.', true],
  ['conector', 'Conector', 'Busca el contacto profesional adecuado, siempre con su fuente.', false],
  ['estratega', 'Estratega', 'Propone el enfoque: qué ofrecer, por qué ahora y el siguiente paso.', false],
  ['comercial', 'Comercial', 'Redacta cada presentación con tus hechos reales; un segundo repaso con IA la bloquea si duda. Después la reparte el cartero.', true],
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
  const cont = tarjeta('Jornada diaria', 'Cada mañana el equipo trabaja solo en el servidor, aunque tengas el navegador cerrado.');
  const cuerpo = el('div', 'ag'); cuerpo.append(el('p', 'nota', 'Cargando…'));
  cont.append(cuerpo);
  const envio = tarjeta('Envío automático', 'Tus agentes se presentan por ti a empresas con buen encaje y un correo publicado en su web, con tu CV. Te llega un resumen cada mañana y las respuestas, directamente a tu correo.');
  const envCuerpo = el('div', 'ag'); envio.append(envCuerpo);
  agEnvios(envCuerpo);
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
    lanzar.disabled = true; msg.textContent = 'El equipo está trabajando… Cada investigación con IA tarda alrededor de un minuto.';
    try {
      let r = await agLlamar({ accion: 'lanzar' });
      for (let i = 0; i < 5 && r.jornada?.estado === 'en_curso'; i++) r = await agLlamar({ accion: 'paso' });
      const s = r.jornada?.resumen || {};
      msg.textContent = `${AG_ESTADO[r.jornada?.estado] || 'Hecho'}: ${s.senales_nuevas ?? 0} señales nuevas, ${s.senales_conocidas ?? 0} ya conocidas`
        + (s.investigadas ? `; ${s.investigadas} empresa${s.investigadas === 1 ? '' : 's'} investigada${s.investigadas === 1 ? '' : 's'} (${(s.propuestas || []).join(', ')}): las tienes en Oportunidades.` : '.');
      if (typeof BJ_AGENTES_LEIDO !== 'undefined') BJ_AGENTES_LEIDO = false;
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
  campo('Empresas investigadas con IA por día', maxia, 'Cada investigación cuesta unos 0,05-0,10 $. Si se acaba el presupuesto del día, espera al siguiente.');
  const umbral = el('input'); umbral.type = 'number'; umbral.min = '0'; umbral.max = '100'; umbral.value = c.umbral; umbral.id = 'ag-umbral';
  campo('Puntuación mínima para investigar una empresa', umbral, 'De 0 a 100, con los mismos criterios que ves en RADAR.');
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
    if (!activo) li.append(el('span', 'bj-estado', 'Próximamente'));
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
  const cab = el('tr'); ['Inicio', 'Tipo', 'Estado', 'Duración', 'Señales nuevas', 'Investigadas', 'Coste', ''].forEach((x) => cab.append(el('th', null, x))); t.append(cab);
  js.forEach((j) => {
    const tr = el('tr');
    const dur = j.fin ? Math.max(1, Math.round((Date.parse(j.fin) - Date.parse(j.inicio)) / 1000)) + ' s' : '—';
    const ver = boton('Ver', 'enlace', () => agDetalle(j));
    tr.append(el('td', null, fechaHora(j.inicio)), el('td', null, j.origen === 'manual' ? 'Manual' : 'Programada'), el('td', null, AG_ESTADO[j.estado] || j.estado),
      el('td', 'num', dur), el('td', 'num', String(j.resumen?.senales_nuevas ?? '—')), el('td', 'num', String(j.resumen?.investigadas ?? '—')), el('td', 'num', Number(j.coste || 0).toFixed(3) + ' $'));
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

/* ---------- Envío automático (fase 3) ---------- */
const AG_ENVIO_ESTADO = { listo: 'Listo para enviar', enviado: 'Enviado', bloqueado: 'Bloqueado por el repaso', fallido: 'Falló', cancelado: 'Cancelado', respondido: '★ Respondido' };

/* Copia en el servidor tus hechos del CV y tu firma, para que el Comercial pueda escribir sin ti. */
async function agSincronizarPerfil(c) {
  if (typeof iaHechosPerfil !== 'function' || typeof CV === 'undefined') return c;
  const hechos = iaHechosPerfil(null);
  const firma = { ...(c.firma || {}), nombre: CV.nombre, email: CV.email, linkedin: CV.linkedin ? 'https://www.' + CV.linkedin.replace(/^https?:\/\/(www\.)?/, '') : '' };
  if (JSON.stringify(hechos) === JSON.stringify(c.perfil_hechos) && JSON.stringify(firma) === JSON.stringify(c.firma)) return c;
  const { data } = await RADAR_NUBE.from('config_jornada').update({ perfil_hechos: hechos, firma }).eq('user_id', c.user_id).select('*').single();
  return data || c;
}
document.addEventListener('radar-nube-lista', async () => {
  if (!NUBE_ADMIN) return;
  const { data: c } = await RADAR_NUBE.from('config_jornada').select('*').eq('user_id', NUBE_SESION.user.id).maybeSingle();
  if (c && 'perfil_hechos' in c) agSincronizarPerfil(c);
});

async function agEnvios(cuerpo) {
  const uid = NUBE_SESION.user.id;
  let { data: c, error } = await RADAR_NUBE.from('config_jornada').select('*').eq('user_id', uid).maybeSingle();
  if (error || !c || !('envio_modo' in c)) { cuerpo.replaceChildren(el('p', 'bj-aviso', 'Falta activar el envío automático: ejecuta supabase/006_envios.sql en Supabase.')); return; }
  c = await agSincronizarPerfil(c);
  const hoy = hoyISO();
  const modo = c.pausada || c.envio_modo === 'apagado' ? 'apagado' : c.envio_modo === 'real' || (c.ensayo_hasta && hoy > c.ensayo_hasta) ? 'real' : 'ensayo';
  const msg = el('p', 'nube-msg'); msg.setAttribute('role', 'status');
  const guardar = async (cambios, texto) => {
    const { error: er } = await RADAR_NUBE.from('config_jornada').update(cambios).eq('user_id', uid);
    msg.textContent = er ? 'No se ha podido guardar: ' + er.message : texto;
    if (!er) agEnvios(cuerpo);
  };

  const est = el('div', 'ag-estado');
  const txt = el('div');
  txt.append(el('b', null, { apagado: c.pausada ? 'Apagado (RADAR está en pausa)' : 'Apagado', ensayo: `Ensayo hasta el ${fecha(c.ensayo_hasta)}: los correos te llegan solo a ti`, real: 'Envío real a empresas' }[modo]),
    el('small', null, `Hasta ${c.max_envios} al día · solo encaje de ${c.umbral_envio} o más · solo correos publicados por la empresa · una presentación por empresa · seguimiento único a los 10 días`));
  est.append(el('span', 'ag-luz ' + (modo === 'real' ? 'on' : modo === 'ensayo' ? 'ensayo' : 'off')), txt);
  const acc = el('div', 'acciones');
  if (modo !== 'apagado') acc.append(boton('Apagar el envío', 'btn sec', () => guardar({ envio_modo: 'apagado' }, '✓ Envío automático apagado')));
  else if (!c.pausada) acc.append(boton('Encender (con 3 días de ensayo)', 'btn', () => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    guardar({ envio_modo: 'ensayo', ensayo_hasta: d.toISOString().slice(0, 10) }, '✓ Encendido en ensayo');
  }));
  if (modo === 'ensayo') acc.append(boton('Terminar el ensayo y enviar de verdad', 'btn sec', () => {
    if (confirm('A partir de ahora las presentaciones se enviarán a las empresas con tu nombre y tu CV. ¿Seguro?')) guardar({ envio_modo: 'real' }, '✓ Envío real activado');
  }));

  // Teléfono y CV (privados: solo los usa el cartero)
  const f = el('form', 'ag-form');
  const tl = el('label', 'ag-campo'); const tel = el('input'); tel.type = 'tel'; tel.id = 'ag-tel'; tel.value = c.firma?.telefono || ''; tel.placeholder = '+34 6XX XXX XXX';
  tl.append(el('span', null, 'Teléfono para que te llamen'), tel, el('small', null, 'Va en la firma de cada presentación. Nunca se publica en la web.'));
  const cl = el('label', 'ag-campo'); const cvIn = el('input'); cvIn.type = 'file'; cvIn.accept = 'application/pdf'; cvIn.id = 'ag-cv';
  cl.append(el('span', null, 'CV que se adjunta (PDF)'), cvIn, el('small', null, c.cv_ruta ? `Actual: ${c.cv_ruta.split('/').pop()}. Puede llevar tu teléfono: se guarda en privado.` : 'Sin CV todavía: sin él no se envía nada de verdad. Puede llevar tu teléfono: se guarda en privado.'));
  const ok = el('button', 'btn sec', 'Guardar teléfono y CV'); ok.type = 'submit';
  f.append(tl, cl, ok);
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cambios = { firma: { ...(c.firma || {}), telefono: tel.value.trim() } };
    const arch = cvIn.files[0];
    if (arch) {
      if (arch.type !== 'application/pdf' || arch.size > 5e6) { msg.textContent = 'El CV debe ser un PDF de menos de 5 MB.'; return; }
      const ruta = `${NUBE_SESION.user.email.toLowerCase()}/envio/${Date.now()}.pdf`;
      const up = await RADAR_NUBE.storage.from('cv').upload(ruta, arch, { contentType: 'application/pdf' });
      if (up.error) { msg.textContent = 'No se ha podido subir el CV: ' + up.error.message; return; }
      cambios.cv_ruta = ruta;
    }
    guardar(cambios, '✓ Guardado');
  });

  // Historial de envíos
  const { data: envs } = await RADAR_NUBE.from('envios').select('id,creado,enviado,empresa,para,modo,tipo,estado,asunto,cuerpo,fuente_correo,revision').order('creado', { ascending: false }).limit(30);
  const lista = el('div', 'ag-envios');
  if (!envs?.length) lista.append(el('p', 'nota', 'Todavía no hay presentaciones. Se preparan en la jornada de cada mañana y el cartero las reparte hacia las 9:00.'));
  (envs || []).forEach((e) => {
    const det = el('details', 'ag-envio');
    const sum = el('summary');
    sum.append(el('b', null, e.empresa), ` · ${e.tipo === 'seguimiento' ? 'seguimiento' : e.modo === 'ensayo' ? 'ensayo' : 'real'} · ${AG_ENVIO_ESTADO[e.estado] || e.estado} · ${fechaHora(e.enviado || e.creado)}`);
    det.append(sum, el('p', 'nota', `Para: ${e.para}${e.fuente_correo?.startsWith('http') ? ' · publicado en ' + e.fuente_correo : ''}`), el('p', 'ag-asunto', 'Asunto: ' + e.asunto), el('pre', 'ag-texto', e.cuerpo));
    if (e.revision?.problemas?.length) det.append(el('p', 'bj-aviso', 'El repaso lo bloqueó: ' + e.revision.problemas.join('; ')));
    if (e.estado === 'listo') det.append(boton('No enviar este', 'btn sec mini', async () => {
      const { error: er } = await RADAR_NUBE.from('envios').update({ estado: 'cancelado' }).eq('id', e.id);
      if (er) alert(er.message); else agEnvios(cuerpo);
    }));
    lista.append(det);
  });
  cuerpo.replaceChildren(est, acc, msg, f, el('h4', null, 'Presentaciones'), lista);
}
