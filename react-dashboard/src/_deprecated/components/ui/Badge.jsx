/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/Badge.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** ui/Badge.jsx — pastilla de estado (activo / pagado / pendiente / vencido / inactivo). */
import { useTheme } from "@/theme";

export function Badge({ status }) {
  const { theme: t } = useTheme();
  const map = {
    activo: { label: "Activo", bg: t.accentSoft, fg: t.accent },
    pagado: { label: "Pagado", bg: t.successSoft, fg: t.success },
    pendiente: { label: "Pendiente", bg: t.amberSoft, fg: t.amber },
    vencido: { label: "Vencido", bg: t.coralSoft, fg: t.coral },
    inactivo: { label: "Inactivo", bg: `${t.textFaint}22`, fg: t.textFaint },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: s.bg, color: s.fg, fontSize: 11.5, fontWeight: 600,
        padding: "3px 9px", borderRadius: 999, fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.fg }} />
      {s.label}
    </span>
  );
}
