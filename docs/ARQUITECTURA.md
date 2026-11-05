# Arquitectura · primera implementación

Mobile Coder es una página web dentro de un envoltorio Android pequeño en Kotlin. La interfaz del editor se comparte con Code Battle Lite; la ejecución es propia. Todo funciona sin conexión.

```
┌─────────────────────────── APK ────────────────────────────┐
│  MainActivity (Kotlin)                                      │
│   ├─ WebView ── https://appassets.androidplatform.net/assets/index.html
│   │     │        (Activos.kt sirve web/ desde el APK)       │
│   │     ├─ web/index.html + web/app/*   la app              │
│   │     ├─ web/cmg/shared/*             editor compartido   │
│   │     ├─ Worker app/motor-js.js       JavaScript          │
│   │     └─ Worker app/motor-python.js   Python (Pyodide)    │
│   └─ Puente.kt ◄── MobileCoderAndroid (mensajes JSON)       │
│         └─ Carpeta.kt: carpeta del teléfono (selector SAF)  │
└─────────────────────────────────────────────────────────────┘
```

## Carpetas del repositorio

| Carpeta | Qué hay |
| --- | --- |
| `web/` | La app web. El APK la empaqueta tal cual como activos (`app/build.gradle.kts`). También se prueba en un navegador. |
| `web/app/` | Lo propio de Mobile Coder: barra superior, hoja de consola, archivos, menú, motores y puente. |
| `web/cmg/` | Copia **sin editar** de la interfaz del editor de Code Battle Lite. `ORIGEN.json` guarda el commit y la huella de cada archivo. |
| `web/vendor/pyodide/` | Pyodide 314.0.7 (CPython 3.14.2 en WebAssembly): solo los archivos de ejecución, con `MANIFEST.json` y licencias. |
| `app/` | El envoltorio Android (Kotlin). |
| `herramientas/` | Copiar el editor, bajar Pyodide, verificar las copias y servir `web/`. |
| `pruebas/` | Pruebas en Chromium emulando un teléfono. |

## Interfaz compartida con Code Battle Lite

La interfaz del editor es el componente `CMGEditor` de Code Battle Lite (`shared/editor/`) en una instancia autónoma, en forma de teléfono (`forma: "movil"`):
- El ProtoMouse, la barra de edición, la barra de inserción, el modo sin teclado, las variantes metálicas, las sugerencias y los lenguajes (JS y Python con acorn y lezer) vienen de allí.
- La raíz del editor lleva la clase `app`. Así se aplican las reglas del teléfono de `shared/css/edicion.css`, escritas para la `.app` del juego. Ese es hoy el contrato; una clase propia del componente queda pendiente en Code Battle Lite.
- Lo que en el juego pone su propia interfaz lo pone `web/app/`:
  - la barra superior;
  - la hoja inferior, con la lógica de la ficha ⓘ portada de `layout.js`;
  - el orden de la barra de inserción, portado de `layout.css` con `.paleta` en vez de `#paleta`;
  - el ajuste al teclado.

  Cada regla portada indica su origen.

**Actualizar la interfaz:** se cambia en Code Battle Lite, se hace commit allí y se copia aquí:

```bash
node herramientas/sincronizar-editor.mjs ../Code-Battles_lite
node herramientas/verificar.mjs && node pruebas/ui.mjs
```

`verificar.mjs` falla si alguien edita `web/cmg/` a mano.

## Motores (sin conexión)

Cada lenguaje corre en su Worker, fuera del hilo de la interfaz. Un bucle infinito no congela el editor, y ■ lo corta.

| | JavaScript (`app/motor-js.js`) | Python (`app/motor-python.js`) |
| --- | --- | --- |
| Motor | V8 de la WebView, en un Worker de módulo nuevo en cada ejecución | Pyodide 314.0.7 (CPython 3.14.2) en un Worker de módulo que se carga una vez |
| Programa | El archivo se importa como módulo de ES (modo estricto, `await` de primer nivel) | `runPythonAsync` con un espacio de nombres nuevo (`__name__ == "__main__"`), sin reindentar |
| Salida | `console.*` con formato de valores; `console.error` en rojo | stdout y stderr byte a byte (las líneas a medias se unen) |
| Fin | Cuando el módulo terminó y no quedan temporizadores | Al volver `runPythonAsync` |
| Errores | Línea por la pila; los de sintaxis, con acorn | Traceback limpio (sin marcos de Pyodide) y línea del último marco del archivo |
| ■ Detener | Termina el Worker | Termina el Worker y carga otro (unos segundos) |
| Límites | Sin `prompt`; los `import` de otros archivos del proyecto no funcionan todavía | `input()` da un error claro; solo la biblioteca estándar incluida; sin paquetes de Internet |

La línea del error se marca en el código (`editor.marcas`), y tocar la nota de la consola lleva a ella.

## Puente con Android

`web/app/puente.js` ↔ `Puente.kt`. `WebViewCompat.addWebMessageListener` inyecta el objeto `MobileCoderAndroid`, y solo lo hace en el origen `https://appassets.androidplatform.net` y en el marco principal. El código del usuario corre en Workers y no lo ve.

Petición: `{ id, accion, ...datos }`. Respuesta: `{ id, ok: true, datos }` o `{ id, ok: false, error, codigo }`.

| Acción | Datos | Respuesta |
| --- | --- | --- |
| `estado` | — | `{ carpeta: { nombre } \| null }` |
| `elegirCarpeta` | — | `{ nombre }`, o el error `cancelado` |
| `listar` | `ruta` | `[{ nombre, tipo: "archivo" \| "carpeta", tamano? }]` |
| `leer` | `ruta` | `{ texto }` (hasta 2 MB) |
| `escribir` | `ruta, texto` | `{}` (crea el archivo si no existe) |
| `crearArchivo` | `ruta, texto` | `{}`, o el error `existe` |
| `crearCarpeta` | `ruta` | `{}`, o el error `existe` |

Las rutas son relativas a la carpeta elegida, con `/` y sin `..`. La carpeta se guarda con permiso persistente, y si el permiso se pierde la app vuelve a los borradores. Elegir otra carpeta libera el permiso de la anterior.

Atrás: la actividad pregunta a `MC.atras()`. La página cierra lo que tenga abierto (diálogo, menú, archivos, hoja, sin teclado), y solo si no queda nada sale de la app. Al pasar a segundo plano se llama a `MC.guardar()`.

## Archivos

- **Android con carpeta:** la carpeta del teléfono que eligió el usuario.
- **Android sin carpeta:** «Borradores de la app», guardados en el almacenamiento de la WebView.
- **Navegador:** un proyecto de prueba en `localStorage`, que no es una carpeta del teléfono.

Se abren `.py` y `.js`; el resto se lista pero no se abre. Se guarda solo a los 0,7 s del último cambio, al ejecutar, al cambiar de archivo y al pasar a segundo plano. Se recuerda el último archivo de cada proyecto.

## Compilar

El APK de depuración se compila en GitHub Actions (`.github/workflows/apk.yml`) en cada push a `main`. Va firmado con `app/debug.keystore`, una clave pública solo para pruebas, para que cada APK se instale encima del anterior.

Localmente hacen falta Android Studio o el SDK de Android con JDK 17:

```bash
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```
