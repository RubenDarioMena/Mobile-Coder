/* Los import de JavaScript entre archivos del proyecto, para ejecutar. Sin servidor ni conexión: cada archivo se
 * sirve al motor como un módulo propio (un blob), con sus import apuntando a los blobs de los archivos que importa.
 * Aquí solo se arma el grafo: qué importa cada archivo y dónde está cada ruta en su texto (app/motor-js.js crea
 * los blobs, de las hojas hacia la raíz). Los errores de sintaxis los encuentra acorn, el analizador del editor.
 * Se admiten rutas relativas (./, ../) o desde la raíz del proyecto (/); sin extensión se prueba .js, .mjs e index.js.
 * Los paquetes de npm no están (sin conexión) y las importaciones circulares todavía no se admiten. */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const esJS = (r) => /\.(m?js|cjs)$/i.test(r);
  const lineaDe = (t, pos) => t.slice(0, pos).split("\n").length;

  // Las rutas que importa un texto: [{ ref, a, b }] con [a, b) la cadena entera, comillas incluidas.
  function importsConAcorn(texto) {
    const ast = window.acorn.parse(texto, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true, allowAwaitOutsideFunction: true });
    const out = [];
    const visitar = (n) => {
      if (!n || typeof n.type !== "string") return;
      if ((n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") && n.source) out.push({ ref: n.source.value, a: n.source.start, b: n.source.end });
      if (n.type === "ImportExpression" && n.source && n.source.type === "Literal" && typeof n.source.value === "string") out.push({ ref: n.source.value, a: n.source.start, b: n.source.end });
      for (const k in n) {
        if (k === "parent") continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visitar); else if (v && typeof v === "object" && typeof v.type === "string") visitar(v);
      }
    };
    visitar(ast);
    return out;
  }
  // Si acorn no conoce alguna sintaxis nueva, una búsqueda simple: el motor del navegador dirá el resto.
  function importsSimples(texto) {
    const out = [], re = /(?:\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*|\bimport\s*\(\s*)(["'])([^"'\n]+)\1/g;
    let m;
    while ((m = re.exec(texto))) { const b = m.index + m[0].length, a = b - m[2].length - 2; out.push({ ref: m[2], a, b }); }
    return out;
  }
  function resolver(ref, desde, existe) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return { externo: true };
    if (!ref.startsWith("./") && !ref.startsWith("../") && !ref.startsWith("/")) return { paquete: true };
    const partes = ref.startsWith("/") ? [] : desde.split("/").slice(0, -1);
    for (const p of ref.replace(/^\//, "").split("/")) {
      if (p === "" || p === ".") continue;
      if (p === "..") { if (!partes.length) return { fuera: true }; partes.pop(); } else partes.push(p);
    }
    const base = partes.join("/");
    for (const r of [base, base + ".js", base + ".mjs", base + "/index.js"]) if (existe(r)) return { ruta: r };
    return { falta: base };
  }

  // archivos: { ruta: texto } de todo el proyecto. Devuelve { ok, modulos: [{ ruta, texto, deps: [{ a, b, ruta }] }] en orden
  // (cada módulo después de lo que importa), o { ok: false, error: { nombre, mensaje, ruta, linea } }.
  function preparar(entrada, archivos) {
    const existe = (r) => Object.hasOwn(archivos, r) && esJS(r);
    const vistos = new Map(), orden = [], camino = [];
    let error = null;
    function visitar(ruta) {
      if (error) return;
      if (vistos.get(ruta) === "listo") return;
      if (vistos.get(ruta) === "abierto") {
        const ciclo = [...camino.slice(camino.indexOf(ruta)), ruta];
        error = { nombre: "Error", mensaje: `Importación circular (${ciclo.join(" → ")}): todavía no se admite en Mobile Coder.`, ruta, linea: null };
        return;
      }
      vistos.set(ruta, "abierto"); camino.push(ruta);
      const texto = archivos[ruta];
      let refs, sintaxis = null;
      try { refs = importsConAcorn(texto); }
      catch (e) { sintaxis = e.loc ? { linea: e.loc.line, mensaje: String(e.message).replace(/\s*\(\d+:\d+\)$/, "") } : null; refs = importsSimples(texto); }
      const deps = [];
      for (const r of refs) {
        const x = resolver(r.ref, ruta, existe), linea = lineaDe(texto, r.a);
        if (x.externo) continue;
        if (x.paquete) { error = { nombre: "Error", mensaje: `«${r.ref}» parece un paquete de npm, y sin conexión no hay paquetes: importa archivos del proyecto con «./», como «./${r.ref}.js».`, ruta, linea }; return; }
        if (x.fuera) { error = { nombre: "Error", mensaje: `«${r.ref}» sale de la carpeta del proyecto.`, ruta, linea }; return; }
        if (x.falta != null) { error = { nombre: "Error", mensaje: `No se encuentra «${r.ref}» en el proyecto${x.falta ? ` (se buscó ${x.falta}${/\.\w+$/.test(x.falta) ? "" : ".js"})` : ""}.`, ruta, linea }; return; }
        deps.push({ a: r.a, b: r.b, ruta: x.ruta });
        visitar(x.ruta);
        if (error) return;
      }
      camino.pop(); vistos.set(ruta, "listo");
      orden.push({ ruta, texto, deps, sintaxis });
    }
    if (!existe(entrada)) return { ok: false, error: { nombre: "Error", mensaje: `No se encuentra ${entrada}.`, ruta: entrada, linea: null } };
    visitar(entrada);
    return error ? { ok: false, error } : { ok: true, modulos: orden };
  }
  MC.modulos = { preparar, resolver, esJS };
})();
