/**
 * Los hooks que consumen las vistas. Ninguna vista necesita saber de dónde
 * salen sus datos.
 *
 * Todos siguen el mismo patrón: suscribirse al montar y darse de baja al
 * desmontar, que es lo que permite al motor de polling contar referencias y
 * pedir solo lo que hay en pantalla.
 *
 * La baja tiene que ser simétrica y vivir en el `return` del efecto. Con el
 * doble montaje de StrictMode en desarrollo, un efecto sin limpieza dejaría
 * un suscriptor huérfano en cada visita y los puntos nunca se liberarían.
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
 * Serie histórica. No se sondea: se pide una vez por (máquina, rango), porque
 * el pasado no cambia.
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
 * Un día de historia de una máquina: la serie horaria de los factores y el
 * resumen del día. Alimenta cada lado del comparativo.
 *
 * Tampoco se sondea. El día de hoy crece por su borde derecho, pero para eso
 * está el valor en vivo de la tarjeta.
 *
 * `resumen: null` significa «ese día no tiene historia», que no es lo mismo
 * que «ese día fue malo»; quien lo consuma debe decirlo con otras palabras.
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
 * OEE día a día en un rango, indexado por fecha, para el mapa de calor del
 * calendario.
 *
 * Devuelve una función `oeeDe(iso)` sobre un mapa ya cargado, y no una promesa
 * por celda, porque el calendario necesita responder de forma síncrona
 * mientras el usuario hojea meses. Un día sin dato devuelve `null` y no se tiñe.
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
 * Instrumentación del motor, para medir el presupuesto de red en vez de
 * suponerlo.
 *
 * Ya no hay que preguntar por el origen: desde el Plan 5 **siempre** hay motor
 * de polling, también con el simulador, así que sus cifras son reales en los
 * dos casos —una petición por ciclo, no una por tag—. Antes devolvía `null` en
 * modo demo porque `demoSource` se saltaba el motor entero y no había nada que
 * medir.
 */
export function useIconicsStats({ intervalMs = 2000 } = {}) {
  const { source } = useDataSource();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (typeof source.stats !== "function") {
      setStats(null);
      return undefined;
    }
    const leer = () => setStats(source.stats());
    leer();
    const id = setInterval(leer, intervalMs);
    return () => clearInterval(id);
  }, [source, intervalMs]);

  return stats;
}
