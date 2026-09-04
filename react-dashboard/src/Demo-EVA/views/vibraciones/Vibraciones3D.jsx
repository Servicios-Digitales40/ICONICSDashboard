/**
 * Vista «Vista 3D» del SISTEMA DE VIBRACIONES — el banco de rotor.
 *
 * ── QUÉ DESBLOQUEÓ ESTA PANTALLA ───────────────────────────────────
 *
 * Estuvo vacía a propósito hasta el 04-09-2026, y su cabecera de entonces
 * decía exactamente qué faltaba: «la GEOMETRÍA del motor con sus tres apoyos
 * ubicados donde están de verdad — no un motor cualquiera con tres puntos
 * repartidos, porque la posición es justamente lo que esta vista aportaría
 * sobre la tabla de la pantalla Gráficas».
 *
 * El levantamiento de campo de I+D+i («Reporte técnico de activos — Bancos
 * didácticos TDCON 4.0», 02-09-2026, §3.2 y §3.3) la da. Y da algo que nadie
 * esperaba: **no son tres apoyos de un motor, es un tren de rotor**, y sólo la
 * primera sonda está sobre el motor. Las otras dos están en dos chumaceras que
 * flanquean un disco de desbalance. Ver la cabecera de
 * `shared/eva/vibraciones/vibraciones.js`, donde eso obligó a corregir el
 * rodamiento que se le atribuía a S3.
 *
 * La otra pregunta que aquella cabecera dejaba abierta —«qué se pinta cuando un
 * apoyo NO contesta»— ya tenía respuesta en el proyecto y aquí se cumple sin
 * inventar nada: modelo en malla de alambre, translúcido y con la baliza
 * apagada, igual que un activo sin dato en la maqueta del tanque. Ver
 * `three-d/lib/comportamiento.js`.
 *
 * ── POR QUÉ ESTA VISTA NO ES LA TABLA DE «GRÁFICAS» EN 3D ──────────
 *
 * Porque no repite sus números: los ordena en el espacio y añade las dos cosas
 * que una tabla no puede decir.
 *
 *   1. **DÓNDE mide cada canal.** «Lado libre» y «rodamiento intermedio» son
 *      nombres que el servidor publica y que no dicen dónde está la sonda; una
 *      fila de tabla los deja igual de opacos. Aquí se ve que S2 y S3 no están
 *      en el motor, y se ve el disco de desbalance entre las dos — que es la
 *      razón de que un desequilibrio suba en las dos a la vez.
 *   2. **EN QUÉ DIRECCIÓN mide, y en cuáles no.** Las tres sondas son
 *      verticales y sólo verticales. Eso no aparece en ningún número, acota lo
 *      que este módulo puede diagnosticar, y aquí se dibuja: flecha sólida
 *      para el eje que se mide, fantasma para los dos que faltan. El
 *      razonamiento completo está en `EJES_MEDIDA`.
 *
 * ── EL GIRO ES DATO, NO ANIMACIÓN ──────────────────────────────────
 *
 * El eje gira a `SPEED_BMS`, y se para cuando el variador deja de publicarla.
 * Es el mismo principio que hace que valga la pena la maqueta del tanque, donde
 * el líquido de la columna ES el nivel en vivo. Ver `rpmEjeDe` en
 * `three-d/lib/rotor.js`, y por qué —a diferencia del tanque— aquí no hay
 * ritmo nominal de reserva.
 */
import { useMemo, useState } from "react";
import { LineChart, Ruler } from "lucide-react";

import { AlertBanner, Panel, SectionLabel } from "@/components/ui/index.js";
import Encuadre from "@/features/three-d/components/Encuadre.jsx";
import Escena from "@/features/three-d/components/Escena.jsx";
import Piso from "@/features/three-d/components/Piso.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";
import { usePrefersReducedMotion } from "@/lib/motion.js";
import { useMediaQuery } from "@/lib/viewport.js";
import { useTheme } from "@/theme";

