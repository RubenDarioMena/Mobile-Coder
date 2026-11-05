/* Consola: la salida del programa como en una terminal (los trozos sin salto de línea siguen en la misma línea)
 * y notas de la app (inicio, fin, errores). Pinta por cuadros de animación, así un bucle que imprime mucho
 * no bloquea la interfaz, y conserva las últimas MAXIMO líneas. */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const MAXIMO = 3000;

  function crear(el, { alLinea } = {}) {
    let entradas = [], pendientes = new Set(), cuadro = 0;
    const pegada = () => el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    function pintar() {
      cuadro = 0;
      const abajo = pegada();
      for (const e of pendientes) {
        if (!e.nodo) {
          e.nodo = document.createElement("div");
          e.nodo.className = "c-linea c-" + e.clase;
          if (e.linea) {
            e.nodo.classList.add("con-linea"); e.nodo.tabIndex = 0; e.nodo.setAttribute("role", "button");
            e.nodo.addEventListener("click", () => alLinea && alLinea(e.linea));
            e.nodo.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); alLinea && alLinea(e.linea); } });
          }
          el.append(e.nodo);
        }
        e.nodo.textContent = e.texto;
      }
      pendientes.clear();
      if (entradas.length > MAXIMO) {
        const fuera = entradas.splice(0, entradas.length - MAXIMO + 500);
        for (const e of fuera) e.nodo && e.nodo.remove();
      }
      if (abajo) el.scrollTop = el.scrollHeight;
    }
    const marcar = (e) => { pendientes.add(e); if (!cuadro) cuadro = requestAnimationFrame(pintar); };
    const nueva = (clase, extra = {}) => { const e = { clase, texto: "", abierta: true, ...extra }; entradas.push(e); return e; };
    return {
      // Texto del programa: clase "salida" (stdout, console.log), "info", "aviso" o "error" (stderr, console.error).
      escribir(clase, texto) {
        const partes = String(texto).replace(/\r\n?/g, "\n").split("\n");
        partes.forEach((p, i) => {
          const conSalto = i < partes.length - 1;
          if (p === "" && !conSalto) return;
          let e = entradas[entradas.length - 1];
          if (!e || !e.abierta || e.clase !== clase) e = nueva(clase);
          e.texto += p;
          if (conSalto) e.abierta = false;
          marcar(e);
        });
      },
      // Nota de la app: "inicio", "ok", "fallo" o "detenido". Con linea, tocarla lleva a esa línea del código.
      nota(clase, texto, linea = null) {
        const e = nueva(clase, { abierta: false, linea });
        e.texto = texto; marcar(e);
      },
      limpiar() {
        entradas = []; pendientes.clear();
        if (cuadro) cancelAnimationFrame(cuadro), (cuadro = 0);
        el.replaceChildren();
      },
      get vacia() { return entradas.length === 0; },
      texto: () => entradas.map((e) => e.texto).join("\n"),
    };
  }
  MC.consola = { crear };
})();
