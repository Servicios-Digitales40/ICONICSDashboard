# `src/test/` — la suite completa

Todas las pruebas viven aquí, fuera del código que ejercitan.

Antes estaban junto a su sujeto (`plantModel.js` y `plantModel.test.js` en
la misma carpeta). Funcionaba, pero al crecer el árbol de `features/` la
suite dejó de ser visible: no había forma de responder «qué está
cubierto» sin recorrer diez directorios, y las pruebas de render
quedaban enterradas entre componentes. Con un solo árbol, la respuesta
está en un `ls`.

**El árbol de aquí ESPEJA el de `src/`.** Un archivo en
`test/lib/iconics/` prueba algo de `src/lib/iconics/`. Es la única regla
de colocación: si se añade una prueba, va en la ruta equivalente a la de
su sujeto.

## Qué prueba cada carpeta

### `lib/` — los cimientos, sin React

| Archivo | Qué fija |
|---|---|
| [lib/domain/machine.test.js](lib/domain/machine.test.js) | La frontera de saneamiento (R-07): `Infinity`/`NaN` del servidor no entran al modelo. |
| [lib/iconics/pollingEngine.test.js](lib/iconics/pollingEngine.test.js) | Ciclo de vida del motor y **presupuesto de red**: una petición por ciclo, no una por tag. |
| [lib/datasource/iconicsSource.test.js](lib/datasource/iconicsSource.test.js) | La fuente real pide lo justo y traduce bien. |
| [lib/iconics/tagCatalog.test.js](lib/iconics/tagCatalog.test.js) | El contrato con ICONICS: las 10 máquinas reales, el hueco de la rectificadora 12 y las dos sintaxis de nombre de punto. |
| [lib/iconics/caos.test.js](lib/iconics/caos.test.js) | Que `VITE_ICONICS_CHAOS=none` sea **de verdad** cero fallos —es lo que sustituye a los números fijos del modo demo— y que `soft` siga ejercitando los caminos de error. |
| [lib/datasource/origen.test.jsx](lib/datasource/origen.test.jsx) | Los dos orígenes (ICONICS / simulador), su señalización, que el interruptor quede cerrado sin `VITE_ENABLE_SIMULATOR`, y que una preferencia guardada se ignore sin la bandera. |

### `app/` — el armazón

| Archivo | Qué fija |
|---|---|
| [app/navegacion.test.jsx](app/navegacion.test.jsx) | La ruta vive en la URL: enlace profundo, recarga, botón «atrás» y ruta desconocida. |
| [app/routes.test.jsx](app/routes.test.jsx) | Qué vistas existen en cada build: planta lleva siete —incluida la sección 3D entera—, `VITE_ENABLE_PROTOTYPES` añade las doce propuestas. |

### `features/` — agregación y vistas de producción

| Archivo | Qué fija |
|---|---|
| [features/dashboard/plantModel.test.js](features/dashboard/plantModel.test.js) | El rollup ante **huecos**: `null` no revienta ni se convierte en 0. |
| [features/dashboard/plantModel.golden.test.js](features/dashboard/plantModel.golden.test.js) | Red de seguridad numérica (R-01) contra `fixtures/plantModel.golden.json`. |
| [features/dashboard/dashboardModel.integration.test.js](features/dashboard/dashboardModel.integration.test.js) | El camino completo de punta a punta: transporte → motor → source → rollup. |
| [features/dashboard/dashboardTiles.test.jsx](features/dashboard/dashboardTiles.test.jsx) | Los tiles RENDERIZADOS con el resumen de un servidor caído. |
| [features/machines/subviews.test.jsx](features/machines/subviews.test.jsx) | Las cinco subvistas del detalle, con máquinas agujereadas. |

### `features/three-d/` — el 3D

Todo lo que se prueba aquí es **puro o DOM**: la tabla de comportamiento, la
distribución de la maqueta y el camino de respaldo. No se intenta renderizar
`<Canvas>` en jsdom — no hay WebGL, y la prueba sólo mediría el mock.

| Archivo | Qué fija |
|---|---|
| [features/three-d/estadoVisual.test.js](features/three-d/estadoVisual.test.js) | El contrato estado → comportamiento 3D, y **la regla de movimiento de `lib/motion.js` como aserción exacta**: sólo dos bucles en toda la aplicación. Además, que ningún par de estados se distinga sólo por el color. |
| [features/three-d/layout.test.js](features/three-d/layout.test.js) | La maqueta contra el catálogo de ICONICS: las 10 máquinas, sin solapes y dentro del suelo. Su modo de fallo es silencioso — una máquina que falta en un plano no se echa de menos. |
| [features/three-d/frameloop.test.js](features/three-d/frameloop.test.js) | Cuándo la escena tiene derecho a repintar. Una planta parada deja la GPU a cero. |
| [features/three-d/sinWebgl.test.jsx](features/three-d/sinWebgl.test.jsx) | Sin WebGL —escritorio remoto, equipo sin GPU— la vista no revienta: enseña los mismos datos en una tabla. |

