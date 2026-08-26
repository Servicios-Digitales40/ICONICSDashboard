/**
 * Vista «Vibraciones» — el estado mecánico del SEGUNDO sistema.
 *
 * ── POR QUÉ ES UNA PANTALLA APARTE Y NO UNA SECCIÓN DE «RIESGOS» ───
 *
 * Porque son DOS MÁQUINAS DISTINTAS. «Riesgos» habla del tanque y su grupo de
 * bombeo; esto habla de otro motor, con otro variador y otro PLC. Ponerlas
 * juntas invita a leerlas juntas, y la primera correlación que alguien sacara
 * —«sube la vibración cuando sube el caudal»— uniría dos instalaciones que no
 * se tocan. La separación física del código es lo que evita esa frase.
 *
 * ── LAS TRES COSAS QUE ESTA PANTALLA TIENE QUE DEJAR CLARAS ────────
 *
 *   1. QUÉ SE MIDE      los tres apoyos, con su número y su unidad
 *   2. QUÉ SE DEDUCE    los riesgos, con la evidencia separada de la hipótesis
 *   3. QUÉ NO SE MIRÓ   las reglas que no se pudieron evaluar, y por qué
 *
 * La tercera es la que evita el fallo caro. Esta máquina se apagó el 26-08-2026
 * a las 13:10:31 y quince de veintiún puntos dejaron de entregar valor: una
 * pantalla que sólo enseñara «0 riesgos activos» habría estado en verde sobre
 * una máquina de la que no sabía nada.
 *
 * ── LO QUE ESTA PANTALLA NO PUEDE DECIR TODAVÍA ────────────────────
 *
 * Ninguna tendencia. El grupo `DEMO 3` del historiador empezó a registrar el
 * 26-08-2026 y la configuración aún se estaba moviendo mientras se medía, así
 * que aquí sigue habiendo sólo el instante. «El aRMS lleva semanas subiendo»
 * es justo la frase que no se puede escribir, y la cabecera lo dice EN
 * PANTALLA y no sólo en este comentario.
 *
 * La cuarta cosa que la pantalla deja clara, y que no estaba al principio:
 *
 *   4. QUÉ NO SE VIGILA   `TablaVigilancias`. Los números salen igual de
 *                         verdes con la vigilancia encendida o apagada, así
 *                         que lo apagado sólo se ve si se enseña aparte.
 */
import { Fragment, useMemo } from "react";
import {
  Activity, AlertTriangle, BellRing, HelpCircle, Info, MessageSquareText, WifiOff,
} from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { pedirAlAsistente } from "@/features/asistente";
import { useTheme } from "@/theme";

import { UltimaLectura } from "../components/base.jsx";
import { useVibracion } from "../data/vibracion.js";
import {
  evaluarRiesgosVibracion, preguntaSobreRiesgoVibracion,
} from "../domain/riesgosVibracion.js";
import {
  AREA_ALARMAS, CANALES, CONTADORES_ALARMA, LIMITES_ISO, MEDIDAS, VIGILANCIAS,
  bandaISO,
} from "../domain/vibraciones.js";

/* ── Presentación ──────────────────────────────────────────────────── */

/**
 * Cada nivel con su token de color y su icono.
 *
 * `informativo` usa el acento y no el ámbar a propósito: «la máquina gira sin
 * carga» no es un problema, es un hecho que cambia lo que significan las demás
 * medidas. Pintarlo de ámbar junto a un riesgo real enseña a ignorar el ámbar.
 */
const NIVELES = {
  critico: { label: "Puede romper algo", token: "coral", suave: "coralSoft", Icono: AlertTriangle },
  atencion: { label: "Conviene mirarlo", token: "amber", suave: "amberSoft", Icono: AlertTriangle },
  informativo: { label: "Para tenerlo en cuenta", token: "accent", suave: "accentSoft", Icono: Info },
};

const nivelInfo = (key) => NIVELES[key] ?? NIVELES.informativo;

