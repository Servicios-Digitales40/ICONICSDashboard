/**
 * Vocabulario de estado de Demo EVA: clave canónica, etiqueta y token de color.
 *
 * El contenido vive en [`@shared/eva/tanque/estado.js`](../../../../shared/eva/tanque/estado.js);
 * aquí queda la puerta. El motivo del traslado está en `./senales.js`.
 *
 * Lo que el traslado NO cambia es lo que este vocabulario significa: estos cinco
 * estados los calculamos nosotros contra `./umbrales.js`, ICONICS no los emite,
 * y `DERIVADO` sigue en `true` para que quien los pinte —o quien los cite en una
 * respuesta del asistente— tenga que rotularlo.
 */
export * from "@shared/eva/tanque/estado.js";
