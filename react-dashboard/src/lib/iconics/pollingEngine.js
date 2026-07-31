/**
 * lib/iconics/pollingEngine.js
 * ------------------------------------------------------------------
 * UN POLLER, UNA PETICIÓN, MUCHOS SUSCRIPTORES.
 *
 * JS puro: ni React ni DOM obligatorio, para poder probarlo en node.
 *
 * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────
 *
 * Son 10 máquinas × hasta 14 propiedades = ~140 puntos. Con el hook
 * `useIconicsPoint`, que abre un `setInterval` por componente, la vista
 * de área abriría 10 temporizadores y la de detalle 14, cada uno con su
 * propia petición. Multiplicado por un refresco de 5 s son ~120 y ~168
 * peticiones por minuto para enseñar lo mismo.
 *
 * Aquí hay un solo temporizador y una sola petición por ciclo: 4 y 12
 * peticiones por minuto respectivamente.
 *
 * ── LAS OCHO PROPIEDADES ───────────────────────────────────────────
 *
 * 1 · Registro con CONTEO DE REFERENCIAS. Los componentes declaran qué
 *     puntos necesitan al montar y los liberan al desmontar; el motor
 *     mantiene la unión. Así la vista de planta pide 8 tags × 10
 *     máquinas y el detalle añade el resto de UNA sola máquina.
 *
 * 2 · UNA PETICIÓN POR CICLO con la unión completa, aprovechando la
 *     lectura en lote que el backend ya expone.
 *
 * 3 · TROCEADO con concurrencia acotada, para no pasarse del límite del
 *     servidor ni abrir una avalancha de conexiones.
 *
 * 4 · GUARDA DE PETICIÓN EN VUELO: si el ciclo anterior sigue corriendo,
 *     el siguiente se OMITE en vez de encolarse. Con un servidor lento
 *     es la diferencia entre degradarse y colapsar.
 *
 * 5 · CONSCIENTE DE VISIBILIDAD: con la pestaña oculta no se sondea. Un
 *     dashboard abierto toda la noche pasa de ~5760 peticiones a 0.
 *
 * 6 · BACKOFF EXPONENCIAL ante fallo, con tope, reiniciado al primer
 *     éxito: un servidor caído no recibe tráfico de martillo.
 *
 * 7 · STALE-WHILE-REVALIDATE: nunca se vacía lo ya leído. Tras N ciclos
 *     sin noticias de un punto se marca como rancio y la UI lo advierte,
 *     en vez de dejar un hueco donde había un número.
 *
 * 8 · FILTRO POR CALIDAD: ver lib/iconics/quality.js. Un valor con
 *     calidad ≠ 192 no es un cero, es la ausencia de un dato.
 */
import { isGoodQuality } from "./quality.js";

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
   * máquinas registra y libera tags a gran velocidad; sin esta ventana
   * cada cambio dispararía su propia petición inmediata (riesgo R-08).
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

  /** Troceado con concurrencia acotada (propiedad 3). */
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
    // Propiedad 4: guarda de petición en vuelo.
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
          // Propiedad 7: el punto no vino. Se conserva el último valor
          // bueno y se cuenta el fallo; solo tras N ciclos se declara
          // rancio. Un hueco puntual no debe parpadear en pantalla.
          const previo = values.get(name);
          if (previo) previo.misses += 1;
          else values.set(name, { value: null, quality: null, ok: false, receivedAt: null, misses: 1 });
          continue;
        }

        // Propiedad 8: la calidad se filtra AQUÍ, en la frontera.
        const ok = isGoodQuality(bruto.quality);
        values.set(name, {
          value: ok ? bruto.value : null,
          quality: bruto.quality ?? null,
          ok,
          receivedAt: ahora,
          misses: 0,
        });
      }

      // Propiedad 6: el éxito reinicia el backoff.
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
    // Propiedad 5: con la pestaña oculta no se agenda nada.
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
        // Al volver al foco, refresco inmediato: lo primero que ve el
        // usuario no puede ser el estado de hace media hora.
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
   * Propiedad 1: alta de puntos con conteo de referencias.
   *
   * La función de baja es idempotente. Importa por React 18 en
   * StrictMode, que monta, desmonta y vuelve a montar en desarrollo
   * (riesgo R-06): con el conteo la secuencia +1 −1 +1 deja exactamente
   * una referencia, y una baja repetida no puede dejarla en negativo.
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
    const v = values.get(name);
    if (!v) return { value: null, ok: false, stale: true, receivedAt: null };
    return {
      value: v.ok ? v.value : null,
      ok: v.ok,
      stale: v.misses >= staleAfterCycles,
      receivedAt: v.receivedAt,
    };
  }

  return {
    acquire,
    onUpdate,
    get,
    start,
    stop,
    poll,
    /** Instantánea de instrumentación. Alimenta el contador de la Fase 3.5. */
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
