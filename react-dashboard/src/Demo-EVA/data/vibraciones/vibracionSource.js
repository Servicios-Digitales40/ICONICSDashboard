/**
 * Fuente de datos del SISTEMA DE VIBRACIONES, sobre el mismo motor de sondeo
 * que el tanque.
 *
 * ── QUÉ SUSTITUYE, Y QUÉ COSTABA ───────────────────────────────────
 *
 * Un `setInterval(leer, 5000)` dentro del propio hook. Funcionaba, y le
 * faltaban las cinco cosas que `lib/iconics/pollingEngine.js` ya hacía para la
 * otra máquina:
 *
 *   · conteo de referencias — CINCO componentes llaman a `useVibracion()`
 *     (`InicioVibraciones`, `Vibraciones`, `RiesgosVibracion`, `Vibraciones3D`
 *     y `CierreDiagnostico`). Cada uno abría su propio intervalo y su propia
 *     petición de 21 puntos. Dos montados a la vez eran el doble de carga
 *     contra el puente por el mismo dato.
 *   · guarda de petición en vuelo — si un ciclo tardaba más que la cadencia,
 *     el siguiente salía igual y se solapaban.
 *   · corte por visibilidad — un wallboard dejado en esta pestaña seguía
 *     pidiendo 21 puntos cada 5 s con la pantalla apagada.
 *   · backoff — con ICONICS caído, insistía al mismo ritmo hasta que volviera.
 *   · marca de rancio — un hueco puntual no se distingue de un punto que
 *     lleva minutos sin llegar.
 *
 * ── LO QUE SE UNIFICA ES EL CÓDIGO, NUNCA EL LOTE ──────────────────
 *
 * Esto es lo importante de esta fase y va en grande porque el propio arreglo
 * crea la tentación: en cuanto las dos máquinas usan el MISMO motor, pedir
 * `SISTEMAS.flatMap(s => s.puntos())` en una sola llamada parece una
 * simplificación obvia. No lo es. Sería meter las dos instalaciones en el
 * mismo lote y en el mismo búfer, a un `unir()` de distancia de que alguien
 * cruce el caudal de una con la vibración de la otra.
 *
 * La cabecera de `shared/eva/comun/sistemas.js` lo dice con estas palabras:
 * «Un motor de sondeo POR SISTEMA. La unificación es del código, nunca del
 * lote.» Aquí se cumple porque cada fuente construye el SUYO, con los puntos
 * de su máquina y su propia cadencia.
 *
 * Hay una prueba que lo vigila: `motor-por-sistema.test.js`.
 *
 * ── POR QUÉ HAY UNA FUENTE POR TRANSPORTE, EN CACHÉ ────────────────
 *
 * El tanque comparte su fuente con un provider (`EvaProvider`). Esta sección
 * no cuelga de ninguno, y montarle uno obligaría a envolver cuatro rutas para
 * conseguir lo mismo. En su lugar, `fuenteDeVibracion()` guarda una fuente por
 * clase de transporte: los cinco consumidores comparten motor sin que la
 * estructura de rutas cambie.
 *
 * No hace falta pararla al desmontar. El motor deja de agendar solo cuando
 * nadie sostiene puntos —`poll()` sale antes de reagendar si no hay
 * referencias— y vuelve en cuanto alguien pide de nuevo.
 */
import { createPollingEngine } from "@/lib/iconics";
import { SISTEMA } from "@shared/eva/comun/sistemas.js";
import { createSistemaVibraciones } from "@shared/eva/vibraciones/sistemaVibraciones.js";

import { transporteDe } from "../comunes/transportes.js";
import { todosLosPuntos } from "../../domain/vibraciones.js";

/** La declara el registro; ver la nota en `data/comunes/evaSource.js`. */
export const CADENCIA_MS = SISTEMA.vibraciones.cadenciaMs;

