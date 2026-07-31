/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/Spinner.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** Loaders/Spinner.jsx — ícono girando + etiqueta. El loader más "clásico". */
import { Loader2 } from "lucide-react";
import { useTheme } from "@/theme";

export function Spinner() {
  const { theme: t } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Loader2 size={19} color={t.accent} className="spin" />
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: t.textSoft }}>
        cargando datos…
      </span>
    </div>
  );
}
