/**
 * El bastidor del skid: perfil de aluminio, dos niveles y la bandeja.
 *
 * ── POR QUÉ EXISTE ESTE MODELO ─────────────────────────────────────
 *
 * Porque sin él la maqueta son cuatro objetos flotando, y con él es UNA
 * máquina. Hasta agosto de 2026 no había nada equivalente, y el equipo real se
 * reconoce sobre todo por su bastidor: es lo que encuadra todo lo demás.
 *
 * ── NO TIENE ESTADO, Y ES A PROPÓSITO ──────────────────────────────
 *
 * No recibe descriptor y nunca cambia de color. El bastidor no es un activo:
 * no tiene señales, no se le puede preguntar nada y no puede estar en crítico.
 * Si algún día el bastidor se tiñera con el estado de la instalación, el color
 * dejaría de señalar QUÉ mirar, que es lo único que hace útil un color de
 * estado en una pantalla de planta.
 *
 * ── LAS COTAS NO ESTÁN AQUÍ ────────────────────────────────────────
 *
 * Vienen de `SKID`, en `lib/layout.js`, porque la altura de la bandeja la
 * necesitan también las posiciones de los activos. Ver el motivo allí.
 */
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";

import { SKID } from "../lib/layout.js";

/** Grosor de la chapa de la bandeja. */
const CHAPA = 0.09;

/** Un perfil recto entre dos puntos del mismo eje. */
function Perfil({ posicion, medidas, color }) {
  return (
    <mesh position={posicion} castShadow receiveShadow>
      <boxGeometry args={medidas} />
      <meshStandardMaterial color={color} roughness={0.42} metalness={0.62} />
    </mesh>
  );
}

export default function BastidorModel(props) {
  const P = usePaleta3D();

  const { largo, fondo, bandeja, perfil } = SKID;
  const x = largo / 2 - perfil / 2;
  const z = fondo / 2 - perfil / 2;

  /* Los postes llegan hasta debajo de la chapa: la bandeja los remata. */
  const alturaPoste = bandeja - CHAPA;

  /* Las cuatro esquinas, más dos montantes intermedios. Los intermedios no son
     decoración: en el dibujo hay uno que cruza por delante del depósito, y es
     lo que da la sensación de que el bidón está DENTRO del bastidor y no
     apoyado delante. */
  const postes = [
    [-x, -z], [x, -z], [-x, z], [x, z],
    [0, -z], [0, z],
  ];

  /* Travesaños: abajo a ras de suelo y arriba justo bajo la chapa. */
  const alturas = [perfil / 2, alturaPoste - perfil / 2];

  return (
    <group {...props}>
      {postes.map(([px, pz]) => (
        <Perfil
          key={`${px}-${pz}`}
          posicion={[px, alturaPoste / 2, pz]}
          medidas={[perfil, alturaPoste, perfil]}
          color={P.metal}
        />
      ))}

      {alturas.map((y) => (
        <group key={y}>
          {/* Largueros (a lo largo de X) */}
          {[-z, z].map((pz) => (
            <Perfil key={pz} posicion={[0, y, pz]} medidas={[largo, perfil, perfil]} color={P.metal} />
          ))}
          {/* Traveseros (a lo ancho de Z) */}
          {[-x, x].map((px) => (
            <Perfil key={px} posicion={[px, y, 0]} medidas={[perfil, perfil, fondo]} color={P.metal} />
          ))}
        </group>
      ))}

      {/* La bandeja. Oscura y con brillo, como la chapa del equipo: es la
          superficie sobre la que se leen los tres activos de arriba, así que
          cuanto más contraste con ellos, mejor se recortan. */}
      <mesh position={[0, bandeja - CHAPA / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[largo, CHAPA, fondo]} />
        <meshStandardMaterial color={P.goma} roughness={0.28} metalness={0.45} />
      </mesh>
    </group>
  );
}
