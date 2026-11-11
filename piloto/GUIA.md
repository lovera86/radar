# Piloto de RADAR (fase 1): guía de alta

Objetivo: que 5–10 personas usen RADAR con su propio perfil durante 2–4 semanas y
comprobar si lo usan, si las oportunidades encajan y si pagarían por ello.

## Cómo funciona

- Todos usan la misma web: https://lovera86.github.io/radar/
- Cada persona tiene un **enlace personal de acceso**: al abrirlo (en el ordenador o
  en el móvil) entra directamente en su panel. El perfil (CV, roles, zona y búsqueda)
  va dentro del enlace, tras «#», que nunca llega a ningún servidor, y queda **solo en
  su navegador**. Alternativa: el archivo .json con «Cargar mi perfil».
- Puede **instalar RADAR como app** (icono en el móvil o el escritorio) y ve una guía
  de «Primeros pasos» en Hoy la primera vez.
- La recogida diaria busca también lo que piden los probadores. En `config.json`
  (bloque `piloto`) solo van palabras de búsqueda y zona, **nunca datos personales**.
- Sin perfil cargado se usa el perfil de Rocío (la web de siempre). Las oportunidades
  que solo encajan con probadores no le aparecen.
- «Ver un ejemplo» carga un perfil ficticio (`docs/perfiles/ejemplo.json`).

## Alta de una persona (unos 20 minutos)

1. **Recibir su CV** y tres respuestas: qué trabajo busca, en qué comunidad, y si le
   interesan oposiciones (y de qué). El enlace «Escríbenos» de la bienvenida ya
   prepara ese correo.
2. **Crear su perfil** a partir de `perfil-ejemplo.json`. Se puede pedir a Claude:
   «Convierte este CV en un perfil de RADAR siguiendo `piloto/perfil-ejemplo.json`
   y las reglas de `piloto/GUIA.md`».
   Reglas:
   - Todo sale del CV: ni logros, ni cifras, ni títulos que no figuren.
   - `cv.temas`: 2–4 enfoques según los tipos de puesto que busca. `detectar` es una
     expresión que reconoce ofertas de ese enfoque.
   - Cada viñeta de experiencia lleva los enfoques a los que aplica (`temas`).
   - `busqueda.puestos`: nombres de puesto con peso (45 = el principal, 30 = afín).
     En minúsculas y sin tildes. `temas`: palabras que suman. `excluir`: lo que no quiere.
   - `region`: su comunidad, tal cual (p. ej. «Madrid», «Comunitat Valenciana»).
     `cerca`: comunidades a las que se movería.
   - `proyectos`: `false` salvo que le interesen licitaciones y empresas
     (perfiles de dirección de proyectos, ingeniería, consultoría).
   - `propuesta` es opcional. Si se incluye, cada aportación lleva un patrón que tiene
     que aparecer en su CV. Si no, RADAR la arma con sus propias viñetas.
   - `cv_en` (CV en inglés) es opcional: sin él, el CV y la carta salen solo en español.
   - `publico`: palabras de empleo público (p. ej. «tecnico de comunicacion») si quiere
     oposiciones. `consultas`: 2–3 búsquedas para los portales (por defecto, sus puestos).
3. **Validar, añadir su búsqueda y generar su enlace**:
   ```
   python piloto/validar_perfil.py ruta/perfil-nombre.json --config --enlace
   ```
   Comprueba el perfil, añade su bloque (sin datos personales) a `config.json` e imprime
   su enlace personal.
4. **Publicar** el cambio de `config.json` (commit y push). Al día siguiente la
   recogida ya incluye sus búsquedas (o lanzar «Run workflow» para no esperar).
5. **Enviarle su enlace por un canal privado** (correo o mensaje), con estas
   instrucciones: «Abre este enlace en el móvil y en el ordenador: entrarás en tu
   RADAR. Después, instálalo como app desde “Primeros pasos”. El enlace es personal:
   no lo compartas». Si lo pierde, puede copiarlo de nuevo en Mi perfil → Mis datos.
6. Guardar los perfiles **fuera del repositorio** (por ejemplo,
   `Desktop/radar-empleo/perfiles-piloto/`). Nunca subirlos a GitHub.

## Qué medir

- Uso: cuántos días lo abren y qué miran (preguntarlo; RADAR no rastrea a nadie).
- Encaje: si las 5 primeras oportunidades les interesan (nota de 1 a 5).
- Acción: candidaturas preparadas con el CV adaptado o la carta.
- Valor: si lo recomendarían y cuánto pagarían.

El botón «Enviar mi opinión» (pie de página y Mi perfil → Mis datos) abre un correo
con estas preguntas.

## Limitaciones conocidas del piloto

- Las alertas de LinkedIn e InfoJobs por correo solo funcionan para Rocío.
- Fuentes de empleo para cualquier profesión: EURES (SEPE y servicios públicos),
  Himalayas (remoto) y Tecnoempleo (solo tecnología). InfoJobs, Jooble y Adzuna
  ampliarían mucho la cobertura cuando tengan clave.
- Empleo público: BOE en toda España; boletines autonómicos solo de Asturias,
  Cantabria, Galicia y Castilla y León.
- Licitaciones, adjudicaciones y señales de empresas están pensadas para dirección
  de proyectos e ingeniería.
- Los datos de cada persona están en su navegador: si lo cambia o lo borra, debe
  usar «Exportar mis datos» antes.
