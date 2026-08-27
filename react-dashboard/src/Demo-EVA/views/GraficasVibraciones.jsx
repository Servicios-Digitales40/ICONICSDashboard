/**
 * Vista «Gráficas» del SISTEMA DE VIBRACIONES — todavía sin construir.
 *
 * ── POR QUÉ NO ES UNA COPIA DE «GRÁFICAS» DE LA ESTACIÓN DE LLENADO ─
 *
 * Porque aquella pinta el HISTORIADOR, y de esta máquina no se usa. No es una
 * decisión de diseño pendiente: el historiador empezó a guardar estos tags el
 * 26-08-2026, con la configuración todavía moviéndose, así que el tramo que
 * existe no cubre lo que una gráfica aparentaría cubrir.
 *
 * Y ése es exactamente el modo de fallo caro de una gráfica: una curva sobre
 * un rango con huecos se ve idéntica a una curva completa. Quien la mirase
 * leería una tendencia —«lleva subiendo», «está estable»— de un tramo que en
 * realidad son cuatro muestras y tres agujeros. Las otras pantallas de este
 * sistema declaran en su cabecera que NO se pueden afirmar tendencias; una
 * gráfica improvisada las contradiría sin decir una sola palabra.
 *
 * ── QUÉ HACE FALTA PARA CONSTRUIRLA ────────────────────────────────
 *
 *   · Que el historiador acumule un tramo continuo y COMPROBADO de estos
 *     tags. `scripts/comprobar-historia-vibraciones.mjs` es el que lo mide.
 *   · Decidir qué se pinta donde no hubo muestras. En la estación de llenado
 *     el corte de línea ya distingue «no hay dato» de «valió cero»; aquí hará
 *     falta el mismo criterio ANTES de la primera curva, no después.
 *   · Elegir qué series merecen gráfica. Las cuatro medidas por apoyo son
 *     doce curvas: pintarlas todas juntas no es una pantalla, es un ovillo.
 */
import { LineChart, Waves } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { CANALES, MEDIDAS } from "../domain/vibraciones.js";

function GraficasVibraciones({ onNavigate }) {
  const { theme: t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AlertBanner
        type="info"
        title="Esta vista todavía no está construida"
        message={
          "Las gráficas de esta máquina van a vivir aquí, y enseñarán lo mismo que las de " +
          "la estación de llenado: series del historiador. No hay ninguna todavía porque de " +
          "este sistema NO se usa el histórico — el historiador empezó a guardar sus tags " +
          "hace muy poco y con la configuración cambiando. Una curva sobre ese tramo se " +
          "vería igual de completa que una buena, y no lo es."
        }
      />

      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 14, padding: "56px 24px",
          borderRadius: 12, border: `1px dashed ${t.border}`, background: t.panel,
        }}
      >
        <LineChart size={40} color={t.textFaint} strokeWidth={1.25} />
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
          Histórico del sistema de vibraciones
        </div>
        <p style={{ margin: 0, maxWidth: "58ch", textAlign: "center", fontSize: 13, color: t.textSoft, lineHeight: 1.6 }}>
          Falta que el historiador acumule un tramo continuo y comprobado de estos tags, y
          decidir cómo se pinta un hueco: una curva que no distingue «no hubo dato» de
          «valió cero» convierte un fallo de lectura en una medida.
        </p>
        <button
          type="button"
          onClick={() => onNavigate?.("eva-vibraciones")}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 16px", borderRadius: 8, cursor: "pointer",
            fontSize: 13, fontWeight: 600,
            border: `1px solid ${t.accent}`, background: t.accentSoft, color: t.accent,
          }}
        >
          <Waves size={15} />
          Ver el instante de los tres apoyos
        </button>
      </div>

      <SectionLabel>Las series que enseñará</SectionLabel>

      {/*
        Se listan las magnitudes que ya EXISTEN como tag, no una promesa: son
        las mismas cuatro que la pantalla «Vibraciones» enseña del instante.
        Doce curvas en total, y por eso una de las decisiones pendientes es
        cuáles merecen gráfica en vez de pintarlas todas.
      */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {MEDIDAS.map((m) => (
          <div
            key={m.key}
            style={{
              padding: 14, borderRadius: 12,
              background: t.panel, border: `1px solid ${t.border}`,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{m.label}</div>
            <div style={{ fontSize: 12, color: t.textSoft, marginTop: 4 }}>
              {m.unidad ? `en ${m.unidad} · ` : ""}una por apoyo ({CANALES.length})
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GraficasVibraciones;
