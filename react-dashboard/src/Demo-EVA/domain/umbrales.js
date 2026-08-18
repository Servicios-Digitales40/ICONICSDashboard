/**
 * Los límites operativos de cada señal, y su declaración de procedencia.
 *
 * El contenido vive en [`@shared/eva/umbrales.js`](../../../../shared/eva/umbrales.js);
 * aquí queda la puerta. El motivo del traslado —y por qué no se duplicó ni se
 * importó desde `src/`— está escrito una sola vez, en `./senales.js`.
 *
 * Aquí importa además una consecuencia concreta: `PROVISIONALES` lo leen ahora
 * DOS programas. La vista de Planta pinta con él su aviso de procedencia y el
 * asistente lo dice al citar una banda, así que confirmar los rangos reales
 * sigue siendo una sola edición y apaga las dos advertencias a la vez.
 */
export * from "@shared/eva/umbrales.js";
