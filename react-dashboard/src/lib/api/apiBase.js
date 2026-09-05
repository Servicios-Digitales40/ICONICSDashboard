/**
 * Base de la API, vacía para el mismo origen. Vite reenvía /api en desarrollo.
 * Para un proxy bajo una subruta, VITE_API_BASE debe acompañar a VITE_BASE_PATH.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";
