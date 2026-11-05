package io.github.rubendariomena.mobilecoder

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

/** Un error que la página puede explicar: el código va en la respuesta del puente. */
class ErrorCarpeta(val codigo: String, mensaje: String) : Exception(mensaje)

/**
 * La carpeta del proyecto que el usuario eligió con el selector de Android (Storage Access Framework).
 * Las rutas son relativas a ella, separadas por «/», sin partes vacías, «.» ni «..».
 */
class Carpeta(private val context: Context, uri: Uri) {
    private val raiz: DocumentFile = DocumentFile.fromTreeUri(context, uri)
        ?: throw ErrorCarpeta("sin-carpeta", "No se puede abrir la carpeta")

    val nombre: String get() = raiz.name ?: "Carpeta"

    fun listar(ruta: String): JSONArray {
        val dir = buscar(ruta) ?: throw ErrorCarpeta("no-existe", "La carpeta no existe")
        if (!dir.isDirectory) throw ErrorCarpeta("no-es-carpeta", "No es una carpeta")
        val lista = JSONArray()
        for (hijo in dir.listFiles()) {
            val n = hijo.name ?: continue
            val entrada = JSONObject().put("nombre", n).put("tipo", if (hijo.isDirectory) "carpeta" else "archivo")
            if (!hijo.isDirectory) entrada.put("tamano", hijo.length())
            lista.put(entrada)
        }
        return lista
    }

    fun leer(ruta: String): String {
        val f = buscar(ruta)?.takeIf { it.isFile } ?: throw ErrorCarpeta("no-existe", "El archivo no existe")
        if (f.length() > MAXIMO) throw ErrorCarpeta("grande", "El archivo es demasiado grande para el editor")
        val entrada = context.contentResolver.openInputStream(f.uri) ?: throw ErrorCarpeta("lectura", "No se pudo leer el archivo")
        return entrada.use { it.readBytes().toString(Charsets.UTF_8) }
    }

    fun escribir(ruta: String, texto: String) {
        val f = buscar(ruta)
        if (f != null && f.isDirectory) throw ErrorCarpeta("es-carpeta", "Hay una carpeta con ese nombre")
        volcar(f ?: crear(ruta), texto)
    }

    fun crearArchivo(ruta: String, texto: String) {
        if (buscar(ruta) != null) throw ErrorCarpeta("existe", "Ya existe")
        volcar(crear(ruta), texto)
    }

    fun crearCarpeta(ruta: String) {
        if (buscar(ruta) != null) throw ErrorCarpeta("existe", "Ya existe")
        carpetaPadre(ruta).createDirectory(nombreDe(ruta)) ?: throw ErrorCarpeta("crear", "No se pudo crear la carpeta")
    }

    private fun volcar(f: DocumentFile, texto: String) {
        // "wt" vacía el archivo antes de escribir; algunos proveedores solo aceptan "w".
        val salida = try {
            context.contentResolver.openOutputStream(f.uri, "wt")
        } catch (e: Exception) {
            context.contentResolver.openOutputStream(f.uri, "w")
        } ?: throw ErrorCarpeta("escritura", "No se pudo escribir el archivo")
        salida.use { it.write(texto.toByteArray(Charsets.UTF_8)) }
    }

    private fun crear(ruta: String): DocumentFile {
        val nombre = nombreDe(ruta)
        // Con application/octet-stream el proveedor no añade su propia extensión al nombre.
        val f = carpetaPadre(ruta).createFile("application/octet-stream", nombre)
            ?: throw ErrorCarpeta("crear", "No se pudo crear el archivo")
        if (f.name != nombre) f.renameTo(nombre)
        return f
    }

    private fun carpetaPadre(ruta: String): DocumentFile {
        val padre = buscar(padreDe(ruta)) ?: throw ErrorCarpeta("no-existe", "La carpeta no existe")
        if (!padre.isDirectory) throw ErrorCarpeta("no-es-carpeta", "No es una carpeta")
        return padre
    }

    private fun buscar(ruta: String): DocumentFile? {
        var actual = raiz
        for (parte in partes(ruta)) actual = actual.findFile(parte) ?: return null
        return actual
    }

    companion object {
        /** Lo que el editor abre como mucho (2 MB). */
        const val MAXIMO = 2L * 1024 * 1024

        fun partes(ruta: String): List<String> {
            if (ruta.isEmpty()) return emptyList()
            val p = ruta.split('/')
            if (p.any { it.isEmpty() || it == "." || it == ".." || it.contains('\\') }) throw ErrorCarpeta("ruta", "Ruta no válida")
            return p
        }

        fun padreDe(ruta: String) = ruta.substringBeforeLast('/', "")
        fun nombreDe(ruta: String) = ruta.substringAfterLast('/')
    }
}
