/** ui/HoverTip.jsx — envuelve cualquier elemento y muestra un tooltip flotante al pasar el cursor. */
import { useState } from "react";
import { useTheme } from "@/theme";

export function HoverTip({ children, label }) {
  const { theme: t } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span
          className="tooltip-pop"
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
            background: t.text, color: t.panel, fontSize: 11.5, fontWeight: 500, padding: "6px 10px",
            borderRadius: 7, whiteSpace: "nowrap", boxShadow: t.shadowHover, zIndex: 20,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {label}
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `5px solid ${t.text}` }} />
        </span>
      )}
    </span>
  );
}
