/**
 * La red de distribución: la columna aguas abajo de la bomba.
 *
 * Es el activo que responde «¿sale agua, y con qué presión?».
 *
 * ── POR QUÉ ES UNA COLUMNA Y NO UN COLECTOR TUMBADO ────────────────
 *
 * Hasta agosto de 2026 era un colector horizontal con tres salidas y sus
 * válvulas: una pieza razonable, inventada, de cuando no había dibujo del
 * equipo. En el equipo real —ver `react-dashboard/img/`— lo que hay aguas abajo es
 * una COLUMNA de metacrilato vertical, más alta que el armario, con su boquilla
 * arriba. Es además la silueta por la que se reconoce el skid de lejos.
 *
 * Se cambió al rehacer la maqueta contra el dibujo, y es el modelo que más se
 * nota al comparar las dos vistas.
 *
 * ── EL TESTIGO DE CAUDAL, Y POR QUÉ NO SE MUEVE ────────────────────
 *
 * La tentación evidente es hacer circular algo por dentro. Sería un **tercer
 * bucle** en una aplicación que se permite dos, y el argumento de
 * `lib/motion.js` aplica entero: con el giro del impulsor ya contando la
 * impulsión, un flujo animado no añadiría información y sí cansancio en una
 * pantalla que se mira ocho horas.
 *
 * El testigo es en cambio ESTÁTICO y de dos canales: el anillo del
 * caudalímetro se enciende cuando hay caudal medido, y las flechas de la
 * tubería se apagan cuando no lo hay (ver `Tuberias.jsx`).
 *
 * ── EL NIVEL SE MIDE AQUÍ, AUNQUE LA SEÑAL SE LLAME DEL TANQUE ─────
 *
 * `SNIVEL_TANQUE` la publica un sensor montado **encima de esta columna**, así
 * que el porcentaje es el llenado de este vaso y no el del bidón de abajo.
 * Hasta que se supo, el líquido se pintaba en `DepositoModel` — un dato medido en
 * un recipiente, dibujado dentro de otro.
 *
 * Por eso este modelo tiene líquido y el del depósito no: el bidón no tiene
 * sensor, y un nivel inventado ahí sería exactamente lo que el resto de la
 * sección se niega a hacer con los huecos.
 *
 * El cabezal turquesa de arriba no es adorno: es de dónde sale el número. Que
 * se vea encima del vaso es lo que hace la lectura comprobable a simple vista.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";

import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

/** Constante de suavizado del nivel, en 1/s. Con 6 asienta en ~0.5 s. */
const SUAVIZADO = 6;

/** Medidas de la columna, a ojo sobre el dibujo. */
const RADIO = 0.3;
const ALTO = 1.45;
const PEANA = 0.12;

