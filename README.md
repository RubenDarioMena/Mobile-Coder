# Mobile Coder

Un IDE para el teléfono, pensado para escribir código con el pulgar y aprovechar el teclado nativo sin pelearse con él. Reutiliza la ergonomía táctil que se está construyendo para el editor del juego **Code Battle Lite** ([RubenDarioMena/Code-Battles_lite](https://github.com/RubenDarioMena/Code-Battles_lite)).

**Estado:** solo documentación. Todavía no hay código ni decisiones técnicas cerradas.

**Primer paso:** un editor de código para **JavaScript y Python**, con motores propios y **completamente sin conexión**. Python con un intérprete completo. Después, la interfaz del teléfono sobre ese editor.

**Acordado también:** la UI del editor se comparte con Code Battle Lite y la ejecución es propia; cada proyecto vive en la carpeta del teléfono que elija el usuario; solo vertical. La plataforma (web, instalable o nativa) se decidirá en una conversación aparte.

## Documentos

| Documento | Para qué |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instrucciones de trabajo (personas y agentes). |
| [PROGRESO.md](PROGRESO.md) | Registro de lo hecho, lo acordado y lo pendiente. |
| [docs/UI-MOVIL.md](docs/UI-MOVIL.md) | La interfaz acordada: reparto de la pantalla, barras, ProtoMouse y hoja inferior. |

## De dónde parte

El editor de Code Battle Lite ya tiene, en el teléfono, la distribución que este IDE quiere heredar: barra superior mínima, código a pantalla casi completa, barra de edición con ProtoMouse, barra metálica de inserción y una hoja inferior redimensionable. Referencia: commit [`56435c7`](https://github.com/RubenDarioMena/Code-Battles_lite/commit/56435c70e7b7e628aff211d0e11fdfea59ce671b) de la rama `ccr-f023900d-mpg9ew`; los lineamientos están en `docs/REDISENO-EDITOR-MOVIL.md` de ese repositorio.

Hoy el componente del editor (`shared/editor/`) se puede montar fuera del juego, pero la apariencia del teléfono (estilos de la barra del ProtoMouse, orden de la barra de inserción, barra superior, hoja ⓘ y ajuste al teclado) sigue dentro de `Prototypes/Rocket Launcher/`. Para compartirla hay que sacarla a un componente común; cómo, está pendiente (ver [PROGRESO.md](PROGRESO.md)).
