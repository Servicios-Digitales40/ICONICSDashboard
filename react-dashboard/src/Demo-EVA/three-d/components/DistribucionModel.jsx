/**
 * El colector de distribución: el tramo aguas abajo de la bomba.
 *
 * Es el activo que responde «¿sale agua, y con qué presión?», así que su modelo
 * es un colector con tres salidas, sus válvulas y un caudalímetro en línea.
 *
 * ── EL TESTIGO DE CAUDAL, Y POR QUÉ NO SE MUEVE ────────────────────
 *
 * La tentación evidente es hacer circular algo por dentro del tubo. Sería un
 * **tercer bucle** en una aplicación que se permite dos, y el argumento de
 * `lib/motion.js` aplica entero: con el giro del impulsor ya contando la
 * impulsión, un flujo animado no añadiría información y sí cansancio en una
 * pantalla que se mira ocho horas.
 *
 * El testigo es en cambio ESTÁTICO y de dos canales: el anillo del
 * caudalímetro se enciende cuando hay caudal medido, y las flechas de la
 * tubería se apagan cuando no lo hay (ver `Tuberias.jsx`). Se lee igual de
 * lejos y no se mueve.
 */
import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

const ALTO_COLECTOR = 0.95;
const LARGO = 1.5;

export default function DistribucionModel({ descriptor, hayCaudal = false, detalle = true, ...props }) {
  const P = usePaleta3D();

  const { material } = descriptor;
  const colorCarcasa = tono(P, P.carcasa, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  return (
    <group {...props}>
      {/* Dos soportes en U */}
      {[-LARGO / 2 + 0.18, LARGO / 2 - 0.18].map((x) => (
        <mesh key={x} position={[x, ALTO_COLECTOR / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.1, ALTO_COLECTOR, 0.16]} />
          <meshStandardMaterial color={colorOscuro} {...props3} />
        </mesh>
      ))}

      {/* El colector: tubo horizontal tumbado sobre los soportes. */}
      <mesh position={[0, ALTO_COLECTOR, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, LARGO, 20]} />
        <meshStandardMaterial color={colorMetal} {...props3} />
      </mesh>

      {/* Tres salidas hacia arriba, con su válvula de mariposa. */}
      {[-0.46, 0, 0.46].map((x) => (
        <group key={x} position={[x, ALTO_COLECTOR, 0]}>
          <mesh position={[0, 0.26, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.52, 14]} />
            <meshStandardMaterial color={colorMetal} {...props3} />
          </mesh>
          {detalle && (
            <>
              <mesh position={[0, 0.4, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
                <meshStandardMaterial color={colorOscuro} {...props3} />
              </mesh>
              {/* Volante de la válvula */}
              <mesh position={[0, 0.53, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.09, 0.018, 8, 18]} />
                <meshStandardMaterial color={colorCarcasa} {...props3} />
              </mesh>
            </>
          )}
        </group>
      ))}

      {/*
        Caudalímetro en línea. El anillo emisivo es el testigo: encendido con
        caudal medido, apagado sin él. Un anillo a media luz diría «poco
        caudal», que no es lo mismo que «no se está midiendo».
      */}
      <group position={[LARGO / 2 - 0.02, ALTO_COLECTOR, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.19, 0.19, 0.2, 20]} />
          <meshStandardMaterial color={colorOscuro} {...props3} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.11, 0, 0]}>
          <torusGeometry args={[0.14, 0.022, 8, 22]} />
          <meshStandardMaterial
            color={hayCaudal ? P.success : P.textFaint}
            emissive={hayCaudal ? P.success : "#000000"}
            emissiveIntensity={hayCaudal ? 1.4 : 0}
            toneMapped={false}
            transparent={material.opacidad < 1}
            opacity={material.opacidad}
          />
        </mesh>
      </group>

      <group position={[-LARGO / 2 + 0.18, ALTO_COLECTOR + 0.12, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

export const ALTURA_DISTRIBUCION = ALTO_COLECTOR + 0.95;
