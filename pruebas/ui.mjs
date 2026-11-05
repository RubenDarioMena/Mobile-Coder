#!/usr/bin/env node
// Pruebas de la app web en Chromium emulando un teléfono táctil (Pixel 7, 412 × 915). No es un teléfono real.
// Levanta su propio servidor de web/ en el puerto 8782 y bloquea toda petición que no vaya a él: si algo
// necesitara Internet, fallaría. Necesita Playwright con Chromium (en este entorno ya está instalado).
//
//   node pruebas/ui.mjs            todas
//   node pruebas/ui.mjs python     solo las que contienen «python» en el nombre
import { createRequire } from "node:module";
import { servir } from "../herramientas/servir.mjs";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const PUERTO = 8782, BASE = `http://127.0.0.1:${PUERTO}/index.html`;
const filtro = (process.argv[2] || "").toLowerCase();
const servidor = await servir(PUERTO, "127.0.0.1");
const navegador = await chromium.launch();
const externas = [], locales = new Set(), erroresPagina = [];
let ok = 0, fallos = 0;

function comprobar(cond, mensaje) { if (!cond) throw Error(mensaje); }
async function prueba(nombre, fn) {
  if (filtro && !nombre.toLowerCase().includes(filtro)) return;
  try { await fn(); ok++; console.log("✓", nombre); }
  catch (e) { fallos++; console.log("✗", nombre, "\n   ", (e && e.message ? e.message : String(e)).split("\n").join("\n    ")); }
}

// Un teléfono nuevo (almacenamiento vacío). Con `puente`, un envoltorio Android simulado (ver más abajo).
async function telefono({ puente = null } = {}) {
  const ctx = await navegador.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 1 });
  await ctx.route("**/*", (ruta) => {
    const u = new URL(ruta.request().url());
    if (u.hostname === "127.0.0.1" && Number(u.port) === PUERTO) { locales.add(u.pathname); return ruta.continue(); }
    externas.push(u.href); return ruta.abort();
  });
  if (puente) await ctx.addInitScript(puenteSimulado, puente);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erroresPagina.push(e.message));
  return { ctx, p };
}
async function abrirApp(p) {
  await p.goto(BASE);
  await p.waitForFunction(() => document.body.dataset.listo, null, { timeout: 15000 });
  comprobar(await p.evaluate(() => document.body.dataset.listo) === "true", "la app no arrancó");
}
const caja = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"; }, sel);
const textoConsola = (p) => p.evaluate(() => document.querySelector("#consola").innerText);
async function escribirCodigo(p, texto) {
  await p.evaluate((t) => { const c = MC.editor.codigo; c.value = t; c.dispatchEvent(new Event("input", { bubbles: true })); }, texto);
}
// Ejecuta y espera la nota final de esa ejecución (Terminado, ✗ o Detenido).
async function ejecutar(p, { timeout = 30000 } = {}) {
  const antes = await p.evaluate(() => document.querySelectorAll("#consola .c-inicio").length);
  await p.click("#b-ejecutar");
  await p.waitForFunction((n) => {
    const inicios = document.querySelectorAll("#consola .c-inicio");
    if (inicios.length <= n) return false;
    let e = inicios[inicios.length - 1].nextElementSibling;
    for (; e; e = e.nextElementSibling) if (e.matches(".c-ok, .c-detenido, .c-fin") || (e.matches(".c-fallo") && /✗/.test(e.textContent))) return document.body.dataset.ejecutando === "false";
    return false;
  }, antes, { timeout });
  return p.evaluate(() => { const i = [...document.querySelectorAll("#consola .c-inicio")].pop(); let t = "", e = i; for (; e; e = e.nextElementSibling) t += e.textContent + "\n"; return t; });
}
async function abrirArchivo(p, ruta) {
  await p.click("#b-archivos");
  await p.click(`.entrada[data-ruta="${ruta}"]`);
  await p.waitForFunction((r) => document.querySelector("#nombre-archivo").textContent === r.split("/").pop(), ruta);
}
const lineaErr = (p) => p.evaluate(() => [...document.querySelectorAll(".gutter-in div.err")].map((d) => d.textContent));

