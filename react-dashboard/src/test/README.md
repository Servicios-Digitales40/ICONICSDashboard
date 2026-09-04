# `src/test/` — la suite completa

Todas las pruebas viven aquí, fuera del código que ejercitan.

Antes estaban junto a su sujeto (`modelo.js` y `modelo.test.js` en la misma
carpeta). Funcionaba, pero al crecer el árbol la suite dejó de ser visible: no
había forma de responder «qué está cubierto» sin recorrer diez directorios. Con
un solo árbol, la respuesta está en un `ls`.

**El árbol de aquí ESPEJA el de `src/`**, con una excepción declarada
(`dominio/`, más abajo). Es la única regla de colocación: si se añade una
prueba, va en la ruta equivalente a la de su sujeto.

## Qué pasó en la Fase 3 del Plan 20

La suite pasó de **53 archivos a 17**. No es que se dejara de probar: es que
desapareció lo que se probaba. El tablero de planta eran veintidós pantallas
—dos máquinas, sus riesgos, sus controles, dos vistas 3D, seis de predicción—
y con él se fueron treinta y siete archivos de prueba: vistas simuladas,
gráficas, exportadores, el motor de sondeo, el modo muro, la navegación.

Lo que queda cubre lo que queda: **una sola vista, el asistente**, con sus
cajones y el dominio compartido que el backend usa igual.

> El detalle de qué se borró, qué se movió y qué se adecuó, archivo por
> archivo, está en [`docs/PLAN-20-ASISTENTE.md`](../../../docs/PLAN-20-ASISTENTE.md)
> §7.4. Aquí sólo el mapa de lo vivo.

## Qué prueba cada carpeta

### `dominio/` — las reglas, sin React y sin red

**La excepción a la regla del espejo, y es deliberada.** Estos cuatro archivos
prueban `shared/eva/`, que no vive bajo `src/` sino en la raíz del repositorio,
porque lo importan dos programas: este frontend y el backend de Node.

Sobrevivieron enteros al borrado de la carpeta `Demo-EVA/`, y **eso es el
resultado que valida la separación por capas** (CLAUDE.md §4.3): estaban
probando dominio, no vistas. Antes vivían en `test/demo-eva/`, un nombre que
tras el borrado habría mentido sobre lo que hay dentro.

| Archivo | Qué fija |
|---|---|
| [dominio/dominio.test.js](dominio/dominio.test.js) | El saneamiento y la evaluación contra bandas: un booleano no es un cero y un hueco no es un límite roto. |
| [dominio/sistemas.test.js](dominio/sistemas.test.js) | El registro de sistemas: que cada uno declare sus raíces, sus puntos y su `parse()`, y que dos máquinas con distinto PLC no se crucen. |
| [dominio/estado-maquina.test.js](dominio/estado-maquina.test.js) | Cuándo una máquina está muda, y que la ausencia de dato se cuente aparte en vez de disfrazarse de cero. |
| [dominio/rango.test.js](dominio/rango.test.js) | El troceado de una ventana de tiempo en tramos: la rejilla común que hace comparables dos series. |

### `features/asistente/` — la aplicación

| Archivo | Qué fija |
|---|---|
| [features/asistente/asistente.test.jsx](features/asistente/asistente.test.jsx) | El panel de conversación: los estados dichos con palabras, la cancelación, el reintento y las citas de origen bajo cada respuesta. |
| [features/asistente/manosLibres.test.jsx](features/asistente/manosLibres.test.jsx) | El ciclo de voz completo: hablar, que el turno se cierre solo al callarse, y la respuesta en voz alta. |
| [features/asistente/silencio.test.js](features/asistente/silencio.test.js) | La detección de silencio que cierra el turno. Es aritmética sobre el flujo de audio, sin DOM. |
| [features/asistente/persistencia.test.js](features/asistente/persistencia.test.js) | Que el hilo sobreviva a una recarga. Desde la Fase 4 tendrá que sobrevivir además a una sesión caducada. |
| [features/asistente/traza.test.js](features/asistente/traza.test.js) | El trazo que se dibuja mientras el texto llega: derivado de los caracteres que de verdad llegaron, nunca una onda decorativa. |
| [features/asistente/cajon-casos.test.jsx](features/asistente/cajon-casos.test.jsx) | El cajón «Casos»: que un archivado no salga por defecto, que `resuelto` y `diagnosticoCorrecto` se pinten separados, y que archivar mande el `PATCH` y relea. |
| [features/asistente/cajon-manuales.test.jsx](features/asistente/cajon-manuales.test.jsx) | El cajón «Manuales»: subir, reemplazar y archivar. Es la capacidad 7 del encargo — el único camino por el que entra conocimiento externo. |
| [features/asistente/accesibilidad.test.jsx](features/asistente/accesibilidad.test.jsx) | Que los cajones no tengan violaciones graves de accesibilidad. Con dos pantallas, un defecto aquí está en la mitad de la aplicación. |

### `app/` — el armazón

| Archivo | Qué fija |
|---|---|
| [app/una-sola-vista.test.jsx](app/una-sola-vista.test.jsx) | **La invariante §2.12**: que no vuelvan las rutas. Volver a tener veintidós pantallas no pasa de golpe, pasa añadiendo la segunda. |
| [app/theme.test.jsx](app/theme.test.jsx) | Los tres temas (claro, oscuro, Mitsubishi Electric) y que nadie escriba un color a fuego fuera de `useTheme()`. |

### `lib/` — los cimientos, sin React

| Archivo | Qué fija |
|---|---|
| [lib/valores.test.js](lib/valores.test.js) | La frontera de saneamiento: `Infinity`/`NaN` del servidor no entran al modelo, y un cero sí es una medición. |
| [lib/concurrencia.test.js](lib/concurrencia.test.js) | El acotador de tareas simultáneas: que respete el tope y que un fallo no se lleve por delante el resto de la tanda. |
| [lib/iconics/apiClient.test.js](lib/iconics/apiClient.test.js) | El contrato con el puente: qué se manda, qué se espera de vuelta y qué pasa cuando contesta mal. |

## Los arneses

- [`a11y.js`](a11y.js) — `axe-core` filtrado a violaciones **graves**. Lanza
  con el detalle de cada regla y el nodo culpable en vez de devolver una lista:
  el mensaje es más útil que la aserción.
- [`setup.js`](setup.js) — lo que vitest carga antes de cada archivo.