export default function ColumnaModel({
  descriptor,
  hayCaudal = false,
  /** Nivel en 0-100, o `null` si no hay lectura. Ver la cabecera. */
  nivelPct = null,
  detalle = true,
  ...props
}) {
  const P = usePaleta3D();

  /*
   * Con `frameloop="demand"` sólo se dibuja lo que alguien pide, así que la
   * interpolación arrancaría y se congelaría a medio camino. La solución es la
   * misma que tenía el tanque: que la propia animación pida el fotograma
   * siguiente mientras no haya convergido.
   */
  const invalidate = useThree((s) => s.invalidate);
  const liquido = useRef();
  const anim = useRef({ nivel: 0 });

  const hayNivel = Number.isFinite(nivelPct);
  const objetivo = hayNivel ? Math.max(0, Math.min(100, nivelPct)) / 100 : 0;

  useFrame((_, dt) => {
    const a = anim.current;
    const siguiente = MathUtils.damp(a.nivel, objetivo, SUAVIZADO, dt);

    if (Math.abs(siguiente - a.nivel) > 0.0005) invalidate();
    a.nivel = siguiente;

    if (liquido.current) {
      const alto = Math.max(0.0001, a.nivel * (ALTO - 0.1));
      // Cilindro de altura 1 escalado en Y y recolocado a la vez, para que el
      // líquido crezca desde el FONDO del vaso y no desde su centro.
      liquido.current.scale.y = alto;
      liquido.current.position.y = PEANA + 0.05 + alto / 2;
      liquido.current.visible = hayNivel && a.nivel > 0.002;
    }
  });

  const { material } = descriptor;
  const colorCarcasa = tono(P, P.carcasa, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  return (
    <group {...props}>
      {/* Peana y brida inferior */}
      <mesh position={[0, PEANA / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[RADIO + 0.09, RADIO + 0.12, PEANA, 22]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/* El líquido: es el dato en vivo. Va antes de la pared para que la pared
          translúcida se pinte encima y se lea «dentro del vaso». */}
      <mesh ref={liquido} position={[0, PEANA + 0.05, 0]}>
        <cylinderGeometry args={[RADIO - 0.03, RADIO - 0.03, 1, 26]} />
        <meshStandardMaterial
          color={P.accent}
          transparent
          opacity={0.75 * material.opacidad}
          roughness={0.12}
          metalness={0.05}
        />
      </mesh>

      {/* El vaso. Abierto y a doble cara, como el tanque: sin `side: 2` un
          cilindro sin tapas se ve por dentro como un recorte. */}
      <mesh position={[0, PEANA + ALTO / 2, 0]} castShadow={material.opacidad >= 1}>
        <cylinderGeometry args={[RADIO, RADIO, ALTO, 26, 1, true]} />
        <meshStandardMaterial
          color={colorCarcasa}
          transparent
          opacity={0.26 * material.opacidad}
          roughness={0.12}
          metalness={0.1}
          wireframe={material.wireframe}
          side={2}
        />
      </mesh>

      {/* Bridas de arriba y de abajo, que es lo que le da el aire de equipo y
          no de probeta. */}
      {[PEANA + 0.03, PEANA + ALTO - 0.03].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <cylinderGeometry args={[RADIO + 0.05, RADIO + 0.05, 0.06, 22]} />
          <meshStandardMaterial color={colorMetal} {...props3} />
        </mesh>
      ))}

      {/* Tirantes verticales del vaso. */}
      {detalle &&
        [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => (
          <mesh
            key={a}
            position={[Math.cos(a) * (RADIO + 0.02), PEANA + ALTO / 2, Math.sin(a) * (RADIO + 0.02)]}
            castShadow
          >
            <boxGeometry args={[0.03, ALTO - 0.1, 0.03]} />
            <meshStandardMaterial color={colorMetal} {...props3} />
          </mesh>
        ))}

      {/* La boquilla de arriba: el remate por el que se reconoce la columna. */}
      <mesh position={[0, PEANA + ALTO + 0.11, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.11, 0.22, 16]} />
        <meshStandardMaterial color={colorMetal} {...props3} />
      </mesh>

      {/* El sensor de nivel, sobre la boquilla. Es de dónde sale el porcentaje
          que mueve el líquido de aquí abajo, así que se dibuja: un número en
          pantalla se cree más cuando se ve el aparato que lo mide. Lleva el
          tinte del estado como el resto, pero conserva su turquesa de base. */}
      <mesh position={[0, PEANA + ALTO + 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, 0.16, 14]} />
        <meshStandardMaterial color={tono(P, P.sensor, material, descriptor.token)} {...props3} />
      </mesh>
      {detalle && (
        <mesh position={[0, PEANA + ALTO + 0.4, 0]} castShadow>
          <boxGeometry args={[0.12, 0.06, 0.12]} />
          <meshStandardMaterial color={tono(P, P.sensor, material, descriptor.token)} {...props3} />
        </mesh>
      )}

      {/* El caudalímetro, en la brida de entrada. El anillo ES el testigo:
          encendido con caudal medido, apagado sin él. Estático, a propósito. */}
      <mesh position={[0, PEANA + 0.34, RADIO + 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.1, 18]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>
      <mesh position={[0, PEANA + 0.34, RADIO + 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.08, 0.02, 8, 22]} />
        <meshStandardMaterial
          color={hayCaudal ? P.success : P.textFaint}
          emissive={hayCaudal ? P.success : "#000000"}
          emissiveIntensity={hayCaudal ? 1 : 0}
          toneMapped={false}
          transparent={material.opacidad < 1}
          opacity={material.opacidad}
        />
      </mesh>

      <group position={[0, PEANA + ALTO + 0.58, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

/** Alto total, para que la vista pueda colocar la ficha justo encima. */
export const ALTURA_COLUMNA = PEANA + ALTO + 0.9;
