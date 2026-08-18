/**
 * Un activo dentro de la maqueta: su modelo, su estado y la interacción de
 * señalar y pulsar.
 *
 * Se separa de la vista para que cada activo tenga su propio descriptor —y por
 * tanto su propio estado— sin que la vista tenga que sostener cuatro.
 *
 * ── POR QUÉ UN DESPACHADOR Y NO UN MODELO PARAMETRIZABLE ───────────
 *
 * Un tanque, una bomba, un armario y un colector no comparten geometría; lo
 * único común es la baliza, y ésa ya está extraída. Un modelo único con
 * `if (tipo === "tanque")` sería el mismo despacho escrito en peor sitio.
 *
 * Lo que sí comparten es el CONTRATO: todos reciben un `descriptor` y ninguno
 * conoce el dominio. Los datos que cada uno necesita se traducen aquí, y por eso
 * este archivo es el único de la carpeta `three-d/` que importa señales.
 */
import { colorDeToken, usePaleta3D } from "@/features/three-d/lib/paleta.js";
import { usePrefersReducedMotion } from "@/lib/motion.js";

import { pctDeEscala } from "../../lib/formato.js";
import { comportamiento, comportamientoReducido } from "../lib/comportamiento.js";
import { ALTURA_FICHA } from "../lib/layout.js";
import ArmarioModel from "./ArmarioModel.jsx";
import BombaModel from "./BombaModel.jsx";
import ColumnaModel from "./ColumnaModel.jsx";
import ValvulaModel from "./ValvulaModel.jsx";
import FichaActivo, { EtiquetaActivo } from "./FichaActivo.jsx";

/** Radio de la zona de captura del puntero de cada activo. */
const RADIO_CAPTURA = 1.05;

/**
 * El modelo que le toca a cada activo, con los datos que necesita ya traducidos
 * desde el dominio.
 */
function Modelo({ activo, sistema, descriptor, rpm, detalle }) {
  const senal = (k) => sistema.senales[k];

  switch (activo.id) {
    case "tanque":
      /*
       * La COLUMNA, no el bidón de abajo. Las dos señales de este activo
       * —nivel y temperatura— las publica la instrumentación montada sobre
       * ella, así que es donde va su tarjeta y donde se dibuja su nivel. El
       * bidón lo pinta la vista como parte del skid, sin tarjeta, porque no
       * publica nada. Ver `LAYOUT` y `DepositoModel`.
       */
      return (
        <ColumnaModel
          descriptor={descriptor}
          nivelPct={senal("nivelTanque").valor}
          detalle={detalle}
        />
      );

    case "bombeo":
      /*
       * Sin manómetro: la presión se mide en la válvula, aguas abajo, y ahí se
       * dibuja. Enseñar la misma cifra en dos sitios de la misma escena no
       * informa el doble, sólo obliga a comprobar que dicen lo mismo. En la
       * vista «Máquina 3D» sí lo lleva, porque allí el sujeto es la bomba.
       */
      return <BombaModel descriptor={descriptor} rpm={rpm} manometro={false} detalle={detalle} />;

    case "distribucion":
      /*
       * La VÁLVULA del tramo de impulsión, no un recipiente: es donde se miden
       * el caudal y la presión, que son las dos señales de este activo. Lleva
       * por eso el manómetro que antes iba en la bomba.
       */
      return (
        <ValvulaModel
          descriptor={descriptor}
          hayCaudal={!sistema.enReposo && senal("flujoInstantaneo").valor !== null}
          presionPct={
            senal("presionRelativa").valor === null ? null : pctDeEscala(senal("presionRelativa"))
          }
          detalle={detalle}
        />
      );

    case "electrico":
      // La puerta obedece al catálogo, no a este archivo: si mañana se confirma
      // que el booleano va al revés, se corrige en `domain/senales.js`.
      return <ArmarioModel descriptor={descriptor} abierto={senal("modoVdf").texto === "Manual"} detalle={detalle} />;

    default:
      return null;
  }
}

