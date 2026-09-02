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
 * ── QUÉ APORTA ESTE ARCHIVO, QUE SON DOS LÍNEAS ────────────────────
 *
 * Casi nada, y ésa es la idea. Desde que la mecánica del transporte se
 * generalizó, aquí sólo se juntan las dos piezas de ESTA máquina:
 *
 *   la física   `@shared/eva/vibraciones/simuladorVibraciones.js`, compartida con el
 *               transporte falso del backend — dos programas sirviendo el
 *               mismo reloj de pared tienen que ver la misma máquina.
 *   la mecánica `lib/iconics/transporteSimulado.js`, que no conoce ninguna
 *               instalación: latencia, huecos, calidad mala y no finitos.
 *
 * Una máquina nueva escribe su física y repite estas doce líneas. Eso es todo
 * lo que cuesta hoy tener origen simulado.
 *
 * ── NO HAY `readSerie`, Y NO ES UN OLVIDO ──────────────────────────
 *
 * **Ninguna señal de este catálogo está historizada** (`esHistorizada` devuelve
 * `false` en `vibraciones.js`, con su porqué). Un simulador que sirviera series
 * enseñaría a la pantalla una instalación que no existe y se rompería al volver
 * a datos reales.
 */
import { CAOS_SUAVE, createTransporteSimulado } from "@/lib/iconics";
import { valorVibracionEn } from "@shared/eva/vibraciones/simuladorVibraciones.js";

export {
  CICLO_VIB_MS,
  JORNADA_VIB_MS,
  enMarchaVib,
  eventoVibDe,
  faseCicloVib,
  valorVibracionEn,
} from "@shared/eva/vibraciones/simuladorVibraciones.js";

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
  return createTransporteSimulado({
    modelo: valorVibracionEn,
    chaos,
    ahora,
    rnd,
    etiqueta: "simulador de vibraciones",
  });
}
