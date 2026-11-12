'use strict';
/* RADAR 2.0 · paso 2: IA (Claude) a través del servidor de RADAR (función «radar-ia» en
   Supabase). La web nunca ve la clave: solo llama a la función con tu sesión.
   - Mi perfil → Mi CV: «Leer mi CV con IA» → perfil con cada dato enlazado a su cita del CV.
   - Oportunidades → ficha: «Investigar con IA» (web oficial, señales con fuente, contacto
     solo si aparece publicado) y «Redactar con IA» (mensaje basado solo en hechos).
   Todo lo que propone la IA llega marcado y necesita que lo confirmes. */

const iaActiva = () => typeof RADAR_NUBE !== 'undefined' && RADAR_NUBE && NUBE_SESION && NUBE_ADMIN;
const iaMotivo = () => (typeof RADAR_NUBE === 'undefined' || !RADAR_NUBE ? 'La IA necesita el servidor de RADAR.'
  : !NUBE_SESION ? 'Entra con tu correo para usar la IA.' : 'La IA solo está activada para la cuenta de administración.');

async function iaLlamar(cuerpo) {
  const { data, error } = await RADAR_NUBE.functions.invoke('radar-ia', { body: cuerpo });
  if (error) {
    let msg = 'No se ha podido conectar con la IA.';
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (e) { /* respuesta sin JSON */ }
    if (/not found|404/i.test(String(error.message)) && msg.startsWith('No se ha')) msg = 'La función de IA aún no está instalada en Supabase.';
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function iaBotonOcupado(b, texto) {
  const original = b.textContent;
  b.disabled = true; b.textContent = texto;
  return () => { b.disabled = false; b.textContent = original; };
}

/* ---------- Hechos del perfil para la IA ---------- */
function iaHechosPerfil(op) {
  const hechos = [];
  const add = (t) => { const s = bjSinHtml(t).trim(); if (s && !hechos.some((h) => h.texto === s)) hechos.push({ id: 'h' + (hechos.length + 1), texto: s }); };
  const pv = ST.perfilCV?.datos;
  if (pv) {
    (pv.experiencia || []).forEach((x) => (x.funciones || []).filter((f) => f.verificado !== false).forEach((f) => add(`${f.texto} (${x.puesto}, ${x.empresa}, ${x.fechas})`)));
    (pv.logros || []).filter((f) => f.verificado !== false).forEach((f) => add('Logro: ' + f.texto));
    (pv.certificaciones || []).forEach((f) => add('Certificación: ' + f.nombre));
    (pv.formacion || []).forEach((f) => add(`Formación: ${f.titulo}${f.centro ? ' (' + f.centro + ')' : ''}`));
    (pv.idiomas || []).forEach((f) => add(`Idioma: ${f.idioma} ${f.nivel}`));
  } else {
    // Perfil de RADAR: primero las viñetas del enfoque que encaja con la empresa
    const tema = op?.encaje?.tema;
    const vin = [];
    CV.experiencia.forEach((x) => (x.vinetas || []).forEach((v) => {
      const t = typeof v === 'string' ? v : v.t; const temas = typeof v === 'string' ? [] : v.temas || [];
      vin.push({ t: `${t} (${x.puesto}, ${x.empresa}, ${x.fechas})`, p: tema && temas.includes(tema) ? 0 : 1 });
    }));
    vin.sort((a, b) => a.p - b.p).forEach((v) => add(v.t));
    CV.formacion.forEach((f) => add(`Formación: ${f.t} (${bjSinHtml(f.d)})`));
    if (CV.idiomas) add('Idiomas: ' + CV.idiomas);
  }
  return hechos.slice(0, 30);
}

/* ---------- Oportunidades: investigar ---------- */
function iaBloqueInvestigacion(op, bloque) {
  const inv = op.investigacion;
  if (inv) {
    const dl = el('dl', 'bj-dl');
    const fila = (t, v) => { if (!v) return; dl.append(el('dt', null, t)); const dd = el('dd'); dd.append(v); dl.append(dd); };
    if (inv.web_oficial) fila('Web oficial', enlace(inv.web_oficial, inv.web_oficial.replace(/^https?:\/\//, '') + ' ↗', 'enlace'));
    fila('Actividad', inv.actividad);
    fila('Consultada', fecha(inv.consultada));
    bloque.append(dl);
    const c = inv.contacto || {};
    if (c.email || c.formulario || c.pagina || c.persona) {
      const box = el('div', 'ia-propuesta');
      box.append(el('b', null, 'Contacto encontrado (propuesta de la IA)'));
      const ul = el('ul');
      if (c.persona) ul.append(el('li', null, 'Persona: ' + c.persona));
      if (c.email) ul.append(el('li', null, 'Correo: ' + c.email));
      if (c.formulario) { const li = el('li'); li.append('Formulario: ', enlace(c.formulario, 'abrir ↗', 'enlace')); ul.append(li); }
      if (c.pagina) { const li = el('li'); li.append('Página de contacto: ', enlace(c.pagina, 'abrir ↗', 'enlace')); ul.append(li); }
      if (c.fuente_url) { const li = el('li'); li.append('Fuente: ', enlace(c.fuente_url, c.fuente_url.replace(/^https?:\/\//, '').slice(0, 60) + ' ↗', 'enlace')); ul.append(li); }
      box.append(ul, el('p', 'nota', 'Ábrelo y comprueba que es de esta empresa antes de usarlo.'));
      const yaUsado = op.contacto && op.contacto.email === c.email && op.contacto.formulario === (c.formulario || c.pagina || '');
      if (!yaUsado) box.append(boton('He comprobado la fuente: usar este contacto', 'btn sec mini', () => {
        const [nombre, ...cargo] = String(c.persona || '').split(/,| - | · /);
        op.contacto = { nombre: (nombre || '').trim(), cargo: cargo.join(', ').trim(), email: c.email || '', web: inv.web_oficial || '', formulario: c.formulario || c.pagina || '',
          fuente: `${c.fuente_url || c.pagina || inv.web_oficial} (encontrado con IA y comprobado por ti)`, comprobado: hoyISO() };
        op.encaje.dudas = op.encaje.dudas.filter((x) => !/correo verificado/.test(x));
        bjEvento(op, 'contacto', `Contacto confirmado desde la investigación: ${op.contacto.email || op.contacto.formulario}`);
        bjGuardar(); bjPintarFicha(op, false); pintar();
      }));
      bloque.append(box);
    } else bloque.append(el('p', 'bj-pendiente', 'La IA no ha encontrado un contacto publicado. No se ha inventado ninguno.'));
    if (inv.dudas?.length) { const u = el('ul', 'ia-dudas'); inv.dudas.forEach((d) => u.append(el('li', null, d))); bloque.append(el('p', 'nota', 'Lo que no se ha podido confirmar:'), u); }
  }
  if (!iaActiva()) { bloque.append(el('p', 'nota', iaMotivo())); return; }
  const b = boton(inv ? 'Volver a investigar con IA' : 'Investigar con IA', inv ? 'btn sec mini' : 'btn mini', () => iaInvestigar(op));
  if (IA_EN_CURSO.has(op.k)) { b.disabled = true; b.textContent = 'Investigando en la web… (hasta 1 minuto)'; }
  bloque.append(b);
}

/* Investiga la empresa en la web y guarda señales con fuente y la propuesta de contacto. */
const IA_EN_CURSO = new Set();
async function iaInvestigar(op) {
  if (IA_EN_CURSO.has(op.k)) return;
  IA_EN_CURSO.add(op.k);
  if ($('#bj-ficha')?.open) bjPintarFicha(op, false);
  try {
    {
      const r = await iaLlamar({ accion: 'investigar', empresa: op.empresa, ciudad: op.ciudad, web: op.contacto?.web || '', senales: op.senales.filter((s) => !s.inferida).map((s) => `${s.titulo} (${s.fuente?.nombre || ''}, ${s.fecha || ''})`) });
      const inv2 = r.investigacion;
      op.investigacion = inv2;
      let nuevas = 0;
      (inv2.senales || []).forEach((s) => {
        if (op.senales.some((x) => x.fuente?.url === s.url)) return;
        let host = ''; try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch (e) { host = s.fuente || 'web'; }
        op.senales.push({ tipo: 'ia', fecha: s.fecha || inv2.consultada, titulo: s.titulo, fuente: { nombre: s.fuente || host, url: s.url, consultada: inv2.consultada }, motivo: s.motivo || 'Podría generar necesidad de perfiles.', resumen: s.resumen, ia: true });
        nuevas++;
      });
      if (op.estado === 'detectada') op.estado = 'investigando';
      if (typeof bjRecalcularManual === 'function') bjRecalcularManual(op);
      bjEvento(op, 'investigacion', `Investigación con IA: ${nuevas} señal${nuevas === 1 ? '' : 'es'} nueva${nuevas === 1 ? '' : 's'} con fuente; contacto ${inv2.contacto?.email || inv2.contacto?.formulario || inv2.contacto?.pagina ? 'propuesto' : 'no encontrado'}`);
    }
  } catch (e) { alert(e.message); }
  IA_EN_CURSO.delete(op.k);
  bjGuardar(); if ($('#bj-ficha')?.open) bjPintarFicha(op, false); pintar();
}

/* ---------- Oportunidades: redactar ---------- */
function iaBotonRedactar(op, contenedor) {
  if (!iaActiva()) { contenedor.append(el('p', 'nota', 'Redactar con IA: ' + iaMotivo().toLowerCase())); return; }
  const b = boton('Redactar con IA', 'btn sec', async () => {
    const senales = op.senales.filter((s) => !s.inferida && !s.aviso).slice(0, 5).map((s, i) => ({ id: 's' + (i + 1), texto: `${s.titulo} (${s.fuente?.nombre || 'fuente'}, ${s.fecha ? fecha(s.fecha) : 'sin fecha'})` }));
    if (!senales.length) { alert('Esta oportunidad no tiene ninguna señal verificada. Investígala primero.'); return; }
    const hechos = iaHechosPerfil(op);
    const fin = iaBotonOcupado(b, 'Redactando…');
    try {
      const r = await iaLlamar({ accion: 'presentacion', empresa: op.empresa, destinatario: op.contacto?.nombre || '', senales, hechos,
        firma: { nombre: CV.nombre, email: PERFIL.email, linkedin: PERFIL.linkedin }, carencias: op.encaje.carencias });
      const m = r.mensaje;
      const tema = op.encaje.tema && CV.temas[op.encaje.tema] ? CV.temas[op.encaje.tema] : Object.values(CV.temas)[0];
      op.mensajes = op.mensajes || [];
      op.mensajes.push({ v: op.mensajes.length + 1, asunto: m.asunto, cuerpo: m.cuerpo, destinatario: op.contacto?.email || '', adjunto: 'CV adaptado (' + tema.nombre + ')',
        creado: new Date().toISOString(), estado: 'borrador', ia: true,
        base: [...hechos.filter((h) => m.hechos_usados.includes(h.id)).map((h) => 'Tu perfil: ' + h.texto), ...senales.filter((s) => s.id === m.senal_usada).map((s) => 'Señal: ' + s.texto)] });
      if (['detectada', 'investigando', 'validada'].includes(op.estado)) op.estado = 'borrador';
      op.siguiente = { accion: BJ_SIGUIENTE.borrador, fecha: hoyISO() };
      bjEvento(op, 'mensaje', `Presentación redactada con IA (versión ${op.mensajes.length})`);
      bjGuardar(); bjPintarFicha(op, false); pintar();
    } catch (e) { fin(); alert(e.message); }
  });
  contenedor.append(b);
}

/* ---------- Mi perfil → Mi CV: leer el CV con IA ---------- */
let IA_PDFJS = null;
function iaCargarPdfjs() {
  if (IA_PDFJS) return IA_PDFJS;
  IA_PDFJS = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { IA_PDFJS = null; mal(new Error('No se ha podido cargar el lector de PDF.')); };
    document.head.append(s);
  });
  return IA_PDFJS;
}
async function iaTextoDeArchivo(f) {
  if (/\.txt$/i.test(f.name) || f.type === 'text/plain') return f.text();
  if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') throw new Error('Sube el CV en PDF (o en texto).');
  const pdfjs = await iaCargarPdfjs();
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    let linea = ''; const lineas = []; let y = null;
    c.items.forEach((it) => { const yy = Math.round(it.transform[5]); if (y !== null && Math.abs(yy - y) > 2) { lineas.push(linea); linea = ''; } linea += it.str + (it.hasEOL ? '' : ''); y = yy; });
    lineas.push(linea);
    paginas.push(lineas.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'));
  }
  return paginas.join('\n\n');
}

function iaTarjetaCV(tarjeta) {
  const pv = ST.perfilCV;
  const t = tarjeta('Leer mi CV con IA', pv
    ? `Perfil verificado a partir de «${pv.archivo}» (${fecha(pv.fecha)}): ${iaContarHechos(pv.datos)} datos, cada uno con su cita del CV. Se usa para redactar presentaciones.`
    : 'Sube tu CV en PDF: la IA extrae experiencia, formación, idiomas, certificaciones, logros y sectores, y cada dato queda enlazado a la frase exacta de tu CV. Nada se inventa y puedes corregir todo antes de guardarlo.');
  const acc = el('div', 'acciones');
  if (!iaActiva()) { t.append(el('p', 'nota', iaMotivo())); return; }
  const lab = el('label', 'btn' + (pv ? ' sec' : ''));
  lab.append(pv ? 'Leer otra versión del CV' : 'Subir mi CV (PDF)');
  const inp = el('input'); inp.type = 'file'; inp.accept = '.pdf,application/pdf,.txt,text/plain'; inp.hidden = true; inp.id = 'ia-cv';
  lab.append(inp);
  const msg = el('p', 'nube-msg'); msg.setAttribute('role', 'status');
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      msg.textContent = 'Leyendo el PDF…';
      const texto = await iaTextoDeArchivo(f);
      msg.textContent = 'La IA está extrayendo tu perfil (unos 30 segundos)…';
      const r = await iaLlamar({ accion: 'perfil_cv', texto });
      msg.textContent = '';
      iaRevisarPerfil(r.perfil, f.name);
    } catch (e) { msg.textContent = e.message; }
    inp.value = '';
  });
  acc.append(lab);
  if (pv) acc.append(boton('Ver el perfil verificado', 'btn sec', () => iaRevisarPerfil(pv.datos, pv.archivo, true)));
  t.append(acc, msg);
}
const iaContarHechos = (p) => ['experiencia', 'formacion', 'idiomas', 'certificaciones', 'competencias', 'logros', 'sectores'].reduce((n, k) => n + (p?.[k] || []).length + (k === 'experiencia' ? (p?.[k] || []).reduce((m, x) => m + (x.funciones || []).length, 0) : 0), 0);

/* Revisión antes de guardar: cada dato con su cita y si se ha encontrado literalmente en el CV. */
function iaRevisarPerfil(p, archivo, soloVer) {
  const d = el('dialog', 'bj-ficha ia-rev');
  const w = el('div', 'bj-f');
  w.append(boton('Cerrar', 'enlace bj-cerrar', () => d.close()));
  w.append(el('h2', null, soloVer ? 'Tu perfil verificado' : 'Revisa lo que ha leído la IA'),
    el('p', 'nota', '✓ = la cita está literalmente en tu CV. ⚠ = no se ha encontrado tal cual: revísalo. Desmarca lo que no quieras guardar.'));
  const marcas = [];
  const item = (padre, texto, o) => {
    const l = el('label', 'ia-item' + (o.verificado === false ? ' dudoso' : ''));
    const c = el('input'); c.type = 'checkbox'; c.checked = o.verificado !== false; c.disabled = Boolean(soloVer);
    marcas.push([c, o]);
    const t = el('span'); t.append(el('b', null, (o.verificado === false ? '⚠ ' : '✓ ') + texto));
    if (o.cita) t.append(el('small', null, `«${o.cita}»`));
    l.append(c, t); padre.append(l);
  };
  const seccion = (titulo, lista, fn) => { if (!lista?.length) return; const s = el('section', 'bj-bloque'); s.append(el('h3', null, titulo)); lista.forEach((o) => fn(s, o)); w.append(s); };
  if (p.titular || p.ubicacion) w.append(el('p', null, [p.nombre, p.titular, p.ubicacion].filter(Boolean).join(' · ')));
  seccion('Experiencia', p.experiencia, (s, x) => {
    item(s, `${x.puesto} · ${x.empresa} · ${x.fechas}`, x);
    const sub = el('div', 'ia-sub'); (x.funciones || []).forEach((f) => item(sub, f.texto, f)); s.append(sub);
  });
  seccion('Formación', p.formacion, (s, x) => item(s, `${x.titulo}${x.centro ? ' · ' + x.centro : ''}${x.fechas ? ' · ' + x.fechas : ''}`, x));
  seccion('Idiomas', p.idiomas, (s, x) => item(s, `${x.idioma} · ${x.nivel}`, x));
  seccion('Certificaciones', p.certificaciones, (s, x) => item(s, x.nombre, x));
  seccion('Logros', p.logros, (s, x) => item(s, x.texto, x));
  seccion('Competencias', p.competencias, (s, x) => item(s, x.nombre, x));
  seccion('Sectores', p.sectores, (s, x) => item(s, x.nombre, x));
  seccion('Preferencias que menciona tu CV', p.preferencias, (s, x) => item(s, x.texto, x));
  if (p.inferencias?.length) {
    const s = el('section', 'bj-bloque');
    s.append(el('h3', null, 'Lo que la IA deduce (no está escrito en tu CV)'), el('p', 'nota', 'Son hipótesis: no se usan como hechos en los mensajes.'));
    const u = el('ul'); p.inferencias.forEach((x) => u.append(el('li', null, `${x.texto} — ${x.base}`))); s.append(u); w.append(s);
  }
  if (!soloVer) {
    const acc = el('div', 'acciones');
    acc.append(boton('Guardar perfil verificado', 'btn', () => {
      marcas.forEach(([c, o]) => { if (!c.checked) o._quitar = true; });
      const limpio = JSON.parse(JSON.stringify(p, (k, v) => (Array.isArray(v) ? v.filter((x) => !x?._quitar) : v)));
      ST.perfilCV = { fecha: new Date().toISOString(), archivo, datos: limpio };
      guardarST(); d.close(); pintar();
    }), boton('Descartar', 'btn sec', () => d.close()));
    w.append(acc);
  }
  d.append(w);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}
