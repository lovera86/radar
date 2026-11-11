"""Ofertas de empleo: reúne ofertas de varios portales y las puntúa según el perfil.

Fuentes sin clave (funcionan siempre):
  - Tecnoempleo: canales RSS oficiales de alertas.
  - Remotive: API pública de empleo en remoto (solo ofertas abiertas a Europa).

Alertas de empleo por correo (LinkedIn e InfoJobs): ALERTAS_EMAIL y ALERTAS_APP_PASSWORD.

Fuentes con clave gratuita (se activan solas si existe la variable de entorno):
  - InfoJobs (API oficial):    INFOJOBS_ID, INFOJOBS_SECRET   -> developer.infojobs.net
  - Jooble (agregador; recoge ofertas de muchos portales):  JOOBLE_KEY  -> es.jooble.org/api/about
  - Adzuna (agregador):        ADZUNA_ID, ADZUNA_KEY         -> developer.adzuna.com

Más fuentes sin clave:
  - EURES (portal europeo de empleo): incluye las ofertas del SEPE y de los servicios
    públicos de empleo autonómicos (Trabajastur en Asturias). Pocas llamadas al día.
  - Himalayas y Jobicy: APIs públicas de empleo en remoto (se enlaza su ficha).
  - Portales de empresas con API o RSS públicos: Greenhouse, Lever, Teamtailor,
    Workable, Recruitee, Personio y SmartRecruiters (lista en config.json). Solo se
    quedan las ofertas en España o en remoto.

LinkedIn e Indeed no ofrecen una forma permitida de leer ofertas automáticamente;
la web enlaza sus búsquedas ya preparadas.

Uso:
    python empleos.py
"""
import base64
import html
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
UA = "Mozilla/5.0 (radar-oportunidades; uso personal)"
DIAS_GUARDADO = 30


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def limpio(s):
    s = re.sub(r"<[^>]+>", " ", html.unescape(s or ""))
    return re.sub(r"\s+", " ", s).strip()


def get(url, headers=None, data=None):
    h = {"User-Agent": UA, "Accept": "application/json, application/xml, text/xml, */*"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h, data=data)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


ERRORES = {}


def aviso(fuente, ex):
    print(f"[aviso] {fuente}: {ex}", file=sys.stderr)
    ERRORES.setdefault(fuente.split(" ")[0], []).append(f"{type(ex).__name__}: {str(ex)[:80]}")


# ---------------------------------------------------------------- fuentes

def tecnoempleo(cfg):
    out = []
    terminos = list(dict.fromkeys(cfg["busquedas_tecnoempleo"] + [q for p in cfg.get("_piloto", []) for q in p.get("consultas", [])[:3]]))
    for termino in terminos:
        url = "https://www.tecnoempleo.com/alertas-empleo-rss.php?te=" + urllib.parse.quote(termino)
        try:
            raiz = ET.fromstring(get(url))
        except Exception as ex:
            aviso("Tecnoempleo " + termino, ex)
            continue
        for it in raiz.iter("item"):
            desc = it.findtext("description") or ""
            campo = lambda n: limpio((re.search(r"<b>" + n + r":</b>(.*?)(<br|$)", desc, re.S) or [None, ""])[1])
            fecha = it.findtext("pubDate")
            out.append({
                "fuente": "Tecnoempleo",
                "titulo": limpio(it.findtext("title")),
                "empresa": campo("Empresa"),
                "ubicacion": ", ".join(x for x in (campo("Población"), campo("Provincia")) if x),
                "descripcion": campo("Descripción")[:600],
                "url": (it.findtext("link") or "").strip(),
                "fecha": parsedate_to_datetime(fecha).date().isoformat() if fecha else "",
                "salario": "",
            })
    return out


