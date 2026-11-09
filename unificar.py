"""Motor común de RADAR: convierte las cuatro fuentes en un único modelo de oportunidad.

Lee los ficheros que ya genera el radar (docs/data/empleos, publico, abiertas,
panel) y escribe docs/data/oportunidades.json, donde cada registro tiene:
tipo, subtipo, verificación, organización, ubicación, modalidad, salario,
fechas, fuentes, datos (confirmados o inferidos), los seis criterios de
puntuación (valor 0-1 o «sin información», con motivos) y la acción recomendada.

La puntuación total no se guarda: la web la calcula con los pesos del perfil,
así se pueden cambiar sin tocar código.

Uso:
    python unificar.py
"""
import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
WEB = BASE / "docs" / "data"
HOY = date.today()
_cfg = json.loads((BASE / "config.json").read_text(encoding="utf-8")) if (BASE / "config.json").exists() else {}
PUESTOS = {unicodedata.normalize("NFKD", k).encode("ascii", "ignore").decode().lower(): v for k, v in _cfg.get("empleo", {}).get("puestos", {}).items()}

NORTE = {"Galicia", "Cantabria", "País Vasco", "Navarra", "Castilla y León"}
REGIONES_MOTIVO = re.compile(r"^(asturias|galicia|cantabria|pais vasco|navarra|castilla|madrid|remoto|teletrabajo|remote|en remoto|"
                             r"gijon|oviedo|aviles|llanera|siero|coruna|santander|leon|bilbao|universidad de oviedo|es\d)", re.I)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def leer(nombre):
    f = WEB / f"{nombre}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def dias(iso):
    try:
        return (HOY - date.fromisoformat(iso[:10])).days
    except (TypeError, ValueError):
        return None


def crit(valor, motivos, sin_info=False):
    return {"valor": None if sin_info else round(max(0.0, min(1.0, valor)), 2), "motivos": motivos, "sin_info": sin_info}


def temas(encaje):
    return [t.strip() for t in (encaje or "").split(",") if t.strip() and not REGIONES_MOTIVO.match(norm(t.strip()))]


# ------------------------------------------------------------ modalidad y lugar

def modalidad(texto):
    t = norm(texto)
    if re.search(r"remot|teletrabajo|remote|anywhere", t):
        return "remoto", "confirmado"
    if re.search(r"hibrid|hybrid", t):
        return "hibrido", "confirmado"
    if re.search(r"presencial|on-?site", t):
        return "presencial", "confirmado"
    return "desconocida", None


def geografia(comunidad, mod):
    if mod == "remoto":
        return crit(1.0, ["en remoto"])
    if comunidad == "Asturias":
        return crit(1.0, ["en Asturias"])
    if comunidad in NORTE:
        return crit(0.6 if mod != "hibrido" else 0.7, [f"en {comunidad} (norte)"] + (["híbrido"] if mod == "hibrido" else []))
    if mod == "hibrido":
        if comunidad and comunidad not in ("Sin especificar", "Remoto"):
            return crit(0.5, [f"híbrido en {comunidad}: habría que ir a la oficina algunos días"])
        return crit(0.5, ["híbrido sin ciudad indicada: confirma dónde está la oficina"])
    if comunidad and comunidad not in ("Sin especificar", "Estatal / otras"):
        return crit(0.25, [f"presencial fuera de Asturias ({comunidad})"])
    if comunidad == "Estatal / otras":
        return crit(0.5, ["ámbito estatal: plazas en varias provincias"])
    return crit(0, [], sin_info=True)


