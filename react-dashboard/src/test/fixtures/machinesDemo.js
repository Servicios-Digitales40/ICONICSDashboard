/**
 * fixtures/machinesDemo.js
 * ------------------------------------------------------------------
 * Diez máquinas de dominio con números plausibles y estados variados.
 * Ayudante de pruebas: no se empaqueta, sólo lo importan los `*.test.js`.
 *
 * ── DE DÓNDE SALE ──────────────────────────────────────────────────
 *
 * Es el antiguo `snapshotDemo()` de `lib/datasource/demoSource.js`, que el
 * Plan 5 retiró de producción junto con el modo demo. Como fuente de datos
 * sobraba —se saltaba el motor de polling y con él todo lo que puede fallar de
 * verdad—, pero como **fixture** sigue siendo útil: da un juego de máquinas
 * completo, determinista y con estados repartidos a mano, que es justo lo que
 * necesita una prueba de agregación o de render.
 *
 * Aquí es además donde debía estar: nunca fue código de aplicación, era un
 * conjunto de datos de ejemplo viviendo en `src/lib/`.
 *
 * ── QUÉ GARANTIZA ──────────────────────────────────────────────────
 *
 * Las 10 máquinas reales del catálogo, con la nomenclatura de ICONICS, sus
 * números tomados del mock heredado y **al menos una en `alarma` y una en
 * `commfail`**: sin eso, las pruebas de la franja de atención no tendrían nada
 * que mirar.
 */
import { calcOEE, createMachine } from "@/lib/domain/index.js";
import { AREAS, listMachines } from "@shared/tagCatalog.js";
import { MACHINES } from "@/lib/machines.js";
import { PARO_PLANIFICADO_S, TURNO_S } from "@/lib/shiftModel.js";

/**
 * Estado canónico de cada máquina. Se elige a mano para que se vean los cinco
 * estados del servidor de un vistazo, y para que siempre haya un caso crítico
 * y uno de fallo de comunicación.
 */
const ESTADO = {
  "LIN/1": "commfail",
  "LIN/2": "running",
  "LIN/3": "running",
  "LIN/4": "setup",
  "LIN/5": "alarma",
  "LIN/6": "standby",
  "LIN/7": "setup",
  "REC/10": "commfail",
  "REC/11": "running",
  "REC/13": "running",
};

/** Código de ICONICS por clave canónica, para pasar por el normalizador real. */
const CODIGO = { standby: 0, running: 1, setup: 2, commfail: 3, alarma: 4 };

/**
 * Empareja cada máquina mock con su equivalente en el modelo real.
 * El orden importa: `MACHINES.area1[0]` es la Lineal 1 y
 * `AREAS.LIN.machineIds[0]` es la "1". Se recorren en paralelo.
 */
function emparejar() {
  const mockPorArea = { LIN: MACHINES.area1 ?? [], REC: MACHINES.area2 ?? [] };

  return listMachines().map((real) => {
    const indiceEnArea = AREAS[real.areaId].machineIds.indexOf(real.machineId);
    return { real, mock: mockPorArea[real.areaId][indiceEnArea] };
  });
}

/** Traduce una máquina mock a la forma `Machine` del dominio. */
function aDominio({ real, mock }) {
  if (!mock) return createMachine({ ...real, readings: {} });

  const { disponibilidad, rendimiento, calidad } = mock;

  return createMachine({
    ...real,
    receivedAt: new Date(),
    readings: {
      disponibilidad,
      rendimiento,
      calidad,
      oee: calcOEE({ disponibilidad, rendimiento, calidad }),

      aprobadas: mock.aprobadas,
      rechazadas: mock.rechazadas,
      producidas: mock.aprobadas + mock.rechazadas,

      estado: CODIGO[ESTADO[real.id] ?? "running"],
      // El `Modelo` real es una cadena del PLC ("Modelo 00"), no el entero
      // `noParte` del mock, así que se imita el formato.
      modelo: `Modelo ${String(mock.noParte ?? 0).padStart(2, "0")}`,

      // El mock guarda `tiempoMuerto` en minutos; el dominio trabaja en
      // segundos, como ICONICS.
      tMuerto: (mock.tiempoMuerto ?? 0) * 60,

      // Constantes de turno: 8 h con 1 h de paro previsto.
      tDispPot: TURNO_S,
      tInacPlan: PARO_PLANIFICADO_S,
    },
  });
}

/** Las 10 máquinas, en el orden del catálogo. Determinista. */
export function machinesDemo() {
  return emparejar().map(aDominio);
}
