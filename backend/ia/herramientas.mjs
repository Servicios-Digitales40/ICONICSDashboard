/**
 * Las herramientas que el modelo de lenguaje puede invocar.
 *
 * ── POR QUÉ SON DE DOMINIO Y NO LA API REST EN CRUDO ───────────────
 *
 * La alternativa era dejar que el modelo construyera la llamada al
 * historiador. No funciona: hay cinco reglas no obvias que hay que acertar a
 * la vez —`Interpolative` y nunca `Average`, un día por petición, desfase
 * horario explícito, tope de 100 muestras, y los contadores sumados por tramos
 * porque se reinician con el turno— y un modelo de 9B las inventa con aplomo.
 * Están medidas en docs/TAGS.md y resueltas en `shared/historia.js`.
 *
 * Aquí el modelo elige QUÉ preguntar; el CÓMO lo sabe este archivo.
 *
 * ── DE SOLO LECTURA POR CONSTRUCCIÓN ───────────────────────────────
 *
 * El registro no contiene ni una operación de escritura. `ICONICS_READ_ONLY`
 * sigue siendo la última puerta, pero la primera es que `writePoint` no está
 * en el catálogo: ninguna instrucción astuta metida en el chat puede alcanzar
 * algo que no existe aquí.
 */
import {
  AREAS,
  RESUMEN_TAGS,
  TAGS_ESTATICOS,
  historyPointName,
  listMachines,
  pointName,
  tagsForArea,
} from '../../shared/tagCatalog.js'
import { buildPlantSummary, summaryByArea } from '../../shared/plantModel.js'
import { createMachine, hasValue } from '../../shared/domain/machine.js'
import { estadoLabel } from '../../shared/domain/estado.js'
import { daySummary } from '../../shared/domain/history.js'
import { isGoodQuality } from '../../shared/quality.js'
import {
  AGREGADO,
  INTERVALO,
  TAGS_CIERRE,
  TAGS_DIA,
  TAGS_FACTOR,
  isoLocal,
  rangoDelDia,
  recortarAlPresente,
  totalDelDia,
  unir,
} from '../../shared/historia.js'

/**
 * Máquinas cuyos tags están marcados «Is Collected» en el Data Historian.
 *
 * Hoy es solo la Lineal 1 (verificado en `user1690-pc`, ver docs/TAGS.md). Las
 * otras nueve responden 500 a cualquier lectura histórica, igual que un punto
 * que no existe.
 *
 * Es una PISTA, no la verdad: la verdad es lo que conteste el servidor, y
 * `oee_de_maquina` la comprueba de todos modos. Existe para que el modelo
 * pueda decir «esa máquina no tiene historia» sin gastar medio minuto en
 * descubrirlo, que con este presupuesto de tiempo importa. Cuando alguien
 * marque más tags, se añaden aquí o se pasan por `maquinasConHistoria`.
 */
export const CON_HISTORIA_POR_DEFECTO = ['LIN/1']

/** Fecha en formato `YYYY-MM-DD`, que es lo único que aceptan las herramientas. */
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/** Quita acentos y unifica separadores para poder comparar nombres escritos a mano. */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    // El rango va escrito con escapes y no con los acentos literales: son
    // caracteres combinantes, invisibles al abrir el archivo, y un editor que
    // los recomponga al guardar rompería la expresión sin dejar rastro.
    // Tiene que ir ANTES del filtro alfanumérico: si no, cada tilde se
    // convertiría en un espacio y «Línea» acabaría como «li nea».
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Índice de nombres → id de máquina.
 *
 * Se aceptan muchas formas porque quien escribe en el chat es un operador, no
 * un integrador: «LIN/1», «linea 1», «lineal 1», «l1», «multi 13», «REC 13».
 * Resolver el nombre es trabajo del backend y nunca del modelo, que si lo
 * hiciera inventaría máquinas —la numeración de rectificadoras tiene huecos
 * reales y no existen ni la REC 12 ni las REC 1-9—.
 */
