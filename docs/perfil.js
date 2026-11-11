'use strict';
/* «Mi perfil y ajustes»: cabecera con tu perfil y su progreso, y el contenido en
   pestañas (Qué busco, Roles, Cómo puntúa RADAR, Mi CV, Mis datos). Mismos datos
   y mismo almacenamiento que antes (radar-perfil y radar-pesos en el navegador). */

let PF_TAB = (() => { try { return localStorage.getItem('radar-perfil-tab') || 'busco'; } catch (e) { return 'busco'; } })();
const PF_TABS_BASE = [['busco', 'Qué busco'], ['roles', 'Roles'], ['puntua', 'Cómo puntúa RADAR'], ['cv', 'Mi CV'], ['aprende', 'Aprendizaje'], ['datos', 'Mis datos']];
const pfTabs = () => (typeof NUBE_ADMIN !== 'undefined' && NUBE_ADMIN ? [...PF_TABS_BASE, ['piloto', 'Piloto']] : PF_TABS_BASE);
const PF_ICO = {
  remoto: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
  hibrido: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10"/></svg>',
  presencial: '<svg viewBox="0 0 24 24"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
};
const pfIco = (k, cls) => { const s = el('span', 'pf-ico' + (cls ? ' ' + cls : '')); s.innerHTML = PF_ICO[k]; return s; };

function pfCampos() {
  return [
    ['Experiencia', CV.experiencia.length > 0, 'cv'], ['Formación', CV.formacion.length > 0, 'cv'], ['Idiomas', Boolean(CV.idiomas), 'cv'],
    ['Zonas que aceptas', PREF.zonas.length > 0, 'busco', 'pf-zonas'], ['Modalidad preferida', PREF.modalidades.length > 0, 'busco', 'pf-modalidad'],
    ['Salario mínimo', Boolean(PREF.salarioMin), 'busco', 'pf-salario'], ['Disponibilidad', Boolean(PREF.disponibilidad), 'busco', 'pf-disp'],
    ['Permiso de trabajo en la UE', Boolean(PREF.permiso), 'busco', 'pf-permiso'], ['Roles revisados', ROLES.every((r) => r.k in PREF.roles), 'roles'],
  ];
}

