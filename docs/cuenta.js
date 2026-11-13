'use strict';
/* Cuenta de RADAR en el servidor (Supabase, UE).
   - Entrar con el correo y un código de un solo uso (sin contraseñas).
   - El perfil de cada persona lo prepara la administración (tabla «altas») y la persona
     lo recoge al entrar.
   - Lo que la persona hace (guardadas, estados, notas, preferencias, pesos) se guarda en
     el navegador como siempre y además se sincroniza con su cuenta, para usar RADAR en
     el móvil y en el ordenador.
   Se carga antes de usuario.js. Si supabase-config.js está vacío, no hace nada. */

const NUBE_CLAVES = ['radar-v2', 'radar-perfil', 'radar-pesos'];
const NUBE_LOCALES = ['radar-usuario', 'radar-v2', 'radar-perfil', 'radar-pesos', 'radar-demo', 'radar-primeros-pasos', 'radar-nube'];
const NUBE_PRIVACIDAD = '2026-11';
/* Si se entra con el enlace del correo, la dirección trae los datos de la sesión (o un error)
   tras «#». Se recogen antes de que RADAR use «#» para sus vistas y se limpia la dirección. */
const NUBE_VUELTA = (() => {
  const h = location.hash.slice(1);
  if (!/(^|&)(access_token|error_code|error_description)=/.test(h)) return null;
  const p = Object.fromEntries(new URLSearchParams(h));
  history.replaceState(null, '', location.pathname + location.search + '#radar');
  return p;
})();
const NUBE_VOLVER = location.origin + location.pathname.replace(/[^/]*$/, '');

const RADAR_NUBE = (() => {
  const c = typeof RADAR_SUPABASE === 'object' ? RADAR_SUPABASE : null;
  if (!c || !c.url || !c.clave || !window.supabase || !window.supabase.createClient) return null;
  try {
    return window.supabase.createClient(c.url, c.clave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'radar-sesion' } });
  } catch (e) { return null; }
})();

let NUBE_SESION = null;
let NUBE_ADMIN = false;
let NUBE_PERFIL = null;
let NUBE_COMPROBADA = false; // ya se sabe si hay sesión
let NUBE_ESTADO = 'sin-cuenta'; // sin-cuenta · cargando · al-dia · guardando · sin-conexion
const NUBE_PEND = new Set();
let NUBE_TEMP = null;

const nubeGuardarLocal = Storage.prototype.setItem;
const nubeMeta = () => { try { return JSON.parse(localStorage.getItem('radar-nube')) || {}; } catch (e) { return {}; } };
const nubeMetaGuardar = (m) => { try { nubeGuardarLocal.call(localStorage, 'radar-nube', JSON.stringify(m)); } catch (e) { /* sin almacenamiento */ } };
const nubeMs = (t) => (t ? Date.parse(t) || 0 : 0);

function nubeAviso(estado) {
  NUBE_ESTADO = estado;
  document.documentElement.dataset.nube = estado;
  document.querySelectorAll('[data-nube-estado]').forEach((n) => { n.textContent = nubeTextoEstado(); });
}
function nubeTextoEstado() {
  return { 'sin-cuenta': 'Sin cuenta: tus datos están solo en este navegador', cargando: 'Conectando con tu cuenta…', 'al-dia': '✓ Sincronizado con tu cuenta',
    guardando: 'Guardando en tu cuenta…', 'sin-conexion': 'Sin conexión: se guardará en tu cuenta al volver' }[NUBE_ESTADO] || '';
}

