/**
 * dashboardModel.integration.test.js
 * ------------------------------------------------------------------
 * El camino COMPLETO que ejecuta el Dashboard, de punta a punta:
 *
 *     transporte falso (con caos)
 *       → motor de polling (filtra calidad)
 *         → iconicsSource (normaliza a `Machine`)
 *           → plantModel (agrega)
 *
 * ── POR QUÉ HACÍA FALTA ────────────────────────────────────────────
 *
 * Las pruebas anteriores cubrían cada capa por separado y todas pasaban,
 * pero la aplicación no cargaba: `plantTrend` reventaba con un `null`.
 * El fallo vivía justo en la costura entre dos capas que nunca se
 * probaron juntas — el caos existía en el transporte y el saneamiento en
 * el dominio, pero nada ejecutaba el rollup con el resultado real.
 *
 * Esta prueba reproduce lo que hace `Dashboard.jsx` en su `useMemo`. Si
 * vuelve a romperse esa costura, falla aquí y no en el navegador.
 */
import { describe, expect, it } from "vitest";

import { CAOS_ALTO, createFakeTransport } from "@/lib/iconics/fakeTransport.js";
import { createIconicsSource } from "@/lib/datasource/iconicsSource.js";
import {
  buildPlantSummary,
  plantTrend,
  productionByMachine,
  productionTrend,
  summaryByArea,
} from "@/features/dashboard/lib/plantModel.js";

/** Exactamente lo que calcula el `useMemo` de Dashboard.jsx. */
const modeloDelDashboard = (machines) => ({
  resumen: buildPlantSummary(machines),
  reparto: productionByMachine(machines),
  tendencia: plantTrend(machines),
  produccion: productionTrend(machines),
  areas: summaryByArea(machines),
});

/** Suscribe, deja correr N ciclos y devuelve la última instantánea. */
async function leerPlanta(chaos, ciclos) {
  const source = createIconicsSource({
    transport: createFakeTransport({ chaos, seed: `integracion-${ciclos}` }),
  });

  let ultima = null;
  const baja = source.subscribePlant((s) => { ultima = s; });
  await new Promise((r) => setTimeout(r, 300 + ciclos * 20));

  baja();
  source.stop();
  return ultima;
}

describe("Dashboard · el camino completo no revienta", () => {
  it("sobrevive al caos alto, que produce huecos y mala calidad", async () => {
    const { machines } = await leerPlanta({ ...CAOS_ALTO, latenciaMs: 0 }, 5);

    expect(machines).toHaveLength(10);
    // Es el fallo que llegó al navegador: un null llegando al .toFixed().
    expect(() => modeloDelDashboard(machines)).not.toThrow();
  });

  it("sobrevive al arranque en frío, sin ninguna lectura todavía", () => {
    // Primer render: el provider aún no ha recibido nada.
    expect(() => modeloDelDashboard([])).not.toThrow();

    const modelo = modeloDelDashboard([]);
    expect(modelo.tendencia).toEqual([]);
    expect(modelo.resumen.totalMaquinas).toBe(0);
    // NULL, no 0. La primera versión de esta prueba afirmaba
    // `Number.isFinite(oee) === true`, y ese finite incluía al 0 — con lo
    // que la propia prueba consagró el bug que debía impedir: un dashboard
    // que con el servidor caído mostraba «OEE 0.00 %» y «0 piezas», es
    // decir, una planta parada en vez de una planta sin leer.
    expect(modelo.resumen.oee).toBeNull();
    expect(modelo.resumen.producidas).toBeNull();

    modelo.produccion.forEach(() => {
      throw new Error("sin conteos no debe haber barras de producción");
    });
  });

  it("los agregados que se pintan son un número real o un hueco, jamás NaN", async () => {
    const { machines } = await leerPlanta({ ...CAOS_ALTO, latenciaMs: 0 }, 8);
    const { resumen, tendencia } = modeloDelDashboard(machines);

    // La forma correcta de la aserción original: cada agregado es o bien
    // una medición finita o bien `null` explícito. Lo único prohibido es
    // el término medio — NaN, Infinity o un 0 que no venga de los datos.
    const medicionOHueco = (v) => v === null || Number.isFinite(v);

    for (const clave of ["disponibilidad", "rendimiento", "calidad", "oee", "fty"]) {
      expect(medicionOHueco(resumen[clave]), `resumen.${clave} = ${resumen[clave]}`).toBe(true);
    }
    for (const punto of tendencia) {
      for (const clave of ["disponibilidad", "rendimiento", "calidad", "oee"]) {
        expect(medicionOHueco(punto[clave])).toBe(true);
      }
    }
  });
});
