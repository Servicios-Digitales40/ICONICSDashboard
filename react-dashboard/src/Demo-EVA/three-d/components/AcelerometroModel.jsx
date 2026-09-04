/**
 * Una sonda Hansford HS-100100020 con su eje de medida dibujado.
 *
 * ── POR QUÉ ESTA PIEZA JUSTIFICA LA VISTA ENTERA ───────────────────
 *
 * La pantalla «Gráficas» ya enseña los tres apoyos con sus cuatro medidas, y
 * las enseña mejor que un modelo 3D: en una tabla se comparan de un vistazo.
 * Si esta vista sólo pintara el mismo número sobre una máquina bonita, sería
 * la tabla otra vez y con más GPU.
 *
 * Lo que aporta es lo que una tabla no puede decir: **dónde** está cada sonda y
 * **en qué dirección** mide. Y ahí es donde este banco tiene un problema real
 * que ningún número revela — las tres están montadas en vertical, y sólo en
 * vertical.
 *
 * ── LOS EJES QUE FALTAN SE DIBUJAN ─────────────────────────────────
 *
 * La flecha vertical va sólida: eso se mide. Las otras dos —horizontal y
 * axial— se dibujan en trazo fantasma, y son la información de verdad:
 *
 *   · sin AXIAL, una desalineación de acoplamiento puede no aparecer nunca;
 *   · sin la segunda RADIAL, un desequilibrio y una holgura se ven iguales.
 *
 * Dibujar sólo la flecha vertical dejaría creer que la instrumentación está
 * completa, que es la mentira cómoda. Dibujar las tres iguales diría que se
 * miden las tres, que es la mentira grave. Sólida más fantasma es lo único que
 * dice las dos cosas a la vez: qué hay y qué falta.
 *
 * El motivo largo, y la consecuencia normativa, están en `EJES_MEDIDA` dentro
 * de `shared/eva/vibraciones/vibraciones.js`.
 *
 * ── POR QUÉ EL CABLE NO ES DECORACIÓN ──────────────────────────────
 *
 * Porque AlarmWorX vigila «cable roto» en esta máquina (cuatro de sus 57
 * alarmas), y porque el propio levantamiento anotó la malla del conector
 * expuesta. Un acelerómetro sin cable se lee como un tornillo.
 */
import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { propsMaterial, tono } from "../lib/materiales.js";

/** Alto del cuerpo cilíndrico de la sonda. */
const CUERPO = 0.17;
/** Alto del adaptador hexagonal roscado que la une al soporte. */
const HEXAGONO = 0.06;

/**
 * Una flecha de eje: barra más punta cónica.
 *
 * `presente` decide si es una dirección que se mide o una que falta. Las que
 * faltan van en malla de alambre y translúcidas — el mismo vocabulario que un
 * activo `sin_dato` en la maqueta del tanque, y por la misma razón: la ausencia
 * se pinta como ausencia y nunca como una versión apagada de lo que hay.
 */
function Flecha({ direccion, longitud, color, presente }) {
  const grosor = presente ? 0.014 : 0.009;
  const punta = presente ? 0.05 : 0.038;

  const material = presente
    ? { color, emissive: color, emissiveIntensity: 0.5, toneMapped: false }
    : { color, transparent: true, opacity: 0.42, wireframe: true };

  /* `direccion` es la rotación que lleva el +Y de la geometría al eje que toca:
     vertical no rota, horizontal cae sobre Z, axial cae sobre X. */
  return (
    <group rotation={direccion}>
      <mesh position={[0, longitud / 2, 0]}>
        <cylinderGeometry args={[grosor, grosor, longitud, 8]} />
        <meshStandardMaterial {...material} />
      </mesh>
      <mesh position={[0, longitud + punta / 2, 0]}>
        <coneGeometry args={[punta, punta * 1.9, 10]} />
        <meshStandardMaterial {...material} />
      </mesh>
    </group>
  );
}

export default function AcelerometroModel({
  descriptor,
  /** ¿Se dibujan los ejes de medida (el vertical y los dos que faltan)? */
  ejes = true,
  /** La baliza de estado. Se apaga en los elementos que no la necesitan. */
  baliza = true,
  detalle = true,
  ...props
}) {
  const P = usePaleta3D();
  const { material } = descriptor;

  const colorInox = tono(P, P.metal, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const props3 = propsMaterial(material);

  return (
    <group {...props}>
      {/* Adaptador hexagonal: seis lados de verdad, porque es lo que distingue
          un montaje roscado —el bueno— de una base pegada o magnética. */}
      <mesh position={[0, HEXAGONO / 2, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, HEXAGONO, 6]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/* Cuerpo de acero inoxidable. */}
      <mesh position={[0, HEXAGONO + CUERPO / 2, 0]} castShadow>
        <cylinderGeometry args={[0.048, 0.048, CUERPO, 16]} />
        <meshStandardMaterial color={colorInox} {...props3} roughness={0.32} metalness={0.55} />
      </mesh>

      {/* Collarín superior por donde sale el cable. */}
      <mesh position={[0, HEXAGONO + CUERPO + 0.012, 0]}>
        <cylinderGeometry args={[0.03, 0.042, 0.028, 14]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/* El cable, doblado hacia atrás. Dos tramos y no una curva: una
          `TubeGeometry` con su curva costaría más de lo que aporta a esta
          escala, y el codo se lee igual. */}
      {detalle && (
        <group>
          <mesh position={[0, HEXAGONO + CUERPO + 0.06, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.075, 8]} />
            <meshStandardMaterial color={P.goma} {...props3} />
          </mesh>
          <mesh
            position={[0, HEXAGONO + CUERPO + 0.095, -0.09]}
            rotation={[Math.PI / 2.4, 0, 0]}
          >
            <cylinderGeometry args={[0.011, 0.011, 0.2, 8]} />
            <meshStandardMaterial color={P.goma} {...props3} />
          </mesh>
        </group>
      )}

      {/*
        Los ejes. Salen del CENTRO del cuerpo de la sonda porque es donde está
        su elemento sensor, no de su base ni de su punta.
      */}
      {ejes && (
        <group position={[0, HEXAGONO + CUERPO / 2, 0]}>
          {/* Vertical: el único que se mide. */}
          <Flecha direccion={[0, 0, 0]} longitud={0.3} color={P.success} presente />
          {/* Horizontal (radial): falta. Cae sobre Z. */}
          <Flecha direccion={[Math.PI / 2, 0, 0]} longitud={0.24} color={P.textFaint} presente={false} />
          {/* Axial, a lo largo del eje del rotor: falta. Cae sobre X. */}
          <Flecha direccion={[0, 0, -Math.PI / 2]} longitud={0.24} color={P.textFaint} presente={false} />
        </group>
      )}

      {/* La baliza va DETRÁS de la sonda y no encima: encima taparía justo la
          flecha vertical, que es lo que esta pieza existe para enseñar. */}
      {baliza && (
        <group position={[0, 0, -0.24]} scale={0.72}>
          <Baliza descriptor={descriptor} luz={detalle} />
        </group>
      )}
    </group>
  );
}

/** Alto total de la sonda, para colocarla sobre un soporte. */
export const ALTURA_SONDA = HEXAGONO + CUERPO;