def remotive(cfg):
    try:
        d = json.loads(get("https://remotive.com/api/remote-jobs?category=project-management"))
    except Exception as ex:
        aviso("Remotive", ex)
        return []
    out = []
    for j in d.get("jobs", []):
        loc = j.get("candidate_required_location", "")
        if not re.search(r"(?i)worldwide|europe|emea|spain|españa|anywhere", loc):
            continue
        out.append({
            "fuente": "Remotive", "titulo": j["title"], "empresa": j.get("company_name", ""),
            "ubicacion": "Remoto (" + loc + ")", "descripcion": limpio(j.get("description"))[:600],
            "url": j.get("url", ""), "fecha": (j.get("publication_date") or "")[:10], "salario": j.get("salary") or "",
        })
    return out


def infojobs(cfg):
    i, s = os.environ.get("INFOJOBS_ID"), os.environ.get("INFOJOBS_SECRET")
    if not (i and s):
        return []
    auth = "Basic " + base64.b64encode(f"{i}:{s}".encode()).decode()
    out = []
    for q in cfg["busquedas"]:
        url = "https://api.infojobs.net/api/9/offer?" + urllib.parse.urlencode({"q": q, "maxResults": 50, "sinceDate": "_7_DAYS", "order": "updated-desc"})
        try:
            d = json.loads(get(url, {"Authorization": auth}))
        except Exception as ex:
            aviso("InfoJobs " + q, ex)
            continue
        for o in d.get("offers", []):
            out.append({
                "fuente": "InfoJobs", "titulo": o.get("title", ""), "empresa": (o.get("author") or {}).get("name", ""),
                "ubicacion": ", ".join(x for x in (o.get("city"), (o.get("province") or {}).get("value"), (o.get("teleworking") or {}).get("value")) if x),
                "descripcion": " · ".join(x for x in ((o.get("experienceMin") or {}).get("value"), (o.get("contractType") or {}).get("value")) if x),
                "url": o.get("link", ""), "fecha": (o.get("updated") or o.get("published") or "")[:10],
                "salario": (o.get("salaryDescription") or ""),
            })
    return out


def jooble(cfg):
    key = os.environ.get("JOOBLE_KEY")
    if not key:
        return []
    out = []
    for q in cfg["busquedas"]:
        for loc in cfg["ubicaciones"]:
            try:
                d = json.loads(get("https://es.jooble.org/api/" + key, {"Content-Type": "application/json"},
                                   json.dumps({"keywords": q, "location": loc, "page": "1"}).encode()))
            except Exception as ex:
                aviso(f"Jooble {q}/{loc}", ex)
                continue
            for o in d.get("jobs", []):
                out.append({
                    "fuente": "Jooble · " + (o.get("source") or "varios"), "titulo": limpio(o.get("title")), "empresa": o.get("company", ""),
                    "ubicacion": o.get("location", ""), "descripcion": limpio(o.get("snippet"))[:600],
                    "url": o.get("link", ""), "fecha": (o.get("updated") or "")[:10], "salario": o.get("salary", ""),
                })
    return out


def adzuna(cfg):
    i, k = os.environ.get("ADZUNA_ID"), os.environ.get("ADZUNA_KEY")
    if not (i and k):
        return []
    out = []
    for q in cfg["busquedas"]:
        url = "https://api.adzuna.com/v1/api/jobs/es/search/1?" + urllib.parse.urlencode(
            {"app_id": i, "app_key": k, "what_phrase": q, "results_per_page": 50, "max_days_old": 7})
        try:
            d = json.loads(get(url))
        except Exception as ex:
            aviso("Adzuna " + q, ex)
            continue
        for o in d.get("results", []):
            out.append({
                "fuente": "Adzuna", "titulo": limpio(o.get("title")), "empresa": (o.get("company") or {}).get("display_name", ""),
                "ubicacion": (o.get("location") or {}).get("display_name", ""), "descripcion": limpio(o.get("description"))[:600],
                "url": o.get("redirect_url", ""), "fecha": (o.get("created") or "")[:10],
                "salario": f"{o['salary_min']:,.0f}–{o['salary_max']:,.0f} €".replace(",", ".") if o.get("salary_min") and o.get("salary_max") else "",
            })
    return out


