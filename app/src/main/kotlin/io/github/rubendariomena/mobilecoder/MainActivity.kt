package io.github.rubendariomena.mobilecoder

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Mobile Coder: una WebView a pantalla completa con la app web empaquetada (web/ del repositorio).
 * Sin conexión: los activos se sirven desde el APK. Lo nativo es lo que la web no puede hacer en Android:
 * elegir una carpeta del teléfono y leer y escribir en ella (Carpeta.kt), a través de Puente.kt.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val preferencias by lazy { getSharedPreferences("mobilecoder", MODE_PRIVATE) }
    private var esperandoCarpeta: ((JSONObject) -> Unit)? = null
    private val selector = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri -> alElegirCarpeta(uri) }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        val marco = FrameLayout(this).apply { setBackgroundColor(FONDO) }
        web = WebView(this).apply { setBackgroundColor(FONDO) }
        marco.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(marco)

        // Barras del sistema y teclado: la WebView se encoge, así las barras del editor quedan justo encima del teclado.
        ViewCompat.setOnApplyWindowInsetsListener(marco) { vista, insets ->
            val barras = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val teclado = insets.getInsets(WindowInsetsCompat.Type.ime())
            vista.setPadding(barras.left, barras.top, barras.right, maxOf(barras.bottom, teclado.bottom))
            WindowInsetsCompat.CONSUMED
        }

        configurar(web)
        web.loadUrl(INICIO)

        // Atrás: primero cierra lo que la página tenga abierto (menú, archivos, consola…); si no queda nada, sale.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.MC && MC.atras) ? MC.atras() : false") { resultado ->
                    if (resultado != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })
    }

    private fun configurar(w: WebView) {
        val activos = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/assets/", Activos(this))
            .build()
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // preferencias, borradores y último archivo
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
            setSupportMultipleWindows(false)
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100                    // el tamaño de letra lo lleva el editor (A− / A+)
        }
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? =
                request?.let { activos.shouldInterceptRequest(it.url) }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return true
                if (url.host == HOST) return false
                // Un enlace externo se abre fuera de la app; la app no navega a Internet.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (e: Exception) {
                    // sin navegador: se ignora
                }
                return true
            }
        }
        w.webChromeClient = WebChromeClient()
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(w, "MobileCoderAndroid", setOf(ORIGEN), Puente(this))
        }
    }

    // ---------- Carpeta del proyecto ----------

    /** La carpeta elegida, si sigue con permiso de lectura y escritura. Se llama desde el hilo del puente. */
    fun carpeta(): Carpeta? {
        val guardada = preferencias.getString(CLAVE_CARPETA, null) ?: return null
        val uri = Uri.parse(guardada)
        val conPermiso = contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission && it.isWritePermission }
        if (!conPermiso) return null
        return try {
            Carpeta(this, uri)
        } catch (e: Exception) {
            null
        }
    }

    /** Abre el selector de carpetas del sistema; responde cuando el usuario elige o cancela. Hilo principal. */
    fun elegirCarpeta(responder: (JSONObject) -> Unit) {
        if (esperandoCarpeta != null) {
            responder(Puente.respuestaError("ocupado", "El selector de carpetas ya está abierto"))
            return
        }
        esperandoCarpeta = responder
        try {
            selector.launch(null)
        } catch (e: Exception) {
            esperandoCarpeta = null
            responder(Puente.respuestaError("selector", "Este teléfono no tiene selector de carpetas"))
        }
    }

    private fun alElegirCarpeta(uri: Uri?) {
        val responder = esperandoCarpeta ?: return
        esperandoCarpeta = null
        if (uri == null) {
            responder(Puente.respuestaError("cancelado", "No se eligió ninguna carpeta"))
            return
        }
        val permisos = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            contentResolver.takePersistableUriPermission(uri, permisos)
            val anterior = preferencias.getString(CLAVE_CARPETA, null)
            if (anterior != null && anterior != uri.toString()) {
                try {
                    contentResolver.releasePersistableUriPermission(Uri.parse(anterior), permisos)
                } catch (e: Exception) {
                    // ya no estaba concedido
                }
            }
            preferencias.edit().putString(CLAVE_CARPETA, uri.toString()).apply()
            val c = Carpeta(this, uri)
            responder(JSONObject().put("ok", true).put("datos", JSONObject().put("nombre", c.nombre)))
        } catch (e: Exception) {
            responder(Puente.respuestaError("permiso", e.message ?: "Sin permiso para esa carpeta"))
        }
    }

    // ---------- Ciclo de vida ----------

    override fun onPause() {
        // Guarda el archivo abierto antes de que el sistema pueda cerrar la app.
        web.evaluateJavascript("window.MC && MC.guardar && MC.guardar()", null)
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val ORIGEN = "https://$HOST"
        const val INICIO = "$ORIGEN/assets/index.html"
        private const val CLAVE_CARPETA = "carpeta"
        private val FONDO = Color.rgb(0x0B, 0x0F, 0x13)
    }
}
