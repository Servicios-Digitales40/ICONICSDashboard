/**
 * Fuente de datos real. Traduce entre el mundo de ICONICS (puntos con nombre
 * y calidad) y el del dominio (`Machine`).
 *
 * Es delgada a propósito: no agenda (eso es del motor) ni sanea números (eso
 * es del dominio), solo empareja unos con otros.
 *
 * Usa tres motores con cadencias distintas, porque un único intervalo
 * obligaría a elegir entre gastar de más o refrescar de menos:
 *
 *  - resumen  · 15 s  · vistas de planta y de área
 *  - detalle  · 5 s   · solo la máquina abierta, con todos sus tags
 *  - estático · 5 min · Modelo, T_Disp_pot, T_Inac_plan
 *
 * Cada motor es independiente y sin puntos registrados no emite peticiones,
 * así que el de detalle queda en silencio mientras nadie lo mira.
 */
import { createMachine, daySummary, emptyMachine } from "../domain/index.js";
import { createPollingEngine } from "../iconics/pollingEngine.js";
import {
  RESUMEN_TAGS,
  TAGS_ESTATICOS,
  listMachines,
  pointName,
  tagsForArea,
} from "../iconics/tagCatalog.js";

const CADENCIA = {
  resumen: 15_000,
  detalle: 5_000,
  estatico: 300_000,
};

/** Tags de una máquina, según su área y excluyendo los de cadencia lenta. */
const tagsVivos = (areaId) =>
  tagsForArea(areaId).filter((t) => !TAGS_ESTATICOS.includes(t));

/** Tags del resumen que existen realmente en esa área. */
const tagsResumen = (areaId) =>
  RESUMEN_TAGS.filter((t) => tagsForArea(areaId).includes(t));

