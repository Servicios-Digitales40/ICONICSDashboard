/**
 * Lectura del historiador para las señales de Demo EVA: **la red, no las
 * reglas**.
 *
 * Las reglas —qué agregado se pide, cómo se escribe un intervalo, qué muestra
 * se tira y por qué sólo cuatro señales tienen serie— viven en
 * [`@shared/eva/comun/historia.js`](../../../../shared/eva/comun/historia.js). Se mudaron
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
 * Con el origen «Simulado» la serie no sale de aquí sino de `data/tanque/simulador.js`,
 * que trae su propio `readSerie`. Quién de los dos lee lo decide `evaSource.js`
 * a partir del transporte, y nadie más: las vistas piden `source.leerSerie()` sin
 * saber cuál está detrás.
 *
 * `SIN_SERIE` y `VENTANA` se **reexportan** desde aquí porque los dos lectores y
 * las vistas los venían pidiendo a este archivo, y son hechos de la instalación
 * y no del origen. Cambiar treinta imports para que apunten a `@shared` no
 * habría arreglado nada: son el mismo valor, y ahora salen del mismo sitio.
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

import { esHistorizada, puntoHistorico, senalInfo } from "../../domain/senales.js";

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
 * Recorta a la ventana pedida — **sólo en lectura cruda**, y no por manía.
 *
 * Es la regla 3 de la cabecera de `@shared/eva/comun/historia.js`, medida el
 * 26-08-2026: **sin `aggregate`, un rango vacío no vuelve vacío**, vuelve la
 * muestra LÍMITE del historiador entero con `ok: true` y sin aviso, por lejos
 * que caiga del rango. Con agregado el mismo rango vacío sí devuelve `[]`.
 *
 * Como `crudo` es precisamente renunciar al agregado, hereda esa trampa, y esa
 * cabecera ya dice qué toca: «una lectura cruda que alguna vez se necesite
 * tiene que comprobar el `timestamp` de cada muestra contra el rango pedido
 * antes de darla por buena, porque el servidor no lo hace». Esto es esa
 * comprobación. Para una alarma importa el doble: una muestra de hace tres
 * meses colada al principio de la ventana es un flanco inventado.
 */