// ---------- Envoltorio Android simulado: el mismo protocolo que app/src/main/kotlin/.../Puente.kt ----------
function puenteSimulado(cfg) {
  const fs = { archivos: { ...(cfg.archivos || {}) }, carpetas: [...(cfg.carpetas || [])] };
  let carpeta = cfg.carpeta || null;
  const padre = (r) => (r.includes("/") ? r.slice(0, r.lastIndexOf("/")) : "");
  const registro = (window.__puente = []);
  const nativo = {
    onmessage: null,
    postMessage(json) {
      const m = JSON.parse(json);
      registro.push(m);
      const responder = (ok, datos, error, codigo) => setTimeout(() => nativo.onmessage && nativo.onmessage({ data: JSON.stringify({ id: m.id, ok, datos, error, codigo }) }), 5);
      const r = m.ruta;
      switch (m.accion) {
        case "estado": return responder(true, { carpeta });
        case "elegirCarpeta": return cfg.cancelar ? responder(false, null, "Cancelado", "cancelado") : (carpeta = { nombre: cfg.elegir || "Elegida" }, responder(true, carpeta));
        case "listar": {
          const hijos = [...fs.carpetas.filter((c) => padre(c) === r).map((c) => ({ nombre: c.split("/").pop(), tipo: "carpeta" })),
            ...Object.keys(fs.archivos).filter((a) => padre(a) === r).map((a) => ({ nombre: a.split("/").pop(), tipo: "archivo", tamano: fs.archivos[a].length }))];
          return responder(true, hijos);
        }
        case "leer": return r in fs.archivos ? responder(true, { texto: fs.archivos[r] }) : responder(false, null, "No existe", "no-existe");
        case "escribir": fs.archivos[r] = m.texto; return responder(true, {});
        case "crearArchivo": if (r in fs.archivos) return responder(false, null, "Ya existe", "existe"); fs.archivos[r] = m.texto || ""; return responder(true, {});
        case "crearCarpeta": fs.carpetas.push(r); return responder(true, {});
        default: return responder(false, null, "Acción desconocida");
      }
    },
  };
  window.MobileCoderAndroid = nativo;
  window.__fs = fs;
}

// =====================================================================================================
const { ctx, p } = await telefono();
await abrirApp(p);

await prueba("arranque: abre main.py en el teléfono, sin errores", async () => {
  comprobar(await p.textContent("#nombre-archivo") === "main.py", "no abrió main.py");
  comprobar(await p.textContent("#lenguaje-archivo") === "PY", "falta la marca PY");
  comprobar(await p.evaluate(() => MC.editor.forma()) === "movil", "el editor no está en forma de teléfono");
  comprobar(await p.evaluate(() => MC.editor.codigo.value.includes("enumerate(nombres, 1)")), "el código de ejemplo no está");
});

await prueba("distribución: barra superior, código, ProtoMouse e inserción al pie", async () => {
  comprobar(!(await visible(p, ".editor-herramientas")), "las herramientas del componente siguen visibles");
  for (const id of ["#b-archivos", "#b-nombre", "#b-ejecutar", "#b-teclado", "#b-menu"]) comprobar(await visible(p, id), id + " no se ve");
  const sup = await caja(p, ".barra-sup"), ed = await caja(p, '[data-editor="editor"]'), barra = await caja(p, '[data-editor="edicion"]'), pal = await caja(p, '[data-editor="paleta"]');
  const pm = await caja(p, ".protomouse");
  const alto = await p.evaluate(() => innerHeight);
  comprobar(sup.b <= ed.y && ed.b <= barra.y && barra.b <= pal.y, `orden vertical: sup ${sup.b} editor ${ed.y}-${ed.b} barra ${barra.y}-${barra.b} paleta ${pal.y}`);
  comprobar(pal.b <= alto + 1 && alto - pal.b < 12, `la barra de inserción no queda al pie (${pal.b} de ${alto})`);
  comprobar(ed.h > alto * 0.55, `el código ocupa poco: ${ed.h} de ${alto}`);
  comprobar(pm && pm.w > 60, "no se ve el ProtoMouse");
  for (const a of ["deshacer", "rehacer", "cortar", "copiar", "pegar"]) comprobar(await visible(p, `[data-editor="edicion"] [data-accion="${a}"]`), a + " no se ve");
});

