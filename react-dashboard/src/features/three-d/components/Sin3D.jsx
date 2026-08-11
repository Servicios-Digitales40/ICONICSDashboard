/**
 * Lo que se ve cuando la escena 3D no se puede dibujar.
 *
 * ── POR QUÉ UNA TABLA Y NO UN CARTEL ───────────────────────────────
 *
 * Un aviso de «no se puede mostrar el 3D» deja la pantalla sin información, y
 * en una pared de planta eso es peor que la vista que se perdió. El 3D es una
 * forma de enseñar el estado de las máquinas, no la información en sí: sin él,
 * la información sigue existiendo y cabe en una tabla.
 *
 * Se construye con los mismos hooks y el mismo formateo que el resto del
 * tablero, así que un hueco se sigue pintando «—» y nunca 0.
 *
 * ── POR QUÉ NO REUTILIZA `GaugeCard` ───────────────────────────────
 *
 * Sería la tarjeta correcta, pero vive en `features/machines/` y traerla aquí
 * ataría dos features entre sí por su interior. Una tabla de cinco columnas no
 * merece esa deuda.
 */
import { AlertBanner } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { usePlantData } from "@/lib/datasource";
import { estadoInfo, hasValue } from "@/lib/domain/index.js";
import { SIN_DATO, fmtNum } from "@/lib/format.js";

const MOTIVOS = {
  "sin-webgl": {
    titulo: "Este equipo no puede dibujar gráficos 3D",
    detalle:
      "El navegador no ha podido crear un contexto WebGL. Suele pasar en equipos sin GPU utilizable, " +
      "por escritorio remoto sin aceleración, o con el controlador en la lista negra del navegador. " +
      "Los datos son los mismos que en las vistas de Planta y de área.",
  },
  "contexto-perdido": {
    titulo: "Se perdió el contexto gráfico y no se pudo recuperar",
    detalle:
      "El navegador cerró el contexto WebGL varias veces seguidas —normalmente por un reinicio del " +
      "controlador de vídeo— y se dejó de reintentar para no entrar en un bucle. Recargando la página " +
      "se vuelve a intentar.",
  },
};

function Celda({ children, alinear = "left", color, mono, t }) {
  return (
    <td
      style={{
        padding: "9px 12px",
        borderTop: `1px solid ${t.border}`,
        textAlign: alinear,
        color: color ?? t.text,
        fontFamily: mono ? "'IBM Plex Mono', monospace" : "'Inter', sans-serif",
        fontWeight: mono ? 700 : 500,
        fontSize: 12.5,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function Encabezado({ children, alinear = "left", t }) {
  return (
    <th
      style={{
        padding: "0 12px 8px",
        textAlign: alinear,
        color: t.textFaint,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

export default function Sin3D({ motivo = "sin-webgl" }) {
  const { theme: t } = useTheme();
  const { machines } = usePlantData();
  const { titulo, detalle } = MOTIVOS[motivo] ?? MOTIVOS["sin-webgl"];

  return (
    <div>
      <AlertBanner type="warning" title={titulo} message={detalle} />

      <div
        style={{
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: "16px 4px 6px",
          boxShadow: t.shadow,
          marginTop: 16,
          overflowX: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr>
              <Encabezado t={t}>Equipo</Encabezado>
              <Encabezado t={t}>Estado</Encabezado>
              <Encabezado alinear="right" t={t}>OEE</Encabezado>
              <Encabezado alinear="right" t={t}>Disponibilidad</Encabezado>
              <Encabezado alinear="right" t={t}>Rendimiento</Encabezado>
              <Encabezado alinear="right" t={t}>Calidad</Encabezado>
            </tr>
          </thead>
          <tbody>
            {machines.map((m) => {
              const info = estadoInfo(m.estado);
              const color = t[info.token] ?? t.textFaint;
              return (
                <tr key={m.id}>
                  <Celda t={t}>{m.equipo}</Celda>
                  <Celda color={color} t={t}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                      {info.label}
                    </span>
                  </Celda>
                  <Celda alinear="right" mono color={hasValue(m.oee) ? t.text : t.textFaint} t={t}>
                    {fmtNum(m.oee)}
                  </Celda>
                  <Celda alinear="right" mono t={t}>{fmtNum(m.disponibilidad)}</Celda>
                  <Celda alinear="right" mono t={t}>{fmtNum(m.rendimiento)}</Celda>
                  <Celda alinear="right" mono t={t}>{fmtNum(m.calidad)}</Celda>
                </tr>
              );
            })}
            {!machines.length && (
              <tr>
                <Celda t={t} color={t.textFaint}>{SIN_DATO}</Celda>
                <Celda t={t} color={t.textFaint}>Leyendo equipos…</Celda>
                <Celda alinear="right" t={t} color={t.textFaint}>{SIN_DATO}</Celda>
                <Celda alinear="right" t={t} color={t.textFaint}>{SIN_DATO}</Celda>
                <Celda alinear="right" t={t} color={t.textFaint}>{SIN_DATO}</Celda>
                <Celda alinear="right" t={t} color={t.textFaint}>{SIN_DATO}</Celda>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
