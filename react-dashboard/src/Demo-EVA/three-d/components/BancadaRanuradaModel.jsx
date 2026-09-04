/**
 * La bancada de perfil de aluminio ranurado sobre la que va todo el tren.
 *
 * ── POR QUÉ SE DIBUJAN LAS RANURAS ─────────────────────────────────
 *
 * Porque son la explicación de por qué las cotas del banco faltan. Un perfil
 * ranurado existe para que los soportes se puedan mover: la distancia entre
 * chumaceras y la posición del disco no están fijadas por la máquina, se
 * eligen al montar la práctica. Por eso `EJE.distanciaEntreChumacerasMm` está
 * en `null` y no es un descuido de quien levantó el inventario — es que ese
 * número cambia cada vez que alguien afloja dos tornillos.
 *
 * Sin las ranuras, la base sería una plancha y el banco parecería una máquina
 * de geometría fija cuyas medidas alguien olvidó anotar.
 *
 * ── ESTE MODELO NO LLEVA ESTADO ────────────────────────────────────
 *
 * No recibe `descriptor` y no se tiñe con ningún color de estado, a diferencia
 * del motor y las chumaceras. La bancada no se mide: no hay sonda sobre ella y
 * no hay ninguna señal que hable de ella. Pintarla del color del peor apoyo
 * afirmaría un estado que nadie ha comprobado, y es la misma regla que impide
 * pintar de verde lo que sólo está callado.
 */
import { useMemo } from "react";

import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

export default function BancadaRanuradaModel({ largo, ancho, alto, ...props }) {
  const P = usePaleta3D();

  /* Las ranuras se dibujan como surcos oscuros recortados sobre la cara
     superior. Tres a lo largo, que es lo que lleva un perfil de este ancho. */
  const surcos = useMemo(() => [-ancho * 0.28, 0, ancho * 0.28], [ancho]);

  return (
    <group {...props}>
      <mesh position={[0, alto / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[largo, alto, ancho]} />
        <meshStandardMaterial color={P.aluminio} roughness={0.6} metalness={0.35} />
      </mesh>

      {surcos.map((z) => (
        <mesh key={z} position={[0, alto + 0.001, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[largo * 0.985, ancho * 0.13]} />
          <meshStandardMaterial color={P.carcasaOscura} roughness={0.85} />
        </mesh>
      ))}

      {/* Patas: cuatro tacos que separan el perfil del suelo, para que la
          bancada no se lea como pintada sobre la rejilla. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}:${sz}`}
            position={[(sx * largo) / 2.6, -0.035, (sz * ancho) / 3.2]}
            castShadow
          >
            <cylinderGeometry args={[0.05, 0.05, 0.07, 10]} />
            <meshStandardMaterial color={P.goma} roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}
