#!/usr/bin/env node
// Deja en web/vendor/ los servicios de lenguaje, con versiones y huellas fijadas. La app los sirve desde sus propios
// activos: autocompletar, errores e ir a la definición funcionan sin conexión.
//
//   node herramientas/lenguajes.mjs
//
// - typescript/       TypeScript 6.0.3 (Apache-2.0): el servicio de lenguaje para JavaScript, sin modificar.
//                     Es la última versión escrita en JavaScript; la 7 es nativa y no corre en una WebView.
// - servicios-web/    vscode-html-languageservice y vscode-css-languageservice (MIT), empaquetados con esbuild
//                     en un solo script para el Worker (sin cambiar su código).
// - jedi/             Jedi y parso (MIT), las ruedas de PyPI tal cual; el Worker de Python las descomprime en Pyodide.
//
// npm comprueba las huellas de los paquetes con herramientas/lenguajes/package-lock.json. Para cambiar una versión:
// package.json de esa carpeta + `npm install` allí, y las ruedas de RUEDAS.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fuente = path.join(raiz, "herramientas", "lenguajes"), modulos = path.join(fuente, "node_modules");
const vendor = path.join(raiz, "web", "vendor");
const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const version = (p) => JSON.parse(fs.readFileSync(path.join(modulos, p, "package.json"), "utf8")).version;

// Las bibliotecas de tipos que lee el servicio: el lenguaje (ES5 a ESNext), los decoradores y el DOM.
// El DOM porque es lo que usan los scripts de una página; la consola y los temporizadores también están ahí.
const LIBS = (nombres) => nombres.filter((n) => /^lib\.(es\d|es5|es6|esnext|decorators|dom)[\w.]*\.d\.ts$/.test(n) && !/\.full\.d\.ts$/.test(n));

const RUEDAS = [
  { archivo: "jedi-0.19.2-py2.py3-none-any.whl", sha256: "a8ef22bde8490f57fe5c7681a3c83cb58874daf72b4784de3cce5b6ef6edb5b9",
    url: "https://files.pythonhosted.org/packages/c0/5a/9cac0c82afec3d09ccd97c8b6502d48f165f9124db81b4bcb90b4af974ee/jedi-0.19.2-py2.py3-none-any.whl",
    licencia: "jedi-0.19.2.dist-info/LICENSE.txt" },
  { archivo: "parso-0.8.6-py2.py3-none-any.whl", sha256: "2c549f800b70a5c4952197248825584cb00f033b29c692671d3bf08bf380baff",
    url: "https://files.pythonhosted.org/packages/b6/61/fae042894f4296ec49e3f193aff5d7c18440da9e48102c3315e1bc4519a7/parso-0.8.6-py2.py3-none-any.whl",
    licencia: "parso-0.8.6.dist-info/licenses/LICENSE.txt" },
];

function escribir(dir, rel, datos, archivos) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, datos);
  archivos[rel] = sha256(datos);
}
function manifiesto(dir, datos) {
  fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(datos, null, 2) + "\n");
  const total = Object.keys(datos.archivos).reduce((s, a) => s + fs.statSync(path.join(dir, a)).size, 0);
  console.log(`${path.relative(raiz, dir)}/: ${Object.keys(datos.archivos).length} archivos, ${(total / 1048576).toFixed(1)} MB`);
}
const limpio = (dir) => { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); };

