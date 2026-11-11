'use strict';
/* Bienvenida del piloto: a quien entra por primera vez (sin perfil y sin datos) le
   explica qué es RADAR y le deja cargar su perfil o ver el ejemplo. */

function selectorPerfil(alCargar) {
  const lab = el('label', 'btn bv-cargar');
  lab.append('Cargar mi perfil (.json)');
  const inp = el('input'); inp.type = 'file'; inp.accept = 'application/json,.json'; inp.hidden = true;
  inp.addEventListener('change', () => { if (inp.files[0]) cargarPerfilDesdeArchivo(inp.files[0], alCargar); });
  lab.append(inp);
  return lab;
}

function enlaceOpinion(texto, cls) {
  const cuerpo = [
    `Hola, Rocío. Mi opinión sobre RADAR (${new Date().toLocaleDateString('es-ES')}):`, '',
    '1. ¿Lo has abierto varios días? ¿Qué es lo primero que miras?', '',
    '2. ¿Las oportunidades que te propone encajan contigo? (1 a 5)', '',
    '3. ¿Has preparado alguna candidatura con el CV o la carta? ¿Qué tal?', '',
    '4. ¿Qué echas en falta o te sobra?', '',
    '5. ¿Lo recomendarías? ¿Pagarías por usarlo? ¿Cuánto al mes?', '',
  ].join('\n');
  const a = el('a', cls || 'enlace', texto);
  a.href = `mailto:${RADAR_CONTACTO_PILOTO}?subject=${encodeURIComponent('Opinión sobre RADAR')}&body=${encodeURIComponent(cuerpo)}`;
  return a;
}

function mostrarBienvenida() {
  const d = el('dialog', 'bv');
  d.setAttribute('aria-labelledby', 'bv-t');
  const marca = el('div', 'bv-marca');
  marca.innerHTML = $('.marca svg').outerHTML;
  marca.append(el('span', null, 'RADAR · piloto'));
  const h = el('h2', null, 'Tu radar de oportunidades profesionales'); h.id = 'bv-t';
  const ul = el('ul', 'bv-lista');
  ['Busca cada día ofertas de empleo, oposiciones y oportunidades en muchas fuentes.', 'Las ordena según tu perfil y te explica por qué encajan.',
    'Te prepara el CV adaptado, la propuesta de valor y la carta para cada una.',
    RADAR_NUBE ? 'Entras con tu correo y ves lo mismo en el móvil y en el ordenador.' : 'Tus datos se guardan solo en este navegador.']
    .forEach((x) => ul.append(el('li', null, x)));
  const errores = el('div', 'bv-err'); errores.setAttribute('role', 'alert');
  const acc = el('div', 'bv-acc');
  if (!RADAR_NUBE) acc.append(selectorPerfil((errs) => {
    if (!errs.length) { location.reload(); return; }
    errores.replaceChildren(el('b', null, 'No se ha podido cargar el perfil:'), ...errs.map((x) => el('p', null, x)));
  }));
  acc.append(boton('Ver un ejemplo', 'btn sec', async () => {
    try {
      const ej = await fetch('perfiles/ejemplo.json', { cache: 'no-store' }).then((r) => r.json());
      localStorage.setItem('radar-usuario', JSON.stringify({ ...ej, ejemplo: true }));
      if (ej.preferencias) localStorage.setItem('radar-perfil', JSON.stringify(ej.preferencias));
    } catch (e) { try { localStorage.setItem('radar-demo', '1'); } catch (x) { /* sin almacenamiento */ } }
    location.reload();
  }));
  const pie = el('p', 'nota');
  pie.append('¿Aún no tienes tu perfil? Durante el piloto lo preparamos a partir de tu CV. ', enlaceOpinion('Escríbenos', 'enlace'), '.');
  pie.querySelector('a').href = `mailto:${RADAR_CONTACTO_PILOTO}?subject=${encodeURIComponent('Quiero probar RADAR')}&body=${encodeURIComponent('Hola, Rocío. Me gustaría probar RADAR. Te adjunto mi CV.\n\nQué tipo de trabajo busco:\nZona o comunidad:\n¿Me interesan también oposiciones? (sí/no):\n')}`;
  if (RADAR_NUBE) {
    d.append(marca, h, el('p', 'bv-sub', 'Estás en el piloto privado. Entra con el correo con el que te hemos dado de alta.'), ul, nubeFormularioEntrar(), acc, errores, pie);
  } else d.append(marca, h, el('p', 'bv-sub', 'Estás en el piloto privado. Carga el archivo de perfil que te hemos enviado para ver tus oportunidades.'), ul, acc, errores, pie);
  document.body.append(d);
  d.addEventListener('cancel', (e) => e.preventDefault());
  d.showModal();
}

