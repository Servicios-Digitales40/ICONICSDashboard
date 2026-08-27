/**
 * Vista «3D» del SISTEMA DE VIBRACIONES — todavía sin construir.
 *
 * ── POR QUÉ EXISTE UNA PANTALLA QUE NO ENSEÑA NADA ─────────────────
 *
 * Porque el sitio está decidido y el contenido no. La estación de llenado
 * tiene su gemelo digital —la máquina y la maqueta—, y este sistema va a
 * tener el suyo; dejar el hueco fuera del sidebar haría que la ausencia
 * pareciera un olvido en vez de un trabajo pendiente.
 *
 * ── POR QUÉ NO HAY UNA ESCENA DE MENTIRA MIENTRAS TANTO ────────────
 *
 * Porque un motor genérico girando aquí sería exactamente el fallo contra el
 * que está escrito el resto de este módulo. En cuanto una escena 3D se pinta
 * al lado de lecturas reales, se lee como si mostrara la máquina real: quien
 * la viera girar deduciría que gira, y quien viera un apoyo sin marcar
 * deduciría que ese apoyo está bien. Hoy la mayoría de los puntos de esta
 * máquina no entregan lectura, así que ese 3D estaría inventando movimiento
 * y estado con datos que no existen.
 *
 * Una pantalla que dice «esto todavía no está» es información correcta. Una
 * que enseña una máquina plausible es información falsa con mejor acabado.
 *
 * ── QUÉ HACE FALTA PARA CONSTRUIRLA ────────────────────────────────
 *
 * Lo que hoy no hay, y por eso está pendiente:
 *
 *   · La GEOMETRÍA del motor WEG W22 143/5T con sus tres apoyos ubicados
 *     donde están de verdad — no un motor cualquiera con tres puntos
 *     repartidos, porque la posición es justamente lo que esta vista
 *     aportaría sobre la tabla de la pantalla «Vibraciones».
 *   · Decidir qué se pinta cuando un apoyo NO contesta. En las vistas 3D del
 *     tanque el activo sin dato se apaga; aquí hará falta el mismo criterio
 *     antes de la primera escena, no después.
 */
import { Box, Waves } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { CANALES } from "../domain/vibraciones.js";

function VibracionesEva3D({ onNavigate }) {
  const { theme: t } = useTheme();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AlertBanner
        type="info"
        title="Esta vista todavía no está construida"
        message={
          "El gemelo digital del sistema de vibraciones va a vivir aquí. No hay una escena " +
          "provisional a propósito: un motor genérico girando junto a lecturas reales se " +
          "leería como la máquina real, y hoy la mayoría de sus puntos no entregan dato. " +
          "Mientras tanto, las medidas están en «Vibraciones» y lo que se deduce de ellas " +
          "en «Riesgos»."
        }
      />

      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 14, padding: "56px 24px",
          borderRadius: 12, border: `1px dashed ${t.border}`, background: t.panel,
        }}
      >
        <Box size={40} color={t.textFaint} strokeWidth={1.25} />
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
          Gemelo digital del sistema de vibraciones
        </div>
        <p style={{ margin: 0, maxWidth: "56ch", textAlign: "center", fontSize: 13, color: t.textSoft, lineHeight: 1.6 }}>
          Enseñará el motor WEG W22 143/5T con sus {CANALES.length} apoyos en su posición
          real, y el estado de cada uno sobre la propia geometría. Falta el modelo del motor
          y decidir cómo se pinta un apoyo que no contesta.
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
          Ver las medidas de los tres apoyos
        </button>
      </div>

      <SectionLabel>Los apoyos que enseñará</SectionLabel>

      {/*
        Los tres apoyos se listan con su rodamiento porque ese dato ya es
        cierto y no depende del 3D: es el catálogo, no una promesa. El del
        apoyo intermedio va sin identificar a propósito —no sale del catálogo
        WEG—, y ponerle el 6205 del lado acople daría frecuencias de defecto
        de otra pieza.
      */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {CANALES.map((c) => (
          <div
            key={c.id}
            style={{
              padding: 14, borderRadius: 12,
              background: t.panel, border: `1px solid ${t.border}`,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>
              {c.label} <span style={{ color: t.textFaint, fontWeight: 400 }}>· {c.id}</span>
            </div>
            <div style={{ fontSize: 12, color: t.textSoft, marginTop: 4 }}>
              Rodamiento {c.rodamiento ?? "sin identificar"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VibracionesEva3D;