async function principal() {
  // npm ci: instala exactamente lo del package-lock.json y falla si una huella no coincide.
  execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: fuente, stdio: "inherit" });

  // ---------- TypeScript ----------
  {
    const dir = path.join(vendor, "typescript"), lib = path.join(modulos, "typescript", "lib"), archivos = {};
    limpio(dir);
    escribir(dir, "typescript.js", fs.readFileSync(path.join(lib, "typescript.js")), archivos);
    const libs = LIBS(fs.readdirSync(lib)).sort();
    for (const n of libs) escribir(dir, "lib/" + n, fs.readFileSync(path.join(lib, n)), archivos);
    // Los mensajes de error en español que trae el propio paquete.
    escribir(dir, "es/diagnosticMessages.generated.json", fs.readFileSync(path.join(lib, "es", "diagnosticMessages.generated.json")), archivos);
    for (const n of ["LICENSE.txt", "ThirdPartyNoticeText.txt"]) escribir(dir, n, fs.readFileSync(path.join(modulos, "typescript", n)), archivos);
    manifiesto(dir, {
      nota: "TypeScript sin modificar (solo el servicio, sus bibliotecas de tipos y los mensajes en español). Se regenera con herramientas/lenguajes.mjs.",
      paquete: `typescript@${version("typescript")}`, licencia: "Apache-2.0 (LICENSE.txt, ThirdPartyNoticeText.txt)", libs, archivos,
    });
  }

  // ---------- Servicios de HTML y CSS de VS Code ----------
  {
    const dir = path.join(vendor, "servicios-web"), archivos = {};
    limpio(dir);
    const salida = path.join(dir, "servicios-web.js");
    execFileSync(path.join(modulos, ".bin", "esbuild"), [path.join(fuente, "servicios-web.js"), "--bundle", "--format=iife", "--platform=browser",
      "--target=es2020", "--charset=utf8", "--legal-comments=inline", "--log-level=warning", "--outfile=" + salida], { cwd: fuente, stdio: "inherit" });
    const paquetes = ["vscode-html-languageservice", "vscode-css-languageservice", "vscode-languageserver-types", "vscode-languageserver-textdocument", "vscode-uri", "@vscode/l10n"];
    const encabezado = `/* Servicios de lenguaje de HTML y CSS de VS Code, empaquetados sin cambios con esbuild ${version("esbuild")} (herramientas/lenguajes.mjs).\n`
      + paquetes.map((p) => ` * ${p}@${version(p)} (MIT)`).join("\n") + "\n * Licencias: LICENSES.txt, junto a este archivo. */\n";
    const datos = Buffer.concat([Buffer.from(encabezado), fs.readFileSync(salida)]);
    fs.rmSync(salida);
    escribir(dir, "servicios-web.js", datos, archivos);
    // Las licencias de cada paquete; @vscode/l10n no trae el texto en el paquete y se declara MIT en su package.json.
    const textos = paquetes.map((p) => {
      const base = path.join(modulos, p), f = ["LICENSE.md", "License.txt", "LICENSE.txt", "LICENSE"].map((n) => path.join(base, n)).find((x) => fs.existsSync(x));
      const texto = f ? fs.readFileSync(f, "utf8").trim()
        : "MIT License\n\nCopyright (c) Microsoft Corporation.\n\n(El paquete declara la licencia MIT en su package.json y no incluye el texto; es la licencia MIT estándar, la misma de los demás paquetes de esta lista.)";
      return `==== ${p}@${version(p)} ====\n\n${texto}\n`;
    });
    escribir(dir, "LICENSES.txt", Buffer.from(textos.join("\n")), archivos);
    manifiesto(dir, {
      nota: "vscode-html-languageservice y vscode-css-languageservice con sus dependencias, empaquetados sin cambios. Se regenera con herramientas/lenguajes.mjs.",
      paquetes: Object.fromEntries(paquetes.map((p) => [p, version(p)])), empaquetador: `esbuild@${version("esbuild")}`, licencia: "MIT (LICENSES.txt)", archivos,
    });
  }

  // ---------- Jedi y parso (ruedas de PyPI) ----------
  {
    const dir = path.join(vendor, "jedi"), archivos = {};
    limpio(dir);
    for (const r of RUEDAS) {
      const res = await fetch(r.url);
      if (!res.ok) throw Error(`${r.url}: ${res.status}`);
      const datos = Buffer.from(await res.arrayBuffer());
      if (sha256(datos) !== r.sha256) throw Error(`${r.archivo} no coincide con su huella`);
      escribir(dir, r.archivo, datos, archivos);
      const tmp = fs.mkdtempSync(path.join(fuente, ".rueda-"));
      try {
        fs.writeFileSync(path.join(tmp, "r.zip"), datos);
        execFileSync("unzip", ["-q", "r.zip", r.licencia], { cwd: tmp });
        escribir(dir, "LICENSE-" + r.archivo.split("-")[0], fs.readFileSync(path.join(tmp, r.licencia)), archivos);
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
    manifiesto(dir, {
      nota: "Ruedas de Jedi y parso de PyPI sin modificar. El Worker de Python las descomprime en Pyodide. Se regenera con herramientas/lenguajes.mjs.",
      ruedas: RUEDAS.map(({ archivo, url }) => ({ archivo, url })),
      licencia: "Jedi: MIT (incluye typeshed, Apache-2.0, dentro de la rueda). parso: MIT y PSF para sus gramáticas (dentro de la rueda).", archivos,
    });
  }
}

principal().catch((e) => { console.error(e.message || e); process.exit(1); });
