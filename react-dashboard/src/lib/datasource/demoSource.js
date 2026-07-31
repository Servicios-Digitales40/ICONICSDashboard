/**
 * lib/datasource/demoSource.js
 * ------------------------------------------------------------------
 * Fuente de datos SIN SERVIDOR. Alimenta el modo demo del botón del
 * Topbar y sirve además como banco de pruebas de toda la UI.
 *
 * ── SE CONSTRUYE ANTES QUE LA FUENTE REAL, A PROPÓSITO ─────────────
 *
 * Si esta fuente existe desde el principio, toda la arquitectura nueva y
 * toda la UI se construyen y validan sobre ella, y conectar ICONICS al
 * final es un paso pequeño. Al revés sería un salto al vacío.
 *
 * ── QUÉ CONSERVA Y QUÉ TRADUCE ─────────────────────────────────────
 *
 * Los NÚMEROS son exactamente los de `lib/machines.js`, que no se toca:
 * los 11 prototipos siguen importando de ahí y no deben romperse
 * (riesgo R-03). La prueba `demoSource.test.js` verifica contra la
 * referencia congelada que los agregados no se han movido.
 *
 * Lo que sí se traduce es el VOCABULARIO, porque cambió por diseño:
 *
 *   area1 (7 máquinas)  →  LIN 1..7      "Lineal n"
 *   area2 (3 máquinas)  →  REC 10,11,13  "Multi n"
 *
 * Y los estados en español pasan al vocabulario de ICONICS. No se
 * "traducen" uno a uno porque no hay equivalencia: se REASIGNAN a los
 * cinco estados que el servidor sí emite, conservando la variedad visual
 * que una demo necesita. Mostrar "Limpieza" en la demo cuando el
 * servidor nunca enviará ese estado sería enseñar una pantalla que no
 * existe.
 */
import { createMachine, calcOEE } from "../domain/index.js";
import { AREAS, listMachines } from "../iconics/tagCatalog.js";
import {
  MACHINES,
  getMachineHistory,
  getMachineHistoryForDate,
  getMachineSnapshot,
} from "../machines.js";
import { PARO_PLANIFICADO_S, TURNO_S } from "../shiftModel.js";

/**
 * Estado canónico de cada máquina de la demo.
 *
 * Se elige a mano para que la demo enseñe los cinco estados reales de un
 * vistazo: si todas salieran "Operando" no se podría revisar el diseño
 * de los demás.
 */
const ESTADO_DEMO = {
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

/** Código de ICONICS a partir de la clave canónica, para pasar por el normalizador real. */
const CODIGO = { standby: 0, running: 1, setup: 2, commfail: 3, alarma: 4 };

/**
 * Empareja cada máquina mock con su equivalente en el modelo real.
 * El orden importa: `MACHINES.area1[0]` es la Lineal 1 y
 * `AREAS.LIN.machineIds[0]` es la "1". Se recorren en paralelo.
 */
function emparejar() {
  const mockPorArea = { LIN: MACHINES.area1 ?? [], REC: MACHINES.area2 ?? [] };

  return listMachines().map((real, i) => {
    const indiceEnArea = AREAS[real.areaId].machineIds.indexOf(real.machineId);
    const mock = mockPorArea[real.areaId][indiceEnArea];
    return { real, mock, i };
  });
}

/**
 * Traduce una máquina mock a la forma `Machine` del dominio.
 *
 * `deriva` desplaza ligeramente los factores para que la demo se vea
 * viva al refrescar. Con 0 devuelve los valores mock exactos, que es lo
 * que compara la prueba contra la referencia congelada.
 */
function aDominio({ real, mock }, deriva = 0) {
  if (!mock) return createMachine({ ...real, readings: {} });

  const mover = (v) => Math.max(0, Math.min(100, v + deriva));

  const disponibilidad = mover(mock.disponibilidad);
  const rendimiento = mover(mock.rendimiento);
  const calidad = mover(mock.calidad);

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

      estado: CODIGO[ESTADO_DEMO[real.id] ?? "running"],
      // El `Modelo` real es una cadena que viene del PLC ("Modelo 00"),
      // no el entero `noParte` del mock. Se imita el formato del PLC.
      modelo: `Modelo ${String(mock.noParte ?? 0).padStart(2, "0")}`,

      // El mock guarda `tiempoMuerto` en minutos; el dominio trabaja en
      // segundos, como ICONICS.
      tMuerto: (mock.tiempoMuerto ?? 0) * 60,

      // En modo demo NO hay `T_Disp_pot` ni `T_Inac_plan` del servidor,
      // así que se sirven las constantes de turno de `shiftModel`. Es la
      // degradación prevista en el Plan 1 §5.2: 8 h de turno con 1 h de
      // paro previsto, en lugar de las 24 h que calcula ICONICS.
      tDispPot: TURNO_S,
      tInacPlan: PARO_PLANIFICADO_S,
    },
  });
}

