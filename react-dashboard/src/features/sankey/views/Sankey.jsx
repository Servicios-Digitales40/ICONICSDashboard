/**
 * Página de prueba del componente `SankeyChart` (d3-sankey), con dos ejemplos:
 *
 *   1. Reparto: cómo se distribuye la materia prima entre las líneas y en qué
 *      termina (aprobadas / rechazadas). Se arma desde la fuente de datos
 *      activa, así que en vivo lee ICONICS y en demo los datos de ejemplo.
 *   2. Balance: el desglose clásico del OEE, de las 24 h de calendario a la
 *      pieza buena. Cada bifurcación es una pérdida y el grosor final es el OEE.
 *
 * Los datos de aquí son de muestra; lo reutilizable es `SankeyChart`.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";
import { Panel, SectionLabel } from "@/components/ui/index.js";
import { SankeyChart } from "@/components/charts/index.js";
import { useAreaData } from "@/lib/datasource";

export default function Sankey() {
  const { theme: t } = useTheme();
  const { machines: lineas } = useAreaData("LIN");

  /* --- Ejemplo 1: reparto de producción de las líneas --- */
  const produccion = useMemo(() => {
    // Color por etapa y no por línea: todas las líneas son la misma clase de
    // entidad y las distingue su etiqueta, mientras que el destino sí tiene
    // significado propio (verde = aprobada, coral = rechazada).
    const nodes = [
      { id: "entrada", label: "Materia prima", color: t.viz.azul },
      ...lineas.map((m) => ({ id: m.id, label: m.equipo, color: t.viz.azul })),
      { id: "ok", label: "Aprobadas", color: t.viz.verde, hero: true },
      { id: "ko", label: "Rechazadas", color: t.viz.coral },
    ];

    // d3-sankey no admite enlaces de valor 0, y con datos reales cualquier
    // conteo puede además faltar. Se descartan ambos casos: una cinta de
    // grosor cero no se ve, pero rompe el layout del gráfico.
    const links = lineas.flatMap((m) => {
      const ok = m.aprobadas ?? 0;
      const ko = m.rechazadas ?? 0;
      const total = ok + ko;
      if (total <= 0) return [];

      return [
        { source: "entrada", target: m.id, value: total },
        ...(ok > 0 ? [{ source: m.id, target: "ok", value: ok }] : []),
        ...(ko > 0 ? [{ source: m.id, target: "ko", value: ko }] : []),
      ];
    });

    return { nodes, links };
  }, [t, lineas]);

  /* --- Ejemplo 2: balance de tiempo (desglose OEE), en minutos --- */
  const tiempo = useMemo(
    () => ({
      nodes: [
        { id: "cal", label: "Tiempo calendario", color: t.viz.azul, note: "24 h del turno completo" },
        { id: "prog", label: "Programado", color: t.viz.azul },
        { id: "noprog", label: "Sin programación", color: t.viz.violeta },
        { id: "oper", label: "Tiempo operativo", color: t.viz.azul },
        { id: "paroNP", label: "Paros no planeados", color: t.viz.coral },
        { id: "paroP", label: "Paros planeados", color: t.viz.ambar },
        { id: "neta", label: "Producción neta", color: t.viz.verde },
        { id: "veloc", label: "Pérdidas de velocidad", color: t.viz.ambar },
        { id: "buenas", label: "Piezas buenas", color: t.viz.verde, hero: true },
        { id: "scrap", label: "Rechazos", color: t.viz.coral },
      ],
      links: [
        { source: "cal", target: "prog", value: 1200 },
        { source: "cal", target: "noprog", value: 240 },
        { source: "prog", target: "oper", value: 1000 },
        { source: "prog", target: "paroNP", value: 120 },
        { source: "prog", target: "paroP", value: 80 },
        { source: "oper", target: "neta", value: 820 },
        { source: "oper", target: "veloc", value: 180 },
        { source: "neta", target: "buenas", value: 780 },
        { source: "neta", target: "scrap", value: 40 },
      ],
    }),
    [t]
  );

  return (
    <>
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          background: t.hover,
          border: `1px dashed ${t.border}`,
          fontSize: 12.5,
          color: t.textSoft,
          marginBottom: 24,
        }}
      >
        <strong style={{ color: t.text }}>Prueba de integración · d3-sankey.</strong>{" "}
        El grosor de cada cinta es el valor que fluye. Pasa el cursor sobre una cinta
        para ver cuánto representa dentro de su origen, o sobre un nodo para ver su total.
      </div>

      <SectionLabel>Reparto de producción · Área 1</SectionLabel>
      <Panel
        title="De materia prima a piezas aprobadas"
        code="piezas · turno actual"
        style={{ marginBottom: 28 }}
      >
        <SankeyChart
          nodes={produccion.nodes}
          links={produccion.links}
          height={440}
          unit=" pz"
          margin={{ top: 16, right: 104, bottom: 16, left: 108 }}
        />
      </Panel>

      <SectionLabel>Balance de tiempo · desglose OEE</SectionLabel>
      <Panel title="Dónde se pierde el tiempo del turno" code="minutos · 1 440 min de calendario">
        <SankeyChart
          nodes={tiempo.nodes}
          links={tiempo.links}
          height={400}
          unit=" min"
          margin={{ top: 16, right: 150, bottom: 16, left: 130 }}
        />
      </Panel>
    </>
  );
}
