/**
 * lib/motion.js
 * ------------------------------------------------------------------
 * Los tres primitivos de animación que comparten las vistas.
 *
 * Vive en `lib/` —y no en un feature ni en `prototypes/`— porque lo consumen
 * el dashboard de producción, el prototipo v2 y el detalle de máquina. Ya
 * existía un `useCountUp` en `prototypes/machine-cards/cardShared.js`, pero
 * producción no puede importar de `prototypes/` (esa carpeta es hoja del
 * grafo), y además aquel siempre cuenta DESDE CERO: con datos en vivo, un
 * valor que pasa de 57.0 a 57.4 se desplomaría a 0 para volver a subir.
 *
 * ── La regla de movimiento de estas vistas ────────────────────────────
 *
 *   Una animación en BUCLE es una alarma. Todo lo demás se anima UNA vez:
 *   al entrar, o al cambiar de valor.
 *
 * Un tablero de planta se mira ocho horas seguidas. Si parpadean seis cosas
 * a la vez, el ojo aprende a ignorarlas todas — incluida la que sí importa.
 * Por eso el único bucle permitido es el del paro de emergencia.
 * ──────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from "react";

/**
 * ¿El sistema pide menos movimiento?
 *
 * `index.css` ya neutraliza duraciones y retrasos por CSS, pero eso no basta:
 * hay animación que vive en JS (el conteo de cifras) y decisiones que no son
 * de temporización sino de DISEÑO — la tarjeta en alarma, sin su latido,
 * necesita un fondo de alerta fijo o deja de leerse como alarma.
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
 * Arranca DESDE EL VALOR ACTUAL, no desde cero: en el primer montaje eso es 0
 * —la cifra sube desde nada, que es el efecto que se busca al entrar— pero en
 * una actualización posterior es el número que ya estaba en pantalla, así que
 * un cambio de dato se lee como un MOVIMIENTO del valor y no como un reinicio.
 * Es lo que hará que el tablero se vea vivo cuando el PLC empiece a refrescar.
 *
 * `actual` es una ref y no estado a propósito: se lee al arrancar cada
 * animación para poder retomar desde donde se quedó si la anterior se
 * interrumpió a media transición.
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
 * Es el disparador de las transiciones CSS que tienen que ir «de cero a su
 * valor»: barras que crecen, arcos que se trazan, agujas que barren. Sin esto
 * el elemento se pinta ya en su posición final y la transición nunca llega a
 * dispararse — que es exactamente lo que le pasaba a la aguja de `BandGauge`,
 * con su `transition` de 900 ms sin ejecutar una sola vez.
 */
export function useMounted() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setListo(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return listo;
}
