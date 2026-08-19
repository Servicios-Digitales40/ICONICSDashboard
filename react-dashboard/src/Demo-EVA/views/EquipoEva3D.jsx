/**
 * Vista «Máquina 3D» de Demo EVA — el grupo de bombeo, grande, y el recorrido
 * de sus estados.
 *
 * Es el banco de pruebas del contrato de `three-d/lib/comportamiento.js`: aquí
 * se ve, uno por uno, qué comunica cada estado y por qué canal.
 *
 * ── LOS DOS MODOS, Y POR QUÉ AQUÍ HACEN MÁS FALTA QUE EN RESONAC ───
 *
 *  - **En vivo**: el modelo obedece al estado real del grupo de bombeo, con los
 *    mismos hooks que la vista de Planta. Convierte la vista en una herramienta
 *    de verificación: si la instalación reporta algo distinto de lo que se cree,
 *    se ve aquí en la forma del modelo.
 *  - **Manual**: manda el selector. Es lo que permite enseñar los cinco
 *    comportamientos sin esperar a que la instalación se rompa.
 *
 * El interruptor es más necesario que en Resonac por una razón medida: esta
 * instalación **está parada casi siempre** —caudal ≈ 0, motor a 0—, así que en
 * vivo se ve el reposo y poco más. Sin el modo manual no habría forma de
 * enseñar el resto, ni de comprobar que se ven distintos entre sí.
 *
 * ── EL GIRO DEL IMPULSOR SIGUE AL DATO, NO AL SELECTOR ─────────────
 *
 * En manual el estado lo elige el usuario, pero el ritmo del impulsor sale de
 * la carga del motor REAL cuando hay lectura. Inventar unas rpm para acompañar
 * al estado elegido sería exactamente el tipo de dato falso que este módulo
 * evita: el selector demuestra el canal de la BALIZA, no el de la producción.
 */
import { useMemo, useState } from "react";

import { SectionLabel } from "@/components/ui/index.js";
import Encuadre from "@/features/three-d/components/Encuadre.jsx";
import Escena from "@/features/three-d/components/Escena.jsx";
import Piso from "@/features/three-d/components/Piso.jsx";
import { usePrefersReducedMotion } from "@/lib/motion.js";
import { useTheme } from "@/theme";

import { conFuenteEva } from "../data/EvaProvider.jsx";
import { useSistemaAgua } from "../data/hooks.js";
import { estadoInfo } from "../domain/estado.js";
import { fmtSenal, pctDeEscala } from "../lib/formato.js";
import { Card } from "../components/base.jsx";
import BombaModel from "../three-d/components/BombaModel.jsx";
import { FichaComportamiento, SelectorEstado } from "../three-d/components/PanelEstadoEva.jsx";
import { comportamiento, comportamientoReducido, frameloopDe, rpmDe } from "../three-d/lib/comportamiento.js";

/* Los tres encuadres. Mismos papeles que en la vista de Resonac. */
const ENCUADRES = {
  isometrica: { etiqueta: "Isométrica", posicion: [4.2, 3.2, 5.2], objetivo: [0, 0.7, 0] },
  superior: { etiqueta: "Superior", posicion: [0.01, 6.5, 0.01], objetivo: [0, 0.3, 0] },
  frontal: { etiqueta: "Frontal", posicion: [0, 1.5, 6], objetivo: [0, 0.8, 0] },
};

