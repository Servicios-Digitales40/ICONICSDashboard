/**
 * Lectura del historiador para CUALQUIER máquina del registro: **la red, no
 * las reglas, y sin saber de qué máquina es la serie**.
 *
 * Las reglas —qué agregado se pide, cómo se escribe un intervalo, qué muestra
 * se tira— viven en [`@shared/eva/comun/historia.js`](../../../../../shared/eva/comun/historia.js)
 * y no se repiten aquí. Lo que este archivo aporta es lo único que no puede
 * cruzar a `shared/`: `fetch` y el alias `@/`.
 *
 * ── POR QUÉ RECIBE EL `sistema` (Plan 42.5 F1, D2) ──────────────────
 *
 * Hasta el 22-09-2026 esto vivía en `data/tanque/historia.js` y resolvía el
 * nombre del punto con `puntoHistorico(clave)` del catálogo del TANQUE. Una
 * máquina configurada no tiene catálogo: tiene un `sistema` construido por
 * `construirSistema()` que ya sabe dos cosas que este lector necesita y nada
 * más —qué claves tienen serie **verificada** (`esHistorizada`) y con qué
 * nombre se le pide al historiador (`series.punto`)—. El tanque las declara
 * igual en su entrada del registro (`shared/eva/comun/sistemas.js`), así que
 * la misma función sirve para los dos sin un `if` por máquina. Se comprobó
 * antes de moverlo: para las 52 claves del tanque `series.punto` y
 * `esHistorizada` coinciden con el catálogo, sin una sola diferencia.
 *
 * La guarda va **antes de salir a la red** y en los dos lados (aquí y en el
 * asistente): pedir la serie de una clave sin serie propia devuelve la curva
 * de OTRA señal con `ok: true` (regla 2 de `@shared/eva/comun/historia.js`).
 * Una clave no verificada vuelve con `SIN_SERIE`, y una que el sistema no
 * conoce con «Señal desconocida», sin pedir nada.
 *
 * ── POR QUÉ NO SE CACHEA ────────────────────────────────────────────
 *
 * El rango es relativo a ahora («las últimas 6 horas»), y una caché eterna
 * congelaría el borde derecho de la gráfica sin que nadie lo notara. Se pide
 * al abrir la vista y punto; el borde derecho lo cubre el valor en vivo.
 *
 * ── ESTE ES EL LECTOR REAL, Y HAY OTRO ──────────────────────────────
 *
 * Con el origen «Simulado» la serie no sale de aquí sino del `readSerie` del
 * transporte simulado (`lib/iconics/transporteSimulado.js`, que muestrea el
 * modelo de la máquina). Quién de los dos lee lo decide la fuente de cada
 * máquina —`evaSource.js` para el tanque, `fuenteDeMaquina.js` para una
 * configurada— a partir del transporte, y nadie más: las vistas piden
 * `leerSerie()` a su fuente sin saber cuál está detrás.
 */
import { fetchIconicsHistory, fetchIconicsHistoryBatch } from "@/lib/iconics";
import { conConcurrenciaAcotada } from "@shared/concurrencia.js";
import {
  AGREGADO,
  MAX_PUNTOS,
  MAX_SERIES_BATCH,
  SIN_SERIE,
  VENTANA,
  intervaloHMS,
  normalizar,
} from "@shared/eva/comun/historia.js";
import { planificar } from "@shared/eva/comun/rango.js";

export { MAX_PUNTOS, SIN_SERIE, VENTANA, intervaloHMS, normalizar };

/** Puntos que se piden POR TRAMO cuando el rango se trocea: los cuartos de hora de un día. */
const PUNTOS_POR_TRAMO = 96;

/**
 * Tramos simultáneos como mucho (Plan 15 Fase 3). Mismo valor que
 * `historyConcurrencia` en `backend/config.mjs`: el frontend y el backend
 * acotan la carga que le meten al mismo historiador, con el mismo criterio.
 */
const CONCURRENCIA_TRAMOS = 6;

/**
 * Lo mínimo que este lector le pide a un `sistema`. Se comprueba al entrar y
 * no dentro de la petición, para que el fallo diga QUÉ falta y no «cannot
 * read properties of undefined» en medio de una gráfica.
 */
function exigirSistema(sistema) {
  if (
    !sistema ||
    typeof sistema.esHistorizada !== "function" ||
    typeof sistema.claves !== "function" ||
    typeof sistema.series?.punto !== "function"
  ) {
    throw new Error(
      "leerSerie/leerSeries necesitan un `sistema` del registro (con `claves()`, " +
        "`esHistorizada()` y `series.punto()`): el del tanque en `SISTEMA.tanque` " +
        "o el que devuelve `construirSistema()` para una configurada.",
    );
  }
}

/**
 * Por qué NO se puede pedir la serie de `clave`, o `null` si sí se puede.
 *
 * Es la guarda que los dos lectores —éste y el simulado— tienen que aplicar
 * igual, así que se exporta en vez de repetirse. Devuelve texto, no error:
 * que una señal no tenga serie es un hecho de la instalación que la tarjeta
 * explica, no un fallo.
 */
