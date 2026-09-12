/**
 * Banner de alerta inline (no flotante), en cuatro variantes semánticas.
 *
 * ── POR QUÉ TRES NIVELES DE TEXTO Y NO DOS ─────────────────────────
 *
 * `detalle` es del Plan de códigos de error. Un fallo del puente llega ahora
 * con dos cosas distintas: su CLASE, que el tablero sabe decir en el idioma
 * activo («El archivo supera el límite de este servidor»), y el DETALLE que
 * sólo el servidor conoce («…de 25 MB»). Meter los dos en `message` los
 * mezclaría en una frase cosida que en inglés no se puede ordenar bien; en
 * dos líneas, la de arriba se lee y la de abajo se consulta.
 *
 * Se pinta más pequeño y en gris a propósito: es información de apoyo, y a
 * menudo trae el nombre de una variable de entorno o de un tag. Cuando no
 * añade nada —el caso normal en español, donde la frase del diccionario y la
 * del servidor coinciden— llega `null` y no se pinta nada. Ver
 * `i18n/useMensajeDeError.js`, que es quien decide eso.
 *
 * ── Y UN CUARTO: QUÉ HACER (Plan 24 F2 · `USO-04`) ─────────────────
 *
 * `accion` es la diferencia entre nombrar un fallo y ser útil. Hasta ahora el
 * tablero decía muy bien QUÉ había pasado —en los dos idiomas, con su código y
 * su detalle— y nada sobre qué hacer al respecto; para eso había que conocer el
 * despliegue por dentro.
 *
 * Va DEBAJO del detalle y no arriba, aunque sea lo más accionable de las tres
 * líneas. El orden es el del razonamiento de quien lo lee: qué falló, con qué
 * dato exacto, y entonces qué hacer — invertirlo daría una instrucción antes de
 * decir a qué responde.
 *
 * Y no se pinta como un cuarto gris más: lleva un borde que la separa y el peso
 * del texto normal, porque es lo único de la tarjeta sobre lo que alguien puede
 * actuar. Un párrafo de apoyo en gris claro es lo que nadie lee.
 */
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { useTheme } from "@/theme";

export function AlertBanner({ type, title, message, detalle = null, accion = null }) {
  const { theme: t } = useTheme();
  const map = {
    success: { icon: <CheckCircle2 size={17} />, bg: t.successSoft, fg: t.success },
    error: { icon: <XCircle size={17} />, bg: t.coralSoft, fg: t.coral },
    warning: { icon: <AlertTriangle size={17} />, bg: t.amberSoft, fg: t.amber },
    info: { icon: <Info size={17} />, bg: t.accentSoft, fg: t.accent },
  };
  const s = map[type];
  return (
    <div style={{ display: "flex", gap: 11, background: s.bg, borderRadius: 10, padding: "12px 14px", border: `1px solid ${s.fg}33` }}>
      <span style={{ color: s.fg, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: s.fg, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>{message}</div>
        {detalle && (
          <div
            style={{
              marginTop: 4, fontSize: 11.5, lineHeight: 1.45, color: t.textFaint,
              fontFamily: "'IBM Plex Mono', monospace", overflowWrap: "anywhere",
            }}
          >
            {detalle}
          </div>
        )}
        {accion && (
          <div
            style={{
              marginTop: 8, paddingTop: 8, borderTop: `1px solid ${s.fg}26`,
              fontSize: 12.5, lineHeight: 1.5, color: t.textSoft,
            }}
          >
            {accion}
          </div>
        )}
      </div>
    </div>
  );
}
