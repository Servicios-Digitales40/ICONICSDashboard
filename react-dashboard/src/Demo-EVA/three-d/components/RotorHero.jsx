/**
 * El banco de rotor montado como fondo del hero de «Inicio · Vibraciones».
 *
 * Es el gemelo de `MaquetaHero` para la segunda máquina, y comparte con él
 * todo lo que allí está razonado y aquí no se repite: `<Canvas>` propio en vez
 * de `<Escena>` —porque este fondo no se orbita ni se pulsa—, la misma paleta
 * y las mismas luces, `pointerEvents: none`, y sin WebGL no se pinta nada.
 *
 * ── MISMO DATO, MISMA GEOMETRÍA ────────────────────────────────────
 *
 * Es el mismo ensamblaje que `Vibraciones3D`: los tres apoyos con su estado
 * en vivo y el eje girando a `SPEED_BMS`. Un apoyo que no contesta sale en
 * malla de alambre aquí también. Es lo que hace que el North Star del
 * sistema —«el 3D y los números son la misma verdad»— valga ya en la primera
 * pantalla, y no dos clics más adentro.
 *
 * Y es exactamente lo que la cabecera de `InicioVibraciones` daba por
 * imposible hasta el 04-09-2026: «aquí no existe modelo del motor, y poner uno
 * genérico girando detrás de lecturas reales lo convertiría en la máquina para
 * quien lo mire». Tenía razón mientras el modelo era genérico. Dejó de tenerla
 * cuando el levantamiento de campo dio la geometría real del tren.
 *
 * ── POR QUÉ ESTE FONDO NO DA LA VUELTA COMPLETA ────────────────────
 *
 * La maqueta del tanque sí: es un skid compacto, casi tan alto como ancho, y
 * se lee igual desde cualquier ángulo.
 *
 * Este banco no. Es una máquina EN LÍNEA de cuatro metros de escena por uno de
 * fondo, así que una rotación completa en Y lo pone de canto dos veces por
 * vuelta — y de canto, un tren de rotor es una raya. La mitad del ciclo se
 * pasaría enseñando algo irreconocible detrás de la cifra.
 *
 * En su lugar hace un VAIVÉN corto alrededor de tres cuartos: la amplitud está
 * elegida para que nunca se acerque al perfil de canto, así que la silueta —el
 * motor, las dos chumaceras, el disco entre ellas— se reconoce en cualquier
 * fotograma. Es el mismo propósito que la rotación de allí (que el fondo esté
 * vivo sin pedir atención) resuelto para una proporción distinta.
 *
 * ── LO QUE SE QUITA EN EL HERO, Y POR QUÉ ──────────────────────────
 *
 * Las flechas de los ejes de medida. En la vista completa son el argumento
 * central —qué se mide y qué no—, y aquí serían nueve puntas de dos píxeles al
 * 60 % de opacidad detrás de un número de 104 px: ilegibles, y compitiendo con
 * lo único que el hero tiene que decir. Un argumento que no se puede leer no
 * es un argumento, es ruido. Vive donde se puede leer, en `Vibraciones3D`.
 *
 * Las balizas SÍ se quedan: son el estado, se leen de lejos por color y son la
 * razón de que este fondo sea el dato y no un adorno.
 */
import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

import Luces from "@/features/three-d/components/Luces.jsx";
import { Paleta3DContext, construirPaleta } from "@/features/three-d/lib/paleta.js";
import { hayWebGL } from "@/features/three-d/lib/webgl.js";
import { usePrefersReducedMotion } from "@/lib/motion.js";
import { useTheme } from "@/theme";

import { TREN_MECANICO } from "../../domain/vibraciones.js";
import { comportamiento, comportamientoReducido } from "../lib/comportamiento.js";
import {
  ALTURA_BANCADA,
  ALTURA_EJE,
  ALTURA_EJE_MONTAJE,
  BANCADA,
  EJE_DESDE,
  EJE_HASTA,
  POSICION_X,
  estadoDeApoyo,
  normaAplicableDe,
  rpmEjeDe,
} from "../lib/rotor.js";
import AcelerometroModel from "./AcelerometroModel.jsx";
import BancadaRanuradaModel from "./BancadaRanuradaModel.jsx";
import ChumaceraModel, { SONDA_OFFSET } from "./ChumaceraModel.jsx";
import EjeRotorModel from "./EjeRotorModel.jsx";
import MotorWEGModel, { SONDA_S1_ALTURA, SONDA_S1_OFFSET_X } from "./MotorWEGModel.jsx";

/**
 * El vaivén: centro, amplitud y periodo.
 *
 * El centro (0,42 rad ≈ 24°) es un tres cuartos que enseña a la vez el largo
 * del tren y algo de fondo. La amplitud (0,3 rad ≈ 17°) mantiene el balanceo
 * entre 0,12 y 0,72 rad — muy lejos de los 1,57 del perfil de canto, que es la
 * postura que había que evitar. Un ciclo completo cada 40 s: por debajo de
 * eso el fondo empieza a pedir atención.
 */
const VAIVEN_CENTRO = 0.42;
const VAIVEN_AMPLITUD = 0.3;
const VAIVEN_PERIODO_S = 40;