export function motivoSinSerie(sistema, clave) {
  exigirSistema(sistema);
  if (!sistema.claves().includes(clave)) return `Señal desconocida: ${clave}`;
  if (!sistema.esHistorizada(clave)) return SIN_SERIE;
  return null;
}

/**
 * `{ horas, puntos }` (relativo a ahora) o `{ inicio, fin }` (absoluto) → los
 * tres números que necesita `leerSerie`.
 *
 * Un rango absoluto siempre pide `MAX_PUNTOS`: la ventana relativa trae su
 * densidad «natural» (24 puntos para 6 h); aquí no hay cantidad que proponer
 * y pedir menos desperdiciaría resolución sin motivo.
 *
 * `fin` se recorta a `ahora` si viene en el futuro: el calendario deja elegir
 * HOY como día de fin y `rangoPersonalizado` lo redondea a su medianoche
 * siguiente. Sin el recorte, la mitad del futuro vacío le roba resolución a
 * la mitad que sí tiene dato.
 */
export function resolverRango(rango) {
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
 * Recorta a la ventana pedida — **sólo en lectura cruda**.
 *
 * Regla 3 de `@shared/eva/comun/historia.js`, medida el 26-08-2026: sin
 * `aggregate`, un rango vacío no vuelve vacío, vuelve la muestra LÍMITE del
 * historiador entero con `ok: true`. `crudo` es renunciar al agregado, así
 * que hereda esa trampa; para una alarma importa el doble, porque una
 * muestra de hace tres meses colada al principio es un flanco inventado.
 */
function enRango(datos, { inicio, fin, crudo }) {
  if (!crudo) return datos;
  const desde = inicio.getTime();
  const hasta = fin.getTime();
  return datos.filter((m) => m.t.getTime() >= desde && m.t.getTime() <= hasta);
}

/**
 * Qué parte del rango pedido traía datos. Se declara siempre, también
 * completa, para que quien lea la gráfica —o el CSV dentro de seis meses—
 * distinga «la planta estuvo parada» de «la consulta se quedó corta».
 */
function cobertura(tramos, indicesConDato) {
  const total = tramos.length;
  const con = indicesConDato.length;
  if (!total) return null;

  const primeros = con ? tramos[indicesConDato[0]].desde : null;
  const ultimos = con ? tramos[indicesConDato[con - 1]].hasta : null;

  return { tramos: total, tramosConDato: con, completa: con === total, desde: primeros, hasta: ultimos };
}

/**
 * Serie histórica de una señal de `sistema`.
 *
 * Devuelve `{ datos, motivo, hasMore, cobertura }`: `datos` son
 * `[{ t: Date, valor }]` ya filtrados por calidad; `motivo` es un texto
 * cuando no hay serie que pedir (nunca las dos cosas a la vez); `hasMore` es
 * lo que el backend devuelve cuando el servidor recorta por
 * `X-ICO-MAX-ITEM-COUNT`.
 *
 * `crudo: true` pide la serie SIN agregado, tal como la grabó el historiador.
 * Existe por las alarmas: promediar un booleano no lo degrada, lo borra
 * (medido el 12-09-2026 con `scripts/sondear-agregado-alarma.mjs`: 0 flancos
 * con `Average` donde en crudo había 25). No es el modo normal porque para
 * una magnitud continua el agregado es lo correcto y lo barato.
 */
export async function leerSerie(sistema, clave, rango = VENTANA, { crudo = false } = {}) {
  const motivo = motivoSinSerie(sistema, clave);
  if (motivo) return { datos: [], motivo, hasMore: false };

  const punto = sistema.series.punto(clave);
  const { inicio, fin, puntos } = resolverRango(rango);
  const { tramos } = planificar({ inicio, fin, puntosPorTramo: PUNTOS_POR_TRAMO });

  // Un solo tramo es el camino de siempre: una petición, sin recomponer nada.
  // Con un solo tramo `planificar()` no conoce `puntos` (el de la ventana
  // relativa, distinto de `PUNTOS_POR_TRAMO`), así que este caso calcula su
  // propio `interval` en vez de usar el del tramo.
  if (tramos.length === 1) {
    const segundos = Math.max(1, (fin.getTime() - inicio.getTime()) / 1000);
    const respuesta = await fetchIconicsHistory(punto, {
      startDate: inicio.toISOString(),
      endDate: fin.toISOString(),
      ...(crudo ? {} : { aggregate: AGREGADO, interval: intervaloHMS(segundos / puntos) }),
    });
    const datos = enRango(normalizar(respuesta?.data), { inicio, fin, crudo });
    return {
      datos,
      motivo: null,
      hasMore: Boolean(respuesta?.hasMore),
      cobertura: cobertura(tramos, datos.length ? [0] : []),
    };
  }

  /*
   * Varios tramos: con concurrencia ACOTADA (Plan 15 Fase 3), el mismo
   * criterio que `leerSerieEnRango()` en el backend. Un tramo que falle no
   * invalida el resto —se cuenta y se sigue—: perder un día de diez no cambia
   * la forma de la curva y abortar dejaría la gráfica vacía por un hueco.
   */
  const respuestas = await conConcurrenciaAcotada(
    tramos.map(({ desde, hasta, interval }) => () =>
      fetchIconicsHistory(punto, {
        startDate: desde.toISOString(),
        endDate: hasta.toISOString(),
        ...(crudo ? {} : { aggregate: AGREGADO, interval }),
      }).catch(() => null),
    ),
    CONCURRENCIA_TRAMOS,
  );

  const datos = [];
  const conDato = [];
  let hasMore = false;
  respuestas.forEach((r, i) => {
    const trozo = enRango(normalizar(r?.data), { inicio, fin, crudo });
    if (trozo.length) conDato.push(i);
    if (r?.hasMore) hasMore = true;
    datos.push(...trozo);
  });

  // La gráfica y el CSV recorren la serie tal cual llega, y el orden de los
  // tramos no garantiza el de sus muestras si dos se solapan en el borde.
  datos.sort((a, b) => a.t - b.t);

  return { datos, motivo: null, hasMore, cobertura: cobertura(tramos, conDato) };
}

/**
 * VARIAS series de `sistema` sobre la misma ventana, en UNA petición por lote.
 *
 * Aquí se pide LA VENTANA y trocea el servidor (`/api/iconics/history/batch`),
 * con el mismo `planificar()` y la misma concurrencia. Antes cada señal salía
 * como tantas peticiones como tramos, y cinco señales por diez tramos eran
 * cincuenta contra un puente que corta en 300 por minuto.
 *
 * La forma por señal es la de `leerSerie()`: `{ datos, motivo, hasMore,
 * cobertura }`. Las señales sin serie se resuelven sin salir a la red y ni
 * siquiera viajan en la petición: pedirlas devolvería la curva de otra.
 *
 * `/history/batch` topa en `MAX_SERIES_BATCH` puntos: se trocea aquí, con la
 * misma concurrencia, para que el servidor no rechace el lote entero con
 * `too_big`. Un lote que falle se PROPAGA: una caída de red y un historiador
 * sin muestras tienen que llegar distinguibles a la gráfica.
 */
export async function leerSeries(sistema, claves, rango = VENTANA) {
  exigirSistema(sistema);
  const salida = {};
  const pedibles = [];

  for (const clave of claves) {
    const motivo = motivoSinSerie(sistema, clave);
    if (motivo) salida[clave] = { datos: [], motivo, hasMore: false, cobertura: null };
    else pedibles.push(clave);
  }

  if (!pedibles.length) return salida;

  const { inicio, fin } = resolverRango(rango);

  const lotes = [];
  for (let i = 0; i < pedibles.length; i += MAX_SERIES_BATCH) {
    lotes.push(pedibles.slice(i, i + MAX_SERIES_BATCH));
  }

  const respuestas = await conConcurrenciaAcotada(
    lotes.map((lote) => () =>
      fetchIconicsHistoryBatch(
        lote.map((clave) => sistema.series.punto(clave)),
        { startDate: inicio.toISOString(), endDate: fin.toISOString(), aggregate: AGREGADO },
      ),
    ),
    CONCURRENCIA_TRAMOS,
  );

  const fallido = respuestas.find((r) => !r?.ok);
  if (fallido) {
    throw new Error(fallido.error ?? "El historiador no respondió.");
  }

  for (let i = 0; i < lotes.length; i++) {
    const series = respuestas[i].payload?.series ?? {};
    for (const clave of lotes[i]) {
      const serie = series[sistema.series.punto(clave)];
      const datos = normalizar(serie?.data);
      /*
       * La cobertura viene CONTADA por el servidor, que es quien troceó: los
       * índices de los tramos con dato ya no existen aquí, sólo cuántos
       * fueron. `desde`/`hasta` van en null a propósito: nombran el primer y
       * último tramo con muestras, y esa posición se pierde al contar allí.
       */
      const tramos = serie?.tramos ?? 0;
      salida[clave] = {
        datos,
        motivo: null,
        hasMore: Boolean(serie?.hasMore),
        cobertura: tramos
          ? {
              tramos,
              tramosConDato: serie.tramosConDato ?? 0,
              completa: (serie.tramosConDato ?? 0) === tramos,
              desde: null,
              hasta: null,
            }
          : null,
      };
    }
  }

  return salida;
}

/**
 * Los accesos rápidos del selector de rango: contra el reloj de pared de
 * quien mira la pantalla, no contra una regla del historiador — por eso
 * viven aquí y no en `@shared/eva/comun/historia.js`. Reciben `ahora` para
 * poder probarse sin simular el reloj del sistema.
 *
 * («Hoy» no está aquí: es «Tiempo real» en la UI, y ese lee del búfer en
 * vivo, no del historiador.)
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
 * se incluye entero, hasta su medianoche siguiente.
 */
export function rangoPersonalizado(diaInicio, diaFin) {
  const inicio = new Date(diaInicio);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(diaFin);
  fin.setDate(fin.getDate() + 1);
  fin.setHours(0, 0, 0, 0);
  return { inicio, fin };
}