/**
 * Token de color de una zona de ISO 10816-1 Clase I.
 *
 * La ZONA la resuelve `bandaISO` en el catálogo, que es el único sitio donde
 * vive ese criterio: aquí sólo se decide de qué color se pinta. Antes esta
 * vista tenía su propia copia de la comparación, y dos copias de un umbral son
 * dos umbrales en cuanto alguien toca uno.
 */
const COLOR_ZONA = { D: "coral", C: "amber", B: "text", A: "success" };

const fmt = (v, dec) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(dec);

/* ── Piezas ────────────────────────────────────────────────────────── */

/** Una línea rotulada dentro de una tarjeta. */
function Campo({ t, rotulo, destacado = false, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          textTransform: "uppercase", color: t.textFaint, marginBottom: 3,
        }}
      >
        {rotulo}
      </div>
      <p
        style={{
          margin: 0, fontSize: 13, lineHeight: 1.5,
          color: destacado ? t.text : t.textSoft,
          fontWeight: destacado ? 600 : 400,
        }}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * Un apoyo, con sus cuatro medidas.
 *
 * Se pintan las cuatro aunque falten: un hueco con un guión dice «esto no está
 * llegando», y esconder la fila diría «esto no existe». No es lo mismo, y la
 * diferencia importa cuando alguien intenta averiguar por qué la pantalla
 * está tan tranquila.
 */
function TarjetaApoyo({ canal, datos, normaAplicable, t }) {
  const banda = bandaISO(datos?.vRMS, normaAplicable);

  return (
    <article
      style={{
        background: t.panel, border: `1px solid ${t.border}`,
        borderRadius: 12, padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <header>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>
          {canal.label}
        </h3>
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 3 }}>
          {canal.id} · {canal.equipo}
          {canal.rodamiento ? ` · rodamiento ${canal.rodamiento}` : ""}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {MEDIDAS.map((m) => {
          const v = datos?.[m.key];
          const esVelocidad = m.key === "vRMS";
          const color = esVelocidad && banda ? t[COLOR_ZONA[banda.zona]] : t.text;
          return (
            <div key={m.key}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: t.textFaint }}>
                {m.corto.toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>
                {fmt(v, m.decimales)}
                <span style={{ fontSize: 12, fontWeight: 500, color: t.textFaint, marginLeft: 4 }}>
                  {m.unidad}
                </span>
              </div>
              {esVelocidad && banda && (
                <div style={{ fontSize: 10, color: t[COLOR_ZONA[banda.zona]], marginTop: 2 }}>{banda.label}</div>
              )}
            </div>
          );
        })}
      </div>

      {/*
        La sensibilidad no es adorno: el módulo divide por ella. Un canal cuya
        sonda nadie ha declarado lleva sus lecturas escaladas por un número
        supuesto, y eso tiene que verse aquí y no sólo en el código.
      */}
      <div style={{ fontSize: 11, color: canal.sensibilidad === null ? t.amber : t.textFaint }}>
        {canal.sensibilidad === null
          ? "Sensibilidad de esta sonda sin confirmar — sus lecturas dependen de ella."
          : `Sensibilidad ${canal.sensibilidad} mV/g`}
      </div>
    </article>
  );
}

