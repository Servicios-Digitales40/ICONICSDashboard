/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/pages/Tables.jsx
 * Motivo: página de la plantilla original «aurora-dashboard»; llevaba tiempo comentada en NAV y se retiró del router.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * pages/Tables.jsx
 * ------------------------------------------------------------------
 * Galería de estilos de tabla: tabla ordenable con progreso inline,
 * tabla compacta de facturas con alineación numérica, y el
 * explorador de archivos (árbol recursivo).
 */
import { useMemo, useState } from "react";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useTheme } from "@/theme";
import { tableRows, invoiceRows, fileTree } from "../data/mockData.js";
import { Panel, Badge, HoverTip, TreeNode } from "../components/ui/index.js";

export default function Tables() {
  const { theme: t } = useTheme();
  const [sortDesc, setSortDesc] = useState(true);

  const sortedRows = useMemo(() => {
    const copy = [...tableRows];
    copy.sort((a, b) => (sortDesc ? b.progreso - a.progreso : a.progreso - b.progreso));
    return copy;
  }, [sortDesc]);

  return (
    <>
      <Panel
        title="Tabla de equipo"
        code="ordenable · badges de estado"
        style={{ marginBottom: 16 }}
        right={
          <button onClick={() => setSortDesc((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${t.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 11.5, color: t.textSoft, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>
            <ArrowUpDown size={12} />progreso {sortDesc ? "desc" : "asc"}
          </button>
        }
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{["Nombre", "Rol", "Estado", "Progreso", ""].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: t.textFaint, borderBottom: `1px solid ${t.border}`, fontWeight: 500 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={i} className="table-row">
                <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}`, color: t.text, fontWeight: 500 }}>{row.name}</td>
                <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}`, color: t.textSoft }}>{row.rol}</td>
                <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}` }}><Badge status={row.estado} /></td>
                <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}`, width: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: t.grid, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${row.progreso}%`, height: "100%", background: t.gradAccent, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace", width: 28 }}>{row.progreso}%</span>
                  </div>
                </td>
                <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}`, textAlign: "right" }}>
                  <HoverTip label="Más acciones"><MoreHorizontal size={16} color={t.textFaint} style={{ cursor: "pointer" }} /></HoverTip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        <Panel title="Facturas" code="tabla compacta · alineación numérica">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>{["Factura", "Cliente", "Monto", "Estado"].map((h, i) => (
                <th key={i} style={{ textAlign: i === 2 ? "right" : "left", padding: "8px 10px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: t.textFaint, borderBottom: `1px solid ${t.border}`, fontWeight: 500 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {invoiceRows.map((row, i) => (
                <tr key={i} className="table-row">
                  <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: t.textSoft }}>{row.id}</td>
                  <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}`, color: t.text, fontWeight: 500 }}>{row.cliente}</td>
                  <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: t.text, fontFamily: "'IBM Plex Mono', monospace" }}>${row.monto.toLocaleString()}</td>
                  <td style={{ padding: "10px", borderBottom: `1px solid ${t.border}` }}><Badge status={row.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Explorador de archivos" code="árbol recursivo">
          <div style={{ maxHeight: 190, overflowY: "auto" }} className="scrollbar-thin">
            <TreeNode node={fileTree} />
          </div>
        </Panel>
      </div>
    </>
  );
}