function pfGuardado() {
  let t = $('#pf-toast');
  if (!t) { t = el('div', 'pf-toast'); t.id = 'pf-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.replaceChildren(pfIco('ok'), 'Guardado · las puntuaciones ya se han actualizado');
  t.classList.add('on');
  clearTimeout(pfGuardado.t);
  pfGuardado.t = setTimeout(() => t.classList.remove('on'), 1800);
}

function pintarPerfil() {
  $('#res-n').textContent = '';
  const repintar = (sinPintar) => { guardarPref(); pfGuardado(); if (!sinPintar) pintar(); };
  const cont = el('div', 'pf');

  // ---------- Cabecera ----------
  const campos = pfCampos();
  const hechos = campos.filter((x) => x[1]).length;
  const pct = Math.round((100 * hechos) / campos.length);
  const cab = el('section', 'pf-cab');
  const av = el('div', 'pf-avatar', iniciales(CV.nombre));
  const id = el('div', 'pf-id');
  id.append(el('h2', null, CV.nombre), el('p', 'pf-titular', (CV.temas.gestion || Object.values(CV.temas)[0] || {}).titular || ''));
  const contacto = el('p', 'pf-contacto');
  contacto.append(CV.ciudad, ' · ', CV.email, ' · ');
  contacto.append(enlace('https://www.' + CV.linkedin, 'LinkedIn ↗', 'enlace'));
  id.append(contacto);
  const sellos = el('div', 'pf-sellos');
  SELLOS.forEach((x) => sellos.append(el('span', 'pf-sello', x)));
  id.append(sellos);
  const anillo = el('div', 'pf-anillo');
  anillo.style.setProperty('--p', pct);
  anillo.append(el('b', null, pct + '%'), el('small', null, 'completo'));
  const prog = el('div', 'pf-prog');
  prog.append(anillo);
  const falta = campos.filter((x) => !x[1]);
  if (falta.length) {
    const sig = falta[0];
    prog.append(el('p', null, `Te falta${falta.length === 1 ? '' : 'n'} ${falta.length} dato${falta.length === 1 ? '' : 's'}. No restan puntos: ayudan a afinar.`),
      boton('Completar: ' + sig[0].toLowerCase(), 'btn mini', () => { PF_TAB = sig[2]; pintar(); setTimeout(() => { const e = sig[3] && document.getElementById(sig[3]); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); e.classList.add('pf-resalta'); setTimeout(() => e.classList.remove('pf-resalta'), 1600); } }, 50); }));
  } else prog.append(el('p', null, 'Tu perfil está completo.'));
  cab.append(av, id, prog);
  cont.append(cab);

  // Resumen de lo que RADAR busca
  const res = el('div', 'pf-resumen');
  res.append(el('span', 'pf-res-t', 'RADAR busca para ti:'));
  const chip = (t, cls) => res.append(el('span', 'pf-chip ' + (cls || ''), t));
  [REGION, 'Remoto', ...PREF.zonas.filter((z) => z !== REGION)].forEach((z) => chip(z, 'turq'));
  PREF.modalidades.forEach((m) => chip(MODALIDAD[m], 'rosa'));
  if (PREF.salarioMin) chip('desde ' + (+PREF.salarioMin).toLocaleString('es-ES') + ' €', 'rosa');
  ROLES.filter((r) => PREF.roles[r.k] === true).forEach((r) => chip(r.nombre));
  cont.append(res);

  // ---------- Pestañas ----------
  if (!pfTabs().some(([k]) => k === PF_TAB)) PF_TAB = 'busco';
  const tabs = el('div', 'pf-tabs');
  tabs.setAttribute('role', 'tablist');
  pfTabs().forEach(([k, n]) => {
    const b = boton(n, 'pf-tab' + (k === PF_TAB ? ' on' : ''), () => { PF_TAB = k; try { localStorage.setItem('radar-perfil-tab', k); } catch (e) { /* sin almacenamiento */ } pintar(); });
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', k === PF_TAB);
    tabs.append(b);
  });
  cont.append(tabs);
  const panel = el('div', 'pf-panel');
  panel.setAttribute('role', 'tabpanel');
  cont.append(panel);
  const tarjeta = (titulo, nota, idT) => { const s = el('section', 'pf-card'); if (idT) s.id = idT; s.append(el('h3', null, titulo)); if (nota) s.append(el('p', 'nota', nota)); panel.append(s); return s; };

  if (PF_TAB === 'busco') {
    // Zonas
    const z = tarjeta('Dónde quieres trabajar', `${REGION} y el trabajo en remoto cuentan siempre. Añade las zonas a las que te moverías o irías algunos días.`, 'pf-zonas');
    const zs = el('div', 'pf-pills');
    [REGION, 'Remoto'].forEach((x) => { const b = el('span', 'pf-pill on fijo'); b.append(pfIco('ok'), x, el('small', null, 'siempre')); zs.append(b); });
    [...new Set([...ZONAS_PERFIL, ...NORTE])].filter((x) => x !== REGION).forEach((x) => {
      const on = PREF.zonas.includes(x);
      const b = boton('', 'pf-pill' + (on ? ' on' : ''), () => { PREF.zonas = on ? PREF.zonas.filter((y) => y !== x) : [...PREF.zonas, x]; repintar(); });
      if (on) b.append(pfIco('ok')); b.append(x);
      b.setAttribute('aria-pressed', on);
      zs.append(b);
    });
    z.append(zs);

    // Modalidad
    const m = tarjeta('Cómo prefieres trabajar', 'Puedes elegir varias. Las ofertas con otra modalidad bajan un poco, no desaparecen.', 'pf-modalidad');
    const ms = el('div', 'pf-tiles');
    [['remoto', 'Remoto', 'Desde casa'], ['hibrido', 'Híbrido', 'Algunos días en la oficina'], ['presencial', 'Presencial', 'En la oficina o en obra']].forEach(([k, n, d]) => {
      const on = PREF.modalidades.includes(k);
      const b = boton('', 'pf-tile' + (on ? ' on' : ''), () => { PREF.modalidades = on ? PREF.modalidades.filter((y) => y !== k) : [...PREF.modalidades, k]; repintar(); });
      b.setAttribute('aria-pressed', on);
      b.append(pfIco(k, 'grande'), el('b', null, n), el('small', null, d));
      if (on) b.append(pfIco('ok', 'marca'));
      ms.append(b);
    });
    m.append(ms);

    // Condiciones
    const c = tarjeta('Condiciones', 'Se usan en la puntuación y en la carta de motivación.');
    const rejilla = el('div', 'pf-grid2');
    const sal = el('label', 'pf-campo'); sal.id = 'pf-salario';
    sal.append(el('span', null, 'Salario bruto anual mínimo'));
    const sw = el('div', 'pf-input-suf');
    const si = el('input'); si.type = 'number'; si.min = 0; si.step = 1000; si.placeholder = '32000'; si.value = PREF.salarioMin || '';
    si.addEventListener('change', () => { PREF.salarioMin = si.value.trim(); repintar(); });
    sw.append(si, el('span', null, '€ / año'));
    sal.append(sw, el('small', null, 'Las ofertas que publiquen menos bajan en salario.'));
    rejilla.append(sal);

    const dsp = el('div', 'pf-campo'); dsp.id = 'pf-disp';
    dsp.append(el('span', null, 'Disponibilidad para incorporarte'));
    const opD = el('div', 'pf-seg');
    ['Inmediata', '15 días', '1 mes', '2 meses'].forEach((x) => {
      const b = boton(x, 'pf-seg-b' + (PREF.disponibilidad === x ? ' on' : ''), () => { PREF.disponibilidad = PREF.disponibilidad === x ? '' : x; repintar(); });
      opD.append(b);
    });
    dsp.append(opD);
    rejilla.append(dsp);

    const per = el('div', 'pf-campo'); per.id = 'pf-permiso';
    per.append(el('span', null, 'Permiso de trabajo en la UE'));
    const opP = el('div', 'pf-seg');
    [['sí', 'Sí'], ['no', 'No']].forEach(([v, t]) => opP.append(boton(t, 'pf-seg-b' + (norm(PREF.permiso) === norm(v) ? ' on' : ''), () => { PREF.permiso = v; repintar(); })));
    per.append(opP);
    rejilla.append(per);

    const ev = el('label', 'pf-campo');
    ev.append(el('span', null, 'Palabras que no quieres priorizar'));
    const ei = el('input'); ei.placeholder = 'p. ej. comercial, junior (separadas por comas)'; ei.value = PREF.evitar || '';
    ei.addEventListener('change', () => { PREF.evitar = ei.value.trim(); repintar(); });
    ev.append(ei);
    const tags = el('div', 'pf-tags');
    PREF.evitar.split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => {
      const t = boton(x + ' ✕', 'pf-tag', () => { PREF.evitar = PREF.evitar.split(',').map((y) => y.trim()).filter((y) => y && y !== x).join(', '); repintar(); });
      t.setAttribute('aria-label', 'Quitar ' + x); tags.append(t);
    });
    ev.append(tags);
    rejilla.append(ev);
    c.append(rejilla);
  }

  if (PF_TAB === 'roles') {
    const r = tarjeta('Roles a los que podrías optar', 'RADAR los deduce de lo que has hecho, no de tus títulos anteriores. Los que te interesen suben en la puntuación; los que descartes, bajan.');
    const lista = el('div', 'pf-roles');
    ROLES.forEach((x) => {
      const v = PREF.roles[x.k];
      const f = el('div', 'pf-rol' + (v === true ? ' si' : v === false ? ' no' : ''));
      const t = el('div', 'pf-rol-t');
      t.append(el('b', null, x.nombre), el('p', null, x.por));
      const seg = el('div', 'pf-seg');
      const set = (val) => { if (PREF.roles[x.k] === val) delete PREF.roles[x.k]; else PREF.roles[x.k] = val; repintar(); };
      seg.append(boton(v === true ? '✓ Me interesa' : 'Me interesa', 'pf-seg-b' + (v === true ? ' on' : ''), () => set(true)),
        boton(v === false ? '✓ No es para mí' : 'No es para mí', 'pf-seg-b' + (v === false ? ' on no' : ''), () => set(false)));
      f.append(t, seg);
      lista.append(f);
    });
    r.append(lista);
  }

  if (PF_TAB === 'puntua') {
    const p = tarjeta('Qué pesa más en tu prioridad', 'Mueve cada barra según lo que más te importe. Se reparte en proporción, y los criterios sin información no cuentan.');
    const total = Object.values(PESOS).reduce((a, b) => a + b, 0) || 1;
    const AYUDA = { encaje: 'Lo que se parece el puesto a tu experiencia', necesidad: 'Lo claro que es que necesitan a alguien', geografia: 'Zona y modalidad', calidad: 'Lo reciente y completa que es la información', salario: 'Lo que pagan', acceso: 'Requisitos que cumples' };
    Object.entries(CRITERIOS).forEach(([k, n]) => {
      const fila = el('label', 'pf-peso');
      const cab2 = el('div', 'pf-peso-cab');
      const out = el('b', null, Math.round((100 * PESOS[k]) / total) + ' %');
      cab2.append(el('span', null, n), out);
      const r = el('input'); r.type = 'range'; r.min = 0; r.max = 50; r.step = 5; r.value = PESOS[k];
      r.style.setProperty('--v', (PESOS[k] / 50) * 100 + '%');
      r.addEventListener('input', () => { r.style.setProperty('--v', (r.value / 50) * 100 + '%'); });
      r.addEventListener('change', () => { PESOS[k] = +r.value; escribir('radar-pesos', PESOS); D.ops.forEach((o) => { delete o._p; }); pfGuardado(); pintar(); });
      fila.append(cab2, r, el('small', null, AYUDA[k] || ''));
      p.append(fila);
    });
    p.append(boton('Volver a los pesos iniciales', 'enlace', () => { Object.assign(PESOS, PESOS_BASE); escribir('radar-pesos', PESOS); D.ops.forEach((o) => { delete o._p; }); pfGuardado(); pintar(); }));
  }

  if (PF_TAB === 'cv') {
    const enl = el('div', 'acciones pf-cv-acc');
    enl.append(enlace('cv.html', 'Ver mi CV general ↗', 'btn sec mini'), enlace('cv.html?lang=en', 'CV en inglés ↗', 'btn sec mini'));
    const e = tarjeta('Tu experiencia', 'Es lo que RADAR usa para la propuesta de valor, el CV adaptado y la carta. Desactiva lo que no quieras que se use. Para corregir o añadir algo, pídemelo y lo actualizo en el CV.');
    e.append(enl);
    const tl = el('ol', 'pf-linea');
    CV.experiencia.forEach((x, i) => {
      const li = el('li');
      const det = el('details'); det.open = i === 0;
      const sum = el('summary');
      const ocultas = x.vinetas.filter((v, j) => PREF.ocultos[`${x.empresa}|${j}`]).length;
      sum.append(el('b', null, x.puesto), el('span', null, ' · ' + x.empresa), el('small', null, x.fechas + (ocultas ? ` · ${ocultas} sin usar` : '')));
      det.append(sum);
      x.vinetas.forEach((v, j) => {
        const k = `${x.empresa}|${j}`;
        const on = !PREF.ocultos[k];
        const fila = el('label', 'pf-vin' + (on ? '' : ' off'));
        const sw = el('input'); sw.type = 'checkbox'; sw.checked = on; sw.className = 'pf-switch';
        sw.setAttribute('aria-label', (on ? 'No usar: ' : 'Usar: ') + v.t.replace(/<[^>]+>/g, '').slice(0, 60));
        sw.addEventListener('change', () => { if (sw.checked) delete PREF.ocultos[k]; else PREF.ocultos[k] = true; guardarPref(); pfGuardado(); fila.classList.toggle('off', !sw.checked); });
        fila.append(sw, el('span', null, v.t.replace(/<[^>]+>/g, '')));
        det.append(fila);
      });
      li.append(det);
      tl.append(li);
    });
    e.append(tl);
    const f = tarjeta('Formación y certificaciones');
    const g = el('div', 'pf-forma');
    CV.formacion.forEach((x) => { const d = el('div', 'pf-forma-i'); d.append(el('b', null, x.t), el('small', null, x.d)); g.append(d); });
    f.append(g);
    const id2 = tarjeta('Idiomas y otros');
    const ch = el('div', 'pf-pills');
    CV.idiomas.split('·').map((x) => x.trim()).forEach((x) => ch.append(el('span', 'pf-pill on fijo', x)));
    ch.append(el('span', 'pf-pill', CV.extra));
    id2.append(ch);
  }

  if (PF_TAB === 'aprende' && typeof seccionAprendizaje === 'function') seccionAprendizaje(tarjeta, () => { pfGuardado(); pintar(); });

  if (PF_TAB === 'datos') {
    if (typeof tarjetaMiPerfil === 'function') tarjetaMiPerfil(tarjeta);
    const enCuenta = typeof NUBE_SESION !== 'undefined' && NUBE_SESION;
    const d = tarjeta(enCuenta ? 'Lo que has hecho en RADAR' : 'Dónde se guardan tus datos', enCuenta
      ? 'Tus preferencias, guardadas, candidaturas, notas, entrevistas, ofertas analizadas y cartas se guardan en tu cuenta y en este navegador.'
      : 'Tus preferencias, favoritos, candidaturas, notas, entrevistas, ofertas analizadas y cartas se guardan solo en este navegador. La web es pública pero no contiene nada tuyo salvo el CV sin teléfono.');
    const n = (o) => Object.keys(o || {}).length;
    const cifras = el('div', 'pf-cifras');
    [[n(ST.fav), 'guardadas'], [n(ST.est), 'con estado'], [n(ST.notas), 'notas'], [n(ST.externas), 'ofertas analizadas'], [n(ST.cartas), 'cartas'], [n(ST.convocatorias), 'convocatorias analizadas'], [n(ST.entrevistas), 'entrevistas']]
      .forEach(([v, t]) => { const c = el('div'); c.append(el('b', null, String(v)), el('small', null, t)); cifras.append(c); });
    d.append(cifras);
    const acc = el('div', 'acciones');
    acc.append(boton('Exportar una copia', 'btn', () => $('#exportar').click()), boton('Importar una copia', 'btn sec', () => $('#importar').click()));
    d.append(acc, el('p', 'nota', 'Haz una copia de vez en cuando y cuando cambies de ordenador o de navegador: si se borran los datos del navegador, se pierde lo que no esté copiado.'));
  }

  if (PF_TAB === 'piloto' && typeof seccionPiloto === 'function') seccionPiloto(tarjeta);

  $('#rejilla').replaceChildren(cont);
}
