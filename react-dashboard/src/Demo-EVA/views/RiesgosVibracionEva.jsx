/**
 * Vista «Riesgos» del SISTEMA DE VIBRACIONES.
 *
 * ── POR QUÉ ES UNA PANTALLA APARTE DE «RIESGOS» ────────────────────
 *
 * Porque el otro «Riesgos» es de OTRA MÁQUINA. `RiesgosEva.jsx` evalúa el
 * tanque —nivel, presión, caudal, carga del motor— con reglas que cruzan
 * señales de esa instalación, y nada de eso existe aquí: este motor no tiene
 * tanque ni caudal, y el suyo no tiene acelerómetros.
 *
 * Un solo «Riesgos» con las dos listas juntas sería la invitación exacta a
 * leerlas como una: la primera persona que viera un riesgo de cavitación
 * encima de uno de rodamiento buscaría la relación, y no hay ninguna.
 *
 * ── POR QUÉ NO COMPARTE FORMA CON LA OTRA PANTALLA ─────────────────
 *
 * Los riesgos de aquí cuelgan de un APOYO concreto —de ahí `canalLabel`— y
 * citan una norma con su zona; los del tanque no tienen ni una cosa ni la
 * otra, y a cambio traen `nota` cuando su sensibilidad depende de un umbral
 * que todavía es estimación nuestra. Forzar una tarjeta común dejaría media
 * docena de campos opcionales que se leen peor que las dos por separado.
 *
 * ── LA MITAD QUE NO SE VE ──────────────────────────────────────────
 *
 * `sin comprobar` NO es una sección secundaria de esta pantalla: es la razón
 * de que exista en vez de un contador de alarmas. Una regla que no se pudo
 * evaluar y una regla que se evaluó y no se cumple salen las dos en verde si
 * sólo se cuentan las activas, y hoy la mayoría de los puntos de esta máquina
 * no entregan lectura.
 */
import { useMemo } from "react";
import { HelpCircle, WifiOff } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { UltimaLectura } from "../components/base.jsx";
import { TarjetaRiesgo } from "../components/riesgoVibracion.jsx";
import { useVibracion } from "../data/vibracion.js";
import { evaluarRiesgosVibracion } from "../domain/riesgosVibracion.js";

function RiesgosVibracionEva() {
  const { theme: t } = useTheme();
  const { canales, variador, alarmas, loading, error, lastUpdated, puntosSinDato, puntosPedidos } =
    useVibracion();

  const res = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas],
  );

  /*
   * «Nada que decir» y «nadie ha contestado» se ven igual si sólo se cuentan
   * los riesgos activos. Esto separa las dos, y es la razón de que el hook
   * devuelva la lista de puntos sin lectura.
   */
  const mudos = puntosSinDato?.length ?? 0;
  const totalPuntos = puntosPedidos ?? 0;
  const casiTodoMudo = totalPuntos > 0 && mudos > totalPuntos / 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AlertBanner
        type="info"
        title="Riesgos del sistema de vibraciones, no del tanque"
        message={
          "Estas reglas evalúan el motor con acelerómetros: su propio motor, su propio " +
          "variador y su propio PLC. Los riesgos de la estación de llenado —derrame, " +
          "marcha en seco, sobrepresión— están en su propia pantalla y no tienen relación " +
          "con éstos. Y como de esta máquina no se usa el histórico, aquí no hay tendencias " +
          "ni plazos: sólo lo que se puede afirmar del instante."
        }
      />

      {error && (
        <AlertBanner type="error" title="No se pudo leer el módulo" message={error} />
      )}

      {casiTodoMudo && !loading && (
        <AlertBanner
          type="warning"
          title="La máquina no está contestando"
          message={
            `${mudos} de ${totalPuntos} puntos no entregan lectura ahora mismo. ` +
            "Cuando el variador se apaga deja de publicar la velocidad, y sin velocidad " +
            "el módulo no puede calcular la velocidad eficaz: se pierden todos los vRMS " +
            "y sobreviven la aceleración y el pico, que se miden sin conocer el régimen. " +
            "Lo que se vea abajo no describe una máquina tranquila: describe una máquina callada."
          }
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SectionLabel>
          {res.activos.length > 0
            ? `${res.activos.length} riesgo${res.activos.length === 1 ? "" : "s"} activo${res.activos.length === 1 ? "" : "s"}`
            : "Sin riesgos activos"}
        </SectionLabel>
        <UltimaLectura fecha={lastUpdated} t={t} />
      </div>

      {res.activos.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {res.activos.map((r) => (
            <TarjetaRiesgo key={`${r.id}-${r.canal ?? "maquina"}`} riesgo={r} t={t} />
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: t.textSoft }}>
          {res.evaluadas > 0
            ? `Se comprobaron ${res.evaluadas} reglas y ninguna se cumple.`
            : "No se pudo comprobar ninguna regla: no hay lecturas con las que evaluar."}
        </p>
      )}

      {/*
        La zona que casi ningún panel tiene. Sin ella, una pantalla en verde y
        una pantalla ciega se ven exactamente igual.
      */}
      {res.noEvaluables.length > 0 && (
        <>
          <SectionLabel>
            {res.noEvaluables.length} sin comprobar
          </SectionLabel>
          <div
            style={{
              background: t.panel, border: `1px solid ${t.border}`,
              borderRadius: 12, padding: 16,
              display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            {res.noEvaluables.map((n, i) => (
              <div key={`${n.id}-${n.canal ?? "maquina"}-${i}`} style={{ display: "flex", gap: 10 }}>
                {mudos > 0 ? (
                  <WifiOff size={15} color={t.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <HelpCircle size={15} color={t.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
                    {n.titulo}
                    {n.canalLabel && (
                      <span style={{ fontWeight: 400, color: t.textFaint }}> · {n.canalLabel}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: t.textSoft }}>{n.porque}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ margin: 0, fontSize: 11, color: t.textFaint, lineHeight: 1.6 }}>
        Las medidas que sostienen estas reglas —los tres apoyos, sus cuatro magnitudes y qué
        vigilancias tiene encendidas el módulo— están en la pantalla <strong>Vibraciones</strong>.
      </p>
    </div>
  );
}

export default RiesgosVibracionEva;