/** Una tarjeta de riesgo. Evidencia primero: el hecho antes que la deducción. */
function TarjetaRiesgo({ riesgo, t }) {
  const nivel = nivelInfo(riesgo.nivel);
  const { Icono } = nivel;

  return (
    <article
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${t[nivel.token]}`,
        borderRadius: 12, padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icono size={18} color={t[nivel.token]} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>
            {riesgo.titulo}
          </h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <span
              style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                color: t[nivel.token], background: t[nivel.suave],
              }}
            >
              {nivel.label}
            </span>
            {riesgo.canalLabel && (
              <span
                style={{
                  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  color: t.textSoft, background: t.hover,
                }}
              >
                {riesgo.canalLabel}
              </span>
            )}
          </div>
        </div>
      </header>

      <Campo t={t} rotulo="Medido" destacado>{riesgo.evidencia}</Campo>
      <Campo t={t} rotulo="Puede ocurrir">{riesgo.consecuencia}</Campo>
      <Campo t={t} rotulo="Qué revisar">{riesgo.accion}</Campo>

      {riesgo.norma && (
        <p style={{ margin: 0, fontSize: 11, color: t.textFaint, fontStyle: "italic" }}>
          Criterio: {riesgo.norma}
        </p>
      )}

      {/*
        Advertencia sobre la LECTURA del dato, no sobre la máquina. Va dentro de
        la tarjeta y con su propio color: un veredicto apoyado en un estado que
        hemos deducido y no confirmado se lee con más autoridad de la que tiene
        si esto se queda en un comentario del código.
      */}
      {riesgo.nota && (
        <p
          style={{
            margin: 0, fontSize: 11, lineHeight: 1.5, color: t.amber,
            background: t.amberSoft, borderRadius: 6, padding: "6px 10px",
          }}
        >
          {riesgo.nota}
        </p>
      )}

      <button
        type="button"
        onClick={() => pedirAlAsistente(preguntaSobreRiesgoVibracion(riesgo))}
        style={{
          display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
          padding: "8px 14px", borderRadius: 8, cursor: "pointer",
          border: `1px solid ${t.border}`, background: t.hover,
          color: t.text, fontSize: 13, fontWeight: 600,
        }}
      >
        <MessageSquareText size={15} />
        Preguntarle a Tdconcito
      </button>
    </article>
  );
}

/**
 * Qué vigila el módulo en cada apoyo, y qué no.
 *
 * ── POR QUÉ ESTA TABLA MERECE SITIO EN LA PANTALLA ─────────────────
 *
 * Porque es la única forma de ver lo que NO se está mirando. Los números de
 * arriba salen igual de verdes tenga el módulo la vigilancia encendida o
 * apagada: una velocidad eficaz de 0,16 mm/s se pinta idéntica si alguien la
 * compara con un límite y si no la compara con nada.
 *
 * Las tres filas de rodamiento son las que de verdad diagnostican: no dicen
 * «esto vibra más», dicen «la pista exterior está picada». Y estaban apagadas
 * en los tres canales.
 */
function TablaVigilancias({ canales, t }) {
  const color = (e) =>
    e === null ? t.textFaint
      : e.id === "ok" ? t.success
        : e.id === "apagado" ? t.amber
          : t.coral;

  const simbolo = (e) =>
    e === null ? "—" : e.id === "ok" ? "vigilado" : e.id === "apagado" ? "APAGADO" : e.label;

  const grupos = [
    ["Contra su umbral", VIGILANCIAS.filter((v) => v.grupo === "umbral")],
    ["Forma del espectro", VIGILANCIAS.filter((v) => v.grupo === "espectro")],
    ["Defectos de rodamiento", VIGILANCIAS.filter((v) => v.grupo === "rodamiento")],
  ];

  return (
    <div
      style={{
        background: t.panel, border: `1px solid ${t.border}`,
        borderRadius: 12, padding: 16, overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 420 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px", color: t.textFaint, fontWeight: 700 }} />
            {CANALES.map((c) => (
              <th
                key={c.id}
                style={{
                  textAlign: "left", padding: "4px 8px", color: t.textFaint,
                  fontWeight: 700, fontSize: 10, letterSpacing: "0.06em",
                }}
              >
                {c.label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map(([titulo, filas]) => (
            <Fragment key={titulo}>
              <tr>
                <td
                  colSpan={CANALES.length + 1}
                  style={{
                    padding: "12px 8px 4px", fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.06em", textTransform: "uppercase", color: t.textFaint,
                  }}
                >
                  {titulo}
                </td>
              </tr>
              {filas.map((v) => (
                <tr key={v.key}>
                  <td style={{ padding: "4px 8px", color: t.textSoft }}>{v.label}</td>
                  {CANALES.map((c) => {
                    const e = canales?.[c.id]?.vigilancias?.[v.key] ?? null;
                    return (
                      <td key={c.id} style={{ padding: "4px 8px", color: color(e), fontWeight: 600 }}>
                        {simbolo(e)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * El servidor de alarmas de ICONICS, que NO es lo mismo que `Alarma_Sn`.
 *
 * `Alarma_Sn` y `Warning_Sn` son dos booleanos del PLC. Esto es AlarmWorX, con
 * 57 alarmas configuradas bajo el área «DEMO VIBRACIONES» por quien conoce el
 * proceso. Mandan sobre todo lo que deduce esta pantalla.
 *
 * Sólo se pintan CUÁNTAS hay, porque es lo único que la API expone: el estado
 * alarma por alarma devuelve calidad mala. El pie lo dice, en vez de dejar que
 * el número parezca saber más de lo que sabe.
 */
function PanelAlarmas({ alarmas, t }) {
  const hayAlgo = CONTADORES_ALARMA.some((a) => (alarmas?.[a.key] ?? 0) > 0);

  return (
    <div
      style={{
        background: t.panel, border: `1px solid ${t.border}`,
        borderRadius: 12, padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BellRing size={16} color={t.textFaint} />
        <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
          Servidor de alarmas de ICONICS
        </span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {CONTADORES_ALARMA.map((a) => {
          const v = alarmas?.[a.key];
          const encendido = Number.isFinite(v) && v > 0;
          /* El color sale del NIVEL declarado en el catálogo, no de si el
             número es mayor que cero: doce alarmas que ya volvieron a normal
             no son un problema activo y no pueden pintarse como si lo fueran. */
          const color = !encendido ? t.textFaint
            : a.nivel === "critico" ? t.coral
              : a.nivel === "atencion" ? t.amber
                : t.textSoft;
          return (
            <div key={a.key}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: t.textFaint }}>
                {a.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>
                {Number.isFinite(v) ? v : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: t.textFaint }}>
        {hayAlgo
          ? "Estas alarmas las emite ICONICS, no esta pantalla, y mandan sobre lo que se concluya aquí. "
          : "Sin alarmas pendientes en el área. "}
        Se leen los contadores de <code>{AREA_ALARMAS}</code>: cuál de las 57 alarmas
        configuradas es cada una no se puede saber desde aquí — hay que abrir el visor
        de ICONICS.
      </p>
    </div>
  );
}

/* ── Vista ─────────────────────────────────────────────────────────── */

function VibracionesEva() {
  const { theme: t } = useTheme();
  const { canales, variador, alarmas, loading, error, lastUpdated, puntosSinDato, puntosPedidos } =
    useVibracion();

  const res = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas],
  );

  /*
   * «Nada que decir» y «nadie ha contestado» se ven igual si sólo se cuentan
   * los riesgos activos. Esto separa las dos, y es la razón de que el hook
   * devuelva la lista de puntos sin lectura.
   */
  const mudos = puntosSinDato?.length ?? 0;
  const totalPuntos = puntosPedidos ?? 0;
  const casiTodoMudo = totalPuntos > 0 && mudos > totalPuntos / 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <AlertBanner
        type="info"
        title="Otra máquina, y sin histórico"
        message={
          "Estos sensores están en el sistema de vibraciones, que tiene su propio motor, " +
          "su propio variador y su propio PLC. No comparte nada con el tanque. " +
          "El historiador acaba de empezar a guardar estos tags, pero todavía no se " +
          "usan sus series: aquí sólo se ve el instante, sin tendencias ni pronóstico " +
          "de desgaste."
        }
      />

      {error && (
        <AlertBanner type="error" title="No se pudo leer el módulo" message={error} />
      )}

      {casiTodoMudo && !loading && (
        <AlertBanner
          type="warning"
          title="La máquina no está contestando"
          message={
            `${mudos} de ${totalPuntos} puntos no entregan lectura ahora mismo. ` +
            "Cuando el variador se apaga deja de publicar la velocidad, y sin velocidad " +
            "el módulo no puede calcular la velocidad eficaz: se pierden todos los vRMS " +
            "y sobreviven la aceleración y el pico, que se miden sin conocer el régimen. " +
            "Lo que se vea abajo no describe una máquina tranquila: describe una máquina callada."
          }
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SectionLabel>Los tres apoyos</SectionLabel>
        <UltimaLectura fecha={lastUpdated} t={t} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {CANALES.map((c) => (
          <TarjetaApoyo
            key={c.id}
            canal={c}
            datos={canales?.[c.id]}
            normaAplicable={res.normaAplicable}
            t={t}
          />
        ))}
      </div>

      {/* El variador, porque sin él no se sabe si las medidas de arriba valen. */}
      <div
        style={{
          background: t.panel, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 16,
          display: "flex", gap: 24, flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: t.textFaint }}>
            VELOCIDAD
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text }}>
            {fmt(variador?.velocidad, 0)}
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textFaint, marginLeft: 4 }}>rpm</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: t.textFaint }}>
            FRECUENCIA
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text }}>
            {fmt(variador?.frecuencia, 2)}
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textFaint, marginLeft: 4 }}>Hz</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: t.textFaint }}>
            PAR
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: t.text }}>
            {fmt(variador?.par, 2)}
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textFaint, marginLeft: 4 }}>%</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200, alignSelf: "center", fontSize: 11, color: t.textFaint }}>
          {res.normaAplicable === true
            ? "A este régimen ISO 10816 se pronuncia sobre la velocidad eficaz."
            : res.normaAplicable === false
              ? "A este régimen ISO 10816 no se pronuncia: las lecturas de vRMS salen bajas por construcción."
              : "Sin velocidad no se sabe si ISO 10816 aplica, así que no se juzga."}
        </div>
      </div>

      <PanelAlarmas alarmas={alarmas} t={t} />

      <SectionLabel>Qué vigila el módulo</SectionLabel>
      <TablaVigilancias canales={canales} t={t} />

      <SectionLabel>
        {res.activos.length > 0
          ? `${res.activos.length} riesgo${res.activos.length === 1 ? "" : "s"} activo${res.activos.length === 1 ? "" : "s"}`
          : "Sin riesgos activos"}
      </SectionLabel>

      {res.activos.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {res.activos.map((r) => (
            <TarjetaRiesgo key={`${r.id}-${r.canal ?? "maquina"}`} riesgo={r} t={t} />
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: t.textSoft }}>
          {res.evaluadas > 0
            ? `Se comprobaron ${res.evaluadas} reglas y ninguna se cumple.`
            : "No se pudo comprobar ninguna regla: no hay lecturas con las que evaluar."}
        </p>
      )}

      {/*
        La zona que casi ningún panel tiene. Sin ella, una pantalla en verde y
        una pantalla ciega se ven exactamente igual.
      */}
      {res.noEvaluables.length > 0 && (
        <>
          <SectionLabel>
            {res.noEvaluables.length} sin comprobar
          </SectionLabel>
          <div
            style={{
              background: t.panel, border: `1px solid ${t.border}`,
              borderRadius: 12, padding: 16,
              display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            {res.noEvaluables.map((n, i) => (
              <div key={`${n.id}-${n.canal ?? "maquina"}-${i}`} style={{ display: "flex", gap: 10 }}>
                {mudos > 0 ? (
                  <WifiOff size={15} color={t.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <HelpCircle size={15} color={t.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
                    {n.titulo}
                    {n.canalLabel && (
                      <span style={{ fontWeight: 400, color: t.textFaint }}> · {n.canalLabel}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: t.textSoft }}>{n.porque}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ margin: 0, fontSize: 11, color: t.textFaint, display: "flex", gap: 6, alignItems: "center" }}>
        <Activity size={13} />
        Los límites de velocidad eficaz son los de ISO 10816-1 Clase I
        ({LIMITES_ISO.nueva} / {LIMITES_ISO.aviso} / {LIMITES_ISO.alarma} mm/s), que es la
        tabla de máquinas hasta 15 kW. Este motor son 1,5 kW.
      </p>
    </div>
  );
}

export default VibracionesEva;
