/**
 * El suelo de la escena: un disco que recibe sombra y una rejilla encima.
 *
 * La rejilla no es decoración. Es la única referencia de escala y de
 * profundidad que tiene la escena: sin ella, un modelo sobre un plano liso
 * flota y el zoom no se percibe como acercarse sino como agrandar. Se usa
 * `gridHelper`, que es de three y no de drei, porque el `<Grid>` de drei trae
 * su propio shader para un efecto —desvanecido por distancia— que aquí no hace
 * falta.
 */
import { usePaleta3D } from "../lib/paleta.js";

export default function Piso({ radio = 9, divisiones = 18 }) {
  const P = usePaleta3D();
  const lado = radio * 2;

  return (
    <group>
      {/* El disco va un pelo por debajo de cero para que la rejilla, que se
          dibuja en y=0 exacto, no pelee con él por el mismo píxel (z-fighting:
          se ve como un parpadeo de líneas al mover la cámara). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
        <circleGeometry args={[radio, 64]} />
        <meshStandardMaterial color={P.suelo} roughness={0.95} metalness={0} />
      </mesh>

      <gridHelper args={[lado, divisiones, P.rejilla, P.rejilla]} />
    </group>
  );
}
