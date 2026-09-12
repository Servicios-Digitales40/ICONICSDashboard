/**
 * Aviso de que la sesión no se pudo renovar, en modo muro
 * (Plan 25 F9 · `SEG-01`, segunda mitad).
 *
 * ── POR QUÉ ES UN AVISO Y NO UN MODAL ───────────────────────────────
 *
 * Es la pregunta difícil que el Plan 22 dejó escrita: «qué pasa cuando caduca
 * a mitad de un turno en un wallboard sin teclado». Un modal de acceso ahí
 * deja el muro en blanco hasta que alguien suba con un teclado. Un dato viejo
 * SEÑALADO como viejo es más útil que una pantalla que nadie va a rellenar —
 * la misma regla que ya sigue `LatidoMuro`: lo que está en la pared no puede
 * mentir sobre su frescura, y tampoco puede desaparecer detrás de un modal.
 *
 * ── POR QUÉ NO ES EL MISMO SITIO QUE `LatidoMuro` ───────────────────
 *
 * Esquina distinta (arriba, no abajo): las dos pastillas informan de cosas
 * distintas —una de si los DATOS siguen llegando, ésta de si la SESIÓN sigue
 * viva— y superponerlas confundiría las dos preguntas en una.
 */
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";

import { useTheme } from "@/theme";

export function AvisoRenovacionMuro() {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation("settings");

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed", top: 12, right: 14, zIndex: 50,
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        background: t.panel, border: `1px solid ${t.amber}44`,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700,
        color: t.amber,
      }}
    >
      <ShieldAlert size={13} />
      {traducir("access.renewalFailedWall")}
    </div>
  );
}
