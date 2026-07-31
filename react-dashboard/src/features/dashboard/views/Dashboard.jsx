/**
 * features/dashboard/views/Dashboard.jsx
 * ------------------------------------------------------------------
 * Dashboard general de planta: el nivel de zoom más alto de la app.
 *
 * Responde "¿cómo va el turno?" de un vistazo y sirve de puerta de entrada
 * al detalle: planta → área → máquina. Todo lo que se ve aquí es agregado;
 * para lo particular de un equipo se entra a su vista de detalle.
 *
 * Orden de lectura, de arriba abajo:
 *   1. Banda de KPIs      · el titular en cifras absolutas
 *   2. Gauges             · OEE y los tres factores que lo componen
 *   3. Estado + rechazos  · qué está pasando y de dónde sale el scrap
 *   4. Tendencias         · cómo ha ido evolucionando el turno
 *   5. Tiempo muerto      · cuánto del paro no debía ocurrir
 *   6. Tira por área      · el salto al siguiente nivel de detalle
 *
 * TODO sale de datos que la máquina ya entrega. Los tiles de la referencia
 * que dependían de órdenes de producción, operarios o catálogo de producto
 * se omiten a propósito: no hay fuente, y un número inventado en un tablero
 * de planta es peor que un hueco.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";
import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { usePlantData } from "@/lib/datasource";
import {
  buildPlantSummary, productionByMachine,
  plantTrend, productionTrend, summaryByArea,
} from "../lib/plantModel.js";
import {
  KpiBand, FactorGauges, EstadoDonut, RechazosPie,
  ProduccionTrend, OeeTrend, DowntimeTiles, AreaStrip,
} from "../components/dashboardTiles.jsx";

export default function Dashboard({ onNavigate }) {
  const { theme: t } = useTheme();
  const { machines, loading, error } = usePlantData();

  // El rollup recorre las 10 máquinas y genera 12 puntos de serie por
  // cada una. Con polling cada 15 s esto deja de ser gratis, así que se
  // memoiza sobre `machines`: cambiar de tema ya no lo recalcula, y una
  // lectura nueva sí.
  const model = useMemo(
    () => ({
      resumen: buildPlantSummary(machines),
      reparto: productionByMachine(machines),
      tendencia: plantTrend(machines),
      produccion: productionTrend(machines),
      areas: summaryByArea(machines),
    }),
    [machines]
  );

  const { resumen, reparto, tendencia, produccion, areas } = model;
  const fila = { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" };

  if (loading && !machines.length) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>Leyendo el estado de la planta…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {error && (
        <AlertBanner type="error" title="No se pudo leer la planta" message={error} />
      )}

      <KpiBand s={resumen} t={t} />

      <div>
        <SectionLabel sub="El OEE de planta es el producto de los tres factores, no su promedio.">
          Efectividad general
        </SectionLabel>
        <FactorGauges s={resumen} t={t} />
      </div>

      <div style={fila}>
        <div style={{ flex: "1 1 340px", minWidth: 320 }}>
          <EstadoDonut s={resumen} t={t} />
        </div>
        <div style={{ flex: "1 1 340px", minWidth: 320 }}>
          <RechazosPie reparto={reparto} s={resumen} t={t} />
        </div>
      </div>

      <div style={fila}>
        <div style={{ flex: "1 1 460px", minWidth: 340 }}>
          <OeeTrend data={tendencia} t={t} />
        </div>
        <div style={{ flex: "1 1 340px", minWidth: 320 }}>
          <ProduccionTrend data={produccion} t={t} />
        </div>
      </div>

      <div style={fila}>
        <div style={{ flex: "1 1 340px", minWidth: 320 }}>
          <DowntimeTiles s={resumen} t={t} />
        </div>
        <div style={{ flex: "1 1 460px", minWidth: 340 }}>
          <SectionLabel sub="Entra a un área para ver sus equipos uno a uno.">
            Por área
          </SectionLabel>
          <AreaStrip areas={areas} t={t} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}
