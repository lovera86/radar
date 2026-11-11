'use strict';
/* Análisis de convocatorias de empleo público.
   Lee el texto oficial (el extracto del BOE que guarda RADAR o las bases que pega la
   usuaria) y saca solo lo que dice: plazo de solicitudes, fecha o fecha mínima del
   examen, requisitos, pruebas y temario. Las recomendaciones de preparación se marcan
   como orientativas. Todo se calcula en el navegador. */

ST.convocatorias = ST.convocatorias || {};

const CONV_NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40 };
const CONV_MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
/* Festivos nacionales fijos y de Asturias. Sin festivos trasladados ni locales: la fecha calculada es la más temprana posible. */
const CONV_FESTIVOS = new Set(['2026-01-01', '2026-01-06', '2026-04-02', '2026-04-03', '2026-05-01', '2026-08-15', '2026-09-08', '2026-10-12', '2026-12-08', '2026-12-25',
  '2027-01-01', '2027-01-06', '2027-03-25', '2027-03-26', '2027-05-01', '2027-09-08', '2027-10-12', '2027-11-01', '2027-12-06', '2027-12-08', '2027-12-25']);
const CONV_BOLETINES = [['BOE', /bolet[ií]n oficial del estado|\bboe\b/i], ['BOPA', /principado de asturias|\bbopa\b/i], ['BOC', /bolet[ií]n oficial de cantabria|\bboc\b/i],
  ['DOG', /diario oficial de galicia|\bdog\b/i], ['BOCYL', /castilla y le[oó]n|\bbocyl\b/i]];
const convNum = (s) => (/^\d+$/.test(s) ? +s : CONV_NUM[norm(s)] || null);
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaDe = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const convHabil = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !CONV_FESTIVOS.has(isoDe(d));

function convFin(baseIso, n, tipo) {
  const d = fechaDe(baseIso);
  if (tipo === 'mes') { d.setMonth(d.getMonth() + n); while (!convHabil(d)) d.setDate(d.getDate() + 1); return isoDe(d); }
  if (tipo === 'naturales') { d.setDate(d.getDate() + n); while (!convHabil(d)) d.setDate(d.getDate() + 1); return isoDe(d); }
  let c = 0;
  while (c < n) { d.setDate(d.getDate() + 1); if (convHabil(d)) c++; }
  return isoDe(d);
}

const fraseCon = (texto, idx, max = 420) => {
  const ini = Math.max(texto.lastIndexOf('.', idx) + 1, idx - 200);
  let fin = texto.indexOf('.', idx + 10);
  if (fin < 0 || fin - ini > max) fin = Math.min(texto.length, ini + max);
  return texto.slice(ini, fin + 1).trim();
};

/* Tramo del texto que corresponde al turno libre, si las bases distinguen turnos. */
function tramoLibre(texto) {
  const m = texto.match(/\n\s*Turno (?:de acceso )?libre\s*\n/i);
  if (!m) return texto;
  const resto = texto.slice(m.index);
  const fin = resto.search(/\n\s*(Fase de concurso|Octava|Novena|D[ée]cima)\b/);
  return fin > 0 ? resto.slice(0, fin) : resto;
}

