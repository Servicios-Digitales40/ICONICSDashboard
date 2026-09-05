/**
 * Un poller, una petición, muchos suscriptores.
 *
 * JS puro (sin React ni DOM obligatorio) para poder probarlo en node.
 *
 * Un hook con `setInterval` por componente abriría un temporizador y una
 * petición por cada uno de los ~140 puntos en pantalla. Aquí hay un solo
 * temporizador y una sola petición por ciclo con la unión de todos ellos.
 *
 * Características:
 *
 *  - Registro con conteo de referencias: los componentes declaran qué puntos
 *    necesitan al montar y los liberan al desmontar.
 *  - Troceado con concurrencia acotada, para no pasarse del límite del servidor.
 *  - Guarda de petición en vuelo: si el ciclo anterior sigue corriendo, el
 *    siguiente se omite en vez de encolarse.
 *  - Consciente de visibilidad: con la pestaña oculta no se sondea.
 *  - Backoff exponencial acotado ante fallo, reiniciado al primer éxito.
 *  - Stale-while-revalidate: nunca se vacía lo ya leído; tras N ciclos sin
 *    noticias el punto se marca como rancio y la UI lo advierte.
 *  - Filtro por calidad en la frontera (ver quality.js): un valor de mala
 *    calidad es ausencia de dato, no un cero.
 */
import { isGoodQuality, motivoDeCalidad } from "@shared/quality.js";

/** Adaptador de visibilidad. Fuera del navegador se comporta como «siempre visible». */
function visibilidadDelNavegador() {
  if (typeof document === "undefined") {
    return { esVisible: () => true, suscribir: () => () => {} };
  }
  const leer = () => document.visibilityState !== "hidden";
  return {
    esVisible: leer,
    suscribir(cb) {
      const handler = () => cb(leer());
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },
  };
}