def alertas(cfg):
    """LinkedIn e InfoJobs a través de tus alertas de empleo por correo (ver alertas_correo.py)."""
    if str(BASE) not in sys.path:
        sys.path.insert(0, str(BASE))
    from alertas_correo import leer_alertas
    dias = int(os.environ.get("ALERTAS_DIAS", "3"))
    return leer_alertas(dias)


NUTS = {"ES11": "Galicia", "ES12": "Asturias", "ES13": "Cantabria", "ES21": "País Vasco", "ES22": "Navarra", "ES23": "La Rioja", "ES24": "Aragón",
        "ES30": "Madrid", "ES41": "Castilla y León", "ES42": "Castilla-La Mancha", "ES51": "Cataluña", "ES52": "Comunitat Valenciana",
        "ES53": "Illes Balears", "ES61": "Andalucía", "ES62": "Murcia", "ES70": "Canarias"}


def titulo_limpio(t):
    t = re.sub(r"\s*\((?:ref|cod)[^)]*\)\s*", " ", t or "", flags=re.I).strip()
    return t[:1] + t[1:].lower() if t.isupper() else t


def eures(cfg):
    """EURES: ofertas del SEPE y de los servicios públicos de empleo (incluido Trabajastur), por zona."""
    url = "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search"
    norte = ["es12", "es13", "es11", "es21", "es41"]
    busquedas = [(norte, "proyecto"), (norte, "project"), (["es"], "project manager"), (["es"], "pmo")]
    for p in cfg.get("_piloto", []):
        busquedas += [(p.get("nuts") or ["es"], q) for q in p.get("consultas", [])[:3]]
    out, vistos = [], set()
    for locs, kw in busquedas:
        cuerpo = {"resultsPerPage": 50, "page": 1, "sortSearch": "MOST_RECENT", "keywords": [{"keyword": kw, "specificSearchCode": "TITLE"}],
                  "publicationPeriod": None, "occupationUris": [], "skillUris": [], "requiredExperienceCodes": [], "positionScheduleCodes": [],
                  "sectorCodes": [], "educationAndQualificationLevelCodes": [], "positionOfferingCodes": [], "locationCodes": locs,
                  "euresFlagCodes": [], "otherBenefitsCodes": [], "requiredLanguages": [], "minNumberPost": None, "sessionId": "radar"}
        try:
            d = json.loads(get(url, {"Content-Type": "application/json"}, json.dumps(cuerpo).encode()))
        except Exception as ex:
            aviso("EURES", ex)
            continue
        for j in d.get("jvs", []):
            if j.get("id") in vistos:
                continue
            vistos.add(j.get("id"))
            codigos = [c for v in (j.get("locationMap") or {}).values() for c in v]
            lugar = next((NUTS[c[:4]] for c in codigos if c[:4] in NUTS), "España")
            ms = j.get("creationDate") or j.get("lastModificationDate")
            out.append({"fuente": "EURES (servicios públicos de empleo)", "titulo": titulo_limpio(j.get("title", "")),
                        "empresa": ((j.get("employer") or {}).get("name") or "").strip(), "ubicacion": lugar,
                        "descripcion": limpio(j.get("description"))[:600], "url": f"https://europa.eu/eures/portal/jv-se/jv-details/{j['id']}?lang=es",
                        "fecha": datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat() if ms else "", "salario": ""})
    return out


