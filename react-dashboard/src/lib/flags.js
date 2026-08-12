/**
 * Banderas de compilación que deciden QUÉ SUPERFICIE tiene la aplicación.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Antes vivían en `lib/datasource/`, y una sola —`VITE_ENABLE_DEMO`— hacía dos
 * trabajos sin relación: gateaba el interruptor de origen de datos Y las rutas
 * experimentales. No se podían tener las propuestas de diseño sin ofrecer
 * además datos falsos, ni al revés.
 *
 * Una bandera que gobierna el registro de RUTAS no tiene nada que hacer
 * exportada desde el módulo de DATOS: esa exportación era la conflación misma.
 * Aquí queda separada, y `lib/datasource/` sólo gatea lo suyo.
 *
 * ── LA FORMA DE LA EXPRESIÓN NO ES NEGOCIABLE ──────────────────────
 *
 * Se escribe `import.meta.env.VITE_ENABLE_PROTOTYPES === "true"`, **sin
 * encadenamiento opcional**. El empaquetador sustituye ese acceso por un
 * literal y puede plegar la comparación a `false`, y de ese plegado depende que
 * las 13 rutas de prototipo —que se cargan con `import()` dinámico— **no
 * lleguen a generar sus trozos** en el build de planta.
 *
 * Con `?.` la expresión sobrevive a la compilación, la rama deja de ser
 * demostrablemente muerta y los `import()` se emiten igual. Se vio en el
 * `dist`: `SandboxPage-*.js`, `DashboardV2-*.js`, `variants-*.js`… en un build
 * que no tenía ninguna de esas rutas registradas.
 *
 * Es la diferencia entre «no se puede abrir» y «no está»; para la superficie de
 * un tablero de planta, la segunda. Lo comprueba `routes.test.jsx` por el lado
 * observable, y el `dist` por el otro.
 */

/**
 * ¿Se compiló esta app con las vistas experimentales?
 *
 * Gatea las 12 propuestas de diseño de `src/prototypes/` y la vista
 * «Máquina 3D», que enseña estados que ICONICS no emite. Nada de eso debe
 * existir en un tablero de planta — no «estar oculto»: no existir.
 */
export const PROTOTIPOS_HABILITADOS = import.meta.env.VITE_ENABLE_PROTOTYPES === "true";
