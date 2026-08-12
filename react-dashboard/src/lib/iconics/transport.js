/**
 * Frontera con la red: el servidor real o el simulador.
 *
 * Por defecto se usa el servidor real. `VITE_ICONICS_FAKE=true` cambia cuál se
 * usa **al arrancar**; desde el Plan 5, si el build trae el interruptor
 * (`VITE_ENABLE_SIMULATOR`) se puede cambiar en caliente sin recompilar, que
 * es lo que antes obligaba a tener un modo demo aparte.
 *
 * Aquí queda solo lo que toca la red o el entorno del navegador. Las reglas
 * del historiador —qué agregado, cómo se formatean las fechas, cómo se reduce
 * cada tipo de tag— viven en `@shared/historia.js` desde el Plan 6, porque las
 * necesita también el backend para las herramientas del asistente.
 */
import { fetchIconicsBatch, fetchIconicsHistory } from "./apiClient.js";
import { CAOS_ALTO, CAOS_SUAVE, SIN_CAOS, createFakeTransport } from "./fakeTransport.js";
import { historyPointName } from "@shared/tagCatalog.js";
import {
  AGREGADO,
  INTERVALO,
  TAGS_DIA,
  TAGS_CIERRE,
  TAGS_FACTOR,
  isoLocal,
  rangoDelDia,
  recortarAlPresente,
  totalDelDia,
  unir,
} from "@shared/historia.js";

/**
 * Transporte real: una petición en lote por llamada.
 *
 * Normaliza la respuesta del backend puente, que envuelve cada punto en
 * `{ ok, payload }`, al par `{ value, quality }` que espera el motor. La forma
 * del payload de ICONICS varía según el tipo de punto, de ahí las alternativas
 * al leer `value` y `quality`.
 */
export function createRealTransport() {
  /**
   * Lee varios tags históricos de una máquina sobre la misma rejilla.
   *
   * La ruta `/History` admite un punto por llamada, así que son N peticiones
   * en paralelo. Un tag que falle devuelve serie vacía para no dejar la
   * gráfica entera en blanco.
   */
  async function leerTags(meta, tags, { startDate, endDate, aggregate, interval }) {
    const pares = await Promise.all(
      tags.map(async (tag) => {
        try {
          const r = await fetchIconicsHistory(
            historyPointName(meta.areaId, meta.machineId, tag),
            { startDate, endDate, aggregate, interval }
          );
          return [tag, Array.isArray(r?.data) ? r.data : []];
        } catch {
          return [tag, []];
        }
      })
    );
    return Object.fromEntries(pares);
  }

  return {
    async read(pointNames) {
      const respuesta = await fetchIconicsBatch(pointNames);
      const mapa = respuesta?.payload ?? {};
      const salida = new Map();

      for (const name of pointNames) {
        const entrada = mapa[name];
        if (!entrada?.ok) continue;   // punto ausente: el motor lo trata como hueco

        const p = entrada.payload ?? {};
        salida.set(name, {
          value: p.value ?? p.Value ?? null,
          quality: p.quality ?? p.Quality ?? null,
        });
      }
      return salida;
    },

    /**
     * Serie histórica de las cuatro métricas del OEE para una máquina.
     * Sin rango explícito lee el día de hoy.
     */
    async readHistory(meta, { startDate, endDate, aggregate = AGREGADO.serie, interval = INTERVALO.hora, points } = {}) {
      const rango = startDate && endDate
        ? { startDate, endDate }
        : rangoDelDia(isoLocal(new Date()));

      const porTag = await leerTags(meta, TAGS_FACTOR, { ...rango, aggregate, interval });
      const filas = unir(porTag, TAGS_FACTOR);
      return points ? filas.slice(-points) : filas;
    },

    /**
     * Un día completo de una máquina: siete tags, una petición cada uno,
     * 24 puntos por petición.
     *
     * Los contadores no necesitan lectura aparte: su total del día sale de
     * la misma serie.
     */
    async readDay(meta, iso) {
      const porTag = await leerTags(meta, TAGS_DIA, {
        ...rangoDelDia(iso),
        aggregate: AGREGADO.serie,
        interval: INTERVALO.hora,
      });

      return {
        serie: recortarAlPresente(unir(porTag, TAGS_FACTOR), iso),
        cierre: Object.fromEntries(
          TAGS_CIERRE.map((tag) => [tag, totalDelDia(porTag[tag] ?? [])])
        ),
      };
    },

    /**
     * OEE día a día, para el mapa de calor del calendario.
     *
     * Una petición por día: el servidor rechaza los rangos de varios días con
     * «Invalid Point Name» de forma intermitente. Van de tres en tres para no
     * competir por la red con la comparación en sí. Un día que falle no se tiñe.
     */
    async readDailyOee(meta, { desde, hasta, concurrencia = 3 }) {
      const dias = [];
      const fin = new Date(`${hasta}T00:00:00`);
      for (let d = new Date(`${desde}T00:00:00`); d <= fin; d.setDate(d.getDate() + 1)) {
        dias.push(isoLocal(d));
      }

      const salida = [];
      for (let i = 0; i < dias.length; i += concurrencia) {
        const lote = await Promise.all(
          dias.slice(i, i + concurrencia).map(async (iso) => {
            const porTag = await leerTags(meta, ["oee"], {
              ...rangoDelDia(iso),
              aggregate: AGREGADO.serie,
              interval: INTERVALO.hora,
            });

            // La media diaria se calcula aquí porque el `Average` del
            // servidor desborda con los infinitos de `OEE`.
            const nums = (porTag.oee ?? [])
              .map((m) => m.value)
              .filter((v) => Number.isFinite(v));

            return nums.length
              ? { iso, oee: nums.reduce((a, b) => a + b, 0) / nums.length }
              : null;
          })
        );
        salida.push(...lote.filter(Boolean));
      }

      return salida;
    },
  };
}