function analizarConvocatoria(texto, ctx) {
  const plano = texto.replace(/\s+/g, ' ');
  const n = norm(plano);
  const r = { plazo: null, examen: {}, requisitos: {}, pruebas: [], temario: null, concurso: false, completo: false, fuente: ctx.fuenteTexto, texto };

  // Plazo de solicitudes
  const mp = n.match(/plazo de presentacion de (?:las )?(?:solicitudes|instancias)[^.]{0,140}?(\d{1,2}|un|uno|dos|tres|cinco|diez|quince|veinte|treinta) (dias (naturales|habiles)|mes(?:es)?)([^.]{0,280})/);
  if (mp) {
    const dias = convNum(mp[1]);
    const tipo = mp[3] ? (mp[3] === 'habiles' ? 'hábiles' : 'naturales') : 'mes';
    const desde = (CONV_BOLETINES.find(([, rx]) => rx.test(mp[4])) || [''])[0];
    let base = null;
    if (desde && desde === ctx.boletin) base = ctx.publicada;
    else if (desde === 'BOE' && ctx.extractoBoe) base = ctx.extractoBoe.fecha;
    const fin = base && dias ? convFin(base, dias, tipo === 'hábiles' ? 'habiles' : tipo) : ctx.plazo || null;
    const i = n.indexOf(mp[0]);
    r.plazo = { dias, tipo, desde, base, fin, frase: fraseCon(plano, i), aprox: tipo === 'hábiles' };
  } else if (ctx.plazo) r.plazo = { fin: ctx.plazo, frase: '', aprox: true };

  // Examen
  const meses = Object.keys(CONV_MESES).join('|');
  const mf = n.match(new RegExp(`(?:primer(?:a)? (?:ejercicio|prueba)|las pruebas|el examen)[^.]{0,160}?(?:el|dia) (\\d{1,2}) de (${meses}) de (\\d{4})`));
  if (mf) { const f = isoDe(new Date(+mf[3], CONV_MESES[mf[2]], +mf[1])); if (!ctx.publicada || f > ctx.publicada) r.examen.fecha = f; }
  const mm = n.match(/no podra comenzar antes de que transcurran? (\w+) meses?/);
  if (mm && convNum(mm[1]) && ctx.publicada) { const d = fechaDe(ctx.publicada); d.setMonth(d.getMonth() + convNum(mm[1])); r.examen.minimo = isoDe(d); r.examen.minimoMeses = convNum(mm[1]); }
  if (/lista provisional.{0,900}?(lugar, dia y hora|fecha y hora|fecha, hora y lugar)/.test(n)) r.examen.anuncio = 'con la lista provisional de personas admitidas';
  else if (/lista definitiva.{0,600}?(lugar, dia y hora|fecha y hora|fecha, hora y lugar)/.test(n)) r.examen.anuncio = 'con la lista definitiva de personas admitidas';
  else if (/(lugar, dia y hora|fecha, hora y lugar)/.test(n)) r.examen.anuncio = 'en la resolución que se publique tras cerrar el plazo de solicitudes';
  const msub = n.match(/plazo de (\d{1,2}|diez|cinco) dias habiles[^.]{0,120}subsana/);
  if (msub) r.examen.subsanar = convNum(msub[1]);

  // Requisitos y datos generales
  const mpl = n.match(/(?:provision|cobertura) de (\d+|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) plazas?/) || n.match(/proveer:? (una|dos|tres|\d+) plazas?/);
  if (mpl) r.requisitos.plazas = convNum(mpl[1]);
  const mg = plano.match(/Subgrupo\s+(A1|A2|C1|C2)|Grupo\s+(A1|A2|C1|C2|B)\b/i);
  if (mg) r.requisitos.grupo = (mg[1] || mg[2]).toUpperCase();
  const ms = n.match(/sistema de (concurso-oposicion|oposicion|concurso)(?=[^.]{0,60}(?:acceso libre|turno libre))/) || n.match(/sistema de (concurso-oposicion|oposicion|concurso de meritos|concurso)/);
  if (ms) r.requisitos.sistema = { 'concurso-oposicion': 'concurso-oposición', oposicion: 'oposición', concurso: 'concurso de méritos', 'concurso de meritos': 'concurso de méritos' }[ms[1]];
  r.concurso = /fase de concurso/.test(n) || r.requisitos.sistema === 'concurso-oposición';
  const mt = plano.match(/Titulaci[oó]n[^:.]{0,60}:\s*([^.]{10,320}\.)/i) || plano.match(/(estar en posesi[oó]n[^.]{0,80}t[ií]tulo[^.]{10,280}\.)/i);
  if (mt) {
    r.requisitos.titulacion = mt[1].trim();
    const tn = norm(mt[1]);
    const generica = /titulo de grado(?! en)|titulo universitario de grado(?! en)|grado universitario|diplomatura(?! en)|titulacion universitaria|ingenieria tecnica(?! de obras| agricola| forestal| de minas| naval| de telecom| en )|ingeniero tecnico(?! de obras| agricola| forestal| de minas| naval| de telecom| en )/;
    const titulos = (CV.formacion || []).map((f) => f.t);
    const propio = titulos.find((x) => { const w = norm(x).replace(/\(.*?\)/g, '').split(/\s+/).filter((y) => y.length > 4); return w.length && w.every((y) => tn.includes(y)); });
    const universitario = /grado|licenciatura|diplomatura|ingenier|arquitect|master|máster|doctorado/i.test(titulos.join(' '));
    if (propio) r.requisitos.cumple = ['si', `Piden ${propio}: figura en tu CV. Revisa si exigen una especialidad concreta.`];
    else if (generica.test(tn) && universitario) r.requisitos.cumple = ['si', `Tu titulación (${titulos[0] || 'universitaria'}) cumple el requisito.`];
    else if (/obras publicas|ingenieria civil|arquitect|psicolog|medicina|enfermer|derecho|trabajo social|magisterio/.test(tn)) r.requisitos.cumple = ['no', 'Piden una titulación concreta que no figura en tu CV.'];
    else r.requisitos.cumple = ['?', 'Compruébalo en las bases: no queda claro si tu titulación sirve.'];
  }
  const mtasa = plano.match(/(?:tasa|derechos de examen)[^.]{0,120}?(\d{1,3}(?:,\d{1,2})?)\s*(?:euros|€)/i);
  if (mtasa) r.requisitos.tasa = mtasa[1] + ' €';
  if (/exclusivamente por medios telematicos|sede electronica|presentacion telematica|via telematica/.test(n)) r.requisitos.presentacion = 'Por internet (sede electrónica)';
  const murl = plano.slice(Math.max(0, plano.search(/solicitud/i))).match(/https?:\/\/[^\s)»"]+/);
  if (murl) r.requisitos.url = murl[0].replace(/[.,;]$/, '');

  // Pruebas (turno libre si lo hay)
  const tramo = tramoLibre(texto).replace(/\s+/g, ' ');
  const rxP = /(?:\b[a-e]\)\s*)?(Primer[oa]?|Segund[oa]|Tercer[oa]?|Cuart[oa]|Quint[oa])\s+(prueba|ejercicio)\s*(?:[.:]\s*[—–-]*|[—–-]+)\s*(?=[A-ZÁÉÍÓÚ(«"])|(?:Prueba|Ejercicio)\s+(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa])\s*[.:—–-]+\s*/g;
  const marcas = [...tramo.matchAll(rxP)];
  const vistos = new Set();
  marcas.forEach((m, i) => {
    const ord = m[1] || m[3];
    const tipoP = m[2] || (/^ejercicio/i.test(m[0]) ? 'ejercicio' : 'prueba');
    const nombre = (ord.charAt(0).toUpperCase() + ord.slice(1).toLowerCase()) + ' ' + tipoP.toLowerCase();
    if (vistos.has(nombre)) return;
    vistos.add(nombre);
    const cuerpo = tramo.slice(m.index + m[0].length, marcas[i + 1] ? marcas[i + 1].index : m.index + 2500);
    const c = norm(cuerpo);
    const p = { nombre, tipo: [], detalle: [] };
    const mq = c.match(/cuestionario de (\d+) preguntas/) || c.match(/(\d+) preguntas/);
    if (/cuestionario|tipo test|test|respuestas alternativas/.test(c)) p.tipo.push(mq ? `test de ${mq[1]} preguntas` : 'test');
    if (/supuesto practico|caso practico|supuestos practicos/.test(c)) p.tipo.push('supuesto práctico');
    if (/redaccion de un informe|informe/.test(c) && /supuesto/.test(c)) p.tipo.push('informe');
    if (/desarrollar por escrito|exponer por escrito|desarrollo de (\w+ )?temas?/.test(c)) p.tipo.push('desarrollo de temas');
    if (/idioma|ingles|traduccion/.test(c)) p.tipo.push('idioma');
    if (/entrevista/.test(c)) p.tipo.push('entrevista');
    if (/leido publicamente|lectura publica|exposicion oral|oralmente/.test(c)) p.detalle.push('lectura o exposición ante el tribunal');
    const mmin = c.match(/superior a (\d+) minutos/) || c.match(/(\d+) minutos/);
    const mh = c.match(/superior a (\d+|una|dos|tres|cuatro) horas?/) || c.match(/(\d+|una|dos|tres|cuatro) horas?/);
    if (mmin) p.detalle.push(`hasta ${mmin[1]} minutos`); else if (mh) p.detalle.push(`hasta ${convNum(mh[1]) || mh[1]} h`);
    const mpen = c.match(/penalizara con (?:la|el) (\w+ parte|\d+ ?%)/);
    if (mpen) p.detalle.push(`los errores restan ${mpen[1]}`);
    if (/libros, textos|textos legales|apuntes/.test(c) && /podra hacer uso|podran utilizar|podra consultar/.test(c)) p.detalle.push('puedes llevar libros o apuntes en papel');
    const mpt = c.match(/de 0 a (\d+) puntos/);
    if (mpt) p.detalle.push(`se puntúa de 0 a ${mpt[1]}`);
    if (!p.tipo.length) p.tipo.push('ver bases');
    r.pruebas.push(p);
  });

  // Temario (anexo del turno libre si lo hay)
  const ia = texto.search(/\n\s*Anexo\s+[IVX]+\s*\n\s*(?:PROGRAMA|TEMARIO)[^\n]*LIBRE/i);
  const ib = ia >= 0 ? ia : texto.search(/\n\s*(Anexo\s+[IVX]+\s*\n\s*)?(?:PROGRAMA|TEMARIO)\b/i);
  if (ib >= 0) {
    const resto = texto.slice(ib + 5);
    const fin = resto.search(/\n\s*Anexo\s+[IVX]+\s*\n/i);
    const prog = fin > 0 ? resto.slice(0, fin) : resto.slice(0, 60000);
    const temas = (prog.match(/\n\s*(?:Tema\s+)?\d{1,3}\s*[.:]?\s*[—–-]+\s*\S|\n\s*Tema\s+\d{1,3}[.:]/g) || []).length;
    const bloques = [...prog.matchAll(/\n\s*([IVX]{1,4})\s*\.?\s*[—–-]+\s*([^\n]{3,90})/g)].map((m) => `${m[1]}. ${m[2].trim().replace(/\.$/, '')}`);
    if (temas) r.temario = { temas, bloques, texto: prog.replace(/^[^\n]*\n/, '').trim() };
  }
  if (!r.temario) { const mt2 = n.match(/(\d{2,3}) temas/); if (mt2) r.temario = { temas: +mt2[1], bloques: [] }; }
  r.completo = r.pruebas.length > 0 || Boolean(r.temario);
  return r;
}

/* ---------- recomendaciones (orientativas) ---------- */
function planPreparacion(a, o) {
  const pasos = [];
  const hoy = hoyISO();
  if (a.plazo?.fin && a.plazo.fin >= hoy) pasos.push(`Preséntate antes del ${fecha(a.plazo.fin)}${a.requisitos.tasa ? ` y paga la tasa (${a.requisitos.tasa})` : ''}. Guarda el justificante.`);
  else if (a.plazo?.fin) pasos.push(`El plazo de solicitudes terminó el ${fecha(a.plazo.fin)}. Si no te presentaste, guarda estas bases: la próxima convocatoria suele repetir pruebas y temario.`);
  else pasos.push('Vigila la publicación del extracto en el BOE: desde ese día empieza a contar el plazo de solicitudes.');
  if (a.requisitos.presentacion) pasos.push('La solicitud es por internet: ten a mano certificado digital o Cl@ve.');
  if (a.requisitos.cumple?.[0] === 'no') pasos.unshift('Antes de nada: la titulación que piden no figura en tu CV. Comprueba si existe alguna equivalencia antes de invertir tiempo.');
  const finEstudio = a.examen.fecha || a.examen.minimo;
  if (a.temario?.temas) {
    if (finEstudio && finEstudio > hoy) {
      const semanas = Math.max(1, Math.floor((fechaDe(finEstudio) - fechaDe(hoy)) / (7 * 864e5)));
      const utiles = Math.max(1, semanas - 2);
      const porSemana = Math.ceil(a.temario.temas / utiles);
      pasos.push(`Tienes ${semanas} semanas hasta ${a.examen.fecha ? 'el examen' : 'la fecha más temprana posible del examen'}: ${porSemana === 1 ? 'un tema' : 'unos ' + porSemana + ' temas'} por semana para cubrir los ${a.temario.temas}, y deja las 2 últimas semanas para repasar y hacer simulacros.`);
    } else pasos.push(`Reparte los ${a.temario.temas} temas en un calendario semanal y reserva las últimas semanas para repaso y simulacros.`);
    pasos.push('Descarga el temario (botón de «Pruebas y temario») y úsalo como índice: marca cada tema al estudiarlo y al repasarlo.');
  }
  a.pruebas.forEach((p) => {
    const t = p.tipo.join(' + ');
    if (/test/.test(t)) pasos.push(`${p.nombre} (${t}): haz tests por temas desde la primera semana y simulacros completos con el tiempo real${p.detalle.find((d) => /restan/.test(d)) ? '; como los errores restan, no contestes al azar' : ''}.`);
    if (/supuesto/.test(t)) pasos.push(`${p.nombre} (${t}): practica con supuestos de convocatorias anteriores del mismo cuerpo${p.detalle.some((d) => /libros/.test(d)) ? ' y prepara un índice de la legislación que llevarás en papel' : ''}.`);
    if (/desarrollo/.test(t)) pasos.push(`${p.nombre} (desarrollo): haz esquemas de cada tema y redacta con el tiempo cronometrado.`);
    if (/idioma/.test(t)) pasos.push(`${p.nombre} (idioma): ${idiomaCV('ingl') ? 'en tu CV figura «' + idiomaCV('ingl') + '»; repasa el formato de la prueba' : 'prepara el idioma con exámenes de otras convocatorias'}.`);
    if (p.detalle.some((d) => /lectura/.test(d))) pasos.push(`${p.nombre}: se lee ante el tribunal; ensaya la lectura en voz alta y las preguntas posteriores.`);
  });
  if (a.concurso) pasos.push(`Hay fase de concurso: reúne ya los certificados de experiencia (vida laboral y contratos) y de formación (${(CV.formacion || []).slice(0, 2).map((f) => f.t).join(', ') || 'títulos y cursos'}).`);
  const prog = norm((a.temario?.bloques || []).join(' ') + ' ' + (a.texto || o.descripcion || '').slice(0, 120000));
  const fuertes = [];
  if (/contratacion|contratos del sector publico/.test(prog)) fuertes.push('contratación pública (figura en tu CV y la sigues en RADAR)');
  if (/gestion de proyectos|direccion de proyectos|planificacion/.test(prog)) fuertes.push('gestión de proyectos' + (/project management|gestion de proyectos|capm|pmp/.test(CV_TEXTO()) ? ' (figura en tu formación)' : ''));
  if (/presupuest|economic|gasto publico/.test(prog)) fuertes.push('presupuestos y control de costes');
  if (/administracion electronica|transformacion digital|proteccion de datos|tecnologias de la informacion/.test(prog)) fuertes.push('transformación digital');
  if (fuertes.length) pasos.push('Partes con ventaja en: ' + fuertes.join(', ') + '. Dedica más tiempo a los bloques de derecho administrativo.');
  if (a.examen.subsanar) pasos.push(`Cuando salga la lista provisional de admitidos, compruébala: tendrás ${a.examen.subsanar} días hábiles para corregir errores.`);
  pasos.push('Busca exámenes de convocatorias anteriores en la web del organismo convocante: son la mejor guía del nivel.');
  return pasos;
}

/* ---------- panel ---------- */
function ctxConvocatoria(o) {
  const fuente = o.fuentes[0]?.nombre || '';
  const boletin = /^BOPA/.test(fuente) ? 'BOPA' : /^BOE/.test(fuente) ? 'BOE' : /Cantabria/.test(fuente) ? 'BOC' : /Galicia/.test(fuente) ? 'DOG' : /Castilla/.test(fuente) ? 'BOCYL' : '';
  return { publicada: o.fechas.publicada, boletin, extractoBoe: o.extracto_boe, plazo: o.fechas.plazo };
}

function analisisDe(o) {
  const g = ST.convocatorias[o.id];
  const base = [g?.texto, o.descripcion, o.extracto_boe?.texto].filter(Boolean).join('\n\n');
  if (!base.trim()) return null;
  const a = analizarConvocatoria(base, { ...ctxConvocatoria(o), fuenteTexto: g ? 'las bases que has pegado' : o.extracto_boe ? 'el extracto publicado en el BOE' : 'el texto oficial del BOE' });
  if (a.plazo?.fin && !o.fechas.plazo) o.fechas.plazo = a.plazo.fin;
  return a;
}

function quedan(iso) {
  const d = -dias(iso);
  return d < 0 ? 'cerrado' : d === 0 ? 'termina hoy' : `quedan ${d} día${d === 1 ? '' : 's'}`;
}

function pintarConvocatoria(o) {
  const cont = $('#cv-cuerpo');
  cont.replaceChildren();
  cont.append(el('p', 'eyebrow', 'Análisis de la convocatoria'), el('h2', null, o.titulo));
  cont.querySelector('h2').id = 'cv-t';
  cont.append(el('p', 'ficha-sub', [o.organizacion.nombre, o.fuentes[0]?.nombre].filter(Boolean).join(' · ')));
  const a = analisisDe(o);
  if (a) {
    const fechas = el('div', 'cv-fechas');
    const caja = (ico, titulo, valor, sub, cls) => { const d = el('div', 'cv-caja ' + (cls || '')); d.append(el('span', 'cv-ico', ico), el('small', null, titulo), el('b', null, valor)); if (sub) d.append(el('p', null, sub)); return d; };
    if (a.plazo?.fin) fechas.append(caja('📝', 'Inscripción hasta', fecha(a.plazo.fin), [quedan(a.plazo.fin), a.plazo.aprox ? 'fecha más temprana posible (sin festivos locales): confírmala' : 'calculado según las bases'].join(' · '), a.plazo.fin < hoyISO() ? 'cerrado' : 'turq'));
    else if (a.plazo) fechas.append(caja('📝', 'Inscripción', `${a.plazo.dias} días ${a.plazo.tipo}`, a.plazo.desde ? `desde el día siguiente a la publicación en el ${a.plazo.desde}${a.plazo.desde === 'BOE' ? ' (aún no localizada)' : ''}` : '', 'turq'));
    else fechas.append(caja('📝', 'Inscripción', 'Sin datos', 'El texto disponible no indica el plazo.', ''));
    if (a.examen.fecha) fechas.append(caja('🗓', 'Examen', fecha(a.examen.fecha), 'fecha indicada en las bases', 'rosa'));
    else if (a.examen.minimo) fechas.append(caja('🗓', 'Examen', 'No antes del ' + fecha(a.examen.minimo), `las bases fijan un mínimo de ${a.examen.minimoMeses} mes${a.examen.minimoMeses === 1 ? '' : 'es'} desde la publicación${a.examen.anuncio ? '; la fecha exacta se publicará ' + a.examen.anuncio : ''}`, 'rosa'));
    else fechas.append(caja('🗓', 'Examen', 'Sin fecha todavía', a.examen.anuncio ? 'Se publicará ' + a.examen.anuncio + '.' : 'Las bases completas suelen indicar cuándo se anuncia.', 'rosa'));
    cont.append(fechas);
    const evCal = typeof eventosDe === 'function' ? eventosDe(o).filter((e) => /plazo|examen/.test(e.tipo)) : [];
    if (evCal.length) { const c = el('div', 'cal-sec cal-conv'); evCal.forEach((e) => c.append(filaEvento(e))); cont.append(c); }

    const req = el('section', 'cv-sec');
    req.append(el('h3', null, 'Qué piden'));
    const dl = el('dl', 'condiciones');
    const fila = (k, v) => { if (v) { dl.append(el('dt', null, k)); const dd = el('dd'); if (v instanceof Node) dd.append(v); else dd.append(String(v)); dl.append(dd); } };
    fila('Plazas', a.requisitos.plazas); fila('Grupo', a.requisitos.grupo); fila('Sistema', a.requisitos.sistema);
    fila('Titulación', a.requisitos.titulacion); fila('Tasa', a.requisitos.tasa); fila('Solicitud', a.requisitos.presentacion);
    if (a.requisitos.url) fila('Dónde', enlace(a.requisitos.url, a.requisitos.url.replace(/^https?:\/\//, '') + ' ↗', 'enlace'));
    if (a.plazo?.frase) fila('Plazo (texto oficial)', '«' + a.plazo.frase + '»');
    req.append(dl);
    if (a.requisitos.cumple) req.append(el('p', 'cv-cumple c-' + (a.requisitos.cumple[0] === 'si' ? 'si' : a.requisitos.cumple[0] === 'no' ? 'no' : 'duda'), a.requisitos.cumple[1]));
    cont.append(req);

    if (a.pruebas.length || a.temario) {
      const pr = el('section', 'cv-sec');
      pr.append(el('h3', null, 'Pruebas y temario'));
      if (a.pruebas.length) {
        const ol = el('ol', 'cv-pruebas');
        a.pruebas.forEach((p) => { const li = el('li'); li.append(el('b', null, p.nombre + ': ' + p.tipo.join(' + ')), el('small', null, p.detalle.join(' · '))); ol.append(li); });
        pr.append(ol);
      }
      if (a.temario) {
        pr.append(el('p', null, `Temario: ${a.temario.temas} temas${a.temario.bloques.length ? ' en ' + a.temario.bloques.length + ' bloques' : ''}.`));
        const dl = el('div', 'acciones cv-temario');
        if (a.temario.texto) dl.append(boton('Descargar temario (PDF)', 'btn mini', () => imprimirTemario(o, a)));
        const of = enlaceOficial(o);
        if (of) dl.append(enlace(of.url, of.texto, 'btn sec mini'));
        pr.append(dl);
        if (!a.temario.texto) pr.append(el('p', 'nota', 'El temario completo está en el anexo de las bases oficiales. Si pegas las bases con el anexo, RADAR te prepara un PDF solo con los temas.'));
        if (a.temario.bloques.length) { const ul = el('ul', 'cv-bloques'); a.temario.bloques.forEach((b) => ul.append(el('li', null, b))); pr.append(ul); }
      } else {
        const of = enlaceOficial(o);
        pr.append(el('p', 'nota', 'No se ha encontrado el temario en este texto: está en el anexo de las bases oficiales.'));
        if (of) { const dl = el('div', 'acciones cv-temario'); dl.append(enlace(of.url, of.texto, 'btn sec mini')); pr.append(dl); }
      }
      cont.append(pr);
    }

    const plan = el('section', 'cv-sec cv-plan');
    plan.append(el('h3', null, 'Cómo prepararte'), el('p', 'nota', 'Recomendaciones de RADAR a partir de estas bases y de tu perfil: son orientativas.'));
    const ol = el('ol'); planPreparacion(a, o).forEach((t) => ol.append(el('li', null, t)));
    plan.append(ol);
    cont.append(plan);
    cont.append(el('p', 'nota', `Analizado a partir de ${a.fuente}. Comprueba siempre las fechas en el texto oficial.`));
  }

  // Pegar las bases si falta información
  const falta = !a || !a.completo;
  const pegar = el('details', 'cv-pegar');
  pegar.open = falta;
  pegar.append(el('summary', null, falta ? 'Completa el análisis con las bases' : 'Actualizar con otro texto de las bases'));
  pegar.append(el('p', 'nota', falta ? 'RADAR solo tiene ' + (a ? 'el extracto del anuncio' : 'el título') + '. Abre la convocatoria, copia el texto completo de las bases (incluido el temario) y pégalo aquí para ver pruebas, temario y el plan de preparación.' : 'Si se publica una corrección o tienes una versión más completa, pégala aquí.'));
  const url = o.accion?.url || o.fuentes[0]?.url;
  if (url) pegar.append(enlace(url, 'Abrir la convocatoria oficial ↗', 'btn sec mini'));
  const area = el('textarea', 'nota-area'); area.rows = 6; area.placeholder = 'Pega aquí el texto de las bases…';
  area.value = ST.convocatorias[o.id]?.texto || '';
  const acc = el('div', 'acciones');
  acc.append(boton('Analizar estas bases', 'btn mini', () => {
    const v = area.value.trim();
    if (v.length < 300) { area.focus(); area.setCustomValidity?.(''); return; }
    instantanea(o.id);
    ST.convocatorias[o.id] = { texto: v.slice(0, 200000), f: new Date().toISOString() };
    guardarST(); delete o._p; pintarConvocatoria(o); pintar();
    $('#convocatoria').scrollTop = 0;
  }));
  if (ST.convocatorias[o.id]) acc.append(boton('Borrar las bases pegadas', 'enlace quitar', () => { delete ST.convocatorias[o.id]; guardarST(); o.fechas.plazo = D.porId.get(o.id)?.fechas.plazo; pintarConvocatoria(o); }));
  pegar.append(area, acc);
  cont.append(pegar);

  const pie = el('div', 'acciones cv-pie');
  const fav = boton(ST.fav[o.id] ? '♥ En Seguimiento' : '♡ Guardar en Seguimiento', 'btn sec', () => { toggleFav(o.id); fav.textContent = ST.fav[o.id] ? '♥ En Seguimiento' : '♡ Guardar en Seguimiento'; pintar(); });
  pie.append(fav, boton('Volver a la ficha', 'enlace', () => { $('#convocatoria').close(); abrirFicha(o.id); }));
  cont.append(pie);
}

function abrirConvocatoria(id) {
  const o = D.porId.get(id);
  if (!o) return;
  if ($('#ficha').open) $('#ficha').close();
  pintarConvocatoria(o);
  const d = $('#convocatoria');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

/* Documento oficial con las bases (el temario va en un anexo). Solo se enlaza. */
function enlaceOficial(o) {
  const m = (o.origen?.clave || '').match(/^bopa-(\d{4}-\d{5})$/);
  if (m && o.fechas.publicada) {
    const [y, mo, d] = o.fechas.publicada.split('-');
    return { url: `https://miprincipado.asturias.es/bopa/${y}/${mo}/${d}/${m[1]}.pdf`, texto: 'Bases y temario oficiales (BOPA, PDF) ↗' };
  }
  const u = o.accion?.url || o.fuentes[0]?.url;
  return u ? { url: u, texto: 'Bases y temario oficiales ↗' } : null;
}

function imprimirTemario(o, a) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc2 = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lineas = a.temario.texto.split('\n').map((x) => x.trim()).filter((x) => x && !/^(temario|programa)\b[^.]{0,40}$/i.test(x));
  const html = lineas.map((l) => {
    if (/^[IVX]{1,4}\s*\.?\s*[—–-]+/.test(l)) return `<h2>${esc2(l.replace(/\s*[—–-]+\s*/, '. '))}</h2>`;
    const t = l.match(/^(?:Tema\s+)?(\d{1,3})\s*[.:]?\s*[—–-]*\s*(.+)$/i);
    if (t) return `<p class="tema"><span class="c">☐</span><b>${t[1]}.</b> ${esc2(t[2])}</p>`;
    return `<p class="nota">${esc2(l)}</p>`;
  }).join('');
  const of = enlaceOficial(o);
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Temario - ${esc2(o.titulo)}</title>
<style>@page{size:A4;margin:16mm 16mm}body{font:10.5pt/1.45 "IBM Plex Sans","Segoe UI",sans-serif;color:#18232d;max-width:178mm;margin:0 auto}
h1{font-size:15pt;margin:0 0 2mm}.sub{color:#5d6a75;margin:0 0 6mm;font-size:9.5pt}h2{font-size:11.5pt;margin:6mm 0 2mm;padding-bottom:1mm;border-bottom:1.5px solid #0e9f97;color:#0b2545}
.tema{margin:0 0 1.6mm;padding-left:7mm;text-indent:-7mm;break-inside:avoid}.c{display:inline-block;width:5mm;color:#c2255c}.nota{color:#5d6a75;font-size:9pt;margin:0 0 2mm}</style></head><body>
<h1>Temario · ${esc2(o.titulo)}</h1>
<p class="sub">${esc2([o.organizacion.nombre, a.temario.temas + ' temas', 'extraído de las bases que pegaste en RADAR'].filter(Boolean).join(' · '))}${of ? '<br>Texto oficial: ' + esc2(of.url) : ''}</p>
${html}
<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* Resumen corto para la ficha. */
function resumenConvocatoria(o) {
  const a = analisisDe(o);
  const box = el('div', 'cv-resumen');
  const linea = (ico, txt) => { const p = el('p'); p.append(el('span', null, ico + ' '), txt); return p; };
  if (a?.plazo?.fin) box.append(linea('📝', `Inscripción hasta el ${fecha(a.plazo.fin)} (${quedan(a.plazo.fin)})`));
  else if (a?.plazo?.dias) box.append(linea('📝', `Inscripción: ${a.plazo.dias} días ${a.plazo.tipo}${a.plazo.desde ? ' desde la publicación en el ' + a.plazo.desde : ''}`));
  if (a?.examen.fecha) box.append(linea('🗓', 'Examen el ' + fecha(a.examen.fecha)));
  else if (a?.examen.minimo) box.append(linea('🗓', 'Examen no antes del ' + fecha(a.examen.minimo)));
  if (a?.pruebas.length) box.append(linea('🧩', a.pruebas.map((p) => p.tipo.join(' + ')).join(' · ')));
  if (a?.requisitos.cumple) box.append(linea(a.requisitos.cumple[0] === 'si' ? '✓' : a.requisitos.cumple[0] === 'no' ? '✕' : '?', a.requisitos.cumple[1]));
  if (!box.childNodes.length) box.append(linea('ℹ', 'Analiza la convocatoria para ver plazos, examen y cómo prepararte.'));
  const b = boton('Analizar convocatoria', 'btn mini', () => abrirConvocatoria(o.id));
  box.append(b);
  return box;
}

/* Al cargar: fecha fin calculada a partir de las bases pegadas (para tarjetas y avisos). */
function aplicarPlazosConvocatorias() {
  Object.keys(ST.convocatorias).forEach((id) => { const o = D.porId.get(id); if (o && !o.fechas.plazo) analisisDe(o); });
}
