/**
 * Vista «Planta» de una máquina CONFIGURADA — la máquina de un vistazo, con
 * sus tendencias reales y con lo que no se puede decir dicho en pantalla
 * (Plan 42.5 F1).
 *
 * ── GENÉRICA DE VERDAD, NO UNA COPIA DE `PlantaTanque` ───────────────
 *
 * Todo lo que enseña sale del registro de la máquina que tiene delante
 * (`useEstadoDeMaquina` → `sistema`, `maquina`, `estado`) y de su tipo: qué
 * series llevan tendencia y en qué orden (`clavesConTendencia`), qué está
 * fuera de banda (`tipo.evaluarRiesgos`), qué banda tiene cada rol
 * (`tipo.bandaDe`), qué no se puede decir (`sistema.limitaciones`). No hay
 * un `if` por máquina, y una prueba lo afirma leyendo este archivo
 * (`sin-literales-de-maquina.test.js`). Si para pintar algo hiciera falta
 * saber que la máquina es de vibraciones, ese algo va al TIPO (D1).
 *
 * ── LAS BANDAS, Y LAS QUE NO ESTÁN (D5) ─────────────────────────────
 *
 *   1. Atención      · los riesgos activos del tipo, si hay alguno
 *   2. Con historia  · las series verificadas, cada una con su sparkline
 *   3. Estado        · qué dice cada variable, con barra donde el tipo
 *                      declara banda
 *   4. Tendencias    · las mismas series a tamaño real, con la cobertura
 *   5. Limitaciones  · lo que la configuración y el sondeo dejaron dicho
 *
 * No hay titular: ningún tipo declara hoy una señal principal que resuma la
 * máquina como el nivel resume el tanque, y sin ella un héroe sería un
 * adorno. No hay recorrido: la topología es del tipo y la Vista 3D ya la
 * enseña. La rejilla de 12 columnas y el ritmo binario (24 px entre bandas,
 * 16 px dentro) son los de `PlantaTanque`, que es de donde sale que los
 * cantos alineen de banda a banda.
 *
 * ── LO QUE NO SE INVENTA ─────────────────────────────────────────────
 *
 * Una variable sin serie verificada no sale en «Con historia» ni en
 * «Tendencias»: aparece en «Estado» con su valor en vivo, y la banda de
 * limitaciones dice cuántas faltan y por qué. Un rango a medias se declara
 * (`cobertura`). Sin máquina en contexto, la pantalla lo dice; no cae en
 * otra de consuelo.
 */
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid } from "lucide-react";

import { AlertBanner, Button, SectionLabel } from "@/components/ui/index.js";
import { declararContextoDeVista } from "@/features/asistente/lib/contextoDeVista.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { useTheme } from "@/theme";
import { clavesConTendencia } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { UltimaLectura } from "../../components/base.jsx";
import {
  BandaSenalesConHistoria, EstadoVariables, LimitacionesMaquina, TendenciasMaquina,
} from "../../components/maquina/tilesMaquina.jsx";
import { TarjetaRiesgo } from "../../components/riesgoVibracion.jsx";
import { VENTANA } from "../../data/comunes/historia.js";
import { useEstadoDeMaquina, useSeriesDeMaquina } from "../../data/comunes/useEstadoDeMaquina.js";

const REJILLA = `
.maq-page { display: flex; flex-direction: column; gap: 24px; }
.maq-band { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; align-items: stretch; }
.maq-full { grid-column: 1 / -1; }
.maq-riesgos { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
`;

const SIN_RIESGOS = Object.freeze({ activos: [], noEvaluables: [], evaluadas: 0 });

