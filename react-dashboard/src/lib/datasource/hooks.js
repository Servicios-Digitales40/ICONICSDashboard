/**
 * lib/datasource/hooks.js
 * ------------------------------------------------------------------
 * Los hooks que consumen las vistas. Es TODO lo que una vista necesita
 * saber sobre el origen de los datos: nada.
 *
 * Los tres siguen el mismo patrón —suscribirse al montar, darse de baja
 * al desmontar— porque es lo que permite al motor de polling contar
 * referencias y pedir solo lo que hay en pantalla.
 *
 * ⚠ La baja debe ser simétrica y estar en el `return` del efecto. React
 * 18 en StrictMode monta, desmonta y vuelve a montar en desarrollo: si
 * el efecto no limpiara, cada visita a una vista dejaría un suscriptor
 * huérfano y los puntos nunca se liberarían (riesgos R-05 y R-06).
 */
import { useEffect, useMemo, useState } from "react";

import { SNAPSHOT_INICIAL } from "./types.js";
import { useDataSource } from "./DataSourceProvider.jsx";

/** Todas las máquinas de la planta. */
export function usePlantData() {
  const { source } = useDataSource();
  const [snapshot, setSnapshot] = useState(SNAPSHOT_INICIAL);

  useEffect(() => {
    setSnapshot(SNAPSHOT_INICIAL);
    return source.subscribePlant(setSnapshot);
  }, [source]);

  return snapshot;
}

/** Las máquinas de un área concreta ("LIN" o "REC"). */
export function useAreaData(areaId) {
  const { machines, ...resto } = usePlantData();
  const delArea = useMemo(
    () => machines.filter((m) => m.areaId === areaId),
    [machines, areaId]
  );
  return { ...resto, machines: delArea };
}

/**
 * Una sola máquina, con su juego completo de propiedades y en la cadencia
 * rápida. Devuelve `machine: null` mientras no haya llegado nada.
 */
export function useMachineData(id) {
  const { source } = useDataSource();
  const [snapshot, setSnapshot] = useState(SNAPSHOT_INICIAL);

  useEffect(() => {
    setSnapshot(SNAPSHOT_INICIAL);
    if (!id) return undefined;
    return source.subscribeMachine(id, setSnapshot);
  }, [source, id]);

  return { ...snapshot, machine: snapshot.machines[0] ?? null };
}

/**
 * Serie histórica. NO se sondea: se pide una vez por (máquina, rango).
 * El pasado no cambia, así que repetir la consulta al volver a la misma
 * vista sería gasto puro.
 */
export function useMachineHistory(id, range = { points: 12 }) {
  const { source } = useDataSource();
  const [estado, setEstado] = useState({ data: [], loading: true, error: null });

  // `range` suele llegar como objeto literal y cambiaría de identidad en
  // cada render; se serializa para que el efecto dependa de su contenido.
  const clave = JSON.stringify(range);

  useEffect(() => {
    let vivo = true;
    setEstado({ data: [], loading: true, error: null });

    if (!id) return undefined;

    source
      .readHistory(id, JSON.parse(clave))
      .then((data) => vivo && setEstado({ data, loading: false, error: null }))
      .catch((err) => vivo && setEstado({ data: [], loading: false, error: err.message }));

    return () => { vivo = false; };
  }, [source, id, clave]);

  return estado;
}

/**
 * UN DÍA de historia de una máquina: la serie horaria de los factores y
 * el resumen del día. Es lo que alimenta cada lado del comparativo.
 *
 * Tampoco se sondea, y por el mismo motivo: un día pasado ya no cambia.
 * El día de HOY sí crece por su borde derecho, pero para eso está el
 * valor en vivo de la tarjeta; volver a pedir la serie entera cada pocos
 * segundos sería gasto puro para mover el último punto.
 *
 * `resumen: null` significa "ese día no tiene historia", que NO es lo
 * mismo que "ese día fue malo": quien consuma esto debe decirlo con
 * palabras distintas.
 */
export function useMachineDay(id, iso) {
  const { source } = useDataSource();
  const [estado, setEstado] = useState({ serie: [], resumen: null, loading: true, error: null });

  useEffect(() => {
    let vivo = true;
    setEstado({ serie: [], resumen: null, loading: true, error: null });

    if (!id || !iso || typeof source.readDay !== "function") {
      setEstado({ serie: [], resumen: null, loading: false, error: null });
      return undefined;
    }

    source
      .readDay(id, iso)
      .then(({ serie, resumen }) => vivo && setEstado({ serie, resumen, loading: false, error: null }))
      .catch((err) => vivo && setEstado({ serie: [], resumen: null, loading: false, error: err.message }));

    return () => { vivo = false; };
  }, [source, id, iso]);

  return estado;
}

/**
 * OEE día a día en un rango, indexado por fecha.
 *
 * Existe para el mapa de calor del calendario, que necesita responder
 * "¿cómo fue este día?" de forma SÍNCRONA mientras el usuario navega. De
 * ahí que devuelva una función `oeeDe(iso)` sobre un mapa ya cargado y no
 * una promesa por celda: treinta peticiones al abrir un calendario serían
 * treinta peticiones por cada mes que se hojee.
 *
 * Un día sin dato devuelve `null` y el calendario simplemente no lo tiñe.
 */
export function useMachineDailyOee(id, { desde, hasta } = {}) {
  const { source } = useDataSource();
  const [estado, setEstado] = useState({ porDia: new Map(), loading: true, error: null });

  useEffect(() => {
    let vivo = true;
    setEstado({ porDia: new Map(), loading: true, error: null });

    if (!id || !desde || !hasta || typeof source.readDailyOee !== "function") {
      setEstado({ porDia: new Map(), loading: false, error: null });
      return undefined;
    }

    source
      .readDailyOee(id, { desde, hasta })
      .then((dias) => vivo && setEstado({
        porDia: new Map((dias ?? []).map((d) => [d.iso, d.oee])),
        loading: false,
        error: null,
      }))
      .catch((err) => vivo && setEstado({ porDia: new Map(), loading: false, error: err.message }));

    return () => { vivo = false; };
  }, [source, id, desde, hasta]);

  const oeeDe = useMemo(() => (iso) => estado.porDia.get(iso) ?? null, [estado.porDia]);

  return { ...estado, oeeDe };
}

/**
 * Instrumentación del motor (Fase 3.5 del Plan 1).
 *
 * Existe para DEMOSTRAR el presupuesto de red en vez de suponerlo: la
 * vista de planta debe quedarse en ~4 peticiones/min y el detalle en ~12.
 * Devuelve `null` en modo demo, donde no hay red que medir.
 */
export function useIconicsStats({ intervalMs = 2000 } = {}) {
  const { source, isDemo } = useDataSource();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (isDemo || typeof source.stats !== "function") {
      setStats(null);
      return undefined;
    }
    const leer = () => setStats(source.stats());
    leer();
    const id = setInterval(leer, intervalMs);
    return () => clearInterval(id);
  }, [source, isDemo, intervalMs]);

  return stats;
}
