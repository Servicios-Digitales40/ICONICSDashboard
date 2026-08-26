/**
 * LA regla de troceado de un rango de tiempo para pedirlo al historiador,
 * única para los tres consumidores que la repetían con valores distintos
 * (Plan 15 Fase 2):
 *
 *   Dónde                                          Regla ANTES
 *   ---------------------------------------------  ----------------------------------
 *   Demo-EVA/data/historia.js → trocear()           escalones: 1d/≤14, 3d/≤60, 7d/≤180, 30d después — 96 puntos por tramo
 *   backend/ia/herramientas.mjs → leerSerieEnRango() siempre 1 día por tramo — min(100, segundos/900) puntos
 *   scripts/verificar-antiguedad-historico.mjs       3 días por tramo fijo, intervalo 1h fijo — no arma serie, sólo busca un borde
 *
 * Que la misma pregunta ("¿cómo trocear este rango?") tuviera tres
 * respuestas distintas es la razón de que la gráfica, el asistente y el
 * script de antigüedad no leyeran el mismo histórico ante el mismo rango.
 *
 * ── QUÉ SE UNIFICÓ, Y QUÉ SE QUEDÓ FUERA ────────────────────────────
 *
 * `planificar()` reemplaza `trocear()` (frontend) y el troceado interno de
 * `leerSerieEnRango()` (backend): las dos arman una SERIE con una densidad
 * objetivo. Ganó la regla escalonada del frontend —tramos más anchos en
 * rangos largos, no siempre 1 día— porque menos tramos son menos peticiones
 * HTTP, y con la Fase 1 (`readHistory` siguiendo `X-ICO-CONTINUATION`) cada
 * tramo ya puede ser varias páginas por debajo: multiplicar tramos innecesa-
 * riamente multiplica también esas páginas.
 *
 * El script de antigüedad se queda con su propio troceado (`DIAS_TRAMO` fijo
 * en 3 días, sin `objetivoPuntos`): no arma una serie para dibujar ni para
 * perfilar, sólo pregunta "¿hay o no hay una muestra aquí" con un intervalo
 * fijo de 1h — un objetivo de conteo de tramos es una pregunta distinta a un
 * objetivo de densidad, y forzar el mismo `planificar()` ahí sería doblar la
 * API para un caso que no la necesita. Ver la cabecera de ese script.
 *
 * ── LOS DÍAS QUE UN TRAMO CUBRE, PARA QUIEN CUENTA POR DÍA ──────────
 *
 * El asistente narra cobertura en DÍAS ("sólo se pudieron leer 12 de 30
 * días"), no en tramos: cada tramo declara `dias`, el número de días de
 * calendario que abarca, para que quien cuenta cobertura por día pueda
 * seguir haciéndolo sin desmenuzar tramos de más de un día en llamadas
 * separadas. Es una aproximación deliberada: un tramo de 7 días con AL MENOS
 * una muestra cuenta como "sus 7 días leídos", sin distinguir si sólo 3 de
 * esos 7 respondieron — la alternativa (pedir cada día suelto para contar
 * fino) es exactamente el problema que esta unificación vino a resolver.
 */
import { intervaloHMS } from "./historia.js";

/**
 * Escalones de tamaño de tramo según lo largo del rango total, en días.
 * Ver `trocear()`, ahora `tramosDe()`, para el razonamiento completo.
 */
const ESCALONES = [
  { hastaDias: 14, diasPorTramo: 1 },
  { hastaDias: 60, diasPorTramo: 3 },
  { hastaDias: 180, diasPorTramo: 7 },
];
const DIAS_POR_TRAMO_MAXIMO = 30;

/**
 * Parte `[inicio, fin]` en tramos, escalonando su tamaño según lo largo del
 * rango total. Un rango de un día o menos es un solo tramo, sin trocear.
 *
 * @param {Date} inicio
 * @param {Date} fin
 * @returns {{ desde: Date, hasta: Date, dias: number }[]}
 */
export function tramosDe(inicio, fin) {
  const diasTotales = Math.max(1, Math.ceil((fin.getTime() - inicio.getTime()) / 86_400_000));
  if (diasTotales <= 1) return [{ desde: inicio, hasta: fin, dias: diasTotales }];

  const escalon = ESCALONES.find((e) => diasTotales <= e.hastaDias);
  const diasPorTramo = escalon ? escalon.diasPorTramo : DIAS_POR_TRAMO_MAXIMO;
  const msPorTramo = diasPorTramo * 86_400_000;

  const tramos = [];
  for (let t = inicio.getTime(); t < fin.getTime(); t += msPorTramo) {
    const desde = new Date(t);
    const hasta = new Date(Math.min(t + msPorTramo, fin.getTime()));
    tramos.push({ desde, hasta, dias: Math.max(1, Math.round((hasta - desde) / 86_400_000)) });
  }
  return tramos;
}

/**
 * El plan completo de lectura para un rango: sus tramos, cada uno con el
 * `interval` ya calculado para la densidad pedida, más una estimación de
 * cuántas peticiones hacen falta — el número que permite avisar ANTES de
 * lanzar la lectura, no después de que ya tardó.
 *
 * `puntosPorTramo` es la densidad OBJETIVO dentro de cada tramo, no del
 * rango completo: los dos consumidores (frontend y backend) ya pedían esto
 * por tramo, con valores distintos (96 y ~variable por segundos/900) — aquí
 * se pasa como parámetro en vez de fijarlo, porque el motivo de cada uno es
 * distinto (rejilla de cuartos de hora en el backend, presupuesto bajo
 * `MAX_PUNTOS` en el frontend) y unificar el NÚMERO sin unificar el motivo
 * sería una coincidencia frágil, no una regla.
 *
 * @param {object} args
 * @param {Date} args.inicio
 * @param {Date} args.fin
 * @param {number} args.puntosPorTramo Densidad objetivo dentro de cada tramo.
 * @returns {{
 *   tramos: { desde: Date, hasta: Date, dias: number, interval: string }[],
 *   segundosPorPunto: number,
 *   peticionesEstimadas: number,
 * }}
 */
export function planificar({ inicio, fin, puntosPorTramo }) {
  const tramos = tramosDe(inicio, fin);
  const conIntervalo = tramos.map((tramo) => {
    const segundos = Math.max(1, (tramo.hasta.getTime() - tramo.desde.getTime()) / 1000);
    return { ...tramo, interval: intervaloHMS(segundos / puntosPorTramo) };
  });

  // La densidad real que se pidió, para poder declararla — el primer tramo
  // representa a todos: los escalones sólo cambian de tamaño DE TRAMO EN
  // TRAMO en los bordes de `ESCALONES`, nunca dentro del mismo plan.
  const primero = conIntervalo[0];
  const segundosPorPunto = primero
    ? Math.max(1, (primero.hasta.getTime() - primero.desde.getTime()) / 1000) / puntosPorTramo
    : 0;

  return {
    tramos: conIntervalo,
    segundosPorPunto,
    peticionesEstimadas: conIntervalo.length,
  };
}
