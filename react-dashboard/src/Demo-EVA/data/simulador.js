/**
 * El simulador de Demo EVA: una instalación de agua entera, sin servidor y sin
 * red.
 *
 * Cumple la misma firma que el transporte real —`read(pointNames)`— más un
 * `readSerie()` que sustituye al historiador, y con eso el interruptor de origen
 * del Topbar sirve también esta sección. Ver docs/PLAN-9-SIMULADOR-EVA.md.
 *
 * ── POR QUÉ VIVE AQUÍ Y NO EN `lib/iconics/` ───────────────────────
 *
 * Porque `lib/` es infraestructura compartida y no debe conocer ninguna
 * instalación. Un simulador allí tendría que importar `domain/senales.js` para
 * saber qué puntos generar, invirtiendo la dependencia y rompiendo desde fuera
 * el pacto de que ese archivo es **el único de Demo EVA con nombres de tag**.
 * Lo que sí es compartido —la firma `read` y los presets de caos— vive en
 * `lib/iconics/`; lo que sabe de agua, aquí.
 *
 * ── EL VALOR ES FUNCIÓN DEL RELOJ DE PARED ─────────────────────────
 *
 * No hay `Math.random()` en ninguna señal: `valorEn(clave, ms)` es pura. Tres
 * propiedades salen gratis de ahí y las tres importan:
 *
 *  - La serie histórica **empalma** con el valor en vivo, porque las dos salen
 *    de la misma función. Con ruido aleatorio, la gráfica terminaría en un punto
 *    y la tarjeta enseñaría otro.
 *  - Recargar la página no da un salto.
 *  - Dos navegadores abiertos a la vez enseñan lo mismo.
 *
 * Lo único aleatorio es el CAOS —huecos, mala calidad, fallos de petición—, y
 * ahí la aleatoriedad es el punto: un hueco es un suceso pasajero, no una
 * propiedad de la línea de tiempo.
 *
 * ── DOS RELOJES, PORQUE LA PANTALLA MIRA A DOS ESCALAS ─────────────
 *
 *   Ciclo de bombeo · 6 min  → caudal, carga, presión, eficiencia, modo VDF.
 *     Corto a propósito: quien abre el tablero ve la marcha y el reposo sin
 *     tener que esperar. Es lo que ejercita `enReposo` y el estado `reposo`.
 *
 *   Deriva de jornada · 4 h  → nivel, temperatura, tensión.
 *     Es lo que da forma legible a la gráfica de 6 h. Con sólo el ciclo rápido,
 *     la media por tramo del historiador saldría plana.
 *
 * Encima van los EVENTOS: uno cada siete ciclos, rotando entre sobrecalentamiento,
 * caída de tensión y sobrecarga. Sin ellos, la pantalla de alertas sólo se podría
 * ver de casualidad; con ellos, aparece cada ~14 min y siempre por un motivo
 * coherente (la sobrecarga del motor hunde además la eficiencia, como haría una
 * de verdad).
 */
import { QUALITY_GOOD } from "@shared/quality.js";
import { CAOS_SUAVE } from "@/lib/iconics";

import { esHistorizada, parsePointName, senalInfo } from "../domain/senales.js";
import { SIN_SERIE, VENTANA } from "./historia.js";

/** Calidad OPC "uncertain": lo que más se parece a un dato bueno sin serlo. */
const QUALITY_UNCERTAIN = 64;

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Onda senoidal en [-1, 1] con periodo y desfase propios. */
const onda = (ms, periodoMs, desfase = 0) => Math.sin(TAU * (ms / periodoMs + desfase));

/* ── Los dos relojes ────────────────────────────────────────────── */

/** Ciclo de bombeo completo: marcha + paro. */
export const CICLO_MS = 6 * 60_000;

/** Qué parte del ciclo está la bomba impulsando. */
const FRACCION_MARCHA = 0.75;

/** Deriva lenta que da forma a las gráficas del historiador. */
export const JORNADA_MS = 4 * 3_600_000;

/** Posición dentro del ciclo de bombeo, en [0, 1). */
export const faseCiclo = (ms) => frac(ms / CICLO_MS);

/** ¿Está la bomba impulsando en este instante? */
export const enMarcha = (ms) => faseCiclo(ms) < FRACCION_MARCHA;

