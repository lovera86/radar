"""Ofertas de LinkedIn e InfoJobs a partir de tus alertas de empleo por correo.

LinkedIn no permite que un programa lea sus ofertas. Lo que sí puedes hacer es
crear alertas de empleo (te llegan por correo) y que RADAR las lea en tu buzón:
solo los correos de alertas, en modo lectura, sin borrar ni marcar nada. Cada
oferta pasa después por el mismo filtro de perfil que el resto.

Variables de entorno (secretos de GitHub, los pones tú):
    ALERTAS_EMAIL          cuenta de Gmail que recibe las alertas
    ALERTAS_APP_PASSWORD   contraseña de aplicación de Google (no la normal)
    ALERTAS_IMAP           opcional, por defecto imap.gmail.com
"""
import email
import html
import imaplib
import os
import re
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser

REMITENTES = {
    "LinkedIn": ["jobalerts-noreply@linkedin.com", "jobs-noreply@linkedin.com", "jobs-listings@linkedin.com"],
    "InfoJobs": ["noreply@infojobs.net", "alertas@infojobs.net", "no-reply@infojobs.net", "infojobs.net"],
}
RX_OFERTA = {
    "LinkedIn": re.compile(r"linkedin\.com/(?:comm/)?jobs/view/(\d{6,})"),
    "InfoJobs": re.compile(r"infojobs\.net/[^\s\"'?]*?/of-i([0-9a-f]{20,})"),
}
GENERICOS = re.compile(r"^(ver (empleo|oferta|más|todas?)|view job|apply|aplicar|solicitar|inscr[ií]bete|see all|ver todos)", re.I)


class Tokens(HTMLParser):
    """Convierte el HTML del correo en una lista de (texto, enlace)."""

    def __init__(self):
        super().__init__()
        self.tok, self.href, self.buf = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._vaciar()
            self.href = dict(attrs).get("href", "")
        elif tag in ("br", "p", "div", "td", "tr", "li", "span", "table"):
            self._vaciar()

    def handle_endtag(self, tag):
        if tag == "a":
            self._vaciar()
            self.href = None
        elif tag in ("p", "div", "td", "tr", "li", "span", "table"):
            self._vaciar()

    def handle_data(self, data):
        self.buf.append(data)

    def _vaciar(self):
        t = re.sub(r"\s+", " ", html.unescape("".join(self.buf))).strip()
        self.buf = []
        if t:
            self.tok.append((t, self.href))


def partes(msg):
    texto, htmlp = "", ""
    for p in msg.walk():
        ct = p.get_content_type()
        if p.get_content_maintype() == "multipart":
            continue
        try:
            cuerpo = p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8", "replace")
        except Exception:
            continue
        if ct == "text/plain":
            texto += cuerpo
        elif ct == "text/html":
            htmlp += cuerpo
    return texto, htmlp


def ofertas_de_correo(plataforma, msg, fecha):
    """Extrae (título, empresa, ubicación, enlace) de un correo de alerta."""
    rx = RX_OFERTA[plataforma]
    _, htmlp = partes(msg)
    out = {}
    if htmlp:
        p = Tokens()
        p.feed(htmlp)
        p._vaciar()
        tok = p.tok
        for i, (t, href) in enumerate(tok):
            m = rx.search(href or "")
            if not m or GENERICOS.match(t) or len(t) < 4 or m.group(1) in out:
                continue
            siguientes = []
            for x, h in tok[i + 1:i + 8]:
                m2 = rx.search(h or "")
                if m2 and m2.group(1) != m.group(1):
                    break  # empieza la siguiente oferta
                if m2 or GENERICOS.match(x) or len(x) >= 120:
                    continue
                siguientes += [y.strip() for y in x.split("·") if y.strip()]  # «Empresa · Ciudad»
            empresa = siguientes[0] if siguientes else ""
            ubic = siguientes[1] if len(siguientes) > 1 else ""
            out[m.group(1)] = (t, empresa, ubic)
    if not out:  # sin HTML: bloques de texto «Título / Empresa / Ciudad / enlace»
        texto, _ = partes(msg)
        lineas = [x.strip() for x in texto.splitlines() if x.strip()]
        for i, l in enumerate(lineas):
            m = rx.search(l)
            if m and m.group(1) not in out:
                previas = [x for x in lineas[max(0, i - 4):i] if not rx.search(x) and not GENERICOS.match(x) and not x.startswith("http")][-3:]
                if previas:
                    titulo = previas[0]
                    out[m.group(1)] = (titulo, previas[1] if len(previas) > 1 else "", previas[2] if len(previas) > 2 else "")
    res = []
    for ident, (titulo, empresa, ubic) in out.items():
        url = f"https://www.linkedin.com/jobs/view/{ident}/" if plataforma == "LinkedIn" else f"https://www.infojobs.net/of-i{ident}"
        res.append({"fuente": f"{plataforma} (alerta)", "titulo": titulo, "empresa": empresa, "ubicacion": ubic,
                    "descripcion": "", "url": url, "fecha": fecha, "salario": ""})
    return res


def buzon_todos(m):
    """Nombre del buzón «Todos» de Gmail, sea cual sea el idioma."""
    typ, data = m.list()
    for linea in data or []:
        l = linea.decode("utf-8", "replace")
        if "\\All" in l:
            return l.split(' "/" ')[-1].strip()
    return "INBOX"


def guardar_parte(parte):
    """Parte de la lectura (sin datos personales) para comprobar que funciona."""
    import json
    from pathlib import Path
    f = Path(__file__).resolve().parent / "data" / "estado_alertas.json"
    f.parent.mkdir(exist_ok=True)
    f.write_text(json.dumps(parte, ensure_ascii=False, indent=1), encoding="utf-8")


def leer_alertas(dias=3):
    usuario, clave = os.environ.get("ALERTAS_EMAIL"), os.environ.get("ALERTAS_APP_PASSWORD")
    parte = {"fecha": datetime.now(timezone.utc).isoformat(timespec="seconds"), "configurado": bool(usuario and clave),
             "conectado": False, "correos": {}, "ofertas": {}, "error": ""}
    if not (usuario and clave):
        guardar_parte(parte)
        return []
    out = []
    try:
        m = imaplib.IMAP4_SSL(os.environ.get("ALERTAS_IMAP", "imap.gmail.com"))
        m.login(usuario, clave)
        parte["conectado"] = True
        m.select(buzon_todos(m), readonly=True)  # solo lectura: no marca ni borra nada
        for plataforma, remitentes in REMITENTES.items():
            consulta = "from:(" + " OR ".join(remitentes) + f") newer_than:{dias}d"
            typ, data = m.search(None, "X-GM-RAW", f'"{consulta}"')
            ids = (data[0] or b"").split()[-200:]
            parte["correos"][plataforma] = len(ids)
            antes = len(out)
            for i in ids:
                typ, d = m.fetch(i, "(BODY.PEEK[])")
                msg = email.message_from_bytes(d[0][1])
                try:
                    fecha = parsedate_to_datetime(msg["Date"]).date().isoformat()
                except Exception:
                    fecha = datetime.now(timezone.utc).date().isoformat()
                out += ofertas_de_correo(plataforma, msg, fecha)
            parte["ofertas"][plataforma] = len(out) - antes
        m.logout()
    except Exception as ex:
        print(f"[aviso] alertas por correo: {ex}", file=sys.stderr)
        parte["error"] = type(ex).__name__ + ": " + str(ex)[:160].replace(usuario or "", "(tu correo)")
    guardar_parte(parte)
    return out
