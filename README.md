# Radar de oportunidades

Web: contratos públicos recién adjudicados en musealización, gemelos digitales,
LiDAR, fotogrametría, batimetría e IA. La empresa que gana un contrato tiene que
ejecutarlo, y ese es el mejor momento para ofrecerse como Project Manager.

## Cómo se actualiza

Cada mañana GitHub ejecuta `.github/workflows/radar.yml`:

1. `radar.py` lee los contratos adjudicados desde la última ejecución en la
   Plataforma de Contratación del Sector Público (estatal y plataformas
   autonómicas agregadas) y los puntúa del 0 al 100 según `config.json`.
2. `exportar.py` deja los últimos 90 días en `docs/data/`.
3. Los datos se guardan en el repositorio y la carpeta `docs/` se publica en
   GitHub Pages.
4. `resumen.py` abre un aviso (issue) con lo nuevo del día; GitHub lo manda por
   correo a la dueña del repositorio.

Además de los adjudicados, el radar guarda las **licitaciones abiertas** que
encajan (`data/abiertas.json`) y marca las que puntúan la experiencia del jefe
de proyecto o del equipo. La web propone las empresas que suelen ganar
contratos parecidos para ofrecerse a ir en su oferta.

Para lanzarlo a mano: pestaña **Actions → Radar diario → Run workflow** (con
«Días hacia atrás» se puede rellenar un periodo).

## Ofertas de empleo

`empleos.py` reúne ofertas de Project Manager, jefa de proyecto, PMO o Product
Owner de los últimos 30 días y las puntúa (más si son en Asturias, en remoto o
de IA, gemelos digitales, BIM, patrimonio…). Ajustes en `config.json → empleo`.

- Sin clave: Tecnoempleo (RSS oficial) y Remotive.
- Con clave gratuita, se activan al añadirla en **Settings → Secrets and
  variables → Actions**: `INFOJOBS_ID` + `INFOJOBS_SECRET` (developer.infojobs.net),
  `JOOBLE_KEY` (es.jooble.org/api/about), `ADZUNA_ID` + `ADZUNA_KEY`
  (developer.adzuna.com).
- **LinkedIn e InfoJobs por alertas de correo** (`alertas_correo.py`): RADAR lee
  en modo solo lectura los correos de alertas de empleo de tu Gmail y pasa cada
  oferta por el filtro de perfil. Secretos: `ALERTAS_EMAIL` y
  `ALERTAS_APP_PASSWORD` (contraseña de aplicación de Google).
- Indeed no permite leer sus ofertas de forma automática: la web enlaza sus
  búsquedas de las últimas 24 horas.

## Empleo público

`publico.py` revisa cada día:

- el BOE (sección II.B, Oposiciones y concursos);
- el BOPA: solo la página pública del sumario diario (Principado y ayuntamientos
  de Asturias), que el robots.txt permite; cada disposición se enlaza, no se descarga;
- el BOC de Cantabria (RSS oficial de «Oposiciones y concursos»), el DOG de Galicia
  (RSS del sumario, sección IV) y el BOCYL (RSS del boletín del día);
- los contratos de técnico en proyectos de la Universidad de Oviedo.

Puntúa más las plazas de Ingeniería Técnica Industrial, los cuerpos de gestión
A2 y lo que es en Asturias; las de otras comunidades restan puntos y solo salen
si encajan mucho. Descarta listas de admitidos, resoluciones de procesos ya
cerrados, nombramientos y puestos de otras profesiones.

## Modelo común (RADAR v2)

`unificar.py` junta todas las fuentes en `docs/data/oportunidades.json`: cada
oportunidad lleva tipo, verificación (vacante publicada u oportunidad potencial
no publicada), datos confirmados o inferidos, fuentes con fecha de consulta y seis
criterios (encaje, necesidad, ubicación, calidad, salario, acceso). La web
calcula la compatibilidad con los pesos del perfil; los criterios sin información
no restan, pero bajan la confianza.

La web tiene cuatro espacios:

- **Hoy**: saludo, tres indicadores (nuevas, encaje alto, acciones pendientes),
  tu mejor oportunidad, próximos movimientos y una selección breve. Las cifras
  secundarias, el insight y el estado de las fuentes van plegados al final.
