/**
 * La maqueta 3D montada como fondo del hero de «Inicio».
 *
 * ── POR QUÉ EXISTE ESTE COMPONENTE Y NO SE REUTILIZA `<Escena>` ────
 *
 * `<Escena>` trae su propia caja —borde, radio, altura fija, `OrbitControls`
 * interactivo— pensada para una vista donde alguien orbita y pulsa activos.
 * Aquí la maqueta es decorativa: vive detrás del texto del hero, gira sola y
 * nadie la toca. Envolverla en `<Escena>` habría significado desactivar la
 * mitad de lo que esa caja ofrece; más simple montar un `<Canvas>` propio con
 * la misma paleta y las mismas luces (`Paleta3DContext`, `Luces`) que ya usa
 * el resto del 3D, y nada de lo que `<Escena>` añade para la interacción.
 *
 * ── MISMO DATO, MISMA GEOMETRÍA, SIN RIESGO NUEVO ──────────────────
 *
 * Es el mismo ensamblaje que `MaquetaTanque3D` —bastidor, depósito, tuberías,
 * los cuatro activos con su descriptor de estado—, así que el nivel del
 * tanque que se ve aquí ES el mismo `SNIVEL_TANQUE` en vivo que en la vista
 * completa: el North Star del sistema ("el 3D y los números son la misma
 * verdad") vale ya en la primera pantalla, no sólo dos clics después.
 *
 * `detalle={false}` en cada activo: el hero se ve pequeño y desde lejos, así
 * que las piezas menores (rejillas de ventilación, manecillas) no se echan en
 * falta y el ahorro de geometría es gratis.
 *
 * ── POR QUÉ GIRA SOLA EN VEZ DE RESPONDER AL PUNTERO ───────────────
 *
 * `OrbitControls` con `autoRotate` sigue escuchando el puntero: soltarlo ahí
 * detendría el giro en cuanto alguien pasara el cursor por el hero de camino
 * a leer la frase, que es justo el movimiento que no debe pararse. Girar el
 * `<group>` a mano en `useFrame` no escucha nada — nunca se detiene, y no
 * hay `OrbitControls` que capture el gesto de scroll de la página.
 */
import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

import { Paleta3DContext, construirPaleta } from "@/features/three-d/lib/paleta.js";
import Luces from "@/features/three-d/components/Luces.jsx";
import { hayWebGL } from "@/features/three-d/lib/webgl.js";
import { usePrefersReducedMotion } from "@/lib/motion.js";
import { useTheme } from "@/theme";

import ActivoEnMaqueta from "./ActivoEnMaqueta.jsx";
import BastidorModel from "./BastidorModel.jsx";
import DepositoModel from "./DepositoModel.jsx";
import Tuberias from "./Tuberias.jsx";
import { DEPOSITO, posicionDe, tramos } from "../lib/layout.js";
import { rpmDe } from "../lib/comportamiento.js";
import { ACTIVO_IDS } from "../../domain/activos.js";

/** Radianes por segundo: una vuelta completa cada ~90 s, un fondo, no un carrusel. */
const VELOCIDAD_GIRO = (2 * Math.PI) / 90;

function GrupoGiratorio({ children, reduce }) {
  const grupo = useRef();
  useFrame((_, dt) => {
    if (reduce || !grupo.current) return;
    grupo.current.rotation.y += VELOCIDAD_GIRO * dt;
  });
  // Ángulo de partida: de frente al depósito y la columna, no visto de canto.
  return (
    <group ref={grupo} rotation={[0, 0.5, 0]} position={[0, -1.55, 0]}>
      {children}
    </group>
  );
}

function Contenido({ sistema }) {
  const colocados = useMemo(
    () => ACTIVO_IDS.map((id) => ({ a: sistema.activos.find((x) => x.id === id), pos: posicionDe(id) })).filter(
      (x) => x.a && x.pos
    ),
    [sistema.activos]
  );
  const rpm = useMemo(() => rpmDe(sistema), [sistema]);

  return (
    <>
      <BastidorModel />
      <DepositoModel position={[DEPOSITO.x, DEPOSITO.y, DEPOSITO.z]} />
      <Tuberias tramos={tramos()} hayCaudal={!sistema.enReposo} />

      {colocados.map(({ a, pos }) => (
        <ActivoEnMaqueta
          key={a.id}
          activo={a}
          sistema={sistema}
          pos={pos}
          rpm={rpm.rpm}
          señalado={false}
          seleccionado={false}
          onSeñalar={() => {}}
          onSeleccionar={() => {}}
          detalle={false}
        />
      ))}
    </>
  );
}

/**
 * `frameloop` siempre en "always": a diferencia de la vista completa, aquí
 * gira la maqueta ENTERA de fondo aunque la instalación esté en banda y
 * quieta, así que el frameloop bajo demanda de `frameloopDe()` no aplica —
 * ese cálculo apaga el repintado cuando nada se mueve, y aquí siempre se
 * mueve la cámara alrededor de la escena, no la escena.
 */
export default function MaquetaHero({ sistema }) {
  const { theme, dark } = useTheme();
  const reduce = usePrefersReducedMotion();
  const paleta = useMemo(() => construirPaleta(theme, dark), [theme, dark]);

  // Mismo criterio que `Escena.jsx`: sondear ANTES de montar el `<Canvas>`,
  // porque sin WebGL el constructor del renderizador lanza. Aquí el fondo es
  // decorativo, así que sin soporte simplemente no se pinta nada — el
  // gradiente del hero ya es un fondo completo por sí solo, sin panel de
  // error que mostrar ni dato que perder.
  if (!hayWebGL()) return null;

  return (
    <Canvas
      frameloop={reduce ? "demand" : "always"}
      shadows={false}
      dpr={[1, 1.5]}
      camera={{ position: [7.5, 4.2, 8.5], fov: 38, near: 0.1, far: 120 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <Paleta3DContext.Provider value={paleta}>
        <Luces sombras={false} intensidad={0.9} />
        <Suspense fallback={null}>
          <GrupoGiratorio reduce={reduce}>
            <Contenido sistema={sistema} />
          </GrupoGiratorio>
        </Suspense>
      </Paleta3DContext.Provider>
    </Canvas>
  );
}
