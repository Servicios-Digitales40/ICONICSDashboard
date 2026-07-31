/**
 * Exporta dos piezas:
 *
 *  - <Toast>: una notificación individual.
 *  - <ToastContainer>: la lista fija en la esquina, que monta `ToastProvider`
 *    una sola vez para toda la app.
 */
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { useTheme } from "@/theme";

export function Toast({ toast, onClose }) {
  const { theme: t } = useTheme();
  const map = {
    success: { icon: <CheckCircle2 size={16} />, grad: t.gradSuccess },
    error: { icon: <XCircle size={16} />, grad: t.gradWarm },
    info: { icon: <Info size={16} />, grad: t.gradAccent },
  };
  const s = map[toast.type];
  return (
    <div className="toast-in" style={{ display: "flex", alignItems: "center", gap: 10, background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12, padding: "12px 14px", boxShadow: t.shadowHover, minWidth: 260 }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: s.grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>{s.icon}</span>
      <span style={{ fontSize: 12.5, color: t.text, flex: 1 }}>{toast.message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.textFaint, display: "flex" }}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onClose }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map((tst) => (
        <Toast key={tst.id} toast={tst} onClose={() => onClose(tst.id)} />
      ))}
    </div>
  );
}
