/* Proyectos y archivos.
 * - android: la carpeta del teléfono que el usuario eligió con el selector del sistema (vía MC.puente).
 * - borradores (Android sin carpeta) y navegador (pruebas en un navegador): un proyecto guardado en
 *   localStorage, con dos ejemplos. No son una carpeta del teléfono.
 * Las rutas son relativas a la carpeta del proyecto, con «/», sin «..» ni partes vacías.
 * Esta versión abre .py y .js; el resto se lista pero no se abre. */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const LENGUAJES = { py: "python", js: "js" };
  const lenguajeDe = (nombre) => { const m = /\.([^./]+)$/.exec(nombre || ""); return (m && LENGUAJES[m[1].toLowerCase()]) || null; };
  const unir = (dir, nombre) => (dir ? dir + "/" + nombre : nombre);
  const padreDe = (ruta) => (ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : "");
  const nombreDe = (ruta) => ruta.slice(ruta.lastIndexOf("/") + 1);

  // Un nombre de archivo o carpeta (no una ruta). Devuelve el motivo si no vale.
  function motivoNombre(nombre) {
    if (!nombre || !nombre.trim()) return "Escribe un nombre.";
    if (nombre !== nombre.trim()) return "Sin espacios al principio ni al final.";
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(nombre)) return "Sin / \\ : * ? \" < > |.";
    if (nombre === "." || nombre === "..") return "Ese nombre no vale.";
    if (nombre.length > 120) return "Demasiado largo.";
    return null;
  }

  const EJEMPLOS = {
    "main.py": [
      "# Mobile Coder · Python 3.14 sin conexión",
      'nombres = ["Ada", "Alan", "Grace"]',
      "for i, nombre in enumerate(nombres, 1):",
      '    print(f"{i}. Hola, {nombre}")',
      "",
      "total = sum(len(n) for n in nombres)",
      'print("Letras en total:", total)',
      "",
    ].join("\n"),
    "main.js": [
      "// Mobile Coder · JavaScript sin conexión",
      'const nombres = ["Ada", "Alan", "Grace"];',
      "nombres.forEach((nombre, i) => console.log(`${i + 1}. Hola, ${nombre}`));",
      "",
      "const total = nombres.reduce((s, n) => s + n.length, 0);",
      'console.log("Letras en total:", total);',
      "",
    ].join("\n"),
  };

  // Proyecto en localStorage: { archivos: { ruta: texto }, carpetas: [ruta] }.
  function local({ clave, nombre, tipo }) {
    const CLAVE = "mc-proyecto-" + clave;
    let datos = null;
    try { datos = JSON.parse(localStorage.getItem(CLAVE)); } catch { /* sin almacenamiento: en memoria */ }
    if (!datos || typeof datos.archivos !== "object") datos = { archivos: { ...EJEMPLOS }, carpetas: [] };
    const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* en memoria */ } };
    const esCarpeta = (ruta) => ruta === "" || datos.carpetas.includes(ruta);
    const existe = (ruta) => esCarpeta(ruta) || Object.hasOwn(datos.archivos, ruta);
    return {
      tipo, nombre, clave,
      async listar(dir = "") {
        if (!esCarpeta(dir)) throw Error("La carpeta no existe.");
        const hijos = new Map();
        for (const c of datos.carpetas) if (padreDe(c) === dir) hijos.set(c, { nombre: nombreDe(c), ruta: c, tipo: "carpeta" });
        for (const [r, t] of Object.entries(datos.archivos)) if (padreDe(r) === dir) hijos.set(r, { nombre: nombreDe(r), ruta: r, tipo: "archivo", tamano: new Blob([t]).size });
        return [...hijos.values()];
      },
      async leer(ruta) {
        if (!Object.hasOwn(datos.archivos, ruta)) throw Error("El archivo no existe.");
        return datos.archivos[ruta];
      },
      async escribir(ruta, texto) {
        if (!esCarpeta(padreDe(ruta))) throw Error("La carpeta no existe.");
        if (esCarpeta(ruta)) throw Error("Ya hay una carpeta con ese nombre.");
        datos.archivos[ruta] = String(texto); guardar();
      },
      async crearArchivo(ruta, texto = "") {
        if (existe(ruta)) throw Error("Ya existe.");
        await this.escribir(ruta, texto);
      },
      async crearCarpeta(ruta) {
        if (existe(ruta)) throw Error("Ya existe.");
        if (!esCarpeta(padreDe(ruta))) throw Error("La carpeta no existe.");
        datos.carpetas.push(ruta); guardar();
      },
    };
  }

  // Carpeta del teléfono a través del envoltorio.
  function telefono({ nombre }) {
    const p = (accion, datos) => MC.puente.pedir(accion, datos);
    return {
      tipo: "android", nombre, clave: "android:" + nombre,
      listar: (dir = "") => p("listar", { ruta: dir }).then((lista) => lista.map((e) => ({ ...e, ruta: unir(dir, e.nombre) }))),
      leer: (ruta) => p("leer", { ruta }).then((d) => d.texto),
      escribir: (ruta, texto) => p("escribir", { ruta, texto: String(texto) }),
      crearArchivo: (ruta, texto = "") => p("crearArchivo", { ruta, texto: String(texto) }),
      crearCarpeta: (ruta) => p("crearCarpeta", { ruta }),
    };
  }

  MC.archivos = {
    lenguajeDe, motivoNombre, unir, padreDe, nombreDe,
    // El proyecto con el que arranca la app: la carpeta elegida (Android), los borradores (Android sin carpeta)
    // o el proyecto de prueba del navegador.
    async inicial() {
      if (!MC.puente.disponible) return local({ clave: "navegador", nombre: "Proyecto de prueba del navegador", tipo: "navegador" });
      try {
        const e = await MC.puente.pedir("estado");
        if (e && e.carpeta) return telefono(e.carpeta);
      } catch (err) { console.warn("Mobile Coder: sin estado del envoltorio", err); }
      return local({ clave: "borradores", nombre: "Borradores de la app", tipo: "borradores" });
    },
    // Abre el selector de carpetas del sistema. Rechaza con codigo "cancelado" si el usuario sale sin elegir.
    async elegirCarpeta() {
      const c = await MC.puente.pedir("elegirCarpeta");
      return telefono(c);
    },
  };
})();
