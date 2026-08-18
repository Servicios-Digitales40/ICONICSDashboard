/**
 * Lectura del historiador para las señales de Demo EVA.
 *
 * ── DOS DIFERENCIAS CON EL HISTÓRICO DE RESONAC, LAS DOS MEDIDAS ───
 *
 * 1. **El nombre del punto es el de tiempo real, con `ac:`.** La sintaxis
 *    `hda:\Configuration\…` que usa `historyPointName` en el catálogo de
 *    Resonac responde **500** para este árbol, con las dos variantes probadas
 *    (contrabarras y barras). `ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE` sí
 *    devuelve la serie. Por eso este archivo no reutiliza `transport.readHistory`.
 *
 * 2. **Sólo cuatro señales tienen serie propia.** A `CARGA_TRABAJO_MOTOR`,
 *    `KPIEFICIENCIA_ENERGETICA` e `INDICE_DESVIACION_VOLTAJE` el historiador les
 *    devuelve la curva de `STEMPERATURA_TANQUE`: misma serie hasta el último
 *    decimal, con dos agregados distintos, mientras sus valores vivos son 0,
 *    0 y 122.1. No da error — devuelve `ok: true` y datos plausibles.
 *
 * De ahí la guarda de `leerSerie`: **rechaza por catálogo antes de salir a la
 * red**. Es deliberado que la comprobación esté aquí y no en cada vista: una
 * gráfica que se olvide de mirar `historizado` no puede llegar a pintar la
 * serie equivocada, porque no va a recibir ninguna.
 *
 * ── POR QUÉ NO SE CACHEA COMO EN RESONAC ───────────────────────────
 *
 * Allí la clave de caché es un día concreto y el pasado no cambia, así que se
 * memoiza para siempre. Aquí el rango es **relativo a ahora** («las últimas 6
 * horas»), y una caché eterna congelaría el borde derecho de la gráfica sin que
 * nadie lo notara. Se pide al abrir la vista y punto; el borde derecho lo cubre
 * el valor en vivo, que es lo que hace el resto de la aplicación.
 *
 * ── ESTE ES EL LECTOR REAL, Y HAY OTRO ─────────────────────────────
 *
 * Con el origen «Simulado» la serie no sale de aquí sino de `data/simulador.js`,
 * que trae su propio `readSerie`. Quién de los dos lee lo decide `evaSource.js`
 * a partir del transporte, y nadie más: las vistas piden `source.leerSerie()` sin
 * saber cuál está detrás.
 *
 * `SIN_SERIE` y `VENTANA` se exportan desde aquí para los dos, porque son hechos
 * de la instalación y no del origen: el simulador repite la misma guarda de
 * `historizado` para no enseñarle a la pantalla ocho series que el servidor real
 * no tiene.
 */
import { fetchIconicsHistory } from "@/lib/iconics";
import { esHistorizada, pointName, senalInfo } from "../domain/senales.js";

/**
 * Agregado del servidor. `Average` sobre una rejilla regular es lo que quiere
 * una tendencia; para un contador habría que sumar, pero aquí las ocho señales
 * son magnitudes instantáneas y ninguna es acumulativa.
 */
const AGREGADO = "Average";

/** Ventana por defecto: 6 h en 24 puntos (uno cada 15 min). */
export const VENTANA = { horas: 6, puntos: 24 };

/** Segundos → `HH:MM:SS`, que es el formato de intervalo que espera ICONICS. */
export function intervaloHMS(segundos) {
  const s = Math.max(1, Math.round(segundos));
  const dos = (n) => String(n).padStart(2, "0");
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

/**
 * Motivo por el que una señal no tiene serie. Se devuelve en vez de lanzar
 * porque **no es un error**: es un hecho de la instalación que la interfaz
 * tiene que poder explicar, y una excepción acabaría pintada como «fallo al
 * leer», que es otra cosa.
 */
export const SIN_SERIE = "El historiador no publica una serie propia de esta señal.";

/**
 * Serie histórica de una señal.
 *
 * Devuelve `{ datos, motivo }`: `datos` son `[{ t: Date, valor }]` ya filtrados
 * por calidad, y `motivo` es un texto cuando no hay serie que pedir. Nunca las
 * dos cosas a la vez.
 */
export async function leerSerie(clave, { horas, puntos } = VENTANA) {
  if (!senalInfo(clave)) return { datos: [], motivo: `Señal desconocida: ${clave}` };
  if (!esHistorizada(clave)) return { datos: [], motivo: SIN_SERIE };

  const h = horas ?? VENTANA.horas;
  const n = puntos ?? VENTANA.puntos;

  const fin = new Date();
  const inicio = new Date(fin.getTime() - h * 3600 * 1000);

  const respuesta = await fetchIconicsHistory(pointName(clave), {
    startDate: inicio.toISOString(),
    endDate: fin.toISOString(),
    aggregate: AGREGADO,
    interval: intervaloHMS((h * 3600) / n),
  });

  return { datos: normalizar(respuesta?.data), motivo: null };
}

/**
 * Muestras del servidor → `[{ t, valor }]`.
 *
 * Se descarta la muestra de mala calidad y la que no trae número. El
 * historiador rellena los huecos de la rejilla con muestras vacías, y sin este
 * filtro la gráfica bajaría a cero en cada tramo sin datos — que es justo la
 * lectura contraria a «aquí no se midió».
 */
export function normalizar(muestras) {
  if (!Array.isArray(muestras)) return [];

  return muestras
    .filter((m) => (m?.quality ?? 0) === 0 && Number.isFinite(Number(m?.value)))
    .map((m) => ({ t: new Date(m.timestamp), valor: Number(m.value) }))
    .filter((m) => !Number.isNaN(m.t.getTime()));
}
