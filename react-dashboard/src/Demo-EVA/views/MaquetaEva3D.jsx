/**
 * Vista «Maqueta 3D» de Demo EVA — la instalación de agua en miniatura.
 *
 * Los cuatro activos con su estado en vivo, colocados según el recorrido del
 * agua, y una ficha por activo con las señales que lo componen.
 *
 * ── LO QUE HACE QUE ESTA VISTA VALGA LA PENA ───────────────────────
 *
 * El nivel del líquido dentro del tanque **es `SNIVEL_TANQUE` en vivo**. Es el
 * único sitio del proyecto donde la geometría no ilustra el dato: lo ES. Un
 * tanque a un cuarto se distingue de uno lleno desde el otro lado de la sala,
 * sin leer un número y sin saber qué es un tag.
 *
 * ── QUÉ NO HACE, A PROPÓSITO ───────────────────────────────────────
 *
 * No duplica la vista de Planta. La ficha enseña lo justo para decidir si hay
 * que mirar un activo, y el botón lleva a la vista que ya existe. Una maqueta
 * que intentara contarlo todo acabaría siendo una Planta peor dentro de un
 * canvas.
 */
import { useEffect, useMemo, useState } from "react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import Encuadre from "@/features/three-d/components/Encuadre.jsx";
import Escena from "@/features/three-d/components/Escena.jsx";
import Piso from "@/features/three-d/components/Piso.jsx";
import { usePrefersReducedMotion } from "@/lib/motion.js";
import { useTheme } from "@/theme";

import { conFuenteEva } from "../data/EvaProvider.jsx";
import { useSistemaAgua } from "../data/hooks.js";
import { ESTADOS_ORDEN, estadoInfo } from "../domain/estado.js";
import { estadoColor } from "../components/paleta.js";
import ActivoEnMaqueta from "../three-d/components/ActivoEnMaqueta.jsx";
import Tuberias from "../three-d/components/Tuberias.jsx";
import { RADIO_PISO, posicionDe, tramos } from "../three-d/lib/layout.js";
import { frameloopDe, rpmDe } from "../three-d/lib/comportamiento.js";

const ENCUADRES = {
  isometrica: { etiqueta: "Isométrica", posicion: [6.5, 5.5, 8.5], objetivo: [-0.2, 0.6, -0.4] },
  superior: { etiqueta: "Superior", posicion: [0.01, 13, 0.01], objetivo: [-0.2, 0, -0.4] },
  frontal: { etiqueta: "Frontal", posicion: [-0.2, 2.4, 11], objetivo: [-0.2, 0.9, -0.4] },
};

/** Leyenda de estados, sólo con los que hay ahora mismo en la instalación. */
function Leyenda({ activos, t, dark }) {
  const presentes = useMemo(() => {
    const cuenta = new Map();
    for (const a of activos) cuenta.set(a.estado, (cuenta.get(a.estado) ?? 0) + 1);
    // Se respeta ESTADOS_ORDEN, que va de peor a mejor: lo grave, primero.
    return ESTADOS_ORDEN.filter((e) => cuenta.has(e)).map((e) => ({ e, n: cuenta.get(e) }));
  }, [activos]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
      {presentes.map(({ e, n }) => {
        const color = estadoColor(dark, e);
        return (
          <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.textSoft }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}66` }} />
            {estadoInfo(e).label}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: t.text }}>{n}</span>
          </span>
        );
      })}
    </div>
  );
}

function MaquetaEva3D({ params, onNavigate }) {
  const { theme: t, dark } = useTheme();
  const { sistema, loading, error } = useSistemaAgua();
  const reduce = usePrefersReducedMotion();

  const [señalado, setSeñalado] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [encuadre, setEncuadre] = useState({ id: "isometrica", ...ENCUADRES.isometrica, n: 0 });

  /*
   * La rejilla de la vista de Planta navega aquí con `{ activo }`, así que al
   * llegar se abre ya la ficha del activo por el que se entró. Sin esto, pulsar
   * un activo en Planta te dejaría delante de la maqueta buscando cuál era.
   */
  const activoEntrante = params?.activo;
  useEffect(() => {
    if (activoEntrante) setSeleccionado(activoEntrante);
  }, [activoEntrante]);

  const colocados = useMemo(
    () => sistema.activos.map((a) => ({ a, pos: posicionDe(a.id) })).filter((x) => x.pos),
    [sistema.activos]
  );

  const rpm = useMemo(() => rpmDe(sistema), [sistema]);

  // Basta con que un activo esté en crítico —o con que la bomba gire— para que
  // la escena tenga que dibujar de continuo. Con la instalación en reposo y en
  // banda, la GPU baja a cero.
  const frameloop = frameloopDe({
    estados: colocados.map(({ a }) => a.estado),
    rpm: rpm.rpm,
    reduce,
  });

  const irA = (id) => setEncuadre((e) => ({ id, ...ENCUADRES[id], n: e.n + 1 }));

  return (
    <>
      <SectionLabel sub="Señala un activo para verlo, púlsalo para sus señales · el nivel del tanque es el dato en vivo">
        Maqueta 3D · Sistema de agua
      </SectionLabel>

      {error && <AlertBanner type="error" title="No se pudo leer la instalación" message={error} />}

      {loading && !sistema.resumen.medidas && (
        <p style={{ textAlign: "center", fontSize: 13, opacity: 0.7 }}>Leyendo señales…</p>
      )}

      <Escena
        camara={ENCUADRES.isometrica.posicion}
        objetivo={ENCUADRES.isometrica.objetivo}
        zoom={{ min: 5, max: 26 }}
        altura={560}
        frameloop={frameloop}
        extras={<Encuadre preset={encuadre} />}
      >
        {/* Pulsar el suelo cierra la ficha. Sin esto la única forma de cerrarla
            es acertar con la «×», que en una pantalla táctil es pedir demasiado. */}
        <group onPointerMissed={() => setSeleccionado(null)}>
          <Piso radio={RADIO_PISO} divisiones={15} />

          <Tuberias tramos={tramos()} hayCaudal={!sistema.enReposo} />

          {colocados.map(({ a, pos }) => (
            <ActivoEnMaqueta
              key={a.id}
              activo={a}
              sistema={sistema}
              pos={pos}
              rpm={rpm.rpm}
              señalado={señalado === a.id}
              seleccionado={seleccionado === a.id}
              onSeñalar={setSeñalado}
              onSeleccionar={(id) => setSeleccionado((actual) => (actual === id ? null : id))}
              onDetalle={() => onNavigate?.("eva-planta")}
              detalle
            />
          ))}
        </group>
      </Escena>

      <div
        style={{
          display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap",
          alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Leyenda activos={sistema.activos} t={t} dark={dark} />

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

      {/* La misma nota de procedencia que la vista de Planta, en una línea: los
          colores de las balizas son nuestros, no del servidor. */}
      <p style={{ marginTop: 14, fontSize: 11, color: t.textFaint, lineHeight: 1.6 }}>
        Los colores de estado salen de umbrales locales; ICONICS no publica un
        estado para <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>ac:TDCON/DEMO/SENSORES/</code>.
        La disposición reproduce el recorrido del agua, no un plano real de la instalación.
      </p>
    </>
  );
}

export default conFuenteEva(MaquetaEva3D);
