/**
 * Vista «Máquina 3D» — un equipo, grande, y el recorrido de sus estados.
 *
 * Es el banco de pruebas del contrato de `lib/estadoVisual.js`: aquí se ve, uno
 * por uno, qué comunica cada estado y por qué canal.
 *
 * ── LOS DOS MODOS, Y POR QUÉ HAY DOS ───────────────────────────────
 *
 *  - **En vivo**: el modelo obedece al estado real de la máquina elegida, con
 *    los mismos hooks que las tarjetas. Convierte la vista en una herramienta
 *    de verificación: si una máquina reporta algo distinto de lo que se cree,
 *    se ve aquí en la forma del modelo.
 *  - **Manual**: manda el selector. Es lo que permite enseñar los once
 *    comportamientos sin esperar a que la planta se rompa.
 *
 * Sin el modo en vivo esto sería una maqueta muerta; sin el manual no se
 * podría demostrar nada. De ahí el interruptor.
 */
import { useMemo, useState } from "react";

import { SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { usePlantData } from "@/lib/datasource";
import { estadoInfo } from "@/lib/domain/index.js";

import Escena from "../components/Escena.jsx";
import Piso from "../components/Piso.jsx";
import MaquinaModel from "../components/MaquinaModel.jsx";
import Encuadre from "../components/Encuadre.jsx";
import SelectorEstado from "../components/SelectorEstado.jsx";
import FichaEstado from "../components/FichaEstado.jsx";
import { useDescriptor, useFrameloop } from "../lib/useDescriptor.js";
import { rpmDe } from "../lib/estadoVisual.js";

/* Los tres encuadres. Ver `Encuadre.jsx` para por qué existen. */
const ENCUADRES = {
  isometrica: { etiqueta: "Isométrica", posicion: [6.5, 4.6, 8], objetivo: [0, 0.9, 0] },
  superior: { etiqueta: "Superior", posicion: [0.01, 10.5, 0.01], objetivo: [0, 0.4, 0] },
  frontal: { etiqueta: "Frontal", posicion: [0, 2.2, 9.5], objetivo: [0, 1.0, 0] },
};

function BotonEncuadre({ id, activo, onClick, t }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
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

export default function Maquina3D() {
  const { theme: t } = useTheme();
  const { machines } = usePlantData();

  const [enVivo, setEnVivo] = useState(false);
  const [claveManual, setClaveManual] = useState("running");
  const [maquinaId, setMaquinaId] = useState(null);
  const [encuadre, setEncuadre] = useState({ id: "isometrica", ...ENCUADRES.isometrica, n: 0 });

  // Sin selección explícita se toma la primera máquina que haya llegado, para
  // que la vista no arranque vacía esperando un clic.
  const maquina = useMemo(
    () => machines.find((m) => m.id === maquinaId) ?? machines[0] ?? null,
    [machines, maquinaId]
  );

  const clave = enVivo ? maquina?.estado ?? "unknown" : claveManual;
  const descriptor = useDescriptor(clave);
  const frameloop = useFrameloop([clave]);

  // En manual no hay rendimiento medido: `rpmDe` devuelve el ritmo nominal y
  // `medido: false`, y la ficha escribe «sin medir». No se inventa un número.
  const rpm = useMemo(
    () => (enVivo && maquina ? rpmDe(maquina) : rpmDe({ estado: clave, rendimiento: null })),
    [enVivo, maquina, clave]
  );

  const irA = (id) => setEncuadre((e) => ({ id, ...ENCUADRES[id], n: e.n + 1 }));

  return (
    <>
      <SectionLabel sub="El modelo cambia de forma, de baliza y de movimiento según el estado del equipo">
        Máquina 3D
      </SectionLabel>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ---- Escena ------------------------------------------------ */}
        <div style={{ flex: "1 1 560px", minWidth: 380 }}>
          <Escena
            camara={ENCUADRES.isometrica.posicion}
            objetivo={ENCUADRES.isometrica.objetivo}
            zoom={{ min: 4, max: 20 }}
            altura={520}
            frameloop={frameloop}
            extras={<Encuadre preset={encuadre} />}
          >
            <Piso radio={7} divisiones={14} />
            <MaquinaModel descriptor={descriptor} rpm={rpm.rpm} />
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
          <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14, padding: 14, boxShadow: t.shadow }}>
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

            {enVivo && (
              <>
                <select
                  value={maquina?.id ?? ""}
                  onChange={(e) => setMaquinaId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 9,
                    border: `1px solid ${t.border}`,
                    background: t.page,
                    color: t.text,
                    fontSize: 12.5,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.equipo} — {estadoInfo(m.estado).label}
                    </option>
                  ))}
                </select>
                {!machines.length && (
                  <p style={{ fontSize: 11.5, color: t.textFaint, margin: "8px 0 0" }}>Leyendo equipos…</p>
                )}
              </>
            )}
          </div>

          <FichaEstado descriptor={descriptor} rpm={rpm} />

          {/* En vivo el selector sobra: lo que manda es el servidor. */}
          {!enVivo && <SelectorEstado valor={claveManual} onSelect={setClaveManual} />}
        </div>
      </div>
    </>
  );
}
