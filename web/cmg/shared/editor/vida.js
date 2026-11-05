/* Recursos de una instancia: no modifica prototipos ni registra estado global. */
(() => {
  "use strict";
  function crear(raiz, ambito = raiz, globales = false) {
    const abortar = new AbortController(), tareas = new Set(), cuadros = new Set(), portales = new Set(), observers = new Set();
    let destruida = false;
    const propia = ev => globales || ambito.contains(ev.target) || ambito.contains(document.activeElement);
    const api = {
      get destruida() { return destruida; },
      escuchar(destino, tipo, fn, opciones = {}) {
        if (!destino || destruida) return;
        const opt = typeof opciones === "boolean" ? { capture: opciones } : opciones;
        const filtrar = destino === document && ["keydown", "click", "copy", "cut", "paste"].includes(tipo);
        destino.addEventListener(tipo, ev => { if (!destruida && (!filtrar || (tipo === "click" ? ambito.contains(ev.target) : propia(ev)))) fn(ev); }, { ...opt, signal: abortar.signal });
      },
      setTimeout(fn, ms, ...args) {
        if (destruida) return 0;
        const id = setTimeout(() => { tareas.delete(id); if (!destruida) fn(...args); }, ms); tareas.add(id); return id;
      },
      clearTimeout(id) { tareas.delete(id); clearTimeout(id); },
      requestAnimationFrame(fn) {
        if (destruida) return 0;
        const id = requestAnimationFrame(t => { cuadros.delete(id); if (!destruida) fn(t); }); cuadros.add(id); return id;
      },
      cancelAnimationFrame(id) { cuadros.delete(id); cancelAnimationFrame(id); },
      queueMicrotask(fn) { queueMicrotask(() => { if (!destruida) fn(); }); },
      portal(nodo) { if (!destruida) { raiz.append(nodo); portales.add(new WeakRef(nodo)); } return nodo; },
      observar(observer) { observers.add(observer); return observer; },
      destruir() {
        if (destruida) return;
        destruida = true; abortar.abort();
        for (const id of tareas) clearTimeout(id);
        for (const id of cuadros) cancelAnimationFrame(id);
        for (const o of observers) o.disconnect();
        for (const ref of portales) ref.deref()?.remove();
        tareas.clear(); cuadros.clear(); observers.clear(); portales.clear();
      },
    };
    return api;
  }
  window.CMGEditorVida = { crear };
})();