function enRango(datos, { inicio, fin, crudo }) {
  if (!crudo) return datos;
  const desde = inicio.getTime();
  const hasta = fin.getTime();
  return datos.filter((m) => m.t.getTime() >= desde && m.t.getTime() <= hasta);
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
 *
 * ── `crudo: true`, Y POR QUÉ NO ES EL MODO NORMAL (12-09-2026) ─────
 *
 * Pide la serie SIN `aggregate`, tal como la grabó el historiador. Existe por
 * las alarmas: son booleanos, y `AGREGADO` es `Average`.
 *
 * Promediar un booleano no lo degrada, **lo borra**. Medido contra
 * `bms-server` con `scripts/sondear-agregado-alarma.mjs` sobre 24 h: con
 * `Average` salen 0 flancos en las NUEVE alarmas; en crudo salen 5 en
 * `presionAlta`, 7 en `faltaDePresion`, 2 en `bajoFlujo` y 11 en
 * `paroDeEmergencia`. El promedio de un cubo de 14 min vale `0,5` —ni 0 ni 1,
 * así que jamás es un flanco—, y la mayoría de los cubos ni siquiera traen
 * `value`, con lo que `normalizar()` los descarta por no finitos. El resultado
 * era una pantalla que enseñaba UN evento donde había once.
 *
 * No se convierte en el modo normal porque para una magnitud continua el
 * agregado es lo correcto —y lo barato—: una ventana de 30 días en crudo son
 * decenas de miles de muestras que nadie distingue en una gráfica de 900
 * píxeles. Pide crudo quien necesita el valor EXACTO de cada muestra, que hoy
 * es sólo el derivador de flancos.
 */
export async function leerSerie(clave, rango = VENTANA, { crudo = false } = {}) {
  if (!senalInfo(clave)) return { datos: [], motivo: `Señal desconocida: ${clave}`, hasMore: false };
  if (!esHistorizada(clave)) return { datos: [], motivo: SIN_SERIE, hasMore: false };

  const { inicio, fin, puntos } = resolverRango(rango);
  const { tramos } = planificar({ inicio, fin, puntosPorTramo: PUNTOS_POR_TRAMO });

  // Un solo tramo es el camino de siempre: una petición, sin recomponer nada.
  // Con un solo tramo `planificar()` no conoce `puntos` (el de la ventana
  // relativa, distinto de `PUNTOS_POR_TRAMO`), así que este caso sigue
  // calculando su propio `interval` en vez de usar el del tramo.
  if (tramos.length === 1) {
    const segundos = Math.max(1, (fin.getTime() - inicio.getTime()) / 1000);
    const respuesta = await fetchIconicsHistory(puntoHistorico(clave), {
      startDate: inicio.toISOString(),
      endDate: fin.toISOString(),
      ...(crudo
        ? {}
        : { aggregate: AGREGADO, interval: intervaloHMS(segundos / puntos) }),
    });
    const datos = enRango(normalizar(respuesta?.data), { inicio, fin, crudo });
    return {
      datos,
      motivo: null,
      hasMore: Boolean(respuesta?.hasMore),
      // Un solo tramo: o trae dato (índice 0) o no trae ninguno.
      cobertura: cobertura(tramos, datos.length ? [0] : []),
    };
  }

  /*
   * Varios tramos: con concurrencia ACOTADA, no todos a la vez (Plan 15 Fase
   * 3) — mismo motivo que `leerSerieEnRango()` en `backend/ia/conversacion/herramientas.mjs`:
   * un trimestre son ~90 tramos, y con la Fase 1 (el backend siguiendo
   * `X-ICO-CONTINUATION`) cada petición HTTP de este frontend puede disparar
   * varias páginas por debajo. Un tramo que falle no invalida el resto —se
   * cuenta y se sigue—, porque perder un día de diez no cambia la forma de
   * la curva y abortar dejaría la gráfica vacía por un hueco del
   * historiador.
   */
  const respuestas = await conConcurrenciaAcotada(
    tramos.map(({ desde, hasta, interval }) => () =>
      fetchIconicsHistory(puntoHistorico(clave), {
        startDate: desde.toISOString(),
        endDate: hasta.toISOString(),
        ...(crudo ? {} : { aggregate: AGREGADO, interval }),
      }).catch(() => null)
    ),
    CONCURRENCIA_TRAMOS
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

  // El orden importa: la gráfica y el CSV recorren la serie tal cual llega, y
  // `Promise.all` conserva el orden de los tramos pero no el de sus muestras
  // si dos tramos se solapan en el borde.
  datos.sort((a, b) => a.t - b.t);

  return { datos, motivo: null, hasMore, cobertura: cobertura(tramos, conDato) };
}

/**
 * Puntos que se piden POR TRAMO cuando el rango se trocea.
 *
 * 96 son los cuartos de hora de un día — la misma rejilla que usan el backend
 * y la vista de Planta—, y deja margen bajo `MAX_PUNTOS` para que el servidor
 * no recorte por su cuenta.
 *
 * ── POR QUÉ EL TROCEADO YA NO VIVE AQUÍ (Plan 15 Fase 2) ───────────
 *
 * `trocear()` se mudó a `planificar()`/`tramosDe()` en
 * `@shared/eva/comun/rango.js`: era la MISMA regla que `leerSerieEnRango()`
 * repetía en `backend/ia/conversacion/herramientas.mjs` con un valor distinto (ahí
 * siempre 1 día por tramo, aquí escalonado) — dos copias de "cómo trocear un
 * rango largo" son dos oportunidades de que la gráfica, el asistente y el
 * script de antigüedad no lean el mismo histórico ante el mismo rango. Ver
 * la cabecera de `rango.js` para la comparación completa y qué se decidió
 * conservar de cada versión.
 */
/**
 * VARIAS series sobre la misma ventana, en UNA sola petición.
 *
 * ── QUÉ RESUELVE, Y POR QUÉ NO ES `leerSerie()` EN UN BUCLE ────────
 *
 * Porque el bucle era el problema. `leerSerie()` trocea AQUÍ, en el
 * navegador, y cada tramo sale como una petición HTTP propia: cinco señales
 * por diez tramos de una ventana de 30 días eran CINCUENTA peticiones para
 * pintar una pantalla —contra las cuatro que gasta «Planta» entera—. El
 * puente corta en 300 por minuto y por IP, así que esa pantalla se llevaba un
 * 429 que luego pagaba el siguiente en preguntar cualquier cosa.
 *
 * Aquí se pide LA VENTANA y trocea el servidor, con el mismo `planificar()`
 * y la misma concurrencia acotada. Cincuenta peticiones pasan a ser una.
 *
 * ── LO QUE NO CAMBIA ───────────────────────────────────────────────
 *
 * La forma de la respuesta por señal: `{ datos, motivo, hasMore, cobertura }`,
 * la misma que devuelve `leerSerie()`, para que quien las pinte no tenga que
 * saber por qué camino llegaron. Las señales sin serie propia se resuelven
 * sin salir a la red —igual que antes—, y por eso ni siquiera viajan en la
 * petición: pedirlas devolvería la curva de OTRA señal sin dar error (ver la
 * nota de las tres señales en `senales.js`).
 */
export async function leerSeries(claves, rango = VENTANA) {
  const salida = {};
  const pedibles = [];

  for (const clave of claves) {
    if (!senalInfo(clave)) {
      salida[clave] = { datos: [], motivo: `Señal desconocida: ${clave}`, hasMore: false, cobertura: null };
    } else if (!esHistorizada(clave)) {
      salida[clave] = { datos: [], motivo: SIN_SERIE, hasMore: false, cobertura: null };
    } else {
      pedibles.push(clave);
    }
  }

  if (!pedibles.length) return salida;

  const { inicio, fin } = resolverRango(rango);

  /*
   * `/history/batch` topa en `MAX_SERIES_BATCH` puntos (Plan 27 F6,
   * 10-09-2026): con cincuenta señales historizadas, una sola pestaña de
   * `DetalleActivo` puede pedir más de las que cabían cuando el catálogo
   * entero eran ocho. Trocear aquí, con la misma concurrencia acotada que ya
   * usa `leerSerie()` para los tramos, evita que el servidor rechace el lote
   * entero con `too_big` — la alternativa era que el frontend descubriera el
   * tope por un 400 en vez de conocerlo de antemano.
   */
  const lotes = [];
  for (let i = 0; i < pedibles.length; i += MAX_SERIES_BATCH) {
    lotes.push(pedibles.slice(i, i + MAX_SERIES_BATCH));
  }

  const respuestas = await conConcurrenciaAcotada(
    lotes.map((lote) => () =>
      fetchIconicsHistoryBatch(
        lote.map((clave) => puntoHistorico(clave)),
        { startDate: inicio.toISOString(), endDate: fin.toISOString(), aggregate: AGREGADO }
      )
    ),
    CONCURRENCIA_TRAMOS
  );

  /*
   * Un fallo de la petición NO se disfraza de rango vacío: sin esto, una caída
   * de red y un historiador sin muestras llegarían indistinguibles a la
   * gráfica, que es el modo de fallo que `metaPorClave.error` existe para
   * evitar. Se propaga para que el hook lo cuente como error de cada señal —
   * un solo lote roto invalida la ventana entera, igual que antes de trocear.
   */
  const fallido = respuestas.find((r) => !r?.ok);
  if (fallido) {
    throw new Error(fallido.error ?? "El historiador no respondió.");
  }

  for (let i = 0; i < lotes.length; i++) {
    const series = respuestas[i].payload?.series ?? {};
    for (const clave of lotes[i]) {
      const serie = series[puntoHistorico(clave)];
      const datos = normalizar(serie?.data);
      /*
       * La cobertura viene CONTADA por el servidor, que es quien troceó: los
       * índices de los tramos con dato ya no existen aquí, sólo cuántos fueron.
       * Se reconstruye la forma que `cobertura()` produce para no cambiar el
       * contrato de quien la lee.
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
              /*
               * `desde`/`hasta` van en null a propósito: nombran el PRIMER y
               * ÚLTIMO tramo que trajeron muestras, y esa posición se pierde al
               * contar en el servidor. Declararlo vacío es honesto; rellenarlo
               * con los bordes de la ventana diría que la cobertura llega hasta
               * ahí cuando no se sabe.
               */
              desde: null,
              hasta: null,
            }
          : null,
      };
    }
  }

  return salida;
}
const PUNTOS_POR_TRAMO = 96;

