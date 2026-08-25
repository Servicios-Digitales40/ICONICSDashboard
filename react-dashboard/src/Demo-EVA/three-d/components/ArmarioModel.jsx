/**
 * El armario del variador (VDF) y la acometida eléctrica.
 *
 * ── LA PUERTA YA NO ES EL CANAL DE `Modo AM VDF` ───────────────────
 *
 * Lo fue: cerrada = Automático, abierta = Manual, mismo recurso que la pose
 * «abierta» de Resonac para el Set-Up. Se retiró porque la puerta abierta
 * tapaba la bomba contigua —obligaba a rotar la cámara para comprobar que
 * seguía girando— y el giro de la bomba ya comunica su estado por sí solo. La
 * puerta queda fija, cerrada, como pieza estática del modelo.
 *
 * El modo se representa ahora con `BannerModo`, una pastilla `<Html>` flotante
 * sobre el armario — mismo patrón que `EtiquetaActivo` en `FichaActivo.jsx`.
 *
 * ⚠ Qué lado del booleano es «Manual» **no está confirmado en el servidor**
 * (ver `domain/senales.js`). Este modelo obedece a lo que diga el catálogo.
 */
import { Html } from "@react-three/drei";

import Baliza from "@/features/three-d/components/Baliza.jsx";
import { usePaleta3D } from "@/features/three-d/lib/paleta.js";
import { useTheme } from "@/theme";

import { propsMaterial, tono } from "../lib/materiales.js";

const ANCHO = 1.15;
const ALTO = 1.0;
const FONDO = 0.6;

/**
 * Pastilla flotante para el modo Manual. Sólo se pinta en Manual —la
 * excepción/aviso— y no en Automático, que es lo normal: mismo principio que
 * ya sigue el resto de la maqueta de no meter ruido en el caso esperado.
 */
function BannerModo({ altura }) {
  const { theme: t } = useTheme();
  const P = usePaleta3D();

  return (
    <Html
      position={[0, altura, 0]}
      zIndexRange={[30, 0]}
      style={{ transform: "translate(-50%, 4px)", pointerEvents: "none" }}
    >
      <div
        style={{
          padding: "3px 9px",
          borderRadius: 999,
          whiteSpace: "nowrap",
          background: t.panel,
          border: `1px solid ${P.amber}`,
          boxShadow: t.shadow,
          fontSize: 11,
          fontWeight: 600,
          color: P.amber,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Modo Manual
      </div>
    </Html>
  );
}

export default function ArmarioModel({ descriptor, modoManual = false, detalle = true, ...props }) {
  const P = usePaleta3D();

  const { material } = descriptor;

  const colorCarcasa = tono(P, P.carcasa, material, descriptor.token);
  const colorOscuro = tono(P, P.carcasaOscura, material, descriptor.token);
  const colorMetal = tono(P, P.metal, material, descriptor.token);
  const props3 = propsMaterial(material);

  return (
    <group {...props}>
      {/* Zócalo */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[ANCHO + 0.08, 0.12, FONDO + 0.08]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/* Cuerpo del armario */}
      <mesh position={[0, 0.12 + ALTO / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[ANCHO, ALTO, FONDO]} />
        <meshStandardMaterial color={colorOscuro} {...props3} />
      </mesh>

      {/*
        La puerta. Fija y cerrada — ya no anima con el modo VDF (ver cabecera).
        El grupo tiene su origen en la BISAGRA (canto izquierdo) y la malla se
        desplaza media hoja hacia dentro por coherencia con ese origen, aunque
        con la puerta siempre cerrada ya no hay rotación que dependa de ello.
      */}
      <group position={[-ANCHO / 2, 0.12 + ALTO / 2, FONDO / 2 + 0.005]}>
        <mesh position={[ANCHO / 2, 0, 0]} castShadow>
          <boxGeometry args={[ANCHO, ALTO - 0.06, 0.03]} />
          <meshStandardMaterial color={colorCarcasa} {...props3} />
        </mesh>

        {/* Rejilla de ventilación y maneta, para que la hoja no sea una tabla. */}
        {detalle && (
          <>
            {[0.34, 0.28, 0.22].map((y) => (
              <mesh key={y} position={[ANCHO / 2, y, 0.02]}>
                <boxGeometry args={[ANCHO * 0.55, 0.025, 0.01]} />
                <meshStandardMaterial color={colorOscuro} {...props3} />
              </mesh>
            ))}
            <mesh position={[ANCHO - 0.11, -0.05, 0.04]} castShadow>
              <boxGeometry args={[0.05, 0.17, 0.05]} />
              <meshStandardMaterial color={colorMetal} {...props3} />
            </mesh>
          </>
        )}
      </group>

      <group position={[0, 0.12 + ALTO + 0.02, 0]}>
        <Baliza descriptor={descriptor} luz={detalle} />
      </group>

      {modoManual && <BannerModo altura={0.12 + ALTO + 0.85} />}
    </group>
  );
}

export const ALTURA_ARMARIO = 0.12 + ALTO + 0.5;
