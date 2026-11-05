#!/usr/bin/env node
// Sirve web/ para probar la app en un navegador (la misma carpeta que el APK empaqueta como activos).
//
//   node herramientas/servir.mjs [puerto]     por defecto 8781, en 0.0.0.0 (también desde el teléfono en la misma Wi-Fi)
//
// Tipos MIME explícitos: .mjs y .wasm deben llegar como JavaScript y WebAssembly.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
export const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".wasm": "application/wasm", ".zip": "application/zip", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

export function servir(puerto = 8781, host = "0.0.0.0") {
  const servidor = http.createServer((req, res) => {
    let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (ruta.endsWith("/")) ruta += "index.html";
    const archivo = path.join(raiz, path.normalize(ruta));
    if (!archivo.startsWith(raiz + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(archivo, (err, datos) => {
      if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("No existe"); return; }
      const tipo = TIPOS[path.extname(archivo).toLowerCase()] || (path.basename(archivo).startsWith("LICENSE") ? TIPOS[".txt"] : "application/octet-stream");
      res.writeHead(200, { "content-type": tipo, "cache-control": "no-store" }).end(datos);
    });
  });
  return new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(puerto, host, () => resolver(servidor));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.argv[2]) || 8781;
  servir(puerto).then(() => console.log(`Mobile Coder en http://localhost:${puerto}/ (Ctrl+C para salir)`));
}
