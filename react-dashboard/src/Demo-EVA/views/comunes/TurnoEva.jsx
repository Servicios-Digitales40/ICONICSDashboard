/**
 * Vista «Turno» — qué ha pasado en mi turno (Plan 25 F2 · `NUE-01`).
 *
 * ── LA PREGUNTA QUE CONTESTA, Y POR QUÉ NO LA CONTESTABA NADIE ─────
 *
 * «Acabo de entrar: ¿qué me he perdido?». Hasta hoy había que recorrer tres
 * pantallas —Alarmas para los eventos, Casos para lo que se cerró, y nada en
 * absoluto para los accionamientos, que sólo se podían ver entrando al servidor
 * con un `cat` sobre el JSONL— y cruzarlas a ojo por la hora.
 *
 * ── DE DÓNDE SALE «UN TURNO», QUE NO SE INVENTA AQUÍ ───────────────
 *
 * De `IA_TURNOS`, el horario que ya usaba el asistente para entender «el turno
 * de noche», publicado ahora en `/api/health` (F2). El cálculo de qué turno
 * está en curso vive en `@shared/periodo.js` (`turnoEnCurso`), junto al resto de
 * la noción de turno.
 *
 * Esta vista **no define un turno propio**, y la primera versión del plan iba a
 * hacerlo —«las últimas 8 horas»— teniendo `shared/periodo.js` delante. Habría
 * sido el fallo que ese archivo describe en su cabecera: «un turno inventado
 * devolvería datos verdaderos de las horas equivocadas, que es indistinguible
 * de la respuesta correcta». Y además, la misma palabra habría significado una
 * cosa en esta pantalla y otra en el asistente (§2.6).
 *
 * **Sin turnos configurados no se finge uno.** Se ofrece una ventana explícita
 * —«últimas 8 h», dicha como lo que es— y se avisa de que no están
 * configurados, nombrando `IA_TURNOS`, que es lo que §4.6 pide de un mensaje:
 * qué falta y cómo resolverlo.
 *
 * ── LAS TRES FUENTES SE PIDEN POR SEPARADO, A PROPÓSITO ────────────
 *
 * Accionamientos (`/api/diario`), eventos de alarma (derivados del historiador)
 * y casos (`/api/casos`) son tres consultas independientes, y **el fallo de una
 * no vacía las otras dos**. Es el mismo criterio que `leerSerie` aplica a los
 * tramos de una ventana larga: perder una fuente de tres no puede dejar la
 * pantalla en blanco, porque entonces un backend con el motor de diagnóstico
 * caído haría creer que el turno estuvo tranquilo.
 *
 * Cada bloque dice si lo suyo falló. Un bloque vacío y un bloque que no se pudo
 * leer se pintan distinto (§2.4).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ClipboardList, NotebookPen, RefreshCw, Siren } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { leerDiario } from "@/lib/api/diarioApi.js";
import { listarCasos } from "@/lib/api/casosApi.js";
import { fetchHealth } from "@/lib/iconics";
import { useEsSimulado } from "@/lib/datasource";
import { useTheme } from "@/theme";
import { turnoEnCurso } from "@shared/periodo.js";
import { SISTEMA_IDS } from "@shared/eva/comun/sistemas.js";

import { LineaDeTiempo } from "../../components/LineaDeTiempo.jsx";
import { ALARMAS_HISTORIZABLES, leerAlarmas } from "../../data/comunes/alarmas.js";

/**
 * La ventana por defecto cuando NO hay turnos configurados, en horas.
 *
 * Ocho es lo que dura un turno en casi cualquier planta, pero eso no la
 * convierte en «el turno»: se enseña como «últimas 8 h» y nunca con el nombre
 * de un turno. La diferencia es toda la honestidad de esta pantalla.
 */
const HORAS_SIN_TURNOS = 8;

/** Estado inicial de una fuente: ni cargada, ni fallada, ni vacía. */
const INICIAL = { cargando: true, error: null, datos: null };

