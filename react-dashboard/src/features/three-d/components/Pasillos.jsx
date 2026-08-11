/**
 * Las cintas del suelo que encadenan las máquinas de una misma fila.
 *
 * No son decoración: sin ellas, la maqueta son diez objetos sueltos sobre un
 * disco, y con ellas se leen tres filas —las rectificadoras y las dos de
 * líneas— que es como está organizada la planta de verdad. Es la misma idea
 * que las líneas de la pantalla de GraphWorX.
 *
 * ── POR QUÉ PLANOS EN EL SUELO Y NO LÍNEAS ─────────────────────────
 *
 * Una `<Line>` de drei arrastra `meshline` y, sobre todo, una línea de 1 px se
 * pierde en escorzo justo en la vista isométrica, que es la que se usa. Una
 * cinta plana con grosor real se ve desde cualquier ángulo y no añade ninguna
 * dependencia.
 */
import { usePaleta3D } from "../lib/paleta.js";
import { tramos } from "../lib/layout.js";

const ANCHO = 0.16;

export default function Pasillos() {
  const P = usePaleta3D();

  return (
    <group>
      {tramos().map(({ id, a, b }) => {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const largo = Math.hypot(dx, dz);

        return (
          <mesh
            key={id}
            // Justo por encima del suelo y de la rejilla, para que no peleen
            // por el mismo píxel al mover la cámara.
            position={[a.x + dx / 2, 0.006, a.z + dz / 2]}
            rotation={[-Math.PI / 2, 0, -Math.atan2(dz, dx)]}
          >
            <planeGeometry args={[largo, ANCHO]} />
            <meshBasicMaterial color={P.conector} transparent opacity={0.75} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
