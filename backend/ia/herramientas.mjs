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
  historyPointName,
  listMachines,
  pointName,
  tagsForArea,
} from '../../shared/tagCatalog.js'
import { createMachine } from '../../shared/domain/machine.js'
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
   * Lee todos los tags de una máquina en una sola llamada en lote y los
   * convierte en una `Machine` de dominio.
   *
   * La calidad se filtra aquí, en la frontera, exactamente igual que hace el
   * motor de sondeo del frontend: un valor de mala calidad llega como 0 y, sin
   * filtrar, el asistente diría «el OEE es 0 %» de una máquina que está
   * produciendo.
   */
  async function leerEnVivo(meta) {
    const tags = tagsForArea(meta.areaId)
    const puntos = tags.map(tag => pointName(meta.areaId, meta.machineId, tag))

    const respuesta = await client.readPoints(puntos)
    if (!respuesta.ok) return { ok: false, error: respuesta.error, status: respuesta.status }

    const mapa = respuesta.payload ?? {}
    const readings = {}

    for (const tag of tags) {
      const entrada = mapa[pointName(meta.areaId, meta.machineId, tag)]
      if (!entrada?.ok) continue

      const p = entrada.payload ?? {}
      const quality = p.quality ?? p.Quality ?? null
      if (!isGoodQuality(quality)) continue

      readings[tag] = p.value ?? p.Value ?? null
    }

    return { ok: true, machine: createMachine({ ...meta, readings, receivedAt: new Date().toISOString() }) }
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
        return { tag, ok: Boolean(r?.ok), muestras: Array.isArray(r?.data) ? r.data : [] }
      })
    )

    const fallaron = resultados.filter(r => !r.ok)
    if (fallaron.length === TAGS_DIA.length) {
      return { ok: false, sinHistoria: true }
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

      const problema = validarFecha(fecha)
      if (problema) return fallo(problema)

      return resumenDelDia(porId.get(id), fecha)
    },

    async comparar_dias({ maquina, fechaA, fechaB } = {}) {
      const id = resolverMaquina(maquina)
      if (!id) {
        return fallo(`No existe ninguna máquina llamada "${maquina}".`, { maquinas: catalogoBreve() })
      }

      for (const f of [fechaA, fechaB]) {
        const problema = validarFecha(f)
        if (problema) return fallo(problema)
      }

      const meta = porId.get(id)
      const [a, b] = await Promise.all([resumenDelDia(meta, fechaA), resumenDelDia(meta, fechaB)])

      if (!a.ok) return a
      if (!b.ok) return b

      return {
        ok: true,
        maquina: meta.id,
        nombre: meta.equipo,
        fuente: 'historiador',
        [fechaA]: a,
        [fechaB]: b,
        diferencia: {
          oee: resta(b.oee, a.oee),
          disponibilidad: resta(b.disponibilidad, a.disponibilidad),
          rendimiento: resta(b.rendimiento, a.rendimiento),
          calidad: resta(b.calidad, a.calidad),
          aprobadas: resta(b.aprobadas, a.aprobadas),
          rechazadas: resta(b.rechazadas, a.rechazadas),
        },
        nota: `La diferencia es ${fechaB} menos ${fechaA}. Un valor negativo significa que empeoró.`,
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

/**
 * Valida una fecha del modelo. Devuelve el motivo o `null` si está bien.
 *
 * El futuro se rechaza a propósito: `Interpolative` rellenaría el día entero
 * repitiendo el último valor conocido y devolvería un resumen con pinta de
 * real para un día que no ha ocurrido.
 */
function validarFecha(fecha) {
  if (!FECHA_RE.test(String(fecha ?? ''))) {
    return `La fecha "${fecha}" no tiene el formato correcto. Debe ser YYYY-MM-DD, por ejemplo 2025-03-25.`
  }

  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return `La fecha "${fecha}" no existe en el calendario.`
  if (fecha > isoLocal(new Date())) return `La fecha ${fecha} está en el futuro; no hay datos todavía.`

  return null
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
            description: 'Día a consultar en formato YYYY-MM-DD, por ejemplo "2025-03-25".',
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
          fechaA: { type: 'string', description: 'Primer día, YYYY-MM-DD. Es la referencia.' },
          fechaB: { type: 'string', description: 'Segundo día, YYYY-MM-DD. Se compara contra el primero.' },
        },
        required: ['maquina', 'fechaA', 'fechaB'],
      },
    },
  },
]
