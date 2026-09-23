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
 * De dos copias. `Demo-EVA/data/tanque/simulador.js` y el simulador de
 * vibraciones del frontend (retirado con la máquina escrita a mano, Plan 40)
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
import { MAX_PUNTOS, VENTANA } from "@shared/eva/comun/historia.js";
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

  /**
   * `{ horas, puntos }` (relativo a `ahora()`) o `{ inicio, fin }` (absoluto) →
   * el fin, el paso y cuántas muestras. Mismo criterio que el lector real
   * (`Demo-EVA/data/comunes/historia.js`): un rango absoluto pide `MAX_PUNTOS`.
   */
  function resolverRangoSimulado(rango) {
    if (rango?.inicio instanceof Date && rango?.fin instanceof Date) {
      const finMs = rango.fin.getTime();
      const inicioMs = rango.inicio.getTime();
      return { inicioMs, finMs, pasoMs: (finMs - inicioMs) / MAX_PUNTOS, n: MAX_PUNTOS };
    }
    const h = rango?.horas ?? VENTANA.horas;
    const n = rango?.puntos ?? VENTANA.puntos;
    const finMs = ahora();
    return { inicioMs: finMs - h * 3_600_000, finMs, pasoMs: (h * 3_600_000) / n, n };
  }

  /**
   * La serie «histórica» de un punto: el mismo `modelo` muestreado hacia
   * atrás sobre la rejilla del rango (Plan 42.5 F1, D10).
   *
   * Existe para que una máquina configurada en origen simulado tenga historia
   * como la tiene en vivo, con la MISMA forma que devuelve el lector real
   * —`{ datos, motivo, hasMore, cobertura }`— para que quien pinte no sepa
   * cuál de los dos contestó. Habla en nombres de punto, como `read()`: la
   * guarda de «esta clave tiene serie verificada» no es del transporte, es
   * de quien conoce la máquina, y la aplica la fuente antes de llegar aquí.
   *
   * Un punto que el modelo no conoce (`undefined`) vuelve con `motivo` y sin
   * muestras: no es de esta máquina y no se le inventa una curva. Un instante
   * en que el modelo no tiene valor (`null`, o no finito) es un hueco de la
   * rejilla, como los que deja el historiador real y `normalizar` descarta.
   *
   * Comparte con `read()` la latencia y el fallo de petición del caos: sin
   * eso, una gráfica simulada respondería siempre mientras el tile de al lado
   * cae, algo que el servidor real no promete.
   */
  async function readSerie(pointName, rango = VENTANA) {
    if (chaos.latenciaMs > 0) await espera(chaos.latenciaMs);
    if (rnd() < chaos.errorPeticion) {
      throw new Error(`${etiqueta}: fallo simulado de la petición al historiador`);
    }

    const { inicioMs, finMs, pasoMs, n } = resolverRangoSimulado(rango);
    const datos = [];

    for (let i = n - 1; i >= 0; i--) {
      const cierre = finMs - i * pasoMs;
      const valor = modelo(pointName, cierre);
      if (valor === undefined) {
        return {
          datos: [],
          motivo: `${etiqueta}: el punto ${pointName} no es de esta máquina`,
          hasMore: false,
          cobertura: null,
        };
      }
      if (rnd() < chaos.ausente) continue;
      if (valor === null || typeof valor !== "number" || !Number.isFinite(valor)) continue;
      datos.push({ t: new Date(cierre), valor });
    }

    return {
      datos,
      motivo: null,
      hasMore: false,
      cobertura: {
        tramos: 1,
        tramosConDato: datos.length ? 1 : 0,
        completa: datos.length > 0,
        desde: datos.length ? new Date(inicioMs) : null,
        hasta: datos.length ? new Date(finMs) : null,
      },
    };
  }

  return { read, readSerie };
}
