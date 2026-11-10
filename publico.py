"""Empleo público: oposiciones y contratos públicos que encajan con el perfil.

Fuentes:
  - BOE, sección II.B «Oposiciones y concursos» (API de datos abiertos). Para los
    ayuntamientos de Asturias, que en el título no dicen la plaza, lee el texto.
  - Universidad de Oviedo: contratos de técnico/investigador en proyectos.
  - BOPA (Asturias): sumario diario público (solo la página del sumario, que el
    robots.txt permite; las disposiciones se enlazan, no se descargan).
  - BOC (Cantabria): canal RSS oficial de «Oposiciones y concursos».
  - DOG (Galicia): RSS oficial del sumario del día, sección «Oposiciones y concursos».
  - BOCYL (Castilla y León): RSS oficial del boletín del día.

Uso:
    python publico.py              # desde la última ejecución (máx. 10 días)
    python publico.py --dias 30    # rellenar
"""
import argparse
import time
import html
import json
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
UA = "Mozilla/5.0 (radar-oportunidades; uso personal)"
DIAS_GUARDADO = 60
UNIOVI = "https://www.uniovi.es/conocenos/rrhh/convocatorias/investigacion"
MESES = {m: i for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                                      "septiembre", "octubre", "noviembre", "diciembre"], 1)}

ES_CONVOCATORIA = re.compile(r"convoca|proceso selectivo|pruebas selectivas|proveer|concurso-oposicion|bolsa de (empleo|trabajo)")
EXCLUIR = re.compile(r"libre designacion|correccion de errores|relacion definitiva|relacion provisional|lista (provisional|definitiva)|"
                     r"se nombra|nombramiento|adjudica|concurso de traslados|provision de puestos|concurso especifico|concurso general|"
                     r"profesor|docente|catedratic|policia|bombero|medic|enfermer|facultativo|militar|guardia civil|"
                     r"estabilizacion|promocion interna|auxiliar|conserje|ordenanza|limpieza|peon|operari|educador|"
                     r"personas aprobadas|se resuelve|resolucion del proceso|han superado|se modifica|corrig|aspirantes admitid|tribunal calificador|sanitari|farmac|celador|arquitect|psicolog|veterinari|abogad|letrad")
PUNTOS = [
    (r"ingenier[oa]s? tecnic[oa]s? industrial|ingenieria tecnica industrial|ingenieros tecnicos industriales", 60, "Ingeniería Técnica Industrial"),
    (r"gestion de la administracion civil del estado", 60, "Gestión del Estado (A2)"),
    (r"gestion de proyectos|jef[ea] de proyecto|project manag|direccion de proyectos", 30, "gestión de proyectos"),
    (r"cuerpo de gestion|escala de gestion|tecnic[oa] de gestion|subgrupo a2|grupo a2", 30, "grupo A2 (tu nivel)"),
    (r"ingenier[oa]s? tecnic|ingenieria tecnica", 25, "ingeniería técnica"),
    (r"inteligencia artificial|\bia\b|gemelo digital|fotogrametr|lidar|teledeteccion|forestal|patrimonio|museo|transformacion digital|innovacion", 15, "tema afín"),
    (r"tecnic[oa]", 10, "puesto técnico"),
]
ASTURIAS = re.compile(r"asturias|principado|gijon|oviedo|aviles|llanera|siero|langreo|mieres|uniovi")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def lista(x):
    return x if isinstance(x, list) else ([] if x is None else [x])


def puntuar(texto, asturias_bonus=True, lejos=False):
    t = re.sub(r"/as?\b|\(as?\)", "", norm(texto))
    if EXCLUIR.search(t):
        return 0, []
    p, motivos = 0, []
    for rx, w, etiqueta in PUNTOS:
        if re.search(rx, t):
            p += w
            motivos.append(etiqueta)
    if p and asturias_bonus and ASTURIAS.search(t):
        p += 25
        motivos.append("Asturias")
    elif p and lejos:
        p -= 20  # ayuntamientos, universidades o comunidades de fuera de Asturias
    return min(100, p), motivos


def texto_boe(ident):
    try:
        raiz = ET.fromstring(get(f"https://www.boe.es/diario_boe/xml.php?id={ident}", "application/xml"))
        return " ".join(raiz.find("texto").itertext())[:3000] if raiz.find("texto") is not None else ""
    except Exception as ex:
        print(f"[aviso] BOE {ident}: {ex}", file=sys.stderr)
        return ""


