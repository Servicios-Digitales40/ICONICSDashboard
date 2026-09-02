/**
 * backend/ia/herramientas/lib/historia.mjs
 * ------------------------------------------------------------------
 * Leer del historiador: una llamada suelta, una ventana troceada y un rango de
 * varios días.
 *
 * ── POR QUÉ LAS CUATRO SE MUEVEN JUNTAS, Y NO UNA A UNA ────────────
 *
 * Porque `leerUnTramo`, `leerSerie` y `leerSerieEnRango` se llaman entre sí:
 * `leerSerie` trocea y delega cada tramo en `leerUnTramo`; `leerSerieEnRango`
 * hace lo mismo para ventanas de días. Separarlas exigiría pasárselas unas a
 * otras por parámetro, que es enredar lo que hoy está claro.
 *
 * Dentro de esta factoría siguen compartiendo ámbito exactamente como lo
 * compartían dentro de `createHerramientas`. Lo único que cambia es de dónde
 * salen `client` y `historyConcurrencia`: antes de una clausura de 3000 líneas,
 * ahora de dos parámetros con nombre.
 *
 * ── LAS TRES TRAMPAS DEL HISTORIADOR QUE ESTE ARCHIVO CONOCE ───────
 *
 * Están explicadas en detalle en los comentarios de cada función y en
 * `docs/PLAN-15-HISTORIA-PROFUNDA.md`, pero conviene saber que existen antes de
 * tocar nada aquí:
 *
 *   · 100 muestras por petición es un tope DURO del servidor. Se pagina con
 *     `X-ICO-CONTINUATION`, que sí funciona — lo hace `client.readHistory`.
 *   · Un rango de varios días hay que trocearlo, y el troceado es UNA regla
 *     (`shared/eva/comun/rango.js`), la misma que usa el frontend.
 *   · Pedir la serie de una señal NO historizada no da error: el servidor
 *     devuelve la curva de otra. Por eso la puerta es `series.historizadas` del
 *     registro y no una comprobación de aquí.
 *
 * ── LA CONCURRENCIA ESTÁ ACOTADA A PROPÓSITO ───────────────────────
 *
 * `historyConcurrencia` no es un ajuste de rendimiento: es lo que impide que
 * una ventana de noventa días lance noventa peticiones a la vez contra un
 * servidor de planta. Viene de `config.limits`, no se lee del entorno aquí.
 */
import { conConcurrenciaAcotada } from '../../../../shared/concurrencia.js'
import { planificar } from '../../../../shared/eva/comun/rango.js'
import {
  AGREGADO,
  MAX_PUNTOS,
  SIN_SERIE,
  intervaloHMS,
  normalizar,
} from '../../../../shared/eva/comun/historia.js'
/*
 * ── EL PUNTO Y LA GUARDA SALEN DEL REGISTRO ────────────────────────
 *
 * Este archivo importaba `pointName` y `esHistorizada` del catálogo del TANQUE,
 * fijos. Funcionó mientras el tanque fue la única máquina con historia.
 *
 * Desde el 28-08-2026 vibraciones también registra, y nombra su punto
 * histórico de otra forma: `hda:\Configuration\DEMO 3:vRMS_S1` frente al
 * `ac:TDCON/DEMO/SENSORES/SNIVEL_TANQUE` del tanque, que es el mismo nombre
 * que en vivo. Con el catálogo del tanque cableado aquí, pedir la serie de una
 * clave de vibraciones daba `pointName(clave) === null`.
 *
 * Ahora los dos salen de la entrada del sistema (`series.punto` y
 * `series.historizadas`), así que la máquina que se dé de alta mañana declara
 * los suyos y este archivo no se entera.
 */
import { SISTEMA } from '../../../../shared/eva/comun/sistemas.js'

/**
 * Los ayudantes de historia, atados a un cliente y a un tope de concurrencia.
 *
 * @param {object} ctx
 * @param {object} ctx.client               el cliente de ICONICS
 * @param {number} ctx.historyConcurrencia  tramos simultáneos como mucho
 */
