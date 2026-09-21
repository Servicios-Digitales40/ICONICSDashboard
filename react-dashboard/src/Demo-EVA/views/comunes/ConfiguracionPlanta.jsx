/**
 * Vista «Planta › Configuración»: qué máquinas conoce el tablero, si su
 * configuración sigue siendo cierta, y —desde el Plan 36— cómo se da de alta
 * o se edita una marcando el árbol de ICONICS. Plan 33 F5 y F8, Plan 34 F4,
 * Plan 36 F1–F3.
 *
 * ── QUÉ ENSEÑA, Y POR QUÉ ESO Y NO MÁS ─────────────────────────────
 *
 * Las máquinas CONFIGURADAS —las que viven en `datos/maquinas.json`— con lo
 * que saben hacer y, sobre todo, **lo que no**. No enseña las escritas a mano
 * (tanque, vibraciones): ésas están en el código y no se configuran desde
 * aquí, así que mezclarlas invitaría a intentar editarlas.
 *
 * ── YA NO ES DE SÓLO LECTURA, Y POR QUÉ AHORA SÍ ───────────────────
 *
 * Hasta el 21-09-2026 esta vista sólo enseñaba, y su cabecera decía por qué:
 * el alta incluía decidir qué variables son escribibles, y con
 * `AUTH_HABILITADA=false` esa decisión habría quedado al alcance de
 * cualquiera con acceso al tablero (Plan 33 §20, dependencia dura del Plan
 * 25). El Plan 35 encendió la autenticación y puso `administrador` como rol
 * mínimo a todo `/api/maquinas` y a esta ruta; con eso, el alta desde aquí
 * dejó de chocar con esa decisión.
 *
 * Y aun así **marcar una variable como escribible sigue sin poderse hacer
 * desde aquí**. Todo entra como `acceso: "read"` y lo pone el servidor. No
 * es una limitación a medias: es el alcance del Plan 36 (§5), porque
 * habilitar la escritura sobre la planta es una decisión aparte con su
 * propia conversación. El aviso de arriba lo dice en pantalla.
 *
 * ── EL ALTA ES MARCAR EL ÁRBOL, NO RELLENAR UN CATÁLOGO ────────────
 *
 * El editor (`EditorDeMaquina.jsx`) enseña los tres árboles de ICONICS en
 * paralelo —tiempo real, historizadas, alarmas— y deja marcar activos y
 * variables. Es el flujo de quien configura ICONICS, reproducido aquí; el
 * porqué está en `PLAN-36` §2.4: en este servidor cambian cuatro nombres al
 * mes, y un catálogo escrito a mano caduca cada vez sin que nadie se entere.
 *
 * ── LO QUE SÍ ESCRIBE: DOS PREGUNTAS AL SERVIDOR ───────────────────
 *
 * «Comprobar contra ICONICS» (Plan 33 F8) contrasta los puntos de una máquina
 * y guarda el veredicto. «Sondear sus series» (Plan 34 F4) pide cada serie y
 * las compara entre sí, y anota qué variable puede prometer historia. Las dos
 * van bajo demanda y no al pintar la lista: cuestan una lectura completa de
 * cada máquina, y el limitador corta en 300 peticiones por minuto y por IP.
 *
 * ── LO QUE ESTA VISTA NO HACE, Y ES DELIBERADO ─────────────────────
 *
 * **No suscribe ninguna máquina al sondeo en vivo.** Aquí no se llama a
 * ningún hook de máquina. El sondeo arranca por conteo de referencias en
 * `subscribeSistema`, no al montar una vista, y este proyecto ya ha revivido
 * el sondeo de una máquina cerrada DOS veces por colgar una lectura de un
 * componente que se monta siempre (31-08-2026, 17-09-2026). El editor lee el
 * árbol con `browse` al abrir o marcar una rama: una petición, no un sondeo.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Cog, Info, Pencil, Plus, RefreshCw, ShieldAlert, Waves } from "lucide-react";

import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import {
  listarMaquinas,
  listarTipos,
  sondearMaquina,
  verificarMaquina,
} from "@/lib/api/maquinasApi.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { useTheme } from "@/theme";

/*
 * El editor entra diferido: trae el índice de tipos del dominio y tres
 * árboles que la lista no necesita. Quien sólo viene a comprobar una máquina
 * no lo carga.
 */
