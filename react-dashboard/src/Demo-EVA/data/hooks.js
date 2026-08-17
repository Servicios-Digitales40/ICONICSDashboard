/**
 * Los hooks que consumen las vistas de Demo EVA. Ninguna vista sabe de dónde
 * salen sus datos.
 *
 * Mismo patrón que `lib/datasource/hooks.js`: suscribirse al montar y darse de
 * baja al desmontar, con la baja SIEMPRE en el `return` del efecto. Con el doble
 * montaje de StrictMode en desarrollo, un efecto sin limpieza dejaría un
 * suscriptor huérfano en cada visita y los puntos nunca se liberarían.
 */
import { useEffect, useMemo, useState } from "react";

import { SISTEMA_VACIO } from "../domain/sistema.js";
import { SENAL_KEYS } from "../domain/senales.js";
import { VENTANA, leerSerie } from "./historia.js";
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
 * Serie histórica de una señal. No se sondea: se pide al montar, porque el
 * pasado no cambia y el borde derecho lo cubre el valor en vivo.
 *
 * `motivo` es un texto cuando la señal **no tiene serie propia en el
 * historiador** (ver `data/historia.js`). No es un error y no debe pintarse
 * como tal: es un hecho de la instalación que la tarjeta tiene que explicar.
 */
export function useSerieHistorica(clave, ventana = VENTANA) {
  const [estado, setEstado] = useState({ datos: [], motivo: null, loading: true, error: null });

  const horas = ventana?.horas ?? VENTANA.horas;
  const puntos = ventana?.puntos ?? VENTANA.puntos;

  useEffect(() => {
    let vivo = true;
    setEstado({ datos: [], motivo: null, loading: true, error: null });

    if (!clave) return undefined;

    leerSerie(clave, { horas, puntos })
      .then(({ datos, motivo }) => vivo && setEstado({ datos, motivo, loading: false, error: null }))
      .catch((err) => vivo && setEstado({ datos: [], motivo: null, loading: false, error: err.message }));

    return () => {
      vivo = false;
    };
  }, [clave, horas, puntos]);

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
export function useSeriesHistoricas(claves, ventana = VENTANA) {
  const [estado, setEstado] = useState({ filas: [], porClave: {}, loading: true, error: null });

  const clavesKey = claves.join("|");
  const horas = ventana?.horas ?? VENTANA.horas;
  const puntos = ventana?.puntos ?? VENTANA.puntos;

  useEffect(() => {
    let vivo = true;
    setEstado({ filas: [], porClave: {}, loading: true, error: null });

    const lista = clavesKey ? clavesKey.split("|") : [];
    if (!lista.length) {
      setEstado({ filas: [], porClave: {}, loading: false, error: null });
      return undefined;
    }

    Promise.all(lista.map((k) => leerSerie(k, { horas, puntos }).catch(() => ({ datos: [], motivo: null }))))
      .then((resultados) => {
        if (!vivo) return;
        const porClave = Object.fromEntries(lista.map((k, i) => [k, resultados[i].datos]));
        setEstado({ filas: unir(porClave), porClave, loading: false, error: null });
      })
      .catch((err) => vivo && setEstado({ filas: [], porClave: {}, loading: false, error: err.message }));

    return () => {
      vivo = false;
    };
  }, [clavesKey, horas, puntos]);

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
