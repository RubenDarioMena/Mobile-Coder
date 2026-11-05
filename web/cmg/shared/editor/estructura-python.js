/* Estructura de un programa Python para editar por bloques (E4).
 * Parte del árbol de lezer (shared/vendor/lezer-python-1.1.19.js) y lo traduce a los mismos tipos de
 * nodo que shared/js/estructura.js construye para JS (sentencia, decl, si, mientras, para, funcion,
 * salto, bloque, cuerpo, llamada, metodo, miembro, binaria, unaria, lista, grupo, id, num, str, lit,
 * hueco, vacio…). Así la edición sin teclado, las asas, el arrastre y las sugerencias funcionan igual.
 * Diferencias con JS:
 *  - el cuerpo de un bloque va de «:» a su última sentencia (no hay llaves);
 *  - elif y else son «rama» (no son líneas que se puedan mover solas: van con su if);
 *  - «x = valor» con un nombre es «decl»;
 *  - los huecos son identificadores __nombre__ (D4).
 * No usa el DOM ni ejecuta nada. */
(() => {
  "use strict";
  const PY = () => window.CMGEditorPython;
  const OPERADORES = ["**=", "//=", ">>=", "<<=", "->", ":=", "==", "!=", "<=", ">=", "**", "//", "<<", ">>", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "@="];
  const COMPLETOS = new Set(OPERADORES);
  const PREFIJOS = new Set(OPERADORES.flatMap(o => [...o].map((_, i) => o.slice(0, i + 1))));
  const CLAVES = new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
  const HOJA = { VariableName: "id", PropertyName: "id", Number: "num", String: "str", FormatString: "str", Boolean: "lit", None: "lit", Ellipsis: "lit" };
  const OPS = new Set(["ArithOp", "CompareOp", "AssignOp", "UpdateOp", "LogicOp", "BitOp"]);

  function analizar(src, lex = PY().lexico(src)) {
    const P = PY();
    const todas = [];
    let off = 0;
    for (const [k, v] of lex) { todas.push({ k, v, a: off, b: off + v.length }); off += v.length; }
    // Fichas significativas: sin espacios ni comentarios; los huecos __x__ son fichas «hueco».
    const sig = [];
    let nl = true;
    for (let i = 0; i < todas.length; i++) {
      const f = todas[i];
      if (f.k === "nl") { nl = true; continue; }
      if (f.k === "esp" || f.k === "com") continue;
      if (f.k === "p") {
        let v = f.v, j = i;
        while (j + 1 < todas.length && todas[j + 1].k === "p" && PREFIJOS.has(v + todas[j + 1].v)) { j++; v += todas[j].v; }
        while (v.length > 1 && !COMPLETOS.has(v)) { v = v.slice(0, -1); j--; }
        sig.push({ k: "p", v, a: f.a, b: todas[j].b, nl }); nl = false; i = j;
        continue;
      }
      sig.push({ k: f.k === "id" && P.HUECO.test(f.v) ? "hueco" : f.k, v: f.v, a: f.a, b: f.b, nl }); nl = false;
      if (f.k === "str" && f.v.includes("\n")) nl = false;
    }
    const par = new Array(sig.length).fill(-1), pila = [];
    sig.forEach((f, i) => {
      if (f.k !== "p") return;
      if (f.v === "(" || f.v === "[" || f.v === "{") pila.push(i);
      else if (f.v === ")" || f.v === "]" || f.v === "}") {
        const abre = "([{"[")]}".indexOf(f.v)];
        for (let s = pila.length - 1; s >= 0; s--) if (sig[pila[s]].v === abre) { par[pila[s]] = i; par[i] = pila[s]; pila.length = s; break; }
      }
    });
    // Índices de fichas que caen en [desde, hasta).
    const desdeFicha = pos => { let lo = 0, hi = sig.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sig[m].a < pos) lo = m + 1; else hi = m; } return lo; };
    const hastaFicha = pos => { let lo = 0, hi = sig.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sig[m].b <= pos) lo = m + 1; else hi = m; } return lo - 1; };
    const rango = n => { const ia = desdeFicha(n.from), ib = hastaFicha(n.to); return ia <= ib ? [ia, ib] : null; };

    const nodos = [], duenos = new Map(), hojas = new Map();
    const nodo = (k, ia, ib, h = [], extra) => {
      const n = { k, a: sig[ia].a, b: sig[ib].b, ia, ib, h: h.filter(Boolean), padre: null, ...extra };
      for (const c of n.h) c.padre = n;
      nodos.push(n);
      if (ia === ib && (k === "id" || k === "num" || k === "str" || k === "lit" || k === "hueco")) hojas.set(ia, n);
      return n;
    };
    const vacio = (i, j) => { const n = { k: "vacio", a: sig[i].b, b: sig[j].a, ia: i, ib: j, h: [], padre: null, sel: false }; nodos.push(n); return n; };
    const hijos = n => { const out = []; for (let c = n.firstChild; c; c = c.nextSibling) out.push(c); return out; };
    const esFicha = c => OPS.has(c.name) || (!c.firstChild && !HOJA[c.name] && c.name !== "Comment" && !c.type.isError);
    // Palabras clave, operadores y delimitadores hijos directos pertenecen a la construcción.
    const propias = (n, lista) => {
      for (const c of lista) if (esFicha(c)) { const r = rango(c); if (r) for (let i = r[0]; i <= r[1]; i++) if (!duenos.has(i)) duenos.set(i, n); }
      return n;
    };
    const texto = c => src.slice(c.from, c.to);

    function sentencias(lista) { return lista.map(sentencia).filter(Boolean); }
    function sentencia(c) {
      const r = rango(c);
      if (!r || c.name === "Comment") return null;
      const hs = hijos(c);
      switch (c.name) {
        case "ExpressionStatement": return nodo("sentencia", ...r, [expr(hs[0])]);
        case "AssignStatement": {
          const util = hs.filter(x => x.name !== "Comment");
          if (util.length === 3 && util[0].name === "VariableName" && texto(util[1]) === "=") return propias(nodo("decl", ...r, [expr(util[0]), expr(util[2])]), util);
          const partes = util.filter(x => !esFicha(x)).map(expr), ops = util.filter(esFicha);
          const op = ops.length ? texto(ops[ops.length - 1]) : "=";
          const as = propias(nodo("asignacion", ...r, partes, { op }), util);
          return nodo("sentencia", ...r, [as]);
        }
        case "UpdateStatement": {
          const util = hs.filter(x => x.name !== "Comment");
          const op = util.find(x => x.name === "UpdateOp");
          const as = propias(nodo("asignacion", ...r, util.filter(x => !esFicha(x)).map(expr), { op: op ? texto(op) : "+=" }), util);
          return nodo("sentencia", ...r, [as]);
        }
        case "IfStatement": return condicional(c, hs, r, "si");
        case "WhileStatement": return condicional(c, hs, r, "mientras");
        case "ForStatement": {
          const cuerpo = hs.find(x => x.name === "Body");
          const cab = hs.slice(0, hs.indexOf(cuerpo)).filter(x => !esFicha(x)).map(expr);
          const n = nodo("para", ...r, [...cab, bloque(cuerpo)]);
          propias(n, hs.filter(x => x !== cuerpo)); propiasBloque(n, cuerpo);
          return n;
        }
        case "FunctionDefinition": {
          const cuerpo = hs.find(x => x.name === "Body"), params = hs.find(x => x.name === "ParamList");
          const nombre = hs.find(x => x.name === "VariableName");
          const ps = params ? hijos(params).filter(x => !esFicha(x)).map(expr) : [];
          const n = nodo("funcion", ...r, [nombre && expr(nombre), ...ps, bloque(cuerpo)], { asincrona: hs.some(x => x.name === "async") });
          propias(n, hs.filter(x => x !== cuerpo)); if (params) propias(n, hijos(params)); propiasBloque(n, cuerpo);
          return n;
        }
        case "ReturnStatement": case "BreakStatement": case "ContinueStatement": case "PassStatement": case "RaiseStatement":
          return propias(nodo("salto", ...r, hs.filter(x => !esFicha(x)).map(expr)), hs);
        default:
          if (c.type.isError) return nodo("error", ...r, hs.map(x => x.name.endsWith("Statement") ? sentencia(x) : expr(x)));
          return propias(nodo("sentencia", ...r, hs.filter(x => !esFicha(x)).map(x => x.name.endsWith("Statement") || x.name === "Body" ? (x.name === "Body" ? bloque(x) : sentencia(x)) : expr(x))), hs);
      }
    }
    // if / elif / else y while / else: la condición y el cuerpo; cada elif o else es una rama.
    function condicional(c, hs, r, k) {
      const grupos = [];
      for (const x of hs) {
        if (x.name === "if" || x.name === "elif" || x.name === "else" || x.name === "while") grupos.push({ palabra: x, partes: [] });
        else if (grupos.length) grupos[grupos.length - 1].partes.push(x);
      }
      const armar = g => {
        const cuerpo = g.partes.find(x => x.name === "Body"), cond = g.partes.find(x => x !== cuerpo && !esFicha(x) && x.name !== "Comment");
        return { cond: cond ? expr(cond) : null, cuerpo, bloque: cuerpo ? bloque(cuerpo) : null, g };
      };
      const [primero, ...resto] = grupos.map(armar);
      const ramas = resto.map(x => {
        const ia = rango(x.g.palabra)[0], fin = x.cuerpo ? rango(x.cuerpo) : null;
        const n = nodo("rama", ia, fin ? fin[1] : ia, [x.cond, x.bloque], { cond: x.cond, palabra: x.g.palabra.name });
        propias(n, [x.g.palabra]); if (x.cuerpo) propiasBloque(n, x.cuerpo);
        return n;
      });
      const n = nodo(k, ...r, [primero && primero.cond, primero && primero.bloque, ...ramas], { cond: primero ? primero.cond : null });
      if (primero) { propias(n, [primero.g.palabra]); if (primero.cuerpo) propiasBloque(n, primero.cuerpo); }
      return n;
    }
    // El «:» del cuerpo es de la sentencia que lo abre.
    function propiasBloque(n, cuerpo) { if (cuerpo) propias(n, hijos(cuerpo).filter(x => x.name === ":")); }
    function bloque(c) {
      if (!c) return null;
      const r = rango(c);
      if (!r) return null;
      const dentro = sentencias(hijos(c).filter(x => x.name !== ":"));
      const ib = dentro.length ? dentro[dentro.length - 1].ib : r[0];
      const h = dentro.length > 1 ? [nodo("cuerpo", dentro[0].ia, dentro[dentro.length - 1].ib, dentro)] : dentro;
      return nodo("bloque", r[0], ib, h, { sel: false });
    }
    // Argumentos (o elementos): lo que hay entre comas; un hueco sin valor queda como «vacio».
    function argumentos(lista, sinVacios = false) {
      const ab = lista.find(x => x.name === "(" || x.name === "["), ci = [...lista].reverse().find(x => x.name === ")" || x.name === "]");
      const args = [], extra = [];
      let previo = ab ? rango(ab)[0] : -1, hay = false, actual = [];
      const cerrarArg = () => {
        if (!actual.length) return;
        const conv = actual.filter(x => !esFicha(x) && x.name !== "Comment");
        let n;
        const asig = actual.find(x => x.name === "AssignOp");
        if (asig && conv.length === 2) { const r0 = rango(actual[0]), r1 = rango(actual[actual.length - 1]); n = r0 && r1 ? nodo("nombrado", r0[0], r1[1], conv.map(expr), { op: "=" }) : null; if (n) propias(n, actual); }
        else n = conv.length === 1 ? expr(conv[0]) : conv.length ? (() => { const r0 = rango(actual[0]), r1 = rango(actual[actual.length - 1]); return r0 && r1 ? propias(nodo("expr", r0[0], r1[1], conv.map(expr)), actual) : null; })() : null;
        if (n) { if (hay) extra.push(n); else args.push(n); hay = true; }
        actual = [];
      };
      for (const x of lista) {
        if (x === ab || x === ci) continue;
        if (x.name === ",") {
          cerrarArg();
          const i = rango(x)[0];
          if (!hay && !sinVacios && previo >= 0) args.push(vacio(previo, i));
          previo = i; hay = false;
          continue;
        }
        actual.push(x);
      }
      cerrarArg();
      if (!hay && !sinVacios && previo >= 0 && ci && rango(ci)) args.push(vacio(previo, rango(ci)[0]));
      return { args, extra };
    }
    function expr(c) {
      if (!c) return null;
      const r = rango(c);
      if (!r) return null;
      if (HOJA[c.name]) {
        const k = HOJA[c.name];
        if (k === "id" && r[0] === r[1] && sig[r[0]].k === "hueco") return nodo("hueco", ...r);
        return nodo(k, ...r, [], c.name === "PropertyName" ? { prop: true } : undefined);
      }
      const hs = hijos(c).filter(x => x.name !== "Comment");
      switch (c.name) {
        case "CallExpression": {
          const callee = hs[0], al = hs.find(x => x.name === "ArgList");
          const ar = argumentos(al ? hijos(al) : []);
          if (callee.name === "MemberExpression") {
            const mh = hijos(callee), punto = mh.find(x => x.name === "."), prop = mh.find(x => x.name === "PropertyName");
            if (punto && prop) {
              const obj = expr(mh[0]), nom = expr(prop), fin = r[1];
              const met = nodo("metodo", nom.ia, fin, [nom, ...ar.args, ...ar.extra]);
              const n = nodo("llamada", ...r, [obj, met], { nombre: nom, args: ar.args });
              met.llamada = n;
              propias(n, [punto]); if (al) propias(n, hijos(al));
              return n;
            }
          }
          const e = expr(callee);
          const nombre = e && e.k === "id" ? e : e && e.k === "miembro" && e.h[1] ? e.h[1] : null;
          const n = nodo("llamada", ...r, [e, ...ar.args, ...ar.extra], { nombre, args: ar.args });
          if (al) propias(n, hijos(al));
          return n;
        }
        case "MemberExpression": return propias(nodo("miembro", ...r, hs.filter(x => !esFicha(x)).map(expr)), hs);
        case "BinaryExpression": {
          const partes = hs.filter(x => !esFicha(x));
          const ops = hs.filter(esFicha);
          const op = ops.map(texto).join(" ").replace(/\s+/g, " ");
          return propias(nodo("binaria", ...r, partes.map(expr), { op }), hs);
        }
        case "UnaryExpression": case "AwaitExpression": {
          const ops = hs.filter(esFicha);
          return propias(nodo("unaria", ...r, hs.filter(x => !esFicha(x)).map(expr), { op: ops.map(texto).join(" ") || (c.name === "AwaitExpression" ? "await" : "") }), hs);
        }
        case "ParenthesizedExpression": return propias(nodo("grupo", ...r, hs.filter(x => !esFicha(x)).map(expr)), hs);
        case "ArrayExpression": case "TupleExpression": {
          const ar = argumentos(hs, c.name === "TupleExpression");
          return propias(nodo("lista", ...r, [...ar.args, ...ar.extra], { args: ar.args }), hs);
        }
        case "DictionaryExpression": case "SetExpression": return propias(nodo("objeto", ...r, hs.filter(x => !esFicha(x)).map(expr)), hs);
        case "ConditionalExpression": return propias(nodo("ternaria", ...r, hs.filter(x => !esFicha(x)).map(expr)), hs);
        case "LambdaExpression": return propias(nodo("flecha", ...r, hs.filter(x => !esFicha(x)).map(expr)), hs);
        default:
          if (c.type.isError) return nodo("error", ...r, hs.filter(x => !esFicha(x)).map(expr));
          return propias(nodo("expr", ...r, hs.filter(x => !esFicha(x)).map(expr)), hs);
      }
    }

    const arbol = window.LezerPython.parser.parse(src);
    const tope = sig.length ? sentencias(hijos(arbol.topNode)) : [];
    const raiz = { k: "programa", a: 0, b: src.length, ia: 0, ib: sig.length - 1, h: tope, padre: null };
    for (const n of tope) n.padre = raiz;
    nodos.push(raiz);
    const lineas = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineas.push(i + 1);
    return { src, todas, sig, par, nodos, raiz, duenos, hojas, lineas, arbol };
  }

  // Las consultas comunes (atomo, ampliar, unidadLinea, fronteraValida, contexto, destino, enLista…)
  // son las de JS con las palabras de Python.
  const C = () => window.ESTRUCTURA.consultas({
    claves: CLAVES, logicos: new Set(["and", "or"]), compara: new Set(["==", "!=", "<", ">", "<=", ">=", "is", "is not", "in", "not in"]),
    huecoNombre: t => PY().nombreDe(t),
  });
  let consultas = null;
  const q = () => consultas || (consultas = C());

  // Desenvolver: quita el if/while/for más cercano y deja su cuerpo un nivel menos sangrado.
  // Un elif o else con código no se descarta; un cuerpo que era solo «pass» desaparece con él.
  const ENVOLTURAS = new Set(["si", "mientras", "para"]);
  const soloPlantilla = t => !t.replace(/\b(?:pass|elif|else)\b|__[a-z][a-z0-9_]*__|#[^\n]*|[\s:]/g, "");
  function desenvolver(est, a, b) {
    const src = est.src, P = PY();
    let n = null;
    for (const x of est.nodos) if (ENVOLTURAS.has(x.k) && x.a <= a && x.b >= b && (!n || x.b - x.a < n.b - n.a)) n = x;
    if (!n) return { motivo: "Elige algo dentro de un if, while o for." };
    const cuerpo = n.h.find(c => c.k === "bloque"), ramas = n.h.filter(c => c.k === "rama");
    if (ramas.some(r => !soloPlantilla(src.slice(r.a, r.b).replace(/^(elif|else)\b[^:]*/, "")))) return { motivo: "El elif o else tiene código: bórralo o muévelo antes de desenvolver." };
    const li = src.lastIndexOf("\n", n.a - 1) + 1;
    const lf = src.indexOf("\n", n.b) < 0 ? src.length : src.indexOf("\n", n.b);
    const sangria = src.slice(li, n.a).match(/^[ \t]*/)[0];
    const solaIni = !src.slice(li, n.a).trim(), desde = solaIni ? li : n.a, hasta = Math.min(src.length, lf + 1);
    // El cuerpo: de después de «:» hasta su última sentencia.
    const dos = cuerpo ? src.slice(est.sig[cuerpo.ia].b, cuerpo.b) : "";
    const lineas = dos.split("\n");
    if (lineas.length && !lineas[0].trim()) lineas.shift();
    else if (lineas.length) lineas[0] = sangria + P.UNIDAD + lineas[0].trim();   // if x: a()
    while (lineas.length && !lineas[lineas.length - 1].trim()) lineas.pop();
    const utiles = lineas.filter(l => l.trim() && !/^\s*pass\s*$/.test(l));
    const margen = utiles.length ? Math.min(...utiles.map(l => l.match(/^[ \t]*/)[0].length)) : 0;
    const cuerpoTxt = lineas.length === 1 && /^\s*pass\s*$/.test(lineas[0]) ? "" : lineas.map(l => !l.trim() ? "" : sangria + l.slice(margen)).join("\n");
    let texto = cuerpoTxt + (cuerpoTxt && hasta > lf ? "\n" : "");
    if (!solaIni) texto = texto.trimStart();
    if (!texto) { const r = P.rellenar(src.slice(0, desde) + src.slice(hasta), desde); if (r.crece) texto = r.texto.slice(desde, desde + r.crece); }
    const selA = desde + (cuerpoTxt && solaIni ? sangria.length : 0);
    return { a: desde, b: hasta, texto, sel: [selA, desde + texto.replace(/\n$/, "").length] };
  }

  const comunes = {
    atomo: (...x) => q().atomo(...x), ampliar: (...x) => q().ampliar(...x), unidadLinea: (...x) => q().unidadLinea(...x),
    fronteraValida: (...x) => q().fronteraValida(...x), contexto: (...x) => q().contexto(...x), destino: (...x) => q().destino(...x),
    enLista: (...x) => q().enLista(...x),
    lineaDe: (...x) => window.ESTRUCTURA.lineaDe(...x), inicioLinea: (...x) => window.ESTRUCTURA.inicioLinea(...x),
    finLinea: (...x) => window.ESTRUCTURA.finLinea(...x), fichaEn: (...x) => window.ESTRUCTURA.fichaEn(...x),
  };
  window.ESTRUCTURA_PYTHON = { analizar, desenvolver, ...comunes };
})();