/** Instantánea exacta, sin deriva. La usan las pruebas y el primer render. */
export function snapshotDemo() {
  return emparejar().map((par) => aDominio(par, 0));
}

/**
 * Crea la fuente demo.
 *
 * `intervalMs` solo controla el latido visual: no hay red que saturar,
 * pero un dashboard completamente inmóvil no permite revisar animaciones
 * ni transiciones de valor.
 */
export function createDemoSource({ intervalMs = 5000 } = {}) {
  const suscriptores = new Set();
  let timer = null;
  let tick = 0;

  const instantanea = () => {
    // Onda suave y determinista: la misma máquina no salta entre renders.
    // const deriva = Math.sin(tick / 3) * 2.5;
    const deriva = 0
    return {
      machines: emparejar().map((par) => aDominio(par, tick === 0 ? 0 : deriva)),
      loading: false,
      error: null,
      lastUpdated: new Date(),
    };
  };

  const emitir = () => {
    const s = instantanea();
    suscriptores.forEach((cb) => cb(s));
  };

  const arrancar = () => {
    if (timer) return;
    timer = setInterval(() => {
      tick += 1;
      emitir();
    }, intervalMs);
  };

  const parar = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  function suscribir(cb, filtro) {
    const envuelto = (s) => cb(filtro ? { ...s, machines: s.machines.filter(filtro) } : s);
    suscriptores.add(envuelto);
    envuelto(instantanea());
    arrancar();

    return () => {
      suscriptores.delete(envuelto);
      if (suscriptores.size === 0) parar();
    };
  }

  return {
    subscribePlant: (cb) => suscribir(cb, null),
    subscribeMachine: (id, cb) => suscribir(cb, (m) => m.id === id),

    /**
     * Historia simulada. Reutiliza el generador determinista de
     * `machines.js`, que ancla su último punto al valor actual para que
     * la gráfica y el gauge cuenten lo mismo.
     */
    async readHistory(id, { points = 12 } = {}) {
      const m = snapshotDemo().find((x) => x.id === id);
      return m ? getMachineHistory(m, points) : [];
    },

    /**
     * Un día simulado, con la misma forma que entrega el historiador real:
     * serie horaria + resumen. Es determinista por (máquina, fecha), así
     * que la demo del comparativo enseña siempre la misma comparación.
     */
    async readDay(id, iso, { points = 12 } = {}) {
      const m = snapshotDemo().find((x) => x.id === id);
      if (!m || !iso) return { serie: [], resumen: null };

      const foto = getMachineSnapshot(m, iso);
      return {
        serie: getMachineHistoryForDate(m, iso, points),
        resumen: {
          disponibilidad: foto.disponibilidad,
          rendimiento: foto.rendimiento,
          calidad: foto.calidad,
          oee: foto.oee,
          aprobadas: foto.aprobadas,
          rechazadas: foto.rechazadas,
          producidas: foto.aprobadas + foto.rechazadas,
          // El mock lleva minutos; el dominio —y por tanto la vista— habla
          // en segundos, como ICONICS.
          tMuerto: foto.tiempoMuerto * 60,
          muestras: points,
        },
      };
    },

    /** OEE día a día para el calendario, con el mismo generador. */
    async readDailyOee(id, { desde, hasta }) {
      const m = snapshotDemo().find((x) => x.id === id);
      if (!m || !desde || !hasta) return [];

      const salida = [];
      const fin = new Date(`${hasta}T00:00:00`);
      for (let d = new Date(`${desde}T00:00:00`); d <= fin; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        salida.push({ iso, oee: getMachineSnapshot(m, iso).oee });
      }
      return salida;
    },

    stop: parar,
  };
}
