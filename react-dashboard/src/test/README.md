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
| [lib/datasource/demoSource.test.js](lib/datasource/demoSource.test.js) | La arquitectura nueva no mueve ni un número respecto a la referencia congelada. |
| [lib/datasource/origen.test.jsx](lib/datasource/origen.test.jsx) | Los tres orígenes (ICONICS / simulador / demo), su señalización, y que el modo demo quede cerrado sin `VITE_ENABLE_DEMO`. |

### `app/` — el armazón

| Archivo | Qué fija |
|---|---|
| [app/navegacion.test.jsx](app/navegacion.test.jsx) | La ruta vive en la URL: enlace profundo, recarga, botón «atrás» y ruta desconocida. |
| [app/routes.test.jsx](app/routes.test.jsx) | Qué vistas existe en cada build: planta lleva cinco, demo añade las doce propuestas. |

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

### `prototypes/` — propuestas de diseño

Se prueban igual que producción a propósito: un prototipo anclado a datos
inventados enseña una verdad distinta a la de «Planta», que está a una
pestaña de distancia.

| Archivo | Qué fija |
|---|---|
| [prototypes/dashboard-v2/model.test.js](prototypes/dashboard-v2/model.test.js) | El modelo v2 sobre la fuente única, en sus dos extremos. |
| [prototypes/dashboard-v2/tiles.test.jsx](prototypes/dashboard-v2/tiles.test.jsx) | Los tiles v2 renderizados sin conexión. |

Estas pruebas corren **siempre**, aunque las propuestas sólo se compilen en el
build de demo: la suite ejercita el código fuente, no el bundle.

### `fixtures/` — datos y ayudantes compartidos

| Archivo | Para qué |
|---|---|
| [fixtures/golden.js](fixtures/golden.js) | Lee/escribe la referencia congelada. Solo lectura salvo `UPDATE_GOLDEN=1`. |
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

**Alias `@` para cruzar, relativo dentro de `test/`.** Una prueba importa
su sujeto igual que lo haría la aplicación (`@/lib/domain/machine.js`),
así que la ruta no cambia si la prueba se mueve. Solo los `fixtures/` se
importan en relativo, porque viven en este mismo módulo.
