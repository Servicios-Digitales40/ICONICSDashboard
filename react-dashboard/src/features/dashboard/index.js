/**
 * features/dashboard — vista general de planta.
 *
 * Nivel de zoom más alto: agrega las 10 máquinas de las dos áreas y sirve
 * de puerta de entrada al detalle (planta → área → máquina).
 *
 * API pública: SOLO el componente de ruta. El rollup (`lib/plantModel.js`)
 * y los tiles son internos; si alguna otra vista necesitara los agregados,
 * eso sería señal de que el modelo debe subir a `@/lib`.
 */
export { default as Dashboard } from "./views/Dashboard.jsx";
