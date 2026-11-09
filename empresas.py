"""Radar de empresas: señales verificables publicadas en el BORME.

Cada día lee la sección primera del BORME (actos inscritos en el Registro
Mercantil) de las provincias del norte y de Madrid y saca dos tipos de señal:

  1. Empresas nuevas de tu sector (constituciones cuyo CNAE u objeto social
     encaja: ingeniería, topografía, software, I+D, museos, 3D...).
  2. Actos de empresas que ya están en el radar (adjudicatarias o candidatas):
     ampliaciones de capital, sucursales, fusiones, cambios de domicilio u
     objeto... y también avisos (concurso, disolución).

Una señal es un hecho del registro, nunca una vacante. Guarda fuente, URL y
fecha de consulta.

Uso:
    python empresas.py              # desde la última ejecución (máx. 10 días)
    python empresas.py --dias 30    # rellenar
Requiere: pypdf
"""
import argparse
import io
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from pypdf import PdfReader

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
WEB = BASE / "docs" / "data"
UA = "Mozilla/5.0 (radar-oportunidades; uso personal)"
DIAS_GUARDADO = 90
PROVINCIAS = {"ASTURIAS", "CANTABRIA", "A CORUÑA", "LUGO", "OURENSE", "PONTEVEDRA", "LEÓN", "BIZKAIA", "GIPUZKOA", "ARABA/ÁLAVA", "NAVARRA", "MADRID"}
NORTE = PROVINCIAS - {"MADRID"}
COMUNIDAD = {"ASTURIAS": "Asturias", "CANTABRIA": "Cantabria", "A CORUÑA": "Galicia", "LUGO": "Galicia", "OURENSE": "Galicia", "PONTEVEDRA": "Galicia",
             "LEÓN": "Castilla y León", "BIZKAIA": "País Vasco", "GIPUZKOA": "País Vasco", "ARABA/ÁLAVA": "País Vasco", "NAVARRA": "Navarra", "MADRID": "Madrid"}
CNAE = {"7111": "servicios técnicos de arquitectura", "7112": "servicios técnicos de ingeniería", "7120": "ensayos y análisis técnicos",
        "7211": "I+D en biotecnología", "7219": "I+D en ciencias naturales y técnicas", "6201": "programación informática",
        "6202": "consultoría informática", "6209": "otros servicios informáticos", "6311": "proceso de datos", "7410": "diseño especializado",
        "9102": "museos", "7490": "otras actividades profesionales y técnicas", "7022": "consultoría de gestión empresarial"}
TEMAS = [(r"ingenier", "ingeniería"), (r"topograf|cartograf|geomat|geodes", "topografía y cartografía"), (r"fotogrametr|lidar|escane|nube[s]? de puntos|3d\b|tridimensional", "3D y fotogrametría"),
         (r"\bdron|aeronaves? no tripulad|\brpas\b|\buas\b", "drones"), (r"teledetecc|sig\b|sistemas de informacion geografica|\bgis\b", "SIG / teledetección"),
         (r"inteligencia artificial|machine learning|aprendizaje automatico", "inteligencia artificial"), (r"software|aplicaciones informaticas|plataformas? digital", "software"),
         (r"museo|museogr|exposici|patrimonio|interpretacion|contenidos culturales", "museos y patrimonio"), (r"realidad virtual|realidad aumentada|gemelo digital", "realidad virtual / gemelos digitales"),
         (r"investigacion|desarrollo e innovacion|i\+d|innovacion tecnologica", "I+D+i"), (r"gestion de proyectos|direccion de proyectos|project management", "gestión de proyectos"),
         (r"medio ambiente|medioambiental|forestal|monitorizacion ambiental", "medio ambiente y forestal"), (r"batimetr|hidrograf|oceanograf|maritim|portuari", "marítimo y portuario")]
ACTOS = [("Ampliación de capital", "ampliacion_capital", "crecimiento"), ("Apertura de sucursal", "sucursal", "crecimiento"), ("Fusión por absorción", "fusion", "crecimiento"),
         ("Cambio de objeto social", "cambio_objeto", "cambio"), ("Cambio de domicilio social", "cambio_domicilio", "cambio"), ("Nombramientos", "nombramientos", "cambio"),
         ("Situación concursal", "concurso", "aviso"), ("Disolución", "disolucion", "aviso"), ("Extinción", "extincion", "aviso")]