def calidad(fecha_pub, url, completos, plazo=None):
    motivos, v = [], 0.5
    d = dias(fecha_pub)
    if d is not None:
        if d <= 7:
            v, m = 1.0, f"publicada hace {d} día{'s' if d != 1 else ''}"
        elif d <= 30:
            v, m = 0.7, f"publicada hace {d} días"
        else:
            v, m = 0.4, f"publicada hace {d} días"
        motivos.append(m)
    else:
        motivos.append("fecha de publicación desconocida")
    if plazo:
        q = -dias(plazo) if dias(plazo) is not None else None
        if q is not None and q <= 3:
            v -= 0.2
            motivos.append(f"el plazo cierra en {max(q, 0)} día{'s' if q != 1 else ''}")
    if not url:
        v -= 0.2
        motivos.append("sin enlace a la fuente")
    v += 0.05 * (completos - 3)
    return crit(v, motivos)


def salario(texto):
    if not texto:
        return crit(0, [], sin_info=True)
    nums = [float(n.replace(".", "").replace(",", ".")) for n in re.findall(r"\d{2,3}(?:[.,]\d{3})+|\d{4,6}", texto)]
    nums = [n * 1000 if n < 1000 else n for n in nums]
    if not nums:
        return crit(0.5, [f"salario publicado: {texto}"])
    tope = max(nums)
    v = 1.0 if tope >= 40000 else 0.8 if tope >= 32000 else 0.6 if tope >= 26000 else 0.35
    return crit(v, [f"salario publicado: {texto}"])


# ------------------------------------------------------------ fuentes

def descripciones():
    f = BASE / "data" / "empleos.json"
    try:
        return {o["clave"]: o.get("descripcion", "") for o in json.loads(f.read_text(encoding="utf-8"))}
    except (OSError, ValueError):
        return {}


def desde_empleos(filas, consultada):
    out = []
    desc = descripciones()
    for o in filas:
        tags = temas(o.get("encaje"))
        rol, resto = (tags[0], tags[1:]) if tags else ("", [])
        peso_rol = PUESTOS.get(norm(rol), 30)
        enc = 0.35 + 0.4 * peso_rol / 45 + 0.12 * len(resto)
        t = norm(o["titulo"])
        acc_m, acc = ["candidatura directa por el portal"], 0.7
        if re.search(r"\bsenior\b|\bsr\b|director|head of|lead\b", t):
            acc, acc_m = 0.55, ["puesto sénior: revisa los años de experiencia que piden"]
        if re.search(r"\bpmp\b", t):
            acc -= 0.1
            acc_m.append("piden PMP; tienes CAPM (certificación del mismo organismo, nivel inicial)")
        mod, mod_origen = modalidad(o.get("ubicacion", ""))
        com = o.get("comunidad") or ""
        if com == "Remoto":
            mod, mod_origen = "remoto", "confirmado"
        datos = [{"campo": "Empresa", "valor": o.get("empresa", ""), "origen": "confirmado"},
                 {"campo": "Ubicación", "valor": o.get("ubicacion", ""), "origen": "confirmado"},
                 {"campo": "Modalidad", "valor": mod, "origen": mod_origen or "desconocido"}]
        if o.get("salario"):
            datos.append({"campo": "Salario", "valor": o["salario"], "origen": "confirmado"})
        out.append({
            "id": "emp:" + o["clave"], "origen": {"lista": "emp", "clave": o["clave"]},
            "tipo": "empleo", "subtipo": "oferta", "verificacion": "vacante_confirmada",
            "titulo": o["titulo"], "organizacion": {"nombre": o.get("empresa", ""), "nif": ""},
            "ubicacion": {"texto": o.get("ubicacion", ""), "comunidad": com}, "modalidad": mod,
            "salario": {"texto": o.get("salario") or None}, "importe": None,
            "fechas": {"publicada": o.get("fecha") or o.get("visto"), "plazo": None, "consultada": o.get("visto") or consultada},
            "fuentes": [{"nombre": o.get("fuente", ""), "url": o.get("url", ""), "consultada": o.get("visto") or consultada}],
            "datos": datos, "etiquetas": tags, "descripcion": desc.get(o["clave"], ""),
            "criterios": {
                "encaje": crit(enc, ([f"puesto: {rol}"] if rol else []) + [f"tema: {x}" for x in resto]),
                "necesidad": crit(1.0, ["vacante publicada"]),
                "geografia": geografia(com, mod),
                "calidad": calidad(o.get("fecha") or o.get("visto"), o.get("url"), 3 + bool(o.get("salario")) + bool(o.get("empresa"))),
                "salario": salario(o.get("salario")),
                "acceso": crit(acc, acc_m),
            },
            "accion": {"tipo": "preparar_candidatura", "url": o.get("url", "")},
        })
    return out