import { PuntoEstado } from "../../components/base.jsx";
import { estadoColor } from "../../components/paleta.js";
import { useVibracion } from "../../data/vibraciones/vibracion.js";
import { ESTADOS_ORDEN, estadoInfo } from "../../domain/estado.js";
import {
  ACELEROMETRO,
  CANAL,
  EJE,
  EJES_MEDIDA,
  LIMITES_ISO,
  MEDIDAS,
  RPM_MINIMA_ISO,
  TREN_MECANICO,
  bandaISO,
} from "../../domain/vibraciones.js";
import {
  comportamiento,
  comportamientoReducido,
  frameloopDe,
} from "../../three-d/lib/comportamiento.js";
import {
  ALTURA_BANCADA,
  ALTURA_EJE,
  ALTURA_EJE_MONTAJE,
  BANCADA,
  EJE_DESDE,
  EJE_HASTA,
  ENCUADRES,
  POSICION_X,
  RADIO_PISO,
  estadoDeApoyo,
  normaAplicableDe,
  rpmEjeDe,
} from "../../three-d/lib/rotor.js";
import AcelerometroModel from "../../three-d/components/AcelerometroModel.jsx";
import BancadaRanuradaModel from "../../three-d/components/BancadaRanuradaModel.jsx";
import ChumaceraModel, { SONDA_OFFSET } from "../../three-d/components/ChumaceraModel.jsx";
import EjeRotorModel from "../../three-d/components/EjeRotorModel.jsx";
import MotorWEGModel, {
  SONDA_S1_ALTURA,
  SONDA_S1_OFFSET_X,
} from "../../three-d/components/MotorWEGModel.jsx";

/* ── La escena ────────────────────────────────────────────────────── */

/**
 * Un elemento del tren, plantado en su sitio con su estado.
 *
 * Los que NO llevan canal —acoplamiento, disco, extremo libre— no reciben
 * estado propio y se dibujan dentro del grupo que gira (`EjeRotorModel`): son
 * parte del rotor, no soportes que se midan. Aquí sólo entran los tres que sí
 * tienen sonda.
 */
