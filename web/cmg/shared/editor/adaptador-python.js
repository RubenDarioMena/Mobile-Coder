/* Adaptador Python (E4): sintaxis, sangría significativa, huecos __tipo__, plantillas y teclas.
 * Solo edita. Ejecutar Python es del anfitrión (en el juego, shared/python/traductor.js). */
(() => {
  "use strict";
  const P = window.CMGEditorPython, E = window.ESTRUCTURA_PYTHON;
  const estructura = { ...E, analizar: (src, fichas = P.lexico(src)) => E.analizar(src, fichas) };
  window.CMGAdaptadorPython = {
    id: "python", nombre: "Python", lexico: P.lexico, clasificar: P.clasificar, estructura,
    hueco: { re: P.RE_HUECO, crear: P.aHueco, nombreDe: P.nombreDe },
    comentario: { linea: "#", crear: P.crearComentario },
    sangria: { unidad: P.UNIDAD, significativa: true, abre: P.abre, alPartirLinea: P.alPartirLinea, niveles: P.niveles, rellenar: P.rellenar },
    get plantillas() { try { return P.plantillas().atajos; } catch (e) { console.error("Plantillas Python no disponibles:", e); return []; } },
    crearPlantillas: P.plantillas,
    teclas: P.TECLAS, crearEdicion: P.crearEdicion, edicion: P.EDICION, finSentencia: "",
    llamada: fn => window.CMGLenguajes.llamada(fn, "python"),
  };
})();
