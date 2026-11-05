package io.github.rubendariomena.mobilecoder

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException

/**
 * Sirve los activos de la app (la carpeta web/ del repositorio) en https://appassets.androidplatform.net/assets/.
 * Tipos MIME propios: los Workers de módulo y Pyodide necesitan que .mjs llegue como JavaScript y .wasm como WebAssembly.
 * Los servicios de lenguaje leen las bibliotecas de tipos de TypeScript (.d.ts, texto) y las ruedas de Jedi (.whl, zip).
 */
class Activos(private val context: Context) : WebViewAssetLoader.PathHandler {

    override fun handle(path: String): WebResourceResponse? {
        val ruta = path.trimStart('/')
        if (ruta.isEmpty() || ruta.split('/').any { it == ".." }) return noEncontrado()
        return try {
            val tipo = tipoDe(ruta)
            WebResourceResponse(tipo, if (esTexto(tipo)) "utf-8" else null, context.assets.open(ruta)).apply {
                responseHeaders = mapOf("Cache-Control" to "no-cache")
            }
        } catch (e: IOException) {
            noEncontrado()
        }
    }

    private fun noEncontrado() =
        WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Cache-Control" to "no-cache"), "No existe".byteInputStream())

    companion object {
        private val TIPOS = mapOf(
            "html" to "text/html", "css" to "text/css", "js" to "text/javascript", "mjs" to "text/javascript",
            "json" to "application/json", "wasm" to "application/wasm", "zip" to "application/zip",
            "svg" to "image/svg+xml", "png" to "image/png", "txt" to "text/plain",
            "ts" to "text/plain", "whl" to "application/zip",
        )

        fun tipoDe(ruta: String): String {
            val nombre = ruta.substringAfterLast('/')
            return TIPOS[nombre.substringAfterLast('.', "").lowercase()]
                ?: if (nombre.startsWith("LICENSE")) "text/plain" else "application/octet-stream"
        }

        private fun esTexto(tipo: String) = tipo.startsWith("text/") || tipo == "application/json" || tipo == "image/svg+xml"
    }
}
