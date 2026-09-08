/**
 * El catálogo de variables del compresor: qué se puede consultar.
 *
 * Pendiente, y por un motivo concreto: el histórico que alimenta la API vive
 * en una hoja de cálculo cuyo contenido exacto todavía no está inventariado.
 * Sin saber qué columnas trae —y con qué unidad— no hay catálogo que escribir,
 * y escribirlo a ojo sería inventar la instalación.
 */
/* Carga el diccionario de este modulo. Ver `modulos/prediccion/i18n.js`. */
import "../i18n.js";

import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function VariablesCompresor() {
  return <PantallaPendiente vista="variables" fase="F5" />;
}
