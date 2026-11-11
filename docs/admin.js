'use strict';
/* Pestaña «Piloto» de Mi perfil (solo administración): quién está dado de alta, si ha
   entrado y cuánto usa RADAR, y el formulario para dar de alta a una persona con su
   perfil (.json) y su CV original. Los permisos los comprueba la base de datos. */

const nubeFecha = (t) => (t ? new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—');
const nubeCarpeta = (correo) => correo.trim().toLowerCase();

function seccionPiloto(tarjeta) {
  if (!RADAR_NUBE || !NUBE_ADMIN) return;

  // ---------- Personas del piloto ----------
  const lista = tarjeta('Personas del piloto', 'Quién está dado de alta, si ya ha entrado y cuánto usa RADAR. No se ven sus notas ni sus textos.');
  const cuerpo = el('div', 'adm-tabla'); cuerpo.append(el('p', 'nota', 'Cargando…'));
  lista.append(cuerpo);
  const pintarLista = async () => {
    const { data, error } = await RADAR_NUBE.rpc('resumen_piloto');
    if (error) { cuerpo.replaceChildren(el('p', 'nota', 'No se ha podido cargar la lista: ' + error.message)); return; }
    if (!data.length) { cuerpo.replaceChildren(el('p', 'nota', 'Aún no hay nadie dado de alta.')); return; }
    const t = el('table');
    const cab = el('tr');
    ['Persona', 'Alta', 'Ha entrado', 'Último uso', 'Guardadas', 'Candidaturas', 'CV'].forEach((x) => cab.append(el('th', null, x)));
    t.append(cab);
    const { data: altas } = await RADAR_NUBE.from('altas').select('email, cv_ruta');
    const rutas = Object.fromEntries((altas || []).map((a) => [a.email, a.cv_ruta]));
    data.forEach((r) => {
      const tr = el('tr');
      const quien = el('td'); quien.append(el('b', null, r.nombre || '—'), el('small', null, r.email));
      const cv = el('td');
      if (rutas[r.email]) cv.append(boton('Abrir', 'enlace', () => nubeAbrirCV(rutas[r.email])));
      else cv.textContent = '—';
      tr.append(quien, el('td', null, nubeFecha(r.alta)), el('td', null, r.con_cuenta ? (r.consentimiento ? 'Sí' : 'Sí, sin aceptar privacidad') : 'Todavía no'),
        el('td', null, nubeFecha(r.ultimo_uso)), el('td', 'num', String(r.guardadas)), el('td', 'num', String(r.candidaturas)), cv);
      t.append(tr);
    });
    cuerpo.replaceChildren(t);
  };
  pintarLista();

  // ---------- Dar de alta ----------
  const alta = tarjeta('Dar de alta o actualizar a una persona', 'Sube su perfil de RADAR (.json, el que sale de validar_perfil.py) y su CV original. Si ya estaba dada de alta, se actualiza y lo verá la próxima vez que entre.');
  const f = el('form', 'adm-form');
  const campo = (txt, input) => { const l = el('label'); l.append(el('span', null, txt), input); return l; };
  const correo = el('input'); correo.type = 'email'; correo.required = true; correo.id = 'adm-correo'; correo.placeholder = 'correo con el que entrará';
  const perfil = el('input'); perfil.type = 'file'; perfil.accept = '.json,application/json'; perfil.required = true; perfil.id = 'adm-perfil';
  const cv = el('input'); cv.type = 'file'; cv.accept = '.pdf,.doc,.docx'; cv.id = 'adm-cv';
  const enviar = el('button', 'btn', 'Guardar alta'); enviar.type = 'submit';
  const msg = el('div', 'nube-msg'); msg.setAttribute('role', 'status');
  f.append(campo('Correo', correo), campo('Perfil (.json)', perfil), campo('CV original (PDF o Word, opcional)', cv), enviar, msg);
  alta.append(f);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = nubeCarpeta(correo.value);
    let datos;
    try { datos = JSON.parse(await perfil.files[0].text()); } catch (x) { msg.textContent = 'El archivo de perfil no es un JSON válido.'; return; }
    const errores = validarPerfil(datos);
    if (errores.length) { msg.replaceChildren(el('b', null, 'El perfil tiene errores:'), ...errores.map((x) => el('p', null, x))); return; }
    if (datos.ejemplo) { msg.textContent = 'Ese es el perfil de ejemplo ficticio: sube el de la persona.'; return; }
    enviar.disabled = true; msg.textContent = 'Guardando…';
    let cvRuta;
    if (cv.files[0]) {
      const nombre = cv.files[0].name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
      cvRuta = `${email}/${nombre}`;
      const sub = await RADAR_NUBE.storage.from('cv').upload(cvRuta, cv.files[0], { upsert: true, contentType: cv.files[0].type || undefined });
      if (sub.error) { enviar.disabled = false; msg.textContent = 'No se ha podido subir el CV: ' + sub.error.message; return; }
    }
    const fila = { email, datos };
    if (cvRuta) fila.cv_ruta = cvRuta;
    const { error } = await RADAR_NUBE.from('altas').upsert(fila, { onConflict: 'email' });
    enviar.disabled = false;
    if (error) { msg.textContent = 'No se ha podido guardar el alta: ' + error.message; return; }
    msg.replaceChildren(el('b', null, `✓ ${datos.nombre} dado/a de alta con ${email}.`),
      el('p', null, 'Si es una persona nueva, invítala en Supabase: Authentication → Users → Add user → Send invitation, con este mismo correo. Después mándale el enlace de RADAR y dile que entre con su correo.'));
    f.reset();
    pintarLista();
  });
}

// Cuando se sabe si la cuenta es de administración, Mi perfil se repinta para mostrar «Piloto».
document.addEventListener('radar-nube-lista', () => { if (NUBE_ADMIN && location.hash === '#perfil' && typeof pintar === 'function') pintar(); });
