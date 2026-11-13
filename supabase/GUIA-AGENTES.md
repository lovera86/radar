# Equipo de agentes de RADAR: puesta en marcha y uso (fases 1 y 2)

## Cómo funciona

- **Programación:** `pg_cron` (dentro de Supabase) llama a la función `radar-jornada` cada
  5 minutos entre las 04:00 y las 09:55 UTC. La función decide si toca empezar según tu
  configuración: hora en España, días activos y pausa. No depende de que el navegador esté abierto.
- **Una jornada** = un plan del Director + una cola de tareas (`tareas`). Cada llamada coge
  tareas de una en una (`reclamar_tarea`, nunca dos veces la misma), trabaja como mucho unos
  100 segundos y deja registro en `eventos`.
- **Reintentos:** si una tarea falla, vuelve a la cola hasta 3 intentos. Las tareas que se quedan
  colgadas más de 10 minutos vuelven solas a la cola. Las escrituras son idempotentes (las
  señales se identifican por la clave de su fuente), así que reintentar no duplica nada.
- **Memoria compartida:** `senales`, `oportunidades`, `contactos` y `eventos`, en Supabase.
  Desde la web cada persona solo puede leer lo suyo.
- **Detector** (sin IA): lee la recogida diaria de RADAR, guarda las señales nuevas con su fuente,
  sus hechos y sus hipótesis, y no repite las que ya conoce.
- **Analista** (sin IA): puntúa las empresas adjudicatarias con los criterios de RADAR (encaje 35 %,
  zona 25 %, posible necesidad 15 %, canal de contacto 15 %, actualidad 10 %) y elige las mejores
  por encima de tu umbral, como mucho «empresas investigadas con IA por día». Nunca repite empresas
  que ya están en tu bandeja, que descartaste o que ya se investigaron, y nunca elige personas
  físicas (NIF de autónomo).
- **Investigador** (IA, Claude Sonnet 5.5 con búsqueda web, 2 búsquedas y 2 páginas como mucho):
  investiga cada empresa elegida. Solo guarda URL que ha visitado de verdad y correos que aparecen
  tal cual en una página leída. Antes de cada investigación comprueba el presupuesto del día
  (sumando todas las jornadas del día); si no llega, la deja «priorizada» para otro día. Las tareas
  con IA no se reintentan solas (cuestan dinero): se reintentan con el botón «Reintentar».
  Cada ejecución hace como mucho una investigación y solo al principio, para no pasar del límite
  de tiempo de la función; la siguiente llamada programada (5 minutos después) sigue con la próxima.
- **Tu bandeja:** al abrir Oportunidades con tu sesión, las empresas investigadas entran como
  «Validada · propuesta por tus agentes», con por qué se eligieron, sus señales con fuente y el
  contacto propuesto. Nada se envía sin ti.

## Instalar (una vez)

1. Supabase → **SQL Editor** → New query → pega `supabase/005_agentes.sql` → **Run**.
   Crea las tablas, activa `pg_cron` y `pg_net`, crea tu configuración y programa la jornada.
2. La función `radar-jornada` ya está desplegada. Para volver a desplegarla:
   ```
   npx supabase functions deploy radar-jornada --project-ref newalycxqyaounbhinhb --use-api --no-verify-jwt
   ```
   Se despliega sin verificación JWT porque `pg_cron` no tiene sesión. A cambio, la función
   exige el secreto interno (tabla `ajustes_internos`, que nadie puede leer desde la web) o
   una sesión de administración.

## Usar

En RADAR → Mi perfil → **Agentes**:
- **Lanzar jornada ahora:** ejecuta una jornada manual para probar.
- **Pausar (parada de emergencia):** ninguna jornada empieza ni avanza hasta que la reanudes.
- **Configurar la jornada:** hora, días, presupuesto de IA por jornada, oportunidades investigadas
  con IA (se usa a partir de la fase 2) y puntuación mínima.
- **Equipo de agentes:** activar o desactivar cada agente.
- **Historial:** cada jornada con su estado, duración, señales nuevas y coste. «Ver» muestra sus
  tareas, el registro y el botón **Reintentar** de las tareas fallidas.

## Logs y recuperación

- Registro de cada jornada: tabla `eventos` (también en «Ver»).
- Llamadas de `pg_cron`: SQL Editor → `select * from cron.job_run_details order by start_time desc limit 20;`
- Respuestas de la función: Supabase → Edge Functions → radar-jornada → Logs.
- Si una jornada se queda «En curso», pulsa «Lanzar jornada ahora»: continúa la abierta, no crea otra.
- Para desactivar la programación: `select cron.unschedule('radar-jornada');`

## Pruebas

```
npx tsx --test supabase/functions/radar-jornada/nucleo.test.ts
```
Cubren el horario de Madrid (también con cambio de hora), cuándo toca la jornada, la
planificación, los reintentos, el cierre, la deduplicación, la separación de hechos e
hipótesis y el presupuesto.