### `demo-eva/` — la demo de sistemas de agua

Sección con **dominio propio**: ni OEE, ni máquinas, ni tag de estado. Ver
[`src/Demo-EVA/README.md`](../Demo-EVA/README.md).

| Archivo | Qué fija |
|---|---|
| [demo-eva/dominio.test.js](demo-eva/dominio.test.js) | El saneamiento y la evaluación contra bandas: un booleano no es un cero y un hueco no es un límite roto. |
| [demo-eva/fuente.test.js](demo-eva/fuente.test.js) | El camino de datos con transporte de mentira, y **quién lee el pasado**: el `readSerie` del transporte si lo trae, el historiador si no. |
| [demo-eva/tres-d.test.js](demo-eva/tres-d.test.js) | El contrato estado → comportamiento y la distribución de la maqueta. |
| [demo-eva/simulador.test.js](demo-eva/simulador.test.js) | Que el simulador sea determinista en el reloj, **recorra los estados** en vez de quedarse en `nominal`, respete `historizado` y no se salga de la `escala` del catálogo. |
| [demo-eva/planta-simulada.test.jsx](demo-eva/planta-simulada.test.jsx) | La vista real sobre el provider real con el origen simulado y **`fetch` convertido en trampa**: se ven las ocho señales sin que nadie salga a la red. Es lo que ninguna prueba de unidad podía ver, porque cada pieza por separado estaba bien. |

### `prototypes/` — propuestas de diseño

Se prueban igual que producción a propósito: un prototipo anclado a datos
inventados enseña una verdad distinta a la de «Planta», que está a una
pestaña de distancia.

| Archivo | Qué fija |
|---|---|
| [prototypes/dashboard-v2/model.test.js](prototypes/dashboard-v2/model.test.js) | El modelo v2 sobre la fuente única, en sus dos extremos. |
| [prototypes/dashboard-v2/tiles.test.jsx](prototypes/dashboard-v2/tiles.test.jsx) | Los tiles v2 renderizados sin conexión. |

Estas pruebas corren **siempre**, aunque las propuestas sólo se compilen en el
build con `VITE_ENABLE_PROTOTYPES`: la suite ejercita el código fuente, no el bundle.

### `fixtures/` — datos y ayudantes compartidos

| Archivo | Para qué |
|---|---|
| [fixtures/golden.js](fixtures/golden.js) | Lee/escribe la referencia congelada. Solo lectura salvo `UPDATE_GOLDEN=1`. |
| [fixtures/machinesDemo.js](fixtures/machinesDemo.js) | Diez máquinas de dominio con estados repartidos a mano. Era `demoSource` en producción; el Plan 5 lo dejó donde siempre debió estar. |
| [fixtures/numericSnapshot.js](fixtures/numericSnapshot.js) | Reduce unas máquinas a su esqueleto numérico. Documenta qué se congela y qué **no**. |
| `fixtures/plantModel.golden.json` | La referencia. Generado — no se edita a mano. |

[setup.js](setup.js) rellena `ResizeObserver` y `matchMedia`, que jsdom no
trae y Recharts sí usa. Lo carga `vite.config.js` para toda la suite.

## Cómo se ejecuta

```bash
npm test                  # toda la suite, una vez
npm run test:watch        # en observación
npx vitest run src/test/lib     # solo una rama del árbol
UPDATE_GOLDEN=1 npm test  # regenera la referencia numérica (gesto deliberado)
```

## Dos convenciones

**El entorno se pide por archivo, no por configuración.** El defecto es
`node`, que es rápido y basta para dominio, motor y rollup. Los archivos
que necesitan DOM lo declaran en su primera línea:

```js
// @vitest-environment jsdom
```

Se ve al abrir el archivo, en vez de estar escondido en un glob de
`vite.config.js`.

**Alias para cruzar, relativo dentro de `test/`.** Una prueba importa su
sujeto igual que lo haría la aplicación (`@/lib/datasource/hooks.js`, o
`@shared/domain/machine.js` para lo que vive en `shared/`), así que la ruta
no cambia si la prueba se mueve. Solo los `fixtures/` se importan en
relativo, porque viven en este mismo módulo.

Que el sujeto esté en `shared/` no saca la prueba de aquí: la suite entera
vive en `src/test/` y su árbol espeja el de la aplicación, no el del
repositorio.
