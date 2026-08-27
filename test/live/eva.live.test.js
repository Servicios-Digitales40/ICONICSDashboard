/**
 * eva.live.test.js
 * ------------------------------------------------------------------
 * Fase 8 del Plan 8 · DEMO EVA CONTRA EL SERVIDOR REAL.
 *
 * El resto de la suite prueba con lecturas construidas a mano. Este archivo
 * hace lo contrario: recorre el camino entero —transporte real,
 * `createEvaSource`, `createSistema`— contra el servidor que haya al otro lado,
 * y comprueba las propiedades que NO deben romperse esté como esté la
 * instalación.
 *
 * ── POR QUÉ NO CORRE POR DEFECTO ───────────────────────────────────
 *
 * Depende de que el backend puente esté levantado, así que se salta salvo que
 * se pida a propósito:
 *
 *     LIVE=1 npx vitest run src/test/live/eva.live.test.js
 *
 * Una prueba que necesita red no puede formar parte de la suite normal:
 * fallaría en cualquier máquina sin servidor y la gente aprendería a ignorar
 * los fallos, que es peor que no tenerla.
 *
 * ── QUÉ FIJA, Y POR QUÉ ESTO Y NO OTRA COSA ────────────────────────
 *
 * Dos cosas que se verificaron a mano el 17-ago-2026 y que conviene no tener
 * que volver a verificar a mano:
 *
 *  1. **Las ocho señales existen y se leen.** Un tag renombrado en el servidor
 *     no rompe nada: la señal se queda en «sin dato» y la pantalla sigue
 *     pintando. Es el modo de fallo silencioso que esta prueba convierte en
 *     ruidoso.
 *
 *  2. **El historiador sigue mintiendo en tres señales.** Es el hallazgo que
 *     condiciona el módulo entero, y su comprobación tiene doble filo: si
 *     alguien marca esos tags «Is Collected» en el Data Historian, esta prueba
 *     falla y recuerda que hay tres sparklines esperando en `senales.js`.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { createRealTransport } from "@/lib/iconics/transport.js";
import { createEvaSource } from "@/Demo-EVA/data/evaSource.js";
import { SENAL_KEYS, esHistorizada, historizadas, pointName } from "@/Demo-EVA/domain/senales.js";
import { leerSerie } from "@/Demo-EVA/data/historia.js";

const ESPERA_MS = 20000;
const vivo = process.env.LIVE === "1";

/** Espera a una instantánea con al menos una lectura utilizable. */
function esperarSistema(source) {
  return new Promise((resolver, rechazar) => {
    const corte = setTimeout(() => {
      baja();
      rechazar(new Error("El servidor no entregó ninguna señal en el tiempo previsto."));
    }, ESPERA_MS - 2000);

    const baja = source.subscribeSistema((snapshot) => {
      if (snapshot.sistema.resumen.medidas > 0) {
        clearTimeout(corte);
        baja();
        resolver(snapshot);
      }
    });
  });
}

describe.skipIf(!vivo)("Demo EVA contra el servidor real", () => {
  let snapshot;
  let source;

  beforeAll(async () => {
    source = createEvaSource({ transport: createRealTransport() });
    snapshot = await esperarSistema(source);
    source.stop();
  }, ESPERA_MS);

  it("las ocho señales del catálogo existen en el servidor", () => {
    // Un tag renombrado se vería como «sin dato», que es indistinguible de un
    // sensor averiado. Aquí se separa una cosa de la otra.
    const sinLeer = SENAL_KEYS.filter((k) => snapshot.sistema.senales[k].valor === null);

    expect(
      sinLeer,
      `sin lectura: ${sinLeer.map((k) => pointName(k)).join(", ")}`
    ).toEqual([]);
  });

  it("ninguna señal inventa un cero donde no hubo medición", () => {
    for (const s of snapshot.sistema.lista) {
      if (s.estado === "sin_dato") expect(s.valor, s.key).toBeNull();
      if (s.valor === null) expect(s.estado, s.key).toBe("sin_dato");
    }
  });

  it("el estado del sistema es uno de los cinco derivados, nunca undefined", () => {
    expect(["critico", "atencion", "sin_dato", "reposo", "nominal"]).toContain(
      snapshot.sistema.estado
    );
    for (const a of snapshot.sistema.activos) {
      expect(a.senales.length, a.id).toBeGreaterThan(0);
    }
  });

  it("las cuatro señales historizadas devuelven SU serie, no la de otra", () => {
    // Esta es la comprobación que da sentido al campo `historizado`: se compara
    // el último punto del historiador contra el valor vivo. Si el servidor
    // empezara a devolver la serie equivocada para una de éstas, aquí se ve.
    return Promise.all(
      historizadas().map(async (clave) => {
        const { datos } = await leerSerie(clave, { horas: 2, puntos: 8 });
        if (!datos.length) return; // el historiador puede no tener esa ventana

        const vivoAhora = snapshot.sistema.senales[clave].valor;
        const ultimo = datos.at(-1).valor;
        const escala = Math.max(1, Math.abs(vivoAhora));

        expect(
          Math.abs(ultimo - vivoAhora) / escala,
          `${clave}: histórico ${ultimo} vs vivo ${vivoAhora}`
        ).toBeLessThan(0.5);
      })
    );
  });

  it("las señales sin serie propia siguen sin tenerla", () => {
    // Doble filo a propósito: el día que alguien las marque «Is Collected» en
    // el Data Historian, esta prueba falla y recuerda que hay sparklines
    // esperando a que se ponga `historizado: true` en `domain/senales.js`.
    // Así salió `tensionLinea` de esta lista.
    for (const clave of ["cargaMotor", "eficienciaEnergetica"]) {
      expect(esHistorizada(clave), clave).toBe(false);
    }

    return Promise.all(
      ["cargaMotor", "eficienciaEnergetica", "tensionLinea"].map(async (clave) => {
        const { datos, motivo } = await leerSerie(clave, { horas: 2, puntos: 8 });
        // La guarda del catálogo corta ANTES de salir a la red.
        expect(datos, clave).toEqual([]);
        expect(motivo, clave).toBeTruthy();
      })
    );
  });

  it("un ciclo lee los ocho puntos en una sola petición", () => {
    const stats = source.stats();
    expect(stats.puntos).toBe(SENAL_KEYS.length);
    // Ocho puntos entran de sobra en un lote: si esto crece, es que alguien
    // registró puntos por su cuenta en vez de pasar por el catálogo.
    expect(stats.peticiones).toBeLessThanOrEqual(4);
  });
});
