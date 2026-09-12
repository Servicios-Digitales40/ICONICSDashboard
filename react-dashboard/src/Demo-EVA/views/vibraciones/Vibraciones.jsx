/**
 * Vista «Gráficas» del sistema de vibraciones — su estado mecánico.
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
import { useTranslation } from "react-i18next";
import { Activity, BellRing } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { Enfasis } from "@/i18n";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useTheme } from "@/theme";

import { UltimaLectura } from "../../components/base.jsx";
import { useVibracion } from "../../data/vibraciones/vibracion.js";
import { evaluarRiesgosVibracion } from "../../domain/riesgosVibracion.js";
import {
  AREA_ALARMAS, CANALES, CONTADORES_ALARMA, LIMITES_ISO, MEDIDAS, VIGILANCIAS,
  bandaISO,
} from "../../domain/vibraciones.js";

/* ── Presentación ──────────────────────────────────────────────────── */

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

/**
 * Un apoyo, con sus cuatro medidas.
 *
 * Se pintan las cuatro aunque falten: un hueco con un guión dice «esto no está
 * llegando», y esconder la fila diría «esto no existe». No es lo mismo, y la
 * diferencia importa cuando alguien intenta averiguar por qué la pantalla
 * está tan tranquila.
 */
function TarjetaApoyo({ canal, datos, normaAplicable, t }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "navigation", "dashboard", "errors"]);
  const { canal: canalTexto, medida: medidaTexto, zonaIso } = useDominio();
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
          {canalTexto(canal.id)}
        </h3>
        {/*
          El id del apoyo y el nombre del equipo son IDENTIFICADORES del
          servidor —el sufijo del tag y el nombre en AssetWorX—: van tal cual
          en los dos idiomas. El modelo de rodamiento («6205 ZZ») también: es
          una referencia de catálogo, no una palabra.
        */}
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 3 }}>
          {canal.id} · {canal.equipo}
          {canal.rodamiento
            ? ` · ${traducir("machines:vibration.bearing", { modelo: canal.rodamiento })}`
            : ""}
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
                {medidaTexto(m.key, "corto").toUpperCase()}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>
                {fmt(v, m.decimales)}
                <span style={{ fontSize: 12, fontWeight: 500, color: t.textFaint, marginLeft: 4 }}>
                  {m.unidad}
                </span>
              </div>
              {esVelocidad && banda && (
                <div style={{ fontSize: 10, color: t[COLOR_ZONA[banda.zona]], marginTop: 2 }}>
                  {zonaIso(banda.zona, banda.label)}
                </div>
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
          ? traducir("machines:vibration.probeUnconfirmed")
          : traducir("machines:vibration.sensitivity", { valor: canal.sensibilidad })}
      </div>
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
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "navigation", "dashboard", "errors"]);
  const { canal: canalTexto, vigilancia, estadoVigilancia } = useDominio();
  const color = (e) =>
    e === null ? t.textFaint
      : e.id === "ok" ? t.success
        : e.id === "apagado" ? t.amber
          : t.coral;

  /*
   * El estado de una vigilancia. Los dos casos habituales tienen su propia
   * palabra corta —«vigilado», «APAGADO»— porque en una celda de tabla no cabe
   * «Vigilado y en orden»; los otros dos (aviso y alarma) sí van con el
   * rótulo del catálogo, ahora traducido en vez de leído de `shared/`.
   */
  const simbolo = (e) => {
    if (e === null) return traducir("machines:vibration.watch.none");
    if (e.id === "ok") return traducir("machines:vibration.watch.watched");
    if (e.id === "apagado") return traducir("machines:vibration.watch.off");
    return estadoVigilancia(e.id, e.label);
  };

  const grupos = [
    [traducir("machines:vibration.watch.threshold"), VIGILANCIAS.filter((v) => v.grupo === "umbral")],
    [traducir("machines:vibration.watch.spectrum"), VIGILANCIAS.filter((v) => v.grupo === "espectro")],
    [traducir("machines:vibration.watch.bearing"), VIGILANCIAS.filter((v) => v.grupo === "rodamiento")],
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
                {canalTexto(c.id).toUpperCase()}
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
                  <td style={{ padding: "4px 8px", color: t.textSoft }}>{vigilancia(v.key)}</td>
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
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "navigation", "dashboard", "errors"]);
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
          {traducir("machines:vibration.alarmServer")}
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
          ? traducir("machines:vibration.alarms.fromIconics")
          : traducir("machines:vibration.alarms.none")}
        <Enfasis>{traducir("machines:vibration.alarmCounters", { area: AREA_ALARMAS })}</Enfasis>
      </p>
    </div>
  );
}

/* ── Vista ─────────────────────────────────────────────────────────── */

function Vibraciones() {
  /* El código del puente elige la frase; el detalle va debajo. Ver `@/i18n`. */
  const mensajeDeError = useMensajeDeError();
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["machines", "navigation", "dashboard", "errors"]);
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
        title={traducir("machines:vibration.otherMachine.title")}
        /*
          La MISMA clave que pinta «Inicio · Vibraciones»: es el mismo aviso
          sobre la misma máquina, y tenerlo dos veces escrito es tenerlo dos
          veces que corregir. Aquí estuvo a mano en español hasta el
          09-09-2026, y el verificador de textos no lo veía porque sólo miraba
          `atributo="…"` y no `atributo={"…"}`; ahora mira los dos.
        */
        message={<Enfasis>{traducir("machines:vibration.otherMachineNote")}</Enfasis>}
      />

      {error && (
        <AlertBanner
          type="error"
          title={traducir("errors:titles.moduleReadFailed")}
          message={mensajeDeError(error).titulo}
          detalle={mensajeDeError(error).detalle}
          accion={mensajeDeError(error).accion}
        />
      )}

      {casiTodoMudo && !loading && (
        <AlertBanner
          type="warning"
          title={traducir("machines:vibration.silent.title")}
          message={traducir("machines:vibration.silent.message", { mudos, total: totalPuntos })}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SectionLabel>{traducir("machines:vibration.threeSupports")}</SectionLabel>
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

      <SectionLabel>{traducir("machines:vibration.watchesTitle")}</SectionLabel>
      <TablaVigilancias canales={canales} t={t} />

      {/*
        Los riesgos que se deducen de estas medidas viven en su PROPIA
        pantalla desde que el sistema de vibraciones se separó de la estación
        de llenado en el sidebar. Se quedaron fuera de aquí y no duplicados
        porque son dos preguntas distintas —qué mide la máquina y qué se
        deduce de ello—, y tenerlas en dos sitios haría que la de aquí se
        quedara vieja en cuanto alguien tocara la otra.
      */}
      <p style={{ margin: 0, fontSize: 11, color: t.textFaint, display: "flex", gap: 6, alignItems: "center" }}>
        <Activity size={13} />
        Los límites de velocidad eficaz son los de ISO 10816-1 Clase I
        ({LIMITES_ISO.nueva} / {LIMITES_ISO.aviso} / {LIMITES_ISO.alarma} mm/s), que es la
        tabla de máquinas hasta 15 kW. Este motor son 1,5 kW.
      </p>
    </div>
  );
}

export default Vibraciones;
