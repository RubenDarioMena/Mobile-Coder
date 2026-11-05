/* Mobile Coder: arranque y cableado de la interfaz.
 * El editor es el componente compartido de Code Battle Lite (CMGEditor, en web/cmg/) en forma de teléfono;
 * esta app aporta lo que en el juego pone su propia interfaz: barra superior, hoja de consola, archivos,
 * ajuste al teclado, la ejecución (app/motores.js), HTML y CSS (app/editor-web.js) y los servicios de lenguaje
 * (app/inteligencia.js), que ven todo el proyecto (app/proyecto.js). */
(async () => {
  "use strict";
  const MC = window.MC;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const leer = (k, d) => { try { const v = localStorage.getItem("mc-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const escribir = (k, v) => { try { localStorage.setItem("mc-" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
  const NOMBRES = { js: "JavaScript", python: "Python", html: "HTML", css: "CSS" };
  const CHIP = { js: "JS", python: "PY", html: "HTML", css: "CSS" };
  const EJECUTABLE = { js: true, python: true };   // HTML y CSS: la vista previa llega después

  // ---------- Ajuste al teclado ----------
  // En Android el envoltorio encoge la WebView con el teclado. En un navegador, el viewport visual manda:
  // la app ocupa lo visible y las barras del editor quedan justo encima del teclado.
  const $ide = $("ide"), vv = window.visualViewport;
  function ajustarAlto() {
    if (!vv) return;
    $ide.style.setProperty("--alto-visible", Math.round(vv.height) + "px");
    $ide.style.setProperty("--arriba-visible", Math.round(vv.offsetTop) + "px");
  }
  if (vv) { vv.addEventListener("resize", ajustarAlto); vv.addEventListener("scroll", ajustarAlto); }
  ajustarAlto();

  // ---------- Editor compartido ----------
  const funciones = {
    js: [
      ...["log", "info", "warn", "error"].map((nombre) => ({ grupo: "Consola", objeto: "console", nombre, firma: ["mensaje"] })),
      ...[["round", ["x"]], ["floor", ["x"]], ["ceil", ["x"]], ["random", []], ["max", ["a", "b"]], ["min", ["a", "b"]], ["abs", ["x"]], ["sqrt", ["x"]]]
        .map(([nombre, firma]) => ({ grupo: "Math", objeto: "Math", nombre, firma })),
    ],
    python: [
      { grupo: "Consola", nombre: "print", firma: ["valor"] },
      ...[["len", ["x"]], ["range", ["fin"]], ["int", ["x"]], ["float", ["x"]], ["str", ["x"]], ["list", ["x"]], ["sum", ["valores"]],
        ["min", ["valores"]], ["max", ["valores"]], ["abs", ["x"]], ["round", ["x"]], ["sorted", ["valores"]], ["enumerate", ["valores"]], ["zip", ["a", "b"]]]
        .map(([nombre, firma]) => ({ grupo: "Funciones", nombre, firma })),
    ],
  };
  const proveedor = {
    funciones: (l = "js") => funciones[l] || [],
    vocabulario: (l = "js") => ({ objetos: l === "js" ? ["console", "Math"] : [], funciones: (funciones[l] || []).map((f) => f.nombre), propiedades: [] }),
  };
  const preferencias = { leer: (k, d) => leer("editor-" + k, d), escribir: (k, v) => escribir("editor-" + k, v) };
  let actual = null;   // archivo abierto: { proyecto, ruta, lenguaje, guardado }
  const raiz = $("raiz-editor");
  const editor = CMGEditor.crear({
    raiz, forma: "movil", proveedor, preferencias,
    adaptadores: { js: window.CMGAdaptadorJS, python: window.CMGAdaptadorPython, html: window.MCLenguajesWeb.html, css: window.MCLenguajesWeb.css },
    iconos: { ...window.ICONOS, ...window.MCLenguajesWeb.iconos },
    documento: { id: "inicio", lenguaje: "python", texto: "" },
    soloLectura: () => !actual,
    alCambiar: (d) => { if (actual && indice) indice.poner(actual.ruta, d.texto, { silencio: true }); programarGuardado(); },
    alEjecutar: () => alternarEjecucion(),
  });
  window.MC.editor = editor;
  const pieza = (id) => raiz.querySelector(`[data-editor="${id}"]`);
  const $codigo = editor.codigo;
  // Como en el juego: la barra de símbolos no aparece al escribir (pares y signos están en la barra de inserción).
  pieza("simbolos").hidden = true;

  // ---------- Consola y motores ----------
  const hoja = MC.hoja.crear({ contenedor: pieza("editor"), plantilla: $("plantilla-hoja"), leer, escribir });
  // Una nota con línea lleva a ella; si es de otro archivo del proyecto, lo abre (Atrás vuelve).
  const consola = MC.consola.crear($("consola"), { alLinea: (d) => { if (typeof d === "number") editor.irALinea(d); else if (d && d.ruta) inteligencia.saltar(d); } });
  const $estadoMotor = $("motor-estado");
  const pintarEstadoMotor = () => {
    if (!actual) { $estadoMotor.textContent = ""; return; }
    if (actual.lenguaje !== "python") { $estadoMotor.textContent = EJECUTABLE[actual.lenguaje] ? NOMBRES[actual.lenguaje] : ""; delete $estadoMotor.dataset.estado; return; }
    const p = motores.python;
    $estadoMotor.textContent = p.estado === "listo" ? `Python ${p.version}` : p.estado === "cargando" ? "Python · cargando…" : p.estado === "fallo" ? "Python · no cargó" : "Python";
    $estadoMotor.dataset.estado = p.estado;
  };
  const $ejecutar = $("b-ejecutar");
  const motores = MC.motores.crear({
    consola,
    alEstado: (e) => {
      const corriendo = e === "corriendo";
      $ejecutar.classList.toggle("corriendo", corriendo);
      $ejecutar.setAttribute("aria-label", corriendo ? "Detener" : "Ejecutar");
      $ejecutar.dataset.tip = corriendo ? "Detener" : "Ejecutar";
      document.body.dataset.ejecutando = String(corriendo);
    },
    alError: (linea, run) => { if (run) { marcaEjecucion = { revision: run.revision, linea }; pintarMarcas(); } },
    alPython: pintarEstadoMotor,
  });
  // Lo que se escribe con la hoja cerrada marca la pestaña.
  new MutationObserver(() => hoja.avisar()).observe($("consola"), { childList: true });

  // La línea marcada en el código: el error de la última ejecución o, si no hay, el primer error de los servicios.
  let marcaEjecucion = null, marcaProblemas = null;
  function pintarMarcas() {
    const rev = editor.documento().revision;
    const l = (marcaEjecucion && marcaEjecucion.revision === rev && marcaEjecucion.linea) || (marcaProblemas && marcaProblemas.revision === rev && marcaProblemas.linea);
    editor.marcas(rev, l ? [{ clase: "err", linea: l }] : []);
  }
  async function ejecutar() {
    if (!actual) return;
    if (!EJECUTABLE[actual.lenguaje]) {
      hoja.abrir(); pestana("consola");
      consola.nota("info", "La vista previa de HTML y CSS llega en una próxima entrega. Lo que falta o falla en la página está en Problemas.");
      return;
    }
    await guardar();
    const doc = editor.documento();
    marcaEjecucion = null; pintarMarcas();
    inteligencia.cerrar();
    hoja.abrir(); pestana("consola");
    // El proyecto entero va con el programa: JS importa sus .js; Python, sus .py y sus datos.
    const archivos = indice.textos((r) => r !== actual.ruta && (doc.lenguaje === "python" || MC.modulos.esJS(r)));
    motores.ejecutar({ lenguaje: doc.lenguaje, texto: doc.texto, archivo: actual.ruta, revision: doc.revision, archivos });
  }
  function alternarEjecucion() { if (motores.estado === "corriendo") motores.detener(); else ejecutar(); }
  $ejecutar.addEventListener("pointerdown", (ev) => ev.preventDefault());
  $ejecutar.addEventListener("click", alternarEjecucion);
  $("b-limpiar").addEventListener("click", () => consola.limpiar());

  // ---------- Pestañas de la hoja: consola y problemas ----------
  const PESTANAS = { consola: $("consola"), problemas: $("problemas") };
  function pestana(id) {
    for (const [k, panel] of Object.entries(PESTANAS)) {
      const b = $("tab-" + k), si = k === id;
      b.setAttribute("aria-selected", String(si)); b.tabIndex = si ? 0 : -1; panel.hidden = !si;
    }
    $("hoja").dataset.pestana = id;
    escribir("hoja-pestana", id);
  }
  for (const k of Object.keys(PESTANAS)) {
    const b = $("tab-" + k);
    b.addEventListener("pointerdown", (ev) => ev.preventDefault());
    b.addEventListener("click", () => pestana(k));
  }
  pestana(leer("hoja-pestana", "consola") === "problemas" ? "problemas" : "consola");

  // ---------- Servicios de lenguaje ----------
  let indice = null;
  const inteligencia = MC.inteligencia.crear({
    editor, raiz, indice: () => indice, actual: () => actual,
    abrir: (ruta) => abrir(ruta),
    alMarca: (revision, linea) => { marcaProblemas = linea ? { revision, linea } : null; pintarMarcas(); },
    $problemas: $("problemas"), $cuenta: $("cuenta-problemas"),
  });
  MC.ayuda = inteligencia;
  function crearIndice(p) {
    const ind = MC.proyecto.crear(p, {
      alCambiar: (c) => {
        if (ind !== indice) return;
        if (c.tipo === "proyecto") {
          // Lo que se está escribiendo manda sobre lo que se leyó de la carpeta.
          if (actual && actual.proyecto === p) ind.poner(actual.ruta, editor.documento().texto, { silencio: true });
          inteligencia.alProyecto();
        } else if (c.tipo === "cambio") inteligencia.alArchivo(c.ruta, c.texto);
        else if (c.tipo === "carpeta") inteligencia.alProyecto();
      },
    });
    indice = ind;
    ind.cargar();
    return ind;
  }

  // ---------- Modo sin teclado (interruptor de la barra superior) ----------
  const $teclado = $("b-teclado");
  $teclado.addEventListener("pointerdown", (ev) => ev.preventDefault());
  $teclado.addEventListener("click", () => { const e = editor.fachada.edicion; if (e) e.activar(!e.activo, true); });
  const pintarTeclado = () => {
    const si = raiz.dataset.sinTeclado === "true";
    $teclado.setAttribute("aria-pressed", String(si));
    $teclado.dataset.tip = si ? "Volver al teclado" : "Modo sin teclado";
  };
  // Al cambiar de modo, la barra de inserción vuelve al principio: sus dos conjuntos se cambian de sitio.
  new MutationObserver(() => { pintarTeclado(); const p = pieza("paleta"); if (p) p.scrollLeft = 0; }).observe(raiz, { attributes: true, attributeFilter: ["data-sin-teclado"] });
  pintarTeclado();

  // ---------- Guardado automático ----------
  const $guardado = $("guardado");
  let temporizador = 0, cola = Promise.resolve();
  const marcarGuardado = (estado, titulo) => { $guardado.dataset.estado = estado; $guardado.textContent = estado === "sucio" ? "●" : estado === "error" ? "!" : ""; $guardado.title = titulo || ""; $guardado.setAttribute("aria-label", titulo || ""); };
  function programarGuardado() {
    if (!actual) return;
    if (editor.documento().texto !== actual.guardado) marcarGuardado("sucio", "Sin guardar");
    clearTimeout(temporizador);
    temporizador = setTimeout(guardar, 700);
  }
  function guardar() {
    clearTimeout(temporizador);
    const a = actual;
    if (!a) return cola;
    const texto = editor.documento().texto;
    if (texto === a.guardado) return cola;
    cola = cola.then(() => a.proyecto.escribir(a.ruta, texto)).then(() => {
      a.guardado = texto;
      if (indice && a.proyecto === proyecto) indice.poner(a.ruta, texto);
      if (actual === a && editor.documento().texto === texto) marcarGuardado("ok", "Guardado");
    }).catch((e) => {
      marcarGuardado("error", "No se pudo guardar: " + (e.message || e));
      consola.nota("fallo", `✗ No se pudo guardar ${a.ruta}: ${e.message || e}`);
    });
    return cola;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") guardar();
    // Al volver a la app, se relee la carpeta: pudo cambiar desde otra app.
    else if (indice && indice.antiguedad > 60000) guardar().then(() => indice.cargar());
  });
  addEventListener("pagehide", () => guardar());
  // El envoltorio Android lo llama al pasar a segundo plano.
  MC.guardar = guardar;

  // ---------- Abrir archivos ----------
  let proyecto = await MC.archivos.inicial();
  crearIndice(proyecto);
  const $nombre = $("nombre-archivo"), $chip = $("lenguaje-archivo");
  function pintarArchivo() {
    $nombre.textContent = actual ? MC.archivos.nombreDe(actual.ruta) : "Sin archivo";
    $chip.textContent = actual ? CHIP[actual.lenguaje] : "";
    $chip.dataset.lenguaje = actual ? actual.lenguaje : "";
    $("b-nombre").setAttribute("aria-label", actual ? `Archivo abierto: ${actual.ruta} (${NOMBRES[actual.lenguaje]}). Toca para ver los archivos` : "Ningún archivo abierto. Toca para ver los archivos");
    document.title = actual ? `${MC.archivos.nombreDe(actual.ruta)} · Mobile Coder` : "Mobile Coder";
    const ejecutable = !actual || EJECUTABLE[actual.lenguaje];
    $ejecutar.classList.toggle("sin-motor", !ejecutable);
    $ejecutar.dataset.tip = ejecutable ? "Ejecutar" : "Vista previa: pendiente";
    pintarEstadoMotor();
  }
  async function abrir(ruta) {
    const lenguaje = MC.archivos.lenguajeDe(ruta);
    if (!lenguaje) throw Error("Esta versión abre archivos .py, .js, .html y .css.");
    const texto = await proyecto.leer(ruta);
    await guardar();
    if (motores.estado === "corriendo") motores.detener();
    actual = { proyecto, ruta, lenguaje, guardado: texto };
    marcaEjecucion = marcaProblemas = null;
    editor.abrir({ id: proyecto.clave + ":" + ruta, lenguaje, texto });
    editor.refrescar();
    marcarGuardado("ok", "Guardado");
    escribir("ultimo-" + proyecto.clave, ruta);
    if (indice) indice.poner(ruta, texto);
    pintarArchivo();
    inteligencia.alAbrir();
    if (lenguaje === "python") setTimeout(() => motores.precargarPython(), 200);
  }

  // ---------- Panel de archivos ----------
  const $panel = $("archivos"), $lista = $("lista-archivos"), $ruta = $("ruta"), $nota = $("nota-archivos");
  const $bArchivos = $("b-archivos"), $bNombre = $("b-nombre"), $bCarpeta = $("b-carpeta");
  let dir = "";
  const TIPOS = { android: "Carpeta del teléfono", borradores: "Sin carpeta: borradores de la app", navegador: "Prueba en el navegador (no es una carpeta del teléfono)" };
  const ICONO_CARPETA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>';
  const ICONO_ARCHIVO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/></svg>';
  function avisoPanel(texto, error = false) { $nota.textContent = texto || ""; $nota.classList.toggle("error", !!error); }
  async function pintarPanel() {
    $("proyecto-tipo").textContent = TIPOS[proyecto.tipo] || "";
    $("proyecto-nombre").textContent = proyecto.nombre;
    $bCarpeta.hidden = !MC.puente.disponible;
    $bCarpeta.textContent = proyecto.tipo === "android" ? "Cambiar carpeta" : "Elegir carpeta";
    const partes = dir ? dir.split("/") : [];
    // En la raíz basta el nombre del proyecto de arriba; dentro de una carpeta, la ruta para volver.
    $ruta.hidden = !dir;
    $ruta.innerHTML = [`<button type="button" data-dir="">${esc(proyecto.nombre)}</button>`,
      ...partes.map((p, i) => `<span aria-hidden="true">/</span><button type="button" data-dir="${esc(partes.slice(0, i + 1).join("/"))}">${esc(p)}</button>`)].join("");
    $lista.innerHTML = `<li class="vacio">Cargando…</li>`;
    let entradas;
    try { entradas = await proyecto.listar(dir); }
    catch (e) { $lista.innerHTML = ""; avisoPanel("No se pudo leer la carpeta: " + (e.message || e), true); return; }
    entradas.sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }) : a.tipo === "carpeta" ? -1 : 1));
    $lista.innerHTML = entradas.length ? entradas.map((e) => {
      const lenguaje = e.tipo === "archivo" ? MC.archivos.lenguajeDe(e.nombre) : null, abierto = actual && actual.proyecto === proyecto && actual.ruta === e.ruta;
      const disponible = e.tipo === "carpeta" || !!lenguaje;
      return `<li><button type="button" class="entrada ${e.tipo}${abierto ? " abierto" : ""}" data-ruta="${esc(e.ruta)}" data-tipo="${e.tipo}"${disponible ? "" : " disabled"}${abierto ? ' aria-current="true"' : ""}>`
        + (e.tipo === "carpeta" ? ICONO_CARPETA : ICONO_ARCHIVO)
        + `<span class="entrada-nombre">${esc(e.nombre)}</span>`
        + (lenguaje ? `<span class="chip" data-lenguaje="${lenguaje}">${CHIP[lenguaje]}</span>` : e.tipo === "archivo" ? `<span class="entrada-nota">aún no se abre</span>` : "")
        + `</button></li>`;
    }).join("") : `<li class="vacio">Carpeta vacía. Crea un archivo .py, .js, .html o .css.</li>`;
  }
  function abrirPanel(si = true) {
    $panel.hidden = !si;
    for (const b of [$bArchivos, $bNombre]) b.setAttribute("aria-expanded", String(si));
    if (si) { avisoPanel(""); if (document.activeElement === $codigo) $codigo.blur(); pintarPanel(); }
  }
  $bArchivos.addEventListener("click", () => abrirPanel($panel.hidden));
  $bNombre.addEventListener("click", () => abrirPanel(true));
  $("b-cerrar-archivos").addEventListener("click", () => abrirPanel(false));
  $ruta.addEventListener("click", (ev) => { const b = ev.target.closest("[data-dir]"); if (b) { dir = b.dataset.dir; pintarPanel(); } });
  $lista.addEventListener("click", async (ev) => {
    const b = ev.target.closest(".entrada");
    if (!b || b.disabled) return;
    if (b.dataset.tipo === "carpeta") { dir = b.dataset.ruta; pintarPanel(); return; }
    try { await abrir(b.dataset.ruta); abrirPanel(false); }
    catch (e) { avisoPanel(e.message || String(e), true); }
  });
  $bCarpeta.addEventListener("click", async () => {
    try {
      const nuevo = await MC.archivos.elegirCarpeta();
      await guardar();
      proyecto = nuevo; dir = "";
      crearIndice(proyecto);
      avisoPanel(`Carpeta elegida: ${proyecto.nombre}. Abre o crea un archivo.`);
      pintarPanel();
    } catch (e) {
      if (e.codigo !== "cancelado") avisoPanel("No se pudo usar esa carpeta: " + (e.message || e), true);
    }
  });

  // Diálogo para el nombre de un archivo o carpeta nueva.
  const $dialogo = $("dialogo-nombre"), $campo = $("dialogo-nombre-campo"), $notaDialogo = $("dialogo-nombre-nota");
  function pedirNombre({ titulo, etiqueta, inicial, nota, validar }) {
    $("dialogo-nombre-titulo").textContent = titulo; $("dialogo-nombre-etiqueta").textContent = etiqueta;
    $campo.value = inicial; $notaDialogo.textContent = nota; $notaDialogo.classList.remove("error");
    $dialogo.showModal();
    const punto = inicial.lastIndexOf(".");
    $campo.setSelectionRange(0, punto > 0 ? punto : inicial.length);
    return new Promise((resolver) => {
      const alCerrar = () => {
        $dialogo.removeEventListener("close", alCerrar); $campo.removeEventListener("input", alEscribir);
        resolver($dialogo.returnValue === "aceptar" ? $campo.value.trim() : null);
      };
      const alEscribir = () => { const m = validar($campo.value.trim()); $campo.setCustomValidity(m || ""); $notaDialogo.textContent = m || nota; $notaDialogo.classList.toggle("error", !!m); };
      $dialogo.addEventListener("close", alCerrar); $campo.addEventListener("input", alEscribir);
    });
  }
  $dialogo.querySelector("form").addEventListener("submit", (ev) => {
    if (ev.submitter && ev.submitter.value === "aceptar" && $campo.validationMessage) ev.preventDefault();
  });
  $("b-nuevo-archivo").addEventListener("click", async () => {
    const nombre = await pedirNombre({
      titulo: "Nuevo archivo", etiqueta: "Nombre", inicial: actual && actual.lenguaje === "js" ? "nuevo.js" : "nuevo.py",
      nota: "Termina en .py (Python), .js (JavaScript), .html (página) o .css (estilos).",
      validar: (n) => MC.archivos.motivoNombre(n) || (MC.archivos.lenguajeDe(n) ? null : "Termina en .py, .js, .html o .css."),
    });
    if (!nombre) return;
    const ruta = MC.archivos.unir(dir, nombre);
    const inicial = MC.archivos.lenguajeDe(nombre) === "html" ? PAGINA_NUEVA : "";
    try { await proyecto.crearArchivo(ruta, inicial); if (indice) indice.poner(ruta, inicial); await abrir(ruta); abrirPanel(false); }
    catch (e) { avisoPanel("No se pudo crear: " + (e.message || e), true); }
  });
  $("b-nueva-carpeta").addEventListener("click", async () => {
    const nombre = await pedirNombre({ titulo: "Nueva carpeta", etiqueta: "Nombre", inicial: "carpeta", nota: "Dentro de la carpeta actual.", validar: MC.archivos.motivoNombre });
    if (!nombre) return;
    try { const r = MC.archivos.unir(dir, nombre); await proyecto.crearCarpeta(r); if (indice) indice.ponerCarpeta(r); pintarPanel(); }
    catch (e) { avisoPanel("No se pudo crear: " + (e.message || e), true); }
  });

  // Una página nueva ya enlaza su hoja de estilo y su script: los servicios avisan si faltan.
  const PAGINA_NUEVA = '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Mi página</title>\n  <link rel="stylesheet" href="estilos.css">\n</head>\n<body>\n  <h1>Hola</h1>\n\n  <script src="main.js"></script>\n</body>\n</html>\n';

  // ---------- Menú ⋯ (placas metálicas) ----------
  const $menu = $("menu"), $bMenu = $("b-menu");
  const OPCIONES = [
    { id: "archivos", t: "Archivos", svg: ICONO_CARPETA, fn: () => abrirPanel(true) },
    { id: "menos", t: "Letra −", svg: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 18l5-12 5 12M5.8 14h6.4M16 12h5"/></svg>', fn: () => pieza("b-menos").click() },
    { id: "mas", t: "Letra +", svg: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 18l5-12 5 12M5.8 14h6.4M16 12h5M18.5 9.5v5"/></svg>', fn: () => pieza("b-mas").click() },
    { id: "ajustes", t: "Ajustes del editor", svg: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>', fn: () => pieza("b-ajustes").click() },
    { id: "acerca", t: "Acerca de", svg: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.01"/></svg>', fn: () => abrirAcerca() },
  ];
  $menu.innerHTML = OPCIONES.map((o) => `<button type="button" class="variante" role="menuitem" data-opcion="${o.id}" style="--c1:#7FA3FF">${o.svg}<span>${esc(o.t)}</span></button>`).join("");
  function abrirMenu(si) {
    $menu.hidden = !si; $bMenu.setAttribute("aria-expanded", String(si)); $bMenu.classList.toggle("abierto", si);
    if (!si) return;
    const r = $bMenu.getBoundingClientRect(), m = $menu.getBoundingClientRect();
    $menu.style.transform = `translate(${Math.round(Math.max(6, Math.min(innerWidth - m.width - 6, r.right - m.width)))}px, ${Math.round(r.bottom + 6)}px)`;
  }
  $bMenu.addEventListener("pointerdown", (ev) => ev.preventDefault());
  $bMenu.addEventListener("click", () => abrirMenu($menu.hidden));
  $menu.addEventListener("pointerdown", (ev) => ev.preventDefault());
  $menu.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-opcion]");
    if (!b) return;
    abrirMenu(false);
    OPCIONES.find((o) => o.id === b.dataset.opcion).fn();
  });
  document.addEventListener("pointerdown", (ev) => { if (!$menu.hidden && !ev.target.closest("#menu, #b-menu")) abrirMenu(false); }, true);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$menu.hidden) { abrirMenu(false); $bMenu.focus(); } });

  async function abrirAcerca() {
    const origen = await fetch("cmg/ORIGEN.json").then((r) => r.json()).catch(() => null);
    const py = await fetch("vendor/pyodide/MANIFEST.json").then((r) => r.json()).catch(() => null);
    const p = motores.python;
    const [ts, web, jedi] = await Promise.all(["typescript", "servicios-web", "jedi"].map((d) => fetch(`vendor/${d}/MANIFEST.json`).then((r) => r.json()).catch(() => null)));
    const e = inteligencia.estados, listo = (x) => (x && x.estado === "listo" ? ` · cargó en ${MC.motores.segundos(x.ms || 0)}` : x && x.estado === "fallo" ? " · no cargó" : x && x.estado === "cargando" ? " · cargando" : "");
    const filas = [
      ["Versión", "0.2.0 · servicios de lenguaje"],
      ["Editor", origen ? `Code Battle Lite · ${origen.commit.slice(0, 7)}` : "—"],
      ["Python", py ? `${py.paquete} (Python ${py.python})${p.estado === "listo" ? ` · cargó en ${MC.motores.segundos(p.ms)}` : ""}` : "—"],
      ["JavaScript", "Motor del navegador en un Worker propio"],
      ["Ayuda de JS", ts ? `${ts.paquete} (Apache-2.0)${listo(e.js)}` : "—"],
      ["Ayuda de HTML y CSS", web ? `vscode-html-languageservice ${web.paquetes["vscode-html-languageservice"]} y vscode-css-languageservice ${web.paquetes["vscode-css-languageservice"]} (MIT)${listo(e.web)}` : "—"],
      ["Ayuda de Python", jedi ? `Jedi 0.19.2 y parso 0.8.6 (MIT)${listo(e.python)}` : "—"],
      ["Archivos", TIPOS[proyecto.tipo] + (proyecto.tipo === "android" ? ` · ${proyecto.nombre}` : "")],
      ["Sin conexión", "Todo se sirve desde la propia app"],
    ];
    $("acerca-datos").innerHTML = filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    $("acerca").showModal();
  }

  // ---------- Atrás (Android) ----------
  // El envoltorio pregunta antes de salir: true si la app cerró algo.
  MC.atras = () => {
    const dialogo = document.querySelector("dialog[open]");
    if (dialogo) { dialogo.close(); return true; }
    if (!$menu.hidden) { abrirMenu(false); return true; }
    if (!$panel.hidden && actual) { abrirPanel(false); return true; }
    if (hoja.abierta) { hoja.cerrar(); return true; }
    if (editor.fachada.edicion && editor.fachada.edicion.activo) { editor.fachada.edicion.activar(false); return true; }
    // Después de ir a otro archivo (una definición, un enlace, un error), Atrás vuelve al de antes.
    if (inteligencia.volver()) return true;
    guardar();
    return false;
  };

  // ---------- Arranque: el último archivo, o main.py / main.js, o la lista ----------
  const candidatos = [leer("ultimo-" + proyecto.clave, null), "main.py", "main.js"].filter(Boolean);
  let abierto = false;
  for (const ruta of candidatos) {
    try { await abrir(ruta); abierto = true; break; } catch { /* siguiente */ }
  }
  pintarArchivo();
  if (!abierto) abrirPanel(true);
  document.body.dataset.listo = "true";
})().catch((e) => {
  console.error(e);
  document.body.dataset.listo = "error";
  const p = document.createElement("p");
  p.className = "fallo-arranque";
  p.textContent = "Mobile Coder no pudo arrancar: " + (e && e.message ? e.message : e);
  document.body.append(p);
});
