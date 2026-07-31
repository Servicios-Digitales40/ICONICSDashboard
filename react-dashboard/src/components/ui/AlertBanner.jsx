/** ui/AlertBanner.jsx — banner de alerta inline (no flotante) en 4 variantes semánticas. */
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { useTheme } from "@/theme";

export function AlertBanner({ type, title, message }) {
  const { theme: t } = useTheme();
  const map = {
    success: { icon: <CheckCircle2 size={17} />, bg: t.successSoft, fg: t.success },
    error: { icon: <XCircle size={17} />, bg: t.coralSoft, fg: t.coral },
    warning: { icon: <AlertTriangle size={17} />, bg: t.amberSoft, fg: t.amber },
    info: { icon: <Info size={17} />, bg: t.accentSoft, fg: t.accent },
  };
  const s = map[type];
  return (
    <div style={{ display: "flex", gap: 11, background: s.bg, borderRadius: 10, padding: "12px 14px", border: `1px solid ${s.fg}33` }}>
      <span style={{ color: s.fg, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: s.fg, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>{message}</div>
      </div>
    </div>
  );
}
