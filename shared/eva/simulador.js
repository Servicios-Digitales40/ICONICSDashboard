/**
 * El modelo físico de la instalación de agua de Demo EVA: **la señal, no el
 * transporte**.
 *
 * Es una función pura del reloj de pared —`valorEn(clave, ms)`— y nada más.
 * Vive en `shared/` porque dos programas la necesitan igual: el simulador del
 * FRONTEND (`Demo-EVA/data/simulador.js`), que la sirve por el mismo hueco por
 * el que entrarían datos reales de ICONICS, y el transporte falso del BACKEND
 * (`backend/iconics/fakeClient.mjs`, `ICONICS_FAKE=true`), que la sirve con la
 * forma exacta del cliente REST. Mismo criterio que ya movió `senales.js` e
 * `historia.js` aquí: las reglas de la instalación no se repiten en los dos
 * lados.
 *
 * ── POR QUÉ ES PURA ─────────────────────────────────────────────────
 *
 * No hay `Math.random()` en ninguna señal. Tres propiedades salen gratis de
 * ahí y las tres importan:
 *
 *  - La serie histórica **empalma** con el valor en vivo, porque las dos salen
 *    de la misma función.
 *  - Recargar la página —o reiniciar el backend— no da un salto.
 *  - El frontend y el backend, sirviendo el mismo instante, enseñan lo mismo.
 *
 * Lo único aleatorio —huecos, mala calidad, fallos de petición— es cosa de
 * cada transporte, no de este archivo: un hueco es un suceso pasajero del
 * TRANSPORTE, no una propiedad de la señal.
 *
 * ── DOS RELOJES, PORQUE LA PANTALLA MIRA A DOS ESCALAS ─────────────
 *
 *   Ciclo de bombeo · 6 min  → caudal, carga, presión, eficiencia, modo VDF.
 *   Deriva de jornada · 4 h  → nivel, temperatura, tensión.
 *
 * Encima van los EVENTOS: uno cada siete ciclos, rotando entre
 * sobrecalentamiento, caída de tensión y sobrecarga.
 */

import { parsePointName } from './senales.js'

const TAU = Math.PI * 2
const frac = x => x - Math.floor(x)

/** Onda senoidal en [-1, 1] con periodo y desfase propios. */
const onda = (ms, periodoMs, desfase = 0) => Math.sin(TAU * (ms / periodoMs + desfase))

/* ── Los dos relojes ────────────────────────────────────────────── */

/** Ciclo de bombeo completo: marcha + paro. */
export const CICLO_MS = 6 * 60_000

/** Qué parte del ciclo está la bomba impulsando. */
const FRACCION_MARCHA = 0.75

/** Deriva lenta que da forma a las gráficas del historiador. */
export const JORNADA_MS = 4 * 3_600_000

/** Posición dentro del ciclo de bombeo, en [0, 1). */
export const faseCiclo = ms => frac(ms / CICLO_MS)

/** ¿Está la bomba impulsando en este instante? */
export const enMarcha = ms => faseCiclo(ms) < FRACCION_MARCHA

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
  )
}

/* ── Eventos ────────────────────────────────────────────────────── */

/**
 * Qué le pasa a la instalación en cada ciclo. La cadena se recorre por índice
 * de ciclo, así que es determinista y se repite cada 42 min.
 */
const EVENTOS = ['', '', 'sobrecalentamiento', '', 'caidaTension', '', 'sobrecarga']

/** Cuándo empieza y acaba un evento dentro de su ciclo. */
const EVENTO_DESDE = 0.3
const EVENTO_HASTA = 0.62

/**
 * Evento activo, con su intensidad en [0, 1].
 *
 * La intensidad sube y baja como medio seno en vez de encenderse de golpe:
 * una transición instantánea haría imposible ver los estados intermedios, que
 * son los que la franja de atención pinta en ámbar antes de ponerse en coral.
 */