def desde_publico(filas, consultada):
    out = []
    for o in filas:
        tags = [t.strip() for t in (o.get("encaje") or "").split(",") if t.strip()]
        texto = norm(o.get("titulo", "") + " " + (o.get("encaje") or ""))
        enc, enc_m = 0.4, []
        if "ingenieria tecnica industrial" in texto or "gestion del estado" in texto:
            enc, enc_m = 0.9, ["plaza para tu titulación (A2)"]
        elif "gestion de proyectos" in texto:
            enc, enc_m = 0.8, ["gestión de proyectos"]
        elif "grupo a2" in texto:
            enc, enc_m = 0.7, ["grupo A2, tu nivel"]
        elif "ingenieria tecnica" in texto:
            enc, enc_m = 0.5, ["ingeniería técnica de otra especialidad"]
        if "tema afin" in texto:
            enc += 0.15
            enc_m.append("tema afín (IA, digital, patrimonio…)")
        acc, acc_m = 0.6, ["proceso selectivo: revisa requisitos y plazo en las bases"]
        if re.search(r"obras publicas|ingenieria civil|arquitect", texto):
            acc, acc_m = 0.15, ["exige otra titulación (Obras Públicas / Ingeniería Civil)"]
        elif "ingenieria tecnica industrial" in texto or "gestion del estado" in texto:
            acc, acc_m = 0.85, ["tu titulación cumple el requisito de acceso"]
        elif o.get("fuente") == "Universidad de Oviedo":
            acc, acc_m = 0.65, ["contrato de proyecto: requisitos en la convocatoria"]
        com = o.get("comunidad") or ""
        partes = (o.get("titulo") or "").split(" — ")
        titulo = partes[1] if len(partes) > 1 else partes[0]
        out.append({
            "id": "pub:" + o["clave"], "origen": {"lista": "pub", "clave": o["clave"]},
            "tipo": "empleo", "subtipo": "oposicion" if o.get("fuente") == "BOE" else "contrato_publico",
            "verificacion": "vacante_confirmada",
            "titulo": titulo, "resolucion": partes[0] if len(partes) > 1 else "",
            "organizacion": {"nombre": o.get("organismo", ""), "nif": ""},
            "ubicacion": {"texto": partes[0] if com == "Asturias" else o.get("organismo", ""), "comunidad": com},
            "modalidad": "presencial", "salario": {"texto": None}, "importe": None,
            "fechas": {"publicada": o.get("fecha"), "plazo": None, "consultada": consultada},
            "fuentes": [{"nombre": o.get("fuente", ""), "url": o.get("url", ""), "consultada": consultada}],
            "datos": [{"campo": "Organismo", "valor": o.get("organismo", ""), "origen": "confirmado"},
                      {"campo": "Modalidad", "valor": "presencial", "origen": "inferido"},
                      {"campo": "Plazo de solicitud", "valor": "ver bases", "origen": "desconocido"}],
            "etiquetas": tags,
            "criterios": {
                "encaje": crit(enc, enc_m or ["puesto técnico"]),
                "necesidad": crit(1.0, ["plaza convocada oficialmente"]),
                "geografia": geografia(com, "presencial"),
                "calidad": calidad(o.get("fecha"), o.get("url"), 3),
                "salario": crit(0, [], sin_info=True),
                "acceso": crit(acc, acc_m),
            },
            "accion": {"tipo": "preparar_candidatura", "url": o.get("url", "")},
        })
    return out


