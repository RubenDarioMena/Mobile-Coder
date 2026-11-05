#!/usr/bin/env node
// Comprobaciones rápidas, sin navegador ni Android:
// - la copia del editor (web/cmg/), Pyodide y los servicios de lenguaje (web/vendor/) siguen idénticos a sus manifiestos;
// - los scripts propios de la app se pueden analizar (node --check).
//
//   node herramientas/verificar.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const fallos = [];
let revisados = 0;

const COPIAS = [["web/cmg", "ORIGEN.json"], ["web/vendor/pyodide", "MANIFEST.json"], ["web/vendor/typescript", "MANIFEST.json"],
  ["web/vendor/servicios-web", "MANIFEST.json"], ["web/vendor/jedi", "MANIFEST.json"]];
for (const [carpeta, nombre] of COPIAS) {
  const dir = path.join(raiz, carpeta), manifiesto = JSON.parse(fs.readFileSync(path.join(dir, nombre), "utf8"));
  for (const [rel, huella] of Object.entries(manifiesto.archivos)) {
    const f = path.join(dir, rel);
    revisados++;
    if (!fs.existsSync(f)) fallos.push(`${carpeta}/${rel}: falta`);
    else if (sha256(f) !== huella) fallos.push(`${carpeta}/${rel}: cambió (no se edita aquí; ver ${nombre})`);
  }
}

const scripts = fs.readdirSync(path.join(raiz, "web", "app")).filter((f) => f.endsWith(".js")).map((f) => path.join(raiz, "web", "app", f));
for (const f of scripts) {
  revisados++;
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { fallos.push(`${path.relative(raiz, f)}: ${String(e.stderr).trim().split("\n").slice(0, 4).join(" ")}`); }
}

if (fallos.length) { console.error(fallos.join("\n")); process.exit(1); }
console.log(`Correcto: ${revisados} comprobaciones (copias con su huella y sintaxis de web/app).`);
