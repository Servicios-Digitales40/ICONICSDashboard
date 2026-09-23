/**
 * Las piezas de la vista «Planta» de una máquina CONFIGURADA (Plan 42.5 F1).
 *
 * Componentes «tontos» y GENÉRICOS: reciben señales en la forma común de
 * `shared/eva/comun/estadoMaquina.js` (`clave`, `label`, `valor`, `unidad`,
 * `estado`, `grupo`, `decimales`, `historia`), las series ya leídas y el tema
 * por prop. Ninguno lee datos, decide una banda ni sabe de qué tipo es la
 * máquina: si algo de aquí necesitara saber que es de vibraciones, ese algo
 * pertenece al TIPO, no a esta carpeta (Plan 42.5 D1).
 *
 * ── POR QUÉ NO SON `components/tiles.jsx` ────────────────────────────
 *
 * Aquéllos (1243 líneas) reciben el modelo del tanque —`buildModeloEva`, sus
 * ocho claves, sus cuatro activos— en cada banda. Adaptarlos habría acabado
 * en un `if (esTanque)` por tile, que es la máquina #3 que no entra sin tocar
 * código. Éstos son más pequeños porque prometen menos: no hay titular
 * (ningún tipo declara una señal principal), no hay recorrido (la topología
 * es del tipo, y la Vista 3D ya la enseña) y no hay márgenes por umbral
 * nuestro (las bandas las declara el tipo, o no hay barra).
 *
 * Los rótulos salen de `senal.label` —lo que `metaDe` puso desde la
 * configuración—, no de `useDominio().senal(clave)`: ese diccionario es el
 * del catálogo del tanque y no conoce las claves de una configurada.
 */
import { useTranslation } from "react-i18next";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/index.js";
import { useDominio } from "@/i18n/useDominio.js";
import { useFormato } from "@/i18n/formato.js";
import { hasValue } from "@shared/valores.js";
import { SIN_DATO, fmtNum } from "@/lib/format.js";

import { HISTORIAL, estadoHistorial, presentarValor } from "../../data/comunes/estadoDelDato.js";
import { Card, ESCALA, MONO, PuntoEstado, Spark } from "../base.jsx";
import { estadoColor } from "../paleta.js";

/**
 * Valor formateado con su unidad, o el guion de «sin dato»; nunca un cero
 * inventado.
 *
 * No todo valor con dato es un número: en la forma común viajan también las
 * banderas booleanas del tipo y los contadores de alarma. El 23-09-2026 la
 * Planta de `vib-motor-03` cayó entera en el navegador con «v.toFixed is not
 * a function» porque esto llamaba a `fmtNum` con `true`; las pruebas no lo
 * vieron porque su lector devolvía 1,5 para todo. Un booleano se rotula con
 * `texto` si el tipo lo puso, o con «activa»/«inactiva» del diccionario; lo
 * que no sea número ni booleano se enseña tal cual.
 */
const fmtValor = (senal, traducir = null, v = senal.valor) => {
  if (!hasValue(v)) return SIN_DATO;
  if (typeof v === "boolean") {
    if (senal.texto) return senal.texto;
    return traducir ? traducir(v ? "maquina.planta.booleano.activa" : "maquina.planta.booleano.inactiva") : String(v);
  }
  if (typeof v !== "number") return senal.texto ?? String(v);
  return `${fmtNum(v, senal.decimales ?? 1)}${senal.unidad ? ` ${senal.unidad}` : ""}`;
};

/* ── Señales con historia: una tarjeta por serie verificada, con su sparkline ── */

