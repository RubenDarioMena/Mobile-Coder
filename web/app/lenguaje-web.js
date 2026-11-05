/* Servicios de lenguaje de JavaScript, HTML y CSS (Worker clásico, fuera del hilo de la interfaz). Sin conexión:
 * - JavaScript: el servicio de lenguaje de TypeScript 6.0.3 (web/vendor/typescript/), con todo el proyecto a la vista:
 *   los import entre archivos se resuelven, se completan sus exportaciones y se va a sus definiciones.
 * - HTML y CSS: los servicios de VS Code (web/vendor/servicios-web/). Una página conoce lo que enlaza
 *   (<link href>, <script src>, <img src>…): avisa si falta el archivo, completa rutas y las clases de sus hojas
 *   de estilo, y abre lo enlazado. El <script> y el <style> de una página usan los servicios de JS y CSS.
 * Cada servicio se carga la primera vez que se necesita.
 *
 * Entrada: proyecto { archivos: [[ruta, texto]], rutas, carpetas }, cambio { ruta, texto|null } y
 *          pedir { id, accion: completar | diagnosticos | definicion, ruta, texto, pos, rutas? }.
 * Salida:  respuesta { id, ok, datos | error } y estado { servicio, estado: cargando | listo | fallo, mensaje? }. */
"use strict";
const archivos = new Map();   // ruta → { texto, version } de los archivos de texto del proyecto
let rutas = new Set(), carpetas = new Set();   // todo lo que hay en la carpeta (también imágenes), para rutas y enlaces
const enviar = (m) => postMessage(m);
const ext = (r) => ((/\.([^./]+)$/.exec(r) || [])[1] || "").toLowerCase();
const TIPOS = { js: "js", mjs: "js", cjs: "js", html: "html", htm: "html", css: "css" };
const tipoDe = (r) => TIPOS[ext(r)] || null;
const padreDe = (r) => (r.includes("/") ? r.slice(0, r.lastIndexOf("/")) : "");
const lineaDe = (texto, pos) => { let n = 1; for (let i = 0; i < pos && i < texto.length; i++) if (texto.charCodeAt(i) === 10) n++; return n; };
function poner(ruta, texto) {
  const previo = archivos.get(ruta);
  if (texto == null) { if (previo) { archivos.delete(ruta); version++; } return; }
  if (previo && previo.texto === texto) return;
  archivos.set(ruta, { texto, version: (previo ? previo.version : 0) + 1 });
  rutas.add(ruta);
  for (let p = padreDe(ruta); p; p = padreDe(p)) carpetas.add(p);
  version++;
}
let version = 0;   // del proyecto entero: invalida lo que se calcula a partir de varios archivos
const texto = (ruta) => (archivos.get(ruta) || {}).texto;