export default function ActivoEnMaqueta({
  activo,
  sistema,
  pos,
  rpm = 0,
  señalado,
  seleccionado,
  onSeñalar,
  onSeleccionar,
  onDetalle,
  detalle = false,
}) {
  const P = usePaleta3D();
  const reduce = usePrefersReducedMotion();
  const descriptor = reduce ? comportamientoReducido(activo.estado) : comportamiento(activo.estado);

  const resaltado = señalado || seleccionado;

  /*
   * La válvula está montada sobre la tubería, a cuatro metros del suelo, así
   * que su anillo de selección no puede ser un disco tumbado: quedaría flotando
   * como una bandeja. Para los que van por el aire el anillo se pone de canto,
   * mirando al observador, y el halo pasa a ser una esfera.
   */
  const aire = pos.aire === true;
  const alturaFicha = pos.ficha ?? ALTURA_FICHA;

  return (
    <group position={[pos.x, pos.y ?? 0, pos.z]} rotation={[0, pos.rotY ?? 0, 0]}>
      {/* Anillo de selección en el suelo. Es lo que responde al señalar: mover
          o escalar el activo lo sacaría de la línea del agua, que es justo lo
          que la maqueta usa para organizarse. */}
      {resaltado && (
        <mesh
          rotation={aire ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}
          position={aire ? [0, 0, 0] : [0, 0.014, 0]}
        >
          <ringGeometry args={[RADIO_CAPTURA + 0.05, seleccionado ? RADIO_CAPTURA + 0.28 : RADIO_CAPTURA + 0.18, 44]} />
          <meshBasicMaterial
            color={seleccionado ? P.accent : colorDeToken(P, descriptor.token)}
            transparent
            opacity={seleccionado ? 0.85 : 0.5}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Halo en el suelo. Es el canal que separa «hay algo que mirar» de «todo
          en banda» sin depender del color, y con el anillo doble sustituye al
          destello cuando el sistema pide menos movimiento. Ver la tabla de
          `three-d/lib/comportamiento.js`. */}
      {descriptor.halo !== "ninguno" &&
        (descriptor.halo === "doble" ? [0.35, 0.72] : [0.35]).map((extra) => (
          <mesh key={extra} rotation={aire ? [0, 0, 0] : [-Math.PI / 2, 0, 0]} position={[0, aire ? 0 : 0.008, 0]}>
            {aire ? (
              <sphereGeometry args={[RADIO_CAPTURA * 0.55 + extra, 20, 14]} />
            ) : (
              <circleGeometry args={[RADIO_CAPTURA + extra, 36]} />
            )}
            <meshBasicMaterial
              color={colorDeToken(P, descriptor.token)}
              transparent
              opacity={0.14}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        ))}

      {/* Zona de captura del puntero.
          Va en un cilindro invisible y no en las mallas del modelo por dos
          motivos: cada modelo tiene entre diez y veinte piezas y todas
          dispararían sus propios eventos, y en «sin dato» las mallas son
          translúcidas y estrechas —difíciles de acertar— justo cuando más falta
          hace poder consultarlas. */}
      <mesh
        position={[0, aire ? 0 : 0.9, 0]}
        visible={false}
        onPointerOver={(e) => { e.stopPropagation(); onSeñalar(activo.id); }}
        onPointerOut={(e) => { e.stopPropagation(); onSeñalar(null); }}
        onClick={(e) => { e.stopPropagation(); onSeleccionar(activo.id); }}
      >
        <cylinderGeometry args={[RADIO_CAPTURA, RADIO_CAPTURA, aire ? 0.9 : 2.1, 12]} />
      </mesh>

      <Modelo activo={activo} sistema={sistema} descriptor={descriptor} rpm={rpm} detalle={detalle} />

      {seleccionado ? (
        <FichaActivo
          activo={activo}
          altura={alturaFicha}
          onCerrar={() => onSeleccionar(null)}
          onDetalle={onDetalle ? () => onDetalle(activo.id) : null}
        />
      ) : (
        señalado && <EtiquetaActivo activo={activo} altura={alturaFicha - 0.3} />
      )}
    </group>
  );
}
