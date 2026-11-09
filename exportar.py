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
    # Licitaciones abiertas y empresas que suelen ganar contratos parecidos.
    ab_f = DATA / "abiertas.json"
    abiertas = json.loads(ab_f.read_text(encoding="utf-8")) if ab_f.exists() else []
    hoy = date.today().isoformat()
    temas = lambda c: {m for m in c.get("motivos", []) if not m.startswith("CPV") and m != c.get("region") and m != "puntúa el jefe de proyecto" and not m.startswith("ES")}
    cpv5 = lambda c: {x[:5] for x in c.get("cpv", [])}
    salida_ab = []
    for a in abiertas:
        if a.get("plazo", "") < hoy:
            continue
        ta, ca = temas(a), cpv5(a)
        cand = {}
        for c in hist:
            if not c.get("adjudicatario"):
                continue
            puntos = 2 * len(ta & temas(c)) + len(ca & cpv5(c))
            if puntos:
                k = c.get("nif") or c["adjudicatario"]
                e = cand.setdefault(k, {"empresa": c["adjudicatario"], "nif": c.get("nif", ""), "ciudad_empresa": c.get("ciudad_empresa", ""), "puntos": 0, "contratos": 0})
                e["puntos"] += puntos
                e["contratos"] += 1
        top = sorted(cand.values(), key=lambda e: (-bool(contactos.get(e["nif"], {}).get("email")), -e["puntos"]))[:4]
        for e in top:
            ct = contactos.get(e["nif"], {})
            e.update(email=ct.get("email", ""), web=ct.get("web", ""))
            del e["puntos"]
        salida_ab.append({
            "clave": a["expediente"],
            "puntuacion": a["puntuacion"],
            "contrato": a["titulo"],
            "cliente": a.get("organo", ""),
            "region": a.get("region") or NUTS.get((a.get("region_nuts") or "")[:4], "Sin especificar"),
            "comunidad": NUTS.get((a.get("region_nuts") or "")[:4], a.get("region") or "Sin especificar"),
            "importe": round(a["importe"], 2) if a.get("importe") is not None else None,
            "plazo": a["plazo"],
            "pide_pm": a.get("pide_pm", False),
            "criterios": a.get("criterios", []),
            "encaje": ", ".join(m for m in a.get("motivos", []) if not m.startswith("CPV")),
            "url": a.get("url", ""),
            "candidatas": top,
        })
    salida_ab.sort(key=lambda r: (-r["pide_pm"], -r["puntuacion"]))
    (web / "abiertas.json").write_text(json.dumps(salida_ab, ensure_ascii=False), encoding="utf-8")
    meta = {"actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "dias": args.dias, "oportunidades": len(rows), "abiertas": len(salida_ab)}
    (web / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"{len(salida_ab)} licitaciones abiertas -> docs/data/abiertas.json")
    print(f"{len(rows)} filas -> data/panel.json y docs/data/")


if __name__ == "__main__":
    main()