export function eventoDe(ms) {
  const nombre = EVENTOS[Math.floor(ms / CICLO_MS) % EVENTOS.length]
  if (!nombre) return null

  const f = faseCiclo(ms)
  if (f < EVENTO_DESDE || f > EVENTO_HASTA) return null

  return {
    nombre,
    intensidad: Math.sin(Math.PI * ((f - EVENTO_DESDE) / (EVENTO_HASTA - EVENTO_DESDE))),
  }
}

/**
 * Arrastra un valor hacia un objetivo con la intensidad del evento.
 *
 * ── POR QUÉ NO SE SUMA UN DELTA Y YA ───────────────────────────────
 *
 * Se hacía así y no servía: el punto de partida depende de la deriva de
 * jornada, así que una misma subida cruzaba el límite duro a unas horas y a
 * otras se quedaba corta. Interpolando hacia un objetivo, el pico está
 * garantizado.
 */
const haciaObjetivo = (base, objetivo, intensidad) => base + (objetivo - base) * intensidad

/**
 * A dónde lleva cada evento a su señal. El comentario de cada uno es el par
 * que lo justifica: el umbral que cruza y la escala que respeta.
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
}

/* ── El modelo ──────────────────────────────────────────────────── */

/**
 * Valor de una señal en un instante. Pura y determinista.
 *
 * Las bandas de referencia son las de `umbrales.js`; los rangos que produce
 * cada rama están elegidos para **cruzarlas**, no para quedarse cómodas
 * dentro.
 */
export function valorEn(clave, ms) {
  const marcha = enMarcha(ms)
  const fc = faseCiclo(ms)
  const ev = eventoDe(ms)
  const dia = onda(ms, JORNADA_MS)

  switch (clave) {
    /* Se vacía impulsando y se rellena en el paro, sobre una deriva de jornada
       que lo lleva de ~20 % a ~91 %. Cruza los dos umbrales de aviso (25 y 90)
       una vez por jornada y no llega a los duros (15 y 95) por sí solo. */
    case 'nivelTanque': {
      const base = 57 + 34 * dia
      const vaciado = marcha
        ? -3.5 * (fc / FRACCION_MARCHA)
        : -3.5 * (1 - (fc - FRACCION_MARCHA) / (1 - FRACCION_MARCHA))
      return base + vaciado + rizado(ms, 1, 0.25)
    }

    /* Se calienta mientras la bomba trabaja y se relaja en el paro. El evento
       la lleva por encima de los 45 °C, que es su límite duro. */
    case 'temperaturaTanque': {
      const calor = marcha
        ? 3.2 * (fc / FRACCION_MARCHA)
        : 3.2 * (1 - (fc - FRACCION_MARCHA) / (1 - FRACCION_MARCHA))
      const base = 24 + 7.5 * onda(ms, JORNADA_MS, 0.18) + calor + rizado(ms, 2, 0.2)

      return ev?.nombre === 'sobrecalentamiento'
        ? haciaObjetivo(base, OBJETIVO.temperaturaTanque, ev.intensidad)
        : base
    }

    /* Cero exacto en el paro: es una de las dos señales que `enReposo` mira, y
       tiene que quedar por debajo de su umbral (1 %) sin ambigüedad. */
    case 'cargaMotor': {
      if (!marcha) return 0
      const base = 61 + 13 * onda(ms, JORNADA_MS * 0.7, 0.4) + rizado(ms, 3, 1.1)

      return ev?.nombre === 'sobrecarga'
        ? haciaObjetivo(base, OBJETIVO.cargaMotor, ev.intensidad)
        : base
    }

    /* Manual durante el paro de uno de cada tres ciclos: alguien ha
       intervenido el variador. Cada 18 min, que es bastante para verlo sin
       que sea el estado habitual. */
    case 'modoVdf':
      return !marcha && Math.floor(ms / CICLO_MS) % 3 === 0

    /* La otra señal de `enReposo`. Queda un residual de ~0,12 —una red nunca
       marca cero clavado— por debajo del umbral de 0,5. */
    case 'flujoInstantaneo': {
      if (!marcha) return 0.12 + rizado(ms, 5, 0.05)
      return 27 + 9 * onda(ms, JORNADA_MS * 0.85, 0.55) + rizado(ms, 5, 0.6)
    }

    /* En el paro la red se queda sin presión: 0,22 está POR DEBAJO de su
       límite duro (0,5), así que la banda cruda es `critico` mientras el
       estado es `reposo`. Esa discrepancia es deliberada. */
    case 'presionRelativa': {
      if (!marcha) return 0.22 + rizado(ms, 6, 0.04)
      return 3.5 + 0.95 * onda(ms, JORNADA_MS * 0.9, 0.12) + rizado(ms, 6, 0.07)
    }

    /* Se mide con la instalación parada igual que en marcha, que es cuando
       más importa. El evento la hunde a ~100 V, bajo el límite de 105. */
    case 'tensionLinea': {
      const base = 121.4 + 3.4 * onda(ms, JORNADA_MS * 1.3, 0.7) + rizado(ms, 7, 0.35)

      return ev?.nombre === 'caidaTension'
        ? haciaObjetivo(base, OBJETIVO.tensionLinea, ev.intensidad)
        : base
    }

    /* La sobrecarga del motor se la lleva por delante, que es lo que haría
       una de verdad: el mismo evento mueve dos señales de forma coherente. */
    case 'eficienciaEnergetica': {
      if (!marcha) return 0
      const base = 70 + 11 * onda(ms, JORNADA_MS * 1.1, 0.33) + rizado(ms, 8, 0.7)

      return ev?.nombre === 'sobrecarga'
        ? haciaObjetivo(base, OBJETIVO.eficienciaEnergetica, ev.intensidad)
        : base
    }

    default:
      return null
  }
}

