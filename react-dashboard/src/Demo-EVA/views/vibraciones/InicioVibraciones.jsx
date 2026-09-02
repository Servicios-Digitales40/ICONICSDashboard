/**
 * Vista «Inicio» del SISTEMA DE VIBRACIONES — la landing del segundo sistema.
 *
 * ── LA MISMA FORMA QUE «INICIO» DE LA ESTACIÓN DE LLENADO ──────────
 *
 * Mismas tres secciones y en el mismo orden —hero con la cifra en vivo,
 * rejilla de tarjetas con un dato real cada una, y el pipeline «Cómo
 * funciona»—, porque son la portada de dos máquinas de la misma planta y una
 * forma distinta haría pensar que son dos productos distintos.
 *
 * Lo que cambia es lo que cada pieza DICE, y hay tres diferencias que no son
 * de estilo:
 *
 *  1. NO HAY MAQUETA 3D DE FONDO. La de allí es la instalación real; aquí no
 *     existe modelo del motor, y poner uno genérico girando detrás de
 *     lecturas reales lo convertiría en «la máquina» para quien lo mire. El
 *     hero se sostiene con el gradiente y su trazo, sin fingir una escena.
 *
 *  2. LA CIFRA NO ES LA MISMA PREGUNTA. Allí cuenta señales con lectura sobre
 *     ocho; aquí, puntos que contestan sobre los 73 que se piden. No es un
 *     detalle: hoy esta máquina se queda muda a ratos —cuando el variador se
 *     apaga deja de publicar la velocidad y el módulo no puede calcular la
 *     velocidad eficaz—, así que esa fracción es lo primero que hay que saber
 *     antes de creerse nada de lo que haya debajo.
 *
 *  3. EL PIPELINE TIENE OTRO CAMINO. El del tanque va sensores → PLC →
 *     ICONICS → servidor → tablero. El de aquí pasa por un SIPLUS CMS 1200 SM
 *     1281 que hace el cálculo de las magnitudes ANTES de que nada las lea, y
 *     por el Hyper Historian en vez de AssetWorX: sus tags no están
 *     publicados como activos (ver `senales.js`). Contarlo igual que el otro
 *     sería contar una cadena que no es la suya.
 */
import { useMemo } from "react";
import {
  ArrowRight, Cpu, Gauge, LayoutDashboard, Monitor, Radio, Server, ShieldAlert, WifiOff,
} from "lucide-react";

