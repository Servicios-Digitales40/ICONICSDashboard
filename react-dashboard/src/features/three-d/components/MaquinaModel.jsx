/**
 * El modelo de una máquina, construido con primitivas.
 *
 * ── POR QUÉ PROCEDIMENTAL Y NO UN GLB ──────────────────────────────
 *
 * No hay modelos que cargar: los renders de la pantalla de GraphWorX no son
 * exportables. Una geometría de primitivas no pesa nada en el bundle, se
 * ajusta en un parámetro y —sobre todo— no bloquea el trabajo de verdad, que
 * es el contrato de `estadoVisual.js`.
 *
 * **Este archivo es el punto de sustitución.** El día que haya GLB reales se
 * cambia lo que hay dentro de `<Cuerpo>` y compañía por `useGLTF`, y ni las
 * vistas ni el contrato se enteran, siempre que el modelo nuevo exponga las
 * mismas partes móviles: husillo, panel, módulo y cinta.
 *
 * ── QUÉ TIENE QUE COMUNICAR LA FORMA ───────────────────────────────
 *
 * Cuatro partes móviles, una por canal de `estadoVisual.js`:
 *
 *   husillo → giro (Operando; la velocidad la fija `rpmDe`)
 *   panel   → apertura (Set-Up, mantenimientos)
 *   módulo  → despiece (sólo Mantenimiento Correctivo)
 *   cinta   → pieza presente o ausente (Limpieza es «cinta vacía»)
 *
 * El husillo lleva tres brazos radiales a propósito: un cilindro liso girando
 * sobre su eje se ve EXACTAMENTE igual que uno parado, y el giro es la única
 * animación informativa de toda la aplicación.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, MathUtils } from "three";

import { colorDeToken, usePaleta3D } from "../lib/paleta.js";
import Baliza from "./Baliza.jsx";

/* Constante de suavizado de las transiciones de pose, en 1/s. Con 6 el cambio
   de estado tarda ~0.5 s en asentarse: se percibe como un movimiento y no como
   un salto, sin llegar a hacerse esperar. */
const SUAVIZADO = 6;

/** Duración de la sacudida de entrada en alarma, en segundos. */
const SACUDIDA_S = 0.55;

/**
 * Mezcla el color base con el tinte del estado y lo desatura lo que pida el
 * descriptor.
 *
 * El tinte se aplica al 45 % y no del todo: una carcasa pintada del color puro
 * del estado deja de leerse como una máquina y el color pierde su significado
 * de señal, que es justo lo que la baliza aporta.
 */
function tono(P, base, material, tokenEstado) {
  const c = new Color(base);

  if (material.tinte) c.lerp(new Color(colorDeToken(P, material.tinte, tokenEstado)), 0.45);

  if (material.desaturar > 0) {
    // Hacia el gris de igual luminancia, no hacia un gris fijo: así una pieza
    // clara y una oscura se apagan las dos sin aplanarse entre sí.
    const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    c.lerp(new Color(l, l, l), material.desaturar);
  }

  return c;
}

/* ------------------------------------------------------------------ *
 * El modelo
 * ------------------------------------------------------------------ */

