# Activar la IA de RADAR (Claude)

Unos 15 minutos. Las claves y los pagos los haces tú. Ninguna clave se pega en el chat ni en
archivos del repositorio.

## Qué hace

- **Mi perfil → Mi CV → «Leer mi CV con IA»**: sube tu CV en PDF y obtienes un perfil en el que
  cada dato va enlazado a la frase exacta de tu CV. Lo que la IA deduce va aparte. Lo revisas
  antes de guardarlo.
- **Oportunidades → ficha → «Investigar con IA»**: busca en la web su sitio oficial, señales
  recientes con fuente y un canal de contacto publicado. Si la IA propone un correo que no
  aparece en ninguna página leída, el servidor lo descarta.
- **Oportunidades → ficha → «Redactar con IA»**: un mensaje único para esa empresa, hecho solo
  con sus señales y con hechos de tu perfil. Muestra en qué datos se basa.

La clave de Claude vive solo en el servidor (Supabase). Solo la usa tu cuenta de
administración, con un máximo de 40 usos al día.

## 1. Cuenta y clave de Claude

1. Entra en https://console.anthropic.com y crea tu cuenta.
2. **Billing**: añade crédito (con 10 $ hay para meses de uso personal) y, en **Limits**, pon un
   límite de gasto mensual, por ejemplo 15 $.
3. **API Keys → Create Key**, nombre `radar-supabase`. Copia la clave: solo se muestra una vez.

Coste orientativo con Claude Opus 5.5: leer un CV unos 0,10 $, investigar una empresa entre 0,10
y 0,30 $ (incluye las búsquedas web) y redactar un mensaje unos 0,03 $.

## 2. Guardar la clave en Supabase

Supabase → **Edge Functions → Secrets** (o Project Settings → Edge Functions) → **Add new secret**:
- Name: `ANTHROPIC_API_KEY`
- Value: la clave del paso 1

## 3. Registro de uso

SQL Editor → New query → pega `supabase/004_ia.sql` → **Run**.

## 4. Instalar la función

Supabase → **Edge Functions → Deploy a new function → Via Editor**:
- Nombre: `radar-ia` (exactamente así)
- Borra el código de ejemplo, pega todo `supabase/functions/radar-ia/index.ts` y pulsa **Deploy**.
- Deja activado «Verify JWT» (o «Enforce JWT»): así solo se puede llamar con una sesión de RADAR.

## 5. Probar

En RADAR (con tu sesión iniciada): Oportunidades → abre una empresa de tu bandeja →
**Investigar con IA**. Tarda hasta un minuto.

Si sale «La función de IA aún no está instalada», revisa el paso 4. Si sale «La clave de Claude
no es válida», revisa el paso 2.

## Desactivar

Borra el secreto `ANTHROPIC_API_KEY` o la función `radar-ia`. RADAR sigue funcionando sin IA,
con las plantillas.