/**
 * Tramos simultáneos como mucho (Plan 15 Fase 3). Mismo valor que
 * `historyConcurrencia` en `backend/config.mjs`: el frontend y el backend
 * acotan la carga que le meten al mismo historiador, con el mismo criterio.
 */
const CONCURRENCIA_TRAMOS = 6;

/**
 * Qué parte del rango pedido traía datos.
 *
 * Se declara siempre, también cuando está completa, para que quien lea la
 * gráfica —o el CSV dentro de seis meses— pueda distinguir «la planta estuvo
 * parada» de «la consulta se quedó corta». Sin esto, un rango con la mitad de
 * los días vacíos se dibuja como una recta y parece un dato.
 */
function cobertura(tramos, indicesConDato) {
  const total = tramos.length;
  const con = indicesConDato.length;
  if (!total) return null;

  const primeros = indicesConDato.length ? tramos[indicesConDato[0]].desde : null;
  const ultimos = indicesConDato.length ? tramos[indicesConDato[indicesConDato.length - 1]].hasta : null;

  return {
    tramos: total,
    tramosConDato: con,
    completa: con === total,
    desde: primeros,
    hasta: ultimos,
  };
}

/**
 * Los accesos rápidos del selector de rango contra el historiador: contra
 * el reloj de pared de quien mira la pantalla, no contra una regla del
 * protocolo del historiador — por eso viven aquí y no en
 * `@shared/eva/comun/historia.js`. Un asistente que corriera en el backend, en
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