def himalayas(cfg):
    """Himalayas: empleo en remoto abierto a España."""
    out = []
    extra = tuple((q, 1) for p in cfg.get("_piloto", []) for q in p.get("remoto", [])[:2])
    for q, paginas in (("project manager", 2), ("program manager", 1), ("pmo", 1)) + extra:
        for pg in range(1, paginas + 1):
            try:
                d = json.loads(get("https://himalayas.app/jobs/api/search?" + urllib.parse.urlencode({"q": q, "country": "ES", "sort": "recent", "page": pg})))
            except Exception as ex:
                aviso("Himalayas", ex)
                break
            for j in d.get("jobs", []):
                sal = f"{j['minSalary']}-{j['maxSalary']} {j.get('currency') or ''}".strip() if j.get("minSalary") and j.get("maxSalary") else ""
                paises = j.get("locationRestrictions") or []
                out.append({"fuente": "Himalayas (remoto)", "titulo": j.get("title", ""), "empresa": j.get("companyName", ""),
                            "ubicacion": "Remoto (abierto a España)" if "Spain" in paises else "Remoto (" + (", ".join(paises[:3]) if paises else "global") + ")", "descripcion": limpio(j.get("excerpt") or j.get("description"))[:600],
                            "url": j.get("applicationLink") or j.get("guid", ""),
                            "fecha": datetime.fromtimestamp(j["pubDate"], timezone.utc).date().isoformat() if j.get("pubDate") else "", "salario": sal})
    return out


def jobicy(cfg):
    """Jobicy: empleo en remoto abierto a España (una consulta al día; se enlaza su ficha)."""
    try:
        d = json.loads(get("https://jobicy.com/api/v2/remote-jobs?" + urllib.parse.urlencode({"count": 50, "geo": "spain", "tag": "project manager"})))
    except Exception as ex:
        aviso("Jobicy", ex)
        return []
    return [{"fuente": "Jobicy (remoto)", "titulo": limpio(j.get("jobTitle")), "empresa": j.get("companyName", ""), "ubicacion": "Remoto (" + (j.get("jobGeo") or "España") + ")",
             "descripcion": limpio(j.get("jobExcerpt"))[:600], "url": j.get("url", ""), "fecha": (j.get("pubDate") or "")[:10], "salario": ""} for j in d.get("jobs", [])]


ESPANA = re.compile(r"spain|espana|españa|\bes\b|madrid|barcelona|bilbao|getxo|valencia|sevilla|malaga|zaragoza|oviedo|gijon|aviles|santander|vigo|coruna|pamplona|"
                    r"san sebastian|donostia|vitoria|valladolid|burgos|leon|beasain|tres cantos|asturias|galicia|cantabria|navarra|euskadi|pais vasco|catalu|andalucia", re.I)
EUROPA_REMOTO = re.compile(r"europe|emea|anywhere|worldwide|global|spain|espana|españa", re.I)


def en_espana_o_remoto(lugar, remoto=False):
    t = norm(lugar)
    if not t:
        return remoto
    if ESPANA.search(t):
        return True
    return bool((remoto or re.search(r"remot", t)) and EUROPA_REMOTO.search(t))


def local(tag):
    return tag.rsplit("}", 1)[-1]


