/**
 * La portada del tipo `sensado`: las tomas de planta de un vistazo — Plan 46 F4.
 *
 * ── QUÉ SE PIDIÓ, Y POR QUÉ ESO MANDA AQUÍ ────────────────────────
 *
 * «El objetivo de esta nueva máquina importa mucho la visualización, por lo
 * que las vistas que se generen será importante que cuenten con animaciones,
 * limpieza e impacto visual.» Es una pantalla de muro: se mira de lejos y no
 * se toca, así que las cifras son grandes y el movimiento sirve para que el
 * ojo encuentre lo que cambió, no para decorar.
 *
 * ── LAS TRES REGLAS QUE LA ANIMACIÓN NO ROMPE ─────────────────────
 *
 * 1. **Un hueco NUNCA se anima como un cero.** `CLAUDE.md` §2.4. Si el punto
 *    no contestó, la pieza se apaga y lo dice. Animar hasta cero se leería
 *    como «hay cero amperios» cuando significa «no sé», y en una pantalla de
 *    muro no hay nadie a quien preguntarle.
 * 2. **`prefers-reduced-motion` se respeta.** Quien lo pide ve los mismos
 *    números, puestos de golpe.
 * 3. **Sin dependencia nueva.** `CLAUDE.md` §6.2. Todo es CSS y
 *    `requestAnimationFrame`; una librería de animación tendría que ganarse
 *    su sitio con algo más que esto.
 *
 * ── LAS ESCALAS NO SALEN DE LO QUE SE VE HOY ──────────────────────
 *
 * Las diez señales publican hoy una CONSTANTE de prueba (un dígito del 1 al
 * 9). Ajustar los medidores a eso daría una pantalla bonita hoy y ridícula el
 * día que lleguen valores reales: 7 lux y 7 A no se parecen en nada. Los
 * extremos salen del rango declarado del rol (`tipo.bandaDe`), que es del tipo
 * y no de la lectura.
 *
 * ── LA FRANJA DE CONFORT NO ES UNA ALARMA ─────────────────────────
 *
 * Las de ambiente traen `confort` —18–26 °C, 400–1000 ppm—. Se dibuja como
 * REFERENCIA y nunca en color de alarma: no sale de una norma ni de una
 * calibración, y pintar de rojo un CO₂ alto por encima de un umbral que nadie
 * calibró es exactamente lo que `CLAUDE.md` §2.5 prohíbe. El tipo lo declara
 * así de explícito: `bandaDe(rol).esUmbral === false`.
 *
 * ── SIN TENDENCIA, Y POR ESO SON MEDIDORES ────────────────────────
 *
 * Ninguna serie está verificada (Plan 46 F3: las diez son constantes y no hay
 * testigo), así que `HISTORICAL_DATA` está apagado y no hay evolución que
 * dibujar. Las piezas se sostienen con el VALOR ACTUAL a propósito: una vista
 * pensada para líneas temporales se quedaría vacía. Si el historiador se
 * verifica más adelante, la evolución se añade encima sin rehacer esto.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Lightbulb, Thermometer, Zap } from "lucide-react";

import { SectionLabel } from "@/components/ui/index.js";
import { declararContextoDeVista } from "@/features/asistente/lib/contextoDeVista.js";
import { useTheme } from "@/theme";
import { toNumber } from "@shared/valores.js";

import { useEstadoDeMaquina } from "../../data/comunes/useEstadoDeMaquina.js";
import { UltimaLectura } from "../../components/base.jsx";

/* ───────────────────────────────────────────────────────────────────── */
/* Movimiento                                                            */
/* ───────────────────────────────────────────────────────────────────── */

/**
 * ¿Quien mira ha pedido que no haya movimiento?
 *
 * Se consulta en vivo —no una sola vez al montar— porque se puede cambiar sin
 * recargar, y una pantalla de muro puede estar semanas abierta.
 */
function useSinMovimiento() {
  const [sin, setSin] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const alCambiar = (e) => setSin(e.matches);
    mq.addEventListener?.("change", alCambiar);
    return () => mq.removeEventListener?.("change", alCambiar);
  }, []);

  return sin;
}

/**
 * Un número que VIAJA hasta su valor en vez de saltar.
 *
 * ── POR QUÉ `null` NO SE INTERPOLA ────────────────────────────────
 *
 * Es la regla 1 de la cabecera, y aquí es donde se cumple: con `valor === null`
 * el hook devuelve `null` y no el último número que tuvo. Interpolar «desde
 * 12,4 hasta nada» dibujaría una cuenta atrás hasta cero que se lee como una
 * caída real de la señal. Cuando el dato vuelve, se entra desde donde estaba,
 * que sí es continuo de verdad.
 *
 * 420 ms y `easeOut`: lo bastante para que el ojo siga el cambio, lo bastante
 * poco para que dos lecturas seguidas no se solapen.
 */
