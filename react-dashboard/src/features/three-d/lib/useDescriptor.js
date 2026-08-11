/**
 * El descriptor de comportamiento que toca, según el ajuste de movimiento del
 * sistema.
 *
 * Vive aquí y no dentro del modelo porque lo consumen las dos vistas y porque
 * es la puerta única por la que `prefers-reduced-motion` entra al 3D: si cada
 * componente decidiera por su cuenta, bastaría con olvidarse en uno para que
 * la pantalla siguiera moviéndose con el ajuste puesto.
 *
 * Ese ajuste es de Windows («Mostrar animaciones en Windows», en Accesibilidad
 * › Efectos visuales) y no del navegador: si no se ve NINGUNA animación, el
 * sitio donde mirar es ése, antes que el código.
 */
import { useMemo } from "react";

import { usePrefersReducedMotion } from "@/lib/motion.js";
import { comportamiento, comportamientoReducido } from "./estadoVisual.js";

export function useDescriptor(estadoKey) {
  const reduce = usePrefersReducedMotion();

  return useMemo(
    () => (reduce ? comportamientoReducido(estadoKey) : comportamiento(estadoKey)),
    [estadoKey, reduce]
  );
}

/**
 * El `frameloop` que le toca al `<Canvas>` según lo que haya en pantalla.
 *
 * ── POR QUÉ ES LA OPTIMIZACIÓN QUE MÁS IMPORTA ─────────────────────
 *
 * Con `"always"`, r3f repinta 60 veces por segundo aunque no se mueva nada. En
 * un portátil no se nota; en una pantalla de planta encendida ocho horas es
 * una GPU al 100 % dibujando el mismo fotograma, con el ventilador y el calor
 * que eso trae, y en un equipo pasivo acaba en limitación térmica.
 *
 * Con `"demand"` sólo se dibuja cuando alguien lo pide: al cambiar un dato, al
 * orbitar —de eso se encarga `OrbitControls`— y mientras una transición de
 * pose no se haya asentado, que es lo que hace `MaquinaModel` llamando a
 * `invalidate()` hasta converger.
 *
 * Así que la pregunta es sólo si hay algún BUCLE vivo. Y como los bucles están
 * limitados a dos en toda la aplicación y declarados en la tabla, la respuesta
 * es exacta y no una heurística: una planta entera en Stand By deja la GPU a
 * cero, y basta con que una máquina entre en alarma para que vuelva a dibujar.
 *
 * Con `prefers-reduced-motion` no hay bucles por definición, así que siempre
 * es bajo demanda.
 */
export function useFrameloop(clavesEstado) {
  const reduce = usePrefersReducedMotion();

  // Las claves se serializan porque el array llega nuevo en cada render y su
  // identidad no dice nada; lo que importa es el conjunto de estados.
  const firma = clavesEstado.join("|");

  return useMemo(() => {
    if (reduce) return "demand";
    const enBucle = firma.split("|").some((k) => k && comportamiento(k).bucle !== "ninguno");
    return enBucle ? "always" : "demand";
  }, [firma, reduce]);
}