export function createVibracionSource({ transport, intervalMs = CADENCIA_MS } = {}) {
  if (!transport?.read) {
    throw new Error("createVibracionSource requiere un transporte con read()");
  }

  const motor = createPollingEngine({ read: transport.read, intervalMs });

  /* Los puntos de ESTA máquina, una vez: el catálogo no cambia en marcha. */
  const puntos = todosLosPuntos();

  /**
   * Lo que el motor sabe ahora mismo de esta máquina.
   *
   * El recorrido del catálogo —tres canales por cinco familias, más el variador
   * y los contadores— vive en `sistemaVibraciones.js` y no aquí. Estuvo escrito
   * a mano en el hook y OTRA VEZ en `backend/ia/conversacion/herramientas.mjs`;
   * el síntoma de que divergieran no habría sido un error, sino el chat
   * contestando sobre un apoyo con los datos de otro.
   */
  function instantanea() {
    /*
     * `motor.get()` ya devuelve `null` por las DOS formas de no tener dato: la
     * mala calidad, y la calidad aceptable sin campo `value` —que es la que se
     * midió en el servidor real el 26-08-2026, `0x08000000` y sin `value`, y
     * la peligrosa, porque un `?? 0` descuidado la convertiría en un cero que
     * el motor de reglas leería como «vibración nula, todo perfecto».
     *
     * Que las dos acaben en `null` es contrato del motor desde el Plan 21 F2;
     * antes normalizaba la primera y dejaba pasar `undefined` en la segunda.
     */
    const { canales, variador, alarmas, sinDato, puntosPedidos } =
      createSistemaVibraciones((punto) => motor.get(punto).value);

    /*
     * ── `lastUpdated` SALE DE LAS LECTURAS, NO DE `stats` ──────────────
     *
     * `stats.ultimaLectura` dura lo que el proceso: recuerda el último ciclo
     * que fue bien aunque después se hayan soltado todos los puntos. Y soltarlos
     * pasa de verdad — cuando el último componente se desmonta, `acquire()`
     * devuelve una baja que BORRA los valores cacheados (`values.delete`).
     *
     * Con `stats` como fuente, volver a entrar en la sección daba un primer
     * instante con `loading: false` y los 73 puntos mudos, o sea la cinta de
     * «La máquina no está contestando» encendida sobre una máquina que estaba
     * perfectamente. Se vio al montar la vista dos veces seguidas.
     *
     * Derivándolo de los propios `receivedAt` el estado no puede mentir: si no
     * hay lecturas, no hay fecha, y eso es `loading`.
     */
    let lastUpdated = null;
    for (const punto of puntos) {
      const recibido = motor.get(punto).receivedAt;
      if (recibido && (!lastUpdated || recibido > lastUpdated)) lastUpdated = recibido;
    }

    /*
     * ── POR QUÉ NO ENTREGA CADA PUNTO MUDO (Plan 21 F3) ────────────────
     *
     * `sinDato` es una lista de NOMBRES: dice cuáles no entregaron y no por
     * qué. Aquí se enriquece con el motivo que el motor guardó de la calidad,
     * porque este archivo es el que conoce el transporte y el dominio no tiene
     * por qué.
     *
     * El reparto es lo que hace útil la cifra: «43 de 73 mudos» no dice nada
     * accionable, y «43 mudos, los 43 porque el punto dejó de entregar» apunta
     * a la máquina; si fueran 43 con calidad mala, apuntaría al cableado.
     * Ver `motivoDeCalidad` en `shared/quality.js`.
     */
    const porMotivo = {};
    const detalleSinDato = sinDato.map((punto) => {
      const motivo = motor.get(punto).motivo;
      const codigo = motivo?.codigo ?? "sin_lectura";
      porMotivo[codigo] = (porMotivo[codigo] ?? 0) + 1;
      return { punto, motivo };
    });

    const stats = motor.stats();
    const conDato = lastUpdated !== null;

    return {
      canales,
      variador,
      alarmas,
      // Mismo criterio que el tanque: se está cargando mientras no haya llegado
      // nada Y no haya error. Un error con datos previos no borra la pantalla;
      // se advierte encima y se sigue enseñando lo último bueno.
      loading: !conDato && !stats.ultimoError,
      error: conDato ? null : stats.ultimoError ?? null,
      lastUpdated,
      /* Se mantiene como lista de NOMBRES: es lo que las cuatro vistas
         consumen, y casi todas sólo miran su longitud. El porqué viaja al
         lado, en `detalleSinDato` y `sinDatoPorMotivo`, para que añadirlo no
         obligue a tocar ninguna. */
      puntosSinDato: sinDato,
      detalleSinDato,
      sinDatoPorMotivo: porMotivo,
      puntosPedidos,
    };
  }

  return {
    /**
     * Alta de los puntos de ESTA máquina. Devuelve la baja, que hay que llamar
     * al desmontar: es lo que permite al motor contar referencias y dejar de
     * sondear cuando nadie mira.
     */
    subscribeVibracion(cb) {
      const baja = motor.acquire(puntos);
      motor.start();
      const off = motor.onUpdate(() => cb(instantanea()));

      // Un primer aviso inmediato: la vista no debe esperar al primer ciclo
      // para saber siquiera que está cargando.
      cb(instantanea());

      return () => {
        off();
        baja();
      };
    },
    stop: motor.stop,
    /** Instrumentación del motor, para la vista de diagnóstico. */
    stats: motor.stats,
  };
}

/**
 * Una fuente por clase de transporte, compartida por todos los consumidores.
 *
 * Ver la cabecera: es lo que hace que los cinco componentes que llaman a
 * `useVibracion()` compartan un solo motor sin montar un provider.
 */
const porTransporte = new Map();

export function fuenteDeVibracion(transporte) {
  if (!porTransporte.has(transporte)) {
    porTransporte.set(
      transporte,
      createVibracionSource({ transport: transporteDe("vibraciones", transporte) })
    );
  }
  return porTransporte.get(transporte);
}

/** Sólo para las pruebas: olvida las fuentes cacheadas. */
export function olvidarFuentesDeVibracion() {
  for (const fuente of porTransporte.values()) fuente.stop();
  porTransporte.clear();
}
