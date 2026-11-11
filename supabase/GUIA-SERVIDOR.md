# RADAR en línea: puesta en marcha del servidor (Supabase, UE)

Unos 30 minutos. Todo lo que pide contraseña o clave lo haces tú en la web de Supabase.
Ninguna clave se pega en el chat.

## Cómo queda RADAR

- La web sigue en https://lovera86.github.io/radar/ (GitHub Pages). Las ofertas, oposiciones y
  licitaciones son datos públicos y se siguen publicando cada mañana como ahora.
- Lo personal va a **Supabase** (servidor en la UE, en Estocolmo):
  - cuentas con entrada por código al correo, sin contraseñas;
  - perfil de cada persona y CV originales, en un almacén privado;
  - lo que cada persona hace en RADAR, sincronizado entre el móvil y el ordenador.
- Solo entra quien tú das de alta. Cada persona ve lo suyo. Tú ves, en Mi perfil → **Piloto**,
  quién ha entrado y cuánto lo usa, pero no sus notas.
- Con `docs/supabase-config.js` vacío, RADAR funciona como siempre, solo en el navegador.

## 1. Crear el proyecto

1. Entra en https://supabase.com y crea tu cuenta (puedes usar «Continue with GitHub»).
2. **New project**:
   - Name: `radar`
   - Database password: genera una y guárdala en tu gestor de contraseñas. RADAR no la usa.
   - Region: una de la UE (el proyecto de RADAR está en North EU, Estocolmo)
   - Plan: Free (vale para el piloto; ver «Costes» abajo).
3. Espera a que el proyecto esté listo (1–2 minutos).

## 2. Crear la base de datos

1. Menú izquierdo → **SQL Editor** → **New query**.
2. Copia todo el contenido de `supabase/001_plataforma.sql`, pégalo y pulsa **Run**.
   Debe terminar con «Success. No rows returned».
3. Nueva consulta con tu correo de administradora (el mismo con el que entrarás en RADAR):
   ```sql
   insert into public.administradores (email) values ('tu-correo@gmail.com');
   ```

## 3. Inicio de sesión

**Authentication → Sign In / Providers**
- Email: activado. «Confirm email»: activado.
- **Allow new users to sign up: activado**, junto con el filtro de `002_solo_altas.sql`
  (Authentication → Hooks → «Before User Created»): solo pueden crear cuenta los correos
  dados de alta en la pestaña Piloto y los de administración.
- Email OTP Length: 6. Email OTP Expiration: 3600.

**Authentication → URL Configuration**
- Site URL: `https://lovera86.github.io/radar/`
- Redirect URLs: añade `https://lovera86.github.io/radar/**` y `http://localhost:8765/**`

## 4. Correo para los códigos (obligatorio)

El correo que trae Supabase de serie solo envía a los miembros de tu equipo de Supabase,
no a los probadores. Hay que poner un servidor de correo propio. Lo más sencillo es tu Gmail:

1. En tu cuenta de Google → Seguridad → Contraseñas de aplicaciones, crea una nueva
   llamada «Supabase RADAR». Que sea otra, no la de las alertas.
2. Supabase → **Authentication → Emails → SMTP Settings** → Enable custom SMTP:
   - Sender email: tu Gmail · Sender name: `RADAR`
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: tu Gmail · Password: la contraseña de aplicación del paso 1
3. **Authentication → Rate Limits**: «Rate limit for sending emails» a 30 por hora.

**Authentication → Emails → Templates**: cambia dos plantillas.

*Magic Link* (es la que lleva el código para entrar):
- Subject: `Tu código para entrar en RADAR`
- Body:
  ```html
  <h2>Tu código de RADAR</h2>
  <p>Escribe este código en RADAR para entrar:</p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
  <p>Caduca en una hora. Si no lo has pedido tú, ignora este correo.</p>
  ```

*Invite user* (la invitación de alta):
- Subject: `Te damos acceso a RADAR`
- Body:
  ```html
  <h2>Ya tienes acceso a RADAR</h2>
  <p>Rocío te ha dado de alta en el piloto de RADAR, tu radar de oportunidades profesionales.</p>
  <p>Entra en <a href="https://lovera86.github.io/radar/">lovera86.github.io/radar</a> y escribe este correo: te llegará un código para entrar.</p>
  ```

## 5. Conectar RADAR con el proyecto

1. Supabase → **Project Settings → API Keys** (o «API»):
   - **Project URL** (`https://xxxx.supabase.co`), en Project Settings → Data API.
   - **Publishable key** (`sb_publishable_...`). Si tu proyecto muestra la versión antigua,
     es la «anon public».
2. Abre `docs/supabase-config.js` y pega los dos valores entre las comillas de `url` y `clave`.
   Esta clave es pública por diseño: va en la web y lo que protege los datos son los permisos
   de la base de datos.
   **Nunca** pongas la «secret» ni la «service_role».
3. Dile a Claude «ya está el config» para que lo compruebe y lo publique.

## 6. Contrato de encargo de tratamiento (RGPD)

Supabase trata los datos por cuenta tuya. En el panel: **Organization → Legal documents →
Data Processing Addendum (DPA)**, fírmalo y guarda el PDF. Anota en tu registro de
actividades de tratamiento: finalidad (piloto de RADAR), datos (correo, CV, perfil, uso),
base legal (consentimiento), encargado (Supabase, UE) y plazo (fin del piloto + 30 días).
La política que ven los probadores está en `docs/privacidad.html`. Revísala antes de invitar a nadie.

## 7. Dar de alta a cada persona

1. Claude prepara su perfil a partir del CV
   (`python piloto/validar_perfil.py perfil.json --config` para añadir su búsqueda).
2. En RADAR → Mi perfil → **Piloto** → «Dar de alta»: correo, perfil (.json) y CV original.
3. Ya no hay que invitar en Supabase: mándale el enlace de RADAR y dile que entre con ese correo.
4. La persona entra en RADAR con su correo. La primera vez acepta la política de privacidad
   y ve su panel. Después puede instalarlo como app.

## Costes

- **Free**: suficiente para 5–50 personas. Límites: 500 MB de base de datos y 1 GB de archivos.
  Sin copias de seguridad automáticas. El proyecto se pausa si pasa 7 días sin ningún uso.
- **Pro (unos 25 $/mes)**: copias diarias y sin pausas. Pásate antes de abrirlo a clientes
  o cuando haya datos que no se puedan perder.
