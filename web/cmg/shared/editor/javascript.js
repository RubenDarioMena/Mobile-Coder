/* Primitivas JS del editor. E0: el juego y las pruebas cargan el mismo módulo.
 * No crea interfaz ni ejecuta programas. El puerto de texto e inserción lo pone el anfitrión. */
(() => {
  "use strict";
  const NOMBRES_HUECO = "tipo de enemigo|tipo|sensor|lugar|material|condición|segundos|mensaje|valor";
  const HUECO = new RegExp(`^\\/\\*\\s*(${NOMBRES_HUECO})\\s*\\*\\/$`);
  const RE_ID = /[A-Za-z_$][\w$]*/y, RE_NUM = /0x[0-9a-f]+|\d*\.?\d+(?:e[+-]?\d+)?/iy;
  function lexico(src) {
    const out = []; const n = src.length; let i = 0;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === "/" && d === "/") { let j = src.indexOf("\n", i); if (j < 0) j = n; out.push(["com", src.slice(i, j)]); i = j; continue; }
      if (c === "/" && d === "*") { let j = src.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; out.push(["com", src.slice(i, j)]); i = j; continue; }
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        while (j < n) { const e = src[j]; if (e === "\\") { j += 2; continue; } if (e === c) { j++; break; } if (e === "\n" && c !== "`") break; j++; }
        j = Math.min(n, j); out.push(["str", src.slice(i, j)]); i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(d || ""))) { RE_NUM.lastIndex = i; const m = RE_NUM.exec(src); out.push(["num", m[0]]); i += m[0].length; continue; }
      if (/[A-Za-z_$]/.test(c)) { RE_ID.lastIndex = i; const m = RE_ID.exec(src); out.push(["id", m[0]]); i += m[0].length; continue; }
      if (c === "\n") { out.push(["nl", c]); i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { let j = i; while (j < n && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++; out.push(["esp", src.slice(i, j)]); i = j; continue; }
      out.push(["p", c]); i++;
    }
    return out;
  }
  const RE_HUECO = new RegExp(`\\/\\*\\s*(?:${NOMBRES_HUECO})\\s*\\*\\/`);

  function crearEdicion({ codigo: $codigo, insertar, aviso: avisoEditor, escapar: esc, estructura }) {
    function rangoCodigo(pos, triple) {
      const src = $codigo.value, pila = [], pares = [];
      let offset = 0;
      for (const [tipo, txt] of lexico(src)) {
        const desde = offset; offset += txt.length;
        if (!triple && (tipo === "str" || (tipo === "com" && txt.startsWith("/*"))) && pos >= desde && pos < offset) return [desde, offset];
        if (tipo !== "p") continue;
        if ("([{".includes(txt)) pila.push({ c: txt, pos: desde });
        else if (")]}".includes(txt)) {
          const abre = pila.pop();
          if (abre && "([{".indexOf(abre.c) === ")]}".indexOf(txt)) pares.push([abre.pos, desde]);
          else pila.length = 0;
        }
      }
      if (triple) {
        // El delimitador pulsado tiene prioridad sobre cualquier par anidado que contenga.
        const par = pares.find(([a, b]) => a === pos || b === pos);
        if (par) return [par[0] + 1, par[1]];
      }
      return null;
    }
    function envolver(antes, despues, bloque = false) {
      const a = $codigo.selectionStart, b = $codigo.selectionEnd;
      if (a === b || $codigo.readOnly) return false;
      const v = $codigo.value, elegido = v.slice(a, b);
      let contenido = elegido, cierre = despues;
      if (bloque) {
        const ini = v.lastIndexOf("\n", a - 1) + 1;
        const prefijo = v.slice(ini, a);
        const sangria = (prefijo.trim() ? prefijo : prefijo + elegido).match(/^[ \t]*/)[0];
        if (!prefijo.trim()) antes = sangria.slice(prefijo.length) + antes;
        const saltoFinal = elegido.endsWith("\n");
        const lineas = (saltoFinal ? elegido.slice(0, -1) : elegido).split("\n");
        if (!prefijo.trim()) lineas[0] = prefijo + lineas[0];
        const utiles = lineas.filter(l => l.trim());
        const margen = utiles.length ? Math.min(...utiles.map(l => l.match(/^[ \t]*/)[0].length)) : 0;
        contenido = lineas.map(l => l.trim() ? sangria + "  " + l.slice(margen) : "").join("\n");
        cierre = despues.split("\n").map((l, i) => i ? sangria + l : l).join("\n") + (saltoFinal ? "\n" : "");
      }
      return insertar(antes + contenido + cierre, antes.length, antes.length + contenido.length);
    }
    // Lo que cabe en el hueco de una plantilla de sentencia: la expresión de una sentencia, sin su «;».
    // Un nombre declarado, un argumento o un bloque no: la plantilla iría dentro de otra construcción.
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
      return { a: n.a, b: n.b, puntoYComa: n.padre.b > n.b };
    }
    // Un bloque (if, while…) envuelve sentencias completas: la selección se amplía a sus líneas.
    function elegirLineasCompletas() {
      const E = estructura(), v = $codigo.value, a = $codigo.selectionStart, b = $codigo.selectionEnd;
      if (!E) return;
      const est = E.analizar(v, lexico(v));
      const u0 = E.unidadLinea(est, E.lineaDe(est, a)), u1 = E.unidadLinea(est, E.lineaDe(est, Math.max(a, b - 1)));
      $codigo.setSelectionRange(Math.min(u0[0], u1[0]), Math.max(u0[1], u1[1]));
    }
    function insertarBloque(bloque, envolvente) {
      const elegido = $codigo.selectionStart !== $codigo.selectionEnd;
      if (envolvente && elegido) { elegirLineasCompletas(); if (envolver(envolvente[0], envolvente[1], true)) return; }
      // Con un hueco elegido, una plantilla «const x = valor;» lo rellena con su valor en vez de abrir otra línea.
      const valor = bloque.match(/^(?:const|let|var)\s+[\w$]+\s*=\s*([^\n]+?);?\s*$/);
      if (valor && elegido) {
        const v = $codigo.value.slice($codigo.selectionStart, $codigo.selectionEnd).trim();
        if (RE_HUECO.test(v) && v.match(RE_HUECO)[0] === v) {
          const h = valor[1].search(RE_HUECO), m = h >= 0 ? valor[1].slice(h).match(RE_HUECO)[0] : "";
          if (h >= 0) insertar(valor[1], h, h + m.length); else insertar(valor[1]);
          return;
        }
      }
      const hSeleccion = bloque.search(RE_HUECO);
      if (hSeleccion >= 0 && elegido) {
        const x = expresionEnvolvible();
        // Sin una expresión que envolver, la plantilla va en una línea nueva tras lo elegido.
        if (!x) $codigo.setSelectionRange($codigo.selectionEnd, $codigo.selectionEnd);
        else {
          $codigo.setSelectionRange(x.a, x.b);
          const despues = bloque.slice(hSeleccion + bloque.slice(hSeleccion).match(RE_HUECO)[0].length);
          if (envolver(bloque.slice(0, hSeleccion), x.puntoYComa ? despues.replace(/;\s*$/, "") : despues)) return;
        }
      }
      const a = $codigo.selectionStart, v = $codigo.value;
      const ini = v.lastIndexOf("\n", a - 1) + 1;
      const fin = v.indexOf("\n", a) === -1 ? v.length : v.indexOf("\n", a);
      const linea = v.slice(ini, fin);
      // En una línea vacía la sangría sale de la línea anterior (sin teclado no hay espacios escritos).
      const guia = linea.trim() ? linea : v.slice(0, ini).split("\n").slice(0, -1).reverse().find(l => l.trim()) ?? linea;
      const sangria = guia.match(/^\s*/)[0] + (/\{\s*$/.test(guia) ? "  " : "");
      const texto = bloque.split("\n").map((l, i) => (i ? sangria : "") + l).join("\n");
      const h = texto.search(RE_HUECO), hueco = texto.indexOf("\n" + sangria + "  \n");
      const pos = h >= 0 ? h : hueco === -1 ? texto.length : hueco + 1 + sangria.length + 2;
      const largo = h >= 0 ? texto.slice(h).match(RE_HUECO)[0].length : 0;
      if (!linea.trim()) { $codigo.setSelectionRange(ini, fin); insertar(sangria + texto, sangria.length + pos, sangria.length + pos + largo); }
      else { $codigo.setSelectionRange(fin, fin); insertar("\n" + sangria + texto, 1 + sangria.length + pos, 1 + sangria.length + pos + largo); }
    }
    // Operando de un operador: la expresión elegida, ajustada para no partir el código.
    // Una sentencia o declaración aporta su expresión («const pos = X;» → X); el nombre de una función
    // o el objeto de «a.b» arrastran la llamada entera. Sin selección, la expresión que acaba en el cursor.
    const EXPRESIONES = new Set(["id", "num", "str", "lit", "hueco", "binaria", "unaria", "llamada", "miembro", "ternaria", "asignacion", "flecha", "grupo", "lista", "objeto"]);
    const PREC_OP = { "??": 1, "||": 2, "&&": 3, "==": 7, "!=": 7, "===": 7, "!==": 7, "<": 8, ">": 8, "<=": 8, ">=": 8, "+": 10, "-": 10, "*": 11, "/": 11, "%": 11, "**": 12 };
    function operandoDe(n, asignar) {
      if (n && n.k === "id" && n.padre && n.padre.k === "decl" && n.padre.h[0] === n) n = n.padre;
      if (n && (n.k === "sentencia" || n.k === "salto")) n = n.h[0];
      else if (n && n.k === "decl") n = !asignar && n.h.length === 2 ? n.h[1] : null;
      while (n && n.padre && (n.padre.h[0] === n && (n.padre.k === "llamada" || n.padre.k === "miembro" || n.padre.k === "metodo")))
        n = n.padre.k === "metodo" ? n.padre.padre : n.padre;
      return n && EXPRESIONES.has(n.k) ? n : null;
    }
    function operandoOperador(asignar) {
      const E = estructura(), v = $codigo.value;
      let a = $codigo.selectionStart, b = $codigo.selectionEnd;
      if (!E) return a === b ? null : { a, b, n: null };
      const est = E.analizar(v, lexico(v)), util = x => x.k !== "vacio" && x.k !== "programa";
      let n;
      if (a !== b) {
        while (a < b && /\s/.test(v[a])) a++;
        while (b > a && /\s/.test(v[b - 1])) b--;
        // La construcción más pequeña que cubre lo elegido.
        n = est.nodos.filter(x => util(x) && x.a <= a && x.b >= b).sort((x, y) => (x.b - x.a) - (y.b - y.a))[0];
      } else {
        while (a > 0 && /[ \t]/.test(v[a - 1])) a--;
        n = est.nodos.filter(x => x.b === a && (EXPRESIONES.has(x.k) || x.k === "sentencia" || x.k === "decl" || x.k === "salto"))
          .sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
      }
      n = operandoDe(n, asignar);
      return n ? { a: n.a, b: n.b, n } : null;
    }
    // «a || b ?? c» no es válido y «a ?? b && c» cambia de sentido: el operando lleva paréntesis si hace falta.
    function conParentesis(texto, n, op) {
      if (!n || op === "=") return texto;
      const logicos = ["??", "||", "&&"];
      const baja = ["ternaria", "asignacion", "flecha", "secuencia"].includes(n.k)
        || n.k === "binaria" && (PREC_OP[n.op] < PREC_OP[op] || logicos.includes(n.op) && logicos.includes(op) && (n.op === "??") !== (op === "??"));
      return baja ? `(${texto})` : texto;
    }
    // Operadores: el operando (lo elegido o lo que acaba en el cursor) va primero y queda elegido el hueco
    // del segundo; «!» lo niega. Sin operando, ambos lados son huecos.
    function insertarOperador(a) {
      const hueco = `/* ${a.hueco || "valor"} */`, op = operandoOperador(a.operador === "=");
      if (!op && $codigo.selectionStart !== $codigo.selectionEnd)
        return avisoEditor(`Elige un valor para usar <code>${esc(a.operador)}</code>: una variable, una llamada o una expresión.`);
      if (!op) {
        const texto = a.prefijo ? a.operador + hueco : `${hueco} ${a.operador} ${hueco}`;
        return insertar(texto, a.prefijo ? a.operador.length : 0, (a.prefijo ? a.operador.length : 0) + hueco.length);
      }
      $codigo.setSelectionRange(op.a, op.b);
      const elegido = $codigo.value.slice(op.a, op.b);
      if (a.prefijo) {
        const negado = a.operador + (/[\s&|<>=!?+\-*/%]/.test(elegido.replace(/^\/\*.*\*\/$/, "")) ? `(${elegido})` : elegido);
        return insertar(negado, 0, negado.length);
      }
      const operando = conParentesis(elegido, op.n, a.operador), texto = `${operando} ${a.operador} ${hueco}`;
      if (RE_HUECO.test(elegido) && elegido.match(RE_HUECO)[0] === elegido) return insertar(texto, 0, elegido.length);
      insertar(texto, texto.length - hueco.length, texto.length);
    }

    return { rangoCodigo, envolver, expresionEnvolvible, elegirLineasCompletas, insertarBloque, insertarOperador };
  }
  window.CMGEditorJS = { NOMBRES_HUECO, HUECO, RE_HUECO, lexico, crearEdicion };
})();
