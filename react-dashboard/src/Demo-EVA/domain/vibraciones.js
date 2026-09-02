/**
 * Catálogo del SISTEMA DE VIBRACIONES — el segundo sistema, no el del tanque.
 *
 * El contenido vive en [`@shared/eva/vibraciones/vibraciones.js`](../../../../shared/eva/vibraciones/vibraciones.js);
 * aquí queda la puerta, igual que con `senales.js` y `riesgos.js`.
 *
 * Lo que esta puerta NO cambia, y conviene recordar antes de importarla: estos
 * puntos son de OTRA MÁQUINA. No comparten motor, ni variador, ni PLC con las
 * señales de `senales.js`. Cruzar el caudal de allí con la vibración de aquí
 * uniría dos instalaciones que no se tocan.
 */
export * from "@shared/eva/vibraciones/vibraciones.js";
