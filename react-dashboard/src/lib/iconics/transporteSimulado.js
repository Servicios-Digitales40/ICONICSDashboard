/**
 * Transporte simulado, sin instalación: la mecánica de servir un lote falso.
 *
 * ── QUÉ HACE AQUÍ Y NO EN CADA MÁQUINA ─────────────────────────────
 *
 * Esto no sabe de agua ni de acelerómetros, y no puede saberlo: `lib/` es
 * infraestructura compartida y no debe conocer ninguna instalación. Lo que sí
 * es suyo es todo lo que rodea al valor — la latencia, el fallo de la petición
 * entera, el hueco, la calidad mala, el no finito y la forma `Map(nombre →
 * { value, quality })` que espera el motor de sondeo.
 *
 * Es el mismo criterio que ya aplica `caos.js`, y con la misma frase: los
 * grados de caos «son un ajuste del ENTORNO, no de una instalación». El
 * transporte también lo es. La FÍSICA entra por parámetro (`modelo`), así que
 * la dependencia va en el sentido correcto y este archivo no importa ningún
 * catálogo.
 *
 * ── DE DÓNDE SALE ──────────────────────────────────────────────────
 *
 * De dos copias. `Demo-EVA/data/tanque/simulador.js` y `data/vibraciones/simuladorVibracion.js`
 * tenían el mismo cuerpo con una línea distinta: cómo se pedía el valor. Con
 * dos máquinas eso era tolerable; con la tercera, el patrón que ya ha fallado
 * dos veces en este proyecto —un simulador que sólo conoce un árbol— vuelve a
 * aparecer, y esta vez por triplicado.
 *
 * ── EL CONTRATO DEL `modelo` ───────────────────────────────────────
 *
 *   modelo(nombreDePunto, ms) → valor | null | undefined
 *
 *   `undefined`  el punto NO es de esta máquina. Se deja fuera de la
 *                respuesta, igual que hace el servidor real con lo que no
 *                tiene: para el motor eso es un hueco, que es lo que es.
 *   `null`       el punto ES de esta máquina y ahora mismo no entrega valor.
 *                Se sirve como lo sirve el servidor —calidad de «sin dato» y
 *                **sin campo `value`**—, nunca como un cero.
 *   otra cosa    el valor: número, booleano o cadena.
 *
 * Esa distinción de tres estados es la razón de que el `modelo` no sea
 * simplemente `(clave) => número`. Un simulador que sólo supiera devolver
 * valores buenos dejaría sin ejercitar la mitad de la interfaz que declara lo
 * que NO se pudo leer, y esa mitad es la que separa una pantalla en verde de
 * una pantalla ciega.
 */
import { QUALITY_GOOD, QUALITY_SIN_DATO, QUALITY_UNCERTAIN } from "@shared/quality.js";

import { CAOS_SUAVE } from "./caos.js";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Un transporte con la misma firma que `createRealTransport()`.
 *
 * @param {object}   opciones
 * @param {function} opciones.modelo    `(nombre, ms)` → valor | null | undefined
 * @param {object}   [opciones.chaos]   grado de caos (ver `caos.js`)
 * @param {function} [opciones.ahora]   reloj, inyectable para pruebas
 * @param {function} [opciones.rnd]     azar, inyectable para pruebas
 * @param {string}   [opciones.etiqueta] nombre en el mensaje de error simulado,
 *                                       para saber qué máquina falló al leer
 *                                       una traza con dos sondeos en marcha
 */
export function createTransporteSimulado({
  modelo,
  chaos = CAOS_SUAVE,
  ahora = () => Date.now(),
  rnd = Math.random,
  etiqueta = "simulador",
} = {}) {
  if (typeof modelo !== "function") {
    throw new Error("createTransporteSimulado necesita un `modelo`");
  }

  async function read(pointNames) {
    if (chaos.latenciaMs > 0) await espera(chaos.latenciaMs);

    // Fallo de la petición entera, como un servidor caído o un token caducado.
    // Debe disparar el backoff del motor.
    if (rnd() < chaos.errorPeticion) {
      throw new Error(`${etiqueta}: fallo simulado de la petición`);
    }

    const t = ahora();
    const salida = new Map();

    for (const name of pointNames) {
      const valor = modelo(name, t);

      // No es de esta máquina: ni siquiera se cuenta como hueco suyo.
      if (valor === undefined) continue;

      // Punto ausente de la respuesta: no es un error, es un hueco silencioso.
      if (rnd() < chaos.ausente) continue;

      /* Existe y no entrega. Sin `value`, que es la forma medida en el
         servidor real — ver `QUALITY_SIN_DATO` en `@shared/quality.js`. */
      if (valor === null) {
        salida.set(name, { quality: QUALITY_SIN_DATO });
        continue;
      }

      let value = valor;
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

  return { read };
}