// Rutas del proyecto a partir de una referencia («./estilos.css», «../img/a.png», «/main.js»).
const URI = "file:///proyecto/";
const uriDe = (ruta) => URI + ruta.split("/").map(encodeURIComponent).join("/");
function rutaDeUri(u) {
  if (!u || !u.startsWith("file:///proyecto")) return null;
  const r = decodeURIComponent(u.slice(URI.length).replace(/[?#].*$/, ""));
  return r.replace(/\/$/, "");
}
const externo = (ref) => /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("//");
const contexto = {
  resolveReference(ref, base) {
    if (externo(ref)) return ref;
    if (ref.startsWith("/")) return "file:///proyecto" + ref;
    try { return new URL(ref, base).href; } catch { return undefined; }
  },
};
const sistema = {
  async stat(uri) {
    const r = rutaDeUri(uri);
    if (r == null) return { type: 0, ctime: 0, mtime: 0, size: 0 };
    return { type: r === "" || carpetas.has(r) ? 2 : rutas.has(r) ? 1 : 0, ctime: 0, mtime: 0, size: 0 };
  },
  async readDirectory(uri) {
    const dir = rutaDeUri(uri);
    if (dir == null) return [];
    const hijos = new Map();
    for (const c of carpetas) if (padreDe(c) === dir) hijos.set(c.slice(c.lastIndexOf("/") + 1), 2);
    for (const r of rutas) if (padreDe(r) === dir) hijos.set(r.slice(r.lastIndexOf("/") + 1), 1);
    return [...hijos];
  },
};

// ---------- Fragmentos de una página: el JS de sus <script> y el CSS de sus <style> ----------
// Se devuelve el texto de la página con todo lo demás en blanco (los saltos de línea se conservan),
// así las posiciones son las mismas en la página y en el fragmento.
const cacheFragmentos = new Map();   // ruta → { version, js, css, rangos }
function fragmentos(ruta) {
  const a = archivos.get(ruta);
  if (!a) return null;
  const c = cacheFragmentos.get(ruta);
  if (c && c.version === a.version) return c;
  const t = a.texto, re = /<(script|style)\b([^>]*)>/gi, js = [], css = [];
  let m;
  while ((m = re.exec(t))) {
    const nombre = m[1].toLowerCase(), ini = m.index + m[0].length;
    const fin = new RegExp("</" + nombre + "\\s*>", "ig"); fin.lastIndex = ini;
    const f = fin.exec(t), j = f ? f.index : t.length;
    const tipo = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[2]) || [])[1];
    if (nombre === "style") css.push([ini, j]);
    else if (!tipo || /^(module|text\/javascript|application\/javascript)$/i.test(tipo)) js.push([ini, j]);
    re.lastIndex = j;
  }
  const blanco = (rangos) => {
    let s = "", desde = 0;
    for (const [a, b] of rangos) { s += t.slice(desde, a).replace(/[^\n]/g, " ") + t.slice(a, b); desde = b; }
    return s + t.slice(desde).replace(/[^\n]/g, " ");
  };
  const r = { version: a.version, js: js.length ? blanco(js) : null, css: css.length ? blanco(css) : null, rangosJS: js, rangosCSS: css };
  cacheFragmentos.set(ruta, r);
  return r;
}
const dentro = (rangos, pos) => rangos.some(([a, b]) => pos >= a && pos <= b);

// ---------- JavaScript: TypeScript ----------
let TS = null;
const VIRTUAL = ".__script.js", LIBS = "/__typescript__/";   // el JS de una página: «index.html.__script.js»
function cargarTS() {
  if (TS) return TS;
  enviar({ tipo: "estado", servicio: "js", estado: "cargando" });
  const t0 = performance.now();
  importScripts("../vendor/typescript/typescript.js");
  const ts = self.ts;
  const leerSincrono = (url) => { const x = new XMLHttpRequest(); x.open("GET", url, false); x.send(); if (x.status !== 200 && x.status !== 0) throw Error(url + ": " + x.status); return x.responseText; };
  // Mensajes de error en español: los trae el propio paquete de TypeScript.
  try { ts.setLocalizedDiagnosticMessages(JSON.parse(leerSincrono("../vendor/typescript/es/diagnosticMessages.generated.json"))); } catch (e) { console.warn("TypeScript sin mensajes en español:", e); }
  const libs = new Map(JSON.parse(leerSincrono("../vendor/typescript/MANIFEST.json")).libs.map((n) => [n, null]));
  const leerLib = (nombre) => {
    if (!libs.has(nombre)) return undefined;
    if (libs.get(nombre) == null) libs.set(nombre, leerSincrono("../vendor/typescript/lib/" + nombre));
    return libs.get(nombre);
  };
  const opciones = {
    allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, moduleDetection: ts.ModuleDetectionKind.Force, resolveJsonModule: false,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts", "lib.dom.asynciterable.d.ts"], types: [],
    strict: false, skipLibCheck: true, allowNonTsExtensions: true, maxNodeModuleJsDepth: 0,
  };
  // Nombres para TypeScript: «/ruta» para los archivos del proyecto y «/__typescript__/…» para sus bibliotecas
  // (con un nombre que no choque con una carpeta del proyecto, como lib/).
  const leer = (f) => {
    if (f.startsWith(LIBS)) return leerLib(f.slice(LIBS.length));
    const r = f.slice(1);
    if (r.endsWith(VIRTUAL)) { const fr = fragmentos(r.slice(0, -VIRTUAL.length)); return fr && fr.js != null ? fr.js : undefined; }
    return tipoDe(r) === "js" ? texto(r) : undefined;
  };
  const raices = () => {
    const l = [];
    for (const r of archivos.keys()) {
      if (tipoDe(r) === "js") l.push("/" + r);
      else if (tipoDe(r) === "html") { const fr = fragmentos(r); if (fr && fr.js != null) l.push("/" + r + VIRTUAL); }
    }
    return l;
  };
  const versionDe = (f) => {
    if (f.startsWith(LIBS)) return "1";
    const r = f.slice(1), base = r.endsWith(VIRTUAL) ? r.slice(0, -VIRTUAL.length) : r;
    return String((archivos.get(base) || {}).version || 0);
  };
  const host = {
    getCompilationSettings: () => opciones,
    getScriptFileNames: raices,
    getScriptVersion: versionDe,
    getProjectVersion: () => String(version),
    getScriptSnapshot: (f) => { const t = leer(f); return t == null ? undefined : ts.ScriptSnapshot.fromString(t); },
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => LIBS + "lib.d.ts",
    fileExists: (f) => leer(f) != null,
    readFile: (f) => leer(f),
    directoryExists: (d) => { const p = d.replace(/^\/|\/$/g, ""); return p === "" || p === LIBS.slice(1, -1) || carpetas.has(p); },
    getDirectories: (d) => { const p = d.replace(/^\/|\/$/g, ""); return [...carpetas].filter((c) => padreDe(c) === p).map((c) => c.slice(c.lastIndexOf("/") + 1)); },
    // Para completar rutas de import: los archivos de una carpeta del proyecto (con las extensiones pedidas).
    // Para completar rutas de import: los archivos de una carpeta del proyecto (solo los de esa carpeta;
    // las subcarpetas las da getDirectories), con las extensiones pedidas.
    readDirectory: (d, extensiones) => {
      const p = d.replace(/^\/|\/$/g, "");
      return [...rutas].filter((r) => padreDe(r) === p && (!extensiones || !extensiones.length || extensiones.some((e) => r.endsWith(e)))).map((r) => "/" + r);
    },
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    log: () => {}, trace: () => {}, error: () => {},
  };
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry(true, "/"));
  TS = { ts, ls, ms: Math.round(performance.now() - t0) };
  enviar({ tipo: "estado", servicio: "js", estado: "listo", ms: TS.ms });
  return TS;
}
// Errores de tipos que se muestran en JS: los que casi siempre son un fallo real (nombres que no existen,
// módulos que no se encuentran, redeclaraciones…). Los demás chequeos de tipos de TypeScript en JS se callan.
const SEMANTICOS = new Set([2304, 2552, 2582, 2583, 2584, 2307, 2305, 2724, 2614, 2451, 2300, 2588, 2448, 2449, 2450, 1308]);
const CLASES_TS = { function: "fn", method: "fn", "local function": "fn", class: "maq", keyword: "kw", property: "prop", getter: "prop", setter: "prop",
  var: "var", let: "var", const: "var", "local var": "var", parameter: "var", module: "str", script: "str", directory: "str", string: "str", enum: "maq", interface: "maq", type: "maq" };
