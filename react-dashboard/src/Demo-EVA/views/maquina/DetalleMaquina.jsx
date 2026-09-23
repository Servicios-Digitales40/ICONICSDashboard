/**
 * Vista «Detalle» de una máquina CONFIGURADA — pestañas por activo, una
 * tarjeta por variable con su gráfica real, rango del historiador y CSV
 * (Plan 42.5 F2).
 *
 * ── GENÉRICA, Y POR QUÉ SE PARECE TANTO A `DetalleActivo` ────────────
 *
 * El layout es la Versión A del tanque (rejilla de tarjetas, una por
 * variable, gráfica a tamaño real): de tres acomodos comparados en vivo, fue
 * el elegido, y no hay motivo para elegir otro para otra máquina. Lo que
 * cambia es de dónde sale todo: los activos son los `assets` de la
 * configuración que tienen variables (D3), las variables salen de la forma
 * común adaptada en dominio (`variablesDeActivo`, D9), la historia del
 * historiador sólo para las series VERIFICADAS por el sondeo, y quien lee el
 * pasado es la fuente de ESTA máquina (`fuente.leerSerie`), que en «Simulado»
 * es el historiador simulado y en real el puente.
 *
 * Se llega con el botón «Detalle» de Planta (`params.activo` vacío, cae al
 * primero) o desde la ficha de un apoyo en la Vista 3D, ya con el suyo. El
 * rango vive en el estado de la vista y en la URL (`rangoEnUrl.js`): un
 * enlace copiado abre el mismo rango; cambiar de pestaña lo conserva.
 *
 * «Comparar señales» ofrecía las series verificadas de TODA la máquina —72
 * chips en `vib-motor-03`— con el argumento de que comparar cruza activos.
 * Sigue pudiendo cruzarlos, pero ARRANCA con las medidas del activo de la
 * pestaña y ofrece «toda la máquina» y el interruptor «sólo medidas» (Plan
 * 42.5 F6, D16), con el mismo filtro de dominio que la Planta. El filtro
 * viaja en la URL (`filtroEnUrl.js`) y cambiar de pestaña lo devuelve al
 * activo nuevo. «Exportar todo» sigue exportando TODA la máquina: un CSV no
 * se mira, se guarda, y ahí sobra es mejor que falta.
 *
 * ── LO QUE DICE CUANDO FALTA ALGO (D4) ───────────────────────────────
 *
 * Una variable sin serie verificada enseña su valor en vivo y, en vez de una
 * gráfica vacía, la CAUSA que dejó el sondeo (`historyCausa`) con el enlace a
 * Configuración. Un rango a medias se declara. Sin máquina en contexto, se
 * dice; no se cae en otra.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet } from "lucide-react";

import { AlertBanner, Button, SectionLabel, Tabs } from "@/components/ui/index.js";
import { declararContextoDeVista } from "@/features/asistente/lib/contextoDeVista.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { useFormato } from "@/i18n/formato.js";
import { useTheme } from "@/theme";
import { SIN_ACTIVO, clavesConTendencia, contarPorActivo, filtrarClaves } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { UltimaLectura } from "../../components/base.jsx";
import { DetalleGrid } from "../../components/detalle/DetalleGrid.jsx";
import { GraficaComparada } from "../../components/detalle/GraficaComparada.jsx";
import { SelectorRango } from "../../components/detalle/SelectorRango.jsx";
import { FiltroDeSeries } from "../../components/maquina/FiltroDeSeries.jsx";
import { leerFiltroDeUrl, parametrosDeFiltro } from "../../data/comunes/filtroEnUrl.js";
import {
  PRESETS_RANGO, aFechaUrl, leerRangoDeUrl, parametrosDeRango, rangoPersonalizado,
} from "../../data/comunes/rangoEnUrl.js";
import { useDetalleMaquina } from "../../data/comunes/useDetalleMaquina.js";
import { descargarCSV } from "../../lib/exportar.js";
import { armarCSVGeneral, nombreArchivoGeneral } from "../../lib/exportarTodo.js";
import { useAhora } from "../../lib/useAhora.js";

/** La pantalla donde se sondean las series: el destino del enlace de una variable sin gráfica. */
const RUTA_CONFIGURACION = "eva-configuracion";

