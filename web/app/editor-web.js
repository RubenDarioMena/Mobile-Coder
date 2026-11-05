/* Lenguajes HTML y CSS para el editor compartido (CMGEditor), sin tocar web/cmg/.
 * El editor acepta adaptadores del anfitrión (shared/editor/lenguajes.js). Estos aportan léxico y resaltado,
 * comentarios, sangría y la barra de inserción. La estructura (ProtoMouse, ampliar la selección y el modo
 * sin teclado) es la de JavaScript: las fichas usan los mismos tipos (id, str, num, com, p, esp, nl), y las
 * llaves, paréntesis y comillas se agrupan como en JS. Una estructura propia de HTML queda pendiente.
 * Cada ficha lleva su clase de color en la tercera posición: clasificar() solo la lee. */
(() => {
  "use strict";
  const JS = window.CMGAdaptadorJS, lexicoJS = window.CMGEditorJS.lexico;

  // ---------- CSS ----------
  const RE_NUM_CSS = /^(?:[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(?:%|[a-z]+)?/i, RE_ID_CSS = /^-?-?[A-Za-z_À-￿][\wÀ-￿-]*/;
  function lexicoCSS(src) {
    const out = [], n = src.length;
    let i = 0, prof = 0, enDecl = [];   // enDecl: por cada llave abierta, si es un bloque de declaraciones
    let esperaValor = false;            // tras «propiedad:», hasta el «;» o la llave
    const enBloque = () => enDecl.length > 0 && enDecl[enDecl.length - 1];
    let preludio = "";
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === "\n") { out.push(["nl", c]); i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { let j = i; while (j < n && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++; out.push(["esp", src.slice(i, j)]); i = j; continue; }
      if (c === "/" && d === "*") { let j = src.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; out.push(["com", src.slice(i, j), "com"]); i = j; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n) { const e = src[j]; if (e === "\\") { j += 2; continue; } if (e === c) { j++; break; } if (e === "\n") break; j++; }
        j = Math.min(n, j); out.push(["str", src.slice(i, j), "str"]); preludio += src.slice(i, j); i = j; continue;
      }
      if (c === "{") { enDecl.push(!/^\s*@(?!font-face|page)/.test(preludio)); preludio = ""; esperaValor = false; prof++; out.push(["p", c]); i++; continue; }
      if (c === "}") { enDecl.pop(); preludio = ""; esperaValor = false; prof = Math.max(0, prof - 1); out.push(["p", c]); i++; continue; }
      if (c === ";") { preludio = ""; esperaValor = false; out.push(["p", c]); i++; continue; }
      if (c === "@") { const m = RE_ID_CSS.exec(src.slice(i + 1, i + 60)); const t = "@" + (m ? m[0] : ""); out.push(["id", t, "kw"]); preludio += t; i += t.length; continue; }
      if (c === "#" && enBloque() && esperaValor) { const m = /^#[0-9a-f]{3,8}\b/i.exec(src.slice(i, i + 10)); if (m) { out.push(["num", m[0], "num"]); i += m[0].length; continue; } }
      if ((c === "." || c === "#") && !enBloque() && RE_ID_CSS.test(src.slice(i + 1, i + 3))) {
        const m = RE_ID_CSS.exec(src.slice(i + 1, i + 200)); out.push(["p", c, "fn"]); out.push(["id", m[0], "fn"]); preludio += c + m[0]; i += 1 + m[0].length; continue;
      }
      if (/[0-9]/.test(c) || ((c === "." || c === "-" || c === "+") && /[0-9.]/.test(d || "") && enBloque())) {
        const m = RE_NUM_CSS.exec(src.slice(i, i + 40));
        if (m) { out.push(["num", m[0], "num"]); preludio += m[0]; i += m[0].length; continue; }
      }
      const m = RE_ID_CSS.exec(src.slice(i, i + 200));
      if (m) {
        const t = m[0];
        let cls = null;
        if (enBloque() && !esperaValor) {
          // ¿propiedad? un nombre seguido de «:» dentro de un bloque de declaraciones
          let j = i + t.length; while (j < n && (src[j] === " " || src[j] === "\t")) j++;
          if (src[j] === ":") { cls = "prop"; esperaValor = true; }
          else cls = "maq";   // selector anidado
        } else if (!enBloque()) cls = /^[a-z][a-z0-9]*$/i.test(t) && !preludio.trim().startsWith("@") ? "maq" : null;
        else if (t === "important" && out.length && out[out.length - 1][1] === "!") cls = "kw";
        out.push(["id", t, cls]); preludio += t; i += t.length; continue;
      }
      if (c === ":" && !enBloque()) {
        // seudoclase: «a:hover», «::before»
        let j = i; while (src[j] === ":") j++;
        const mm = RE_ID_CSS.exec(src.slice(j, j + 60));
        if (mm) { out.push(["p", src.slice(i, j), "kw"]); out.push(["id", mm[0], "kw"]); preludio += src.slice(i, j) + mm[0]; i = j + mm[0].length; continue; }
      }
      out.push(["p", c]); preludio += c; i++;
    }
    return out;
  }

  // ---------- HTML ----------
  const VACIAS = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
  function clasificarJS(toks) {
    // Los colores de JS dentro de <script>: los del adaptador de JS sobre sus propias fichas.
    return toks.map((t, i) => [t[0], t[1], JS.clasificar(toks, i, {}) || null]);
  }
  function lexicoHTML(src) {
    const out = [], n = src.length;
    let i = 0;
    const blancos = () => {
      let hubo = false;
      while (i < n) {
        const c = src[i];
        if (c === "\n") { out.push(["nl", c]); i++; hubo = true; continue; }
        if (c === " " || c === "\t" || c === "\r") { let j = i; while (j < n && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++; out.push(["esp", src.slice(i, j)]); i = j; hubo = true; continue; }
        break;
      }
      return hubo;
    };
    function etiqueta() {
      out.push(["p", "<"]); i++;
      const cierre = src[i] === "/";
      if (cierre) { out.push(["p", "/"]); i++; }
      const m = /^[A-Za-z][\w:-]*/.exec(src.slice(i, i + 80));
      const nombre = m ? m[0].toLowerCase() : "";
      if (m) { out.push(["id", m[0], "maq"]); i += m[0].length; }
      while (i < n) {
        if (blancos()) continue;
        const c = src[i];
        if (c === ">") { out.push(["p", ">"]); i++; break; }
        if (c === "<") break;   // etiqueta sin cerrar: sigue el texto
        if (c === "/") { out.push(["p", "/"]); i++; continue; }
        if (c === "=") {
          out.push(["p", "="]); i++;
          blancos();
          const q = src[i];
          if (q === '"' || q === "'") { let j = src.indexOf(q, i + 1); j = j < 0 ? n : j + 1; out.push(["str", src.slice(i, j), "str"]); i = j; }
          else { const v = /^[^\s"'<>=`]+/.exec(src.slice(i, i + 400)); if (v) { out.push(["id", v[0], "str"]); i += v[0].length; } }
          continue;
        }
        const a = /^[^\s"'<>\/=]+/.exec(src.slice(i, i + 200));
        if (a) { out.push(["id", a[0], "prop"]); i += a[0].length; continue; }
        out.push(["p", c]); i++;
      }
      // Contenido de <script> y <style>: con el léxico de su lenguaje, hasta su etiqueta de cierre.
      if (!cierre && (nombre === "script" || nombre === "style")) {
        const re = new RegExp("</" + nombre + "\\s*>", "ig"); re.lastIndex = i;
        const fin = re.exec(src), j = fin ? fin.index : n;
        if (j > i) out.push(...(nombre === "script" ? clasificarJS(lexicoJS(src.slice(i, j))) : lexicoCSS(src.slice(i, j))));
        i = j;
      }
    }
    while (i < n) {
      if (blancos()) continue;
      const c = src[i];
      if (src.startsWith("<!--", i)) { let j = src.indexOf("-->", i + 4); j = j < 0 ? n : j + 3; out.push(["com", src.slice(i, j), "com"]); i = j; continue; }
      if (c === "<" && src[i + 1] === "!") { let j = src.indexOf(">", i); j = j < 0 ? n : j + 1; out.push(["com", src.slice(i, j), "kw"]); i = j; continue; }
      if (c === "<" && /[A-Za-z\/]/.test(src[i + 1] || "")) { etiqueta(); continue; }
      if (c === "&") { const m = /^&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.exec(src.slice(i, i + 40)); if (m) { out.push(["id", m[0], "num"]); i += m[0].length; continue; } }
      const w = /^[\wÀ-￿]+/.exec(src.slice(i, i + 200));
      if (w) { out.push([/^\d+$/.test(w[0]) ? "num" : "id", w[0], null]); i += w[0].length; continue; }
      out.push(["p", c]); i++;
    }
    return out;
  }

  // ---------- Comentarios de bloque (HTML <!-- -->, CSS /* */) ----------
  function comentarioDe(abre, cierra) {
    return ({ codigo: $codigo, insertar, sinTeclado }) => function alternarComentario() {
      if ($codigo.readOnly) return;
      const v = $codigo.value, a = $codigo.selectionStart;
      let b = $codigo.selectionEnd;
      if (b > a && v[b - 1] === "\n") b--;
      const ini = v.lastIndexOf("\n", a - 1) + 1;
      let fin = v.indexOf("\n", b); if (fin < 0) fin = v.length;
      const tramo = v.slice(ini, fin), sangria = tramo.match(/^\s*/)[0], cuerpo = tramo.trim();
      if (!cuerpo) return;
      let texto;
      if (cuerpo.startsWith(abre) && cuerpo.endsWith(cierra)) {
        const dentro = cuerpo.slice(abre.length, cuerpo.length - cierra.length).replace(/^ /, "").replace(/ $/, "");
        texto = sangria + dentro + tramo.slice(sangria.length + cuerpo.length);
      } else texto = sangria + abre + " " + tramo.slice(sangria.length).replace(/\s+$/, "") + " " + cierra;
      if (!sinTeclado()) $codigo.focus();
      $codigo.setSelectionRange(ini, fin);
      insertar(texto, 0, texto.length);
    };
  }

  // ---------- Sangría ----------
  const abreHTML = (l) => {
    if (/\{\s*$/.test(l)) return true;
    const m = /<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>\s*$/.exec(l);
    if (!m || /\/>\s*$/.test(l)) return false;
    const nombre = m[1].toLowerCase();
    return !VACIAS.has(nombre) && !new RegExp("</" + nombre + "\\s*>\\s*$", "i").test(l.slice(m.index));
  };
  const sangria = (abre) => ({ unidad: "  ", significativa: false, abre, alPartirLinea: (l) => l.match(/^\s*/)[0] + (abre(l) ? "  " : "") });

  // ---------- Barra de inserción ----------
  // Lo común del teléfono (línea nueva, tab, comentar, borrar, pares y signos) sale del catálogo compartido,
  // igual que en JS y Python. Detrás van los bloques de cada lenguaje.
  const comunes = () => window.CMGCatalogo.atajos("js").filter((a) => a && a !== "|" && (a.movil || a.comentar));
  // Las etiquetas de una línea (p, span, button…) van donde está el cursor y rodean lo elegido; las de bloque
  // (div, ul, link, script…) van en su propia línea, con sangría, como los bloques de JS.
  const ico = (t) => "web-" + t.replace(/\W/g, "");
  const enLinea = (t, ins = `<${t}></${t}>`, sel = t.length + 2) => ({ ico: ico(t), t: "<" + t + ">", simbolo: { ins, sel }, cod: ins });
  const bloque = (t, b, envolvente, extra = {}) => ({ ico: ico(t), t: "<" + t + ">", b, ...(envolvente ? { envolvente } : {}), cod: b.replace(/\n\s*/g, " "), ...extra });
  const contenedor = (t) => bloque(t, `<${t}>\n  \n</${t}>`, [`<${t}>\n`, `\n</${t}>`]);
  function atajosHTML() {
    const base = comunes();
    // En HTML el primer par es < >; los demás pares siguen como variantes.
    const pares = base.find((a) => a.ico === "parentesis");
    if (pares) {
      const angulos = { ico: "web-angulos", t: "Signos < >", movil: true, simbolo: { ins: "<>", sel: 1 }, cod: "< >" };
      angulos.variantes = [{ ico: "web-cierre", t: "Cierre </ >", movil: true, simbolo: { ins: "</>", sel: 2 }, cod: "</ >" },
        { ico: "web-atributo", t: 'Atributo =""', movil: true, simbolo: { ins: '=""', sel: 2 }, cod: '=""' }, { ...pares, variantes: undefined }, ...(pares.variantes || [])];
      base.splice(base.indexOf(pares), 1, angulos);
    }
    return [
      ...base,
      { ico: "web-pagina", t: "Página HTML", b: '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Mi página</title>\n  <link rel="stylesheet" href="estilos.css">\n</head>\n<body>\n  \n  <script src="main.js"></script>\n</body>\n</html>', cod: "<!doctype html> …" },
      "|",
      { ...contenedor("div"), variantes: [contenedor("section"), bloque("ul", "<ul>\n  <li></li>\n</ul>", ["<ul>\n  <li>", "</li>\n</ul>"]), enLinea("li")] },
      { ...enLinea("p"), variantes: ["h1", "h2", "span", "strong", "em"].map((t) => enLinea(t)) },
      { ...enLinea("button"), variantes: [enLinea("input", '<input type="text">', 19), enLinea("a", '<a href=""></a>', 9), enLinea("img", '<img src="" alt="">', 10)] },
      "|",
      { ...bloque("link", '<link rel="stylesheet" href="estilos.css">'), ico: "web-enlazarCSS", t: "Enlazar CSS",
        variantes: [{ ...bloque("script", '<script src="main.js"></script>'), ico: "web-enlazarJS", t: "Enlazar JS" },
          { ...bloque("script", '<script type="module" src="main.js"></script>'), ico: "web-enlazarJS", t: "Enlazar módulo JS" }] },
      { ...bloque("style", "<style>\n  \n</style>", ["<style>\n", "\n</style>"]), ico: "web-estilo", variantes: [{ ...bloque("script", "<script>\n  \n</script>", ["<script>\n", "\n</script>"]), ico: "web-script" }] },
      { ico: "web-clase", t: 'Clase class=""', simbolo: { ins: ' class=""', sel: 8 }, cod: ' class="…"', variantes: [{ ico: "web-id", t: 'Id id=""', simbolo: { ins: ' id=""', sel: 5 }, cod: ' id="…"' }] },
    ];
  }
  function atajosCSS() {
    const prop = (p, v = "") => ({ ico: "web-propiedad", t: p, simbolo: { ins: `${p}: ${v};`, sel: p.length + 2 + v.length }, cod: `${p}: …;` });
    return [
      ...comunes(),
      { ico: "web-regla", t: "Regla .clase { }", b: ".clase {\n  \n}", cod: ".clase { … }", variantes: [{ ico: "web-regla", t: "Regla #id { }", b: "#id {\n  \n}", cod: "#id { … }" }, { ico: "web-regla", t: "Regla etiqueta { }", b: "body {\n  \n}", cod: "body { … }" }] },
      { ...prop("color"), variantes: ["background", "margin", "padding", "font-size", "border", "width", "height"].map((p) => prop(p)) },
      { ...prop("display", "flex"), t: "display: flex", variantes: [prop("gap"), prop("justify-content", "center"), prop("align-items", "center"), prop("flex-direction", "column")] },
      "|",
      { ico: "web-media", t: "@media", b: "@media (max-width: 600px) {\n  \n}", cod: "@media (…) { … }" },
      { ico: "web-variable", t: "Variable --color", simbolo: { ins: "--color: ;", sel: 9 }, cod: "--color: …;", variantes: [{ ico: "web-variable", t: "var(--color)", simbolo: { ins: "var(--color)", sel: 11 }, cod: "var(--…)" }] },
    ];
  }
  // Iconos grabados como los de los signos del catálogo (texto sobre la placa).
  const svg = (cuerpo) => `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${cuerpo}</svg>`;
  const rotulo = (t, tam = 11) => svg(`<text class="t1 letra" x="16" y="${tam > 13 ? 21.5 : 20}" font-size="${tam}" text-anchor="middle">${t}</text><path class="s2" stroke-width="2" stroke-linecap="round" d="M5 26.5h22"/>`);
  const ICONOS = {
    "web-angulos": { c1: "#9CC8FF", c2: "#E9EEF2", svg: rotulo("&lt; &gt;", 15) },
    "web-cierre": { c1: "#9CC8FF", c2: "#E9EEF2", svg: rotulo("&lt;/&gt;", 13) },
    "web-atributo": { c1: "#9CC8FF", c2: "#E9EEF2", svg: rotulo("=&quot;&quot;", 13) },
    "web-pagina": { c1: "#F2A65A", c2: "#E9EEF2", svg: rotulo("html", 10) },
    "web-estilo": { c1: "#63D2E0", c2: "#E9EEF2", svg: rotulo("style", 9) },
    "web-script": { c1: "#F2D45A", c2: "#E9EEF2", svg: rotulo("script", 8) },
    "web-enlazarCSS": { c1: "#63D2E0", c2: "#E9EEF2", svg: rotulo("→css", 9.5) },
    "web-enlazarJS": { c1: "#F2D45A", c2: "#E9EEF2", svg: rotulo("→js", 10.5) },
    "web-clase": { c1: "#CFA2FF", c2: "#E9EEF2", svg: rotulo("class", 9) },
    "web-id": { c1: "#CFA2FF", c2: "#E9EEF2", svg: rotulo("id", 12) },
    "web-regla": { c1: "#CFA2FF", c2: "#E9EEF2", svg: rotulo(".a{}", 10.5) },
    "web-propiedad": { c1: "#63D2E0", c2: "#E9EEF2", svg: rotulo("a: b;", 9.5) },
    "web-media": { c1: "#E2E7E2", c2: "#E9EEF2", svg: rotulo("@m", 12) },
    "web-variable": { c1: "#7FA3FF", c2: "#E9EEF2", svg: rotulo("--x", 11) },
  };
  for (const t of ["div", "section", "ul", "li", "p", "h1", "h2", "span", "strong", "em", "button", "input", "a", "img"])
    ICONOS["web-" + t] = { c1: "#7FA3FF", c2: "#E9EEF2", svg: rotulo(t, t.length > 5 ? 8 : t.length > 3 ? 9.5 : 12) };

  const NUNCA = /(?!)/;   // sin huecos /* … */ en estos lenguajes
  const base = (id, nombre, lexico, abre, cierra, abreLinea, atajos) => ({
    id, nombre, lexico, clasificar: (toks, i) => toks[i][2] || null,
    estructura: JS.estructura,
    hueco: { re: NUNCA, crear: () => "", nombreDe: () => null },
    comentario: { linea: "", crear: comentarioDe(abre, cierra) }, sangria: sangria(abreLinea),
    get plantillas() { try { return atajos(); } catch (e) { console.error("Plantillas " + nombre + " no disponibles:", e); return []; } },
    teclas: [{ t: "<" }, { t: ">" }, { t: "/" }, { t: "=" }, { t: '" "', ins: '""', sel: 1 }, { t: "{ }", ins: "{}", sel: 1 }, { t: ":" }, { t: ";" }],
    crearEdicion: JS.crearEdicion, finSentencia: "",
    llamada: (fn) => window.CMGLenguajes.llamada(fn, "js"),
  });
  window.MCLenguajesWeb = {
    html: base("html", "HTML", lexicoHTML, "<!--", "-->", abreHTML, atajosHTML),
    css: base("css", "CSS", lexicoCSS, "/*", "*/", (l) => /\{\s*$/.test(l), atajosCSS),
    iconos: ICONOS, lexicoHTML, lexicoCSS,
  };
})();