/* Cada vez que RADAR guarda algo sincronizable, se apunta para subirlo. */
if (RADAR_NUBE) {
  Storage.prototype.setItem = function (k, v) {
    nubeGuardarLocal.call(this, k, v);
    if (this === window.localStorage && NUBE_CLAVES.includes(k)) nubeCambio(k);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') nubeSubir(); });
  window.addEventListener('online', () => nubeSubir());
}

function nubeCambio(k) {
  const m = nubeMeta(); m.sucio = { ...(m.sucio || {}), [k]: true }; nubeMetaGuardar(m);
  if (!NUBE_SESION) return;
  NUBE_PEND.add(k);
  clearTimeout(NUBE_TEMP);
  NUBE_TEMP = setTimeout(nubeSubir, 1200);
}

async function nubeSubir() {
  clearTimeout(NUBE_TEMP);
  if (!RADAR_NUBE || !NUBE_SESION || !NUBE_PEND.size) return;
  const claves = [...NUBE_PEND]; NUBE_PEND.clear();
  const filas = [];
  for (const k of claves) {
    try { const v = JSON.parse(localStorage.getItem(k)); if (v != null) filas.push({ user_id: NUBE_SESION.user.id, clave: k, valor: v }); } catch (e) { /* valor no válido: no se sube */ }
  }
  if (!filas.length) return;
  nubeAviso('guardando');
  const { data, error } = await RADAR_NUBE.from('estado').upsert(filas, { onConflict: 'user_id,clave' }).select('clave, actualizado');
  if (error) {
    claves.forEach((k) => NUBE_PEND.add(k));
    nubeAviso('sin-conexion');
    NUBE_TEMP = setTimeout(nubeSubir, 20000);
    return;
  }
  const m = nubeMeta(); m.t = m.t || {}; m.sucio = m.sucio || {};
  (data || []).forEach((f) => { m.t[f.clave] = nubeMs(f.actualizado); delete m.sucio[f.clave]; });
  nubeMetaGuardar(m);
  nubeAviso(NUBE_PEND.size ? 'guardando' : 'al-dia');
}

function nubeLimpiarLocal() {
  NUBE_LOCALES.forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } });
}

