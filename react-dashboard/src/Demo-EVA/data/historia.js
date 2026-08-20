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
  MAX_PUNTOS,
  SIN_SERIE,
  VENTANA,
  intervaloHMS,
  normalizar,
} from "@shared/eva/historia.js";

import { esHistorizada, pointName, senalInfo } from "../domain/senales.js";

export { MAX_PUNTOS, SIN_SERIE, VENTANA, intervaloHMS, normalizar };

/**
 * `{ horas, puntos }` (relativo a ahora, el de siempre) o `{ inicio, fin }`
 * (rango absoluto: los accesos rápidos de abajo o el calendario
 * personalizado) → los tres números que necesita `leerSerie`.
 *
 * Un rango absoluto siempre pide `MAX_PUNTOS`: a diferencia de la ventana
 * relativa —que trae su propia densidad «natural», 24 puntos para 6 h— aquí
 * no hay una cantidad que proponer, y pedir menos desperdiciaría resolución
 * sin motivo.
 *
 * `fin` se recorta a `ahora` si viene en el futuro. El calendario personalizado
 * deja elegir HOY como día de fin —«mañana» está deshabilitado, pero «hoy»
 * no—, y `rangoPersonalizado` redondea ese día a su medianoche siguiente sin
 * saber qué hora es. Sin este recorte, elegir «hoy» pide un tramo que llega
 * hasta la medianoche que aún no pasa: ese tramo jamás va a tener muestras,
 * y como los `MAX_PUNTOS` se reparten por igual entre `inicio` y `fin`, la
 * mitad del futuro vacío le roba resolución a la mitad que sí tiene dato.
 */
function resolverRango(rango) {
  if (rango?.inicio instanceof Date && rango?.fin instanceof Date) {
    const ahora = new Date();
    const fin = rango.fin.getTime() > ahora.getTime() ? ahora : rango.fin;
    return { inicio: rango.inicio, fin, puntos: MAX_PUNTOS };
  }
  const horas = rango?.horas ?? VENTANA.horas;
  const puntos = rango?.puntos ?? VENTANA.puntos;
  const fin = new Date();
  const inicio = new Date(fin.getTime() - horas * 3600 * 1000);
  return { inicio, fin, puntos };
}

/**
 * Serie histórica de una señal.
 *
 * Devuelve `{ datos, motivo, hasMore }`: `datos` son `[{ t: Date, valor }]` ya
 * filtrados por calidad, `motivo` es un texto cuando no hay serie que pedir
 * (nunca las dos cosas a la vez), y `hasMore` es lo que el backend ya
 * devuelve cuando el servidor recorta por `X-ICO-MAX-ITEM-COUNT` — aquí no
 * debería pasar casi nunca, porque el intervalo ya se calcula para caber en
 * `MAX_PUNTOS`, pero si el servidor redondea distinto no hay que fingir que
 * la serie está completa.
 */
export async function leerSerie(clave, rango = VENTANA) {
  if (!senalInfo(clave)) return { datos: [], motivo: `Señal desconocida: ${clave}`, hasMore: false };
  if (!esHistorizada(clave)) return { datos: [], motivo: SIN_SERIE, hasMore: false };

  const { inicio, fin, puntos } = resolverRango(rango);
  const segundos = Math.max(1, (fin.getTime() - inicio.getTime()) / 1000);

  const respuesta = await fetchIconicsHistory(pointName(clave), {
    startDate: inicio.toISOString(),
    endDate: fin.toISOString(),
    aggregate: AGREGADO,
    interval: intervaloHMS(segundos / puntos),
  });

  return { datos: normalizar(respuesta?.data), motivo: null, hasMore: Boolean(respuesta?.hasMore) };
}

/**
 * Los accesos rápidos del selector de rango contra el historiador: contra
 * el reloj de pared de quien mira la pantalla, no contra una regla del
 * protocolo del historiador — por eso viven aquí y no en
 * `@shared/eva/historia.js`. Un asistente que corriera en el backend, en
 * otro huso horario, no debería heredar esta noción de «ayer».
 *
 * («Hoy» no está aquí: es «Tiempo real» en la UI, y ese lee del búfer en
 * vivo — `lib/buffer.js` — no del historiador. Un rango que termina en
 * `new Date()` calculado una sola vez al pulsar el botón se queda
 * congelado ahí para siempre; el búfer, en cambio, se repinta solo.)
 *
 * Reciben `ahora` para poder probarse sin simular el reloj del sistema; en
 * uso real se llaman sin argumento.
 */

/** El día completo anterior a `ahora`: no llega hasta el instante actual. */
export function rangoAyer(ahora = new Date()) {
  const finHoy = new Date(ahora);
  finHoy.setHours(0, 0, 0, 0);
  const inicio = new Date(finHoy);
  inicio.setDate(inicio.getDate() - 1);
  return { inicio, fin: finHoy };
}

/** Ventana móvil de 7 días terminando ahora — no el día suelto de hace una semana. */
export function rangoSemana(ahora = new Date()) {
  return { inicio: new Date(ahora.getTime() - 7 * 24 * 3600 * 1000), fin: ahora };
}

/**
 * Rango del calendario personalizado: dos días completos, sin hora. `diaFin`
 * se incluye entero, hasta su medianoche siguiente — si se pasa el mismo día
 * dos veces, el rango es ese único día completo.
 */
export function rangoPersonalizado(diaInicio, diaFin) {
  const inicio = new Date(diaInicio);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(diaFin);
  fin.setDate(fin.getDate() + 1);
  fin.setHours(0, 0, 0, 0);
  return { inicio, fin };
}
