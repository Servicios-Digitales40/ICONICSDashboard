/**
 * Lleva la cámara a un encuadre predefinido, con transición.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────
 *
 * Orbitar con el ratón no es una forma de llegar a un sitio concreto: el
 * operador que quiere «la vista de arriba» la busca a tientas y casi nunca la
 * encuentra dos veces igual. Tres botones con tres encuadres fijos convierten
 * eso en un gesto, y son además lo que permite usar la vista **sin teclado**,
 * que es el listón que `routes.jsx` pone a cualquier pantalla de planta.
 *
 * ── POR QUÉ SE ANIMA Y NO SE TELETRANSPORTA ────────────────────────
 *
 * Un salto instantáneo de cámara desorienta: no hay forma de saber si lo que
 * se ve es la misma máquina desde otro ángulo u otra máquina. El barrido de
 * 0.8 s conserva la continuidad espacial. Es la única animación de esta
 * aplicación que no describe un estado, y se permite porque la dispara el
 * usuario y termina sola — no es un bucle.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

const DURACION = 0.8;

/** Ease-out cúbico, el mismo que usa `useCountUp` en `lib/motion.js`. */
const suave = (p) => 1 - Math.pow(1 - p, 3);

export default function Encuadre({ preset }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  const viaje = useRef(null);

  // `preset.n` cambia en cada pulsación, incluso repitiendo el mismo botón:
  // así se puede volver a un encuadre después de haberlo movido a mano.
  useEffect(() => {
    if (!preset) return;
    viaje.current = {
      t: 0,
      desdePos: camera.position.clone(),
      haciaPos: new Vector3(...preset.posicion),
      desdeObj: controls?.target?.clone() ?? new Vector3(0, 0.9, 0),
      haciaObj: new Vector3(...preset.objetivo),
    };
  }, [preset, camera, controls]);

  // Tocar el ratón cancela el viaje. Sin esto, la cámara pelea contra el
  // arrastre del usuario y se siente rota.
  useEffect(() => {
    if (!controls) return;
    const cancelar = () => { viaje.current = null; };
    controls.addEventListener("start", cancelar);
    return () => controls.removeEventListener("start", cancelar);
  }, [controls]);

  useFrame((_, dt) => {
    const v = viaje.current;
    if (!v) return;

    v.t = Math.min(DURACION, v.t + Math.min(dt, 0.1));
    const p = suave(v.t / DURACION);

    camera.position.lerpVectors(v.desdePos, v.haciaPos, p);
    if (controls?.target) {
      controls.target.lerpVectors(v.desdeObj, v.haciaObj, p);
      controls.update();
    }

    if (v.t >= DURACION) viaje.current = null;
  });

  return null;
}
