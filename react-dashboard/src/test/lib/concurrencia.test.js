/**
 * concurrencia.test.js
 * ------------------------------------------------------------------
 * `conConcurrenciaAcotada` (Plan 15 Fase 3): el tope de tramos simultáneos
 * que comparten `backend/ia/conversacion/herramientas.mjs` (`leerSerieEnRango`) y
 * `Demo-EVA/data/historia.js` (lectura por tramos de `leerSerie`).
 *
 * Antes de esta función, un rango largo lanzaba TODOS sus tramos a la vez
 * con `Promise.all` — un trimestre son ~90 peticiones simultáneas contra el
 * historiador de la planta. Lo que se fija aquí es que el pico de tareas EN
 * VUELO a la vez nunca supera el tope pedido, y que el orden de los
 * resultados se conserva aunque las tareas terminen en un orden distinto al
 * que empezaron.
 */
import { describe, expect, it } from "vitest";
import { conConcurrenciaAcotada } from "@shared/concurrencia.js";

/** Una tarea que se resuelve tras `ms`, contando cuántas están en vuelo a la vez. */
function tareaInstrumentada(valor, ms, contador) {
  return async () => {
    contador.enVuelo += 1;
    contador.pico = Math.max(contador.pico, contador.enVuelo);
    await new Promise((resolve) => setTimeout(resolve, ms));
    contador.enVuelo -= 1;
    return valor;
  };
}

describe("conConcurrenciaAcotada", () => {
  it("nunca supera el tope de tareas en vuelo a la vez", async () => {
    const contador = { enVuelo: 0, pico: 0 };
    const tareas = Array.from({ length: 20 }, (_, i) => tareaInstrumentada(i, 5, contador));

    await conConcurrenciaAcotada(tareas, 4);

    expect(contador.pico).toBeLessThanOrEqual(4);
    expect(contador.pico).toBeGreaterThan(1); // si es 1, la prueba no mide concurrencia de verdad
  });

  it("conserva el orden de los resultados, aunque las tareas tarden distinto", async () => {
    const contador = { enVuelo: 0, pico: 0 };
    // La primera tarea de cada tanda tarda más que las siguientes: si el
    // orden dependiera de quién termina antes, esto lo delataría.
    const tareas = [
      tareaInstrumentada("a", 20, contador),
      tareaInstrumentada("b", 1, contador),
      tareaInstrumentada("c", 1, contador),
      tareaInstrumentada("d", 20, contador),
      tareaInstrumentada("e", 1, contador),
    ];

    const resultados = await conConcurrenciaAcotada(tareas, 3);

    expect(resultados).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("una tarea que rechaza no impide que conConcurrenciaAcotada se entere (propaga el rechazo)", async () => {
    const tareas = [
      async () => "ok-1",
      async () => { throw new Error("falla la tarea 2"); },
      async () => "ok-3",
    ];

    await expect(conConcurrenciaAcotada(tareas, 2)).rejects.toThrow("falla la tarea 2");
  });

  it("con maxConcurrent >= longitud de la lista, se comporta como Promise.all", async () => {
    const tareas = [async () => 1, async () => 2, async () => 3];
    const resultados = await conConcurrenciaAcotada(tareas, 10);
    expect(resultados).toEqual([1, 2, 3]);
  });

  it("una lista vacía no falla y no llama a nada", async () => {
    const resultados = await conConcurrenciaAcotada([], 4);
    expect(resultados).toEqual([]);
  });

  it("maxConcurrent menor que 1 se trata como 1, no como 0 (evita un bucle sin avanzar)", async () => {
    const contador = { enVuelo: 0, pico: 0 };
    const tareas = [tareaInstrumentada(1, 1, contador), tareaInstrumentada(2, 1, contador)];

    const resultados = await conConcurrenciaAcotada(tareas, 0);

    expect(resultados).toEqual([1, 2]);
    expect(contador.pico).toBe(1);
  });
});
