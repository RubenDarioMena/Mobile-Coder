package io.github.rubendariomena.mobilecoder

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * El puente con la página (web/app/puente.js). La página envía { id, accion, ...datos } en JSON y recibe
 * { id, ok: true, datos } o { id, ok: false, error, codigo }. Solo lo ve el marco principal del origen de la app:
 * el código del usuario corre en Workers y no llega a él.
 */
class Puente(private val actividad: MainActivity) : WebViewCompat.WebMessageListener {
    private val trabajo = Executors.newSingleThreadExecutor()
    private val principal = Handler(Looper.getMainLooper())

    override fun onPostMessage(
        view: WebView,
        message: WebMessageCompat,
        sourceOrigin: Uri,
        isMainFrame: Boolean,
        replyProxy: JavaScriptReplyProxy,
    ) {
        if (!isMainFrame || sourceOrigin.scheme != "https" || sourceOrigin.host != MainActivity.HOST) return
        val peticion = try {
            JSONObject(message.data ?: return)
        } catch (e: Exception) {
            return
        }
        val id = peticion.optInt("id")
        val responder = { respuesta: JSONObject ->
            principal.post { replyProxy.postMessage(respuesta.put("id", id).toString()) }
            Unit
        }
        // El selector de carpetas es de la actividad (hilo principal); lo demás toca archivos: en segundo plano y en orden.
        if (peticion.optString("accion") == "elegirCarpeta") actividad.elegirCarpeta(responder)
        else trabajo.execute { responder(atender(peticion)) }
    }

    private fun atender(p: JSONObject): JSONObject = try {
        val datos: Any = when (p.optString("accion")) {
            "estado" -> JSONObject().put("carpeta", actividad.carpeta()?.let { JSONObject().put("nombre", it.nombre) } ?: JSONObject.NULL)
            "listar" -> carpeta().listar(p.optString("ruta"))
            "leer" -> JSONObject().put("texto", carpeta().leer(ruta(p)))
            "escribir" -> { carpeta().escribir(ruta(p), p.optString("texto")); JSONObject() }
            "crearArchivo" -> { carpeta().crearArchivo(ruta(p), p.optString("texto")); JSONObject() }
            "crearCarpeta" -> { carpeta().crearCarpeta(ruta(p)); JSONObject() }
            else -> throw ErrorCarpeta("accion", "Acción desconocida")
        }
        JSONObject().put("ok", true).put("datos", datos)
    } catch (e: ErrorCarpeta) {
        respuestaError(e.codigo, e.message)
    } catch (e: Exception) {
        respuestaError("error", e.message ?: e.javaClass.simpleName)
    }

    private fun carpeta() = actividad.carpeta() ?: throw ErrorCarpeta("sin-carpeta", "No hay carpeta elegida o se perdió el permiso")

    private fun ruta(p: JSONObject) = p.optString("ruta").also { if (it.isEmpty()) throw ErrorCarpeta("ruta", "Falta la ruta") }

    companion object {
        fun respuestaError(codigo: String, mensaje: String?): JSONObject =
            JSONObject().put("ok", false).put("codigo", codigo).put("error", mensaje ?: codigo)
    }
}
