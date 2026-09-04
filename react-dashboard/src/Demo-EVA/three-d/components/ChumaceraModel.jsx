/**
 * Una chumacera de pie: el soporte con rodamiento por el que pasa el eje.
 *
 * Las dos del banco son iguales, así que el modelo es uno y la vista lo planta
 * dos veces con distinto estado. Lo que las distingue no es la geometría sino
 * el canal que lleva encima —S2 en la primera, S3 en la segunda— y eso vive en
 * `TREN_MECANICO`, no aquí.
 *
 * ── EL AGUJERO ES LA PIEZA ─────────────────────────────────────────
 *
 * Una chumacera se reconoce porque el eje la ATRAVIESA, y eso obliga a dibujar
 * el hueco: dos costados con aire entre ellos por donde pasa el eje, en vez de
 * un bloque macizo con el eje interrumpido a los lados. Un bloque macizo se
 * leería como un tope o una mordaza, y la diferencia importa —es la única
 * pieza de la escena que sujeta el eje sin arrastrarlo—.
 *
 * ── POR QUÉ NO LLEVA REFERENCIA DE RODAMIENTO ──────────────────────
 *
 * Porque no la tenemos, y es de las cosas que más falta hacen: sin el modelo
 * del rodamiento no hay número de elementos ni ángulo de contacto, y sin eso
 * no se pueden calcular BPFO, BPFI, BSF ni FTF — las cuatro frecuencias con
 * las que se diagnostica un rodamiento picado. El levantamiento lo pide con
 * prioridad alta (§8.4) y `CANALES` lo deja en `null` a propósito para los dos
 * canales que se apoyan aquí.
 */
import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

/**
 * Alto desde el PLANO DE MONTAJE hasta el centro del rodamiento.
 *
 * El origen de este modelo es la cara superior de la bancada, no el suelo: la
 * vista lo planta ya sobre ella. Tiene que valer `ALTURA_EJE_MONTAJE` de
 * `lib/rotor.js`, y la prueba lo comprueba — si los dos se separan, el eje
 * pasa por fuera del rodamiento que lo sujeta.
 */
const ALTO = 0.46;
/** Separación entre los dos costados: el hueco por el que pasa el eje. */
const HUECO = 0.13;

export default function ChumaceraModel({ descriptor, detalle = true, ...props }) {
  const P = usePaleta3D();
  const { material } = descriptor;

  const colorCuerpo = tono(P, P.motorAzul, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  return (
    <group {...props}>
      {/* Base atornillada a la ranura de la bancada. */}
      <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.07, 0.42]} />
        <meshStandardMaterial color={colorCuerpo} {...props3} />
      </mesh>

      {/* Los dos tornillos de anclaje, uno a cada lado. */}
      {detalle &&
        [-0.15, 0.15].map((z) => (
          <mesh key={z} position={[0, 0.085, z]}>
            <cylinderGeometry args={[0.025, 0.025, 0.03, 6]} />
            <meshStandardMaterial color={colorMetal} {...props3} />
          </mesh>
        ))}

      {/* Los dos costados. El aire entre ellos es por donde pasa el eje. */}
      {[-1, 1].map((lado) => (
        <group key={lado} position={[0, 0, (lado * (HUECO + 0.09)) / 2]}>
          {/* Cuello: se estrecha al subir, como el de una chumacera real. */}
          <mesh position={[0, ALTO / 2 + 0.02, 0]} castShadow>
            <boxGeometry args={[0.19, ALTO - 0.04, 0.09]} />
            <meshStandardMaterial color={colorCuerpo} {...props3} />
          </mesh>
          {/* Anillo del rodamiento, a la altura del eje. */}
          <mesh position={[0, ALTO, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.09, 20]} />
            <meshStandardMaterial color={colorCuerpo} {...props3} />
          </mesh>
          {/* Pista interior, en metal: el aro que de verdad toca el eje. */}
          {detalle && (
            <mesh position={[0, ALTO, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.075, 0.075, 0.1, 18]} />
              <meshStandardMaterial color={colorMetal} {...props3} metalness={0.5} />
            </mesh>
          )}
        </group>
      ))}

      {/* Tapa superior, que une los dos costados por encima del eje y es donde
          se atornilla la sonda. */}
      <mesh position={[0, ALTO + 0.135, 0]} castShadow>
        <boxGeometry args={[0.19, 0.05, 0.22]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      <group position={[0, ALTO + 0.16, 0.2]} scale={0.8}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>
    </group>
  );
}

/** Altura del centro del rodamiento: es la cota a la que corre el eje. */
export const ALTO_CHUMACERA = ALTO;
/** Dónde se atornilla la sonda, relativo al origen de la chumacera. */
export const SONDA_OFFSET = [0, ALTO + 0.16, 0];
