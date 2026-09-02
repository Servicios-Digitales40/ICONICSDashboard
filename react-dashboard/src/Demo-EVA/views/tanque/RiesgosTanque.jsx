/**
 * Vista «Riesgos» — qué puede pasar, dado cómo está la instalación ahora.
 *
 * ── LA PREGUNTA QUE CONTESTA ───────────────────────────────────────
 *
 * «Planta» contesta *qué está pasando*. Esta contesta *qué puede pasar si esto
 * sigue así*, que es la que hace que alguien se levante de la silla antes de
 * que suene una alarma.
 *
 * El cruce lo hace `@shared/eva/tanque/riesgos.js` en código determinista. Aquí sólo
 * se pinta: esta vista no decide nada sobre la instalación.
 *
 * ── LAS TRES ZONAS, Y POR QUÉ SON TRES ─────────────────────────────
 *
 *   1. Riesgos activos     lo que se cumple ahora, lo grave primero
 *   2. Sin riesgo          cuántas reglas se comprobaron y salieron limpias
 *   3. No evaluables       las que NO se pudieron mirar, y qué lectura faltó
 *
 * La tercera es la que casi ningún panel tiene y la que evita el peor fallo
 * posible: una pantalla en verde porque falta la lectura del nivel. Verde y
 * «no lo pude mirar» son cosas distintas, y aquí se pintan distinto.
 *
 * ── LO QUE ESTA PANTALLA NO ES ─────────────────────────────────────
 *
 * No es el panel de alarmas. Las alarmas de la instalación están en el
 * servidor, con límites puestos por quien conoce el proceso, y mandan sobre
 * esto. Aquí se anticipan combinaciones que TODAVÍA no han disparado ninguna.
 * La cabecera lo dice en pantalla, no sólo en este comentario.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, HelpCircle, Info, MessageSquareText,
  TrendingDown, TrendingUp, Minus,
} from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { pedirAlAsistente } from "@/features/asistente";
import { useTheme } from "@/theme";

import { useSeriesHistoricas, useSistemaAgua } from "../../data/comunes/hooks.js";
import { MAX_PUNTOS } from "../../data/tanque/historia.js";
import { evaluarPronostico, preguntaSobrePronostico } from "../../domain/pronostico.js";
import { evaluarRiesgos, preguntaSobreRiesgo } from "../../domain/riesgos.js";
import { PROVISIONALES } from "../../domain/umbrales.js";
import { UltimaLectura } from "../../components/base.jsx";

/* ── El pronóstico ─────────────────────────────────────────────────── */

/**
 * Las señales que alimentan el pronóstico.
 *
 * Todas tienen serie PROPIA verificada en el historiador (ver `senales.js`).
 * `cargaMotor` NO está y no puede estar: el historiador devuelve ahí la curva
 * de la temperatura del tanque sin dar error, así que su mecanismo aparecerá
 * siempre en «sin comprobar» — que es exactamente lo que hace visible que
 * falta configurar el `Historical data source` de ese tag.
 */
const SENALES_PRONOSTICO = [
  "nivelTanque", "temperaturaTanque", "presionRelativa", "tensionLinea", "flujoInstantaneo",
];

/*
 * La lista que se pasa mientras el pronóstico no se ha pedido. Es una
 * constante de módulo, y no un `[]` escrito en la llamada, porque el hook
 * memoiza por `claves.join("|")`: un arreglo nuevo en cada render daría la
 * misma clave pero volvería a entrar en el efecto sin necesidad.
 */
const VACIO = [];

/**
 * Períodos ofrecidos, con la resolución que cada uno consigue de verdad.
 *
 * `resolucion` no es decorativa: el puente entrega como mucho `MAX_PUNTOS`
 * muestras por petición y el agregado es `Average`, así que cada muestra es la
 * media de ese intervalo. Un episodio más corto que él se promedia y no se ve.
 * Por eso el número va IMPRESO en la pantalla y no escondido en el código:
 * quien lea «0 horas» tiene que saber a partir de qué duración deja de contar.
 */
const PERIODOS = [
  { horas: 24 * 7, label: "7 días" },
  { horas: 24 * 30, label: "30 días" },
  { horas: 24 * 90, label: "90 días" },
].map((p) => ({ ...p, puntos: MAX_PUNTOS, resolucion: p.horas / MAX_PUNTOS }));

/** "1.7" → "1 h 42 min", que es como se lee un intervalo. */
function duracion(horas) {
  const h = Math.floor(horas);
  const min = Math.round((horas - h) * 60);
  if (h === 0) return `${min} min`;
  return min === 0 ? `${h} h` : `${h} h ${min} min`;
}

