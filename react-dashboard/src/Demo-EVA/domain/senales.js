/**
 * Contrato con ICONICS para la demo de sistemas de agua.
 *
 * ── ESTE ARCHIVO SE MUDÓ, Y AQUÍ QUEDA LA PUERTA ───────────────────
 *
 * El contenido vive ahora en [`@shared/eva/senales.js`](../../../../shared/eva/senales.js).
 * Se movió cuando el asistente pasó a responder sobre esta instalación: sus
 * herramientas —`backend/ia/conversacion/herramientas.mjs`— necesitan los MISMOS ocho tags y
 * la MISMA marca de `historizado` que estas vistas, y `shared/README.md` es
 * explícito en las dos mitades de por qué no vale ninguna de las dos salidas
 * fáciles:
 *
 *  - Duplicar el catálogo son dos copias que divergen, y el síntoma sería que
 *    el chat cita una señal que la pantalla ya no enseña — o peor, que pide al
 *    historiador una de las tres series que no son suyas.
 *  - Importarlo desde `react-dashboard/src` funciona en desarrollo y falla al
 *    desplegar: la release copia `backend/`, `shared/` y `dist`, no el árbol de
 *    fuentes del frontend.
 *
 * ── POR QUÉ QUEDA EL REEXPORT Y NO SE REESCRIBIERON LOS IMPORTS ────
 *
 * Porque la regla de Demo EVA es que **el import se escribe siempre
 * exactamente `@/Demo-EVA/…`** (ver el README del módulo: en Windows da igual,
 * en un build de Linux no). Veinte sitios reescritos a `@shared/eva/…` son
 * veinte oportunidades de escribir mal la ruta, y el módulo perdería su
 * convención por un traslado que no le cambia nada. `lib/domain/index.js` hace
 * exactamente esto mismo con el dominio de Resonac, y por el mismo motivo.
 */
export * from "@shared/eva/senales.js";
