/**
 * Iluminación de la escena, explícita.
 *
 * ── POR QUÉ NO SE USA `<Environment preset="…">` ───────────────────
 *
 * El `preset` de drei **descarga el HDRI desde un CDN de GitHub en tiempo de
 * ejecución**. En una pantalla de planta sin salida a internet la petición
 * falla, la escena se queda sin iluminar y no hay ningún error visible: se ve
 * un modelo negro y nadie sabe por qué. Toda la luz de esta aplicación se
 * define aquí, en local, y por eso la escena funciona igual desconectada.
 *
 * Tres luces y una sola sombra: es lo que pide un modelo de caras planas, y
 * cada foco con sombra extra es un mapa de profundidad más por fotograma en un
 * equipo que va a estar encendido ocho horas.
 */
import { usePaleta3D } from "../lib/paleta.js";

export default function Luces({ sombras = true, intensidad = 1 }) {
  const P = usePaleta3D();

  return (
    <>
      {/* Ambiente: cielo frío arriba, rebote del suelo abajo. Levanta las
          caras en sombra sin aplanar el volumen, que es lo que haría un
          `ambientLight` puro. */}
      <hemisphereLight
        args={[P.dark ? "#4A5670" : "#FFFFFF", P.suelo, (P.dark ? 1.1 : 1.4) * intensidad]}
      />

      {/* Luz principal. Es la única que proyecta sombra. El `bias` negativo
          quita el moteado de auto-sombreado en las caras casi paralelas.

          Ojo con el nombre de las props: r3f parte por guiones y trata cada
          trozo como una propiedad anidada, así que `shadow-normal-bias` se
          resuelve como `shadow.normal.bias` —que no existe— y revienta con
          «Cannot read properties of undefined». El camelCase se conserva
          DENTRO de cada segmento: `shadow-normalBias`. */}
      <directionalLight
        position={[6, 10, 6]}
        intensity={(P.dark ? 1.5 : 2.1) * intensidad}
        castShadow={sombras}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      >
        {/* Volumen de sombra ajustado a la escena: por defecto es enorme y
            reparte los 1024 píxeles del mapa sobre metros vacíos. */}
        <orthographicCamera attach="shadow-camera" args={[-12, 12, 12, -12, 0.1, 40]} />
      </directionalLight>

      {/* Relleno desde el lado opuesto, sin sombra: evita que la cara oculta
          quede en negro absoluto, donde ya no se distingue la silueta. */}
      <directionalLight position={[-8, 5, -6]} intensity={0.45 * intensidad} />
    </>
  );
}
