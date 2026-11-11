"""Comprueba un perfil del piloto antes de enviarlo y genera su bloque de búsqueda.

Uso:
    python piloto/validar_perfil.py ruta/al/perfil.json
    python piloto/validar_perfil.py ruta/al/perfil.json --config   # además lo añade a config.json (piloto)
    python piloto/validar_perfil.py ruta/al/perfil.json --enlace   # y genera su enlace personal de acceso

El bloque que va a config.json NO lleva datos personales: solo puestos, temas, zona,
consultas de búsqueda y palabras de empleo público.
"""
import base64
import json
import re
import sys
import zlib
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
NUTS = {"Galicia": "es11", "Asturias": "es12", "Cantabria": "es13", "País Vasco": "es21", "Navarra": "es22", "La Rioja": "es23", "Aragón": "es24",
        "Madrid": "es30", "Castilla y León": "es41", "Castilla-La Mancha": "es42", "Extremadura": "es43", "Cataluña": "es51",
        "Comunitat Valenciana": "es52", "Illes Balears": "es53", "Andalucía": "es61", "Murcia": "es62", "Canarias": "es70"}


def errores(p):
    e = []
    if p.get("version") != 1:
        e.append('"version" debe ser 1')
    for k in ("id", "nombre", "region", "busqueda", "cv"):
        if not p.get(k):
            e.append(f'falta "{k}"')
    if p.get("region") and p["region"] not in NUTS:
        e.append(f'"region" debe ser una comunidad: {", ".join(NUTS)}')
    cv = p.get("cv", {})
    temas = cv.get("temas", {})
    if not temas:
        e.append("cv.temas vacío (hace falta al menos un enfoque)")
    for k, t in temas.items():
        for c in ("nombre", "titular", "perfil", "habilidades"):
            if not t.get(c):
                e.append(f"cv.temas.{k}: falta {c}")
        try:
            re.compile(t.get("detectar") or k)
        except re.error as x:
            e.append(f"cv.temas.{k}.detectar no es una expresión válida: {x}")
    for i, x in enumerate(cv.get("experiencia", [])):
        for c in ("puesto", "empresa", "fechas", "vinetas"):
            if not x.get(c):
                e.append(f"cv.experiencia[{i}]: falta {c}")
        for v in x.get("vinetas", []):
            for t in (v.get("temas", []) if isinstance(v, dict) else []):
                if t not in temas:
                    e.append(f"cv.experiencia[{i}]: el tema «{t}» no existe en cv.temas")
    if not cv.get("experiencia"):
        e.append("cv.experiencia vacío")
    if not p.get("busqueda", {}).get("puestos"):
        e.append("busqueda.puestos vacío")
    for r in p.get("roles", []):
        try:
            re.compile(r.get("rx", ""))
        except re.error as x:
            e.append(f"rol {r.get('nombre')}: rx no válida: {x}")
    for k, pr in (p.get("propuesta") or {}).items():
        if k not in temas:
            e.append(f"propuesta.{k}: ese enfoque no existe en cv.temas")
        for a in pr.get("aportaciones", []):
            if len(a) < 2:
                e.append(f"propuesta.{k}: cada aportación es [texto, patrón de evidencia, texto en inglés opcional]")
                continue
            texto_cv = json.dumps(cv, ensure_ascii=False)
            if not re.search(a[1], texto_cv, re.I):
                e.append(f"propuesta.{k}: la evidencia «{a[1]}» no aparece en el CV (la aportación no saldría)")
    return e


def bloque_config(p):
    b = p["busqueda"]
    puestos = sorted(b["puestos"], key=lambda k: -b["puestos"][k])
    return {
        "id": p["id"], "region": p["region"], "nuts": [NUTS[p["region"]]],
        "consultas": p.get("consultas") or puestos[:3],
        "remoto": p.get("consultas_remoto") or [x for x in puestos if re.search(r"[a-z]", x)][:2],
        "publico": p.get("publico", []),
        "busqueda": {k: b.get(k, {} if k != "excluir" else []) for k in ("puestos", "temas", "lugares", "excluir")},
    }


WEB = "https://lovera86.github.io/radar/"


def enlace(p):
    """Enlace personal: el perfil comprimido va tras «#acceso=» (no llega a ningún servidor)."""
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    datos = c.compress(json.dumps(p, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + c.flush()
    return WEB + "#acceso=z" + base64.urlsafe_b64encode(datos).decode().rstrip("=")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    ruta = Path(sys.argv[1])
    p = json.loads(ruta.read_text(encoding="utf-8"))
    e = errores(p)
    if e:
        print("El perfil tiene problemas:")
        for x in e:
            print("  -", x)
        sys.exit(2)
    print(f"Perfil correcto: {p['nombre']} ({p['region']}), {len(p['cv']['experiencia'])} experiencias, {len(p['cv']['temas'])} enfoques.")
    bloque = bloque_config(p)
    print("Bloque para config.json → piloto:")
    print(json.dumps(bloque, ensure_ascii=False, indent=2))
    if "--config" in sys.argv:
        f = BASE / "config.json"
        c = json.loads(f.read_text(encoding="utf-8"))
        c["piloto"] = [x for x in c.get("piloto", []) if x.get("id") != bloque["id"]] + [bloque]
        f.write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Añadido a config.json (piloto: {len(c['piloto'])} perfiles).")
    if "--enlace" in sys.argv:
        url = enlace(p)
        print()
        print(f"Enlace personal ({len(url)} caracteres). Envíalo por un canal privado:")
        print(url)


if __name__ == "__main__":
    main()
