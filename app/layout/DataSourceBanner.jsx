/**
 * Cinta permanente que avisa cuando los datos en pantalla no vienen del
 * servidor ICONICS.
 *
 * El botón del Topbar no basta: un interruptor cambia de estado y se olvida, y
 * media hora después nada distingue datos inventados de la planta real, con
 * los mismos equipos, los mismos gauges y cifras plausibles. Por eso el aviso
 * es una cinta ancha, siempre visible y no descartable.
 *
 * Con el origen real no renderiza nada.
 *
 * ── QUÉ CAMBIÓ EN EL PLAN 5 ────────────────────────────────────────
 *
 * Antes había dos orígenes falsos —`demo` y `simulado`— y sólo del primero se
 * podía salir desde aquí, porque el segundo dependía de una variable de
 * compilación. Ahora hay uno solo, y salir de él depende de si el build trae
 * el interruptor: con él, un botón; sin él, la instrucción de qué tocar.
 */
import { Radio } from "lucide-react";
import { useTheme } from "@/theme";
import { TRANSPORTES, useDataSource } from "@/lib/datasource";

export function DataSourceBanner() {
  const { theme: t } = useTheme();
  const { origen, conmutable, setTransporte } = useDataSource();

  if (!origen.avisa) return null;

  const color = t[origen.token];
  const fondo = t[`${origen.token}Soft`] ?? `${color}22`;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
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
      <Radio size={14} strokeWidth={2.5} />
      {origen.label.toUpperCase()} · {origen.descripcion}

      {/* Sólo se ofrece salida si el build trae el interruptor. Sin él, el
          origen lo fija la configuración del arranque y un botón que no
          arregla nada sería peor que ninguno: se explica qué tocar. */}
      {conmutable ? (
        <button
          onClick={() => setTransporte(TRANSPORTES.REAL)}
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