def enc_proyecto(tags):
    return crit(0.45 + 0.15 * len(tags), [f"tema: {t}" for t in tags] or ["encaje parcial por tipo de servicio"])


def desde_abiertas(filas, consultada):
    out = []
    for a in filas:
        tags = [t for t in temas(a.get("encaje")) if t != "puntúa el jefe de proyecto"]
        nec, nec_m = 0.5, ["licitación abierta: la empresa que gane necesitará ejecutarla"]
        if a.get("pide_pm"):
            nec, nec_m = 0.75, nec_m + ["los criterios puntúan la experiencia del jefe de proyecto o del equipo"]
        con_email = [c for c in a.get("candidatas", []) if c.get("email")]
        acc = 0.55 if con_email else 0.35
        acc_m = [f"{len(con_email)} empresa{'s' if len(con_email) != 1 else ''} candidata{'s' if len(con_email) != 1 else ''} con correo verificado"] if con_email \
            else ["sin correo verificado de empresas candidatas: buscar en LinkedIn"]
        com = a.get("comunidad") or ""
        out.append({
            "id": "ab:" + a["clave"], "origen": {"lista": "ab", "clave": a["clave"]},
            "tipo": "proyecto", "subtipo": "licitacion_abierta", "verificacion": "proyecto_en_licitacion",
            "titulo": a["contrato"], "organizacion": {"nombre": a.get("cliente", ""), "nif": ""}, "cliente": a.get("cliente", ""),
            "ubicacion": {"texto": a.get("region", ""), "comunidad": com}, "modalidad": "desconocida",
            "salario": {"texto": None}, "importe": a.get("importe"),
            "fechas": {"publicada": None, "plazo": a.get("plazo"), "consultada": consultada},
            "fuentes": [{"nombre": "Plataforma de Contratación del Sector Público", "url": a.get("url", ""), "consultada": consultada}],
            "datos": [{"campo": "Órgano de contratación", "valor": a.get("cliente", ""), "origen": "confirmado"},
                      {"campo": "Importe de licitación", "valor": a.get("importe"), "origen": "confirmado"},
                      {"campo": "Fin de plazo de ofertas", "valor": a.get("plazo"), "origen": "confirmado"},
                      {"campo": "Necesidad de Project Manager", "valor": "posible", "origen": "inferido"}]
                     + [{"campo": "Criterio de adjudicación", "valor": c["texto"] + (f" ({c['peso']:g} puntos)" if c.get("peso") else ""), "origen": "confirmado"}
                        for c in a.get("criterios", [])[:3]],
            "etiquetas": tags + (["puntúa el jefe de proyecto"] if a.get("pide_pm") else []),
            "criterios": {
                "encaje": enc_proyecto(tags),
                "necesidad": crit(nec, nec_m),
                "geografia": geografia(com, "desconocida") if com else crit(0, [], sin_info=True),
                "calidad": calidad(None, a.get("url"), 4, plazo=a.get("plazo")),
                "salario": crit(0, [], sin_info=True),
                "acceso": crit(acc, acc_m),
            },
            "candidatas": a.get("candidatas", []), "criterios_adjudicacion": a.get("criterios", []), "pide_pm": a.get("pide_pm", False),
            "accion": {"tipo": "ofrecerse_a_licitadores", "url": a.get("url", "")},
        })
    return out


