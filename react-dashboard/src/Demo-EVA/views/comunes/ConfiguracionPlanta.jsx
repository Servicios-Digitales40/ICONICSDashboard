/**
 * Vista «Planta › Configuración»: qué máquinas conoce el tablero. Plan 33 F5.
 *
 * ── QUÉ ENSEÑA, Y POR QUÉ ESO Y NO MÁS ─────────────────────────────
 *
 * Las máquinas CONFIGURADAS —las que viven en `datos/maquinas.json`— con lo
 * que saben hacer y, sobre todo, **lo que no**. No enseña las escritas a mano
 * (tanque, vibraciones): ésas están en el código y no se configuran desde
 * aquí, así que mezclarlas invitaría a intentar editarlas.
 *
 * ── POR QUÉ ES DE SÓLO LECTURA, Y NO ES UNA FASE A MEDIAS ──────────
 *
 * Porque el alta de una máquina incluye decidir **qué variables son
 * escribibles**, y eso es una decisión con consecuencias sobre la instalación.
 * Hoy `AUTH_HABILITADA=false`: los roles están implementados y probados, pero
 * no protegen nada, a propósito (`CLAUDE.md` §2.11). Una pantalla que
 * permitiera marcar una variable como escribible sin autenticación dejaría esa
 * decisión al alcance de cualquiera con acceso al tablero.
 *
 * El Plan 33 §20 ya lo declara como **dependencia dura del Plan 25**, no como
 * una recomendación. Así que esta vista enseña y explica; el alta sigue
 * haciéndose por la API, que sí tiene `exigirRol` declarado y listo para
 * cuando el interruptor se encienda.
 *
 * Decirlo en pantalla —y no sólo en un plan— es parte del trabajo: una vista
 * sin botón de «nueva máquina» y sin explicación se lee como una vista rota.
 *
 * ── LO QUE ESTA VISTA NO HACE, Y ES DELIBERADO ─────────────────────
 *
 * **No sondea.** No llama a `useSistemaAgua()` ni a ningún hook de máquina.
 * El sondeo arranca por conteo de referencias en `subscribeSistema`, no al
 * montar una vista, y este proyecto ya ha revivido el sondeo de una máquina
 * cerrada DOS veces por colgar una lectura de un componente que se monta
 * siempre (el contador de alarmas del Topbar, 31-08-2026; el badge de
 * hallazgos, 17-09-2026). Una pantalla de configuración no necesita valores en
 * vivo, así que no los pide.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Cog, Info, ShieldAlert } from "lucide-react";

import { AlertBanner, Panel, SectionLabel } from "@/components/ui/index.js";
import { listarMaquinas, listarTipos } from "@/lib/api/maquinasApi.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { useTheme } from "@/theme";

export default function ConfiguracionPlanta() {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "errors"]);
  const { theme: t } = useTheme();
  const mensajeDeError = useMensajeDeError();

  const [estado, setEstado] = useState({
    cargando: true,
    error: null,
    maquinas: [],
    tipos: [],
  });

  useEffect(() => {
    const control = new AbortController();

    (async () => {
      try {
        /*
         * Las dos a la vez: son independientes y la pantalla las necesita
         * juntas. En serie, la lista tardaría lo que tarden las dos.
         */
        const [maquinas, tipos] = await Promise.all([
          listarMaquinas({ signal: control.signal }),
          listarTipos({ signal: control.signal }),
        ]);

        setEstado({
          cargando: false,
          error: null,
          maquinas: maquinas.maquinas ?? [],
          tipos: tipos.tipos ?? [],
        });
      } catch (error) {
        if (control.signal.aborted) return;
        setEstado({ cargando: false, error, maquinas: [], tipos: [] });
      }
    })();

    return () => control.abort();
  }, []);

  const textoSuave = { fontSize: 11.5, color: t.textSoft, fontFamily: "'Inter', sans-serif" };

  return (
    <>
      <SectionLabel sub={traducir("machines:config.sub")}>
        {traducir("machines:config.title")}
      </SectionLabel>

      {/*
        El aviso va ARRIBA y no al final: es lo que explica por qué no hay un
        botón de «nueva máquina», y leerlo después de buscarlo sin encontrarlo
        no sirve de nada.
      */}
      <div style={{ marginBottom: 14 }}>
        <AlertBanner
          type="info"
          title={traducir("machines:config.readOnly")}
          message={traducir("machines:config.readOnlyWhy")}
        />
      </div>

      {estado.error && (
        <div style={{ marginBottom: 14 }}>
          {/*
            `mensajeDeError` devuelve `{titulo, detalle, accion}`, no una
            cadena: el título es la frase traducida por CÓDIGO y el detalle lo
            que sólo el servidor sabe —qué variable falta, qué tag rechazó la
            guarda—. Mismo uso que `CasosRag.jsx`.
          */}
          <AlertBanner
            type="error"
            title={traducir("machines:config.list")}
            message={mensajeDeError(estado.error).titulo}
            detalle={mensajeDeError(estado.error).detalle}
            accion={mensajeDeError(estado.error).accion}
          />
        </div>
      )}

      <Panel
        title={traducir("machines:config.list")}
        right={<Boxes size={15} style={{ color: t.textSoft }} />}
      >
        {estado.cargando && <p style={textoSuave}>{traducir("machines:config.loading")}</p>}

        {!estado.cargando && !estado.error && estado.maquinas.length === 0 && (
          <div>
            <p style={{ ...textoSuave, margin: 0, marginBottom: 6 }}>
              {traducir("machines:config.none")}
            </p>
            {/*
              Sin esta segunda frase, alguien que ve el tanque y vibraciones en
              el menú y esta lista vacía concluye que la pantalla no funciona.
            */}
            <p style={{ ...textoSuave, margin: 0, opacity: 0.8 }}>
              {traducir("machines:config.noneHint")}
            </p>
          </div>
        )}

        {estado.maquinas.map((m) => (
          <FichaDeMaquina key={m.id} maquina={m} traducir={traducir} t={t} />
        ))}
      </Panel>

      <div style={{ marginTop: 14 }}>
        <Panel
          title={traducir("machines:config.types")}
          right={<Cog size={15} style={{ color: t.textSoft }} />}
        >
          {estado.tipos.map((tipo) => (
            <div
              key={tipo.id}
              style={{
                padding: "9px 0",
                borderTop: `1px solid ${t.border}`,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{tipo.nombre}</div>
              <div style={{ ...textoSuave, marginTop: 2 }}>{tipo.descripcion}</div>
              <div style={{ ...textoSuave, marginTop: 3, opacity: 0.8 }}>
                {tipo.reglas} {traducir("machines:config.typeRules")}
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

/**
 * Una máquina configurada.
 *
 * ── LAS LIMITACIONES SE PINTAN, NO SE ESCONDEN ─────────────────────
 *
 * Es la parte que más importa de esta ficha. Una máquina recién configurada es
 * válida y está casi ciega: sin roles mapeados sus reglas no se evalúan, y sin
 * series verificadas no puede contestar por su pasado.
 *
 * Enseñar sólo lo que sabe hacer la haría parecer completa, y entonces «no hay
 * riesgos» se leería como «está bien» en vez de como «no se pudo mirar». El
 * campo `limitaciones` existe por contrato para esto —«lo que hay que confesar
 * al contestar»— y una pantalla que lo omita rompe ese contrato por su lado.
 */
function FichaDeMaquina({ maquina, traducir, t }) {
  const textoSuave = { fontSize: 11.5, color: t.textSoft, fontFamily: "'Inter', sans-serif" };

  const conSerie = (maquina.variables ?? []).filter((v) => v.historyVerified).length;
  const limitaciones = maquina.limitaciones ?? [];

  return (
    <div
      style={{
        padding: "11px 0",
        borderTop: `1px solid ${t.border}`,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{maquina.nombre}</span>
        <span style={{ ...textoSuave, opacity: 0.75 }}>{maquina.id}</span>
      </div>

      <div style={{ ...textoSuave, marginTop: 3 }}>
        {(maquina.variables ?? []).length} {traducir("machines:config.variables")}
        {" · "}
        {conSerie} {traducir("machines:config.series")}
        {" · "}
        {(maquina.assets ?? []).length} {traducir("machines:config.assets")}
      </div>

      {(maquina.capacidades ?? []).length > 0 && (
        <div style={{ ...textoSuave, marginTop: 5 }}>
          <strong style={{ color: t.text, fontWeight: 600 }}>
            {traducir("machines:config.capabilities")}:
          </strong>{" "}
          {maquina.capacidades.join(" · ")}
        </div>
      )}

      {limitaciones.length > 0 && (
        <div style={{ marginTop: 7, display: "flex", gap: 7 }}>
          <ShieldAlert size={14} style={{ color: t.amber, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>
              {traducir("machines:config.limitations")}
            </div>
            <ul style={{ margin: "3px 0 0", paddingLeft: 15 }}>
              {limitaciones.map((linea) => (
                <li key={linea} style={{ ...textoSuave, marginTop: 2 }}>
                  {linea}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/*
        `UNKNOWN` no es un fallo y no se pinta en rojo: significa que nadie ha
        comprobado todavía si sus puntos siguen existiendo en ICONICS. Pintarlo
        como error enseñaría a ignorar los errores de verdad, y además sería
        falso — «no pude mirar» y «está roto» no son lo mismo (Plan 33 §21).
      */}
      {maquina.estado === "UNKNOWN" && (
        <div style={{ marginTop: 7, display: "flex", gap: 7 }}>
          <Info size={14} style={{ color: t.textSoft, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>
              {traducir("machines:config.stateUnknown")}
            </div>
            <div style={{ ...textoSuave, marginTop: 2 }}>
              {traducir("machines:config.stateUnknownHint")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
