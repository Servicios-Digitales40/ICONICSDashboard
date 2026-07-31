/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/components/ui/GradientRingLoader.jsx
 * Motivo: primitiva del kit sin ningún consumidor vivo tras archivar las páginas de la plantilla.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/** Loaders/GradientRingLoader.jsx — anillo con degradado que gira (efecto "cargando premium"). */
import { useTheme } from "@/theme";

export function GradientRingLoader() {
  const { theme: t } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width="46" height="46" viewBox="0 0 46 46" className="spin-slow">
        <defs>
          <linearGradient id="ringgrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={t.accent} stopOpacity="0" />
            <stop offset="100%" stopColor={t.accent} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle cx="23" cy="23" r="18" fill="none" stroke="url(#ringgrad)" strokeWidth="4" strokeLinecap="round" strokeDasharray="85 200" />
      </svg>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: t.textSoft }}>analizando…</span>
    </div>
  );
}
