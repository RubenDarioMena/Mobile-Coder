/* Tooltips rápidos de la página: el nombre de los iconos al pasar el cursor o al tocarlos.
 * Antes vivían en layout.js de War; ahora los usan el juego y cualquier editor autónomo.
 * Son de la página, no de una instancia: crear() escucha el documento y adquirir()/soltar()
 * comparten un único tooltip entre los editores autónomos. La paleta y su menú de variantes
 * se buscan en el editor del elemento, así varios editores en una página no se confunden. */
(() => {
  "use strict";
  function crear({ tip } = {}) {
    const propio = !tip;
    if (propio) { tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; tip.setAttribute("role", "tooltip"); document.body.append(tip); }
    const abortar = new AbortController(), opt = { signal: abortar.signal };
    let tipDe = null, tipT = 0, tipFuera = 0;
    const vigiladas = new WeakSet(), vigias = [];
    const ambitoDe = el => el.closest(".cmg-editor") || document;
    function mostrarTip(el) {
      tipDe = el;
      const cod = el.dataset.tipCod;
      tip.innerHTML = `<b></b>${cod ? "<code></code>" : ""}`;
      tip.querySelector("b").textContent = el.dataset.tip;
      if (cod) tip.querySelector("code").textContent = cod;
      tip.hidden = false;
      const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
      let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 8;
      // Paleta y variantes: el nombre queda debajo de la paleta y del menú de variantes, sin taparlos.
      const ambito = ambitoDe(el);
      const pal = el.closest(".paleta") || (el.closest(".variantes") && ambito.querySelector(".paleta:not([hidden])"));
      if (pal) {
        const v = ambito.querySelector(".variantes:not([hidden])");
        const piso = Math.max(r.bottom, pal.getBoundingClientRect().bottom, v ? v.getBoundingClientRect().bottom : 0) + 8;
        y = piso + t.height <= innerHeight - 4 ? piso : Math.max(4, Math.min(r.top, v ? v.getBoundingClientRect().top : r.top) - t.height - 8);
        vigilarVariantes(ambito);
      } else if (y < 4) y = r.bottom + 8;
      x = Math.max(6, Math.min(innerWidth - t.width - 6, x));
      tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    function ocultarTip() { clearTimeout(tipT); tipDe = null; tip.hidden = true; }
    // Si el menú de variantes se abre o se cierra con el nombre visible, el nombre se recoloca.
    function vigilarVariantes(ambito) {
      const v = ambito.querySelector(".variantes");
      if (!v || vigiladas.has(v)) return;
      vigiladas.add(v);
      const o = new MutationObserver(() => { if (tipDe && !tip.hidden && tipDe.isConnected) mostrarTip(tipDe); });
      o.observe(v, { attributes: true, attributeFilter: ["hidden"] }); vigias.push(o);
    }
    document.addEventListener("pointerover", (ev) => {
      if (ev.pointerType === "touch") return;
      const el = ev.target.closest("[data-tip]");
      if (el === tipDe) return;
      clearTimeout(tipT);
      if (!el) { ocultarTip(); return; }
      tipT = setTimeout(() => mostrarTip(el), tip.hidden ? 70 : 0);
    }, opt);
    document.addEventListener("pointerdown", (ev) => {
      const el = ev.target.closest && ev.target.closest("[data-tip]");
      if (ev.pointerType !== "touch") { if (!el) ocultarTip(); return; }
      if (!el) { ocultarTip(); return; }
      mostrarTip(el);
      el.classList.add("vivo");
      clearTimeout(tipFuera);
      tipFuera = setTimeout(() => { el.classList.remove("vivo"); if (tipDe === el) ocultarTip(); }, 900);
    }, opt);
    addEventListener("blur", ocultarTip, opt);
    return {
      tip, mostrar: mostrarTip, ocultar: ocultarTip,
      destruir() {
        abortar.abort(); clearTimeout(tipT); clearTimeout(tipFuera);
        for (const o of vigias) o.disconnect();
        vigias.length = 0; tipDe = null;
        if (propio) tip.remove(); else tip.hidden = true;
      },
    };
  }
  // Un solo tooltip para todos los editores autónomos de la página; el último en soltarlo lo retira.
  let compartido = null, usos = 0;
  function adquirir() {
    if (!compartido) compartido = crear();
    usos++;
    let suelto = false;
    return () => { if (suelto) return; suelto = true; if (--usos === 0) { compartido.destruir(); compartido = null; } };
  }
  window.CMGTips = { crear, adquirir, get activo() { return compartido; } };
})();