function useNumeroAnimado(valor, sinMovimiento) {
  const [mostrado, setMostrado] = useState(valor);
  const desdeRef = useRef(valor);
  const cuadroRef = useRef(0);

  useEffect(() => {
    if (valor === null || valor === undefined) {
      setMostrado(null);
      /* `desde` NO se pone a cero: al volver el dato se entra desde el último
         valor bueno, no desde un cero que nunca se midió. */
      cancelAnimationFrame(cuadroRef.current);
      return undefined;
    }
    if (sinMovimiento || desdeRef.current === null || desdeRef.current === undefined) {
      desdeRef.current = valor;
      setMostrado(valor);
      return undefined;
    }

    const desde = desdeRef.current;
    const delta = valor - desde;
    if (delta === 0) return undefined;

    const inicio = performance.now();
    const DURACION = 420;

    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / DURACION);
      const suave = 1 - (1 - t) ** 3;
      setMostrado(desde + delta * suave);
      if (t < 1) cuadroRef.current = requestAnimationFrame(paso);
      else desdeRef.current = valor;
    };
    cuadroRef.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadroRef.current);
  }, [valor, sinMovimiento]);

  return mostrado;
}

/* ───────────────────────────────────────────────────────────────────── */
/* Piezas                                                                */
/* ───────────────────────────────────────────────────────────────────── */

/** El número, con sus decimales y su unidad; o el hueco, que se ve distinto. */
function Cifra({ senal, t, sinMovimiento, tamano = 38 }) {
  /*
   * ── SE VUELVE A SANEAR AQUÍ, Y NO SOBRA (Plan 46 F6.1) ────────────
   *
   * El tipo ya devuelve `number | null` —`toNumber` en su frontera—, así que
   * esto no debería hacer falta. Está por lo que pasó el 26-09-2026: ICONICS
   * entrega sus lecturas como CADENA (`"7"`), el tipo las pasaba tal cual y
   * `valor.toFixed(...)` **tumbaba la pantalla entera**. Un tablero de muro
   * que se cae por un tipo de dato es el peor fallo posible: no degrada, no
   * avisa, desaparece.
   *
   * Dos líneas para que ningún tipo futuro pueda repetirlo. Y `toNumber`
   * convierte lo que no es número en `null`, que esta pieza ya sabe pintar
   * como hueco: nunca en un cero (`CLAUDE.md` §2.4).
   */
  const crudo = senal.sinDato ? null : toNumber(senal.valor);
  const animado = useNumeroAnimado(crudo, sinMovimiento);

  if (senal.sinDato || animado === null) {
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: tamano, fontWeight: 700, color: t.textFaint, lineHeight: 1 }}>—</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
      <span
        style={{
          fontSize: tamano,
          fontWeight: 700,
          color: t.text,
          lineHeight: 1,
          /* Sin esto el ancho baila en cada cuadro y el número tiembla. */
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {animado.toFixed(senal.decimales ?? 0)}
      </span>
      {senal.unidad && (
        <span style={{ fontSize: Math.round(tamano * 0.4), fontWeight: 600, color: t.textSoft }}>{senal.unidad}</span>
      )}
    </div>
  );
}

/** «sin dato» con su motivo, que es lo que hay que leer cuando no hay número. */
function Hueco({ senal, t, traducir }) {
  if (!senal.sinDato) return null;
  return (
    <div style={{ fontSize: 11.5, color: t.amber, marginTop: 4 }} title={senal.motivo ?? ""}>
      {traducir("machines:sensing.noData")}
    </div>
  );
}

/**
 * La DONA de corriente: un anillo por línea.
 *
 * Se llama dona porque así la llama planta —el sensor es una dona de corriente
 * que abraza el cable—, y dibujarla como un anillo es la forma más corta de
 * que quien la conoce la reconozca desde lejos.
 *
 * Anillos concéntricos y no tres donas separadas: las tres fases de una misma
 * acometida se leen juntas —lo que importa es si van parejas— y separarlas
 * obligaría a comparar tres cifras en tres sitios.
 */