await prueba("distribución: la barra de símbolos no aparece al escribir", async () => {
  await p.focus('[data-editor="codigo"]');
  comprobar(!(await visible(p, '[data-editor="simbolos"]')), "aparece la barra de símbolos");
  await p.evaluate(() => document.activeElement.blur());
});

const ordenPaleta = () => p.evaluate(() => [...document.querySelectorAll('[data-editor="paleta"] > *')]
  .filter((e) => e.getClientRects().length).sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
  .map((e) => (e.classList.contains("sep-movil") ? "|" : e.dataset.ico || "")).filter((x) => x));
await prueba("barra de inserción: con teclado, edición y sintaxis primero", async () => {
  const orden = await ordenPaleta();
  comprobar(orden.slice(0, 4).join() === "lineaNueva,tabular,comentar,borrar", "empieza por " + orden.slice(0, 6).join());
  const sep = orden.indexOf("|");
  comprobar(sep > 4 && sep < orden.length - 1, "el separador no queda entre los dos conjuntos: " + orden.join());
});

await prueba("sin teclado: interruptor arriba y los bloques pasan delante", async () => {
  await p.evaluate(() => { document.querySelector('[data-editor="paleta"]').scrollLeft = 200; });
  await p.click("#b-teclado");
  comprobar(await p.getAttribute("#b-teclado", "aria-pressed") === "true", "el interruptor no queda encendido");
  comprobar(await p.evaluate(() => document.querySelector("#raiz-editor").dataset.sinTeclado) === "true", "el editor no está sin teclado");
  const orden = await ordenPaleta();
  const sep = orden.indexOf("|");
  comprobar(sep > 0 && orden.indexOf("lineaNueva") === sep + 1, "orden sin teclado: " + orden.join());
  comprobar(await p.evaluate(() => document.querySelector('[data-editor="paleta"]').scrollLeft) === 0, "la barra no volvió al principio");
  await p.click("#b-teclado");
  comprobar(await p.getAttribute("#b-teclado", "aria-pressed") === "false", "no vuelve al teclado");
});

await prueba("hoja: pestaña en la esquina; abre a media pantalla, del ancho del código", async () => {
  const ed = await caja(p, '[data-editor="editor"]'), tab = await caja(p, ".hoja-abrir");
  comprobar(Math.abs(tab.b - ed.b) < 2 && Math.abs(ed.r - tab.r - 10) < 2, `pestaña fuera de la esquina: ${JSON.stringify(tab)} editor ${JSON.stringify(ed)}`);
  await p.click(".hoja-abrir");
  await p.waitForTimeout(250);
  const h = await caja(p, "#hoja"), alto = await p.evaluate(() => innerHeight);
  comprobar(Math.abs(h.w - ed.w) < 1 && Math.abs(h.x - ed.x) < 1, "la hoja no tiene el ancho del código");
  const esperado = Math.min(alto / 2, ed.h - 30);
  comprobar(Math.abs(h.h - esperado) < 2, `alto ${h.h}, esperado ${esperado}`);
  comprobar(!(await visible(p, ".hoja-abrir")), "la pestaña sigue a la vista");
});