function construirIndice() {
  const indice = new Map()
  const registrar = (clave, id) => {
    const k = normalizar(clave)
    if (k) indice.set(k, id)
  }

  for (const m of listMachines()) {
    const { id, areaId, machineId, equipo } = m

    registrar(id, id)                              // LIN/1
    registrar(`${areaId} ${machineId}`, id)        // lin 1
    registrar(`${areaId}${machineId}`, id)         // lin1
    registrar(equipo, id)                          // lineal 1 · multi 10

    if (areaId === 'LIN') {
      registrar(`linea ${machineId}`, id)
      registrar(`line ${machineId}`, id)
      registrar(`l ${machineId}`, id)
    } else {
      registrar(`rectificadora ${machineId}`, id)
      registrar(`rec ${machineId}`, id)
      registrar(`r ${machineId}`, id)
    }
  }
  return indice
}

const INDICE = construirIndice()

/** Nombre escrito por una persona → id canónico, o `null`. */
export function resolverMaquina(texto) {
  return INDICE.get(normalizar(texto)) ?? null
}

/** Error uniforme que además enseña al modelo cómo corregirse en la misma pasada. */
function fallo(error, extra = {}) {
  return { ok: false, error, ...extra }
}

/**
 * Catálogo con el que el modelo puede corregir un nombre inventado. Se manda
 * dentro del propio error, para que el reintento no necesite otra ronda.
 */
function catalogoBreve() {
  return listMachines().map(m => ({ id: m.id, nombre: m.equipo }))
}

