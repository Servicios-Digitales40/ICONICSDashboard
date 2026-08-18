/**
 * Lectura del historiador para las señales de Demo EVA: **la red, no las
 * reglas**.
 *
 * Las reglas —qué agregado se pide, cómo se escribe un intervalo, qué muestra
 * se tira y por qué sólo cuatro señales tienen serie— viven en
 * [`@shared/eva/historia.js`](../../../../shared/eva/historia.js). Se mudaron
 * allí cuando el asistente pasó a responder sobre esta instalación: sus
 * herramientas leen el mismo historiador desde Node y tienen que repetir la
 * guarda de `historizado` **exactamente igual**, o contestarían la curva de la
 * temperatura del tanque bajo el nombre de otra señal. Ver la cabecera de ese
 * archivo, y `shared/README.md` para por qué no se duplica ni se importa desde
 * `src/`.
 *
 * Lo que queda aquí es lo único que no puede cruzar: `fetch` y el alias `@/`.
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
 * `SIN_SERIE` y `VENTANA` se **reexportan** desde aquí porque los dos lectores y
 * las vistas los venían pidiendo a este archivo, y son hechos de la instalación
 * y no del origen. Cambiar treinta imports para que apunten a `@shared` no
 * habría arreglado nada: son el mismo valor, y ahora salen del mismo sitio.
 */
import { fetchIconicsHistory } from "@/lib/iconics";
import {
  AGREGADO,
  SIN_SERIE,
  VENTANA,
  intervaloHMS,
  normalizar,
} from "@shared/eva/historia.js";

import { esHistorizada, pointName, senalInfo } from "../domain/senales.js";

export { SIN_SERIE, VENTANA, intervaloHMS, normalizar };

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
