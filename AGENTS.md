# Mobile Coder · instrucciones de trabajo

Antes de cambiar nada, lee `README.md`, `docs/UI-MOVIL.md`, `docs/ARQUITECTURA.md` y el estado reciente de `PROGRESO.md`.

- **Plataforma decidida:** app Android con un envoltorio pequeño en Kotlin (`app/`) y la interfaz web en una WebView (`web/`). Lo nativo se limita a lo que la web no puede hacer en Android (carpetas y archivos); lo demás es web.
- **Sin conexión.** Editar y ejecutar JavaScript y Python no puede depender de Internet: nada de CDN ni servicios remotos. Lo que se use se sirve desde el propio proyecto, con licencia, versión y huella fijadas (`web/vendor/`).
- **El teléfono primero, en vertical.** Android es la prioridad; iOS va después. No hay distribución horizontal. El escritorio no es un objetivo.
- **Interfaz compartida, motor propio.** `web/cmg/` es una copia sin editar de la interfaz del editor de Code Battle Lite. No se toca aquí: se cambia allí y se copia con `herramientas/sincronizar-editor.mjs`. La ejecución (`web/app/motor-*.js`) es propia; no dependas del runtime del juego.
- **De Code Battle Lite solo viene la interfaz.** Cuando portes algo de ese repositorio a `web/app/`, indica el archivo y el commit de origen en el código y en `PROGRESO.md`. No traigas nada propio del juego (mapa, robots, retos, simulación, runtime).
- **La interfaz acordada manda.** `docs/UI-MOVIL.md` recoge decisiones del usuario. Si una implementación se aparta de ella, dilo y regístralo.
- **Sin framework ni compilación en la web.** JavaScript y CSS sin empaquetador; no añadas dependencias por rutina. La única excepción es código de terceros: los servicios de HTML/CSS se empaquetan sin cambios con `herramientas/lenguajes.mjs`.
- **Copias de terceros** (`web/vendor/`): no se editan a mano. Se regeneran con `herramientas/pyodide.mjs` y `herramientas/lenguajes.mjs` (versiones en `herramientas/lenguajes/package.json` + `package-lock.json`). Ajusta el `?v=` de `web/index.html` cuando cambies un recurso.
- **Cambios pequeños.** El usuario hace QA a mano en su teléfono con frecuencia.
- **Verificación honesta.** Distingue lo probado en un teléfono real de lo emulado en Chromium, y lo comprobado ahora de lo comprobado antes.
- **Idioma:** documentación y textos de la interfaz en español.
- Registra en `PROGRESO.md` los cambios relevantes, lo acordado y lo pendiente, con la entrada más reciente arriba.
- No hagas commits, push ni publicación sin instrucciones del usuario. No crees tareas paralelas ni delegues salvo petición explícita.

## Verificación

```bash
node herramientas/verificar.mjs   # copias del editor y de Pyodide intactas + sintaxis de web/app (rápido, sin navegador)
node pruebas/ui.mjs               # Chromium emulando un Pixel 7, puerto 8782, sin red externa (Playwright)
node pruebas/ui.mjs python        # solo las pruebas cuyo nombre contiene «python»
node herramientas/servir.mjs      # la app en http://localhost:8781/ para mirarla a mano
```

- El APK lo compila GitHub Actions (`.github/workflows/apk.yml`) en cada push a `main` y lo publica en la release «prueba» (enlace fijo en el README).
- Localmente: `./gradlew assembleDebug`, con el SDK de Android y JDK 17.
- En entornos sin acceso a `dl.google.com` (SDK y Google Maven), el APK solo se puede compilar en CI.
- Cambios en Kotlin: comprueba que la ejecución de Actions termine en verde.

En el resumen de cada entrega indica qué cambió, cómo se verificó y cualquier límite material.
