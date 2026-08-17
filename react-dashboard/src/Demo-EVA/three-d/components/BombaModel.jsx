/**
 * El grupo de bombeo: bancada, motor, voluta e impulsor.
 *
 * ── LAS PARTES MÓVILES, UNA POR CANAL ──────────────────────────────
 *
 *   impulsor  → giro · velocidad ← `CARGA_TRABAJO_MOTOR` (ver `rpmDe`)
 *   baliza    → estado derivado del activo
 *   manómetro → aguja ← `SPRESION_RELATIVA`
 *
 * El impulsor lleva **tres álabes radiales** a propósito, igual que el husillo
 * de Resonac: un cilindro liso girando sobre su eje se ve exactamente igual que
 * uno parado, y el giro es la única animación informativa de esta vista. Si no
 * se distingue, no informa de nada.
 *
 * ── LA AGUJA DEL MANÓMETRO NO ES UN BUCLE ──────────────────────────
 *
 * Se mueve cuando cambia la presión y se queda quieta el resto del tiempo, así
 * que no cuenta contra la regla de los dos bucles: es el mismo caso que una
 * barra que crece al llegar una lectura nueva. Se interpola por el mismo motivo
 * que el nivel del tanque —un salto se lee como un fallo de dibujado— y pide
 * fotograma mientras no converge, porque la escena va bajo demanda.
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

export default function BombaModel({
  descriptor,
  /** Velocidad del impulsor en rpm. Ver `rpmDe` en `lib/comportamiento.js`. */
  rpm = 0,
  /** Presión en 0-1 sobre su escala, o `null` si no hay medición. */
  presionPct = null,
  detalle = true,
  ...props
}) {
  const P = usePaleta3D();
  const invalidate = useThree((s) => s.invalidate);

  const impulsor = useRef();
  const aguja = useRef();
  const anim = useRef({ presion: 0 });

  const { material } = descriptor;
  const hayPresion = Number.isFinite(presionPct);

  const colorCarcasa = tono(P, P.carcasa, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  useFrame((_, dt) => {
    // Giro del impulsor: rpm → radianes por segundo.
    if (impulsor.current && rpm > 0) {
      impulsor.current.rotation.x += (rpm / 60) * Math.PI * 2 * dt;
    }

    const objetivo = hayPresion ? Math.max(0, Math.min(1, presionPct / 100)) : 0;
    const siguiente = MathUtils.damp(anim.current.presion, objetivo, SUAVIZADO, dt);
    if (Math.abs(siguiente - anim.current.presion) > 0.0005) invalidate();
    anim.current.presion = siguiente;

    if (aguja.current) {
      // Cero a las «siete» del reloj y fondo de escala a las «cinco».
      aguja.current.rotation.z = BARRIDO / 2 - anim.current.presion * BARRIDO;
    }
  });

  return (
    <group {...props}>
      {/* Bancada */}
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.85, 0.18, 0.9]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/* Motor: cilindro tumbado con aletas. */}
      <mesh position={[-0.42, 0.52, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.82, 22]} />
        <meshStandardMaterial color={colorCarcasa} {...props3} />
      </mesh>
      {detalle &&
        [-0.72, -0.56, -0.4, -0.24, -0.08].map((x) => (
          <mesh key={x} position={[x, 0.52, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.3, 0.3, 0.022, 22]} />
            <meshStandardMaterial color={colorOscuro} {...props3} />
          </mesh>
        ))}

      {/* Caja de bornes, encima del motor. */}
      {detalle && (
        <mesh position={[-0.42, 0.83, 0]} castShadow>
          <boxGeometry args={[0.3, 0.14, 0.22]} />
          <meshStandardMaterial color={colorOscuro} {...props3} />
        </mesh>
      )}

      {/* Acoplamiento entre motor y bomba. */}
      <mesh position={[0.08, 0.52, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.2, 14]} />
        <meshStandardMaterial color={P.goma} {...props3} />
      </mesh>

      {/* Voluta: la carcasa de la bomba, en su plano vertical. */}
      <mesh position={[0.52, 0.52, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.3, 26]} />
        <meshStandardMaterial color={colorCarcasa} {...props3} />
      </mesh>

      {/*
        El impulsor. Va DENTRO de la voluta y asoma por su cara, que es lo que
        permite ver el giro sin tener que abrir nada. Tres álabes: con uno solo
        la rotación se ve, pero no el ritmo.
      */}
      <group ref={impulsor} position={[0.7, 0.52, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
          <meshStandardMaterial color={colorMetal} {...props3} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]} position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.5, 0.05, 0.09]} />
            <meshStandardMaterial color={colorMetal} {...props3} />
          </mesh>
        ))}
      </group>

      {/* Brida de aspiración (izquierda, hacia el tanque). */}
      <mesh position={[0.52, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.42, 16]} />
        <meshStandardMaterial color={colorMetal} {...props3} />
      </mesh>

      {/* Brida de impulsión (arriba, hacia la distribución). */}
      <mesh position={[0.52, 0.98, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.62, 16]} />
        <meshStandardMaterial color={colorMetal} {...props3} />
      </mesh>

      {/* Manómetro en la impulsión, que es donde va en una instalación real. */}
      {detalle && (
        <group position={[0.52, 1.22, 0.14]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 20]} />
            <meshStandardMaterial color={colorOscuro} {...props3} />
          </mesh>
          <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.125, 0.125, 0.012, 20]} />
            <meshStandardMaterial
              color={P.dark ? "#E9ECF3" : "#FFFFFF"}
              transparent={material.opacidad < 1}
              opacity={material.opacidad}
              roughness={0.4}
            />
          </mesh>
          {/* La aguja. Sin medición se queda en cero y la ficha lo escribe: un
              manómetro a media escala afirmaría una presión que nadie midió. */}
          <group ref={aguja} position={[0, 0, 0.045]}>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[0.012, 0.1, 0.006]} />
              <meshStandardMaterial
                color={hayPresion ? P.coral : P.textFaint}
                emissive={hayPresion ? P.coral : "#000000"}
                emissiveIntensity={hayPresion ? 0.35 : 0}
                toneMapped={false}
              />
            </mesh>
          </group>
        </group>
      )}

      <group position={[-0.42, 0.98, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

export const ALTURA_BOMBA = 1.85;
