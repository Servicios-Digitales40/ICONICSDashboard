/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/context/DataProvider.jsx
 * Motivo: solo alimentaba a las páginas archivadas; su último consumidor vivo (el botón Shuffle del Topbar) también estaba comentado.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * context/DataContext.jsx
 * ------------------------------------------------------------------
 * Centraliza los datos "dinámicos" que alimentan las gráficas
 * (Dashboard y Analíticas) y la función `regenerate()` que el botón
 * "regenerar datos" de la barra superior dispara.
 *
 * Al vivir en contexto, cualquier página puede leer los mismos datos
 * sin que el Topbar necesite conocer el detalle de cada gráfica.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  randomBarData,
  randomPieData,
  randomLineData,
  randomAreaData,
  sparkline,
} from "../data/generators.js";
import { useToast } from "@/app/providers";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { pushToast } = useToast();

  const [barData, setBarData] = useState(randomBarData);
  const [pieData, setPieData] = useState(randomPieData);
  const [lineData, setLineData] = useState(randomLineData);
  const [areaData, setAreaData] = useState(randomAreaData);
  const [sparklines, setSparklines] = useState(() => [sparkline(), sparkline(), sparkline(), sparkline()]);
  const [regenerating, setRegenerating] = useState(false);

  // Progreso "en vivo" que usan los distintos loaders de la página de Componentes.
  const [progress, setProgress] = useState(30);
  useEffect(() => {
    const id = setInterval(() => setProgress((p) => (p >= 100 ? 20 : p + 7)), 900);
    return () => clearInterval(id);
  }, []);

  const totalIngresos = useMemo(() => barData.reduce((a, b) => a + b.ingresos, 0), [barData]);
  const totalGastos = useMemo(() => barData.reduce((a, b) => a + b.gastos, 0), [barData]);

  function regenerate() {
    setRegenerating(true);
    setBarData(randomBarData());
    setPieData(randomPieData());
    setLineData(randomLineData());
    setAreaData(randomAreaData());
    setSparklines([sparkline(), sparkline(), sparkline(), sparkline()]);
    pushToast("success", "Datos actualizados en todos los paneles");
    setTimeout(() => setRegenerating(false), 500);
  }

  const value = {
    barData,
    pieData,
    lineData,
    areaData,
    sparklines,
    progress,
    regenerating,
    totalIngresos,
    totalGastos,
    regenerate,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData() debe usarse dentro de <DataProvider>");
  return ctx;
}