import { Button, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";
import { useEnVista } from "@/lib/motion.js";

import { Cifra, MONO, SANS, UltimaLectura } from "../../components/base.jsx";
import { estadoColor } from "../../components/paleta.js";
import { useVibracion } from "../../data/vibraciones/vibracion.js";
import { evaluarRiesgosVibracion } from "../../domain/riesgosVibracion.js";
import { bandaISO, CANALES, LIMITES_ISO, VIGILANCIAS } from "../../domain/vibraciones.js";

/* ── Rejilla ───────────────────────────────────────────────────────── */

/*
 * Las mismas clases que `InicioTanque`, con las de la maqueta fuera: aquí no hay
 * escena 3D que colocar, así que el hero no tiene de qué apartar el texto y
 * mantiene su centrado en cualquier ancho.
 */
const REJILLA = `
.vib-inicio { display: flex; flex-direction: column; gap: 32px; }

.vib-inicio-hero {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 64px 40px 56px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

@media (min-width: 900px) {
  .vib-inicio-hero { align-items: flex-start; text-align: left; }
  .vib-inicio-hero__frase { margin-left: 0; margin-right: 0; }
  .vib-inicio-hero__badge { justify-content: flex-start; }
}

.vib-inicio-hero__cifra-num { font-size: 104px; }
.vib-inicio-hero__badge { justify-content: center; }

/* El trazo de los tres apoyos, por debajo del texto — mismo z-index que
   .eva-inicio-hero__flujo de InicioTanque.
   Ocupa sólo la franja INFERIOR y no la mitad de abajo: a media altura, uno
   de sus tres nodos caía justo detrás del CTA primario, y un círculo asomando
   por los bordes de un botón se lee como un defecto de pintado, no como
   fondo. Aquí el hero acaba en padding, así que no hay nada que estorbar. */
.vib-inicio-hero__trazo {
  position: absolute;
  inset: auto 0 8% 52%;
  height: 22%;
  z-index: 0;
  pointer-events: none;
}

/* Por debajo de 900px el hero vuelve a centrarse y el texto ocupa el ancho
   entero: no queda mitad derecha que darle al trazo sin cruzarlo. */
@media (max-width: 899px) {
  .vib-inicio-hero__trazo { display: none; }
}

.vib-inicio-hero__frase {
  max-width: 520px;
  margin: 18px 0 26px;
  font-size: 14.5px;
  line-height: 1.65;
}

.vib-inicio-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

/* Mismas reglas de tarjeta que .eva-tarjeta-vista de InicioTanque: el borde y
   la sombra viajan como variables para que el :hover de esta hoja pueda
   ganarles: un color inline no cedería nunca. */
.vib-tarjeta-vista {
  border: 1px solid var(--tv-border);
  box-shadow: var(--tv-shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.vib-tarjeta-vista:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-hover);
}
.vib-tarjeta-vista:hover .vib-tarjeta-flecha { transform: translateX(3px); }
.vib-tarjeta-flecha { transition: transform 0.18s ease; }

.vib-tarjeta-dato {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--tv-border);
}

.vib-inicio-pipeline {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 4px;
}
.vib-inicio-pipeline__paso {
  display: flex;
  align-items: center;
  flex: 1 1 180px;
  min-width: 0;
  opacity: 0;
}
.vib-inicio-pipeline--visible .vib-inicio-pipeline__paso {
  animation: fadeInUp 0.5s ease both;
}
.vib-inicio-pipeline__nodo {
  display: flex;
  align-items: center;
  gap: 11px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 14px;
  border-radius: 12px;
}
.vib-inicio-pipeline__enlace { flex: 1 1 40px; min-width: 20px; }
.vib-inicio-pipeline__paquete { animation: paqueteViaja 1.1s ease-out both; }

@keyframes paqueteViaja {
  from { transform: translateX(0); opacity: 0; }
  20%  { opacity: 1; }
  to   { transform: translateX(100px); opacity: 0; }
}
`;

/* ── Las entradas de la rejilla ────────────────────────────────────── */

/**
 * Cada tarjeta lleva un dato REAL de su vista, no sólo un icono: el mismo
 * criterio que `VISTAS` en `InicioTanque` —una tarjeta que sólo promete se lee
 * como un menú, y el menú ya está en el sidebar—.
 *
 * `dato()` devuelve `null` cuando no hay lectura con la que responder, y la
 * tarjeta se queda sin su línea inferior en vez de enseñar un cero: en esta
 * máquina «no contesta» es el caso frecuente, no la excepción.
 */
const VISTAS = [
  {
    id: "eva-vibraciones",
    label: "Gráficas",
    frase: "Los tres apoyos, sus cuatro medidas y qué vigilancias tiene encendidas el módulo.",
    Icono: LayoutDashboard,
    dato: ({ peor }) =>
      peor
        ? { texto: `ISO zona ${peor.zona}`, estado: peor.nivel === "critico" ? "critico" : peor.nivel === "atencion" ? "atencion" : "nominal" }
        : null,
  },
  {
    id: "eva-riesgos-vibracion",
    label: "Riesgos",
    frase: "Qué se deduce de esas medidas, con la evidencia separada de la hipótesis.",
    Icono: ShieldAlert,
    dato: ({ res }) => {
      if (!res.evaluadas && !res.activos.length) return null;
      if (res.activos.length > 0) {
        return { texto: `${res.activos.length} situación${res.activos.length === 1 ? "" : "es"}`, estado: "critico" };
      }
      return { texto: `${res.evaluadas} reglas en orden`, estado: "nominal" };
    },
  },
  {
    id: "vib-controles",
    label: "Controles",
    frase: "El encendido y apagado de esta máquina. Todavía sin construir.",
    Icono: Radio,
    dato: () => ({ texto: "Pendiente", estado: "sin_dato" }),
  },
];

/* ── El pipeline: el camino REAL de estos números ──────────────────── */

/**
 * Cinco nodos como el del tanque, pero no los mismos cinco.
 *
 * Las diferencias que hacen que no se pueda copiar aquel: el SM 1281 no es un
 * PLC leyendo un sensor, es un módulo que CALCULA las magnitudes —velocidad
 * eficaz, aceleración, valor de daño— a partir de la señal cruda del
 * acelerómetro, y lo hace antes de que ningún software las vea; y del lado de
 * ICONICS estos tags viven en el Hyper Historian y no están publicados como
 * activos en AssetWorX, por eso se leen con `hda:` y por nombre.
 *
 * Se nombra el modelo del módulo porque está confirmado, igual que allí se
 * nombra ICONICS. Los acelerómetros van sin marca: lo único verificado de
 * ellos es su sensibilidad (100,05 / 99 / 100 mV/g), no su fabricante.
 */
const NODOS_PIPELINE = [
  { id: "acelerometros", Icono: Gauge, titulo: "Acelerómetros", detalle: "Tres, uno por apoyo, con su sensibilidad propia en mV/g" },
  { id: "modulo", Icono: Cpu, titulo: "SIPLUS CMS 1281", detalle: "Calcula vRMS, aceleración y daño a partir de la señal cruda" },
  { id: "plc", Icono: Server, titulo: "PLC_2 · ua:DEMO3", detalle: "Publica lo que el módulo calculó, más su propio variador" },
  { id: "historiador", Icono: Radio, titulo: "Hyper Historian", detalle: "Grupo «DEMO 3» — sin publicar como activos en AssetWorX" },
  { id: "tablero", Icono: Monitor, titulo: "Este tablero", detalle: "Lee los 73 puntos de una vez y pinta lo que contestaron" },
];

/* ── Piezas ────────────────────────────────────────────────────────── */

/**
 * La cifra del hero: cuántos puntos CONTESTAN, sobre los que se piden.
 *
 * ── POR QUÉ ÉSTA Y NO LA VELOCIDAD EFICAZ ──────────────────────────
 *
 * Porque una cifra grande y sola se lee como el titular de la máquina, y el
 * titular honesto de ésta no es un valor: es cuánto de ella está hablando.
 * Un vRMS enorme presidiendo la pantalla estaría casi siempre vacío o
 * mostrando el único canal que responda, y en los dos casos diría menos de lo
 * que aparenta.
 *
 * Una máquina callada y una máquina tranquila se ven igual en un panel que
 * sólo cuenta alarmas. Esta cifra es lo que las separa.
 */
function CifraEnVivo({ contestan, total, hayLectura, error, t }) {
  if (error) {
    // Mismo tratamiento que en `InicioTanque`: coral porque ES un error de
    // lectura, y sin latido —ese vocabulario lo reserva `tiles.jsx` para una
    // señal fuera de banda, y prestárselo a un corte de red confundiría dos
    // alarmas de gravedad distinta—.
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "18px 0" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: t.coral }}>
          <WifiOff size={17} />
          Sin conexión con el módulo por ahora
        </span>
        <span style={{ fontSize: 12, color: t.textFaint }}>
          Vuelve a intentarlo solo, cada pocos segundos
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, position: "relative" }}>
      <span className="vib-inicio-hero__cifra-num" style={{ display: "inline-flex" }}>
        {hayLectura ? (
          <Cifra
            valor={contestan}
            fmt={(v) => Math.round(v)}
            duracion={1200}
            style={{ fontFamily: SANS, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: t.accent }}
          />
        ) : (
          <span style={{ fontFamily: SANS, fontWeight: 800, color: t.textFaint, opacity: 0.5 }}>···</span>
        )}
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: t.textFaint }}>/ {hayLectura ? total : "—"}</span>
    </div>
  );
}

