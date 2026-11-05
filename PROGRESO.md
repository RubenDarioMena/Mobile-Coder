# Progreso

## Servicios de lenguaje y archivos que se conocen entre ellos · 5 de noviembre de 2026

Pedido por el usuario: implementar Jedi, el servicio de lenguaje de TypeScript, `vscode-html-languageservice` y `vscode-css-languageservice`, y que los documentos se comuniquen entre ellos (lo que una página enlaza, los `import`).

- **Qué hay:**
  - **Servicios de lenguaje**, sin conexión y en Workers (fuera del hilo de la interfaz):
    - **JavaScript:** TypeScript 6.0.3 (Apache-2.0), con todo el proyecto a la vista. La versión 7 es nativa (Go) y no corre en una WebView. Los mensajes de error llegan en español (vienen con TypeScript).
    - **HTML y CSS:** `vscode-html-languageservice` 5.6.2 y `vscode-css-languageservice` 6.3.10 (MIT). Sus mensajes están en inglés.
    - **Python:** Jedi 0.19.2 y parso 0.8.6 (MIT), sobre un segundo Pyodide, aparte del que ejecuta los programas.
  - **Qué hacen:**
    - **Sugerencias** mientras se escribe con teclado, en el desplegable del editor, junto al cursor. Se ponen tocándolas o con Tab/Intro, flechas y Escape.
    - **Problemas:** la hoja tiene ahora dos pestañas, Consola y Problemas. Los problemas se agrupan por archivo, con un contador, y tocar uno lleva a su línea, también en otro archivo. En el archivo abierto se marca la línea del primer error, salvo la que se está escribiendo.
    - **Ir a otro archivo:** con el cursor quieto sobre algo definido o enlazado en otro archivo, aparece una placa «↗» que lo abre en esa línea. Atrás vuelve.
  - **Archivos que se conocen entre ellos:**
    - **JS:**
      - completa lo que exporta otro archivo y las rutas de los `import` (con `.js`);
      - avisa de módulos y nombres que no existen;
      - lleva a la definición.
    - **HTML:**
      - avisa si un `href`/`src` apunta a un archivo que no está;
      - completa rutas y, en `class="…"`/`id="…"`, las clases e ids de sus hojas de estilo (las enlazadas y su `<style>`);
      - abre lo enlazado, y una clase lleva a su regla en el CSS.
      - El `<script>` y el `<style>` de la página usan los servicios de JS y CSS.
    - **CSS:** tras `.` o `#` sugiere las clases e ids que usan las páginas que la enlazan.
    - **Python:** Jedi resuelve los `import` entre `.py` del proyecto (completa, lleva a la definición y avisa si un módulo no está).
  - **Ejecutar con imports:**
    - **JavaScript:** los `import` relativos entre archivos del proyecto (`./`, `../`, `/`; sin extensión se prueba `.js`, `.mjs` e `index.js`). El grafo lo arma `app/modulos.js` con acorn, y cada archivo se sirve al motor como un blob.
      - Avisa, sin ejecutar, de un paquete de npm (sin conexión no hay), de un archivo que no está y de un import circular (todavía no se admite).
      - Un error dentro de otro archivo dice en cuál y en qué línea; la nota lleva a él.
    - **Python:** antes de cada ejecución, los `.py` y los datos de texto del proyecto se copian en `/proyecto`. El directorio del archivo es `sys.path[0]` y el directorio de trabajo, como en CPython. `open("datos.txt")` funciona, pero lo que el programa escriba no vuelve a la carpeta.
  - **HTML y CSS en el editor:** se abren `.html`, `.htm`, `.css` y `.mjs`.
    - Resaltado propio. Dentro de una página, el `<script>` se resalta como JS y el `<style>` como CSS.
    - Comentar con `<!-- -->` y `/* */`, y sangría tras una etiqueta que abre.
    - Barra de inserción propia: pares `< >`, etiquetas, enlazar CSS/JS, `<style>`/`<script>`, `class`/`id`, reglas, propiedades, `@media` y variables.
    - Un `.html` nuevo empieza con una página que enlaza `estilos.css` y `main.js`.
    - ▶ queda apagado en HTML y CSS y explica que la vista previa está pendiente.
  - **Índice del proyecto** (`app/proyecto.js`): lo que hay en la carpeta y el texto de los archivos de código y de datos.
    - Límites: 400 archivos, 200 carpetas, 1 MB por archivo y 20 s.
    - Salta las carpetas ocultas, `node_modules`, `__pycache__`, `venv`, `build` y `dist`.
    - Se vuelve a leer al regresar a la app si pasó más de un minuto.