/* Al abrir RADAR con sesión: consentimiento, perfil y estado. Recarga una vez si algo cambió. */
async function nubeIniciar() {
  if (!RADAR_NUBE) return;
  if (NUBE_VUELTA) {
    if (NUBE_VUELTA.access_token && NUBE_VUELTA.refresh_token) {
      const r = await RADAR_NUBE.auth.setSession({ access_token: NUBE_VUELTA.access_token, refresh_token: NUBE_VUELTA.refresh_token });
      if (r.error) alert('El enlace para entrar no es válido. Pide un código nuevo desde «Entrar con mi correo».');
    } else {
      alert(/expired|caduc/i.test(NUBE_VUELTA.error_description || NUBE_VUELTA.error_code || '')
        ? 'El enlace para entrar ha caducado o ya se usó. Pide un código nuevo desde «Entrar con mi correo».'
        : 'No se ha podido entrar con ese enlace. Pide un código nuevo desde «Entrar con mi correo».');
    }
  }
  const { data } = await RADAR_NUBE.auth.getSession();
  NUBE_SESION = data.session;
  RADAR_NUBE.auth.onAuthStateChange((ev, s) => { NUBE_SESION = s; });
  document.documentElement.classList.toggle('con-cuenta', Boolean(NUBE_SESION));
  NUBE_COMPROBADA = true;
  if (!NUBE_SESION) { nubeAviso('sin-cuenta'); if (typeof VISTA !== 'undefined' && NUBE_PRIVADAS.includes(VISTA) && typeof pintar === 'function') pintar(); return; }
  nubeAviso('cargando');
  const uid = NUBE_SESION.user.id;
  let m = nubeMeta(); let recargar = false;
  try {
    if (m.user && m.user !== uid) { nubeLimpiarLocal(); m = {}; recargar = true; }

    const cons = await RADAR_NUBE.from('consentimientos').select('version').eq('user_id', uid).eq('version', NUBE_PRIVACIDAD);
    if (cons.error) throw cons.error;
    if (!cons.data.length) {
      const ok = await nubePedirConsentimiento();
      if (!ok) { await nubeSalir(); return; }
    }

    const adm = await RADAR_NUBE.rpc('es_admin');
    NUBE_ADMIN = adm.data === true;
    const per = await RADAR_NUBE.rpc('reclamar_perfil');
    if (per.error) throw per.error;
    NUBE_PERFIL = per.data;

    const filas = await RADAR_NUBE.from('estado').select('clave, valor, actualizado').eq('user_id', uid);
    if (filas.error) throw filas.error;
    m.t = m.t || {}; m.sucio = m.sucio || {};
    const enServidor = new Set();
    for (const f of filas.data) {
      enServidor.add(f.clave);
      const t = nubeMs(f.actualizado);
      if (t > (m.t[f.clave] || 0)) {
        const nuevo = JSON.stringify(f.valor);
        if (nuevo !== localStorage.getItem(f.clave)) { nubeGuardarLocal.call(localStorage, f.clave, nuevo); recargar = true; }
        m.t[f.clave] = t; delete m.sucio[f.clave];
      }
    }
    if (NUBE_PERFIL && NUBE_PERFIL.datos) {
      const p = NUBE_PERFIL.datos;
      const nuevo = JSON.stringify(p);
      if (nuevo !== localStorage.getItem('radar-usuario')) { nubeGuardarLocal.call(localStorage, 'radar-usuario', nuevo); localStorage.removeItem('radar-demo'); recargar = true; }
      if (p.preferencias && !enServidor.has('radar-perfil') && !localStorage.getItem('radar-perfil')) { localStorage.setItem('radar-perfil', JSON.stringify(p.preferencias)); recargar = true; }
    } else if (!NUBE_ADMIN && localStorage.getItem('radar-usuario')) {
      // Cuenta sin perfil preparado: no se mezcla con un perfil de otra persona guardado aquí.
      localStorage.removeItem('radar-usuario'); recargar = true;
    }
    // Lo que hay en este navegador y aún no está en la cuenta se sube (primera vez o cambios sin conexión).
    NUBE_CLAVES.forEach((k) => { if ((!enServidor.has(k) || m.sucio[k]) && localStorage.getItem(k)) NUBE_PEND.add(k); });
    m.user = uid; m.email = NUBE_SESION.user.email;
    nubeMetaGuardar(m);
    if (NUBE_PEND.size) await nubeSubir(); else nubeAviso('al-dia');
  } catch (e) {
    nubeAviso('sin-conexion');
    return;
  }
  if (recargar && sessionStorage.getItem('radar-nube-recarga') !== '1') {
    sessionStorage.setItem('radar-nube-recarga', '1');
    location.reload();
    return;
  }
  sessionStorage.removeItem('radar-nube-recarga');
  if (!NUBE_PERFIL && !NUBE_ADMIN) nubeSinPerfil();
  document.dispatchEvent(new CustomEvent('radar-nube-lista'));
}

/* ---------- Zonas privadas: sin sesión no se enseñan ---------- */
const NUBE_PRIVADAS = ['perfil', 'bandeja'];
/* Si la vista es privada y no hay sesión, pinta la pantalla de entrada y devuelve true. */
function nubePuerta(vista) {
  if (!RADAR_NUBE || !NUBE_PRIVADAS.includes(vista) || NUBE_SESION) return false;
  $('#res-n').textContent = '';
  const c = el('section', 'nube-puerta');
  if (!NUBE_COMPROBADA) { c.append(el('p', 'nota', 'Comprobando tu sesión…')); $('#rejilla').replaceChildren(c); return true; }
  c.append(el('h2', null, vista === 'perfil' ? 'Entra para ver tu perfil' : 'Entra para ver tus oportunidades'),
    el('p', 'bv-sub', 'Esta parte de RADAR es personal: tu perfil, tus oportunidades, tus agentes y tu configuración solo se ven con tu sesión iniciada.'),
    nubeFormularioEntrar());
  $('#rejilla').replaceChildren(c);
  return true;
}

