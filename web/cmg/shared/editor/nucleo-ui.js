/* UI de texto, medición, paleta y símbolos compartida por todas las instancias. */
(() => {
  "use strict";
  function crear({ opciones, cmg, $, ambito, vida, adaptador, marcasActuales }) {
    const $editor = $("editor"), $codigo = cmg.codigo, $gutter = $("gutter"), $banda = $("banda"), $espejo = $("espejo"), $resaltado = $("resaltado"), $bloques = $("bloques");
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    const lexico = adaptador.lexico, clasificar = (f, i) => adaptador.clasificar(f, i, opciones.proveedor?.vocabulario?.(adaptador.id) || {});
    const RE_HUECO = adaptador.hueco.re;
    const { rangoCodigo, envolver, expresionEnvolvible, elegirLineasCompletas, insertarBloque, insertarOperador } = adaptador.crearEdicion({
      codigo: $codigo, insertar, aviso: avisoEditor, escapar: esc, estructura: () => adaptador.estructura,
    });
  const sinTecladoActivo = () => $editor.classList.contains("sin-teclado");
  const desplazamiento = () => sinTecladoActivo() ? $bloques.scrollTop : $codigo.scrollTop;
  let alturas = [];
  function medirEditor() {
    const lineas = $codigo.value.split("\n");
    $espejo.style.width = `${$codigo.clientWidth}px`;
    $espejo.innerHTML = lineas.map(l => `<div>${esc(l) || " "}</div>`).join("");
    alturas = [...$espejo.children].map(d => d.getBoundingClientRect().height);
    $gutter.innerHTML = alturas.map((h, i) => `<div style="height:${h}px">${i + 1}</div>`).join("");
    pintarResaltado();
    pintarBanda();
    $codigo.dispatchEvent(new CustomEvent("cmg:medido"));
  }
  function pintarResaltado() {
    if (!$editor.classList.contains("colores")) return;
    const toks = lexico($codigo.value);
    let html = "";
    toks.forEach((t, i) => { const cls = clasificar(toks, i); html += cls ? `<span class="${cls}">${esc(t[1])}</span>` : esc(t[1]); });
    $resaltado.innerHTML = html + "\n";
    $resaltado.style.width = `${$codigo.clientWidth}px`;
    sincronizarScroll();
  }
  function sincronizarScroll() {
    $resaltado.style.transform = `translate(${-$codigo.scrollLeft}px, ${-$codigo.scrollTop}px)`;
    $gutter.style.transform = `translateY(${-desplazamiento()}px)`;
  }
  const pad = () => parseFloat(getComputedStyle($codigo).paddingTop) || 10;
  function pintarBanda() {
    const { corre, err } = marcasActuales;
    const l = err || corre;
    $banda.className = `banda ${l ? (err ? "err" : "corre") : ""}`;
    if (l && alturas.length >= l) {
      const top = alturas.slice(0, l - 1).reduce((a, b) => a + b, 0);
      $banda.style.top = `${pad() + top - desplazamiento()}px`;
      $banda.style.height = `${alturas[l - 1]}px`;
    }
    [...$gutter.children].forEach((d, i) => d.className = i + 1 === err ? "err" : i + 1 === corre ? "corre" : "");
    sincronizarScroll();
    $codigo.dispatchEvent(new CustomEvent("cmg:marcas"));
  }
  // Localiza el carácter bajo el puntero con las mismas métricas y ajuste de línea del textarea.
  // Así las comillas y los delimitadores contiguos no dependen de dónde deje el caret el navegador.
  // Se copian las propiedades sueltas: con font-variant-ligatures: none el atajo «font» calculado
  // queda vacío y el espejo heredaba la letra proporcional del body (un clic caía en otro argumento).
  const METRICAS_TEXTO = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariantLigatures", "fontFeatureSettings", "fontVariationSettings", "fontKerning",
    "lineHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize", "letterSpacing", "wordSpacing", "textIndent", "textTransform"];
  function caracterCodigo(ev) {
    const r = $codigo.getBoundingClientRect(), cs = getComputedStyle($codigo), espejo = document.createElement("div");
    for (const k of METRICAS_TEXTO) espejo.style[k] = cs[k];
    Object.assign(espejo.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${$codigo.clientWidth}px`, height: `${$codigo.clientHeight}px`, overflow: "hidden", opacity: "0", pointerEvents: "none" });
    const texto = document.createTextNode($codigo.value);
    espejo.append(texto); document.body.append(espejo);
    espejo.scrollTop = $codigo.scrollTop; espejo.scrollLeft = $codigo.scrollLeft;
    const rango = document.createRange();
    let pos = $codigo.selectionStart;
    for (let i = 0; i < texto.length; i++) {
      rango.setStart(texto, i); rango.setEnd(texto, i + 1);
      if ([...rango.getClientRects()].some(c => ev.clientX >= c.left && ev.clientX < c.right && ev.clientY >= c.top && ev.clientY < c.bottom)) { pos = i; break; }
    }
    espejo.remove();
    return pos;
  }
  vida.escuchar($codigo, "mousedown", (ev) => {
    if (ev.button !== 0 || ev.detail < 2) return;
    const rango = rangoCodigo(caracterCodigo(ev), ev.detail >= 3);
    if (!rango) return;
    ev.preventDefault(); $codigo.setSelectionRange(...rango);
  });
  vida.escuchar($codigo, "dblclick", (ev) => {
    const rango = rangoCodigo(caracterCodigo(ev), false);
    if (rango) { ev.preventDefault(); $codigo.setSelectionRange(...rango); }
  });
  vida.escuchar($codigo, "drop", () => { opciones.alArrastrar?.(); $editor.classList.remove("soltar"); vida.setTimeout(seleccionarHueco, 0); });
  vida.observar(new ResizeObserver(() => medirEditor())).observe($codigo);
  vida.escuchar($codigo, "keydown", (ev) => {
    if (ev.key === "Tab") { ev.preventDefault(); insertar(adaptador.sangria.unidad); }
    else if (ev.key === "/" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); alternarComentario(); }
    else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); cmg.alternarEjecucion(); }
    else if (ev.key === "Enter") {
      ev.preventDefault();
      const antes = $codigo.value.slice(0, $codigo.selectionStart);
      const linea = antes.slice(antes.lastIndexOf("\n") + 1);
      insertar("\n" + (adaptador.sangria.alPartirLinea ? adaptador.sangria.alPartirLinea(linea) : linea.match(/^\s*/)[0] + (/\{\s*$/.test(linea) ? "  " : "")));
    }
  });
  // Inserta con execCommand para que Ctrl+Z lo deshaga; si el navegador no lo permite, cambia el valor a mano.
  const tactil = matchMedia("(pointer: coarse)");
  const sinTeclado = () => sinTecladoActivo() || (tactil.matches && document.activeElement !== $codigo);
  function insertar(texto, selDesde, selHasta) {
    if ($codigo.readOnly || opciones.soloLectura?.()) return false;
    const quieto = sinTeclado();
    if (!quieto) $codigo.focus();
    const a = $codigo.selectionStart;
    let ok = false;
    if (!quieto) { try { ok = document.execCommand("insertText", false, texto); } catch { ok = false; } }
    if (!ok) {
      const v = $codigo.value, b = $codigo.selectionEnd;
      $codigo.value = v.slice(0, a) + texto + v.slice(b);
      $codigo.dispatchEvent(new Event("input"));
    }
    if (selDesde != null) $codigo.setSelectionRange(a + selDesde, a + (selHasta ?? selDesde));
    else $codigo.setSelectionRange(a + texto.length, a + texto.length);
    return true;
  }
  function seleccionarHueco() {
    const v = $codigo.value, p = $codigo.selectionEnd;
    const finLinea = v.indexOf("\n", p) < 0 ? v.length : v.indexOf("\n", p);
    const re = new RegExp(RE_HUECO.source, "g"); re.lastIndex = p;
    const m = re.exec(v);
    if (m && m.index < finLinea) $codigo.setSelectionRange(m.index, m.index + m[0].length);
  }

    const alternarComentario = adaptador.comentario.crear({ codigo: $codigo, insertar, sinTeclado });
  function avisoEditor(html) {
    opciones.alAviso?.(html);
    const $a = $("aviso");
    if (!html) { $a.hidden = true; return; }
    $a.innerHTML = html; $a.hidden = false;
    vida.setTimeout(() => { $a.hidden = true; }, 2500);
  }

    let ATAJOS = [];
    const textoAtajo = a => typeof a.b === "function" ? a.b() : a.b;
  const codAtajo = (a) => a.cod || (a.operador ? a.operador.trim() : a.sufijo ? a.sufijo.trim() : a.enLinea ? a.enLinea.trim() : textoAtajo(a).split("\n")[0] + (textoAtajo(a).includes("\n") ? " …" : ""));
  const estiloIcono = (ico) => `--c1:${ico.c1};${ico.c2 ? `--c2:${ico.c2};` : ""}${ico.c3 ? `--c3:${ico.c3};` : ""}`;
  function pintarPaleta() {
    const I = opciones.iconos || window.ICONOS || {};
    cerrarVariantes();
    // Los botones del teléfono (edición, pares y signos) llevan solo-movil: el CSS del anfitrión decide si se ven y,
    // en el teléfono, los pone delante con su separador.
    const movil = ATAJOS.some(a => a && a.movil);
    $("paleta").innerHTML = ATAJOS.map((a, i) => {
      if (a === "|") return `<span class="sep-pal" aria-hidden="true"></span>`;
      if (a.si && !a.si()) return "";
      const ico = I[a.ico] || { svg: "", c1: "#7FA3FF" };
      const mas = a.variantes ? ` · mantén para ${a.variantes.length} variantes` : "";
      return `<button type="button" class="atajo${a.variantes ? " con-variantes" : ""}${a.movil ? " solo-movil" : ""}" data-i="${i}" data-ico="${esc(a.ico)}" aria-label="${esc(a.t + mas)}" data-tip="${esc(a.t)}" data-tip-cod="${esc(codAtajo(a))}"${a.variantes ? ` aria-haspopup="menu"` : ""} style="${estiloIcono(ico)}">${ico.svg}</button>`;
    }).join("") + (movil ? `<span class="sep-pal sep-movil solo-movil" aria-hidden="true"></span>` : "");
  }
  function usarAtajo(a) {
    if ($codigo.readOnly) return avisoEditor("Detén el programa para editarlo.");
    // Teléfono: línea nueva, sangría y borrar son acciones de la barra de edición (edicion.js), no inserciones.
    if (a.accion) return cmg.edicion?.accion?.(a.accion);
    opciones.alAtajo?.();
    if (a.comentar) alternarComentario();
    else if (a.simbolo) {
      // Pares y signos (teléfono): un par rodea lo elegido; si no hay nada, deja el cursor dentro.
      const { ins, sel } = a.simbolo;
      if (sel != null && envolver(ins.slice(0, sel), ins.slice(sel))) return;
      insertar(ins, sel ?? ins.length, sel ?? ins.length);
    }
    else if (a.operador || a.sufijo) insertarOperador(a);
    else if (a.enLinea) {
      // Con la expresión de una sentencia elegida, «const pos = » la toma como valor inicial.
      // Con otra cosa elegida, la declaración va en una línea nueva con su valor por rellenar.
      const x = $codigo.selectionStart !== $codigo.selectionEnd && /=\s*$/.test(a.enLinea) ? expresionEnvolvible() : null;
      if (x) { $codigo.setSelectionRange(x.a, x.b); envolver(a.enLinea, ""); }
      else if ($codigo.selectionStart !== $codigo.selectionEnd && /=\s*$/.test(a.enLinea)) {
        $codigo.setSelectionRange($codigo.selectionEnd, $codigo.selectionEnd);
        insertarBloque(a.enLinea + adaptador.hueco.crear("valor") + (adaptador.finSentencia ?? ";"));
      }
      else insertar(a.enLinea);
    }
    else insertarBloque(textoAtajo(a), a.envolvente);
  }
  // Variantes: mantener pulsado ~0,45 s (o clic derecho) abre un menú encima del atajo.
  // Se puede soltar el dedo directamente sobre una variante o tocarla después.
  const $variantes = document.createElement("div");
  $variantes.className = "variantes"; $variantes.hidden = true; $variantes.setAttribute("role", "menu");
  vida.portal($variantes);
  let pulsado = null, variantesDe = -1, suprimirClic = false;
  function abrirVariantes(b, porPulsacion) {
    const i = +b.dataset.i, a = ATAJOS[i], I = opciones.iconos || window.ICONOS || {};
    if (variantesDe === i && !$variantes.hidden) return;
    variantesDe = i;
    $variantes.innerHTML = [a, ...a.variantes].map((v, j) => {
      const ico = I[v.ico] || { svg: "", c1: "#7FA3FF" };
      return `<button type="button" class="variante${j ? "" : " principal"}" role="menuitem" data-v="${j}" data-tip="${esc(v.t)}" data-tip-cod="${esc(codAtajo(v))}" style="${estiloIcono(ico)}">${ico.svg}<span>${esc(v.t)}</span></button>`;
    }).join("");
    $variantes.hidden = false;
    const r = b.getBoundingClientRect(), m = $variantes.getBoundingClientRect();
    let x = r.left + r.width / 2 - m.width / 2, y = r.top - m.height - 8;
    if (y < 6) y = r.bottom + 8;
    x = Math.max(6, Math.min(innerWidth - m.width - 6, x));
    $variantes.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    b.classList.add("abierto");
    if (porPulsacion && navigator.vibrate) navigator.vibrate(12);
  }
  function cerrarVariantes() {
    if ($variantes.hidden) return;
    $variantes.hidden = true; variantesDe = -1;
    ambito.querySelectorAll(".atajo.abierto").forEach(x => x.classList.remove("abierto"));
  }
  const varianteEn = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest(".variante"); };
  function elegirVariante(boton) {
    const a = ATAJOS[variantesDe], j = +boton.dataset.v;
    cerrarVariantes();
    if (a) usarAtajo(j ? a.variantes[j - 1] : a);
  }
  // pointerdown sin foco: en el teléfono el textarea conserva el foco y el teclado no se cierra.
  vida.escuchar($("paleta"), "pointerdown", (ev) => {
    suprimirClic = false;  // una pulsación nueva no hereda el clic suprimido de una variante
    const b = ev.target.closest(".atajo"); if (!b) return;
    ev.preventDefault();
    const a = ATAJOS[+b.dataset.i];
    if (!a.variantes || ev.button > 0) return;
    pulsado = { b, id: ev.pointerId, x: ev.clientX, y: ev.clientY, abierto: false };
    pulsado.t = vida.setTimeout(() => { if (pulsado) { pulsado.abierto = true; abrirVariantes(b, true); } }, 450);
  });
  vida.escuchar(document, "pointermove", (ev) => {
    if (!pulsado || ev.pointerId !== pulsado.id) return;
    if (!pulsado.abierto) { if (Math.hypot(ev.clientX - pulsado.x, ev.clientY - pulsado.y) > 12) { vida.clearTimeout(pulsado.t); pulsado = null; } return; }
    const v = varianteEn(ev.clientX, ev.clientY);
    $variantes.querySelectorAll(".variante").forEach(x => x.classList.toggle("activa", x === v));
  });
  const soltarPulsado = (ev) => {
    if (!pulsado || ev.pointerId !== pulsado.id) return;
    vida.clearTimeout(pulsado.t);
    if (pulsado.abierto) {
      suprimirClic = true;
      const v = ev.type === "pointerup" && varianteEn(ev.clientX, ev.clientY);
      if (v) elegirVariante(v);
    }
    pulsado = null;
  };
  vida.escuchar(document, "pointerup", soltarPulsado);
  vida.escuchar(document, "pointercancel", soltarPulsado);
  vida.escuchar($("paleta"), "contextmenu", (ev) => {
    const b = ev.target.closest(".atajo.con-variantes"); if (!b) return;
    ev.preventDefault();
    if (pulsado) { vida.clearTimeout(pulsado.t); pulsado.abierto = true; }
    abrirVariantes(b, false);
  });
  vida.escuchar($variantes, "pointerdown", (ev) => ev.preventDefault());
  vida.escuchar($variantes, "click", (ev) => { const v = ev.target.closest(".variante"); if (v) elegirVariante(v); });
  vida.escuchar(document, "pointerdown", (ev) => { if (!$variantes.hidden && !ev.target.closest(".variantes, .atajo.abierto")) cerrarVariantes(); }, true);
  vida.escuchar(document, "keydown", (ev) => { if (ev.key === "Escape") cerrarVariantes(); });
  // Desplazar la paleta nunca abre las variantes: si el dedo empieza a mover la tira, la pulsación larga se anula.
  vida.escuchar($("paleta"), "scroll", () => {
    if (pulsado && !pulsado.abierto) { vida.clearTimeout(pulsado.t); pulsado = null; }
    cerrarVariantes();
  }, { passive: true });
  vida.escuchar($("paleta"), "click", (ev) => {
    const b = ev.target.closest(".atajo"); if (!b) return;
    if (suprimirClic) { suprimirClic = false; return; }
    cerrarVariantes();
    usarAtajo(ATAJOS[+b.dataset.i]);
  });


    const simbolos = $("simbolos"), TECLAS = adaptador.teclas;
    simbolos.innerHTML = TECLAS.map((k, i) => k === "|" ? '<span class="sep-pal" aria-hidden="true"></span>'
      : `<button type="button" data-i="${i}" class="${k.cls || ""}" aria-label="${k.n || k.t}">${k.t}</button>`).join("");
    vida.escuchar(simbolos, "pointerdown", ev => { if (ev.target.closest("button")) ev.preventDefault(); });
    vida.escuchar(simbolos, "click", ev => {
      const b = ev.target.closest("button[data-i]"); if (!b) return;
      const k = TECLAS[+b.dataset.i];
      if (k.ocultar) return $codigo.blur();
      if (k.comentar) return alternarComentario();
      if (k.mover) { const p = Math.max(0, Math.min($codigo.value.length, $codigo.selectionStart + k.mover)); return $codigo.setSelectionRange(p,p); }
      const texto = k.ins ?? k.t;
      if (k.sel != null && envolver(texto.slice(0,k.sel), texto.slice(k.sel))) return;
      insertar(texto,k.sel,k.sel);
    });
    return { insertar, envolver, alternarComentario, medirEditor, pintarResaltado, pintarBanda, seleccionarHueco, aviso: avisoEditor,
      atajos(datos) { ATAJOS = datos; pintarPaleta(); } };
  }
  window.CMGEditorUI = { crear };
})();
