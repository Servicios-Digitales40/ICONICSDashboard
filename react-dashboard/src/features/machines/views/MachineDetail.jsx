/**
 * Vista de detalle de una máquina. Se suscribe por su id de ICONICS
 * (`params.machineId`, con la forma "LIN/1").
 *
 * Es la única vista que consume la cadencia rápida del motor de polling, y
 * solo mientras está montada: al entrar registra el juego completo de
 * propiedades de una máquina y al salir lo libera, en vez de pedir todos los
 * tags de todas las máquinas todo el tiempo.
 *
 * El layout son dos columnas: a la izquierda la GaugeCard y el panel de
 * identificación, a la derecha las pestañas con la subvista activa. Cada
 * subvista vive en su propio archivo dentro de `machine-detail/`, una por
 * métrica más el comparativo; aquí solo se arma el layout y se orquesta el
 * cambio de pestaña. El estado de la subvista es local y no toca el router,
 * así que «Volver» sigue funcionando.
 *
 * Recibe `onNavigate(pageId, params)` y usa `params.from` para saber a qué
 * vista volver.
 */
import { useState } from "react";
import { ArrowLeft, Package, Activity, Clock, CheckCircle2, Zap, GitCompareArrows } from "lucide-react";
import { useTheme } from "@/theme";
import { Panel, Button, SectionLabel, Tabs } from "@/components/ui/index.js";
import GaugeCard from "../components/GaugeCard.jsx";
import { AREAS } from "@shared/tagCatalog.js";
import { useMachineData, useMachineHistory } from "@/lib/datasource";
import { estadoInfo } from "@/lib/domain/index.js";
import { SIN_DATO, fmtDuracion } from "@/lib/format.js";

import DisponibilidadView from "./machine-detail/DisponibilidadView.jsx";
import CalidadView from "./machine-detail/CalidadView.jsx";
import RendimientoView from "./machine-detail/RendimientoView.jsx";
import OeeView from "./machine-detail/OeeView.jsx";
import ComparativoView from "./machine-detail/ComparativoView.jsx";

/* Fila etiqueta → valor del panel de identificación. */
function DetailRow({ icon, label, value, color, t, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: last ? "none" : `1px solid ${t.border}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: t.textSoft }}>
        <span style={{ display: "flex", color: t.textFaint }}>{icon}</span>
        {label}
      </span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: color || t.text }}>
        {value}
      </span>
    </div>
  );
}

export default function MachineDetail({ params = {}, onNavigate }) {
  const { theme: t } = useTheme();
  const { machineId, from } = params;
  const [sub, setSub] = useState("oee");

  // Temporal: al llegar desde una vista de propuesta (src/prototypes), esa
  // vista empuja la variante en los params y aquí se usa en lugar de la
  // GaugeCard estándar, para poder evaluar cada estilo de punta a punta.
  //
  // La dirección importa: son los prototipos los que se anuncian, no
  // producción la que consulta su registro. Al borrar `src/prototypes/`,
  // `cardVariant` queda undefined y todo cae a GaugeCard.
  const propuesta = params.cardVariant ?? null;
  const Tarjeta = propuesta?.Comp ?? GaugeCard;
  // Las variantes tipo banner necesitan más aire que los 320px de la columna.
  const colWidth = propuesta?.wide ? 560 : 320;

  const { machine, loading, error } = useMachineData(machineId);
  const { data: history } = useMachineHistory(machineId);

  const volver = from || "dashboard";

  // Guardas: sin id, id inexistente o aún sin primera lectura.
  if (!machine) {
    return (
      <>
        <Button variant="secondary" icon={<ArrowLeft size={14} />} onClick={() => onNavigate(volver)}>
          Volver
        </Button>
        <Panel style={{ marginTop: 16 }}>
          <p style={{ color: t.textSoft, fontSize: 14 }}>
            {loading ? "Leyendo la máquina…" : (error ?? "No se encontró la máquina solicitada.")}
          </p>
        </Panel>
      </>
    );
  }

  const areaId = machine.areaId;
  const backTo = from || `area-${areaId}`;

  // Color semántico de cada subvista (cada factor con su tono; OEE compuesto).
  const C = {
    disponibilidad: t.accent,
    calidad: t.success,
    rendimiento: t.amber,
    oee: t.violet,
  };

  const SUBVIEWS = [
    { key: "oee", label: "OEE", icon: Activity, color: C.oee },
    { key: "disponibilidad", label: "Disponibilidad", icon: Clock, color: C.disponibilidad },
    { key: "rendimiento", label: "Rendimiento", icon: Zap, color: C.rendimiento },
    { key: "calidad", label: "Calidad", icon: CheckCircle2, color: C.calidad },
    { key: "comparativo", label: "Comparativo", icon: GitCompareArrows, color: t.text },
  ];

  const viewProps = { machine, history, t, C };

  return (
    <>
      {/* Barra de acciones / breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <Button variant="secondary" icon={<ArrowLeft size={14} />} onClick={() => onNavigate(backTo)}>
          Volver
        </Button>
        <span style={{ fontSize: 12.5, color: t.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>
          {AREAS[areaId]?.label ?? areaId}
          {propuesta && ` · ${propuesta.label}`} / {machine.equipo}
        </span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Columna izquierda: tarjeta fija + Identificación (contexto persistente) */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, width: colWidth }}>
          <Tarjeta {...machine} />
          <div>
            <SectionLabel>Identificación</SectionLabel>
            <Panel>
              <DetailRow icon={<Package size={15} />} label="Equipo" value={machine.equipo} t={t} />
              {/* `Modelo` es la receta cargada en el PLC, no un número de parte. */}
              <DetailRow icon={<Package size={15} />} label="Modelo" value={machine.modelo ?? SIN_DATO} t={t} />
              <DetailRow
                icon={<Activity size={15} />}
                label="Estado"
                value={estadoInfo(machine.estado).label}
                color={t[estadoInfo(machine.estado).token]}
                t={t}
              />
              <DetailRow icon={<Clock size={15} />} label="Tiempo muerto" value={fmtDuracion(machine.tMuerto)} t={t} last />
            </Panel>
          </div>
        </div>

        {/* Columna derecha: pestañas + subvista activa */}
        <div style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column", gap: 16 }}>
          <Tabs items={SUBVIEWS} value={sub} onChange={setSub} />

          <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sub === "disponibilidad" && <DisponibilidadView {...viewProps} />}
            {sub === "calidad" && <CalidadView {...viewProps} />}
            {sub === "rendimiento" && <RendimientoView {...viewProps} />}
            {sub === "oee" && <OeeView {...viewProps} />}
            {sub === "comparativo" && <ComparativoView machine={machine} t={t} />}
          </div>
        </div>
      </div>
    </>
  );
}
