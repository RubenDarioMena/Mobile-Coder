/* Code Battle Lite · estructura del programa para editar por bloques.
 * No usa el DOM: recibe el texto y las fichas de lexico() y devuelve un árbol tolerante a errores.
 * Los huecos de una línea, los argumentos vacíos y el código a medio escribir no lo rompen.
 * El modo sin teclado lo usa para elegir átomos, ampliar la selección hasta el siguiente límite
 * semántico, agarrar líneas completas y reconocer argumentos y condiciones. */
(() => {
  "use strict";
  const OPERADORES = ["===", "!==", "**=", "...", ">>>", "<<=", ">>=", "&&=", "||=", "??=", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "=>",
    "++", "--", "+=", "-=", "*=", "/=", "%=", "**", "<<", ">>", "&=", "|=", "^="];
  const COMPLETOS = new Set(OPERADORES);
  const PREFIJOS = new Set(OPERADORES.flatMap(o => [...o].map((_, i) => o.slice(0, i + 1))));
  const PREC = { "??": 1, "||": 2, "&&": 3, "|": 4, "^": 5, "&": 6, "==": 7, "!=": 7, "===": 7, "!==": 7, "<": 8, ">": 8, "<=": 8, ">=": 8,
    in: 8, of: 8, instanceof: 8, "<<": 9, ">>": 9, ">>>": 9, "+": 10, "-": 10, "*": 11, "/": 11, "%": 11, "**": 12 };
  const ASIGNA = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", "&=", "|=", "^=", "&&=", "||=", "??="]);
  const UNARIOS = new Set(["!", "-", "+", "~", "++", "--", "...", "typeof", "void", "delete", "await", "new"]);
  const LITERALES = new Set(["true", "false", "null", "undefined", "this", "NaN", "Infinity"]);
  const SENTENCIAS = new Set(["if", "else", "while", "do", "for", "const", "let", "var", "return", "break", "continue", "throw",
    "switch", "case", "default", "try", "catch", "finally", "class", "function"]);
  const CLAVES = new Set([...SENTENCIAS, ...UNARIOS, "in", "of", "instanceof"]);
  const LOGICOS = new Set(["&&", "||", "??"]);
  const COMPARA = new Set(["==", "!=", "===", "!==", "<", ">", "<=", ">="]);
  // Sentencias que ocupan líneas: se agarran por el número de línea y se mueven enteras.
  const DE_LINEA = new Set(["sentencia", "decl", "si", "sino", "mientras", "hacer", "para", "salto", "bloque", "funcion", "error"]);
  // Solo dentro de estos se puede soltar una línea sin partir otra construcción.
  const CONTENEDORES = new Set(["programa", "bloque", "cuerpo"]);
  const HOJAS = new Set(["id", "num", "str", "lit", "hueco"]);

  function analizar(src, lex) {
    // Fichas con posición. Las significativas omiten espacios y comentarios, salvo los comentarios
    // de una línea /* … */, que hacen de valor (los huecos de las plantillas).
    const todas = [];
    let off = 0;
    for (const [k, v] of lex) { todas.push({ k, v, a: off, b: off + v.length }); off += v.length; }
    const sig = [];
    let nl = true;
    for (let i = 0; i < todas.length; i++) {
      const f = todas[i];
      if (f.k === "nl") { nl = true; continue; }
      if (f.k === "esp") continue;
      if (f.k === "com") {
        if (f.v.startsWith("/*") && f.v.endsWith("*/") && f.v.length >= 4 && !f.v.includes("\n")) { sig.push({ k: "hueco", v: f.v, a: f.a, b: f.b, nl }); nl = false; }
        else if (f.v.includes("\n")) nl = true;
        continue;
      }
      if (f.k === "p") {
        // El léxico entrega los signos de uno en uno: se juntan en el operador más largo.
        let v = f.v, j = i;
        while (j + 1 < todas.length && todas[j + 1].k === "p" && PREFIJOS.has(v + todas[j + 1].v)) { j++; v += todas[j].v; }
        while (v.length > 1 && !COMPLETOS.has(v)) { v = v.slice(0, -1); j--; }
        sig.push({ k: "p", v, a: f.a, b: todas[j].b, nl }); nl = false; i = j;
        continue;
      }
      sig.push({ k: f.k, v: f.v, a: f.a, b: f.b, nl }); nl = false;
    }
    // Pares de delimitadores; un cierre sin apertura se ignora.
    const par = new Array(sig.length).fill(-1), pila = [];
    sig.forEach((f, i) => {
      if (f.k !== "p") return;
      if (f.v === "(" || f.v === "[" || f.v === "{") pila.push(i);
      else if (f.v === ")" || f.v === "]" || f.v === "}") {
        const abre = "([{"[")]}".indexOf(f.v)];
        for (let s = pila.length - 1; s >= 0; s--) if (sig[pila[s]].v === abre) { par[pila[s]] = i; par[i] = pila[s]; pila.length = s; break; }
      }
    });

    const nodos = [], duenos = new Map(), hojas = new Map();
    let p = 0;
    const nodo = (k, ia, ib, h = [], extra) => {
      const n = { k, a: sig[ia].a, b: sig[ib].b, ia, ib, h: h.filter(Boolean), padre: null, ...extra };
      for (const c of n.h) c.padre = n;
      nodos.push(n);
      if (ia === ib && HOJAS.has(k)) hojas.set(ia, n);
      return n;
    };
    // Las palabras clave, operadores y delimitadores pertenecen a la construcción que forman.
    const propias = (n, ...idx) => { for (const i of idx) if (i >= 0 && !duenos.has(i)) duenos.set(i, n); return n; };
    const es = (v, lim) => p < lim && sig[p].k === "p" && sig[p].v === v;
    const esPal = (v, lim) => p < lim && sig[p].k === "id" && sig[p].v === v;
    const cierre = (i, lim) => par[i] > i && par[i] < lim ? par[i] : -1;
    const finDeLinea = (i, lim) => { let j = i + 1; while (j < lim && !sig[j].nl) j++; return j; };
    const error = () => { const n = propias(nodo("error", p, p), p); p++; return n; };
    const vacio = (i, j) => { const n = { k: "vacio", a: sig[i].b, b: sig[j].a, ia: i, ib: j, h: [], padre: null, sel: false }; nodos.push(n); return n; };

    function sentencias(lim) {
      const out = [];
      while (p < lim) {
        const i = p, s = sentencia(lim);
        if (s) out.push(s);
        if (p === i) out.push(error());
      }
      return out;
    }
    function sentencia(lim) {
      const f = sig[p];
      if (f.k === "p") {
        if (f.v === ";") { p++; return null; }
        if (f.v === "{") return bloque(lim, true);
        if (f.v === "}" || f.v === ")" || f.v === "]") return null;
      }
      if (f.k === "id") switch (f.v) {
        case "if": return si(lim);
        case "while": return mientras(lim);
        case "do": return hacer(lim);
        case "for": return para(lim);
        case "const": case "let": case "var": return declaracion(lim, true);
        case "return": case "throw": case "break": case "continue": return salto(lim);
        case "function": return funcion(lim);
        case "else": return null;
      }
      const i0 = p, e = expresion(lim, true);
      if (!e) return null;
      const i1 = es(";", lim) ? p++ : p - 1;
      return propias(nodo("sentencia", i0, i1, [e]), sig[i1].k === "p" && sig[i1].v === ";" ? i1 : -1);
    }
    function bloque(lim, suelto) {
      const i0 = p, j = cierre(p, lim);
      p++;
      const dentro = sentencias(j >= 0 ? j : lim);
      let i1 = Math.max(i0, p - 1);
      if (j >= 0) { p = j + 1; i1 = j; }
      const h = dentro.length > 1 ? [nodo("cuerpo", dentro[0].ia, dentro[dentro.length - 1].ib, dentro)] : dentro;
      return propias(nodo("bloque", i0, i1, h, { sel: suelto }), i0, j);
    }
    // El cuerpo de if/while/for no se elige como { … }: un toque en sus llaves elige la sentencia entera.
    function cuerpoDe(lim) {
      const s = p < lim ? sentencia(lim) : null;
      if (s && s.k === "bloque") s.sel = false;
      return s;
    }
    function cabecera(lim) {
      if (!es("(", lim)) return { e: null, ia: -1, ic: -1, resto: [] };
      const ia = p, ic = cierre(p, lim), fin = ic >= 0 ? ic : finDeLinea(p, lim);
      p++;
      const e = expresion(fin, true), resto = restos(fin);
      if (ic >= 0) p = ic + 1;
      return { e, ia, ic, resto };
    }
    // Lo que sobra dentro de un paréntesis se conserva como nodos sueltos.
    function restos(fin) {
      const out = [];
      while (p < fin) {
        const i = p, x = asignacion(fin);
        if (x) out.push(x);
        if (p === i) out.push(error());
      }
      return out;
    }
    function si(lim) {
      const i0 = p; p++;
      const c = cabecera(lim), cons = cuerpoDe(lim);
      let alt = null;
      if (esPal("else", lim)) {
        const ie = p; p++;
        const s = cuerpoDe(lim);
        alt = propias(nodo("sino", ie, s ? s.ib : ie, [s]), ie);
      }
      const ult = alt || cons;
      return propias(nodo("si", i0, ult ? ult.ib : c.ic >= 0 ? c.ic : i0, [c.e, ...c.resto, cons, alt], { cond: c.e }), i0, c.ia, c.ic);
    }
    function mientras(lim) {
      const i0 = p; p++;
      const c = cabecera(lim), cuerpo = cuerpoDe(lim);
      return propias(nodo("mientras", i0, cuerpo ? cuerpo.ib : c.ic >= 0 ? c.ic : i0, [c.e, ...c.resto, cuerpo], { cond: c.e }), i0, c.ia, c.ic);
    }
    function hacer(lim) {
      const i0 = p; p++;
      const cuerpo = cuerpoDe(lim);
      let iw = -1, ipc = -1, c = { e: null, ia: -1, ic: -1, resto: [] };
      if (esPal("while", lim)) { iw = p; p++; c = cabecera(lim); if (es(";", lim)) ipc = p++; }
      const i1 = ipc >= 0 ? ipc : c.ic >= 0 ? c.ic : iw >= 0 ? iw : cuerpo ? cuerpo.ib : i0;
      return propias(nodo("hacer", i0, i1, [cuerpo, c.e, ...c.resto], { cond: c.e }), i0, iw, c.ia, c.ic, ipc);
    }
    function para(lim) {
      const i0 = p; p++;
      const h = [], marcas = [];
      let ia = -1, ic = -1;
      if (es("(", lim)) {
        ia = p; ic = cierre(p, lim);
        const fin = ic >= 0 ? ic : finDeLinea(p, lim);
        p++;
        while (p < fin) {
          if (es(";", fin)) { marcas.push(p); p++; continue; }
          const i = p, x = esPal("const", fin) || esPal("let", fin) || esPal("var", fin) ? declaracion(fin, false) : expresion(fin, true);
          if (x) h.push(x);
          if (p === i) h.push(error());
        }
        if (ic >= 0) p = ic + 1;
      }
      const cuerpo = cuerpoDe(lim);
      return propias(nodo("para", i0, cuerpo ? cuerpo.ib : ic >= 0 ? ic : i0, [...h, cuerpo]), i0, ia, ic, ...marcas);
    }
    function declaracion(lim, conFin) {
      const i0 = p; p++;
      const h = [], marcas = [];
      while (p < lim) {
        const patron = primaria(lim);
        if (!patron) break;
        h.push(patron);
        if (es("=", lim) || esPal("of", lim) || esPal("in", lim)) { marcas.push(p); p++; const v = asignacion(lim); if (v) h.push(v); }
        if (es(",", lim)) { marcas.push(p); p++; continue; }
        break;
      }
      let i1 = h.length ? h[h.length - 1].ib : i0;
      if (marcas.length && marcas[marcas.length - 1] > i1) i1 = marcas[marcas.length - 1];
      if (conFin && es(";", lim)) { marcas.push(p); i1 = p; p++; }
      return propias(nodo("decl", i0, i1, h), i0, ...marcas);
    }
    function salto(lim) {
      const i0 = p, palabra = sig[p].v; p++;
      let e = null, ipc = -1;
      if ((palabra === "return" || palabra === "throw") && p < lim && !sig[p].nl && !es(";", lim) && !es("}", lim)) e = expresion(lim, true);
      let i1 = e ? e.ib : i0;
      if (es(";", lim)) { ipc = p; i1 = p; p++; }
      return propias(nodo("salto", i0, i1, [e]), i0, ipc);
    }
    function funcion(lim) {
      const i0 = p; p++;
      if (es("*", lim)) p++;
      let nombre = null;
      if (p < lim && sig[p].k === "id" && !SENTENCIAS.has(sig[p].v)) { nombre = nodo("id", p, p); p++; }
      const ar = es("(", lim) ? argumentos(lim, true) : { args: [], extra: [], ia: -1, ic: -1, comas: [] };
      const cuerpo = es("{", lim) ? bloque(lim, false) : null;
      return propias(nodo("funcion", i0, cuerpo ? cuerpo.ib : ar.ic >= 0 ? ar.ic : i0, [nombre, ...ar.args, ...ar.extra, cuerpo]), i0, ar.ia, ar.ic, ...ar.comas);
    }

    function expresion(lim, coma) {
      const e = asignacion(lim);
      if (!e || !coma || !es(",", lim)) return e;
      const h = [e], comas = [];
      while (es(",", lim)) { comas.push(p); p++; const x = asignacion(lim); if (!x) break; h.push(x); }
      return propias(nodo("secuencia", e.ia, Math.max(h[h.length - 1].ib, comas[comas.length - 1]), h), ...comas);
    }
    function asignacion(lim) {
      if (p >= lim) return null;
      const ic = cierre(p, lim);
      if ((sig[p].k === "id" && !CLAVES.has(sig[p].v) && p + 1 < lim && sig[p + 1].v === "=>") || (es("(", lim) && ic >= 0 && ic + 1 < lim && sig[ic + 1].v === "=>")) return flecha(lim);
      const izq = condicional(lim);
      if (!izq) return null;
      if (p < lim && sig[p].k === "p" && ASIGNA.has(sig[p].v)) {
        const io = p; p++;
        const der = asignacion(lim);
        return propias(nodo("asignacion", izq.ia, der ? der.ib : io, [izq, der], { op: sig[io].v }), io);
      }
      return izq;
    }
    function flecha(lim) {
      const i0 = p;
      let params = [], ar = null;
      if (es("(", lim)) { ar = argumentos(lim, true); params = [...ar.args, ...ar.extra]; }
      else { params = [nodo("id", p, p)]; p++; }
      const io = p; p++;
      const cuerpo = es("{", lim) ? bloque(lim, false) : asignacion(lim);
      return propias(nodo("flecha", i0, cuerpo ? cuerpo.ib : io, [...params, cuerpo]), io, ar ? ar.ia : -1, ar ? ar.ic : -1, ...(ar ? ar.comas : []));
    }
    function condicional(lim) {
      const c = binaria(lim, 1);
      if (!c || !es("?", lim)) return c;
      const iq = p; p++;
      const si = asignacion(lim);
      let no = null, ic = -1;
      if (es(":", lim)) { ic = p; p++; no = asignacion(lim); }
      const fin = no || si;
      return propias(nodo("ternaria", c.ia, fin ? fin.ib : ic >= 0 ? ic : iq, [c, si, no]), iq, ic);
    }
    function binaria(lim, min) {
      let izq = unaria(lim);
      if (!izq) return null;
      while (p < lim) {
        const f = sig[p];
        const op = f.k === "p" || (f.k === "id" && (f.v === "in" || f.v === "of" || f.v === "instanceof")) ? f.v : null;
        if (op == null || !Object.hasOwn(PREC, op) || PREC[op] < min) break;
        const io = p; p++;
        const der = binaria(lim, op === "**" ? PREC[op] : PREC[op] + 1);
        izq = propias(nodo("binaria", izq.ia, der ? der.ib : io, [izq, der], { op }), io);
      }
      return izq;
    }
    function unaria(lim) {
      if (p >= lim) return null;
      const f = sig[p];
      if ((f.k === "p" || f.k === "id") && UNARIOS.has(f.v)) {
        const io = p; p++;
        const x = unaria(lim);
        return propias(nodo("unaria", io, x ? x.ib : io, [x], { op: f.v }), io);
      }
      return postfija(lim);
    }
    function postfija(lim) {
      let e = primaria(lim);
      if (!e) return null;
      while (p < lim) {
        const f = sig[p];
        if (f.k !== "p" || ((f.v === "(" || f.v === "[") && f.nl)) break;   // una línea nueva empieza otra sentencia
        if (f.v === "." || f.v === "?.") {
          const io = p; p++;
          if (p < lim && sig[p].k === "id") {
            const nom = nodo("id", p, p, [], { prop: true }); p++;
            if (es("(", lim) && !sig[p].nl) {
              // obj.metodo(args): «metodo(args)» es un nivel propio entre el argumento y la llamada entera.
              const ar = argumentos(lim), fin = ar.ic >= 0 ? ar.ic : ar.ultimo;
              const met = nodo("metodo", nom.ia, fin, [nom, ...ar.args, ...ar.extra]);
              e = propias(nodo("llamada", e.ia, fin, [e, met], { nombre: nom, args: ar.args }), io, ar.ia, ar.ic, ...ar.comas);
              met.llamada = e;
              continue;
            }
            e = propias(nodo("miembro", e.ia, nom.ib, [e, nom]), io);
            continue;
          }
          e = propias(nodo("miembro", e.ia, io, [e]), io);
          continue;
        }
        if (f.v === "(") {
          const ar = argumentos(lim), fin = ar.ic >= 0 ? ar.ic : ar.ultimo;
          const nombre = e.k === "id" ? e : e.k === "miembro" && e.h[1] ? e.h[1] : null;
          e = propias(nodo("llamada", e.ia, fin, [e, ...ar.args, ...ar.extra], { nombre, args: ar.args }), ar.ia, ar.ic, ...ar.comas);
          continue;
        }
        if (f.v === "[") {
          const ia = p, ic = cierre(p, lim), fin = ic >= 0 ? ic : finDeLinea(p, lim);
          p++;
          const x = expresion(fin, true), resto = restos(fin);
          if (ic >= 0) p = ic + 1;
          e = propias(nodo("miembro", e.ia, ic >= 0 ? ic : Math.max(ia, p - 1), [e, x, ...resto]), ia, ic);
          continue;
        }
        if ((f.v === "++" || f.v === "--") && !f.nl) { const io = p; p++; e = propias(nodo("unaria", e.ia, io, [e], { op: f.v }), io); continue; }
        break;
      }
      return e;
    }
    // Argumentos de una llamada o elementos de una lista. Un hueco sin valor ( ), (a, ) o [ ]
    // queda como nodo «vacio»: ahí se puede soltar o elegir un valor.
    function argumentos(lim, sinVacios = false) {
      const ia = p, ic = cierre(p, lim), fin = ic >= 0 ? ic : finDeLinea(p, lim);
      p++;
      const args = [], extra = [], comas = [];
      let previo = ia, hay = false;
      while (p < fin) {
        if (es(",", fin)) {
          if (!hay && !sinVacios) args.push(vacio(previo, p));
          comas.push(p); previo = p; p++; hay = false;
          continue;
        }
        const i = p, x = asignacion(fin);
        if (x) { if (hay) extra.push(x); else args.push(x); hay = true; }
        if (p === i) { extra.push(error()); hay = true; }
      }
      if (!hay && !sinVacios && ic >= 0) args.push(vacio(previo, ic));
      const ultimo = Math.max(ia, p - 1);
      if (ic >= 0) p = ic + 1;
      return { args, extra, ia, ic, comas, ultimo };
    }
    function primaria(lim) {
      if (p >= lim) return null;
      const f = sig[p];
      if (f.k === "id") {
        if (f.v === "function") return funcion(lim);
        if (SENTENCIAS.has(f.v)) return null;
        p++;
        return nodo(LITERALES.has(f.v) ? "lit" : "id", p - 1, p - 1);
      }
      if (f.k === "num" || f.k === "str" || f.k === "hueco") { p++; return nodo(f.k, p - 1, p - 1); }
      if (f.k !== "p") return null;
      if (f.v === "(") {
        const ia = p, ic = cierre(p, lim), fin = ic >= 0 ? ic : finDeLinea(p, lim);
        p++;
        const x = expresion(fin, true), resto = restos(fin);
        if (ic >= 0) p = ic + 1;
        return propias(nodo("grupo", ia, ic >= 0 ? ic : Math.max(ia, p - 1), [x, ...resto]), ia, ic);
      }
      if (f.v === "[") {
        const ar = argumentos(lim);
        return propias(nodo("lista", ar.ia, ar.ic >= 0 ? ar.ic : ar.ultimo, [...ar.args, ...ar.extra], { args: ar.args }), ar.ia, ar.ic, ...ar.comas);
      }
      if (f.v === "{") return objeto(lim);
      return null;
    }
    function objeto(lim) {
      const ia = p, ic = cierre(p, lim), fin = ic >= 0 ? ic : lim;
      p++;
      const h = [], marcas = [];
      while (p < fin) {
        if (es(",", fin)) { marcas.push(p); p++; continue; }
        const i = p;
        let clave = null;
        if (sig[p].k === "id" || sig[p].k === "str" || sig[p].k === "num") { clave = nodo(sig[p].k === "id" ? "id" : sig[p].k, p, p, [], { prop: true }); p++; }
        else if (es("[", fin)) clave = primaria(fin);
        if (clave && es(":", fin)) { const ip = p; p++; const v = asignacion(fin); h.push(propias(nodo("prop", clave.ia, v ? v.ib : ip, [clave, v]), ip)); }
        else if (clave) h.push(clave);
        while (p < fin && !es(",", fin)) { const j = p, x = asignacion(fin); if (x) h.push(x); if (p === j) h.push(error()); }
        if (p === i) h.push(error());
      }
      if (ic >= 0) p = ic + 1;
      return propias(nodo("objeto", ia, ic >= 0 ? ic : Math.max(ia, p - 1), h), ia, ic, ...marcas);
    }

    const tope = sentencias(sig.length);
    const raiz = { k: "programa", a: 0, b: src.length, ia: 0, ib: sig.length - 1, h: tope, padre: null };
    for (const n of tope) n.padre = raiz;
    nodos.push(raiz);
    const lineas = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineas.push(i + 1);
    return { src, todas, sig, par, nodos, raiz, duenos, hojas, lineas };
  }

  // ---------- Consultas ----------
  const buscar = (lista, pos) => {
    let lo = 0, hi = lista.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1, f = lista[m];
      if (pos < f.a) hi = m - 1; else if (pos >= f.b) lo = m + 1; else return m;
    }
    return -1;
  };
  const fichaEn = (est, pos) => est.todas[buscar(est.todas, pos)] || null;
  const seleccionable = (n) => { while (n && n.sel === false) n = n.padre; return n; };
  function lineaDe(est, pos) {
    let lo = 0, hi = est.lineas.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (est.lineas[m] <= pos) lo = m; else hi = m - 1; }
    return lo;
  }
  const inicioLinea = (est, l) => est.lineas[l];
  const finLinea = (est, l) => l + 1 < est.lineas.length ? est.lineas[l + 1] - 1 : est.src.length;   // sin el salto

  // Las consultas que dependen de las palabras del lenguaje (palabras clave, operadores lógicos y de
  // comparación, nombre de un hueco) se crean por lenguaje; JS usa los conjuntos de este archivo.
  // Python (shared/editor/estructura-python.js) construye un árbol con los mismos tipos de nodo.
  function consultas({ claves = CLAVES, logicos = LOGICOS, compara = COMPARA, huecoNombre = t => t.slice(2, -2).trim() } = {}) {
    // Lo que elige un toque: un valor entero (texto con sus comillas, comentario, número o nombre)
    // o la construcción a la que pertenece una palabra clave, un operador o un delimitador.
    function atomo(est, pos) {
      const t = fichaEn(est, pos);
      if (!t || t.k === "esp" || t.k === "nl") return null;
      if (t.k === "com" || t.k === "str" || t.k === "num") return [t.a, t.b];
      const i = buscar(est.sig, pos);
      if (i < 0) return [t.a, t.b];
      const f = est.sig[i];
      if (f.k === "id" && !claves.has(f.v)) return [f.a, f.b];
      const n = seleccionable(est.duenos.get(i));
      return n ? [n.a, n.b] : [f.a, f.b];
    }

    // Siguiente límite semántico: la construcción más pequeña que contiene la selección y es mayor que ella.
    // Ejemplo con «if (true) { yo.entregar("oro") }»: "oro" → entregar("oro") → yo.entregar("oro") → if entero.
    function ampliar(est, a, b) {
      if (a === b) { const t = atomo(est, a) || (a > 0 ? atomo(est, a - 1) : null); if (t) return t; }
      let mejor = null;
      for (const n of est.nodos) {
        if (n.sel === false || n.a > a || n.b < b || n.b - n.a <= b - a) continue;
        if (!mejor || n.b - n.a < mejor.b - mejor.a) mejor = n;
      }
      // Una línea con varias sentencias es un nivel propio entre la sentencia y lo que la contiene.
      const [ua, ub] = recortar(est.src, unidadLinea(est, lineaDe(est, a)));
      if (ua <= a && ub >= b && ub - ua > b - a && (!mejor || ub - ua < mejor.b - mejor.a)) return [ua, ub];
      return mejor ? [mejor.a, mejor.b] : null;
    }
    // [a, b) sin los espacios ni saltos de los extremos.
    function recortar(src, [a, b]) {
      while (a < b && /\s/.test(src[a])) a++;
      while (b > a && /\s/.test(src[b - 1])) b--;
      return [a, b];
    }

    // Líneas completas (con su salto) de la sentencia que empieza en la línea l. Una línea que empieza
    // cerrando llaves pertenece a la sentencia que cierra; una vacía o de comentario es solo ella.
    function unidadLinea(est, l) {
      const ini = inicioLinea(est, l), fin = finLinea(est, l);
      const lineaCompleta = (desde, hasta) => {
        const l1 = lineaDe(est, hasta);
        return [inicioLinea(est, lineaDe(est, desde)), l1 + 1 < est.lineas.length ? est.lineas[l1 + 1] : est.src.length];
      };
      let i = -1;
      for (let j = 0; j < est.sig.length; j++) if (est.sig[j].a >= ini && est.sig[j].a < Math.max(fin, ini + 1)) { i = j; break; }
      if (i < 0 || est.sig[i].a > fin) return lineaCompleta(ini, ini);
      const f = est.sig[i];
      // Una unidad empieza en la primera ficha de su línea: «} else {» no se mueve sin su if.
      const unidad = (x) => DE_LINEA.has(x.k) && x.sel !== false && est.sig[buscar(est.sig, x.a)].nl;
      let n = null;
      if (!(f.k === "p" && (f.v === "}" || f.v === ")" || f.v === "]"))) {
        for (const x of est.nodos) if (x.a === f.a && unidad(x) && (!n || x.b - x.a > n.b - n.a)) n = x;
      }
      if (!n) {
        n = est.duenos.get(i) || est.hojas.get(i) || null;
        while (n && n.k !== "programa" && !unidad(n)) n = n.padre;
      }
      if (!n || n.k === "programa") return lineaCompleta(ini, ini);
      return lineaCompleta(n.a, Math.max(n.a, n.b - 1));
    }

    // ¿Se puede soltar una línea en la frontera anterior a la línea l sin partir otra construcción?
    function fronteraValida(est, l) {
      if (l <= 0 || l >= est.lineas.length) return true;
      const pos = est.lineas[l];
      if (est.todas.some(t => t.a < pos && t.b > pos)) return false;   // dentro de un comentario o texto de varias líneas
      let menor = null;
      for (const n of est.nodos) if (n.a < pos && n.b > pos && (!menor || n.b - n.a < menor.b - menor.a)) menor = n;
      return !menor || CONTENEDORES.has(menor.k);
    }

    const texto = (est, n) => est.src.slice(n.a, n.b);
    function enCondicion(n) {
      let x = n;
      while (x.padre && ((x.padre.k === "binaria" && logicos.has(x.padre.op)) || (x.padre.k === "unaria" && x.padre.op === "!") || x.padre.k === "grupo")) x = x.padre;
      return !!x.padre && x.padre.cond === x;
    }
    const llamadaDe = (n) => !n || !n.padre ? null : n.padre.k === "llamada" ? n.padre : n.padre.k === "metodo" ? n.padre.llamada : null;

    // Qué es lo seleccionado: argumento de una llamada (con su función y posición), condición,
    // operando de una comparación o hueco suelto. Sirve para proponer valores.
    function contexto(est, a, b) {
      let n = null;
      if (a === b) n = est.nodos.find(x => x.k === "vacio" && x.a <= a && a <= x.b) || null;
      else n = est.nodos.find(x => x.a === a && x.b === b && x.k !== "vacio" && x.k !== "programa") || null;
      if (!n) return null;
      const r = { nodo: n, tipo: null, funcion: null, objeto: null, indice: -1, total: 0, hueco: null, vacio: n.k === "vacio", hoja: HOJAS.has(n.k) };
      if (n.k === "hueco") r.hueco = huecoNombre(est.src.slice(n.a, n.b));
      const pa = n.padre, ll = llamadaDe(n);
      if (ll && ll.args.includes(n)) {
        r.tipo = "argumento";
        r.indice = ll.args.indexOf(n);
        r.total = ll.args.length;
        r.funcion = ll.nombre ? texto(est, ll.nombre) : null;
        const callee = ll.h[0];
        if (pa.k === "metodo") r.objeto = texto(est, callee);
        else if (callee && callee.k === "miembro" && callee.h[0]) r.objeto = texto(est, callee.h[0]);
      } else if (pa && pa.k === "lista" && pa.args.includes(n)) r.tipo = "elemento";
      else if (pa && pa.cond === n) r.tipo = "condicion";
      // Operando de &&, || o ??: es condición solo si la expresión lógica entera es la condición de un if/while.
      else if (pa && ((pa.k === "binaria" && logicos.has(pa.op)) || (pa.k === "unaria" && pa.op === "!"))) r.tipo = enCondicion(n) ? "condicion" : "valor";
      else if (pa && pa.k === "binaria" && compara.has(pa.op)) r.tipo = "valor";
      else if (r.hueco) r.tipo = "hueco";
      // Operando de una operación binaria completa: borrarlo quita también el operador y deja el otro.
      if (pa && pa.k === "binaria" && pa.h.length === 2 && pa.h.includes(n)) r.binaria = pa;
      return r;
    }

    // Dónde cae un valor arrastrado: sustituye un hueco o un argumento, rellena un argumento vacío
    // o se inserta entre los valores de unos paréntesis o corchetes.
    function destino(est, pos) {
      const i = buscar(est.sig, pos);
      if (i >= 0) {
        const n = est.hojas.get(i);
        if (n && (n.k === "hueco" || (llamadaDe(n) && llamadaDe(n).args.includes(n)) || (n.padre && n.padre.k === "lista"))) return { tipo: "reemplazar", a: n.a, b: n.b };
      }
      const v = est.nodos.find(x => x.k === "vacio" && x.a <= pos && pos <= x.b);
      if (v) return { tipo: "insertar", a: v.a, b: v.b, vacio: true };
      // Dentro de unos paréntesis o corchetes: se inserta como un valor más de la lista.
      const dentro = est.sig.some((f, j) => f.k === "p" && (f.v === "(" || f.v === "[") && est.par[j] > j && f.b <= pos && est.sig[est.par[j]].a >= pos);
      return dentro ? { tipo: "insertar", a: pos, b: pos, lista: true } : null;
    }

    // Texto que se inserta entre los valores de una lista: añade la coma que falte a cada lado.
    function enLista(src, a, b, valor) {
      let i = a - 1; while (i >= 0 && /\s/.test(src[i])) i--;
      let j = b; while (j < src.length && /\s/.test(src[j])) j++;
      const antes = src[i], despues = src[j];
      let t = valor;
      if (antes === ",") t = (a > 0 && /\s/.test(src[a - 1]) ? "" : " ") + t;
      else if (antes !== "(" && antes !== "[") t = ", " + t;
      if (despues !== ")" && despues !== "]" && despues !== ",") t += ", ";
      return t;
    }
    return { atomo, ampliar, unidadLinea, fronteraValida, contexto, destino, enLista };
  }
  const JS = consultas();
  const { atomo, ampliar, unidadLinea, fronteraValida, contexto, destino, enLista } = JS;

  // Desenvolver: quita el if/while/for/do más cercano que contiene [a, b) y deja su contenido con un
  // nivel menos de sangría. Un else con código no se descarta: sin cambio posible devuelve un motivo.
  const ENVOLTURAS = new Set(["si", "mientras", "para", "hacer"]);
  // ¿Solo plantilla? Huecos, comentarios, llaves y else/if vacíos (lo que añaden los atajos If / else).
  const sinCodigo = (t) => !t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|\b(?:if|else)\b|[\s{}();]/g, "");
  function desenvolver(est, a, b) {
    const src = est.src;
    let n = null;
    for (const x of est.nodos) if (ENVOLTURAS.has(x.k) && x.a <= a && x.b >= b && (!n || x.b - x.a < n.b - n.a)) n = x;
    if (!n) return { motivo: "Elige algo dentro de un if, while, for o do." };
    // El cuerpo: lo que sigue a la cabecera «( … )» (do: lo que sigue a la palabra).
    let ini = n.ia + 1;
    if (n.k !== "hacer" && est.sig[ini] && est.sig[ini].v === "(" && est.par[ini] > ini) ini = est.par[ini] + 1;
    const cuerpo = n.h.find(c => c.ia === ini && c.k !== "sino");
    const alt = n.h.find(c => c.k === "sino");
    if (alt && !sinCodigo(src.slice(alt.a + 4, alt.b))) return { motivo: "El else tiene código: bórralo o muévelo antes de desenvolver." };
    let dentro = !cuerpo ? "" : cuerpo.k === "bloque" ? src.slice(cuerpo.a + 1, src[cuerpo.b - 1] === "}" ? cuerpo.b - 1 : cuerpo.b) : src.slice(cuerpo.a, cuerpo.b);
    const lineas = dentro.split("\n");
    while (lineas.length && !lineas[0].trim()) lineas.shift();
    while (lineas.length && !lineas[lineas.length - 1].trim()) lineas.pop();
    // Líneas enteras si la construcción ocupa sus líneas; si no, solo su tramo.
    const li = src.lastIndexOf("\n", n.a - 1) + 1, lf = src.indexOf("\n", n.b) < 0 ? src.length : src.indexOf("\n", n.b);
    const solaIni = !src.slice(li, n.a).trim(), solaFin = !src.slice(n.b, lf).trim();
    const desde = solaIni ? li : n.a, hasta = solaFin ? Math.min(src.length, lf + 1) : n.b;
    const sangria = src.slice(li, n.a).match(/^[ \t]*/)[0];
    const utiles = lineas.filter(l => l.trim());
    const margen = utiles.length ? Math.min(...utiles.map(l => l.match(/^[ \t]*/)[0].length)) : 0;
    const cuerpoTxt = lineas.map((l, i) => !l.trim() ? "" : (i === 0 && !solaIni ? "" : sangria) + l.slice(margen)).join("\n");
    const salto = solaFin && hasta > lf && cuerpoTxt ? "\n" : "";
    const texto = cuerpoTxt + salto;
    const selA = desde + (cuerpoTxt && solaIni ? sangria.length : 0);
    return { a: desde, b: hasta, texto, sel: [selA, desde + cuerpoTxt.length] };
  }

  window.ESTRUCTURA = { analizar, atomo, ampliar, unidadLinea, fronteraValida, contexto, destino, enLista, lineaDe, inicioLinea, finLinea, fichaEn, desenvolver, consultas };
})();
