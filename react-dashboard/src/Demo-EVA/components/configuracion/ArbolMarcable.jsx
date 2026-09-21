/**
 * Las piezas de presentación de un árbol MARCABLE: la casilla, la fila, la
 * etiqueta y el texto monoespaciado con que se pintan las tres columnas de
 * la pantalla de configuración. Plan 36 F1.
 *
 * ── POR QUÉ SON PIEZAS SUELTAS Y NO UN COMPONENTE «ÁRBOL» ──────────
 *
 * Porque las tres columnas no son el mismo árbol. La de tiempo real agrupa
 * por activo y marca; la del historiador empareja tags con variables ya
 * marcadas; la de alarmas clasifica por prefijo y sólo deja marcar
 * contadores. Un componente genérico habría necesitado media docena de
 * `render*` para acomodar las tres, y cada columna habría acabado
 * parametrizando lo que le sobra. Lo común de verdad —cómo se ve una fila,
 * cómo se pulsa una casilla— es lo que vive aquí.
 *
 * ── EL CRITERIO TÁCTIL (DESIGN.md) ─────────────────────────────────
 *
 * Una casilla de este árbol NO acciona la planta ni confirma nada: cambia
 * qué variables va a tener una configuración que después hay que guardar. Le
 * corresponden **32 × 32 px** de área pulsable, no 44. El `<input>` mide 16;
 * la etiqueta que lo envuelve pone el resto con `padding`, y es la etiqueta
 * entera la que se pulsa.
 *
 * Todo texto que aparezca viene traducido de quien la usa: aquí no hay
 * cadenas de cara al técnico.
 */
import { useTheme } from "@/theme";

/** El mínimo pulsable de un control que no acciona la instalación. */
const OBJETIVO_MIN = 32;

/**
 * Una casilla con su objetivo táctil. `indeterminada` es el estado «algunas
 * de sus variables»: se pinta, y pulsarla marca el resto.
 *
 * `etiqueta` es lo que lee un lector de pantalla y lo que buscan las pruebas
 * (`getByRole("checkbox", { name })`); el texto visible lo pone quien la usa.
 */
export function Casilla({ marcada, indeterminada = false, onChange, etiqueta, disabled = false }) {
  const { theme: t } = useTheme();
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: OBJETIVO_MIN,
        minHeight: OBJETIVO_MIN,
        cursor: disabled ? "default" : "pointer",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        aria-label={etiqueta}
        checked={Boolean(marcada)}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminada) && !marcada;
        }}
        onChange={onChange}
        style={{ width: 16, height: 16, margin: 0, accentColor: t.accent, cursor: "inherit" }}
      />
    </label>
  );
}

/** Una fila del árbol: alto mínimo de un objetivo, sangría por nivel. */
export function Fila({ children, nivel = 0, style = {}, resaltada = false }) {
  const { theme: t } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        minHeight: OBJETIVO_MIN,
        paddingLeft: nivel * 14,
        paddingRight: 4,
        borderRadius: 7,
        background: resaltada ? t.accentSoft : "transparent",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Un identificador que viene del servidor: siempre en monoespaciada (DESIGN.md). */
export function Mono({ children, apagado = false, style = {} }) {
  const { theme: t } = useTheme();
  return (
    <span
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        color: apagado ? t.textFaint : t.text,
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Una etiqueta corta junto a una fila. Los tonos siguen la regla de
 * `DESIGN.md`: no se pinta de ámbar ni de coral nada que no esté en ese
 * estado. «Sin rol» es neutro —no es un fallo—; «ya no está» es ámbar.
 */
export function Etiqueta({ children, tono = "neutro", title }) {
  const { theme: t } = useTheme();
  const colores = {
    neutro: { fg: t.textSoft, bg: t.hover },
    ok: { fg: t.success, bg: t.successSoft },
    aviso: { fg: t.amber, bg: t.amberSoft },
    error: { fg: t.coral, bg: t.coralSoft },
    acento: { fg: t.accent, bg: t.accentSoft },
  }[tono];
  return (
    <span
      title={title}
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 10.5,
        fontWeight: 600,
        color: colores.fg,
        background: colores.bg,
        borderRadius: 6,
        padding: "2px 7px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/** Cabecera de un grupo dentro de una columna. */
export function CabeceraGrupo({ children, sub = null }) {
  const { theme: t } = useTheme();
  return (
    <div style={{ marginTop: 12, marginBottom: 4 }}>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          color: t.textSoft,
        }}
      >
        {children}
      </div>
      {sub && (
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: t.textFaint, marginTop: 2, lineHeight: 1.45 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Texto suave para notas dentro de una columna. */
export function Nota({ children, tono = "suave" }) {
  const { theme: t } = useTheme();
  const color = { suave: t.textFaint, aviso: t.amber, error: t.coral }[tono];
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color, lineHeight: 1.45, padding: "4px 0" }}>
      {children}
    </div>
  );
}

/**
 * La rejilla de tres columnas. Se declara junto a lo que gobierna
 * (`DESIGN.md`, «Do»): por debajo de 1100 px tres árboles de nombres largos
 * en monoespaciada no caben sin cortar, y se apilan.
 */
export const REJILLA_CONFIGURADOR = `
.eva-configurador-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}
@media (max-width: 1100px) {
  .eva-configurador-grid { grid-template-columns: 1fr; }
}
.eva-configurador-columna {
  max-height: 60vh;
  overflow: auto;
  padding-right: 4px;
}
`;