FORMA = re.compile(r"\b(sociedad limitada( unipersonal| laboral| profesional)?|sociedad anonima|s\.?l\.?u?\.?|s\.?a\.?u?\.?|s\.?l\.?l\.?|s\.?l\.?p\.?|sl|sa|slu|sau)\.?$")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def clave_empresa(nombre):
    n = norm(nombre).replace(",", " ").strip(" .")
    for _ in range(2):
        n = FORMA.sub("", n).strip(" .,")
    return re.sub(r"[^a-z0-9]", "", n)


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def lista(x):
    return x if isinstance(x, list) else ([] if x is None else [x])


def conocidas():
    """Empresas ya presentes en el radar (adjudicatarias y candidatas)."""
    out = {}
    for nombre in ("panel", "abiertas"):
        f = WEB / f"{nombre}.json"
        if not f.exists():
            continue
        for r in json.loads(f.read_text(encoding="utf-8")):
            if r.get("empresa"):
                out[clave_empresa(r["empresa"])] = r["empresa"]
            for c in r.get("candidatas", []):
                out[clave_empresa(c["empresa"])] = c["empresa"]
    return {k: v for k, v in out.items() if len(k) >= 5}


def entradas(texto):
    """Divide el texto del PDF en (número, empresa, cuerpo)."""
    partes = re.split(r"(?m)^(\d{5,7}) - (.+?)\.?\s*$", texto)
    for i in range(1, len(partes) - 2, 3):
        cuerpo = re.sub(r"\s*\n\s*", " ", partes[i + 2]).strip()
        yield partes[i], partes[i + 1].strip(), cuerpo


def analizar(empresa, cuerpo):
    datos = {}
    m = re.search(r"Objeto social:\s*(.*?)(?:Domicilio:|Capital:|Nombramientos\.|Datos registrales)", cuerpo)
    if m:
        datos["objeto"] = m.group(1).strip()[:400]
    m = re.search(r"CNAE:\s*(\d{4})", cuerpo)
    if m:
        datos["cnae"] = m.group(1)
    m = re.search(r"Domicilio:\s*([^.]*?\(([^)]+)\))", cuerpo)
    if m:
        muni = m.group(2).strip().title()
        datos["municipio"] = re.sub(r"^(.+) \((\w+)$", r"\2 \1", muni)  # "Coruña (A" -> "A Coruña"
    m = re.search(r"Capital:\s*([\d.,]+)\s*Euros", cuerpo)
    if m:
        datos["capital"] = m.group(1)
    m = re.search(r"Ampliaci[oó]n de capital\.\s*(?:Capital|Suscrito):\s*([\d.,]+)\s*Euros", cuerpo)
    if m:
        datos["ampliacion"] = m.group(1)
    return datos


def relevancia(datos, provincia):
    t = norm(datos.get("objeto", ""))
    temas = [nombre for rx, nombre in TEMAS if re.search(rx, t)]
    p = 0
    motivos = []
    if datos.get("cnae") in CNAE:
        p += 30
        motivos.append(f"CNAE {datos['cnae']}: {CNAE[datos['cnae']]}")
    p += 15 * min(3, len(temas))
    motivos += temas
    if re.search(r"construccion|reformas|hosteler|restaura|comercio al por|inmobiliari", t) and datos.get("cnae") not in CNAE:
        return 0, []
    fuertes = {"inteligencia artificial", "software", "3D y fotogrametría", "drones", "SIG / teledetección", "museos y patrimonio",
               "realidad virtual / gemelos digitales", "I+D+i", "topografía y cartografía", "gestión de proyectos"}
    if not (datos.get("cnae") in CNAE or len(temas) >= 2 or any(x in fuertes for x in temas)):
        return 0, []  # un tema genérico suelto (ingeniería, medio ambiente...) no basta
    if provincia == "ASTURIAS" and p:
        p += 20
        motivos.append("en Asturias")
    return min(100, p), motivos


