/**
 * Datos de un activo para su vista de detalle: cada señal, con su valor
 * evaluado, el histórico REAL del historiador cuando lo tiene, y el búfer de
 * sesión en vivo cuando no —el mismo criterio que ya aplican `PlantaTanque` y
 * `RejillaActivos`, aquí compuesto una sola vez para `views/tanque/DetalleActivo.jsx`.
 *
 * Nunca inventa una serie: `historiaReal` es `null` cuando la señal no está
 * marcada `historizado` en el catálogo (ver `domain/senales.js`), y quien
 * pinte tiene que decidir qué hacer con `null`, nunca tratarlo como `[]`.
 *
 * `enVivo` conmuta de dónde sale `historiaReal` para las señales
 * historizadas: del historiador (`useSeriesHistoricas`, con `rango`) o del
 * búfer de esta sesión (`source.buffer.puntosDe`, que ya trae marca de
 * tiempo — se repinta solo porque `useSistemaAgua` re-renderiza en cada
 * lectura nueva). En modo vivo no se le pide nada al historiador: se pasan
 * claves vacías, así que `useSeriesHistoricas` resuelve de inmediato sin
 * red.
 */
import { useMemo } from "react";

import { useSeriesHistoricas, useSistemaAgua } from "./hooks.js";
import { useEvaSource } from "./EvaProvider.jsx";
import { VENTANA } from "./historia.js";
import { delta } from "../lib/modelo.js";

/** Muestras vivas que se pintan en «Tiempo real»: a 3 s por ciclo, ~5 min. */
const PUNTOS_VIVO = 100;

export function useDetalleActivo(activoId, rango = VENTANA, enVivo = false) {
  const { sistema, series, loading, error, lastUpdated } = useSistemaAgua();
  const source = useEvaSource();

  const activo = useMemo(
    () => sistema.activos.find((a) => a.id === activoId) ?? null,
    [sistema, activoId]
  );

  const clavesHistoriables = useMemo(
    () => (activo ? activo.senales.filter((s) => s.historizado).map((s) => s.key) : []),
    [activo]
  );

  const {
    porClave, metaPorClave, loading: historiaLoading, hasMore: historiaHasMore,
    cobertura: historiaCobertura,
  } = useSeriesHistoricas(
    enVivo ? [] : clavesHistoriables,
    rango
  );

  const marca = lastUpdated?.getTime() ?? null;
  const seriesVivas = useMemo(() => {
    if (!enVivo) return {};
    const out = {};
    for (const key of clavesHistoriables) out[key] = source.buffer.puntosDe(key, { puntos: PUNTOS_VIVO });
    return out;
    // `marca` es la dependencia real, igual que en `useSistemaAgua`: el
    // búfer no cambia de identidad al crecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, clavesHistoriables, enVivo, marca]);

  const variables = useMemo(() => {
    if (!activo) return [];
    return activo.senales.map((s) => {
      const bufferVivo = series[s.key] ?? [];
      const historiaEnVivo = s.historizado && enVivo;
      // El modo vivo no le pide nada al historiador, así que un motivo o un
      // error de una consulta anterior no le pertenecen: `metaPorClave` sólo
      // se lee fuera de `enVivo`.
      const meta = s.historizado && !enVivo ? metaPorClave[s.key] : null;
      return {
        ...s,
        historiaReal: s.historizado ? (enVivo ? seriesVivas[s.key] ?? [] : porClave[s.key] ?? []) : null,
        historiaCargando: s.historizado && !enVivo ? historiaLoading : false,
        historiaMotivo: meta?.motivo ?? null,
        historiaError: meta?.error ?? null,
        historiaEnVivo,
        bufferVivo,
        deltaBuffer: delta(bufferVivo),
      };
    });
  }, [activo, porClave, metaPorClave, historiaLoading, seriesVivas, enVivo, series]);

  return {
    activo, activos: sistema.activos, variables, loading, error, lastUpdated,
    historiaHasMore, historiaCobertura,
  };
}