export default function TurnoEva() {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["maintenance", "common", "alarms", "errors"]);
  const mensajeDeError = useMensajeDeError();
  const esSimulado = useEsSimulado();
  /* El nombre de cada máquina en el idioma del tablero, no su id. */
  const { sistema: nombreSistema } = useDominio();

  const [turnos, setTurnos] = useState(null);
  const [recarga, setRecarga] = useState(0);

  const [diario, setDiario] = useState(INICIAL);
  const [alarmas, setAlarmas] = useState(INICIAL);
  const [casos, setCasos] = useState(INICIAL);

  /* ── Qué turno es, y de qué horas hablamos ─────────────────────────── */

  /*
   * El horario viene del despliegue, no del tablero. Se pide una vez: cambiarlo
   * exige reiniciar el backend, así que sondearlo sería gastar peticiones en un
   * dato que no se mueve.
   */
  useEffect(() => {
    let vivo = true;
    fetchHealth()
      .then((salud) => vivo && setTurnos(salud?.turnos ?? {}))
      .catch(() => vivo && setTurnos({}));
    return () => { vivo = false; };
  }, []);

  /*
   * `recarga` entra en las dependencias aunque no se LEA dentro, y por eso va
   * nombrado aquí en vez de dejarlo como un número suelto que parece sobrar:
   * lo que esta ventana captura es `new Date()`, y ese instante sólo se puede
   * refrescar volviendo a calcularla. Es el «vuelve a mirar el reloj» del
   * botón de recargar.
   */
  const ventana = useMemo(() => {
    void recarga;
    if (turnos === null) return null; // todavía no se sabe

    const turno = turnoEnCurso(turnos);
    if (turno) {
      return { inicio: turno.inicio, fin: new Date(), clave: turno.clave, configurado: true };
    }

    const fin = new Date();
    return {
      inicio: new Date(fin.getTime() - HORAS_SIN_TURNOS * 3_600_000),
      fin,
      clave: null,
      configurado: false,
    };
  }, [turnos, recarga]);

  /* ── Las tres fuentes, cada una por su cuenta ──────────────────────── */

  useEffect(() => {
    if (!ventana) return undefined;
    const control = new AbortController();

    setDiario({ cargando: true, error: null, datos: null });
    leerDiario({ desde: ventana.inicio, hasta: ventana.fin, limite: 100, signal: control.signal })
      .then((r) => setDiario({ cargando: false, error: null, datos: r }))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setDiario({ cargando: false, error: e, datos: null });
      });

    return () => control.abort();
  }, [ventana]);

  useEffect(() => {
    if (!ventana) return undefined;
    let vivo = true;

    setAlarmas({ cargando: true, error: null, datos: null });

    /*
     * Todas las alarmas del catálogo, no una: un turno se pregunta entero. Se
     * piden en paralelo y una que falle **no invalida las demás** — se cuenta
     * como fuente perdida y las otras se enseñan.
     */
    Promise.all(
      ALARMAS_HISTORIZABLES.map((clave) =>
        leerAlarmas(0, clave, { inicio: ventana.inicio, fin: ventana.fin })
          .then((r) => ({ clave, eventos: r.eventos ?? [] }))
          .catch(() => ({ clave, eventos: [], fallo: true }))
      )
    )
      .then((resultados) => {
        if (!vivo) return;
        const fallidas = resultados.filter((r) => r.fallo).length;
        const eventos = resultados.flatMap((r) =>
          r.eventos.map((e) => ({ ...e, clave: r.clave }))
        );
        eventos.sort((a, b) => b.inicio - a.inicio);
        setAlarmas({ cargando: false, error: null, datos: { eventos, fallidas } });
      })
      .catch((e) => vivo && setAlarmas({ cargando: false, error: e, datos: null }));

    return () => { vivo = false; };
  }, [ventana]);

  useEffect(() => {
    if (!ventana) return undefined;
    const control = new AbortController();

    setCasos({ cargando: true, error: null, datos: null });
    listarCasos({ signal: control.signal })
      .then((r) => {
        /*
         * `/api/casos` no acota por fecha —devuelve la bitácora entera— así que
         * el recorte es aquí. Un caso sin fecha legible NO se descarta: no se
         * sabe que esté fuera del turno, y esconderlo sería perder justo el que
         * alguien registró mal.
         */
        const dentro = (r?.casos ?? []).filter((c) => {
          const ms = c?.fecha ? new Date(c.fecha).getTime() : NaN;
          if (Number.isNaN(ms)) return true;
          return ms >= ventana.inicio.getTime() && ms <= ventana.fin.getTime();
        });
        setCasos({ cargando: false, error: null, datos: dentro });
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setCasos({ cargando: false, error: e, datos: null });
      });

    return () => control.abort();
  }, [ventana]);

  const refrescar = useCallback(() => setRecarga((n) => n + 1), []);

  /**
   * Los carriles de UNA máquina. Nada de aquí mezcla las dos.
   *
   * El diario no distingue máquina —hoy la única escritura sobre planta es la
   * bomba del tanque— así que sus entradas van al carril del tanque y en
   * vibraciones ese carril sale vacío, que es lo cierto: nadie ha accionado
   * nada ahí porque todavía no hay nada que accionar.
   */
  const carrilesDe = useCallback(
    (sistema) => {
      const esTanque = sistema === "tanque";

      return [
        {
          id: "acciones",
          etiqueta: traducir("maintenance:timeline.legend.actions"),
          color: t.accent,
          incompleto: Boolean(diario.error),
          hechos: esTanque
            ? (diario.datos?.entradas ?? [])
                .filter((e) => e.instante)
                .map((e) => ({ t: new Date(e.instante), titulo: e.accion ?? e.tipo ?? "—" }))
            : [],
        },
        {
          id: "alarmas",
          etiqueta: traducir("maintenance:timeline.legend.alarms"),
          color: t.amber,
          /*
           * Las nueve alarmas del catálogo son del TANQUE; vibraciones no tiene
           * ninguna declarada. El carril no está vacío por calma, está vacío
           * porque no hay nada que consultar — y eso se dice, no se pinta como
           * un eje tranquilo. Misma asimetría que llevó `USO-05` al Plan 26.
           */
          noAplica: !esTanque,
          incompleto: Boolean(alarmas.error) || (alarmas.datos?.fallidas ?? 0) > 0,
          hechos: esTanque
            ? (alarmas.datos?.eventos ?? []).map((e) => ({ t: e.inicio, titulo: e.clave }))
            : [],
        },
        {
          id: "casos",
          etiqueta: traducir("maintenance:timeline.legend.cases"),
          color: t.success,
          incompleto: Boolean(casos.error),
          // Un caso sin `sistema` es «de toda la planta» y sale en las dos.
          hechos: (casos.datos ?? [])
            .filter((c) => !c.sistema || c.sistema === sistema)
            .filter((c) => c.fecha && !Number.isNaN(new Date(c.fecha).getTime()))
            .map((c) => ({ t: new Date(c.fecha), titulo: c.sintoma ?? c.causa ?? "—" })),
        },
      ];
    },
    [diario, alarmas, casos, t, traducir]
  );

  const rotuloVentana = ventana
    ? ventana.configurado
      ? traducir(`maintenance:shift.names.${ventana.clave}`, {
          defaultValue: ventana.clave,
        })
      : traducir("maintenance:shift.lastHours", { n: HORAS_SIN_TURNOS })
    : "";

  const hayAlgo =
    (diario.datos?.entradas?.length ?? 0) > 0 ||
    (alarmas.datos?.eventos?.length ?? 0) > 0 ||
    (casos.datos?.length ?? 0) > 0 ||
    /*
     * Una alarma que no se pudo leer cuenta como «algo»: con esto fuera, un
     * historiador caído y un turno tranquilo daban el mismo mensaje final.
     */
    (alarmas.datos?.fallidas ?? 0) > 0;

  const todoCargado = !diario.cargando && !alarmas.cargando && !casos.cargando;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>
            {traducir("maintenance:shift.title")}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textSoft }}>
            {traducir("maintenance:shift.subtitle")}
          </p>
        </div>

        <button
          type="button"
          onClick={refrescar}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${t.border}`, background: t.hover,
            color: t.text, fontSize: 13, fontWeight: 600,
            minHeight: 44,
          }}
        >
          <RefreshCw size={15} />
          {traducir("common:actions.refresh")}
        </button>
      </header>

      {/*
        Qué ventana se está mirando, SIEMPRE a la vista. Una lista de hechos sin
        decir de qué horas es no se puede contrastar con nada.
      */}
      {ventana && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            padding: "10px 14px", borderRadius: 10,
            background: t.panel, border: `1px solid ${t.border}`,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{rotuloVentana}</span>
          <span style={{ fontSize: 12, color: t.textSoft }}>
            {ventana.inicio.toLocaleString()} — {ventana.fin.toLocaleString()}
          </span>
        </div>
      )}

      {/*
        Sin turnos configurados se DICE, y se nombra la variable. No es un
        detalle de despliegue escondido: mientras no esté, esta pantalla enseña
        una ventana arbitraria, y quien la lee tiene derecho a saberlo.
      */}
      {ventana && !ventana.configurado && (
        <AlertBanner
          type="info"
          title={traducir("maintenance:shift.noShifts.title")}
          message={traducir("maintenance:shift.noShifts.body", { variable: "IA_TURNOS" })}
        />
      )}

      {esSimulado && (
        <AlertBanner
          type="warning"
          title={traducir("maintenance:shift.simulated.title")}
          message={traducir("maintenance:shift.simulated.body")}
        />
      )}

      {/* ── 0 · La línea de tiempo, UNA POR MÁQUINA ────────────────────── */}
      {ventana && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel sub={traducir("maintenance:timeline.perMachine")}>
            {traducir("maintenance:timeline.title")}
          </SectionLabel>

          {/*
            Dos líneas separadas y NO un eje común, aunque quepan en la
            pantalla. `NO_COMPARTEN`: dos marcas alineadas en la misma vertical
            se leen como relacionadas aunque nadie lo diga, y estas dos máquinas
            tienen PLC distinto y no comparten nada.
          */}
          {SISTEMA_IDS.map((sistema) => (
            <div
              key={sistema}
              style={{
                background: t.panel, border: `1px solid ${t.border}`,
                borderRadius: 12, padding: 14,
                display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>
                {nombreSistema(sistema)}
              </h3>
              <LineaDeTiempo
                sistema={sistema}
                inicio={ventana.inicio}
                fin={ventana.fin}
                carriles={carrilesDe(sistema)}
              />
            </div>
          ))}
        </section>
      )}

      {/* ── 1 · Accionamientos ─────────────────────────────────────────── */}
      <Bloque
        t={t}
        icono={ClipboardList}
        titulo={traducir("maintenance:shift.actions.title")}
        estado={diario}
        mensajeDeError={mensajeDeError}
        vacio={traducir("maintenance:shift.actions.empty")}
        hay={(d) => d.entradas.length > 0}
      >
        {(d) => (
          <>
            {d.podas > 0 && (
              <p style={{ margin: "0 0 8px", fontSize: 12, color: t.amber }}>
                {traducir("maintenance:shift.actions.pruned")}
              </p>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {d.entradas.map((e, i) => (
                <li key={i} style={{ fontSize: 13, color: t.text, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>
                    {e.instante ? new Date(e.instante).toLocaleTimeString() : "—"}
                  </span>
                  <span style={{ fontWeight: 600 }}>{e.accion ?? e.tipo ?? "—"}</span>
                  {e.resultado && (
                    <span style={{ color: e.resultado === "cumplida" ? t.textSoft : t.amber }}>
                      {e.resultado}
                    </span>
                  )}
                  {e.usuario && <span style={{ color: t.textFaint }}>· {e.usuario}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloque>

      {/* ── 2 · Eventos de alarma ──────────────────────────────────────── */}
      <Bloque
        t={t}
        icono={Siren}
        titulo={traducir("maintenance:shift.alarms.title")}
        estado={alarmas}
        mensajeDeError={mensajeDeError}
        vacio={traducir("maintenance:shift.alarms.empty")}
        /*
         * `fallidas > 0` cuenta como «hay algo que enseñar» aunque no haya ni un
         * evento, y no es un detalle: sin eso, que fallaran TODAS las alarmas se
         * pintaba como «ninguna alarma entró en esta ventana». Es decir, un
         * historiador caído se leía como un turno limpio — §2.4 exactamente.
         * Lo destapó la prueba de la lista incompleta.
         */
        hay={(d) => d.eventos.length > 0 || d.fallidas > 0}
      >
        {(d) => (
          <>
            {d.fallidas > 0 && (
              <p style={{ margin: "0 0 8px", fontSize: 12, color: t.amber }}>
                {traducir("maintenance:shift.alarms.partial", { n: d.fallidas })}
              </p>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {d.eventos.map((e, i) => (
                <li key={i} style={{ fontSize: 13, color: t.text, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>
                    {e.inicio.toLocaleTimeString()}
                  </span>
                  <span style={{ fontWeight: 600 }}>{e.clave}</span>
                  {e.activa && (
                    <span style={{ color: t.amber }}>{traducir("alarms:history.stillActive")}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloque>

      {/* ── 3 · Casos cerrados ─────────────────────────────────────────── */}
      <Bloque
        t={t}
        icono={NotebookPen}
        titulo={traducir("maintenance:shift.cases.title")}
        estado={casos}
        mensajeDeError={mensajeDeError}
        vacio={traducir("maintenance:shift.cases.empty")}
        hay={(d) => d.length > 0}
      >
        {(d) => (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {d.map((c) => (
              <li key={c.id} style={{ fontSize: 13, color: t.text, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>
                  {c.fecha ? new Date(c.fecha).toLocaleTimeString() : "—"}
                </span>
                <span style={{ flex: 1, minWidth: 180 }}>{c.sintoma ?? c.causa ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      {/*
        Un turno sin NADA se dice una vez, entero — tres bloques vacíos seguidos
        se leen como una pantalla rota. Sólo cuando las tres fuentes llegaron:
        con alguna todavía cargando, esto mentiría.
      */}
      {todoCargado && !hayAlgo && !diario.error && !alarmas.error && !casos.error && (
        <p style={{ margin: 0, fontSize: 13, color: t.textSoft, textAlign: "center" }}>
          {traducir("maintenance:shift.quiet")}
        </p>
      )}
    </div>
  );
}

/**
 * Un bloque con su estado propio.
 *
 * Existe para que los tres se comporten IGUAL ante un fallo: cargando, error
 * traducido, vacío declarado o contenido — nunca un bloque en blanco que se
 * pueda confundir con «no pasó nada».
 */
function Bloque({ t, icono: Icono, titulo, estado, mensajeDeError, vacio, hay, children }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icono size={15} />
          {titulo}
        </span>
      </SectionLabel>

      <div
        style={{
          background: t.panel, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 14,
        }}
      >
        {estado.cargando ? (
          <p style={{ margin: 0, fontSize: 13, color: t.textFaint }}>…</p>
        ) : estado.error ? (
          /*
           * El error se ENSEÑA, al revés que en `CasosPrevios`: allí era una
           * consulta auxiliar sobre contenido que ya estaba; aquí es el
           * contenido. Callarlo dejaría un bloque vacío indistinguible de un
           * turno tranquilo.
           *
           * `mensajeDeError` devuelve `{ titulo, detalle, accion }` — el título
           * lo elige el CÓDIGO del puente, y el detalle es lo que dijo el
           * servidor. Se pintan los dos: el segundo es lo que permite arreglarlo.
           */
          <ErrorDelBloque t={t} fallo={mensajeDeError(estado.error)} />
        ) : estado.datos && hay(estado.datos) ? (
          children(estado.datos)
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: t.textFaint }}>{vacio}</p>
        )}
      </div>
    </section>
  );
}

/** El fallo de un bloque, con lo que hace falta para arreglarlo. */
function ErrorDelBloque({ t, fallo }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13, color: t.amber }}>
      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ margin: 0 }}>{fallo.titulo}</p>
        {fallo.detalle && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: t.textSoft }}>{fallo.detalle}</p>
        )}
        {fallo.accion && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: t.textSoft }}>{fallo.accion}</p>
        )}
      </div>
    </div>
  );
}
