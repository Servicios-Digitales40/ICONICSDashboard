/**
 * ui/SankeyChart.jsx
 * ------------------------------------------------------------------
 * Diagrama de Sankey (flujos) construido sobre `d3-sankey`.
 *
 * Un Sankey responde una sola pregunta: **cómo se reparte una magnitud
 * al pasar de una etapa a la siguiente**. El grosor de cada cinta ES el
 * valor; por eso no lleva ejes ni cuadrícula: la geometría es el dato.
 * Úsalo para balances (tiempo calendario → tiempo productivo → piezas
 * buenas) o para repartos (materia prima → líneas → resultado). NO lo
 * uses para series de tiempo ni para comparar categorías sueltas.
 *
 * Cómo funciona por dentro
 * ------------------------------------------------------------------
 * `d3-sankey` NO dibuja: solo calcula geometría. Le pasamos nodos y
 * enlaces y nos devuelve, para cada nodo, su rectángulo (x0,y0,x1,y1) y
 * para cada enlace su grosor y sus puntos de anclaje. Nosotros pintamos
 * ese resultado con SVG plano, con los colores del ThemeProvider.
 * Ojo: d3-sankey MUTA los objetos que recibe, por eso clonamos siempre
 * antes de calcular (`toMutable`).
 *
 * Props
 * ------------------------------------------------------------------
 *  - nodes: [{ id, label?, color?, note?, hero? }]   (id único y estable)
 *  - links: [{ source, target, value }]              (source/target = id)
 *  - height, nodeWidth, nodePadding, margin          (geometría)
 *  - align: "justify" | "left" | "right" | "center"
 *  - format(value) -> string                         (formato de las cifras)
 *  - unit: string                                    (sufijo tras el valor)
 *  - showValues: boolean                             (valor bajo la etiqueta)
 *  - stageLabels: string[]                           (rótulo por columna)
 *  - capacityGhost: boolean                          (silueta de referencia)
 *  - showLinkLabels / linkLabelMinWidth              (% sobre las cintas)
 *  - flowOnHover: boolean                            (destellos en la cinta)
 *  - animate: boolean                                (barrido de entrada)
 *
 * Color
 * ------------------------------------------------------------------
 * La identidad va por nodo, tomada de los tokens del tema en un orden
 * FIJO (accent, amber, success, violet, coral) — validado para daltonismo
 * en claro y oscuro. Un nodo puede forzar el suyo con `color` (p. ej. un
 * token semántico: verde para "Aprobadas", coral para "Rechazadas"). Si
 * hay más nodos que colores, los sobrantes caen a un gris neutro en lugar
 * de reciclar tonos: repetir un color mentiría sobre la identidad.
 * Cada nodo lleva SIEMPRE su etiqueta visible, así que la lectura nunca
 * depende solo del color.
 *
 * Movimiento
 * ------------------------------------------------------------------
 * La entrada es un barrido escalonado por columna (las cintas se dibujan
 * de izquierda a derecha) y el "flujo" de destellos aparece SOLO en hover:
 * una animación permanente en una pantalla que vive encendida todo el
 * turno cansa y deja de comunicar. Todo se apaga con `prefers-reduced-motion`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
  sankeyLeft,
  sankeyRight,
  sankeyCenter,
} from "d3-sankey";
import { useTheme } from "@/theme";

const ALIGNS = {
  justify: sankeyJustify,
  left: sankeyLeft,
  right: sankeyRight,
  center: sankeyCenter,
};

/** Orden fijo de colores categóricos (ver nota de color arriba). */
const paletteOf = (t) => [t.viz.azul, t.viz.ambar, t.viz.verde, t.viz.violeta, t.viz.coral];

/** Clona nodos/enlaces: d3-sankey escribe la geometría sobre los objetos que recibe. */
function toMutable(nodes, links) {
  return {
    nodes: nodes.map((n) => ({ ...n })),
    links: links.map((l) => ({ ...l })),
  };
}

const defaultFormat = (v) => v.toLocaleString("es-MX", { maximumFractionDigits: 1 });

/* Alto de la banda reservada arriba para los rótulos de columna. */
const STAGE_BAND = 26;
/* Retardo entre columnas en el barrido de entrada. */
const STEP_MS = 130;
/* Longitud "suficientemente grande" para el dash del barrido: cualquier
   cinta de este tamaño de gráfica mide bastante menos que esto. */
const DRAW_LEN = 6000;

