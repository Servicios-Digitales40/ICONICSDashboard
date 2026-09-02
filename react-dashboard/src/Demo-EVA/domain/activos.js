/**
 * Los cuatro activos del sistema de agua, y qué señal compone cada uno.
 *
 * El contenido vive en [`@shared/eva/tanque/activos.js`](../../../../shared/eva/tanque/activos.js);
 * aquí queda la puerta. El motivo del traslado está en `./senales.js`.
 *
 * Se movió con el resto porque la agrupación es NUESTRA y no del servidor —bajo
 * `ac:TDCON/DEMO/SENSORES/` no hay equipos—, así que el asistente tiene que
 * agrupar igual que la pantalla o «el grupo de bombeo» significaría una cosa en
 * la tarjeta y otra en el chat.
 */
export * from "@shared/eva/tanque/activos.js";
