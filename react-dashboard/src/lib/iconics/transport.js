/**
 * lib/iconics/transport.js
 * ------------------------------------------------------------------
 * La frontera con la red. Decide si el motor de polling habla con el
 * servidor real o con el transporte falso.
 *
 * ── EL VALOR POR DEFECTO ES EL SERVIDOR REAL ───────────────────────
 *
 * Al principio era al revés: sin configurar nada, la app hablaba con el
 * simulador y hacía falta `VITE_ICONICS_LIVE=true` para conectar. Eso
 * producía la peor trampa posible de despliegue: un `npm run build` sin
 * la variable generaba un bundle que arrancaba, se veía perfecto y
 * enseñaba datos inventados para siempre — y como la variable se
 * resuelve en BUILD, no en runtime, no había forma de corregirlo sin
 * recompilar.
 *
 * Ahora una instalación limpia intenta el servidor real. Si el backend
 * no está, se ve un estado de error honesto, no cifras plausibles. El
 * simulador pasa a ser una herramienta de desarrollo que se pide a
 * propósito:
 *
 *     VITE_ICONICS_FAKE=true npm run dev
 *
 * Y «quiero enseñar la UI sin servidor» ya tiene otra respuesta: el modo
 * demo, con su botón en el Topbar.
 */
import { fetchIconicsBatch, fetchIconicsHistory } from "./apiClient.js";
import { CAOS_SUAVE, createFakeTransport } from "./fakeTransport.js";
import { historyPointName } from "./tagCatalog.js";

/**
 * Agregado del historiador. `Interpolative`, y no `Average`, POR UNA RAZÓN
 * MEDIDA CONTRA EL SERVIDOR.
 *
 * `Average` funciona en cinco de los siete tags y falla SIEMPRE, con 500,
 * en los dos que pueden traer `Infinity`: `OEE_Cal` —que el servidor
 * calcula como `Pz_OK / Prod_Real_Total` sin proteger la división, así que
 * a inicio de turno desborda— y `OEE`, que lo multiplica. Promediar un
 * bucket con un infinito dentro revienta el cálculo del historiador.
 *
 * `Interpolative` no suma: toma el valor interpolado en el instante de
 * cada bucket. Verificado sobre los siete tags y un día completo de datos
 * reales, devuelve 24 puntos con valor en los siete.
 *
 * Si algún día se licencian y arreglan los agregados sumatorios, cambiar
 * esta constante basta: nadie más nombra el agregado.
 */
export const AGREGADO = { serie: "Interpolative" };

/**
 * Intervalo de agregación, en el formato TimeSpan de .NET que documenta la
 * API REST (`01:00:00` = una hora).
 *
 * OJO con la forma de más de un día: `1.00:00:00` —el TimeSpan correcto de
 * .NET— lo rechaza este servidor; `24:00:00` sí lo acepta. Y los rangos de
 * varios días fallan de forma intermitente con «Invalid Point Name», así
 * que la historia se pide SIEMPRE día a día.
 */
export const INTERVALO = { hora: "01:00:00" };

/**
 * Los siete tags que necesita el comparativo, en una sola lectura por día.
 *
 * Antes eran dos peticiones por tag —una para la media horaria y otra para
 * el cierre del contador—. Con `Interpolative` sobra: la misma serie de 24
 * puntos sirve para las gráficas (los factores) y para el cierre del día
 * (el último punto de un contador ES lo acumulado).
 */
export const TAGS_FACTOR = ["disponibilidad", "rendimiento", "calidad", "oee"];

/** Contadores: su cierre del día se toma del último punto de la serie. */
export const TAGS_CIERRE = ["aprobadas", "rechazadas", "tMuerto"];

/** Todo lo que se pide por día. Una petición por tag, 24 puntos cada una. */
export const TAGS_DIA = [...TAGS_FACTOR, ...TAGS_CIERRE];

/* ------------------------------------------------------------------
 * FECHAS
 *
 * La API espera marcas de tiempo CON desplazamiento horario explícito
 * (`2026-07-30T00:00:00-06:00`). Mandarlas en UTC movería la frontera del
 * día: el "30 de julio" de la planta empieza a las 06:00Z, y pedir de
 * 00:00Z a 24:00Z devolvería las seis últimas horas del día anterior.
 * ------------------------------------------------------------------ */