await prueba("hoja: el asa cambia el alto, se recuerda y llevarla abajo la cierra", async () => {
  const antes = await caja(p, "#hoja"), asa = await caja(p, ".hoja-asa");
  await p.mouse.move(asa.x + asa.w / 2, asa.y + asa.h / 2); await p.mouse.down();
  await p.mouse.move(asa.x + asa.w / 2, asa.y + asa.h / 2 - 120, { steps: 6 }); await p.mouse.up();
  const despues = await caja(p, "#hoja");
  comprobar(Math.abs(despues.h - antes.h - 120) < 3, `creció ${despues.h - antes.h}`);
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem("mc-hoja-alto")));
  comprobar(guardado > 0.15 && guardado <= 1, "no guardó el alto: " + guardado);
  await p.click("#b-cerrar-hoja");
  await p.click(".hoja-abrir"); await p.waitForTimeout(250);
  comprobar(Math.abs((await caja(p, "#hoja")).h - despues.h) < 2, "no recordó el alto al reabrir");
  const a2 = await caja(p, ".hoja-asa"), ed = await caja(p, '[data-editor="editor"]');
  await p.mouse.move(a2.x + a2.w / 2, a2.y + a2.h / 2); await p.mouse.down();
  await p.mouse.move(a2.x + a2.w / 2, ed.b - 10, { steps: 8 }); await p.mouse.up();
  comprobar(!(await visible(p, "#hoja")) && (await visible(p, ".hoja-abrir")), "no se cerró al llevar el asa abajo");
  comprobar(Math.abs(await p.evaluate(() => JSON.parse(localStorage.getItem("mc-hoja-alto"))) - guardado) < 1e-6, "cerrar arrastrando cambió el alto guardado");
});

// ---------- Python ----------
await prueba("python: ejecuta main.py sin conexión", async () => {
  const t = await ejecutar(p, { timeout: 60000 });
  comprobar(t.includes("1. Hola, Ada") && t.includes("Letras en total: 12") && /✓ Terminado/.test(t), t);
  comprobar(/^Python 3\.14/.test(await p.textContent("#motor-estado")), "estado: " + await p.textContent("#motor-estado"));
  comprobar(await visible(p, "#hoja"), "la consola no se abrió al ejecutar");
});

await prueba("python: error con la línea, traceback limpio y marca en el código", async () => {
  await escribirCodigo(p, "x = 1\ny = 0\nprint(x / y)\n");
  const t = await ejecutar(p);
  comprobar(t.includes("ZeroDivisionError") && t.includes("en la línea 3"), t);
  comprobar(t.includes('File "main.py", line 3') && !t.includes("_pyodide"), "traceback sin limpiar:\n" + t);
  comprobar((await lineaErr(p)).join() === "3", "marca en " + (await lineaErr(p)).join());
  await p.click("#consola .c-fallo.con-linea");
  const linea = await p.evaluate(() => { const c = MC.editor.codigo; return c.value.slice(0, c.selectionStart).split("\n").length; });
  comprobar(linea === 3, "tocar el error lleva a la línea " + linea);
});

await prueba("python: error de sintaxis sin cabecera Traceback", async () => {
  await escribirCodigo(p, 'print("hola"\n');
  const t = await ejecutar(p);
  comprobar(t.includes("SyntaxError") && t.includes("en la línea 1") && !t.includes("Traceback"), t);
});

await prueba("python: print con end, stderr y espacio de nombres nuevo en cada ejecución", async () => {
  await escribirCodigo(p, 'import sys\nprint("a", end="")\nprint("b")\nsys.stderr.write("problema\\n")\nx = 5\n');
  const t = await ejecutar(p);
  comprobar(t.includes("\nab\n"), "no unió la línea:\n" + t);
  comprobar(await p.evaluate(() => [...document.querySelectorAll("#consola .c-error")].some((e) => e.textContent === "problema")), "stderr sin clase de error");
  await escribirCodigo(p, "print(x)\n");
  comprobar((await ejecutar(p)).includes("NameError"), "la variable sobrevivió entre ejecuciones");
});

await prueba("python: biblioteca estándar sin conexión", async () => {
  await escribirCodigo(p, "import json, math, random, datetime, collections, re, itertools, functools, statistics, dataclasses, decimal, fractions\nprint(json.dumps({'pi': round(math.pi, 2)}), statistics.mean([1, 2, 3]))\n");
  const t = await ejecutar(p);
  comprobar(t.includes('{"pi": 3.14} 2') && /✓ Terminado/.test(t), t);
});