/**
 * El valor de un PUNTO, no de una clave de dominio. Pura.
 *
 * ── POR QUÉ EXISTE ESTA ENVOLTURA DE TRES LÍNEAS ───────────────────
 *
 * Porque es la firma que comparten todas las máquinas, y sin ella no había
 * ninguna. `valorEn` habla en claves (`nivelTanque`) porque es lo natural para
 * el tanque; el modelo del sistema de vibraciones habla en NOMBRES DE PUNTO,
 * porque sus 73 puntos no tienen una clave plana que los identifique — hacen
 * falta tipo, familia y canal.
 *
 * Un transporte simulado que quiera servir a las dos no puede elegir: necesita
 * la misma firma en las dos. Ésta es esa firma, y es el contrato que declara
 * cada sistema en `sistemas.js`:
 *
 *   modelo(nombreDePunto, ms) → valor | null | undefined
 *
 *   `undefined`  el punto no es de este árbol
 *   `null`       es de este árbol y ahora mismo no entrega valor
 *   otra cosa    el valor
 *
 * El tanque nunca devuelve `null`: sus ocho señales entregan siempre. Que el
 * caso exista igual no es ceremonia — es lo que permite que el mismo
 * transporte sirva a una máquina que sí se calla, como la de vibraciones.
 */
export function valorDePunto(nombre, ms) {
  const clave = parsePointName(nombre)
  return clave === null ? undefined : valorEn(clave, ms)
}

/** Cuántas submuestras se promedian por punto de la rejilla histórica. */
const SUBMUESTRAS = 16

/**
 * Media de una señal en un tramo. Es lo que hace de verdad el agregado
 * `Average` del servidor, y no es cosmética: una rejilla de 15 min muestreada
 * puntualmente sobre un ciclo de 6 min devolvería aliasing sin significado.
 * Promediando, el ciclo rápido se disuelve y queda la deriva de jornada — la
 * misma lectura que daría el historiador real.
 */
export function mediaDelTramo(clave, desdeMs, hastaMs) {
  const paso = (hastaMs - desdeMs) / SUBMUESTRAS
  let suma = 0
  for (let i = 0; i < SUBMUESTRAS; i++) {
    suma += valorEn(clave, desdeMs + (i + 0.5) * paso)
  }
  return suma / SUBMUESTRAS
}
