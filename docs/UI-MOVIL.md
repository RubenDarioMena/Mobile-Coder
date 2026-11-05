# Interfaz del teléfono

Decisiones acordadas para el editor del teléfono de Code Battle Lite que este IDE hereda. Es la intención de uso, no una especificación técnica: tamaños exactos y detalles se validan en teléfonos reales. Lo que en el juego depende del mapa o de los retos queda marcado como *por adaptar*.

## Principios

- Solo vertical: no hay distribución para el teléfono en horizontal.
- Esta interfaz se comparte con Code Battle Lite; la ejecución de cada proyecto es propia.
- Máximo espacio útil para el código, iconos claros y pocos toques por operación.
- El teclado nativo se respeta: las barras propias quedan justo encima de él y el código ocupa el resto de la pantalla visible.
- Tocar las barras no cierra el teclado, no pierde la selección ni mueve el cursor sin querer.
- El gesto de arrastre se reserva para el ProtoMouse (y para el asa de la hoja).
- Lo que sale de la pantalla principal sigue accesible: manteniendo pulsado su botón pariente o en el menú ⋯.
- Estética metálica: botones con luz, y placas metálicas para las variantes.

## Reparto de la pantalla (de arriba abajo)

1. **Barra superior mínima.** Unas 4–5 acciones y el menú ⋯. No se pliega, ni con el teclado abierto. Incluye el interruptor del **modo sin teclado** (en rojo y tachado cuando está activo). *Por adaptar:* el resto de acciones de un IDE.
2. **Código.** Ocupa todo lo demás y queda despejado.
3. **Barra de edición con ProtoMouse:** deshacer · rehacer · selección | **ProtoMouse** | cortar · copiar · pegar.
4. **Barra metálica de inserción:** una fila horizontal desplazable con dos conjuntos (ver abajo).
5. **Teclado nativo** (si está abierto).

## Barra de edición

- **ProtoMouse:** trackpad relativo. Se mantiene el dedo y se arrastra: un puntero virtual (con aceleración) mueve el cursor al carácter más cercano, por renglones visuales. El arrastre sigue fuera de la franja y, al llegar arriba o abajo, el código se desplaza. Nunca abre ni cierra el teclado. Con el teclado cerrado pinta su propio cursor y su selección. Un toque sin arrastrar explica cómo se usa.
- **Selección:** interruptor con luz azul. Apagado, el ProtoMouse mueve el cursor; encendido, amplía la selección desde el extremo fijo. Se apaga al cambiar el texto o al usar otra acción.
- **Variantes (mantener pulsado):** Selección → ampliar, reducir, subir y bajar línea; Cortar → borrar, desenvolver; Copiar → duplicar; Pegar → línea nueva, sangrar y quitar sangría. Una pulsación larga despliega las placas y después se toca la opción; no hay selección por deslizamiento.

## Barra de inserción

Dos conjuntos en la misma fila:

- **Edición y sintaxis:** línea nueva (debajo de la línea actual, esté donde esté el cursor, ya sangrada), tab (mantener: quitar sangría), comentar, borrar (sin pasar por el portapapeles), pares `( )` `[ ]` `{ }` `" "` (rodean lo elegido) y puntuación `.` `,` `;` `:`.
- **Bloques:** bucles, `if`, operadores, variable y salida por consola. *Por adaptar:* en el juego también hay órdenes del robot, que aquí no aplican.

**Con teclado** va primero edición y sintaxis. **En modo sin teclado** se cambian de sitio y van primero los bloques, porque sin teclado se construye más a partir de estructuras completas. Al cambiar de modo, la fila vuelve al principio. Desplazar la fila no activa pulsaciones largas. Al insertar una estructura con código elegido, la estructura lo envuelve cuando tiene sentido.

Las sugerencias de funciones y variables siguen en el desplegable del editor; la barra no las duplica.

## Hoja inferior

- Una **pestaña con una flecha** en la esquina inferior derecha del código, apoyada en la barra de edición. Sigue visible con el teclado abierto.
- Al tocarla sube una **hoja del ancho del código** que empieza ocupando la mitad de la pantalla.
- Un **asa arriba** cambia su alto. El alto se recuerda al cerrar y al recargar, guardado como proporción del área del código, para adaptarse cuando aparece el teclado.
- Se cierra con la **flecha hacia abajo** o **llevando el asa hasta abajo**; vuelve la pestaña.
- Tocar el código no la cierra: se puede leer mientras se escribe.
- Contenido en el IDE: **consola** y **vista previa** (proyectos HTML, CSS y JS). En el juego son objetivo, inspector y consola.

## Ajustes

Lenguaje y tamaño de letra se elegirán al empezar y después solo en Ajustes. El resaltado de sintaxis está activo por defecto.

## Estado en la primera implementación (0.1.0)

Hecho como está descrito arriba:
- reparto de la pantalla;
- barra de edición con ProtoMouse y variantes;
- barra de inserción en dos conjuntos que se cambian de sitio sin teclado;
- hoja inferior con pestaña, asa, alto recordado y cierre arrastrando;
- ajuste al teclado.

La hoja muestra la **consola**; la vista previa llega con HTML y CSS.

Barra superior provisional:
- archivos;
- archivo abierto (lenguaje y estado de guardado);
- ▶/■;
- sin teclado;
- ⋯ (archivos, letra, ajustes del editor, acerca de).

Pendiente: elegir lenguaje y letra al empezar. Probado solo en Chromium emulando un teléfono (ver `PROGRESO.md`).

## Servicios de lenguaje (0.2.0)

- **Sugerencias** de código: van en el desplegable del editor, junto al cursor, como se acordó («las sugerencias siguen en el desplegable del editor; la barra no las duplica»). Se tocan sin cerrar el teclado.
- **Placa «↗»:** con el cursor quieto sobre algo que está en otro archivo (un `import`, un `href`, una clase), una placa metálica lo abre. Atrás vuelve.
- **Se aparta de lo acordado:** la hoja inferior tiene una segunda pestaña, **Problemas** (errores y avisos de todo el proyecto, con contador). Lo acordado era consola y vista previa; la vista previa sigue pendiente y sería la tercera pestaña. A revisar con el usuario.
- HTML y CSS tienen su propia barra de inserción (pares `< >`, etiquetas, enlazar CSS/JS, reglas y propiedades). ▶ queda apagado hasta que exista la vista previa.
