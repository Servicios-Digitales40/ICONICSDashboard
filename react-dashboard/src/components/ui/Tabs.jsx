/**
 * Control segmentado de pestañas. Deriva sus colores del tema global, así que
 * respeta claro y oscuro.
 *
 * Sirve para navegar entre subvistas de una misma pantalla sin tocar el
 * router: el estado de la pestaña activa vive en el componente padre y se
 * comunica por `value` / `onChange`.
 *
 * Implementa el patrón ARIA de tabs (role="tablist" y role="tab",
 * aria-selected, navegación con flechas y Home/End). Cada consumidor debe
 * envolver su contenido en un contenedor role="tabpanel".
 *
 * Props:
 *  - items: [{ key, label, icon?, color? }], con color opcional por pestaña
 *  - value: key de la pestaña activa
 *  - onChange: (key) => void
 *  - size: "md" (por defecto) | "sm"
 */
import { useRef } from "react";
import { useTheme } from "@/theme";

export function Tabs({ items = [], value, onChange, size = "md" }) {
  const { theme: t } = useTheme();
  const refs = useRef([]);

  const idx = Math.max(0, items.findIndex((it) => it.key === value));
  const pad = size === "sm" ? "6px 12px" : "9px 16px";
  const font = size === "sm" ? 12.5 : 13.5;

  // Navegación por teclado entre pestañas (patrón ARIA).
  const onKeyDown = (e) => {
    let next = null;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next != null) {
      e.preventDefault();
      onChange(items[next].key);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Subvistas"
      onKeyDown={onKeyDown}
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        borderRadius: 12,
        background: t.hover,
        border: `1px solid ${t.border}`,
      }}
    >
      {items.map((it, i) => {
        const active = it.key === value;
        const accent = it.color || t.accent;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: pad,
              borderRadius: 9,
              border: "none",
              cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: font,
              fontWeight: active ? 700 : 600,
              letterSpacing: 0.2,
              color: active ? accent : t.textSoft,
              background: active ? t.panel : "transparent",
              boxShadow: active ? `${t.shadow}, inset 0 0 0 1px ${accent}44` : "none",
              transition: "color 160ms ease, background 160ms ease, box-shadow 160ms ease",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = t.text;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = t.textSoft;
            }}
          >
            {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.4} color={active ? accent : "currentColor"} />}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
