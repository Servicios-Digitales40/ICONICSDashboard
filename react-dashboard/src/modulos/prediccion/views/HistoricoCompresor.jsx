/**
 * La evolución de una variable del compresor en un periodo.
 *
 * Hoy la API sabe devolver la reproducción de un evento concreto
 * (`/api/v1/event-history/`, que es lo que enseña `EventosCompresor`), pero no
 * la serie libre de una variable entre dos fechas. Son preguntas distintas y
 * la segunda todavía no tiene endpoint.
 */
/* Carga el diccionario de este modulo. Ver `modulos/prediccion/i18n.js`. */
import "../i18n.js";

import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function HistoricoCompresor() {
  return <PantallaPendiente vista="historico" fase="F4" />;
}
