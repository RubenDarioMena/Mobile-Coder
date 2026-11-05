# Progreso

## Inicio del proyecto · documentación mínima · 5 de noviembre de 2026

- **Acordado.** Mobile Coder será un IDE para el teléfono que aprovecha la ergonomía táctil del editor de Code Battle Lite. Se empieza solo con texto: `README.md`, `AGENTS.md`, `PROGRESO.md` y la interfaz en `docs/UI-MOVIL.md`.
- **Referencia de partida.** Code Battle Lite, commit `56435c7` (rama `ccr-f023900d-mpg9ew`): distribución del teléfono con barra mínima, ProtoMouse, barra de inserción en dos conjuntos, modo sin teclado y hoja inferior redimensionable. Ese commit solo se ha probado en Chromium emulando un teléfono táctil de 390 × 844, no en un teléfono real.
- **Primer paso acordado.** Un editor de código que funcione con **JavaScript y Python**, con **motores propios** y **completamente sin conexión**: nada se descarga de un CDN ni depende de un servidor para editar o ejecutar. Después vendrá la interfaz del teléfono de `docs/UI-MOVIL.md` sobre ese editor.
- **Qué hay de partida en Code Battle Lite** (referencia, no decisión): ya funciona sin conexión. Edita JS con Acorn 8.11.3 y Python con lezer 1.1.19, ambos servidos desde `shared/vendor/` con licencia y hash fijados. Ejecuta JS en un Worker con el motor del navegador. Python se traduce a JS línea a línea (`shared/python/traductor.js`) y corre en ese mismo Worker. Ese traductor cubre el subconjunto del juego y tiene diferencias conocidas con CPython (renombrado de variables, parámetros por defecto, Unicode).
- **Sin código todavía.** No hay implementación, pruebas ni dependencias.

### Decisiones pendientes del usuario

- **Cómo se reutiliza el editor:** depender de `shared/editor/` de Code Battle Lite, extraerlo a un componente común para los dos proyectos o copiarlo aquí. Hoy la apariencia del teléfono está atada al juego (ver README).
- **Motores del primer paso:** qué cubre «motor propio» en cada lenguaje (análisis para resaltado, sangría y errores; ejecución). Para Python: ampliar el traductor de Code Battle Lite o usar un intérprete completo servido en local, más pesado. Qué parte de la biblioteca estándar y qué entrada/salida (consola, `input`, archivos) hacen falta.
- **Archivos y proyectos:** dónde se guardan (almacenamiento del navegador, archivos del teléfono, Git) y cómo se cambia de uno a otro.
- **Plataforma:** página web, PWA instalable o envoltorio nativo.
- **Contenido de la hoja inferior** (en el juego es la ficha ⓘ: objetivo, inspector y consola).
- **Acciones de la barra superior** propias de un IDE (en el juego: programas, ejecutar, sin teclado, mapa, pantalla completa y ⋯).
- **Teléfono en horizontal** (en el juego sigue con la distribución de PC).
