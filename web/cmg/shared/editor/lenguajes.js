/* Lenguajes del editor y contrato D1/D2. Las reglas de nombres llegan como datos del proveedor.
 *
 * Un lenguaje del editor es lo que el componente sabe editar: lo define su adaptador
 * (léxico, estructura, huecos, sangría, plantillas, teclas). Ejecutarlo no es cosa del editor:
 * el juego lo traduce a JS para su Worker; otra aplicación puede usar su propio motor.
 * Este catálogo solo da nombres y datos de presentación de los lenguajes de este proyecto;
 * un anfitrión puede traer adaptadores propios sin tocarlo (se usa adaptador.nombre). */
(() => {
  "use strict";
  const python = Object.freeze({ awaitExplicito: true, asyncDef: true, awaitSuperior: true });
  const catalogo = Object.freeze({
    js: Object.freeze({ id: "js", nombre: "JavaScript", corto: "JS", extension: ".js", comentario: "//" }),
    python: Object.freeze({ id: "python", nombre: "Python", corto: "Py", extension: ".py", comentario: "#" }),
  });
  // Datos de presentación de un lenguaje con adaptador: los del catálogo o, si no está, los del adaptador.
  function describir(id, adaptador) {
    const c = catalogo[id];
    const nombre = c?.nombre || adaptador?.nombre || id;
    return { id, nombre, corto: c?.corto || nombre, extension: c?.extension || "", comentario: c?.comentario || adaptador?.comentario?.linea || "" };
  }
  // Los lenguajes que una instancia ofrece: los pedidos (o todos sus adaptadores) que tienen adaptador.
  function disponibles(adaptadores = {}, pedidos = Object.keys(adaptadores)) {
    return [...new Set(pedidos)].filter(id => adaptadores[id]).map(id => describir(id, adaptadores[id]));
  }
  function llamada(fn, lenguaje = "js") {
    const nombre = fn.nombres?.[lenguaje] || fn.nombre;
    const objeto = fn.objeto ? fn.objeto + "." : "";
    const argumentos = (fn.firma || []).map(n => lenguaje === "python"
      ? "__" + n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_") + "__"
      : "/* " + n + " */");
    const inicio = (fn.await ? "await " : "") + objeto + nombre + "(";
    const texto = inicio + argumentos.join(", ") + ")" + (lenguaje === "python" ? "" : ";");
    return { texto, sel: [inicio.length, inicio.length + (argumentos[0]?.length || 0)] };
  }
  window.CMGLenguajes = { python, catalogo, describir, disponibles, llamada };
})();
