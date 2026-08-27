/**
 * La torreta de señalización sobre la máquina.
 *
 * Es el CANAL PRINCIPAL del estado, no un adorno: a tres metros de la pantalla
 * es lo único que se lee sin esfuerzo, y es además la convención que el
 * operador ya conoce de la planta real. Todo lo demás —pose, material,
 * movimiento— refuerza lo que dice la baliza.
 *
 * De ahí dos decisiones:
 *
 *  - `toneMapped={false}` en la cúpula. Con el mapeado de tonos activo, un
 *    color saturado y emisivo se lava hacia el blanco y el verde deja de
 *    distinguirse del ámbar justo cuando más brilla, que es el momento en que
 *    tiene que leerse.
 *  - Un `pointLight` de radio corto acompaña a la cúpula. El halo sobre la
 *    carcasa es lo que hace que se lea como una luz encendida y no como una
 *    bola de plástico de color.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { colorDeToken, usePaleta3D } from "../lib/paleta.js";

/** Altura del poste. La cúpula va encima. */
const POSTE = 0.34;

export default function Baliza({
  descriptor,
  escala = 1,
  /**
   * El `pointLight` que acompaña a la cúpula.
   *
   * Se apaga en la maqueta: son diez máquinas, y cada luz puntual obliga al
   * renderizador a recompilar y reevaluar el sombreado de todo lo que alcanza.
   * A esa escala el halo sobre la carcasa no se aprecia, así que se paga por
   * nada. La emisión de la cúpula sí se conserva, y es lo que se lee de lejos.
   */
  luz = true,
}) {
  const P = usePaleta3D();
  const cupula = useRef();
  const refLuz = useRef();

  const { patron, hz, intensidad } = descriptor.baliza;
  const color = colorDeToken(P, descriptor.token);
  const apagada = patron === "apagada";

  useFrame(({ clock }) => {
    if (!cupula.current) return;

    // Onda cuadrada suavizada: el destello tiene que leerse como un
    // intermitente, no como un latido. Con un seno puro la baliza pasa la
    // mitad del tiempo en tonos intermedios y de lejos parece encendida fija.
    let factor = 1;
    if (patron === "destello" && hz > 0) {
      const fase = Math.sin(clock.elapsedTime * hz * Math.PI * 2);
      factor = 0.18 + 0.82 * Math.min(1, Math.max(0, fase * 3 + 0.5));
    }

    const emision = apagada ? 0 : intensidad * factor;
    cupula.current.material.emissiveIntensity = emision * 2.6;
    if (refLuz.current) refLuz.current.intensity = emision * 1.5;
  });

  return (
    <group scale={escala}>
      {/* Poste */}
      <mesh position={[0, POSTE / 2, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, POSTE, 10]} />
        <meshStandardMaterial color={P.goma} roughness={0.8} />
      </mesh>

      {/* Cúpula: media esfera. Apagada se pinta gris y sin emisión, para que
          «sin dato» no se vea como una luz de color a media asta. */}
      <mesh ref={cupula} position={[0, POSTE + 0.075, 0]} castShadow>
        <sphereGeometry args={[0.105, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={apagada ? P.goma : color}
          emissive={apagada ? "#000000" : color}
          emissiveIntensity={apagada ? 0 : intensidad * 2.6}
          roughness={0.35}
          toneMapped={false}
        />
      </mesh>

      {/* Base de la cúpula, para que no flote sobre el poste. */}
      <mesh position={[0, POSTE + 0.055, 0]}>
        <cylinderGeometry args={[0.108, 0.108, 0.045, 18]} />
        <meshStandardMaterial color={P.goma} roughness={0.8} />
      </mesh>

      {!apagada && luz && (
        <pointLight
          ref={refLuz}
          position={[0, POSTE + 0.14, 0]}
          color={color}
          intensity={intensidad * 1.5}
          distance={1.5}
          decay={2}
        />
      )}
    </group>
  );
}