- **Oportunidades**: Todas / Empleo / Proyectos, con buscador compacto, tres
  atajos visibles y «Más filtros» en un panel lateral. Vistas Lista, Mapa y
  Una a una (tarjetas para deslizar). Los filtros se recuerdan durante la sesión.
- **Empresas**: señales verificables, hipótesis y acción recomendada.
- **Seguimiento**: candidaturas con su siguiente paso, guardadas y colecciones,
  notas y la actividad por canal (plegada).

**Analizar oferta** (botón de la barra): pegas el enlace y el texto de una oferta
de cualquier portal (LinkedIn, Indeed, webs de empresa…). Si el portal lo permite,
la web lee la oferta sola; si no (LinkedIn, Indeed), pide pegar el texto. La puntúa
con los mismos criterios que las ofertas diarias (`docs/data/perfil-busqueda.json`,
generado desde `config.json` por `exportar.py`) y ofrece CV adaptado, propuesta de
valor y carta de motivación. Se guarda solo en el navegador y aparece con el resto.

**Ofertas en inglés**: el CV adaptado y la carta detectan el idioma de la oferta y
salen en inglés (`docs/cv-datos-en.js`, la misma información del CV traducida, con
los mismos temas y viñetas ocultas). En el CV y en la carta se puede cambiar el idioma.

«Mi perfil y ajustes» está en el icono de la barra. La ficha se abre como panel
lateral: resumen, por qué encaja, puntos a comprobar, condiciones y notas; la
propuesta de valor, la descripción, todos los datos, el cálculo de la prioridad
y las fuentes quedan en secciones desplegables.

Favoritos, estados, historial, colecciones y notas se guardan solo en el
navegador (con exportar/importar en el pie de página).

## Señales de empresas (BORME)

`empresas.py` lee cada día la sección primera del BORME (Asturias, Galicia,
Cantabria, León, País Vasco, Navarra y Madrid) y guarda dos tipos de señal con
fuente y fecha: empresas nuevas de tu sector (por CNAE u objeto social) y actos
de empresas que ya están en el radar (ampliaciones de capital, sucursales,
fusiones, cambios; y avisos como concursos). Una señal nunca es una vacante.
Necesita `pypdf`.

## Inteligencia (ticket 04)

- `fuentes_estado.py`: cada recolector registra en `docs/data/fuentes.json` su
  última consulta correcta, resultados y errores. La web los muestra en
  «Mi Radar Diario»: un error no se confunde con «no hay oportunidades».
- `unificar.py` añade fecha de detección (`data/detectadas.json`), novedad,
  deduplicación tolerante, *señal de empresa*, hipótesis de necesidades y
  recomendación de contacto, y genera `docs/data/informe.json` (mejores
  oportunidades, novedades, empresas, adjudicaciones, candidatura espontánea y
  3 acciones prioritarias).
- `noticias.py`: titulares de expansión y nuevos proyectos (Google News RSS)
  que combinan crecimiento + sector + zona.
- Portales corporativos: `config.json → empleo.portales_corporativos`, lista de
  `{"empresa": "...", "ats": "greenhouse" | "lever", "id": "..."}`.

Indicadores en la web: **prioridad** (dónde invertir tu tiempo, con tus pesos),
**encaje** (tu compatibilidad con el puesto) y **señal** (lo claro que es que la
empresa necesita talento). Ninguno es una probabilidad de contratación.

## Ajustar qué busca

Todo está en `config.json`:
- `palabras_fuertes`: palabras del título y cuántos puntos suman.
- `palabras_extra_region`: palabras que solo cuentan en una zona (Asturias).
- `cpv`: códigos de actividad que suman puntos.
- `regiones`: puntos extra por zona (ES12 Asturias, ES11 Galicia…).
- `minimo_por_region`: puntuación mínima por zona (en Asturias es más baja).
- `excluir_titulo`: contratos que se descartan aunque encajen.
- `puntuacion_minima` e `importe_minimo`.

## Contactos

`data/contactos.json` guarda, por NIF de la empresa, el correo comprobado en su
web oficial. La web lo muestra en la ficha «Aplicar». Si una empresa no tiene
correo, la ficha ofrece la búsqueda en LinkedIn y en Google.

## Uso en local

```
python radar.py              # contratos nuevos desde la última vez
python radar.py --dias 45    # rellenar los últimos 45 días
python exportar.py           # preparar los datos de la web
python -m http.server 8765 --directory docs
```
