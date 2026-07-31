/**
 * Dial semicircular con bandas de color, ticks, aguja y marca de meta.
 *
 * Vive en el kit compartido porque es presentacional puro: recibe un valor
 * 0-100, una etiqueta y una meta, y no sabe nada del dominio. Lo usan las
 * subvistas de factor del detalle de máquina y el dashboard de planta.
 */
import { hasValue } from "@/lib/domain/index.js";
import { SIN_DATO } from "@/lib/format.js";
import { clampPct, bandColor } from "@/lib/shiftModel.js";
import { useCountUp, useMounted } from "@/lib/motion.js";

/**
 * El dial clásico de planta: se lee por la posición de la aguja.
 *
 * La aguja barre desde 0 hasta su valor al montar y la cifra cuenta con ella.
 * `useMounted` aporta el fotograma extra que hace falta para que la transición
 * arranque, porque una transición CSS solo corre cuando el valor cambia
 * después del primer pintado.
 *
 * El barrido no es adorno: en un dial la información está en la posición de la
 * aguja, y verla llegar es lo que la fija en el ojo.
 */
export function BandGauge({ value, label, meta, t, size = 260 }) {
  const listo = useMounted();
  // Sin medición no hay aguja ni cifra: un dial marcando 0.00 % es una lectura
  // y no la ausencia de una. Las bandas y la meta sí se dibujan, porque son la
  // escala y no el dato.
  const sinDato = !hasValue(value);
  const objetivo = clampPct(value);
  // La aguja va a 0 hasta el segundo fotograma; la cifra cuenta en paralelo.
  const v = listo ? objetivo : 0;
  const cifra = useCountUp(objetivo, 1000);
  const cx = size / 2, cy = size * 0.52, r = size * 0.36, sw = size * 0.075;
  const polar = (pct, rad = r) => {
    const a = Math.PI - (pct / 100) * Math.PI;
    return { x: cx + rad * Math.cos(a), y: cy - rad * Math.sin(a) };
  };
  const arc = (from, to, rad = r) => {
    const A = polar(from, rad), B = polar(to, rad);
    return `M ${A.x} ${A.y} A ${rad} ${rad} 0 0 1 ${B.x} ${B.y}`;
  };
  // El color sale del valor crudo y no del animado: con `v`, el dial arrancaría
  // en rojo por partir de 0 y viraría a verde por el camino, un falso positivo
  // de alarma en cada carga. Con `null`, bandColor devuelve el tono apagado.
  const col = bandColor(t, value);
  const metaA = polar(meta, r - sw * 0.6), metaB = polar(meta, r + sw * 0.6);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size * 0.68} viewBox={`0 0 ${size} ${size * 0.68}`} style={{ overflow: "visible" }}>
        {/* bandas: rojo <50, ámbar <75, verde ≥75 */}
        <path d={arc(0, 50)} fill="none" stroke={t.viz.coral} strokeWidth={sw} strokeLinecap="round" opacity={0.85} />
        <path d={arc(50, 75)} fill="none" stroke={t.viz.ambar} strokeWidth={sw} opacity={0.85} />
        <path d={arc(75, 100)} fill="none" stroke={t.viz.verde} strokeWidth={sw} strokeLinecap="round" opacity={0.85} />

        {/* ticks cada 10 y numeración */}
        {Array.from({ length: 11 }).map((_, i) => {
          const p = i * 10;
          const a = polar(p, r + sw * 0.62), b = polar(p, r + sw * 0.95), lbl = polar(p, r + sw * 1.7);
          return (
            <g key={p}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={t.textFaint} strokeWidth={1.6} />
              <text x={lbl.x} y={lbl.y + 4} textAnchor="middle" style={{ fontSize: size * 0.042, fill: t.textSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{p}</text>
            </g>
          );
        })}

        {/* marca de meta */}
        <line x1={metaA.x} y1={metaA.y} x2={metaB.x} y2={metaB.y} stroke={t.text} strokeWidth={2.5} strokeDasharray="3 2" />

        {/* Aguja. Se dibuja siempre apuntando al 0 y se lleva a su valor
            girándola, en lugar de mover `x2`/`y2`: los atributos geométricos
            de <line> no son propiedades CSS y no se pueden transicionar. El
            giro sí, y además rota alrededor del eje, como una aguja real. */}
        {!sinDato && (
          <line
            x1={cx} y1={cy} x2={cx - (r - sw * 0.9)} y2={cy}
            stroke={t.text} strokeWidth={3} strokeLinecap="round"
            style={{
              transform: `rotate(${(v / 100) * 180}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: "transform 1000ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        )}
        <circle cx={cx} cy={cy} r={size * 0.032} fill={t.text} />
        <circle cx={cx} cy={cy} r={size * 0.015} fill={col} />

        <text x={cx} y={cy - size * 0.1} textAnchor="middle" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: size * 0.15, fontWeight: 700, fill: col }}>
          {sinDato ? SIN_DATO : <>{cifra.toFixed(2)}<tspan style={{ fontSize: size * 0.075 }}>%</tspan></>}
        </text>
      </svg>
      <div style={{ marginTop: -2, fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: t.textFaint }}>
        {label} · meta {meta}%
      </div>
    </div>
  );
}
