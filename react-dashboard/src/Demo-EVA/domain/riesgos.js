/**
 * Riesgos por combinación de señales.
 *
 * El contenido vive en [`@shared/eva/riesgos.js`](../../../../shared/eva/riesgos.js);
 * aquí queda la puerta, igual que con `estado.js` y `sistema.js`. El motivo del
 * traslado está en `./senales.js`.
 *
 * Lo que el traslado NO cambia: estas reglas las evaluamos NOSOTROS contra
 * `./umbrales.js`, el servidor no las emite, y hoy esos umbrales son
 * estimaciones. Quien las pinte tiene que rotularlo — `evaluarRiesgos()`
 * devuelve `provisional` precisamente para eso.
 */
export * from "@shared/eva/riesgos.js";