def boe(desde, hasta):
    out, d = [], desde
    while d <= hasta:
        try:
            sumario = json.loads(get(f"https://www.boe.es/datosabiertos/api/boe/sumario/{d:%Y%m%d}"))["data"]["sumario"]
        except Exception:
            d += timedelta(days=1)  # domingos y festivos no hay BOE
            continue
        for diario in lista(sumario.get("diario")):
            for sec in lista(diario.get("seccion")):
                if sec.get("codigo") != "2B":
                    continue
                for dep in lista(sec.get("departamento")):
                    organismo = dep.get("nombre", "")
                    epigrafes = lista(dep.get("epigrafe")) or [dep]
                    for ep in epigrafes:
                        for it in lista(ep.get("item")):
                            titulo = it.get("titulo", "")
                            t = norm(titulo)
                            if not ES_CONVOCATORIA.search(t) or EXCLUIR.search(t):
                                continue
                            extra = ""
                            # Los ayuntamientos no dicen la plaza en el título: se lee el texto solo en Asturias.
                            if "administracion local" in norm(organismo) and ASTURIAS.search(t):
                                extra = texto_boe(it["identificador"])
                            lejos = bool(re.search(r"administracion local|universidades|comunidad autonoma", norm(organismo)))
                            p, motivos = puntuar(titulo + " " + extra, lejos=lejos)
                            plaza = ""
                            m = re.search(r"(?i)plazas? de ([^,.;]{4,90})", extra)
                            if m:
                                plaza = m.group(1).strip()
                            out.append({
                                "clave": it["identificador"], "fuente": "BOE", "organismo": organismo.title(),
                                "titulo": titulo + (f" — {plaza}" if plaza else ""),
                                "fecha": f"{d:%Y-%m-%d}", "url": it.get("url_html", ""),
                                "puntuacion": p, "encaje": ", ".join(motivos),
                                "comunidad": "Asturias" if ASTURIAS.search(norm(titulo + " " + organismo)) else "Estatal / otras",
                            })
        print(f"BOE {d:%Y-%m-%d}", flush=True)
        d += timedelta(days=1)
    return out


def fecha_es(s):
    m = re.search(r"(\d{1,2}) de (\w+) de (\d{4})", norm(s))
    if m and m.group(2) in MESES:
        return date(int(m.group(3)), MESES[m.group(2)], int(m.group(1))).isoformat()
    return ""


UNIOVI_OK = True


def uniovi(desde):
    try:
        raw = get(UNIOVI, "text/html")
    except Exception as ex:
        print(f"[aviso] Universidad de Oviedo: {ex}", file=sys.stderr)
        global UNIOVI_OK
        UNIOVI_OK = False
        return []
    try:
        s = raw.decode("utf-8")
    except UnicodeDecodeError:
        s = raw.decode("latin-1")
    out = []
    for bloque in s.split('class="resolucion-wrapper')[1:]:
        cab = re.search(r'class="resolucion[^"]*">\s*<a href="([^"]+)">(.*?)</a>', bloque, re.S)
        if not cab:
            continue
        resol = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cab.group(2)))).strip()
        f = fecha_es(resol)
        if not f or f < desde.isoformat():
            continue
        for href, txt in re.findall(r'<li class="mb-1">\s*<a href="([^"]+)">(.*?)</a>', bloque, re.S):
            plaza = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", txt))).strip()
            p, motivos = puntuar(plaza, asturias_bonus=False)
            if p:
                p = min(100, p + 20)
                motivos.append("Universidad de Oviedo")
            ident = re.search(r"PortletId?_id=(\d+)|_id=(\d+)", href)
            out.append({
                "clave": "uniovi-" + (ident.group(1) or ident.group(2) if ident else str(abs(hash(plaza)))),
                "fuente": "Universidad de Oviedo", "organismo": "Universidad de Oviedo",
                "titulo": plaza, "fecha": f, "url": html.unescape(href),
                "puntuacion": p, "encaje": ", ".join(motivos), "comunidad": "Asturias",
            })
    print(f"Universidad de Oviedo: {len(out)} plazas desde {desde}")
    return out


def convocatoria(titulo, organismo, fuente, clave, fecha, url, comunidad):
    """Filtra y puntúa una disposición de boletín autonómico. Devuelve None si no encaja."""
    t = norm(titulo)
    if not ES_CONVOCATORIA.search(t) or EXCLUIR.search(t):
        return None
    asturias = comunidad == "Asturias"
    p, motivos = puntuar(titulo + " " + organismo, asturias_bonus=asturias, lejos=not asturias)
    m = re.search(r"(?i)plazas? de ([^,.;:]{4,90})", titulo) or re.search(r"(?i)(?:ingreso|acceso) (?:en|a|al) (?:el |la )?((?:cuerpo|escala|categor[ií]a)[^,.;:]{4,110})", titulo)
    organismo = re.sub(r"(?<=\w )(De|Del|La|Las|Los|Y|E|En)\b", lambda x: x.group(0).lower(), organismo.strip())
    return {"clave": clave, "fuente": fuente, "organismo": organismo, "titulo": titulo.strip() + (" — " + m.group(1).strip()[:1].upper() + m.group(1).strip()[1:] if m else ""),
            "fecha": fecha, "url": url, "puntuacion": p, "encaje": ", ".join(motivos), "comunidad": comunidad}


