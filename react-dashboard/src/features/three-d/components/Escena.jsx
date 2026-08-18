/**
 * El `<Canvas>` configurado. Todas las vistas 3D entran por aquí y ninguna
 * repite ajustes de renderizador, cámara ni luces.
 *
 * Reúne las decisiones que afectan a un equipo encendido ocho horas:
 *
 *  - `dpr` con techo. En una TV 4K el `devicePixelRatio` sin acotar cuadruplica
 *    los píxeles sombreados a cambio de nada visible a tres metros.
 *  - `frameloop` que el llamador controla. Con todas las máquinas quietas la
 *    vista pasa a "demand" y la GPU baja a cero en vez de repintar 60 veces por
 *    segundo. Lo decide la vista, que es quien sabe si algo se mueve.
 *  - Una sola luz con sombra (`Luces.jsx`), y ningún recurso remoto.
 *
 * El fondo NO se pinta con `<color attach="background">` sino con el CSS del
 * contenedor: así el canvas queda transparente y las manchas decorativas del
 * Shell se siguen viendo por detrás, como en el resto de las vistas.
 */
import { Suspense, useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import { useTheme } from "@/theme";
import { Paleta3DContext, construirPaleta } from "../lib/paleta.js";
import { hayWebGL } from "../lib/webgl.js";
import Luces from "./Luces.jsx";
import Sin3D from "./Sin3D.jsx";

/**
 * Ángulo polar máximo: 88°. Impide que la cámara se pase por debajo del suelo,
 * desde donde la escena se ve del revés y no hay forma intuitiva de volver.
 */
const POLAR_MAX = Math.PI / 2 - 0.035;

/**
 * Cuántas veces se vuelve a montar el canvas tras perder el contexto.
 *
 * El navegador cierra el contexto WebGL cuando el controlador de vídeo se
 * reinicia, y eso en un equipo de planta encendido meses pasa. Remontar lo
 * recupera; remontar SIEMPRE convierte un controlador que falla en bucle en
 * una pantalla que parpadea sin parar. Al tercer intento se pasa al aviso.
 */
const REINTENTOS = 2;

export default function Escena({
  children,
  /** Posición inicial de la cámara, en metros. */
  camara = [7, 5, 9],
  fov = 40,
  /** Punto al que mira y alrededor del que orbita. */
  objetivo = [0, 0.9, 0],
  /** "always" | "demand" | "never". Lo elige la vista según si algo se mueve. */
  frameloop = "always",
  controles = true,
  /** Distancias de órbita. La maqueta necesita alejarse más que una máquina. */
  zoom = { min: 3.5, max: 22 },
  sombras = true,
  altura = 520,
  /** Se monta DENTRO del canvas pero fuera de la escena (p. ej. <Html>). */
  extras = null,
  /**
   * Qué enseñar en lugar de la escena cuando no hay WebGL. La escena no sabe
   * de dominios, así que la alternativa la aporta la vista. Ver `Sin3D.jsx`.
   */
  respaldo = null,
}) {
  const { theme, dark } = useTheme();
  const paleta = useMemo(() => construirPaleta(theme, dark), [theme, dark]);

  /* Generación del canvas: cambiarla lo remonta entero, que es la forma
     fiable de recuperarse de una pérdida de contexto. r3f no rehace por sí
     solo el renderizador, así que sin esto la escena queda en negro. */
  const [generacion, setGeneracion] = useState(0);

  const alCrear = useCallback(({ gl }) => {
    const perdido = (e) => {
      // Sin `preventDefault` el navegador ni siquiera intenta restaurar.
      e.preventDefault();
      setGeneracion((g) => g + 1);
    };
    gl.domElement.addEventListener("webglcontextlost", perdido);
  }, []);

  // La sonda va antes de montar el `<Canvas>`: construirlo sin WebGL lanza, y
  // lo que quedaría en la pared es el panel del ErrorBoundary.
  if (!hayWebGL()) return <Sin3D motivo="sin-webgl" respaldo={respaldo} />;
  if (generacion > REINTENTOS) return <Sin3D motivo="contexto-perdido" respaldo={respaldo} />;

  return (
    <div
      style={{
        height: altura,
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${theme.border}`,
        background: dark
          ? `radial-gradient(120% 90% at 50% 0%, ${theme.panel} 0%, ${theme.page} 70%)`
          : `radial-gradient(120% 90% at 50% 0%, #FFFFFF 0%, ${theme.page} 70%)`,
        boxShadow: theme.shadow,
        touchAction: "none", // el gesto de órbita no debe hacer scroll de la página
      }}
    >
      <Canvas
        key={generacion}
        onCreated={alCrear}
        frameloop={frameloop}
        shadows={sombras}
        dpr={[1, 1.75]}
        camera={{ position: camara, fov, near: 0.1, far: 120 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        {/* El contexto se crea DENTRO del canvas, sembrado con el tema que se
            leyó fuera. Ver la cabecera de `lib/paleta.js`. */}
        <Paleta3DContext.Provider value={paleta}>
          <Luces sombras={sombras} />

          {/* Nada de lo que hay aquí suspende hoy —la geometría es
              procedimental— pero el hueco queda puesto para el día que se
              carguen modelos GLB con `useGLTF`. */}
          <Suspense fallback={null}>{children}</Suspense>

          {controles && (
            <OrbitControls
              makeDefault
              target={objetivo}
              enablePan={false}
              minDistance={zoom.min}
              maxDistance={zoom.max}
              minPolarAngle={0.15}
              maxPolarAngle={POLAR_MAX}
              // Amortiguación: el arrastre se siente continuo en vez de a
              // tirones, que es lo que se nota en un monitor táctil de planta.
              enableDamping
              dampingFactor={0.08}
            />
          )}

          {extras}
        </Paleta3DContext.Provider>
      </Canvas>
    </div>
  );
}
