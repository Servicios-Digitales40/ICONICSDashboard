/**
 * El tanque de almacenamiento, con el líquido **a la altura que dice
 * `SNIVEL_TANQUE`**.
 *
 * ── POR QUÉ ESTE MODELO JUSTIFICA LA VISTA ENTERA ──────────────────
 *
 * Es el único sitio de todo el proyecto donde la GEOMETRÍA ES EL DATO. En la
 * maqueta de Resonac el 3D aporta ubicación y estado —dónde está la máquina que
 * está en alarma— pero las cifras siguen viviendo en una tarjeta; aquí el nivel
 * no se lee, se ve. Un tanque a un cuarto se distingue de uno lleno desde el
 * otro lado de la sala y sin saber leer un número.
 *
 * De ahí las tres decisiones de abajo:
 *
 *  1. **La pared es translúcida.** Un tanque opaco escondería justo lo que hay
 *     que enseñar. Se paga con una malla transparente más, que a esta escala no
 *     cuesta nada.
 *  2. **El líquido se interpola.** Un salto instantáneo entre dos lecturas se
 *     percibe como un fallo de dibujado; con la interpolación se lee como que
 *     el nivel se mueve. Es el mismo suavizado que usan las poses de
 *     `MaquinaModel`, con la misma constante.
 *  3. **Sin lectura, el tanque va VACÍO y translúcido, no medio lleno.** Es la
 *     regla de siempre —un hueco se pinta como hueco— llevada a la geometría:
 *     un nivel por defecto sería un número inventado con forma de agua.
 *
 * ── POR QUÉ PROCEDIMENTAL Y NO UN GLB ──────────────────────────────
 *
 * Por lo mismo que el resto del 3D del proyecto: no hay modelos que cargar, una
 * geometría de primitivas no pesa nada en el bundle y se ajusta cambiando un
 * número. Este archivo es el punto de sustitución el día que haya GLB reales,
 * siempre que el modelo nuevo exponga la parte móvil: el líquido.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";

import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

/** Constante de suavizado, en 1/s. Con 6 el cambio tarda ~0.5 s en asentarse. */
const SUAVIZADO = 6;

/** Medidas del tanque, en metros de escena. */
const R = 0.62;
const ALTO = 1.7;
const BASE = 0.28;

export default function TanqueModel({ descriptor, nivelPct = null, detalle = true, ...props }) {
  const P = usePaleta3D();

  /*
   * Con `frameloop="demand"` sólo se dibuja lo que alguien pide, así que la
   * interpolación del nivel arrancaría y se congelaría a medio camino: el
   * cambio de props dispara un fotograma, ese fotograma interpola un poco, y
   * ahí se acaba. La solución es que la propia animación pida el siguiente
   * fotograma mientras no haya convergido.
   */
  const invalidate = useThree((s) => s.invalidate);

  const liquido = useRef();
  const anim = useRef({ nivel: 0 });

  const { material } = descriptor;
  const hayNivel = Number.isFinite(nivelPct);
  const objetivo = hayNivel ? Math.max(0, Math.min(100, nivelPct)) / 100 : 0;

  const colorPared = tono(P, P.carcasa, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  useFrame((_, dt) => {
    const a = anim.current;
    const siguiente = MathUtils.damp(a.nivel, objetivo, SUAVIZADO, dt);

    if (Math.abs(siguiente - a.nivel) > 0.0005) invalidate();
    a.nivel = siguiente;

    if (liquido.current) {
      const alto = Math.max(0.0001, a.nivel * (ALTO - 0.08));
      // La geometría del cilindro se escala en Y y se recoloca a la vez, para
      // que el líquido crezca desde el FONDO y no desde su centro.
      liquido.current.scale.y = alto;
      liquido.current.position.y = BASE + 0.04 + alto / 2;
      liquido.current.visible = hayNivel && a.nivel > 0.002;
    }
  });

  return (
    <group {...props}>
      {/* Patas y solera */}
      <mesh position={[0, BASE / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R * 0.92, R * 1.05, BASE, 20]} />
        <meshStandardMaterial color={colorMetal} {...props3} />
      </mesh>

      {/* El líquido. Cilindro de altura 1 escalado en Y por el frame loop: así
          se anima sin recrear geometría en cada fotograma. */}
      <mesh ref={liquido} position={[0, BASE + 0.04, 0]}>
        <cylinderGeometry args={[R - 0.055, R - 0.055, 1, 28]} />
        <meshStandardMaterial
          color={P.accent}
          transparent
          opacity={0.72 * material.opacidad}
          roughness={0.15}
          metalness={0.05}
        />
      </mesh>

      {/* Pared translúcida. Va DESPUÉS del líquido para que se pinte encima. */}
      <mesh position={[0, BASE + ALTO / 2, 0]} castShadow={material.opacidad >= 1}>
        <cylinderGeometry args={[R, R, ALTO, 28, 1, true]} />
        <meshStandardMaterial
          color={colorPared}
          transparent
          opacity={0.3 * material.opacidad}
          roughness={0.25}
          metalness={0.3}
          wireframe={material.wireframe}
          // `side: 2` (DoubleSide) para que la pared del fondo también se vea:
          // sin ella el cilindro abierto se ve por dentro como un recorte.
          side={2}
        />
      </mesh>

      {/* Aros de refuerzo: dan escala y evitan que el cilindro translúcido
          parezca un vaso. Se quitan en la maqueta, donde a esa escala son ruido. */}
      {detalle &&
        [0.25, 0.62, 0.94].map((f) => (
          <mesh key={f} position={[0, BASE + ALTO * f, 0]}>
            <torusGeometry args={[R + 0.005, 0.016, 8, 28]} />
            <meshStandardMaterial color={colorMetal} {...props3} />
          </mesh>
        ))}

      {/* Tapa */}
      <mesh position={[0, BASE + ALTO, 0]} castShadow>
        <cylinderGeometry args={[R + 0.03, R + 0.03, 0.07, 28]} />
        <meshStandardMaterial color={colorMetal} {...props3} />
      </mesh>

      {/* Boca de carga, sólo como referencia de escala. */}
      {detalle && (
        <mesh position={[R * 0.45, BASE + ALTO + 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.12, 14]} />
          <meshStandardMaterial color={colorMetal} {...props3} />
        </mesh>
      )}

      <group position={[0, BASE + ALTO + 0.12, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

/** Medidas, para que la vista pueda colocar la ficha justo encima. */
export const ALTURA_TANQUE = BASE + ALTO + 0.5;
