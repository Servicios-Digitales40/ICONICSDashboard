/**
 * ui/Panel.jsx
 * ------------------------------------------------------------------
 * Tarjeta contenedora reutilizada en TODA la app (gráficas, tablas,
 * formularios, loaders...). Da fondo, borde, sombra, radio y una
 * animación de entrada escalonada automática.
 *
 * Props:
 *  - title, code: encabezado opcional (code = subtítulo tipo monospace)
 *  - right: nodo opcional a la derecha del encabezado (botón, filtro...)
 *  - noPad: si es true, quita el padding interno (útil para tablas)
 *  - className: clases extra, ADEMÁS de `panel-card` (para reglas que
 *    necesitan CSS real, p. ej. `order` dentro de una media query)
 *  - delay: retraso de entrada EXPLÍCITO, en segundos. Ver la nota de abajo.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";

// Contador de módulo: da a cada Panel un pequeño retraso distinto para que la
// animación de entrada se vea "en cascada".
//
// ⚠ NO se reinicia entre montajes, así que el índice con el que arranca una
// página depende de cuántos Panel se hayan montado antes en la sesión: la
// cascada sale unas veces en orden y otras al revés, según por dónde hayas
// navegado. Por eso una vista que quiera una entrada ORDENADA debe pasar
// `delay` explícito (arriba-izquierda → abajo-derecha) en lugar de confiar en
// este contador. Se conserva como comportamiento por defecto para no tocar las
// decenas de Panel del resto de la app, que no dependen del orden.
let panelIndex = 0;

export function Panel({ title, code, children, right, style, noPad, className, delay: delayProp }) {
  const { theme: t } = useTheme();
  const delayAuto = useMemo(() => {
    panelIndex += 1;
    return Math.min((panelIndex % 8) * 0.05, 0.4);
  }, []);
  const delay = delayProp ?? delayAuto;

  return (
    <div
      className={className ? `panel-card ${className}` : "panel-card"}
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        padding: noPad ? 0 : "20px 22px 24px",
        boxShadow: t.shadow,
        animation: "fadeInUp 0.5s ease both",
        animationDelay: `${delay}s`,
        "--shadow-hover": t.shadowHover,
        ...style,
      }}
    >
      {(title || right) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: `1px solid ${t.border}`,
            padding: noPad ? "18px 20px 12px" : 0,
          }}
        >
          <div>
            {title && (
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {title}
              </h3>
            )}
            {code && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: t.textFaint }}>{code}</span>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: noPad ? "0 20px 20px" : 0 }}>{children}</div>
    </div>
  );
}
