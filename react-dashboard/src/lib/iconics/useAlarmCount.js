/**
 * Cuántos eventos hay en la última hora, para el contador del Topbar.
 *
 * Deliberadamente delgado: sólo el número, sin el punto ni el mensaje de cada
 * evento — eso es dominio de Demo EVA (`Demo-EVA/data/comunes/alarmas.js`) y el Topbar
 * vive por fuera de cualquier sección, así que no puede depender de un
 * catálogo de puntos concreto.
 *
 * En error, `count` se queda en `null` — no en 0. Un 0 se lee como «todo en
 * orden» y confundirlo con «no se pudo preguntar» es exactamente el tipo de
 * mentira silenciosa que el resto del tablero evita (ver Fase 3 del Plan 13).
 */
import { useEffect, useRef, useState } from "react";
import { fetchIconicsAlarms } from "./apiClient.js";

export function useAlarmCount(intervalMs = 30_000) {
  const [count, setCount] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function cargar() {
      try {
        const { alarms } = await fetchIconicsAlarms(undefined, 1);
        if (mountedRef.current) setCount(Array.isArray(alarms) ? alarms.length : null);
      } catch {
        if (mountedRef.current) setCount(null);
      }
    }

    cargar();
    const id = setInterval(cargar, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return count;
}
