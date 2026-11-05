/* Motor de JavaScript (Worker de módulo). El archivo corre como módulo de ES, aislado de la interfaz:
 * sin DOM, con su propio estado en cada ejecución. console.* llega a la consola de la app.
 * Mensajes de salida: salida { clase, texto }, limpiar, error { nombre, mensaje, linea, pila }, evaluado y fin.
 * «fin» llega cuando el módulo terminó y no quedan temporizadores; las promesas sin temporizador no se siguen. */
const enviar = (m) => postMessage(m);
let archivo = "main.js", evaluado = false, finEnviado = false;

// ---------- Cómo se escribe un valor en la consola ----------
const IDENT = /^[A-Za-z_$][\w$]*$/;
function describir(v, prof = 0, vistos = new WeakSet()) {
  if (typeof v === "string") return prof ? JSON.stringify(v) : v;
  if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (v === null || v === undefined || typeof v === "boolean") return String(v);
  if (typeof v === "bigint") return v + "n";
  if (typeof v === "symbol") return v.toString();
  if (typeof v === "function") {
    if (/^class[\s{]/.test(Function.prototype.toString.call(v))) return `[class ${v.name || "(anónima)"}]`;
    return v.name ? `[Function: ${v.name}]` : "[Function (anónima)]";
  }
  if (v instanceof Error) return prof ? `[${v.name}: ${v.message}]` : `${v.name}: ${v.message}`;
  if (vistos.has(v)) return "[Circular]";
  if (prof > 3) return Array.isArray(v) ? "[Array]" : "[Object]";
  vistos.add(v);
  try {
    const lista = (items, total, max) => (total > max ? [...items, `… ${total - max} más`] : items);
    if (Array.isArray(v)) {
      const items = lista(v.slice(0, 100).map((x) => describir(x, prof + 1, vistos)), v.length, 100);
      return items.length ? `[ ${items.join(", ")} ]` : "[]";
    }
    if (v instanceof Map) {
      const items = lista([...v].slice(0, 50).map(([k, x]) => `${describir(k, prof + 1, vistos)} => ${describir(x, prof + 1, vistos)}`), v.size, 50);
      return `Map(${v.size}) {${items.length ? " " + items.join(", ") + " " : ""}}`;
    }
    if (v instanceof Set) {
      const items = lista([...v].slice(0, 50).map((x) => describir(x, prof + 1, vistos)), v.size, 50);
      return `Set(${v.size}) {${items.length ? " " + items.join(", ") + " " : ""}}`;
    }
    if (v instanceof Date) return isNaN(v) ? "Invalid Date" : v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (ArrayBuffer.isView(v) && typeof v.length === "number") return `${v.constructor.name}(${v.length}) [ ${Array.from(v.slice(0, 100)).join(", ")} ]`;
    if (v instanceof Promise) return "Promise { … }";
    const nombre = v.constructor && v.constructor !== Object && v.constructor.name ? v.constructor.name + " " : "";
    const claves = Object.keys(v);
    const items = lista(claves.slice(0, 50).map((k) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${describir(v[k], prof + 1, vistos)}`), claves.length, 50);
    return items.length ? `${nombre}{ ${items.join(", ")} }` : `${nombre}{}`;
  } finally {
    vistos.delete(v);
  }
}
// console.log("%s tiene %d años", nombre, 3): las sustituciones más comunes.
function formatear(args) {
  if (typeof args[0] !== "string" || !args[0].includes("%")) return args.map((a) => describir(a)).join(" ");
  let i = 1;
  const primero = args[0].replace(/%([sdifoOc%])/g, (t, c) => {
    if (c === "%") return "%";
    if (i >= args.length) return t;
    const a = args[i++];
    if (c === "s") return typeof a === "string" ? a : describir(a, 1);
    if (c === "d" || c === "i") return String(parseInt(a, 10));
    if (c === "f") return String(Number(a));
    if (c === "c") return "";
    return describir(a, 1);
  });
  return [primero, ...args.slice(i).map((a) => describir(a))].join(" ");
}
const contadores = new Map(), tiempos = new Map();
const escribir = (clase) => (...args) => enviar({ tipo: "salida", clase, texto: formatear(args) + "\n" });
Object.assign(console, {
  log: escribir("salida"), debug: escribir("salida"), info: escribir("info"), warn: escribir("aviso"), error: escribir("error"),
  table: (dato) => enviar({ tipo: "salida", clase: "salida", texto: describir(dato, 1) + "\n" }),
  clear: () => enviar({ tipo: "limpiar" }),
  count: (et = "default") => { const n = (contadores.get(et) || 0) + 1; contadores.set(et, n); escribir("salida")(`${et}: ${n}`); },
  time: (et = "default") => tiempos.set(et, performance.now()),
  timeEnd: (et = "default") => { if (tiempos.has(et)) { escribir("salida")(`${et}: ${(performance.now() - tiempos.get(et)).toFixed(1)} ms`); tiempos.delete(et); } },
  assert: (cond, ...args) => { if (!cond) escribir("error")("Assertion failed" + (args.length ? ": " + formatear(args) : "")); },
});
self.alert = (m) => console.log(String(m));

// ---------- Errores: la línea del archivo, sin el ruido del motor ----------
function lineaDe(pila) {
  const reArchivo = new RegExp(archivo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":(\\d+):(\\d+)");
  for (const linea of String(pila || "").split("\n")) {
    const m = reArchivo.exec(linea) || /blob:[^\s)]*:(\d+):(\d+)/.exec(linea);
    if (m) return Number(m[1]);
  }
  return null;
}
function reportar(e, prefijo = "") {
  const esError = e instanceof Error || (e && typeof e === "object" && "message" in e && "name" in e);
  const nombre = esError ? e.name : "Error", mensaje = esError ? e.message : describir(e, 1);
  const pila = esError && e.stack ? String(e.stack).split("\n").filter((l) => /^\s+at /.test(l) && (l.includes(archivo) || l.includes("blob:")))
    .map((l) => l.replace(/blob:[^\s)]*?(:\d+:\d+)/g, archivo + "$1")) : [];
  enviar({ tipo: "error", nombre, mensaje: prefijo + mensaje, linea: esError ? lineaDe(e.stack) : null, pila });
}
self.addEventListener("error", (ev) => { ev.preventDefault(); reportar(ev.error || Error(ev.message)); revisar(); });
self.addEventListener("unhandledrejection", (ev) => { ev.preventDefault(); reportar(ev.reason, "(promesa sin catch) "); revisar(); });

// ---------- Temporizadores: el programa sigue vivo mientras tenga alguno pendiente ----------
const vivos = new Set();
const st = self.setTimeout.bind(self), ct = self.clearTimeout.bind(self), si = self.setInterval.bind(self), ci = self.clearInterval.bind(self);
function revisar() {
  if (evaluado && !finEnviado && vivos.size === 0) { finEnviado = true; enviar({ tipo: "fin" }); }
}
// Un error dentro de un temporizador se informa antes de decidir si el programa terminó.
const protegido = (fn, args) => { try { if (typeof fn === "function") fn(...args); } catch (e) { reportar(e); } };
self.setTimeout = (fn, ms, ...args) => {
  const id = st(() => { vivos.delete(id); protegido(fn, args); revisar(); }, ms);
  vivos.add(id); return id;
};
self.clearTimeout = (id) => { if (vivos.delete(id)) { ct(id); revisar(); } };
self.setInterval = (fn, ms, ...args) => { const id = si(() => protegido(fn, args), ms); vivos.add(id); return id; };
self.clearInterval = (id) => { if (vivos.delete(id)) { ci(id); revisar(); } };

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.tipo !== "ejecutar") return;
  archivo = m.archivo || "main.js";
  const url = URL.createObjectURL(new Blob([m.codigo + "\n//# sourceURL=" + archivo], { type: "text/javascript" }));
  try {
    await import(url);
  } catch (e) {
    reportar(e);
  } finally {
    URL.revokeObjectURL(url);
    evaluado = true;
    enviar({ tipo: "evaluado" });
    revisar();
  }
};
enviar({ tipo: "listo" });
