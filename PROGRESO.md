# Progreso

## Primera implementación · envoltorio Kotlin, editor del teléfono, JS y Python sin conexión · 5 de noviembre de 2026

- **Plataforma decidida por el usuario:** app Android con envoltorio propio en Kotlin y la interfaz web en una WebView (no Capacitor, ni Flutter, ni React Native).
- **Qué hay:**
  - **Editor:** la interfaz del teléfono de Code Battle Lite: ProtoMouse, barra de inserción en dos conjuntos, sin teclado arriba y variantes metálicas.
  - **Barra superior:**
    - archivos;
    - archivo abierto, con la marca de lenguaje y el estado de guardado;
    - ▶/■;
    - sin teclado;
    - menú ⋯: archivos, letra − y +, ajustes del editor y «Acerca de».
  - **Hoja de consola:** pestaña con flecha en la esquina inferior derecha del código. El asa cambia el alto y el alto se recuerda; se cierra arrastrando hasta abajo; la pestaña avisa de la salida nueva.
  - **Motores** en Workers:
    - **JavaScript:** módulo de ES, consola con formato, temporizadores, línea del error y ■.
    - **Python 3.14.2:** Pyodide 314.0.7, con traceback limpio, línea del error y ■, que recarga Python.
  - **Archivos:** carpeta del teléfono con el selector de Android y permiso persistente; abrir `.py` y `.js`; crear archivos y carpetas; guardado automático; último archivo recordado.
  - **Sin carpeta elegida:** unos borradores propios de la app.
  - **Atrás:** cierra lo que esté abierto antes de salir.
- **Decisiones provisionales** (para revisar con el usuario):
  - **Interfaz compartida** como copia sincronizada: `web/cmg/` es una copia sin editar de `shared/` de Code Battle Lite en `56435c7`, con huellas en `ORIGEN.json`, y `herramientas/sincronizar-editor.mjs` la actualiza.
    - Lo que en el juego pone su propia interfaz está portado a `web/app/`, con su origen anotado: lógica de la hoja desde `js/layout.js`, orden de la barra de inserción desde `css/layout.css`.
    - La raíz del editor lleva la clase `app` para recibir las reglas del teléfono de `edicion.css`.
    - **Pendiente:** sacar todo eso a un componente común en Code Battle Lite.
  - **Python:** Pyodide 314.0.7 (CPython 3.14.2) desde npm, con integridad sha512 verificada. Los archivos de ejecución pesan 12,9 MB y están en el repositorio (`web/vendor/pyodide/`, con licencias MPL-2.0 y PSF).
    - Pyodide 314 exige Workers de módulo.
    - **JavaScript:** el motor de la WebView en un Worker de módulo nuevo por ejecución.
  - **APK de prueba** firmado con una clave de depuración fija y pública (`app/debug.keystore`), para instalar encima sin perder datos.
    - Android 8 o superior (minSdk 26), targetSdk 35.
    - Lleva el permiso de Internet solo por cómo la WebView carga los activos (ver el manifiesto); la app no usa la red.
- **Verificación actual:**
  - `node herramientas/verificar.mjs`: 37 comprobaciones.
  - `node pruebas/ui.mjs`: 26 de 26, dos pasadas seguidas, en Chromium emulando un Pixel 7 (412 × 915) con toda la red externa bloqueada. Cubre:
    - distribución y orden de las barras, modo sin teclado y hoja (alto, asa, recordar, cerrar arrastrando);
    - Python: salida, errores con línea y traceback limpio, sintaxis, stderr, biblioteca estándar, `input()` y ■ con recarga; Python cargó en unos 2–3 s;
    - JavaScript: salida, errores de ejecución y de sintaxis, temporizadores y ■;
    - archivos del navegador, menú y atrás;
    - el puente Android con un envoltorio simulado (mismo protocolo);
    - que no salga ninguna petición fuera de la app.
  - **APK:** compila en GitHub Actions.
    - La ejecución 1 falló por un comentario XML con «--»; la ejecución 2 terminó en verde, con un artefacto de 9,3 MB.
    - El workflow imprime después el paquete, el SDK, los permisos y los activos clave del APK.
    - No se pudo bajar el APK a este entorno para revisarlo ni instalarlo.
- **Límites:**
  - **No se ha probado en un teléfono real**, en particular:
    - la WebView de Android: teclado, ProtoMouse, márgenes y carga de Pyodide;
    - el selector de carpetas y su permiso;
    - el arranque de Python en un teléfono modesto;
    - si el permiso de Internet se puede quitar.
  - En este entorno `dl.google.com`, `downloads.gradle.org` y `raw.githack.com` están bloqueados. El APK solo se compila en CI, el wrapper de Gradle no fija la huella de la distribución y el enlace de raw.githack no se comprobó.
- **Pendiente:**
  - `input()` en Python. Haría falta que el Worker espere: con memoria compartida (cabeceras COOP/COEP, si la WebView lo permite) o con una petición síncrona que responda el envoltorio.
  - Interrumpir Python sin recargarlo (también requiere memoria compartida).
  - Borrar y renombrar archivos.
  - `import` entre archivos del proyecto (JS) y módulos propios en Python.
  - Paquetes de Python más allá de la biblioteca estándar.
  - HTML, CSS y vista previa (acordado para después).
  - Elegir lenguaje y letra al empezar.
  - Firma de publicación.
  - Icono definitivo.
  - iOS.
