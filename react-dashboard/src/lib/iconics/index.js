/**
 * Lectura de puntos y exploración de AssetWorX para el panel Assets.
 * Las herramientas del asistente consultan ICONICS desde el backend.
 */
export { browseIconics, fetchIconicsBatch, fetchIconicsPoint } from "./apiClient.js";

export { QUALITY_GOOD, QUALITY_SIN_DATO, isGoodQuality } from "@shared/quality.js";
