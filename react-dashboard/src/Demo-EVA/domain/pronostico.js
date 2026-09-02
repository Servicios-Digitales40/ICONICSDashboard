/**
 * Pronóstico de desgaste por acumulación en el tiempo.
 *
 * El contenido vive en [`@shared/eva/comun/pronostico.js`](../../../../shared/eva/comun/pronostico.js);
 * aquí queda la puerta, igual que con `riesgos.js` y `estado.js`. El motivo del
 * traslado está en `./senales.js`.
 *
 * Lo que el traslado NO cambia: las horas que devuelve son ESTIMADAS a partir
 * de la fracción de muestras, no contadas —el historiador no da una rejilla
 * uniforme—, y «en marcha» se reconstruye del caudal porque la carga del motor
 * no tiene serie propia. Quien lo pinte tiene que decir las dos cosas.
 */
export * from "@shared/eva/comun/pronostico.js";