export function createHerramientas({ client, maquinasConHistoria = CON_HISTORIA_POR_DEFECTO } = {}) {
  if (!client?.readPoints) {
    throw new Error('createHerramientas requiere el cliente de ICONICS')
  }

  const conHistoria = new Set(maquinasConHistoria)
  const porId = new Map(listMachines().map(m => [m.id, m]))

  /* ── Lectura en vivo ───────────────────────────────────────────────── */

  /**
   * Lee varias máquinas en **una sola** llamada en lote y las convierte en
   * `Machine` de dominio.
   *
   * Una llamada y no una por máquina: la planta entera son ~110 puntos, y
   * diez peticiones en vez de una multiplicarían por diez el trabajo del
   * servidor de planta para responder a una sola pregunta. La caché de lote
   * del cliente (2 s) además colapsa esta lectura con la que ya están
   * haciendo las pantallas encendidas.
   *
   * La calidad se filtra aquí, en la frontera, exactamente igual que hace el
   * motor de sondeo del frontend: un valor de mala calidad llega como 0 y, sin
   * filtrar, el asistente diría «el OEE es 0 %» de una máquina que está
   * produciendo.
   */
  async function leerMaquinas(metas, tagsDe) {
    const puntos = metas.flatMap(meta =>
      tagsDe(meta).map(tag => pointName(meta.areaId, meta.machineId, tag))
    )

    const respuesta = await client.readPoints(puntos)
    if (!respuesta.ok) return { ok: false, error: respuesta.error, status: respuesta.status }

    const mapa = respuesta.payload ?? {}
    const receivedAt = new Date().toISOString()

    const machines = metas.map(meta => {
      const readings = {}

      for (const tag of tagsDe(meta)) {
        const entrada = mapa[pointName(meta.areaId, meta.machineId, tag)]
        if (!entrada?.ok) continue

        const p = entrada.payload ?? {}
        const quality = p.quality ?? p.Quality ?? null
        if (!isGoodQuality(quality)) continue

        readings[tag] = p.value ?? p.Value ?? null
      }

      return createMachine({ ...meta, readings, receivedAt })
    })

    return { ok: true, machines }
  }

  /** Una sola máquina, con todos sus tags. */
  async function leerEnVivo(meta) {
    const lectura = await leerMaquinas([meta], m => tagsForArea(m.areaId))
    return lectura.ok ? { ok: true, machine: lectura.machines[0] } : lectura
  }

  /* ── Lectura histórica ─────────────────────────────────────────────── */

  /**
   * Un día del historiador, con la misma mecánica que usa el comparativo del
   * tablero: siete tags, una petición por tag, 24 puntos cada una.
   *
   * A diferencia del frontend —que traga los fallos por tag para no dejar la
   * gráfica en blanco— aquí se cuentan: si fallan los siete, la respuesta
   * honesta es «esta máquina no tiene historia», y no un resumen vacío que el
   * modelo presentaría como un día de producción nula.
   */
  async function leerDia(meta, iso) {
    const rango = rangoDelDia(iso)

    const resultados = await Promise.all(
      TAGS_DIA.map(async tag => {
        const r = await client.readHistory({
          pointName: historyPointName(meta.areaId, meta.machineId, tag),
          startDate: rango.startDate,
          endDate: rango.endDate,
          aggregate: AGREGADO.serie,
          interval: INTERVALO.hora,
        })
        return {
          tag,
          ok: Boolean(r?.ok),
          status: r?.status ?? 0,
          muestras: Array.isArray(r?.data) ? r.data : [],
        }
      })
    )

    const fallaron = resultados.filter(r => !r.ok)
    if (fallaron.length === TAGS_DIA.length) {
      /*
       * Los siete tags fallaron, pero el motivo importa y no es el mismo.
       *
       * ICONICS responde 500 cuando el punto existe y no está coleccionado —o
       * cuando no existe—, y ahí «esta máquina no tiene historia» es la
       * verdad. Pero un 502 o un 504 los pone el propio puente: significan que
       * no se llegó al servidor, y decir entonces «no está coleccionado»
       * manda a revisar el Data Historian cuando lo que hay que hacer es
       * levantar los servicios. Es la misma distinción que el puente ya hace
       * entre 502 y 504, y por el mismo motivo: se arreglan en sitios
       * distintos.
       */
      return { ok: false, sinHistoria: true, incomunicado: fallaron.every(r => r.status >= 502) }
    }

    const porTag = Object.fromEntries(resultados.map(r => [r.tag, r.muestras]))

    return {
      ok: true,
      parcial: fallaron.length > 0,
      serie: recortarAlPresente(unir(porTag, TAGS_FACTOR), iso),
      cierre: Object.fromEntries(TAGS_CIERRE.map(tag => [tag, totalDelDia(porTag[tag] ?? [])])),
    }
  }

  /**
   * Resumen de un día ya validado, con el motivo exacto cuando no hay dato.
   * Lo comparten `oee_de_maquina` y `comparar_dias`.
   */
  async function resumenDelDia(meta, fecha) {
    const dia = await leerDia(meta, fecha)

    if (!dia.ok) {
      if (dia.incomunicado) {
        return fallo(
          'No se pudo contactar con el servidor ICONICS para leer el historiador. ' +
            'No es que falten datos: el servidor no está respondiendo. Si acaban de ' +
            'arrancarse los servicios GENESIS, tardan 3-4 minutos en atender.'
        )
      }

      return fallo(
        `La máquina ${meta.equipo} (${meta.id}) no tiene datos históricos en el servidor. ` +
          `Sus tags no están marcados «Is Collected» en el Data Historian.`,
        { maquinasConHistoria: [...conHistoria] }
      )
    }

    const resumen = daySummary(dia.serie, dia.cierre)
    if (!resumen) {
      return fallo(
        `No hay ninguna muestra de ${meta.equipo} (${meta.id}) el ${fecha}. ` +
          `El historiador no guarda ese día, o la máquina no estuvo en marcha.`
      )
    }

    return {
      ok: true,
      maquina: meta.id,
      nombre: meta.equipo,
      fecha,
      fuente: 'historiador',
      ...formatearResumen(resumen),
      ...(dia.parcial ? { aviso: 'Algunos tags del día no respondieron; el resumen es parcial.' } : {}),
    }
  }

  /* ── Las cuatro herramientas ───────────────────────────────────────── */

  const herramientas = {
    listar_maquinas() {
      return {
        ok: true,
        total: 10,
        maquinas: listMachines().map(m => ({
          id: m.id,
          nombre: m.equipo,
          area: AREAS[m.areaId].label,
          tieneHistoria: conHistoria.has(m.id),
        })),
        nota:
          'Solo las máquinas con tieneHistoria=true admiten preguntas sobre fechas pasadas. ' +
          'El resto solo puede consultarse en tiempo real con estado_actual.',
      }
    },

    /**
     * La planta entera, de una vez.
     *
     * ── POR QUÉ UNA SOLA HERRAMIENTA Y NO TRES ─────────────────────
     *
     * `oee_de_planta`, `peor_maquina` y `resumen_por_area` responderían lo
     * mismo y triplicarían las ocasiones de que el modelo elija mal — que es
     * justo donde un 4B es más frágil. Devolviéndolo todo junto, «¿cómo va la
     * planta?» y «¿qué máquina va peor?» son la misma llamada y al modelo solo
     * le queda redactar la parte que le preguntaron.
     *
     * Las cifras salen de `buildPlantSummary`, el mismo cálculo que pinta el
     * tablero. Recalcularlo aquí daría dos OEE de planta distintos y el chat
     * contradiría a la pantalla que el operador tiene delante.
     */
    async estado_de_planta() {
      const metas = listMachines()

      // Los mismos tags que sondea el tablero, para que la caché de lote del
      // cliente colapse esta lectura con la suya en vez de duplicarla.
      const tagsDe = meta => [
        ...RESUMEN_TAGS.filter(t => tagsForArea(meta.areaId).includes(t)),
        ...TAGS_ESTATICOS,
      ]

      const lectura = await leerMaquinas(metas, tagsDe)
      if (!lectura.ok) {
        return fallo(`No se pudo leer la planta del servidor ICONICS: ${lectura.error}`)
      }

      const resumen = buildPlantSummary(lectura.machines)

      // Sin una sola lectura buena no hay planta que resumir. Devolver el
      // resumen con todo a null invitaría a redactarlo como «la planta está
      // al 0 %», que es una avería contada como si fuera producción.
      if (resumen.sinDato === resumen.totalMaquinas) {
        return fallo(
          'Ninguna de las 10 máquinas está entregando lecturas ahora mismo. ' +
            'Suele ser el servidor de planta caído o la licencia de ICONICS caducada; ' +
            'si acaban de reiniciarse los servicios GENESIS, tardan 3-4 minutos en responder.'
        )
      }

      const conOee = lectura.machines.filter(m => hasValue(m.oee))
      const porOee = [...conOee].sort((a, b) => b.oee - a.oee)

      return {
        ok: true,
        fuente: 'tiempo real',
        planta: {
          oee: red1(resumen.oee),
          disponibilidad: red1(resumen.disponibilidad),
          rendimiento: red1(resumen.rendimiento),
          calidad: red1(resumen.calidad),
          fty: red1(resumen.fty),
          producidas: resumen.producidas,
          aceptadas: resumen.aceptadas,
          rechazadas: resumen.rechazadas,
        },
        maquinas: {
          total: resumen.totalMaquinas,
          operando: resumen.operando,
          sinDato: resumen.sinDato,
          porEstado: resumen.porEstado.map(e => ({ estado: e.label, cuantas: e.valor })),
        },
        // Ordenado de mejor a peor: la primera y la última contestan
        // «¿cuál va mejor?» y «¿cuál va peor?» sin otra llamada.
        rankingPorOee: porOee.map(m => ({ id: m.id, nombre: m.equipo, oee: red1(m.oee) })),
        areas: summaryByArea(lectura.machines).map(a => ({
          area: a.label,
          oee: red1(a.oee),
          operando: a.operando,
          de: a.totalMaquinas,
        })),
        unidades: { oee: '%', disponibilidad: '%', rendimiento: '%', calidad: '%', fty: '%' },
      }
    },

    async estado_actual({ maquina } = {}) {
      const id = resolverMaquina(maquina)
      if (!id) {
        return fallo(`No existe ninguna máquina llamada "${maquina}".`, { maquinas: catalogoBreve() })
      }

      const meta = porId.get(id)
      const lectura = await leerEnVivo(meta)
      if (!lectura.ok) {
        return fallo(`No se pudo leer ${meta.equipo} del servidor ICONICS: ${lectura.error}`)
      }

      const m = lectura.machine
      return {
        ok: true,
        maquina: m.id,
        nombre: m.equipo,
        fuente: 'tiempo real',
        estado: estadoLabel(m.estado),
        modelo: m.modelo,
        oee: m.oee,
        disponibilidad: m.disponibilidad,
        rendimiento: m.rendimiento,
        calidad: m.calidad,
        aprobadas: m.aprobadas,
        rechazadas: m.rechazadas,
        producidas: m.producidas,
        tMuertoSegundos: m.tMuerto,
        unidades: { oee: '%', disponibilidad: '%', rendimiento: '%', calidad: '%', piezas: 'unidades' },
      }
    },

    async oee_de_maquina({ maquina, fecha } = {}) {
      const id = resolverMaquina(maquina)
      if (!id) {
        return fallo(`No existe ninguna máquina llamada "${maquina}".`, { maquinas: catalogoBreve() })
      }

      const dia = resolverFecha(fecha)
      if (dia.error) return fallo(dia.error)

      return resumenDelDia(porId.get(id), dia.iso)
    },

    async comparar_dias({ maquina, fechaA, fechaB } = {}) {
      const id = resolverMaquina(maquina)
      if (!id) {
        return fallo(`No existe ninguna máquina llamada "${maquina}".`, { maquinas: catalogoBreve() })
      }

      const diaA = resolverFecha(fechaA)
      if (diaA.error) return fallo(diaA.error)
      const diaB = resolverFecha(fechaB)
      if (diaB.error) return fallo(diaB.error)

      const meta = porId.get(id)
      const [a, b] = await Promise.all([resumenDelDia(meta, diaA.iso), resumenDelDia(meta, diaB.iso)])

      if (!a.ok) return a
      if (!b.ok) return b

      return {
        ok: true,
        maquina: meta.id,
        nombre: meta.equipo,
        fuente: 'historiador',
        // Las claves son las fechas YA resueltas, para que el modelo redacte
        // con el día real y no con el «ayer» que escribió él.
        [diaA.iso]: a,
        [diaB.iso]: b,
        diferencia: {
          oee: resta(b.oee, a.oee),
          disponibilidad: resta(b.disponibilidad, a.disponibilidad),
          rendimiento: resta(b.rendimiento, a.rendimiento),
          calidad: resta(b.calidad, a.calidad),
          aprobadas: resta(b.aprobadas, a.aprobadas),
          rechazadas: resta(b.rechazadas, a.rechazadas),
        },
        nota: `La diferencia es ${diaB.iso} menos ${diaA.iso}. Un valor negativo significa que empeoró.`,
      }
    },
  }

  /**
   * Ejecuta una herramienta por nombre. Un nombre desconocido no lanza: se
   * devuelve como error con la lista de los válidos, que es lo que permite al
   * modelo corregirse sin otra ronda de 30 segundos.
   */
  async function ejecutar(nombre, argumentos = {}) {
    const fn = herramientas[nombre]
    if (!fn) {
      return fallo(`No existe la herramienta "${nombre}".`, { herramientas: Object.keys(herramientas) })
    }

    try {
      return await fn(argumentos)
    } catch (error) {
      // Una excepción aquí es un fallo del puente, no del servidor de planta.
      // Se devuelve como dato para que el modelo lo cuente en vez de quedarse
      // sin respuesta, y queda registrada arriba.
      return fallo(`Fallo interno al ejecutar ${nombre}: ${error?.message ?? error}`)
    }
  }

  return { definiciones: DEFINICIONES, ejecutar, nombres: Object.keys(herramientas) }
}

