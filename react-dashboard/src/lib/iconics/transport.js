/**
 * Frontera con la red: elige entre el servidor real y el simulador.
 *
 * Por defecto se usa el servidor real; el simulador se pide a propósito
 * con `VITE_ICONICS_FAKE=true`. La variable se resuelve en build, no en
 * runtime, así que un bundle compilado sin ella siempre irá al backend.
 * Para enseñar la UI sin servidor está el modo demo del Topbar.
 */
import { fetchIconicsBatch, fetchIconicsHistory } from "./apiClient.js";
import { CAOS_SUAVE, createFakeTransport } from "./fakeTransport.js";
import { historyPointName } from "./tagCatalog.js";

/**
 * Agregado del historiador.
 *
 * Se usa `Interpolative` y no `Average` porque `Average` devuelve 500 en los
 * tags que pueden traer `Infinity` (`OEE_Cal` y `OEE`): el servidor no
 * protege la división y promediar un bucket con un infinito dentro rompe el
 * cálculo. `Interpolative` toma el valor interpolado en cada bucket y
 * funciona sobre los siete tags.
 */
export const AGREGADO = { serie: "Interpolative" };

/**
 * Intervalo de agregación en formato TimeSpan de .NET (`01:00:00` = 1 hora).
 *
 * Este servidor rechaza la forma de más de un día (`1.00:00:00`) y los rangos
 * multi-día fallan de forma intermitente, así que la historia se pide día a día.
 */
export const INTERVALO = { hora: "01:00:00" };

/** Factores del OEE. Una serie de 24 puntos por día y tag. */
export const TAGS_FACTOR = ["disponibilidad", "rendimiento", "calidad", "oee"];

/** Contadores: su cierre del día se toma del último punto de la serie. */
export const TAGS_CIERRE = ["aprobadas", "rechazadas", "tMuerto"];

/** Todo lo que se pide por día. Una petición por tag, 24 puntos cada una. */
export const TAGS_DIA = [...TAGS_FACTOR, ...TAGS_CIERRE];

/*
 * Fechas.
 *
 * La API espera marcas de tiempo con desplazamiento horario explícito
 * (`2026-07-30T00:00:00-06:00`). En UTC se movería la frontera del día y el
 * rango devolvería las últimas horas del día anterior.
 */

/** Desplazamiento local en formato ±HH:MM. */
function desplazamiento(d) {
  const min = -d.getTimezoneOffset();
  const signo = min >= 0 ? "+" : "-";
  const abs = Math.abs(min);
  return `${signo}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Date → "YYYY-MM-DD" del día local (no UTC, para no adelantar el día de noche). */
export function isoLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Date local → `2026-07-30T00:00:00-06:00`. */
export function marcaLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${desplazamiento(d)}`
  );
}

/** Rango [00:00, 24:00) del día local `iso` ("YYYY-MM-DD"). */
export function rangoDelDia(iso) {
  const inicio = new Date(`${iso}T00:00:00`);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { startDate: marcaLocal(inicio), endDate: marcaLocal(fin) };
}

/** Rango [00:00 de `isoDesde`, 24:00 de `isoHasta`). */
export function rangoDeDias(isoDesde, isoHasta) {
  return { startDate: rangoDelDia(isoDesde).startDate, endDate: rangoDelDia(isoHasta).endDate };
}

/**
 * Total del día de un contador, sumando sus incrementos.
 *
 * No sirve tomar el último valor: los contadores del PLC se reinician con el
 * cambio de turno, así que el último valor son las piezas del turno y no las
 * del día. Sumando solo los saltos positivos, cada reinicio cuenta como el
 * final de un tramo y no como una pérdida de producción.
 *
 * Al apoyarse en la rejilla horaria, un reinicio y una subida dentro de la
 * misma hora cuentan como uno solo: el resultado es una cota inferior.
 */
function totalDelDia(muestras) {
  const nums = muestras.map((m) => m.value).filter((v) => Number.isFinite(v));
  if (!nums.length) return null;

  let total = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const salto = nums[i] - nums[i - 1];
    if (salto > 0) total += salto;
    else if (salto < 0) total += nums[i];   // reinicio: el tramo nuevo aporta desde su propio valor
  }
  return total;
}

/**
 * Corta la serie en la hora actual cuando el día pedido es el de hoy.
 *
 * `Interpolative` rellena todos los buckets del rango repitiendo el último
 * valor conocido, también los que aún no han ocurrido. En un día en curso eso
 * dibuja una recta hasta medianoche que no ha pasado y arrastra las medias.
 * En un día pasado la meseta final sí es información, así que no se recorta.
 */
function recortarAlPresente(filas, iso) {
  const ahora = new Date();
  if (iso !== isoLocal(ahora)) return filas;
  return filas.filter((f) => new Date(f.ts) <= ahora);
}

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

  /**
   * Une las series de varios tags en filas, emparejando por marca de tiempo
   * y no por posición.
   *
   * Si un tag se queda sin muestra en una hora concreta, el emparejado
   * posicional desplazaría el resto de su serie y compararía horas distintas
   * sin avisar. Emparejando por marca, el hueco queda como `null`.
   */
  function unir(porTag, tags) {
    const rejilla = [];
    const vistos = new Set();
    for (const tag of tags) {
      for (const m of porTag[tag] ?? []) {
        const clave = String(m.timestamp);
        if (!vistos.has(clave)) {
          vistos.add(clave);
          rejilla.push(m.timestamp);
        }
      }
    }
    rejilla.sort((a, b) => new Date(a) - new Date(b));

    const indices = Object.fromEntries(
      tags.map((tag) => [tag, new Map((porTag[tag] ?? []).map((m) => [String(m.timestamp), m.value]))])
    );

    return rejilla.map((ts) => {
      const fila = {
        t: new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
        ts,
      };
      for (const tag of tags) fila[tag] = indices[tag].get(String(ts)) ?? null;
      return fila;
    });
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
     * Los contadores no necesitan lectura aparte: su cierre del día sale de
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

/** ¿Se pidió explícitamente el simulador? */
export const esTransporteFalso = () => import.meta.env?.VITE_ICONICS_FAKE === "true";

/**
 * Transporte a usar. El simulador lleva caos suave a propósito: sin él la UI
 * se construiría dando por hecho que todos los tags existen siempre y que la
 * calidad siempre es buena.
 */
export function createTransport() {
  return esTransporteFalso() ? createFakeTransport({ chaos: CAOS_SUAVE }) : createRealTransport();
}
