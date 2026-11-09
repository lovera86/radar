"""Vuelve a puntuar todos los adjudicados guardados con el config.json actual.

Úsalo tras cambiar palabras, CPV o regiones en config.json: rehace
data/historico.json sin volver a descargar nada.
"""
import json
from pathlib import Path

import radar

DATA = Path(__file__).resolve().parent / "data"


def main():
    cfg = json.loads((radar.BASE / "config.json").read_text(encoding="utf-8"))
    vistos, salida = set(), []
    with open(DATA / "adjudicados.jsonl", encoding="utf-8") as f:
        for linea in f:
            c = json.loads(linea)
            clave = f'{c["expediente"]}|{c["nif"]}'
            if clave in vistos:
                continue
            vistos.add(clave)
            p, motivos = radar.puntuar(c, cfg)
            if p >= radar.minimo(c, cfg):
                c.update(clave=clave, puntuacion=p, motivos=motivos)
                salida.append(c)
    salida.sort(key=lambda c: -c["puntuacion"])
    (DATA / "historico.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(vistos)} adjudicados revisados; {len(salida)} oportunidades -> data/historico.json")


if __name__ == "__main__":
    main()
