/**
 * Ejecuta tareas asíncronas con un tope de cuántas corren a la vez.
 *
 * ── PARA QUÉ (Plan 15 Fase 3) ───────────────────────────────────────
 *
 * `leerSerieEnRango()` (`backend/ia/herramientas.mjs`) y la lectura por
 * tramos de `Demo-EVA/data/historia.js` lanzaban TODO el rango a la vez con
 * `Promise.all`: un trimestre a un día por tramo son 90 peticiones
 * simultáneas contra el historiador de la planta, y con la Fase 1 del Plan
 * 15 (`readHistory` siguiendo `X-ICO-CONTINUATION`) cada una de esas puede
 * ser hasta 20 peticiones HTTP encadenadas por debajo. Sin un tope, ampliar
 * cuánto se puede leer (Fase 4) sería multiplicar la carga contra el
 * servidor de producción, no sólo la profundidad de la consulta.
 *
 * ── POR QUÉ TANDAS Y NO UNA COLA CON PROMESAS ──────────────────────
 *
 * Es el mismo patrón que ya usa `leerTodo()` en
 * `react-dashboard/src/lib/iconics/pollingEngine.js` (`maxConcurrent`,
 * troceado en tandas de `Promise.all`): tandas de tamaño fijo son más
 * simples de leer y de probar que una cola que reemplaza huecos según van
 * terminando promesas individuales, y con listas de la longitud que maneja
 * este proyecto (decenas de tramos, no miles) no pierden nada en THROUGHPUT
 * — la tanda siguiente no puede empezar antes de que la anterior complete de
 * todos modos, porque las páginas HTTP por debajo no lo consentirían mejor.
 *
 * Vive en `shared/` porque los DOS consumidores la necesitan igual: el
 * backend (`herramientas.mjs`) y el frontend (`Demo-EVA/data/historia.js`).
 * JavaScript puro, sin `fetch` ni nada del entorno — ver `shared/README.md`.
 *
 * @template T
 * @param {(() => Promise<T>)[]} tareas Funciones que devuelven una promesa cada una — no promesas ya en marcha, para que la tanda siguiente no arranque antes de tiempo.
 * @param {number} maxConcurrent Cuántas tareas corren a la vez. Debe ser >= 1.
 * @returns {Promise<T[]>} Los resultados, en el mismo orden que `tareas`.
 */
export async function conConcurrenciaAcotada(tareas, maxConcurrent) {
  const tope = Math.max(1, maxConcurrent);
  const resultados = new Array(tareas.length);

  for (let i = 0; i < tareas.length; i += tope) {
    const tanda = tareas.slice(i, i + tope);
    const tandaResultados = await Promise.all(tanda.map((tarea) => tarea()));
    tandaResultados.forEach((r, j) => { resultados[i + j] = r; });
  }

  return resultados;
}
