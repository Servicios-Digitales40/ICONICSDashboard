/**
 * Las primitivas visuales de Demo EVA: escala tipográfica, tarjeta, sparkline,
 * delta y cifra animada.
 *
 * ── DE DÓNDE SALEN Y POR QUÉ SE COPIAN ─────────────────────────────
 *
 * Son las de `dashboard-v2`, una propuesta de diseño para el tablero de
 * Resonac que se evaluaba tras `VITE_ENABLE_PROTOTYPES`, con los mismos
 * números: el encargo era que esta sección se viera como «Planta · v2». Se
 * copiaron en vez de importarse por dos motivos, y el segundo es el que manda:
 *
 *  1. Aquella carpeta era superficie en evaluación y podía desaparecer.
 *     Desapareció, en efecto, con la transición al modelo de agua — y esta
 *     copia es lo único que sobrevive de ella.
 *  2. Sus tiles recibían datos de OEE (`s.oee`, `s.producidas`). Reutilizarlos
 *     habría obligado a un adaptador que tradujera agua a piezas, y ese
 *     adaptador sería el sitio exacto donde se colarían los números
 *     inventados que este módulo evita.
 *
 * Lo que se copia es la FORMA —escala, ritmo, superficies, animación—; los
 * datos son otros. Es la distinción que pedía el encargo.
 *
 * Lo que NO se copia y se importa de verdad: `useCountUp`, `useMounted` y
 * `usePrefersReducedMotion` de `@/lib/motion.js`, y todo el formateo de
 * `@/lib/format.js`. Eso es infraestructura compartida y duplicarla sería un
 * error, no una decisión.
 */
import { hasValue } from "@shared/valores.js";
import { SIN_DATO } from "@/lib/format.js";
import { useCountUp } from "@/lib/motion.js";

export const MONO = "'IBM Plex Mono', monospace";
export const SANS = "'Plus Jakarta Sans', sans-serif";

/**
 * Una sola escala para toda la vista, y un solo héroe.
 *
 * El héroe va en la SANS de la casa y no en mono: el mono da a cada dígito el
 * ancho de un «0» y a 44 px eso hace que «51.5» se lea suelto. El mono manda de
 * 26 px hacia abajo, donde la alineación tabular sí trabaja a favor.
 */
export const ESCALA = {
  heroe: { fontFamily: SANS, fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: -1.2 },
  kpi: { fontFamily: MONO, fontSize: 26, fontWeight: 700, lineHeight: 1.1 },
  tile: { fontFamily: MONO, fontSize: 20, fontWeight: 700, lineHeight: 1.1 },
  dato: { fontFamily: MONO, fontSize: 13, fontWeight: 600 },
  etiqueta: { fontSize: 10, fontWeight: 700, letterSpacing: 0.9, textTransform: "uppercase" },
};

/**
 * La tarjeta, con tres niveles de superficie y entrada escalonada explícita.
 *
 * `tono` da la ruta de entrada al ojo: «titular» (lavado de acento, sin borde),
 * «detalle» (el panel de siempre) y «navegacion» (plano, se eleva al hover: se
 * lee como «esto se toca»).
 *
 * `delay` es EXPLÍCITO y lo fija la posición en la rejilla, arriba-izquierda →
 * abajo-derecha. El `Panel` del kit escalona con un contador de módulo que no
 * se reinicia entre montajes, así que su cascada arranca en un índice
 * arbitrario según por dónde hayas navegado.
 */
export function Card({ title, code, right, children, t, tono = "detalle", delay = 0, style, onClick }) {
  const fondos = {
    titular: {
      background: `linear-gradient(135deg, ${t.accentSoft} 0%, ${t.panel} 62%)`,
      border: `1px solid ${t.border}`,
      boxShadow: t.shadow,
    },
    detalle: { background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.shadow },
    navegacion: { background: t.panel, border: `1px solid ${t.border}`, boxShadow: "none" },
  };

  return (
    <div
      className="panel-card"
      onClick={onClick}
      style={{
        ...fondos[tono],
        borderRadius: tono === "titular" ? 20 : 16,
        padding: "16px 18px 18px",
        // Alturas iguales dentro de una banda: el grid estira el envoltorio y
        // la tarjeta lo llena. Es lo que hace que los cantos alineen.
        height: "100%",
        display: "flex",
        flexDirection: "column",
        animation: "fadeInUp 0.5s ease both",
        animationDelay: `${delay}s`,
        "--shadow-hover": t.shadowHover,
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: t.text, fontFamily: SANS }}>{title}</h3>}
            {code && <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.textFaint }}>{code}</span>}
          </div>
          {right}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