function Dona({ senales, t, sinMovimiento, traducir, titulo, icono: Icono, nota }) {
  const R = 54;
  const GROSOR = 9;
  const SEP = 13;

  return (
    <article
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icono size={16} color={t.accent} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>{titulo}</h3>
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <svg width={(R + GROSOR) * 2} height={(R + GROSOR) * 2} role="presentation" style={{ flexShrink: 0 }}>
          {senales.map((s, i) => {
            const radio = R - i * SEP;
            const circ = 2 * Math.PI * radio;
            const [min, max] = s.escala ?? [0, 100];
            const bruto = s.sinDato ? 0 : ((toNumber(s.valor) ?? min) - min) / (max - min || 1);
            const frac = Math.max(0, Math.min(1, bruto));
            const cx = R + GROSOR;
            return (
              <g key={s.rol} transform={`rotate(-90 ${cx} ${cx})`}>
                {/* La pista: dice hasta dónde LLEGARÍA, y por eso el arco se lee. */}
                <circle cx={cx} cy={cx} r={radio} fill="none" stroke={t.border} strokeWidth={GROSOR} />
                {!s.sinDato && (
                  <circle
                    cx={cx}
                    cy={cx}
                    r={radio}
                    fill="none"
                    stroke={t.accent}
                    strokeWidth={GROSOR}
                    /*
                     * ── SIN `round` EN ARCOS MUY CORTOS (Plan 46 F6.2) ───
                     *
                     * Con `strokeLinecap="round"` los dos extremos redondeados
                     * se solapan cuando el arco es pequeño, y una lectura del
                     * 3 % se dibuja como un guion suelto flotando: se lee como
                     * un defecto de pintado, no como un valor bajo. Medido en
                     * planta con 3 A sobre una escala de 0–100 A.
                     *
                     * `butt` corta recto y un arco corto sigue pareciendo un
                     * arco corto. Se redondea sólo cuando hay sitio.
                     */
                    strokeLinecap={frac > 0.04 ? "round" : "butt"}
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - frac)}
                    /* La transición la hace el navegador: es una propiedad
                       animable y no hace falta un bucle propio. */
                    style={sinMovimiento ? undefined : { transition: "stroke-dashoffset 420ms cubic-bezier(.22,.61,.36,1)" }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          {senales.map((s) => (
            <li key={s.rol} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.3 }}>
                {s.label}
              </div>
              <Cifra senal={s} t={t} sinMovimiento={sinMovimiento} tamano={26} />
              <Hueco senal={s} t={t} traducir={traducir} />
              {/* De cuánto es el anillo: sin esto, un arco del 3 % no se puede
                  interpretar — ver `TarjetaAmbiente`. */}
              {s.escala && (
                <div style={{ fontSize: 10, color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>
                  {s.escala[0]}–{s.escala[1]}{s.unidad ? ` ${s.unidad}` : ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {nota && <p style={{ margin: 0, fontSize: 11.5, color: t.textFaint }}>{nota}</p>}
    </article>
  );
}

/**
 * Una lectura de ambiente: número grande y, si el rol la declara, su franja de
 * confort como referencia.
 *
 * La franja se dibuja en la barra con el color suave del acento, NUNCA en
 * coral ni ámbar: ver la cabecera. Y el punto del valor se pinta del color del
 * texto, no de un color de estado, porque aquí no hay estado que dar.
 */
function TarjetaAmbiente({ senal, t, sinMovimiento, traducir }) {
  const [min, max] = senal.escala ?? [0, 100];
  const rango = max - min || 1;
  const pos = senal.sinDato ? null : Math.max(0, Math.min(1, ((toNumber(senal.valor) ?? min) - min) / rango));
  const confort = senal.confort
    ? { desde: Math.max(0, (senal.confort[0] - min) / rango), hasta: Math.min(1, (senal.confort[1] - min) / rango) }
    : null;

  return (
    <article
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {senal.label}
      </div>

      <Cifra senal={senal} t={t} sinMovimiento={sinMovimiento} />
      <Hueco senal={senal} t={t} traducir={traducir} />

      {senal.escala && (
        <div style={{ marginTop: 2 }}>
          {/*
            ── LOS EXTREMOS SE ESCRIBEN (Plan 46 F6.2) ──────────────────
            Sin ellos, una barra casi vacía no se puede interpretar: 2 sobre
            una escala de 0–2000 y 2 sobre una de 0–10 se ven igual, y quien
            mira no tiene forma de saber cuál es. Escribir los extremos es lo
            que convierte la barra en una medida en vez de un adorno — y no
            se tocan las escalas para que «se vean mejor», que es lo que este
            plan advierte en §4 que NO hay que hacer.
          */}
          <div style={{ position: "relative", height: 6, borderRadius: 999, background: t.hover }}>
            {confort && (
              <span
                title={traducir("machines:sensing.comfortRange", {
                  desde: senal.confort[0],
                  hasta: senal.confort[1],
                  unidad: senal.unidad ?? "",
                })}
                style={{
                  position: "absolute",
                  left: `${confort.desde * 100}%`,
                  width: `${(confort.hasta - confort.desde) * 100}%`,
                  top: 0,
                  bottom: 0,
                  background: t.accentSoft,
                }}
              />
            )}
            {pos !== null && (
              /*
               * ── EL MARCADOR NO SOBRESALE (Plan 46 F6.2) ────────────
               *
               * Llevaba `top: -2` y `height: 10` dentro de una pista de 6 px
               * con `overflow: hidden`: el navegador le cortaba los 2 px de
               * arriba y los 2 de abajo, y el marcador se veía como una raya
               * partida. Ahora cabe dentro, y la pista ya no necesita recortar
               * nada.
               */
              <span
                style={{
                  position: "absolute",
                  left: `${pos * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  borderRadius: 2,
                  background: t.text,
                  transform: "translateX(-50%)",
                  ...(sinMovimiento ? {} : { transition: "left 420ms cubic-bezier(.22,.61,.36,1)" }),
                }}
              />
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: t.textFaint,
              marginTop: 3,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{min}</span>
            <span>{max}</span>
          </div>

          {/*
            La advertencia «esto es una referencia, no un umbral» NO va aquí.
            Repetida en cada tarjeta ocupaba tres líneas de las cuatro y
            competía con el número, que es lo que se mira desde lejos. Va una
            sola vez bajo el rótulo de la sección: dice lo mismo y se lee mejor
            (Plan 46 F6.2). El rango exacto sigue en el `title` de la franja.
          */}
        </div>
      )}
    </article>
  );
}

/**
 * El medidor de iluminación: la pieza más visible, y con motivo.
 *
 * El sensor de luz «estará ubicado en la demo», así que es el único que la
 * gente va a ver REACCIONAR en vivo —tapándolo con la mano—. Merece responder
 * de forma inmediata y grande: un arco de 240° que se llena, con el halo
 * creciendo con la lectura.
 */
function Luz({ senal, bateria, t, sinMovimiento, traducir }) {
  const [min, max] = senal.escala ?? [0, 1000];
  const frac = senal.sinDato ? 0 : Math.max(0, Math.min(1, ((toNumber(senal.valor) ?? min) - min) / (max - min || 1)));

  const R = 74;
  const ANCHO = 14;
  const ARCO = 240;
  const cx = R + ANCHO;
  const circ = 2 * Math.PI * R;
  const visible = circ * (ARCO / 360);

  return (
    <article
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
        <Lightbulb size={16} color={t.accent} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>{senal.label}</h3>
      </header>

      <div style={{ position: "relative", width: cx * 2, height: R + ANCHO * 2 + 10 }}>
        {/* El halo: crece con la lectura. Es lo que se ve desde lejos. */}
        {!senal.sinDato && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: R * 0.55,
              width: 96,
              height: 96,
              marginLeft: -48,
              borderRadius: "50%",
              background: t.amber,
              opacity: 0.06 + frac * 0.3,
              filter: "blur(22px)",
              ...(sinMovimiento ? {} : { transition: "opacity 420ms ease-out" }),
            }}
          />
        )}

        <svg width={cx * 2} height={R + ANCHO * 2 + 10} role="presentation" style={{ position: "relative" }}>
          <g transform={`rotate(150 ${cx} ${cx})`}>
            <circle
              cx={cx}
              cy={cx}
              r={R}
              fill="none"
              stroke={t.border}
              strokeWidth={ANCHO}
              strokeLinecap="round"
              strokeDasharray={`${visible} ${circ}`}
            />
            {!senal.sinDato && (
              <circle
                cx={cx}
                cy={cx}
                r={R}
                fill="none"
                stroke={t.amber}
                strokeWidth={ANCHO}
                strokeLinecap="round"
                strokeDasharray={`${visible * frac} ${circ}`}
                style={sinMovimiento ? undefined : { transition: "stroke-dasharray 420ms cubic-bezier(.22,.61,.36,1)" }}
              />
            )}
          </g>
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 6,
          }}
        >
          <Cifra senal={senal} t={t} sinMovimiento={sinMovimiento} tamano={44} />
          <Hueco senal={senal} t={t} traducir={traducir} />
          {/* De cuánto es el arco — ver `TarjetaAmbiente`. */}
          {senal.escala && (
            <div style={{ fontSize: 10.5, color: t.textFaint, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              {senal.escala[0]}–{senal.escala[1]}{senal.unidad ? ` ${senal.unidad}` : ""}
            </div>
          )}
        </div>
      </div>

      {bateria && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "stretch", marginTop: 2 }}>
          <span style={{ fontSize: 11, color: t.textFaint, flexShrink: 0 }}>{bateria.label}</span>
          <div style={{ flex: 1, height: 5, borderRadius: 999, background: t.hover, overflow: "hidden", minWidth: 0 }}>
            {!bateria.sinDato && (
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${Math.max(0, Math.min(100, toNumber(bateria.valor) ?? 0))}%`,
                  background: t.success,
                  ...(sinMovimiento ? {} : { transition: "width 420ms ease-out" }),
                }}
              />
            )}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: t.textSoft, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {bateria.sinDato ? "—" : `${Math.round(toNumber(bateria.valor) ?? 0)} %`}
          </span>
        </div>
      )}
    </article>
  );
}

/* ───────────────────────────────────────────────────────────────────── */

export default function InicioSensado() {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["machines", "common"]);
  const sinMovimiento = useSinMovimiento();
  const { estado, maquina, lastUpdated, loading } = useEstadoDeMaquina();

  const senales = useMemo(() => estado?.senales ?? [], [estado]);
  const de = (familia) => senales.filter((s) => s.familia === familia);

  const trifasica = useMemo(
    () => ["electrica:corrienteL1", "electrica:corrienteL2", "electrica:corrienteL3"]
      .map((rol) => senales.find((s) => s.rol === rol))
      .filter(Boolean),
    [senales],
  );
  const mono = senales.find((s) => s.rol === "electrica:corrienteMono");
  const luz = senales.find((s) => s.rol === "optica:iluminacion");
  const bateria = senales.find((s) => s.rol === "optica:bateria");
  const ambiente = de("ambiente");

  /*
   * Qué máquina se tiene delante, para que «¿y esto que veo?» se resuelva sin
   * que la persona la nombre.
   *
   * SÓLO el id: ese canal admite identificadores y nunca valores —ni una
   * medida, ni un promedio—, y quien lo consuma leerá el dato por su cuenta.
   * Ver la cabecera de `contextoDeVista.js`: un `resumen` con lecturas dentro
   * lo rechazaría el backend, y la pregunta se quedaría sin contexto por un
   * descuido silencioso.
   */
  useEffect(
    () => (maquina ? declararContextoDeVista({ sistema: maquina.id }) : undefined),
    [maquina],
  );

  const conDato = senales.filter((s) => !s.sinDato).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: t.text }}>{maquina?.nombre ?? ""}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textSoft }}>
            {traducir("machines:sensing.subtitle", { conDato, total: senales.length })}
          </p>
        </div>
        <UltimaLectura fecha={lastUpdated} t={t} />
      </header>

      {loading && !senales.length && (
        <p style={{ margin: 0, fontSize: 13, color: t.textFaint }}>{traducir("common:states.loading")}</p>
      )}

      {Boolean(trifasica.length || mono) && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel sub={traducir("machines:sensing.currentSub")}>
            {traducir("machines:sensing.current")}
          </SectionLabel>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {trifasica.length > 0 && (
              <Dona
                senales={trifasica}
                t={t}
                sinMovimiento={sinMovimiento}
                traducir={traducir}
                titulo={traducir("machines:sensing.threePhase")}
                icono={Zap}
                nota={traducir("machines:sensing.threePhaseNote")}
              />
            )}
            {mono && (
              <Dona
                senales={[mono]}
                t={t}
                sinMovimiento={sinMovimiento}
                traducir={traducir}
                titulo={traducir("machines:sensing.singlePhase")}
                icono={Activity}
                nota={traducir("machines:sensing.singlePhaseNote")}
              />
            )}
          </div>
        </section>
      )}

      {ambiente.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* La advertencia va UNA vez, aquí: ver `TarjetaAmbiente`. */}
          <SectionLabel sub={`${traducir("machines:sensing.ambientSub")} · ${traducir("machines:sensing.reference")}`}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Thermometer size={15} />
              {traducir("machines:sensing.ambient")}
            </span>
          </SectionLabel>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
            {ambiente.map((s) => (
              <TarjetaAmbiente key={s.rol} senal={s} t={t} sinMovimiento={sinMovimiento} traducir={traducir} />
            ))}
          </div>
        </section>
      )}

      {luz && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel sub={traducir("machines:sensing.lightSub")}>
            {traducir("machines:sensing.light")}
          </SectionLabel>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <Luz senal={luz} bateria={bateria} t={t} sinMovimiento={sinMovimiento} traducir={traducir} />
          </div>
        </section>
      )}

      {!loading && senales.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: t.textSoft }}>{traducir("machines:sensing.empty")}</p>
      )}
    </div>
  );
}