def corporativos(cfg):
    """Portales de empleo de empresas con API o RSS públicos. Solo ofertas en España o en remoto."""
    out = []
    for p in cfg.get("portales_corporativos", []):
        try:
            empresa, ats, ident = p["empresa"], p["ats"], p["id"]
            fuente = f"Web de {empresa}"
            if ats == "teamtailor":
                raiz = ET.fromstring(get(ident))
                for it in raiz.iter("item"):
                    lugares, remoto = [], False
                    for e in it.iter():
                        n = local(e.tag)
                        if n in ("city", "country") and (e.text or "").strip():
                            lugares.append(e.text.strip())
                        if n == "remoteStatus" and (e.text or "") in ("fully", "hybrid"):
                            remoto = remoto or e.text == "fully"
                            lugares.append("remoto" if e.text == "fully" else "híbrido")
                    try:
                        fecha = parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
                    except Exception:
                        fecha = ""
                    out.append({"fuente": fuente, "titulo": (it.findtext("title") or "").strip(), "empresa": empresa, "ubicacion": " · ".join(dict.fromkeys(lugares)),
                                "descripcion": limpio(it.findtext("description"))[:600], "url": (it.findtext("link") or "").strip(), "fecha": fecha, "salario": "", "_remoto": remoto})
            elif ats == "workable":
                d = json.loads(get(f"https://apply.workable.com/api/v1/widget/accounts/{ident}"))
                for j in d.get("jobs", []):
                    out.append({"fuente": fuente, "titulo": j.get("title", ""), "empresa": empresa, "ubicacion": ", ".join(x for x in (j.get("city"), j.get("country")) if x) + (" · remoto" if j.get("telecommuting") else ""),
                                "descripcion": "", "url": j.get("url", ""), "fecha": (j.get("published_on") or "")[:10], "salario": "", "_remoto": bool(j.get("telecommuting"))})
            elif ats == "recruitee":
                d = json.loads(get(f"https://{ident}.recruitee.com/api/offers/"))
                for j in d.get("offers", []):
                    out.append({"fuente": fuente, "titulo": j.get("title", ""), "empresa": empresa, "ubicacion": (j.get("location") or "") + (" · remoto" if j.get("remote") else ""),
                                "descripcion": limpio(j.get("description"))[:600], "url": j.get("careers_url", ""), "fecha": (j.get("published_at") or "")[:10], "salario": "", "_remoto": bool(j.get("remote"))})
            elif ats == "personio":
                raiz = ET.fromstring(get(f"https://{ident}.jobs.personio.de/xml?language=es"))
                for pos in raiz.findall("position"):
                    out.append({"fuente": fuente, "titulo": (pos.findtext("name") or "").strip(), "empresa": empresa, "ubicacion": (pos.findtext("office") or "").strip(),
                                "descripcion": "", "url": f"https://{ident}.jobs.personio.de/job/{pos.findtext('id')}", "fecha": (pos.findtext("createdAt") or "")[:10], "salario": ""})
            elif ats == "smartrecruiters":
                d = json.loads(get(f"https://api.smartrecruiters.com/v1/companies/{ident}/postings?country=es&limit=100"))
                for j in d.get("content", []):
                    loc = j.get("location") or {}
                    out.append({"fuente": fuente, "titulo": j.get("name", ""), "empresa": empresa, "ubicacion": ", ".join(x for x in (loc.get("city"), "España") if x) + (" · remoto" if loc.get("remote") else ""),
                                "descripcion": "", "url": f"https://jobs.smartrecruiters.com/{ident}/{j.get('id')}", "fecha": (j.get("releasedDate") or "")[:10], "salario": ""})
            elif ats == "greenhouse":
                d = json.loads(get(f"https://boards-api.greenhouse.io/v1/boards/{ident}/jobs"))
                for j in d.get("jobs", []):
                    out.append({"fuente": fuente, "titulo": j.get("title", ""), "empresa": empresa,
                                "ubicacion": (j.get("location") or {}).get("name", ""), "descripcion": "", "url": j.get("absolute_url", ""),
                                "fecha": (j.get("updated_at") or "")[:10], "salario": ""})
            elif ats == "lever":
                d = json.loads(get(f"https://api.lever.co/v0/postings/{ident}?mode=json"))
                for j in d:
                    cat = j.get("categories") or {}
                    out.append({"fuente": fuente, "titulo": j.get("text", ""), "empresa": empresa,
                                "ubicacion": cat.get("location", "") + (" · " + j.get("workplaceType", "") if j.get("workplaceType") else ""),
                                "descripcion": limpio(j.get("descriptionPlain", ""))[:600], "url": j.get("hostedUrl", ""), "fecha": "", "salario": ""})
        except Exception as ex:
            aviso("Portales " + p.get("empresa", "?"), ex)
    return [o for o in out if en_espana_o_remoto(o["ubicacion"], o.pop("_remoto", False))]


