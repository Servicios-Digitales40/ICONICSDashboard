/**
 * Datos de un activo para su vista de detalle: cada señal, con su valor
 * evaluado, el histórico REAL del historiador cuando lo tiene, y el búfer de
 * sesión en vivo cuando no —el mismo criterio que ya aplican `PlantaEva` y
 * `RejillaActivos`, aquí compuesto una sola vez para `views/DetalleActivo.jsx`.
 *
 * Nunca inventa una serie: `historiaReal` es `null` cuando la señal no está
 * marcada `historizado` en el catálogo (ver `domain/senales.js`), y quien
 * pinte tiene que decidir qué hacer con `null`, nunca tratarlo como `[]`.
 */
import { useMemo } from "react";

import { useSeriesHistoricas, useSistemaAgua } from "./hooks.js";
import { VENTANA } from "./historia.js";
import { delta } from "../lib/modelo.js";

export function useDetalleActivo(activoId) {
  const { sistema, series, loading, error, lastUpdated } = useSistemaAgua();

  const activo = useMemo(
    () => sistema.activos.find((a) => a.id === activoId) ?? null,
    [sistema, activoId]
  );

  const clavesHistoriables = useMemo(
    () => (activo ? activo.senales.filter((s) => s.historizado).map((s) => s.key) : []),
    [activo]
  );

  const { porClave } = useSeriesHistoricas(clavesHistoriables, VENTANA);

  const variables = useMemo(() => {
    if (!activo) return [];
    return activo.senales.map((s) => {
      const bufferVivo = series[s.key] ?? [];
      return {
        ...s,
        historiaReal: s.historizado ? porClave[s.key] ?? [] : null,
        bufferVivo,
        deltaBuffer: delta(bufferVivo),
      };
    });
  }, [activo, porClave, series]);

  return { activo, activos: sistema.activos, variables, loading, error, lastUpdated };
}