const NOTAS_TS = { function: "función", method: "método", "local function": "función", class: "clase", keyword: "palabra clave", property: "propiedad", getter: "propiedad", setter: "propiedad",
  var: "variable", let: "variable", const: "constante", "local var": "variable", parameter: "parámetro", module: "módulo", script: "archivo", directory: "carpeta", string: "texto",
  enum: "enumeración", interface: "interfaz", type: "tipo", alias: "importado", warning: "nombre del archivo" };
function archivoTS(ruta, pos) {
  if (tipoDe(ruta) === "js") return "/" + ruta;
  const fr = tipoDe(ruta) === "html" ? fragmentos(ruta) : null;
  return fr && fr.js != null && (pos == null || dentro(fr.rangosJS, pos)) ? "/" + ruta + VIRTUAL : null;
}
const rutaDeTS = (f) => { const r = f.slice(1); return r.endsWith(VIRTUAL) ? r.slice(0, -VIRTUAL.length) : r; };
const ID = /[\w$À-￿]/;
const inicioPalabra = (t, pos, re = ID) => { let i = pos; while (i > 0 && re.test(t[i - 1])) i--; return i; };
function completarJS(ruta, pos) {
  const f = archivoTS(ruta, pos);
  if (!f) return null;
  const { ls } = cargarTS(), t = texto(ruta);
  const info = ls.getCompletionsAtPosition(f, pos, { includeCompletionsWithInsertText: true, includeCompletionsForModuleExports: false, importModuleSpecifierEnding: "js", includeAutomaticOptionalChainCompletions: true, allowIncompleteCompletions: true });
  if (!info) return { items: [], desde: inicioPalabra(t, pos) };
  const general = info.optionalReplacementSpan;
  const items = info.entries.map((e) => {
    const span = e.replacementSpan || general;
    const desde = span ? span.start : inicioPalabra(t, pos), hasta = span ? span.start + span.length : pos;
    // Una carpeta en la ruta de un import se pone con su «/»: así se sigue con lo que hay dentro.
    const insertar = (e.insertText ?? e.name) + (e.kind === "directory" && t[hasta] !== "/" ? "/" : "");
    return { etiqueta: e.name, insertar, desde, hasta: Math.max(hasta, pos), cls: CLASES_TS[e.kind] || null, nota: NOTAS_TS[e.kind] || e.kind, orden: (e.kind === "warning" ? "9" : "") + e.sortText };
  });
  return { items, desde: inicioPalabra(t, pos) };
}
function diagnosticosJS(ruta) {
  const f = archivoTS(ruta, null);
  if (!f) return [];
  const { ts, ls } = cargarTS(), t = texto(ruta);
  const ds = [...ls.getSyntacticDiagnostics(f), ...ls.getSemanticDiagnostics(f).filter((d) => SEMANTICOS.has(d.code))];
  return ds.filter((d) => d.start != null).map((d) => ({
    desde: d.start, hasta: d.start + (d.length || 0), linea: lineaDe(t, d.start), fuente: "js",
    // Los mensajes en español citan el módulo con comillas y TypeScript ya las incluye: se quita un par.
    mensaje: ts.flattenDiagnosticMessageText(d.messageText, "\n").replace(/""([^"\n]+)""/g, '"$1"'), gravedad: d.category === ts.DiagnosticCategory.Error ? "error" : "aviso",
  }));
}
function definicionJS(ruta, pos) {
  const f = archivoTS(ruta, pos);
  if (!f) return null;
  const { ls } = cargarTS();
  const defs = ls.getDefinitionAtPosition(f, pos) || [];
  for (const d of defs) {
    if (d.fileName.startsWith(LIBS)) continue;
    const destino = rutaDeTS(d.fileName), td = texto(destino);
    if (td == null) continue;
    const linea = lineaDe(td, d.textSpan.start);
    // Un archivo entero (la ruta de un import) se abre; un nombre lleva a su línea.
    const esArchivo = d.kind === "script" || d.kind === "module" || (d.textSpan.start === 0 && d.textSpan.length === 0);
    return { ruta: destino, desde: d.textSpan.start, linea: esArchivo ? 1 : linea, nombre: esArchivo ? null : d.name };
  }
  return null;
}

// ---------- HTML y CSS: servicios de VS Code ----------
let WEB = null;
function cargarWeb() {
  if (WEB) return WEB;
  const t0 = performance.now();
  importScripts("../vendor/servicios-web/servicios-web.js");
  const S = self.ServiciosWeb;
  const html = S.html.getLanguageService({ fileSystemProvider: sistema });
  const css = S.css.getCSSLanguageService({ fileSystemProvider: sistema });
  css.configure({ validate: true, lint: { emptyRules: "ignore" } });
  WEB = { S, html, css, ms: Math.round(performance.now() - t0) };
  enviar({ tipo: "estado", servicio: "web", estado: "listo", ms: WEB.ms });
  return WEB;
}
const documentoDe = (ruta, idioma, t = texto(ruta)) => WEB.S.TextDocument.create(uriDe(ruta), idioma, (archivos.get(ruta) || {}).version || 0, t || "");
// Fragmentos de código (snippets de LSP) a texto: los marcadores quedan con su valor y el cursor en el primero.
function sinMarcadores(s) {
  let out = "", i = 0;
  const paradas = [];
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) { out += s[i + 1]; i += 2; continue; }
    if (c === "$") {
      let m = /^\$(\d+)/.exec(s.slice(i));
      if (m) { paradas.push([Number(m[1]), out.length]); i += m[0].length; continue; }
      m = /^\$\{(\d+):([^}]*)\}/.exec(s.slice(i));
      if (m) { paradas.push([Number(m[1]), out.length]); out += m[2]; i += m[0].length; continue; }
      m = /^\$\{(\d+)\|([^|]*)\|\}/.exec(s.slice(i));
      if (m) { paradas.push([Number(m[1]), out.length]); out += m[2].split(",")[0]; i += m[0].length; continue; }
      m = /^\$\{(\d+)\}/.exec(s.slice(i));
      if (m) { paradas.push([Number(m[1]), out.length]); i += m[0].length; continue; }
    }
    out += c; i++;
  }
  const primera = paradas.filter(([n]) => n > 0).sort((a, b) => a[0] - b[0])[0] || paradas.find(([n]) => n === 0);
  return { texto: out, cursor: primera ? primera[1] : null };
}
const CLASES_LSP = { 2: "fn", 3: "fn", 5: "prop", 6: "var", 7: "maq", 10: "prop", 12: "num", 14: "kw", 16: "num", 17: "str", 19: "str", 21: "var" };
const NOTAS_LSP = { 1: "texto", 2: "método", 3: "función", 5: "campo", 6: "variable", 7: "clase", 10: "propiedad", 11: "unidad", 12: "valor", 13: "opción", 14: "palabra clave", 15: "fragmento", 16: "color", 17: "archivo", 19: "carpeta", 21: "constante" };
function deLSP(doc, it, pos) {
  let insertar = it.textEdit ? it.textEdit.newText : it.insertText ?? it.label, cursor = null, desde = pos, hasta = pos;
  if (it.textEdit) { const r = it.textEdit.range || it.textEdit.replace; desde = doc.offsetAt(r.start); hasta = doc.offsetAt(r.end); }
  if (it.insertTextFormat === 2) ({ texto: insertar, cursor } = sinMarcadores(insertar));
  return { etiqueta: it.label, filtro: it.filterText || it.label, insertar, cursor, desde, hasta: Math.max(hasta, pos), cls: CLASES_LSP[it.kind] || null, nota: NOTAS_LSP[it.kind] || "", orden: it.sortText || it.label };
}

