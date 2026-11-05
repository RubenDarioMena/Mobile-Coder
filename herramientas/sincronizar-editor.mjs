#!/usr/bin/env node
// Copia la interfaz del editor compartido de Code Battle Lite a web/cmg/, con la misma estructura de carpetas
// (shared/editor, shared/css, shared/js, shared/vendor), y anota el origen en web/cmg/ORIGEN.json.
// La copia no se edita a mano: los cambios de la interfaz se hacen en Code Battle Lite y se vuelven a copiar.
//
//   node herramientas/sincronizar-editor.mjs <carpeta de Code-Battles_lite>
//
// `node herramientas/verificar.mjs` comprueba después que nadie tocó la copia.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Lo que carga un editor autónomo (el mismo orden que shared/editor/demo.html), sin la demo ni el seudocódigo.
export const ARCHIVOS = [
  "shared/editor/tema.css", "shared/editor/editor.css", "shared/css/edicion.css", "shared/editor/autonomo.css",
  "shared/vendor/acorn-8.11.3.js", "shared/js/iconos.js", "shared/js/estructura.js",
  "shared/editor/javascript.js", "shared/editor/lenguajes.js", "shared/editor/plantillas.js", "shared/editor/adaptador-js.js",
  "shared/vendor/lezer-python-1.1.19.js", "shared/editor/python.js", "shared/editor/estructura-python.js", "shared/editor/adaptador-python.js",
  "shared/editor/vida.js", "shared/editor/tips.js", "shared/editor/edicion.js", "shared/editor/nucleo-ui.js", "shared/editor/editor.js",
  "shared/vendor/LICENSE-acorn", "shared/vendor/LICENSE-lezer",
];

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "web", "cmg");
const sha256 = (datos) => createHash("sha256").update(datos).digest("hex");

function principal() {
  const origen = process.argv[2];
  if (!origen) {
    console.error("Uso: node herramientas/sincronizar-editor.mjs <carpeta de Code-Battles_lite>");
    process.exit(2);
  }
  const git = (...args) => execFileSync("git", ["-C", origen, ...args], { encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  const rama = git("rev-parse", "--abbrev-ref", "HEAD");
  // Copiar archivos con cambios sin commit dejaría un origen que nadie puede reproducir.
  const pendientes = git("status", "--porcelain", "--", ...ARCHIVOS);
  if (pendientes && !process.argv.includes("--permitir-cambios")) {
    console.error("Hay cambios sin commit en el origen:\n" + pendientes + "\nHaz commit allí o usa --permitir-cambios.");
    process.exit(1);
  }
  fs.rmSync(destino, { recursive: true, force: true });
  const archivos = {};
  for (const rel of ARCHIVOS) {
    const datos = fs.readFileSync(path.join(origen, rel));
    fs.mkdirSync(path.dirname(path.join(destino, rel)), { recursive: true });
    fs.writeFileSync(path.join(destino, rel), datos);
    archivos[rel] = sha256(datos);
  }
  const manifiesto = {
    nota: "Copia de la interfaz del editor de Code Battle Lite. No se edita aquí: se cambia allí y se vuelve a copiar con herramientas/sincronizar-editor.mjs.",
    repositorio: "https://github.com/RubenDarioMena/Code-Battles_lite",
    commit, rama, sinCommit: !!pendientes,
    archivos,
  };
  fs.writeFileSync(path.join(destino, "ORIGEN.json"), JSON.stringify(manifiesto, null, 2) + "\n");
  console.log(`Copiados ${ARCHIVOS.length} archivos de ${commit.slice(0, 7)} (${rama}) a web/cmg/.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
