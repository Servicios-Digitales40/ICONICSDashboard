/**
 * Mezcla de color de los modelos, según el descriptor del estado.
 *
 * Es la misma función `tono` que usa `MaquinaModel` de Resonac, extraída a un
 * archivo propio porque aquí la comparten cuatro modelos en vez de uno. Importa
 * `three`, así que **no se puede probar en node**: por eso vive aquí y no en
 * `comportamiento.js`, que es la parte con criterio y sí se prueba.
 */
import { Color } from "three";

import { colorDeToken } from "@/features/three-d/lib/paleta.js";

/**
 * Mezcla el color base con el tinte del estado y lo desatura lo que pida el
 * descriptor.
 *
 * El tinte se aplica al 45 % y no del todo: una carcasa pintada del color puro
 * del estado deja de leerse como un equipo, y el color pierde su significado de
 * señal — que es justo lo que la baliza aporta.
 */
export function tono(P, base, material, tokenEstado) {
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

/**
 * Props comunes de material, para no repetirlas en treinta mallas.
 *
 * Un modelo fantasma (`sin_dato`) no proyecta sombra: three.js dibuja las
 * sombras con un material de profundidad que ignora la opacidad, así que sin
 * esto el modelo translúcido arrojaría una sombra perfectamente sólida y la
 * escena diría a la vez «no sé nada de esto» y «esto está aquí, macizo».
 */
export function propsMaterial(material) {
  return {
    transparent: material.opacidad < 1,
    opacity: material.opacidad,
    wireframe: material.wireframe,
    roughness: 0.55,
    metalness: 0.15,
  };
}