const TENDENCIAS = {
  empeorando: { label: "Empeorando", token: "coral", Icono: TrendingUp },
  mejorando: { label: "Mejorando", token: "success", Icono: TrendingDown },
  estable: { label: "Estable", token: "textSoft", Icono: Minus },
  "sin determinar": { label: "Sin tendencia", token: "textFaint", Icono: Minus },
};

/* ── Vocabulario visual ────────────────────────────────────────────── */

/**
 * Cada severidad con su token de color y su icono.
 *
 * `informativo` usa el acento y no el ámbar a propósito: «el variador está en
 * Manual» no es un problema, es un hecho que cambia quién protege la
 * instalación. Pintarlo de ámbar junto a un riesgo real enseña a ignorar el
 * ámbar, que es exactamente lo que no se quiere en una pantalla de avisos.
 */
const SEVERIDADES = {
  critico: { label: "Puede romper algo", token: "coral", suave: "coralSoft", Icono: AlertTriangle },
  atencion: { label: "Conviene mirarlo", token: "amber", suave: "amberSoft", Icono: AlertTriangle },
  informativo: { label: "Para tenerlo en cuenta", token: "accent", suave: "accentSoft", Icono: Info },
};

const severidadInfo = (key) => SEVERIDADES[key] ?? SEVERIDADES.informativo;

/* ── Piezas ────────────────────────────────────────────────────────── */

/**
 * Una tarjeta de riesgo.
 *
 * El orden de lectura no es decorativo: **evidencia primero**. Quien mira esto
 * necesita ver la cifra medida antes que nuestra interpretación de la cifra,
 * porque la cifra es el hecho y lo demás es deducción nuestra. Invertirlo haría
 * que la hipótesis llegara con la autoridad de un dato.
 */
function TarjetaRiesgo({ riesgo, t, onNavigate }) {
  const sev = severidadInfo(riesgo.severidad);
  const { Icono } = sev;

  return (
    <article
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        // El canto de color es lo único que distingue una severidad de otra a
        // un metro de distancia, que es desde donde se mira un tablero.
        borderLeft: `4px solid ${t[sev.token]}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icono size={18} color={t[sev.token]} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>
            {riesgo.titulo}
          </h3>
          <span
            style={{
              display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 999,
              fontSize: 11, fontWeight: 600, color: t[sev.token], background: t[sev.suave],
            }}
          >
            {sev.label}
          </span>
        </div>
      </header>

      <Campo t={t} rotulo="Medido" destacado>{riesgo.evidencia}</Campo>
      <Campo t={t} rotulo="Puede ocurrir">{riesgo.consecuencia}</Campo>
      <Campo t={t} rotulo="Qué revisar">{riesgo.accion}</Campo>

      {riesgo.nota && (
        <p style={{ margin: 0, fontSize: 11, color: t.textFaint, fontStyle: "italic" }}>
          {riesgo.nota}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => pedirAlAsistente(preguntaSobreRiesgo(riesgo))}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${t.border}`, background: t.hover,
            color: t.text, fontSize: 13, fontWeight: 600,
          }}
        >
          <MessageSquareText size={15} />
          Preguntarle a Tdconcito
        </button>

        {/*
         * Plan 16 Fase 5 (UI A): el técnico que ya intervino sobre ESTE
         * riesgo cierra el caso sin escribir de más — la pantalla llega con
         * el riesgo y la muestra de sensores ya puestos, ver la cabecera de
         * `CierreDiagnostico.jsx`.
         */}
        <button
          type="button"
          onClick={() => onNavigate?.("cierre-diagnostico", { sistema: "tanque", riesgoId: riesgo.id })}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${t.accent}`, background: t.accentSoft,
            color: t.accent, fontSize: 13, fontWeight: 600,
          }}
        >
          <ClipboardCheck size={15} />
          Cerrar diagnóstico
        </button>
      </div>
    </article>
  );
}

/** Una línea rotulada dentro de la tarjeta. */
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
 * Una tarjeta de pronóstico.
 *
 * Orden de lectura, y no es negociable: la CIFRA MEDIDA primero —qué fracción
 * del tiempo, sobre cuántas muestras—, después el mecanismo físico, y sólo al
 * final la consecuencia. Poner la consecuencia arriba convertiría la tarjeta
 * en un titular alarmista sobre un número que el lector todavía no ha visto.
 */
function TarjetaPronostico({ p, t }) {
  const sev = severidadInfo(p.severidad);
  const tend = TENDENCIAS[p.tendencia] ?? TENDENCIAS["sin determinar"];
  const { Icono: IconoTend } = tend;

  return (
    <article
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderLeft: `4px solid ${t[sev.token]}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>{p.titulo}</h3>
        <div style={{ fontSize: 12, color: t.textSoft, marginTop: 2 }}>{p.componente}</div>
      </header>

      {/* La cifra, grande, con su denominador pegado. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: t[sev.token], lineHeight: 1 }}>
          {(p.fraccion * 100).toFixed(1)} %
        </span>
        <span style={{ fontSize: 12.5, color: t.textSoft }}>
          del tiempo evaluado
          {p.horasEstimadas !== null && ` · ~${p.horasEstimadas} h estimadas`}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t[tend.token] }}>
          <IconoTend size={14} />
          {tend.label}
        </span>
        <span style={{ color: t.textFaint }}>
          {p.expuestas} de {p.muestras} muestras
          {p.soloEnMarcha && " con la bomba impulsando"}
        </span>
      </div>

      <Campo t={t} rotulo="Por qué degrada">{p.mecanismo}</Campo>
      <Campo t={t} rotulo="A qué avería lleva">{p.consecuencia}</Campo>
      <Campo t={t} rotulo="Qué revisar">{p.accion}</Campo>

      {p.norma && (
        <p style={{ margin: 0, fontSize: 11, color: t.textFaint }}>Criterio: {p.norma}</p>
      )}

      {/*
       * La duda sobre el dato de entrada va DENTRO de la tarjeta y en ámbar, no
       * como nota al pie: si la señal puede no ser la que creemos, eso pesa
       * tanto como la cifra que hay encima.
       */}
      {p.confirmar && (
        <p
          style={{
            margin: 0, fontSize: 11.5, lineHeight: 1.5, color: t.amber,
            background: t.amberSoft, border: `1px solid ${t.amber}33`,
            borderRadius: 8, padding: "8px 10px",
          }}
        >
          ⚠ {p.confirmar}
        </p>
      )}

      <button
        type="button"
        onClick={() => pedirAlAsistente(preguntaSobrePronostico(p))}
        style={{
          display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
          padding: "8px 14px", borderRadius: 8, cursor: "pointer",
          border: `1px solid ${t.border}`, background: t.hover,
          color: t.text, fontSize: 13, fontWeight: 600,
        }}
      >
        <MessageSquareText size={15} />
        Analizar con Tdconcito
      </button>
    </article>
  );
}

