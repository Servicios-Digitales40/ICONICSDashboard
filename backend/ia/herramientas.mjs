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
  filasEnVentana,
  incrementoEnVentana,
  isoLocal,
  rangoDelDia,
  recortarAlPresente,
  totalDelDia,
  unir,
} from '../../shared/historia.js'
import {
  TIPOS,
  diasDelRango,
  resolverDia,
  resolverPeriodo,
} from '../../shared/periodo.js'

/**
 * Días que se piden a la vez en un rango.
 *
 * Tres, como el calendario del tablero. En serie, un mes serían 31 idas y
 * vueltas; de golpe, 31 peticiones simultáneas al servidor de planta.
 */
const CONCURRENCIA_RANGO = 3

/** Métricas que el historiador guarda y que se pueden barrer en un rango. */
const METRICAS_HISTORICAS = TAGS_DIA

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

export function createHerramientas({
  client,
  maquinasConHistoria = CON_HISTORIA_POR_DEFECTO,
  /**
   * Horario de turnos, `{ manana: [6,14], … }`. **Vacío por defecto.**
   *
   * Sin el horario real de esta planta, un turno inventado devolvería datos
   * verdaderos de las horas equivocadas — y eso no se distingue de la
   * respuesta correcta. Con el mapa vacío, preguntar por un turno responde
   * que no está configurado y ofrece preguntar por una hora concreta.
   */
  turnos = {},
} = {}) {
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
      // Las muestras crudas, para poder recortar a una ventana. Un tramo de
      // horas no reduce los contadores igual que el día entero: ver
      // `incrementoEnVentana` en shared/historia.js.
      porTag,
    }
  }

  /** El fallo de lectura histórica, con el motivo exacto. */
  function falloDeHistoria(meta, dia) {
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

  /**
   * Un período que cabe en un día: el día entero, una hora suelta o un turno.
   *
   * Se lee el día completo —siete tags, 24 puntos cada uno— y se recorta. No
   * merece la pena pedirle al historiador solo unas horas: la petición cuesta
   * lo mismo y así una segunda pregunta sobre otro tramo del mismo día no
   * vuelve a salir a la red.
   */
  async function resumenDeUnDia(meta, periodo) {
    const dia = await leerDia(meta, periodo.diaDesde)
    if (!dia.ok) return falloDeHistoria(meta, dia)

    const completo = periodo.horaDesde === 0 && periodo.horaHasta >= 24
    const serie = completo
      ? dia.serie
      : filasEnVentana(dia.serie, periodo.horaDesde, periodo.horaHasta)

    // Dentro de una ventana los contadores se reducen distinto: no es el
    // total del día recortado, es cuánto SUBIERON en ese tramo.
    const cierre = completo
      ? dia.cierre
      : Object.fromEntries(TAGS_CIERRE.map(tag => [
        tag, incrementoEnVentana(dia.porTag[tag] ?? [], periodo.horaDesde, periodo.horaHasta),
      ]))

    const resumen = daySummary(serie, cierre)
    if (!resumen) {
      return fallo(
        `No hay ninguna muestra de ${meta.equipo} (${meta.id}) en ${periodo.etiqueta}. ` +
          `El historiador no guarda ese tramo, o la máquina no estuvo en marcha.`
      )
    }

    return {
      ok: true,
      maquina: meta.id,
      nombre: meta.equipo,
      periodo: periodo.etiqueta,
      fecha: periodo.diaDesde,
      ...(completo ? {} : { horas: `${periodo.horaDesde}:00 a ${periodo.horaHasta}:00` }),
      fuente: 'historiador',
      ...formatearResumen(resumen),
      ...avisoDeImposibles({
        oee: resumen.oee,
        disponibilidad: resumen.disponibilidad,
        rendimiento: resumen.rendimiento,
        calidad: resumen.calidad,
      }),
      ...(dia.parcial ? { avisoParcial: 'Algunos tags no respondieron; el resumen es parcial.' } : {}),
    }
  }

  /**
   * Un período de varios días, para UNA métrica.
   *
   * Solo una métrica a propósito: el historiador rechaza los rangos
   * multi-día, así que hay que ir día a día. Un mes de una métrica son 31
   * peticiones; de las siete serían 217, y eso ya no es una consulta, es un
   * ataque al servidor de planta.
   *
   * Los extremos y el promedio se calculan AQUÍ. Devolver los 31 días crudos
   * y pedirle al modelo que encuentre el mayor es pedirle aritmética, que es
   * justo lo que se le ha quitado en todo lo demás.
   */
  async function resumenDeRango(meta, periodo, metrica) {
    const dias = diasDelRango(periodo.diaDesde, periodo.diaHasta)
    const esContador = TAGS_CIERRE.includes(metrica)
    const punto = historyPointName(meta.areaId, meta.machineId, metrica)

    const porDia = []
    let incomunicado = true
    let alguna = false

    // De tres en tres, como hace el calendario del tablero: en serie serían
    // 31 idas y vueltas, y de golpe se satura el historiador.
    for (let i = 0; i < dias.length; i += CONCURRENCIA_RANGO) {
      const lote = await Promise.all(
        dias.slice(i, i + CONCURRENCIA_RANGO).map(async iso => {
          const rango = rangoDelDia(iso)
          const r = await client.readHistory({
            pointName: punto,
            startDate: rango.startDate,
            endDate: rango.endDate,
            aggregate: AGREGADO.serie,
            interval: INTERVALO.hora,
          })

          if (!r?.ok) return { iso, valor: null, status: r?.status ?? 0 }

          const muestras = Array.isArray(r.data) ? r.data : []
          const finitos = muestras.map(m => m.value).filter(v => Number.isFinite(v))
          if (!finitos.length) return { iso, valor: null, status: 200 }

          // Los factores son porcentajes instantáneos: su resumen del día es
          // la media. Los contadores se acumulan: es el total. Mismo criterio
          // que `daySummary`, para que las cifras cuadren entre herramientas.
          const valor = esContador
            ? totalDelDia(muestras)
            : finitos.reduce((a, b) => a + b, 0) / finitos.length

          return { iso, valor, status: 200 }
        })
      )

      for (const d of lote) {
        if (d.status < 502) incomunicado = false
        if (d.valor !== null) alguna = true
        porDia.push({ fecha: d.iso, valor: red1(d.valor) })
      }
    }

    if (!alguna) {
      return incomunicado
        ? falloDeHistoria(meta, { incomunicado: true })
        : fallo(
          `No hay datos de ${metrica} de ${meta.equipo} (${meta.id}) en ${periodo.etiqueta}. ` +
            `El historiador no guarda ese período, o la máquina no tiene esos tags coleccionados.`,
          { maquinasConHistoria: [...conHistoria] }
        )
    }

    const conDato = porDia.filter(d => d.valor !== null)
    const ordenados = [...conDato].sort((a, b) => b.valor - a.valor)
    const suma = conDato.reduce((a, d) => a + d.valor, 0)

    return {
      ok: true,
      maquina: meta.id,
      nombre: meta.equipo,
      periodo: periodo.etiqueta,
      metrica,
      fuente: 'historiador',
      maximo: ordenados[0],
      minimo: ordenados.at(-1),
      promedio: red1(suma / conDato.length),
      // Un máximo es justo donde asoman los valores imposibles que la media
      // disimula, así que se comprueba sobre él.
      ...(esContador ? {} : avisoDeImposibles({ [metrica]: ordenados[0]?.valor })),
      ...(esContador ? { total: red1(suma) } : {}),
      diasConDato: conDato.length,
      diasSinDato: porDia.length - conDato.length,
      porDia,
      unidad: TAGS_CIERRE.includes(metrica)
        ? (metrica === 'tMuerto' ? 'segundos' : 'piezas')
        : '%',
    }
  }

  /** Cualquier período: el tipo decide cómo se lee. */
  function resumenDePeriodo(meta, periodo, metrica) {
    return periodo.tipo === TIPOS.RANGO
      ? resumenDeRango(meta, periodo, metrica)
      : resumenDeUnDia(meta, periodo)
  }

  /* ── Las cuatro herramientas ───────────────────────────────────────── */

  /**
   * El catálogo de máquinas. **No es una herramienta.**
   *
   * Lo fue, y era un error caro: el catálogo entero —con qué máquina tiene
   * historia— ya viaja en las instrucciones del sistema, así que llamarlo no
   * le daba al modelo ni un dato nuevo. Pero el bucle permite UNA llamada por
   * pregunta, y ante «¿qué días de julio pasaron del 100 %?» —sin máquina
   * nombrada— el modelo la gastaba aquí, se quedaba sin poder consultar el
   * historiador, y acababa recitando la lista de máquinas como respuesta.
   *
   * Quitarla del registro arregla eso y además le deja una decisión menos que
   * tomar, que es donde un 4B es más frágil.
   */
  function catalogo() {
    return listMachines().map(m => ({
      id: m.id,
      nombre: m.equipo,
      area: AREAS[m.areaId].label,
      tieneHistoria: conHistoria.has(m.id),
    }))
  }

  /** Las máquinas que sí se pueden consultar en histórico. */
  const conHistoriaReal = () => catalogo().filter(m => m.tieneHistoria).map(m => m.id)

  /**
   * Qué máquina se consulta cuando la pregunta no la nombra.
   *
   * Si solo hay UNA con historia, no hay ambigüedad que resolver: es esa o
   * ninguna, y contestar por ella —diciéndolo— es más útil que devolver un
   * error. Con dos o más sí hay que preguntar, y entonces se devuelve el
   * error con la lista. Se arregla solo el día que historicen más máquinas.
   */
  function maquinaImplicita() {
    const conDatos = conHistoriaReal()
    return conDatos.length === 1 ? conDatos[0] : null
  }

  /** Resuelve la máquina pedida, o la implícita si no se nombró ninguna. */
  function elegirMaquina(maquina) {
    if (maquina) {
      const id = resolverMaquina(maquina)
      return id
        ? { id }
        : { error: fallo(`No existe ninguna máquina llamada "${maquina}".`, { maquinas: catalogoBreve() }) }
    }

    const implicita = maquinaImplicita()
    if (implicita) return { id: implicita }

    return {
      error: fallo(
        'No me has dicho de qué máquina, y hay varias con datos históricos.',
        { maquinasConHistoria: conHistoriaReal() }
      ),
    }
  }

  const herramientas = {
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

    /**
     * Cualquier dato histórico de una máquina, en cualquier período.
     *
     * Una sola herramienta y no cinco porque la pregunta es siempre la misma
     * —«qué pasó en tal máquina en tal momento»— y lo único que cambia es la
     * granularidad. Quien decide cómo leerlo es `resolverPeriodo`, con código
     * determinista, no el modelo.
     */
    async datos_de_maquina({ maquina, periodo, metrica } = {}) {
      const elegida = elegirMaquina(maquina)
      if (elegida.error) return elegida.error
      const { id } = elegida

      const p = resolverPeriodo(periodo, { turnos })
      if (p.error) return fallo(p.error)

      // La métrica solo manda en los rangos: en un día o una ventana se
      // devuelven todas, que cuestan lo mismo.
      const cual = metrica ?? 'oee'
      if (p.tipo === TIPOS.RANGO && !METRICAS_HISTORICAS.includes(cual)) {
        return fallo(
          `No conozco la métrica "${cual}".`,
          { metricas: METRICAS_HISTORICAS }
        )
      }

      return resumenDePeriodo(porId.get(id), p, cual)
    },

    /**
     * Dos períodos de la misma máquina, con su diferencia.
     *
     * Sirve para dos días, dos horas o dos turnos: el resolvedor no distingue,
     * así que «compara la mañana con la tarde del 20 de julio» y «compara el
     * lunes con el martes» son la misma llamada.
     */
    async comparar_periodos({ maquina, periodoA, periodoB, metrica } = {}) {
      const elegida = elegirMaquina(maquina)
      if (elegida.error) return elegida.error
      const { id } = elegida

      const pa = resolverPeriodo(periodoA, { turnos })
      if (pa.error) return fallo(pa.error)
      const pb = resolverPeriodo(periodoB, { turnos })
      if (pb.error) return fallo(pb.error)

      const cual = metrica ?? 'oee'
      const meta = porId.get(id)
      const [a, b] = await Promise.all([
        resumenDePeriodo(meta, pa, cual),
        resumenDePeriodo(meta, pb, cual),
      ])

      if (!a.ok) return a
      if (!b.ok) return b

      // Comparar un día contra un rango mezclaría un valor con un promedio.
      const campos = pa.tipo === TIPOS.RANGO || pb.tipo === TIPOS.RANGO
        ? ['promedio']
        : ['oee', 'disponibilidad', 'rendimiento', 'calidad', 'aprobadas', 'rechazadas', 'tMuertoSegundos']

      return {
        ok: true,
        maquina: meta.id,
        nombre: meta.equipo,
        fuente: 'historiador',
        // Las claves son las etiquetas YA resueltas, para que el modelo
        // redacte con el período real y no con el «ayer» que escribió él.
        [pa.etiqueta]: a,
        [pb.etiqueta]: b,
        diferencia: Object.fromEntries(campos.map(c => [c, resta(b[c], a[c])])),
      // El aviso de valores imposibles vive dentro de cada período; si se
      // queda ahí anidado, comparar dos días con OEE por encima de 100 los
      // presenta como si compitieran de verdad. Se sube al primer nivel.
      ...(a.aviso || b.aviso ? { aviso: a.aviso ?? b.aviso } : {}),
        nota: `La diferencia es «${pb.etiqueta}» menos «${pa.etiqueta}». ` +
          `Un valor negativo significa que el segundo fue peor.`,
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

  return { definiciones: DEFINICIONES, ejecutar, nombres: Object.keys(herramientas), catalogo }
}

/* ── Auxiliares ─────────────────────────────────────────────────────── */

/**
 * Avisa de porcentajes que no pueden serlo.
 *
 * ── POR QUÉ HACE FALTA ─────────────────────────────────────────────
 *
 * El servidor entrega OEE por encima del 100 %. Está documentado en
 * docs/TAGS.md: calcula `OEE_Cal = Pz_OK / Prod_Real_Total` sin acotarlo por
 * arriba, y cuando los contadores se desfasan al cambiar de turno la calidad
 * pasa de 100 y el OEE la sigue. Medido en LIN/1 el 2026-07-24: 15 de 24
 * muestras horarias por encima de 100, con un máximo de 160,4 %.
 *
 * La media diaria lo disimulaba. **Un máximo no**: preguntar por el mejor día
 * de un mes es preguntar justo por el peor dato. Y un 107,9 % presentado sin
 * comentario invita a creerlo.
 *
 * No se recorta ni se descarta a propósito. Recortar a 100 escondería un
 * problema real del servidor, y descartarlo dejaría el día sin dato sin decir
 * por qué. Se entrega con el aviso, para que el asistente lo cuente.
 */
function avisoDeImposibles(valores) {
  const malos = Object.entries(valores)
    .filter(([, v]) => typeof v === 'number' && v > 100)
    .map(([k]) => k)

  if (!malos.length) return {}

  // Redactado como HECHO y no como orden al modelo. Escrito en imperativo
  // («dilo al dar la cifra»), el 4B lo copiaba literal en su respuesta y el
  // operador leía las instrucciones internas del sistema. Lo que el modelo
  // debe hacer con esto ya se lo dice la regla 2 del prompt.
  return {
    aviso:
      `El servidor devuelve un valor superior al 100 % en: ${malos.join(', ')}, ` +
      'lo cual no es una medición válida. Es un fallo conocido del cálculo de OEE_Cal en ' +
      'ICONICS, que no acota ese porcentaje por arriba.',
  }
}

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

  // La resolución vive en `shared/periodo.js`, que la comparte con el
  // resolvedor de períodos completo. Aquí solo queda la comprobación de que
  // el día no esté en el futuro.
  const iso = resolverDia(crudo)

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
      name: 'datos_de_maquina',
      description:
        'Datos históricos de una máquina en CUALQUIER período: un día entero, una hora concreta, ' +
        'un turno, un mes o un rango de días. Devuelve el OEE y sus tres factores, las piezas ' +
        'aprobadas y rechazadas y el tiempo muerto. Si el período abarca varios días, devuelve ' +
        'además el MÁXIMO, el mínimo y el promedio de la métrica pedida, cada uno con su fecha. ' +
        'IMPORTANTE: solo algunas máquinas tienen datos históricos; la lista con esa marca ya ' +
        'la tienes en tus instrucciones. Si no hay datos, la herramienta lo dirá y debes ' +
        'comunicarlo tal cual.',
      parameters: {
        type: 'object',
        properties: {
          maquina: {
            type: 'string',
            description: 'Identificador o nombre: "LIN/1", "Línea 1", "REC/13", "Multi 13".',
          },
          periodo: {
            type: 'string',
            description:
              'El período, en lenguaje llano. Ejemplos válidos: "2026-07-20", "ayer", "martes", ' +
              '"ayer a las 12", "2026-07-20 14:00", "turno de la mañana del 2026-07-20", ' +
              '"julio 2026", "últimos 7 días", "esta semana", "el mes pasado". ' +
              'NO lo conviertas tú a fechas: pásalo tal cual y el servidor lo resuelve.',
          },
          metrica: {
            type: 'string',
            description:
              'Solo hace falta cuando el período abarca VARIOS días, para saber de qué métrica ' +
              'quieres el máximo o el promedio. Una de: oee, disponibilidad, rendimiento, ' +
              'calidad, aprobadas, rechazadas, tMuerto. Por defecto oee.',
          },
        },
        required: ['maquina', 'periodo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comparar_periodos',
      description:
        'Compara dos períodos de la misma máquina y devuelve los dos resúmenes con su diferencia. ' +
        'Sirve para dos días, dos horas o dos turnos: "compara el lunes con el martes", ' +
        '"la mañana contra la tarde del 20 de julio", "cómo cambió respecto a ayer".',
      parameters: {
        type: 'object',
        properties: {
          maquina: { type: 'string', description: 'Identificador o nombre de la máquina.' },
          periodoA: {
            type: 'string',
            description: 'Primer período. Es la referencia. Mismas formas que en datos_de_maquina.',
          },
          periodoB: {
            type: 'string',
            description: 'Segundo período, se compara contra el primero.',
          },
          metrica: {
            type: 'string',
            description: 'Solo si los períodos abarcan varios días. Por defecto oee.',
          },
        },
        required: ['maquina', 'periodoA', 'periodoB'],
      },
    },
  },
]