/**
 * Rizado determinista: pequeño, rápido y distinto por señal.
 *
 * Existe para que los números **se muevan** entre ciclos de 3 s. Sin él, el
 * valor de una señal sería idéntico durante minutos y la pantalla parecería
 * congelada, que es justo la sensación que el tablero tiene que desmentir.
 */
function rizado(ms, semilla, amplitud) {
  return (
    amplitud *
    (Math.sin(TAU * (ms / 11_000 + semilla * 0.37)) * 0.6 +
      Math.sin(TAU * (ms / 4_300 + semilla * 0.71)) * 0.4)
  );
}

/* ── Eventos ────────────────────────────────────────────────────── */

/**
 * Qué le pasa a la instalación en cada ciclo. La cadena se recorre por índice de
 * ciclo, así que es determinista y se repite cada 42 min.
 */
const EVENTOS = ["", "", "sobrecalentamiento", "", "caidaTension", "", "sobrecarga"];

/** Cuándo empieza y acaba un evento dentro de su ciclo. */
const EVENTO_DESDE = 0.3;
const EVENTO_HASTA = 0.62;

/**
 * Evento activo, con su intensidad en [0, 1].
 *
 * La intensidad sube y baja como medio seno en vez de encenderse de golpe: una
 * transición instantánea haría imposible ver los estados intermedios, que son
 * los que la franja de atención pinta en ámbar antes de ponerse en coral.
 */
export function eventoDe(ms) {
  const nombre = EVENTOS[Math.floor(ms / CICLO_MS) % EVENTOS.length];
  if (!nombre) return null;

  const f = faseCiclo(ms);
  if (f < EVENTO_DESDE || f > EVENTO_HASTA) return null;

  return {
    nombre,
    intensidad: Math.sin(Math.PI * ((f - EVENTO_DESDE) / (EVENTO_HASTA - EVENTO_DESDE))),
  };
}

/**
 * Arrastra un valor hacia un objetivo con la intensidad del evento.
 *
 * ── POR QUÉ NO SE SUMA UN DELTA Y YA ───────────────────────────────
 *
 * Se hacía así y no servía: el punto de partida depende de la deriva de jornada,
 * así que una misma subida cruzaba el límite duro a unas horas y a otras se
 * quedaba corta. Un evento que **a veces** dispara la alerta es peor que ninguno
 * — la pantalla de crítico se vuelve algo que se ve de casualidad, y la prueba
 * que lo comprueba pasa o falla según el reloj.
 *
 * Interpolando hacia un objetivo, el pico está garantizado y se puede elegir
 * sabiendo dos cosas a la vez: que queda al otro lado del umbral de
 * `domain/umbrales.js` y que sigue dentro de la `escala` del catálogo.
 */
const haciaObjetivo = (base, objetivo, intensidad) => base + (objetivo - base) * intensidad;

/**
 * A dónde lleva cada evento a su señal. El comentario de cada uno es el par que
 * lo justifica: el umbral que cruza y la escala que respeta.
 */
const OBJETIVO = {
  /** Límite duro 45 °C · escala 0-60. */
  temperaturaTanque: 49,
  /** Límite duro 95 % · escala 0-100. */
  cargaMotor: 99,
  /** Límite duro inferior 105 V · escala 90-150. */
  tensionLinea: 99,
  /** Umbral de aviso 55 % sin llegar al duro de 30 · escala 0-100. */
  eficienciaEnergetica: 42,
};

/* ── El modelo ──────────────────────────────────────────────────── */

/**
 * Valor de una señal en un instante. Pura y determinista.
 *
 * Las bandas de referencia son las de `domain/umbrales.js`; los rangos que
 * produce cada rama están elegidos para **cruzarlas**, no para quedarse cómodas
 * dentro. Una señal que nunca sale de `nominal` deja sin ejercitar la mitad de la
 * interfaz.
 */
