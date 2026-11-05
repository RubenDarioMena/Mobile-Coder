/* Servicio de lenguaje de Python (Worker de módulo): Jedi 0.19.2 y parso 0.8.6 (web/vendor/jedi/) sobre su propio
 * Pyodide, aparte del que ejecuta los programas: completar no espera a un programa que corre, y ■ no lo reinicia.
 * Los archivos .py del proyecto se copian en /proyecto, así Jedi resuelve los import entre ellos.
 * Mismo protocolo que app/lenguaje-web.js. */
import { loadPyodide } from "../vendor/pyodide/pyodide.mjs";
const enviar = (m) => postMessage(m);
const RUEDAS = ["jedi-0.19.2-py2.py3-none-any.whl", "parso-0.8.6-py2.py3-none-any.whl"];
const RAIZ = "/proyecto/";
const esPython = (r) => /\.py$/i.test(r);

let py = null, servicio = null;
const pendientes = new Map();   // ruta → texto (null: borrado), hasta que Python esté listo
const carga = (async () => {
  enviar({ tipo: "estado", servicio: "python", estado: "cargando" });
  const t0 = performance.now();
  py = await loadPyodide({ indexURL: new URL("../vendor/pyodide/", self.location.href).href });
  const destino = py.runPython("import sysconfig; sysconfig.get_paths()['purelib']");
  for (const r of RUEDAS) {
    const res = await fetch(new URL("../vendor/jedi/" + r, self.location.href));
    if (!res.ok) throw Error(r + ": " + res.status);
    py.unpackArchive(new Uint8Array(await res.arrayBuffer()), "wheel", { extractDir: destino });
  }
  py.FS.mkdirTree("/proyecto");
  servicio = py.runPython(PYTHON);
  // Jedi carga sus tipos de la biblioteca estándar la primera vez: se adelanta aquí.
  servicio.calentar();
  enviar({ tipo: "estado", servicio: "python", estado: "listo", ms: Math.round(performance.now() - t0) });
})();
carga.catch((e) => enviar({ tipo: "estado", servicio: "python", estado: "fallo", mensaje: String((e && e.message) || e) }));

const PYTHON = `
import os, jedi, json
jedi.settings.cache_directory = "/tmp/jedi"
RAIZ = "/proyecto"
_proyecto = jedi.Project(RAIZ, added_sys_path=[RAIZ])
TIPOS = {"function": ("fn", "función"), "class": ("maq", "clase"), "module": ("str", "módulo"), "instance": ("var", "variable"),
         "keyword": ("kw", "palabra clave"), "param": ("var", "parámetro"), "path": ("str", "archivo"), "statement": ("var", "variable"),
         "property": ("prop", "propiedad")}
MENSAJES = {
  "SyntaxError: invalid syntax": "Error de sintaxis",
  "IndentationError: unexpected indent": "Sangría inesperada",
  "IndentationError: unindent does not match any outer indentation level": "La sangría no coincide con ningún nivel anterior",
  "IndentationError: expected an indented block": "Falta un bloque con sangría",
  "SyntaxError: EOL while scanning string literal": "Texto sin cerrar (faltan comillas)",
  "SyntaxError: EOF while scanning triple-quoted string literal": "Texto de triples comillas sin cerrar",
}
def _script(ruta, texto):
    return jedi.Script(texto, path=os.path.join(RAIZ, ruta), project=_proyecto)
def _pos(texto, pos):
    antes = texto[:pos]
    linea = antes.count("\\n") + 1
    return linea, pos - (antes.rfind("\\n") + 1)
def _offset(texto, linea, columna):
    lineas = texto.split("\\n")
    return sum(len(l) + 1 for l in lineas[:linea - 1]) + columna
def calentar():
    try: jedi.Script("import os\\nos.pa", path=os.path.join(RAIZ, "_calentar.py"), project=_proyecto).complete(2, 5)
    except Exception: pass
def completar(ruta, texto, pos):
    linea, col = _pos(texto, pos)
    items = []
    for c in _script(ruta, texto).complete(linea, col)[:200]:
        previo = len(c.name) - len(c.complete)
        cls, nota = TIPOS.get(c.type, (None, c.type))
        oculto = c.name.startswith("_")
        items.append({"etiqueta": c.name, "insertar": c.name, "desde": pos - previo, "hasta": pos, "cls": cls, "nota": nota,
                      "orden": ("2" if c.name.startswith("__") else "1" if oculto else "0") + c.name.lower()})
    return json.dumps({"items": items})
def _destino(d):
    if not d.module_path: return None
    p = str(d.module_path)
    if not p.startswith(RAIZ + "/"): return None
    return p[len(RAIZ) + 1:]
def definicion(ruta, texto, pos):
    linea, col = _pos(texto, pos)
    for d in _script(ruta, texto).goto(linea, col, follow_imports=True):
        destino = _destino(d)
        if destino is None: continue
        modulo = d.type == "module" and (d.line in (None, 1)) and d.column in (None, 0)
        try:
            with open(os.path.join(RAIZ, destino), encoding="utf-8") as f: td = f.read()
        except Exception: continue
        l = d.line or 1
        return json.dumps({"ruta": destino, "linea": 1 if modulo else l, "desde": 0 if modulo else _offset(td, l, d.column or 0), "nombre": None if modulo else d.name})
    return "null"
def diagnosticos(ruta, texto):
    s = _script(ruta, texto)
    out = []
    for e in s.get_syntax_errors():
        m = e.get_message()
        a = _offset(texto, e.line, e.column)
        b = _offset(texto, e.until_line, e.until_column)
        out.append({"desde": a, "hasta": max(a, b), "linea": e.line, "gravedad": "error", "fuente": "python", "mensaje": MENSAJES.get(m, m)})
    # import de módulos que no están ni en el proyecto ni en la biblioteca estándar
    for n in s.get_names(all_scopes=False, definitions=True):
        try:
            codigo = n.get_line_code().strip()
            if not (codigo.startswith("import ") or codigo.startswith("from ")): continue
            if n.goto(follow_imports=True): continue
            a = _offset(texto, n.line, n.column)
            que = "el módulo" if n.type == "module" else ""
            out.append({"desde": a, "hasta": a + len(n.name), "linea": n.line, "gravedad": "aviso", "fuente": "python",
                        "mensaje": f"No se encuentra {que + ' ' if que else ''}«{n.name}» en el proyecto ni en la biblioteca incluida."})
        except Exception:
            pass
    return json.dumps(out)
class Servicio:
    pass
_s = Servicio()
_s.calentar = calentar; _s.completar = completar; _s.definicion = definicion; _s.diagnosticos = diagnosticos
_s
`;