def limpio(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def bopa(desde, hasta):
    """Sumario diario del BOPA: secciones de personal (Principado) y administración local."""
    out, d = [], desde
    while d <= hasta:
        url = ("https://miprincipado.asturias.es/bopa-sumario?p_p_id=pa_sede_bopa_web_portlet_SedeBopaSummaryWeb&p_p_lifecycle=0"
               f"&p_p_state=normal&p_p_mode=view&p_r_p_summaryDate={d:%d}%2F{d:%m}%2F{d:%Y}&p_r_p_summaryIsSearch=false")
        try:
            s = get(url, "text/html").decode("utf-8", "replace")
        except Exception as ex:
            print(f"[aviso] BOPA {d}: {ex}", file=sys.stderr)
            d += timedelta(days=1)
            continue
        i = s.find('id="bopa-boletin"')
        if i < 0:
            d += timedelta(days=1)
            continue
        seccion = sub = org = ""
        for m in re.finditer(r"<h4[^>]*>(.*?)</h4>|<h5[^>]*>(.*?)</h5>|<h6[^>]*>(.*?)</h6>|<p[^>]*subAuthor[^>]*>(.*?)</p>|<dt>(.*?)</dt>", s[i:], re.S):
            h4, h5, h6, sa, dt = m.groups()
            if h4:
                seccion, sub, org = limpio(h4), "", ""
            elif h5:
                sub, org = limpio(h5), ""
            elif h6:
                org = limpio(h6)
            elif sa:
                org = limpio(sa)
            elif dt:
                if not re.search(r"personal|administraci[oó]n local", norm(seccion + " " + sub)):
                    continue
                txt = limpio(dt)
                cod = re.search(r"\[C[oó]d\. ([\d-]+)\]", txt)
                titulo = re.sub(r"\s*\[C[oó]d\. [\d-]+\]\s*$", "", txt)
                organismo = org.title() if org else sub.title()
                if norm(sub).startswith("ayuntamientos") and org and not norm(org).startswith("ayuntamiento"):
                    organismo = "Ayuntamiento " + org.title()
                ref = cod.group(1) if cod else str(abs(hash(titulo)))
                enlace = ("https://miprincipado.asturias.es/bopa/disposiciones?p_p_id=pa_sede_bopa_web_portlet_SedeBopaDispositionWeb&p_p_lifecycle=0"
                          f"&_pa_sede_bopa_web_portlet_SedeBopaDispositionWeb_mvcRenderCommandName=%2Fdisposition%2Fdetail&p_r_p_dispositionText={ref}"
                          f"&p_r_p_dispositionReference={ref}&p_r_p_dispositionDate={d:%d}%2F{d:%m}%2F{d:%Y}")
                c = convocatoria(titulo, organismo, "BOPA", "bopa-" + ref, d.isoformat(), enlace, "Asturias")
                if c:
                    out.append(c)
        print(f"BOPA {d:%Y-%m-%d}", flush=True)
        d += timedelta(days=1)
        time.sleep(1)
    return out


def rss(url):
    return ET.fromstring(get(url, "application/rss+xml, application/xml"))


def fecha_rss(it, defecto):
    t = it.findtext("pubDate") or ""
    m = re.match(r"\d{4}-\d{2}-\d{2}", t)
    if m:
        return m.group(0)
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(t).date().isoformat()
    except Exception:
        return defecto


def boc_cantabria(desde):
    out = []
    for it in rss("https://www.cantabria.es/o/BOC/feed/6802085").iter("item"):
        f = fecha_rss(it, date.today().isoformat())
        if f < desde.isoformat():
            continue
        titulo = limpio(it.findtext("title") or "")
        organismo, _, resto = titulo.partition(": ")
        url = (it.findtext("link") or "").strip()
        ident = re.search(r"idAnuBlob=(\d+)", url)
        c = convocatoria(resto or titulo, organismo.title(), "BOC (Cantabria)", "boc-" + (ident.group(1) if ident else str(abs(hash(titulo)))), f, url, "Cantabria")
        if c:
            out.append(c)
    return out


def dog_galicia():
    out = []
    for it in rss("https://www.xunta.gal/diario-oficial-galicia/rss/Sumario_es.rss").iter("item"):
        desc = [limpio(x) for x in (it.findtext("description") or "").split("</br>")]
        if not desc or "oposiciones" not in norm(desc[0]):
            continue
        titulo = limpio(it.findtext("title") or "")
        url = (it.findtext("link") or "").strip()
        m = re.search(r"/(\d{8})/", url)
        f = f"{m.group(1)[:4]}-{m.group(1)[4:6]}-{m.group(1)[6:]}" if m else date.today().isoformat()
        c = convocatoria(titulo, desc[1] if len(desc) > 1 else "Xunta de Galicia", "DOG (Galicia)", "dog-" + url.rsplit("/", 1)[-1].replace(".html", ""), f, url, "Galicia")
        if c:
            out.append(c)
    return out


def bocyl():
    out = []
    for it in rss("https://bocyl.jcyl.es/rss.do").iter("item"):
        m = re.search(r"(\d{2})/(\d{2})/(\d{4})", it.findtext("title") or "")
        f = f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else date.today().isoformat()
        desc = html.unescape(it.findtext("description") or "")
        for li in re.findall(r"<li.*?</li>", desc, re.S):
            ps = re.findall(r"<p[^>]*>(.*?)</p>", li, re.S)
            if len(ps) < 2:
                continue
            a = re.search(r'href="([^"]+)"', ps[0])
            cab = limpio(ps[0])
            organismo = cab.split(" - ", 1)[-1].title()
            titulo = limpio(ps[1])
            url = a.group(1) if a else "https://bocyl.jcyl.es/"
            c = convocatoria(titulo, organismo, "BOCYL (Castilla y León)", "bocyl-" + url.rsplit("/", 1)[-1].replace(".pdf", ""), f, url, "Castilla y León")
            if c:
                out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int)
    args = ap.parse_args()
    DATA.mkdir(exist_ok=True)
    f = DATA / "publico.json"
    previas = {o["clave"]: o for o in (json.loads(f.read_text(encoding="utf-8")) if f.exists() else [])}
    estado_f = DATA / "estado_publico.json"
    estado = json.loads(estado_f.read_text(encoding="utf-8")) if estado_f.exists() else {}
    hoy = datetime.now(timezone.utc).date()
    if args.dias:
        desde = hoy - timedelta(days=args.dias)
    elif estado.get("ultima"):
        desde = max(date.fromisoformat(estado["ultima"]) - timedelta(days=1), hoy - timedelta(days=10))
    else:
        desde = hoy - timedelta(days=30)
    minimo = json.loads((BASE / "config.json").read_text(encoding="utf-8")).get("publico", {}).get("puntuacion_minima", 40)
    nuevas = []
    from fuentes_estado import registrar
    res_boe, res_uni = [], []
    try:
        res_boe = boe(desde, hoy)
        registrar("BOE (oposiciones y concursos)", resultados=len(res_boe), detalle=f"{len(res_boe)} convocatorias revisadas desde {desde}")
    except Exception as ex:
        registrar("BOE (oposiciones y concursos)", error=f"{type(ex).__name__}: {ex}")
    res_uni = uniovi(desde)
    registrar("Universidad de Oviedo", resultados=len(res_uni), error="" if res_uni or UNIOVI_OK else "no se pudo leer la página de convocatorias",
              detalle=f"{len(res_uni)} plazas desde {desde}")
    autonomicos = []
    for nombre, fn in [("BOPA (Asturias)", lambda: bopa(desde, hoy)), ("BOC (Cantabria)", lambda: boc_cantabria(desde)),
                       ("DOG (Galicia)", dog_galicia), ("BOCYL (Castilla y León)", bocyl)]:
        try:
            r = fn()
            autonomicos += r
            registrar(nombre, resultados=len(r), detalle=f"{len(r)} convocatorias revisadas")
            print(f"{nombre}: {len(r)} convocatorias")
        except Exception as ex:
            print(f"[aviso] {nombre}: {ex}", file=sys.stderr)
            registrar(nombre, error=f"{type(ex).__name__}: {ex}")
    for o in res_boe + res_uni + autonomicos:
        if o["puntuacion"] < minimo:
            continue
        if o["clave"] not in previas:
            nuevas.append(o)
        previas[o["clave"]] = o
    corte = (hoy - timedelta(days=DIAS_GUARDADO)).isoformat()
    vivas = sorted((o for o in previas.values() if o["fecha"] >= corte), key=lambda o: (-o["puntuacion"], o["fecha"]))
    f.write_text(json.dumps(vivas, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "publico_nuevos.json").write_text(json.dumps(nuevas, ensure_ascii=False, indent=1), encoding="utf-8")
    estado_f.write_text(json.dumps({"ultima": hoy.isoformat()}), encoding="utf-8")
    web = BASE / "docs" / "data"
    web.mkdir(parents=True, exist_ok=True)
    (web / "publico.json").write_text(json.dumps(vivas, ensure_ascii=False), encoding="utf-8")
    print(f"Empleo público: {len(vivas)} convocatorias que encajan ({len(nuevas)} nuevas) -> data/publico.json")


if __name__ == "__main__":
    main()
