# Mobile Coder · instrucciones de trabajo

Antes de cambiar nada, lee `README.md`, `docs/UI-MOVIL.md` y el estado reciente de `PROGRESO.md`.

- **Etapa actual: documentación.** No añadas código, dependencias, herramientas de compilación ni estructura de carpetas sin que el usuario lo pida. Las decisiones técnicas abiertas están en `PROGRESO.md`; no las des por tomadas.
- **Sin conexión.** Editar y ejecutar JavaScript y Python no puede depender de Internet: nada de CDN ni servicios remotos. Lo que se use se sirve desde el propio proyecto, con licencia y versión fijadas.
- **El teléfono primero, en vertical.** Android es la prioridad; iOS va después. No hay distribución horizontal. El escritorio no es un objetivo por ahora.
- **Interfaz compartida, motor propio.** La UI del editor se comparte con Code Battle Lite; no la bifurques con cambios solo de aquí sin registrarlo. La ejecución (JavaScript y el intérprete completo de Python) es propia de este proyecto: no dependas del runtime del juego.
- **La interfaz acordada manda.** `docs/UI-MOVIL.md` recoge decisiones del usuario. Si una implementación se aparta de ella, dilo y regístralo; no la cambies en silencio.
- **De Code Battle Lite solo viene la interfaz.** Cuando reutilices algo de ese repositorio, indica el archivo y el commit de origen en `PROGRESO.md`. No traigas nada propio del juego (mapa, robots, retos, simulación, runtime).
- **Cambios pequeños.** El usuario hace QA a mano en su teléfono con frecuencia.
- **Verificación honesta.** Distingue lo probado en un teléfono real de lo emulado en un navegador de escritorio, y lo comprobado ahora de lo comprobado antes.
- **Idioma:** documentación y textos de la interfaz en español.
- Registra en `PROGRESO.md` los cambios relevantes, lo acordado y lo pendiente, con la entrada más reciente arriba.
- No hagas commits, push ni publicación sin instrucciones del usuario. No crees tareas paralelas ni delegues salvo petición explícita.

En el resumen de cada entrega indica qué cambió, cómo se verificó y cualquier límite material.
