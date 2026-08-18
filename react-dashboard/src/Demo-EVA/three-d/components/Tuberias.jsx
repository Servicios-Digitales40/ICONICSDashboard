/**
 * Las tuberías que unen los activos de la maqueta.
 *
 * Cumplen la misma función que los `Pasillos` de la maqueta de Resonac —encadenar
 * los objetos para que la escena se lea como UNA instalación y no como cuatro
 * cosas sueltas— y una más que allí no existe: **dicen la dirección del agua**.
 *
 * ── LO QUE COMUNICAN, Y CON QUÉ ────────────────────────────────────
 *
 *   Dirección  → las flechas, siempre visibles. Es topología, no estado: el
 *                agua va del tanque a la bomba y de la bomba al colector
 *                pase lo que pase.
 *   Circulación→ el color de las flechas. Encendidas con caudal medido,
 *                apagadas sin él.
 *
 * ── POR QUÉ NADA SE MUEVE POR DENTRO ───────────────────────────────
 *
 * Un flujo animado sería el tercer bucle de una aplicación que se permite dos,
 * y no informaría de nada que el impulsor girando no diga ya. Ver la cabecera de
 * `ValvulaModel.jsx` y la regla en `lib/motion.js`.
 *
 * ── EL TRAZADO, DESDE QUE EL SKID TIENE DOS NIVELES ────────────────
 *
 * Antes los cuatro activos estaban en el suelo y un tramo era un cilindro
 * tumbado entre dos puntos. Ya no: el depósito está debajo de la bandeja y la
 * bomba encima, así que la succión tiene que SUBIR 2.4 m.
 *
 * Se traza en tres piezas —vertical, horizontal, vertical— y no en una recta
 * inclinada, porque es como va la tubería en el equipo: los codos existen. La
 * horizontal va por encima de las dos bocas, que es por donde puede pasar sin
 * atravesar la bandeja ni el equipo del que sale.
 *
 * ── LA GEOMETRÍA, PARA QUIEN LA TENGA QUE TOCAR ────────────────────
 *
 * `cylinderGeometry` nace con su eje en **Y**. Para tumbarlo entre dos puntos
 * del plano XZ se usan DOS niveles: un grupo que gira alrededor de Y para
 * apuntar en la dirección correcta, y dentro una malla girada 90° sobre Z que
 * pone el eje en X. Hacerlo con un solo Euler de tres ángulos funciona, pero
 * depende del orden de aplicación y se vuelve imposible de ajustar a ojo.
 */
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

/** Radio del tubo. */
const RADIO = 0.075;

/** Cuánto sube la horizontal por encima de la boca más alta. */
const HOLGURA = 0.22;

/** Separación entre flechas, en metros de escena. */
const PASO_FLECHA = 0.62;

/** Un codo: una esfera del calibre del tubo, para que el quiebro no se vea seco. */
function Codo({ posicion, color }) {
  return (
    <mesh position={posicion} castShadow>
      <sphereGeometry args={[RADIO * 1.15, 14, 10]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.55} />
    </mesh>
  );
}

/** Tramo vertical entre dos alturas de un mismo punto del plano. */
function Montante({ x, z, y1, y2, color }) {
  const largo = Math.abs(y2 - y1);
  if (largo < 0.02) return null;
  return (
    <mesh position={[x, (y1 + y2) / 2, z]} castShadow receiveShadow>
      <cylinderGeometry args={[RADIO, RADIO, largo, 14]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.55} />
    </mesh>
  );
}

function Tramo({ a1, a2, desde = 0.6, hasta = 0.6, hayCaudal, P }) {
  const dx = a2.x - a1.x;
  const dz = a2.z - a1.z;
  const largo = Math.hypot(dx, dz);

  // Altura absoluta de cada boca, y la de la horizontal que las une.
  const y1 = (a1.y ?? 0) + desde;
  const y2 = (a2.y ?? 0) + hasta;
  const yAlto = Math.max(y1, y2) + HOLGURA;

  // Rotar `-atan2(dz, dx)` alrededor de Y lleva el eje +X del grupo a apuntar
  // exactamente del origen al destino.
  const giro = -Math.atan2(dz, dx);

  const util = Math.max(0, largo - 0.5);
  const cuantas = Math.max(1, Math.round(util / PASO_FLECHA));
  const flechas = Array.from(
    { length: cuantas },
    (_, i) => -util / 2 + (util * i) / Math.max(1, cuantas - 1 || 1)
  );

  const colorFlecha = hayCaudal ? P.success : P.textFaint;

  return (
    <group>
      <Montante x={a1.x} z={a1.z} y1={y1} y2={yAlto} color={P.metal} />
      <Montante x={a2.x} z={a2.z} y1={yAlto} y2={y2} color={P.metal} />
      <Codo posicion={[a1.x, yAlto, a1.z]} color={P.metal} />
      <Codo posicion={[a2.x, yAlto, a2.z]} color={P.metal} />

      {largo >= 0.05 && (
        <group position={[(a1.x + a2.x) / 2, yAlto, (a1.z + a2.z) / 2]} rotation={[0, giro, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[RADIO, RADIO, largo, 16]} />
            <meshStandardMaterial color={P.metal} roughness={0.4} metalness={0.55} />
          </mesh>

          {/* Flechas de dirección, sobre el lomo del tubo. Un cono nace apuntando
              a +Y; girado −90° sobre Z apunta a +X, que es la dirección del
              tramo. */}
          {flechas.map((x) => (
            <mesh key={x} position={[x, RADIO + 0.045, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <coneGeometry args={[0.05, 0.13, 10]} />
              <meshStandardMaterial
                color={colorFlecha}
                emissive={hayCaudal ? P.success : "#000000"}
                emissiveIntensity={hayCaudal ? 0.9 : 0}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export default function Tuberias({ tramos = [], hayCaudal = false }) {
  const P = usePaleta3D();

  return (
    <group>
      {tramos.map((tr) => (
        <Tramo
          key={tr.id}
          a1={tr.a1}
          a2={tr.a2}
          desde={tr.desde}
          hasta={tr.hasta}
          hayCaudal={hayCaudal}
          P={P}
        />
      ))}
    </group>
  );
}
