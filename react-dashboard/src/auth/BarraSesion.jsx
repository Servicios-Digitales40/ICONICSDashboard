/**
 * Quién está dentro, y cómo salir.
 *
 * ── POR QUÉ EXISTE YA, SIENDO TAN POCO ─────────────────────────────
 *
 * Porque sin ella la Fase 4 dejaría un agujero funcional: `SesionProvider`
 * sabe salir, hay una prueba que lo comprueba, y ninguna persona podría
 * hacerlo. En un equipo compartido de planta eso no es un detalle de comodidad
 * — es que el turno siguiente hereda la sesión del anterior, con sus permisos
 * de escritura sobre la planta.
 *
 * ── ES PROVISIONAL, Y ESO ESTÁ DECIDIDO ────────────────────────────
 *
 * La Fase 5 rehace el asistente como pantalla completa y esta información
 * —quién eres, cómo sales— pertenece a la cabecera de ese chat, no a una
 * barra flotando por encima. Se escribe aparte y mínima a propósito: cuando
 * llegue la cabecera de verdad, esto se absorbe y el archivo desaparece.
 *
 * No lleva más de lo que necesita: nada de avatar, ni menú desplegable, ni
 * ajustes. Todo eso serían decisiones de diseño tomadas aquí por inercia y
 * heredadas sin discutir por la fase que sí tiene que tomarlas.
 */
import { LogOut } from "lucide-react";

import { useTheme } from "@/theme";
import { MONO } from "@/theme/tipografia.js";
import { useSesion } from "./SesionProvider.jsx";

export default function BarraSesion() {
  const { theme: t } = useTheme();
  const { usuario, salir } = useSesion();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 12,
        padding: "8px 14px",
        borderBottom: `1px solid ${t.border}`,
        background: t.panel,
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 12, color: t.textFaint }}>{usuario}</span>
      <button
        type="button"
        onClick={salir}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          fontSize: 12,
          fontWeight: 600,
          color: t.textSoft,
          background: "transparent",
          border: `1px solid ${t.border}`,
          borderRadius: 7,
          cursor: "pointer",
        }}
      >
        <LogOut size={13} aria-hidden="true" />
        Salir
      </button>
    </div>
  );
}
