/**
 * Botón con variantes semánticas. Los colores salen de `variant`:
 * primary | danger-solid | secondary | ghost | danger | success | icon
 */
import { Loader2 } from "lucide-react";
import { useTheme } from "@/theme";

export function Button({ variant = "primary", icon, children, loading, onClick, type = "button" }) {
  const { theme: t } = useTheme();

  const base = {
    display: "inline-flex", alignItems: "center", gap: 7,
    fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9,
    cursor: loading ? "default" : "pointer", border: "none",
    fontFamily: "'Inter', sans-serif", opacity: loading ? 0.75 : 1,
  };

  const variants = {
    primary: { background: t.gradAccent, color: "#FFFFFF", boxShadow: `0 4px 14px ${t.accent}4D` },
    "danger-solid": { background: t.gradWarm, color: "#FFFFFF", boxShadow: `0 4px 14px ${t.coral}4D` },
    secondary: { background: "transparent", color: t.text, border: `1px solid ${t.border}` },
    ghost: { background: t.hover, color: t.text },
    danger: { background: `${t.coral}18`, color: t.coral },
    success: { background: `${t.success}18`, color: t.success },
    icon: { background: t.hover, color: t.textSoft, padding: 9, borderRadius: 9 },
  };

  return (
    <button type={type} className="app-btn" onClick={onClick} style={{ ...base, ...variants[variant] }}>
      {loading ? <Loader2 size={14} className="spin" /> : icon}
      {children}
    </button>
  );
}
