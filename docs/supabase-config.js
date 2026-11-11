'use strict';
/* Conexión de RADAR con su servidor (Supabase, región UE).
   Rellena estos dos datos desde Supabase → Project Settings → API:
   - url: «Project URL» (https://xxxx.supabase.co)
   - clave: la clave pública («publishable» o «anon public»). Está pensada para ir en la web:
     los permisos de la base de datos (Row Level Security) deciden qué ve cada persona.
   NUNCA pongas aquí la clave «secret» ni la «service_role».
   Con los dos campos vacíos, RADAR funciona como siempre, solo en el navegador. */
const RADAR_SUPABASE = {
  url: 'https://newalycxqyaounbhinhb.supabase.co',
  clave: 'sb_publishable_5yDalPtOe4SMMwuI3fEqQw_alZNWlt8',
};