/* ── La vista ──────────────────────────────────────────────────────── */

function RiesgosTanque({ onNavigate }) {
  const { sistema, loading, error, lastUpdated } = useSistemaAgua();
  const { theme: t } = useTheme();

  const { activos, noEvaluables, evaluadas } = useMemo(
    () => evaluarRiesgos(sistema),
    [sistema]
  );

  /*
   * El pronóstico se pide aparte y con su propia ventana: los riesgos miran el
   * instante que ya trae `useSistemaAgua`, y esto necesita semanas de historia.
   * Son dos preguntas distintas sobre la misma planta, y por eso conviven en
   * una sola pantalla en vez de en dos.
   *
   * ── POR QUÉ NO SE PIDE SOLO AL ENTRAR ──────────────────────────────
   *
   * Porque cuesta, y quien abre «Riesgos» no ha pedido esto. El troceado del
   * historiador vive en el navegador (`data/tanque/historia.js`), así que cada tramo
   * es una petición a /api: cinco señales por diez tramos son CINCUENTA para
   * una ventana de 30 días, contra las cuatro que gasta «Planta» entera. Con
   * el límite del puente en 300/min, un par de cambios de período y una
   * vuelta a la pestaña bastaban para llevarse un 429 —y el 429 no lo paga
   * esta pantalla, lo paga la siguiente persona que pregunte cualquier cosa.
   *
   * Los riesgos, que son los que dan nombre a la vista, no cuestan NADA
   * aparte: salen del instante que el proveedor ya está sondeando. Así que la
   * parte cara se pide cuando alguien la quiere, y mientras tanto la pantalla
   * abre instantánea. El período arranca en el más corto por el mismo motivo.
   */
  const [periodo, setPeriodo] = useState(PERIODOS[0]);
  const [pedirPronostico, setPedirPronostico] = useState(false);
  const rango = useMemo(
    () => ({ horas: periodo.horas, puntos: periodo.puntos }),
    [periodo]
  );
  /*
   * Sin claves, `useSeriesHistoricas` no llega a pedir nada: devuelve el
   * estado vacío y no monta ninguna lectura. Es el mismo camino que ya
   * recorría una vista sin señales, no un caso nuevo.
   */
  const historia = useSeriesHistoricas(pedirPronostico ? SENALES_PRONOSTICO : VACIO, rango);

  const pronostico = useMemo(
    () => evaluarPronostico(historia.filas, periodo.horas),
    [historia.filas, periodo.horas]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ── Procedencia. Fija mientras los umbrales sean estimaciones ── */}
      {PROVISIONALES && (
        <AlertBanner
          type="warning"
          title="Estos avisos se calculan con límites estimados por nosotros"
          message={
            <>
              Los umbrales con los que se cruzan las señales no los publica el servidor. Medido
              contra la instalación real, la presión relativa pasa el 92 % del tiempo por debajo
              de su «mínimo», así que un aviso de presión de aquí puede no significar nada. Las{" "}
              <strong>alarmas del servidor mandan sobre esta pantalla</strong>: sus límites los
              puso quien conoce el proceso.
            </>
          }
        />
      )}

      {error && (
        <AlertBanner
          type="error"
          title="No se pudo leer la instalación"
          message={`${String(error)}. Lo que se ve abajo puede estar desactualizado.`}
        />
      )}

      {/* ── 1 · Riesgos activos ──────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionLabel>
          {activos.length > 0
            ? `Situaciones detectadas · ${activos.length}`
            : "Situaciones detectadas"}
        </SectionLabel>

        {activos.length > 0 ? (
          <div
            style={{
              display: "grid", gap: 16,
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            }}
          >
            {activos.map((r) => (
              <TarjetaRiesgo key={r.id} riesgo={r} t={t} onNavigate={onNavigate} />
            ))}
          </div>
        ) : (
          /*
           * El estado tranquilo dice CUÁNTAS reglas se comprobaron. «Sin
           * riesgos» a secas no distingue entre «se miraron nueve cosas y
           * ninguna se cumple» y «no se miró nada», y esa diferencia es
           * justamente la que hace confiable un panel de este tipo.
           */
          <div
            style={{
              background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12,
              padding: 24, display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <CheckCircle2 size={20} color={t.success} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>
                {loading ? "Comprobando…" : "Ninguna situación de riesgo ahora mismo"}
              </div>
              <div style={{ fontSize: 12, color: t.textSoft, marginTop: 2 }}>
                {evaluadas} regla{evaluadas === 1 ? "" : "s"} comprobada
                {evaluadas === 1 ? "" : "s"} con las lecturas actuales.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 2 · Lo que no se pudo mirar ──────────────────────────────── */}
      {noEvaluables.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionLabel>Sin comprobar · {noEvaluables.length}</SectionLabel>
          <div
            style={{
              background: t.panel, border: `1px solid ${t.border}`,
              borderRadius: 12, padding: 16,
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: 12, color: t.textSoft, lineHeight: 1.5 }}>
              Estas reglas no se pudieron evaluar porque les falta una lectura. No significa que
              todo esté bien: significa que <strong>no se sabe</strong>.
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {noEvaluables.map((n) => (
                <li
                  key={n.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                >
                  <HelpCircle size={15} color={t.textFaint} style={{ flexShrink: 0 }} />
                  <span style={{ color: t.text }}>{n.titulo}</span>
                  <span style={{ color: t.textFaint }}>— falta {n.falta}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── 3 · Pronóstico: qué se está desgastando ──────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, flexWrap: "wrap",
          }}
        >
          <SectionLabel>
            {pedirPronostico
              ? `Desgaste acumulado · últimos ${periodo.label}`
              : "Desgaste acumulado"}
          </SectionLabel>
          {/* Los períodos sólo tienen sentido cuando ya hay algo que reencuadrar. */}
          <div style={{ display: "flex", gap: 6 }} hidden={!pedirPronostico}>
            {PERIODOS.map((p) => (
              <button
                key={p.horas}
                type="button"
                aria-pressed={p.horas === periodo.horas}
                onClick={() => setPeriodo(p)}
                style={{
                  padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  border: `1px solid ${p.horas === periodo.horas ? t.accent : t.border}`,
                  background: p.horas === periodo.horas ? t.accentSoft : t.panel,
                  color: p.horas === periodo.horas ? t.accent : t.textSoft,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {!pedirPronostico ? (
          /*
           * El estado de reposo. Dice lo que va a hacer y lo que cuesta ANTES
           * de hacerlo: es una lectura larga del historiador, y quien la pide
           * merece saber que no es gratis. Nada de esto se lee al entrar.
           */
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
              padding: 16, borderRadius: 12,
              border: `1px dashed ${t.border}`, background: t.panel,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: t.textSoft, maxWidth: "68ch" }}>
              El desgaste acumulado se calcula sobre <strong>semanas de historia</strong>, no
              sobre el instante: hay que leer el historiador de cinco señales y trocear el
              rango, así que tarda unos segundos. Los riesgos de arriba no dependen de esto y
              ya están evaluados.
            </p>
            <button
              type="button"
              onClick={() => setPedirPronostico(true)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 16px", borderRadius: 8, cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                border: `1px solid ${t.accent}`, background: t.accentSoft, color: t.accent,
              }}
            >
              <TrendingUp size={15} />
              Calcular desgaste de los últimos {periodo.label}
            </button>
          </div>
        ) : (
        <>
        {/*
         * Este aviso NO es opcional y no se puede resumir. El historiador se lee
         * con media por intervalo, así que la pantalla es ciega a todo lo que
         * dure menos que la resolución. Sin este párrafo, un «0 %» se lee como
         * «no pasó nada» cuando lo que dice es «no hubo nada sostenido».
         */}
        <AlertBanner
          type="info"
          title={`Esto mide lo sostenido, con resolución de ${duracion(periodo.resolucion)}`}
          message={
            <>
              Cada muestra es la <strong>media</strong> de su intervalo, así que un episodio más
              corto que {duracion(periodo.resolucion)} se promedia y no aparece aquí. Un 0 % significa
              «no hubo nada sostenido», nunca «no pasó nada». Las horas son{" "}
              <strong>estimadas</strong> a partir de la fracción de muestras, no contadas: el
              historiador de esta instalación tiene huecos. Y «con la bomba impulsando» se
              reconstruye del caudal, porque la carga del motor no tiene serie propia.
            </>
          }
        />

        {historia.loading && !historia.filas.length ? (
          <div style={{ fontSize: 13, color: t.textSoft, padding: 8 }}>Leyendo el historiador…</div>
        ) : pronostico.activos.length > 0 ? (
          <div
            style={{
              display: "grid", gap: 16,
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            }}
          >
            {pronostico.activos.map((p) => (
              <TarjetaPronostico key={p.id} p={p} t={t} />
            ))}
          </div>
        ) : (
          <div
            style={{
              background: t.panel, border: `1px solid ${t.border}`, borderRadius: 12,
              padding: 24, display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <CheckCircle2 size={20} color={t.success} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>
                Sin desgaste sostenido en {periodo.label}
              </div>
              <div style={{ fontSize: 12, color: t.textSoft, marginTop: 2 }}>
                {pronostico.sinExposicion.length} mecanismo
                {pronostico.sinExposicion.length === 1 ? "" : "s"} comprobado
                {pronostico.sinExposicion.length === 1 ? "" : "s"} sobre {pronostico.muestras} muestras
                del historiador.
              </div>
            </div>
          </div>
        )}

        {pronostico.noEvaluables.length > 0 && (
          <div
            style={{
              background: t.panel, border: `1px solid ${t.border}`,
              borderRadius: 12, padding: 16,
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: 12, color: t.textSoft, lineHeight: 1.5 }}>
              Estos desgastes <strong>no se están vigilando</strong>, porque el historiador no
              sirve la señal que necesitan. No es que no ocurran: es que nadie los cuenta.
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {pronostico.noEvaluables.map((n) => (
                <li key={n.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <HelpCircle size={15} color={t.textFaint} style={{ flexShrink: 0 }} />
                  <span style={{ color: t.text }}>{n.componente}</span>
                  <span style={{ color: t.textFaint }}>— falta {n.falta}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        </>
        )}
      </section>

      {/* `UltimaLectura` se calla sola si todavía no hay ninguna lectura. */}
      <UltimaLectura fecha={lastUpdated} t={t} />
    </div>
  );
}

/*
 * Sin envoltorio de fuente: `<EvaProvider>` envuelve el Shell entero en
 * `App.jsx` desde que toda la app es Demo EVA, así que `useSistemaAgua` ya
 * tiene de dónde leer. Envolver aquí otra vez sólo abriría un segundo motor
 * de sondeo. Mismo patrón que las otras vistas de la carpeta.
 */
export default RiesgosTanque;
