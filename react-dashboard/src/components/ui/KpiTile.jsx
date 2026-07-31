/**
 * Tarjeta-KPI: etiqueta, cifra y subtítulo opcional. `strong` la resalta con
 * el color de acento para marcar el dato accionable.
 *
 * Presentacional pura: recibe el tema por prop, igual que el resto de piezas
 * compartidas entre el detalle de máquina y el dashboard.
 */

/** Tarjeta-KPI grande. `strong` marca el dato accionable. */
export function KpiTile({ label, value, sub, color, t, strong }) {
  return (
    <div
      style={{
        flex: "1 1 140px", padding: "12px 14px", borderRadius: 12,
        background: strong ? `${color}14` : t.hover,
        border: `1px solid ${strong ? `${color}55` : t.border}`,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 0.8, fontWeight: 700, textTransform: "uppercase", color: t.textFaint }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color, margin: "3px 0 1px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: t.textSoft }}>{sub}</div>}
    </div>
  );
}