def leer_dia(dia, known, senales):
    try:
        s = json.loads(get(f"https://www.boe.es/datosabiertos/api/borme/sumario/{dia:%Y%m%d}"))["data"]["sumario"]
    except Exception:
        return 0  # no hay BORME ese día
    leidos = 0
    for diario in lista(s.get("diario")):
        for sec in lista(diario.get("seccion")):
            if sec.get("codigo") != "A":
                continue
            for it in lista(sec.get("item")):
                prov = it.get("titulo", "").strip().upper()
                if prov not in PROVINCIAS:
                    continue
                url = (it.get("url_pdf") or {}).get("texto") if isinstance(it.get("url_pdf"), dict) else it.get("url_pdf")
                if not url:
                    continue
                try:
                    texto = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(get(url, "application/pdf"))).pages)
                except Exception as ex:
                    print(f"[aviso] BORME {dia} {prov}: {ex}", file=sys.stderr)
                    continue
                leidos += 1
                for num, empresa, cuerpo in entradas(texto):
                    datos = analizar(empresa, cuerpo)
                    k = clave_empresa(empresa)
                    base = {"empresa": empresa, "provincia": prov.title(), "comunidad": COMUNIDAD.get(prov, ""), "fecha": f"{dia:%Y-%m-%d}",
                            "municipio": datos.get("municipio", ""), "fuente": {"nombre": "BORME", "url": url, "consultada": date.today().isoformat(), "asiento": num}}
                    if cuerpo.startswith("Constitución") and prov in NORTE:
                        p, motivos = relevancia(datos, prov)
                        if p >= 30:
                            senales[f"{num}|constitucion"] = {**base, "id": f"borme:{num}", "tipo": "constitucion", "categoria": "crecimiento",
                                                              "titulo": "Empresa nueva de tu sector", "objeto": datos.get("objeto", ""), "cnae": datos.get("cnae", ""),
                                                              "capital": datos.get("capital", ""), "puntuacion": p, "motivos": motivos, "conocida": False}
                        continue
                    if k in known:
                        for txt, tipo, cat in ACTOS:
                            if txt in cuerpo:
                                senales[f"{num}|{tipo}"] = {**base, "id": f"borme:{num}:{tipo}", "tipo": tipo, "categoria": cat, "titulo": txt,
                                                            "empresa_radar": known[k], "extracto": cuerpo[:300], "ampliacion": datos.get("ampliacion", ""),
                                                            "conocida": True, "puntuacion": 60 if cat == "crecimiento" else 40 if cat == "cambio" else 20, "motivos": []}
    return leidos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int)
    args = ap.parse_args()
    DATA.mkdir(exist_ok=True)
    f = DATA / "empresas_senales.json"
    previas = {s["id"]: s for s in (json.loads(f.read_text(encoding="utf-8")) if f.exists() else [])}
    est_f = DATA / "estado_empresas.json"
    est = json.loads(est_f.read_text(encoding="utf-8")) if est_f.exists() else {}
    hoy = date.today()
    if args.dias:
        desde = hoy - timedelta(days=args.dias)
    elif est.get("ultima"):
        desde = max(date.fromisoformat(est["ultima"]) - timedelta(days=1), hoy - timedelta(days=10))
    else:
        desde = hoy - timedelta(days=14)
    known = conocidas()
    nuevas_raw = {}
    d, pdfs = desde, 0
    while d <= hoy:
        if d.weekday() < 5:
            pdfs += leer_dia(d, known, nuevas_raw)
            print(f"BORME {d}: {len(nuevas_raw)} señales acumuladas", flush=True)
        d += timedelta(days=1)
    nuevas = [s for s in nuevas_raw.values() if s["id"] not in previas]
    for s in nuevas_raw.values():
        previas[s["id"]] = s
    corte = (hoy - timedelta(days=DIAS_GUARDADO)).isoformat()
    vivas = sorted((s for s in previas.values() if s["fecha"] >= corte), key=lambda s: (-s["puntuacion"], s["fecha"]), reverse=False)
    f.write_text(json.dumps(vivas, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "empresas_nuevas.json").write_text(json.dumps(nuevas, ensure_ascii=False, indent=1), encoding="utf-8")
    est_f.write_text(json.dumps({"ultima": hoy.isoformat()}), encoding="utf-8")
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "empresas.json").write_text(json.dumps(vivas, ensure_ascii=False), encoding="utf-8")
    print(f"{pdfs} PDF del BORME leídos; {len(vivas)} señales vigentes ({len(nuevas)} nuevas) -> data/empresas_senales.json")


if __name__ == "__main__":
    main()