// Enlaces de una página: lo que referencia (hojas de estilo, scripts, imágenes…) con su destino en el proyecto.
function enlacesHTML(ruta) {
  const { html } = cargarWeb();
  const doc = documentoDe(ruta, "html");
  return html.findDocumentLinks(doc, contexto).map((l) => {
    const ref = doc.getText(l.range);
    return { desde: doc.offsetAt(l.range.start), hasta: doc.offsetAt(l.range.end), ref, externo: !l.target || !l.target.startsWith("file:"), ruta: l.target ? rutaDeUri(l.target) : null };
  }).filter((l) => l.ref && !l.ref.startsWith("#"));
}
// Selectores de clase e id de una hoja de estilo (fuera de los bloques de declaraciones).
function selectoresCSS(t) {
  const out = [], n = t.length, bloques = [];
  let i = 0, preludio = "";
  while (i < n) {
    const c = t[i];
    if (c === "/" && t[i + 1] === "*") { const j = t.indexOf("*/", i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === '"' || c === "'") { const j = t.indexOf(c, i + 1); i = j < 0 ? n : j + 1; continue; }
    if (c === "{") { bloques.push(!/^\s*@(?!font-face|page)/.test(preludio)); preludio = ""; i++; continue; }
    if (c === "}") { bloques.pop(); preludio = ""; i++; continue; }
    if (c === ";") { preludio = ""; i++; continue; }
    const enDecl = bloques.length && bloques[bloques.length - 1];
    if (!enDecl && (c === "." || c === "#")) {
      const m = /^-?[A-Za-z_À-￿][\wÀ-￿-]*/.exec(t.slice(i + 1, i + 200));
      if (m && !/[\w-]/.test(t[i - 1] || "")) { out.push({ tipo: c === "." ? "clase" : "id", nombre: m[0], desde: i }); preludio += c + m[0]; i += 1 + m[0].length; continue; }
    }
    preludio += c; i++;
  }
  return out;
}
const enDeclaraciones = (t, pos) => {
  let prof = [], preludio = "";
  for (let i = 0; i < pos; i++) {
    const c = t[i];
    if (c === "/" && t[i + 1] === "*") { const j = t.indexOf("*/", i + 2); if (j < 0 || j >= pos) return false; i = j + 1; continue; }
    if (c === "{") { prof.push(!/^\s*@(?!font-face|page)/.test(preludio)); preludio = ""; }
    else if (c === "}") { prof.pop(); preludio = ""; }
    else if (c === ";") preludio = "";
    else preludio += c;
  }
  return !!(prof.length && prof[prof.length - 1]);
};
// Hojas de estilo de una página: las que enlaza y su propio <style>.
function hojasDe(ruta) {
  const hojas = [];
  for (const l of enlacesHTML(ruta)) if (l.ruta && tipoDe(l.ruta) === "css" && texto(l.ruta) != null) hojas.push({ ruta: l.ruta, texto: texto(l.ruta) });
  const fr = fragmentos(ruta);
  if (fr && fr.css != null) hojas.push({ ruta, texto: fr.css });
  return hojas;
}
// Páginas que enlazan una hoja de estilo (o todas, si ninguna la enlaza todavía).
function paginasDe(rutaCSS) {
  const paginas = [...archivos.keys()].filter((r) => tipoDe(r) === "html");
  const enlazan = paginas.filter((p) => enlacesHTML(p).some((l) => l.ruta === rutaCSS));
  return enlazan.length ? enlazan : paginas;
}
const clasesUsadas = (t) => {
  const out = { clase: new Set(), id: new Set() }, re = /\b(class|id)\s*=\s*(["'])([^"']*)\2/gi;
  let m;
  while ((m = re.exec(t))) for (const n of m[3].split(/\s+/)) if (n) out[m[1].toLowerCase() === "class" ? "clase" : "id"].add(n);
  return out;
};
// ¿El cursor está en el valor de class="…" o id="…"? Devuelve el atributo y la palabra.
function atributoEn(t, pos) {
  const ini = t.lastIndexOf("<", pos - 1);
  if (ini < 0 || t.lastIndexOf(">", pos - 1) > ini) return null;
  const m = /\b(class|id)\s*=\s*(["'])([^"']*)$/i.exec(t.slice(ini, pos));
  if (!m) return null;
  const desde = inicioPalabra(t, pos, /[\wÀ-￿-]/);
  let hasta = pos; while (hasta < t.length && /[\wÀ-￿-]/.test(t[hasta])) hasta++;
  return { atributo: m[1].toLowerCase() === "class" ? "clase" : "id", desde, hasta, palabra: t.slice(desde, hasta) };
}
async function completarHTML(ruta, pos) {
  const fr = fragmentos(ruta);
  if (fr && dentro(fr.rangosJS, pos)) return completarJS(ruta, pos);
  const { html, css } = cargarWeb(), t = texto(ruta);
  if (fr && dentro(fr.rangosCSS, pos)) return completarCSSen(documentoDe(ruta, "css", fr.css), pos, ruta);
  const at = atributoEn(t, pos);
  if (at) {
    // Las clases e ids de las hojas de estilo que la página enlaza (y de su <style>).
    const vistos = new Map();
    for (const h of hojasDe(ruta)) for (const s of selectoresCSS(h.texto)) if (s.tipo === at.atributo && !vistos.has(s.nombre)) vistos.set(s.nombre, h.ruta);
    return { desde: at.desde, items: [...vistos].map(([nombre, origen]) => ({ etiqueta: nombre, insertar: nombre, desde: at.desde, hasta: at.hasta, cls: "fn", nota: origen === ruta ? "<style>" : origen.slice(origen.lastIndexOf("/") + 1), orden: "0" + nombre })) };
  }
  const doc = documentoDe(ruta, "html");
  const lista = await html.doComplete2(doc, doc.positionAt(pos), html.parseHTMLDocument(doc), contexto, { attributeDefaultValue: "doublequotes" });
  return { desde: inicioPalabra(t, pos, /[\wÀ-￿:-]/), items: lista.items.map((it) => deLSP(doc, it, pos)) };
}
async function completarCSSen(doc, pos, rutaPagina) {
  const { css } = cargarWeb(), t = doc.getText();
  const lista = await css.doComplete2(doc, doc.positionAt(pos), css.parseStylesheet(doc), contexto);
  let items = lista.items.map((it) => deLSP(doc, it, pos));
  // En un selector, después de «.» o «#»: las clases e ids que usan las páginas que enlazan esta hoja.
  const desdePalabra = inicioPalabra(t, pos, /[\w\u00C0-\uFFFF-]/), signo = t[desdePalabra - 1];
  if ((signo === "." || signo === "#") && !enDeclaraciones(t, desdePalabra)) {
    // Tras el signo no van etiquetas ni seudoclases: solo selectores de su tipo, que se completan tras el signo
    // (como las clases de las páginas, así se ordenan juntos).
    items = items.filter((i) => i.etiqueta.startsWith(signo)).map((i) => ({ ...i, filtro: i.etiqueta.slice(1), insertar: i.insertar.startsWith(signo) ? i.insertar.slice(1) : i.insertar, desde: desdePalabra, cursor: null }));
    const tipo = signo === "." ? "clase" : "id", vistos = new Set(items.map((i) => i.etiqueta.slice(1)));
    const paginas = rutaPagina && tipoDe(rutaPagina) === "html" ? [rutaPagina] : paginasDe(rutaPagina);
    for (const p of paginas) for (const n of clasesUsadas(texto(p) || "")[tipo]) if (!vistos.has(n)) {
      vistos.add(n);
      items.push({ etiqueta: signo + n, filtro: n, insertar: n, desde: desdePalabra, hasta: pos, cls: "fn", nota: p.slice(p.lastIndexOf("/") + 1), orden: "0" + n });
    }
  }
  return { desde: desdePalabra, items };
}
function diagnosticosHTML(ruta) {
  const t = texto(ruta), out = [];
  for (const l of enlacesHTML(ruta)) {
    if (l.externo || l.ruta == null) continue;
    if (!rutas.has(l.ruta) && !carpetas.has(l.ruta)) out.push({ desde: l.desde, hasta: l.hasta, linea: lineaDe(t, l.desde), gravedad: "aviso", fuente: "html", mensaje: `No existe «${l.ref}» en el proyecto.` });
  }
  const fr = fragmentos(ruta);
  if (fr && fr.css != null) out.push(...diagnosticosCSSen(documentoDe(ruta, "css", fr.css), t));
  if (fr && fr.js != null) out.push(...diagnosticosJS(ruta));
  return out;
}
function diagnosticosCSSen(doc, t) {
  const { css } = cargarWeb();
  return css.doValidation(doc, css.parseStylesheet(doc)).map((d) => {
    const desde = doc.offsetAt(d.range.start);
    return { desde, hasta: doc.offsetAt(d.range.end), linea: lineaDe(t, desde), gravedad: d.severity === 1 ? "error" : "aviso", fuente: "css", mensaje: d.message };
  });
}
async function definicionHTML(ruta, pos) {
  const fr = fragmentos(ruta);
  if (fr && dentro(fr.rangosJS, pos)) return definicionJS(ruta, pos);
  const t = texto(ruta);
  // Una referencia (href, src…): abre el archivo.
  for (const l of enlacesHTML(ruta)) if (pos >= l.desde && pos <= l.hasta && l.ruta && texto(l.ruta) != null) return { ruta: l.ruta, desde: 0, linea: 1, nombre: null };
  // Una clase o un id: su regla en la hoja de estilo.
  const at = atributoEn(t, pos);
  if (at && at.palabra) {
    for (const h of hojasDe(ruta)) {
      const s = selectoresCSS(h.texto).find((x) => x.tipo === at.atributo && x.nombre === at.palabra);
      if (s) return { ruta: h.ruta, desde: s.desde, linea: lineaDe(h.texto, s.desde), nombre: (at.atributo === "clase" ? "." : "#") + s.nombre };
    }
  }
  return null;
}
async function definicionCSS(ruta, pos) {
  const { css } = cargarWeb(), doc = documentoDe(ruta, "css");
  const enlaces = await css.findDocumentLinks2(doc, css.parseStylesheet(doc), contexto);
  for (const l of enlaces) {
    const a = doc.offsetAt(l.range.start), b = doc.offsetAt(l.range.end), destino = l.target ? rutaDeUri(l.target) : null;
    if (pos >= a && pos <= b && destino && texto(destino) != null) return { ruta: destino, desde: 0, linea: 1, nombre: null };
  }
  return null;
}

// ---------- Filtrar y ordenar lo que se ofrece ----------
function filtrar(r, ruta, pos) {
  if (!r) return { items: [], desde: pos };
  const t = texto(ruta);
  const escrito = t.slice(r.desde, pos).toLowerCase();
  const vistos = new Set();
  const items = r.items.map((it) => {
    const desde = Math.min(it.desde, pos), parte = t.slice(desde, pos).toLowerCase(), clave = (it.filtro || it.etiqueta).toLowerCase();
    let nivel = !parte ? 1 : clave.startsWith(parte) ? (clave === parte ? 3 : 0) : clave.includes(parte) ? 2 : -1;
    return { ...it, nivel };
  }).filter((it) => it.nivel >= 0 && it.nivel < 3 && !vistos.has(it.etiqueta) && vistos.add(it.etiqueta));
  items.sort((a, b) => a.nivel - b.nivel || String(a.orden).localeCompare(String(b.orden)) || a.etiqueta.localeCompare(b.etiqueta));
  return { desde: r.desde, escrito, items: items.slice(0, 60).map(({ nivel, orden, ...it }) => it) };
}

const ACCIONES = {
  async completar({ ruta, pos }) {
    const tipo = tipoDe(ruta);
    const r = tipo === "js" ? completarJS(ruta, pos) : tipo === "html" ? await completarHTML(ruta, pos) : tipo === "css" ? (cargarWeb(), await completarCSSen(documentoDe(ruta, "css"), pos, ruta)) : null;
    return filtrar(r, ruta, pos);
  },
  async diagnosticos({ ruta, rutas: varias }) {
    const lista = varias || [ruta], out = {};
    for (const r of lista) {
      const tipo = tipoDe(r);
      if (!archivos.has(r) || !tipo) continue;
      try {
        out[r] = tipo === "js" ? diagnosticosJS(r) : tipo === "html" ? diagnosticosHTML(r) : (cargarWeb(), diagnosticosCSSen(documentoDe(r, "css"), texto(r)));
      } catch (e) { out[r] = []; console.warn("Sin diagnósticos de", r, e); }
    }
    return out;
  },
  async definicion({ ruta, pos }) {
    const tipo = tipoDe(ruta);
    return tipo === "js" ? definicionJS(ruta, pos) : tipo === "html" ? definicionHTML(ruta, pos) : tipo === "css" ? definicionCSS(ruta, pos) : null;
  },
};

// Las peticiones se atienden de una en una y en orden: cada una ve el proyecto tal como estaba al enviarla.
let cola = Promise.resolve();
self.onmessage = (ev) => {
  const m = ev.data;
  if (m.tipo === "proyecto") {
    archivos.clear(); cacheFragmentos.clear(); version++;
    rutas = new Set(m.rutas || []); carpetas = new Set(m.carpetas || []);
    for (const [r, t] of m.archivos) if (tipoDe(r)) poner(r, t);
    return;
  }
  if (m.tipo === "cambio") { if (tipoDe(m.ruta)) poner(m.ruta, m.texto); else if (m.texto == null) rutas.delete(m.ruta); else rutas.add(m.ruta); return; }
  if (m.tipo !== "pedir") return;
  cola = cola.then(async () => {
    try {
      if (m.texto != null) poner(m.ruta, m.texto);
      const datos = await ACCIONES[m.accion](m);
      enviar({ tipo: "respuesta", id: m.id, ok: true, datos });
    } catch (e) {
      enviar({ tipo: "respuesta", id: m.id, ok: false, error: String((e && e.message) || e) });
    }
  });
};
enviar({ tipo: "listo" });