/* ---------- Entrar y salir ---------- */
async function nubeSalir() {
  await nubeSubir();
  try { await RADAR_NUBE.auth.signOut(); } catch (e) { /* ya sin sesión */ }
  nubeLimpiarLocal();
  try { localStorage.setItem('radar-demo', '1'); } catch (e) { /* sin almacenamiento */ }
  location.hash = 'radar';
  location.reload();
}

function nubeDialogo(clase) {
  const d = document.createElement('dialog');
  d.className = 'bv nube ' + (clase || '');
  document.body.append(d);
  return d;
}

/* Formulario de entrada: correo → código de 6 a 10 cifras que llega por correo. */
function nubeFormularioEntrar(alEntrar) {
  const f = el('form', 'nube-form');
  const paso1 = el('div', 'nube-paso');
  const lab = el('label', null, 'Tu correo');
  const correo = el('input'); correo.type = 'email'; correo.required = true; correo.autocomplete = 'email'; correo.id = 'nube-correo'; correo.placeholder = 'nombre@correo.com';
  lab.htmlFor = 'nube-correo';
  const enviar = el('button', 'btn', 'Enviarme un código'); enviar.type = 'submit';
  paso1.append(lab, correo, enviar);
  const paso2 = el('div', 'nube-paso'); paso2.hidden = true;
  const lab2 = el('label', null, 'Código que te hemos enviado');
  const cod = el('input'); cod.inputMode = 'numeric'; cod.autocomplete = 'one-time-code'; cod.id = 'nube-codigo'; cod.pattern = '[0-9]{6,10}'; cod.maxLength = 10;
  lab2.htmlFor = 'nube-codigo';
  const entrar = el('button', 'btn', 'Entrar'); entrar.type = 'submit';
  const otro = boton('Usar otro correo', 'enlace', () => { paso2.hidden = true; paso1.hidden = false; correo.focus(); });
  paso2.append(lab2, cod, entrar, otro);
  const msg = el('p', 'nube-msg'); msg.setAttribute('role', 'status');
  f.append(paso1, paso2, msg);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!paso1.hidden) {
      enviar.disabled = true; msg.textContent = 'Enviando…';
      const { error } = await RADAR_NUBE.auth.signInWithOtp({ email: correo.value.trim(), options: { shouldCreateUser: false, emailRedirectTo: NUBE_VOLVER } });
      enviar.disabled = false;
      if (error) {
        msg.textContent = (/signup|not allowed|not found|otp_disabled|acceso/i.test(error.message) || error.status === 403 || error.code === 'signup_disabled')
          ? 'Ese correo no tiene acceso al piloto. Si deberías tenerlo, escribe a ' + RADAR_CONTACTO_PILOTO + '.'
          : /rate|seconds/i.test(error.message) ? 'Has pedido un código hace muy poco. Espera un minuto y vuelve a intentarlo.' : 'No se ha podido enviar el código. Revisa la conexión y vuelve a intentarlo.';
        return;
      }
      paso1.hidden = true; paso2.hidden = false; cod.value = ''; cod.focus();
      msg.textContent = `Te hemos enviado un código a ${correo.value.trim()}. Mira también en spam. Caduca en una hora.`;
    } else {
      entrar.disabled = true; msg.textContent = 'Comprobando…';
      // El código puede venir del correo de entrada, de confirmación de registro o de invitación.
      let error = null;
      for (const type of ['email', 'signup', 'invite', 'magiclink']) {
        ({ error } = await RADAR_NUBE.auth.verifyOtp({ email: correo.value.trim(), token: cod.value.trim(), type }));
        if (!error) break;
      }
      entrar.disabled = false;
      if (error) { msg.textContent = 'El código no es correcto o ha caducado. Revísalo o pide otro.'; return; }
      msg.textContent = '✓ Dentro. Cargando tu RADAR…';
      if (alEntrar) alEntrar();
      sessionStorage.removeItem('radar-nube-recarga');
      location.hash = 'radar';
      location.reload();
    }
  });
  return f;
}