export function valorEn(clave, ms) {
  const marcha = enMarcha(ms);
  const fc = faseCiclo(ms);
  const ev = eventoDe(ms);
  const dia = onda(ms, JORNADA_MS);

  switch (clave) {
    /* Se vacía impulsando y se rellena en el paro, sobre una deriva de jornada
       que lo lleva de ~20 % a ~91 %. Cruza los dos umbrales de aviso (25 y 90)
       una vez por jornada y no llega a los duros (15 y 95) por sí solo. */
    case "nivelTanque": {
      const base = 57 + 34 * dia;
      const vaciado = marcha
        ? -3.5 * (fc / FRACCION_MARCHA)
        : -3.5 * (1 - (fc - FRACCION_MARCHA) / (1 - FRACCION_MARCHA));
      return base + vaciado + rizado(ms, 1, 0.25);
    }

    /* Se calienta mientras la bomba trabaja y se relaja en el paro. El evento la
       lleva por encima de los 45 °C, que es su límite duro. */
    case "temperaturaTanque": {
      const calor = marcha
        ? 3.2 * (fc / FRACCION_MARCHA)
        : 3.2 * (1 - (fc - FRACCION_MARCHA) / (1 - FRACCION_MARCHA));
      const base = 24 + 7.5 * onda(ms, JORNADA_MS, 0.18) + calor + rizado(ms, 2, 0.2);

      return ev?.nombre === "sobrecalentamiento"
        ? haciaObjetivo(base, OBJETIVO.temperaturaTanque, ev.intensidad)
        : base;
    }

    /* Cero exacto en el paro: es una de las dos señales que `enReposo` mira, y
       tiene que quedar por debajo de su umbral (1 %) sin ambigüedad. */
    case "cargaMotor": {
      if (!marcha) return 0;
      const base = 61 + 13 * onda(ms, JORNADA_MS * 0.7, 0.4) + rizado(ms, 3, 1.1);

      return ev?.nombre === "sobrecarga"
        ? haciaObjetivo(base, OBJETIVO.cargaMotor, ev.intensidad)
        : base;
    }

    /* Manual durante el paro de uno de cada tres ciclos: alguien ha intervenido
       el variador. Cada 18 min, que es bastante para verlo sin que sea el estado
       habitual. */
    case "modoVdf":
      return !marcha && Math.floor(ms / CICLO_MS) % 3 === 0;

    /* La otra señal de `enReposo`. Queda un residual de ~0,12 —una red nunca
       marca cero clavado— por debajo del umbral de 0,5. */
    case "flujoInstantaneo": {
      if (!marcha) return 0.12 + rizado(ms, 5, 0.05);
      return 27 + 9 * onda(ms, JORNADA_MS * 0.85, 0.55) + rizado(ms, 5, 0.6);
    }

    /* En el paro la red se queda sin presión: 0,22 está POR DEBAJO de su límite
       duro (0,5), así que la banda cruda es `critico` mientras el estado es
       `reposo`. Esa discrepancia es deliberada — es el camino que la tarjeta
       explica, y sin ella no se ejecuta nunca. */
    case "presionRelativa": {
      if (!marcha) return 0.22 + rizado(ms, 6, 0.04);
      return 3.5 + 0.95 * onda(ms, JORNADA_MS * 0.9, 0.12) + rizado(ms, 6, 0.07);
    }

    /* Se mide con la instalación parada igual que en marcha, que es cuando más
       importa. El evento la hunde a ~100 V, bajo el límite de 105. */
    case "tensionLinea": {
      const base = 121.4 + 3.4 * onda(ms, JORNADA_MS * 1.3, 0.7) + rizado(ms, 7, 0.35);

      return ev?.nombre === "caidaTension"
        ? haciaObjetivo(base, OBJETIVO.tensionLinea, ev.intensidad)
        : base;
    }

    /* La sobrecarga del motor se la lleva por delante, que es lo que haría una
       de verdad: el mismo evento mueve dos señales de forma coherente. */
    case "eficienciaEnergetica": {
      if (!marcha) return 0;
      const base = 70 + 11 * onda(ms, JORNADA_MS * 1.1, 0.33) + rizado(ms, 8, 0.7);

      return ev?.nombre === "sobrecarga"
        ? haciaObjetivo(base, OBJETIVO.eficienciaEnergetica, ev.intensidad)
        : base;
    }

    default:
      return null;
  }
}

/** Cuántas submuestras se promedian por punto de la rejilla histórica. */
const SUBMUESTRAS = 16;

/**
 * Media de una señal en un tramo. Es lo que hace de verdad el agregado `Average`
 * del servidor, y no es cosmética: una rejilla de 15 min muestreada puntualmente
 * sobre un ciclo de 6 min devolvería aliasing sin significado. Promediando, el
 * ciclo rápido se disuelve y queda la deriva de jornada — la misma lectura que
 * daría el historiador real.
 */