await prueba("python: input() avisa de que aún no está", async () => {
  await escribirCodigo(p, 'nombre = input("¿Nombre? ")\n');
  const t = await ejecutar(p);
  comprobar(t.includes("input() todavía no está disponible") && t.includes("en la línea 1"), t);
});

await prueba("python: ■ corta un bucle infinito y Python se recarga", async () => {
  await escribirCodigo(p, "while True:\n    pass\n");
  await p.click("#b-ejecutar");
  await p.waitForTimeout(700);
  comprobar(await p.evaluate(() => document.body.dataset.ejecutando) === "true", "no estaba corriendo");
  comprobar(await p.getAttribute("#b-ejecutar", "aria-label") === "Detener", "el botón no ofrece detener");
  await p.click("#b-ejecutar");
  await p.waitForFunction(() => document.body.dataset.ejecutando === "false", null, { timeout: 2000 });
  // La consola pinta en el siguiente cuadro: se espera a la nota.
  await p.waitForFunction(() => /■ Detenido/.test(document.querySelector("#consola").innerText), null, { timeout: 1000 }).catch(() => {});
  comprobar(/■ Detenido/.test(await textoConsola(p)), "sin nota de detenido");
  await escribirCodigo(p, 'print("otra vez")\n');
  const t = await ejecutar(p, { timeout: 60000 });
  comprobar(t.includes("otra vez") && /✓ Terminado/.test(t), t);
});

// ---------- JavaScript ----------
await prueba("javascript: ejecuta main.js", async () => {
  await abrirArchivo(p, "main.js");
  comprobar(await p.textContent("#lenguaje-archivo") === "JS", "falta la marca JS");
  const t = await ejecutar(p);
  comprobar(t.includes("1. Hola, Ada") && t.includes("Letras en total: 12") && /✓ Terminado/.test(t), t);
  comprobar(await p.textContent("#motor-estado") === "JavaScript", "estado: " + await p.textContent("#motor-estado"));
});

await prueba("javascript: error en tiempo de ejecución con su línea", async () => {
  await escribirCodigo(p, 'const a = null;\nconsole.log("antes");\na.x = 1;\n');
  const t = await ejecutar(p);
  comprobar(t.includes("antes") && t.includes("TypeError") && t.includes("en la línea 3"), t);
  comprobar((await lineaErr(p)).join() === "3", "marca en " + (await lineaErr(p)).join());
});

await prueba("javascript: error de sintaxis con su línea", async () => {
  await escribirCodigo(p, 'console.log("a");\nlet x = ;\n');
  const t = await ejecutar(p);
  comprobar(t.includes("SyntaxError") && t.includes("en la línea 2"), t);
});

await prueba("javascript: temporizadores, formato de valores y console.error", async () => {
  await escribirCodigo(p, 'setTimeout(() => console.log("después"), 300);\nconsole.log("antes");\nconsole.log({ a: 1, b: [1, 2] }, "x");\nconsole.error("mal");\n');
  const t = await ejecutar(p);
  comprobar(/antes[\s\S]*\{ a: 1, b: \[ 1, 2 \] \} x[\s\S]*después[\s\S]*✓ Terminado/.test(t), t);
  comprobar(await p.evaluate(() => [...document.querySelectorAll("#consola .c-error")].some((e) => e.textContent === "mal")), "console.error sin clase de error");
});

await prueba("javascript: ■ corta un bucle infinito", async () => {
  await escribirCodigo(p, "while (true) {}\n");
  await p.click("#b-ejecutar");
  await p.waitForTimeout(400);
  comprobar(await p.evaluate(() => document.body.dataset.ejecutando) === "true", "no estaba corriendo");
  await p.click("#b-ejecutar");
  await p.waitForFunction(() => document.body.dataset.ejecutando === "false", null, { timeout: 1500 });
  await escribirCodigo(p, 'console.log("sigue vivo");\n');
  comprobar((await ejecutar(p)).includes("sigue vivo"), "no volvió a ejecutar");
});