/** Los dos transportes posibles. */
export const TRANSPORTES = { REAL: "real", SIMULADO: "simulado" };

/** ¿El build arranca en el simulador? */
export const esTransporteFalso = () => import.meta.env?.VITE_ICONICS_FAKE === "true";

/**
 * Con qué transporte arranca la aplicación. Real salvo que se pida lo
 * contrario: un build sin configurar tiene que ir al servidor, nunca quedarse
 * enseñando datos inventados sin que nadie lo haya decidido.
 */
export const transporteInicial = () =>
  esTransporteFalso() ? TRANSPORTES.SIMULADO : TRANSPORTES.REAL;

/**
 * Grado de caos del simulador.
 *
 * ── POR QUÉ ES ELEGIBLE ────────────────────────────────────────────
 *
 * El caos viene encendido en grado suave a propósito: sin él la UI se
 * escribiría dando por hecho que todos los tags existen siempre y que la
 * calidad siempre es buena, y ambas suposiciones fallan con el servidor real.
 * Ése es el valor por defecto y el que hay que usar para desarrollar.
 *
 * Pero el caos es aleatorio, y eso choca con el otro uso del simulador:
 * enseñar la aplicación. Con `none` no hay huecos ni mala calidad, así que la
 * pantalla es predecible — es lo que sustituye a los números fijos del modo
 * demo que se retiró. `high` es para revisar a conciencia el comportamiento
 * degradado.
 *
 * Un valor desconocido cae en `soft`, que es el que no miente sobre la
 * fiabilidad del servidor.
 */
const PRESETS_CAOS = { none: SIN_CAOS, soft: CAOS_SUAVE, high: CAOS_ALTO };

export function presetCaos() {
  return PRESETS_CAOS[import.meta.env?.VITE_ICONICS_CHAOS] ?? CAOS_SUAVE;
}

/**
 * Transporte a usar.
 *
 * Sin argumento se toma el del build, que es lo que quieren las pruebas y
 * cualquier consumidor que no participe del interruptor.
 */
export function createTransport(clase = transporteInicial()) {
  return clase === TRANSPORTES.SIMULADO
    ? createFakeTransport({ chaos: presetCaos() })
    : createRealTransport();
}
