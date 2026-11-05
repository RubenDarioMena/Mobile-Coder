/* Interfaz extraída; juego y demo crean instancias de este mismo módulo. */
(() => {
  "use strict";
  function crear({ cmg, $, ambito, preferencias, vida, adaptador, iconos = {}, historiales: externos }) {
  const E = adaptador.estructura;
  const app = $("app"), $editor = $("editor"), $codigo = cmg.codigo, $gutter = $("gutter"), $barra = $("edicion");
  const $vista = $("bloques"), $in = $("bloques-in"), $texto = $("bloques-texto"), $capa = $("bloques-capa"), $asas = $("asas"), $asasIn = $("asas-in");
  const { leer, escribir } = preferencias;
  const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  // Lo que depende del lenguaje llega del adaptador; sin él, las reglas de JS de siempre.
  const S = adaptador.sangria || {};
  const UNIDAD = S.unidad || "  ";   // sangría de los programas de partida
  const abreLinea = S.abre || ((l) => /\{\s*(\/\/.*)?$/.test(l));
  const significativa = !!(S.significativa && S.niveles);   // Python: la sangría es el programa
  const H = (n) => adaptador.hueco && adaptador.hueco.crear ? adaptador.hueco.crear(n) : `/* ${n} */`;
  const FIN = adaptador.finSentencia ?? ";";
  const L = adaptador.edicion || {};
  const nombreFn = (fn) => `${fn.objeto ? fn.objeto + "." : ""}${(fn.nombres && fn.nombres[adaptador.id]) || fn.nombre}`;

  let activo = false;                                         // modo sin teclado
  let asa = leer("asa", "numero") === "borde" ? "borde" : "numero";   // dónde se agarran las líneas
  let est = null, estDe = null;
  const estructura = () => { const v = $codigo.value; if (v !== estDe) { est = E.analizar(v, cmg.lexico(v)); estDe = v; } return est; };
  const sel = () => [$codigo.selectionStart, $codigo.selectionEnd];
  const pila = [];   // selecciones anteriores a cada «ampliar»: «reducir» vuelve por ellas

  // ---------- Selección ----------
  function elegir(a, b, { conservar = false, mostrar = false } = {}) {
    if (!conservar) pila.length = 0;
    $codigo.setSelectionRange(Math.min(a, b), Math.max(a, b));
    if (activo) { pintarSeleccion(); if (mostrar) mostrarRango(a); }
    actualizarSugerencias();
  }
  function ampliar() {
    const [a, b] = sel(), r = E.ampliar(estructura(), a, b);
    if (!r || (r[0] === a && r[1] === b)) return;
    pila.push([a, b]);
    elegir(r[0], r[1], { conservar: true, mostrar: true });
  }
  function reducir() {
    const r = pila.pop();
    if (r) return elegir(r[0], r[1], { conservar: true, mostrar: true });
    const [a, b] = sel(), t = E.atomo(estructura(), a);
    if (t && (t[0] !== a || t[1] !== b)) elegir(t[0], t[1]);
  }
  // ¿[a, b) ocupa líneas enteras, sin contar la sangría ni los espacios del final?
  function sonLineas(a, b) {
    if (a === b) return false;
    const e = estructura(), v = e.src;
    const la = E.inicioLinea(e, E.lineaDe(e, a)), lb = E.finLinea(e, E.lineaDe(e, Math.max(a, b - 1)));
    return !v.slice(la, a).trim() && !v.slice(b, lb).trim();
  }
  // Líneas completas con su salto: las que cubre la selección, o la sentencia de la línea del cursor.
  function lineasDe(a, b) {
    const e = estructura();
    if (a === b || !sonLineas(a, b)) return E.unidadLinea(e, E.lineaDe(e, a));
    const l1 = E.lineaDe(e, Math.max(a, b - 1));
    return [E.inicioLinea(e, E.lineaDe(e, a)), l1 + 1 < e.lineas.length ? e.lineas[l1 + 1] : e.src.length];
  }
  const sinSalto = ([a, b]) => [a, b > a && $codigo.value[b - 1] === "\n" ? b - 1 : b];
  const variables = (e, hasta) => [...new Set(e.nodos.filter(n => n.k === "decl" && n.a < hasta && n.h[0] && n.h[0].k === "id").map(n => e.src.slice(n.h[0].a, n.h[0].b)))];

  // ---------- Cambios e historial ----------
  const editable = () => { if (!$codigo.readOnly) return true; cmg.aviso("Detén el programa para editarlo."); return false; };
  // Sustituye [a, b) por texto y deja elegido [sa, sb) del texto nuevo. Cada llamada es un paso de deshacer.
  function reemplazar(a, b, texto, sa = a + texto.length, sb = sa) {
    if ($codigo.readOnly) return false;
    hist.operacion = true;
    $codigo.setSelectionRange(a, b);
    cmg.insertar(texto, sa - a, sb - a);
    pila.length = 0;
    if (activo) pintarSeleccion();
    actualizarSugerencias();
    pintarBarra();
    return true;
  }
  // Pasa al texto nuevo cambiando solo el tramo distinto.
  function cambiar(nuevo, sa, sb) {
    const v = $codigo.value;
    let i = 0; while (i < v.length && i < nuevo.length && v[i] === nuevo[i]) i++;
    let j = 0; while (j < v.length - i && j < nuevo.length - i && v[v.length - 1 - j] === nuevo[nuevo.length - 1 - j]) j++;
    return reemplazar(i, v.length - j, nuevo.slice(i, nuevo.length - j), sa, sb);
  }
  // Un historial por documento (programa o borrador). Lo tecleado seguido cuenta como un solo paso.
  // El mapa puede llegar de la instancia: así sobrevive cuando el editor se rehace para otro lenguaje.
  // Cada entrada es el objeto vivo del historial, de modo que el mapa siempre está al día.
  const historiales = externos || new Map();
  const capturar = () => cmg.capturarDocumento ? cmg.capturarDocumento() : $codigo.value;
  const nuevoHistorial = () => ({ pasado: [], futuro: [], ultimo: capturar(), t: 0, tecleo: false, operacion: false });
  let claveDoc = cmg.claveDocumento, aplicando = false;
  const deAntes = historiales.get(claveDoc);
  let hist = deAntes && deAntes.ultimo === capturar() ? deAntes : nuevoHistorial();
  historiales.set(claveDoc, hist);
  vida.escuchar($codigo, "input", (ev) => {
    const actual = capturar();
    if (aplicando || actual === hist.ultimo) return;
    const ahora = performance.now();
    const tecleo = !hist.operacion && !!ev.inputType && ((ev.inputType === "insertText" && (ev.data || "").length === 1) || ev.inputType.startsWith("deleteContent"));
    if (!(tecleo && hist.tecleo && ahora - hist.t < 1200)) { hist.pasado.push(hist.ultimo); if (hist.pasado.length > 200) hist.pasado.shift(); }
    hist.futuro.length = 0;
    Object.assign(hist, { ultimo: actual, t: ahora, tecleo, operacion: false });
    pintarBarra();
  });
  vida.escuchar($codigo, "cmg:documento", (ev) => {
    historiales.set(claveDoc, hist);
    claveDoc = ev.detail.clave;
    const h = historiales.get(claveDoc);
    hist = h && h.ultimo === capturar() ? h : nuevoHistorial();
    historiales.set(claveDoc, hist);
    pila.length = 0;
    cerrarSugerencias();
    pintarBarra();
  });
  // Un cambio de vista conserva el documento, sin añadir un paso de deshacer.
  vida.escuchar($codigo, "cmg:sincronizado", () => {
    if (claveDoc !== cmg.claveDocumento) return;
    hist.ultimo = capturar(); hist.tecleo = false; pintarBarra();
  });
  function recorrer(desde, hacia) {
    if (!desde.length || !editable()) return;
    const actual = capturar(), otro = desde.pop();
    hacia.push(actual);
    if (cmg.restaurarDocumento) {
      aplicando = true;
      try { cmg.restaurarDocumento(otro); } finally { aplicando = false; }
      Object.assign(hist, { ultimo: capturar(), tecleo: false });
      pintarBarra();
      return;
    }
    let i = 0; while (i < otro.length && i < actual.length && otro[i] === actual[i]) i++;
    let j = 0; while (j < otro.length - i && j < actual.length - i && otro[otro.length - 1 - j] === actual[actual.length - 1 - j]) j++;
    aplicando = true;
    $codigo.value = otro;
    $codigo.dispatchEvent(new Event("input"));
    aplicando = false;
    Object.assign(hist, { ultimo: otro, tecleo: false });
    elegir(i, otro.length - j, { mostrar: true });
    pintarBarra();
  }
  const deshacer = () => recorrer(hist.pasado, hist.futuro);
  const rehacer = () => recorrer(hist.futuro, hist.pasado);

  // ---------- Sangría ----------
  const sangriaDe = (l) => l.match(/^[ \t]*/)[0];
  // Sangría para una línea nueva en pos (principio de línea): la de la anterior con texto, un nivel más tras «{».
  function sangriaEn(texto, pos) {
    const previas = texto.slice(0, pos).split("\n"); previas.pop();
    const previa = previas.reverse().find(l => l.trim());
    if (significativa) return S.niveles(texto, pos)[0] ?? sangriaDe(previa ?? "");
    if (previa !== undefined) return sangriaDe(previa) + (abreLinea(previa) ? UNIDAD : "");
    const siguiente = texto.slice(pos).split("\n").find(l => l.trim());
    return siguiente ? sangriaDe(siguiente) : "";
  }
  function reindentar(bloque, sangria) {
    const lineas = bloque.replace(/\n$/, "").split("\n"), utiles = lineas.filter(l => l.trim());
    const min = utiles.length ? Math.min(...utiles.map(l => sangriaDe(l).length)) : 0;
    return lineas.map(l => l.trim() ? sangria + l.slice(min) : "").join("\n") + (bloque.endsWith("\n") ? "\n" : "");
  }

  // ---------- Acciones ----------
  // Mueve (o copia) las líneas [la, lb) a la frontera anterior a la línea l, con la sangría del destino.
  function moverLineasA(la, lb, l, copia = false, nivel = null) {
    if (significativa) return moverLineasPython(la, lb, l, copia, nivel);
    const v = $codigo.value, e = estructura();
    const destino = l < e.lineas.length ? e.lineas[l] : v.length;
    if (!copia && destino >= la && destino <= lb) return false;
    let bloque = v.slice(la, lb);
    if (!bloque.endsWith("\n")) bloque += "\n";
    const resto = copia ? v : v.slice(0, la) + v.slice(lb);
    const pos = Math.min(resto.length, copia || destino < la ? destino : destino - (lb - la));
    const salto = pos === resto.length && resto.length && !resto.endsWith("\n") ? "\n" : "";
    const nuevo = reindentar(bloque, sangriaEn(resto, pos));
    let final = resto.slice(0, pos) + salto + nuevo + resto.slice(pos);
    if (!v.endsWith("\n") && final.endsWith("\n")) final = final.slice(0, -1);   // mover no añade un salto al final
    const sa = pos + salto.length;
    return cambiar(final, sa, sa + nuevo.replace(/\n$/, "").length);
  }
  // Python: quitar las líneas deja «pass» si su bloque se queda vacío; el destino es un hueco entre
  // líneas y un nivel de sangría. Entre el final de un bloque y lo que sigue hay varios niveles:
  // el elegido (nivel: índice o sangría) o, si no, el más profundo.
  function sinLineas(v, la, lb, copia) {
    let bloque = v.slice(la, lb);
    if (!bloque.endsWith("\n")) bloque += "\n";
    if (copia) return { bloque, resto: v, crece: 0 };
    const resto = v.slice(0, la) + v.slice(lb);
    const r = S.rellenar(resto, Math.min(la, resto.length));
    return { bloque, resto: r.texto, crece: r.crece };
  }
  function ponerLineas(v, resto, bloque, pos, sangria) {
    const salto = pos === resto.length && resto.length && !resto.endsWith("\n") ? "\n" : "";
    const nuevo = reindentar(bloque, sangria);
    let final = resto.slice(0, pos) + salto + nuevo + resto.slice(pos);
    if (!v.endsWith("\n") && final.endsWith("\n")) final = final.slice(0, -1);
    const sa = pos + salto.length;
    return cambiar(final, sa, sa + nuevo.replace(/\n$/, "").length);
  }
  // Niveles válidos en pos (inicio de línea o final del texto). El adaptador ya excluye las líneas
  // que continúan otra (paréntesis, textos de varias líneas) y el hueco entre un cuerpo y su elif/else
  // al nivel del if; al final de ese cuerpo, en cambio, sí se puede seguir dentro.
  const nivelesEn = (resto, pos) => S.niveles(resto, pos);
  function moverLineasPython(la, lb, l, copia, nivel) {
    const v = $codigo.value, e = estructura();
    const destino = l < e.lineas.length ? e.lineas[l] : v.length;
    if (!copia && destino >= la && destino <= lb && nivel == null) return false;
    const { bloque, resto, crece } = sinLineas(v, la, lb, copia);
    let pos = copia || destino < la ? destino : destino - (lb - la);
    if (!copia && destino >= lb) pos += crece;
    pos = Math.min(pos, resto.length);
    const ns = nivelesEn(resto, pos);
    if (!ns.length) return false;
    const sangria = typeof nivel === "string" && ns.includes(nivel) ? nivel : typeof nivel === "number" && ns[nivel] != null ? ns[nivel] : ns[0];
    if (!copia && pos === la && sangria === sangriaDe(bloque)) return false;
    return ponerLineas(v, resto, bloque, pos, sangria);
  }
  // Paso a paso: cada hueco entre líneas, y en cada uno sus niveles del más profundo al menos.
  // Subir desde la línea siguiente a un bloque entra primero al final de ese bloque.
  function moverLineasPasoPython(dir, la, lb) {
    const v = $codigo.value, { bloque, resto, crece } = sinLineas(v, la, lb, false);
    const propia = sangriaDe(bloque), huecos = [0];
    for (let i = 0; i < resto.length; i++) if (resto[i] === "\n" && i + 1 < resto.length) huecos.push(i + 1);
    if (resto.endsWith("\n")) huecos.push(resto.length);
    if (resto.length && !resto.endsWith("\n")) huecos.push(resto.length);
    const puestos = [];
    for (const pos of huecos) for (const n of nivelesEn(resto, pos)) puestos.push({ pos, n });
    const actual = dir < 0 ? la : la + crece;
    // Orden: por posición y, en la misma, de más a menos sangría.
    const antes = (x) => x.pos < actual || (x.pos === actual && x.n.length > propia.length);
    let i = puestos.findIndex(x => x.pos === actual && x.n === propia);
    let t;
    if (i >= 0) t = puestos[i + dir];
    else { const k = puestos.filter(antes).length; t = dir < 0 ? puestos[k - 1] : puestos[k]; }
    if (!t) return false;
    return ponerLineas(v, resto, bloque, t.pos, t.n);
  }
  function moverLineas(dir) {
    if (!editable()) return;
    const [a, b] = sel(), e = estructura(), [la, lb] = lineasDe(a, b);
    if (significativa) return moverLineasPasoPython(dir, la, lb);
    const l0 = E.lineaDe(e, la), l1 = E.lineaDe(e, Math.max(la, lb - 1));
    let l = dir < 0 ? l0 - 1 : l1 + 2;
    while (l > 0 && l < e.lineas.length && !E.fronteraValida(e, l)) l += dir;
    if (l < 0 || l > e.lineas.length || (dir > 0 && l1 + 1 >= e.lineas.length)) return;
    moverLineasA(la, lb, l);
  }
  // Quita [a, b) como un bloque: un argumento deja su hueco y una condición el suyo; las líneas
  // enteras se van con su salto y no quedan espacios dobles.
  // Partes sin las que su construcción no se sostiene: el nombre declarado, lo que espera un await,
  // el nombre de una función o el objeto/método de una llamada. Borrarlas borra la construcción
  // (y su sentencia, si la ocupa entera), en vez de dejar «const =», «await;» o «();».
  function contenedorNecesario(e, n) {
    const pa = n.padre;
    if (!pa) return null;
    let x = null;
    if (pa.k === "decl" && pa.h.includes(n)) {
      const previo = e.sig[n.ia - 1];
      if (!(previo && previo.k === "p" && previo.v === "=") || n.k === "hueco") x = pa;   // el valor inicial se queda en hueco
    } else if (pa.k === "unaria" && pa.op === "await") x = pa;
    else if (pa.k === "llamada" && pa.h[0] === n) x = pa;
    else if (pa.k === "metodo" && pa.h[0] === n) x = pa.llamada;
    else if (pa.k === "miembro") x = pa;
    while (x && x.padre && x.padre.k === "sentencia" && x.padre.h[0] === x) x = x.padre;
    return x;
  }
  function quitar(a, b) {
    const e = estructura(), v = e.src, c = E.contexto(e, a, b);
    // Operando de una operación binaria: se va con su operador y queda el otro («pos ?? x» → «pos»).
    if (c && c.binaria && !c.vacio) {
      const [izq, der] = c.binaria.h;
      return c.nodo === der ? reemplazar(izq.b, der.b, "", izq.b) : reemplazar(izq.a, der.a, "", izq.a);
    }
    const sube = c && c.tipo !== "argumento" && c.tipo !== "elemento" ? contenedorNecesario(e, c.nodo) : null;
    if (sube) return quitar(sube.a, sube.b);
    if (c && c.nodo.padre && c.nodo.padre.k === "decl" && c.tipo == null) {   // valor inicial → hueco
      const h = H("valor");
      return reemplazar(a, b, h, a, a + h.length);
    }
    if (c && c.tipo === "argumento" && !c.vacio) {
      const nombre = (cmg.firma(c.funcion) || [])[c.indice];
      if (nombre && !c.hueco) { const h = H(nombre); return reemplazar(a, b, h, a, a + h.length); }
      const ll = c.nodo.padre.k === "metodo" ? c.nodo.padre.llamada : c.nodo.padre, args = ll.args, i = args.indexOf(c.nodo);
      if (i < args.length - 1) return reemplazar(a, args[i + 1].a, "", a);
      if (i > 0) return reemplazar(args[i - 1].b, b, "", args[i - 1].b);
      return reemplazar(a, b, "", a);
    }
    if (c && c.tipo === "condicion") {
      if (c.hueco) return toast("La condición no puede quedar vacía: elige un valor o borra la sentencia.");
      const h = H("condición");
      return reemplazar(a, b, h, a, a + h.length);
    }
    if (sonLineas(a, b)) {
      const [la, lb] = lineasDe(a, b), ini = lb === v.length && la > 0 && !v.endsWith("\n") ? la - 1 : la;
      // El cursor queda al final de la línea anterior: lo siguiente que se inserte cae donde estaba lo borrado.
      const cursor = ini === la && la > 0 ? la - 1 : ini;
      if (significativa) {
        // Un bloque que se queda sin sentencias recibe «pass», elegido para sustituirlo.
        const r = S.rellenar(v.slice(0, ini) + v.slice(lb), ini);
        if (r.crece) { const t = r.texto.slice(ini, ini + r.crece), p = ini + t.indexOf("pass"); return reemplazar(ini, lb, t, p, p + 4); }
      }
      return reemplazar(ini, lb, "", cursor, cursor);
    }
    let x = a, y = b;
    if (v[x - 1] === " " && (v[y] === " " || /[)\],;]/.test(v[y] || "") || y === v.length)) x--;
    else if (v[y] === " " && (x === 0 || /[([\n]/.test(v[x - 1]))) y++;
    reemplazar(x, y, "", x);
  }
  function borrar() {
    if (!editable()) return;
    const [a, b] = sel(), v = $codigo.value;
    if (!activo) {   // con teclado: igual que la tecla de borrar
      if (a !== b) return reemplazar(a, b, "", a);
      return a > 0 && reemplazar(a - 1, a, "", a - 1);
    }
    if (a !== b) return quitar(a, b);
    // Sin selección: el elemento anterior al cursor, o une la línea con la anterior.
    let p = a; while (p > 0 && (v[p - 1] === " " || v[p - 1] === "\t")) p--;
    if (p === 0) return;
    if (v[p - 1] === "\n") return reemplazar(p - 1, a, "", p - 1);
    const t = E.atomo(estructura(), p - 1);
    if (t) quitar(t[0], t[1]);
  }
  // Quita el if/while/for/do que rodea lo elegido y deja su contenido elegido, un nivel menos sangrado.
  function desenvolver() {
    if (!editable()) return;
    const [a, b] = sel(), r = E.desenvolver(estructura(), a, b);
    if (r.motivo) return toast(r.motivo);
    reemplazar(r.a, r.b, r.texto, r.sel[0], r.sel[1]);
  }
  function duplicar() {
    if (!editable()) return;
    const [a, b] = sel(), v = $codigo.value, c = a !== b ? E.contexto(estructura(), a, b) : null;
    if (c && c.tipo === "elemento" && !c.vacio) { const t = v.slice(a, b); return reemplazar(b, b, ", " + t, b + 2, b + 2 + t.length); }
    const [la, lb] = lineasDe(a, b), bloque = v.slice(la, lb);
    if (!bloque.endsWith("\n")) return reemplazar(lb, lb, "\n" + bloque, lb + 1, lb + 1 + bloque.length);
    reemplazar(lb, lb, bloque, lb, lb + bloque.length - 1);
  }
  // Línea nueva bajo el cursor (o bajo lo elegido), ya sangrada; el cursor queda en ella.
  function lineaNueva() {
    if (!editable()) return;
    const [a, b] = sel(), v = $codigo.value, e = estructura();
    const fin = a === b ? E.finLinea(e, E.lineaDe(e, a)) : sinSalto(lineasDe(a, b))[1];
    const ini = v.lastIndexOf("\n", fin - 1) + 1, linea = v.slice(ini, fin);
    const s = linea.trim() ? sangriaDe(linea) + (abreLinea(linea) ? UNIDAD : "") : sangriaEn(v, ini);
    reemplazar(fin, fin, "\n" + s, fin + 1 + s.length);
  }
  function sangrar(dir) {
    if (!editable()) return;
    const [a, b] = sel(), e = estructura(), v = e.src;
    const la = E.inicioLinea(e, E.lineaDe(e, a)), lb = E.finLinea(e, E.lineaDe(e, Math.max(a, b - 1)));
    const texto = v.slice(la, lb).split("\n").map(l => !l.trim() ? l : dir > 0 ? UNIDAD + l : l.replace(new RegExp(`^ {1,${UNIDAD.length}}`), "")).join("\n");
    // Con solo el cursor, el cursor sigue en su sitio de la línea: si se eligiera la línea entera, lo siguiente
    // que se escribiera con el teclado la sustituiría.
    if (a === b) { const p = Math.max(la, a + texto.length - (lb - la)); return reemplazar(la, lb, texto, p, p); }
    reemplazar(la, lb, texto, la, la + texto.length);
  }

  // ---------- Portapapeles ----------
  // En la IP de la red local (sin contexto seguro) el navegador no deja leer el portapapeles del sistema:
  // pegar usa entonces lo último copiado aquí.
  let portapapeles = (() => { try { return sessionStorage.getItem("cmg-portapapeles") || ""; } catch { return ""; } })();
  function guardarCopia(t) { portapapeles = t; try { sessionStorage.setItem("cmg-portapapeles", t); } catch { /* solo en memoria */ } }
  function aSistema(t) {
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).catch(() => {}); return; }
    if (document.activeElement === $codigo && $codigo.value.slice($codigo.selectionStart, $codigo.selectionEnd) === t) { try { document.execCommand("copy"); } catch { /* queda la copia interna */ } return; }
    // Textarea de solo lectura: no abre el teclado del teléfono.
    const antes = document.activeElement, tmp = document.createElement("textarea");
    tmp.value = t; tmp.readOnly = true;
    Object.assign(tmp.style, { position: "fixed", left: "-9999px", top: "0", opacity: "0" });
    vida.portal(tmp); tmp.select(); tmp.setSelectionRange(0, t.length);
    try { document.execCommand("copy"); } catch { /* queda la copia interna */ }
    tmp.remove();
    if (antes && antes !== document.body && antes.focus) antes.focus({ preventScroll: true });
  }
  function copiar(cortar = false) {
    let [a, b] = sel();
    if (a === b) [a, b] = sinSalto(lineasDe(a, a));   // sin selección: la línea
    if (a === b) return toast("No hay nada que copiar.");
    const t = $codigo.value.slice(a, b);
    guardarCopia(t); aSistema(t);
    if (cortar && editable()) { activo ? quitar(a, b) : reemplazar(a, b, "", a); toast("Cortado"); }
    else toast("Copiado");
  }
  async function pegar() {
    if (!editable()) return;
    let t = "";
    if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) { try { t = await navigator.clipboard.readText(); } catch { t = ""; } if (vida.destruida) return; }
    t = t || portapapeles;
    if (!t) return toast("No hay nada copiado.");
    pegarTexto(t);
  }
  // Lo que ocupa líneas se pega como líneas, con la sangría del sitio; lo demás, en la selección.
  function pegarTexto(t) {
    const [a, b] = sel(), v = $codigo.value, e = estructura();
    const lineaVacia = a === b && !v.slice(E.inicioLinea(e, E.lineaDe(e, a)), E.finLinea(e, E.lineaDe(e, a))).trim();
    if (t.includes("\n") && (lineaVacia || sonLineas(a, b))) {
      const [la, lb] = lineaVacia ? [E.inicioLinea(e, E.lineaDe(e, a)), E.finLinea(e, E.lineaDe(e, a))] : sinSalto(lineasDe(a, b));
      // Python: en una línea vacía vale la sangría ya escrita si es un nivel válido (si no hay, la más
      // profunda, como en JS); al sustituir líneas, la de la primera.
      const sangria = !significativa ? sangriaEn(v, la) : !lineaVacia ? sangriaDe(v.slice(la, lb)) : (() => {
        const actual = v.slice(la, lb), ns = S.niveles(v, la);
        return actual && ns.includes(actual) ? actual : ns[0] ?? "";
      })();
      const nuevo = reindentar(t.replace(/\n$/, ""), sangria);
      return reemplazar(la, lb, nuevo, la, la + nuevo.length);
    }
    reemplazar(a, b, t, a, a + t.length);
  }

  // ---------- Vista de bloques ----------
  // Una línea por div y una ficha por span (también los espacios), con su posición en data-a.
  let filas = [], pintado = null;
  function pintarVista() {
    const v = $codigo.value, toks = cmg.lexico(v), lineas = [];
    let linea = "", off = 0;
    toks.forEach((t, i) => {
      const [k, txt] = t;
      if (k === "nl") { lineas.push(linea); linea = ""; off++; return; }
      const cls = k === "esp" ? "e" : (cmg.clasificar(toks, i) || (k === "id" ? "nom" : k));
      txt.split("\n").forEach((parte, j) => {
        if (j) { lineas.push(linea); linea = ""; off++; }
        if (parte) linea += `<span class="${cls}" data-a="${off}">${esc(parte)}</span>`;
        off += parte.length;
      });
    });
    lineas.push(linea);
    $texto.innerHTML = lineas.map((l, i) => `<div class="ln" data-l="${i}">${l}</div>`).join("");
    filas = [];
    let inicio = 0;
    v.split("\n").forEach((l, i) => {
      const el = $texto.children[i];
      filas.push({ a: inicio, b: inicio + l.length, el, piezas: [...el.children].map(s => ({ a: +s.dataset.a, b: +s.dataset.a + s.textContent.length, el: s })) });
      inicio += l.length + 1;
    });
    pintado = v;
  }
  function filaDe(pos) {
    let lo = 0, hi = filas.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (filas[m].a <= pos) lo = m; else hi = m - 1; }
    return filas[lo] || null;
  }
  function puntoDOM(pos) {
    const f = filaDe(pos);
    if (!f) return null;
    for (const p of f.piezas) if (pos >= p.a && pos <= p.b) return [p.el.firstChild, pos - p.a];
    if (!f.piezas.length) return [f.el, 0];
    const u = f.piezas[f.piezas.length - 1];
    return pos < f.piezas[0].a ? [f.piezas[0].el.firstChild, 0] : [u.el.firstChild, u.el.textContent.length];
  }
  function rectsDe(a, b) {
    const p = puntoDOM(a), q = puntoDOM(b);
    if (!p || !q) return [];
    const r = document.createRange();
    r.setStart(...p); r.setEnd(...q);
    return [...r.getClientRects()].filter(x => x.width > 0 || x.height > 0);
  }
  // Un rectángulo por renglón visual: los elementos completos y su texto se repiten en getClientRects.
  function renglones(rects) {
    const out = [];
    for (const r of [...rects].sort((x, y) => x.top - y.top)) {
      const u = out[out.length - 1], c = r.top + r.height / 2;
      if (u && c > u.top && c < u.bottom) { u.left = Math.min(u.left, r.left); u.right = Math.max(u.right, r.right); u.bottom = Math.max(u.bottom, r.bottom); }
      else out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return out;
  }
  function rectCaret(pos) {
    const p = puntoDOM(pos);
    if (!p) return null;
    if (p[0].nodeType !== 3) { const r = p[0].getBoundingClientRect(); return { left: r.left, top: r.top, bottom: r.bottom, height: r.height }; }
    const r = document.createRange();
    r.setStart(...p); r.collapse(true);
    const x = r.getClientRects()[0] || r.getBoundingClientRect();
    return { left: x.left, top: x.top, bottom: x.bottom, height: x.height };
  }
  function caja(cls, l, t, w, h) {
    const base = $in.getBoundingClientRect(), d = document.createElement("div");
    d.className = cls;
    Object.assign(d.style, { left: `${l - base.left}px`, top: `${t - base.top}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px` });
    $capa.append(d);
    return d;
  }
  function pintarSeleccion() {
    if (!activo) return;
    if ($codigo.value !== pintado) pintarVista();
    for (const d of [...$capa.children]) if (!d.classList.contains("destino-b")) d.remove();
    for (const s of $texto.querySelectorAll(".sel")) s.classList.remove("sel");
    const [a, b] = sel();
    if (a === b) { const r = rectCaret(a); if (r) caja("cursor-b", r.left - 1, r.top, 2, r.height); return; }
    // Lo elegido no desplaza la vista al tocarlo: se puede arrastrar con el dedo.
    for (const f of filas) if (f.a <= b && f.b >= a) for (const p of f.piezas) if (p.a < b && p.b > a) p.el.classList.add("sel");
    const rs = renglones(rectsDe(a, b));
    if (!rs.length) return;
    if (sonLineas(a, b)) {
      const t = $texto.getBoundingClientRect(), cs = getComputedStyle($texto), izq = parseFloat(cs.paddingLeft) || 0, der = parseFloat(cs.paddingRight) || 0;
      caja("sel-b lineas", t.left + izq - 4, rs[0].top, t.width - izq - der + 8, rs[rs.length - 1].bottom - rs[0].top);
      return;
    }
    for (const r of rs) caja("sel-b", r.left - 2, r.top, r.right - r.left + 4, r.bottom - r.top);
  }
  function mostrarRango(pos) {
    const r = rectCaret(pos), v = $vista.getBoundingClientRect();
    if (!r) return;
    if (r.top < v.top + 8) $vista.scrollTop -= v.top + 8 - r.top;
    else if (r.bottom > v.bottom - 8) $vista.scrollTop += r.bottom - v.bottom + 8;
  }
  // Posición del texto bajo el puntero: el carácter dentro de una ficha o el borde más cercano.
  const distY = (r, y) => y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
  function enPieza(span, x, y, caracter) {
    const t = span.firstChild;
    if (!t) return 0;
    const r = document.createRange();
    let mejor = 0, dist = Infinity;
    for (let i = 0; i < t.length + (caracter ? 0 : 1); i++) {
      r.setStart(t, i); r.setEnd(t, caracter ? i + 1 : i);
      const c = r.getClientRects()[0] || r.getBoundingClientRect();
      const d = distY(c, y) * 1000 + (caracter ? (x < c.left ? c.left - x : x > c.right ? x - c.right : 0) : Math.abs(c.left - x));
      if (d < dist) { dist = d; mejor = i; }
    }
    return mejor;
  }
  function posEn(x, y) {
    const el = document.elementFromPoint(x, y);
    const pieza = el && el.closest && el.closest("#bloques-texto span[data-a]");
    if (pieza) return +pieza.dataset.a + enPieza(pieza, x, y, false);
    const ln = el && el.closest && el.closest("#bloques-texto .ln");
    let mejor = null, dist = Infinity;
    for (const f of ln ? [filas[+ln.dataset.l]] : filas) {
      if (!f) continue;
      if (!f.piezas.length) { const d = distY(f.el.getBoundingClientRect(), y) * 1000; if (d < dist) { dist = d; mejor = f.a; } continue; }
      for (const p of f.piezas) for (const r of p.el.getClientRects()) {
        const d = distY(r, y) * 1000 + (x < r.left ? r.left - x : x > r.right ? x - r.right : 0);
        if (d < dist) { dist = d; mejor = x <= r.left ? p.a : x >= r.right ? p.b : p.a + enPieza(p.el, x, y, false); }
      }
    }
    return mejor ?? 0;
  }
  // Lo que hay bajo el puntero: una ficha (con el carácter exacto) o un hueco entre fichas.
  function objetivo(x, y) {
    const el = document.elementFromPoint(x, y);
    const pieza = el && el.closest && el.closest("#bloques-texto span[data-a]");
    if (pieza && !pieza.classList.contains("e")) return { pos: +pieza.dataset.a + enPieza(pieza, x, y, true), ficha: true };
    return { pos: posEn(x, y), ficha: false };
  }

  // ---------- Toques: elegir, ampliar con doble toque y arrastrar ----------
  const DOBLE_MS = 380, LARGO_MS = 430;
  let gesto = null, ultimoToque = null, tSimple = 0, pendiente = null;
  // Un botón (barra, paleta, sugerencias…) actúa sobre lo último que se tocó: la elección que esperaba
  // un posible doble toque se aplica ya. Un cambio de texto la anula, su posición ya no vale.
  function resolverPendiente() {
    vida.clearTimeout(tSimple); tSimple = 0;
    const o = pendiente; pendiente = null;
    if (o) simple(o, false);
  }
  vida.escuchar(document, "pointerdown", (ev) => { if (pendiente && !$vista.contains(ev.target)) resolverPendiente(); }, true);
  vida.escuchar($codigo, "input", () => { vida.clearTimeout(tSimple); tSimple = 0; pendiente = null; });
  const $fantasma = document.createElement("div");
  $fantasma.className = "fantasma-bloque"; $fantasma.hidden = true; $fantasma.setAttribute("aria-hidden", "true");
  vida.portal($fantasma);
  vida.escuchar($vista, "pointerdown", (ev) => {
    if (!activo || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    if (ev.pointerType === "mouse") { ev.preventDefault(); $vista.focus({ preventScroll: true }); }
    const o = objetivo(ev.clientX, ev.clientY), [a, b] = sel();
    gesto = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, o, antes: [a, b], dentro: a < b && o.pos >= a && o.pos < b, raton: ev.pointerType === "mouse" };
    // Con el dedo, una ficha sin elegir se levanta manteniéndola pulsada (si no, el dedo desplaza la vista).
    if (!gesto.raton && !gesto.dentro && o.ficha) gesto.largo = vida.setTimeout(levantar, LARGO_MS);
    // Con el dedo quieto 2 s se abre el menú de alternativas (como el clic derecho).
    if (!gesto.raton) { ultimoTactil = performance.now(); programarMenu(gesto); }
  });
  function levantar() {
    if (!gesto || gesto.arrastre) return;
    const r = E.atomo(estructura(), gesto.o.pos);
    if (!r) return;
    elegir(r[0], r[1]);
    Object.assign(gesto, { levantado: true, antes: r, dentro: true });
    if (navigator.vibrate) navigator.vibrate(10);
  }
  vida.escuchar(window, "pointermove", (ev) => {
    if (!gesto || ev.pointerId !== gesto.id) return;
    if (gesto.arrastre) { gesto.arrastre.x = ev.clientX; gesto.arrastre.y = ev.clientY; moverArrastre(ev.clientX, ev.clientY); return; }
    if (Math.hypot(ev.clientX - gesto.x, ev.clientY - gesto.y) < (gesto.raton ? 5 : 9)) return;
    vida.clearTimeout(gesto.largo);
    cancelarMenu(gesto);
    if (gesto.lineas) return iniciarArrastre(ev, gesto.lineas, true);
    if (gesto.raton || gesto.dentro || gesto.levantado) {
      const r = gesto.dentro ? gesto.antes : E.atomo(estructura(), gesto.o.pos);
      if (!r || r[0] === r[1]) { gesto = null; return; }
      if (!gesto.dentro) elegir(r[0], r[1]);
      return sonLineas(r[0], r[1]) ? iniciarArrastre(ev, lineasDe(r[0], r[1]), true) : iniciarArrastre(ev, r, false);
    }
    gesto = null;   // el dedo desplaza la vista
  });
  vida.escuchar(window, "pointerup", (ev) => {
    if (!gesto || ev.pointerId !== gesto.id) return;
    vida.clearTimeout(gesto.largo);
    cancelarMenu(gesto);
    const g = gesto; gesto = null;
    if (g.arrastre) return soltar(ev, g.arrastre);
    if (g.lineas) return elegir(...sinSalto(g.lineas));   // toque en un asa: elige la sentencia de esa línea
    if (!g.levantado) toque(g, ev);
  });
  vida.escuchar(window, "pointercancel", (ev) => {
    if (!gesto || ev.pointerId !== gesto.id) return;
    vida.clearTimeout(gesto.largo);
    cancelarMenu(gesto);
    if (gesto.arrastre) terminarArrastre();
    gesto = null;
  });
  // Con la ficha levantada el dedo arrastra en vez de desplazar.
  vida.escuchar($vista, "touchmove", (ev) => { if (gesto && (gesto.arrastre || gesto.levantado)) ev.preventDefault(); }, { passive: false });
  // Clic derecho: alternativas del elemento. La pulsación larga del dedo dispara también «contextmenu»
  // en Android; ahí manda el temporizador de 2 s, no el menú del sistema.
  let ultimoTactil = -1e9;
  vida.escuchar($vista, "contextmenu", (ev) => {
    if (!activo) return;
    ev.preventDefault();
    if (performance.now() - ultimoTactil < 2500 || ev.pointerType === "touch") return;
    $vista.focus({ preventScroll: true });
    abrirAlternativas(objetivo(ev.clientX, ev.clientY).pos);
  });

  // Anillo que se llena mientras el dedo sigue quieto: el primer segundo no pasa nada,
  // el segundo se llena el círculo y al completarlo se abre la lista.
  const MENU_MS = 2000, ANILLO_MS = 1000;
  const $anillo = document.createElement("div");
  $anillo.className = "anillo-carga"; $anillo.hidden = true; $anillo.setAttribute("aria-hidden", "true");
  $anillo.innerHTML = `<svg viewBox="0 0 48 48"><circle class="fondo" cx="24" cy="24" r="19"/><circle class="relleno" cx="24" cy="24" r="19"/></svg>`;
  vida.portal($anillo);
  function mostrarAnillo(x, y, ms) {
    $anillo.style.setProperty("--dur", `${ms}ms`);
    $anillo.style.transform = `translate(${Math.round(x - 26)}px, ${Math.round(Math.max(4, y - 92))}px)`;
    $anillo.hidden = false;
    $anillo.classList.remove("llena"); void $anillo.offsetWidth; $anillo.classList.add("llena");
  }
  function ocultarAnillo() { $anillo.hidden = true; $anillo.classList.remove("llena"); }
  function programarMenu(g) {
    g.anilloT = vida.setTimeout(() => { if (gesto === g && !g.arrastre) mostrarAnillo(g.x, g.y, MENU_MS - ANILLO_MS); }, ANILLO_MS);
    g.menuT = vida.setTimeout(() => {
      if (gesto !== g || g.arrastre) return;
      vida.clearTimeout(g.largo); ocultarAnillo();
      gesto = null;
      if (navigator.vibrate) navigator.vibrate(15);
      abrirAlternativas(g.o.pos);
    }, MENU_MS);
  }
  function cancelarMenu(g) { if (!g) return; vida.clearTimeout(g.anilloT); vida.clearTimeout(g.menuT); ocultarAnillo(); }

  // Un toque elige el elemento entero; el doble toque amplía hasta el siguiente límite semántico.
  // Un toque dentro de lo elegido espera un momento por si llega el segundo, así ampliar no parpadea.
  function toque(g, ev) {
    const ahora = performance.now();
    const doble = ultimoToque && ahora - ultimoToque.t < DOBLE_MS && Math.hypot(ev.clientX - ultimoToque.x, ev.clientY - ultimoToque.y) < 26;
    vida.clearTimeout(tSimple); pendiente = null;
    if (doble) {
      const base = ultimoToque.base;
      ultimoToque = { t: ahora, x: ev.clientX, y: ev.clientY, base: null };
      if (base && base[0] < base[1] && g.o.pos >= base[0] && g.o.pos < base[1]) $codigo.setSelectionRange(...base);
      const [a, b] = sel();
      if (a === b || g.o.pos < a || g.o.pos >= b) { const t = E.atomo(estructura(), g.o.pos); if (t) $codigo.setSelectionRange(...t); }
      pila.length = 0;
      return ampliar();
    }
    ultimoToque = { t: ahora, x: ev.clientX, y: ev.clientY, base: g.antes };
    const [a, b] = g.antes, shift = ev.shiftKey;
    if (a < b && g.o.pos >= a && g.o.pos < b && !shift) { pendiente = g.o; tSimple = vida.setTimeout(resolverPendiente, DOBLE_MS); return; }
    simple(g.o, shift);
  }
  function simple(o, extender) {
    const t = o.ficha ? E.atomo(estructura(), o.pos) : null, r = t || [o.pos, o.pos];
    if (extender) { const [a, b] = sel(); return elegir(Math.min(a, r[0]), Math.max(b, r[1])); }
    elegir(r[0], r[1]);
  }

  // Arrastrar: los valores se copian sobre un hueco, un argumento o dentro de ( ) y [ ];
  // las sentencias y líneas completas se mueven entre líneas (con Alt o Ctrl, se copian).
  function iniciarArrastre(ev, [a, b], lineas) {
    if (!editable() || a === b) { gesto = null; return; }
    cancelarMenu(gesto);
    const v = $codigo.value;
    gesto.arrastre = { a, b, texto: v.slice(a, b), lineas, x: ev.clientX, y: ev.clientY, tactil: ev.pointerType !== "mouse", destino: null };
    const t = v.slice(a, b).replace(/\n$/, ""), primera = t.split("\n")[0].trim();
    $fantasma.textContent = primera.length > 42 ? primera.slice(0, 40) + "…" : primera + (t.includes("\n") ? " …" : "");
    $fantasma.hidden = false;
    $editor.classList.add("arrastrando");
    cerrarSugerencias();
    moverArrastre(ev.clientX, ev.clientY);
    autoDesplazar();
  }
  function moverArrastre(x, y) {
    const d = gesto.arrastre, r = $vista.getBoundingClientRect(), ed = $editor.getBoundingClientRect();
    $fantasma.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y - (d.tactil ? 48 : 18))}px)`;
    // Todo el editor cuenta: número de línea, código y columna de asas.
    const dentro = x >= ed.left - 10 && x <= ed.right + 10 && y >= r.top - 4 && y <= r.bottom + 4;
    d.destino = !dentro ? null : d.lineas ? destinoLineas(y, d, x) : destinoValor(x, y, d);
    pintarDestino(d);
  }
  // Python: en el hueco elegido, el nivel cuya columna queda más cerca del puntero.
  let medida = null;
  function anchoCaracter() {
    if (medida) return medida;
    const c = document.createElement("canvas").getContext("2d"), cs = getComputedStyle($texto);
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return (medida = c.measureText("0000000000").width / 10 || 8);
  }
  vida.escuchar($codigo, "cmg:medido", () => { medida = null; });
  function nivelArrastre(d, l, x) {
    const v = $codigo.value, e = estructura(), destino = l < e.lineas.length ? e.lineas[l] : v.length;
    const { resto, crece } = sinLineas(v, d.a, d.b, false);
    let pos = destino < d.a ? destino : destino - (d.b - d.a);
    if (destino >= d.b) pos += crece;
    const ns = nivelesEn(resto, Math.min(pos, resto.length));
    if (!ns.length) return null;
    const x0 = $texto.getBoundingClientRect().left + (parseFloat(getComputedStyle($texto).paddingLeft) || 0), w = anchoCaracter();
    let mejor = 0;
    ns.forEach((n, i) => { if (Math.abs(x - (x0 + n.length * w)) < Math.abs(x - (x0 + ns[mejor].length * w))) mejor = i; });
    return { nivel: ns[mejor], xNivel: x0 + ns[mejor].length * w };
  }
  function destinoLineas(y, d, x) {
    const e = estructura(), l0 = E.lineaDe(e, d.a), l1 = E.lineaDe(e, Math.max(d.a, d.b - 1)) + 1;
    let mejor = null;
    for (let l = 0; l <= filas.length; l++) {
      const yl = l < filas.length ? filas[l].el.getBoundingClientRect().top : filas[filas.length - 1].el.getBoundingClientRect().bottom;
      if (!mejor || Math.abs(y - yl) < Math.abs(y - mejor.y)) mejor = { tipo: "linea", l, y: yl };
    }
    if (!mejor) return null;
    if (significativa) {
      const n = nivelArrastre(d, mejor.l, x);
      if (!n) return { ...mejor, valido: false };
      if (mejor.l >= l0 && mejor.l <= l1 && n.nivel === sangriaDe($codigo.value.slice(d.a, d.b))) return { ...mejor, nulo: true };
      return { ...mejor, ...n, valido: true };
    }
    if (mejor.l >= l0 && mejor.l <= l1) return { ...mejor, nulo: true };   // en su propio sitio
    return { ...mejor, valido: E.fronteraValida(e, mejor.l) };
  }
  function destinoValor(x, y, d) {
    const o = objetivo(x, y), ch = $codigo.value[o.pos];
    // Sobre un paréntesis o corchete que abre, el valor cae dentro.
    const pos = o.ficha && (ch === "(" || ch === "[") ? o.pos + 1 : o.pos;
    if (pos >= d.a && pos <= d.b) return null;
    const t = E.destino(estructura(), pos);
    if (!t) return { tipo: "insertar", a: pos, b: pos, valido: false };
    if (t.a < d.b && t.b > d.a) return null;
    return { ...t, valido: true };
  }
  function pintarDestino(d) {
    for (const x of $capa.querySelectorAll(".destino-b")) x.remove();
    const t = d.destino;
    $fantasma.classList.toggle("no", !!t && t.valido === false);
    if (!t || t.nulo) return;
    if (t.tipo === "linea") { const r = $texto.getBoundingClientRect(), x = t.xNivel != null ? Math.max(r.left + 4, t.xNivel) : r.left + 4; caja(`destino-b linea${t.valido ? "" : " no"}`, x, t.y - 1.5, r.right - 4 - x, 3); return; }
    if (t.tipo === "reemplazar") { for (const r of renglones(rectsDe(t.a, t.b))) caja("destino-b hueco", r.left - 3, r.top - 1, r.right - r.left + 6, r.bottom - r.top + 2); return; }
    const c = rectCaret(t.a);
    if (c) caja(`destino-b cursor${t.valido ? "" : " no"}`, c.left - 1.5, c.top, 3, c.height);
  }
  function soltar(ev, d) {
    terminarArrastre();
    const t = d.destino;
    if (!t || t.nulo || t.valido === false || !editable()) return;
    if (d.lineas) return moverLineasA(d.a, d.b, t.l, ev.altKey || ev.ctrlKey || ev.metaKey, t.nivel ?? null);
    // Un valor se duplica: el original se queda donde estaba.
    if (t.tipo === "reemplazar") return reemplazar(t.a, t.b, d.texto, t.a, t.a + d.texto.length);
    const ins = t.vacio || t.lista ? E.enLista($codigo.value, t.a, t.b, d.texto) : d.texto, ini = t.a + ins.indexOf(d.texto);
    reemplazar(t.a, t.b, ins, ini, ini + d.texto.length);
  }
  let rafDesplazar = 0;
  function terminarArrastre() {
    $fantasma.hidden = true;
    $editor.classList.remove("arrastrando");
    for (const x of $capa.querySelectorAll(".destino-b")) x.remove();
    vida.cancelAnimationFrame(rafDesplazar);
  }
  // Cerca de los bordes de la vista, el arrastre la desplaza.
  function autoDesplazar() {
    vida.cancelAnimationFrame(rafDesplazar);
    const paso = () => {
      if (!gesto || !gesto.arrastre) return;
      const r = $vista.getBoundingClientRect(), { x, y } = gesto.arrastre, borde = 34;
      const v = y < r.top + borde ? y - r.top - borde : y > r.bottom - borde ? y - r.bottom + borde : 0;
      if (v) { $vista.scrollTop += Math.max(-16, Math.min(16, v * 0.4)); moverArrastre(x, y); }
      rafDesplazar = vida.requestAnimationFrame(paso);
    };
    rafDesplazar = vida.requestAnimationFrame(paso);
  }
  // Palabras arrastradas desde el inspector (arrastre nativo del navegador en PC).
  vida.escuchar($vista, "dragover", (ev) => {
    if (!activo || $codigo.readOnly || !ev.dataTransfer.types.includes("text/plain")) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = "copy";
  });
  vida.escuchar($vista, "drop", (ev) => {
    if (!activo) return;
    ev.preventDefault();
    $editor.classList.remove("soltar");
    const texto = ev.dataTransfer.getData("text/plain");
    if (!texto || !editable()) return;
    const t = destinoValor(ev.clientX, ev.clientY, { a: -1, b: -1 });
    if (t && t.valido) soltar(ev, { texto, lineas: false, destino: t });
    else { const p = posEn(ev.clientX, ev.clientY); reemplazar(p, p, texto, p, p + texto.length); }
  });

  // ---------- Asas de línea: en el número o en el borde derecho ----------
  function iniciarAsa(ev, l) {
    if (!activo || l < 0) return;
    ev.preventDefault();
    const u = E.unidadLinea(estructura(), l);
    if (u[0] === u[1]) return;
    gesto = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, raton: ev.pointerType === "mouse", lineas: u, o: { pos: u[0] }, antes: sel() };
  }
  vida.escuchar($gutter, "pointerdown", (ev) => {
    if (!activo || asa !== "numero" || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    const d = ev.target.closest(".gutter-in > div");
    if (d) iniciarAsa(ev, [...$gutter.children].indexOf(d));
  });
  vida.escuchar($asasIn, "pointerdown", (ev) => {
    const d = ev.target.closest("[data-l]");
    if (d && !(ev.pointerType === "mouse" && ev.button !== 0)) iniciarAsa(ev, +d.dataset.l);
  });
  function pintarAsas() {
    if (!activo || asa !== "borde") { $asasIn.innerHTML = ""; return; }
    $asasIn.innerHTML = filas.map((f, i) => $codigo.value.slice(f.a, f.b).trim()
      ? `<div class="asa" data-l="${i}" style="top:${f.el.offsetTop}px" title="Arrastra la línea ${i + 1}"></div>` : "").join("");
    $asasIn.style.transform = `translateY(${-$vista.scrollTop}px)`;
  }
  vida.escuchar($vista, "scroll", () => {
    cmg.alDesplazar();
    $asasIn.style.transform = `translateY(${-$vista.scrollTop}px)`;
    if (!$sug.hidden) colocarSugerencias();
  }, { passive: true });

  // ---------- Sugerencias ----------
  // Al elegir un hueco /* … */, un argumento vacío o (sin teclado) un valor de una llamada conocida,
  // aparece la lista de valores posibles sacada de los datos de la máquina (juego.js: cmg.sugerencias).
  const $sug = document.createElement("div");
  $sug.className = "sugerencias"; $sug.hidden = true; $sug.setAttribute("role", "listbox");
  vida.portal($sug);
  let sugerido = null, sinSugerir = "", versionSug = 0;
  const claveSel = () => `${$codigo.selectionStart}:${$codigo.selectionEnd}:${$codigo.value.length}`;
  const editorVisible = () => $editor.getClientRects().length > 0 && $editor.getBoundingClientRect().height > 20;
  // Varias peticiones seguidas se resuelven una vez, al terminar la tarea actual (insertar() fija
  // la selección después de su evento input). Cerrar la lista anula las pendientes.
  function actualizarSugerencias() {
    const v = ++versionSug;
    vida.queueMicrotask(() => {
      if (v !== versionSug || (gesto && gesto.arrastre)) return;
      if ($codigo.readOnly || !editorVisible() || (!activo && document.activeElement !== $codigo)) return cerrarSugerencias();
      if (sinSugerir === claveSel()) return;
      const [a, b] = sel(), e = estructura(), c = E.contexto(e, a, b);
      if (!c || !(c.hueco || c.vacio || (activo && c.hoja && c.tipo))) return cerrarSugerencias();
      const numero = activo && c.nodo.k === "num";
      const datos = cmg.sugerencias({ tipo: c.tipo, funcion: c.funcion, objeto: c.objeto, indice: c.indice, hueco: c.hueco, variables: variables(e, a) });
      if (!datos && !numero) return cerrarSugerencias();
      abrirSugerencias(datos || { titulo: "Número", grupos: [] }, a, b, c, numero);
    });
  }
  function abrirSugerencias(datos, a, b, c, numero) {
    const items = [];
    let html = `<div class="sug-cab"><b>${esc(datos.titulo)}</b>${datos.donde ? `<span>${esc(datos.donde)}</span>` : ""}<button type="button" class="sug-x" data-cerrar aria-label="Cerrar sugerencias">×</button></div>`;
    if (numero) html += `<div class="sug-num"><button type="button" data-paso="-1" aria-label="Restar">−</button><code class="num">${esc($codigo.value.slice(a, b))}</code><button type="button" data-paso="1" aria-label="Sumar">+</button></div>`;
    for (const g of datos.grupos) {
      if (!g.items.length) continue;
      if (g.titulo) html += `<div class="sug-g">${esc(g.titulo)}</div>`;
      for (const it of g.items) {
        html += `<button type="button" class="sug" role="option" data-i="${items.length}"><code class="${esc(it.cls || "")}">${esc(it.ver || it.ins)}</code>${it.nota ? `<span class="nota">${esc(it.nota)}</span>` : ""}</button>`;
        items.push(it);
      }
    }
    html += `<button type="button" class="sug escribir" data-escribir>✎ Escribir otro valor…</button>`;
    $sug.innerHTML = html;
    $sug.setAttribute("aria-label", `Valores para ${datos.titulo.toLowerCase()}`);
    sugerido = { a, b, c, items, activo: -1 };
    $sug.hidden = false;
    colocarSugerencias(true);
  }
  function cerrarSugerencias() { versionSug++; if (!$sug.hidden) { $sug.hidden = true; $sug.innerHTML = ""; } sugerido = null; }
  const METRICAS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariantLigatures", "fontFeatureSettings", "lineHeight",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize", "letterSpacing"];
  // Rectángulo de [a, b) en pantalla: de la vista de bloques o, con teclado, de un espejo del textarea.
  function rectDe(a, b) {
    if (activo) {
      const rs = renglones(a === b ? [rectCaret(a)].filter(Boolean).map(r => ({ ...r, width: 1, right: r.left + 1 })) : rectsDe(a, b));
      return rs.length ? { left: rs[0].left, top: rs[0].top, bottom: rs[rs.length - 1].bottom } : null;
    }
    const cs = getComputedStyle($codigo), r = $codigo.getBoundingClientRect(), espejo = document.createElement("div"), v = $codigo.value, marca = document.createElement("span");
    for (const k of METRICAS) espejo.style[k] = cs[k];
    Object.assign(espejo.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${$codigo.clientWidth}px`, height: `${$codigo.clientHeight}px`, overflow: "hidden", visibility: "hidden", pointerEvents: "none" });
    marca.textContent = v.slice(a, b) || "​";
    espejo.append(document.createTextNode(v.slice(0, a)), marca, document.createTextNode(v.slice(b)));
    vida.portal(espejo);
    espejo.scrollTop = $codigo.scrollTop;
    const rs = marca.getClientRects(), res = rs.length ? { left: rs[0].left, top: rs[0].top, bottom: rs[rs.length - 1].bottom } : null;
    espejo.remove();
    return res;
  }
  function colocarSugerencias(desplazar = false) {
    if (!sugerido) return;
    const r = rectDe(sugerido.a, sugerido.b), cont = $editor.getBoundingClientRect();
    if (!r || r.bottom < cont.top || r.top > cont.bottom) { $sug.style.visibility = "hidden"; return; }
    $sug.style.visibility = "";
    // Nunca tapa la paleta ni la barra de edición: se siguen pudiendo usar con la lista abierta. Encima del
    // código (PC) marcan el techo; debajo (teléfono, junto al teclado), el suelo.
    const vv = window.visualViewport, barras = [$barra, $("paleta")].filter(x => x.getClientRects().length).map(x => x.getBoundingClientRect());
    // Tampoco sube por encima del código: la barra superior y el mapa quedan libres.
    const enCodigo = cont.top + cont.height / 2, simbolos = $("simbolos");
    const techo = Math.max(vv ? vv.offsetTop : 0, cont.top - 8, ...barras.filter(b => b.bottom <= enCodigo).map(b => b.bottom)) + 4;
    const altoSimbolos = simbolos && !simbolos.hidden && app.classList.contains("teclado") ? 46 : 0;
    const suelo = Math.min((vv ? vv.offsetTop + vv.height : innerHeight) - altoSimbolos, ...barras.filter(b => b.top >= enCodigo).map(b => b.top)) - 4;
    $sug.classList.remove("hoja", "compacta");
    $sug.style.maxHeight = ""; $sug.style.width = "";
    let m = $sug.getBoundingClientRect(), x, y, max;
    const abajo = suelo - r.bottom - 6, arriba = r.top - 6 - techo, lado = cont.right - r.right - 10;
    const minimo = Math.min(m.height, 110);   // la cabecera y dos opciones
    if (lado >= m.width && suelo - techo >= minimo) {
      // A la derecha de lo elegido, si cabe: no tapa las líneas siguientes.
      max = Math.min(320, suelo - techo);
      x = r.right + 10;
      y = Math.max(techo, Math.min(suelo - Math.min(m.height, max), r.top - 8));
    } else if (Math.max(abajo, arriba) >= minimo) {
      // Debajo mientras quepan unas cuantas opciones; si no, encima. Nunca fuera de la pantalla.
      // Si sobra sitio deja a la vista la línea vecina, la que más a menudo se toca después.
      const enAbajo = abajo >= Math.min(m.height, 130) || abajo >= arriba;
      const libre = enAbajo ? abajo : arriba, linea = Math.min(r.bottom - r.top, 26), salto = libre - linea >= minimo ? linea : 0;
      max = Math.min(320, libre - salto);
      x = Math.max(6, Math.min(innerWidth - m.width - 6, r.left - 8));
      y = enAbajo ? r.bottom + 6 + salto : Math.max(techo, r.top - 6 - salto - Math.min(m.height, max));
    } else {
      // Sin sitio junto a la selección (teléfono): hoja apoyada en el borde inferior. Deja libre la
      // columna de asas de línea (números o borde derecho) para poder elegir una línea con la lista abierta.
      $sug.classList.add("hoja");
      // Con cabecera y grupos, 110 px no garantizan dos opciones. En una hoja
      // muy baja se omiten los títulos de grupo, conservando todos sus valores.
      $sug.classList.toggle("compacta", suelo - techo < 160);
      const izq = activo && asa === "numero" ? $gutter.getBoundingClientRect().right + 2 : 6;
      const der = activo && asa === "borde" ? $asas.getBoundingClientRect().left - 2 : innerWidth - 6;
      $sug.style.width = `${Math.round(der - izq)}px`;
      m = $sug.getBoundingClientRect();
      max = Math.min(320, Math.max(minimo, suelo - techo));
      x = izq;
      y = suelo - Math.min(m.height, max);
      // Si la vista de bloques puede desplazarse, sube lo elegido (como mucho hasta el borde superior
      // de la vista) y vuelve a colocar la lista: suele caber ya debajo, sin tapar la línea.
      const tapa = r.bottom + 6 - y, margen = $vista.scrollHeight - $vista.clientHeight - $vista.scrollTop;
      const paso = Math.min(tapa, margen, r.top - $vista.getBoundingClientRect().top - 8);
      if (activo && desplazar && paso > 0) { $vista.scrollTop += paso; return colocarSugerencias(); }
    }
    $sug.style.maxHeight = `${max}px`;
    $sug.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function siguienteHueco(desde) {
    const v = $codigo.value, fin = v.indexOf("\n", desde) < 0 ? v.length : v.indexOf("\n", desde);
    const re = new RegExp(cmg.reHueco.source, "g");
    re.lastIndex = desde;
    const m = re.exec(v);
    return m && m.index < fin ? [m.index, m.index + m[0].length] : null;
  }
  function ponerValor(texto) {
    if (!sugerido || !editable()) return;
    const { a, b, c } = sugerido, ins = c.vacio ? E.enLista($codigo.value, a, b, texto) : texto;
    const ini = a + ins.indexOf(texto), fin = ini + texto.length;
    cerrarSugerencias();
    reemplazar(a, b, ins, ini, fin);
    // Plantillas con huecos (operadores): queda elegido el primero.
    const h = texto.search(cmg.reHueco);
    if (h >= 0) return elegir(ini + h, ini + h + texto.slice(h).match(cmg.reHueco)[0].length);
    // Si la sentencia tiene otro hueco, se sigue rellenando.
    const s = siguienteHueco(fin);
    if (s) return elegir(s[0], s[1], { mostrar: true });
    if (activo) { elegir(ini, fin); sinSugerir = claveSel(); cerrarSugerencias(); }
    else elegir(fin, fin);
  }
  function pasoNumero(dir) {
    if (!sugerido) return;
    const { a, b } = sugerido, t = $codigo.value.slice(a, b), n = Number(t);
    if (!Number.isFinite(n)) return;
    const paso = /[.eE]/.test(t) || Math.abs(n) < 1 ? 0.05 : 1, nuevo = String(Math.round((n + dir * paso) * 1000) / 1000);
    reemplazar(a, b, nuevo, a, a + nuevo.length);
  }
  function escribirValor() {
    if (!sugerido) return;
    const actual = $codigo.value.slice(sugerido.a, sugerido.b), valor = sugerido.c.hueco || sugerido.c.vacio ? "" : actual;
    $sug.innerHTML = `<form class="sug-escribir"><label>Valor<input type="text" value="${esc(valor)}" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></label><button class="btn chico" type="submit">Poner</button></form>`;
    const input = $sug.querySelector("input");
    input.focus(); input.select();
    vida.escuchar($sug.querySelector("form"), "submit", (ev) => { ev.preventDefault(); if (input.value.trim()) ponerValor(input.value.trim()); else cerrarSugerencias(); });
    colocarSugerencias();
  }
  function marcarActivo() {
    $sug.querySelectorAll(".sug[data-i]").forEach(x => x.classList.toggle("activa", +x.dataset.i === sugerido.activo));
    const x = $sug.querySelector(".sug.activa");
    if (x) x.scrollIntoView({ block: "nearest" });
  }
  // Teclado (PC): flechas recorren la lista, Intro o Tab ponen el valor, Escape la cierra.
  function teclaSugerencias(ev) {
    if ($sug.hidden || !sugerido || !sugerido.items.length || ev.target.closest && ev.target.closest(".sugerencias")) return false;
    const n = sugerido.items.length, hecho = () => { ev.preventDefault(); ev.stopImmediatePropagation(); return true; };
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      const d = ev.key === "ArrowDown" ? 1 : -1;
      sugerido.activo = sugerido.activo < 0 ? (d > 0 ? 0 : n - 1) : (sugerido.activo + d + n) % n;
      marcarActivo(); return hecho();
    }
    if ((ev.key === "Enter" && sugerido.activo >= 0) || ev.key === "Tab") { ponerValor(sugerido.items[Math.max(0, sugerido.activo)].ins); return hecho(); }
    if (ev.key === "Escape") { sinSugerir = claveSel(); cerrarSugerencias(); return hecho(); }
    return false;
  }
  // Un clic solo cuenta si la pulsación empezó en la lista: en el teléfono la hoja puede abrirse bajo
  // el dedo que eligió el hueco, y el clic de ese mismo toque elegiría la opción de debajo.
  let pulsadoEnSug = false;
  vida.escuchar($sug, "pointerdown", (ev) => { pulsadoEnSug = true; if (!ev.target.closest("input, label")) ev.preventDefault(); });
  vida.escuchar($sug, "click", (ev) => {
    if (ev.detail && !pulsadoEnSug) return;   // detail 0: activado con el teclado
    pulsadoEnSug = false;
    if (ev.target.closest("[data-cerrar]")) { sinSugerir = claveSel(); return cerrarSugerencias(); }
    const p = ev.target.closest("[data-paso]");
    if (p) return pasoNumero(+p.dataset.paso);
    if (ev.target.closest("[data-escribir]")) return escribirValor();
    const s = ev.target.closest(".sug[data-i]");
    if (s && sugerido) ponerValor(sugerido.items[+s.dataset.i].ins);
  });
  vida.escuchar(document, "pointerdown", (ev) => {
    pulsadoEnSug = false;
    if (!$sug.hidden && !$sug.contains(ev.target) && !$vista.contains(ev.target) && ev.target !== $codigo) cerrarSugerencias();
  }, true);
  for (const tipo of ["select", "keyup", "pointerup", "focus"]) vida.escuchar($codigo, tipo, () => { if (!activo) actualizarSugerencias(); });
  vida.escuchar(document, "selectionchange", () => { if (!activo && document.activeElement === $codigo) actualizarSugerencias(); });
  vida.escuchar($codigo, "blur", () => vida.setTimeout(() => { if (!activo && document.activeElement !== $codigo && !$sug.contains(document.activeElement)) cerrarSugerencias(); }, 120));
  vida.escuchar(window, "resize", () => { if (sugerido) colocarSugerencias(); });
  if (window.visualViewport) vida.escuchar(visualViewport, "resize", () => { if (sugerido) colocarSugerencias(); });

  // ---------- Alternativas: clic derecho o mantener 2 s (sin teclado) ----------
  // Otros elementos del mismo tipo que el elegido, o lo que encaja en su sitio: sobre una función, todas
  // las funciones; sobre un operador, los de su familia; dentro de ( ), [ ] o { }, lo que cabe ahí.
  const FAMILIAS = L.familias || [
    ["Comparar", [["===", "igual"], ["!==", "distinto"], [">", "mayor"], ["<", "menor"], [">=", "mayor o igual"], ["<=", "menor o igual"]]],
    ["Combinar", [["&&", "y · se cumplen las dos"], ["||", "o · basta una"], ["??", "si no hay, usa el otro"]]],
    ["Calcular", [["+", "suma"], ["-", "resta"], ["*", "multiplica"], ["/", "divide"], ["%", "resto"]]],
    ["Asignar", [["=", "guarda"], ["+=", "suma y guarda"], ["-=", "resta y guarda"], ["*=", "multiplica y guarda"], ["??=", "solo si no hay"]]],
  ];
  const DECLARA = L.declara || [["const", "no cambia"], ["let", "puede cambiar"]];
  const LITERALES = L.literales || [["true", "verdadero"], ["false", "falso"], ["null", "nada"]];
  const opc = (ins, cls, nota, ver) => ({ ins, cls, nota, ver });
  const funcionesDisponibles = () => (cmg.funciones ? cmg.funciones() : []) || [];
  // Agrupa por el título que da el juego (lanzador, console, sensores…).
  function gruposFunciones(lista, item) {
    const g = new Map();
    for (const f of lista) { const t = f.grupo || ""; if (!g.has(t)) g.set(t, []); g.get(t).push(item(f)); }
    return [...g].map(([titulo, items]) => ({ titulo, items }));
  }
  function alternativas(pos) {
    const e = estructura(), v = e.src;
    const f = e.sig.find(x => x.a <= pos && pos < x.b);
    const vars = variables(e, pos);
    // 1. El nombre de una llamada (o su objeto): todas las funciones, con los argumentos que encajen.
    const ll = f && e.nodos.filter(n => n.k === "llamada" && n.nombre && pos >= n.a && pos < n.nombre.b).sort((x, y) => (x.nombre.b - x.a) - (y.nombre.b - y.a))[0];
    const lista = funcionesDisponibles();
    if (ll && lista.length) {
      const conAwait = ll.padre && ll.padre.k === "unaria" && ll.padre.op === "await";
      const a = conAwait ? ll.padre.a : ll.a, viejo = cmg.firma(v.slice(ll.nombre.a, ll.nombre.b)) || [];
      const args = ll.args.filter(x => x.k !== "vacio");
      const grupos = gruposFunciones(lista, fn => {
        const params = fn.firma || [], nombre = nombreFn(fn);
        const dentro = params.map((p, i) => args[i] && viejo[i] === p ? v.slice(args[i].a, args[i].b) : H(p));
        return opc(`${fn.await ? "await " : ""}${nombre}(${dentro.join(", ")})`, "fn", fn.nota || "", `${nombre}(${params.join(", ")})`);
      });
      return { a, b: ll.b, datos: { titulo: "Funciones", donde: "cambia la llamada, conserva los valores que encajan", grupos } };
    }
    // 2. Un operador: los de su familia.
    if (f && f.k === "p") {
      const fam = FAMILIAS.find(([, ops]) => ops.some(([o]) => o === f.v));
      if (fam) return { a: f.a, b: f.b, datos: { titulo: `Operador · ${fam[0].toLowerCase()}`, grupos: [{ items: fam[1].map(([o, nota]) => opc(o, "op", nota)) }] } };
    }
    // 3. const / let.
    if (f && f.k === "id" && DECLARA.some(([d]) => d === f.v)) return { a: f.a, b: f.b, datos: { titulo: "Declaración", grupos: [{ items: DECLARA.map(([d, nota]) => opc(d, "kw", nota)) }] } };
    // 4. Un valor: lo que encaja en su sitio (argumento, condición, comparación) y los de su mismo tipo.
    const t = f ? E.atomo(e, pos) : null;
    if (t) {
      let [a, b] = t;
      const n = e.nodos.find(x => x.a === a && x.b === b && x.k !== "vacio" && x.k !== "programa");
      if (!n || !["id", "num", "str", "lit", "hueco"].includes(n.k)) return null;
      if (n.padre && n.padre.k === "decl" && n.padre.h[0] === n) return null;   // el nombre que se declara
      // Una propiedad (obj.prop) se cambia entera.
      const m = n.prop && n.padre && n.padre.k === "miembro" ? n.padre : n;
      [a, b] = [m.a, m.b];
      const c = E.contexto(e, a, b);
      let datos = c && (c.tipo || c.hueco) ? cmg.sugerencias({ tipo: c.tipo, funcion: c.funcion, objeto: c.objeto, indice: c.indice, hueco: c.hueco, variables: vars }) : null;
      if (!datos && n.k !== "num") datos = cmg.sugerencias({ tipo: "valor", variables: vars });
      const grupos = [...(datos ? datos.grupos : [])];
      if (n.k === "lit") grupos.unshift({ titulo: "Del mismo tipo", items: LITERALES.map(([l, nota]) => opc(l, "kw", nota)) });
      if (!grupos.some(g => g.items.length) && n.k !== "num") return null;
      return { a, b, numero: n.k === "num", c: c || undefined, datos: { titulo: datos ? datos.titulo : n.k === "num" ? "Número" : "Valor", donde: datos && datos.donde, grupos } };
    }
    // 5. Un hueco vacío entre ( ) o [ ]: los valores de ese argumento.
    const vacio = e.nodos.find(x => x.k === "vacio" && x.a <= pos && pos <= x.b);
    if (vacio) {
      const c = E.contexto(e, vacio.a, vacio.a);
      const datos = c && cmg.sugerencias({ tipo: c.tipo, funcion: c.funcion, objeto: c.objeto, indice: c.indice, hueco: c.hueco, variables: vars });
      return datos ? { a: vacio.a, b: vacio.b, c, datos } : null;
    }
    // 6. Una línea vacía dentro de { }: las órdenes que caben ahí, como sentencias.
    const l = E.lineaDe(e, pos), ini = E.inicioLinea(e, l), fin = E.finLinea(e, l);
    if (!v.slice(ini, fin).trim() && lista.length) {
      const s = sangriaEn(v, ini);
      const grupos = gruposFunciones(lista, fn => {
        const nombre = nombreFn(fn), params = fn.firma || [];
        return opc(`${s}${fn.await ? "await " : ""}${nombre}(${params.map(H).join(", ")})${FIN}`, "fn", fn.nota || "", `${nombre}(${params.join(", ")})`);
      });
      return { a: ini, b: fin, datos: { titulo: "Órdenes", donde: `línea ${l + 1}`, grupos } };
    }
    return null;
  }
  function abrirAlternativas(pos) {
    if (!activo || $codigo.readOnly) { if ($codigo.readOnly) cmg.aviso("Detén el programa para editarlo."); return; }
    const r = alternativas(pos);
    if (!r) {
      const t = E.atomo(estructura(), pos);
      if (t) elegir(t[0], t[1]);
      toast("No hay alternativas para este elemento.");
      return;
    }
    elegir(r.a, r.b, { mostrar: true });
    versionSug++;   // anula la lista automática que pediría elegir()
    sinSugerir = "";
    abrirSugerencias(r.datos, r.a, r.b, r.c || { vacio: false, hueco: null }, !!r.numero);
  }

  // ---------- Barra de edición ----------
  const ICONOS = {
    teclado: '<rect x="2.5" y="6" width="19" height="12.5" rx="2.2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 13.6h.01M17 13.6h.01M9.5 14.6h5"/><path class="tachado" d="M3.6 3.4l16.8 17.2"/>',
    deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    rehacer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    cortar: '<circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8 16.2L18.5 4M16 16.2L5.5 4"/>',
    copiar: '<rect x="8.5" y="8.5" width="11.5" height="12.5" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2V15a2 2 0 0 0 2 2h3"/>',
    pegar: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><rect x="9" y="2.5" width="6" height="4" rx="1"/><path d="M9 12h6M9 15.5h4"/>',
    borrar: '<path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/>',
    ampliar: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="9" y="9.5" width="6" height="5" rx="1"/>',
    reducir: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
    duplicar: '<rect x="3.5" y="3.5" width="11.5" height="11.5" rx="2"/><path d="M19 8.5h.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H10a1.5 1.5 0 0 1-1.5-1.5V19"/><path d="M9.25 6.5v5M6.75 9h5"/>',
    subir: '<path d="M12 19.5V5M6 11l6-6 6 6"/>',
    bajar: '<path d="M12 4.5V19M6 13l6 6 6-6"/>',
    desenvolver: '<path d="M8 4H7a2 2 0 0 0-2 2v3.5L3 12l2 2.5V18a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v3.5l2 2.5-2 2.5V18a2 2 0 0 1-2 2h-1" stroke-dasharray="2.6 2.4"/><path d="M9.5 12h5"/>',
    linea: '<path d="M19.5 5v6.5a3 3 0 0 1-3 3H6"/><path d="M10 10.5l-4 4 4 4"/>',
    // Teléfono: interruptor de selección (un tramo resaltado con el cursor de texto) y ProtoMouse.
    seleccion: '<rect x="2.5" y="8.2" width="12.5" height="7.6" rx="1.4" fill="currentColor" fill-opacity=".3" stroke="none"/><path d="M15.5 4.5v15M13 4.5h5M13 19.5h5"/><path d="M2.5 8.2h12.5M2.5 15.8h12.5" stroke-dasharray="1.6 2"/>',
    mouse: '<rect x="7.5" y="3.5" width="9" height="15.5" rx="4.5"/><path d="M12 3.5v5.2M7.5 8.7h9"/><path d="M3.6 11.2l-1.8 1.8 1.8 1.8M20.4 11.2l1.8 1.8-1.8 1.8" stroke-width="1.6"/>',
    sangrar: '<path d="M3 4.5h18M11 9.5h10M11 14.5h10M3 19.5h18"/><path d="M3.5 9l3.5 3-3.5 3"/>',
    desangrar: '<path d="M3 4.5h18M11 9.5h10M11 14.5h10M3 19.5h18"/><path d="M7 9l-3.5 3L7 15"/>',
  };
  const svg = (c) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${c}</svg>`;
  const ACCIONES = {
    teclado: { t: "Modo sin teclado", fn: () => activar(!activo, true) },
    deshacer: { t: "Deshacer", fn: deshacer }, rehacer: { t: "Rehacer", fn: rehacer },
    cortar: { t: "Cortar", fn: () => copiar(true) }, copiar: { t: "Copiar", fn: () => copiar(false) }, pegar: { t: "Pegar", fn: pegar }, borrar: { t: "Borrar", fn: borrar },
    ampliar: { t: "Ampliar selección", fn: ampliar }, reducir: { t: "Reducir selección", fn: reducir },
    duplicar: { t: "Duplicar", fn: duplicar }, subir: { t: "Subir línea", fn: () => moverLineas(-1) }, bajar: { t: "Bajar línea", fn: () => moverLineas(1) }, linea: { t: "Línea nueva", fn: lineaNueva },
    desenvolver: { t: "Desenvolver: quita el if/while que lo rodea", fn: desenvolver },
  };
  // Grupos de la barra: el orden de grupos y de botones se cambia en Ajustes y se guarda por dispositivo.
  const GRUPOS_BASE = [["teclado"], ["deshacer", "rehacer"], ["cortar", "copiar", "pegar", "borrar"], ["ampliar", "reducir"], ["duplicar", "subir", "bajar", "linea", "desenvolver"]];
  function validarGrupos(g) {
    const vistos = new Set();
    const out = (Array.isArray(g) ? g : []).map(x => (Array.isArray(x) ? x : []).filter(id => Object.hasOwn(ACCIONES, id) && !vistos.has(id) && vistos.add(id))).filter(x => x.length);
    const faltan = Object.keys(ACCIONES).filter(id => !vistos.has(id));
    if (faltan.length) out.push(faltan);
    return out;
  }
  let grupos = validarGrupos(leer("barra", GRUPOS_BASE));
  // Teléfono (juego): la barra muestra seis botones alrededor del ProtoMouse (deshacer · rehacer · selección |
  // ProtoMouse | cortar · copiar · pegar). Lo demás sigue a mano manteniendo pulsado su pariente: las mismas
  // placas metálicas que las variantes de la paleta. El CSS decide qué disposición se ve; el marcado es uno.
  const VARIANTES_BARRA = { seleccion: ["ampliar", "reducir", "subir", "bajar"], cortar: ["borrar", "desenvolver"], copiar: ["duplicar"], pegar: ["linea", "sangrar", "desangrar"] };
  const LUZ = { seleccion: "#7FA3FF", ampliar: "#63D2E0", reducir: "#63D2E0", subir: "#5FC28A", bajar: "#5FC28A", cortar: "#F2C14E", borrar: "#F07A70",
    desenvolver: "#CFA2FF", copiar: "#9CC8FF", duplicar: "#9CC8FF", pegar: "#B4EE4D", linea: "#B7C2CC", sangrar: "#B7C2CC", desangrar: "#B7C2CC" };
  // Acciones que solo existen como placas del teléfono (no entran en la barra de PC ni en su orden).
  const EXTRA = { sangrar: { t: "Sangrar: un nivel más", fn: () => sangrar(1) }, desangrar: { t: "Quitar un nivel de sangría", fn: () => sangrar(-1) } };
  const accionDe = (id) => EXTRA[id] || ACCIONES[id];
  // Etiquetas cortas para las placas (el nombre completo sigue en el tooltip y en aria-label).
  const CORTO = { seleccion: "Selección", ampliar: "Ampliar", reducir: "Reducir", subir: "Subir línea", bajar: "Bajar línea", desenvolver: "Desenvolver", linea: "Línea nueva", sangrar: "Sangrar", desangrar: "Quitar sangría" };
  const tituloDe = (id) => CORTO[id] || accionDe(id).t;
  // La esquina marcada y el aviso de «mantén para más» solo valen donde hay variantes (pintarBarra los ajusta).
  const botonBarra = (id) => `<button type="button" data-accion="${id}" aria-label="${esc(ACCIONES[id].t)}" data-tip="${esc(ACCIONES[id].t)}"${id === "teclado" ? ` class="b-teclado" aria-pressed="false"` : VARIANTES_BARRA[id] ? ` class="con-variantes"` : ""}>${svg(ICONOS[id])}</button>`;
  function construirBarra() {
    // Un grupo que solo lleva el interruptor del teclado se oculta donde el interruptor no aplica.
    $barra.innerHTML = grupos.map(g => `<span class="grupo-ed${g.length === 1 && g[0] === "teclado" ? " solo-teclado" : ""}">${g.map(botonBarra).join("")}</span>`).join("")
      + `<span class="ed-movil"><button type="button" class="b-seleccion con-variantes" data-seleccion aria-pressed="false" aria-label="Selección: encendida, el ProtoMouse amplía lo elegido" data-tip="Selección" data-tip-cod="enciende y arrastra">${svg(ICONOS.seleccion)}</button>`
      // Sin tooltip: taparía el código mientras se arrastra (un toque sin arrastrar ya explica su uso).
      + `<span class="protomouse" data-protomouse role="img" aria-label="ProtoMouse: mantén el dedo y arrastra para mover el cursor">${svg(ICONOS.mouse)}</span></span>`;
    pintarBarra();
  }
  $("b-teclado").innerHTML = svg(ICONOS.teclado);
  // pointerdown sin foco: con teclado, el textarea lo conserva y el teclado del teléfono no se cierra.
  vida.escuchar($barra, "pointerdown", (ev) => { if (ev.target.closest("button, .protomouse")) ev.preventDefault(); });
  // Una acción de la barra (botón o variante). En seudocódigo actúan sobre el renglón elegido (seudo.js);
  // deshacer sigue siendo del texto.
  function ejecutarAccion(id) {
    if (id === "seleccion") return alternarSeleccion();
    const accion = accionDe(id);
    if (!accion) return;
    if (!["ampliar", "reducir", "teclado"].includes(id)) apagarSeleccion();
    const r = cmg.seudo && cmg.seudo.activo ? cmg.seudo.accion(id) : false;
    if (r) { if (typeof r === "string") toast(r); return; }
    accion.fn();
  }
  vida.escuchar($barra, "click", (ev) => {
    if (suprimirClicBarra) { suprimirClicBarra = false; return; }
    const b = ev.target.closest("[data-accion], [data-seleccion]");
    if (!b || b.disabled) return;
    cerrarVariantesBarra();
    ejecutarAccion(b.dataset.seleccion != null ? "seleccion" : b.dataset.accion);
  });

  // ---------- Selección del teléfono ----------
  // Un interruptor con luz: apagado, el ProtoMouse mueve el cursor; encendido, amplía lo elegido desde su
  // extremo fijo. Se apaga al cambiar el texto y al usar las demás acciones (cortar, copiar, pegar…).
  let seleccionando = false, avisoSeleccion = false;
  function pintarInterruptor() {
    const b = $barra.querySelector("[data-seleccion]");
    if (b) b.setAttribute("aria-pressed", String(seleccionando));
    $barra.classList.toggle("seleccionando", seleccionando);
  }
  function alternarSeleccion(si = !seleccionando) {
    seleccionando = !!si;
    pintarInterruptor();
    if (seleccionando && !avisoSeleccion) { avisoSeleccion = true; toast("Selección encendida: arrastra el ProtoMouse para ampliarla"); }
  }
  function apagarSeleccion() { if (seleccionando) alternarSeleccion(false); }
  vida.escuchar($codigo, "input", apagarSeleccion);

  // Variantes de la barra: mantener pulsado ~0,45 s (o clic derecho) despliega placas metálicas encima del
  // botón, como en la paleta. Se puede soltar el dedo sobre una o tocarla después; desplazar cancela.
  // El menú se crea la primera vez que hace falta: en PC y en la demo no existe.
  let $varBarra = null;
  function menuBarra() {
    if ($varBarra) return $varBarra;
    $varBarra = document.createElement("div");
    $varBarra.className = "variantes variantes-ed"; $varBarra.hidden = true; $varBarra.setAttribute("role", "menu");
    vida.portal($varBarra);
    vida.escuchar($varBarra, "pointerdown", (ev) => ev.preventDefault());
    vida.escuchar($varBarra, "click", (ev) => { const v = ev.target.closest(".variante:not(:disabled)"); if (v) elegirVarianteBarra(v); });
    return $varBarra;
  }
  const disposicionMovil = () => { const z = $barra.querySelector(".protomouse"); return !!z && z.getClientRects().length > 0; };
  const idBoton = (b) => b.dataset.seleccion != null ? "seleccion" : b.dataset.accion;
  let pulsoBarra = null, suprimirClicBarra = false;
  function abrirVariantesBarra(b) {
    menuBarra();
    const id = idBoton(b), lista = [id, ...VARIANTES_BARRA[id]], quieto = $codigo.readOnly;
    $varBarra.innerHTML = lista.map((v, j) => `<button type="button" class="variante${j ? "" : " principal"}" role="menuitem" data-v="${v}" style="--c1:${LUZ[v]}"`
      + ` data-tip="${esc(v === "seleccion" ? "Selección" : accionDe(v).t)}"${quieto && !["seleccion", "copiar", "ampliar", "reducir"].includes(v) ? " disabled" : ""}>${svg(ICONOS[v])}<span>${esc(tituloDe(v))}</span></button>`).join("");
    $varBarra.hidden = false;
    // El aviso y el nombre del botón (tooltip del toque) taparían las placas.
    $toast.hidden = true;
    for (const t of document.querySelectorAll(".tip")) t.hidden = true;
    const r = b.getBoundingClientRect(), m = $varBarra.getBoundingClientRect();
    let y = r.top - m.height - 8;
    if (y < 6) y = r.bottom + 8;
    const x = Math.max(6, Math.min(innerWidth - m.width - 6, r.left + r.width / 2 - m.width / 2));
    $varBarra.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    b.classList.add("abierto");
    if (navigator.vibrate) navigator.vibrate(12);
  }
  function cerrarVariantesBarra() {
    if (!$varBarra || $varBarra.hidden) return;
    $varBarra.hidden = true; $varBarra.innerHTML = "";
    $barra.querySelectorAll(".abierto").forEach(x => x.classList.remove("abierto"));
  }
  const varianteBarraEn = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest(".variantes-ed .variante:not(:disabled)"); };
  function elegirVarianteBarra(v) { cerrarVariantesBarra(); ejecutarAccion(v.dataset.v); }
  vida.escuchar($barra, "pointerdown", (ev) => {
    suprimirClicBarra = false;
    const b = ev.target.closest("button.con-variantes");
    if (!b || ev.button > 0 || !disposicionMovil()) return;
    pulsoBarra = { b, id: ev.pointerId, x: ev.clientX, y: ev.clientY, abierto: false };
    pulsoBarra.t = vida.setTimeout(() => { if (pulsoBarra) { pulsoBarra.abierto = true; abrirVariantesBarra(b); } }, 450);
  });
  vida.escuchar(document, "pointermove", (ev) => {
    if (!pulsoBarra || ev.pointerId !== pulsoBarra.id) return;
    if (!pulsoBarra.abierto) { if (Math.hypot(ev.clientX - pulsoBarra.x, ev.clientY - pulsoBarra.y) > 12) { vida.clearTimeout(pulsoBarra.t); pulsoBarra = null; } return; }
    const v = varianteBarraEn(ev.clientX, ev.clientY);
    $varBarra.querySelectorAll(".variante").forEach(x => x.classList.toggle("activa", x === v));
  });
  const soltarPulsoBarra = (ev) => {
    if (!pulsoBarra || ev.pointerId !== pulsoBarra.id) return;
    vida.clearTimeout(pulsoBarra.t);
    if (pulsoBarra.abierto) {
      suprimirClicBarra = true;
      const v = ev.type === "pointerup" && varianteBarraEn(ev.clientX, ev.clientY);
      if (v) elegirVarianteBarra(v);
    }
    pulsoBarra = null;
  };
  vida.escuchar(document, "pointerup", soltarPulsoBarra);
  vida.escuchar(document, "pointercancel", soltarPulsoBarra);
  // Android también dispara «contextmenu» al mantener el dedo: aquí manda el temporizador.
  vida.escuchar($barra, "contextmenu", (ev) => {
    const b = ev.target.closest("button.con-variantes");
    if (!b || !disposicionMovil()) return;
    ev.preventDefault();
    if (pulsoBarra) { if (!pulsoBarra.abierto) { vida.clearTimeout(pulsoBarra.t); pulsoBarra.abierto = true; abrirVariantesBarra(b); } return; }
    abrirVariantesBarra(b);
  });
  vida.escuchar(document, "pointerdown", (ev) => { if ($varBarra && !$varBarra.hidden && !ev.target.closest(".variantes-ed, .barra-edicion .abierto")) cerrarVariantesBarra(); }, true);
  vida.escuchar(document, "keydown", (ev) => { if (ev.key === "Escape") cerrarVariantesBarra(); });
  function pintarBarra() {
    for (const b of ambito.querySelectorAll(".b-teclado")) {
      b.setAttribute("aria-pressed", String(activo));
      b.setAttribute("aria-label", activo ? "Modo sin teclado activo: toca para escribir con teclado (Ctrl+Alt+A)" : "Modo sin teclado (Ctrl+Alt+A)");
      b.setAttribute("aria-keyshortcuts", "Control+Alt+A");
      b.dataset.tip = activo ? "Volver al teclado" : "Modo sin teclado";
      b.dataset.tipCod = "Ctrl+Alt+A";
    }
    const quieto = $codigo.readOnly;
    for (const b of $barra.querySelectorAll("[data-accion]")) {
      const id = b.dataset.accion;
      b.disabled = id === "deshacer" ? quieto || !hist.pasado.length : id === "rehacer" ? quieto || !hist.futuro.length : quieto && !["teclado", "copiar", "ampliar", "reducir"].includes(id);
    }
    pintarInterruptor();
    const movil = disposicionMovil();
    for (const b of $barra.querySelectorAll("button.con-variantes")) {
      if (movil) { b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-description", "Mantén pulsado para más acciones"); }
      else { b.removeAttribute("aria-haspopup"); b.removeAttribute("aria-description"); }
    }
  }
  // La disposición la decide el CSS según la forma: al cambiar, se revisan los avisos de las variantes.
  vida.escuchar(app, "cmg:forma", () => vida.requestAnimationFrame(pintarBarra));
  const $toast = document.createElement("div");
  $toast.className = "toast-edicion"; $toast.hidden = true; $toast.setAttribute("role", "status");
  vida.portal($toast);
  let tToast = 0;
  function toast(texto) {
    $toast.textContent = texto; $toast.hidden = false;
    const r = ($barra.getClientRects().length ? $barra : $editor).getBoundingClientRect();
    // Con la barra al pie de la pantalla (teléfono), el aviso sale encima de ella.
    const y = r.bottom > innerHeight * .55 ? r.top - $toast.offsetHeight - 6 : r.bottom + 6;
    $toast.style.transform = `translate(${Math.round(Math.max(6, Math.min(innerWidth - $toast.offsetWidth - 6, r.left + r.width / 2 - $toast.offsetWidth / 2)))}px, ${Math.round(Math.max(6, y))}px)`;
    vida.clearTimeout(tToast);
    tToast = vida.setTimeout(() => { $toast.hidden = true; }, 1500);
  }

  // ---------- ProtoMouse (teléfono) ----------
  // Como un trackpad: el dedo mueve un puntero virtual sobre el código (con algo de aceleración) y el cursor
  // salta al sitio más cercano. La captura del puntero deja seguir el arrastre fuera de la franja; al llegar
  // arriba o abajo, el código se desplaza. Con la selección encendida amplía lo elegido desde su extremo fijo.
  // Nunca enfoca el textarea: el teclado sigue como estaba. Con el teclado cerrado pinta su propio cursor.
  const $area = $("area"), $espejo = $("espejo");
  const $pmCapa = document.createElement("div");
  $pmCapa.className = "pm-capa"; $pmCapa.setAttribute("aria-hidden", "true");
  $pmCapa.innerHTML = `<div class="pm-sel-capa"></div><div class="pm-cursor" hidden></div><div class="pm-fantasma" hidden></div>`;
  vida.portal($pmCapa); if ($area) $area.append($pmCapa);
  const $pmSel = $pmCapa.children[0], $pmCursor = $pmCapa.children[1], $pmFantasma = $pmCapa.children[2];
  let pm = null, pmUltimo = null, pmMarca = false;
  // Posición del texto en un punto de la pantalla, con el espejo del textarea (una línea por div, sin desplazar).
  function puntoEspejo(pos) {
    const v = $codigo.value;
    let i = 0, inicio = 0;
    for (let fin = v.indexOf("\n"); fin >= 0 && fin < pos; fin = v.indexOf("\n", inicio)) { inicio = fin + 1; i++; }
    const d = $espejo && $espejo.children[i];
    if (!d) return null;
    const t = d.firstChild;
    return t && t.nodeType === 3 ? [t, Math.min(pos - inicio, t.length)] : [d, 0];
  }
  function rectTexto(pos) {
    const p = puntoEspejo(pos);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(...p); r.collapse(true);
    const c = r.getClientRects()[0] || r.getBoundingClientRect(), alto = c.height || parseFloat(getComputedStyle($codigo).lineHeight) || 20;
    return { left: c.left - $codigo.scrollLeft, top: c.top - $codigo.scrollTop, height: alto, bottom: c.top - $codigo.scrollTop + alto };
  }
  function rectsTexto(a, b) {
    const p = puntoEspejo(a), q = puntoEspejo(b);
    if (!p || !q) return [];
    const r = document.createRange(), sl = $codigo.scrollLeft, st = $codigo.scrollTop;
    r.setStart(...p); r.setEnd(...q);
    return [...r.getClientRects()].filter(x => x.width > 0 || x.height > 0).map(x => ({ left: x.left - sl, right: x.right - sl, top: x.top - st, bottom: x.bottom - st }));
  }
  function posTexto(x, y) {
    const divs = $espejo ? $espejo.children : [];
    if (!divs.length) return 0;
    const ey = y + $codigo.scrollTop, ex = x + $codigo.scrollLeft;
    let lo = 0, hi = divs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (divs[m].getBoundingClientRect().top <= ey) lo = m; else hi = m - 1; }
    const lineas = $codigo.value.split("\n");
    let inicio = 0;
    for (let i = 0; i < lo; i++) inicio += lineas[i].length + 1;
    return inicio + Math.min((lineas[lo] || "").length, enPieza(divs[lo], ex, ey, false));
  }
  const caretEn = (pos) => activo ? rectCaret(pos) : rectTexto(pos);
  const posPunto = (x, y) => activo ? posEn(x, y) : posTexto(x, y);
  function cajaVisible() {
    const s = activo ? $vista : $codigo, r = s.getBoundingClientRect(), cs = getComputedStyle(activo ? $texto : $codigo);
    return { s, left: r.left + (parseFloat(cs.paddingLeft) || 0) - 2, right: r.right - (parseFloat(cs.paddingRight) || 0), top: r.top + 3, bottom: r.bottom - 3 };
  }
  // Cursor y selección propios mientras el textarea no tiene el foco (el navegador no los pinta).
  function pintarPM() {
    $pmSel.replaceChildren(); $pmCursor.hidden = true;
    if (!$area || !pmMarca || activo || document.activeElement === $codigo || !$codigo.getClientRects().length) return;
    const base = $area.getBoundingClientRect(), [a, b] = sel();
    if (a === b) {
      const r = rectTexto(a); if (!r) return;
      Object.assign($pmCursor.style, { left: `${r.left - base.left - 1}px`, top: `${r.top - base.top}px`, height: `${r.height}px` });
      $pmCursor.hidden = false;
      return;
    }
    for (const r of renglones(rectsTexto(a, b))) {
      const d = document.createElement("div"); d.className = "pm-sel";
      Object.assign(d.style, { left: `${r.left - base.left - 1}px`, top: `${r.top - base.top}px`, width: `${Math.max(4, r.right - r.left + 2)}px`, height: `${r.bottom - r.top}px` });
      $pmSel.append(d);
    }
  }
  function olvidarMarca() { if (pmMarca) { pmMarca = false; pintarPM(); } }
  vida.escuchar($codigo, "focus", olvidarMarca);
  vida.escuchar($codigo, "scroll", pintarPM, { passive: true });
  vida.escuchar($codigo, "cmg:medido", () => vida.queueMicrotask(pintarPM));
  vida.escuchar($codigo, "cmg:seleccion", pintarPM);
  function pintarFantasma() {
    if (!pm || !$area) return;
    const base = $area.getBoundingClientRect();
    $pmFantasma.style.transform = `translate(${Math.round(pm.vx - base.left)}px, ${Math.round(pm.vy - base.top)}px)`;
  }
  function iniciarPM(ev, zona) {
    if (cmg.seudo && cmg.seudo.activo) return;
    cerrarSugerencias(); cerrarVariantesBarra(); resolverPendiente();
    const [a, b] = sel();
    // El extremo que se mueve: el último que movió el ProtoMouse o, si no, el final (o el principio si se eligió hacia atrás).
    let movil = b;
    if (a !== b) movil = pmUltimo && pmUltimo.a === a && pmUltimo.b === b ? pmUltimo.movil : $codigo.selectionDirection === "backward" ? a : b;
    const ancla = seleccionando ? (a === b ? a : movil === a ? b : a) : null;
    if (!activo && document.activeElement !== $codigo) pmMarca = true;
    // Si el cursor quedó fuera de la vista, primero se trae: el arrastre sigue desde donde estaba.
    let r = caretEn(movil), c = cajaVisible();
    if (r && (r.top < c.top || r.bottom > c.bottom)) {
      c.s.scrollTop += r.top < c.top ? r.top - c.top - 8 : r.bottom - c.bottom + 8;
      r = caretEn(movil); c = cajaVisible();
    }
    const x0 = r ? r.left : c.left, y0 = r ? r.top + r.height / 2 : c.top + 10;
    // Sin la selección encendida, el primer movimiento deja solo el cursor (aunque caiga en el mismo sitio).
    pm = { id: ev.pointerId, zona, x: ev.clientX, y: ev.clientY, t: performance.now(), recorrido: 0, movido: false, ancla, pos: ancla != null || a === b ? movil : null,
      vx: Math.max(c.left, Math.min(c.right, x0)), vy: Math.max(c.top, Math.min(c.bottom, y0)) };
    zona.classList.add("vivo");
    try { zona.setPointerCapture(ev.pointerId); } catch { /* sin captura: siguen llegando los eventos de la franja */ }
    if (activo) pintarSeleccion(); else pintarPM();
  }
  function ponerPM(pos) {
    if (pos == null || pos === pm.pos) return;
    pm.pos = pos;
    const an = pm.ancla, [a, b, dir] = an == null ? [pos, pos, "none"] : pos < an ? [pos, an, "backward"] : [an, pos, "forward"];
    $codigo.setSelectionRange(a, b, dir);
    pila.length = 0;
    pmUltimo = { a, b, movil: pos };
    if (activo) pintarSeleccion(); else pintarPM();
  }
  function moverPM(ev) {
    const dx = ev.clientX - pm.x, dy = ev.clientY - pm.y, ahora = performance.now(), dt = Math.max(8, ahora - pm.t);
    pm.x = ev.clientX; pm.y = ev.clientY; pm.t = ahora;
    if (!pm.movido) {
      pm.recorrido += Math.hypot(dx, dy);
      if (pm.recorrido < 4) return;
      pm.movido = true; $pmFantasma.hidden = false;
    }
    // Lento, uno a uno (un carácter son unos 8 px de dedo); rápido, hasta 2,6 veces más lejos.
    const g = Math.min(2.6, 1 + Math.max(0, Math.hypot(dx, dy) / dt - .3) * 1.4);
    pm.vx += dx * g; pm.vy += dy * g;
    const c = cajaVisible();
    if (pm.vy < c.top) { c.s.scrollTop -= c.top - pm.vy; pm.vy = c.top; }
    else if (pm.vy > c.bottom) { c.s.scrollTop += pm.vy - c.bottom; pm.vy = c.bottom; }
    pm.vx = Math.max(c.left, Math.min(c.right, pm.vx));
    ponerPM(posPunto(pm.vx, pm.vy));
    pintarFantasma();
  }
  function terminarPM(ev) {
    const p = pm; pm = null;
    p.zona.classList.remove("vivo");
    $pmFantasma.hidden = true;
    if (!p.movido) { if (ev.type === "pointerup") toast("Mantén el dedo en el ProtoMouse y arrastra para mover el cursor"); return; }
    if (activo) pintarSeleccion(); else pintarPM();
    // Al soltar sobre un hueco /* … */ aparece su lista, como al tocarlo.
    actualizarSugerencias();
  }
  vida.escuchar($barra, "pointerdown", (ev) => {
    const zona = ev.target.closest(".protomouse");
    if (!zona || pm || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    ev.preventDefault();
    iniciarPM(ev, zona);
  });
  vida.escuchar($barra, "pointermove", (ev) => { if (pm && ev.pointerId === pm.id) moverPM(ev); });
  vida.escuchar($barra, "pointerup", (ev) => { if (pm && ev.pointerId === pm.id) terminarPM(ev); });
  vida.escuchar($barra, "pointercancel", (ev) => { if (pm && ev.pointerId === pm.id) terminarPM(ev); });
  vida.escuchar($barra, "lostpointercapture", (ev) => { if (pm && ev.pointerId === pm.id) terminarPM(ev); });

  // ---------- Modo sin teclado ----------
  function activar(si, enfocar = false) {
    activo = !!si;
    escribir("sin-teclado", activo);
    $editor.classList.toggle("sin-teclado", activo);
    app.dataset.sinTeclado = String(activo);
    $vista.hidden = !activo;
    $asas.hidden = !(activo && asa === "borde");
    $codigo.tabIndex = activo ? -1 : 0;
    if (activo) $codigo.setAttribute("inputmode", "none"); else $codigo.removeAttribute("inputmode");
    cerrarSugerencias();
    pintarBarra();
    if (activo) {
      if (document.activeElement === $codigo) $codigo.blur();   // cierra el teclado del teléfono
      pintarVista();
      $vista.scrollTop = $codigo.scrollTop;
      cmg.medirEditor();
      vida.queueMicrotask(() => { pintarSeleccion(); mostrarRango(sel()[0]); });
    } else {
      $codigo.scrollTop = $vista.scrollTop;
      cmg.medirEditor();
      if (enfocar) $codigo.focus({ preventScroll: true });
    }
  }
  vida.escuchar($("b-teclado"), "click", () => activar(!activo, true));
  vida.escuchar($codigo, "cmg:medido", () => {
    if (!activo) return;
    if ($codigo.value !== pintado) pintarVista();
    pintarAsas();
    // insertar() fija la selección después del evento input: la paleta deja así elegido su primer hueco.
    vida.queueMicrotask(() => { pintarSeleccion(); actualizarSugerencias(); });
  });
  vida.escuchar($codigo, "cmg:seleccion", () => { if (activo) { pintarSeleccion(); mostrarRango(sel()[0]); } actualizarSugerencias(); });
  vida.escuchar($codigo, "cmg:estado", () => { pintarBarra(); if ($codigo.readOnly) cerrarSugerencias(); });
  vida.escuchar($codigo, "input", () => { if (!activo) actualizarSugerencias(); });

  // ---------- Teclado físico ----------
  // Ctrl+Alt+A activa o desactiva el modo sin teclado desde cualquier parte del juego.
  vida.escuchar(document, "keydown", (ev) => {
    if (!ev.ctrlKey || !ev.altKey || ev.shiftKey || ev.metaKey || !(ev.code === "KeyA" || (ev.key || "").toLowerCase() === "a")) return;
    if (ambito.querySelector("dialog[open]") || (cmg.seudo && cmg.seudo.activo)) return;
    ev.preventDefault(); ev.stopPropagation();
    activar(!activo, true);
    if (activo && editorVisible()) $vista.focus({ preventScroll: true });
    toast(activo ? "Modo sin teclado · Ctrl+Alt+A" : "Teclado · Ctrl+Alt+A");
  }, true);
  // Sin teclado en PC: la vista toma el foco al hacer clic y entiende atajos de bloques.
  function atomoVecino(dir) {
    const [a, b] = sel(), e = estructura(), v = e.src;
    let p = dir > 0 ? b : a - 1;
    while (p >= 0 && p < v.length && /\s/.test(v[p])) p += dir;
    const t = p >= 0 && p < v.length ? E.fichaEn(e, p) : null;
    if (t) elegir(t.a, t.b, { mostrar: true });
  }
  function lineaVecina(dir) {
    const [a, b] = sel(), e = estructura();
    let l = E.lineaDe(e, dir < 0 ? a : Math.max(a, b - 1)) + dir;
    while (l >= 0 && l < e.lineas.length && !e.src.slice(E.inicioLinea(e, l), E.finLinea(e, l)).trim()) l += dir;
    if (l < 0 || l >= e.lineas.length) return;
    const ini = E.inicioLinea(e, l), fin = E.finLinea(e, l);
    elegir(ini + sangriaDe(e.src.slice(ini, fin)).length, fin, { mostrar: true });
  }
  vida.escuchar($vista, "keydown", (ev) => {
    if (!activo) return;
    if (pendiente && !["Shift", "Control", "Alt", "Meta"].includes(ev.key)) resolverPendiente();
    if (teclaSugerencias(ev)) return;
    const mod = ev.ctrlKey || ev.metaKey, k = ev.key, l = k.length === 1 ? k.toLowerCase() : k;
    const acciones = [
      [k === "Backspace" || k === "Delete", borrar],
      [mod && l === "z" && !ev.shiftKey, deshacer], [(mod && l === "z" && ev.shiftKey) || (mod && l === "y"), rehacer],
      [mod && l === "d", duplicar], [mod && k === "/", () => cmg.alternarComentario()], [mod && k === "Enter", () => cmg.alternarEjecucion()],
      [ev.altKey && ev.shiftKey && k === "ArrowRight", ampliar], [ev.altKey && ev.shiftKey && k === "ArrowLeft", reducir],
      [ev.altKey && !ev.shiftKey && (k === "ArrowUp" || k === "ArrowDown"), () => moverLineas(k === "ArrowUp" ? -1 : 1)],
      [!ev.altKey && !mod && (k === "ArrowLeft" || k === "ArrowRight"), () => atomoVecino(k === "ArrowLeft" ? -1 : 1)],
      [!ev.altKey && !mod && (k === "ArrowUp" || k === "ArrowDown"), () => lineaVecina(k === "ArrowUp" ? -1 : 1)],
      [k === "Enter" && !mod, lineaNueva], [k === "Tab", () => sangrar(ev.shiftKey ? -1 : 1)],
      [k === "Escape", () => { const [a] = sel(); elegir(a, a); }],
      [k.length === 1 && !mod && !ev.altKey, () => toast("Modo sin teclado: toca ⌨ para escribir.")],
    ];
    const hit = acciones.find(([si]) => si);
    if (hit) { ev.preventDefault(); hit[1](); }
  });
  // Ctrl+C / X / V con la vista enfocada (el evento llega al documento: la vista no es editable).
  const conVista = () => activo && document.activeElement === $vista;
  vida.escuchar(document, "copy", (ev) => {
    if (!conVista()) return;
    const [a, b] = sel(); if (a === b) return;
    ev.preventDefault();
    const t = $codigo.value.slice(a, b);
    ev.clipboardData.setData("text/plain", t); guardarCopia(t); toast("Copiado");
  });
  vida.escuchar(document, "cut", (ev) => {
    if (!conVista()) return;
    const [a, b] = sel(); if (a === b || !editable()) return;
    ev.preventDefault();
    const t = $codigo.value.slice(a, b);
    ev.clipboardData.setData("text/plain", t); guardarCopia(t); quitar(a, b);
  });
  vida.escuchar(document, "paste", (ev) => {
    if (!conVista()) return;
    ev.preventDefault();
    const t = ev.clipboardData.getData("text/plain");
    if (t && editable()) pegarTexto(t);
  });
  // Con teclado: la lista de sugerencias se maneja con flechas y ampliar/mover líneas tienen atajo.
  vida.escuchar($codigo, "keydown", (ev) => {
    if (activo || teclaSugerencias(ev)) return;
    if (ev.altKey && ev.shiftKey && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) { ev.preventDefault(); ev.key === "ArrowRight" ? ampliar() : reducir(); }
    else if (ev.altKey && !ev.shiftKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) { ev.preventDefault(); moverLineas(ev.key === "ArrowUp" ? -1 : 1); }
  }, true);

  // ---------- Ajustes ----------
  const $ajusteAsa = $("ajustes-asa");
  if ($ajusteAsa) {
    $ajusteAsa.value = asa;
    vida.escuchar($ajusteAsa, "change", () => {
      asa = $ajusteAsa.value === "borde" ? "borde" : "numero";
      escribir("asa", asa);
      $editor.dataset.asa = asa;
      $asas.hidden = !(activo && asa === "borde");
      pintarAsas();
      cmg.medirEditor();
    });
  }

  // ---------- Orden de la barra de edición ----------
  // Un diálogo encima de Ajustes: cada grupo es una fila con su asa; los botones se arrastran dentro
  // del grupo, a otro grupo o a «Grupo nuevo». Mientras se arrastra, el elemento se mueve en vivo.
  const $orden = $("orden-barra"), $grupos = $("orden-grupos");
  function pintarOrden() {
    $grupos.innerHTML = grupos.map((g, i) => `<div class="orden-grupo" data-g="${i}">
        <span class="orden-asa" aria-label="Mover el grupo ${i + 1}" title="Mover el grupo">⋮⋮</span>
        <div class="orden-btns">${g.map(id => `<span class="orden-btn" data-id="${id}" title="${esc(ACCIONES[id].t)}">${svg(ICONOS[id])}<span>${esc(ACCIONES[id].t)}</span></span>`).join("")}</div>
      </div>`).join("") + `<div class="orden-grupo nuevo"><div class="orden-btns"><span class="orden-vacio">Grupo nuevo</span></div></div>`;
  }
  function leerOrden() {
    grupos = validarGrupos([...$grupos.querySelectorAll(".orden-grupo")].map(g => [...g.querySelectorAll(".orden-btn")].map(b => b.dataset.id)));
    escribir("barra", grupos);
    construirBarra();
    pintarOrden();
  }
  let mueve = null;
  vida.escuchar($grupos, "pointerdown", (ev) => {
    const el = ev.target.closest(".orden-btn") || (ev.target.closest(".orden-asa") && ev.target.closest(".orden-grupo"));
    if (!el || el.classList.contains("nuevo") || ev.button > 0) return;
    ev.preventDefault();
    mueve = { el, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, activo: false, grupo: el.classList.contains("orden-grupo") };
  });
  vida.escuchar(window, "pointermove", (ev) => {
    if (!mueve || ev.pointerId !== mueve.id) return;
    if (!mueve.activo) {
      if (Math.hypot(ev.clientX - mueve.x0, ev.clientY - mueve.y0) < 5) return;
      mueve.activo = true; mueve.el.classList.add("levantado");
    }
    if (mueve.grupo) {
      // El grupo se coloca antes del primer grupo cuyo centro queda por debajo del puntero.
      const otros = [...$grupos.querySelectorAll(".orden-grupo:not(.nuevo)")].filter(g => g !== mueve.el);
      const antes = otros.find(g => { const r = g.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      $grupos.insertBefore(mueve.el, antes || $grupos.querySelector(".orden-grupo.nuevo"));
      return;
    }
    const bajo = document.elementFromPoint(ev.clientX, ev.clientY), g = bajo && bajo.closest && bajo.closest(".orden-grupo");
    if (!g || !$grupos.contains(g)) return;
    const fila = g.querySelector(".orden-btns"), otros = [...fila.querySelectorAll(".orden-btn")].filter(b => b !== mueve.el);
    // Antes del botón más cercano si el puntero está en su mitad izquierda; si no, después.
    let mejor = null, d = Infinity;
    for (const b of otros) { const r = b.getBoundingClientRect(), dd = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)); if (dd < d) { d = dd; mejor = b; } }
    if (!mejor) { const vacio = fila.querySelector(".orden-vacio"); fila.insertBefore(mueve.el, vacio); return; }
    const r = mejor.getBoundingClientRect();
    fila.insertBefore(mueve.el, ev.clientX < r.left + r.width / 2 ? mejor : mejor.nextSibling);
  });
  const soltarOrden = (ev) => {
    if (!mueve || ev.pointerId !== mueve.id) return;
    const m = mueve; mueve = null;
    m.el.classList.remove("levantado");
    if (m.activo) leerOrden();
  };
  vida.escuchar(window, "pointerup", soltarOrden);
  vida.escuchar(window, "pointercancel", soltarOrden);
  vida.escuchar($("ajustes-orden-barra"), "click", () => { pintarOrden(); $orden.showModal(); });
  vida.escuchar($("orden-cerrar"), "click", () => $orden.close());
  vida.escuchar($("orden-restaurar"), "click", () => { grupos = validarGrupos(GRUPOS_BASE); escribir("barra", grupos); construirBarra(); pintarOrden(); });

  // ---------- Arranque ----------
  $editor.dataset.asa = asa;
  // accion(id): una acción de la barra por su nombre (también sangrar y desangrar); la usan los botones de
  // edición de la paleta del teléfono.
  cmg.edicion = { get activo() { return activo; }, activar, accion: ejecutarAccion, elegir, ampliar, reducir, deshacer, rehacer, copiar, pegar, borrar, duplicar, moverLineas, lineaNueva, desenvolver, get portapapeles() { return portapapeles; },
    get seleccionando() { return seleccionando; }, seleccion: alternarSeleccion };
  construirBarra();
  if (leer("sin-teclado", false) === true) activar(true);

  return cmg.edicion;
  }
  window.CMGEdicion = { crear };
})();