/* ── Auxiliares ─────────────────────────────────────────────────────── */

/**
 * Redondeo a un decimal que **conserva el hueco**.
 *
 * `Math.round(null)` vale 0 en JavaScript, y ese 0 se leería como una planta
 * parada en vez de como una lectura que no llegó.
 */
const red1 = (v) => (v === null || v === undefined ? null : +Number(v).toFixed(1))

/** Diferencia tolerante a huecos: sin los dos valores no hay diferencia que dar. */
function resta(b, a) {
  return b === null || b === undefined || a === null || a === undefined
    ? null
    : +(b - a).toFixed(1)
}

/** Los campos del resumen, con nombres que el modelo pueda citar tal cual. */
function formatearResumen(r) {
  return {
    oee: r.oee,
    disponibilidad: r.disponibilidad,
    rendimiento: r.rendimiento,
    calidad: r.calidad,
    aprobadas: r.aprobadas,
    rechazadas: r.rechazadas,
    producidas: r.producidas,
    tMuertoSegundos: r.tMuerto,
    horasConMuestra: r.muestras,
    unidades: { oee: '%', disponibilidad: '%', rendimiento: '%', calidad: '%', piezas: 'unidades' },
  }
}

/** Días de la semana en la forma en que los escribe una persona. */
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

/** Date → "YYYY-MM-DD" desplazando `dias` desde hoy. */
function desdeHoy(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

/**
 * Resuelve la fecha que manda el modelo, en ISO o en lenguaje llano.
 *
 * ── POR QUÉ ESTO VIVE AQUÍ Y NO EN EL PROMPT ───────────────────────
 *
 * Es la misma regla que ya siguen los nombres de máquina: **resolver es
 * trabajo del backend; elegir es trabajo del modelo.** Pedirle a un 4B que
 * calcule qué día fue «anteayer» es pedirle aritmética de calendario, que es
 * justo lo que peor hace y lo que aquí no se puede fallar en silencio: una
 * fecha mal calculada devuelve datos reales del día equivocado, y eso no se
 * distingue de la respuesta correcta.
 *
 * La conversación del Plan 7 lo vuelve imprescindible: en cuanto se puede
 * preguntar «¿y ayer?», esto deja de ser una comodidad.
 *
 * @returns {{ iso: string } | { error: string }}
 */
export function resolverFecha(fecha) {
  const crudo = String(fecha ?? '').trim()
  const texto = normalizar(crudo)

  let iso = null

  if (FECHA_RE.test(crudo)) iso = crudo
  else if (texto === 'hoy') iso = desdeHoy(0)
  else if (texto === 'ayer') iso = desdeHoy(-1)
  else if (texto === 'anteayer' || texto === 'antier') iso = desdeHoy(-2)
  else {
    // «martes» es el martes más reciente, hoy incluido; «martes pasado» es el
    // anterior a hoy. Es como se usan las dos formas al hablar.
    const pasado = /\bpasad[oa]\b/.test(texto)
    const dia = DIAS_SEMANA.indexOf(texto.replace(/\b(el|la|pasad[oa])\b/g, '').trim())

    if (dia >= 0) {
      const hoy = new Date().getDay()
      let atras = (hoy - dia + 7) % 7
      if (pasado && atras === 0) atras = 7
      iso = desdeHoy(-atras)
    }
  }

  if (!iso) {
    return {
      error: `No entiendo la fecha "${crudo}". Escríbela como YYYY-MM-DD ` +
        `(por ejemplo 2025-03-25) o di "hoy", "ayer", "anteayer" o un día de la semana.`,
    }
  }

  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return { error: `La fecha "${crudo}" no existe en el calendario.` }

  // El futuro se rechaza a propósito: `Interpolative` rellenaría el día entero
  // repitiendo el último valor conocido y devolvería un resumen con pinta de
  // real para un día que no ha ocurrido.
  if (iso > isoLocal(new Date())) {
    return { error: `La fecha ${iso} está en el futuro; no hay datos todavía.` }
  }

  return { iso }
}

/**
 * Esquema que se le manda a llama-server en cada petición.
 *
 * Las descripciones son parte del programa: es lo único que el modelo lee
 * para decidir. Dicen explícitamente que solo algunas máquinas tienen
 * historia, porque el fallo más caro es que pregunte por una que no la tiene
 * y luego presente el error como si fuera un dato.
 */
export const DEFINICIONES = [
  {
    type: 'function',
    function: {
      name: 'listar_maquinas',
      description:
        'Lista las 10 máquinas de la planta con su identificador, su nombre visible y si tienen ' +
        'datos históricos disponibles. Úsala cuando no sepas el nombre exacto de una máquina o ' +
        'cuando el usuario pregunte qué máquinas hay.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_de_planta',
      description:
        'Estado de TODA la planta ahora mismo, de una sola vez: el OEE de planta y sus tres ' +
        'factores, la producción y los rechazos totales, cuántas máquinas están operando, el ' +
        'resumen por área y el ranking de las 10 máquinas ordenadas por OEE. Úsala para ' +
        '"¿cómo va la planta?", "¿qué máquina va mejor o peor?", "¿cuántas están paradas?" o ' +
        'cualquier pregunta que abarque más de una máquina. NO la llames varias veces: lo ' +
        'devuelve todo junto.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_actual',
      description:
        'Lee el estado en tiempo real de una máquina: si está operando, su OEE actual y los tres ' +
        'factores, las piezas aprobadas y rechazadas del turno, y el modelo cargado. Funciona en ' +
        'las 10 máquinas. Úsala para preguntas sobre "ahora", "en este momento" o "hoy".',
      parameters: {
        type: 'object',
        properties: {
          maquina: {
            type: 'string',
            description: 'Identificador o nombre: "LIN/1", "Línea 1", "Lineal 1", "REC/13", "Multi 13".',
          },
        },
        required: ['maquina'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'oee_de_maquina',
      description:
        'Devuelve el OEE de una máquina en un día concreto del pasado, con sus tres factores y las ' +
        'piezas producidas, leídos del historiador. IMPORTANTE: solo algunas máquinas tienen datos ' +
        'históricos; consulta listar_maquinas si no estás seguro. Si la máquina no tiene historia, ' +
        'la herramienta lo dirá y debes comunicarlo tal cual, sin inventar cifras.',
      parameters: {
        type: 'object',
        properties: {
          maquina: {
            type: 'string',
            description: 'Identificador o nombre: "LIN/1", "Línea 1", "REC/13", "Multi 13".',
          },
          fecha: {
            type: 'string',
            description:
              'Día a consultar. Puedes escribirlo como YYYY-MM-DD ("2025-03-25") o en lenguaje ' +
              'llano: "hoy", "ayer", "anteayer", "martes" o "martes pasado". NO calcules tú la ' +
              'fecha de una expresión relativa; pásala tal cual y el servidor la resuelve.',
          },
        },
        required: ['maquina', 'fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comparar_dias',
      description:
        'Compara el rendimiento de una máquina entre dos días del pasado y devuelve los dos ' +
        'resúmenes junto con la diferencia. Úsala para preguntas del tipo "cómo cambió", ' +
        '"fue mejor o peor que" o "compara".',
      parameters: {
        type: 'object',
        properties: {
          maquina: { type: 'string', description: 'Identificador o nombre de la máquina.' },
          fechaA: { type: 'string', description: 'Primer día. Es la referencia. Admite "ayer" o YYYY-MM-DD.' },
          fechaB: { type: 'string', description: 'Segundo día, se compara contra el primero. Admite "hoy" o YYYY-MM-DD.' },
        },
        required: ['maquina', 'fechaA', 'fechaB'],
      },
    },
  },
]
