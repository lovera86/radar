"""Estado de cada fuente: última consulta, última consulta correcta, resultados y errores.

Sirve para que un fallo de una fuente no se confunda con «no hay oportunidades».
Escribe data/fuentes.json y una copia para la web en docs/data/fuentes.json.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
F = BASE / "data" / "fuentes.json"
WEB = BASE / "docs" / "data" / "fuentes.json"


def registrar(nombre, resultados=0, error="", sin_configurar=False, detalle=""):
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        datos = json.loads(F.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        datos = {}
    previo = datos.get(nombre, {})
    estado = "sin_configurar" if sin_configurar else "error" if error else "ok"
    datos[nombre] = {
        "estado": estado,
        "ultima_consulta": ahora,
        "ultima_correcta": ahora if estado == "ok" else previo.get("ultima_correcta"),
        "resultados": resultados,
        "error": (error or "")[:200],
        "detalle": detalle,
    }
    F.parent.mkdir(exist_ok=True)
    F.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    WEB.parent.mkdir(parents=True, exist_ok=True)
    WEB.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