- **Versiones:** `web/index.html` con `app/*.js?v=1` y `app/app.css?v=1`; editor compartido con las versiones de Code Battle Lite.

## Decisiones del usuario · motores, interfaz, archivos y orientación · 5 de noviembre de 2026

- **Python: intérprete completo**, servido desde el propio proyecto (sin conexión), aunque pese bastante más que un traductor. No se reutiliza el traductor de Code Battle Lite. *Pendiente:* qué intérprete (por ejemplo, CPython compilado a WebAssembly, como Pyodide), su peso y su arranque en un teléfono modesto.
- **Interfaz compartida, motor propio.** La UI del editor se comparte con Code Battle Lite y debe poder actualizarse con facilidad en los dos proyectos. La ejecución y los motores son completamente distintos: Mobile Coder no usa el runtime ni el Worker del juego. Esto requiere sacar la apariencia del teléfono de `Prototypes/Rocket Launcher/` a un componente común (barra del ProtoMouse, orden de la barra de inserción, barra superior, hoja inferior y ajuste al teclado). *Pendiente:* cómo se comparte (repositorio o paquete común, submódulo, copia sincronizada), y cómo se ejecuta JavaScript y qué entrada/salida necesitan los dos lenguajes (consola, `input`, archivos).
- **Archivos en una carpeta del teléfono.** El usuario elige en qué carpeta del teléfono vive la estructura de archivos de cada proyecto. Esto pesa en la plataforma: hay que comprobar qué permite cada opción. Hasta donde sé, el navegador de Android no deja elegir una carpeta (el selector de carpetas de la API de acceso a archivos es solo de escritorio), y una app nativa sí.
- **Plataforma abierta:** app instalable, web o nativa. Se decide tras **una conversación larga y con consultas**. Entre otros factores: acceso a carpetas, peso y arranque del intérprete de Python, actualización de la UI compartida, distribución y funcionamiento sin conexión.
- **Teléfono en horizontal: no.** Solo vertical.
- **Hoja inferior: consola y vista previa.** Ocupa el lugar del inspector del juego. La vista previa sirve para proyectos web (HTML, CSS y JS). **HTML, CSS y la vista previa quedan para después**: el primer paso es JS y Python, con la consola en la hoja.
- **Análisis inicial de plataforma** (para la conversación, no es decisión): la vista previa no empuja hacia lo nativo, porque cualquier opción la pinta con un motor web (iframe en una web, WebView en Android, Flutter o React Native). Lo que sí empuja hacia una app Android es elegir la carpeta del teléfono. Flutter y React Native chocan con la UI compartida: obligarían a rehacerla o a meterla en una WebView, sumando una capa sin ganar nada. Candidata a discutir: app Android con la UI web dentro de una WebView (envoltorio propio en Kotlin o Capacitor). Comprobaciones antes de decidir: selector de carpetas en Chrome Android, teclado y ProtoMouse dentro de una WebView, arranque de Pyodide sin conexión, vista previa con archivos relativos servidos desde la carpeta y aislamiento ante bucles infinitos.

### Decisiones pendientes del usuario (en esa fecha)

- La plataforma. **Decidida después:** envoltorio Kotlin con la interfaz web (entrada de arriba).
- El intérprete de Python concreto y el motor de JavaScript. **Provisional:** Pyodide 314.0.7 y el motor de la WebView (entrada de arriba).
- Cómo se comparte la UI con Code Battle Lite. **Provisional:** copia sincronizada (entrada de arriba).
- Las acciones de la barra superior propias de un IDE. **Provisional:** archivos, archivo abierto, ▶/■, sin teclado y ⋯ (entrada de arriba).

## Inicio del proyecto · documentación mínima · 5 de noviembre de 2026

- **Acordado.** Mobile Coder será un IDE para el teléfono que aprovecha la ergonomía táctil del editor de Code Battle Lite. Se empieza solo con texto: `README.md`, `AGENTS.md`, `PROGRESO.md` y la interfaz en `docs/UI-MOVIL.md`.
- **Referencia de partida.** Code Battle Lite, commit `56435c7` (rama `ccr-f023900d-mpg9ew`): distribución del teléfono con barra mínima, ProtoMouse, barra de inserción en dos conjuntos, modo sin teclado y hoja inferior redimensionable. Ese commit solo se ha probado en Chromium emulando un teléfono táctil de 390 × 844, no en un teléfono real.
- **Primer paso acordado.** Un editor de código que funcione con **JavaScript y Python**, con **motores propios** y **completamente sin conexión**: nada se descarga de un CDN ni depende de un servidor para editar o ejecutar. Después vendrá la interfaz del teléfono de `docs/UI-MOVIL.md` sobre ese editor.
- **Qué hay de partida en Code Battle Lite** (referencia, no decisión): ya funciona sin conexión. Edita JS con Acorn 8.11.3 y Python con lezer 1.1.19, ambos servidos desde `shared/vendor/` con licencia y hash fijados. Ejecuta JS en un Worker con el motor del navegador. Python se traduce a JS línea a línea (`shared/python/traductor.js`) y corre en ese mismo Worker. Ese traductor cubre el subconjunto del juego y tiene diferencias conocidas con CPython (renombrado de variables, parámetros por defecto, Unicode).
- **Sin código todavía.** No hay implementación, pruebas ni dependencias.

Las decisiones pendientes de esta entrada se resolvieron o pasaron a la siguiente (arriba).
