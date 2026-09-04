/**
 * Lo que gira: el eje, el acoplamiento y el disco de desbalance, en un grupo.
 *
 * ── EL GIRO ES `SPEED_BMS`, NO UNA ANIMACIÓN ───────────────────────
 *
 * Es el mismo principio que hace que valga la pena la maqueta del tanque, donde
 * el líquido de la columna **es** `SNIVEL_TANQUE` en vivo. Aquí la geometría
 * tampoco ilustra el dato: el eje gira porque el variador dice que gira, y deja
 * de girar cuando deja de decirlo.
 *
 * De ahí que este componente no tenga ni un valor por defecto simpático: sin
 * lectura de régimen, `rpmEjeDe` devuelve cero y esto se queda quieto. Un eje
 * girando «mientras llega el dato» afirmaría que la máquina está encendida sin
 * que nadie lo haya dicho — y esta máquina, a diferencia del tanque, no publica
 * ninguna señal de la que deducirlo.
 *
 * ── UN CILINDRO LISO GIRANDO NO SE VE GIRAR ────────────────────────
 *
 * Es el mismo problema que resolvió el impulsor de tres álabes de `BombaModel`.
 * Aquí hay dos referencias visuales, y las dos son piezas reales del banco:
 *
 *   · el **chavetero** del eje — un rebaje plano que rompe la simetría de
 *     revolución, así que el ojo tiene algo a lo que agarrarse;
 *   · los **barrenos periféricos** del disco, que es donde se atornillan las
 *     masas de prueba. Son la razón de ser del disco y hacen de rueda dentada
 *     para la vista.
 *
 * Ninguna de las dos se ha añadido «para que se note el giro»: estaban en el
 * equipo. Lo que se eligió fue no esconderlas.
 *
 * ── UN SOLO BUCLE, Y ESTÁ DECLARADO ────────────────────────────────
 *
 * La regla de `lib/motion.js` —«una animación en bucle es una alarma»— admite
 * dos excepciones en cada escena 3D de este proyecto, y aquí son las mismas dos
 * que en la maqueta: el destello de la baliza en `critico`, y este giro, que no
 * lo declara un estado sino una magnitud medida. Ver la cabecera de
 * `lib/comportamiento.js`, donde la regla está escrita entera.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

/** Radio del eje dibujado. Ver `rotor.js`: la escala no es literal. */
const RADIO_EJE = 0.045;

/** Barrenos del disco. Doce, repartidos en su periferia. */
const BARRENOS = 12;

export default function EjeRotorModel({
  descriptor,
  /** Ritmo de DIBUJO en rpm. Ver `rpmEjeDe` en `lib/rotor.js`. */
  rpm = 0,
  /** Extremos del eje en X, y dónde va el disco. */
  desde,
  hasta,
  discoX,
  acoplamientoX,
  altura = 0.62,
  detalle = true,
}) {
  const P = usePaleta3D();
  const giro = useRef();

  const { material } = descriptor;
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const props3 = propsMaterial(material);

  const largo = hasta - desde;
  const centro = (desde + hasta) / 2;

  const barrenos = useMemo(
    () =>
      Array.from({ length: BARRENOS }, (_, i) => {
        const a = (i / BARRENOS) * Math.PI * 2;
        return [Math.cos(a) * 0.19, Math.sin(a) * 0.19];
      }),
    [],
  );

  useFrame((_, dt) => {
    if (!giro.current || rpm <= 0) return;
    giro.current.rotation.x += (rpm / 60) * Math.PI * 2 * dt;
  });

  return (
    <group ref={giro} position={[0, altura, 0]}>
      {/* El eje. Su geometría se crea a lo largo de Y y se tumba sobre X; el
          grupo padre gira sobre X, así que gira sobre su propio eje. */}
      <mesh position={[centro, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[RADIO_EJE, RADIO_EJE, largo, 18]} />
        <meshStandardMaterial color={colorMetal} {...props3} metalness={0.55} roughness={0.3} />
      </mesh>

      {/* Chavetero: un rebaje plano a lo largo del eje. Rompe la simetría de
          revolución, que es lo que permite ver que gira. */}
      {detalle && (
        <mesh position={[centro, RADIO_EJE * 0.72, 0]} castShadow>
          <boxGeometry args={[largo * 0.94, RADIO_EJE * 0.5, RADIO_EJE * 1.1]} />
          <meshStandardMaterial color={colorOscuro} {...props3} metalness={0.4} />
        </mesh>
      )}

      {/* Acoplamiento: manguito con dos bridas, en el extremo del motor. */}
      <group position={[acoplamientoX, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.17, 16]} />
          <meshStandardMaterial color={P.goma} {...props3} />
        </mesh>
        {detalle &&
          [-0.085, 0.085].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.115, 0.115, 0.022, 16]} />
              <meshStandardMaterial color={colorOscuro} {...props3} />
            </mesh>
          ))}
      </group>

      {/* Disco de desbalance. */}
      <group position={[discoX, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.05, 32]} />
          <meshStandardMaterial color={colorMetal} {...props3} metalness={0.45} roughness={0.4} />
        </mesh>
        {/* Cubo central, donde aprieta contra el eje. */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.085, 0.085, 0.09, 16]} />
          <meshStandardMaterial color={colorOscuro} {...props3} />
        </mesh>
        {/* Los barrenos: agujeros para las masas de prueba, pintados en
            oscuro. Son la identidad del disco y la referencia del giro. */}
        {detalle &&
          barrenos.map(([y, z], i) => (
            <mesh key={i} position={[0, y, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.024, 0.024, 0.062, 8]} />
              <meshStandardMaterial color={colorOscuro} {...props3} />
            </mesh>
          ))}
      </group>
    </group>
  );
}
