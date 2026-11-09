"""Radar de oportunidades: contratos públicos adjudicados que encajan con el perfil.

Lee los feeds ATOM de la Plataforma de Contratación del Sector Público (estatal y
plataformas autonómicas agregadas), se queda con los contratos adjudicados cuyo
objeto encaja con el perfil (musealización, gemelos digitales, LiDAR, IA...),
los puntúa y guarda los nuevos en data/nuevas.json. Las empresas adjudicatarias
son las que van a necesitar a alguien que dirija el proyecto.

Uso:
    python radar.py               # desde la última ejecución
    python radar.py --dias 60     # rellena los últimos 60 días
"""
import argparse
import json
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "cbc": "urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2",
    "cpe": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2",
    "cbe": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2",
}
UA = "Mozilla/5.0 (radar-oportunidades; uso personal)"


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower())


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def text(node, path):
    return (node.findtext(path, namespaces=NS) or "").strip() if node is not None else ""


def parse_entry(e):
    cfs = e.find("cpe:ContractFolderStatus", NS)
    if cfs is None:
        return None
    pp = cfs.find("cac:ProcurementProject", NS)
    tr = cfs.find("cac:TenderResult", NS)
    win = tr.find("cac:WinningParty", NS) if tr is not None else None
    party = cfs.find("cpe:LocatedContractingParty/cac:Party", NS)
    link = e.find("a:link", NS)
    importe = text(tr, "cac:AwardedTenderedProject/cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount") or \
        text(pp, "cac:BudgetAmount/cbc:TaxExclusiveAmount")
    return {
        "id": text(e, "a:id").rsplit("/", 1)[-1],
        "expediente": text(cfs, "cbc:ContractFolderID"),
        "estado": text(cfs, "cbe:ContractFolderStatusCode"),
        "titulo": text(pp, "cbc:Name") or text(e, "a:title"),
        "tipo": text(pp, "cbc:TypeCode"),
        "cpv": [c.text for c in pp.findall("cac:RequiredCommodityClassification/cbc:ItemClassificationCode", NS)] if pp is not None else [],
        "region_nuts": text(pp, "cac:RealizedLocation/cbc:CountrySubentityCode"),
        "region": text(pp, "cac:RealizedLocation/cbc:CountrySubentity"),
        "organo": text(party, "cac:PartyName/cbc:Name"),
        "importe": float(importe) if importe else None,
        "adjudicatario": text(win, "cac:PartyName/cbc:Name"),
        "nif": text(win, "cac:PartyIdentification/cbc:ID"),
        "ciudad_empresa": text(win, "cac:PhysicalLocation/cac:Address/cbc:CityName"),
        "fecha_adjudicacion": text(tr, "cbc:AwardDate"),
        "url": link.get("href") if link is not None else "",
        "actualizado": text(e, "a:updated"),
        "plazo": text(cfs, "cac:TenderingProcess/cac:TenderSubmissionDeadlinePeriod/cbc:EndDate"),
        "criterios": criterios(cfs),
    }


# Criterios de adjudicación que puntúan al equipo: ahí es donde una empresa necesita
# presentar con nombre a un jefe/coordinador de proyecto con experiencia.
RE_PERSONAL = re.compile(r"(?i)equipo|personal adscrito|jefe|director|coordinador|responsable|perfil|experiencia (del|de la|de los|adicional)|cualificaci|t[eé]cnico")
RE_PM = re.compile(r"(?i)jefe de proyecto|direcci[oó]n (del|de) proyecto|director (del|de) proyecto|coordinador|responsable (del|de) (proyecto|contrato|servicio|trabajo)|project manager|gesti[oó]n (del|de) proyecto|equipo adscrito|experiencia[^.]{0,40}equipo|experiencia (profesional )?adicional")


def criterios(cfs):
    if cfs is None:
        return []
    out = []
    for c in cfs.findall(".//cac:AwardingCriteria", NS):
        d = (c.findtext("cbc:Description", namespaces=NS) or "").strip()
        if d and RE_PERSONAL.search(d):
            w = c.findtext("cbc:WeightNumeric", namespaces=NS)
            out.append({"texto": re.sub(r"\s+", " ", d)[:200], "peso": float(w) if w else None})
    return out


def puntuar(c, cfg):
    t = norm(c["titulo"])
    if any(x in t for x in cfg["excluir_titulo"]):
        return 0, []
    motivos, p = [], 0
    palabras = dict(cfg["palabras_fuertes"])
    for pref, extra in cfg.get("palabras_extra_region", {}).items():
        if c["region_nuts"].startswith(pref):  # en tu zona también cuentan encajes más parciales
            for kw, w in extra.items():
                palabras[kw] = max(palabras.get(kw, 0), w)
    for kw, w in palabras.items():
        if re.search(r"\b" + re.escape(norm(kw)), t):
            p += w
            motivos.append(kw)
    best_cpv = 0
    for code in c["cpv"]:
        for pref, w in cfg["cpv"].items():
            if code.startswith(pref) and w > best_cpv:
                best_cpv = w
    if best_cpv:
        p += best_cpv
        motivos.append("CPV " + ",".join(c["cpv"][:3]))
    if not motivos or (best_cpv and p == best_cpv and best_cpv < 20):
        return 0, []
    for pref, w in cfg["regiones"].items():
        if c["region_nuts"].startswith(pref):
            p += w
            motivos.append(c["region"] or pref)
            break
    for umbral, w in reversed(cfg["importe"]):
        if c["importe"] and c["importe"] >= umbral:
            p += w
            break
    if c["tipo"] == "1":  # suministros: menos probable que necesiten un PM
        p -= 15
    if c["importe"] is not None and c["importe"] < cfg.get("importe_minimo", 0):
        p -= 20  # contratos pequeños rara vez justifican contratar a alguien
    return max(0, min(100, p)), motivos


