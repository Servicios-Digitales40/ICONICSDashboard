/**
 * Si dos variables del compresor se mueven juntas.
 *
 * Queda una decisión de diseño antes de poder construirla: si el cálculo lo
 * hace la API o lo hacemos nosotros pidiendo las series. Monitoreo ya tiene
 * `correlacionar_senales` funcionando sobre series de ICONICS, así que la
 * segunda opción reutilizaría código probado — pero sólo sirve si existe el
 * endpoint de serie libre, que es lo que bloquea también a `HistoricoCompresor`.
 *
 * OJO con el límite heredado: correlacionar variables del compresor con
 * señales de planta está PROHIBIDO (CLAUDE.md §2.1). No comparten instalación,
 * ni fuente, ni reloj. Esa guarda es la F6 del plan.
 */
/* Carga el diccionario de este modulo. Ver `modulos/prediccion/i18n.js`. */
import "../i18n.js";

import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function CorrelacionCompresor() {
  return <PantallaPendiente vista="correlacion" fase="F4" />;
}
