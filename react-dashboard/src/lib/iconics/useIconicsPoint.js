/**
 * Consulta un punto de ICONICS vía el backend puente y lo refresca cada
 * `intervalMs`. Expone el resultado crudo, estado de carga/error y un
 * `refresh` para forzar una nueva lectura.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchIconicsPoint } from "./apiClient.js";

export function useIconicsPoint(pointName, intervalMs = 5000) {
  const [point, setPoint] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await fetchIconicsPoint(pointName);
      if (!mountedRef.current) return;
      setPoint(result.payload);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [pointName]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load, intervalMs]);

  return { point, error, loading, lastUpdated, refresh: load };
}
