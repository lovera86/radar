"""Convierte data/historico.json en data/panel.json: filas planas para el panel.

Conserva los contratos de los últimos --dias días (90 por defecto) y añade el
campo `siguiente_paso` si existe en data/notas.json (clave -> texto).
"""
import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
# Nombre de la comunidad cuando el contrato no trae provincia (códigos NUTS 2).
NUTS = {
    "ES11": "Galicia", "ES12": "Asturias", "ES13": "Cantabria", "ES21": "País Vasco", "ES22": "Navarra",
    "ES23": "La Rioja", "ES24": "Aragón", "ES30": "Madrid", "ES41": "Castilla y León", "ES42": "Castilla-La Mancha",
    "ES43": "Extremadura", "ES51": "Cataluña", "ES52": "Comunitat Valenciana", "ES53": "Illes Balears",
    "ES61": "Andalucía", "ES62": "Murcia", "ES63": "Ceuta", "ES64": "Melilla", "ES70": "Canarias",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dias", type=int, default=90)
    args = ap.parse_args()
    hist = json.loads((DATA / "historico.json").read_text(encoding="utf-8"))
    notas_f = DATA / "notas.json"
    notas = json.loads(notas_f.read_text(encoding="utf-8")) if notas_f.exists() else {}
    contactos_f = DATA / "contactos.json"
    contactos = json.loads(contactos_f.read_text(encoding="utf-8")) if contactos_f.exists() else {}
    corte = (date.today() - timedelta(days=args.dias)).isoformat()
    filas = {}
    for c in hist:
        fecha = c.get("fecha_adjudicacion") or c.get("actualizado", "")[:10]
        if fecha < corte:
            continue
        filas[c["clave"]] = {
            "clave": c["clave"],
            "puntuacion": c["puntuacion"],
            "empresa": c["adjudicatario"],
            "ciudad_empresa": c.get("ciudad_empresa", ""),
            "nif": c.get("nif", ""),
            "contrato": c["titulo"],
            "cliente": c.get("organo", ""),
            "region": c.get("region") or NUTS.get((c.get("region_nuts") or "")[:4], "Sin especificar"),
            "comunidad": NUTS.get((c.get("region_nuts") or "")[:4], c.get("region") or "Sin especificar"),
            "importe": round(c["importe"], 2) if c.get("importe") is not None else None,
            "fecha": fecha,
            "encaje": ", ".join(m for m in c.get("motivos", []) if not m.startswith("CPV")),
            "url": c.get("url", ""),
            "siguiente_paso": notas.get(c["clave"], ""),
            "email": contactos.get(c.get("nif", ""), {}).get("email", ""),
            "telefono": contactos.get(c.get("nif", ""), {}).get("telefono", ""),
            "web": contactos.get(c.get("nif", ""), {}).get("web", ""),
        }
    rows = sorted(filas.values(), key=lambda r: (-r["puntuacion"], r["fecha"]), reverse=False)
    (DATA / "panel.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    # Copia para la web (docs/ se publica en GitHub Pages).
    web = DATA.parent / "docs" / "data"
    web.mkdir(parents=True, exist_ok=True)
    (web / "panel.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    meta = {"actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "dias": args.dias, "oportunidades": len(rows)}
    (web / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} filas -> data/panel.json y docs/data/")


if __name__ == "__main__":
    main()