def minimo(c, cfg):
    for pref, m in cfg.get("minimo_por_region", {}).items():
        if c["region_nuts"].startswith(pref):
            return m
    return cfg["puntuacion_minima"]


def recorrer(feed, desde):
    url = feed
    while url:
        print(f"[{datetime.now():%H:%M}] {url.rsplit('/', 1)[-1]}", flush=True)
        try:
            raiz = ET.fromstring(fetch(url))
        except Exception as ex:  # una página caída no debe parar el resto
            print(f"[aviso] {url}: {ex}", file=sys.stderr)
            return
        entradas = raiz.findall("a:entry", NS)
        mas_antigua = None
        for e in entradas:
            yield e
            up = text(e, "a:updated")
            if up:
                mas_antigua = up if mas_antigua is None or up < mas_antigua else mas_antigua
        if mas_antigua and datetime.fromisoformat(mas_antigua) < desde:
            return
        nxt = raiz.find("a:link[@rel='next']", NS)
        url = nxt.get("href") if nxt is not None else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, help="ventana hacia atrás en días (por defecto: desde la última ejecución)")
    args = ap.parse_args()
    cfg = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
    DATA.mkdir(exist_ok=True)
    estado_f = DATA / "estado.json"
    estado = json.loads(estado_f.read_text(encoding="utf-8")) if estado_f.exists() else {"vistos": [], "ultima": None}
    vistos = set(estado["vistos"])
    ahora = datetime.now(timezone.utc)
    if args.dias:
        desde = ahora - timedelta(days=args.dias)
    elif estado["ultima"]:
        desde = datetime.fromisoformat(estado["ultima"]) - timedelta(hours=6)
    else:
        desde = ahora - timedelta(days=30)

    nuevas, revisados = [], 0
    hoy = ahora.date().isoformat()
    abiertas_f = DATA / "abiertas.json"
    abiertas = {a["expediente"]: a for a in (json.loads(abiertas_f.read_text(encoding="utf-8")) if abiertas_f.exists() else [])}
    abiertas_nuevas = []
    # Todos los adjudicados, para poder recalcular puntuaciones sin volver a descargar (recalcular.py).
    adjudicados = open(DATA / "adjudicados.jsonl", "a", encoding="utf-8")
    for feed in cfg["feeds"]:
        for e in recorrer(feed, desde):
            c = parse_entry(e)
            revisados += 1
            if not c:
                continue
            if c["estado"] == "PUB" and c["plazo"] >= hoy:
                p, motivos = puntuar(c, cfg)
                c["pide_pm"] = any(RE_PM.search(x["texto"]) for x in c["criterios"])
                if p and c["pide_pm"]:
                    p = min(100, p + 15)
                    motivos.append("puntúa el jefe de proyecto")
                if p >= minimo(c, cfg):
                    c.update(puntuacion=p, motivos=motivos)
                    if c["expediente"] not in abiertas:
                        abiertas_nuevas.append(c)
                    abiertas[c["expediente"]] = c
                continue
            if c["estado"] not in cfg["estados"] or not c["adjudicatario"]:
                continue
            clave = f'{c["expediente"]}|{c["nif"]}'
            if clave in vistos:
                continue
            adjudicados.write(json.dumps(c, ensure_ascii=False) + "\n")
            p, motivos = puntuar(c, cfg)
            if p < minimo(c, cfg):
                continue
            vistos.add(clave)
            c.update(clave=clave, puntuacion=p, motivos=motivos)
            nuevas.append(c)

    adjudicados.close()
    nuevas.sort(key=lambda c: -c["puntuacion"])
    (DATA / "nuevas.json").write_text(json.dumps(nuevas, ensure_ascii=False, indent=1), encoding="utf-8")
    hist_f = DATA / "historico.json"
    hist = json.loads(hist_f.read_text(encoding="utf-8")) if hist_f.exists() else []
    hist_f.write_text(json.dumps(hist + nuevas, ensure_ascii=False, indent=1), encoding="utf-8")
    # Licitaciones abiertas: se quitan las que ya han cerrado o se han adjudicado.
    cerradas = {c["expediente"] for c in nuevas}
    vivas = sorted((a for a in abiertas.values() if a["plazo"] >= hoy and a["expediente"] not in cerradas), key=lambda a: a["plazo"])
    abiertas_f.write_text(json.dumps(vivas, ensure_ascii=False, indent=1), encoding="utf-8")
    nuevas_vivas = [a for a in abiertas_nuevas if a in vivas]
    (DATA / "abiertas_nuevas.json").write_text(json.dumps(nuevas_vivas, ensure_ascii=False, indent=1), encoding="utf-8")
    estado.update(vistos=sorted(vistos), ultima=ahora.isoformat())
    estado_f.write_text(json.dumps(estado, ensure_ascii=False), encoding="utf-8")
    print(f"Revisados {revisados} contratos desde {desde:%Y-%m-%d}; {len(nuevas)} oportunidades nuevas -> data/nuevas.json")
    print(f"Licitaciones abiertas que encajan: {len(vivas)} ({len(nuevas_vivas)} nuevas) -> data/abiertas.json")


if __name__ == "__main__":
    main()
