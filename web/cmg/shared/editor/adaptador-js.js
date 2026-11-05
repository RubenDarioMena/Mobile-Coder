/* Adaptador JS: sintaxis, clasificación y edición; sin nombres del juego. */
(() => {
  "use strict";
  const { lexico, HUECO, RE_HUECO } = window.CMGEditorJS;
  const KW = new Set("await async break case catch class const continue default delete do else false finally for function if in instanceof let new null of return switch this throw true try typeof undefined var void while".split(" "));
  function vecino(toks, i, dir) {
    for (let j = i + dir; j >= 0 && j < toks.length; j += dir) if (toks[j][0] !== "esp" && toks[j][0] !== "com") return toks[j];
    return null;
  }
  function clasificar(toks, i, vocabulario = {}) {
    const FN_MIEMBRO = new Set(vocabulario.miembros || vocabulario.funciones || []);
    const FN_PROPIAS = new Set(vocabulario.funciones || []), PROPS = new Set(vocabulario.propiedades || []);
    const esObjeto = n => (vocabulario.objetos || []).includes(n);
    const [k, t] = toks[i];
    if (k === "com") return HUECO.test(t) ? "com hueco" : "com";
    if (k === "str") return "str";
    if (k === "num") return "num";
    if (k !== "id") return null;
    const prev = vecino(toks, i, -1);
    if (prev && prev[1] === ".") return FN_MIEMBRO.has(t) ? "fn" : PROPS.has(t) ? "prop" : null;
    if (KW.has(t)) return "kw";
    if (esObjeto(t)) return "maq";
    if (FN_PROPIAS.has(t)) return "fn";
    if (PROPS.has(t)) return "prop";
    return null;
  }
  const TECLAS = [
    { t: "⇥", ins: "  ", cls: "nav", n: "Sangría" }, { t: "←", mover: -1, cls: "nav" }, { t: "→", mover: 1, cls: "nav" }, "|",
    { t: "( )", ins: "()", sel: 1 }, { t: "{ }", ins: "{}", sel: 1 }, { t: "[ ]", ins: "[]", sel: 1 }, { t: '" "', ins: '""', sel: 1 },
    { t: ";" }, { t: "." }, { t: "," }, { t: "=" }, { t: "===" }, { t: "!==" }, { t: "<" }, { t: ">" },
    { t: "&&" }, { t: "||" }, { t: "!" }, { t: "??" }, { t: "+" }, { t: "-" }, { t: "*" }, { t: "/" }, { t: "%" }, "|",
    ...["const", "let", "if", "else", "while", "await", "true", "false", "null"].map(k => ({ t: k, ins: k + " ", cls: "kw" })), "|",
    { t: "//", comentar: true, cls: "nav" }, { t: "⌄", ocultar: true, cls: "nav", n: "Ocultar teclado" },
  ];

  function crearComentario({ codigo: $codigo, insertar, sinTeclado }) {
  function alternarComentario() {
    if ($codigo.readOnly) return;
    const v = $codigo.value, a = $codigo.selectionStart;
    let b = $codigo.selectionEnd;
    if (b > a && v[b - 1] === "\n") b--;
    const ini = v.lastIndexOf("\n", a - 1) + 1;
    let fin = v.indexOf("\n", b); if (fin < 0) fin = v.length;
    const lineas = v.slice(ini, fin).split("\n");
    const bloque = (l) => /^\s*(\/\*|\*)/.test(l);
    const utiles = lineas.filter(l => l.trim() && !bloque(l));
    if (!utiles.length) return;
    let nuevas;
    if (utiles.every(l => /^\s*\/\//.test(l))) nuevas = lineas.map(l => bloque(l) ? l : l.replace(/^(\s*)\/\/ ?/, "$1"));
    else {
      const min = Math.min(...utiles.map(l => l.match(/^\s*/)[0].length));
      nuevas = lineas.map(l => !l.trim() || bloque(l) ? l : l.slice(0, min) + "// " + l.slice(min));
    }
    const texto = nuevas.join("\n");
    if (!sinTeclado()) $codigo.focus();
    $codigo.setSelectionRange(ini, fin);
    insertar(texto, 0, texto.length);
  }
    return alternarComentario;
  }
  const estructura = { ...window.ESTRUCTURA, analizar: (src, fichas = lexico(src)) => window.ESTRUCTURA.analizar(src, fichas) };
  window.CMGAdaptadorJS = {
    id: "js", nombre: "JavaScript", lexico, clasificar, estructura,
    hueco: { re: RE_HUECO, crear: n => "/* " + n + " */", nombreDe: t => t.match(HUECO)?.[1] || null },
    comentario: { linea: "//", crear: crearComentario }, sangria: { unidad: "  ", significativa: false },
    // Perezoso y protegido: sin plantillas (caché mezclada) el adaptador sigue existiendo, con la paleta vacía.
    get plantillas() { try { return window.CMGPlantillasJS.crear().atajos; } catch (e) { console.error("Plantillas JS no disponibles:", e); return []; } },
    teclas: TECLAS, crearEdicion: window.CMGEditorJS.crearEdicion,
    llamada: fn => window.CMGLenguajes.llamada(fn, "js"),
  };
})();
