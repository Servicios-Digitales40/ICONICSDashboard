/**
 * Consulta de media query reactiva, en el mismo estilo que
 * `usePrefersReducedMotion` de `lib/motion.js`: valor inicial leído de forma
 * síncrona (sin parpadeo en el primer pintado) y suscripción a los cambios.
 *
 * Vive aparte de `motion.js` porque ese archivo se declara a sí mismo como
 * "los tres primitivos de animación" — esto no es animación, es diseño
 * adaptativo, y merece su propio sitio.
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query) {
  const [coincide, setCoincide] = useState(
    () => window.matchMedia?.(query).matches ?? false
  );

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const alCambiar = (e) => setCoincide(e.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [query]);

  return coincide;
}