export function mediaDelTramo(clave, desdeMs, hastaMs) {
  const paso = (hastaMs - desdeMs) / SUBMUESTRAS;
  let suma = 0;
  for (let i = 0; i < SUBMUESTRAS; i++) {
    suma += valorEn(clave, desdeMs + (i + 0.5) * paso);
  }
  return suma / SUBMUESTRAS;
}

/* ── El transporte ──────────────────────────────────────────────── */

/**
 * Transporte simulado para el árbol de Demo EVA.
 *
 * `ahora` y `rnd` se inyectan para poder fijar el reloj y el azar en las
 * pruebas; en la aplicación son el reloj del sistema y `Math.random`.
 */
export function createTransporteEva({
  chaos = CAOS_SUAVE,
  ahora = () => Date.now(),
  rnd = Math.random,
} = {}) {
  /**
   * Lectura en lote, con la misma firma que el transporte real.
   *
   * Un punto que no sea de este árbol se ignora en silencio, igual que hace
   * el transporte real con los que el servidor no tiene: para el motor eso es un
   * hueco, que es exactamente lo que es.
   */
  async function read(pointNames) {
    if (chaos.latenciaMs > 0) await espera(chaos.latenciaMs);

    // Fallo de la petición entera, como un servidor caído o un token caducado.
    // Debe disparar el backoff del motor.
    if (rnd() < chaos.errorPeticion) {
      throw new Error("simulador EVA: fallo simulado de la petición");
    }

    const t = ahora();
    const salida = new Map();

    for (const name of pointNames) {
      const clave = parsePointName(name);
      if (!clave) continue;

      // Punto ausente de la respuesta: no es un error, es un hueco silencioso.
      if (rnd() < chaos.ausente) continue;

      let value = valorEn(clave, t);
      let quality = QUALITY_GOOD;

      if (rnd() < chaos.malaCalidad) {
        // Mala calidad que llega con un cero, igual que hace ICONICS.
        quality = QUALITY_UNCERTAIN;
        value = 0;
      } else if (typeof value === "number" && rnd() < chaos.noFinito) {
        value = rnd() < 0.5 ? Infinity : NaN;
      }

      salida.set(name, { value, quality });
    }

    return salida;
  }

  /**
   * Serie histórica, en el lugar del historiador.
   *
   * **Repite la guarda de `data/historia.js` a propósito.** Cuatro de las ocho
   * señales no tienen serie propia en el servidor real, y la interfaz está
   * construida sobre ese hecho: la banda de KPIs son las cuatro historizadas y la
   * carga del motor se alimenta del búfer de sesión porque no puede pedir serie.
   * Un simulador que devolviera ocho series enseñaría a la pantalla una
   * instalación que no existe, y se rompería al volver a datos reales.
   *
   * Devuelve `{ datos, motivo }` con la misma forma que el lector real: `datos`
   * son `[{ t: Date, valor }]` y `motivo` es un texto cuando no hay serie que
   * pedir. Nunca las dos cosas a la vez.
   */
  async function readSerie(clave, { horas, puntos } = VENTANA) {
    if (!senalInfo(clave)) return { datos: [], motivo: `Señal desconocida: ${clave}` };
    if (!esHistorizada(clave)) return { datos: [], motivo: SIN_SERIE };

    if (chaos.latenciaMs > 0) await espera(chaos.latenciaMs);

    const h = horas ?? VENTANA.horas;
    const n = puntos ?? VENTANA.puntos;

    const fin = ahora();
    const pasoMs = (h * 3_600_000) / n;
    const datos = [];

    for (let i = n - 1; i >= 0; i--) {
      const cierre = fin - i * pasoMs;

      // El historiador real también deja tramos sin muestra, y `normalizar` los
      // descarta. Aquí se reproduce el hueco para que la gráfica se escriba
      // sabiendo que la rejilla puede venir incompleta.
      if (rnd() < chaos.ausente) continue;

      datos.push({ t: new Date(cierre), valor: mediaDelTramo(clave, cierre - pasoMs, cierre) });
    }

    return { datos, motivo: null };
  }

  return { read, readSerie };
}
