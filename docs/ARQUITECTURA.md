# Arquitectura

Mobile Coder es una página web dentro de un envoltorio Android pequeño en Kotlin. La interfaz del editor se comparte con Code Battle Lite; la ejecución y los servicios de lenguaje son propios. Todo funciona sin conexión.

```
┌─────────────────────────── APK ────────────────────────────┐
│  MainActivity (Kotlin)                                      │
│   ├─ WebView ── https://appassets.androidplatform.net/assets/index.html
│   │     │        (Activos.kt sirve web/ desde el APK)       │
│   │     ├─ web/index.html + web/app/*   la app              │
│   │     ├─ web/cmg/shared/*             editor compartido   │
│   │     ├─ Worker app/motor-js.js       JavaScript          │
│   │     ├─ Worker app/motor-python.js   Python (Pyodide)    │
│   │     ├─ Worker app/lenguaje-web.js   ayuda JS/HTML/CSS   │
│   │     └─ Worker app/lenguaje-python.js ayuda Python (Jedi)│
│   └─ Puente.kt ◄── MobileCoderAndroid (mensajes JSON)       │
│         └─ Carpeta.kt: carpeta del teléfono (selector SAF)  │
└─────────────────────────────────────────────────────────────┘
```

## Carpetas del repositorio

| Carpeta | Qué hay |
| --- | --- |
| `web/` | La app web. El APK la empaqueta tal cual como activos (`app/build.gradle.kts`). También se prueba en un navegador. |
| `web/app/` | Lo propio de Mobile Coder: barra superior, hoja (consola y problemas), archivos, menú, motores, servicios de lenguaje, HTML/CSS en el editor y puente. |
| `web/cmg/` | Copia **sin editar** de la interfaz del editor de Code Battle Lite. `ORIGEN.json` guarda el commit y la huella de cada archivo. |
| `web/vendor/pyodide/` | Pyodide 314.0.7 (CPython 3.14.2 en WebAssembly): solo los archivos de ejecución, con `MANIFEST.json` y licencias. |
| `web/vendor/typescript/` | TypeScript 6.0.3: el servicio de lenguaje, las bibliotecas de tipos (ES y DOM) y los mensajes en español. |
| `web/vendor/servicios-web/` | `vscode-html-languageservice` y `vscode-css-languageservice`, empaquetados sin cambios en un solo script. |
| `web/vendor/jedi/` | Las ruedas de Jedi y parso de PyPI, tal cual. |
| `app/` | El envoltorio Android (Kotlin). |
| `herramientas/` | Copiar el editor, bajar Pyodide y los servicios de lenguaje, verificar las copias y servir `web/`. |
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
| Límites | Sin `prompt`; sin paquetes de npm; sin imports circulares | `input()` da un error claro; solo la biblioteca estándar incluida; sin paquetes de Internet |

La línea del error se marca en el código (`editor.marcas`), y tocar la nota de la consola lleva a ella. Si el error ocurrió en otro archivo del proyecto, la nota dice cuál y lo abre.

### Imports entre archivos al ejecutar

- **JavaScript** (`app/modulos.js` y `app/motor-js.js`):
  - Antes de ejecutar se arma el grafo de módulos desde el archivo abierto, con acorn.
  - Se admiten rutas `./`, `../` o `/` (raíz del proyecto); sin extensión se prueba `.js`, `.mjs` e `index.js`.
  - El motor crea un blob por archivo, de las hojas a la raíz, y cambia cada ruta de `import` por el blob de su archivo. La línea no cambia y `//# sourceURL` da el nombre del archivo en la pila.
  - Sin ejecutar, se avisa de:
    - un paquete de npm (sin conexión no hay);
    - un archivo que no está;
    - un import circular (con blobs no se puede; pendiente).
- **Python** (`app/motor-python.js`):
  - En cada ejecución se copian en `/proyecto` los archivos de texto del proyecto (`.py` y datos).
  - Se pone el directorio del archivo en `sys.path[0]` y como directorio de trabajo, y se quitan de `sys.modules` los módulos del proyecto de la ejecución anterior.
  - El traceback se muestra con rutas relativas al proyecto.

## Servicios de lenguaje (sin conexión)

`app/inteligencia.js` es el cliente: arranca los servicios cuando se abre un archivo de su lenguaje, les pasa el proyecto y pinta lo que devuelven.

