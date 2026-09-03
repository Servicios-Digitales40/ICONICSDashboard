/**
 * La pantalla de una capacidad que este módulo TODAVÍA no puede dar.
 *
 * ── POR QUÉ UN PLACEHOLDER HONESTO Y NO UNO BONITO ──────────────────
 *
 * Porque la forma normal de dejar una pantalla «para después» —cuatro tarjetas
 * con cifras de ejemplo y una gráfica de datos inventados— es exactamente lo
 * que `CLAUDE.md` §2.5 prohíbe. Una curva plausible en un tablero de planta no
 * se lee como un boceto: se lee como una medida. Y la primera persona que la
 * enseñe en una demo estará afirmando algo que nadie ha medido.
 *
 * Así que esta pantalla no dibuja nada que parezca un dato. Dice tres cosas,
 * en este orden:
 *
 *   1. qué va a enseñar cuando exista
 *   2. qué falta EXACTAMENTE para que exista
 *   3. dónde se está siguiendo eso
 *
 * Es el mismo criterio que ya usa el backend cuando le falta una pieza: se
 * niega y explica qué falta, en vez de degradar en silencio.
 *
 * ── POR QUÉ VIVE EN EL MÓDULO Y NO EN `components/ui/` ──────────────
 *
 * Porque no es un componente genérico: su texto da por hecho que lo que falta
 * es un contrato de API, y su pie remite a un plan concreto. El kit de UI no
 * debe saber nada de eso. Si algún día un segundo módulo necesita lo mismo, se
 * sube entonces — con lo que los dos casos tengan de verdad en común.
 */
import { FileQuestion } from "lucide-react";

import { Panel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { MONO, SANS } from "@/Demo-EVA/components/base.jsx";

/**
 * @param {object}   props
 * @param {string}   props.titulo      qué pantalla es
 * @param {string}   props.resumen     una frase: qué responderá cuando exista
 * @param {string[]} props.mostrara    lo que enseñará, en concreto
 * @param {string[]} props.necesita    qué falta para poder construirla
 * @param {string}   [props.fase]      la fase del plan que la desbloquea
 */
export function PantallaPendiente({ titulo, resumen, mostrara, necesita, fase }) {
  const { theme: t } = useTheme();

  const lista = (items, color) => (
    <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
      {items.map((texto) => (
        <li key={texto} style={{ color, fontSize: 13.5, lineHeight: 1.55 }}>
          {texto}
        </li>
      ))}
    </ul>
  );

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 860 }}>
      <Panel>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: 10,
              background: t.amberSoft,
              color: t.amber,
            }}
          >
            <FileQuestion size={19} />
          </span>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontFamily: SANS, fontSize: 17, fontWeight: 700, color: t.text }}>
                {titulo}
              </h2>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: t.amber,
                  border: `1px solid ${t.amber}`,
                  borderRadius: 4,
                  padding: "2px 6px",
                }}
              >
                Sin datos todavía
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: t.textSoft }}>{resumen}</p>
          </div>
        </div>
      </Panel>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(19rem, 1fr))" }}>
        <Panel title="Qué enseñará">{lista(mostrara, t.textSoft)}</Panel>
        <Panel title="Qué falta para construirla">{lista(necesita, t.textSoft)}</Panel>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: t.textFaint }}>
        Esta pantalla no dibuja datos de ejemplo a propósito: una curva inventada en un tablero de
        planta se lee como una medida.{" "}
        {fase && (
          <>
            Se sigue en <span style={{ fontFamily: MONO }}>docs/PLAN-19-MODULARIZACION.md</span> {fase}.
          </>
        )}
      </p>
    </div>
  );
}

export default PantallaPendiente;