// ---------- Archivos (proyecto del navegador) ----------
await prueba("archivos: crear, guardar solo y reabrir al volver", async () => {
  await p.click("#b-archivos");
  comprobar(await p.textContent("#proyecto-nombre") === "Proyecto de prueba del navegador", "proyecto: " + await p.textContent("#proyecto-nombre"));
  comprobar(!(await visible(p, "#b-carpeta")), "en el navegador no hay carpeta que elegir");
  await p.click("#b-nuevo-archivo");
  await p.fill("#dialogo-nombre-campo", "hola.py");
  await p.click('#dialogo-nombre button[value="aceptar"]');
  await p.waitForFunction(() => document.querySelector("#nombre-archivo").textContent === "hola.py");
  comprobar(await p.evaluate(() => MC.editor.codigo.value) === "", "el archivo nuevo no está vacío");
  await escribirCodigo(p, 'print("guardado")\n');
  comprobar(await p.textContent("#guardado") === "●", "no marca el cambio sin guardar");
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("mc-proyecto-navegador")).archivos["hola.py"] === 'print("guardado")\n', null, { timeout: 3000 });
  comprobar(await p.textContent("#guardado") === "", "sigue marcado como sin guardar");
  await p.reload();
  await p.waitForFunction(() => document.body.dataset.listo === "true");
  comprobar(await p.textContent("#nombre-archivo") === "hola.py", "no reabrió el último archivo");
  comprobar(await p.evaluate(() => MC.editor.codigo.value) === 'print("guardado")\n', "perdió el contenido");
});

await prueba("archivos: carpetas, ruta y nombres no válidos", async () => {
  await p.click("#b-archivos");
  await p.click("#b-nueva-carpeta");
  await p.fill("#dialogo-nombre-campo", "ejemplos");
  await p.click('#dialogo-nombre button[value="aceptar"]');
  await p.click('.entrada[data-ruta="ejemplos"]');
  comprobar(await visible(p, "#ruta") && (await p.textContent("#ruta")).includes("ejemplos"), "sin ruta dentro de la carpeta");
  await p.click("#b-nuevo-archivo");
  for (const [nombre, motivo] of [["mal/nombre.py", "Sin /"], ["sin-extension", ".py o .js"]]) {
    await p.fill("#dialogo-nombre-campo", nombre);
    await p.click('#dialogo-nombre button[value="aceptar"]');
    comprobar(await p.evaluate(() => document.querySelector("#dialogo-nombre").open), `aceptó «${nombre}»`);
    comprobar((await p.textContent("#dialogo-nombre-nota")).includes(motivo), "nota: " + await p.textContent("#dialogo-nombre-nota"));
  }
  await p.fill("#dialogo-nombre-campo", "otro.js");
  await p.click('#dialogo-nombre button[value="aceptar"]');
  await p.waitForFunction(() => document.querySelector("#nombre-archivo").textContent === "otro.js");
  comprobar(await p.evaluate(() => "ejemplos/otro.js" in JSON.parse(localStorage.getItem("mc-proyecto-navegador")).archivos), "no se creó en la carpeta");
});

await prueba("menú ⋯: placas, letra y acerca de", async () => {
  await p.click("#b-menu");
  comprobar(await visible(p, "#menu"), "no abre el menú");
  const antes = await p.evaluate(() => getComputedStyle(document.querySelector("#raiz-editor")).getPropertyValue("--code-size"));
  await p.click('[data-opcion="mas"]');
  const despues = await p.evaluate(() => getComputedStyle(document.querySelector("#raiz-editor")).getPropertyValue("--code-size"));
  comprobar(antes !== despues, `la letra no cambió (${antes})`);
  comprobar(!(await visible(p, "#menu")), "el menú no se cerró");
  await p.click("#b-menu"); await p.click('[data-opcion="acerca"]');
  await p.waitForFunction(() => document.querySelector("#acerca").open && /pyodide@314/.test(document.querySelector("#acerca-datos").textContent));
  comprobar((await p.textContent("#acerca-datos")).includes("56435c7"), "no muestra el origen del editor");
  await p.click('#acerca button[value="cerrar"]');
});

