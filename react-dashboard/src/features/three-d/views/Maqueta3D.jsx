/**
 * Vista «Maqueta 3D» — la planta entera en miniatura.
 *
 * Las diez máquinas reales con su estado en vivo, y una tarjeta por equipo con
 * los cuatro indicadores que importan: OEE, Disponibilidad, Rendimiento y
 * Calidad.
 *
 * ── QUÉ NO HACE, A PROPÓSITO ───────────────────────────────────────
 *
 * No duplica el detalle de máquina. La tarjeta enseña lo justo para decidir si
 * hay que mirar un equipo, y el botón «Ver detalle» lleva a la vista que ya
 * existe con la navegación que ya existe. Una maqueta que intentara contarlo
 * todo acabaría siendo un detalle de máquina peor, dentro de un canvas.
 */
import { useMemo, useState } from "react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { usePlantData } from "@/lib/datasource";
import { ESTADOS_ORDEN, estadoInfo } from "@/lib/domain/index.js";

import Escena from "../components/Escena.jsx";
import Piso from "../components/Piso.jsx";
import Pasillos from "../components/Pasillos.jsx";
import Encuadre from "../components/Encuadre.jsx";
import MaquinaEnMaqueta from "../components/MaquinaEnMaqueta.jsx";
import { RADIO_PISO, posicionDe } from "../lib/layout.js";
import { useFrameloop } from "../lib/useDescriptor.js";

const ENCUADRES = {
  isometrica: { etiqueta: "Isométrica", posicion: [9, 8.5, 12], objetivo: [-0.6, 0, -0.4] },
  superior: { etiqueta: "Superior", posicion: [0.01, 17, 0.01], objetivo: [-0.6, 0, -0.4] },
  frontal: { etiqueta: "Frontal", posicion: [-0.6, 3.5, 16], objetivo: [-0.6, 0.6, -0.4] },
};

/** Leyenda de estados, sólo con los que hay ahora mismo en la planta. */
function Leyenda({ machines, t }) {
  const presentes = useMemo(() => {
    const cuenta = new Map();
    for (const m of machines) cuenta.set(m.estado, (cuenta.get(m.estado) ?? 0) + 1);
    // Se respeta ESTADOS_ORDEN, que va de peor a mejor: lo grave, primero.
    return ESTADOS_ORDEN.filter((e) => cuenta.has(e)).map((e) => ({ e, n: cuenta.get(e) }));
  }, [machines]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
      {presentes.map(({ e, n }) => {
        const info = estadoInfo(e);
        const color = t[info.token] ?? t.textFaint;
        return (
          <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.textSoft }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}66` }} />
            {info.label}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: t.text }}>{n}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function Maqueta3D({ onNavigate }) {
  const { theme: t } = useTheme();
  const { machines, loading, error } = usePlantData();

  const [señalada, setSeñalada] = useState(null);
  const [seleccionada, setSeleccionada] = useState(null);
  const [encuadre, setEncuadre] = useState({ id: "isometrica", ...ENCUADRES.isometrica, n: 0 });

  const colocadas = useMemo(
    () => machines.map((m) => ({ m, pos: posicionDe(m.id) })).filter((x) => x.pos),
    [machines]
  );

  // Basta con que UNA máquina tenga bucle —operando o en alarma— para que la
  // escena tenga que dibujar de continuo. Con la planta entera en Stand By o
  // sin comunicación, la GPU baja a cero.
  const frameloop = useFrameloop(colocadas.map(({ m }) => m.estado));

  const irA = (id) => setEncuadre((e) => ({ id, ...ENCUADRES[id], n: e.n + 1 }));

  return (
    <>
      <SectionLabel sub={`${colocadas.length} equipos · señala una máquina para verla, púlsala para sus indicadores`}>
        Maqueta 3D · Planta Resonac
      </SectionLabel>

      {error && <AlertBanner type="error" title="No se pudieron leer los equipos" message={error} />}

      {loading && !machines.length && (
        <p style={{ textAlign: "center", fontSize: 13, opacity: 0.7 }}>Leyendo equipos…</p>
      )}

      <Escena
        camara={ENCUADRES.isometrica.posicion}
        objetivo={ENCUADRES.isometrica.objetivo}
        zoom={{ min: 7, max: 34 }}
        altura={560}
        frameloop={frameloop}
        extras={<Encuadre preset={encuadre} />}
      >
        {/* Pulsar el suelo cierra la tarjeta. Sin esto la única forma de
            cerrarla es acertar con la «×», que en una pantalla táctil de
            planta es pedir demasiado. */}
        <group onPointerMissed={() => setSeleccionada(null)}>
          <Piso radio={RADIO_PISO} divisiones={19} />
          <Pasillos />

          {colocadas.map(({ m, pos }) => (
            <MaquinaEnMaqueta
              key={m.id}
              machine={m}
              pos={pos}
              señalada={señalada === m.id}
              seleccionada={seleccionada === m.id}
              onSeñalar={setSeñalada}
              onSeleccionar={(id) => setSeleccionada((actual) => (actual === id ? null : id))}
              onDetalle={(id) => onNavigate?.("machine-detail", { machineId: id, from: "maqueta-3d" })}
            />
          ))}
        </group>
      </Escena>

      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Leyenda machines={machines} t={t} />

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: t.textFaint }}>Encuadre</span>
          {Object.keys(ENCUADRES).map((id) => (
            <button
              key={id}
              onClick={() => irA(id)}
              aria-pressed={encuadre.id === id}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                border: `1px solid ${encuadre.id === id ? t.accent : t.border}`,
                background: encuadre.id === id ? t.accentSoft : t.panel,
                color: encuadre.id === id ? t.accent : t.textSoft,
                fontSize: 12,
                fontWeight: encuadre.id === id ? 700 : 500,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {ENCUADRES[id].etiqueta}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