export function SankeyChart({
  nodes = [],
  links = [],
  height = 340,
  nodeWidth = 14,
  nodePadding = 18,
  margin = { top: 14, right: 96, bottom: 14, left: 96 },
  align = "justify",
  format = defaultFormat,
  unit = "",
  showValues = true,
  stageLabels,
  capacityGhost = false,
  showLinkLabels = true,
  linkLabelMinWidth = 16,
  flowOnHover = true,
  animate = true,
  style,
}) {
  const { theme: t } = useTheme();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  // Qué está resaltado: { type: "node" | "link", key } o null.
  const [focus, setFocus] = useState(null);
  const [tip, setTip] = useState(null); // { x, y, title, value, sub }

  // Ancho responsivo: el SVG se redibuja cuando el contenedor cambia de
  // tamaño (sidebar plegado, resize de ventana, cambio de layout...).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // id único por instancia: los <linearGradient> y las @keyframes viven en
  // un espacio de nombres global, así que no pueden colisionar entre gráficas.
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);

  const stageCount = stageLabels?.length ?? 0;
  // Los rótulos de columna necesitan su propia banda: se la robamos al área
  // de dibujo, no al margen que pidió quien llama.
  const topPad = margin.top + (stageCount ? STAGE_BAND : 0);

  const layout = useMemo(() => {
    if (!width || !nodes.length || !links.length) return null;

    const x0 = margin.left;
    const x1 = Math.max(x0 + 1, width - margin.right);
    const y0 = topPad;
    const y1 = Math.max(y0 + 1, height - margin.bottom);

    const generator = d3Sankey()
      .nodeId((d) => d.id)
      .nodeAlign(ALIGNS[align] ?? sankeyJustify)
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .extent([[x0, y0], [x1, y1]]);

    try {
      const graph = generator(toMutable(nodes, links));
      const colors = paletteOf(t);
      graph.nodes.forEach((n, i) => {
        // color explícito del dato > paleta en orden fijo > gris neutro.
        n._color = n.color ?? colors[i] ?? t.textFaint;
      });
      return graph;
    } catch (err) {
      // Un ciclo o un id inexistente hace que d3-sankey lance; preferimos
      // no romper la página entera por un dato mal formado.
      console.error("[SankeyChart] no se pudo calcular el layout:", err);
      return null;
    }
  }, [nodes, links, width, height, nodeWidth, nodePadding, align, margin.left, margin.right, topPad, margin.bottom, t]);

  const maxDepth = useMemo(
    () => (layout ? layout.nodes.reduce((m, n) => Math.max(m, n.depth), 0) : 0),
    [layout]
  );

  /**
   * Columnas: agrupa los nodos por profundidad para poder dibujar los
   * rótulos de etapa y la silueta de capacidad. `total` es la magnitud que
   * sigue viva en esa columna — la que se va encogiendo hacia la derecha.
   */
  const columns = useMemo(() => {
    if (!layout) return [];
    const byDepth = new Map();
    for (const n of layout.nodes) {
      const c = byDepth.get(n.depth) ?? { depth: n.depth, x0: n.x0, x1: n.x1, total: 0, count: 0 };
      c.total += n.value;
      c.count += 1;
      byDepth.set(n.depth, c);
    }
    return [...byDepth.values()].sort((a, b) => a.depth - b.depth);
  }, [layout]);

  // La magnitud de la columna más grande: la referencia contra la que se
  // compara el encogimiento del resto (d3-sankey escala todas las columnas
  // con la misma relación valor→píxeles, así que los altos son comparables).
  const capacity = columns.length ? Math.max(...columns.map((c) => c.total)) : 0;

  const linkKey = (l) => `${l.source.id}→${l.target.id}`;

  /** ¿Este enlace participa en lo que está enfocado? (define atenuados vs. resaltados) */
  const linkActive = useCallback(
    (l) => {
      if (!focus) return null; // sin foco: todos al alfa base
      if (focus.type === "link") return focus.key === linkKey(l);
      return l.source.id === focus.key || l.target.id === focus.key;
    },
    [focus]
  );

  const showTip = (e, payload) => {
    const box = wrapRef.current.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, ...payload });
  };
  const moveTip = (e) =>
    setTip((prev) => {
      if (!prev) return prev;
      const box = wrapRef.current.getBoundingClientRect();
      return { ...prev, x: e.clientX - box.left, y: e.clientY - box.top };
    });
  const hideAll = () => {
    setFocus(null);
    setTip(null);
  };

  // Si el componente se desmonta con el puntero encima, no dejamos estado colgando.
  useEffect(() => hideAll, []);

  const empty = !nodes.length || !links.length;
  // Animación de entrada por columna: cada cinta espera su turno.
  const enter = (depth, ms = 700) =>
    animate ? `sk-draw-${uid} ${ms}ms cubic-bezier(0.22,1,0.36,1) ${depth * STEP_MS}ms both` : "none";
  const fadeIn = (depth) =>
    animate ? `sk-fade-${uid} 420ms ease ${depth * STEP_MS}ms both` : "none";

  // El tooltip se voltea cuando el cursor está cerca del borde, en vez de
  // desbordarse fuera del panel.
  const flipX = tip ? tip.x > (width || 0) * 0.62 : false;
  const flipY = tip ? tip.y > height * 0.72 : false;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", ...style }}>
      {empty ? (
        <div style={{ height, display: "grid", placeItems: "center", color: t.textFaint, fontSize: 13 }}>
          Sin datos de flujo para mostrar
        </div>
      ) : (
        <svg
          className={`sk-${uid}`}
          width="100%"
          height={height}
          style={{ display: "block", overflow: "visible" }}
          onMouseLeave={hideAll}
        >
          <defs>
            {/* Solo hay degradado HORIZONTAL (de color de origen a color de
                destino). Nada de sombreado vertical: ensuciaba el color, hacía
                que cada cinta pareciera de dos tonos distintos y dejaba
                ilegibles las etiquetas que caen encima. Un color plano por
                nodo se lee mejor y se ve más limpio. */}

            {/* Un degradado por enlace: la cinta sale con el color del nodo
                origen y llega con el del destino, de modo que se puede seguir
                el recorrido sin leer las etiquetas. */}
            {layout?.links.map((l) => (
              <linearGradient
                key={linkKey(l)}
                id={`sk-${uid}-${l.index}`}
                gradientUnits="userSpaceOnUse"
                x1={l.source.x1}
                x2={l.target.x0}
              >
                <stop offset="0%" stopColor={l.source._color} />
                <stop offset="100%" stopColor={l.target._color} />
              </linearGradient>
            ))}
          </defs>

          {/* --- Silueta de capacidad ---
              Contorno punteado con el alto que TENDRÍA la columna si nada se
              hubiera perdido. Al encogerse las columnas hacia la derecha, el
              hueco vacío ES la pérdida acumulada: se ve sin leer un número. */}
          {capacityGhost &&
            columns.map((c) => {
              // Solo tiene sentido en las columnas que YA perdieron algo. La
              // silueta ocupa todo el alto útil porque ese alto es, por
              // construcción de d3-sankey, el de la columna más grande: lo que
              // quede vacío es exactamente lo que se perdió por el camino.
              if (c.total >= capacity - 0.5) return null;
              return (
                <rect
                  key={`ghost-${c.depth}`}
                  x={c.x0}
                  y={topPad}
                  width={c.x1 - c.x0}
                  height={Math.max(1, height - margin.bottom - topPad)}
                  rx={3}
                  fill={t.hover}
                  stroke={t.border}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  style={{ animation: fadeIn(c.depth), pointerEvents: "none" }}
                />
              );
            })}

          {/* --- Rótulos de etapa --- */}
          {stageCount > 0 &&
            columns.map((c) => {
              const label = stageLabels[c.depth];
              if (!label) return null;
              // Los extremos se alinean a su borde para no salirse del área.
              const anchor = c.depth === 0 ? "start" : c.depth === maxDepth ? "end" : "middle";
              const x = anchor === "start" ? c.x0 : anchor === "end" ? c.x1 : (c.x0 + c.x1) / 2;
              return (
                <text
                  key={`stage-${c.depth}`}
                  x={x}
                  y={margin.top + 11}
                  textAnchor={anchor}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.9,
                    fill: t.textFaint,
                    textTransform: "uppercase",
                    animation: fadeIn(c.depth),
                    pointerEvents: "none",
                  }}
                >
                  {label}
                </text>
              );
            })}

          {/* --- Cintas (enlaces) --- */}
          <g fill="none">
            {layout?.links.map((l) => {
              const active = linkActive(l);
              const opacity = active === null ? 0.62 : active ? 0.92 : 0.1;
              return (
                <path
                  key={linkKey(l)}
                  d={sankeyLinkHorizontal()(l)}
                  stroke={`url(#sk-${uid}-${l.index})`}
                  strokeWidth={Math.max(1, l.width)}
                  strokeOpacity={opacity}
                  strokeDasharray={animate ? DRAW_LEN : undefined}
                  style={{
                    transition: "stroke-opacity 160ms ease",
                    cursor: "pointer",
                    animation: enter(l.source.depth),
                  }}
                  onMouseEnter={(e) => {
                    setFocus({ type: "link", key: linkKey(l) });
                    showTip(e, {
                      title: `${l.source.label ?? l.source.id} → ${l.target.label ?? l.target.id}`,
                      value: `${format(l.value)}${unit}`,
                      // Cuánto pesa este enlace dentro de todo lo que sale del origen:
                      // es la lectura útil ("el 15% de la línea 4 se rechaza").
                      sub: `${((l.value / l.source.value) * 100).toFixed(1)}% de ${l.source.label ?? l.source.id}`,
                    });
                  }}
                  onMouseMove={moveTip}
                  onMouseLeave={hideAll}
                />
              );
            })}
          </g>

          {/* --- Destellos de flujo (solo sobre lo enfocado) ---
              Guiones que recorren la cinta en el sentido del flujo. Van en una
              capa aparte para no pelearse con el dash del barrido de entrada. */}
          {flowOnHover && animate && focus && (
            <g fill="none" style={{ pointerEvents: "none" }}>
              {layout?.links.filter((l) => linkActive(l)).map((l) => (
                <path
                  key={`flow-${linkKey(l)}`}
                  d={sankeyLinkHorizontal()(l)}
                  stroke={t.panel}
                  strokeOpacity={0.5}
                  strokeWidth={Math.max(1, l.width)}
                  strokeDasharray="9 15"
                  style={{ animation: `sk-flow-${uid} 900ms linear infinite` }}
                />
              ))}
            </g>
          )}

          {/* --- Etiqueta de % sobre las cintas gruesas ---
              Solo donde de verdad cabe (`linkLabelMinWidth`): una cifra sobre
              cada cinta convertiría el diagrama en una sopa de números. El
              halo del color del panel la despega del fondo. */}
          {showLinkLabels && (
            <g style={{ pointerEvents: "none" }}>
              {layout?.links.map((l) => {
                if (l.width < linkLabelMinWidth) return null;
                const active = linkActive(l);
                const pct = (l.value / l.source.value) * 100;
                return (
                  <text
                    key={`lbl-${linkKey(l)}`}
                    x={(l.source.x1 + l.target.x0) / 2}
                    y={(l.y0 + l.y1) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fill: t.text,
                      stroke: t.panel,
                      strokeWidth: 3,
                      paintOrder: "stroke",
                      opacity: active === false ? 0.12 : 1,
                      transition: "opacity 160ms ease",
                      animation: fadeIn(l.source.depth + 1),
                    }}
                  >
                    {pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%
                  </text>
                );
              })}
            </g>
          )}

          {/* --- Nodos + etiquetas --- */}
          <g>
            {layout?.nodes.map((n) => {
              const focused = focus?.type === "node" && focus.key === n.id;
              const dimmed = focus && !focused && !layout.links.some((l) => linkActive(l) && (l.source.id === n.id || l.target.id === n.id));
              // Solo la primera columna rotula a la izquierda; todo lo demás,
              // a la derecha. Alternar según la mitad de la pantalla hacía que
              // dos columnas vecinas escribieran hacia el MISMO hueco y las
              // etiquetas largas chocaran de frente.
              const outward = n.depth === 0 ? "left" : "right";
              const labelX = outward === "right" ? n.x1 + 10 : n.x0 - 10;
              const anchor = outward === "right" ? "start" : "end";
              const cy = (n.y0 + n.y1) / 2;
              const h = Math.max(1, n.y1 - n.y0);
              const w = Math.max(1, n.x1 - n.x0);

              return (
                <g
                  key={n.id}
                  style={{
                    cursor: "pointer",
                    opacity: dimmed ? 0.3 : 1,
                    transition: "opacity 160ms ease",
                    animation: fadeIn(n.depth),
                  }}
                  onMouseEnter={(e) => {
                    setFocus({ type: "node", key: n.id });
                    showTip(e, {
                      title: n.label ?? n.id,
                      value: `${format(n.value)}${unit}`,
                      sub: n.note,
                    });
                  }}
                  onMouseMove={moveTip}
                  onMouseLeave={hideAll}
                >
                  {/* El nodo "héroe" es el final de la historia (p. ej. las
                      piezas buenas): halo + barra más marcada para que la
                      mirada termine ahí. */}
                  {n.hero && (
                    <rect
                      x={n.x0 - 3}
                      y={n.y0 - 3}
                      width={w + 6}
                      height={h + 6}
                      rx={6}
                      fill="none"
                      stroke={n._color}
                      strokeWidth={1.5}
                      strokeOpacity={0.4}
                    />
                  )}
                  <rect
                    x={n.x0}
                    y={n.y0}
                    width={w}
                    height={h}
                    rx={3}
                    fill={n._color}
                    // Anillo del color de la superficie: separa la barra de las
                    // cintas que la tocan, igual que el gap entre segmentos.
                    stroke={t.panel}
                    strokeWidth={1}
                    // Halo del propio color: en pastel el resplandor es lo que
                    // da presencia, ya que el color en sí es suave.
                    style={{ filter: `drop-shadow(0 0 ${n.hero ? 14 : 8}px ${n._color}${n.hero ? "99" : "66"})` }}
                  />
                  {focused && (
                    <rect
                      x={n.x0 - 2.5}
                      y={n.y0 - 2.5}
                      width={w + 5}
                      height={h + 5}
                      rx={5}
                      fill="none"
                      stroke={n._color}
                      strokeWidth={1.5}
                      strokeOpacity={0.55}
                    />
                  )}

                  {/* El texto usa tokens de texto, nunca el color de la serie
                      — salvo la cifra del héroe, que ES el titular del panel. */}
                  <text
                    x={labelX}
                    y={showValues ? cy - 2 : cy}
                    textAnchor={anchor}
                    dominantBaseline={showValues ? "auto" : "middle"}
                    style={{
                      fontSize: n.hero ? 13.5 : 12,
                      fontWeight: n.hero ? 800 : 600,
                      fill: t.text,
                      // Halo del color del panel: las columnas centrales rotulan
                      // POR ENCIMA de las cintas, y sin esto el texto se pierde.
                      stroke: t.panel,
                      strokeWidth: 3.5,
                      paintOrder: "stroke",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      pointerEvents: "none",
                    }}
                  >
                    {n.label ?? n.id}
                  </text>
                  {showValues && (
                    <text
                      x={labelX}
                      y={cy + (n.hero ? 15 : 12)}
                      textAnchor={anchor}
                      style={{
                        fontSize: n.hero ? 15 : 11.5,
                        fontWeight: n.hero ? 700 : 500,
                        // El valor sube a `textSoft` (antes `textFaint`): sobre
                        // una cinta de color, el gris más apagado desaparecía.
                        fill: n.hero ? n._color : t.textSoft,
                        stroke: t.panel,
                        strokeWidth: 3.5,
                        paintOrder: "stroke",
                        fontFamily: "'IBM Plex Mono', monospace",
                        pointerEvents: "none",
                      }}
                    >
                      {format(n.value)}{unit}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          <style>{`
            @keyframes sk-draw-${uid} {
              from { stroke-dashoffset: ${DRAW_LEN}; }
              to   { stroke-dashoffset: 0; }
            }
            @keyframes sk-fade-${uid} {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            @keyframes sk-flow-${uid} {
              to { stroke-dashoffset: -48; }
            }
            @media (prefers-reduced-motion: reduce) {
              .sk-${uid} *, .sk-${uid} { animation: none !important; }
            }
          `}</style>
        </svg>
      )}

      {/* --- Tooltip --- */}
      {tip && (
        <div
          style={{
            position: "absolute",
            left: flipX ? undefined : tip.x + 14,
            right: flipX ? Math.max(0, (width || 0) - tip.x + 14) : undefined,
            top: flipY ? undefined : tip.y + 14,
            bottom: flipY ? Math.max(0, height - tip.y + 14) : undefined,
            pointerEvents: "none",
            zIndex: 5,
            background: t.panel,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: "8px 11px",
            boxShadow: t.shadowHover,
            maxWidth: 260,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 3 }}>{tip.title}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: t.text }}>{tip.value}</div>
          {tip.sub && <div style={{ fontSize: 11, color: t.textSoft, marginTop: 2 }}>{tip.sub}</div>}
        </div>
      )}
    </div>
  );
}

export default SankeyChart;
