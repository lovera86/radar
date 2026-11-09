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
- LinkedIn e Indeed no permiten leer sus ofertas de forma automática: la web
  enlaza sus búsquedas de las últimas 24 horas.

## Empleo público

`publico.py` revisa cada día el BOE (sección II.B, Oposiciones y concursos) y los
contratos de técnico en proyectos de la Universidad de Oviedo. Puntúa más las
plazas de Ingeniería Técnica Industrial, los cuerpos de gestión A2 y lo que es
en Asturias. El BOPA no tiene un canal legible por programas: la web enlaza.

## Modelo común (RADAR v2)

`unificar.py` junta todas las fuentes en `docs/data/oportunidades.json`: cada
oportunidad lleva tipo, verificación (vacante publicada u oportunidad potencial
no publicada), datos confirmados o inferidos, fuentes con fecha de consulta y seis
criterios (encaje, necesidad, ubicación, calidad, salario, acceso). La web
calcula la compatibilidad con los pesos del perfil; los criterios sin información
no restan, pero bajan la confianza.

La web: Explorar (buscador, filtros, mejores matches), Empleo, Proyectos,
Empresas, Mapa y Guardados. Favoritos, «Me interesa», estados de candidatura e
historial se guardan solo en el navegador (con exportar/importar).

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
