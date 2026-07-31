/**
 * planta.live.test.js
 * ------------------------------------------------------------------
 * Fase 8.3 del Plan 1 · ESCENARIOS CONTRA EL SERVIDOR REAL.
 *
 * El resto de la suite prueba con máquinas construidas a mano. Este
 * archivo hace lo contrario: recorre el camino entero —transporte real,
 * `createIconicsSource`, rollup de planta— contra el servidor que haya
 * al otro lado, y comprueba las propiedades que NO deben romperse
 * cualquiera que sea el estado de la planta.
 *
 * ── POR QUÉ NO CORRE POR DEFECTO ───────────────────────────────────
 *
 * Depende de que el backend puente esté levantado, así que se salta salvo
 * que se pida a propósito:
 *
 *     LIVE=1 npx vitest run src/test/live/planta.live.test.js
 *
 * Una prueba que necesita red no puede formar parte de la suite normal:
 * fallaría en cualquier máquina sin servidor y la gente aprendería a
 * ignorar los fallos, que es peor que no tenerla.
 *
 * ── QUÉ FIJA ───────────────────────────────────────────────────────
 *
 * Lo que se verificó a mano el 2026-07-30 y conviene no volver a
 * verificar a mano: con 9 de las 10 máquinas en mala calidad, la planta
 * NO debe inventar ceros por ningún camino. Es el riesgo que motivó toda
 * la regla de calidad, y es el estado real del servidor hoy.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { createIconicsSource } from "@/lib/datasource/iconicsSource.js";
import { createRealTransport } from "@/lib/iconics/transport.js";
import { hasValue } from "@/lib/domain/index.js";
import { buildPlantSummary, productionByMachine, summaryByArea } from "@/features/dashboard/lib/plantModel.js";

const ESPERA_MS = 20000;

/**
 * Espera a una instantánea con FACTORES, no con "algo".
 *
 * `receivedAt` se marca en cuanto llega cualquier lectura, y la primera en
 * llegar suele ser `Modelo`, del motor estático. Resolver ahí daba una
 * planta entera en blanco y un informe que decía «10 sin dato» con el
 * servidor entregando datos: la prueba se estaba midiendo a sí misma.
 */
function primeraLectura(source, ms = ESPERA_MS) {
  const tieneFactores = (s) =>
    s.machines.some((m) => hasValue(m.oee) || hasValue(m.disponibilidad) || hasValue(m.aprobadas));

  return new Promise((resolve, reject) => {
    let ultima = null;
    const baja = source.subscribePlant((s) => {
      ultima = s;
      if (tieneFactores(s) || s.error) {
        baja();
        resolve(s);
      }
    });
    setTimeout(() => {
      baja();
      ultima ? resolve(ultima) : reject(new Error("sin instantánea"));
    }, ms);
  });
}

describe.skipIf(!process.env.LIVE)("planta real · Fase 8.3", () => {
  let snapshot;
  let resumen;

  // La lectura se hace UNA vez para todo el archivo: cada `subscribePlant`
  // levanta un motor de polling, y abrir uno por prueba multiplicaría por
  // seis el tráfico que la Fase 8.2 está midiendo.
  beforeAll(async () => {
    const source = createIconicsSource({ transport: createRealTransport() });
    snapshot = await primeraLectura(source);
    source.stop();
    resumen = buildPlantSummary(snapshot.machines);
  }, ESPERA_MS + 5000);

  it("responde y entrega las 10 máquinas del catálogo", () => {
    expect(snapshot.error).toBeNull();
    expect(snapshot.machines).toHaveLength(10);

    // Deja constancia en la salida: es el informe de la fase.
    const linea = (m) =>
      `  ${m.id.padEnd(7)} ${String(m.estado).padEnd(9)} oee=${String(m.oee ?? "—").padEnd(9)} disp=${String(m.disponibilidad ?? "—").padEnd(9)} pz=${m.aprobadas ?? "—"}/${m.rechazadas ?? "—"}`;
    console.log("\n=== máquinas ===\n" + snapshot.machines.map(linea).join("\n"));
    console.log(
      `\n=== planta ===\n  OEE ${resumen.oee ?? "—"} · disp ${resumen.disponibilidad ?? "—"} · ` +
        `piezas ${resumen.producidas ?? "—"} · sin dato ${resumen.sinDato}/${resumen.totalMaquinas}`
    );
  });

  it("una máquina sin lectura tiene TODO en null, nunca en cero", () => {
    for (const m of snapshot.machines) {
      const medida = hasValue(m.oee) || hasValue(m.disponibilidad) || hasValue(m.aprobadas);
      if (medida) continue;

      // Sin medición no puede haber ni un número: un 0 aquí sube al rollup
      // y hunde la media de la planta sin que nadie lo note.
      for (const campo of ["oee", "disponibilidad", "rendimiento", "calidad", "aprobadas", "rechazadas", "tMuerto"]) {
        expect(m[campo], `${m.id}.${campo}`).toBeNull();
      }
      expect(m.estado).toBe("unknown");
    }
  });

  it("el resumen de planta refleja SOLO lo medido", () => {
    const medidas = snapshot.machines.filter((m) => hasValue(m.oee));

    // El OEE de planta no puede ser 0 porque nueve máquinas callen.
    if (medidas.length) {
      expect(resumen.oee).toBeGreaterThan(0);
      expect(resumen.sinDato).toBe(10 - snapshot.machines.filter((m) => m.estado !== "unknown").length);
    } else {
      expect(resumen.oee).toBeNull();
    }

    // Y las piezas son las de las máquinas que hablaron, no las de diez.
    const piezas = snapshot.machines.reduce(
      (a, m) => a + (m.aprobadas ?? 0) + (m.rechazadas ?? 0),
      0
    );
    expect(resumen.producidas ?? 0).toBe(piezas);
  });

  it("ningún agregado devuelve NaN ni Infinity", () => {
    const numeros = Object.entries(resumen).filter(([, v]) => typeof v === "number");
    for (const [clave, v] of numeros) {
      expect(Number.isFinite(v), `resumen.${clave} = ${v}`).toBe(true);
    }

    for (const area of summaryByArea(snapshot.machines)) {
      for (const [clave, v] of Object.entries(area)) {
        if (typeof v === "number") expect(Number.isFinite(v), `${area.areaId}.${clave} = ${v}`).toBe(true);
      }
    }
  });

  it("el reparto de producción no ordena máquinas fantasma por delante", () => {
    const reparto = productionByMachine(snapshot.machines);

    // Las que no midieron valen 0 y deben quedar AL FINAL, nunca empujando
    // a una máquina real fuera del top del gráfico.
    const conValor = reparto.filter((r) => r.valor > 0);
    expect(reparto.slice(0, conValor.length).every((r) => r.valor > 0)).toBe(true);
  });

  it("las rectificadoras no piden el tag que no tienen (T_Ciclo_Calc)", () => {
    for (const m of snapshot.machines.filter((x) => x.areaId === "REC")) {
      // `tagsForArea` lo excluye del área REC: si apareciera un valor, el
      // catálogo y el servidor habrían dejado de coincidir.
      expect(m.tCicloCalc).toBeNull();
    }
  });
});
