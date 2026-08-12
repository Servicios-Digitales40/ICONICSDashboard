/**
 * Asistente de lenguaje natural sobre los datos de ICONICS (Plan 6).
 *
 * Se monta siempre y decide él si aparecer: pregunta al backend si hay modelo
 * configurado (`IA_BASE`) y no pinta nada si no lo hay. Así el mismo bundle
 * sirve para una planta con asistente y para otra sin él.
 */
export { Asistente } from "./components/Asistente.jsx";
export { useAsistente } from "./lib/useAsistente.js";
