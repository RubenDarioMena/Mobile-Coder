# Progreso

## Decisiones del usuario · motores, interfaz, archivos y orientación · 5 de noviembre de 2026

- **Python: intérprete completo**, servido desde el propio proyecto (sin conexión), aunque pese bastante más que un traductor. No se reutiliza el traductor de Code Battle Lite. *Pendiente:* qué intérprete (por ejemplo, CPython compilado a WebAssembly, como Pyodide), su peso y su arranque en un teléfono modesto.
- **Interfaz compartida, motor propio.** La UI del editor se comparte con Code Battle Lite y debe poder actualizarse con facilidad en los dos proyectos. La ejecución y los motores son completamente distintos: Mobile Coder no usa el runtime ni el Worker del juego. Esto requiere sacar la apariencia del teléfono de `Prototypes/Rocket Launcher/` a un componente común (barra del ProtoMouse, orden de la barra de inserción, barra superior, hoja inferior y ajuste al teclado). *Pendiente:* cómo se comparte (repositorio o paquete común, submódulo, copia sincronizada), y cómo se ejecuta JavaScript y qué entrada/salida necesitan los dos lenguajes (consola, `input`, archivos).
- **Archivos en una carpeta del teléfono.** El usuario elige en qué carpeta del teléfono vive la estructura de archivos de cada proyecto. Esto pesa en la plataforma: hay que comprobar qué permite cada opción. Hasta donde sé, el navegador de Android no deja elegir una carpeta (el selector de carpetas de la API de acceso a archivos es solo de escritorio), y una app nativa sí.
- **Plataforma abierta:** app instalable, web o nativa. Se decide tras **una conversación larga y con consultas**. Entre otros factores: acceso a carpetas, peso y arranque del intérprete de Python, actualización de la UI compartida, distribución y funcionamiento sin conexión.
- **Teléfono en horizontal: no.** Solo vertical.

### Decisiones pendientes del usuario

- La plataforma (conversación pendiente).
- El intérprete de Python concreto y el motor de JavaScript.
- Cómo se comparte la UI con Code Battle Lite.
- El contenido de la hoja inferior (en el juego es la ficha ⓘ: objetivo, inspector y consola).
- Las acciones de la barra superior propias de un IDE (en el juego: programas, ejecutar, sin teclado, mapa, pantalla completa y ⋯).

## Inicio del proyecto · documentación mínima · 5 de noviembre de 2026

- **Acordado.** Mobile Coder será un IDE para el teléfono que aprovecha la ergonomía táctil del editor de Code Battle Lite. Se empieza solo con texto: `README.md`, `AGENTS.md`, `PROGRESO.md` y la interfaz en `docs/UI-MOVIL.md`.
- **Referencia de partida.** Code Battle Lite, commit `56435c7` (rama `ccr-f023900d-mpg9ew`): distribución del teléfono con barra mínima, ProtoMouse, barra de inserción en dos conjuntos, modo sin teclado y hoja inferior redimensionable. Ese commit solo se ha probado en Chromium emulando un teléfono táctil de 390 × 844, no en un teléfono real.
- **Primer paso acordado.** Un editor de código que funcione con **JavaScript y Python**, con **motores propios** y **completamente sin conexión**: nada se descarga de un CDN ni depende de un servidor para editar o ejecutar. Después vendrá la interfaz del teléfono de `docs/UI-MOVIL.md` sobre ese editor.
- **Qué hay de partida en Code Battle Lite** (referencia, no decisión): ya funciona sin conexión. Edita JS con Acorn 8.11.3 y Python con lezer 1.1.19, ambos servidos desde `shared/vendor/` con licencia y hash fijados. Ejecuta JS en un Worker con el motor del navegador. Python se traduce a JS línea a línea (`shared/python/traductor.js`) y corre en ese mismo Worker. Ese traductor cubre el subconjunto del juego y tiene diferencias conocidas con CPython (renombrado de variables, parámetros por defecto, Unicode).
- **Sin código todavía.** No hay implementación, pruebas ni dependencias.

Las decisiones pendientes de esta entrada se resolvieron o pasaron a la siguiente (arriba).
