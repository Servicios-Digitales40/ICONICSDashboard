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
 * `DistribucionModel.jsx` y la regla en `lib/motion.js`.
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

/** Radio del tubo y altura a la que corre cada tramo. */
const RADIO = 0.085;
const ALTURA = { succion: 0.28, impulsion: 0.95 };

/** Separación entre flechas, en metros de escena. */
const PASO_FLECHA = 0.62;

function Tramo({ a1, a2, papel, hayCaudal, P }) {
  const dx = a2.x - a1.x;
  const dz = a2.z - a1.z;
  const largo = Math.hypot(dx, dz);
  if (largo < 0.05) return null;

  const y = ALTURA[papel] ?? 0.6;
  // Rotar `-atan2(dz, dx)` alrededor de Y lleva el eje +X del grupo a apuntar
  // exactamente del origen al destino.
  const giro = -Math.atan2(dz, dx);

  // Las flechas se reparten dejando margen en los extremos, para que no queden
  // medio metidas dentro de los equipos que unen.
  const util = Math.max(0, largo - 0.9);
  const cuantas = Math.max(1, Math.round(util / PASO_FLECHA));
  const flechas = Array.from({ length: cuantas }, (_, i) => -util / 2 + (util * i) / Math.max(1, cuantas - 1 || 1));

  const colorFlecha = hayCaudal ? P.success : P.textFaint;

  return (
    <group position={[(a1.x + a2.x) / 2, y, (a1.z + a2.z) / 2]} rotation={[0, giro, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[RADIO, RADIO, largo, 16]} />
        <meshStandardMaterial color={P.metal} roughness={0.4} metalness={0.55} />
      </mesh>

      {/* Bridas en los extremos: rematan el tubo contra el equipo. */}
      {[-largo / 2 + 0.03, largo / 2 - 0.03].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[RADIO * 1.5, RADIO * 1.5, 0.05, 16]} />
          <meshStandardMaterial color={P.goma} roughness={0.8} />
        </mesh>
      ))}

      {/* Flechas de dirección, sobre el lomo del tubo. Un cono nace apuntando a
          +Y; girado −90° sobre Z apunta a +X, que es la dirección del tramo. */}
      {flechas.map((x) => (
        <mesh key={x} position={[x, RADIO + 0.045, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.055, 0.14, 10]} />
          <meshStandardMaterial
            color={colorFlecha}
            emissive={hayCaudal ? P.success : "#000000"}
            emissiveIntensity={hayCaudal ? 0.9 : 0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function Tuberias({ tramos = [], hayCaudal = false }) {
  const P = usePaleta3D();

  return (
    <group>
      {tramos.map((tr) => (
        <Tramo key={tr.id} a1={tr.a1} a2={tr.a2} papel={tr.papel} hayCaudal={hayCaudal} P={P} />
      ))}
    </group>
  );
}
