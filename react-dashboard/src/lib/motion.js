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
import { flushSync } from "react-dom";

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
 * Conteo animado hacia `target` con un resorte masa-amortiguador, no una curva
 * cúbica fija.
 *
 * La diferencia no es cosmética: una curva ease-out DECELERA hasta pararse —
 * llega, cada vez, exactamente igual. Un resorte ASIENTA — arrastra la
 * velocidad que traía, así que un valor que cambia a media animación no
 * arranca de cero sino que seguía en movimiento, con la ligerísima inercia de
 * cualquier objeto real. `zeta` se deja apenas por debajo de 1 (crítico) para
 * que se note un asentamiento con cuerpo, no un rebote visible: sigue siendo
 * una animación de una sola vez, nunca un bucle, que es la única regla de
 * movimiento que este archivo no negocia.
 *
 * `duration` no fija un reloj como antes: calibra la rigidez para que el
 * resorte quede prácticamente asentado (dentro de la banda de "listo", ver
 * `EPS`) hacia ese mismo tiempo — quien lo llamó pidiendo 900 ms sigue viendo
 * ~900 ms, y un elemento hermano con una transición CSS de duración fija
 * (el arco de `ArcoNivel`, por ejemplo) sigue llegando a la vez.
 *
 * `pos`/`vel` son refs y no estado para retomar el resorte —posición Y
 * velocidad— desde donde se quedó si el valor cambia a media animación.
 */
const EPS_POSICION = 0.02;
const EPS_VELOCIDAD = 0.02;

export function useCountUp(target, duration = 900) {
  const reduce = usePrefersReducedMotion();
  const [val, setVal] = useState(reduce ? target : 0);
  const pos = useRef(reduce ? target : 0);
  const vel = useRef(0);
  const raf = useRef();

  useEffect(() => {
    if (reduce) {
      pos.current = target;
      vel.current = 0;
      setVal(target);
      return;
    }

    // Asentamiento crítico ("regla del 4τ"): con esta rigidez y esta
    // amortiguación, el resorte queda dentro del margen de error en,
    // aproximadamente, `duration`.
    const segundos = Math.max(duration, 1) / 1000;
    const zeta = 0.9;
    const omega = 4 / (zeta * segundos);
    const rigidez = omega * omega;
    const amortiguacion = 2 * zeta * omega;

    let anterior;
    const tiempoLimite = performance.now() + segundos * 1000 * 4; // salvavidas: nunca corre indefinidamente

    const paso = (ts) => {
      if (anterior == null) anterior = ts;
      // Paso de tiempo acotado: una pestaña en segundo plano no debe hacer
      // que el resorte "salte" al volver a primer plano.
      const dt = Math.min((ts - anterior) / 1000, 1 / 30);
      anterior = ts;

      const fuerza = -rigidez * (pos.current - target) - amortiguacion * vel.current;
      vel.current += fuerza * dt;
      pos.current += vel.current * dt;
      setVal(pos.current);

      const asentado =
        (Math.abs(target - pos.current) < EPS_POSICION && Math.abs(vel.current) < EPS_VELOCIDAD) ||
        ts > tiempoLimite;

      if (!asentado) {
        raf.current = requestAnimationFrame(paso);
      } else {
        pos.current = target;
        vel.current = 0;
        setVal(target);
      }
    };

    raf.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, reduce]);

  return val;
}

/**
 * Navega con un morph de elemento compartido (View Transitions API) cuando el
 * navegador lo soporta y el usuario no pidió menos movimiento; si no, navega
 * tal cual. `navigate` es la función cruda de `useNavegacion` — este helper no
 * sustituye la navegación normal, la envuelve sólo donde de verdad hay un
 * elemento que morphea al otro lado (ver `view-transition-name` en el origen
 * y en el destino).
 *
 * `flushSync` es obligatorio: sin él, React 18 aplaza el cambio de DOM más
 * allá del momento en que `startViewTransition` captura la foto "después", y
 * la transición no vería nada que morphear.
 */
export function navegarConMorph(navigate, page, params) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  if (!document.startViewTransition || reduce) {
    navigate(page, params);
    return;
  }

  document.startViewTransition(() => {
    flushSync(() => navigate(page, params));
  });
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
