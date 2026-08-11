/**
 * Una máquina dentro de la maqueta: el modelo, su estado real, y la
 * interacción de señalar y pulsar.
 *
 * Se separa de la vista para que cada máquina tenga su propio `useDescriptor`
 * —y por tanto su propio estado— sin que la vista tenga que sostener diez.
 */
import { useMemo } from "react";

import MaquinaModel from "./MaquinaModel.jsx";
import TarjetaKpi, { EtiquetaEquipo } from "./TarjetaKpi.jsx";
import { colorDeToken, usePaleta3D } from "../lib/paleta.js";
import { useDescriptor } from "../lib/useDescriptor.js";
import { rpmDe } from "../lib/estadoVisual.js";
import { ESCALA_MAQUETA } from "../lib/layout.js";

/** Altura a la que flota la tarjeta, en unidades de escena ya escaladas. */
const ALTURA_TARJETA = 2.6 * ESCALA_MAQUETA + 0.5;
const ALTURA_ETIQUETA = 2.2 * ESCALA_MAQUETA + 0.35;

export default function MaquinaEnMaqueta({
  machine,
  pos,
  señalada,
  seleccionada,
  onSeñalar,
  onSeleccionar,
  onDetalle,
}) {
  const P = usePaleta3D();
  const descriptor = useDescriptor(machine.estado);
  const rpm = useMemo(() => rpmDe(machine), [machine]);

  const resaltada = señalada || seleccionada;

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, pos.rotY ?? 0, 0]}>
      {/* Anillo de selección en el suelo. Es lo que responde al señalar: mover
          o escalar la máquina la desalinearía de su fila, que es justo lo que
          la maqueta usa para organizarse. */}
      {resaltada && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
          <ringGeometry args={[1.05, seleccionada ? 1.28 : 1.18, 40]} />
          <meshBasicMaterial
            color={seleccionada ? P.accent : colorDeToken(P, descriptor.token)}
            transparent
            opacity={seleccionada ? 0.85 : 0.5}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Zona de captura del puntero.
          Va en un cilindro invisible y no en las mallas del modelo por dos
          motivos: el modelo tiene quince piezas y cada una dispararía sus
          propios eventos, y en «sin comunicación» las mallas son translúcidas
          y estrechas —difíciles de acertar con el ratón— justo cuando más
          falta hace poder consultarlas. */}
      <mesh
        position={[0, 0.75, 0]}
        visible={false}
        onPointerOver={(e) => { e.stopPropagation(); onSeñalar(machine.id); }}
        onPointerOut={(e) => { e.stopPropagation(); onSeñalar(null); }}
        onClick={(e) => { e.stopPropagation(); onSeleccionar(machine.id); }}
      >
        <cylinderGeometry args={[0.95, 0.95, 1.7, 10]} />
      </mesh>

      <MaquinaModel descriptor={descriptor} rpm={rpm.rpm} detalle={false} scale={ESCALA_MAQUETA} />

      {seleccionada ? (
        <TarjetaKpi
          machine={machine}
          altura={ALTURA_TARJETA}
          onCerrar={() => onSeleccionar(null)}
          onDetalle={() => onDetalle(machine.id)}
        />
      ) : (
        señalada && <EtiquetaEquipo machine={machine} altura={ALTURA_ETIQUETA} />
      )}
    </group>
  );
}
