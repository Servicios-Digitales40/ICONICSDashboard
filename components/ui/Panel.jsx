/**
 * Tarjeta contenedora reutilizada en toda la app (gráficas, tablas,
 * formularios, loaders). Da fondo, borde, sombra, radio y una animación de
 * entrada escalonada.
 *
 * Props:
 *  - title, code: encabezado opcional (code = subtítulo en monospace)
 *  - right: nodo opcional a la derecha del encabezado (botón, filtro)
 *  - noPad: quita el padding interno, útil para tablas
 *  - className: clases extra además de `panel-card`, para reglas que necesitan
 *    CSS real (por ejemplo `order` dentro de una media query)
 *  - delay: retraso de entrada explícito, en segundos. Ver la nota de abajo.
 *  - bare: omite el encabezado propio de Panel Y su envoltorio de padding
 *    interno, dejando `children` crudo dentro del contenedor. Existe para que
 *    una variante con encabezado propio (radio distinto, sin borde bajo el
 *    título, alturas iguales en rejilla — ver `Demo-EVA/components/base.jsx`
 *    `Card`) pueda reusar el fondo/borde/sombra/animación de aquí en vez de
 *    duplicarlos.
 *  - onClick: opcional; hace clicable el contenedor completo.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";

// Contador de módulo que da a cada Panel un retraso distinto, para que la
// animación de entrada se vea en cascada.
//
// No se reinicia entre montajes, así que el índice con el que arranca una
// página depende de cuántos Panel se hayan montado antes en la sesión y la
// cascada sale unas veces en orden y otras al revés. Una vista que quiera una
// entrada ordenada debe pasar `delay` explícito en lugar de confiar en este
// contador, que se conserva por defecto para el resto de la app.
let panelIndex = 0;

export function Panel({ title, code, children, right, style, noPad, className, delay: delayProp, bare, onClick }) {
  const { theme: t } = useTheme();
  const delayAuto = useMemo(() => {
    panelIndex += 1;
    return Math.min((panelIndex % 8) * 0.05, 0.4);
  }, []);
  const delay = delayProp ?? delayAuto;

  return (
    <div
      className={className ? `panel-card ${className}` : "panel-card"}
      onClick={onClick}
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
      {bare ? (
        children
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