FUENTES = [tecnoempleo, remotive, eures, himalayas, jobicy, infojobs, jooble, adzuna, alertas, corporativos]


# ---------------------------------------------------------------- puntuación

def puntuar(o, cfg):
    t = re.sub(r"/as?\b|\(as?\)", "", norm(o["titulo"]))
    todo = norm(" ".join((o["titulo"], o["descripcion"], o["empresa"])))
    lugar = norm(o["ubicacion"] + " " + o["descripcion"][:200])
    if any(re.search(r"\b" + re.escape(norm(x)), t) for x in cfg["excluir"]):
        return 0, []
    p, motivos = 0, []
    rol = max(((w, k) for k, w in cfg["puestos"].items() if re.search(r"\b" + re.escape(norm(k)), t)), default=(0, ""))
    if not rol[0]:
        return 0, []
    p += rol[0]
    motivos.append(rol[1])
    extra = 0
    for k, w in cfg["temas"].items():
        if re.search(r"\b" + re.escape(norm(k)), todo):
            extra += w
            motivos.append(k)
    p += min(extra, 30)
    for k, w in cfg["lugares"].items():
        if re.search(r"\b" + re.escape(norm(k)), lugar):
            p += w
            motivos.append(k)
            break
    return max(0, min(100, p)), motivos


PROVINCIAS = {
    "Asturias": ["asturias", "gijon", "oviedo", "aviles", "llanera", "siero", "mieres", "langreo"],
    "Galicia": ["galicia", "coruna", "lugo", "ourense", "pontevedra", "vigo", "santiago de compostela", "ferrol"],
    "Cantabria": ["cantabria", "santander", "torrelavega"],
    "País Vasco": ["pais vasco", "euskadi", "bizkaia", "vizcaya", "gipuzkoa", "guipuzcoa", "alava", "araba", "bilbao", "donostia", "san sebastian", "vitoria"],
    "Navarra": ["navarra", "pamplona"],
    "Castilla y León": ["castilla y leon", "leon", "burgos", "valladolid", "palencia", "salamanca", "zamora", "soria", "segovia", "avila", "ponferrada"],
    "Madrid": ["madrid"],
    "Cataluña": ["barcelona", "cataluna", "catalunya", "girona", "tarragona", "lleida"],
    "Comunitat Valenciana": ["valencia", "alicante", "castellon"],
    "Andalucía": ["andalucia", "sevilla", "malaga", "granada", "cordoba", "cadiz", "huelva", "almeria", "jaen"],
    "Aragón": ["aragon", "zaragoza", "huesca", "teruel"],
}


def comunidad(o):
    t = norm(o["ubicacion"])
    for c, claves in PROVINCIAS.items():
        if any(re.search(r"\b" + k + r"\b", t) for k in claves):
            return c
    return "Remoto" if re.search(r"remot|teletrabajo|remote", t) else "Sin especificar"


# ---------------------------------------------------------------- principal