export default function MaquinaModel({
  descriptor,
  /** Velocidad del husillo en rpm. Ver `rpmDe` en `lib/estadoVisual.js`. */
  rpm = 0,
  /** `false` en la maqueta: quita los detalles que a esa escala son ruido. */
  detalle = true,
  ...props
}) {
  const P = usePaleta3D();

  /*
   * Con `frameloop="demand"` sólo se dibuja lo que alguien pide, así que una
   * transición de pose —abrir el panel, despiezar el módulo— arrancaría y se
   * congelaría a medio camino: el cambio de props dispara un fotograma, ese
   * fotograma interpola un poco, y ahí se acaba.
   *
   * La solución es que la propia animación pida el siguiente fotograma
   * mientras no haya convergido. En `"always"` no cambia nada.
   */
  const invalidate = useThree((s) => s.invalidate);

  const raiz = useRef();
  const husillo = useRef();
  const panel = useRef();
  const modulo = useRef();

  /* Valores animados. Viven en una ref y no en estado porque cambian por
     fotograma: un `setState` por frame repintaría el árbol de React 60 veces
     por segundo para mover un objeto que three.js ya tiene en memoria. */
  const anim = useRef({ apertura: 0, despiece: 0, sacudida: 0, claveAnterior: null });

  const { material, pose, pieza } = descriptor;
  const fantasma = pose === "fantasma";

  /*
   * Una máquina fantasma no proyecta sombra.
   *
   * three.js dibuja las sombras con un material de profundidad que ignora la
   * opacidad, así que sin esto el modelo translúcido de «sin comunicación»
   * arrojaría una sombra perfectamente sólida: la escena diría a la vez «no sé
   * nada de este equipo» y «este equipo está aquí, macizo». Se sustituye por
   * la mancha suave del final del archivo.
   */
  const sombra = !fantasma;

  const colorCarcasa = useMemo(() => tono(P, P.carcasa, material, descriptor.token), [P, material, descriptor.token]);
  const colorOscuro = useMemo(() => tono(P, P.carcasaOscura, material, descriptor.token), [P, material, descriptor.token]);
  const colorMetal = useMemo(() => tono(P, P.metal, material, descriptor.token), [P, material, descriptor.token]);

  /** Props comunes de material, para no repetirlas en quince mallas. */
  const pinta = useMemo(
    () => ({
      transparent: material.opacidad < 1,
      opacity: material.opacidad,
      wireframe: material.wireframe,
      roughness: material.tinte === "violet" ? 0.18 : 0.55, // Limpieza: acabado brillante
      metalness: 0.15,
    }),
    [material]
  );

  useFrame((_, dt) => {
    const a = anim.current;
    // `dt` puede dispararse al volver de una pestaña en segundo plano; sin
    // acotarlo, la interpolación salta y la sacudida se consume entera.
    const paso = 1 - Math.exp(-SUAVIZADO * Math.min(dt, 0.1));

    /* Pose ------------------------------------------------------------ */
    const destinoApertura = pose === "abierta" || pose === "despiece" ? 1 : 0;
    const destinoDespiece = pose === "despiece" ? 1 : 0;
    a.apertura = MathUtils.lerp(a.apertura, destinoApertura, paso);
    a.despiece = MathUtils.lerp(a.despiece, destinoDespiece, paso);

    if (panel.current) panel.current.rotation.y = -a.apertura * 1.9;
    if (modulo.current) {
      modulo.current.position.x = 0.72 + a.despiece * 0.62;
      modulo.current.position.y = 1.34 + a.despiece * 0.16;
      modulo.current.rotation.z = a.despiece * -0.22;
    }

    /* Giro del husillo ------------------------------------------------ */
    if (husillo.current && descriptor.movimiento.tipo === "giro") {
      husillo.current.rotation.y += (rpm / 60) * Math.PI * 2 * dt;
    }

    /* Sacudida de entrada en alarma ----------------------------------- */
    // Se dispara al CAMBIAR de estado, no mientras dure: la máquina reacciona
    // y se queda quieta. Es lo que la separa del paro de emergencia, que nace
    // parado (ver la cabecera de `estadoVisual.js`).
    if (a.claveAnterior !== descriptor.key) {
      a.claveAnterior = descriptor.key;
      if (descriptor.movimiento.tipo === "sacudida" && descriptor.movimiento.unaVez) {
        a.sacudida = SACUDIDA_S;
      }
    }

    if (raiz.current) {
      if (a.sacudida > 0) {
        a.sacudida = Math.max(0, a.sacudida - dt);
        const caida = a.sacudida / SACUDIDA_S; // amortigua hasta cero
        const t = (SACUDIDA_S - a.sacudida) * 42;
        raiz.current.position.x = Math.sin(t) * 0.035 * caida;
        raiz.current.rotation.z = Math.sin(t * 0.8) * 0.012 * caida;
      } else if (raiz.current.position.x !== 0) {
        raiz.current.position.x = 0;
        raiz.current.rotation.z = 0;
      }
    }

    /* ¿Hace falta otro fotograma? ------------------------------------- */
    // El umbral es visual, no numérico: por debajo de una milésima el
    // movimiento ya no se ve, y esperar a la convergencia exacta de un `lerp`
    // —que es asintótica— dejaría la GPU dibujando para siempre.
    const asentado =
      Math.abs(a.apertura - destinoApertura) < 0.001 &&
      Math.abs(a.despiece - destinoDespiece) < 0.001 &&
      a.sacudida <= 0;

    if (!asentado) invalidate();
  });

  return (
    <group {...props}>
      <group ref={raiz}>
        {/* ---- Zócalo ------------------------------------------------ */}
        <mesh position={[0, 0.12, 0]} castShadow={sombra} receiveShadow>
          <boxGeometry args={[2.3, 0.24, 1.5]} />
          <meshStandardMaterial color={P.goma} {...pinta} roughness={0.85} />
        </mesh>

        {/* ---- Cuerpo ------------------------------------------------ */}
        <mesh position={[0, 0.86, 0]} castShadow={sombra} receiveShadow>
          <boxGeometry args={[2.0, 1.24, 1.3]} />
          <meshStandardMaterial color={colorCarcasa} {...pinta} />
        </mesh>

        {/* Franja del hombro: rompe la caja y da escala a la silueta. */}
        <mesh position={[0, 1.46, 0]} castShadow={sombra}>
          <boxGeometry args={[2.06, 0.1, 1.36]} />
          <meshStandardMaterial color={colorOscuro} {...pinta} />
        </mesh>

        {/* ---- Interior (sólo visible con el panel abierto) ---------- */}
        <mesh position={[-0.4, 0.86, 0.5]}>
          <boxGeometry args={[1.0, 0.9, 0.12]} />
          <meshStandardMaterial color={P.goma} {...pinta} roughness={0.9} />
        </mesh>
        {detalle && (
          <>
            {/* Guías: lo que se está ajustando en un Set-Up. */}
            <mesh position={[-0.4, 1.06, 0.58]}>
              <boxGeometry args={[0.86, 0.05, 0.05]} />
              <meshStandardMaterial color={colorMetal} {...pinta} metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[-0.4, 0.72, 0.58]}>
              <boxGeometry args={[0.86, 0.05, 0.05]} />
              <meshStandardMaterial color={colorMetal} {...pinta} metalness={0.7} roughness={0.3} />
            </mesh>
          </>
        )}

        {/* ---- Panel frontal abatible -------------------------------- */}
        {/* El pivote va en el canto izquierdo y la hoja desplazada media
            anchura: así gira sobre su bisagra y no sobre su centro. */}
        <group ref={panel} position={[-0.92, 0.86, 0.66]}>
          <mesh position={[0.5, 0, 0]} castShadow={sombra}>
            <boxGeometry args={[1.0, 0.98, 0.06]} />
            <meshStandardMaterial color={colorOscuro} {...pinta} />
          </mesh>
          {/* Tirador */}
          {detalle && (
            <mesh position={[0.92, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.3, 8]} />
              <meshStandardMaterial color={colorMetal} {...pinta} metalness={0.8} roughness={0.25} />
            </mesh>
          )}
          {/* Seta de emergencia. Se ilumina sola: es lo que distingue el paro
              de emergencia de la alarma sin depender de que un rojo se lea
              distinto de otro rojo. */}
          {detalle && (
            <mesh position={[0.28, 0.3, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.075, 0.075, 0.05, 16]} />
              <meshStandardMaterial
                color={P.coral}
                emissive={P.coral}
                emissiveIntensity={descriptor.seta ? 2.2 : 0}
                toneMapped={false}
                {...pinta}
              />
            </mesh>
          )}
        </group>

        {/* ---- Módulo lateral (el que se despieza en correctivo) ----- */}
        <mesh ref={modulo} position={[0.72, 1.34, 0]} castShadow={sombra}>
          <boxGeometry args={[0.52, 0.44, 0.62]} />
          <meshStandardMaterial color={colorMetal} {...pinta} metalness={0.5} roughness={0.35} />
        </mesh>

        {/* ---- Husillo / portaherramientas --------------------------- */}
        <group ref={husillo} position={[-0.42, 1.72, 0]}>
          <mesh castShadow={sombra}>
            <cylinderGeometry args={[0.11, 0.11, 0.42, 16]} />
            <meshStandardMaterial color={colorMetal} {...pinta} metalness={0.75} roughness={0.25} />
          </mesh>
          {/* Tres brazos radiales: sin ellos el giro es invisible. */}
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[Math.cos((i * Math.PI * 2) / 3) * 0.2, -0.16, Math.sin((i * Math.PI * 2) / 3) * 0.2]}
              rotation={[0, -(i * Math.PI * 2) / 3, 0]}
              castShadow={sombra}
            >
              <boxGeometry args={[0.22, 0.08, 0.09]} />
              <meshStandardMaterial color={colorOscuro} {...pinta} metalness={0.4} />
            </mesh>
          ))}
        </group>

        {/* ---- Cinta y pieza ----------------------------------------- */}
        <mesh position={[0, 0.44, 0.92]} castShadow={sombra} receiveShadow>
          <boxGeometry args={[2.5, 0.09, 0.42]} />
          <meshStandardMaterial color={P.goma} {...pinta} roughness={0.95} />
        </mesh>
        {pieza && (
          <mesh position={[0.36, 0.57, 0.92]} castShadow={sombra}>
            <boxGeometry args={[0.26, 0.18, 0.26]} />
            <meshStandardMaterial color={colorMetal} {...pinta} metalness={0.6} roughness={0.3} />
          </mesh>
        )}

        {/* ---- Baliza ------------------------------------------------ */}
        {/* Fuera del material fantasma a propósito: cuando la máquina no
            contesta, lo que NO puede desvanecerse es la señal que lo dice. */}
        <group position={[0.72, 1.56, 0]}>
          <Baliza descriptor={descriptor} luz={detalle} />
        </group>
      </group>

      {/* ---- Halo en el suelo -------------------------------------- */}
      {/* Sustituto estático del movimiento: es lo que mantiene legible una
          alarma con `prefers-reduced-motion` puesto. */}
      {descriptor.halo && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[1.5, 2.3, 48]} />
          <meshBasicMaterial
            color={colorDeToken(P, descriptor.token)}
            transparent
            opacity={0.22}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Sombra falsa bajo la máquina: da asiento al modelo cuando el fantasma
          desactiva la sombra real. */}
      {fantasma && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
          <circleGeometry args={[1.3, 32]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.08} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
