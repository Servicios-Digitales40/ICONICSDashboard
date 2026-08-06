/**
 * prototypes/dashboard-v2/DashboardV2.jsx
 * ------------------------------------------------------------------
 * PROPUESTA EN EVALUACIÓN · rediseño visual del dashboard de planta.
 *
 * Misma pregunta que la vista actual —«¿cómo va el turno?»— y exactamente los
 * mismos datos: el modelo de agregación se importa de producción sin tocarlo,
 * así que al comparar las dos vistas la única variable es el diseño.
 *
 * Las 10 mejoras, y dónde vive cada una:
 *
 *   M1  Escala tipográfica con un solo héroe ......... tiles.jsx · ESCALA
 *   M2  4 gauges → 1 arco héroe + 3 medidores ........ tiles.jsx · HeroeOee
 *   M3  Franja de atención condicional ............... tiles.jsx · FranjaAtencion
 *   M4  Rejilla de máquinas (el mapa de planta) ...... tiles.jsx · RejillaMaquinas
 *   M5  Pareto de rechazos en vez de pastel .......... tiles.jsx · ParetoRechazos
 *   M6  Stat tiles con sparkline y delta ............. tiles.jsx · BandaKpis
 *   M7  Rejilla de 12 columnas y densidad ............ este archivo · REJILLA
 *   M8  Jerarquía de superficie y ritmo binario ...... este archivo + Card
 *   M9  Higiene de la paleta de datos ................ palette.js
 *   M10 Menos ruido de chrome, entrada con intención . tiles.jsx (varios)
 *
 * Orden de lectura, de arriba abajo:
 *   1. Atención     · lo que hay que mirar AHORA (si no hay nada, no aparece)
 *   2. KPIs         · el titular del turno, con su tendencia
 *   3. Titular      · el OEE y su fórmula, junto al mapa de máquinas
 *   4. Estado       · qué está pasando y de dónde sale el scrap
 *   5. Tendencias   · cómo ha evolucionado el turno
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";
import { AlertBanner } from "@/components/ui/index.js";
import { usePlantData } from "@/lib/datasource";
import { buildV2Model } from "./model.js";
import {
  FranjaAtencion, BandaKpis, HeroeOee, RejillaMaquinas,
  EstadoYParos, ParetoRechazos, ProduccionPorHora,
} from "./tiles.jsx";

/* ==================================================================
 * M7 · REJILLA DE 12 COLUMNAS · M8 · RITMO BINARIO
 * ==================================================================
 * La vista actual apila tres filas de `flexWrap` con `flex: 1 1 340px`. Los
 * anchos que salen de ahí son impredecibles según el viewport, las tarjetas
 * quedan de alturas distintas y los cantos verticales no alinean entre filas.
 * Es la razón de que la página se sienta suelta aunque cada tarjeta esté bien.
 *
 * Aquí cada BANDA es su propia rejilla de 12 columnas. Como todas comparten
 * plantilla y ancho de contenedor, los cantos alinean de banda a banda — que
 * es el 80 % de la sensación de "diseñado".
 *
 * Ritmo binario: 24 px ENTRE bandas, 16 px DENTRO de una banda. Hoy alternan
 * saltos de 22 y de 52 px, porque `SectionLabel` mete `margin: 30px 0 14px`
 * dentro de un contenedor que ya tiene `gap: 22`.
 *
 * El CSS va inyectado aquí y no en `index.css` a propósito: necesita media
 * queries (que los estilos inline no pueden expresar) y esto es un prototipo
 * — así se borra junto con la carpeta, sin dejar reglas huérfanas en un
 * archivo de producción.
 */
