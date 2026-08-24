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
import { useEffect, useState } from "react";

import { AlertBanner, SectionLabel, Tabs } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { conFuenteEva } from "../data/EvaProvider.jsx";
import { useDetalleActivo } from "../data/detalleActivo.js";
import { VENTANA, rangoAyer, rangoPersonalizado, rangoSemana } from "../data/historia.js";
import { ACTIVO_IDS, activoInfo } from "../domain/activos.js";
import { estadoInfo } from "../domain/estado.js";
import { useAhora } from "../lib/useAhora.js";
import { UltimaLectura, PuntoEstado } from "../components/base.jsx";
import { estadoColor } from "../components/paleta.js";
import { DetalleGrid } from "../components/detalle/DetalleGrid.jsx";
import { GraficaComparada } from "../components/detalle/GraficaComparada.jsx";
import { SelectorRango } from "../components/detalle/SelectorRango.jsx";

/**
 * Con qué función se calcula el rango de cada acceso rápido contra el
 * historiador. «Tiempo real» no está aquí a propósito: no le pide nada al
 * historiador, lee del búfer en vivo (ver `data/detalleActivo.js`).
 */
const PRESETS_RANGO = { ayer: rangoAyer, semana: rangoSemana };
const PRESETS_VALIDOS = ["vivo", "ayer", "semana", "personalizado"];

/** `Date` → "2026-08-19": lo único que sobrevive el viaje de ida y vuelta por la URL (`useNavegacion` descarta cualquier valor que no sea cadena, número o booleano). */
const aFechaUrl = (dia) => dia.toISOString().slice(0, 10);

/**
 * `params` de la URL → el rango que hay que mostrar.
 *
 * Un valor corrupto —un `rango` desconocido, o un `personalizado` con
 * fechas que no parsean— cae en «vivo», el mismo criterio que ya usa este
 * archivo para un `activo` desconocido (y que `useNavegacion` usa para una
 * página desconocida): un favorito roto no puede tumbar la vista, tiene que
 * degradar a algo que funcione.
 */
function leerRangoDeUrl(params) {
  const preset = PRESETS_VALIDOS.includes(params?.rango) ? params.rango : "vivo";

  if (preset === "personalizado") {
    const { desde, hasta } = params ?? {};
    if (desde && hasta) {
      const rango = rangoPersonalizado(desde, hasta);
      if (!Number.isNaN(rango.inicio.getTime()) && !Number.isNaN(rango.fin.getTime())) {
        return { presetActivo: "personalizado", rango, personalizado: { desde, hasta } };
      }
    }
    return { presetActivo: "vivo", rango: VENTANA, personalizado: null };
  }

  const calculador = PRESETS_RANGO[preset];
  return { presetActivo: preset, rango: calculador ? calculador() : VENTANA, personalizado: null };
}

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
  // `nav.params`), así que cambiar de activo no lo reinicia. El valor
  // inicial sale de la URL —un enlace copiado abre el mismo rango, no
  // siempre «Tiempo real»— y de ahí en más `onNavigate` la mantiene al día.
  const inicial = leerRangoDeUrl(params);
  const [presetActivo, setPresetActivo] = useState(inicial.presetActivo);
  const [rango, setRango] = useState(inicial.rango);
  // Sólo se necesita para reescribir la URL en «personalizado»: `rango` ya
  // trae `{inicio, fin}` calculado, pero la URL quiere las dos fechas tal
  // como se eligieron, no el objeto derivado.
  const [personalizado, setPersonalizado] = useState(inicial.personalizado);
  // Un solo reloj para toda la vista: ver la cabecera de `useAhora`.
  const ahora = useAhora();

  const activoId = ACTIVO_IDS.includes(params?.activo) ? params.activo : ACTIVO_IDS[0];

  /*
   * Re-sincroniza si cambian los parámetros de RANGO de la URL — un enlace
   * compartido con un rango distinto, o "atrás"/"adelante" del navegador.
   * No se dispara al cambiar sólo de pestaña (`params.activo`): el rango
   * sobrevive a eso a propósito, y esta dependencia no lo incluye.
   */
  useEffect(() => {
    const siguiente = leerRangoDeUrl(params);
    setPresetActivo(siguiente.presetActivo);
    setRango(siguiente.rango);
    setPersonalizado(siguiente.personalizado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.rango, params?.desde, params?.hasta]);

  function elegirPreset(key) {
    setPresetActivo(key);
    setPersonalizado(null);
    const calculador = PRESETS_RANGO[key];
    if (calculador) setRango(calculador());
    onNavigate?.("eva-detalle", { activo: activoId, rango: key });
  }

  function elegirPersonalizado(diaInicio, diaFin) {
    setPresetActivo("personalizado");
    setRango(rangoPersonalizado(diaInicio, diaFin));
    const desde = aFechaUrl(diaInicio);
    const hasta = aFechaUrl(diaFin);
    setPersonalizado({ desde, hasta });
    onNavigate?.("eva-detalle", { activo: activoId, rango: "personalizado", desde, hasta });
  }

  /**
   * El rango actual, en la forma que espera la URL. Lo usa el cambio de
   * PESTAÑA: sin esto, `Tabs` navegaría con `{ activo: id }` a secas, y
   * como `navigate()` reemplaza los parámetros enteros —no los mezcla—
   * cambiar de pestaña borraría el rango de la URL sin que nadie lo pidiera.
   */
  function parametrosDeRango() {
    if (presetActivo === "personalizado" && personalizado) {
      return { rango: "personalizado", desde: personalizado.desde, hasta: personalizado.hasta };
    }
    return { rango: presetActivo };
  }

  const enVivo = presetActivo === "vivo";
  const {
    activo, activos, variables, loading, error, lastUpdated, historiaHasMore, historiaCobertura,
  } = useDetalleActivo(
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

      <Tabs
        items={pestañas} value={activoId}
        onChange={(id) => onNavigate?.("eva-detalle", { activo: id, ...parametrosDeRango() })}
      />

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
            {historiaCobertura && !historiaCobertura.completa && (
              /*
               * Un rango con días sin registro se dibuja como una curva
               * continua entre los que sí lo tienen, y se lee como si la
               * señal hubiera evolucionado así. Decir cuántos tramos traen
               * dato es lo que distingue «la planta estuvo parada» de «la
               * consulta se quedó corta».
               */
              <span style={{ fontSize: 10.5, color: t.textFaint }}>
                {historiaCobertura.tramosConDato} de {historiaCobertura.tramos} tramos del rango tienen
                registro en el historiador; el resto no tiene muestras.
              </span>
            )}
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

        <DetalleGrid variables={variables} t={t} dark={dark} ahora={ahora} cobertura={historiaCobertura} />
      </div>

      {/*
       * Fuera del `tabpanel`: las cuatro señales con serie propia viven en
       * DOS activos (Tanque y Distribución), así que esto no es contenido
       * de la pestaña actual — es visible sin importar cuál esté abierta.
       */}
      <SectionLabel sub="Las cuatro señales con historia propia, cruzadas — la pregunta de diagnóstico que hoy sólo contesta el asistente">
        Comparar señales
      </SectionLabel>
      <GraficaComparada rango={enVivo ? null : rango} t={t} dark={dark} />
    </div>
  );
}

export default conFuenteEva(DetalleActivo);
