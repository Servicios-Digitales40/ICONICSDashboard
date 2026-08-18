/**
 * La red de distribución: la válvula instrumentada del tramo de impulsión.
 *
 * ── POR QUÉ EL ACTIVO ES ESTO Y NO UN RECIPIENTE ───────────────────
 *
 * Porque las dos señales de «Red de distribución» —`SFLUJO_INSTANTANEO` y
 * `SPRESION_RELATIVA`— se miden **aquí**, en la instrumentación montada sobre
 * la tubería que va de la bomba a la columna. Es la pieza que en el dibujo del
 * equipo se ve a media tubería, con su cuerpo azul y su cabezal negro.
 *
 * Hasta agosto de 2026 este activo se dibujaba como un colector, y luego como
 * la columna. Las dos eran el recipiente equivocado: la columna es donde se
 * mide el NIVEL, y por eso ahora es el modelo del activo «tanque».
 *
 * La regla que se acabó imponiendo, y que conviene no perder: **la tarjeta de
 * un activo va donde está el aparato que mide sus señales**, no donde está el
 * recipiente que da nombre al activo. Es lo que hace que señalar una pieza y
 * leer un número sean la misma pregunta.
 *
 * ── LOS DOS CANALES, Y NINGUNO SE MUEVE EN BUCLE ───────────────────
 *
 *   aguja del manómetro → `SPRESION_RELATIVA`
 *   anillo del caudalímetro → encendido con caudal medido
 *
 * La aguja se mueve cuando cambia la presión y se queda quieta el resto del
 * tiempo, así que no cuenta contra la regla de los dos bucles: es el mismo caso
 * que una barra que crece al llegar una lectura nueva. Se interpola porque un
 * salto se lee como un fallo de dibujado, y pide fotograma mientras no
 * converge, porque la escena va bajo demanda.
 *
 * ── EL MANÓMETRO SE FUE DE LA BOMBA ────────────────────────────────
 *
 * `BombaModel` tiene el suyo, y en la vista «Máquina 3D» sigue puesto: allí el
 * grupo de bombeo es el sujeto y el manómetro de descarga forma parte de él.
 * En la maqueta se apaga (`manometro={false}`), porque enseñar la misma presión
 * en dos sitios de la misma escena no informa el doble, sólo obliga a
 * comprobar que dicen lo mismo.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";

import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

const SUAVIZADO = 6;

/** Barrido de la aguja: 240°, como un manómetro industrial de verdad. */
const BARRIDO = (240 * Math.PI) / 180;

/** Calibre de la tubería sobre la que se monta. Igual que en `Tuberias.jsx`. */
const TUBO = 0.075;

export default function ValvulaModel({
  descriptor,
  hayCaudal = false,
  /** Presión en 0-1 sobre su escala, o `null` si no hay medición. */
  presionPct = null,
  detalle = true,
  ...props
}) {
  const P = usePaleta3D();
  const invalidate = useThree((s) => s.invalidate);

  const aguja = useRef();
  const anim = useRef({ presion: 0 });

  const { material } = descriptor;
  const hayPresion = Number.isFinite(presionPct);

  const colorCuerpo = tono(P, P.accent, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  useFrame((_, dt) => {
    const a = anim.current;
    const objetivo = hayPresion ? Math.max(0, Math.min(1, presionPct / 100)) : 0;
    const siguiente = MathUtils.damp(a.presion, objetivo, SUAVIZADO, dt);

    if (Math.abs(siguiente - a.presion) > 0.0005) invalidate();
    a.presion = siguiente;

    if (aguja.current) {
      aguja.current.rotation.z = BARRIDO / 2 - a.presion * BARRIDO;
      aguja.current.visible = hayPresion;
    }
  });

  return (
    <group {...props}>
      {/* Cuerpo de la válvula, a caballo sobre el tubo. Azul porque lo es en el
          equipo: es la pieza de color de todo el tramo de impulsión. */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.17, 18, 14]} />
        <meshStandardMaterial color={colorCuerpo} {...props3} />
      </mesh>

      {/* Bridas a los dos lados, que es lo que la ata a la tubería. */}
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[TUBO * 1.7, TUBO * 1.7, 0.05, 16]} />
          <meshStandardMaterial color={colorMetal} {...props3} />
        </mesh>
      ))}

      {/* Cabezal negro de arriba: el actuador. */}
      <mesh position={[0, 0.19, 0]} castShadow>
        <boxGeometry args={[0.15, 0.12, 0.13]} />
        <meshStandardMaterial color={P.goma} {...props3} />
      </mesh>

      {/* ---- Manómetro: la aguja ES la presión ---------------------- */}
      <group position={[0, 0.06, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.045, 22]} />
          <meshStandardMaterial color={colorOscuro} {...props3} />
        </mesh>
        {/* Esfera clara, para que la aguja se recorte sobre ella. */}
        <mesh position={[0, 0.025, 0]}>
          <cylinderGeometry args={[0.092, 0.092, 0.006, 22]} />
          <meshStandardMaterial color={colorMetal} {...props3} />
        </mesh>
        {/* La aguja. Sin lectura no se dibuja: una aguja a cero diría «presión
            cero», que es una afirmación, y la ausencia de dato no afirma nada. */}
        <group ref={aguja} position={[0, 0.032, 0]} rotation={[0, 0, 0]}>
          <mesh position={[0, 0, -0.042]} rotation={[Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.012, 0.085, 0.006]} />
            <meshStandardMaterial
              color={P.coral}
              emissive={P.coral}
              emissiveIntensity={0.35}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>

      {/* ---- Caudalímetro: el anillo ES el testigo ------------------
          Estático a propósito. Un flujo animado sería el tercer bucle de una
          aplicación que se permite dos; ver `lib/motion.js` y `Tuberias.jsx`. */}
      {detalle && (
        <group position={[0, 0, -0.2]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.12, 18]} />
            <meshStandardMaterial color={colorOscuro} {...props3} />
          </mesh>
          <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.075, 0.019, 8, 22]} />
            <meshStandardMaterial
              color={hayCaudal ? P.success : P.textFaint}
              emissive={hayCaudal ? P.success : "#000000"}
              emissiveIntensity={hayCaudal ? 1 : 0}
              toneMapped={false}
              transparent={material.opacidad < 1}
              opacity={material.opacidad}
            />
          </mesh>
        </group>
      )}

      <group position={[0, 0.46, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

/** Alto de la ficha sobre el centro de la válvula. */
export const ALTURA_VALVULA = 0.95;
