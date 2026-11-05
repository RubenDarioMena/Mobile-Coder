/* Índice del proyecto: qué hay en la carpeta y el texto de sus archivos de código y de datos.
 * Lo usan los servicios de lenguaje (un archivo ve lo que importa o enlaza) y la ejecución (los import entre
 * archivos y, en Python, leer los datos del proyecto). El archivo abierto se actualiza mientras se escribe.
 * Se recorre la carpeta al abrir el proyecto, con límites: una carpeta muy grande (Descargas, Documentos…) no
 * bloquea la app; lo que pase del límite no se indexa y se avisa. */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const TEXTO = /\.(js|mjs|cjs|py|html?|css|json|txt|csv|tsv|md|xml|svg|toml|ini|cfg)$/i;
  const SALTAR = new Set(["node_modules", "__pycache__", "venv", ".venv", "env", ".git", "build", "dist"]);
  const LIMITES = { archivos: 400, carpetas: 200, profundidad: 8, bytes: 1048576, total: 12 * 1048576, ms: 20000 };
  const padreDe = (r) => (r.includes("/") ? r.slice(0, r.lastIndexOf("/")) : "");

  function crear(fuente, { alCambiar = () => {} } = {}) {
    const textos = new Map(), rutas = new Set(), carpetas = new Set();
    let generacion = 0, aviso = "", cargado = false, ultima = 0;

    async function cargar() {
      const g = ++generacion, t0 = performance.now();
      const nuevasRutas = new Set(), nuevasCarpetas = new Set(), nuevos = new Map();
      let total = 0, leidos = 0, visitadas = 0;
      aviso = "";
      const cola = [["", 0]], porLeer = [];
      while (cola.length) {
        const [dir, prof] = cola.shift();
        if (++visitadas > LIMITES.carpetas || performance.now() - t0 > LIMITES.ms) { aviso = "La carpeta es muy grande: solo se revisó una parte."; break; }
        let lista;
        try { lista = await fuente.listar(dir); } catch { continue; }
        if (g !== generacion) return;
        for (const e of lista) {
          if (e.nombre.startsWith(".") || SALTAR.has(e.nombre)) continue;
          if (e.tipo === "carpeta") { nuevasCarpetas.add(e.ruta); if (prof + 1 < LIMITES.profundidad) cola.push([e.ruta, prof + 1]); continue; }
          nuevasRutas.add(e.ruta);
          if (TEXTO.test(e.nombre) && (e.tamano == null || e.tamano <= LIMITES.bytes)) porLeer.push(e);
        }
      }
      // Se leen de cuatro en cuatro: en Android cada lectura pasa por el envoltorio.
      let i = 0;
      const leer = async () => {
        while (i < porLeer.length) {
          const e = porLeer[i++];
          if (leidos >= LIMITES.archivos || total > LIMITES.total) { aviso = aviso || "Hay demasiados archivos: solo se leyó una parte."; return; }
          try {
            const t = await fuente.leer(e.ruta);
            if (g !== generacion) return;
            leidos++; total += t.length; nuevos.set(e.ruta, t);
          } catch { /* ilegible: queda en la lista sin texto */ }
        }
      };
      await Promise.all([leer(), leer(), leer(), leer()]);
      if (g !== generacion) return;
      // Lo que se editó mientras se leía manda sobre lo leído.
      for (const [r, t] of pendientes) nuevos.set(r, t);
      pendientes.clear();
      textos.clear(); rutas.clear(); carpetas.clear();
      for (const [r, t] of nuevos) textos.set(r, t);
      for (const r of nuevasRutas) rutas.add(r);
      for (const r of textos.keys()) rutas.add(r);
      for (const c of nuevasCarpetas) carpetas.add(c);
      cargado = true; ultima = Date.now();
      alCambiar({ tipo: "proyecto" });
    }
    const pendientes = new Map();
    return {
      cargar,
      get cargado() { return cargado; },
      get aviso() { return aviso; },
      get antiguedad() { return ultima ? Date.now() - ultima : Infinity; },
      texto: (ruta) => textos.get(ruta),
      // Texto nuevo de un archivo (lo que se escribe, se guarda o se crea). null: ya no está.
      // silencio: lo que se escribe en el archivo abierto; los servicios lo reciben con cada petición.
      poner(ruta, texto, { silencio = false } = {}) {
        if (!cargado) pendientes.set(ruta, texto);
        if (texto == null) { if (!textos.delete(ruta) && !rutas.has(ruta)) return; rutas.delete(ruta); }
        else {
          if (textos.get(ruta) === texto) return;
          if (TEXTO.test(ruta)) textos.set(ruta, texto);
          rutas.add(ruta);
          for (let p = padreDe(ruta); p; p = padreDe(p)) carpetas.add(p);
        }
        if (!silencio) alCambiar({ tipo: "cambio", ruta, texto: texto == null ? null : TEXTO.test(ruta) ? texto : "" });
      },
      ponerCarpeta(ruta) { carpetas.add(ruta); alCambiar({ tipo: "carpeta", ruta }); },
      // Lo que reciben los servicios de lenguaje.
      foto: () => ({ archivos: [...textos], rutas: [...rutas], carpetas: [...carpetas] }),
      // Los textos cuya ruta cumple el filtro: { ruta: texto }.
      textos(filtro = () => true) { const o = {}; for (const [r, t] of textos) if (filtro(r)) o[r] = t; return o; },
      tiene: (ruta) => rutas.has(ruta),
    };
  }
  MC.proyecto = { crear, TEXTO };
})();
