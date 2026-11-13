"""Cartero de RADAR: envía desde tu Gmail las presentaciones que tus agentes han dejado listas.

Lo lanza GitHub Actions cada mañana laborable (.github/workflows/cartero.yml), después de la
jornada de los agentes. Qué hace:
  1. Pide a la función «radar-jornada» la cola de envíos (con el secreto RADAR_CARTERO).
  2. Ensayo: cada presentación te llega SOLO A TI, con el destinatario en el asunto.
     Real: se envía a la empresa con tu CV adjunto, desde tu cuenta (queda en tus Enviados).
  3. Seguimiento único a los 10 días si no hay respuesta, en el mismo hilo.
  4. Mira en tu bandeja de entrada si alguna empresa ha respondido y lo marca.
  5. Te manda un resumen solo si ha pasado algo: lo enviado, las respuestas y los avisos.

Límites: solo envía desde la misma cuenta que firma los mensajes; como mucho lo que diga
«max_envios» (3 al día por defecto); pausa entre envíos. Si falta algo, no envía y lo cuenta.
Secretos: RADAR_CARTERO, ENVIO_EMAIL y ENVIO_APP_PASSWORD (contraseña de aplicación de Google).
"""
import datetime
import email.utils
import imaplib
import json
import os
import re
import smtplib
import sys
import time
import urllib.request
from email.message import EmailMessage

FUNCION = "https://newalycxqyaounbhinhb.supabase.co/functions/v1/radar-jornada"
WEB = "https://lovera86.github.io/radar/"
PAUSA_S = 25

sys.stdout.reconfigure(encoding="utf-8")