- **Decisiones (para revisar con el usuario):**
  - **Se aparta de `docs/UI-MOVIL.md`:** la hoja tiene una segunda pestaña, Problemas; lo acordado era consola y vista previa. Queda registrado allí.
  - **La placa «↗» solo aparece para ir a otro archivo.** Para no aparecer en cada nombre, no salta a definiciones dentro del mismo archivo.
  - **Errores de tipos de JS:** solo los que casi siempre son un fallo real (nombres o módulos que no existen, redeclaraciones…), no todo el chequeo de tipos de TypeScript.
  - **Cada `.js` se analiza como módulo**, igual que se ejecuta: dos archivos sin `import` no comparten variables globales. Así no hay falsas redeclaraciones. A cambio, los scripts clásicos de una página que comparten globales darán «no se encuentra el nombre».
  - **HTML y CSS usan la estructura de JS** del editor compartido para el ProtoMouse, ampliar la selección y el modo sin teclado. Sus fichas tienen los mismos tipos y no hubo errores en las pruebas, pero ampliar la selección no entiende de etiquetas. Una estructura propia de HTML queda pendiente.
  - **El segundo Pyodide (Jedi)** arranca 2,5 s después de abrir un `.py`, para no competir con el de la ejecución. Cuesta memoria; si en un teléfono modesto pesa demasiado, se puede compartir con el motor cuando no corre nada.
  - **Herramientas:**
    - `herramientas/lenguajes.mjs` deja las copias en `web/vendor/typescript/`, `servicios-web/` y `jedi/`, con `MANIFEST.json` y licencias.
    - npm verifica las huellas con `herramientas/lenguajes/package-lock.json`, y las ruedas de PyPI se verifican con sha256.
    - Los servicios de HTML/CSS se empaquetan sin cambios en un solo script con esbuild 0.28.2. Es la única compilación, y solo de código de terceros.
    - Todo eso suma unos 17 MB más en `web/vendor/`.
  - El envoltorio sirve `.d.ts` como texto y `.whl` como zip (`Activos.kt`).
- **Verificación actual:**
  - `node herramientas/verificar.mjs`: 144 comprobaciones; ahora incluye las copias de los servicios.
  - `node pruebas/ui.mjs`: 32 de 32 en Chromium emulando un Pixel 7, con toda la red externa bloqueada. Las 26 de antes siguen pasando; una se ajustó al nuevo texto de «Nuevo archivo». Las 6 nuevas:
    - JS: sugerencias de otro archivo, ponerlas, la placa «↗», abrir `lib/util.js` y volver con Atrás;
    - problemas de JS entre archivos (en español, contador, línea marcada, tocar uno);
    - HTML: clase de la hoja enlazada, etiqueta, enlace roto, abrir el CSS desde el `href` y ▶ en HTML/CSS;
    - CSS: clases de la página que la enlaza;
    - JS: ejecutar con imports, error en otro archivo con su pila, paquete de npm y archivo que falta;
    - Python: Jedi completa un módulo del proyecto y avisa de un import roto, y la ejecución con `import`, datos del proyecto y error en otro archivo.
  - En Chromium de escritorio, TypeScript cargó en unos 0,5 s y Jedi (con su Pyodide) en unos 5,5 s. La primera sugerencia de Python tardó unos 3 s.
  - El APK se compila en Actions (ver abajo).
- **Límites:**
  - **Nada de esto se ha probado en un teléfono real.** Lo más incierto:
    - que la WebView entregue a los Workers los activos de la app (TypeScript se carga con `importScripts` y XHR síncrono, y Jedi con `fetch`);
    - el tiempo y la memoria de dos Pyodide en un teléfono modesto;
    - las sugerencias con el teclado de Android (Gboard compone las palabras).
  - Los mensajes de HTML y CSS están en inglés, y los de Jedi solo se traducen en los casos comunes.
  - No hay vista previa de HTML: una página no se puede ejecutar todavía.
- **Pendiente** (además de lo de la entrega anterior):
  - vista previa de HTML/CSS/JS;
  - la estructura de HTML/CSS para el ProtoMouse y el modo sin teclado;
  - subrayar los problemas en el código (el editor compartido solo marca una línea);
  - renombrar un símbolo en todo el proyecto;
  - imports circulares en JS;
  - compartir Pyodide entre Jedi y la ejecución si hace falta memoria.

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
  - `import` entre archivos del proyecto (JS) y módulos propios en Python. *Hecho en la entrega siguiente.*
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
