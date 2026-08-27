/**
 * Reglas de riesgo del sistema de vibraciones, sobre el instante.
 *
 * El contenido vive en [`@shared/eva/riesgosVibracion.js`](../../../../shared/eva/riesgosVibracion.js);
 * aquí queda la puerta, igual que con `riesgos.js`.
 *
 * Lo que el traslado NO cambia: el grupo `DEMO 3` del historiador no registra,
 * así que esto vigila el momento y nada más. `evaluarRiesgosVibracion()`
 * devuelve `sinHistoria` precisamente para que la pantalla lo diga en vez de
 * dejar que alguien suponga que hay tendencia detrás.
 */
export * from "@shared/eva/riesgosVibracion.js";
