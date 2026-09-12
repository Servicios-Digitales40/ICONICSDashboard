/**
 * Botón con variantes semánticas. Los colores salen de `variant`:
 * primary | danger-solid | secondary | ghost | danger | success | icon
 *
 * ── ALTURA MÍNIMA TÁCTIL (Plan 24 F8 · `USO-08`) ───────────────────
 *
 * `minHeight: 44` y no sólo el padding. Medido antes de ponerlo: `9px 16px`
 * sobre texto de 13 px daba **36 px de alto**, y ése era el botón de «Encender»
 * de `ControlesTanque` — el control de más consecuencia del tablero, por debajo
 * del mínimo que WCAG 2.5.5 recomienda para un dedo.
 *
 * Va AQUÍ y no en cada vista a propósito: puesto en el kit, ninguna pantalla
 * futura nace por debajo del mínimo, y el día que haya que cambiarlo se cambia
 * una vez. Es la misma razón por la que `useMensajeDeError` decide en un solo
 * sitio lo que once pantallas pintan.
 *
 * No sustituye al padding, lo acompaña: el padding sigue definiendo la forma
 * —`DESIGN.md` es explícito en que la altura no es fija— y `minHeight` sólo
 * pone un suelo. Un botón con más texto o un icono más grande sigue creciendo.
 *
 * El criterio completo, con lo que se mide y en qué unidades, está en la sección
 * «Criterio táctil» de `DESIGN.md`.
 */
import { Loader2 } from "lucide-react";
import { useTheme } from "@/theme";

/** Mínimo pulsable con guantes. Ver `DESIGN.md` § Criterio táctil. */
const ALTO_TACTIL_MIN = 44;

export function Button({ variant = "primary", icon, children, loading, disabled, onClick, type = "button" }) {
  const { theme: t } = useTheme();
  const inactivo = loading || disabled;

  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9,
    minHeight: ALTO_TACTIL_MIN,
    cursor: inactivo ? "default" : "pointer", border: "none",
    fontFamily: "'Inter', sans-serif", opacity: inactivo ? 0.75 : 1,
  };

  const variants = {
    primary: { background: t.gradAccent, color: "#FFFFFF", boxShadow: `0 4px 14px ${t.accent}4D` },
    "danger-solid": { background: t.gradWarm, color: "#FFFFFF", boxShadow: `0 4px 14px ${t.coral}4D` },
    secondary: { background: "transparent", color: t.text, border: `1px solid ${t.border}` },
    ghost: { background: t.hover, color: t.text },
    danger: { background: `${t.coral}18`, color: t.coral },
    success: { background: `${t.success}18`, color: t.success },
    /* `minWidth` además de la altura del `base`: es el único cuadrado, y sin él
       un icono de 14 px con padding 9 daba 32 px de ANCHO aunque el alto ya
       cumpliera. Un objetivo de 32 × 44 no es un objetivo de 44. */
    icon: {
      background: t.hover, color: t.textSoft, padding: 9, borderRadius: 9,
      minWidth: ALTO_TACTIL_MIN,
    },
  };

  return (
    <button
      type={type}
      className="app-btn"
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant] }}
    >
      {loading ? <Loader2 size={14} className="spin" /> : icon}
      {children}
    </button>
  );
}