function PlantaMaquina({ onNavigate }) {
  const mensajeDeError = useMensajeDeError();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "navigation", "errors"]);
  const { theme: t, dark } = useTheme();

  const { sistema, maquina, estado, dominio, lastUpdated, loading, error } = useEstadoDeMaquina();
  const tipo = tipoDe(maquina?.tipo);

  /* El asistente sabe qué máquina hay en pantalla; sólo el identificador. */
  useEffect(() => (maquina ? declararContextoDeVista({ sistema: maquina.id }) : undefined), [maquina]);

  // Qué series llevan tendencia y en qué orden lo decide el dominio, una vez
  // por máquina: la configuración no cambia mientras la pantalla está abierta.
  const claves = useMemo(
    () => (sistema && maquina ? clavesConTendencia(sistema, maquina, tipo) : []),
    [sistema, maquina, tipo],
  );

  // Las series del historiador se piden UNA vez y se reparten entre la banda
  // de sparklines y la de tendencias: pedirlas por componente serían dos
  // rondas para dibujar exactamente los mismos puntos.
  const {
    porClave, metaPorClave, cobertura, loading: cargandoHistoria, error: errorHistoria,
  } = useSeriesDeMaquina(claves, VENTANA);

  const riesgos = useMemo(
    () => (tipo?.evaluarRiesgos && dominio ? tipo.evaluarRiesgos(dominio) : SIN_RIESGOS),
    [tipo, dominio],
  );

  const senales = useMemo(() => estado?.senales ?? [], [estado]);
  const porClaveSenal = useMemo(() => new Map(senales.map((s) => [s.clave, s])), [senales]);
  const destacadas = claves.map((c) => porClaveSenal.get(c)).filter(Boolean);

  /* La banda de un rol la declara el tipo; sin tipo o sin rol, `null` y sin barra. */
  const bandaDe = (senal) => {
    const rol = maquina?.variables?.find((v) => (v.id ?? v.pointName) === senal.clave)?.rol ?? null;
    return rol && tipo?.bandaDe ? tipo.bandaDe(rol) : null;
  };

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

  if (loading && !estado?.senales?.length) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>{traducir("machines:maquina.planta.loading")}</p>;
  }

  return (
    <>
      <style>{REJILLA}</style>

      <div className="maq-page">
        {error && (
          <AlertBanner
            type="error"
            title={traducir("errors:titles.moduleReadFailed")}
            message={mensajeDeError(error).titulo}
            detalle={mensajeDeError(error).detalle}
            accion={mensajeDeError(error).accion}
          />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: t.textSoft }}>{maquina.nombre ?? maquina.id}</div>
          <UltimaLectura fecha={lastUpdated} t={t} />
          {/* El rótulo del botón es el nombre de la ruta a la que lleva. */}
          <Button variant="primary" icon={<LayoutGrid size={14} />} onClick={() => onNavigate?.("maq-detalle", { maquina: maquina.id })}>
            {traducir("navigation:routes.maq-detalle.nav")}
          </Button>
        </div>

        {/* 1 · ATENCIÓN — condicional: sin riesgo activo, no se pinta. */}
        {riesgos.activos.length > 0 && (
          <>
            <SectionLabel sub={traducir("machines:maquina.planta.atencion.sub")}>
              {traducir("machines:maquina.planta.atencion.title", { n: riesgos.activos.length })}
            </SectionLabel>
            <div className="maq-riesgos">
              {riesgos.activos.map((r) => (
                <TarjetaRiesgo key={`${r.id}-${r.canal ?? "maquina"}`} riesgo={r} t={t} onNavigate={onNavigate} />
              ))}
            </div>
          </>
        )}

        {/* 2 · Las series verificadas, cada una con su sparkline. */}
        <SectionLabel sub={traducir("machines:maquina.planta.historia.sub", { horas: VENTANA.horas })}>
          {traducir("machines:maquina.planta.historia.title", { count: claves.length })}
        </SectionLabel>
        {claves.length > 0 ? (
          <BandaSenalesConHistoria senales={destacadas} porClave={porClave} t={t} dark={dark} base={0.05} />
        ) : (
          <AlertBanner type="info" title={traducir("machines:maquina.planta.historia.ningunaTitle")} message={traducir("machines:maquina.planta.historia.ninguna")} />
        )}

        {/* 3 · Qué dice cada variable ahora mismo, con barra donde el tipo declara banda. */}
        <div className="maq-band">
          <div className="maq-full">
            <EstadoVariables senales={senales} bandaDe={bandaDe} grupos={estado?.grupos ?? []} t={t} dark={dark} delay={0.3} />
          </div>
        </div>

        {/* 4 · Cierre: las series del historiador a tamaño real, con la cobertura. */}
        {claves.length > 0 && (
          <div className="maq-band">
            <div className="maq-full">
              {cargandoHistoria && !Object.keys(porClave).length ? (
                <p style={{ fontSize: 12, color: t.textFaint, textAlign: "center", padding: "20px 0" }}>
                  {traducir("machines:plant.loadingHistorian")}
                </p>
              ) : (
                <TendenciasMaquina
                  senales={destacadas} porClave={porClave}
                  metaPorClave={errorHistoria ? Object.fromEntries(claves.map((c) => [c, { error: errorHistoria.message }])) : metaPorClave}
                  cobertura={cobertura} horas={VENTANA.horas}
                  t={t} dark={dark} delay={0.4}
                />
              )}
            </div>
          </div>
        )}

        {/* 5 · Lo que no se puede decir, tal como lo redacta el registro. */}
        <LimitacionesMaquina limitaciones={sistema.limitaciones} t={t} delay={0.45} />
      </div>
    </>
  );
}

export default PlantaMaquina;