const trocear = (xs, n) => {
  const out = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

export function createPollingEngine({
  /** `async (pointNames[]) => Map<pointName, { value, quality }>` */
  read,
  intervalMs = 15000,
  maxBatch = 200,
  maxConcurrent = 3,
  backoffMaxMs = 60000,
  staleAfterCycles = 3,
  /**
   * Ventana para agrupar altas seguidas de puntos. Navegar rápido entre
   * máquinas registra y libera tags muy deprisa; sin esta ventana cada
   * cambio dispararía su propia petición inmediata.
   */
  coalesceMs = 250,
  visibility = visibilidadDelNavegador(),
} = {}) {
  /** pointName → nº de componentes que lo piden. */
  const refs = new Map();
  /** pointName → { value, quality, ok, receivedAt, misses } */
  const values = new Map();
  const listeners = new Set();

  let timer = null;
  let coalesceTimer = null;
  let enVuelo = false;
  let fallos = 0;
  let corriendo = false;
  let bajaVisibilidad = null;

  const marcasDePeticion = [];
  const stats = {
    peticiones: 0,
    errores: 0,
    omitidos: 0,
    ultimoError: null,
    ultimaLectura: null,
    puntos: 0,
  };

  const notificar = () => listeners.forEach((cb) => cb());

  const registrarPeticion = () => {
    const ahora = Date.now();
    marcasDePeticion.push(ahora);
    while (marcasDePeticion.length && ahora - marcasDePeticion[0] > 60000) {
      marcasDePeticion.shift();
    }
    stats.peticiones += 1;
  };

  const puntosActivos = () => [...refs.keys()];

  /** Troceado con concurrencia acotada. */
  async function leerTodo(points) {
    const lotes = trocear(points, maxBatch);
    const salida = new Map();

    for (let i = 0; i < lotes.length; i += maxConcurrent) {
      const tanda = lotes.slice(i, i + maxConcurrent);
      const resultados = await Promise.all(
        tanda.map((lote) => {
          registrarPeticion();
          return read(lote);
        })
      );
      for (const mapa of resultados) {
        if (mapa) for (const [k, v] of mapa) salida.set(k, v);
      }
    }
    return salida;
  }

  /**
   * Un ciclo de lectura. Es idempotente y seguro de llamar a mano: las
   * pruebas lo usan para no depender de temporizadores.
   */
  async function poll() {
    // Si el ciclo anterior sigue en vuelo, este se omite.
    if (enVuelo) {
      stats.omitidos += 1;
      return;
    }

    const points = puntosActivos();
    stats.puntos = points.length;
    if (points.length === 0) return;

    enVuelo = true;
    try {
      const respuesta = await leerTodo(points);
      const ahora = new Date();

      for (const name of points) {
        const bruto = respuesta.get(name);

        if (bruto === undefined) {
          // El punto no vino: se conserva el último valor bueno y se cuenta
          // el fallo. Solo tras N ciclos se declara rancio, para que un
          // hueco puntual no parpadee en pantalla.
          const previo = values.get(name);
          if (previo) previo.misses += 1;
          else {
            // Sin `motivo`: el punto no vino, así que no hay calidad que
            // interpretar. Es ausencia, y de eso ya habla `stale`.
            values.set(name, {
              value: null, quality: null, motivo: null, ok: false, receivedAt: null, misses: 1,
            })
          }
          continue;
        }

        /*
         * La calidad se filtra aquí, en la frontera.
         *
         * `?? null` y no `bruto.value` a secas: hay DOS formas de no tener
         * dato y las dos tienen que salir como `null` (§2.4). La segunda es la
         * traicionera —calidad ACEPTABLE y sin campo `value`, que es como el
         * servidor real sirvió quince de veintiún puntos el 26-08-2026— y sin
         * esto salía de aquí como `undefined`.
         *
         * No era un fallo vivo mientras el único consumidor era el tanque:
         * `createSistema` hace `?? null` al entrar. Pero eso deja la garantía
         * en el consumidor y no en la frontera, y el segundo consumidor
         * —vibraciones, desde el Plan 21 F2— la habría heredado sin saberlo.
         * Un `undefined` que llegue a un `?? 0` río abajo se convierte en
         * «vibración nula, todo perfecto».
         */
        const ok = isGoodQuality(bruto.quality);
        values.set(name, {
          value: ok ? bruto.value ?? null : null,
          quality: bruto.quality ?? null,
          /*
           * POR QUÉ no vale, no sólo QUE no vale (Plan 21 F3). Un sensor
           * desconectado, un módulo que desconfía de su medida y un punto que
           * dejó de entregar se arreglan en tres sitios distintos, y con un
           * booleano los tres se ven igual en pantalla.
           *
           * Cuando la calidad es buena pero no vino `value`, el motivo es
           * `null` y el valor también: el punto contestó y no dijo nada. Ese
           * caso lo cuenta la forma común como `sinDato` sin motivo de
           * calidad, que es exactamente lo que es.
           */
          motivo: motivoDeCalidad(bruto.quality),
          ok,
          receivedAt: ahora,
          misses: 0,
        });
      }

      // El éxito reinicia el backoff.
      fallos = 0;
      stats.ultimoError = null;
      stats.ultimaLectura = ahora;
    } catch (err) {
      fallos += 1;
      stats.errores += 1;
      stats.ultimoError = err instanceof Error ? err.message : String(err);
      for (const name of points) {
        const previo = values.get(name);
        if (previo) previo.misses += 1;
      }
    } finally {
      enVuelo = false;
      notificar();
      agendar();
    }
  }

  /** Retardo del próximo ciclo, con backoff exponencial acotado. */
  function proximoRetardo() {
    if (fallos === 0) return intervalMs;
    return Math.min(intervalMs * 2 ** fallos, backoffMaxMs);
  }

  function agendar() {
    if (!corriendo) return;
    clearTimeout(timer);
    // Con la pestaña oculta no se agenda nada.
    if (!visibility.esVisible()) return;
    timer = setTimeout(poll, proximoRetardo());
  }

  /** Lectura inmediata agrupada, para cuando entran puntos nuevos. */
  function pollPronto() {
    if (!corriendo || !visibility.esVisible()) return;
    clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(() => {
      clearTimeout(timer);
      poll();
    }, coalesceMs);
  }

  function start() {
    if (corriendo) return;
    corriendo = true;

    bajaVisibilidad = visibility.suscribir((visible) => {
      if (visible) {
        // Al volver al foco, refresco inmediato para no enseñar el estado
        // de hace media hora.
        fallos = 0;
        pollPronto();
      } else {
        clearTimeout(timer);
        clearTimeout(coalesceTimer);
      }
    });

    pollPronto();
  }

  function stop() {
    corriendo = false;
    clearTimeout(timer);
    clearTimeout(coalesceTimer);
    timer = null;
    coalesceTimer = null;
    bajaVisibilidad?.();
    bajaVisibilidad = null;
  }

  /**
   * Alta de puntos con conteo de referencias.
   *
   * La función de baja es idempotente por el doble montaje de StrictMode en
   * desarrollo: la secuencia +1 −1 +1 deja exactamente una referencia y una
   * baja repetida no puede dejarla en negativo.
   */
  function acquire(pointNames) {
    let nuevos = 0;
    for (const name of pointNames) {
      const previo = refs.get(name) ?? 0;
      if (previo === 0) nuevos += 1;
      refs.set(name, previo + 1);
    }

    if (nuevos > 0) pollPronto();

    let liberado = false;
    return function release() {
      if (liberado) return;
      liberado = true;
      for (const name of pointNames) {
        const previo = refs.get(name) ?? 0;
        if (previo <= 1) {
          refs.delete(name);
          values.delete(name);
        } else {
          refs.set(name, previo - 1);
        }
      }
    };
  }

  function onUpdate(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  /**
   * Lectura de un punto, ya saneada.
   * `stale` es cierto cuando lleva `staleAfterCycles` ciclos sin noticias.
   */
  function get(name) {
    if (!values.has(name)) {
      return { value: null, ok: false, stale: true, receivedAt: null, motivo: null };
    }
    const v = values.get(name);
    return {
      value: v.ok ? v.value : null,
      ok: v.ok,
      stale: v.misses >= staleAfterCycles,
      receivedAt: v.receivedAt,
      /*
       * El motivo acompaña al hueco hasta arriba. `null` cuando la lectura es
       * buena, y también cuando el punto simplemente no vino en la respuesta
       * —ahí no hay calidad que interpretar, hay ausencia—, que es lo que
       * `stale` ya cuenta.
       */
      motivo: v.motivo ?? null,
    };
  }

  return {
    acquire,
    onUpdate,
    get,
    start,
    stop,
    poll,
    /** Instantánea de instrumentación. */
    stats: () => ({
      ...stats,
      peticionesPorMinuto: marcasDePeticion.length,
      enVuelo,
      corriendo,
      visible: visibility.esVisible(),
      fallosConsecutivos: fallos,
      proximoRetardoMs: proximoRetardo(),
      suscriptores: listeners.size,
      referencias: refs.size,
    }),
  };
}