(() => {
  let nueva = false;
  let conSesion = false;
  try { conSesion = Boolean(RADAR_NUBE && localStorage.getItem('radar-sesion')); } catch (e) { conSesion = false; }
  try { nueva = !RADAR_ACCESO && !USUARIO && !conSesion && !localStorage.getItem('radar-v2') && !localStorage.getItem('radar-perfil') && !localStorage.getItem('radar-demo'); } catch (e) { nueva = false; }
  if (nueva) mostrarBienvenida();
  const p = $('.pie-acc');
  if (p && USUARIO) p.append(' · ', enlaceOpinion('Enviar mi opinión sobre RADAR'));
  if (p && RADAR_NUBE) p.append(' · ', conSesion ? boton('Cerrar sesión', 'enlace', () => nubeSalir()) : boton('Entrar con mi correo', 'enlace', nubeAbrirEntrar));
})();

/* Tarjeta de «Mis datos» (Mi perfil) para gestionar el perfil cargado. */
function tarjetaMiPerfil(tarjeta) {
  if (RADAR_NUBE) {
    tarjetaCuenta(tarjeta);
    const t = tarjeta(USUARIO ? 'Tu perfil de RADAR' : 'Perfil en uso', USUARIO
      ? (USUARIO.ejemplo ? `Estás viendo el perfil de ejemplo (${USUARIO.nombre}, ficticio).` : `${USUARIO.nombre} · ${REGION}. Lo preparamos a partir de tu CV; si algo no es correcto, escríbenos y lo cambiamos.`)
      : 'Estás usando el perfil por defecto.');
    const acc = el('div', 'acciones');
    if (typeof botonInstalar === 'function') acc.append(botonInstalar());
    if (USUARIO && !USUARIO.ejemplo) acc.append(enlaceOpinion('Enviar mi opinión', 'btn sec'));
    t.append(acc);
    return;
  }
  const t = tarjeta(USUARIO ? 'Tu perfil de RADAR' : 'Perfil en uso', USUARIO
    ? (USUARIO.ejemplo ? `Estás viendo el perfil de ejemplo (${USUARIO.nombre}, ficticio). Carga tu propio perfil cuando lo tengas.` : `Perfil cargado: ${USUARIO.nombre} · ${REGION}. Está guardado solo en este navegador.`)
    : 'Estás usando el perfil por defecto. Si te han enviado un archivo de perfil, cárgalo aquí.');
  const errores = el('div', 'bv-err');
  const acc = el('div', 'acciones');
  acc.append(selectorPerfil((errs) => { if (!errs.length) location.reload(); else errores.replaceChildren(...errs.map((x) => el('p', null, x))); }));
  if (typeof botonInstalar === 'function') acc.append(botonInstalar());
  if (USUARIO && !USUARIO.ejemplo) {
    const linea = el('div', 'bv-enlace');
    const nota = el('p', 'nota', 'Tu enlace personal abre RADAR con tu perfil en cualquier navegador o en el móvil. Es privado: no lo publiques ni lo reenvíes.');
    linea.append(boton('Copiar mi enlace de acceso', 'btn sec', async function () {
      try { const url = await perfilAEnlace(USUARIO); await navigator.clipboard.writeText(url); this.textContent = '✓ Enlace copiado'; } catch (e) { this.textContent = 'No se ha podido copiar'; }
    }), nota);
    t.append(linea);
  }
  if (USUARIO) {
    acc.append(boton('Quitar mi perfil de este navegador', 'btn sec', () => {
      if (!confirm('Se quitará tu perfil de este navegador (tus guardadas y notas se mantienen). ¿Seguir?')) return;
      try { localStorage.removeItem('radar-usuario'); localStorage.setItem('radar-demo', '1'); } catch (e) { /* sin almacenamiento */ }
      location.reload();
    }));
    acc.append(enlaceOpinion('Enviar mi opinión', 'btn sec'));
  }
  t.append(acc, errores);
}
