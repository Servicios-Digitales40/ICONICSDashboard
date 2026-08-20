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
import { useState } from "react";

import { AlertBanner, SectionLabel, Tabs } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { conFuenteEva } from "../data/EvaProvider.jsx";
import { useDetalleActivo } from "../data/detalleActivo.js";
import { VENTANA, rangoAyer, rangoPersonalizado, rangoSemana } from "../data/historia.js";
import { ACTIVO_IDS, activoInfo } from "../domain/activos.js";
import { estadoInfo } from "../domain/estado.js";
import { UltimaLectura, PuntoEstado } from "../components/base.jsx";
import { estadoColor } from "../components/paleta.js";
import { DetalleGrid } from "../components/detalle/DetalleGrid.jsx";
import { SelectorRango } from "../components/detalle/SelectorRango.jsx";

/**
 * Con qué función se calcula el rango de cada acceso rápido contra el
 * historiador. «Tiempo real» no está aquí a propósito: no le pide nada al
 * historiador, lee del búfer en vivo (ver `data/detalleActivo.js`).
 */
const PRESETS_RANGO = { ayer: rangoAyer, semana: rangoSemana };

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

  // El estado del rango vive AQUÍ y no en `useDetalleActivo`, para que
  // sobreviva al cambio de pestaña: `Shell` mantiene montado este componente
  // mientras la ruta siga siendo `eva-detalle` (su `key` es `nav.page`, no
  // `nav.params`), así que cambiar de activo no lo reinicia. Por defecto
  // arranca en «Tiempo real».
  //
  // `rango` es irrelevante mientras `presetActivo === "vivo"` — en ese modo
  // `useDetalleActivo` no le pide nada al historiador — así que su valor
  // inicial es sólo un relleno inofensivo, nunca `rangoAyer()` ni parecido
  // (calcularlo de más sin usarlo sería trabajo sin motivo).
  const [presetActivo, setPresetActivo] = useState("vivo");
  const [rango, setRango] = useState(VENTANA);

  function elegirPreset(key) {
    setPresetActivo(key);
    const calculador = PRESETS_RANGO[key];
    if (calculador) setRango(calculador());
  }

  function elegirPersonalizado(diaInicio, diaFin) {
    setPresetActivo("personalizado");
    setRango(rangoPersonalizado(diaInicio, diaFin));
  }

  const activoId = ACTIVO_IDS.includes(params?.activo) ? params.activo : ACTIVO_IDS[0];
  const enVivo = presetActivo === "vivo";
  const { activo, activos, variables, loading, error, lastUpdated, historiaHasMore } = useDetalleActivo(
    activoId,
    rango,
    enVivo
  );

  if (loading && !activo?.senales?.some((s) => s.receivedAt)) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>Leyendo el activo…</p>;
  }

  if (!activo) {
    return <AlertBanner type="error" title="Activo desconocido" message={`No existe un activo con id «${activoId}».`} />;
  }

  const pestañas = activos.map((a) => ({ key: a.id, label: a.corto, color: estadoColor(dark, a.estado) }));

  // Sólo tiene sentido un selector de rango si hay al menos una gráfica que
  // consulte el historiador. Bombeo y Eléctrico no tienen ninguna señal con
  // `historizado: true` y no deben mostrar el control, igual que sus
  // tarjetas ya no muestran `GraficaHistoria`. La primera historizada del
  // activo hace de sonda para pintar, en el calendario, qué días tienen
  // muestras reales — las dos de un mismo activo comparten fuente física,
  // así que una alcanza sin duplicar la consulta.
  const claveSonda = activo.senales.find((s) => s.historizado)?.key;
  const tieneHistoriadas = Boolean(claveSonda);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && <AlertBanner type="error" title="No se pudo leer el sistema de agua" message={error} />}

      <SectionLabel sub="La máquina en detalle: cada valor con su histórico completo — real cuando el historiador lo tiene, del búfer de esta sesión cuando no">
        Detalle · {activoInfo(activoId)?.label}
      </SectionLabel>

      <Tabs items={pestañas} value={activoId} onChange={(id) => onNavigate?.("eva-detalle", { activo: id })} />

      <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <CabeceraActivo activo={activo} dark={dark} t={t} lastUpdated={lastUpdated} />

        {tieneHistoriadas && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <SelectorRango
              activo={presetActivo}
              onPreset={elegirPreset}
              onPersonalizado={elegirPersonalizado}
              t={t}
              claveSonda={claveSonda}
            />
            {historiaHasMore && (
              // Debería ser rarísimo: el intervalo ya se calcula para caber en
              // MAX_PUNTOS. Si aun así el servidor recorta, se dice en vez de
              // fingir que la gráfica está completa.
              <span style={{ fontSize: 10.5, color: t.textFaint }}>
                El servidor tiene más muestras de las que caben aquí; se muestra una selección representativa.
              </span>
            )}
          </div>
        )}

        <DetalleGrid variables={variables} t={t} dark={dark} />
      </div>
    </div>
  );
}

export default conFuenteEva(DetalleActivo);