export function createIconicsSource({ transport, cadencia = CADENCIA } = {}) {
  if (!transport?.read) {
    throw new Error("createIconicsSource requiere un transporte con read()");
  }

  const motor = {
    resumen: createPollingEngine({ read: transport.read, intervalMs: cadencia.resumen }),
    detalle: createPollingEngine({ read: transport.read, intervalMs: cadencia.detalle }),
    estatico: createPollingEngine({ read: transport.read, intervalMs: cadencia.estatico }),
  };
  const motores = Object.values(motor);

  const catalogo = listMachines();
  const porId = new Map(catalogo.map((m) => [m.id, m]));

  /**
   * Caché de historia, indexada por (máquina, rango).
   *
   * Guarda la promesa y no el resultado, para que dos gráficas que piden la
   * misma serie a la vez compartan una única petición. Se vacía al parar
   * la fuente.
   */
  const cacheHistoria = new Map();

  /**
   * Memoiza una lectura histórica. Un fallo no se cachea, para que la próxima
   * visita pueda reintentar si el historiador estaba caído un momento.
   */
  function cachear(clave, producir) {
    if (cacheHistoria.has(clave)) return cacheHistoria.get(clave);

    const promesa = producir().catch((err) => {
      cacheHistoria.delete(clave);
      throw err;
    });

    cacheHistoria.set(clave, promesa);
    return promesa;
  }

  /**
   * Reúne las lecturas de los tres motores para una máquina.
   *
   * El orden importa: `detalle` pisa a `resumen` porque es el más fresco
   * cuando ambos están activos. Y solo pisa si trae dato, para que un hueco
   * del detalle no borre un valor bueno del resumen.
   */
  function leerMaquina(meta, tags) {
    const readings = {};
    let receivedAt = null;
    let stale = false;

    for (const tag of tags) {
      const punto = pointName(meta.areaId, meta.machineId, tag);

      for (const m of [motor.resumen, motor.estatico, motor.detalle]) {
        const lectura = m.get(punto);
        if (lectura.value === null) continue;

        readings[tag] = lectura.value;
        if (lectura.receivedAt && (!receivedAt || lectura.receivedAt > receivedAt)) {
          receivedAt = lectura.receivedAt;
        }
        if (lectura.stale) stale = true;
      }
    }

    return createMachine({ ...meta, readings, receivedAt, stale });
  }

  function instantanea(metas, tagsDe) {
    const machines = metas.map((meta) => leerMaquina(meta, tagsDe(meta)));
    const conDato = machines.some((m) => m.receivedAt !== null);
    const errores = motores.map((m) => m.stats().ultimoError).filter(Boolean);

    return {
      machines,
      loading: !conDato && errores.length === 0,
      error: conDato ? null : (errores[0] ?? null),
      lastUpdated: machines.reduce(
        (max, m) => (m.receivedAt && (!max || m.receivedAt > max) ? m.receivedAt : max),
        null
      ),
    };
  }

  /** Alta genérica: reserva puntos, escucha al motor y emite instantáneas. */
  function suscribir({ metas, tagsDe, engines, cb }) {
    const bajas = [];

    for (const { engine, tags } of engines) {
      const puntos = metas.flatMap((meta) =>
        tags(meta).map((tag) => pointName(meta.areaId, meta.machineId, tag))
      );
      if (puntos.length) {
        bajas.push(engine.acquire(puntos));
        engine.start();
      }
    }

    const emitir = () => cb(instantanea(metas, tagsDe));
    bajas.push(...engines.map(({ engine }) => engine.onUpdate(emitir)));

    emitir();

    return () => bajas.forEach((baja) => baja());
  }

  return {
    subscribePlant(cb) {
      return suscribir({
        metas: catalogo,
        tagsDe: (meta) => [...tagsResumen(meta.areaId), ...TAGS_ESTATICOS],
        engines: [
          { engine: motor.resumen, tags: (meta) => tagsResumen(meta.areaId) },
          { engine: motor.estatico, tags: () => TAGS_ESTATICOS },
        ],
        cb,
      });
    },

    subscribeMachine(id, cb) {
      const meta = porId.get(id);
      if (!meta) {
        cb({ machines: [], loading: false, error: `Máquina desconocida: ${id}`, lastUpdated: null });
        return () => {};
      }

      return suscribir({
        metas: [meta],
        tagsDe: (m) => tagsForArea(m.areaId),
        engines: [
          { engine: motor.detalle, tags: (m) => tagsVivos(m.areaId) },
          { engine: motor.estatico, tags: () => TAGS_ESTATICOS },
        ],
        cb,
      });
    },

    /**
     * Historia. No se sondea: se pide al abrir la gráfica y se cachea por
     * (máquina, rango), porque el pasado no cambia.
     *
     * El transporte falso no simula histórico, así que en desarrollo sin
     * servidor devuelve vacío a propósito: un gráfico vacío se ve, uno
     * inventado no.
     */
    async readHistory(id, range = {}) {
      if (typeof transport.readHistory !== "function") return [];

      const meta = porId.get(id);
      if (!meta) return [];

      return cachear(`serie|${id}|${JSON.stringify(range)}`, () => transport.readHistory(meta, range));
    },

    /**
     * Un día de una máquina tal como lo tiene el historiador: la serie horaria
     * de los factores y el resumen del día. Lo consume el comparativo.
     *
     * Devuelve `resumen: null` cuando el día no tiene ni una muestra, para que
     * la vista pueda distinguir un día sin historizar de un día con OEE 0.
     */
    async readDay(id, iso) {
      const meta = porId.get(id);
      if (!meta || !iso) return { serie: [], resumen: null };
      if (typeof transport.readDay !== "function") return { serie: [], resumen: null };

      return cachear(`dia|${id}|${iso}`, async () => {
        const { serie, cierre } = await transport.readDay(meta, iso);
        return { serie, resumen: daySummary(serie, cierre) };
      });
    },

    /**
     * OEE día a día, para el mapa de calor del calendario. El resultado se
     * cachea por rango para no repetir la ronda al reabrir el selector.
     */
    async readDailyOee(id, rango) {
      const meta = porId.get(id);
      if (!meta) return [];
      if (typeof transport.readDailyOee !== "function") return [];

      return cachear(`dias|${id}|${rango.desde}|${rango.hasta}`, () => transport.readDailyOee(meta, rango));
    },

    stop() {
      motores.forEach((m) => m.stop());
      cacheHistoria.clear();
    },

    /** Instrumentación agregada de los tres motores. */
    stats() {
      const partes = Object.entries(motor).map(([nombre, m]) => ({ nombre, ...m.stats() }));
      return {
        motores: partes,
        peticionesPorMinuto: partes.reduce((a, p) => a + p.peticionesPorMinuto, 0),
        puntos: partes.reduce((a, p) => a + p.referencias, 0),
        ultimoError: partes.map((p) => p.ultimoError).find(Boolean) ?? null,
      };
    },
  };
}

export { CADENCIA };