// Los archivos .py del proyecto, en /proyecto (Jedi los lee de ahí para resolver los import).
function escribir(ruta, texto) {
  const f = RAIZ + ruta;
  if (texto == null) { try { py.FS.unlink(f); } catch { /* ya no estaba */ } return; }
  py.FS.mkdirTree(f.slice(0, f.lastIndexOf("/")));
  let previo = null;
  try { previo = py.FS.readFile(f, { encoding: "utf8" }); } catch { /* nuevo */ }
  if (previo !== texto) py.FS.writeFile(f, texto);
}
function vaciar(dir = "/proyecto") {
  for (const n of py.FS.readdir(dir)) {
    if (n === "." || n === "..") continue;
    const f = dir + "/" + n;
    if (py.FS.isDir(py.FS.stat(f).mode)) { vaciar(f); py.FS.rmdir(f); } else py.FS.unlink(f);
  }
}
const textos = new Map();
const ACCIONES = {
  completar: ({ ruta, pos }) => {
    const t = textos.get(ruta) || "", r = JSON.parse(servicio.completar(ruta, t, pos));
    let desde = pos;
    while (desde > 0 && /[\w\u00C0-\uFFFF]/.test(t[desde - 1])) desde--;
    // Como en los demás servicios: lo que empieza por lo escrito primero, los nombres con _ al final, 60 como mucho.
    r.items.sort((a, b) => a.orden.localeCompare(b.orden));
    return { desde, items: r.items.slice(0, 60).map(({ orden, ...it }) => it) };
  },
  definicion: ({ ruta, pos }) => JSON.parse(servicio.definicion(ruta, textos.get(ruta) || "", pos)),
  diagnosticos: ({ ruta, rutas }) => {
    const out = {};
    for (const r of rutas || [ruta]) if (textos.has(r)) out[r] = JSON.parse(servicio.diagnosticos(r, textos.get(r)));
    return out;
  },
};
let cola = Promise.resolve();
self.onmessage = (ev) => {
  const m = ev.data;
  if (m.tipo === "proyecto") {
    textos.clear();
    for (const [r, t] of m.archivos) if (esPython(r)) textos.set(r, t);
    cola = cola.then(async () => { try { await carga; vaciar(); for (const [r, t] of textos) escribir(r, t); } catch { /* sin Python: lo dice el estado */ } });
    return;
  }
  if (m.tipo === "cambio") {
    if (!esPython(m.ruta)) return;
    if (m.texto == null) textos.delete(m.ruta); else textos.set(m.ruta, m.texto);
    cola = cola.then(async () => { try { await carga; escribir(m.ruta, m.texto); } catch { /* ídem */ } });
    return;
  }
  if (m.tipo !== "pedir") return;
  cola = cola.then(async () => {
    try {
      await carga;
      if (m.texto != null) { textos.set(m.ruta, m.texto); escribir(m.ruta, m.texto); }
      enviar({ tipo: "respuesta", id: m.id, ok: true, datos: ACCIONES[m.accion](m) });
    } catch (e) {
      enviar({ tipo: "respuesta", id: m.id, ok: false, error: String((e && e.message) || e) });
    }
  });
};
enviar({ tipo: "listo" });
