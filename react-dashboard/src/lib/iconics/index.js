/**
 * API pública del cliente ICONICS.
 *
 * ── QUÉ QUEDA, TRAS LA FASE 3 DEL PLAN 20 ──────────────────────────
 *
 * Tres funciones y el juicio de calidad. Este barril exportaba además el motor
 * de sondeo, el transporte real y el simulado, los grados de caos, el hook de
 * un punto suelto y el del conteo de alarmas: todo eso servía al tablero de
 * planta —diez pantallas leyendo ~140 señales en vivo— y se fue con él.
 *
 * Lo que sobrevive lo consume **un solo sitio**: el explorador de assets
 * (`components/assets/ExploradorAssets.jsx`), que navega el árbol de AssetWorX
 * y lee la propiedad seleccionada. El asistente no aparece aquí y no debe:
 * él no lee ICONICS desde el navegador, se lo pide al backend, que además es
 * quien sabe las cuatro reglas no obvias del historiador.
 *
 * Que este archivo haya encogido a cuatro líneas es la medida de cuánta red
 * hacía el tablero y cuánta hace un asistente.
 */
export { browseIconics, fetchIconicsBatch, fetchIconicsPoint } from "./apiClient.js";

export { QUALITY_GOOD, QUALITY_SIN_DATO, isGoodQuality } from "@shared/quality.js";
