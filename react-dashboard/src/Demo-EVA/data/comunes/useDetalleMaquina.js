/**
 * Datos de un ACTIVO de una máquina configurada para su vista de Detalle
 * (Plan 42.5 F2): cada variable con su valor evaluado, el histórico REAL del
 * historiador cuando tiene serie verificada, y el búfer de sesión en vivo
 * cuando se está en «Tiempo real». Es el gemelo de `data/tanque/detalleActivo.js`
 * con la misma forma de salida, para que `DetalleGrid` pinte las dos sin
 * saber cuál tiene delante.
 *
 * Nunca inventa una serie: `historiaReal` es `null` cuando la variable no
 * tiene serie VERIFICADA (`sistema.esHistorizada`), y quien pinte decide qué
 * hacer con `null`, nunca tratarlo como `[]`. Junto viaja `historiaCausa`,
 * la que dejó el sondeo, para poder decir POR QUÉ.
 *
 * `enVivo` conmuta de dónde sale `historiaReal` para las verificadas: del
 * historiador (`useSeriesDeMaquina`, con `rango`) o del búfer de la fuente
 * (`buffer.puntosDe`). En modo vivo no se le pide nada al historiador: se
 * pasan claves vacías, así que resuelve de inmediato sin red.
 */
import { useMemo } from "react";

import { SIN_ACTIVO, activosConVariables, variablesDeActivo } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { delta } from "../../lib/modelo.js";
import { VENTANA } from "./historia.js";
import { useEstadoDeMaquina, useSeriesDeMaquina } from "./useEstadoDeMaquina.js";

/** Muestras vivas que se pintan en «Tiempo real»: a 5 s por ciclo, ~8 min. */
const PUNTOS_VIVO = 100;

export { SIN_ACTIVO };

export function useDetalleMaquina(assetId, rango = VENTANA, enVivo = false) {
  const { sistema, maquina, estado, buffer, lastUpdated, loading, error, fuente } = useEstadoDeMaquina();
  const tipo = tipoDe(maquina?.tipo);

  const activos = useMemo(() => (maquina ? activosConVariables(maquina) : []), [maquina]);

  /* Un `assetId` desconocido cae al primero, como el tanque con un `activo`
     corrupto en la URL: un favorito roto no puede dejar la vista en blanco. */
  const activoId = activos.some((a) => a.id === assetId) ? assetId : activos[0]?.id ?? null;
  const activo = activos.find((a) => a.id === activoId) ?? null;

  const base = useMemo(
    () => (sistema && maquina && activoId ? variablesDeActivo(sistema, maquina, estado, activoId, tipo) : []),
    [sistema, maquina, estado, activoId, tipo],
  );

  const clavesHistoriables = useMemo(() => base.filter((v) => v.historizado).map((v) => v.key), [base]);

  const {
    porClave, metaPorClave, loading: historiaLoading, hasMore: historiaHasMore, cobertura: historiaCobertura,
    error: historiaError,
  } = useSeriesDeMaquina(enVivo ? [] : clavesHistoriables, rango);

  const marca = lastUpdated?.getTime() ?? null;
  const variables = useMemo(() => {
    return base.map((v) => {
      const lectura = fuente?.lecturaDe?.(v.key) ?? null;
      const bufferVivo = buffer ? buffer.serie(v.key, { puntos: PUNTOS_VIVO }) : [];
      const meta = v.historizado && !enVivo ? metaPorClave[v.key] : null;
      return {
        ...v,
        receivedAt: lectura?.receivedAt ?? null,
        stale: lectura?.stale ?? false,
        historiaReal: v.historizado
          ? enVivo
            ? buffer?.puntosDe(v.key, { puntos: PUNTOS_VIVO }) ?? []
            : porClave[v.key] ?? []
          : null,
        historiaCargando: v.historizado && !enVivo ? historiaLoading : false,
        historiaMotivo: meta?.motivo ?? null,
        historiaError: meta?.error ?? (historiaError ? historiaError.message : null),
        historiaEnVivo: v.historizado && enVivo,
        bufferVivo,
        deltaBuffer: delta(bufferVivo),
      };
    });
    // `marca` es la dependencia real del búfer y de `lecturaDe`: ninguno cambia
    // de identidad al crecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, porClave, metaPorClave, historiaLoading, historiaError, enVivo, buffer, fuente, marca]);

  return {
    maquina, sistema, fuente, activo, activos, variables, loading, error, lastUpdated,
    historiaHasMore, historiaCobertura,
  };
}
