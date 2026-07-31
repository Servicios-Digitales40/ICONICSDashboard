/**
 * Vista general de planta: agrega las máquinas de las dos áreas y es la puerta
 * de entrada al detalle (planta → área → máquina).
 *
 * La API pública es solo el componente de ruta. El rollup (`lib/plantModel.js`)
 * y los tiles son internos; si otra vista necesitara los agregados, sería
 * señal de que el modelo debe subir a `@/lib`.
 */
export { default as Dashboard } from "./views/Dashboard.jsx";