/**
 * Los tres apoyos como elemento gráfico de fondo del hero.
 *
 * El equivalente de `TrazoFlujo` en la otra portada, y con su mismo límite:
 * se dibuja UNA vez al entrar —`.trazo-dibujo`, el keyframe que ya usa
 * `Spark`— y lo que cambia con el estado es el color, nunca un bucle.
 * `lib/motion.js` reserva la única animación en bucle del sistema para una
 * señal en alarma, y un segundo bucle decorativo le quitaría el significado.
 *
 * El eje con tres nodos es lo que ES esta máquina —un motor con tres puntos
 * de medida—, no una ilustración de vibración: un trazo ondulado diría
 * «vibra», que es justo lo que la pantalla no puede afirmar cuando la mayoría
 * de los canales no contesta.
 */
function TrazoApoyos({ contestan, total, t }) {
  const vivo = total > 0 && contestan > total / 2;
  const color = vivo ? t.success : t.textFaint;

  return (
    <div className="vib-inicio-hero__trazo" aria-hidden="true">
      {/*
        `preserveAspectRatio` en su valor por defecto —NO `none`—: con `none`
        el SVG se estira a la caja y los tres nodos salían elípticos, que en
        una figura hecha de círculos se lee como un fallo de pintado. El
        `meet` de por defecto conserva la proporción y centra la figura.
      */}
      <svg width="100%" height="100%" viewBox="0 0 400 60">
        <line
          className="trazo-dibujo"
          x1="60" y1="30" x2="340" y2="30"
          stroke={color} strokeWidth="1.5" strokeLinecap="round"
          opacity={vivo ? 0.45 : 0.22}
        />
        {[60, 200, 340].map((cx) => (
          <circle key={cx} cx={cx} cy="30" r="4" fill={color} opacity={vivo ? 0.5 : 0.25} />
        ))}
      </svg>
    </div>
  );
}