function nubeAbrirEntrar() {
  if (!RADAR_NUBE) return;
  const d = nubeDialogo();
  const cerrar = boton('Cerrar', 'enlace nube-cerrar', () => d.close());
  d.append(cerrar, el('h2', null, 'Entra en tu RADAR'), el('p', 'bv-sub', 'Sin contraseñas: te enviamos un código a tu correo cada vez que entras en un dispositivo nuevo.'), nubeFormularioEntrar());
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

/* ---------- Consentimiento (RGPD) ---------- */
function nubePedirConsentimiento() {
  return new Promise((resolver) => {
    const d = nubeDialogo('nube-rgpd');
    const h = el('h2', null, 'Antes de empezar: tus datos');
    const ul = el('ul', 'bv-lista');
    ['Guardamos tu perfil, tu CV y lo que haces en RADAR (guardadas, estados, notas) en un servidor de Supabase en la Unión Europea (Estocolmo, Suecia).',
      'Solo tú ves tus notas y tus candidaturas. Rocío, como responsable del piloto, ve tu perfil y cuántas oportunidades guardas o envías, para medir el piloto.',
      'Nada se envía a empresas ni a terceros. No se usan tus datos para publicidad.',
      'Puedes descargar tus datos o borrar tu cuenta cuando quieras, desde Mi perfil → Mis datos.']
      .forEach((x) => ul.append(el('li', null, x)));
    const lee = el('p', 'nota');
    const a = el('a', 'enlace', 'Lee la política de privacidad completa'); a.href = 'privacidad.html'; a.target = '_blank'; a.rel = 'noopener';
    lee.append(a, '.');
    const lab = el('label', 'nube-check');
    const chk = el('input'); chk.type = 'checkbox'; chk.id = 'nube-acepto';
    lab.append(chk, ' He leído la política de privacidad y acepto que RADAR trate mis datos para el piloto.');
    const msg = el('p', 'nube-msg'); msg.setAttribute('role', 'alert');
    const acc = el('div', 'bv-acc');
    const si = boton('Aceptar y continuar', 'btn', async () => {
      if (!chk.checked) { msg.textContent = 'Marca la casilla para continuar.'; return; }
      si.disabled = true;
      const { error } = await RADAR_NUBE.from('consentimientos').insert({ user_id: NUBE_SESION.user.id, version: NUBE_PRIVACIDAD });
      if (error && !/duplicate/i.test(error.message)) { si.disabled = false; msg.textContent = 'No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.'; return; }
      d.close(); d.remove(); resolver(true);
    });
    const no = boton('No acepto', 'btn sec', () => { d.close(); d.remove(); resolver(false); });
    acc.append(si, no);
    d.append(h, ul, lee, lab, acc, msg);
    d.addEventListener('cancel', (e) => e.preventDefault());
    d.showModal();
  });
}

function nubeSinPerfil() {
  const d = nubeDialogo();
  d.append(el('h2', null, 'Tu cuenta está lista'), el('p', 'bv-sub', 'Aún no tenemos preparado tu perfil a partir de tu CV. En cuanto esté, lo verás al entrar. Mientras tanto puedes ver cómo funciona RADAR con un perfil de ejemplo.'));
  const acc = el('div', 'bv-acc');
  acc.append(boton('Entendido', 'btn', () => d.close()), boton('Cerrar sesión', 'btn sec', () => nubeSalir()));
  d.append(acc);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

/* ---------- Mis datos: cuenta, descarga y borrado ---------- */
async function nubeDescargarDatos() {
  const uid = NUBE_SESION.user.id;
  const [per, est, cons] = await Promise.all([
    RADAR_NUBE.from('perfiles').select('*').eq('user_id', uid),
    RADAR_NUBE.from('estado').select('clave, valor, actualizado').eq('user_id', uid),
    RADAR_NUBE.from('consentimientos').select('version, aceptado').eq('user_id', uid),
  ]);
  const datos = { exportado: new Date().toISOString(), cuenta: NUBE_SESION.user.email, perfil: per.data, actividad: est.data, consentimientos: cons.data };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
  a.download = 'radar-mis-datos.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function nubeAbrirCV(ruta) {
  const { data, error } = await RADAR_NUBE.storage.from('cv').createSignedUrl(ruta, 120);
  if (error) { alert('No se ha podido abrir el CV.'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

async function nubeBorrarCuenta() {
  const correo = NUBE_SESION.user.email;
  const escrito = prompt(`Se borrarán tu cuenta, tu perfil, tu CV y todo lo que has hecho en RADAR. No se puede deshacer.\n\nEscribe tu correo (${correo}) para confirmar:`);
  if (!escrito || escrito.trim().toLowerCase() !== correo.toLowerCase()) return;
  const carpeta = correo.toLowerCase();
  const lista = await RADAR_NUBE.storage.from('cv').list(carpeta);
  if (lista.data && lista.data.length) await RADAR_NUBE.storage.from('cv').remove(lista.data.map((f) => `${carpeta}/${f.name}`));
  const { error } = await RADAR_NUBE.rpc('borrar_mi_cuenta');
  if (error) { alert('No se ha podido borrar la cuenta. Escribe a ' + RADAR_CONTACTO_PILOTO + ' y la borramos.'); return; }
  try { await RADAR_NUBE.auth.signOut(); } catch (e) { /* la cuenta ya no existe */ }
  nubeLimpiarLocal();
  alert('Tu cuenta y tus datos se han borrado.');
  location.hash = 'radar';
  location.reload();
}

/* Tarjeta «Tu cuenta» en Mi perfil → Mis datos. */
function tarjetaCuenta(tarjeta) {
  if (!RADAR_NUBE) return;
  if (!NUBE_SESION) {
    const t = tarjeta('Tu cuenta', 'Entra con tu correo para usar RADAR en el móvil y en el ordenador con los mismos datos.');
    const acc = el('div', 'acciones');
    acc.append(boton('Entrar con mi correo', 'btn', nubeAbrirEntrar));
    t.append(acc);
    return;
  }
  const t = tarjeta('Tu cuenta', null);
  const linea = el('p', 'nube-linea');
  linea.append(el('b', null, NUBE_SESION.user.email));
  const est = el('span', 'nube-estado'); est.dataset.nubeEstado = ''; est.textContent = nubeTextoEstado();
  linea.append(est);
  t.append(linea);
  if (NUBE_ADMIN) t.append(el('p', 'nota', 'Tienes permisos de administración del piloto (pestaña «Piloto»).'));
  const acc = el('div', 'acciones');
  if (NUBE_PERFIL && NUBE_PERFIL.cv_ruta) acc.append(boton('Ver mi CV original', 'btn sec', () => nubeAbrirCV(NUBE_PERFIL.cv_ruta)));
  acc.append(boton('Descargar mis datos', 'btn sec', nubeDescargarDatos), boton('Cerrar sesión', 'btn sec', nubeSalir));
  t.append(acc);
  const borrar = el('p', 'nota');
  borrar.append('Tus datos están en un servidor de la UE. ', Object.assign(el('a', 'enlace', 'Política de privacidad'), { href: 'privacidad.html', target: '_blank', rel: 'noopener' }), ' · ', boton('Borrar mi cuenta y mis datos', 'enlace peligro', nubeBorrarCuenta));
  t.append(borrar);
}

// Después de cargar todos los scripts de la página (usa el() y boton() de app.js).
document.addEventListener('DOMContentLoaded', () => { nubeIniciar(); });
