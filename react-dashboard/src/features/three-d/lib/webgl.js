/**
 * ¿Puede este equipo dibujar 3D?
 *
 * ── POR QUÉ SE PREGUNTA ANTES DE MONTAR EL CANVAS ──────────────────
 *
 * Sin WebGL, `<Canvas>` lanza al construir el renderizador y lo que queda en
 * la pared es el panel de error del `ErrorBoundary`. No es un caso teórico en
 * este destino:
 *
 *  - Un wallboard viejo sin GPU utilizable.
 *  - Escritorio remoto, que es como se administran esas pantallas: muchas
 *    configuraciones de RDP no exponen aceleración y el contexto no se crea.
 *  - Un controlador en la lista negra del navegador, que es una decisión que
 *    Chrome toma solo y cambia entre versiones.
 *
 * Preguntando antes, la vista enseña los mismos datos en una tabla y explica
 * por qué. Es la diferencia entre «esta pantalla está rota» y «esta pantalla
 * no puede dibujar 3D aquí».
 */

/**
 * El resultado se cachea a propósito.
 *
 * Cada sondeo crea un contexto WebGL de verdad, y los navegadores limitan
 * cuántos puede haber vivos a la vez (~16 en Chrome): al pasar del tope
 * empiezan a perderse los contextos ANTIGUOS, o sea, la escena que sí está
 * funcionando. Con dos vistas 3D montándose y desmontándose eso se alcanza
 * antes de lo que parece.
 */
let cache;

export function hayWebGL() {
  if (cache !== undefined) return cache;

  try {
    if (typeof document === "undefined") return (cache = false);

    const lienzo = document.createElement("canvas");
    const gl = lienzo.getContext("webgl2") ?? lienzo.getContext("webgl");

    // Se suelta enseguida: el contexto de la sonda no vuelve a usarse y
    // ocuparía una de las plazas del navegador hasta que el recolector pasara.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();

    return (cache = Boolean(gl));
  } catch {
    // Algunas políticas de empresa hacen que `getContext` lance en vez de
    // devolver null.
    return (cache = false);
  }
}