function GrupoEnVaiven({ children, reduce }) {
  const grupo = useRef();

  useFrame(({ clock }) => {
    if (reduce || !grupo.current) return;
    const fase = (clock.elapsedTime / VAIVEN_PERIODO_S) * Math.PI * 2;
    grupo.current.rotation.y = VAIVEN_CENTRO + Math.sin(fase) * VAIVEN_AMPLITUD;
  });

  /* Bajado y centrado: el banco se apoya en y = 0 y mide un metro escaso de
     alto, así que sin este desplazamiento quedaría pegado al borde inferior
     de la franja en vez de flotando en ella. */
  return (
    <group ref={grupo} rotation={[0, VAIVEN_CENTRO, 0]} position={[0, -0.45, 0]}>
      {children}
    </group>
  );
}

function Contenido({ canales, variador }) {
  const normaAplicable = useMemo(() => normaAplicableDe(variador), [variador]);
  const reduce = usePrefersReducedMotion();

  const descriptorDe = (key) => (reduce ? comportamientoReducido(key) : comportamiento(key));

  const estados = useMemo(() => {
    const m = {};
    for (const el of TREN_MECANICO) {
      if (el.canal) m[el.canal] = estadoDeApoyo(canales?.[el.canal], normaAplicable);
    }
    return m;
  }, [canales, normaAplicable]);

  const giro = useMemo(() => rpmEjeDe(variador), [variador]);

  /* El eje no tiene sonda propia: hereda el peor de los dos apoyos que lo
     sujetan. Mismo criterio que en `Vibraciones3D`. */
  const estadoEje = useMemo(() => {
    const orden = ["nominal", "atencion", "critico"];
    const de = [estados.S2, estados.S3].filter((e) => orden.includes(e));
    if (!de.length) return "sin_dato";
    return de.reduce((a, b) => (orden.indexOf(b) > orden.indexOf(a) ? b : a));
  }, [estados]);

  return (
    <>
      <BancadaRanuradaModel
        largo={BANCADA.largo}
        ancho={BANCADA.ancho}
        alto={BANCADA.alto}
        position={[BANCADA.centroX, 0, 0]}
      />

      <EjeRotorModel
        descriptor={descriptorDe(estadoEje)}
        rpm={giro.rpm}
        desde={EJE_DESDE}
        hasta={EJE_HASTA}
        discoX={POSICION_X.disco}
        acoplamientoX={POSICION_X.acoplamiento}
        altura={ALTURA_EJE}
        detalle={false}
      />

      {TREN_MECANICO.filter((el) => el.canal).map((el) => {
        const descriptor = descriptorDe(estados[el.canal]);
        const esMotor = el.tipo === "motor";
        const sonda = esMotor
          ? [SONDA_S1_OFFSET_X, ALTURA_EJE_MONTAJE + SONDA_S1_ALTURA, 0]
          : SONDA_OFFSET;

        return (
          <group key={el.id} position={[POSICION_X[el.id], ALTURA_BANCADA, 0]}>
            {esMotor ? (
              <MotorWEGModel descriptor={descriptor} alturaEje={ALTURA_EJE_MONTAJE} detalle={false} />
            ) : (
              <ChumaceraModel descriptor={descriptor} detalle={false} />
            )}
            <AcelerometroModel
              descriptor={descriptor}
              // Ver la cabecera: las flechas de eje no se leen a este tamaño.
              ejes={false}
              baliza={false}
              detalle={false}
              position={sonda}
            />
          </group>
        );
      })}
    </>
  );
}

/**
 * `frameloop` en "always" salvo con movimiento reducido, igual que
 * `MaquetaHero`: aquí siempre se mueve algo —el vaivén del grupo— aunque la
 * máquina esté callada, así que el repintado bajo demanda de `frameloopDe()`
 * no aplica.
 *
 * @param {object} props
 * @param {object} props.canales   `canales` de `useVibracion()`
 * @param {object} props.variador  `variador` de `useVibracion()`
 * @param {React.ReactNode} [props.respaldo]  qué pintar si no hay WebGL
 */
export default function RotorHero({ canales, variador, respaldo = null }) {
  const { theme, dark } = useTheme();
  const reduce = usePrefersReducedMotion();
  const paleta = useMemo(() => construirPaleta(theme, dark), [theme, dark]);

  /*
   * Sonda antes de montar el `<Canvas>`, como en `Escena.jsx`: sin WebGL el
   * constructor del renderizador lanza.
   *
   * A diferencia de `MaquetaHero`, que devuelve `null` y deja el gradiente
   * solo, aquí hay un respaldo que ofrecer: el trazo de los tres apoyos que
   * este fondo sustituye. Ya existía, ya dice si la máquina contesta, y
   * tirarlo para dejar un hueco habría sido perder información en el único
   * caso en que hace falta.
   */
  if (!hayWebGL()) return respaldo;

  return (
    <Canvas
      frameloop={reduce ? "demand" : "always"}
      shadows={false}
      dpr={[1, 1.5]}
      camera={{ position: [0.9, 2.0, 6.4], fov: 32, near: 0.1, far: 120 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <Paleta3DContext.Provider value={paleta}>
        <Luces sombras={false} intensidad={0.9} />
        <Suspense fallback={null}>
          <GrupoEnVaiven reduce={reduce}>
            <Contenido canales={canales} variador={variador} />
          </GrupoEnVaiven>
        </Suspense>
      </Paleta3DContext.Provider>
    </Canvas>
  );
}
