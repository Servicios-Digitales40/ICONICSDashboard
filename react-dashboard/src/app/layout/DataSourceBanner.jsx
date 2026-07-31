/**
 * layout/DataSourceBanner.jsx
 * ------------------------------------------------------------------
 * Cinta permanente que avisa cuando los datos en pantalla NO vienen del
 * servidor ICONICS.
 *
 * ── POR QUÉ NO BASTA CON EL BOTÓN DEL TOPBAR ───────────────────────
 *
 * Un interruptor cambia de estado y se olvida. Media hora después, en una
 * reunión y con un proyector, nada distinguiría datos inventados de la
 * planta real: los mismos equipos, los mismos gauges, cifras plausibles.
 * Alguien podría tomar una decisión sobre números que no existen.
 *
 * Por eso el aviso es una cinta ancha, siempre visible y no descartable.
 * Es deliberadamente difícil de ignorar: ese es justo su trabajo.
 *
 * ── CUBRE LOS DOS ORÍGENES FALSOS, NO SOLO LA DEMO ─────────────────
 *
 * Antes se llamaba `DemoBanner` y solo miraba el modo demo. Pero hay dos
 * formas de estar viendo datos que no son de ICONICS:
 *
 *   · demo     — el mock fijo, elegido a mano con el botón;
 *   · simulado — el transporte falso, que es lo que se usa mientras el
 *                servidor no está configurado. Este era el peligroso: el
 *                Topbar decía «En vivo» y no había nada que lo desmintiera.
 *
 * Con el origen real no renderiza absolutamente nada.
 */
import { FlaskConical, Radio } from "lucide-react";
import { useTheme } from "@/theme";
import { MODOS, useDataSource } from "@/lib/datasource";

const ICONO = { demo: FlaskConical, simulado: Radio };

export function DataSourceBanner() {
  const { theme: t } = useTheme();
  const { origen, mode, setMode } = useDataSource();

  if (!origen.avisa) return null;

  const color = t[origen.token];
  const fondo = t[`${origen.token}Soft`] ?? `${color}22`;
  const Icono = ICONO[origen.key] ?? FlaskConical;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "7px 16px",
        background: fondo,
        borderBottom: `1px solid ${color}66`,
        color,
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        position: "relative",
        zIndex: 31,
      }}
    >
      <Icono size={14} strokeWidth={2.5} />
      {origen.label.toUpperCase()} · {origen.descripcion}

      {/* Solo la demo se puede abandonar desde aquí: el modo simulado no
          depende de una preferencia del usuario sino de la configuración
          del arranque, y un botón que no arregla nada sería peor que
          ninguno. Se explica cómo salir en su lugar. */}
      {mode === MODOS.DEMO ? (
        <button
          onClick={() => setMode(MODOS.LIVE)}
          style={{
            marginLeft: 6,
            background: "transparent",
            border: `1px solid ${color}88`,
            borderRadius: 999,
            padding: "2px 10px",
            color,
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          volver a datos reales
        </button>
      ) : (
        <code style={{ fontSize: 11, opacity: 0.85, fontFamily: "'IBM Plex Mono', monospace" }}>
          quita VITE_ICONICS_FAKE del entorno para conectar
        </code>
      )}
    </div>
  );
}