/** Una tarjeta de la rejilla. Misma forma que `TarjetaVista` de `InicioTanque`. */
function TarjetaVista({ vista, contexto, dark, onNavigate, t, delay }) {
  const { Icono } = vista;
  const dato = vista.dato(contexto);

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(vista.id)}
      className="panel-card vib-tarjeta-vista"
      style={{
        textAlign: "left", cursor: "pointer",
        background: t.panel, borderRadius: 16, padding: "22px 22px 24px",
        "--tv-border": t.border, "--tv-shadow": t.shadow, "--shadow-hover": t.shadowHover,
        animation: "fadeInUp 0.5s ease both", animationDelay: `${delay}s`,
        display: "flex", flexDirection: "column", gap: 14, width: "100%",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 46, height: 46, borderRadius: 9, background: t.gradAccent, color: "#FFFFFF",
            boxShadow: `0 4px 14px ${t.accent}4D`, flexShrink: 0,
          }}
        >
          <Icono size={20} />
        </span>
        <span className="vib-tarjeta-flecha" style={{ display: "inline-flex", color: t.textFaint }}>
          <ArrowRight size={16} />
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.text, fontFamily: SANS }}>{vista.label}</div>
      <p style={{ margin: 0, fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>{vista.frase}</p>

      {dato && (
        <div className="vib-tarjeta-dato">
          <span style={{ fontSize: 11.5, color: t.textFaint }}>Ahora mismo</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: t.text, fontFamily: MONO }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: estadoColor(dark, dato.estado) }} />
            {dato.texto}
          </span>
        </div>
      )}
    </button>
  );
}

