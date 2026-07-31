/**
 * prototypes/comparativo/variants.js
 * ------------------------------------------------------------------
 * Registro de las tres disposiciones candidatas para la Fase 2 del
 * rediseño del comparativo.
 *
 * Los escenarios de prueba viven aparte, en `scenarios.js`, para que esa
 * lógica siga siendo JS puro y verificable con node.
 *
 * Cuando se elija una ganadora: se promueve a pages/machine-detail/ y
 * esta carpeta se borra, igual que el registro de tarjetas de máquina.
 */
import LayoutEspejo from "./LayoutEspejo.jsx";
import LayoutBalanza from "./LayoutBalanza.jsx";
import LayoutEditorial from "./LayoutEditorial.jsx";

export const COMPARATIVO_LAYOUTS = {
  espejo: {
    label: "Cinta y espejo",
    Comp: LayoutEspejo,
    tagline: "Veredicto arriba · dos columnas reflejadas · deltas al centro",
  },
  balanza: {
    label: "Balanza",
    Comp: LayoutBalanza,
    tagline: "El veredicto ocupa el punto de equilibrio entre A y B",
  },
  editorial: {
    label: "Titular editorial",
    Comp: LayoutEditorial,
    tagline: "Conclusión dominante · evidencia enfrentada fila a fila",
  },
};