function DetalleMaquina({ params, onNavigate }) {
  const mensajeDeError = useMensajeDeError();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "navigation", "errors"]);
  const { locale } = useFormato();
  const { theme: t, dark } = useTheme();
  const ahora = useAhora();

  // El rango vive AQUÍ para que sobreviva al cambio de pestaña: `Shell` mantiene
  // montado el componente mientras la ruta siga siendo `maq-detalle`.
  const inicial = leerRangoDeUrl(params);
  const [presetActivo, setPresetActivo] = useState(inicial.presetActivo);
  const [rango, setRango] = useState(inicial.rango);
  const [personalizado, setPersonalizado] = useState(inicial.personalizado);
  const [exportandoTodo, setExportandoTodo] = useState(false);

  const enVivo = presetActivo === "vivo";
  const {
    maquina, sistema, fuente, activo, activos, variables, loading, error, lastUpdated,
    historiaHasMore, historiaCobertura,
  } = useDetalleMaquina(params?.activo, rango, enVivo);
  const tipo = tipoDe(maquina?.tipo);

  /* Sólo IDENTIFICADORES para el asistente: qué máquina, qué activo, qué período. */
  useEffect(
    () =>
      maquina
        ? declararContextoDeVista({ sistema: maquina.id, activo: activo?.id ?? undefined, rango: presetActivo })
        : undefined,
    [maquina, activo, presetActivo],
  );

  /* Re-sincroniza con la URL: un enlace con otro rango, o «atrás»/«adelante». No
     se dispara al cambiar sólo de pestaña (`params.activo`): el rango sobrevive. */
  useEffect(() => {
    const siguiente = leerRangoDeUrl(params);
    setPresetActivo(siguiente.presetActivo);
    setRango(siguiente.rango);
    setPersonalizado(siguiente.personalizado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.rango, params?.desde, params?.hasta]);

  /* El filtro de «Comparar» (D16): por defecto, el activo de la pestaña; un
     `filtro` de la URL que no sea de esta máquina cae a ese defecto. */
  const activoPorDefecto = activo?.id ?? null;
  const filtro = useMemo(() => {
    const leido = leerFiltroDeUrl(params, { activoPorDefecto });
    return leido.activo === null || activos.some((a) => a.id === leido.activo) ? leido : { ...leido, activo: activoPorDefecto };
  }, [params, activos, activoPorDefecto]);
  const paramsDeFiltro = () => parametrosDeFiltro(filtro, { activoPorDefecto });

  const navegarA = (extra) =>
    onNavigate?.("maq-detalle", { maquina: maquina.id, activo: activo?.id, ...extra });

  function elegirPreset(key) {
    setPresetActivo(key);
    setPersonalizado(null);
    const calculador = PRESETS_RANGO[key];
    if (calculador) setRango(calculador());
    navegarA({ rango: key, ...paramsDeFiltro() });
  }

  function elegirPersonalizado(diaInicio, diaFin) {
    setPresetActivo("personalizado");
    setRango(rangoPersonalizado(diaInicio, diaFin));
    const desde = aFechaUrl(diaInicio);
    const hasta = aFechaUrl(diaFin);
    setPersonalizado({ desde, hasta });
    navegarA({ rango: "personalizado", desde, hasta, ...paramsDeFiltro() });
  }

  const cambiarFiltro = (nuevo) =>
    navegarA({ ...parametrosDeRango(presetActivo, personalizado), ...parametrosDeFiltro(nuevo, { activoPorDefecto }) });

  /* Las series exportables son las verificadas de TODA la máquina; las
     comparables, las que deja el filtro (D16). */
  const comparablesTodas = useMemo(() => {
    if (!sistema || !maquina) return [];
    const porClave = new Map(maquina.variables.map((v) => [v.id ?? v.pointName, v]));
    return clavesConTendencia(sistema, maquina, tipo).map((clave) => {
      const meta = sistema.metaDe(clave);
      const banda = porClave.get(clave)?.rol && tipo?.bandaDe ? tipo.bandaDe(porClave.get(clave).rol) : null;
      return {
        clave,
        label: meta?.label ?? clave,
        unidad: meta?.unidad ?? "",
        punto: porClave.get(clave)?.pointName ?? null,
        escala: banda && Number.isFinite(banda.max) ? { min: Number.isFinite(banda.min) ? banda.min : 0, max: banda.max } : null,
      };
    });
  }, [sistema, maquina, tipo]);
  const clavesComparables = useMemo(() => comparablesTodas.map((c) => c.clave), [comparablesTodas]);
  const comparables = useMemo(() => {
    const visibles = new Set(filtrarClaves(sistema, maquina, clavesComparables, filtro));
    return comparablesTodas.filter((c) => visibles.has(c.clave));
  }, [sistema, maquina, comparablesTodas, clavesComparables, filtro]);
  const conteoPorActivo = useMemo(
    () => contarPorActivo(maquina, filtrarClaves(sistema, maquina, clavesComparables, { soloMedidas: filtro.soloMedidas })),
    [sistema, maquina, clavesComparables, filtro.soloMedidas],
  );

  async function exportarTodo() {
    if (!fuente) return;
    setExportandoTodo(true);
    try {
      const series = await Promise.all(
        comparablesTodas.map(async (c) => {
          const { datos, cobertura, motivo } = await fuente.leerSerie(c.clave, rango);
          return { senal: { corto: c.label, label: c.label, unidad: c.unidad }, datos, cobertura, motivo, punto: c.punto };
        }),
      );
      descargarCSV(nombreArchivoGeneral(rango), armarCSVGeneral(series, locale));
    } finally {
      setExportandoTodo(false);
    }
  }

  if (!maquina) {
    return (
      <AlertBanner
        type="info"
        title={traducir("machines:maquina.planta.sinMaquina.title")}
        message={traducir("machines:maquina.planta.sinMaquina.message")}
      />
    );
  }

  if (!sistema) {
    return (
      <AlertBanner
        type="error"
        title={traducir("machines:maquina.planta.sinFuente.title")}
        message={error?.message ?? traducir("machines:maquina.planta.sinFuente.message")}
      />
    );
  }

  if (!activos.length) {
    return (
      <AlertBanner
        type="info"
        title={traducir("machines:maquina.detalle.sinVariables.title")}
        message={traducir("machines:maquina.detalle.sinVariables.message")}
      />
    );
  }

  if (loading && !variables.some((v) => v.receivedAt)) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>{traducir("machines:maquina.planta.loading")}</p>;
  }

  const rotuloDe = (a) => (a.id === SIN_ACTIVO ? traducir("machines:maquina.detalle.sinActivo") : a.nombre);
  const pestanas = activos.map((a) => ({ key: a.id, label: rotuloDe(a), color: t.accent }));
  const claveSonda = variables.find((v) => v.historizado)?.key;
  const tieneHistoriadas = Boolean(claveSonda);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <AlertBanner
          type="error"
          title={traducir("errors:titles.moduleReadFailed")}
          message={mensajeDeError(error).titulo}
          detalle={mensajeDeError(error).detalle}
          accion={mensajeDeError(error).accion}
        />
      )}

      <SectionLabel sub={traducir("machines:maquina.detalle.sub", { maquina: maquina.nombre ?? maquina.id })}>
        {traducir("machines:detail.title", { activo: activo ? rotuloDe(activo) : "" })}
      </SectionLabel>

      {/* Cambiar de pestaña conserva el rango y el interruptor; el activo del filtro vuelve al de la pestaña nueva. */}
      <Tabs
        items={pestanas} value={activo?.id}
        onChange={(id) =>
          onNavigate?.("maq-detalle", {
            maquina: maquina.id, activo: id,
            ...parametrosDeRango(presetActivo, personalizado),
            ...parametrosDeFiltro({ activo: id, soloMedidas: filtro.soloMedidas }, { activoPorDefecto: id }),
          })
        }
      />

      <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: t.textSoft }}>
            {traducir("machines:maquina.detalle.variables", { count: variables.length })}
          </div>
          <UltimaLectura fecha={lastUpdated} t={t} />
        </div>

        {tieneHistoriadas && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <SelectorRango
                activo={presetActivo}
                onPreset={elegirPreset}
                onPersonalizado={elegirPersonalizado}
                t={t}
                claveSonda={claveSonda}
                leerSerie={fuente?.leerSerie}
              />
              {!enVivo && (
                <Button
                  variant="secondary"
                  icon={<FileSpreadsheet size={14} />}
                  loading={exportandoTodo}
                  onClick={exportarTodo}
                >
                  {traducir("machines:detail.exportAll")}
                </Button>
              )}
            </div>
            {historiaCobertura && !historiaCobertura.completa && (
              <span style={{ fontSize: 10.5, color: t.textFaint }}>
                {traducir("machines:detail.partialCoverage", {
                  conDato: historiaCobertura.tramosConDato, tramos: historiaCobertura.tramos,
                })}
              </span>
            )}
            {historiaHasMore && (
              <span style={{ fontSize: 10.5, color: t.textFaint }}>{traducir("machines:maquina.detalle.hasMore")}</span>
            )}
          </div>
        )}

        <DetalleGrid
          variables={variables} t={t} dark={dark} ahora={ahora} cobertura={historiaCobertura}
          onIrAConfiguracion={() => onNavigate?.(RUTA_CONFIGURACION, { maquina: maquina.id })}
        />
      </div>

      {comparablesTodas.length >= 2 && (
        <>
          <SectionLabel sub={traducir("machines:maquina.detalle.compareSub")}>
            {traducir("machines:compare.title")}
          </SectionLabel>
          <FiltroDeSeries
            activos={activos} conteoPorActivo={conteoPorActivo} filtro={filtro} onCambiar={cambiarFiltro}
            visibles={comparables.length} total={comparablesTodas.length} t={t}
          />
          {/* La `key` remonta la gráfica al cambiar el filtro: su selección inicial se
              calcula al montar, y una selección de otro activo no tendría chips. */}
          <GraficaComparada
            key={`${filtro.activo ?? "todas"}:${filtro.soloMedidas}`}
            rango={enVivo ? null : rango} t={t} dark={dark}
            comparables={comparables} leerSeries={fuente?.leerSeries}
          />
        </>
      )}
    </div>
  );
}

export default DetalleMaquina;
