'use strict';
/* RADAR como app (instalable) y «Primeros pasos» para quien entra con su perfil. */

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

let RADAR_INSTALAR = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); RADAR_INSTALAR = e; document.documentElement.classList.add('puede-instalar'); });
window.addEventListener('appinstalled', () => { RADAR_INSTALAR = null; document.documentElement.classList.remove('puede-instalar'); });
const enApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* Botón «Instalar RADAR»: usa el aviso del navegador si existe; si no, explica cómo hacerlo. */
function botonInstalar(cls) {
  const b = boton('Instalar RADAR en este dispositivo', cls || 'btn sec', async () => {
    if (RADAR_INSTALAR) { RADAR_INSTALAR.prompt(); await RADAR_INSTALAR.userChoice; RADAR_INSTALAR = null; return; }
    const ayuda = esIOS()
      ? 'En el iPhone o iPad: abre RADAR en Safari, pulsa el botón Compartir (□↑) y elige «Añadir a pantalla de inicio».'
      : 'En el móvil: abre el menú del navegador (⋮) y elige «Instalar aplicación» o «Añadir a pantalla de inicio». En el ordenador: busca el icono de instalar en la barra de direcciones.';
    alert(ayuda);
  });
  if (enApp()) { b.disabled = true; b.textContent = '✓ Ya usas RADAR como app'; }
  return b;
}

/* Tarjeta de bienvenida dentro de Hoy, hasta que la persona la cierre. */
function primerosPasos() {
  let cerrada = false;
  try { cerrada = localStorage.getItem('radar-primeros-pasos') === 'ok'; } catch (e) { cerrada = true; }
  if (!USUARIO || cerrada) return null;
  const s = el('section', 'pp');
  const cab = el('div', 'pp-cab');
  cab.append(el('h3', null, USUARIO.ejemplo ? 'Así funciona RADAR (perfil de ejemplo)' : `Te damos la bienvenida a tu RADAR, ${NOMBRE_CORTO}`),
    boton('Entendido', 'enlace', () => { try { localStorage.setItem('radar-primeros-pasos', 'ok'); } catch (e) { /* sin almacenamiento */ } s.remove(); }));
  s.append(cab, el('p', 'nota', 'Cada mañana RADAR revisa ofertas, oposiciones y oportunidades y las ordena para ti. Cuatro pasos para empezar:'));
  const ol = el('ol', 'pp-pasos');
  const paso = (titulo, texto, accion) => { const li = el('li'); const t = el('div'); t.append(el('b', null, titulo), el('span', null, texto)); li.append(t); if (accion) li.append(accion); ol.append(li); };
  paso('Mira tu mejor oportunidad', 'Pulsa «Ver oportunidad»: verás por qué encaja, qué comprobar, tu CV adaptado y la carta.', null);
  paso('Ajusta tu perfil', 'Zonas, modalidad, salario y roles. Cada cambio reordena tus oportunidades.', boton('Ir a Mi perfil', 'btn sec mini', () => { location.hash = 'perfil'; }));
  paso('Decide con un toque', '«Me interesa», guardar o «No me interesa»: RADAR aprende de lo que eliges.', boton('Revisar una a una', 'btn sec mini', () => { location.hash = 'descubrir'; }));
  paso('Llévalo en el móvil', 'Instálalo como app para abrirlo con un toque cada mañana.', botonInstalar('btn sec mini'));
  s.append(ol);
  return s;
}
