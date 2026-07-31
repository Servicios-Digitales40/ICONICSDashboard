/**
 * Campo de texto con icono a la izquierda y estados de validación: error en
 * rojo con mensaje, éxito con check verde.
 */
import { AlertTriangle, Check } from "lucide-react";
import { useTheme } from "@/theme";

export function fieldStyle(t) {
  return {
    width: "100%", boxSizing: "border-box", background: t.hover,
    border: `1px solid ${t.border}`, borderRadius: 9, padding: "9px 12px",
    fontSize: 13, color: t.text, fontFamily: "'Inter', sans-serif",
  };
}

export function Input({ icon, placeholder, type = "text", error, success, value, onChange }) {
  const { theme: t } = useTheme();
  const borderColor = error ? t.coral : success ? t.success : t.border;
  return (
    <div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: error ? t.coral : t.textFaint, display: "flex" }}>
          {icon}
        </span>
        <input
          type={type} placeholder={placeholder} value={value} onChange={onChange} className="field"
          style={{ ...fieldStyle(t), paddingLeft: 32, borderColor }}
        />
        {error && <AlertTriangle size={14} color={t.coral} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)" }} />}
        {success && <Check size={14} color={t.success} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)" }} />}
      </div>
      {error && <div style={{ fontSize: 11.5, color: t.coral, marginTop: 5 }}>{error}</div>}
    </div>
  );
}
