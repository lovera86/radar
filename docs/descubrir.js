'use strict';
/* Descubrir: una oportunidad cada vez, como en una app de citas.
   Derecha = me gusta (y aplicar), izquierda = descartar, arriba = guardar.
   También con botones y con las flechas del teclado. Nada se envía solo. */

const DESC = { cola: [], deshacer: [], ocupado: false };

function colaDescubrir() {
  return ordenar(D.ops.filter((o) => pasa(o) && !ST.est[o.id] && !ST.fav[o.id]));
}

function pintarDescubrir() {
  DESC.cola = colaDescubrir();
  const total = D.ops.filter((o) => pasa(o)).length;
  $('#res-n').textContent = DESC.cola.length ? `Quedan ${DESC.cola.length} por revisar de ${total}` : '';
  const cont = el('div', 'descubrir');
  const zona = el('div', 'd-zona');
  zona.id = 'd-zona';
  cont.append(zona);
  const barra = el('div', 'd-botones');
  const b = (cls, icono, txt, fn, label) => {
    const x = boton('', 'd-btn ' + cls, fn);
    x.append(el('span', 'd-ico', icono), el('span', 'd-txt', txt));
    x.setAttribute('aria-label', label);
    return x;
  };
  const bDes = b('d-undo', '↶', 'Deshacer', deshacerDescubrir, 'Deshacer la última decisión');
  bDes.disabled = !DESC.deshacer.length;
  barra.append(bDes,
    b('d-no', '✕', 'Descartar', () => decidir('no'), 'Descartar (flecha izquierda)'),
    b('d-guardar', '★', 'Guardar', () => decidir('guardar'), 'Guardar para después (flecha arriba)'),
    b('d-si', '♥', 'Me gusta', () => decidir('si'), 'Me gusta (flecha derecha)'));
  cont.append(barra);
  cont.append(el('p', 'nota d-ayuda', 'Desliza a la derecha si te gusta, a la izquierda para descartar o hacia arriba para guardarla. En el ordenador, usa las flechas.'));
  $('#rejilla').replaceChildren(cont);
  siguienteCarta();
}

function siguienteCarta() {
  const zona = $('#d-zona');
  if (!zona) return;
  zona.replaceChildren();
  const o = DESC.cola[0];
  if (!o) {
    const fin = el('div', 'd-fin');
    fin.append(el('p', 'd-fin-t', '¡Lo has revisado todo!'),
      el('p', null, 'Las que te han gustado y las guardadas están en «Guardados y candidaturas». Mañana el radar traerá más.'),
      boton('Ver mis candidaturas', 'btn', () => { location.hash = 'guardados'; }));
    if (etiquetasActivas().length) fin.append(boton('Quitar filtros para ver más', 'btn sec', () => { limpiar(); pintar(); }));
    zona.append(fin);
    return;
  }
  if (DESC.cola[1]) zona.append(carta(DESC.cola[1], true));
  const c = carta(o, false);
  zona.append(c);
  arrastrable(c);
  $('#res-n').textContent = `Quedan ${DESC.cola.length} por revisar`;
}

function carta(o, detras) {
  const p = puntuar(o);
  const c = el('article', 'd-carta' + (detras ? ' detras' : ''));
  if (detras) { c.setAttribute('aria-hidden', 'true'); }
  else { c.setAttribute('aria-label', `${SUBTIPOS[o.subtipo]?.nombre}: ${o.titulo}. Compatibilidad ${p.total}.`); c.tabIndex = 0; }
  const vis = visual(o, true);
  ['si', 'no', 'guardar'].forEach((k) => vis.append(el('span', 'sello s-' + k, { si: 'ME GUSTA', no: 'DESCARTAR', guardar: 'GUARDAR' }[k])));
  const cu = el('div', 'd-cuerpo');
  cu.append(el('span', 'naturaleza' + (o.verificacion === 'vacante_confirmada' ? '' : ' potencial'), [NATURALEZA[o.verificacion], o.fuentes[0]?.nombre].filter(Boolean).join(' · ')));
  cu.append(el('h3', null, o.titulo));
  if (o.organizacion.nombre) cu.append(el('p', 'org', o.organizacion.nombre));
  const lugar = lugarCorto(o);
  if (lugar) cu.append(el('p', 'lugar', lugar));
  const extra = o.salario?.texto || (o.importe ? eur(o.importe) + (o.subtipo === 'adjudicacion' ? ' adjudicados' : ' de licitación') : o.subtipo === 'oferta' ? 'Salario no especificado' : '');
  if (extra) cu.append(el('p', 'extra', extra));
  const nota = el('div', 'd-nota');
  nota.append(el('b', 'n-' + (p.total >= 75 ? 'alta' : p.total >= 60 ? 'media' : 'baja'), String(p.total)), el('span', null, 'compatibilidad estimada · confianza ' + o.confianza));
  cu.append(nota);
  const raz = razones(o);
  if (raz.length) { const ul = el('ul', 'razones'); raz.forEach((r) => ul.append(el('li', null, r))); cu.append(ul); }
  const fr = frescura(o);
  if (fr) cu.append(el('p', 'fresco' + (/cierra (hoy|en [1-3] )/.test(fr) ? ' urge' : ''), fr));
  if (!detras) cu.append(boton('Ver todos los detalles', 'enlace d-detalles', () => abrirFicha(o.id)));
  c.append(vis, cu);
  return c;
}

