/**
 * El depósito de almacenamiento: el bidón azul del nivel de abajo del skid.
 *
 * ── POR QUÉ NO ES UN ACTIVO, Y NO TIENE NI BALIZA NI ESTADO ────────
 *
 * Porque no tiene ni un solo sensor.
 *
 * Las dos señales del activo «tanque» —`SNIVEL_TANQUE` y `STEMPERATURA_TANQUE`—
 * las mide la instrumentación montada sobre la COLUMNA, dos niveles más arriba.
 * Este bidón es el recipiente del que aspira la bomba, y de él no se publica
 * nada: ni nivel, ni temperatura, ni estado.
 *
 * Así que se dibuja como se dibuja el bastidor —presente, quieto y sin color de
 * estado— y la tarjeta del activo vive donde está el aparato que mide. Ponerle
 * baliza aquí sería prometer que este depósito informa de algo, y no informa.
 *
 * Hasta agosto de 2026 llevaba dentro el líquido de `SNIVEL_TANQUE`, que es un
 * nivel medido en otro recipiente pintado dentro de éste. Ver `ColumnaModel`.
 *
 * ── POR QUÉ SIGUE SIENDO TRANSLÚCIDO ───────────────────────────────
 *
 * No para enseñar nada de dentro —está vacío— sino porque va detrás de los
 * montantes del bastidor y opaco se comía media escena. Azul porque lo es en el
 * equipo real, y es por lo que se reconoce.
 */
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

/** Medidas del bidón, en metros de escena. */
const R = 0.62;
const ALTO = 1.7;
const BASE = 0.28;

export default function DepositoModel({ detalle = true, ...props }) {
  const P = usePaleta3D();

  return (
    <group {...props}>
      {/* Solera */}
      <mesh position={[0, BASE / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R * 0.92, R * 1.05, BASE, 20]} />
        <meshStandardMaterial color={P.metal} roughness={0.45} metalness={0.4} />
      </mesh>

      {/* Pared. `side: 2` (DoubleSide) para que la pared del fondo también se
          vea: sin ella el cilindro abierto se ve por dentro como un recorte. */}
      <mesh position={[0, BASE + ALTO / 2, 0]}>
        <cylinderGeometry args={[R, R, ALTO, 28, 1, true]} />
        <meshStandardMaterial
          color={P.deposito}
          transparent
          opacity={0.55}
          roughness={0.25}
          metalness={0.3}
          side={2}
        />
      </mesh>

      {/* Aros de refuerzo: dan escala y evitan que el cilindro parezca un vaso. */}
      {detalle &&
        [0.25, 0.62, 0.94].map((f) => (
          <mesh key={f} position={[0, BASE + ALTO * f, 0]}>
            <torusGeometry args={[R + 0.005, 0.016, 8, 28]} />
            <meshStandardMaterial color={P.metal} roughness={0.45} metalness={0.4} />
          </mesh>
        ))}

      {/* Tapa */}
      <mesh position={[0, BASE + ALTO, 0]} castShadow>
        <cylinderGeometry args={[R + 0.03, R + 0.03, 0.07, 28]} />
        <meshStandardMaterial color={P.metal} roughness={0.45} metalness={0.4} />
      </mesh>

      {/* Boca de carga, sólo como referencia de escala. */}
      {detalle && (
        <mesh position={[R * 0.45, BASE + ALTO + 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.12, 14]} />
          <meshStandardMaterial color={P.metal} roughness={0.45} metalness={0.4} />
        </mesh>
      )}
    </group>
  );
}

/** Alto total del bidón, para el trazado de la succión. */
export const ALTURA_DEPOSITO = BASE + ALTO;
