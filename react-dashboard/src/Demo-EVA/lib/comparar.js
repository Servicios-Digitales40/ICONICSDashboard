/**
 * Cruzar varias señales históricas en una sola rejilla de filas, para
 * dibujarlas sobre el mismo eje X.
 *
 * ── POR QUÉ NO BASTA `unir()` DE `data/comunes/hooks.js` ─────────────────────
 *
 * `unir()` agrupa por marca de tiempo EXACTA (mismo milisegundo). Funciona
 * porque el simulador calcula el cierre de cada tramo a partir del RANGO,
 * no de la señal, así que dos señales simuladas siempre cierran en el mismo
 * instante — pero contra el historiador real no hay esa garantía, y
 * `unir()` nunca se había ejercitado con más de una señal a la vez: no
 * tiene un solo consumidor hoy (`useSeriesHistoricas` lo calcula y nadie lo
 * lee). Suponer que serviría tal cual habría sido apostar por algo sin
 * comprobar.
 *
 * ── LA MISMA IDEA QUE YA USA EL ASISTENTE, TRAÍDA AQUÍ ───────────────
 *
 * `alinearSeries()` (`shared/eva/estadistica.js`) es la que emplea
 * `correlacionar_senales` en el backend, con una tolerancia derivada de la
 * ventana — la mitad de la distancia esperada entre muestras. Aquí la
 * tolerancia se deriva de los DATOS que de verdad llegaron (la mediana de
 * separación entre sus propios puntos) y no de la ventana pedida, por el
 * mismo motivo que `lib/exportar.js` nombra el archivo con lo que hay
 * dentro y no con lo que se preguntó: el historiador puede ajustar el
 * intervalo real, y la tolerancia tiene que seguir a lo que de verdad
 * volvió, no a lo que se pidió.
 *
 * La duplicación de la FÓRMULA de tolerancia con
 * `backend/ia/conversacion/herramientas.mjs` es deliberada y no un descuido: tocar el
 * archivo del asistente está fuera del alcance de un plan de frontend, y
 * las dos derivaciones —de la ventana pedida allí, de los datos recibidos
 * aquí— resuelven el mismo problema con información distinta.
 */
import { alinearSeries } from "@shared/eva/estadistica.js";

/** Mitad de la separación mediana entre muestras consecutivas — mismo criterio que el backend, aplicado a los datos recibidos. */
function toleranciaDe(datos) {
  if (datos.length < 2) return Infinity; // un solo punto: cualquier vecino vale, no hay con qué comparar la distancia
  const huecos = [];
  for (let i = 1; i < datos.length; i++) huecos.push(datos[i].t.getTime() - datos[i - 1].t.getTime());
  huecos.sort((a, b) => a - b);
  return huecos[Math.floor(huecos.length / 2)] / 2;
}

/**
 * `{ [clave]: [{t, valor}] }` → `[{ ms, t, [clave]: valor, … }]`, una fila
 * por instante de la PRIMERA clave que traiga datos — es la línea de tiempo
 * de referencia, y las demás se alinean contra ella. El orden de las claves
 * en `porClave` decide cuál manda: quien arme el objeto elige la referencia.
 *
 * Una señal sin dato en un instante de la referencia deja esa clave sin
 * escribir en la fila — Recharts lo pinta como corte de línea, nunca como
 * cero, igual que ya documenta `unir()`.
 */
export function combinarPorTolerancia(porClave) {
  const claves = Object.keys(porClave).filter((k) => porClave[k]?.length);
  if (!claves.length) return [];

  const [primera, ...resto] = claves;
  const base = [...porClave[primera]].sort((a, b) => a.t - b.t);
  const tolerancia = toleranciaDe(base);

  const filas = base.map((p) => ({ ms: p.t.getTime(), t: p.t, [primera]: p.valor }));
  const porMs = new Map(filas.map((f) => [f.ms, f]));

  for (const clave of resto) {
    const { instantes, ys } = alinearSeries(base, porClave[clave], tolerancia);
    instantes.forEach((ms, i) => {
      const fila = porMs.get(ms);
      if (fila) fila[clave] = ys[i];
    });
  }

  return filas;
}

/**
 * Normaliza una serie a 0-100 sobre su ESCALA declarada (`senal.escala`), no
 * sobre el mínimo/máximo de los propios datos: dos señales que se movieron
 * poco (la temperatura oscila 3 °C sobre una escala de 60) no deben parecer
 * igual de volátiles que una que ocupó toda su escala — normalizar contra el
 * rango observado inventaría una volatilidad que la señal no tuvo.
 */
export function normalizarAEscala(valor, escala) {
  if (!escala || valor === undefined || valor === null) return valor;
  const rango = escala.max - escala.min;
  if (!rango) return 0;
  return ((valor - escala.min) / rango) * 100;
}
