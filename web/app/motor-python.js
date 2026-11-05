/* Motor de Python (Worker de módulo; Pyodide 314 no admite Workers clásicos): Pyodide, es decir CPython 3.14 compilado a WebAssembly, servido desde los
 * activos de la app (web/vendor/pyodide/). Sin conexión: no se cargan paquetes de Internet; solo la biblioteca estándar.
 * Python se carga una vez; cada ejecución usa un espacio de nombres nuevo (__name__ == "__main__").
 * Los .py y los datos del proyecto se copian en /proyecto: los import entre archivos funcionan como en CPython.
 * Detener un programa termina este Worker: la app crea otro y Python vuelve a cargarse.
 * Mensajes de salida: listo { version, ms }, fallo { mensaje }, salida { clase, texto } y fin { id, ok, error }. */
import { loadPyodide } from "../vendor/pyodide/pyodide.mjs";
const enviar = (m) => postMessage(m);

// La salida llega en bytes; se decodifica sin cortar caracteres y se envía tal cual (la consola arma las líneas).
// isatty: Python vacía la salida en cada salto de línea, así un bucle largo se ve mientras corre.
const escritor = (clase) => {
  const dec = new TextDecoder();
  return { isatty: true, write(buf) { const texto = dec.decode(buf, { stream: true }); if (texto) enviar({ tipo: "salida", clase, texto }); return buf.length; } };
};

// input() necesita que el Worker espere a la consola; llega en una entrega posterior (PROGRESO.md).
const PRELUDIO = `
import builtins as _b
def _input_pendiente(prompt=""):
    raise RuntimeError("input() todavía no está disponible en Mobile Coder: la consola aún no recibe texto")
_b.input = _input_pendiente
del _b, _input_pendiente
`;

let py = null;
const carga = (async () => {
  const t0 = performance.now();
  py = await loadPyodide({ indexURL: new URL("../vendor/pyodide/", self.location.href).href });
  py.setStdout(escritor("salida"));
  py.setStderr(escritor("error"));
  py.runPython(PRELUDIO);
  const version = py.runPython("import sys; sys.version.split()[0]");
  enviar({ tipo: "listo", version, ms: Math.round(performance.now() - t0) });
})();
carga.catch((e) => enviar({ tipo: "fallo", mensaje: String((e && e.message) || e) }));

// Los archivos del proyecto se copian en /proyecto antes de cada ejecución: así funcionan los import entre archivos
// .py y se pueden leer los datos del proyecto (lo que el programa escriba ahí no se guarda en la carpeta).
const RAIZ = "/proyecto";
function vaciar(dir) {
  for (const n of py.FS.readdir(dir)) {
    if (n === "." || n === "..") continue;
    const f = dir + "/" + n;
    if (py.FS.isDir(py.FS.stat(f).mode)) { vaciar(f); py.FS.rmdir(f); } else py.FS.unlink(f);
  }
}
function copiar(archivos) {
  py.FS.mkdirTree(RAIZ);
  vaciar(RAIZ);
  for (const [ruta, texto] of Object.entries(archivos)) {
    const f = RAIZ + "/" + ruta;
    py.FS.mkdirTree(f.slice(0, f.lastIndexOf("/")));
    py.FS.writeFile(f, texto);
  }
}
// Antes de cada ejecución: el directorio del archivo como en CPython (sys.path[0] y directorio de trabajo),
// y fuera de sys.modules los módulos del proyecto de la ejecución anterior (si no, un import vería el texto viejo).
const PREPARAR = `
import sys, os, importlib
sys.dont_write_bytecode = True
for _n, _m in list(sys.modules.items()):
    _f = getattr(_m, "__file__", None) or ""
    if _f.startswith("/proyecto/"):
        del sys.modules[_n]
if sys.path and sys.path[0].startswith("/proyecto"):
    sys.path[0] = _dir
else:
    sys.path.insert(0, _dir)
os.chdir(_dir)
importlib.invalidate_caches()
del _n, _m, _f
`;

// El traceback de Pyodide empieza con marcos propios (_pyodide/_base.py). Se muestra desde el primer marco del
// proyecto, con las rutas relativas a su carpeta. La línea que se marca es la del último marco del archivo abierto;
// el destino, la del último marco del proyecto (puede ser otro archivo).
function limpiar(traza, archivo) {
  const lineas = String(traza).replace(/\s+$/, "").split("\n");
  const i = lineas.findIndex((l) => l.startsWith(`  File "${RAIZ}/`));
  if (i < 0) return { texto: lineas.slice(-1)[0] || String(traza), linea: null, destino: null };
  const cuerpo = lineas.slice(i).map((l) => l.replace(`File "${RAIZ}/`, 'File "'));
  // Un error de sintaxis no tiene marcos de ejecución: CPython lo muestra sin la cabecera «Traceback».
  const texto = (/, in /.test(cuerpo[0]) ? "Traceback (most recent call last):\n" : "") + cuerpo.join("\n");
  let linea = null, destino = null;
  for (const l of cuerpo) {
    const m = /^ {2}File "(.*)", line (\d+)/.exec(l);
    if (!m || m[1].startsWith("/") || m[1].startsWith("<")) continue;
    if (m[1] === archivo) linea = Number(m[2]);
    destino = { ruta: m[1], linea: Number(m[2]) };
  }
  return { texto, linea, destino };
}

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.tipo !== "ejecutar") return;
  try { await carga; }
  catch { enviar({ tipo: "fin", id: m.id, ok: false, error: { texto: "Python no pudo cargarse.", linea: null } }); return; }
  const archivo = m.archivo, ruta = RAIZ + "/" + archivo;
  copiar({ ...(m.archivos || {}), [archivo]: m.codigo });
  const dir = ruta.slice(0, ruta.lastIndexOf("/"));
  const prep = py.toPy({ _dir: dir });
  try { py.runPython(PREPARAR, { globals: prep }); } finally { prep.destroy(); }
  const globales = py.toPy({ __name__: "__main__", __file__: ruta });
  let error = null;
  try {
    await py.runPythonAsync(m.codigo, { globals: globales, filename: ruta, dedent: false });
  } catch (e) {
    error = limpiar((e && e.message) || e, archivo);
  } finally {
    try { py.runPython("import sys\nsys.stdout.flush()\nsys.stderr.flush()"); } catch { /* nada que vaciar */ }
    globales.destroy();
  }
  enviar({ tipo: "fin", id: m.id, ok: !error, error });
};