function TarjetaSenalConHistoria({ senal, datos, t, dark, delay, ahora }) {
  const { t: traducir } = useTranslation("machines");
  const { estado: estadoTexto } = useDominio();
  const color = estadoColor(dark, senal.estado ?? "sin_dato");
  const serie = (datos ?? []).map((p) => p.valor).filter((v) => typeof v === "number");
  /* Un valor congelado se enseña como su EDAD, no como cifra (§2.4): ver
     `presentarValor`. `receivedAt`/`stale` los pone la vista desde la fuente. */
  const { texto, atenuado } = presentarValor({ receivedAt: senal.receivedAt, stale: senal.stale, ahora, formateado: fmtValor(senal, traducir) });

  return (
    <Card t={t} delay={delay} style={{ padding: "14px 16px 14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <PuntoEstado color={color} size={8} />
          <span
            title={senal.label}
            style={{ ...ESCALA.etiqueta, color: t.textSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {senal.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <span
            title={atenuado && senal.receivedAt ? senal.receivedAt.toLocaleString() : undefined}
            style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: hasValue(senal.valor) && !atenuado ? t.text : t.textFaint, lineHeight: 1 }}
          >
            {texto}
          </span>
          <Spark serie={serie} color={color} t={t} delay={delay} />
        </div>
        {senal.estado && senal.estado !== "sin_dato" && (
          <span style={{ fontSize: 10.5, color: t.textFaint }}>{estadoTexto(senal.estado, "corto")}</span>
        )}
      </div>
    </Card>
  );
}

/**
 * La banda de las series verificadas. `senales` ya viene ordenada por el
 * dominio (`clavesConTendencia`); aquí sólo se pinta una tarjeta por señal.
 */
export function BandaSenalesConHistoria({ senales, porClave, t, dark, ahora = new Date(), base = 0 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
      {senales.map((s, i) => (
        <TarjetaSenalConHistoria key={s.clave} senal={s} datos={porClave?.[s.clave]} t={t} dark={dark} ahora={ahora} delay={base + i * 0.04} />
      ))}
    </div>
  );
}

/* ── Estado de las variables: cada señal con su estado, agrupadas ─────── */

/**
 * Barra contra la banda que el TIPO declara para el rol de la señal
 * (`tipo.bandaDe(rol)` → `{ min, avisoMin, avisoMax, max }`). Sin banda no
 * hay barra: no se inventa una escala para pintar un margen.
 */
function BarraDeBanda({ senal, banda, t, dark }) {
  if (!banda || !hasValue(banda.max) || typeof senal.valor !== "number") return null;
  const min = hasValue(banda.min) ? banda.min : 0;
  const pct = Math.max(0, Math.min(100, ((senal.valor - min) / (banda.max - min)) * 100));
  const aviso = hasValue(banda.avisoMax) ? Math.max(0, Math.min(100, ((banda.avisoMax - min) / (banda.max - min)) * 100)) : null;
  const color = estadoColor(dark, senal.estado ?? "sin_dato");

  return (
    <div title={`${fmtNum(min, 1)} – ${fmtNum(banda.max, 1)}${senal.unidad ? ` ${senal.unidad}` : ""}`} style={{ position: "relative", height: 5, borderRadius: 999, background: t.hover, minWidth: 72, flex: "0 0 96px" }}>
      {aviso !== null && (
        <div style={{ position: "absolute", top: -1, bottom: -1, left: `calc(${aviso}% - 1px)`, width: 2, background: t.amber, opacity: 0.7, borderRadius: 1 }} />
      )}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, borderRadius: 999, background: color, transition: "width 700ms cubic-bezier(0.22,1,0.36,1)" }} />
    </div>
  );
}

function FilaVariable({ senal, banda, t, dark, ahora }) {
  const { t: traducir } = useTranslation("machines");
  const { estado: estadoTexto } = useDominio();
  const sinDato = !hasValue(senal.valor);
  const color = estadoColor(dark, sinDato ? "sin_dato" : senal.estado ?? "sin_dato");
  const { texto, atenuado } = presentarValor({ receivedAt: senal.receivedAt, stale: senal.stale, ahora, formateado: fmtValor(senal, traducir) });

  return (
    <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${t.border}` }}>
      <PuntoEstado color={color} size={7} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: sinDato ? t.textFaint : t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={senal.tag ?? senal.label}>
        {senal.label}
      </span>
      <BarraDeBanda senal={senal} banda={banda} t={t} dark={dark} />
      <span
        title={atenuado && senal.receivedAt ? senal.receivedAt.toLocaleString() : undefined}
        style={{ fontFamily: MONO, fontSize: 12.5, fontVariantNumeric: "tabular-nums", color: sinDato || atenuado ? t.textFaint : t.text, minWidth: 84, textAlign: "right" }}
      >
        {texto}
      </span>
      <span style={{ fontSize: 10.5, color: t.textFaint, minWidth: 54, textAlign: "right" }}>
        {sinDato ? "" : senal.estado ? estadoTexto(senal.estado, "corto") : ""}
      </span>
    </li>
  );
}

/**
 * Qué dicen todas las variables de la máquina, agrupadas por `grupo` (el apoyo,
 * el variador, las alarmas…) en el orden en que llegan. `bandaDe(senal)` la
 * pone quien conoce el tipo; aquí sólo se pinta si devuelve algo.
 */
export function EstadoVariables({ senales, bandaDe = () => null, grupos = [], t, dark, ahora = new Date(), delay = 0 }) {
  const { t: traducir } = useTranslation("machines");
  const conLectura = senales.filter((s) => hasValue(s.valor)).length;

  const porGrupo = new Map();
  for (const s of senales) {
    const g = s.grupo ?? "";
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(s);
  }
  const rotulo = new Map(grupos.map((g) => [g.id, g.label ?? g.id]));

  return (
    <Card
      t={t} delay={delay}
      title={traducir("maquina.planta.estado.title")}
      code={traducir("maquina.planta.estado.code", { conLectura, total: senales.length })}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "4px 28px" }}>
        {[...porGrupo.entries()].map(([grupo, lista]) => (
          <section key={grupo || "sin-grupo"} style={{ minWidth: 0 }}>
            {grupo && (
              <h4 style={{ margin: "10px 0 2px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textFaint }}>
                {rotulo.get(grupo) ?? grupo}
              </h4>
            )}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {lista.map((s) => (
                <FilaVariable key={s.clave} senal={s} banda={bandaDe(s)} t={t} dark={dark} ahora={ahora} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

/* ── Tendencias: cada serie del historiador con su propia escala ─────── */

function PanelTendenciaMaquina({ senal, datos, error, motivo, t, dark, ahora }) {
  const { t: traducir } = useTranslation("machines");
  const { hora } = useFormato();
  const color = estadoColor(dark, senal.estado ?? "sin_dato");
  const { texto: valorActual } = presentarValor({ receivedAt: senal.receivedAt, stale: senal.stale, ahora, formateado: fmtValor(senal, traducir) });

  const filas = (datos ?? []).map((p) => ({ hora: hora(p.t), valor: p.valor }));
  const historial = estadoHistorial({ error, motivo, datos: filas, minimo: 2 });

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <span title={senal.label} style={{ ...ESCALA.etiqueta, color: t.textFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {senal.label}
        </span>
        <span style={{ ...ESCALA.dato, fontSize: 12, color, fontVariantNumeric: "tabular-nums" }}>{valorActual}</span>
      </div>

      {historial !== HISTORIAL.OK ? (
        <div
          role="note"
          style={{ height: 116, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: t.textFaint, textAlign: "center", border: `1px dashed ${t.border}`, borderRadius: 8, padding: "0 10px" }}
        >
          {historial === HISTORIAL.SIN_CONEXION
            ? traducir("trends.noHistorian")
            : historial === HISTORIAL.SIN_HISTORIADOR
              ? motivo
              : traducir("trends.notEnough")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={116}>
          <AreaChart data={filas} margin={{ top: 6, right: 4, left: -34, bottom: 0 }}>
            <XAxis dataKey="hora" tick={{ fontSize: 9.5, fill: t.textFaint }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={["dataMin", "dataMax"]} tick={false} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone" dataKey="valor" name={senal.label}
              stroke={color} strokeWidth={1.8} fill={color} fillOpacity={0.12}
              isAnimationActive={false} dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/**
 * Las series verificadas, cada una con su escala. La cobertura del rango se
 * declara siempre: un rango a medias dibujado como curva continua se lee como
 * si la máquina hubiera evolucionado así, cuando lo que hubo fue silencio.
 */
export function TendenciasMaquina({ senales, porClave, metaPorClave, cobertura, horas, t, dark, ahora = new Date(), delay = 0 }) {
  const { t: traducir } = useTranslation("machines");
  const incompleta = cobertura && cobertura.completa === false;

  return (
    <Card
      t={t} delay={delay}
      title={traducir("maquina.planta.tendencias.title")}
      code={traducir("trends.code", { horas })}
      right={
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.textSoft }}>
          {incompleta ? (
            <span
              title={traducir("trends.partial", { conDato: cobertura.tramosConDato, tramos: cobertura.tramos })}
              style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: t.amberSoft, color: t.amber }}
            >
              {traducir("trends.segments", { conDato: cobertura.tramosConDato, tramos: cobertura.tramos })}
            </span>
          ) : (
            traducir("trends.ownScale")
          )}
        </span>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        {senales.map((s) => (
          <PanelTendenciaMaquina
            key={s.clave} senal={s} datos={porClave?.[s.clave]}
            error={metaPorClave?.[s.clave]?.error} motivo={metaPorClave?.[s.clave]?.motivo}
            t={t} dark={dark} ahora={ahora}
          />
        ))}
      </div>
    </Card>
  );
}

/* ── Lo que no se puede decir ────────────────────────────────────────── */

/**
 * Las limitaciones que `construirSistema` ya redacta para esta máquina
 * (series sin verificar, constantes, roles sin cubrir, sensores sin leer).
 * Se enseñan tal cual: una pantalla de tendencias que no dice cuáles faltan
 * invita a leer las que hay como «todo el motor».
 */
export function LimitacionesMaquina({ limitaciones, t, delay = 0 }) {
  const { t: traducir } = useTranslation("machines");
  if (!limitaciones?.length) return null;

  return (
    <Card t={t} delay={delay} title={traducir("maquina.planta.limitaciones.title")} code={traducir("maquina.planta.limitaciones.code")}>
      <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
        {limitaciones.map((l, i) => (
          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.55, color: t.textSoft }}>
            {l}
          </li>
        ))}
      </ul>
    </Card>
  );
}
