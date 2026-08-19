/**
 * Vista «Detalle» — la subvista de la máquina. Los cuatro activos (Tanque,
 * Bombeo, Distribución, Eléctrico) no son cuatro máquinas: son las cuatro
 * preguntas sobre UNA sola instalación, y esta vista es donde se responden
 * todas sin salir de aquí. Cada valor con su histórico completo, y las
 * pestañas de arriba cambian de activo sin volver a navegar.
 *
 * Se llega con el botón «Detalle» de Planta (`params.activo` vacío, cae al
 * primero) o desde la ficha de un activo en la Maqueta 3D, ya con el suyo
 * seleccionado («Ver detalle completo»). Antes hacía falta ir y volver a la
 * Maqueta para cambiar de activo; las pestañas son exactamente para que eso
 * deje de hacer falta.
 *
 * El layout de cada activo es la Versión A (rejilla de tarjetas, una por
 * variable, gráfica a tamaño real): de tres acomodos comparados en vivo, fue
 * el elegido.
 */
import { AlertBanner, SectionLabel, Tabs } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { conFuenteEva } from "../data/EvaProvider.jsx";
import { useDetalleActivo } from "../data/detalleActivo.js";
import { ACTIVO_IDS, activoInfo } from "../domain/activos.js";
import { estadoInfo } from "../domain/estado.js";
import { UltimaLectura, PuntoEstado } from "../components/base.jsx";
import { estadoColor } from "../components/paleta.js";
import { DetalleGrid } from "../components/detalle/DetalleGrid.jsx";

function CabeceraActivo({ activo, dark, t, lastUpdated }) {
  const info = estadoInfo(activo.estado);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PuntoEstado color={estadoColor(dark, activo.estado)} size={10} />
        <div>
          <div style={{ fontSize: 13, color: t.textSoft }}>{activo.pregunta}</div>
        </div>
        <span
          style={{
            padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: t.hover, color: t.textSoft, marginLeft: 4,
          }}
        >
          {info.label}
        </span>
      </div>
      <UltimaLectura fecha={lastUpdated} t={t} />
    </div>
  );
}

function DetalleActivo({ params, onNavigate }) {
  const { theme: t, dark } = useTheme();

  const activoId = ACTIVO_IDS.includes(params?.activo) ? params.activo : ACTIVO_IDS[0];
  const { activo, activos, variables, loading, error, lastUpdated } = useDetalleActivo(activoId);

  if (loading && !activo?.senales?.some((s) => s.receivedAt)) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>Leyendo el activo…</p>;
  }

  if (!activo) {
    return <AlertBanner type="error" title="Activo desconocido" message={`No existe un activo con id «${activoId}».`} />;
  }

  const pestañas = activos.map((a) => ({ key: a.id, label: a.corto, color: estadoColor(dark, a.estado) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && <AlertBanner type="error" title="No se pudo leer el sistema de agua" message={error} />}

      <SectionLabel sub="La máquina en detalle: cada valor con su histórico completo — real cuando el historiador lo tiene, del búfer de esta sesión cuando no">
        Detalle · {activoInfo(activoId)?.label}
      </SectionLabel>

      <Tabs items={pestañas} value={activoId} onChange={(id) => onNavigate?.("eva-detalle", { activo: id })} />

      <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <CabeceraActivo activo={activo} dark={dark} t={t} lastUpdated={lastUpdated} />

        <DetalleGrid variables={variables} t={t} dark={dark} />
      </div>
    </div>
  );
}

export default conFuenteEva(DetalleActivo);