function BotonEncuadre({ id, activo, onClick, t }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      style={{
        padding: "6px 12px",
        borderRadius: 9,
        cursor: "pointer",
        border: `1px solid ${activo ? t.accent : t.border}`,
        background: activo ? t.accentSoft : t.panel,
        color: activo ? t.accent : t.textSoft,
        fontSize: 12,
        fontWeight: activo ? 700 : 500,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {ENCUADRES[id].etiqueta}
    </button>
  );
}

function EquipoEva3D() {
  const { theme: t } = useTheme();
  const { sistema } = useSistemaAgua();
  const reduce = usePrefersReducedMotion();

  const [enVivo, setEnVivo] = useState(false);
  const [claveManual, setClaveManual] = useState("nominal");
  const [encuadre, setEncuadre] = useState({ id: "isometrica", ...ENCUADRES.isometrica, n: 0 });

  const bombeo = sistema.activos.find((a) => a.id === "bombeo");
  const clave = enVivo ? bombeo?.estado ?? "sin_dato" : claveManual;

  const descriptor = useMemo(
    () => (reduce ? comportamientoReducido(clave) : comportamiento(clave)),
    [clave, reduce]
  );

  const rpm = useMemo(() => rpmDe(sistema), [sistema]);
  const frameloop = frameloopDe({ estados: [clave], rpm: rpm.rpm, reduce });

  const presion = sistema.senales.presionRelativa;
  const irA = (id) => setEncuadre((e) => ({ id, ...ENCUADRES[id], n: e.n + 1 }));

  return (
    <>
      <SectionLabel sub="El modelo cambia de baliza, de acabado y de ritmo según el estado del grupo de bombeo">
        Máquina 3D · Grupo de bombeo
      </SectionLabel>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ---- Escena ------------------------------------------------ */}
        <div style={{ flex: "1 1 560px", minWidth: 380 }}>
          <Escena
            camara={ENCUADRES.isometrica.posicion}
            objetivo={ENCUADRES.isometrica.objetivo}
            zoom={{ min: 2.6, max: 14 }}
            altura={520}
            frameloop={frameloop}
            extras={<Encuadre preset={encuadre} />}
          >
            <Piso radio={5} divisiones={10} />
            <BombaModel
              descriptor={descriptor}
              rpm={rpm.rpm}
              presionPct={presion.valor === null ? null : pctDeEscala(presion)}
              detalle
            />
          </Escena>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: t.textFaint, marginRight: 2 }}>Encuadre</span>
            {Object.keys(ENCUADRES).map((id) => (
              <BotonEncuadre key={id} id={id} activo={encuadre.id === id} onClick={() => irA(id)} t={t} />
            ))}
            <span style={{ fontSize: 11.5, color: t.textFaint, marginLeft: "auto" }}>
              Arrastra para orbitar · rueda para acercar
            </span>
          </div>
        </div>

        {/* ---- Panel lateral ----------------------------------------- */}
        <div style={{ flex: "0 1 340px", minWidth: 300, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Origen del estado */}
          <Card t={t} delay={0.05} style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: enVivo ? 12 : 0 }}>
              {[
                { v: false, label: "Manual" },
                { v: true, label: "En vivo" },
              ].map(({ v, label }) => (
                <button
                  key={label}
                  onClick={() => setEnVivo(v)}
                  aria-pressed={enVivo === v}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 9,
                    cursor: "pointer",
                    border: `1px solid ${enVivo === v ? t.accent : t.border}`,
                    background: enVivo === v ? t.accentSoft : "transparent",
                    color: enVivo === v ? t.accent : t.textSoft,
                    fontSize: 12.5,
                    fontWeight: enVivo === v ? 700 : 500,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {enVivo && bombeo && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 11.5, color: t.textFaint }}>
                  Grupo de bombeo · {estadoInfo(bombeo.estado).label}
                </div>
                {bombeo.senales.map((s) => (
                  <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                    <span style={{ color: t.textSoft }}>{s.corto}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: t.text }}>
                      {fmtSenal(s)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <FichaComportamiento descriptor={descriptor} rpm={rpm} delay={0.1} />

          {/* En vivo el selector sobra: lo que manda es el servidor. */}
          {!enVivo && <SelectorEstado valor={claveManual} onSelect={setClaveManual} delay={0.15} />}
        </div>
      </div>
    </>
  );
}

export default conFuenteEva(EquipoEva3D);
