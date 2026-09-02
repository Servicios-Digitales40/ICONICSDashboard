# `src/test/` — la suite completa

Todas las pruebas viven aquí, fuera del código que ejercitan.

Antes estaban junto a su sujeto (`modelo.js` y `modelo.test.js` en la misma
carpeta). Funcionaba, pero al crecer el árbol la suite dejó de ser visible: no
había forma de responder «qué está cubierto» sin recorrer diez directorios, y
las pruebas de render quedaban enterradas entre componentes. Con un solo árbol,
la respuesta está en un `ls`.

**El árbol de aquí ESPEJA el de `src/`.** Un archivo en `test/lib/iconics/`
prueba algo de `src/lib/iconics/`. Es la única regla de colocación: si se añade
una prueba, va en la ruta equivalente a la de su sujeto.

## Qué prueba cada carpeta

### `lib/` — los cimientos, sin React

| Archivo | Qué fija |
|---|---|
| [lib/valores.test.js](lib/valores.test.js) | La frontera de saneamiento: `Infinity`/`NaN` del servidor no entran al modelo, y un cero sí es una medición. |
| [lib/iconics/pollingEngine.test.js](lib/iconics/pollingEngine.test.js) | Ciclo de vida del motor y **presupuesto de red**: una petición por ciclo, no una por punto. Incluye el contrato con un transporte que falla, devuelve de menos o devuelve basura. |
| [lib/datasource/origen.test.jsx](lib/datasource/origen.test.jsx) | Los dos orígenes (ICONICS / simulador), su señalización, que el interruptor quede cerrado sin `VITE_ENABLE_SIMULATOR`, y que una preferencia guardada se ignore sin la bandera. |

### `app/` — el armazón

| Archivo | Qué fija |
|---|---|
| [app/navegacion.test.jsx](app/navegacion.test.jsx) | La ruta vive en la URL: enlace profundo, recarga, botón «atrás» y ruta desconocida. |
| [app/routes.test.jsx](app/routes.test.jsx) | Qué vistas existen: las cuatro de la demo, en su orden, sin restos del tablero anterior, y el sidebar que salen de ellas. |

### `demo-eva/` — el sistema de agua

Es la sección con dominio propio, y hoy la aplicación entera. Ver
[`src/Demo-EVA/README.md`](../Demo-EVA/README.md).

| Archivo | Qué fija |
|---|---|
| [demo-eva/dominio.test.js](demo-eva/dominio.test.js) | El saneamiento y la evaluación contra bandas: un booleano no es un cero y un hueco no es un límite roto. |
| [demo-eva/fuente.test.js](demo-eva/fuente.test.js) | El camino de datos con transporte de mentira, y **quién lee el pasado**: el `readSerie` del transporte si lo trae, el historiador si no. |
| [demo-eva/tres-d.test.js](demo-eva/tres-d.test.js) | El contrato estado → comportamiento 3D y la distribución de la maqueta. Todo lo que se prueba aquí es **puro o DOM**: no se intenta renderizar `<Canvas>` en jsdom, porque no hay WebGL y la prueba sólo mediría el mock. |
| [demo-eva/simulador.test.js](demo-eva/simulador.test.js) | Que el simulador sea determinista en el reloj, **recorra los estados** en vez de quedarse en `nominal`, respete `historizado` y no se salga de la `escala` del catálogo. |
| [demo-eva/planta-simulada.test.jsx](demo-eva/planta-simulada.test.jsx) | La vista real sobre el provider real con el origen simulado y **`fetch` convertido en trampa**: se ven las ocho señales sin que nadie salga a la red. Es lo que ninguna prueba de unidad podía ver, porque cada pieza por separado estaba bien. |

### `features/` — el asistente

| Archivo | Qué fija |
|---|---|
| [features/asistente/asistente.test.jsx](features/asistente/asistente.test.jsx) | El chat: que no aparezca sin modelo configurado, y que una respuesta sin consulta no llegue a pantalla. |

### `live/` — contra el servidor de verdad

| Archivo | Qué fija |
|---|---|
| [live/eva.live.test.js](live/eva.live.test.js) | Que los ocho puntos existan y respondan. Se salta sola si no hay servidor: es una comprobación, no una condición para trabajar. |

[setup.js](setup.js) rellena `ResizeObserver` y `matchMedia`, que jsdom no
trae y Recharts sí usa. Lo carga `vite.config.js` para toda la suite.

> **Lo que se fue en agosto de 2026.** La suite cubría además el tablero de OEE
> de Resonac: el rollup de planta y su referencia numérica congelada, las cinco
> subvistas del detalle de máquina, el catálogo de tags, la distribución de la
> maqueta de las diez máquinas, el simulador `fakeTransport` y las propuestas de
> `src/prototypes/`. Se fue con el código que ejercitaba. Lo que sobrevivió, y
> las dos pruebas que hubo que reescribir para ello —`valores` y
> `pollingEngine`—, es lo que nunca supo de máquinas.

## Cómo se ejecuta

```bash
npm test                  # toda la suite, una vez
npm run test:watch        # en observación
npx vitest run src/test/lib     # solo una rama del árbol
```

## Dos convenciones

**El entorno se pide por archivo, no por configuración.** El defecto es
`node`, que es rápido y basta para dominio, motor y simulador. Los archivos
que necesitan DOM lo declaran en su primera línea:

```js
// @vitest-environment jsdom
```

Se ve al abrir el archivo, en vez de estar escondido en un glob de
`vite.config.js`.

**Alias para cruzar, relativo dentro de `test/`.** Una prueba importa su
sujeto igual que lo haría la aplicación (`@/Demo-EVA/data/hooks.js`, o
`@shared/eva/tanque/senales.js` para lo que vive en `shared/`), así que la ruta
no cambia si la prueba se mueve.

Que el sujeto esté en `shared/` no saca la prueba de aquí: la suite entera
vive en `src/test/` y su árbol espeja el de la aplicación, no el del
repositorio.