export function crearAyudantesDeHistoria({ client, historyConcurrencia }) {
  /*
   * El sistema por defecto es el tanque, y es la ÚNICA concesión de este
   * archivo: las nueve herramientas de históricos siguen resolviendo nombres
   * contra su catálogo (ver B3 del backlog), así que exigirles el argumento
   * sería pedirles algo que todavía no saben. Quien sí lo sabe —el asistente,
   * cuando el modelo dice de qué máquina habla— lo pasa.
   *
   * No es el defecto peligroso que se evita en `estado_del_sistema`: allí un
   * defecto contestaba de la máquina equivocada con datos reales; aquí una
   * clave que no es del tanque no existe en su catálogo y la guarda la para.
   */
  const deSistema = (sistemaId) => SISTEMA[sistemaId] ?? SISTEMA.tanque

async function leerUnTramo(clave, ventana, tramoPlanificado, sistemaId = 'tanque') {
  const segundos = (ventana.fin - ventana.inicio) / 1000
  // Un punto cada 15 min como en la vista de Planta, pero sin pasar del tope
  // del servidor: por debajo de 25 h manda la resolución, por encima el tope.
  const puntos = Math.max(2, Math.min(MAX_PUNTOS, Math.round(segundos / 900)))
  // `leerSerie()` ya calculó el tramo con `planificar()` (Plan 15 Fase 2,
  // la MISMA regla que usa el frontend) y lo pasa aquí para no
  // recalcularlo dos veces con criterios distintos dentro del mismo
  // archivo; sin este tercer argumento (una ventana corta, de un único
  // tramo) se calcula como siempre.
  const interval = tramoPlanificado?.interval ?? intervaloHMS(segundos / puntos)
  const segundosPorPunto = tramoPlanificado?.segundosPorPunto ?? segundos / puntos

  const r = await client.readHistory({
    // Cómo se nombra el punto en el historiador lo dice la máquina: el tanque
    // usa `ac:` —el mismo nombre que en vivo— y vibraciones `hda:` con su
    // grupo delante. Ver `series.punto` en `shared/eva/comun/sistemas.js`.
    pointName: deSistema(sistemaId).series.punto(clave),
    startDate: ventana.inicio.toISOString(),
    endDate: ventana.fin.toISOString(),
    aggregate: deSistema(sistemaId).series.agregado ?? AGREGADO,
    interval,
  })

  if (!r?.ok) return { ok: false, status: r?.status ?? 0, error: r?.error }

  /*
   * `hasMore` se propaga porque el recorte del servidor es SILENCIOSO en los
   * datos: con el tope de `MAX_PUNTOS` la respuesta llega `ok: true` y con
   * marcas de tiempo correctas, sólo que le faltan las horas del final. Un
   * mínimo diario calculado sobre ese trozo es un número real del período
   * equivocado —indistinguible del bueno—, que es justo el modo de fallo que
   * el resto de este archivo se esfuerza en evitar.
   *
   * El frontend ya lo consumía (`data/historia.js`); esta ruta lo tiraba.
   */
  /*
   * La rejilla viaja con los datos para que `resumirSerie` pueda declarar la
   * COBERTURA: cuántos tramos de los pedidos traían dato. Sin ella, un día
   * con nueve horas de actividad y quince de silencio se resume con el
   * promedio de las nueve y se lee como el del día entero.
   */
  return {
    ok: true,
    datos: normalizar(r.data),
    truncada: Boolean(r.hasMore),
    ventana: { inicio: ventana.inicio, fin: ventana.fin, segundosPorPunto },
  }
}

/**
 * Una serie del historiador, ya normalizada — la función pública que usan
 * `historia_de_senal`, `analisis_de_senal`, `comparar_periodos` y
 * `grafico_de_senal`.
 *
 * **La guarda de `historizado` va antes que la red**, no después: ver la
 * cabecera del archivo. Devolver `motivo` en vez de lanzar es deliberado —no
 * es una avería, es un hecho de la instalación que el asistente tiene que
 * poder explicar—.
 *
 * ── POR QUÉ TROCEA POR DENTRO (Plan 15 Fase 4) ─────────────────────
 *
 * Antes de esto, una ventana larga se pedía en UNA sola llamada con un
 * intervalo grueso — y ese es exactamente el patrón patológico que
 * documenta `planificar()`/`trocear()`: medido contra el servidor real,
 * un rango de 30 días con un intervalo de 7 h 12 min devolvió **una sola
 * muestra** de todo el mes, sin ningún error que lo delate (`hasMore:
 * false`, la petición "terminó bien"). Con `MAX_HORAS_VENTANA` subido a
 * 90 días (Fase 4), este archivo empezó a poder disparar esa trampa desde
 * una herramienta que un operador usa todos los días.
 *
 * La solución no es la Fase 1 (paginación): el servidor no estaba diciendo
 * "hay más", estaba diciendo honestamente "esto es todo lo que hay con
 * este intervalo" — el problema es la ELECCIÓN del intervalo, no la
 * paginación. La solución es la Fase 2: trocear con `planificar()`, igual
 * que ya hacía `leerSerieEnRango()`, y fusionar los tramos aquí para que
 * los cuatro llamadores no tengan que saber que la ventana se troceó.
 */
async function leerSerie(clave, ventana, sistemaId = 'tanque') {
  if (!deSistema(sistemaId).esHistorizada(clave)) return { ok: false, motivo: SIN_SERIE }

  const { tramos } = planificar({ inicio: ventana.inicio, fin: ventana.fin, puntosPorTramo: 96 })

  // Un solo tramo: la ventana ya es corta, la llamada de siempre sin
  // recomponer nada — mismo `interval` que si `planificar()` no existiera.
  if (tramos.length === 1) return leerUnTramo(clave, ventana, undefined, sistemaId)

  // Concurrencia ACOTADA (Plan 15 Fase 3): mismo criterio que
  // `leerSerieEnRango()`, y por el mismo motivo — más tramos con la Fase 1
  // debajo pueden ser más páginas HTTP por tramo.
  const tareas = tramos.map(
    (tramo) => () => leerUnTramo(clave, { inicio: tramo.desde, fin: tramo.hasta }, tramo, sistemaId)
  )
  const resultados = await conConcurrenciaAcotada(tareas, historyConcurrencia)

  const datos = []
  let truncada = false
  let huboExito = false
  for (const resultado of resultados) {
    if (!resultado.ok) continue
    huboExito = true
    datos.push(...resultado.datos)
    if (resultado.truncada) truncada = true
  }

  // Sin ningún tramo con éxito, se propaga el primer error real — mismo
  // criterio de `leerSerieEnRango`: un tramo que falla no invalida el
  // resto, pero si fallan TODOS no hay nada bueno que devolver.
  if (!huboExito) {
    const primerFallo = resultados.find((r) => !r.ok)
    return primerFallo ?? { ok: false, status: 0, error: 'El historiador no devolvió ningún tramo.' }
  }

  datos.sort((a, b) => a.t - b.t)
  const segundos = (ventana.fin - ventana.inicio) / 1000
  return {
    ok: true,
    datos,
    truncada,
    ventana: { inicio: ventana.inicio, fin: ventana.fin, segundosPorPunto: segundos / 96 },
  }
}

/**
 * Muchos días de una señal, leídos DÍA A DÍA.
 *
 * ── POR QUÉ NO SE PIDE LA VENTANA ENTERA DE UNA VEZ ────────────────
 *
 * Porque el servidor topa en `MAX_PUNTOS` muestras por petición, y ese tope
 * es por PETICIÓN, no por día. Pedir treinta días de golpe devuelve cien
 * puntos: uno cada siete horas. Sobre eso no se puede decir qué es normal —
 * cada punto es ya el promedio de media jornada, así que los extremos han
 * desaparecido y la variabilidad medida es la de los promedios, no la de la
 * señal.
 *
 * Troceando por días se conserva la resolución de un cuarto de hora, que es
 * la que hace falta para que un percentil signifique algo.
 *
 * Un día que falle no invalida el perfil: se cuenta y se sigue. Con treinta
 * días, perder uno no cambia la respuesta, y abortar por él dejaría al
 * operador sin perfil por un hueco del historiador.
 */
async function leerHistoriaLarga(clave, dias, sistemaId = 'tanque') {
  const ahora = new Date()
  const { muestras, diasLeidos } = await leerSerieEnRango(clave, {
    inicio: new Date(ahora.getTime() - dias * 86400000),
    fin: ahora,
  }, sistemaId)
  return { muestras, diasLeidos }
}

/**
 * Igual que arriba, pero para un rango explícito en vez de "N días hacia
 * atrás desde ahora". La usa `generar_reporte` (Plan 14 Fase 5), que puede
 * pedir cualquier ventana, no sólo la que termina en el presente.
 *
 * El troceado en tramos es `planificar()` de `@shared/eva/comun/rango.js` (Plan
 * 15 Fase 2) — la MISMA regla escalonada que usa el frontend, en vez de la
 * de "siempre 1 día por tramo" que tenía este archivo antes: menos tramos
 * en rangos largos son menos peticiones HTTP, y con la Fase 1
 * (`readHistory` siguiendo la continuación) cada tramo ya puede ser varias
 * páginas por debajo.
 *
 * `diasLeidos`/`diasTotal` siguen contando en DÍAS DE CALENDARIO, no en
 * tramos —el asistente narra cobertura como "12 de 30 días respondieron"—,
 * así que un tramo de varios días que trae dato cuenta como TODOS sus
 * días leídos, sin distinguir si sólo una parte del tramo respondió. Es
 * una aproximación deliberada: la alternativa (pedir cada día suelto para
 * contar fino) es exactamente el problema que esta unificación resuelve.
 */
async function leerSerieEnRango(clave, { inicio, fin }, sistemaId = 'tanque') {
  const muestras = []
  let diasLeidos = 0
  const diasTotal = Math.max(1, Math.ceil((fin - inicio) / 86400000))

  // 96 puntos por tramo, el mismo techo bajo `MAX_PUNTOS` que ya usaba
  // este archivo para un tramo de 1 día — `planificar()` sólo cambia CUÁN
  // ANCHO es cada tramo, no cuánta densidad se le pide dentro.
  const { tramos } = planificar({ inicio, fin, puntosPorTramo: 96 })

  // Concurrencia ACOTADA, no todo a la vez (Plan 15 Fase 3): un mes son
  // varios tramos, y con la Fase 1 (`readHistory` siguiendo la
  // continuación) cada tramo puede ser varias peticiones HTTP por debajo —
  // lanzarlos todos de golpe multiplicaría la carga contra el historiador
  // de producción justo cuando se amplíe cuánto se puede leer (Fase 4).
  // `leerUnTramo`, no `leerSerie`: cada elemento de `tramos` YA es un
  // tramo final de `planificar()` — pasarlo por `leerSerie()` volvería a
  // trocearlo (con otro `puntosPorTramo` distinto) en vez de pedirlo tal
  // cual.
  const tareas = tramos.map(
    (tramo) => () => leerUnTramo(clave, { inicio: tramo.desde, fin: tramo.hasta }, tramo, sistemaId)
  )

  const resultados = await conConcurrenciaAcotada(tareas, historyConcurrencia)
  resultados.forEach((resultado, i) => {
    if (!resultado.ok) return
    diasLeidos += tramos[i].dias
    muestras.push(...resultado.datos)
  })

  return { muestras, diasLeidos: Math.min(diasLeidos, diasTotal), diasTotal }
}

  return { leerUnTramo, leerSerie, leerHistoriaLarga, leerSerieEnRango }
}