await prueba("atrás (Android): cierra lo abierto y luego deja salir", async () => {
  await p.click(".hoja-abrir").catch(() => {});
  comprobar(await p.evaluate(() => MC.atras()) === true && !(await visible(p, "#hoja")), "no cerró la hoja");
  await p.click("#b-archivos");
  comprobar(await p.evaluate(() => MC.atras()) === true && !(await visible(p, "#archivos")), "no cerró los archivos");
  comprobar(await p.evaluate(() => MC.atras()) === false, "no deja salir");
});
await ctx.close();

// ---------- Envoltorio Android simulado ----------
await prueba("puente: usa la carpeta del teléfono y guarda por el envoltorio", async () => {
  const { ctx, p } = await telefono({ puente: { carpeta: { nombre: "Proyectos" }, archivos: { "main.py": 'print("desde la carpeta")\n', "notas.txt": "hola" }, carpetas: ["lib"] } });
  await abrirApp(p);
  comprobar(await p.evaluate(() => MC.editor.codigo.value) === 'print("desde la carpeta")\n', "no abrió main.py de la carpeta");
  await p.click("#b-archivos");
  comprobar(await p.textContent("#proyecto-tipo") === "Carpeta del teléfono" && await p.textContent("#proyecto-nombre") === "Proyectos", "proyecto mal mostrado");
  comprobar(await p.textContent("#b-carpeta") === "Cambiar carpeta", "falta «Cambiar carpeta»");
  comprobar(await p.evaluate(() => document.querySelector('.entrada[data-ruta="notas.txt"]').disabled), "un .txt se puede abrir");
  await p.click("#b-cerrar-archivos");
  await escribirCodigo(p, 'print("editado")\n');
  await p.waitForFunction(() => window.__fs.archivos["main.py"] === 'print("editado")\n', null, { timeout: 3000 });
  const acciones = await p.evaluate(() => window.__puente.map((m) => m.accion));
  comprobar(acciones[0] === "estado" && acciones.includes("leer") && acciones.includes("escribir"), "acciones: " + acciones.join());
  await ctx.close();
});

await prueba("puente: sin carpeta usa borradores; elegir carpeta y cancelar", async () => {
  for (const cancelar of [false, true]) {
    const { ctx, p } = await telefono({ puente: { carpeta: null, elegir: "MisProyectos", cancelar } });
    await abrirApp(p);
    await p.click("#b-archivos");
    comprobar(await p.textContent("#proyecto-nombre") === "Borradores de la app", "sin carpeta: " + await p.textContent("#proyecto-nombre"));
    comprobar(await p.textContent("#b-carpeta") === "Elegir carpeta", "falta «Elegir carpeta»");
    await p.click("#b-carpeta");
    await p.waitForTimeout(100);
    if (cancelar) comprobar(await p.textContent("#nota-archivos") === "" && await p.textContent("#proyecto-nombre") === "Borradores de la app", "cancelar cambió algo");
    else comprobar(await p.textContent("#proyecto-nombre") === "MisProyectos" && (await p.textContent("#nota-archivos")).includes("MisProyectos"), "no cambió a la carpeta elegida");
    await ctx.close();
  }
});

await prueba("sin conexión: ninguna petición fuera de la app y Python servido localmente", async () => {
  comprobar(externas.length === 0, "peticiones externas: " + externas.join(", "));
  for (const f of ["/vendor/pyodide/pyodide.asm.wasm", "/vendor/pyodide/python_stdlib.zip", "/app/motor-js.js"]) comprobar(locales.has(f), "no se vio " + f);
  comprobar(erroresPagina.length === 0, "errores de la página: " + erroresPagina.join(" | "));
});

await navegador.close();
servidor.close();
console.log(`\n${ok} correctas, ${fallos} con fallos (Chromium emulando un Pixel 7; no es un teléfono real).`);
process.exit(fallos ? 1 : 0);
