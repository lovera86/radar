"""Noticias de expansión, nuevos proyectos y contratos (Google News RSS).

Busca titulares recientes que combinen una señal de crecimiento o contratación
(nueva sede, contratará, expansión, nuevo proyecto, adjudica...) con tu sector
(ingeniería, tecnología, IA, 3D, patrimonio, puertos...) y tu zona. Cada noticia
es un hecho publicado por un medio, con enlace; lo que implique para el empleo
es una hipótesis.

Uso:
    python noticias.py
"""
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
WEB = BASE / "docs" / "data"
UA = "Mozilla/5.0 (radar-oportunidades; uso personal)"
DIAS_GUARDADO = 30

CONSULTAS = [
    'Asturias ("nueva sede" OR contratará OR "puestos de trabajo" OR expansión OR "nuevo centro") (ingeniería OR tecnológica OR digital OR software)',
    'Asturias (adjudica OR "nuevo proyecto" OR "gemelo digital" OR "inteligencia artificial") (empresa OR consultora OR ingeniería)',
    '(Gijón OR Oviedo OR Avilés) (empresa tecnológica OR ingeniería) (contratará OR "nuevos empleos" OR crece OR invierte)',
    '(museo OR musealización OR exposición) (adjudica OR "nuevo proyecto") (Asturias OR Galicia OR Cantabria)',
    '(Galicia OR Cantabria OR "País Vasco") (ingeniería OR tecnológica) ("nueva sede" OR contratará OR expansión) (gemelo OR 3D OR IA OR digital)',
]
CRECIMIENTO = r"nueva sede|nuevo centro|nueva planta|contratar|contratara|empleos|puestos de trabajo|expansion|amplia|ampliacion|invierte|inversion|crece|abre|adjudica|nuevo proyecto|lanza|incorpora"
SECTOR = r"ingenier|tecnolog|digital|software|inteligencia artificial|\bia\b|3d|gemelo|dron|topograf|cartograf|fotogram|lidar|museo|musealiz|patrimonio|exposici|puerto|portuari|industria 4|i\+d|innovacion|datos|robot"
ZONA = r"asturias|gijon|oviedo|aviles|llanera|siero|galicia|coruna|vigo|cantabria|santander|leon|bilbao|pais vasco|navarra"
RUIDO = r"parking|aparcamiento|tienda|restaurante|hotel|becas?|abogad|futbol|deport|concierto|loteria|sucesos|incendio|accidente|fallece|tiempo|elecciones|partido|juicio|tribunal|carretera|hosteler|supermercado|inmobiliari|vivienda"


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def puntuar(titulo):
    t = norm(titulo)
    if re.search(RUIDO, t):
        return 0, []
    crec = re.findall(CRECIMIENTO, t)
    sect = re.findall(SECTOR, t)
    if not crec or not sect:
        return 0, []
    p = 25 + 10 * min(2, len(set(crec))) + 10 * min(3, len(set(sect)))
    motivos = sorted(set(crec))[:2] + sorted(set(sect))[:3]
    if re.search(ZONA, t):
        p += 15
        motivos.append("en tu zona")
    return min(100, p), motivos


def main():
    DATA.mkdir(exist_ok=True)
    f = DATA / "noticias.json"
    previas = {n["url"]: n for n in (json.loads(f.read_text(encoding="utf-8")) if f.exists() else [])}
    nuevas, leidas, errores = [], 0, []
    for q in CONSULTAS:
        url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q + " when:7d", "hl": "es", "gl": "ES", "ceid": "ES:es"})
        try:
            raiz = ET.fromstring(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read())
        except Exception as ex:
            errores.append(f"{type(ex).__name__}")
            print(f"[aviso] noticias: {ex}", file=sys.stderr)
            continue
        for it in raiz.iter("item"):
            leidas += 1
            titulo = (it.findtext("title") or "").strip()
            medio = (it.findtext("source") or "").strip()
            if medio and titulo.endswith(" - " + medio):
                titulo = titulo[: -len(" - " + medio)]
            enlace = (it.findtext("link") or "").strip()
            p, motivos = puntuar(titulo)
            if p < 55 or not enlace or enlace in previas:
                continue
            try:
                fecha = parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
            except Exception:
                fecha = date.today().isoformat()
            n = {"id": "news:" + str(abs(hash(enlace)) % 10**12), "titulo": titulo, "medio": medio, "url": enlace, "fecha": fecha,
                 "puntuacion": p, "motivos": motivos, "consultada": date.today().isoformat()}
            previas[enlace] = n
            nuevas.append(n)
    corte = (date.today() - timedelta(days=DIAS_GUARDADO)).isoformat()
    vivas = sorted((n for n in previas.values() if n["fecha"] >= corte), key=lambda n: (-n["puntuacion"], n["fecha"]))
    f.write_text(json.dumps(vivas, ensure_ascii=False, indent=1), encoding="utf-8")
    WEB.mkdir(parents=True, exist_ok=True)
    (WEB / "noticias.json").write_text(json.dumps(vivas, ensure_ascii=False), encoding="utf-8")
    sys.path.insert(0, str(BASE))
    from fuentes_estado import registrar
    registrar("Noticias (Google News)", resultados=leidas, error="; ".join(errores[:2]) if errores and not leidas else "",
              detalle=f"{leidas} titulares revisados; {len(nuevas)} noticias nuevas relevantes")
    print(f"{leidas} titulares revisados; {len(vivas)} noticias relevantes ({len(nuevas)} nuevas) -> data/noticias.json")


if __name__ == "__main__":
    main()
