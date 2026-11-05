/* Inteligencia del editor: autocompletar, problemas e ir a la definición, con los servicios de lenguaje en Workers
 * (app/lenguaje-web.js: TypeScript, HTML y CSS de VS Code; app/lenguaje-python.js: Jedi). Todo el proyecto está a la
 * vista de los servicios (app/proyecto.js), así los archivos se conocen entre ellos: los import, las páginas y lo que
 * enlazan, las clases de sus hojas de estilo.
 * - Sugerencias: el desplegable del editor (las mismas placas que sus sugerencias de valores), junto al cursor,
 *   mientras se escribe con teclado. Tocar una la pone; con teclado físico, flechas, Tab/Intro y Escape.
 * - Ir a otro archivo: con el cursor quieto sobre algo definido o enlazado en otro archivo (un import, un href, una
 *   clase), aparece una placa «↗» que lo abre en esa línea. Atrás vuelve al archivo de antes.
 * - Problemas: la lista de la hoja (pestaña Problemas) y, en el archivo abierto, la línea del primer error. */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SERVICIO = { js: "web", html: "web", css: "web", python: "python" };
  const TIPO_RUTA = (r) => (/\.(m?js|cjs)$/i.test(r) ? "js" : /\.html?$/i.test(r) ? "html" : /\.css$/i.test(r) ? "css" : /\.py$/i.test(r) ? "python" : null);
  const PALABRA = { js: /[\w$À-￿]/, python: /[\wÀ-￿]/, html: /[\wÀ-￿-]/, css: /[\wÀ-￿-]/ };
  const DISPAROS = { js: ".\"'/`", python: ".", html: "<\"'/=", css: ":.#\"'/(" };
  const METRICAS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariantLigatures", "fontFeatureSettings", "lineHeight",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize", "letterSpacing"];

  function crear({ editor, raiz, indice, actual, abrir, alMarca = () => {}, $problemas, $cuenta, alEstado = () => {} }) {
    const codigo = editor.codigo;
    const sinTeclado = () => !!(editor.fachada.edicion && editor.fachada.edicion.activo);

    // ---------- Servicios ----------
    const servicios = {};
    let secuencia = 0;
    const estados = {};   // js | web | python → { estado, ms, mensaje }
    function servicio(nombre) {
      if (servicios[nombre]) return servicios[nombre];
      const w = new Worker(nombre === "web" ? "app/lenguaje-web.js" : "app/lenguaje-python.js", nombre === "python" ? { type: "module" } : undefined);
      const s = (servicios[nombre] = { worker: w, pedidos: new Map() });
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.tipo === "respuesta") {
          const p = s.pedidos.get(m.id);
          if (p) { s.pedidos.delete(m.id); if (m.ok) p.resolver(m.datos); else p.rechazar(Error(m.error)); }
        } else if (m.tipo === "estado") { estados[m.servicio] = { estado: m.estado, ms: m.ms, mensaje: m.mensaje }; alEstado({ ...estados }); }
      };
      w.onerror = (ev) => {
        ev.preventDefault();
        estados[nombre === "web" ? "web" : "python"] = { estado: "fallo", mensaje: ev.message || "error del Worker" };
        for (const p of s.pedidos.values()) p.rechazar(Error(ev.message || "error"));
        s.pedidos.clear(); alEstado({ ...estados });
      };
      const ind = indice();
      if (ind && ind.cargado) w.postMessage({ tipo: "proyecto", ...ind.foto() });
      return s;
    }
    function pedir(nombre, accion, datos) {
      const s = servicio(nombre), id = ++secuencia;
      return new Promise((resolver, rechazar) => { s.pedidos.set(id, { resolver, rechazar }); s.worker.postMessage({ tipo: "pedir", id, accion, ...datos }); });
    }
    const enviarATodos = (m) => { for (const s of Object.values(servicios)) s.worker.postMessage(m); };

    // ---------- Posición del cursor en pantalla (un espejo del textarea, como las sugerencias del editor) ----------
    function rectCaret(pos) {
      const cs = getComputedStyle(codigo), r = codigo.getBoundingClientRect(), espejo = document.createElement("div"), marca = document.createElement("span");
      for (const k of METRICAS) espejo.style[k] = cs[k];
      Object.assign(espejo.style, { position: "fixed", left: `${r.left + codigo.clientLeft}px`, top: `${r.top + codigo.clientTop}px`, width: `${codigo.clientWidth}px`, height: `${codigo.clientHeight}px`, overflow: "hidden", visibility: "hidden", pointerEvents: "none" });
      marca.textContent = "​";
      espejo.append(document.createTextNode(codigo.value.slice(0, pos)), marca, document.createTextNode(codigo.value.slice(pos)));
      document.body.append(espejo);
      espejo.scrollTop = codigo.scrollTop; espejo.scrollLeft = codigo.scrollLeft;
      const rr = marca.getBoundingClientRect();
      espejo.remove();
      return rr;
    }
    // Junto al cursor sin tapar las barras: debajo de la línea si caben unas opciones; si no, encima.
    function colocar(el, pos, { arriba = false, maximo = 228 } = {}) {
      const c = rectCaret(pos), editorR = raiz.querySelector('[data-editor="editor"]').getBoundingClientRect();
      const barra = raiz.querySelector('[data-editor="edicion"]'), vv = window.visualViewport;
      const techo = Math.max(editorR.top, vv ? vv.offsetTop : 0) + 4;
      const suelo = Math.min(barra && barra.getClientRects().length ? barra.getBoundingClientRect().top : editorR.bottom, vv ? vv.offsetTop + vv.height : innerHeight) - 4;
      if (c.bottom < techo || c.top > suelo) { el.style.visibility = "hidden"; return; }
      el.style.visibility = ""; el.style.maxHeight = "";
      const ancho = Math.min(340, innerWidth - 12);
      el.style.width = el.classList.contains("mc-ir") ? "" : `${ancho}px`;
      const alto = el.getBoundingClientRect().height, w = el.getBoundingClientRect().width;
      const abajo = suelo - c.bottom - 4, encima = c.top - 4 - techo;
      const enAbajo = arriba ? encima < Math.min(alto, 44) && abajo > encima : abajo >= Math.min(alto, 120) || abajo >= encima;
      const libre = Math.max(40, Math.min(maximo, enAbajo ? abajo : encima));
      el.style.maxHeight = `${libre}px`;
      const h = Math.min(alto, libre);
      const x = Math.max(6, Math.min(innerWidth - w - 6, c.left - 14));
      const y = enAbajo ? c.bottom + 4 : c.top - 4 - h;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }

    // ---------- Sugerencias ----------
    const $lista = document.createElement("div");
    $lista.className = "sugerencias mc-completar"; $lista.hidden = true;
    $lista.setAttribute("role", "listbox"); $lista.setAttribute("aria-label", "Sugerencias de código");
    document.body.append($lista);
    let lista = null, versionLista = 0, pendiente = false, temporizadorLista = 0, saltarUna = false;
    const puedeCompletar = () => !!actual() && !codigo.readOnly && !sinTeclado() && document.activeElement === codigo && codigo.selectionStart === codigo.selectionEnd;
    function dispara(lenguaje, texto, pos) {
      const c = texto[pos - 1] || "";
      if (!c) return null;
      if (PALABRA[lenguaje].test(c) || DISPAROS[lenguaje].includes(c)) return c;
      if (c === " " && lenguaje === "html") { const a = texto.lastIndexOf("<", pos - 1); return a > texto.lastIndexOf(">", pos - 1) && (texto.slice(a, pos).split('"').length % 2 === 1) ? c : null; }
      if (c === " " && lenguaje === "css" && /:\s$/.test(texto.slice(Math.max(0, pos - 3), pos))) return c;
      return null;
    }
    function programarLista(disparo, ms = 70) {
      clearTimeout(temporizadorLista);
      // Lo que esté en camino ya no vale: se descarta al llegar (la lista abierta sigue, filtrada).
      versionLista++;
      pendiente = true;
      temporizadorLista = setTimeout(() => completar(disparo), ms);
    }
    async function completar(disparo) {
      const v = ++versionLista, a = actual();
      if (!a || !puedeCompletar()) { pendiente = false; return cerrarLista(); }
      const pos = codigo.selectionStart, texto = codigo.value;
      let r;
      try { r = await pedir(SERVICIO[a.lenguaje], "completar", { ruta: a.ruta, texto, pos }); }
      catch (e) { if (v === versionLista) { pendiente = false; cerrarLista(); } return; }
      if (v !== versionLista) return;
      pendiente = false;
      if (actual() !== a || codigo.value !== texto || codigo.selectionStart !== pos || !puedeCompletar()) return cerrarLista();
      const escrito = pos > r.desde;
      if (!r.items.length || (!escrito && !DISPAROS[a.lenguaje].includes(disparo) && disparo !== " ")) return cerrarLista();
      abrirLista(r.items, pos);
    }
    function abrirLista(items, pos) {
      cerrarIr();
      lista = { items, pos, activo: -1 };
      $lista.innerHTML = items.map((it, i) => `<button type="button" class="sug" role="option" data-i="${i}"><code class="${esc(it.cls || "")}">${esc(it.etiqueta)}</code>${it.nota ? `<span class="nota">${esc(it.nota)}</span>` : ""}</button>`).join("");
      $lista.hidden = false; $lista.scrollTop = 0;
      colocar($lista, pos);
    }
    // Mientras llega la respuesta a lo último escrito, la lista abierta se filtra con lo que ya tiene: así no queda
    // una opción vieja bajo el dedo (ni para Tab).
    function refiltrar() {
      if (!lista) return;
      const pos = codigo.selectionStart, v = codigo.value;
      const quedan = lista.items.filter((it) => {
        if (pos < it.desde) return false;
        const escrito = v.slice(it.desde, pos).toLowerCase(), clave = (it.filtro || it.etiqueta).toLowerCase();
        return clave.startsWith(escrito) && clave !== escrito;
      });
      if (!quedan.length) return cerrarLista();
      if (quedan.length !== lista.items.length) abrirLista(quedan, pos);
      else { lista.pos = pos; colocar($lista, pos); }
    }
    function cerrarLista() { versionLista++; clearTimeout(temporizadorLista); pendiente = false; if (!$lista.hidden) { $lista.hidden = true; $lista.innerHTML = ""; } lista = null; }
    function aceptar(i) {
      if (!lista) return;
      const it = lista.items[i], pos = codigo.selectionStart;
      cerrarLista();
      const desde = Math.min(it.desde, pos), hasta = Math.max(it.hasta, pos);
      const cursor = it.cursor != null ? it.cursor : it.insertar.length;
      // Tras poner class="" o una carpeta, se vuelve a sugerir (clases de la hoja enlazada, archivos de la carpeta).
      const seguir = /["'/]$/.test(it.insertar.slice(0, cursor));
      codigo.setSelectionRange(desde, hasta);
      saltarUna = true;
      editor.insertar(it.insertar, cursor, cursor);
      saltarUna = false;
      if (seguir) programarLista(it.insertar[cursor - 1], 30);
    }
    function marcarActiva() {
      $lista.querySelectorAll(".sug").forEach((b) => b.classList.toggle("activa", +b.dataset.i === lista.activo));
      const b = $lista.querySelector(".sug.activa");
      if (b) b.scrollIntoView({ block: "nearest" });
    }
    // Tocar la lista no le quita el foco al código: el teclado sigue abierto.
    $lista.addEventListener("pointerdown", (ev) => ev.preventDefault());
    $lista.addEventListener("click", (ev) => { const b = ev.target.closest(".sug[data-i]"); if (b) aceptar(+b.dataset.i); });
    codigo.addEventListener("keydown", (ev) => {
      if ($lista.hidden || !lista) return;
      const n = lista.items.length, hecho = () => { ev.preventDefault(); ev.stopImmediatePropagation(); };
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        const d = ev.key === "ArrowDown" ? 1 : -1;
        lista.activo = lista.activo < 0 ? (d > 0 ? 0 : n - 1) : (lista.activo + d + n) % n;
        marcarActiva(); hecho();
      } else if (ev.key === "Tab" || (ev.key === "Enter" && lista.activo >= 0)) { aceptar(Math.max(0, lista.activo)); hecho(); }
      else if (ev.key === "Escape") { cerrarLista(); hecho(); }
    }, true);

    // ---------- Ir a otro archivo ----------
    const $ir = document.createElement("div");
    $ir.className = "sugerencias mc-ir"; $ir.hidden = true;
    document.body.append($ir);
    let ir = null, versionIr = 0, temporizadorIr = 0, ultimoInput = 0;
    const pila = [];   // de dónde se saltó: Atrás vuelve
    function programarIr() {
      clearTimeout(temporizadorIr);
      temporizadorIr = setTimeout(buscarIr, 450);
    }
    async function buscarIr() {
      const v = ++versionIr, a = actual();
      if (!a || !$lista.hidden || pendiente || performance.now() - ultimoInput < 400) return cerrarIr();
      const enCodigo = document.activeElement === codigo || sinTeclado();
      if (!enCodigo || (!sinTeclado() && codigo.selectionStart !== codigo.selectionEnd)) return cerrarIr();
      const pos = codigo.selectionStart, texto = codigo.value;
      let d;
      try { d = await pedir(SERVICIO[a.lenguaje], "definicion", { ruta: a.ruta, texto, pos }); } catch { return; }
      if (v !== versionIr || actual() !== a || codigo.value !== texto || codigo.selectionStart !== pos) return;
      if (!d || d.ruta === a.ruta) return cerrarIr();
      const nombre = d.ruta.slice(d.ruta.lastIndexOf("/") + 1);
      ir = { destino: d, pos };
      $ir.innerHTML = `<button type="button" class="sug" data-ir aria-label="${esc(d.nombre ? `Ir a ${d.nombre} en ${d.ruta}, línea ${d.linea}` : `Abrir ${d.ruta}`)}">`
        + `<span class="ir-flecha" aria-hidden="true">↗</span>`
        + (d.nombre ? `<code class="fn">${esc(d.nombre)}</code><span class="nota">${esc(nombre)}:${d.linea}</span>` : `<span class="ir-texto">Abrir <code class="str">${esc(nombre)}</code></span>`)
        + `</button>`;
      $ir.hidden = false;
      colocar($ir, pos, { arriba: true, maximo: 60 });
    }
    function cerrarIr() { versionIr++; clearTimeout(temporizadorIr); if (!$ir.hidden) { $ir.hidden = true; $ir.innerHTML = ""; } ir = null; }
    async function saltar(destino) {
      const a = actual();
      if (a) { pila.push({ ruta: a.ruta, pos: codigo.selectionStart }); if (pila.length > 30) pila.shift(); }
      await irA(destino);
    }
    async function irA({ ruta, linea, pos }) {
      cerrarIr(); cerrarLista();
      const a = actual();
      if (!a || a.ruta !== ruta) await abrir(ruta);
      if (pos != null) {
        codigo.setSelectionRange(pos, pos);
        if (!sinTeclado()) codigo.focus();
        codigo.dispatchEvent(new CustomEvent("cmg:seleccion"));
      } else if (linea) editor.irALinea(linea);
    }
    $ir.addEventListener("pointerdown", (ev) => ev.preventDefault());
    $ir.addEventListener("click", () => { if (ir) saltar(ir.destino); });

    // ---------- Problemas ----------
    const problemas = new Map();   // ruta → [{ desde, hasta, linea, mensaje, gravedad, fuente }]
    let temporizadorProblemas = 0, temporizadorTodos = 0;
    const rutasDe = (nombre) => { const ind = indice(); return ind ? Object.keys(ind.textos((r) => SERVICIO[TIPO_RUTA(r)] === nombre)) : []; };
    function programarProblemas() {
      clearTimeout(temporizadorProblemas);
      temporizadorProblemas = setTimeout(() => diagnosticar(false), 650);
      clearTimeout(temporizadorTodos);
      temporizadorTodos = setTimeout(() => diagnosticar(true), 2600);
    }
    async function diagnosticar(todos) {
      const a = actual();
      if (!a || !SERVICIO[a.lenguaje]) return;
      const nombre = SERVICIO[a.lenguaje], revision = editor.documento().revision, texto = codigo.value;
      // Todo el proyecto (un cambio en un archivo puede romper a quien lo importa), si no es enorme.
      const otras = todos ? rutasDe(nombre).filter((r) => r !== a.ruta).slice(0, 80) : [];
      let r;
      try { r = await pedir(nombre, "diagnosticos", { ruta: a.ruta, texto, rutas: [a.ruta, ...otras] }); } catch { return; }
      for (const [ruta, l] of Object.entries(r)) problemas.set(ruta, l);
      pintarProblemas();
      if (actual() === a && editor.documento().revision === revision) marcarActual(revision, todos);
    }
    // La línea del primer error. Mientras se escribe, la línea del cursor no se marca (lo a medio escribir no es
    // un error todavía); la revisión completa, unos segundos después, ya la incluye.
    function marcarActual(revision, completa) {
      const a = actual();
      const lineaCursor = codigo.value.slice(0, codigo.selectionStart).split("\n").length;
      const l = a && (problemas.get(a.ruta) || []).find((p) => p.gravedad === "error" && (completa || p.linea !== lineaCursor));
      alMarca(revision, l ? l.linea : null);
    }
    function pintarProblemas() {
      const a = actual(), grupos = [...problemas].filter(([, l]) => l.length);
      grupos.sort(([x], [y]) => (a && x === a.ruta ? -1 : a && y === a.ruta ? 1 : x.localeCompare(y)));
      const total = grupos.reduce((s, [, l]) => s + l.length, 0), errores = grupos.reduce((s, [, l]) => s + l.filter((p) => p.gravedad === "error").length, 0);
      if ($cuenta) { $cuenta.textContent = total ? String(total) : ""; $cuenta.dataset.gravedad = errores ? "error" : total ? "aviso" : ""; }
      if (!$problemas) return;
      $problemas.innerHTML = total ? grupos.map(([ruta, l]) => `<div class="p-grupo"><div class="p-archivo">${esc(ruta)}</div>`
        + l.slice().sort((x, y) => x.desde - y.desde).map((p) => `<button type="button" class="problema" data-ruta="${esc(ruta)}" data-linea="${p.linea}" data-pos="${p.desde}">`
          + `<span class="p-ico p-${p.gravedad}" aria-label="${p.gravedad === "error" ? "Error" : "Aviso"}"></span><span class="p-linea">${p.linea}</span><span class="p-texto">${esc(p.mensaje)}</span></button>`).join("")
        + `</div>`).join("") : `<p class="p-vacio">Sin problemas en los archivos revisados.</p>`;
    }
    if ($problemas) {
      $problemas.addEventListener("click", (ev) => {
        const b = ev.target.closest(".problema");
        if (!b) return;
        const a = actual(), destino = { ruta: b.dataset.ruta, linea: +b.dataset.linea };
        if (a && a.ruta !== destino.ruta) saltar(destino); else irA(destino);
      });
      pintarProblemas();
    }

    // ---------- Eventos del editor ----------
    codigo.addEventListener("input", () => {
      ultimoInput = performance.now();
      cerrarIr();
      const a = actual();
      if (!a) return;
      programarProblemas();
      if (saltarUna) return;
      if (!puedeCompletar()) return cerrarLista();
      const c = dispara(a.lenguaje, codigo.value, codigo.selectionStart);
      if (!c) return cerrarLista();
      if (PALABRA[a.lenguaje].test(c)) refiltrar(); else cerrarLista();
      programarLista(c);
    });
    // El cursor se movió sin escribir: fuera la lista; quizá haya otro archivo a donde ir.
    document.addEventListener("selectionchange", () => {
      if (document.activeElement !== codigo && !sinTeclado()) return;
      if (lista && !pendiente && codigo.selectionStart !== lista.pos) cerrarLista();
      if (ir && codigo.selectionStart !== ir.pos) cerrarIr();
      programarIr();
    });
    codigo.addEventListener("cmg:seleccion", programarIr);
    codigo.addEventListener("blur", () => { cerrarLista(); if (!sinTeclado()) cerrarIr(); });
    codigo.addEventListener("scroll", () => { if (lista) colocar($lista, lista.pos); if (ir) colocar($ir, ir.pos, { arriba: true, maximo: 60 }); }, { passive: true });
    raiz.addEventListener("scroll", () => { cerrarIr(); }, true);
    new MutationObserver(() => { cerrarLista(); cerrarIr(); }).observe(raiz, { attributes: true, attributeFilter: ["data-sin-teclado"] });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => { if (lista) colocar($lista, lista.pos); if (ir) colocar($ir, ir.pos, { arriba: true, maximo: 60 }); });

    return {
      // Un archivo recién abierto: se arranca su servicio y se revisa el proyecto.
      alAbrir() {
        cerrarLista(); cerrarIr();
        const a = actual();
        if (!a || !SERVICIO[a.lenguaje]) return;
        // Python carga su propio Pyodide: se deja pasar antes al de la ejecución, que también arranca al abrir un .py.
        const arrancar = () => { servicio(SERVICIO[a.lenguaje]); diagnosticar(true); };
        if (SERVICIO[a.lenguaje] === "python" && !servicios.python) setTimeout(() => { if (actual() === a) arrancar(); }, 2500); else arrancar();
        pintarProblemas();
      },
      // El índice cambió: todo el proyecto (otra carpeta, o terminó de leerse) o un archivo.
      alProyecto() { problemas.clear(); pintarProblemas(); const ind = indice(); if (ind) enviarATodos({ tipo: "proyecto", ...ind.foto() }); if (actual()) diagnosticar(true); },
      alArchivo(ruta, texto) { enviarATodos({ tipo: "cambio", ruta, texto }); if (texto == null) { problemas.delete(ruta); pintarProblemas(); } },
      cerrar() { cerrarLista(); cerrarIr(); },
      // Atrás: vuelve al archivo desde el que se saltó. false si no hay a dónde volver.
      volver() {
        const p = pila.pop();
        if (!p) return false;
        irA({ ruta: p.ruta, pos: p.pos });
        return true;
      },
      saltar, pedir,
      get estados() { return { ...estados }; },
      get problemas() { return new Map(problemas); },
    };
  }
  MC.inteligencia = { crear, tipoDeRuta: TIPO_RUTA };
})();
