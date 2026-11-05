# Mobile Coder

Un IDE para el teléfono, pensado para escribir código con el pulgar y aprovechar el teclado nativo sin pelearse con él. Reutiliza la ergonomía táctil del editor del juego **Code Battle Lite** ([RubenDarioMena/Code-Battles_lite](https://github.com/RubenDarioMena/Code-Battles_lite)).

**Estado:** primera implementación (0.1.0).
- Es una app Android hecha con un envoltorio en Kotlin y la interfaz web dentro de una WebView.
- Edita y ejecuta **JavaScript y Python 3.14**, **sin conexión**.
- Guarda los archivos en la carpeta del teléfono que elijas.
- Solo funciona en vertical.
- Se ha probado en Chromium emulando un teléfono; **falta probarla en un teléfono real**.

## Probar

**En el teléfono (APK):**
1. Abre [Actions → APK de prueba](https://github.com/RubenDarioMena/Mobile-Coder/actions/workflows/apk.yml).
2. Entra en la última ejecución en verde y descarga el artefacto `mobile-coder-debug`. Es un .zip con `app-debug.apk` dentro.
3. Descomprímelo e instala el APK. Android pedirá permiso para instalar apps de esa fuente.

Cada APK de prueba se instala encima del anterior sin perder la carpeta elegida.

**En un navegador**, la misma app web, sin la carpeta del teléfono (usa un proyecto de prueba guardado en el navegador):

```bash
node herramientas/servir.mjs          # http://localhost:8781/  (también desde el teléfono en la misma Wi-Fi: http://IP-DEL-EQUIPO:8781/)
```

Desde GitHub, sin instalar nada: `https://raw.githack.com/RubenDarioMena/Mobile-Coder/main/web/index.html`. Este enlace no está comprobado: puede que raw.githack no sirva bien los archivos grandes de Python. En ese caso, la referencia es el APK.

## Qué hace

- **Editor:** la interfaz del teléfono de Code Battle Lite.
  - Barra de edición con el **ProtoMouse**: deshacer · rehacer · selección | ProtoMouse | cortar · copiar · pegar.
  - **Barra metálica de inserción** en dos conjuntos: edición y sintaxis por un lado, bloques por el otro. En modo sin teclado se cambian de sitio.
  - Variantes al mantener pulsado y sugerencias.
- **Barra superior:**
  - Archivos.
  - Archivo abierto, con su lenguaje y si está guardado.
  - ▶/■.
  - Modo sin teclado.
  - Menú ⋯: letra, ajustes del editor y Acerca de.
- **Consola:** una hoja que sube desde una pestaña en la esquina inferior derecha del código.
  - El asa cambia su alto, y el alto se recuerda.
  - Se cierra arrastrando hasta abajo.
  - Los errores marcan su línea en el código, y tocarlos lleva a ella.
- **Motores:**
  - **JavaScript:** el motor de la WebView, en un Worker propio.
  - **Python:** Pyodide 314.0.7 (CPython 3.14.2 compilado a WebAssembly) en otro Worker, servido desde la propia app.
  - ■ corta un bucle infinito.
- **Archivos:**
  - Se elige una carpeta del teléfono con el selector de Android. Se abren `.py` y `.js`, con carpetas y archivos nuevos.
  - Se guarda solo.
  - Sin carpeta elegida, la app usa unos borradores propios.

Lo que falta está en [PROGRESO.md](PROGRESO.md); por ejemplo, `input()` en Python, borrar o renombrar archivos, y HTML/CSS con vista previa.

## Documentos

| Documento | Para qué |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instrucciones de trabajo (personas y agentes) y verificación. |
| [PROGRESO.md](PROGRESO.md) | Registro de lo hecho, lo acordado y lo pendiente. |
| [docs/UI-MOVIL.md](docs/UI-MOVIL.md) | La interfaz acordada: reparto de la pantalla, barras, ProtoMouse y hoja inferior. |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Piezas, motores, puente con Android, archivos y cómo se actualiza la interfaz compartida. |

## De dónde viene la interfaz

`web/cmg/` es una copia sin editar del editor compartido de Code Battle Lite. Viene del commit [`56435c7`](https://github.com/RubenDarioMena/Code-Battles_lite/commit/56435c70e7b7e628aff211d0e11fdfea59ce671b), y cada archivo lleva su huella en `web/cmg/ORIGEN.json`.

Los cambios de la interfaz se hacen allí y se copian aquí con `node herramientas/sincronizar-editor.mjs <carpeta de Code-Battles_lite>`.

Lo que en el juego pone su propia interfaz lo pone esta app, en `web/app/`: la barra superior, la hoja, el orden de la barra de inserción y el ajuste al teclado. Se portó con referencia a su origen, y sacarlo a un componente común sigue pendiente.