/** El pipeline, revelado al entrar en vista — igual que en la otra portada. */
function ComoFunciona({ t, lastUpdated }) {
  const [ref, visible] = useEnVista();

  return (
    // El `paddingBottom` aleja la fila del botón flotante del asistente, que
    // vive en esa esquina: mismo remedio vertical que en `InicioTanque`, donde
    // reservar ANCHO rompía el título de algún nodo cada vez.
    <section ref={ref} style={{ paddingBottom: 70 }}>
      <SectionLabel sub="El camino que hace cada número antes de llegar a esta pantalla">
        Cómo funciona
      </SectionLabel>

      <div className={`vib-inicio-pipeline${visible ? " vib-inicio-pipeline--visible" : ""}`}>
        {NODOS_PIPELINE.map((nodo, i) => (
          <div key={nodo.id} className="vib-inicio-pipeline__paso" style={{ animationDelay: visible ? `${0.1 + i * 0.08}s` : "0s" }}>
            <div className="vib-inicio-pipeline__nodo" style={{ background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 9, background: t.gradAccent, color: "#FFFFFF", flexShrink: 0 }}>
                <nodo.Icono size={19} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, fontFamily: SANS }}>{nodo.titulo}</div>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: t.textSoft, lineHeight: 1.45 }}>{nodo.detalle}</p>
              </div>
            </div>

            {i < NODOS_PIPELINE.length - 1 && (
              <div className="vib-inicio-pipeline__enlace" aria-hidden="true">
                <svg width="100%" height="16" viewBox="0 0 100 16" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
                  <line x1="0" y1="8" x2="100" y2="8" stroke={t.border} strokeWidth="2" />
                  {/* Un DISPARO por lectura, no un bucle: el punto viaja una
                      vez cada vez que `lastUpdated` cambia, que es cuando de
                      verdad llegó un paquete nuevo. */}
                  {lastUpdated && (
                    <circle key={lastUpdated.getTime()} cx="0" cy="8" r="3.5" fill={t.accent} className="vib-inicio-pipeline__paquete" />
                  )}
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── La vista ──────────────────────────────────────────────────────── */

function InicioVibraciones({ onNavigate }) {
  const { theme: t, dark } = useTheme();
  const { canales, variador, alarmas, error, lastUpdated, puntosSinDato, puntosPedidos } =
    useVibracion();

  const res = useMemo(
    () => evaluarRiesgosVibracion({ canales, variador, alarmas }),
    [canales, variador, alarmas],
  );

  const mudos = puntosSinDato?.length ?? 0;
  const total = puntosPedidos ?? 0;
  const contestan = Math.max(0, total - mudos);

  /*
   * `puntosPedidos` sólo lo escribe el camino de éxito del hook: vale 0
   * mientras no haya llegado una lectura completa, y también si la petición
   * falló. Por eso la guarda mira `lastUpdated` —hubo o no hubo lectura— y no
   * `total`: con `!total` la cifra se quedaría en «···» para siempre en
   * cuanto el módulo dejara de contestar, que es justo cuando importa.
   */
  const hayLectura = Boolean(lastUpdated);

  /*
   * El PEOR veredicto que se pueda afirmar ahora mismo, o ninguno. El peor y
   * no un promedio: una media entre un apoyo en zona A y otro en zona D daría
   * un número tranquilizador que no describe a ninguno de los dos.
   */
  const peor = useMemo(() => {
    const veredictos = CANALES
      .map((c) => bandaISO(canales?.[c.id]?.vRMS, res.normaAplicable))
      .filter(Boolean);
    return veredictos.length ? veredictos.reduce((a, b) => (b.zona > a.zona ? b : a)) : null;
  }, [canales, res.normaAplicable]);

  /*
   * Cuántos apoyos tienen APAGADO el diagnóstico de rodamiento. Es el
   * hallazgo que motivó media pantalla de este módulo: BPFO, BPFI y FTF son
   * el único diagnóstico que distingue un rodamiento picado de una máquina
   * que vibra un poco más, y estaban apagadas en los tres sin que nada lo
   * delatara.
   */
  const sinVigilar = useMemo(() => {
    const claves = VIGILANCIAS.filter((v) => v.grupo === "rodamiento").map((v) => v.key);
    return CANALES.filter((c) =>
      claves.some((k) => canales?.[c.id]?.vigilancias?.[k]?.id === "apagado")
    ).length;
  }, [canales]);

  const contexto = { res, peor, contestan, total };

  return (
    <>
      <style>{REJILLA}</style>

      <div className="vib-inicio">
        <section
          className="vib-inicio-hero"
          style={{
            // Mismo gradiente de tres paradas que el otro hero, con la parada
            // intermedia en `accent` en vez de `heroAgua`: ese tono cian-verde
            // es de agua, y esta máquina no la mueve.
            background: `radial-gradient(120% 100% at 50% 0%, ${t.accentSoft} 0%, ${t.accent}14 42%, ${t.page} 78%)`,
            border: `1px solid ${t.border}`,
          }}
        >
          <div className="blob" style={{ width: 340, height: 340, background: t.blob1, top: -160, left: -80 }} />
          <div className="blob" style={{ width: 280, height: 280, background: t.blob2, bottom: -140, right: -60, animationDelay: "-6s" }} />

          <TrazoApoyos contestan={contestan} total={total} t={t} />

          <div style={{ position: "relative", zIndex: 1 }}>
            {!error && (
              <div className="vib-inicio-hero__badge" style={{ display: "flex", marginBottom: 18 }}>
                <UltimaLectura fecha={lastUpdated} t={t} grande />
              </div>
            )}

            <CifraEnVivo
              contestan={contestan} total={total}
              hayLectura={hayLectura} error={error} t={t}
            />
            {!error && (
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, color: t.textSoft, marginTop: 8 }}>
                {hayLectura ? "puntos que entregan lectura, ahora mismo" : "conectando con el módulo de vibraciones…"}
              </div>
            )}

            <p className="vib-inicio-hero__frase" style={{ color: t.textSoft }}>
              Ésta es <strong>otra máquina</strong>: su propio motor, su propio variador y su
              propio PLC.  Y este sistema todavía no se usa el histórico: lo que se ve es el instante, sin tendencias.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="primary" icon={<ArrowRight size={15} />} onClick={() => onNavigate?.("eva-vibraciones")}>
                Entrar a Gráficas
              </Button>
              <Button variant="ghost" icon={<ShieldAlert size={15} />} onClick={() => onNavigate?.("eva-riesgos-vibracion")}>
                Ver los riesgos ahora
              </Button>
            </div>
          </div>
        </section>

        {/*
          Va DEBAJO del hero y no dentro: es una advertencia sobre lo que la
          instalación no está mirando, no sobre lo que el hero acaba de decir.
          Sólo aparece si de verdad hay apoyos sin vigilar — un aviso fijo se
          convierte en parte del decorado y deja de leerse.
        */}
        {sinVigilar > 0 && (
          <div
            style={{
              display: "flex", gap: 11, padding: "14px 16px", borderRadius: 12,
              background: t.amberSoft, border: `1px solid ${t.amber}33`,
            }}
          >
            <ShieldAlert size={17} color={t.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>
                Nadie está vigilando los rodamientos
              </div>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: t.textSoft, lineHeight: 1.55 }}>
                En {sinVigilar} de los {CANALES.length} apoyos, las frecuencias de defecto
                (BPFO, BPFI, FTF) están apagadas en el módulo. Son el único diagnóstico que
                distingue un rodamiento picándose de una máquina que vibra un poco más: sin
                ellas, un rodamiento en mal estado sólo se verá cuando ya haya movido el valor
                eficaz, que es bastante más tarde.
              </p>
            </div>
          </div>
        )}

        <SectionLabel sub="La misma máquina, tres lentes distintas">
          Tres formas de verlo
        </SectionLabel>

        <div className="vib-inicio-grid">
          {VISTAS.map((vista, i) => (
            <TarjetaVista
              key={vista.id} vista={vista} contexto={contexto} dark={dark}
              onNavigate={onNavigate} t={t} delay={0.15 + i * 0.06}
            />
          ))}
        </div>

        <ComoFunciona t={t} lastUpdated={lastUpdated} />

        <p style={{ margin: "-16px 0 0", fontSize: 11, color: t.textFaint, lineHeight: 1.6, paddingBottom: 8 }}>
          La banda de ISO 10816-1 Clase I —{LIMITES_ISO.nueva} / {LIMITES_ISO.aviso} / {LIMITES_ISO.alarma} mm/s—
          es la que aplica a este motor por su potencia (1,5 kW), no la de 10816-3 que se usa
          a partir de 15 kW. Con aquélla el aviso caería en 4,5 mm/s y se perdería la mitad
          del margen.
        </p>
      </div>
    </>
  );
}

export default InicioVibraciones;
