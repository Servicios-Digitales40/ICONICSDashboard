/**
 * Los hooks que consumen las vistas del TANQUE. Ninguna vista sabe de dónde
 * salen sus datos.
 *
 * El patrón es siempre el mismo: suscribirse al montar y darse de
 * baja al desmontar, con la baja SIEMPRE en el `return` del efecto. Con el doble
 * montaje de StrictMode en desarrollo, un efecto sin limpieza dejaría un
 * suscriptor huérfano en cada visita y los puntos nunca se liberarían.
 *
 * La historia se pide a la FUENTE (`source.leerSerie`) y no importando el lector
 * de `historia.js`. Antes se hacía así y era lo que dejaba las gráficas atadas al
 * servidor: con el simulador puesto seguían saliendo a la red mientras el resto
 * de la pantalla leía datos generados. Quién lee el pasado lo decide `evaSource`,
 * una vez, a partir del transporte.
 *
 * Desde el Plan 42.5 F1, `useSeriesHistoricas` es `useSeriesDe(fuente, …)` con
 * la fuente del tanque puesta: el efecto vive en `useSeriesDe.js` y lo comparte
 * con `useSeriesDeMaquina` (una máquina configurada). Este archivo sigue siendo
 * de la fuente en vivo del tanque, que se sustituye con el tipo (Plan 43).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { SISTEMA_VACIO } from "../../domain/sistema.js";
import { SENAL_KEYS } from "../../domain/senales.js";
import { VENTANA } from "./historia.js";
import { useEvaSource } from "./EvaProvider.jsx";
import { claveRango, unir } from "./seriesUnidas.js";
import { useSeriesDe } from "./useSeriesDe.js";

export { unir };

const INICIAL = { sistema: SISTEMA_VACIO, loading: true, error: null, lastUpdated: null };

/** Cuántas muestras del búfer alimentan un sparkline. */
const PUNTOS_SPARK = 24;

/**
 * El sistema de agua completo, con las ocho señales ya evaluadas.
 *
 * Devuelve además `series`: las muestras en vivo acumuladas en esta sesión,
 * una por señal, listas para un sparkline. Se recalculan cuando llega una
 * lectura nueva y no en cada render — el búfer es mutable, así que la
 * dependencia del memo es la marca de tiempo y no el objeto.
 */
export function useSistemaAgua() {
  const source = useEvaSource();
  const [snapshot, setSnapshot] = useState(INICIAL);

  useEffect(() => {
    setSnapshot(INICIAL);
    return source.subscribeSistema(setSnapshot);
  }, [source]);

  const marca = snapshot.lastUpdated?.getTime() ?? null;

  const series = useMemo(() => {
    const out = {};
    for (const key of SENAL_KEYS) out[key] = source.buffer.serie(key, { puntos: PUNTOS_SPARK });
    return out;
    // `marca` es la dependencia real: el búfer no cambia de identidad al crecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, marca]);

  const ventana = useMemo(
    () => source.buffer.estado(),
    // Misma razón EXACTA que el memo de arriba, y por eso la misma excusa: el
    // búfer es mutable y no cambia de identidad al crecer, así que `marca` —la
    // hora de la última lectura— es la dependencia real. La regla no puede
    // saberlo y pide quitar `marca` por «innecesaria»; hacerlo congelaría esto
    // en el primer valor. El memo de `series` ya lo declaraba y éste se quedó
    // sin ello.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, marca]
  );

  return { ...snapshot, series, ventana };
}

/**
 * Serie histórica de una señal. No se sondea dentro de un mismo rango: se
 * pide al montar, y otra vez cada vez que el RANGO cambia de valor, porque el
 * pasado ya pedido no cambia y el borde derecho lo cubre el valor en vivo.
 *
 * Al cambiar sólo el RANGO (misma señal), la gráfica anterior se conserva
 * mientras llega la nueva — `loading` sube a `true` pero `datos` no se vacía,
 * así la tarjeta puede seguir mostrando la curva vieja con un aviso discreto
 * en vez de parpadear en blanco. Al cambiar de SEÑAL sí se vacía de
 * inmediato: mostrar la curva de otra variable bajo esta etiqueta, aunque
 * sea un instante, sería mentir sobre el dato.
 *
 * `motivo` es un texto cuando la señal **no tiene serie propia en el
 * historiador** (ver `data/comunes/historia.js`). No es un error y no debe pintarse
 * como tal: es un hecho de la instalación que la tarjeta tiene que explicar.
 */
export function useSerieHistorica(clave, rango = VENTANA) {
  const source = useEvaSource();
  const [estado, setEstado] = useState({ datos: [], motivo: null, loading: true, error: null, hasMore: false, cobertura: null });
  const claveAnterior = useRef(null);

  const key = claveRango(rango);

  useEffect(() => {
    let vivo = true;
    const mismaClave = claveAnterior.current === clave;
    claveAnterior.current = clave;

    setEstado((prev) =>
      mismaClave
        ? { ...prev, loading: true, error: null }
        : { datos: [], motivo: null, loading: true, error: null, hasMore: false, cobertura: null }
    );

    if (!clave) return undefined;

    source
      .leerSerie(clave, rango)
      .then(
        ({ datos, motivo, hasMore, cobertura }) =>
          vivo &&
          setEstado({
            datos,
            motivo,
            loading: false,
            error: null,
            hasMore: Boolean(hasMore),
            cobertura: cobertura ?? null,
          })
      )
      /*
       * Se guarda el ERROR, no su `.message`. Desde que el puente manda un
       * `codigo` con cada fallo, aplanarlo aquí lo perdía antes de que ninguna
       * vista pudiera traducirlo — ver `lib/api/errorDelPuente.js`. Quien lo
       * pinta pasa por `useMensajeDeError`.
       */
      .catch(
        (err) =>
          vivo &&
          setEstado({
            datos: [],
            motivo: null,
            loading: false,
            error: err,
            hasMore: false,
            cobertura: null,
          })
      );

    return () => {
      vivo = false;
    };
    // `rango` no va en las dependencias a propósito: `key` ya es su
    // representación por valor, y meter el objeto refetchearía en cada
    // render (los presets del selector construyen uno nuevo cada vez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, clave, key]);

  return estado;
}

/**
 * Varias series históricas del TANQUE sobre la misma rejilla, unidas por
 * marca de tiempo. Alimenta la tendencia de Planta y las gráficas del Detalle.
 * Es `useSeriesDe` con la fuente del tanque: ver ese archivo para el porqué
 * de cada decisión del efecto.
 */
export function useSeriesHistoricas(claves, rango = VENTANA) {
  return useSeriesDe(useEvaSource(), claves, rango);
}
