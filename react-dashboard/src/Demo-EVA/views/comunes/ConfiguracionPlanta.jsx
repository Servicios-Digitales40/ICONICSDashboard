/**
 * Vista «Planta › Configuración»: qué máquinas conoce el tablero, y si su
 * configuración sigue siendo cierta. Plan 33 F5 y F8.
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
 * ── LO QUE SÍ ESCRIBE: DOS PREGUNTAS AL SERVIDOR ───────────────────
 *
 * «Comprobar contra ICONICS» (Plan 33 F8) contrasta los puntos de una máquina
 * y guarda el veredicto. «Sondear sus series» (Plan 34 F4) pide cada serie y
 * las compara entre sí, y anota qué variable puede prometer historia.
 *
 * Las dos escriben en NUESTRO archivo de configuración, no en la instalación:
 * no mueven un actuador ni cambian un tag, así que no necesitan la
 * autenticación de la que sí depende el alta.
 *
 * Y contestan preguntas distintas: comprobar dice si los puntos siguen
 * EXISTIENDO; sondear, si la serie que el historiador devuelve por una
 * variable es de VERDAD suya —porque contesta que sí y devuelve la de otra
 * señal, sin dar error—.
 *
 * Las dos van bajo demanda y no al pintar la lista: cuestan una lectura
 * completa de cada máquina, y el limitador corta en 300 peticiones por minuto
 * y por IP.
 *
 * ── LO QUE ESTA VISTA NO HACE, Y ES DELIBERADO ─────────────────────
 *
 * **No suscribe ninguna máquina al sondeo en vivo.** Ojo con el nombre: el
 * botón «Sondear sus series» pide historia UNA vez al pulsarlo, y eso es otra
 * cosa. Aquí no se llama a `useSistemaAgua()` ni a ningún hook de máquina.
 * El sondeo arranca por conteo de referencias en `subscribeSistema`, no al
 * montar una vista, y este proyecto ya ha revivido el sondeo de una máquina
 * cerrada DOS veces por colgar una lectura de un componente que se monta
 * siempre (el contador de alarmas del Topbar, 31-08-2026; el badge de
 * hallazgos, 17-09-2026). Una pantalla de configuración no necesita valores en
 * vivo, así que no los pide.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Cog, Info, RefreshCw, ShieldAlert, Waves } from "lucide-react";

import { AlertBanner, Panel, SectionLabel } from "@/components/ui/index.js";
import {
  listarMaquinas,
  listarTipos,
  sondearMaquina,
  verificarMaquina,
} from "@/lib/api/maquinasApi.js";
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

  /*
   * ── LA COMPROBACIÓN ES BAJO DEMANDA (Plan 33 F8) ───────────────────
   *
   * Y no al pintar la lista: cuesta una lectura completa de cada máquina —73
   * puntos en el caso de vibraciones— y el limitador corta en 300 peticiones
   * por minuto y por IP. Verificar al abrir la pantalla la pondría a competir
   * con el sondeo del tablero por el mismo presupuesto.
   *
   * El resultado se guarda aparte del listado, no fusionado con él: la
   * respuesta trae `ausentes` y `motivo`, que no están en la máquina guardada,
   * y mezclarlos haría que un recargado de la lista los borrara sin avisar.
   */
  const [revisiones, setRevisiones] = useState({});
  const [comprobando, setComprobando] = useState(null);

  /*
   * ── EL SONDEO DE SERIES (Plan 34 F4) ───────────────────────────────
   *
   * Hermano de la comprobación, y contesta otra pregunta. «Comprobar» dice si
   * los puntos siguen EXISTIENDO; «sondear» dice si la serie que el
   * historiador devuelve por una variable es de VERDAD suya.
   *
   * Hace falta porque el servidor contesta que sí y devuelve la serie de otra
   * señal, sin dar error: medido, `aPeak_S1` trae la de `aRMS_S1` en 1805 de
   * 1805 valores, y las nueve `QC_*` devuelven todas la misma.
   *
   * Escribe —anota `historyVerified` por variable— y eso está permitido por el
   * mismo motivo que la comprobación: toca NUESTRO archivo de configuración,
   * no la instalación. No mueve un actuador ni cambia un tag, así que no
   * depende de la autenticación de la que sí depende el alta (Plan 33 §20).
   */
  const [sondeos, setSondeos] = useState({});
  const [sondeando, setSondeando] = useState(null);

  const comprobar = useCallback(async (id) => {
    setComprobando(id);
    try {
      /* El `await` va FUERA del actualizador: el callback de `setState` es
         síncrono, y meterlo dentro es un error de sintaxis —lo cazó el
         compilador, no una prueba—. */
      const revision = await verificarMaquina(id);
      setRevisiones((previas) => ({ ...previas, [id]: revision }));
    } catch (error) {
      /* Un fallo al comprobar NO es un veredicto sobre la máquina: es que no
         se pudo mirar. Se pinta como tal, sin tocar su estado. */
      setRevisiones((previas) => ({
        ...previas,
        [id]: { estado: "UNKNOWN", motivo: error?.mensajeDelServidor ?? error?.message, anotado: false },
      }));
    } finally {
      setComprobando(null);
    }
  }, []);

  const sondear = useCallback(async (id) => {
    setSondeando(id);
    try {
      const sondeo = await sondearMaquina(id);
      setSondeos((previos) => ({ ...previos, [id]: sondeo }));
    } catch (error) {
      /* Igual que arriba: no haber podido sondear no es un veredicto sobre
         las series de la máquina. Se pinta como `UNKNOWN`, sin tocar nada. */
      setSondeos((previos) => ({
        ...previos,
        [id]: {
          estado: "UNKNOWN",
          motivo: error?.mensajeDelServidor ?? error?.message,
          anotado: false,
        },
      }));
    } finally {
      setSondeando(null);
    }
  }, []);

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
          <FichaDeMaquina
            key={m.id}
            maquina={m}
            traducir={traducir}
            t={t}
            revision={revisiones[m.id] ?? null}
            comprobando={comprobando === m.id}
            onComprobar={() => comprobar(m.id)}
            sondeo={sondeos[m.id] ?? null}
            sondeando={sondeando === m.id}
            onSondear={() => sondear(m.id)}
          />
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
function FichaDeMaquina({
  maquina, traducir, t,
  revision, comprobando, onComprobar,
  sondeo, sondeando, onSondear,
}) {
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
      {maquina.estado === "UNKNOWN" && !revision && (
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

      {/*
        ── EL RESULTADO DE LA COMPROBACIÓN (Plan 33 F8) ──────────────────

        `UNKNOWN` se pinta en gris y NUNCA en rojo. Significa «no se ha podido
        mirar», no «está roto», y pintarlo como error enseñaría a ignorar los
        errores de verdad — además de ser falso.

        Cuando `anotado` es `false`, la respuesta ni siquiera cambió el estado
        guardado: lo que se sabía antes sigue siendo la mejor información, y
        eso también se dice.
      */}
      {revision && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: revision.estado === "INVALID" ? t.coralSoft : t.panel,
            border: `1px solid ${
              { VALID: t.success, DEGRADED: t.amber, INVALID: t.coral }[revision.estado] ??
              t.border
            }33`,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>
            {revision.estado === "UNKNOWN"
              ? traducir("machines:config.notSaved")
              : traducir(`machines:config.state${revision.estado}`)}
          </div>
          {revision.motivo && (
            <div style={{ ...textoSuave, marginTop: 3 }}>{revision.motivo}</div>
          )}

          {revision.ausentes?.length > 0 && (
            <div style={{ marginTop: 5 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.text, opacity: 0.8 }}>
                {traducir("machines:config.missing")}
              </div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 15 }}>
                {revision.ausentes.map((v) => (
                  <li key={v.pointName} style={{ ...textoSuave, fontFamily: "monospace" }}>
                    {v.pointName}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/*
        ── EL RESULTADO DEL SONDEO (Plan 34 F4) ──────────────────────────

        Se pinta lo que NO quedó verificado, y con su causa, porque son cuatro
        cosas distintas que una cuenta sola confundiría:

          `serie-compartida`  el servidor da la MISMA serie a varias variables
          `sin-variacion`     plana en la ventana: no se distingue de otra igual
          `sin-muestras`      contestó, y no hay nada en la ventana
          `no-se-pudo-leer`   no se llegó a mirar

        Las dos últimas **no son un veredicto sobre la variable**, y por eso no
        se pintan como problema suyo. La primera sí: mientras dure, esa
        variable no puede prometer historia.
      */}
      {sondeo && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: t.panel,
            border: `1px solid ${t.border}`,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>
            {sondeo.resumen
              ? traducir("machines:config.probeResult", {
                  verificadas: sondeo.resumen.verificadas,
                  total: sondeo.resumen.total,
                })
              : traducir("machines:config.probeUnknown")}
          </div>

          {sondeo.motivo && (
            <div style={{ ...textoSuave, marginTop: 3 }}>{sondeo.motivo}</div>
          )}

          {/* Sólo las que comparten serie: es lo accionable. Una variable sin
              variación se resuelve esperando a que la máquina gire. */}
          {sondeo.pendientes?.some((p) => p.causa === "serie-compartida") && (
            <div style={{ marginTop: 6 }}>
              <div style={{ ...textoSuave, fontWeight: 600 }}>
                {traducir("machines:config.probeShared")}
              </div>
              <ul style={{ margin: "3px 0 0", paddingLeft: 16 }}>
                {sondeo.pendientes
                  .filter((p) => p.causa === "serie-compartida")
                  .map((p) => (
                    <li
                      key={p.id}
                      style={{
                        ...textoSuave,
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                      }}
                    >
                      {p.id}
                      {p.compartidaCon?.length ? ` → ${p.compartidaCon.join(", ")}` : ""}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {sondeo.anotado === false && (
            <div style={{ ...textoSuave, marginTop: 4, fontStyle: "italic" }}>
              {traducir("machines:config.probeNotSaved")}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 9, display: "flex", gap: 7, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onComprobar}
          disabled={comprobando}
          style={{ ...estiloBoton(t), opacity: comprobando ? 0.6 : 1,
            cursor: comprobando ? "default" : "pointer" }}
        >
          <RefreshCw size={13} />
          {traducir(comprobando ? "machines:config.checking" : "machines:config.check")}
        </button>

        {/*
          El sondeo sólo tiene sentido si la máquina declara algún punto
          histórico: sin ellos no hay series que comparar, y el botón
          prometería un trabajo que no se puede hacer.
        */}
        {maquina.capacidades?.includes("HISTORICAL_DATA") ||
        maquina.variables?.some((v) => v.historyPointName) ? (
          <button
            type="button"
            onClick={onSondear}
            disabled={sondeando}
            style={{ ...estiloBoton(t), opacity: sondeando ? 0.6 : 1,
              cursor: sondeando ? "default" : "pointer" }}
          >
            <Waves size={13} />
            {traducir(sondeando ? "machines:config.probing" : "machines:config.probe")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Los dos botones de una ficha comparten forma: 9px de radio, como el kit. */
function estiloBoton(t) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    /* 44px de alto mínimo NO: estos no accionan la instalación, así que el
       criterio táctil de `DESIGN.md` les pide 32. `5px 11px` sobre 11,5px da
       ~32. */
    padding: "7px 11px",
    minHeight: 32,
    borderRadius: 9,
    border: `1px solid ${t.border}`,
    background: t.panel,
    color: t.textSoft,
    fontSize: 11.5,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
  };
}