def llamar(cuerpo):
    req = urllib.request.Request(FUNCION, data=json.dumps({"modo": "cartero", **cuerpo}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-radar-cartero": os.environ["RADAR_CARTERO"]})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def descargar(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def mensaje(de, para, asunto, cuerpo, cv=None, cv_nombre=None, responde_a=None):
    m = EmailMessage()
    m["From"] = de
    m["To"] = para
    m["Subject"] = asunto
    m["Date"] = email.utils.formatdate(localtime=True)
    m["Message-ID"] = email.utils.make_msgid(domain=de.split("@")[-1])
    if responde_a:
        m["In-Reply-To"] = responde_a
        m["References"] = responde_a
    m.set_content(cuerpo)
    if cv:
        m.add_attachment(cv, maintype="application", subtype="pdf", filename=cv_nombre or "CV.pdf")
    return m


def ofertas_del_dia(maximo=6):
    """Ofertas recientes con buen encaje: no se pueden solicitar por correo, te las paso para que te apuntes."""
    try:
        with open("docs/data/oportunidades.json", encoding="utf-8") as f:
            items = json.load(f)
    except OSError:
        return []
    # La recogida incluye ofertas para los perfiles del piloto: aquí solo las de tus roles.
    roles = re.compile(r"project|proyecto|pmo|program|product (manager|owner)|delivery|transformaci[oó]n digital|"
                       r"digital transformation|innovaci[oó]n|scrum|agile|portfolio|cartera de proyectos", re.I)
    pesos = {"encaje": .35, "geografia": .25, "necesidad": .15, "acceso": .15, "calidad": .1}
    hace = (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
    lista = []
    for it in items:
        if it.get("tipo") != "empleo" or (it.get("fechas") or {}).get("detectada", "") < hace:
            continue
        if not roles.search(it.get("titulo", "")):
            continue
        c = it.get("criterios") or {}
        s = w = 0
        for k, p in pesos.items():
            v = (c.get(k) or {}).get("valor")
            if v is not None:
                s += p * v
                w += p
        puntos = round(100 * s / w) if w else 0
        if puntos >= 70:
            lista.append((puntos, it))
    lista.sort(key=lambda x: -x[0])
    return lista[:maximo]


def respuestas(imap, abiertos, yo):
    """Empresas que han contestado: algún correo de su dominio después de nuestro envío."""
    res = []
    imap.select("INBOX", readonly=True)
    for e in abiertos:
        dominio = e["para"].split("@")[-1]
        desde = datetime.datetime.fromisoformat(e["enviado"].replace("Z", "+00:00")).strftime("%d-%b-%Y")
        tipo, datos = imap.search(None, f'(FROM "@{dominio}" SINCE {desde})')
        if tipo == "OK" and datos and datos[0].split() and dominio != yo.split("@")[-1]:
            res.append(e)
    return res


def main():
    falta = [k for k in ("RADAR_CARTERO", "ENVIO_EMAIL", "ENVIO_APP_PASSWORD") if not os.environ.get(k)]
    if falta:
        print("El cartero no está configurado todavía (faltan los secretos " + ", ".join(falta) + "). No se envía nada.")
        return
    yo = os.environ["ENVIO_EMAIL"].strip().lower()
    clave = os.environ["ENVIO_APP_PASSWORD"].replace(" ", "")
    cola = llamar({"accion": "cola"})
    for u in cola.get("usuarios", []):
        firma = u.get("firma") or {}
        if (firma.get("email") or "").strip().lower() != yo:
            print(f"La cuenta de envío ({yo}) no es la que firma los mensajes ({firma.get('email')}): no se envía nada.")
            continue
        modo, informe = u["modo"], {"enviados": [], "ensayo": [], "seguimientos": [], "respuestas": [], "errores": []}
        cv = descargar(u["cv_url"]) if u.get("cv_url") else None
        cv_nombre = f"CV {firma.get('nombre', '')}.pdf".replace("  ", " ")
        smtp = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60)
        smtp.login(yo, clave)
        try:
            for e in u.get("envios", []):
                try:
                    if e["modo"] == "real":
                        if not cv:
                            informe["errores"].append(f"{e['empresa']}: falta tu CV para adjuntar; no se ha enviado.")
                            continue
                        m = mensaje(yo, e["para"], e["asunto"], e["cuerpo"], cv, cv_nombre)
                        smtp.send_message(m)
                        llamar({"accion": "marcar", "id": e["id"], "estado": "enviado", "message_id": m["Message-ID"]})
                        informe["enviados"].append(e)
                    else:
                        aviso = (f"ENSAYO de RADAR. Este correo NO se ha enviado a la empresa.\n"
                                 f"Se enviaría a: {e['para']} (publicado en {e['fuente_correo']})\n"
                                 f"{'Con tu CV adjunto.' if cv else 'Sin CV: súbelo en Mi perfil → Agentes antes de que acabe el ensayo.'}\n"
                                 f"Si algo no te gusta, pulsa Pausar en Mi perfil → Agentes.\n\n" + "-" * 40 + "\n\n")
                        m = mensaje(yo, yo, f"[Ensayo · iría a {e['empresa']}] {e['asunto']}", aviso + e["cuerpo"], cv, cv_nombre)
                        smtp.send_message(m)
                        llamar({"accion": "marcar", "id": e["id"], "estado": "enviado", "message_id": m["Message-ID"]})
                        informe["ensayo"].append(e)
                    time.sleep(PAUSA_S)
                except Exception as x:  # un fallo no detiene el resto
                    llamar({"accion": "marcar", "id": e["id"], "estado": "fallido", "error": str(x)})
                    informe["errores"].append(f"{e['empresa']}: {x}")
            for e in u.get("seguimientos", []):
                try:
                    asunto = e["asunto"] if e["asunto"].lower().startswith("re:") else "Re: " + e["asunto"]
                    m = mensaje(yo, e["para"], asunto, e["cuerpo"], cv, cv_nombre, e.get("message_id"))
                    smtp.send_message(m)
                    llamar({"accion": "seguimiento", "id": e["id"], "asunto": asunto, "cuerpo": e["cuerpo"], "message_id": m["Message-ID"]})
                    informe["seguimientos"].append(e)
                    time.sleep(PAUSA_S)
                except Exception as x:
                    informe["errores"].append(f"Seguimiento a {e['empresa']}: {x}")

            if u.get("abiertos"):
                try:
                    imap = imaplib.IMAP4_SSL("imap.gmail.com")
                    imap.login(yo, clave)
                    for e in respuestas(imap, u["abiertos"], yo):
                        llamar({"accion": "respondido", "id": e["id"]})
                        informe["respuestas"].append(e)
                    imap.logout()
                except Exception as x:
                    informe["errores"].append(f"No se ha podido revisar tu bandeja de entrada: {x}")

            ofertas = []  # Rocío no quiere listas de ofertas: solo lo que RADAR ha hecho por ella
            if any(informe.values()):
                smtp.send_message(mensaje(yo, yo, resumen_asunto(informe, ofertas), resumen_texto(modo, informe, ofertas)))
        finally:
            smtp.quit()
        print(json.dumps({k: len(v) for k, v in informe.items()}, ensure_ascii=False))


def resumen_asunto(inf, ofertas):
    partes = []
    if inf["respuestas"]:
        partes.append(f"{len(inf['respuestas'])} respuesta(s) de empresas")
    if inf["enviados"]:
        partes.append(f"{len(inf['enviados'])} presentación(es) enviada(s)")
    if inf["ensayo"]:
        partes.append(f"{len(inf['ensayo'])} en ensayo")
    if ofertas:
        partes.append(f"{len(ofertas)} oferta(s) para apuntarte")
    return "RADAR hoy: " + (", ".join(partes) or "sin novedades")


def resumen_texto(modo, inf, ofertas):
    l = ["Buenos días. Esto es lo que ha hecho RADAR por ti hoy.", ""]
    if inf["respuestas"]:
        l += ["★ HAN RESPONDIDO (mira tu bandeja de entrada):"] + [f"  - {e['empresa']} ({e['para']})" for e in inf["respuestas"]] + [""]
    if inf["enviados"]:
        l += ["Presentaciones enviadas con tu CV (las tienes en Enviados):"] + [f"  - {e['empresa']} → {e['para']}: «{e['asunto']}»" for e in inf["enviados"]] + [""]
    if inf["ensayo"]:
        l += ["Ensayo (NO enviadas; te han llegado como copias aparte para que veas cómo escribe):"] + [f"  - {e['empresa']} → {e['para']}" for e in inf["ensayo"]] + [""]
    if inf["seguimientos"]:
        l += ["Seguimientos enviados (10 días sin respuesta):"] + [f"  - {e['empresa']}" for e in inf["seguimientos"]] + [""]
    if inf["errores"]:
        l += ["Avisos:"] + [f"  - {x}" for x in inf["errores"]] + [""]
    if ofertas:
        l += ["Ofertas nuevas con buen encaje (se solicitan en su portal; en RADAR, «Analizar oferta» te prepara la carta):"]
        for p, it in ofertas:
            org = (it.get("organizacion") or {}).get("nombre") or ""
            url = ((it.get("fuentes") or [{}])[0]).get("url", "")
            l.append(f"  - [{p}] {it.get('titulo', '')}{' · ' + org if org else ''}\n    {url}")
        l.append("")
    l += [f"Modo: {'ensayo' if modo == 'ensayo' else 'envío real'}. Para parar todo: {WEB}#perfil → Agentes → Pausar.", "",
          "Nada de esto se ha enviado a nadie más que a ti, salvo las presentaciones y seguimientos de arriba."]
    return "\n".join(l)


if __name__ == "__main__":
    main()
