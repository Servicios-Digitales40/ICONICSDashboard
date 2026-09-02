/**
 * backend/ia/herramientas/lib/formato.mjs
 * ------------------------------------------------------------------
 * Las tres piezas de PRESENTACIÓN que comparten varias herramientas: reducir
 * una serie para que se pueda dibujar, poner una banda de umbrales en palabras
 * y adjuntar el aviso de procedencia de esos umbrales.
 *
 * ── POR QUÉ SON LAS PRIMERAS QUE SALEN ─────────────────────────────
 *
 * Porque son las únicas del archivo que no dependen de NADA. Vivían dentro de
 * `createHerramientas` —una clausura de 3500 líneas construida alrededor del
 * `client` de ICONICS— pero ninguna de las tres lo tocaba: no leen del
 * servidor, no reciben configuración y no guardan estado. Estaban ahí porque
 * el archivo creció a su alrededor, no porque necesitaran estarlo.
 *
 * Sacarlas es la primera fase del reparto y la más barata: no cambia ninguna
 * firma, no obliga a pasar un contexto y no toca ninguna herramienta. Lo único
 * que cambia es de dónde se importan.
 *
 * ── LO QUE NO PUEDE PASAR AQUÍ ─────────────────────────────────────
 *
 * Que entre `client`, `turnos` o cualquier otro parámetro de la factoría. En
 * cuanto una de estas funciones necesite algo de fuera deja de ser de este
 * archivo y pasa a `historia.mjs` o `maquina.mjs`, que sí reciben contexto.
 * Este módulo es la frontera: lo que está aquí se puede llamar desde cualquier
 * sitio, incluido un test, sin montar nada.
 */
import { PROVISIONALES } from '../../../../shared/eva/comun/umbrales.js'

/**
 * Reduce una serie a como mucho `max` puntos, promediando por grupos.
 *
 * Sólo para el DIBUJO de `generar_reporte` (Plan 14 Fase 5): el SVG de
 * `renderizarGraficoSerie` tiene 640 px de ancho fijo y fue pensado para
 * las ventanas cortas del resto de herramientas (como mucho ~100 puntos,
 * el tope del historiador por petición). Un reporte de varios días junta
 * muchas de esas peticiones, y sin reducir el trazo se convierte en un
 * bloque sólido ilegible. Promediar por grupo (y no descartar puntos sin
 * más) conserva la forma de la curva; los extremos EXACTOS para el
 * resumen numérico siguen viniendo de la serie completa, sin pasar por
 * aquí.
 */
export function downsamplear(muestras, max) {
  if (muestras.length <= max) return muestras

  const factor = Math.ceil(muestras.length / max)
  const resultado = []
  for (let i = 0; i < muestras.length; i += factor) {
    const grupo = muestras.slice(i, i + factor)
    const suma = grupo.reduce((acc, m) => acc + m.valor, 0)
    resultado.push({ t: grupo[Math.floor(grupo.length / 2)].t, valor: suma / grupo.length })
  }
  return resultado
}

/* ── Presentación de una señal ─────────────────────────────────────── */

/**
 * Una señal evaluada → lo que el modelo puede citar.
 *
 * ── POR QUÉ VIAJA LA BANDA Y NO SOLO EL ESTADO ─────────────────────
 *
 * Porque «en aviso» sin el número del umbral no es accionable: el operador
 * no sabe si está rozando el límite o muy pasado. Y porque el modelo tiene
 * prohibido hacer aritmética, así que si no le damos la banda no puede
 * decir cuánto margen queda — lo estimaría, que es exactamente lo que no
 * queremos.
 *
 * `unidad` es `null` cuando el servidor no la declara, y entonces viaja
 * `nota` diciéndolo. Es la diferencia entre «el caudal es 12,4» y «el caudal
 * es 12,4 l/s»: lo segundo nadie nos ha dicho que sea verdad.
 */
/**
 * La banda en palabras que el modelo pueda copiar sin restar nada.
 *
 * `null` en un extremo significa **sin límite por ese lado**, no cero: una
 * eficiencia energética no es peor por ser alta. Escribirlo como «sin límite»
 * y no omitirlo evita que el modelo rellene el hueco con un 0 inventado.
 */
export function bandaLegible(u) {
  const lado = (v) => (v === null || v === undefined ? 'sin límite' : v)
  return {
    limiteInferior: lado(u.min),
    avisoInferior: lado(u.avisoMin),
    avisoSuperior: lado(u.avisoMax),
    limiteSuperior: lado(u.max),
  }
}

/**
 * El aviso de procedencia de los umbrales, cuando toca.
 *
 * Va en el RESULTADO y no en el prompt del sistema por el mismo motivo por
 * el que iba el aviso de OEE imposible: una advertencia que sólo vive en las
 * instrucciones se diluye a los tres turnos de conversación, y ésta tiene que
 * acompañar a cada cifra que se compare contra una banda.
 */
export const avisoDeUmbrales = () =>
  PROVISIONALES
    ? {
      /*
       * La clave es `aviso` y no `avisoUmbrales`, y no es cosmético: es el
       * campo que `chat.mjs` vigila para añadir la advertencia detrás cuando
       * el modelo no la cuenta. Con cualquier otro nombre la red de
       * seguridad no se entera, y medido con el 4B eso pasa: contestó «el
       * nivel está fuera de límite» sin decir de quién era el límite.
       */
      aviso:
          'Los límites con los que se ha evaluado cada señal son estimaciones nuestras para un ' +
          'sistema de agua genérico, no rangos confirmados por quien opera esta instalación, y ' +
          'el servidor no publica alarmas para este árbol. El estado de cada señal es un ' +
          'cálculo del tablero, no un dato de ICONICS.',
    }
    : {}
