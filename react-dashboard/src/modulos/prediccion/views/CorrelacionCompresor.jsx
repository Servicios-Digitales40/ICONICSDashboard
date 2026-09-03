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
import { PantallaPendiente } from "../components/PantallaPendiente.jsx";

export default function CorrelacionCompresor() {
  return (
    <PantallaPendiente
      titulo="Correlación entre variables"
      resumen="Si dos o más variables del compresor se movieron juntas en la misma ventana, con su coeficiente y su lectura en palabras."
      mostrara={[
        "El coeficiente de cada par, de −1 a 1, y qué significa en lenguaje llano",
        "La ventana sobre la que se midió, y cuántas muestras la sostienen",
        "Un aviso cuando la ventana es demasiado corta para afirmar nada",
      ]}
      necesita={[
        "Decidir quién calcula: la API, o nosotros sobre las series (Monitoreo ya tiene ese código)",
        "Si lo calcula la API: qué coeficiente usa y sobre qué remuestreo",
        "El endpoint de serie libre, si el cálculo se hace de este lado",
      ]}
      fase="F4"
    />
  );
}
