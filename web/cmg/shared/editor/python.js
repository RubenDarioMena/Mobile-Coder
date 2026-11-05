/* Primitivas Python del editor (E4): léxico, huecos, sangría significativa, plantillas y teclas.
 * No crea interfaz ni ejecuta programas: el árbol sale de estructura-python.js (lezer) y la
 * ejecución, en E5, del traductor del juego. El puerto de texto e inserción lo pone el anfitrión.
 *
 * En Python la sangría es el programa. Toda operación que mueve o crea líneas pregunta aquí por
 * los niveles válidos (niveles) y deja un «pass» donde un bloque se quedaría vacío (rellenar). */
(() => {
  "use strict";
  const UNIDAD = "    ";
  // Huecos: identificadores válidos __nombre__ (D4). Los nombres con dos guiones de Python
  // (__name__, __init__…) no son huecos.
  const DUNDER = "name|main|init|file|doc|class|dict|module|all|builtins|import|call|len|str|repr|eq|hash|iter|next|enter|exit|getitem|setitem|add|slots|new|del|annotations|qualname|spec|package|loader|path|version";
  const CUERPO = "[a-z](?:[a-z0-9_]*[a-z0-9])?";
  const HUECO = new RegExp(`^__(?!(?:${DUNDER})__$)(${CUERPO})__$`);
  const RE_HUECO = new RegExp(`(?<![A-Za-z0-9_])__(?!(?:${DUNDER})__(?![A-Za-z0-9_]))${CUERPO}__(?![A-Za-z0-9_])`);
  // Los nombres del juego llevan espacios y tildes; el hueco los guarda sin ellos.
  const sinTildes = n => n.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const aHueco = n => "__" + sinTildes(n).trim().toLowerCase().replace(/\s+/g, "_") + "__";
  const CONOCIDOS = ["tipo de enemigo", "tipo", "sensor", "lugar", "material", "condición", "segundos", "mensaje", "valor", "n", "elemento", "lista"];
  const DE_HUECO = new Map(CONOCIDOS.map(n => [aHueco(n), n]));
  const nombreDe = t => { const m = String(t).trim().match(HUECO); return m ? DE_HUECO.get(m[0]) || m[1].replace(/_/g, " ") : null; };

  const RE_ID = /[A-Za-z_À-￿][\wÀ-￿]*/y;
  const RE_NUM = /0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?[jJ]?/y;
  const RE_PREFIJO = /(?:[rR][bBfF]?|[bBfF][rR]?|[uU])(?=["'])/y;
  // Fichas que, concatenadas, reproducen el texto: id num str com esp nl p (como el léxico JS).
  function lexico(src) {
    const out = [], n = src.length;
    let i = 0;
    while (i < n) {
      const c = src[i];
      if (c === "#") { let j = src.indexOf("\n", i); if (j < 0) j = n; out.push(["com", src.slice(i, j)]); i = j; continue; }
      RE_PREFIJO.lastIndex = i;
      const pre = /[rRbBfFuU]/.test(c) ? RE_PREFIJO.exec(src) : null;
      const q = pre ? i + pre[0].length : i;
      if (src[q] === '"' || src[q] === "'") {
        const comilla = src[q], triple = src.startsWith(comilla.repeat(3), q), cierre = triple ? comilla.repeat(3) : comilla;
        let j = q + cierre.length;
        while (j < n) {
          if (src[j] === "\\") { j += 2; continue; }
          if (src.startsWith(cierre, j)) { j += cierre.length; break; }
          if (src[j] === "\n" && !triple) break;
          j++;
        }
        j = Math.min(n, j); out.push(["str", src.slice(i, j)]); i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) { RE_NUM.lastIndex = i; const m = RE_NUM.exec(src); out.push(["num", m[0]]); i += m[0].length; continue; }
      if (/[A-Za-z_À-￿]/.test(c)) { RE_ID.lastIndex = i; const m = RE_ID.exec(src); out.push(["id", m[0]]); i += m[0].length; continue; }
      if (c === "\n") { out.push(["nl", c]); i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { let j = i; while (j < n && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++; out.push(["esp", src.slice(i, j)]); i = j; continue; }
      out.push(["p", c]); i++;
    }
    return out;
  }

  const KW = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
  // Funciones del lenguaje (subconjunto de E5/E6); las del proyecto llegan del proveedor.
  const INTEGRADAS = new Set("print len range enumerate abs min max int float str bool round sum list sorted reversed".split(" "));
  function vecino(toks, i, dir) {
    for (let j = i + dir; j >= 0 && j < toks.length; j += dir) if (toks[j][0] !== "esp" && toks[j][0] !== "com") return toks[j];
    return null;
  }
  function clasificar(toks, i, vocabulario = {}) {
    const FN_MIEMBRO = new Set(vocabulario.miembros || vocabulario.funciones || []);
    const FN_PROPIAS = new Set(vocabulario.funciones || []), PROPS = new Set(vocabulario.propiedades || []);
    const [k, t] = toks[i];
    if (k === "com") return "com";
    if (k === "str") return "str";
    if (k === "num") return "num";
    if (k !== "id") return null;
    if (HUECO.test(t)) return "com hueco";
    const prev = vecino(toks, i, -1);
    if (prev && prev[1] === ".") return FN_MIEMBRO.has(t) ? "fn" : PROPS.has(t) ? "prop" : null;
    if (KW.has(t)) return "kw";
    if ((vocabulario.objetos || []).includes(t)) return "maq";
    if (FN_PROPIAS.has(t) || INTEGRADAS.has(t)) return "fn";
    if (PROPS.has(t)) return "prop";
    return null;
  }

  // ---------- Líneas lógicas y sangría ----------
  // Una línea física empieza una sentencia si no está dentro de ( [ { ni de un texto de varias líneas
  // y no sigue a una barra invertida. Las vacías o solo de comentario no cuentan.
  function lineas(src) {
    const out = [];
    let ini = 0;
    for (const l of src.split("\n")) { out.push({ a: ini, b: ini + l.length, texto: l, inicio: true, util: false }); ini += l.length + 1; }
    let li = 0, prof = 0, continua = false, primera = true;
    for (const [k, t] of lexico(src)) {
      if (k === "nl") { li++; if (out[li]) out[li].inicio = prof === 0 && !continua; continua = false; primera = true; continue; }
      if (k === "esp" || k === "com") continue;
      if (primera) { out[li].util = true; primera = false; }
      if (k === "str") for (const _ of t.matchAll(/\n/g)) { li++; if (out[li]) out[li].inicio = false; }
      if (k === "p") { if ("([{".includes(t)) prof++; else if (")]}".includes(t)) prof = Math.max(0, prof - 1); }
      continua = k === "p" && t === "\\";
    }
    return out;
  }
  const sangriaDe = l => l.match(/^[ \t]*/)[0];
  // La última ficha útil de la línea lógica que empieza en la línea i es «:» (fuera de paréntesis).
  function abreBloqueEn(ls, i) {
    let fin = i;
    for (let k = i + 1; k < ls.length && !ls[k].inicio; k++) fin = k;
    return abre(ls.slice(i, fin + 1).map(l => l.texto).join("\n"));
  }
  const abre = linea => {
    const toks = lexico(linea).filter(([k]) => k !== "esp" && k !== "com" && k !== "nl");
    return toks.length > 0 && toks[toks.length - 1][1] === ":";
  };
  const CIERRA = /^(?:return|pass|break|continue|raise)\b/;
  const SIGUE = /^(?:elif|else|except|finally)\b/;
  // Enter con teclado: la sangría de la línea, un nivel más tras «:», uno menos tras return/pass/break…
  function alPartirLinea(linea) {
    const s = sangriaDe(linea), t = linea.trim();
    if (abre(linea)) return s + UNIDAD;
    if (CIERRA.test(t) && s.length >= UNIDAD.length) return s.slice(0, s.length - UNIDAD.length);
    return s;
  }
  // Índice de la línea física que empieza en pos (pos = inicio de línea o fin del texto).
  function lineaEn(ls, pos) {
    for (let i = 0; i < ls.length; i++) if (ls[i].a >= pos) return i;
    return ls.length;
  }
  // Niveles de sangría válidos para insertar líneas completas en pos, del más profundo al menos.
  // Entre el final de un bloque y lo que sigue caben varios: dentro del bloque o fuera de él.
  // Lista vacía: ahí no se puede insertar una sentencia (dentro de una línea lógica).
  function niveles(src, pos) {
    const ls = lineas(src), L = lineaEn(ls, pos);
    if (L < ls.length && !ls[L].inicio) return [];
    let p = -1; for (let i = Math.min(L, ls.length) - 1; i >= 0; i--) if (ls[i].util && ls[i].inicio) { p = i; break; }
    let s = -1; for (let i = L; i < ls.length; i++) if (ls[i].util && ls[i].inicio) { s = i; break; }
    const sigS = s >= 0 ? sangriaDe(ls[s].texto) : "";
    if (p < 0) return [sigS];
    const ip = sangriaDe(ls[p].texto);
    if (abreBloqueEn(ls, p)) return [s >= 0 && sigS.length > ip.length ? sigS : ip + UNIDAD];
    // La línea anterior y los bloques que la contienen: después de cualquiera de ellos se puede seguir.
    const out = [ip];
    let cur = ip.length;
    for (let i = p - 1; i >= 0 && cur > 0; i--) {
      if (!ls[i].util || !ls[i].inicio) continue;
      const si = sangriaDe(ls[i].texto);
      if (si.length < cur) { out.push(si); cur = si.length; }
    }
    if (cur > 0) out.push("");
    const sigue = s >= 0 && SIGUE.test(ls[s].texto.trim());
    return out.filter(n => s < 0 || (sigue ? n.length > sigS.length : n.length >= sigS.length));
  }
  // Tras quitar líneas en pos: si la cabecera anterior se queda sin cuerpo, se le pone «pass».
  // Devuelve el texto y cuánto creció en pos.
  function rellenar(src, pos) {
    const ls = lineas(src), L = lineaEn(ls, pos);
    let p = -1; for (let i = Math.min(L, ls.length) - 1; i >= 0; i--) if (ls[i].util && ls[i].inicio) { p = i; break; }
    if (p < 0 || !abreBloqueEn(ls, p)) return { texto: src, crece: 0 };
    let s = -1; for (let i = L; i < ls.length; i++) if (ls[i].util && ls[i].inicio) { s = i; break; }
    const ip = sangriaDe(ls[p].texto);
    if (s >= 0 && sangriaDe(ls[s].texto).length > ip.length) return { texto: src, crece: 0 };
    // Al final del texto sin salto, el «pass» va en una línea nueva.
    const enFin = pos >= src.length && src.length && !src.endsWith("\n");
    const linea = (enFin ? "\n" : "") + ip + UNIDAD + "pass" + (enFin ? "" : "\n");
    return { texto: src.slice(0, pos) + linea + src.slice(pos), crece: linea.length };
  }

  // ---------- Comentarios ----------
  function crearComentario({ codigo: $codigo, insertar, sinTeclado }) {
    return function alternarComentario() {
      if ($codigo.readOnly) return;
      const v = $codigo.value, a = $codigo.selectionStart;
      let b = $codigo.selectionEnd;
      if (b > a && v[b - 1] === "\n") b--;
      const ini = v.lastIndexOf("\n", a - 1) + 1;
      let fin = v.indexOf("\n", b); if (fin < 0) fin = v.length;
      const ls = v.slice(ini, fin).split("\n"), utiles = ls.filter(l => l.trim());
      if (!utiles.length) return;
      let nuevas;
      if (utiles.every(l => /^\s*#/.test(l))) nuevas = ls.map(l => l.replace(/^(\s*)# ?/, "$1"));
      else {
        const min = Math.min(...utiles.map(l => sangriaDe(l).length));
        nuevas = ls.map(l => !l.trim() ? l : l.slice(0, min) + "# " + l.slice(min));
      }
      const texto = nuevas.join("\n");
      if (!sinTeclado()) $codigo.focus();
      $codigo.setSelectionRange(ini, fin);
      insertar(texto, 0, texto.length);
    };
  }

  // ---------- Plantillas y teclas ----------
  // Cada plantilla de bloque trae su cuerpo en una línea sangrada vacía (ahí queda el cursor);
  // la envolvente pone la cabecera sobre las líneas elegidas, que bajan un nivel.
  // Los atajos de la paleta común salen del catálogo único (CMGCatalogo, en plantillas.js, que se carga antes), con su texto en Python.
  function plantillas({ pausa = "" } = {}) {
    return { atajos: window.CMGCatalogo.atajos("python", { pausa }), textoAtajo: window.CMGCatalogo.textoAtajo };
  }
  const TECLAS = [
    { t: "⇥", ins: UNIDAD, cls: "nav", n: "Sangría" }, { t: "←", mover: -1, cls: "nav" }, { t: "→", mover: 1, cls: "nav" }, "|",
    { t: "( )", ins: "()", sel: 1 }, { t: "[ ]", ins: "[]", sel: 1 }, { t: '" "', ins: '""', sel: 1 }, { t: "f\" \"", ins: 'f""', sel: 2 },
    { t: ":" }, { t: "." }, { t: "," }, { t: "=" }, { t: "==" }, { t: "!=" }, { t: "<" }, { t: ">" },
    { t: "+" }, { t: "-" }, { t: "*" }, { t: "/" }, { t: "//" }, { t: "%" }, { t: "**" }, "|",
    ...["if", "elif", "else", "while", "for", "in", "def", "return", "await", "and", "or", "not", "True", "False", "None"].map(k => ({ t: k, ins: k + " ", cls: "kw" })), "|",
    { t: "#", comentar: true, cls: "nav" }, { t: "⌄", ocultar: true, cls: "nav", n: "Ocultar teclado" },
  ];
  // Para la barra de edición y las sugerencias (los equivalentes de JS viven en edicion.js).
  const EDICION = {
    familias: [
      ["Comparar", [["==", "igual"], ["!=", "distinto"], [">", "mayor"], ["<", "menor"], [">=", "mayor o igual"], ["<=", "menor o igual"]]],
      ["Combinar", [["and", "y · se cumplen las dos"], ["or", "o · basta una"]]],
      ["Calcular", [["+", "suma"], ["-", "resta"], ["*", "multiplica"], ["/", "divide"], ["//", "divide sin decimales"], ["%", "resto"], ["**", "potencia"]]],
      ["Asignar", [["=", "guarda"], ["+=", "suma y guarda"], ["-=", "resta y guarda"], ["*=", "multiplica y guarda"]]],
    ],
    declara: [],
    literales: [["True", "verdadero"], ["False", "falso"], ["None", "nada"]],
  };

  // ---------- Operaciones sobre el texto ----------
  function crearEdicion({ codigo: $codigo, insertar, aviso: avisoEditor, escapar: esc, estructura }) {
    // Doble clic: el texto entero; triple clic: el contenido de ( ), [ ] o { }.
    function rangoCodigo(pos, triple) {
      const src = $codigo.value, pila = [], pares = [];
      let offset = 0;
      for (const [tipo, txt] of lexico(src)) {
        const desde = offset; offset += txt.length;
        if (!triple && tipo === "str" && pos >= desde && pos < offset) return [desde, offset];
        if (!triple && tipo === "id" && HUECO.test(txt) && pos >= desde && pos < offset) return [desde, offset];
        if (tipo !== "p") continue;
        if ("([{".includes(txt)) pila.push({ c: txt, pos: desde });
        else if (")]}".includes(txt)) {
          const abreP = pila.pop();
          if (abreP && "([{".indexOf(abreP.c) === ")]}".indexOf(txt)) pares.push([abreP.pos, desde]);
          else pila.length = 0;
        }
      }
      if (triple) { const par = pares.find(([a, b]) => a === pos || b === pos); if (par) return [par[0] + 1, par[1]]; }
      return null;
    }
    // Envolver líneas en un bloque: la cabecera con la sangría de la primera línea elegida y las
    // líneas un nivel más adentro; lo que sigue a la envolvente (else: pass) vuelve a esa sangría.
    function envolver(antes, despues, bloque = false) {
      const a = $codigo.selectionStart, b = $codigo.selectionEnd;
      if (a === b || $codigo.readOnly) return false;
      const v = $codigo.value, elegido = v.slice(a, b);
      if (!bloque) return insertar(antes + elegido + despues, antes.length, antes.length + elegido.length);
      const ini = v.lastIndexOf("\n", a - 1) + 1, prefijo = v.slice(ini, a);
      const sangria = sangriaDe(prefijo.trim() ? prefijo : prefijo + elegido);
      if (!prefijo.trim()) antes = sangria.slice(prefijo.length) + antes;
      const saltoFinal = elegido.endsWith("\n");
      const ls = (saltoFinal ? elegido.slice(0, -1) : elegido).split("\n");
      if (!prefijo.trim()) ls[0] = prefijo + ls[0];
      const utiles = ls.filter(l => l.trim());
      const margen = utiles.length ? Math.min(...utiles.map(l => sangriaDe(l).length)) : 0;
      const contenido = ls.map(l => l.trim() ? sangria + UNIDAD + l.slice(margen) : "").join("\n");
      const cabecera = antes.split("\n").map((l, i) => i ? sangria + l : l).join("\n");
      const cierre = despues.split("\n").map((l, i) => i && l ? sangria + l : l).join("\n") + (saltoFinal ? "\n" : "");
      return insertar(cabecera + contenido + cierre, cabecera.length, cabecera.length + contenido.length);
    }
    // La expresión de una sentencia (lo que cabe en el hueco de una plantilla de sentencia).
    function expresionEnvolvible() {
      const E = estructura(), v = $codigo.value;
      let a = $codigo.selectionStart, b = $codigo.selectionEnd;
      while (a < b && /\s/.test(v[a])) a++;
      while (b > a && /\s/.test(v[b - 1])) b--;
      if (a === b) return null;
      if (!E) return { a, b, puntoYComa: false };
      const est = E.analizar(v, lexico(v));
      let n = est.nodos.find(x => x.a === a && x.b === b && x.k !== "vacio" && x.k !== "programa");
      if (n && n.k === "sentencia") n = n.h[0];
      if (!n || !n.padre || n.padre.k !== "sentencia" || n.padre.h[0] !== n) return null;
      return { a: n.a, b: n.b, puntoYComa: false };
    }
    function elegirLineasCompletas() {
      const E = estructura(), v = $codigo.value, a = $codigo.selectionStart, b = $codigo.selectionEnd;
      if (!E) return;
      const est = E.analizar(v, lexico(v));
      const u0 = E.unidadLinea(est, E.lineaDe(est, a)), u1 = E.unidadLinea(est, E.lineaDe(est, Math.max(a, b - 1)));
      $codigo.setSelectionRange(Math.min(u0[0], u1[0]), Math.max(u0[1], u1[1]));
    }
    const huecoEn = t => { const m = t.match(RE_HUECO); return m ? { i: m.index, largo: m[0].length } : null; };
    // Inserta una plantilla en una línea nueva con la sangría del sitio. En Python el sitio decide
    // a qué bloque pertenece: en una línea vacía se usa su sangría si es válida; si no, la más profunda.
    function insertarBloque(bloque, envolvente) {
      const elegido = $codigo.selectionStart !== $codigo.selectionEnd;
      if (envolvente && elegido) { elegirLineasCompletas(); if (envolver(envolvente[0], envolvente[1], true)) return; }
      // Con un hueco elegido, «pos = valor» lo rellena con su valor.
      const valor = bloque.match(/^[A-Za-z_]\w*\s*=\s*([^\n]+?)\s*$/);
      if (valor && elegido) {
        const v = $codigo.value.slice($codigo.selectionStart, $codigo.selectionEnd).trim();
        if (HUECO.test(v)) { const h = huecoEn(valor[1]); if (h) insertar(valor[1], h.i, h.i + h.largo); else insertar(valor[1]); return; }
      }
      const h0 = huecoEn(bloque);
      if (h0 && elegido && !bloque.includes("\n")) {
        const x = expresionEnvolvible();
        if (!x) $codigo.setSelectionRange($codigo.selectionEnd, $codigo.selectionEnd);
        else { $codigo.setSelectionRange(x.a, x.b); if (envolver(bloque.slice(0, h0.i), bloque.slice(h0.i + h0.largo))) return; }
      }
      const a = $codigo.selectionStart, v = $codigo.value;
      const ini = v.lastIndexOf("\n", a - 1) + 1;
      const fin = v.indexOf("\n", a) === -1 ? v.length : v.indexOf("\n", a);
      const linea = v.slice(ini, fin);
      let sangria, dondeIni, dondeFin, salto;
      if (!linea.trim()) {
        const resto = v.slice(0, ini) + v.slice(fin + (fin < v.length ? 1 : 0));
        const ns = niveles(resto, ini);
        sangria = linea && ns.includes(linea) ? linea : ns[0] ?? linea;
        dondeIni = ini; dondeFin = fin; salto = "";
      } else {
        // Tras una línea con texto: dentro de su bloque si lo abre; si no, a su altura.
        sangria = abre(linea) ? sangriaDe(linea) + UNIDAD : sangriaDe(linea);
        let f = fin;
        // Si la línea abre una construcción de varias líneas, la plantilla va tras su línea lógica.
        const ls = lineas(v); let li = lineaEn(ls, ini); while (li + 1 < ls.length && !ls[li + 1].inicio) { li++; f = ls[li].b; }
        dondeIni = dondeFin = f; salto = "\n";
      }
      const texto = bloque.split("\n").map((l, i) => (i ? sangria : "") + l).join("\n");
      const h = huecoEn(texto), vacio = texto.search(new RegExp(`\\n${sangria}${UNIDAD}(?=\\n|$)`));
      const pos = h ? h.i : vacio < 0 ? texto.length : vacio + 1 + sangria.length + UNIDAD.length;
      const largo = h ? h.largo : 0, extra = salto.length + sangria.length;
      $codigo.setSelectionRange(dondeIni, dondeFin);
      insertar(salto + sangria + texto, extra + pos, extra + pos + largo);
    }
    // Operadores: el operando elegido (o la expresión que acaba en el cursor) va primero y queda
    // elegido el hueco del segundo. «not» lo niega; «is None» se añade detrás.
    const EXPRESIONES = new Set(["id", "num", "str", "lit", "hueco", "binaria", "unaria", "llamada", "miembro", "ternaria", "grupo", "lista", "objeto", "expr"]);
    const PREC = { or: 1, and: 2, "==": 4, "!=": 4, "<": 4, ">": 4, "<=": 4, ">=": 4, is: 4, in: 4, "+": 6, "-": 6, "*": 7, "/": 7, "//": 7, "%": 7, "**": 9 };
    function operandoOperador(asignar) {
      const E = estructura(), v = $codigo.value;
      let a = $codigo.selectionStart, b = $codigo.selectionEnd;
      if (!E) return a === b ? null : { a, b, n: null };
      const est = E.analizar(v, lexico(v)), util = x => x.k !== "vacio" && x.k !== "programa";
      let n;
      if (a !== b) {
        while (a < b && /\s/.test(v[a])) a++;
        while (b > a && /\s/.test(v[b - 1])) b--;
        n = est.nodos.filter(x => util(x) && x.a <= a && x.b >= b).sort((x, y) => (x.b - x.a) - (y.b - y.a))[0];
      } else {
        while (a > 0 && /[ \t]/.test(v[a - 1])) a--;
        n = est.nodos.filter(x => x.b === a && (EXPRESIONES.has(x.k) || x.k === "sentencia" || x.k === "decl" || x.k === "salto")).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
      }
      if (n && n.k === "id" && n.padre && n.padre.k === "decl" && n.padre.h[0] === n) n = n.padre;
      if (n && (n.k === "sentencia" || n.k === "salto")) n = n.h[0];
      else if (n && n.k === "decl") n = !asignar && n.h.length === 2 ? n.h[1] : null;
      while (n && n.padre && n.padre.h[0] === n && (n.padre.k === "llamada" || n.padre.k === "miembro" || n.padre.k === "metodo")) n = n.padre.k === "metodo" ? n.padre.padre : n.padre;
      return n && EXPRESIONES.has(n.k) ? { a: n.a, b: n.b, n } : null;
    }
    const conParentesis = (texto, n, op) => {
      if (!n || op === "=") return texto;
      const baja = n.k === "ternaria" || (n.k === "unaria" && n.op === "not" && PREC[op] > 3) || (n.k === "binaria" && PREC[n.op] != null && PREC[op] != null && PREC[n.op] < PREC[op]);
      return baja ? `(${texto})` : texto;
    };
    function insertarOperador(a) {
      const hueco = aHueco(a.hueco || "valor"), op = operandoOperador(a.operador === "=");
      if (a.sufijo) {
        if (!op) return insertar(hueco + a.sufijo, 0, hueco.length);
        $codigo.setSelectionRange(op.a, op.b);
        const t = conParentesis($codigo.value.slice(op.a, op.b), op.n, "is") + a.sufijo;
        return insertar(t, t.length, t.length);
      }
      if (!op && $codigo.selectionStart !== $codigo.selectionEnd)
        return avisoEditor(`Elige un valor para usar <code>${esc(a.operador.trim())}</code>: una variable, una llamada o una expresión.`);
      if (!op) {
        const texto = a.prefijo ? a.operador + hueco : `${hueco} ${a.operador} ${hueco}`;
        return insertar(texto, a.prefijo ? a.operador.length : 0, (a.prefijo ? a.operador.length : 0) + hueco.length);
      }
      $codigo.setSelectionRange(op.a, op.b);
      const elegido = $codigo.value.slice(op.a, op.b);
      if (a.prefijo) {
        const negado = a.operador + (op.n && ["binaria", "ternaria"].includes(op.n.k) ? `(${elegido})` : elegido);
        return insertar(negado, 0, negado.length);
      }
      const texto = `${conParentesis(elegido, op.n, a.operador)} ${a.operador} ${hueco}`;
      if (HUECO.test(elegido)) return insertar(texto, 0, elegido.length);
      insertar(texto, texto.length - hueco.length, texto.length);
    }
    return { rangoCodigo, envolver, expresionEnvolvible, elegirLineasCompletas, insertarBloque, insertarOperador };
  }

  window.CMGEditorPython = {
    UNIDAD, HUECO, RE_HUECO, lexico, clasificar, KW, aHueco, nombreDe,
    lineas, abre, alPartirLinea, niveles, rellenar, crearComentario, plantillas, TECLAS, EDICION, crearEdicion,
  };
})();
