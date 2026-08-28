/**
 * El simulador del SISTEMA DE VIBRACIONES: el motor con acelerómetros entero,
 * sin servidor y sin red.
 *
 * Es el gemelo de `simulador.js` para la otra máquina, y existe por el mismo
 * motivo que aquel: con el origen en «Simulado», la sección de vibraciones
 * salía **entera sin dato** —veintiún puntos mudos, todas las reglas sin
 * comprobar y un aviso de «la máquina no está contestando» permanente—, que es
 * exactamente el fallo que el Plan 9 arregló para el tanque y que aquí se
 * repetía por haber nacido después.
 *
 * ── POR QUÉ ES OTRO TRANSPORTE Y NO UNA RAMA DEL DE EVA ────────────
 *
 * Porque `createTransporteEva` sirve el árbol del tanque: su `read` empieza
 * por `parsePointName`, que sólo conoce las ocho señales de `senales.js`, y su
 * `readSerie` está construido sobre la lista de historizadas de esa
 * instalación. Meter aquí las vibraciones exigiría que ese archivo importara
 * el catálogo de la otra máquina — el cruce que `vibraciones.js` pide no hacer.
 *
 * No hay `readSerie`, y no es un olvido: **ninguna señal de este catálogo está
 * historizada** (`esHistorizada` devuelve `false` en `vibraciones.js`, con su
 * porqué). Un simulador que sirviera series enseñaría a la pantalla una
 * instalación que no existe y se rompería al volver a datos reales.
 *
 * ── QUÉ ES SUYO Y QUÉ NO ───────────────────────────────────────────
 *
 * La FÍSICA es de `@shared/eva/simuladorVibraciones.js`, que la comparte con el
 * transporte falso del backend: dos programas sirviendo el mismo reloj de pared
 * tienen que ver la misma máquina. Aquí queda el TRANSPORTE — la firma `read`,
 * la latencia, el caos y cómo se traduce «este punto no entrega valor» a lo que
 * el servidor real haría con él.
 */
import { QUALITY_GOOD } from "@shared/quality.js";
import { CAOS_SUAVE } from "@/lib/iconics";
import { valorVibracionEn } from "@shared/eva/simuladorVibraciones.js";

export {
  CICLO_VIB_MS,
  JORNADA_VIB_MS,
  enMarchaVib,
  eventoVibDe,
  faseCicloVib,
  valorVibracionEn,
} from "@shared/eva/simuladorVibraciones.js";

/** Calidad OPC "uncertain": lo que más se parece a un dato bueno sin serlo. */
const QUALITY_UNCERTAIN = 64;

/**
 * Calidad que el servidor real devuelve para estos puntos cuando se apagan:
 * `0x08000000`, y **sin campo `value`**. Está medida, no supuesta — es la que
 * se vio el 26-08-2026 cuando quince de veintiún puntos dejaron de entregar.
 *
 * Se reproduce con esa forma exacta a propósito. El fallo peligroso de esta
 * pantalla no es el hueco: es que alguien escriba `?? 0` sobre un punto sin
 * `value` y convierta «no contesta» en «vibración nula, todo perfecto». Si el
 * simulador sirviera un cero con calidad mala, ese fallo nunca se vería aquí.
 */
const QUALITY_SIN_DATO = 0x08000000;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Transporte simulado para el árbol de vibraciones.
 *
 * Misma firma que `createRealTransport()`: `read(pointNames)` → `Map(nombre →
 * { value, quality })`. `ahora` y `rnd` se inyectan para fijar el reloj y el
 * azar en las pruebas.
 */
export function createTransporteVibracion({
  chaos = CAOS_SUAVE,
  ahora = () => Date.now(),
  rnd = Math.random,
} = {}) {
  async function read(pointNames) {
    if (chaos.latenciaMs > 0) await espera(chaos.latenciaMs);

    // Fallo de la petición entera, como un servidor caído o un token caducado.
    if (rnd() < chaos.errorPeticion) {
      throw new Error("simulador de vibraciones: fallo simulado de la petición");
    }

    const t = ahora();
    const salida = new Map();

    for (const name of pointNames) {
      const valor = valorVibracionEn(name, t);

      // Punto de otro árbol: se ignora en silencio, igual que hace el servidor
      // real con lo que no tiene. Para el motor eso es un hueco, que es lo que es.
      if (valor === undefined) continue;

      // Punto ausente de la respuesta: no es un error, es un hueco silencioso.
      if (rnd() < chaos.ausente) continue;

      /* El punto existe y no entrega valor. Se sirve como lo sirve el
         servidor: calidad de «sin dato» y `value` ausente, no un cero. */
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