def desde_adjudicados(filas, consultada):
    out = []
    for r in filas:
        tags = temas(r.get("encaje"))
        imp = r.get("importe") or 0
        nec, nec_m = 0.4, ["proyecto adjudicado: posible necesidad, no es una vacante"]
        if imp >= 200000:
            nec, nec_m = 0.55, nec_m + ["importe alto: más probable que refuercen el equipo"]
        acc, acc_m = (0.75, ["correo verificado en la web oficial de la empresa"]) if r.get("email") else (0.4, ["sin correo verificado: buscar responsable en LinkedIn"])
        com = r.get("comunidad") or ""
        out.append({
            "id": "adj:" + r["clave"], "origen": {"lista": "adj", "clave": r["clave"]},
            "tipo": "proyecto", "subtipo": "adjudicacion", "verificacion": "proyecto_adjudicado",
            "titulo": r["contrato"], "organizacion": {"nombre": r.get("empresa", ""), "nif": r.get("nif", "")}, "cliente": r.get("cliente", ""),
            "ubicacion": {"texto": r.get("region", ""), "comunidad": com}, "modalidad": "desconocida",
            "salario": {"texto": None}, "importe": r.get("importe"),
            "fechas": {"publicada": r.get("fecha"), "plazo": None, "consultada": consultada},
            "fuentes": [{"nombre": "Plataforma de Contratación del Sector Público", "url": r.get("url", ""), "consultada": consultada}]
                       + ([{"nombre": "Web oficial de la empresa", "url": r["web"], "consultada": consultada}] if r.get("web") else []),
            "datos": [{"campo": "Adjudicataria", "valor": r.get("empresa", ""), "origen": "confirmado"},
                      {"campo": "Cliente", "valor": r.get("cliente", ""), "origen": "confirmado"},
                      {"campo": "Importe adjudicado", "valor": r.get("importe"), "origen": "confirmado"},
                      {"campo": "Fecha de adjudicación", "valor": r.get("fecha"), "origen": "confirmado"},
                      {"campo": "Correo de la empresa", "valor": r.get("email") or None, "origen": "confirmado" if r.get("email") else "desconocido"},
                      {"campo": "Necesidad de Project Manager", "valor": "posible", "origen": "inferido"}],
            "etiquetas": tags,
            "criterios": {
                "encaje": enc_proyecto(tags),
                "necesidad": crit(nec, nec_m),
                "geografia": geografia(com, "desconocida") if com else crit(0, [], sin_info=True),
                "calidad": calidad(r.get("fecha"), r.get("url"), 4 + bool(r.get("email"))),
                "salario": crit(0, [], sin_info=True),
                "acceso": crit(acc, acc_m),
            },
            "contacto": {"email": r.get("email", ""), "telefono": r.get("telefono", ""), "web": r.get("web", "")},
            "ciudad_empresa": r.get("ciudad_empresa", ""),
            "accion": {"tipo": "contactar_empresa", "url": r.get("url", "")},
        })
    return out


