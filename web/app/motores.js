/* Motores de ejecución: arrancan, detienen e informan. Cada lenguaje corre en su Worker (app/motor-js.js y
 * app/motor-python.js), fuera del hilo de la interfaz: un bucle infinito no congela el editor y ■ lo corta.
 * Estado: "inactivo", "corriendo". Python además informa de su carga ("cargando", "listo", "fallo"). */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const segundos = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1).replace(".", ",")} s`);

  function crear({ consola, alEstado = () => {}, alError = () => {}, alPython = () => {} }) {
    let estado = "inactivo", actual = null;   // actual: { lenguaje, worker?, inicio, archivo, revision }
    const poner = (e) => { estado = e; alEstado(e, actual); };

    // Un error en la consola: el mensaje, su pila y una nota que lleva a la línea. e: { nombre, mensaje, pila?, linea?
    // (del archivo abierto), destino? ({ ruta, linea } donde ocurrió) o ruta + linea (de otro archivo) }.
    function informar(datos, e) {
      const destino = e.destino || (e.ruta && e.ruta !== datos.archivo ? { ruta: e.ruta, linea: e.linea } : null);
      const linea = e.ruta && e.ruta !== datos.archivo ? null : e.linea;
      consola.escribir("error", `${e.nombre}: ${e.mensaje}\n` + (e.pila && e.pila.length ? e.pila.join("\n") + "\n" : ""));
      if (linea) alError(linea, datos);
      const fuera = destino && destino.ruta !== datos.archivo ? destino : null;
      const donde = fuera ? ` en ${fuera.ruta}${fuera.linea ? ":" + fuera.linea : ""}` : linea ? ` en la línea ${linea}` : "";
      consola.nota("fallo", `✗ ${e.nombre}${donde}`, fuera && fuera.linea ? fuera : linea);
    }

    // ---------- JavaScript: un Worker nuevo en cada ejecución ----------
    let workerJS = null;
    function ejecutarJS(doc) {
      if (workerJS) workerJS.terminate();
      // Los import del proyecto: el grafo de módulos (app/modulos.js). Un fallo aquí no llega a arrancar el motor.
      const grafo = MC.modulos.preparar(doc.archivo, { ...doc.archivos, [doc.archivo]: doc.texto });
      const datos = { lenguaje: "js", inicio: performance.now(), archivo: doc.archivo, revision: doc.revision };
      if (!grafo.ok) {
        // Un import que no se encuentra (o circular, o un paquete de npm): se informa sin arrancar el motor.
        // ejecutar() pone «corriendo» al volver; el final llega en la tarea siguiente.
        actual = datos;
        informar(datos, grafo.error);
        setTimeout(() => { if (actual === datos) { actual = null; poner("inactivo"); } });
        return;
      }
      const w = (workerJS = new Worker("app/motor-js.js", { type: "module" }));
      datos.worker = w;
      // Si acorn vio un error de sintaxis, se ejecuta igual (acorn puede no conocer sintaxis nueva) y, si el motor
      // confirma un SyntaxError sin decir dónde, se usa la línea de acorn.
      const sintaxis = grafo.modulos.find((x) => x.sintaxis);
      let errores = 0;
      w.onmessage = (ev) => {
        const m = ev.data;
        if (w !== workerJS) return;
        if (m.tipo === "salida") consola.escribir(m.clase, m.texto);
        else if (m.tipo === "limpiar") consola.limpiar();
        else if (m.tipo === "error") {
          errores++;
          // El navegador no dice dónde está un error de sintaxis de un módulo; acorn (del editor) sí.
          if (m.nombre === "SyntaxError" && !m.linea && !m.destino && sintaxis) informar(datos, { nombre: m.nombre, mensaje: m.mensaje, ruta: sintaxis.ruta, linea: sintaxis.sintaxis.linea });
          else informar(datos, { nombre: m.nombre, mensaje: m.mensaje, pila: m.pila, linea: m.linea, destino: m.destino });
        } else if (m.tipo === "fin") {
          if (actual !== datos) return;
          // Con errores, el ✗ ya lo dijo: el final queda como nota neutra.
          consola.nota(errores ? "fin" : "ok", `${errores ? "" : "✓ "}Terminado en ${segundos(performance.now() - datos.inicio)}`);
          actual = null; poner("inactivo");
        }
      };
      w.onerror = (ev) => {
        ev.preventDefault();
        if (actual !== datos) return;
        consola.nota("fallo", "✗ El motor de JavaScript no pudo arrancar: " + (ev.message || "error"));
        actual = null; poner("inactivo");
      };
      actual = datos;
      w.postMessage({ tipo: "ejecutar", codigo: doc.texto, archivo: doc.archivo, modulos: grafo.modulos.map(({ ruta, texto, deps }) => ({ ruta, texto, deps })) });
    }

    // ---------- Python: un Worker que se carga una vez y se reutiliza ----------
    let workerPy = null, py = { estado: "sin cargar", version: "", ms: 0 }, siguiente = 0, enCola = null;
    const avisarPython = (e) => { py = { ...py, ...e }; alPython(py); };
    function crearPython() {
      const w = (workerPy = new Worker("app/motor-python.js", { type: "module" }));
      avisarPython({ estado: "cargando" });
      const t0 = performance.now();
      w.onmessage = (ev) => {
        const m = ev.data;
        if (w !== workerPy) return;
        if (m.tipo === "listo") {
          avisarPython({ estado: "listo", version: m.version, ms: m.ms || Math.round(performance.now() - t0) });
          if (enCola) { const d = enCola; enCola = null; enviarPython(d); }
        } else if (m.tipo === "fallo") falloCarga(m.mensaje);
        else if (m.tipo === "salida") consola.escribir(m.clase, m.texto);
        else if (m.tipo === "fin") {
          if (!actual || actual.id !== m.id) return;
          if (m.ok) consola.nota("ok", `✓ Terminado en ${segundos(performance.now() - actual.inicio)}`);
          else {
            consola.escribir("error", m.error.texto + "\n");
            if (m.error.linea) alError(m.error.linea, actual);
            const tipo = (/(\w+(?:Error|Exception|Interrupt|Exit|Warning)|StopIteration)\b[^\n]*$/.exec(m.error.texto) || [])[1] || "Error";
            const d = m.error.destino, fuera = d && d.ruta !== actual.archivo ? d : null;
            consola.nota("fallo", fuera ? `✗ ${tipo} en ${fuera.ruta}:${fuera.linea}` : m.error.linea ? `✗ ${tipo} en la línea ${m.error.linea}` : `✗ ${tipo}`, fuera || m.error.linea);
          }
          actual = null; poner("inactivo");
        }
      };
      // Un error al cargar el módulo (o uno que escapa del Worker) deja a Python sin motor: se avisa y se libera la ejecución.
      w.onerror = (ev) => { ev.preventDefault(); if (w === workerPy) falloCarga(ev.message || "error del Worker"); };
    }
    function falloCarga(mensaje) {
      avisarPython({ estado: "fallo", mensaje });
      if (enCola || (actual && actual.lenguaje === "python")) {
        consola.nota("fallo", "✗ Python no pudo cargarse: " + mensaje);
        enCola = null; actual = null; poner("inactivo");
      }
    }
    function enviarPython(doc) {
      actual.id = ++siguiente;
      workerPy.postMessage({ tipo: "ejecutar", id: actual.id, codigo: doc.texto, archivo: doc.archivo, archivos: doc.archivos || {} });
    }
    function ejecutarPython(doc) {
      if (!workerPy || py.estado === "fallo") crearPython();
      actual = { lenguaje: "python", inicio: performance.now(), archivo: doc.archivo, revision: doc.revision };
      if (py.estado === "listo") enviarPython(doc);
      else { enCola = doc; consola.nota("info", "Python se está cargando…"); }
    }

    return {
      get estado() { return estado; },
      get python() { return { ...py }; },
      // doc: { lenguaje: "js" | "python", texto, archivo (su ruta en el proyecto), revision, archivos ({ ruta: texto } del proyecto) }
      ejecutar(doc) {
        if (estado === "corriendo") this.detener();
        consola.nota("inicio", `▶ ${doc.archivo}`);
        if (doc.lenguaje === "python") ejecutarPython(doc); else ejecutarJS(doc);
        poner("corriendo");
      },
      detener() {
        if (estado !== "corriendo" || !actual) return;
        const ms = performance.now() - actual.inicio;
        if (actual.lenguaje === "js") { workerJS && workerJS.terminate(); workerJS = null; }
        else {
          // Python no se puede interrumpir sin memoria compartida: se descarta el Worker y se carga otro.
          workerPy && workerPy.terminate(); workerPy = null; enCola = null;
          avisarPython({ estado: "sin cargar" });
          crearPython();
        }
        consola.nota("detenido", `■ Detenido a los ${segundos(ms)}`);
        actual = null; poner("inactivo");
      },
      // Python tarda unos segundos en cargar: se adelanta cuando se abre un archivo .py.
      precargarPython() { if (!workerPy) crearPython(); },
    };
  }
  MC.motores = { crear, segundos };
})();