| | `app/lenguaje-web.js` (Worker clásico) | `app/lenguaje-python.js` (Worker de módulo) |
| --- | --- | --- |
| Lenguajes | JS (TypeScript 6.0.3), HTML y CSS (servicios de VS Code) | Python (Jedi 0.19.2 y parso 0.8.6, sobre su propio Pyodide) |
| Carga | La primera vez que se necesita: `importScripts` y las bibliotecas de tipos por XHR síncrono | 2,5 s después de abrir un `.py` (deja pasar al Pyodide de la ejecución) |
| Proyecto | Textos en memoria; para TypeScript, `/ruta` y las bibliotecas en `/__typescript__/` | Los `.py` copiados en `/proyecto` del Pyodide de Jedi |

Protocolo (`postMessage`):
- **Entrada:**
  - `proyecto { archivos: [[ruta, texto]], rutas, carpetas }`;
  - `cambio { ruta, texto | null }`;
  - `pedir { id, accion, ruta, texto, pos, rutas? }`, con `accion` igual a `completar`, `diagnosticos` o `definicion`.
- **Salida:**
  - `respuesta { id, ok, datos | error }`;
  - `estado { servicio, estado, ms }`.

Cada petición lleva el texto actual del archivo abierto.

Qué sabe cada archivo de los demás:
- **JS:**
  - las exportaciones de lo que importa;
  - las rutas de `import`, que completa con `.js`;
  - módulos y nombres que no existen;
  - las definiciones.
  - Cada `.js` se analiza como módulo, igual que se ejecuta.
  - Solo se muestran los errores de tipos que casi siempre son un fallo real (lista `SEMANTICOS`).
- **HTML:**
  - lo que enlaza (`findDocumentLinks`): avisa si falta el archivo, completa rutas y lo abre;
  - las clases e ids de sus hojas de estilo (enlazadas y `<style>`), en `class`/`id` y al ir a la regla;
  - el JS de sus `<script>` y el CSS de sus `<style>`, que van a los otros servicios con el resto de la página en blanco (mismas posiciones).
- **CSS:** las clases e ids que usan las páginas que la enlazan.
- **Python:** los módulos del proyecto (Jedi), y avisos de `import` que no se encuentran.

La interfaz:
- **Sugerencias:** desplegable con la clase `sugerencias` del editor, junto al cursor. Mientras llega la respuesta, la lista abierta se filtra con lo que ya tiene.
- **Placa «↗»:** solo para ir a otro archivo.
- **Problemas:** pestaña de la hoja.
- **Atrás:** vuelve tras un salto.

## Proyecto en memoria

`app/proyecto.js` recorre la carpeta al abrir el proyecto y guarda el texto de los archivos de código y de datos (`js`, `mjs`, `py`, `html`, `css`, `json`, `txt`, `csv`, `md`…). Lo usan los servicios y la ejecución.

- **Límites:** 400 archivos, 200 carpetas, profundidad 8, 1 MB por archivo y 20 s.
- **Se salta:** lo oculto, `node_modules`, `__pycache__`, `venv`, `build` y `dist`.
- **Actualización:**
  - el archivo abierto, mientras se escribe;
  - los demás, al guardarlos o crearlos;
  - todo, al volver a la app si pasó más de un minuto.

## HTML y CSS en el editor

`app/editor-web.js` añade dos adaptadores al editor compartido sin tocar `web/cmg/`:
- léxico y resaltado (`<script>` como JS y `<style>` como CSS dentro de una página);
- comentarios de bloque;
- sangría;
- barra de inserción propia.

La estructura (ProtoMouse, ampliar la selección, modo sin teclado) es la de JavaScript: las fichas usan los mismos tipos. Una estructura propia de HTML queda pendiente.

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

Se abren `.py`, `.js`, `.mjs`, `.html`, `.htm` y `.css`; el resto se lista pero no se abre. Se guarda solo a los 0,7 s del último cambio, al ejecutar, al cambiar de archivo y al pasar a segundo plano. Se recuerda el último archivo de cada proyecto.

## Compilar

El APK de depuración se compila en GitHub Actions (`.github/workflows/apk.yml`) en cada push a `main`. Va firmado con `app/debug.keystore`, una clave pública solo para pruebas, para que cada APK se instale encima del anterior.

Localmente hacen falta Android Studio o el SDK de Android con JDK 17:

```bash
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```