function ApoyoInstrumentado({ elemento, descriptor, ejes, seleccionado, onSeleccionar }) {
  const P = usePaleta3D();
  const x = POSICION_X[elemento.id];
  const esMotor = elemento.tipo === "motor";

  /*
   * Dónde se atornilla la sonda, relativo al plano de montaje.
   *
   * La chumacera publica el punto entero porque su tapa está a una altura que
   * sólo ella conoce. El motor publica X y radio por separado: su sonda va
   * sobre la generatriz superior de la carcasa, así que la cota depende de la
   * altura del eje —que es un dato de la ESCENA— y de su radio —que es de la
   * pieza—. Componerla aquí es lo que evita que el modelo del motor tenga que
   * saber a qué altura corre el eje de este banco en concreto.
   */
  const sonda = esMotor
    ? [SONDA_S1_OFFSET_X, ALTURA_EJE_MONTAJE + SONDA_S1_ALTURA, 0]
    : SONDA_OFFSET;

  /* El `onClick` va en el grupo entero —soporte más sonda— y no sólo en la
     sonda: en un monitor táctil, un cilindro de 5 cm de radio es un blanco
     imposible, y el soporte es lo que la mano busca.

     El grupo se planta sobre la BANCADA y no en el suelo: es donde se
     atornillan las piezas de verdad, y es lo que hace que las tres cotas
     verticales de `lib/rotor.js` cuadren. */
  return (
    <group
      position={[x, ALTURA_BANCADA, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSeleccionar(elemento.id);
      }}
    >
      {esMotor ? (
        <MotorWEGModel descriptor={descriptor} alturaEje={ALTURA_EJE_MONTAJE} />
      ) : (
        <ChumaceraModel descriptor={descriptor} />
      )}

      <AcelerometroModel
        descriptor={descriptor}
        ejes={ejes}
        // La baliza ya la lleva el soporte. Dos por apoyo serían dos luces
        // diciendo lo mismo, y la regla es que el estado se diga una vez.
        baliza={false}
        position={sonda}
      />

{/*
        Anillo en el suelo del apoyo seleccionado. Es la única marca de
        selección de la escena: un contorno de malla no se ve a contraluz, y
        cambiar el color del soporte pisaría el color del estado.

        Va en `accent` —el color de lo accionable— y no en un semántico:
        «seleccionado» es una decisión de quien mira, no un estado de la
        máquina. Pintarlo de verde o de ámbar metería un cuarto color con
        significado en una escena cuyo vocabulario de color ya está repartido.
      */}
      {seleccionado && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.36, 0.42, 32]} />
          <meshBasicMaterial color={P.accent} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* ── Piezas 2D ────────────────────────────────────────────────────── */

/** Leyenda de estados, con los que hay ahora mismo. Igual que en la maqueta. */
function Leyenda({ estados, t, dark }) {
  const presentes = useMemo(() => {
    const cuenta = new Map();
    for (const e of estados) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
    return ESTADOS_ORDEN.filter((e) => cuenta.has(e)).map((e) => ({ e, n: cuenta.get(e) }));
  }, [estados]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
      {presentes.map(({ e, n }) => {
        const color = estadoColor(dark, e);
        return (
          <span
            key={e}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.textSoft }}
          >
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}66` }} />
            {estadoInfo(e).label}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: t.text }}>{n}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Botón de encuadre / conmutador, con el mismo aspecto en los dos usos. */
function BotonBarra({ activo, onClick, children, t, titulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={titulo}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 12px", borderRadius: 9, cursor: "pointer",
        fontSize: 12, fontWeight: 600,
        border: `1px solid ${activo ? t.accent : t.border}`,
        background: activo ? t.accentSoft : t.panel,
        color: activo ? t.accent : t.textSoft,
      }}
    >
      {children}
    </button>
  );
}

/**
 * La tira del tren de rotor: las seis piezas en su orden físico.
 *
 * ── POR QUÉ SE LISTAN TAMBIÉN LAS QUE NO SE MIDEN ──────────────────
 *
 * Porque la mitad de la información está ahí. El disco de desbalance es la
 * pieza que el banco existe para desequilibrar y **no tiene sonda propia**; el
 * acoplamiento es donde aparece una desalineación y tampoco. Una lista sólo de
 * los tres apoyos instrumentados diría, por omisión, que la instrumentación
 * cubre la máquina.
 */
function TiraDelTren({ estadoPorCanal, seleccionado, onSeleccionar, t, dark }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {TREN_MECANICO.map((el) => {
        const canal = el.canal ? CANAL[el.canal] : null;
        const estado = el.canal ? estadoPorCanal[el.canal] : null;
        const activo = seleccionado === el.id;
        const medible = Boolean(el.canal);

        return (
          <button
            key={el.id}
            type="button"
            disabled={!medible}
            onClick={() => medible && onSeleccionar(activo ? null : el.id)}
            style={{
              flex: "1 1 150px", textAlign: "left",
              padding: "11px 13px 12px", borderRadius: 12,
              border: `1px solid ${activo ? t.accent : t.border}`,
              background: activo ? t.accentSoft : t.panel,
              cursor: medible ? "pointer" : "default",
              // Las piezas sin sonda se atenúan, no se esconden: siguen
              // contando el orden del tren y siguen diciendo que no se miden.
              opacity: medible ? 1 : 0.62,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {estado ? (
                <PuntoEstado color={estadoColor(dark, estado)} size={7} />
              ) : (
                <span
                  style={{
                    width: 7, height: 7, borderRadius: "50%",
                    border: `1px solid ${t.textFaint}`,
                  }}
                />
              )}
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{el.label}</span>
            </div>

            <div style={{ marginTop: 5, fontSize: 11, color: t.textSoft }}>
              {canal ? (
                <>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{el.canal}</span>
                  {" · "}
                  {canal.label}
                </>
              ) : (
                "Sin sensor"
              )}
            </div>

            <div style={{ marginTop: 3, fontSize: 10.5, color: t.textFaint }}>
              {el.confianza === "PLACA" ? "Leído de placa" : "Identificado en foto"}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Las cuatro medidas del apoyo seleccionado. */
function FichaApoyo({ elemento, datos, normaAplicable, t, dark }) {
  const canal = CANAL[elemento.canal];
  const estado = estadoDeApoyo(datos, normaAplicable);
  const banda = bandaISO(datos?.vRMS, normaAplicable);

  return (
    <Panel title={`${elemento.label} · ${canal.label}`} code={canal.equipo}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <PuntoEstado color={estadoColor(dark, estado)} size={8} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>
          {estadoInfo(estado).label}
        </span>
        {banda && (
          <span style={{ fontSize: 11.5, color: t.textFaint, marginLeft: "auto" }}>{banda.label}</span>
        )}
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        {MEDIDAS.map((m) => {
          const v = datos?.[m.key];
          const hay = Number.isFinite(v);
          return (
            <div key={m.key}>
              <div style={{ fontSize: 10.5, color: t.textFaint }}>{m.label}</div>
              <div
                style={{
                  fontSize: 18, fontWeight: 800, marginTop: 2,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: hay ? t.text : t.textFaint,
                }}
              >
                {hay ? v.toFixed(m.decimales) : "—"}
                {hay && m.unidad ? (
                  <span style={{ fontSize: 11, fontWeight: 500, color: t.textFaint }}> {m.unidad}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ margin: "12px 0 0", fontSize: 12, color: t.textSoft }}>
        Sonda {ACELEROMETRO.fabricante} {ACELEROMETRO.modelo}, {canal.sensibilidad} mV/g,{" "}
        montaje {ACELEROMETRO.montaje} y orientación vertical. Rodamiento{" "}
        {canal.rodamiento ?? "sin identificar"}
        {canal.rodamiento
          ? "."
          : ": sin su referencia no se pueden calcular BPFO, BPFI ni FTF, así que este apoyo no tiene diagnóstico de rodamiento por frecuencia."}
      </p>
    </Panel>
  );
}

/* ── La vista ─────────────────────────────────────────────────────── */

function Vibraciones3D({ onNavigate }) {
  const { theme: t, dark } = useTheme();
  const reduce = usePrefersReducedMotion();
  const angosto = useMediaQuery("(max-width: 720px)");

  const { canales, variador, loading, error, puntosSinDato, puntosPedidos } = useVibracion();

  const [seleccionado, setSeleccionado] = useState(null);
  const [ejes, setEjes] = useState(true);
  const [encuadre, setEncuadre] = useState({ id: "lateral", ...ENCUADRES.lateral, n: 0 });

  const normaAplicable = useMemo(() => normaAplicableDe(variador), [variador]);

  const estadoPorCanal = useMemo(() => {
    const m = {};
    for (const el of TREN_MECANICO) {
      if (el.canal) m[el.canal] = estadoDeApoyo(canales?.[el.canal], normaAplicable);
    }
    return m;
  }, [canales, normaAplicable]);

  const giro = useMemo(() => rpmEjeDe(variador), [variador]);

  const descriptorDe = (key) => (reduce ? comportamientoReducido(key) : comportamiento(key));

  /* Basta con un apoyo en crítico —o con que el eje gire— para tener que
     dibujar de continuo. Con la máquina parada y en banda, la GPU baja a cero. */
  const frameloop = frameloopDe({
    estados: Object.values(estadoPorCanal),
    rpm: giro.rpm,
    reduce,
  });

  const elementoSeleccionado = TREN_MECANICO.find((e) => e.id === seleccionado) ?? null;

  const mudos = puntosSinDato?.length ?? 0;
  const totalPuntos = puntosPedidos ?? 0;
  const casiTodoMudo = totalPuntos > 0 && mudos > totalPuntos / 2;

  const irA = (id) => setEncuadre((e) => ({ id, ...ENCUADRES[id], n: e.n + 1 }));

  /* El eje del rotor no lleva estado propio: no hay sonda sobre él. Se dibuja
     con el PEOR de los dos apoyos que lo sujetan, que son los que sí lo miden.
     Ponerlo siempre en nominal diría que está bien sin haberlo comprobado. */
  const estadoEje = useMemo(() => {
    const orden = ["nominal", "atencion", "critico"];
    const de = [estadoPorCanal.S2, estadoPorCanal.S3].filter((e) => orden.includes(e));
    if (!de.length) return "sin_dato";
    return de.reduce((a, b) => (orden.indexOf(b) > orden.indexOf(a) ? b : a));
  }, [estadoPorCanal]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionLabel sub="El tren de rotor con sus tres sondas · el eje gira al régimen que publica el variador">
        Vista 3D · Banco de rotor
      </SectionLabel>

      {error && <AlertBanner type="error" title="No se pudo leer el módulo" message={error} />}

      {casiTodoMudo && !loading && (
        <AlertBanner
          type="warning"
          title="La máquina no está contestando"
          message={
            `${mudos} de ${totalPuntos} puntos no entregan lectura ahora mismo. ` +
            "Los apoyos que se vean en malla de alambre no están tranquilos: están callados, " +
            "y el eje se queda quieto porque el variador no está publicando su régimen, " +
            "no porque conste que la máquina esté parada."
          }
        />
      )}

      <Escena
        camara={ENCUADRES.lateral.posicion}
        objetivo={ENCUADRES.lateral.objetivo}
        zoom={{ min: 2.4, max: 14 }}
        altura={angosto ? 380 : 540}
        frameloop={frameloop}
        extras={<Encuadre preset={encuadre} />}
        respaldo={
          <TiraDelTren
            estadoPorCanal={estadoPorCanal}
            seleccionado={seleccionado}
            onSeleccionar={setSeleccionado}
            t={t}
            dark={dark}
          />
        }
      >
        <group onPointerMissed={() => setSeleccionado(null)}>
          <Piso radio={RADIO_PISO} divisiones={12} />

          <BancadaRanuradaModel
            largo={BANCADA.largo}
            ancho={BANCADA.ancho}
            alto={BANCADA.alto}
            position={[BANCADA.centroX, 0, 0]}
          />

          {/* El rotor entero en un solo grupo que gira: eje, acoplamiento y
              disco. Va antes que los soportes para que las chumaceras se
              dibujen «alrededor» de él en profundidad. */}
          <EjeRotorModel
            descriptor={descriptorDe(estadoEje)}
            rpm={giro.rpm}
            desde={EJE_DESDE}
            hasta={EJE_HASTA}
            discoX={POSICION_X.disco}
            acoplamientoX={POSICION_X.acoplamiento}
            altura={ALTURA_EJE}
          />

          {TREN_MECANICO.filter((el) => el.canal).map((el) => (
            <ApoyoInstrumentado
              key={el.id}
              elemento={el}
              descriptor={descriptorDe(estadoPorCanal[el.canal])}
              ejes={ejes}
              seleccionado={seleccionado === el.id}
              onSeleccionar={(id) => setSeleccionado((a) => (a === id ? null : id))}
            />
          ))}
        </group>
      </Escena>

      <div
        style={{
          display: "flex", gap: 14, flexWrap: "wrap",
          alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Leyenda estados={Object.values(estadoPorCanal)} t={t} dark={dark} />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <BotonBarra
            activo={ejes}
            onClick={() => setEjes((v) => !v)}
            t={t}
            titulo="Dibuja el eje que cada sonda mide y los dos que no"
          >
            <Ruler size={13} />
            Ejes de medida
          </BotonBarra>

          <span style={{ fontSize: 11.5, color: t.textFaint, marginLeft: 4 }}>Encuadre</span>
          {Object.entries(ENCUADRES).map(([id, e]) => (
            <BotonBarra key={id} activo={encuadre.id === id} onClick={() => irA(id)} t={t}>
              {e.etiqueta}
            </BotonBarra>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel sub="En el orden en que el giro las atraviesa · pulsa un apoyo con sonda para sus medidas">
          El tren de rotor
        </SectionLabel>
        <div style={{ marginTop: 12 }}>
          <TiraDelTren
            estadoPorCanal={estadoPorCanal}
            seleccionado={seleccionado}
            onSeleccionar={setSeleccionado}
            t={t}
            dark={dark}
          />
        </div>
      </div>

      {elementoSeleccionado && (
        <FichaApoyo
          elemento={elementoSeleccionado}
          datos={canales?.[elementoSeleccionado.canal]}
          normaAplicable={normaAplicable}
          t={t}
          dark={dark}
        />
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Panel title="Régimen del eje">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontSize: 32, fontWeight: 800,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: giro.medido ? t.text : t.textFaint,
              }}
            >
              {giro.medido ? Math.round(giro.real) : "—"}
            </span>
            <span style={{ fontSize: 12.5, color: t.textFaint }}>rpm</span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: t.textSoft }}>
            {!giro.medido
              ? "El variador no está publicando la velocidad, así que el eje se dibuja quieto. Eso no significa que la máquina esté parada: significa que no consta."
              : giro.real <= 0
                ? "El variador publica cero: la máquina está parada."
                : normaAplicable
                  ? `Por encima de las ${RPM_MINIMA_ISO} rpm en que ISO 10816 empieza a pronunciarse, así que el veredicto de la velocidad eficaz vale (aviso ${LIMITES_ISO.aviso} mm/s, alarma ${LIMITES_ISO.alarma} mm/s).`
                  : `Por debajo de las ${RPM_MINIMA_ISO} rpm: la frecuencia de giro se sale de la banda que ISO 10816 mide, así que la norma no se pronuncia y los apoyos salen sin criterio.`}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: t.textFaint }}>
            El giro de la escena está comprimido: a 3 475 rpm reales una malla girando
            60 veces por segundo se vería quieta o al revés. Comunica que gira y cuánto,
            no a qué velocidad exacta.
          </p>
        </Panel>

        <Panel title="Sólo se mide el eje vertical">
          <p style={{ margin: 0, fontSize: 12.5, color: t.textSoft }}>
            Las tres sondas están montadas en vertical, y sólo en vertical. En la escena, la
            flecha verde es lo que se mide; las dos grises son las direcciones que faltan.
          </p>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: t.textSoft }}>
            <li style={{ marginBottom: 5 }}>
              Sin la <strong>axial</strong>, una desalineación de acoplamiento puede no aparecer:
              es donde más se manifiesta.
            </li>
            <li style={{ marginBottom: 5 }}>
              Sin la segunda <strong>radial</strong>, un desequilibrio y una holgura se ven iguales
              — lo que los separa es la relación entre las dos.
            </li>
            <li>{EJES_MEDIDA.norma}, así que este muestreo no cumple esa norma.</li>
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: t.textFaint }}>
            El criterio de severidad de ISO 10816-1 Clase I sobre la velocidad eficaz sí se usa
            y sí vale; lo que no vale es presentar esto como una evaluación conforme a ISO 20816.
          </p>
        </Panel>

        <Panel title="Lo que la escena no puede dibujar">
          <p style={{ margin: 0, fontSize: 12.5, color: t.textSoft }}>
            El banco se monta sobre perfil ranurado: las chumaceras y el disco se mueven, así
            que su separación no es una constante de la máquina. Lo que falta por medir:
          </p>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: t.textSoft }}>
            <li style={{ marginBottom: 5 }}>
              Distancia entre chumaceras y posición del disco respecto a ellas.
            </li>
            <li style={{ marginBottom: 5 }}>
              Diámetro del eje. Sin él no hay velocidad crítica que calcular.
            </li>
            <li>
              Modelo de rodamiento de las dos chumaceras. Sin él no hay BPFO, BPFI, BSF ni FTF.
            </li>
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: t.textFaint }}>
            La única cota que hay son los {EJE.longitudCm} cm del eje, y llega con reserva:{" "}
            {EJE.ambiguo.toLowerCase()}. Por eso la escena está a escala de lectura y no a escala
            real — no se puede medir sobre ella.
          </p>
        </Panel>
      </div>

      <button
        type="button"
        onClick={() => onNavigate?.("eva-vibraciones")}
        style={{
          alignSelf: "flex-start",
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 16px", borderRadius: 9, cursor: "pointer",
          fontSize: 13, fontWeight: 600,
          border: `1px solid ${t.accent}`, background: t.accentSoft, color: t.accent,
        }}
      >
        <LineChart size={15} />
        Ver las medidas de los tres apoyos
      </button>
    </div>
  );
}

export default Vibraciones3D;
