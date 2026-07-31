/**
 * @deprecated 2026-07 · archivado en src/_deprecated/
 * Origen: src/data/generators.js
 * Motivo: datos mock de la plantilla original; sus únicos consumidores están archivados.
 * Restaurar: receta completa en src/_deprecated/README.md
 * Revisar para borrado definitivo: 2026-Q4
 */
/**
 * data/generators.js
 * ------------------------------------------------------------------
 * Generadores de datos ALEATORIOS para las gráficas — se vuelven a
 * ejecutar cada vez que el usuario pulsa "regenerar datos".
 *
 * Esto simula una fuente de datos que cambia con el tiempo. En una
 * app real, sustituye estas funciones por tu llamada a la API y
 * mantén la misma forma de los objetos que devuelven, para no tener
 * que tocar los componentes de gráficas.
 */

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];
export const SEMANAS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
export const EQUIPOS = ["Frontend", "Backend", "Infra", "Diseño", "QA"];

/** Ingresos / gastos / meta mensual, para las gráficas de barras y el ComposedChart. */
export function randomBarData() {
  return MESES.map((mes) => {
    const ingresos = Math.round(35 + Math.random() * 45);
    return {
      mes,
      ingresos,
      gastos: Math.round(18 + Math.random() * 30),
      meta: Math.round(ingresos * (0.82 + Math.random() * 0.3)),
    };
  });
}

/** Distribución porcentual del equipo, para la gráfica de pastel. */
export function randomPieData() {
  const raw = EQUIPOS.map(() => 5 + Math.random() * 30);
  const total = raw.reduce((a, b) => a + b, 0);
  return EQUIPOS.map((name, i) => ({ name, value: Math.round((raw[i] / total) * 100) }));
}

/** Serie semanal de usuarios activos, para la gráfica de línea. */
export function randomLineData() {
  let base = 40 + Math.random() * 20;
  return SEMANAS.map((semana) => {
    base = Math.max(10, base + (Math.random() - 0.42) * 14);
    return { semana, usuarios: Math.round(base) };
  });
}

/** Tráfico orgánico vs. pagado, para la gráfica de área apilada. */
export function randomAreaData() {
  let organico = 20 + Math.random() * 10;
  let pagado = 12 + Math.random() * 8;
  return SEMANAS.slice(0, 6).map((semana) => {
    organico = Math.max(5, organico + (Math.random() - 0.45) * 8);
    pagado = Math.max(3, pagado + (Math.random() - 0.45) * 6);
    return { semana, organico: Math.round(organico), pagado: Math.round(pagado) };
  });
}

/** Serie corta usada por las mini-gráficas ("sparklines") de las tarjetas de métricas. */
export function sparkline(n = 12, base = 40, vol = 14) {
  let v = base;
  return Array.from({ length: n }, (_, i) => {
    v = Math.max(4, v + (Math.random() - 0.45) * vol);
    return { i, v: Math.round(v) };
  });
}