def desde_senales(filas, consultada):
    """Señales de empresa del BORME. Nunca son vacantes: necesidad potencial e inferida."""
    out = []
    for g in filas:
        if g.get("categoria") != "crecimiento":
            continue  # cambios y avisos solo se muestran en la vista Empresas
        com = g.get("comunidad", "")
        nueva = g["tipo"] == "constitucion"
        temas_g = [m for m in g.get("motivos", []) if not m.startswith("CNAE") and m != "en Asturias"]
        if nueva:
            enc = crit(0.35 + 0.12 * len(temas_g) + (0.15 if g.get("cnae") else 0), g.get("motivos", [])[:4])
            nec = crit(0.3, ["empresa recién constituida: puede necesitar perfiles, pero no hay ninguna vacante"])
            titulo = f"Empresa nueva de tu sector: {g['empresa']}"
            datos = [{"campo": "Acto inscrito", "valor": "Constitución", "origen": "confirmado"},
                     {"campo": "Objeto social", "valor": g.get("objeto") or None, "origen": "confirmado"},
                     {"campo": "Capital", "valor": (g.get("capital") + " €") if g.get("capital") else None, "origen": "confirmado"},
                     {"campo": "Domicilio", "valor": g.get("municipio") or None, "origen": "confirmado"}]
        else:
            enc = crit(0.6, [f"ya gana contratos de tu perfil ({g.get('empresa_radar', g['empresa'])})"])
            nec = crit(0.45, [f"{g['titulo'].lower()}: señal de crecimiento, no es una vacante"])
            titulo = f"{g['titulo']}: {g['empresa']}"
            datos = [{"campo": "Acto inscrito", "valor": g["titulo"], "origen": "confirmado"},
                     {"campo": "Extracto del BORME", "valor": g.get("extracto") or None, "origen": "confirmado"}]
            if g.get("ampliacion"):
                datos.append({"campo": "Capital tras la ampliación", "valor": g["ampliacion"] + " €", "origen": "confirmado"})
        datos += [{"campo": "Necesidad de perfiles", "valor": "posible", "origen": "inferido"},
                  {"campo": "Contacto", "valor": None, "origen": "desconocido"}]
        out.append({
            "id": "emp-senal:" + g["id"], "origen": {"lista": "senal", "clave": g["id"]},
            "tipo": "empresa", "subtipo": "senal_empresa", "verificacion": "necesidad_potencial",
            "titulo": titulo, "organizacion": {"nombre": g["empresa"], "nif": ""},
            "ubicacion": {"texto": g.get("municipio") or g.get("provincia", ""), "comunidad": com}, "modalidad": "desconocida",
            "salario": {"texto": None}, "importe": None,
            "fechas": {"publicada": g["fecha"], "plazo": None, "consultada": g["fuente"].get("consultada", consultada)},
            "fuentes": [{"nombre": "BORME", "url": g["fuente"]["url"], "consultada": g["fuente"].get("consultada", consultada)}],
            "datos": datos, "etiquetas": temas_g,
            "criterios": {
                "encaje": enc, "necesidad": nec,
                "geografia": geografia(com, "desconocida") if com else crit(0, [], sin_info=True),
                "calidad": calidad(g["fecha"], g["fuente"]["url"], 3),
                "salario": crit(0, [], sin_info=True),
                "acceso": crit(0.3, ["sin contacto verificado: buscar su web y responsables en LinkedIn"]),
            },
            "accion": {"tipo": "contactar_empresa", "url": g["fuente"]["url"]},
        })
    return out


def main():
    meta_f = WEB / "meta.json"
    meta = json.loads(meta_f.read_text(encoding="utf-8")) if meta_f.exists() else {}
    consultada = (meta.get("actualizado") or datetime.now().isoformat())[:10]
    todas = (desde_empleos(leer("empleos"), consultada) + desde_publico(leer("publico"), consultada)
             + desde_abiertas(leer("abiertas"), consultada) + desde_adjudicados(leer("panel"), consultada)
             + desde_senales(leer("empresas"), consultada))
    # Deduplicación: mismo tipo, mismo título y misma organización -> se juntan las fuentes.
    unicas, vistas, duplicadas = [], {}, 0
    for o in todas:
        k = (o["tipo"], norm(o["titulo"])[:120], norm(o["organizacion"]["nombre"])[:60])
        if k in vistas:
            duplicadas += 1
            previa = vistas[k]
            for f in o["fuentes"]:
                if f["url"] not in {x["url"] for x in previa["fuentes"]}:
                    previa["fuentes"].append(f)
            continue
        vistas[k] = o
        unicas.append(o)
    for o in unicas:
        con = sum(1 for c in o["criterios"].values() if not c["sin_info"])
        inferidos = sum(1 for x in o["datos"] if x["origen"] == "inferido")
        o["confianza"] = "baja" if con <= 3 else "media" if (con == 4 or inferidos or o["modalidad"] == "desconocida") else "alta"
    (WEB / "oportunidades.json").write_text(json.dumps(unicas, ensure_ascii=False), encoding="utf-8")
    meta.update(oportunidades_total=len(unicas), duplicadas=duplicadas)
    meta_f.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    por_tipo = {}
    for o in unicas:
        por_tipo[o["subtipo"]] = por_tipo.get(o["subtipo"], 0) + 1
    print(f"{len(unicas)} oportunidades en el modelo común ({duplicadas} duplicadas unidas): {por_tipo}")


if __name__ == "__main__":
    main()
