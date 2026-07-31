/**
 * Los tres primitivos de animación que comparten las vistas. Vive en `lib/`
 * porque lo consumen el dashboard, el prototipo v2 y el detalle de máquina.
 *
 * Regla de movimiento: una animación en bucle es una alarma, y todo lo demás
 * se anima una sola vez, al entrar o al cambiar de valor. Un tablero de planta
 * se mira ocho horas seguidas, y si parpadean seis cosas a la vez el ojo
 * aprende a ignorarlas todas, incluida la que importa.
 */
import { useEffect, useRef, useState } from "react";

/**
 * ¿El sistema pide menos movimiento?
 *
 * `index.css` ya neutraliza duraciones y retrasos, pero no basta: hay animación
 * que vive en JS (el conteo de cifras) y decisiones que son de diseño y no de
 * temporización, como la tarjeta en alarma, que sin su latido necesita un fondo
 * de alerta fijo para seguir leyéndose como tal.
 */
export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const alCambiar = (e) => setReduce(e.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  return reduce;
}

/**
 * Conteo animado hacia `target` con easing (ease-out cúbico).
 *
 * Arranca desde el valor actual y no desde cero: en el primer montaje eso es 0
 * y la cifra sube desde nada, pero en una actualización posterior es el número
 * que ya estaba en pantalla, así que un cambio de dato se lee como un
 * movimiento del valor y no como un reinicio.
 *
 * `actual` es una ref y no estado para poder retomar desde donde se quedó si
 * la animación anterior se interrumpió a media transición.
 */
export function useCountUp(target, duration = 900) {
  const reduce = usePrefersReducedMotion();
  const [val, setVal] = useState(reduce ? target : 0);
  const actual = useRef(reduce ? target : 0);
  const raf = useRef();

  useEffect(() => {
    if (reduce) {
      actual.current = target;
      setVal(target);
      return;
    }

    const desde = actual.current;
    let inicio;

    const paso = (ts) => {
      if (inicio == null) inicio = ts;
      const p = Math.min((ts - inicio) / duration, 1);
      const suave = 1 - Math.pow(1 - p, 3);
      const v = desde + (target - desde) * suave;
      actual.current = v;
      setVal(v);
      if (p < 1) raf.current = requestAnimationFrame(paso);
    };

    raf.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, reduce]);

  return val;
}

/**
 * `false` en el primer render, `true` en el siguiente fotograma.
 *
 * Es el disparador de las transiciones CSS que van «de cero a su valor»:
 * barras que crecen, arcos que se trazan, agujas que barren. Sin esto el
 * elemento se pinta ya en su posición final y la transición nunca se dispara,
 * porque solo corre cuando el valor cambia después del primer pintado.
 */
export function useMounted() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return listo;
}