/** Desplazamiento local en formato ±HH:MM. */
function desplazamiento(d) {
  const min = -d.getTimezoneOffset();
  const signo = min >= 0 ? "+" : "-";
  const abs = Math.abs(min);
  return `${signo}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Date → "YYYY-MM-DD" del día LOCAL (nunca del UTC: a las 23:00 no son ya mañana). */
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
 * Total del día de un CONTADOR, sumando sus incrementos.
 *
 * No vale con tomar el último valor. Los contadores del PLC se REINICIAN
 * dentro del día —en los datos del 28-jul, `Pz_OK` sube de 727 a 1551
 * hasta las 06:00 y a las 07:00 arranca de nuevo en 48, con el cambio de
 * turno—, así que el último valor son las piezas del último turno y no
 * las del día. Sumando solo los saltos positivos, cada reinicio cuenta
 * como lo que es: el final de un tramo, no una pérdida de producción.
 *
 * Se apoya en la rejilla horaria, así que un reinicio Y una subida dentro
 * de la misma hora se contabilizan como una sola: es una cota inferior
 * honesta, no una cifra exacta al alza.
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
 * Corta la serie en la hora ACTUAL cuando el día pedido es el de hoy.
 *
 * `Interpolative` rellena todos los buckets del rango, también los que
 * aún no han ocurrido: repite el último valor conocido hasta las 23:00.
 * En un día en curso eso dibuja una recta desde "ahora" hasta medianoche
 * que no ha pasado y que además arrastra las medias del resumen. En un
 * día pasado, en cambio, la meseta final SÍ es información (la máquina no
 * cambió de valor), así que solo se recorta el día de hoy.
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
 * `{ ok, payload }`, al par `{ value, quality }` que espera el motor.
 * La forma exacta del payload de ICONICS varía según el tipo de punto,
 * de ahí las alternativas al leer `value` y `quality`.
 */
export function createRealTransport() {
  /**
   * Lee varios tags históricos de UNA máquina sobre la MISMA rejilla.
   *
   * La ruta `/History` del backend es de un punto por llamada, así que
   * son N peticiones; se lanzan en paralelo y un tag que falle devuelve
   * serie vacía en lugar de tumbar a los demás: un tag sin historizar no
   * debe dejar la gráfica entera en blanco.
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
   * Une las series de varios tags en filas, EMPAREJANDO POR MARCA DE
   * TIEMPO y no por posición.
   *
   * Pedidos todos con el mismo agregado e intervalo, ICONICS devuelve la
   * misma rejilla para todos, así que las claves coinciden. Pero si un
   * tag se queda sin muestra en una hora concreta, el emparejado
   * posicional desplazaría el resto de su serie y compararía las 10:00
   * contra las 11:00 sin avisar. Emparejando por marca, ese hueco queda
   * como `null` —que la UI sabe pintar— y nada se desplaza.
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
        if (!entrada?.ok) continue;   // punto ausente → hueco, lo gestiona el motor

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
     * Sin rango explícito lee el día de hoy, que es lo que necesita la
     * gráfica del detalle.
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
     * Un día completo de UNA máquina: siete tags, UNA petición cada uno,
     * 24 puntos por petición.
     *
     * Los contadores no necesitan una lectura aparte: el último punto de
     * `Pz_OK` en el día ES lo acumulado del día, porque el contador crece
     * y se reinicia con la jornada. Antes eran dos rondas de peticiones;
     * esto las deja en una.
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
     * Es UNA petición POR DÍA, y no una sola para todo el rango, porque
     * este servidor rechaza los rangos de varios días: responde «Invalid
     * Point Name» de forma intermitente aunque el punto sea el mismo que
     * acaba de funcionar para un solo día. Por eso la ventana del
     * calendario es corta y las peticiones van de tres en tres: es un
     * adorno del selector de fechas, no debe competir por la red con la
     * comparación en sí.
     *
     * Un día que falle simplemente no se tiñe.
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

            // El valor del día es la media de sus puntos horarios: el
            // servidor no sabe darla (su `Average` desborda con los
            // infinitos de `OEE`), así que se promedia aquí.
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
 * Transporte a usar. El falso lleva caos SUAVE encendido a propósito:
 * si solo devolviera datos buenos, la UI se construiría dando por hecho
 * que todos los tags existen siempre y que la calidad siempre es 192
 * (riesgo R-04 del Plan 1).
 */
export function createTransport() {
  return esTransporteFalso() ? createFakeTransport({ chaos: CAOS_SUAVE }) : createRealTransport();
}