def main():
    config = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
    cfg = config["empleo"]
    cfg["_piloto"] = config.get("piloto", [])
    perfiles = [cfg] + [{"puestos": p["busqueda"].get("puestos", {}), "temas": p["busqueda"].get("temas", {}),
                         "lugares": p["busqueda"].get("lugares", {}), "excluir": p["busqueda"].get("excluir", [])} for p in cfg["_piloto"] if p.get("busqueda")]
    DATA.mkdir(exist_ok=True)
    f = DATA / "empleos.json"
    previas = {o["clave"]: o for o in (json.loads(f.read_text(encoding="utf-8")) if f.exists() else [])}
    hoy = datetime.now(timezone.utc).date()
    nuevas, vistas = [], 0
    from fuentes_estado import registrar
    NOMBRES = {"tecnoempleo": "Tecnoempleo", "remotive": "Remotive", "infojobs": "InfoJobs (API)", "jooble": "Jooble", "adzuna": "Adzuna", "alertas": "Alertas de LinkedIn e InfoJobs (correo)", "corporativos": "Portales de empresas (Greenhouse, Lever, Teamtailor, Workable, Recruitee, Personio, SmartRecruiters)",
               "eures": "EURES (SEPE y servicios públicos de empleo)", "himalayas": "Himalayas (remoto)", "jobicy": "Jobicy (remoto)"}
    CLAVES = {"infojobs": ("INFOJOBS_ID", "INFOJOBS_SECRET"), "jooble": ("JOOBLE_KEY",), "adzuna": ("ADZUNA_ID", "ADZUNA_KEY"), "alertas": ("ALERTAS_EMAIL", "ALERTAS_APP_PASSWORD")}
    for fuente in FUENTES:
        lote = fuente(cfg)
        vistas += len(lote)
        print(f"{fuente.__name__}: {len(lote)} ofertas", flush=True)
        n = fuente.__name__
        sin_conf = (n in CLAVES and not all(os.environ.get(k) for k in CLAVES[n])) or (n == "corporativos" and not cfg.get("portales_corporativos"))
        errs = ERRORES.get(NOMBRES[n].split(" ")[0], [])
        if n == "alertas" and not sin_conf:
            try:
                parte = json.loads((DATA / "estado_alertas.json").read_text(encoding="utf-8"))
                if parte.get("error"):
                    errs = [parte["error"]]
                det = "conectado a Gmail; correos: " + ", ".join(f"{k} {v}" for k, v in parte.get("correos", {}).items()) if parte.get("conectado") else ""
            except (OSError, ValueError):
                det = ""
        else:
            det = f"{len(lote)} ofertas leídas"
        registrar(NOMBRES[n], resultados=len(lote), error="; ".join(errs[:2]) if errs and not lote else "", sin_configurar=sin_conf,
                  detalle="falta la clave" if sin_conf else det + (f"; {len(errs)} avisos" if errs and lote else ""))
        for o in lote:
            if not o["titulo"] or not o["url"]:
                continue
            p, motivos = max((puntuar(o, pc) for pc in perfiles), key=lambda x: x[0])
            if p < cfg["puntuacion_minima"]:
                continue
            o["solo_piloto"] = puntuar(o, cfg)[0] < cfg["puntuacion_minima"]  # solo encaja con perfiles del piloto
            clave = norm(o["titulo"] + "|" + o["empresa"])[:160]
            o.update(clave=clave, puntuacion=p, encaje=", ".join(motivos), comunidad=comunidad(o))
            if clave in previas:
                o["visto"] = previas[clave].get("visto", hoy.isoformat())
                if previas[clave]["puntuacion"] >= p:
                    continue
            else:
                o["visto"] = hoy.isoformat()
                nuevas.append(o)
            previas[clave] = o
    corte = (hoy - timedelta(days=DIAS_GUARDADO)).isoformat()
    vivas = sorted((o for o in previas.values() if o["visto"] >= corte), key=lambda o: (-o["puntuacion"], o["visto"]))
    f.write_text(json.dumps(vivas, ensure_ascii=False, indent=1), encoding="utf-8")
    nuevas = [o for o in nuevas if o in vivas]
    (DATA / "empleos_nuevos.json").write_text(json.dumps(nuevas, ensure_ascii=False, indent=1), encoding="utf-8")
    web = BASE / "docs" / "data"
    web.mkdir(parents=True, exist_ok=True)
    campos = ("clave", "puntuacion", "titulo", "empresa", "ubicacion", "fuente", "url", "fecha", "visto", "salario", "encaje", "comunidad", "solo_piloto")
    (web / "empleos.json").write_text(json.dumps([{k: o.get(k, "") for k in campos} for o in vivas], ensure_ascii=False), encoding="utf-8")
    print(f"Revisadas {vistas} ofertas; {len(vivas)} encajan ({len(nuevas)} nuevas) -> data/empleos.json")


if __name__ == "__main__":
    main()