function arrastrable(c) {
  let x0 = 0, y0 = 0, dx = 0, dy = 0, activo = false;
  const sellos = (vx, vy) => {
    c.querySelector('.s-si').style.opacity = Math.max(0, Math.min(1, vx / 110));
    c.querySelector('.s-no').style.opacity = Math.max(0, Math.min(1, -vx / 110));
    c.querySelector('.s-guardar').style.opacity = Math.abs(vx) < 70 ? Math.max(0, Math.min(1, -vy / 110)) : 0;
  };
  c.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a') || DESC.ocupado) return;
    activo = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0;
    c.setPointerCapture(e.pointerId); c.classList.add('arrastrando');
  });
  c.addEventListener('pointermove', (e) => {
    if (!activo) return;
    dx = e.clientX - x0; dy = e.clientY - y0;
    c.style.transform = `translate(${dx}px, ${Math.min(dy, 40)}px) rotate(${dx / 18}deg)`;
    sellos(dx, dy);
  });
  const soltar = () => {
    if (!activo) return;
    activo = false; c.classList.remove('arrastrando');
    if (dx > 110) decidir('si');
    else if (dx < -110) decidir('no');
    else if (dy < -110 && Math.abs(dx) < 80) decidir('guardar');
    else { c.style.transform = ''; sellos(0, 0); }
  };
  c.addEventListener('pointerup', soltar);
  c.addEventListener('pointercancel', soltar);
}

function decidir(tipo) {
  const o = DESC.cola[0];
  if (!o || DESC.ocupado) return;
  DESC.ocupado = true;
  DESC.deshacer.push({ id: o.id, est: ST.est[o.id] ? JSON.parse(JSON.stringify(ST.est[o.id])) : null, fav: ST.fav[o.id] || null });
  if (tipo === 'si') setEstado(o.id, 'interes', 'Me gusta en Descubrir');
  if (tipo === 'no') setEstado(o.id, 'descartada', 'Descartada en Descubrir');
  if (tipo === 'guardar') toggleFav(o.id);
  const c = $('#d-zona .d-carta:not(.detras)');
  if (c) {
    c.classList.add('vuela', 'v-' + tipo);
    c.querySelector('.s-' + tipo).style.opacity = 1;
  }
  const btnUndo = $('.d-undo'); if (btnUndo) btnUndo.disabled = false;
  setTimeout(() => {
    DESC.cola.shift();
    DESC.ocupado = false;
    siguienteCarta();
    if (tipo === 'si') hojaAplicar(o);
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260);
}

function deshacerDescubrir() {
  const u = DESC.deshacer.pop();
  if (!u) return;
  if (u.est) ST.est[u.id] = u.est; else delete ST.est[u.id];
  if (u.fav) ST.fav[u.id] = u.fav; else delete ST.fav[u.id];
  guardarST();
  const o = D.porId.get(u.id);
  if (o) DESC.cola.unshift(o);
  $('.d-undo').disabled = !DESC.deshacer.length;
  cerrarHoja();
  siguienteCarta();
}

/* Tras «me gusta»: aplicar ahora o dejarlo para después. */
function hojaAplicar(o) {
  cerrarHoja();
  const h = el('div', 'd-hoja');
  h.setAttribute('role', 'dialog');
  h.setAttribute('aria-label', 'Te interesa: ' + o.titulo);
  h.append(el('p', 'd-hoja-t', '♥ Te interesa'), el('p', 'd-hoja-s', o.titulo));
  const acc = el('div', 'd-hoja-acc');
  if (o.tipo === 'empleo') {
    if (o.accion.url) acc.append(enlace(o.accion.url, o.subtipo === 'oferta' ? 'Ver oferta y aplicar' : 'Ver convocatoria', 'btn'));
    acc.append(enlace(cvUrl(o.origen.lista, o.origen.clave), 'CV adaptado'));
    h.append(acc, el('p', 'nota', 'Cuando te inscribas, márcala como «Enviada» en Guardados. RADAR no lo marca solo.'));
  } else if (o.subtipo === 'licitacion_abierta') {
    acc.append(boton('Elegir empresa y ofrecerme', 'btn', () => { cerrarHoja(); abrirFicha(o.id); setTimeout(() => $('#fi-candidatas')?.scrollIntoView({ behavior: 'smooth' }), 150); }));
    h.append(acc);
  } else {
    acc.append(boton('Preparar contacto', 'btn', () => { cerrarHoja(); abrirContacto(o); }));
    if (o.origen.lista !== 'senal') acc.append(enlace(cvUrl(o.origen.lista, o.origen.clave), 'CV adaptado'));
    h.append(acc);
  }
  h.append(boton('Lo haré después', 'enlace', cerrarHoja));
  document.body.append(h);
  requestAnimationFrame(() => h.classList.add('abierta'));
}
function cerrarHoja() { $$('.d-hoja').forEach((x) => x.remove()); }

document.addEventListener('keydown', (e) => {
  if (VISTA !== 'descubrir' || document.querySelector('dialog[open]') || /input|select|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); decidir('si'); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); decidir('no'); }
  if (e.key === 'ArrowUp') { e.preventDefault(); decidir('guardar'); }
  if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); deshacerDescubrir(); }
});