const REJILLA = `
.dv2-page { display: flex; flex-direction: column; gap: 24px; }
.dv2-band { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; align-items: stretch; }

.dv2-kpi      { grid-column: span 3; }
.dv2-hero     { grid-column: span 5; }
.dv2-maquinas { grid-column: span 7; }
.dv2-estado   { grid-column: span 5; }
.dv2-pareto   { grid-column: span 7; }
.dv2-prod-full { grid-column: 1 / -1; }

/* 12 → 6: los pares se mantienen, las parejas asimétricas se apilan. */
@media (max-width: 1280px) {
  .dv2-kpi { grid-column: span 6; }
  .dv2-hero, .dv2-maquinas, .dv2-estado, .dv2-pareto { grid-column: 1 / -1; }
}

/* Una sola columna: por debajo de 720 px la rejilla deja de tener sentido. */
@media (max-width: 720px) {
  .dv2-kpi { grid-column: 1 / -1; }
}

/* El chevron de cada cabecera de área se desliza al pasar por encima. Vive en
   CSS y no inline porque es un :hover sobre un HIJO del elemento apuntado, y
   eso los estilos inline no lo pueden expresar. */
.dv2-chevron { transition: transform 0.18s ease; }
.dv2-area-head:hover .dv2-chevron { transform: translateX(3px); }
`;

export default function DashboardV2({ onNavigate }) {
  const { theme: t, dark } = useTheme();

  // LA MISMA FUENTE que el dashboard de producción. Antes esta vista se
  // anclaba al mock heredado, y con el servidor desconectado seguía
  // enseñando cifras plausibles mientras «Planta» mostraba huecos — dos
  // verdades distintas en dos pestañas contiguas. Ahora comparten fuente,
  // modo demo, simulador y estado de error.
  const { machines, loading, error } = usePlantData();

  // Mismo criterio que la vista actual: el rollup recorre las 10 máquinas y
  // genera 12 puntos por cada una, así que cambiar de tema no lo recalcula
  // — pero una lectura nueva sí.
  const m = useMemo(() => buildV2Model(machines), [machines]);

  if (loading && !machines.length) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>Leyendo el estado de la planta…</p>;
  }

  return (
    <>
      <style>{REJILLA}</style>

      <div className="dv2-page">
        {error && (
          <AlertBanner type="error" title="No se pudo leer la planta" message={error} />
        )}
        {/* 1 · ATENCIÓN — condicional: sin nada accionable, no se pinta. */}
        <FranjaAtencion atencion={m.atencion} t={t} dark={dark} onNavigate={onNavigate} delay={0} />

        {/* 2 · KPIs del turno, cada uno con sus 12 puntos de tendencia. */}
        <div className="dv2-band">
          <BandaKpis s={m.resumen} series={m.series} areas={m.areas} t={t} dark={dark} base={0.05} />
        </div>

        {/* 3 · TITULAR — el OEE y su fórmula, junto al mapa de máquinas. */}
        <div className="dv2-band">
          <div className="dv2-hero">
            <HeroeOee s={m.resumen} series={m.series} tendencia={m.tendencia} t={t} delay={0.25} />
          </div>
          <div className="dv2-maquinas">
            <RejillaMaquinas areas={m.areas} t={t} dark={dark} onNavigate={onNavigate} delay={0.3} />
          </div>
        </div>

        {/* 4 · Qué está pasando y de dónde sale el scrap. */}
        <div className="dv2-band">
          <div className="dv2-estado">
            <EstadoYParos s={m.resumen} areas={m.areas} t={t} dark={dark} delay={0.35} />
          </div>
          <div className="dv2-pareto">
            <ParetoRechazos pareto={m.pareto} scrapArea={m.scrapArea} t={t} delay={0.4} />
          </div>
        </div>

        {/* 5 · Cierre: el volumen del turno hora a hora.
            La tendencia de OEE ya no vive aquí — subió al héroe, pegada al
            número que trendea. Esta banda queda a ancho completo. */}
        <div className="dv2-band">
          <div className="dv2-prod-full">
            <ProduccionPorHora data={m.produccion} t={t} delay={0.45} />
          </div>
        </div>
      </div>
    </>
  );
}
