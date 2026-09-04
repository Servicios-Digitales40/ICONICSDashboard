/**
 * El motor WEG W22 143/5T que acciona el banco de rotor.
 *
 * ── POR QUÉ NO SE REUSA `BombaModel` ───────────────────────────────
 *
 * Porque el motor de aquella escena es media pieza de un grupo de bombeo: sale
 * acoplado a una voluta, con su impulsor y su manómetro, y su silueta está
 * pensada para leerse como «esto bombea». Éste no bombea nada: arrastra un eje
 * con un disco de desbalance, y lo que tiene que leerse es que **es el origen
 * del giro** y que lleva la primera sonda encima.
 *
 * Extraer un tronco común de los dos habría dejado un `MotorGenericoModel` con
 * banderas para las aletas, la caja de bornes, la campana del ventilador y el
 * eje que asoma — cuatro condicionales para ahorrar treinta líneas de
 * geometría que no comparten sentido. La geometría es barata; la indirección
 * no.
 *
 * ── LA CAMPANA DEL VENTILADOR SE DIBUJA, Y NO ES ADORNO ────────────
 *
 * Es el extremo que el catálogo WEG llama «lado ventilador», y el que este
 * proyecto creyó durante una semana que estaba instrumentado con S3. Verlo
 * ocupado por su campana —sin sonda encima, mientras las otras tres piezas sí
 * la llevan— es la forma más rápida de entender por qué el `6204 ZZ` no
 * describía nada que se estuviera midiendo. Ver la cabecera de
 * `shared/eva/vibraciones/vibraciones.js`.
 */
import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

/** Radio de la carcasa. El eje sale a la altura de su centro. */
const RADIO = 0.3;
/** Largo del cuerpo, sin campana ni brida. */
const LARGO = 0.72;

/**
 * Dónde se atornilla la sonda S1 y dónde va la caja de bornes, en X.
 *
 * Separadas a propósito, y no es cosmético: puestas las dos en el centro del
 * lomo del motor se solapaban en el espacio —la caja ocupaba justo la altura a
 * la que arranca la sonda— y la sonda salía de dentro de la caja.
 */
const X_SONDA = 0.14;
const X_BORNES = -0.2;

export default function MotorWEGModel({ descriptor, alturaEje = 0.46, detalle = true, ...props }) {
  const P = usePaleta3D();
  const { material } = descriptor;

  const colorCuerpo = tono(P, P.motorAzul, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  return (
    <group {...props}>
{/*
        Patas atornilladas a la bancada. Su altura NO es libre: tienen que
        llegar exactamente hasta la generatriz inferior del cuerpo
        (`alturaEje − RADIO`), o el motor flota sobre el banco.
      */}
      {[-0.22, 0.22].map((z) => (
        <mesh key={z} position={[0, (alturaEje - RADIO) / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[0.66, alturaEje - RADIO, 0.12]} />
          <meshStandardMaterial color={colorOscuro} {...props3} />
        </mesh>
      ))}

      {/* Cuerpo: cilindro tumbado a lo largo de X. */}
      <mesh position={[0, alturaEje, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[RADIO, RADIO, LARGO, 24]} />
        <meshStandardMaterial color={colorCuerpo} {...props3} />
      </mesh>

      {/* Aletas de refrigeración. Son lo que hace que un cilindro azul se lea
          como un motor y no como un depósito tumbado. */}
      {detalle &&
        [-0.28, -0.16, -0.04, 0.08, 0.2].map((x) => (
          <mesh key={x} position={[x, alturaEje, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[RADIO + 0.022, RADIO + 0.022, 0.02, 24]} />
            <meshStandardMaterial color={colorCuerpo} {...props3} />
          </mesh>
        ))}

      {/* Caja de bornes, en el lado del ventilador para dejar libre el lomo
          donde va la sonda. */}
      {detalle && (
        <mesh position={[X_BORNES, alturaEje + RADIO + 0.07, 0]} castShadow>
          <boxGeometry args={[0.26, 0.14, 0.2]} />
          <meshStandardMaterial color={colorOscuro} {...props3} />
        </mesh>
      )}

      {/* Campana del ventilador, en el extremo opuesto al acoplamiento. Sin
          sonda: ver la cabecera. */}
      <mesh position={[-LARGO / 2 - 0.09, alturaEje, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[RADIO - 0.03, RADIO - 0.05, 0.18, 20]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>
      {detalle && (
        <mesh position={[-LARGO / 2 - 0.185, alturaEje, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[RADIO - 0.06, RADIO - 0.06, 0.012, 20]} />
          <meshStandardMaterial color={colorMetal} {...props3} />
        </mesh>
      )}

      {/* Brida del lado acople, por donde sale el eje hacia el tren. */}
      <mesh position={[LARGO / 2 + 0.03, alturaEje, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.08, 20]} />
        <meshStandardMaterial color={colorMetal} {...props3} />
      </mesh>

      {/* La baliza del apoyo S1 remata la caja de bornes. El acelerómetro va
          aparte, montado por la vista sobre el lomo de la carcasa: son dos
          piezas distintas, y en el banco real también lo son. */}
      <group position={[X_BORNES, alturaEje + RADIO + 0.14, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

/**
 * Dónde se planta la sonda S1, relativo al origen del motor (el plano de
 * montaje). La Y se compone fuera con la altura del eje, que es un dato de la
 * escena y no de esta pieza.
 */
export const SONDA_S1_OFFSET_X = X_SONDA;
export const SONDA_S1_ALTURA = RADIO;
