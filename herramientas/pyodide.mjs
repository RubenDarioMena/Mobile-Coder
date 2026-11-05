#!/usr/bin/env node
// Deja en web/vendor/pyodide/ los archivos de ejecución de Pyodide (CPython compilado a WebAssembly), con la
// versión y las huellas fijadas. La app los sirve desde sus propios activos: Python funciona sin conexión.
//
//   node herramientas/pyodide.mjs            descarga el paquete de npm y lo verifica
//   node herramientas/pyodide.mjs <archivo>  usa un .tgz ya descargado (se verifica igual)
//
// Para cambiar de versión: VERSION, INTEGRIDAD (dist.integrity de `npm view pyodide@<versión>`) y las licencias.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "314.0.7";
const INTEGRIDAD = "sha512-0YvXxEhfEdpLfb/XkM2BFAeMROq0iMUX2bzzH9pOttyMcWkwq+HbE5uyuGD82LN7y2q+SNvi/6V5JEsOlD2R1A==";
const PAQUETE = `https://registry.npmjs.org/pyodide/-/pyodide-${VERSION}.tgz`;
// Solo lo que hace falta para ejecutar: el cargador de módulo (Pyodide 314 ya no corre en Workers clásicos),
// el núcleo y la biblioteca estándar.
const ARCHIVOS = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
// El paquete de npm no trae los textos de las licencias: se toman de las etiquetas de cada proyecto.
const LICENCIAS = {
  "LICENSE-pyodide": { url: `https://raw.githubusercontent.com/pyodide/pyodide/${VERSION}/LICENSE`, sha256: "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5" },
  "LICENSE-cpython": { url: "https://raw.githubusercontent.com/python/cpython/v3.14.2/LICENSE", sha256: "b0e25a78cffb43f4d92de8b61ccfa1f1f98ecbc22330b54b5251e7b6ba010231" },
};

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "web", "vendor", "pyodide");
const sha256 = (d) => createHash("sha256").update(d).digest("hex");

async function bajar(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function principal() {
  const tgz = process.argv[2] ? fs.readFileSync(process.argv[2]) : await bajar(PAQUETE);
  const integridad = "sha512-" + createHash("sha512").update(tgz).digest("base64");
  if (integridad !== INTEGRIDAD) throw Error(`El paquete no coincide con pyodide@${VERSION}:\n  ${integridad}\n  esperado ${INTEGRIDAD}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pyodide-"));
  try {
    fs.writeFileSync(path.join(tmp, "p.tgz"), tgz);
    execFileSync("tar", ["xzf", "p.tgz", ...ARCHIVOS.map((a) => "package/" + a)], { cwd: tmp });
    fs.rmSync(destino, { recursive: true, force: true });
    fs.mkdirSync(destino, { recursive: true });
    const archivos = {};
    for (const a of ARCHIVOS) {
      const datos = fs.readFileSync(path.join(tmp, "package", a));
      fs.writeFileSync(path.join(destino, a), datos);
      archivos[a] = sha256(datos);
    }
    for (const [nombre, { url, sha256: esperado }] of Object.entries(LICENCIAS)) {
      const datos = await bajar(url);
      if (sha256(datos) !== esperado) throw Error(`${nombre} cambió en ${url}`);
      fs.writeFileSync(path.join(destino, nombre), datos);
      archivos[nombre] = esperado;
    }
    const manifiesto = {
      nota: "Archivos de ejecución de Pyodide sin modificar. Se regeneran con herramientas/pyodide.mjs.",
      paquete: `pyodide@${VERSION}`, origen: PAQUETE, integridad: INTEGRIDAD, python: "3.14.2",
      licencias: "Pyodide: MPL-2.0 (LICENSE-pyodide). CPython y su biblioteca estándar: PSF-2.0 (LICENSE-cpython).",
      archivos,
    };
    fs.writeFileSync(path.join(destino, "MANIFEST.json"), JSON.stringify(manifiesto, null, 2) + "\n");
    const total = Object.keys(archivos).reduce((s, a) => s + fs.statSync(path.join(destino, a)).size, 0);
    console.log(`pyodide@${VERSION} en web/vendor/pyodide/ (${(total / 1048576).toFixed(1)} MB).`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

principal().catch((e) => { console.error(e.message || e); process.exit(1); });
