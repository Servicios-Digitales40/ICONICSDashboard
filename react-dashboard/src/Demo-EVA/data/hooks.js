/**
 * Los hooks que consumen las vistas de Demo EVA. Ninguna vista sabe de dónde
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
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { SISTEMA_VACIO } from "../domain/sistema.js";
import { SENAL_KEYS } from "../domain/senales.js";
import { VENTANA } from "./historia.js";
import { useEvaSource } from "./EvaProvider.jsx";

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

  const ventana = useMemo(() => source.buffer.estado(), [source, marca]);

  return { ...snapshot, series, ventana };
}

/**
 * `{ horas, puntos }` o `{ inicio, fin }` → una clave primitiva estable para
 * dependencia de efecto. Un `Date` es un objeto nuevo en cada render aunque
 * represente el mismo instante, así que no puede ir tal cual en un array de
 * dependencias sin refetchear en bucle; esta clave es lo único que compara
 * por VALOR.
 */
function claveRango(rango) {
  if (rango?.inicio instanceof Date && rango?.fin instanceof Date) {
    return `abs:${rango.inicio.getTime()}-${rango.fin.getTime()}`;
  }
  const horas = rango?.horas ?? VENTANA.horas;
  const puntos = rango?.puntos ?? VENTANA.puntos;
  return `rel:${horas}-${puntos}`;
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
 * historiador** (ver `data/historia.js`). No es un error y no debe pintarse
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
      .catch(
        (err) =>
          vivo &&
          setEstado({
            datos: [],
            motivo: null,
            loading: false,
            error: err.message,
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
 * Varias series históricas sobre la misma rejilla, unidas por marca de tiempo.
 *
 * Alimenta la gráfica de tendencia de la vista de Planta, que superpone las
 * cuatro señales verificadas. Se unen aquí y no en el componente porque el
 * historiador puede devolver rejillas con huecos distintos por señal, y
 * resolverlo dentro del `render` obligaría a recalcularlo en cada repintado.
 */
export function useSeriesHistoricas(claves, rango = VENTANA) {
  const source = useEvaSource();
  const [estado, setEstado] = useState({
    filas: [], porClave: {}, metaPorClave: {}, loading: true, error: null, hasMore: false, cobertura: null,
  });
  const clavesAnteriores = useRef(null);

  const clavesKey = claves.join("|");
  const key = claveRango(rango);

  useEffect(() => {
    let vivo = true;
    // Mismo criterio que `useSerieHistorica`: sólo se conserva la rejilla
    // anterior cuando lo que cambió fue el RANGO, no el conjunto de señales
    // (cambiar de pestaña no debe dejar ver, ni un instante, las curvas del
    // activo anterior bajo las tarjetas del nuevo).
    const mismasClaves = clavesAnteriores.current === clavesKey;
    clavesAnteriores.current = clavesKey;

    setEstado((prev) =>
      mismasClaves
        ? { ...prev, loading: true, error: null }
        : { filas: [], porClave: {}, metaPorClave: {}, loading: true, error: null, hasMore: false, cobertura: null }
    );

    const lista = clavesKey ? clavesKey.split("|") : [];
    if (!lista.length) {
      setEstado({
        filas: [], porClave: {}, metaPorClave: {}, loading: false, error: null, hasMore: false, cobertura: null,
      });
      return undefined;
    }

    /*
     * Antes se descartaba el error de cada señal con
     * `.catch(() => ({ datos: [], motivo: null, hasMore: false }))`: una
     * falla de red y un rango genuinamente vacío llegaban indistinguibles a
     * `porClave`, y `GraficaHistoria` no tenía forma de decir "no se pudo
     * leer" en vez de "no hay nada aquí". Ahora el motivo de la falla viaja
     * en `metaPorClave[clave].error`, sin tocar la forma de `porClave` —
     * `unir()` y el resto de consumidores existentes siguen recibiendo
     * exactamente los arreglos de puntos que ya esperaban.
     */
    Promise.all(
      lista.map((k) =>
        source.leerSerie(k, rango).catch((err) => ({ datos: [], motivo: null, hasMore: false, error: err.message }))
      )
    ).then((resultados) => {
      if (!vivo) return;
      const porClave = Object.fromEntries(lista.map((k, i) => [k, resultados[i].datos]));
      const metaPorClave = Object.fromEntries(
        lista.map((k, i) => [k, { motivo: resultados[i].motivo ?? null, error: resultados[i].error ?? null }])
      );
      const hasMore = resultados.some((r) => r.hasMore);
      // La cobertura es del RANGO, no de cada señal: todas se piden sobre los
      // mismos tramos, así que la primera que la traiga vale para todas.
      const cobertura = resultados.find((r) => r.cobertura)?.cobertura ?? null;
      setEstado({ filas: unir(porClave), porClave, metaPorClave, loading: false, error: null, hasMore, cobertura });
    });
    // Sin `.catch` aquí: cada promesa de la lista ya captura su propio
    // fallo arriba, así que `Promise.all` no puede rechazar por esta vía.

    return () => {
      vivo = false;
    };
    // Mismo criterio que `useSerieHistorica`: `key` es el valor de `rango`,
    // el objeto no va en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, clavesKey, key]);

  return estado;
}

/**
 * `{ clave: [{t, valor}] }` → `[{ t, hora, clave1, clave2… }]`, ordenado.
 *
 * La marca de tiempo se usa como identidad de fila: el historiador devuelve la
 * misma rejilla para todas las señales cuando se le pide el mismo intervalo, y
 * las que falten en un instante quedan sin clave — que es lo que recharts pinta
 * como corte de línea, y no como una caída a cero.
 */
export function unir(porClave) {
  const filas = new Map();

  for (const [clave, datos] of Object.entries(porClave)) {
    for (const { t, valor } of datos) {
      const ms = t.getTime();
      if (!filas.has(ms)) filas.set(ms, { ms, t });
      filas.get(ms)[clave] = valor;
    }
  }

  return [...filas.values()]
    .sort((a, b) => a.ms - b.ms)
    .map((f) => ({
      ...f,
      hora: f.t.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    }));
}
