/* Hoja inferior (consola). Misma interacción que la ficha ⓘ del teléfono en Code Battle Lite
 * (Prototypes/Rocket Launcher/js/layout.js, commit 56435c7), con su propio marcado:
 * - cerrada, una pestaña con una flecha en la esquina inferior derecha del código, apoyada en la barra de edición;
 * - abierta, una hoja del ancho del código que empieza en la mitad de la pantalla (CSS);
 * - el asa de arriba cambia el alto, que se guarda como fracción del código: así se adapta al teclado y se recuerda;
 * - la flecha hacia abajo, Escape o soltar el asa casi abajo la cierran (sin olvidar el alto).
 * Tocar el código no la cierra. Mientras está cerrada, la pestaña marca la salida nueva. */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const MIN_PX = 96, CERRAR_PX = 72;
  const fraccion = (f) => (Number.isFinite(f) ? Math.min(1, Math.max(0.15, f)) : null);

  function crear({ contenedor, plantilla, leer, escribir, alCambiar = () => {} }) {
    contenedor.append(plantilla.content.cloneNode(true));
    const $abrir = contenedor.querySelector(".hoja-abrir"), $hoja = contenedor.querySelector(".hoja");
    const $asa = $hoja.querySelector(".hoja-asa"), $cerrar = $hoja.querySelector("#b-cerrar-hoja");
    let alto = fraccion(leer("hoja-alto", null));
    const aplicarAlto = (f = alto) => (f == null ? $hoja.style.removeProperty("--hoja-alto") : $hoja.style.setProperty("--hoja-alto", `${(f * 100).toFixed(2)}%`));
    aplicarAlto();

    function abrir() {
      if (!$hoja.hidden) return;
      $hoja.hidden = false; $abrir.setAttribute("aria-expanded", "true"); $abrir.classList.remove("con-nuevo");
      alCambiar(true);
    }
    function cerrar() {
      if ($hoja.hidden) return;
      $hoja.hidden = true; $abrir.setAttribute("aria-expanded", "false");
      alCambiar(false);
    }
    // Los botones no se quedan el foco: si el código lo tenía, el teclado sigue abierto.
    for (const b of [$abrir, $cerrar, $hoja.querySelector("#b-limpiar")]) b.addEventListener("pointerdown", (ev) => ev.preventDefault());
    $abrir.addEventListener("click", abrir);
    $cerrar.addEventListener("click", cerrar);
    $hoja.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.preventDefault(); cerrar(); $abrir.focus(); } });

    let arrastre = null;
    $asa.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      ev.preventDefault();   // el código conserva el foco: el teclado no se cierra
      try { $asa.setPointerCapture(ev.pointerId); } catch { /* sin captura bastan los eventos del asa */ }
      const r = $hoja.getBoundingClientRect();
      arrastre = { id: ev.pointerId, desfase: ev.clientY - r.top, alto: r.height };
      $hoja.classList.add("arrastrando");
    });
    $asa.addEventListener("pointermove", (ev) => {
      if (!arrastre || ev.pointerId !== arrastre.id) return;
      const e = contenedor.getBoundingClientRect();
      const a = Math.max(0, Math.min(e.height - 30, e.bottom - (ev.clientY - arrastre.desfase)));
      arrastre.alto = a;
      // Durante el arrastre puede bajar del mínimo: así se ve que soltarla ahí la cierra.
      $hoja.style.minHeight = "0px";
      aplicarAlto(a / e.height);
      $hoja.classList.toggle("por-cerrar", a < CERRAR_PX);
    });
    function soltar(ev) {
      if (!arrastre || ev.pointerId !== arrastre.id) return;
      const a = arrastre.alto, e = contenedor.getBoundingClientRect();
      arrastre = null;
      $hoja.classList.remove("arrastrando", "por-cerrar");
      $hoja.style.removeProperty("min-height");
      if (a < CERRAR_PX) { aplicarAlto(); cerrar(); return; }
      alto = fraccion(Math.max(a, MIN_PX) / e.height);
      aplicarAlto(); escribir("hoja-alto", alto);
    }
    $asa.addEventListener("pointerup", soltar);
    $asa.addEventListener("pointercancel", soltar);
    $asa.addEventListener("lostpointercapture", soltar);
    $asa.addEventListener("keydown", (ev) => {
      const d = { ArrowUp: 0.05, ArrowDown: -0.05, PageUp: 0.2, PageDown: -0.2 }[ev.key];
      if (d == null) return;
      ev.preventDefault();
      alto = fraccion((alto ?? $hoja.getBoundingClientRect().height / contenedor.getBoundingClientRect().height) + d);
      aplicarAlto(); escribir("hoja-alto", alto);
    });

    return {
      abrir, cerrar,
      get abierta() { return !$hoja.hidden; },
      // Salida nueva con la hoja cerrada: un punto en la pestaña.
      avisar() { if ($hoja.hidden) $abrir.classList.add("con-nuevo"); },
    };
  }
  MC.hoja = { crear };
})();
