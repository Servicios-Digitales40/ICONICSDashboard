/**
 * Envuelve cualquier elemento y le añade un tooltip flotante al pasar el
 * cursor O al recibir foco de teclado — un tooltip que solo responde a mouse
 * no existe para quien navega con Tab (WCAG 2.1.1).
 *
 * `wide` permite una frase explicativa que puede envolver en varias líneas,
 * en vez del rótulo corto de una palabra que asume `nowrap`.
 */
import { useState } from "react";
import { useTheme } from "@/theme";

export function HoverTip({ children, label, wide }) {
  const { theme: t } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className="tooltip-pop"
          role="tooltip"
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
            background: t.text, color: t.panel, fontSize: 11.5, fontWeight: 500, padding: "6px 10px",
            borderRadius: 7, boxShadow: t.shadowHover, zIndex: 20,
            fontFamily: "'Inter', sans-serif",
            ...(wide
              ? { whiteSpace: "normal", width: 220, lineHeight: 1.5, textAlign: "left" }
              : { whiteSpace: "nowrap" }),
          }}
        >
          {label}
          {/* impeccable-disable-next-line side-tab -- triángulo CSS: bordes transparentes recortan la punta, no es un acento lateral */}
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `5px solid ${t.text}` }} />
        </span>
      )}
    </span>
  );
}
