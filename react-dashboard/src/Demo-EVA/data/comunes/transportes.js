/**
 * De una CLASE de transporte a un transporte de verdad, para cualquier máquina.
 *
 * ── QUÉ PROBLEMA RESUELVE ──────────────────────────────────────────
 *
 * `useDataSource()` publica la clase —servidor real o simulador— y nadie más en
 * la aplicación decide eso. Pero construir la instancia exigía saber QUÉ
 * simulador toca, y eso estaba escrito dos veces: una en `EvaProvider` y otra
 * en `data/vibraciones/vibracion.js`, cada una con su `if` y su factoría. Una máquina nueva
 * escribía el tercero.
 *
 * Aquí se escribe una vez. La física sale del registro de sistemas, así que dar
 * de alta una máquina no toca este archivo:
 *
 *   const transporte = transporteDe("prensa", clase);
 *
 * ── POR QUÉ VIVE EN `Demo-EVA/data/` Y NO EN `lib/iconics/` ────────
 *
 * Porque conoce el registro de sistemas, y `lib/` es infraestructura compartida
 * que no debe conocer ninguna instalación — ni siquiera la lista de ellas. Lo
 * que sí es de `lib/` es la MECÁNICA del transporte falso
 * (`createTransporteSimulado`), que recibe la física por parámetro y no importa
 * ningún catálogo. La frontera está en esa línea, y esta función se queda del
 * lado de las instalaciones.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE ────────────────────────────────────
 *
 * No monta motores de sondeo ni junta lotes. Cada sistema sondea POR SU CUENTA
 * —esa regla vive en `shared/eva/sistemas.js` y es la que impide que dos
 * instalaciones acaben en el mismo búfer—. Aquí sólo se construye el transporte
 * que ese sondeo usará.
 */
import { TRANSPORTES } from "@/lib/datasource";
import { createRealTransport, createTransporteSimulado, presetCaos } from "@/lib/iconics";
import { SISTEMA } from "@shared/eva/sistemas.js";

/**
 * El transporte de un sistema para una clase dada.
 *
 * El simulado sale del `modelo` que declara el sistema en el registro; el real
 * es el compartido, que ya sabe hablar con el puente y no distingue de qué
 * árbol son los puntos — por eso no necesita saber qué máquina es.
 *
 * El grado de caos sale de `VITE_ICONICS_CHAOS`, que es un ajuste del ENTORNO y
 * no de la instalación: cualquier máquina que se añada degrada igual.
 *
 * @param {string} sistemaId  id en `shared/eva/sistemas.js`
 * @param {string} clase      `TRANSPORTES.REAL` | `TRANSPORTES.SIMULADO`
 */
export function transporteDe(sistemaId, clase) {
  if (clase !== TRANSPORTES.SIMULADO) return createRealTransport();

  const sistema = SISTEMA[sistemaId];
  if (!sistema) {
    /*
     * Un id que no está en el registro es un error de programación, no un
     * estado que la interfaz deba sobrevivir en silencio: devolver el
     * transporte real dejaría la pantalla saliendo a la red con el origen en
     * «Simulado», que es justo lo que el interruptor promete que no pasa.
     */
    throw new Error(`transporteDe: sistema desconocido «${sistemaId}»`);
  }

  return createTransporteSimulado({
    modelo: sistema.modelo,
    chaos: presetCaos(),
    etiqueta: `simulador · ${sistema.nombre}`,
  });
}
