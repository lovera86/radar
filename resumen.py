"""Resumen diario: abre un aviso (issue) en GitHub con lo nuevo del día.

GitHub manda un correo a la dueña del repositorio por cada aviso nuevo, así que
el resumen llega al email sin guardar contraseñas en ningún sitio. Cierra los
resúmenes anteriores para que solo quede abierto el último.

Necesita las variables GITHUB_TOKEN y GITHUB_REPOSITORY (las pone GitHub Actions).
Sin ellas, imprime el resumen en pantalla.
"""
import json
import os
import urllib.request
from datetime import date
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
WEB = "https://{owner}.github.io/{repo}/"
ETIQUETA = "resumen-diario"


def leer(nombre):
    f = DATA / nombre
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def eur(v):
    return "—" if v is None else f"{v:,.0f} €".replace(",", ".")


def fecha(iso):
    return "/".join(reversed(iso.split("-"))) if iso else "—"


def api(metodo, ruta, datos=None):
    req = urllib.request.Request(
        "https://api.github.com/repos/" + os.environ["GITHUB_REPOSITORY"] + ruta,
        data=json.dumps(datos).encode() if datos is not None else None,
        method=metodo,
        headers={"Authorization": "Bearer " + os.environ["GITHUB_TOKEN"], "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


def main():
    nuevas = [c for c in leer("nuevas.json")]
    abiertas = leer("abiertas_nuevas.json")
    empleos = leer("empleos_nuevos.json")
    if not nuevas and not abiertas and not empleos:
        print("Nada nuevo hoy: no se abre resumen.")
        return
    repo = os.environ.get("GITHUB_REPOSITORY", "usuaria/radar")
    owner, nombre = repo.split("/")
    web = WEB.format(owner=owner, repo=nombre)
    hoy = date.today().strftime("%d/%m/%Y")
    partes = []
    if empleos:
        partes.append(f"{len(empleos)} oferta de empleo" if len(empleos) == 1 else f"{len(empleos)} ofertas de empleo")
    if abiertas:
        partes.append(f"{len(abiertas)} licitación abierta" if len(abiertas) == 1 else f"{len(abiertas)} licitaciones abiertas")
    if nuevas:
        partes.append(f"{len(nuevas)} adjudicación" if len(nuevas) == 1 else f"{len(nuevas)} adjudicaciones")
    titulo = f"Radar {hoy}: " + ", ".join(partes[:-1]) + (" y " if len(partes) > 1 else "") + partes[-1]

    lineas = [f"@{owner}, esto es lo nuevo del radar hoy. Todo está en la web: {web}", ""]
    if empleos:
        lineas += ["## Ofertas de empleo", ""]
        for o in sorted(empleos, key=lambda o: -o["puntuacion"])[:10]:
            lineas.append(f"- **{o['puntuacion']}** · [{o['titulo'][:100]}]({o['url']}) · {o.get('empresa', '')} · {o.get('ubicacion', '')} · {o['fuente']}")
        lineas.append("")
    if abiertas:
        lineas += ["## Licitaciones abiertas: ofrécete para ir en la oferta", ""]
        for a in sorted(abiertas, key=lambda a: (-a.get("pide_pm", False), -a["puntuacion"]))[:8]:
            extra = " · **puntúa el jefe de proyecto**" if a.get("pide_pm") else ""
            lineas.append(f"- **{a['puntuacion']}** · [{a['titulo'][:110]}]({a.get('url', '')}) · {a.get('organo', '')} · {eur(a.get('importe'))} · hasta el {fecha(a.get('plazo', ''))}{extra}")
        lineas.append("")
    if nuevas:
        lineas += ["## Contratos recién adjudicados: escribe a la empresa", ""]
        for c in nuevas[:8]:
            lineas.append(f"- **{c['puntuacion']}** · **{c['adjudicatario']}** · [{c['titulo'][:110]}]({c.get('url', '')}) · {eur(c.get('importe'))}")
        lineas.append("")
    lineas.append(f"Abre la web para preparar el correo con un clic: {web}")
    cuerpo = "\n".join(lineas)

    if not os.environ.get("GITHUB_TOKEN"):
        print(titulo + "\n\n" + cuerpo)
        return
    anteriores = api("GET", f"/issues?state=open&labels={ETIQUETA}&per_page=50")
    nuevo = api("POST", "/issues", {"title": titulo, "body": cuerpo, "labels": [ETIQUETA]})
    for i in anteriores or []:
        api("PATCH", f"/issues/{i['number']}", {"state": "closed", "state_reason": "completed"})
    print("Resumen publicado:", nuevo["html_url"])


if __name__ == "__main__":
    main()