/**
 * Sparkline en SVG a mano, no recharts: son ~24 puntos sin ejes ni tooltip, y
 * montar un `ResponsiveContainer` por tarjeta costaría más de lo que vale.
 *
 * El punto final lleva el anillo de 2 px en color de superficie que pide la
 * especificación de marcas, para que se lea aunque caiga sobre la propia línea.
 */
export function Spark({ serie, color, t, w = 78, h = 24, delay = 0 }) {
  if (!serie || serie.length < 2) return null;

  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const span = max - min || 1;
  const x = (i) => 2 + (i / (serie.length - 1)) * (w - 4);
  const y = (v) => h - 4 - ((v - min) / span) * (h - 8);
  const d = serie.map((v, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible", flexShrink: 0 }} aria-hidden="true">
      {/* `pathLength=100` normaliza el trazo para que el keyframe compartido
          `trazoDibujo` sirva sin medir la ruta. Se dibuja de izquierda a
          derecha, en el sentido en que se lee el tiempo. */}
      <path
        className="trazo-dibujo" pathLength={100} d={d}
        fill="none" stroke={t.textFaint} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.65}
        style={{ animationDelay: `${delay}s` }}
      />
      <circle
        cx={x(serie.length - 1)} cy={y(serie.at(-1))} r={3}
        fill={color} stroke={t.panel} strokeWidth={2}
        style={{ animation: `fadeIn 300ms ease ${delay + 0.85}s both` }}
      />
    </svg>
  );
}

/**
 * Variación con signo entre las dos últimas muestras.
 *
 * `subirEsBueno` admite `null`, y ése es el añadido respecto a la v2 de
 * Resonac: en una temperatura de proceso o en una tensión de línea **ninguna
 * dirección es buena** —lo bueno es quedarse en banda—, así que pintar la
 * flecha en verde o en coral afirmaría algo falso. Con `null` el delta va en
 * tono neutro y sólo informa del movimiento.
 */
export function Delta({ valor, t, subirEsBueno = true, unidad = "", decimales = 1 }) {
  if (!hasValue(valor) || Math.abs(valor) < 10 ** -decimales / 2) {
    return <span style={{ fontSize: 11, color: t.textFaint }}>sin cambio</span>;
  }

  const sube = valor > 0;
  const color =
    subirEsBueno === null ? t.textSoft : sube === subirEsBueno ? t.viz.verde : t.viz.coral;

  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: MONO }}>
      {sube ? "▲" : "▼"} {Math.abs(valor).toFixed(decimales)}{unidad}
    </span>
  );
}

/**
 * Cifra que cuenta hasta su valor.
 *
 * Se extrae como componente porque el conteo es un hook y hace falta uno por
 * número — dentro de un `.map()` no cabe. Con `valor` null no hay destino que
 * contar: los hooks no pueden ser condicionales, así que se anima hacia 0 pero
 * se PINTA el guion.
 */
export function Cifra({ valor, fmt, duracion = 1000, style }) {
  const hay = hasValue(valor);
  const v = useCountUp(hay ? valor : 0, duracion);
  return <span style={style}>{hay ? fmt(v) : SIN_DATO}</span>;
}

/**
 * Punto de color de un estado, con su etiqueta. La identidad de un estado nunca
 * es sólo el tono, así que las dos cosas viajan juntas en un solo componente y
 * no se pueden separar por descuido.
 */
export function PuntoEstado({ color, size = 8 }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%",
        background: color, flexShrink: 0, display: "inline-block",
      }}
    />
  );
}