const EditorDeMaquina = lazy(() => import("@/Demo-EVA/components/configuracion/EditorDeMaquina.jsx"));

export default function ConfiguracionPlanta({ params = {} } = {}) {
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
   * ── EL EDITOR (Plan 36) ─────────────────────────────────────────────
   *
   * `null` es la lista; `{ maquina: null }` es un alta; `{ maquina }` es una
   * edición. Un enlace `?maquina=<id>` abre la edición al entrar, para que
   * desde otra pantalla se pueda mandar a alguien a «esta máquina».
   */
  const [editor, setEditor] = useState(null);
  const [guardado, setGuardado] = useState(null);

  /*
   * ── LA COMPROBACIÓN ES BAJO DEMANDA (Plan 33 F8) ───────────────────
   *
   * El resultado se guarda aparte del listado, no fusionado con él: la
   * respuesta trae `ausentes` y `motivo`, que no están en la máquina guardada,
   * y mezclarlos haría que un recargado de la lista los borrara sin avisar.
   */
  const [revisiones, setRevisiones] = useState({});
  const [comprobando, setComprobando] = useState(null);

  /* ── EL SONDEO DE SERIES (Plan 34 F4) — ver la cabecera ───────────── */
  const [sondeos, setSondeos] = useState({});
  const [sondeando, setSondeando] = useState(null);

  const cargar = useCallback(async (signal) => {
    /* Las dos a la vez: son independientes y la pantalla las necesita juntas. */
    const [maquinas, tipos] = await Promise.all([
      listarMaquinas({ signal }),
      listarTipos({ signal }),
    ]);
    return { maquinas: maquinas.maquinas ?? [], tipos: tipos.tipos ?? [] };
  }, []);

  /*
   * ── LA LISTA SE VUELVE A PEDIR CUANDO EL SERVIDOR ANOTÓ ALGO ────────
   *
   * Comprobar y sondear ESCRIBEN en la máquina (su estado, el
   * `historyVerified` de cada variable). Hasta el 21-09-2026 la ficha seguía
   * pintando la máquina tal como se listó al entrar: el sondeo decía «9 de 43
   * verificadas» y la cabecera de la misma ficha seguía diciendo «2 con serie
   * verificada». Dos cifras de la misma máquina, en la misma pantalla, y las
   * dos ciertas en momentos distintos. Lo destapó usarla.
   */
  const recargar = useCallback(async () => {
    try {
      const { maquinas, tipos } = await cargar();
      setEstado({ cargando: false, error: null, maquinas, tipos });
    } catch (error) {
      setEstado((prev) => ({ ...prev, error }));
    }
  }, [cargar]);

  const comprobar = useCallback(async (id) => {
    setComprobando(id);
    try {
      const revision = await verificarMaquina(id);
      setRevisiones((previas) => ({ ...previas, [id]: revision }));
      if (revision?.anotado) await recargar();
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
  }, [recargar]);

  const sondear = useCallback(async (id) => {
    setSondeando(id);
    try {
      const sondeo = await sondearMaquina(id);
      setSondeos((previos) => ({ ...previos, [id]: sondeo }));
      if (sondeo?.anotado) await recargar();
    } catch (error) {
      setSondeos((previos) => ({
        ...previos,
        [id]: { estado: "UNKNOWN", motivo: error?.mensajeDelServidor ?? error?.message, anotado: false },
      }));
    } finally {
      setSondeando(null);
    }
  }, [recargar]);

  useEffect(() => {
    const control = new AbortController();

    (async () => {
      try {
        const { maquinas, tipos } = await cargar(control.signal);
        setEstado({ cargando: false, error: null, maquinas, tipos });

        /* El enlace profundo se resuelve cuando ya se sabe qué máquinas hay. */
        if (params?.maquina) {
          const pedida = maquinas.find((m) => m.id === params.maquina);
          if (pedida) setEditor({ maquina: pedida });
        }
      } catch (error) {
        if (control.signal.aborted) return;
        setEstado({ cargando: false, error, maquinas: [], tipos: [] });
      }
    })();

    return () => control.abort();
    // `params.maquina` sólo se mira al entrar: después manda lo que haga la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar]);

  /*
   * Tras guardar, la lista se vuelve a pedir en vez de parchearla a mano: la
   * respuesta del alta trae la máquina, pero sus capacidades y limitaciones
   * las deriva el servidor y es él quien tiene la versión buena.
   */
  const alGuardar = useCallback(async (maquina, avisos) => {
    setEditor(null);
    setGuardado({ maquina, avisos });
    /*
     * La comprobación y el sondeo que se pintaban eran de la configuración
     * ANTERIOR. Tras editar, una ficha que dijera «las 24 variables siguen
     * existiendo» sobre una máquina que ahora tiene 44 estaría mintiendo con
     * un dato que fue cierto. Se descartan; quien quiera saber, vuelve a
     * comprobar.
     */
    const id = maquina?.id;
    if (id) {
      setRevisiones(({ [id]: _vieja, ...resto }) => resto);
      setSondeos(({ [id]: _viejo, ...resto }) => resto);
    }
    await recargar();
  }, [recargar]);

  const textoSuave = { fontSize: 11.5, color: t.textSoft, fontFamily: "'Inter', sans-serif" };

  if (editor) {
    return (
      <>
        <SectionLabel sub={traducir("machines:config.sub")}>
          {traducir("machines:config.title")}
        </SectionLabel>
        <Suspense fallback={<p style={textoSuave}>{traducir("machines:config.loading")}</p>}>
          <EditorDeMaquina
            maquina={editor.maquina}
            tipos={estado.tipos}
            otrosIds={estado.maquinas.filter((m) => m.id !== editor.maquina?.id).map((m) => m.id)}
            onGuardado={alGuardar}
            onCancelar={() => setEditor(null)}
          />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <SectionLabel sub={traducir("machines:config.sub")}>
        {traducir("machines:config.title")}
      </SectionLabel>

      {/*
        El aviso va ARRIBA: dice lo que esta pantalla NO deja decidir —qué
        variables son escribibles— antes de que alguien lo busque.
      */}
      <div style={{ marginBottom: 14 }}>
        <AlertBanner
          type="info"
          title={traducir("machines:config.readOnly")}
          message={traducir("machines:config.readOnlyWhy")}
        />
      </div>

      {guardado && (
        <div style={{ marginBottom: 14 }}>
          <AlertBanner
            type="success"
            title={traducir("machines:config.editor.saved", { nombre: guardado.maquina?.nombre ?? guardado.maquina?.id })}
            message={traducir("machines:config.editor.savedHint")}
            accion={
              guardado.avisos?.length ? (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {guardado.avisos.map((a, i) => <li key={i}>{a.problema}</li>)}
                </ul>
              ) : null
            }
          />
        </div>
      )}

      {estado.error && (
        <div style={{ marginBottom: 14 }}>
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
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* 44 px: da de alta una máquina, que es confirmar algo (DESIGN.md). */}
            <Button icon={<Plus size={14} />} onClick={() => setEditor({ maquina: null })} disabled={estado.cargando}>
              {traducir("machines:config.newMachine")}
            </Button>
            <Boxes size={15} style={{ color: t.textSoft }} />
          </div>
        }
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
            onEditar={() => setEditor({ maquina: m })}
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
  onEditar,
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

        `UNKNOWN` se pinta en gris y NUNCA en rojo. Cuando `anotado` es
        `false`, la respuesta ni siquiera cambió el estado guardado: lo que se
        sabía antes sigue siendo la mejor información, y eso también se dice.
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

        Las dos últimas **no son un veredicto sobre la variable**. La primera
        sí: mientras dure, esa variable no puede prometer historia.
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

        {/* Plan 36 F3: la misma pantalla del alta, cargando lo ya marcado. */}
        <button type="button" onClick={onEditar} style={{ ...estiloBoton(t), cursor: "pointer" }}>
          <Pencil size={13} />
          {traducir("machines:config.edit")}
        </button>
      </div>
    </div>
  );
}

/** Los botones de una ficha comparten forma: 9px de radio, como el kit. */
function estiloBoton(t) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    /* 44px de alto mínimo NO: estos no accionan la instalación, así que el
       criterio táctil de `DESIGN.md` les pide 32. `7px 11px` sobre 11,5px da
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
