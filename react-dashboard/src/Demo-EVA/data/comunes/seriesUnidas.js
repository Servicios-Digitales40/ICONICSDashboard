/**
 * Dos utilidades de las series históricas que no saben de React ni de red:
 * unir varias series por marca de tiempo, y reducir un rango a una clave
 * primitiva. Vivían dentro de `hooks.js` y se sacaron (Plan 42.5 F1) para
 * que el hook del tanque y el de una máquina configurada compartan el mismo
 * código en vez de copiarlo.
 */
import { VENTANA } from "./historia.js";

/**
 * `{ horas, puntos }` o `{ inicio, fin }` → una clave primitiva estable para
 * dependencia de efecto. Un `Date` es un objeto nuevo en cada render aunque
 * represente el mismo instante, así que no puede ir tal cual en un array de
 * dependencias sin refetchear en bucle; esta clave es lo único que compara
 * por VALOR.
 */
export function claveRango(rango) {
  if (rango?.inicio instanceof Date && rango?.fin instanceof Date) {
    return `abs:${rango.inicio.getTime()}-${rango.fin.getTime()}`;
  }
  const horas = rango?.horas ?? VENTANA.horas;
  const puntos = rango?.puntos ?? VENTANA.puntos;
  return `rel:${horas}-${puntos}`;
}

/**
 * `{ clave: [{t, valor}] }` → `[{ t, hora, clave1, clave2… }]`, ordenado.
 *
 * La marca de tiempo se usa como identidad de fila: el historiador devuelve la
 * misma rejilla para todas las señales cuando se le pide el mismo intervalo, y
 * las que falten en un instante quedan sin clave — que es lo que recharts pinta
 * como corte de línea, y no como una caída a cero.
 */
export function unir(porClave, locale = "es-MX") {
  const filas = new Map();

  for (const [clave, datos] of Object.entries(porClave)) {
    for (const { t, valor } of datos) {
      const ms = t.getTime();
      if (!filas.has(ms)) filas.set(ms, { ms, t });
      filas.get(ms)[clave] = valor;
    }
  }

  return [...filas.values()]
    .sort((a, b) => a.ms - b.ms)
    .map((f) => ({
      ...f,
      hora: f.t.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    }));
}
