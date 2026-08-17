/**
 * El armario del variador (VDF) y la acometida eléctrica.
 *
 * ── LA PUERTA ES EL CANAL DE `Modo AM VDF` ─────────────────────────
 *
 * Cerrada = Automático; abierta = Manual. Es el mismo recurso que la pose
 * «abierta» de Resonac para el Set-Up, y por la misma razón: un panel abierto
 * dice «hay alguien interviniendo» desde el otro lado de la sala, mientras que
 * un color distinto en el mismo armario no dice nada a esa distancia.
 *
 * Con la puerta abierta se ven las tarjetas del variador, que es lo que hace
 * que la apertura se lea como intervención y no como un fallo de dibujado.
 *
 * ⚠ Qué lado del booleano es «Manual» **no está confirmado en el servidor**
 * (ver `domain/senales.js`). Este modelo obedece a lo que diga el catálogo, así
 * que el día que se confirme lo contrario se corrige allí y la puerta se abre
 * al revés sin tocar este archivo.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";

import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

const SUAVIZADO = 6;

/** Apertura máxima de la puerta, en radianes (~100°). */
const APERTURA = 1.75;

const ANCHO = 0.9;
const ALTO = 1.5;
const FONDO = 0.42;

export default function ArmarioModel({ descriptor, abierto = false, detalle = true, ...props }) {
  const P = usePaleta3D();
  const invalidate = useThree((s) => s.invalidate);

  const puerta = useRef();
  const anim = useRef({ apertura: 0 });

  const { material } = descriptor;

  const colorCarcasa = tono(P, P.carcasa, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  useFrame((_, dt) => {
    const objetivo = abierto ? APERTURA : 0;
    const siguiente = MathUtils.damp(anim.current.apertura, objetivo, SUAVIZADO, dt);
    if (Math.abs(siguiente - anim.current.apertura) > 0.001) invalidate();
    anim.current.apertura = siguiente;
    if (puerta.current) puerta.current.rotation.y = -anim.current.apertura;
  });

  return (
    <group {...props}>
      {/* Zócalo */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[ANCHO + 0.08, 0.12, FONDO + 0.08]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/* Cuerpo del armario */}
      <mesh position={[0, 0.12 + ALTO / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[ANCHO, ALTO, FONDO]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/* Las tarjetas del variador, dentro. Sólo se ven con la puerta abierta,
          y son lo que hace que la apertura signifique algo. */}
      {detalle &&
        [0.32, 0.55, 0.78].map((f, i) => (
          <mesh key={f} position={[-0.12 + i * 0.11, 0.12 + ALTO * f, FONDO / 2 - 0.09]} castShadow>
            <boxGeometry args={[0.08, 0.34, 0.14]} />
            <meshStandardMaterial
              color={i === 1 ? P.accent : colorMetal}
              emissive={i === 1 ? P.accent : "#000000"}
              emissiveIntensity={i === 1 ? 0.25 : 0}
              {...props3}
            />
          </mesh>
        ))}

      {/*
        La puerta. El grupo tiene su origen en la BISAGRA (canto izquierdo) y la
        malla se desplaza media hoja hacia dentro: sin eso la puerta giraría
        alrededor de su centro y atravesaría el armario.
      */}
      <group ref={puerta} position={[-ANCHO / 2, 0.12 + ALTO / 2, FONDO / 2 + 0.005]}>
        <mesh position={[ANCHO / 2, 0, 0]} castShadow>
          <boxGeometry args={[ANCHO, ALTO - 0.06, 0.03]} />
          <meshStandardMaterial color={colorCarcasa} {...props3} />
        </mesh>

        {/* Rejilla de ventilación y maneta, para que la hoja no sea una tabla. */}
        {detalle && (
          <>
            {[0.34, 0.28, 0.22].map((y) => (
              <mesh key={y} position={[ANCHO / 2, y, 0.02]}>
                <boxGeometry args={[ANCHO * 0.55, 0.025, 0.01]} />
                <meshStandardMaterial color={colorOscuro} {...props3} />
              </mesh>
            ))}
            <mesh position={[ANCHO - 0.11, -0.05, 0.04]} castShadow>
              <boxGeometry args={[0.05, 0.17, 0.05]} />
              <meshStandardMaterial color={colorMetal} {...props3} />
            </mesh>
          </>
        )}
      </group>

      <group position={[0, 0.12 + ALTO + 0.02, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

export const ALTURA_ARMARIO = 0.12 + ALTO + 0.5;
