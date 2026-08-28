/**
 * backend/ia/herramientas/historicos/index.mjs
 * ------------------------------------------------------------------
 * Las nueve herramientas que preguntan al PASADO: la serie de una señal, su
 * valor en un momento, la comparación de dos períodos, el análisis y el perfil,
 * la correlación entre dos señales, el gráfico, el reporte en PDF y el
 * pronóstico de desgaste.
 *
 * ── QUÉ LAS HACE UNA FAMILIA ───────────────────────────────────────
 *
 * Que todas pasan por el historiador, y por eso todas dependen de los mismos
 * tres ayudantes (`lib/historia.mjs`) y de la misma resolución de ventanas.
 * Es la familia más grande del reparto, y también la que más reglas de dominio
 * acumula — casi todas sobre lo que NO se puede afirmar.
 *
 * ── LA REGLA MÁS CARA DEL PROYECTO VIVE AQUÍ ───────────────────────
 *
 * Pedir la serie de una señal que no está historizada **no da error**: el
 * servidor devuelve la curva de OTRA señal, con marcas de tiempo correctas y
 * sin un solo aviso. Tres de las ocho del tanque están así. Por eso ninguna de
 * estas herramientas pregunta al servidor si puede: pregunta al registro
 * (`series.historizadas`), y si la señal no está, se niega.
 *
 * Si esa guarda se rompe, el asistente contesta grados centígrados bajo el
 * nombre «carga del motor», con total aplomo. Lo vigila
 * `scripts/verificar-herramientas.mjs`.
 *
 * ── Y LA SEGUNDA MÁS CARA ──────────────────────────────────────────
 *
 * Que una máquina sin histórico NO hereda estas herramientas: se niegan citando
 * `series.nota` de su entrada del registro. `pronostico_de_desgaste` lleva
 * además una segunda guarda, porque su cuerpo sigue escrito contra el catálogo
 * del tanque — ver el comentario dentro de la función y B4 en
 * `docs/BACKLOG-BACKEND.md`.
 *
 * ── POR QUÉ RECIBE TANTO ───────────────────────────────────────────
 *
 * `turnos` para resolver «el turno de ayer»; `reportes` para saber dónde
 * escribir los PDF y cuándo purgarlos; `client` sólo para `perfil_de_senal`,
 * que necesita el estado en vivo además de la historia. Es la familia con más
 * superficie, y eso es un dato sobre ella, no un accidente del reparto.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  alinearSeries,
  correlacionPearson,
  describirCorrelacion,
  detectarAnomalias,
  estadisticasBasicas,
  proyectar,
  regresionLineal,
} from '../../../../shared/eva/estadistica.js'
import { renderizarGraficoSerie } from '../../../../shared/eva/graficos.js'
import {
  MAX_PUNTOS,
  SIN_SERIE,
  /* La de una MARCA DE TIEMPO del historiador. La `horaLocal` que se importa
     de `herramientas.mjs` es la de una lectura en vivo: son dos, y el alias
     las distingue igual que hacía el archivo original. */
  horaLocal as horaLocalDe,
  normalizar,
  resumirSerie,
} from '../../../../shared/eva/historia.js'
import {
  SENALES,
  SENAL_KEYS,
  esHistorizada,
  historizadas,
  pointName,
  senalInfo,
} from '../../../../shared/eva/senales.js'
import { UMBRALES } from '../../../../shared/eva/umbrales.js'
import { evaluarPronostico } from '../../../../shared/eva/pronostico.js'
import {
  NO_COMPARTEN,
  SISTEMA,
  sistemaDePunto,
  sistemasDeSenal,
  tieneHistoria,
} from '../../../../shared/eva/sistemas.js'
import { resolverInstante } from '../../../../shared/periodo.js'

import { avisoDeUmbrales, bandaLegible, downsamplear } from '../lib/formato.mjs'
import { fallo } from '../lib/respuesta.mjs'
/*
 * Lo que sigue en `herramientas.mjs` es lo que todavía no tiene una familia
 * propia: el índice de nombres de señal del tanque (`resolverSenal`,
 * `senalDesconocida`), el resolvedor de ventanas y las piezas de estadística
 * redactada. Ver B3 en `docs/BACKLOG-BACKEND.md`.
 */
import {
  AVISO_TRUNCADA,
  MAX_DIAS_PERFIL,
  MAX_DIAS_REPORTE,
  MIN_MUESTRAS_PERFIL,
  PUNTOS_GRAFICO_REPORTE,
  calcularTendencia,
  comparacionConLaBanda,
  describirTendencia,
  horaLocal,
  percentil,
  purgarReportesViejos,
  redondear,
  resolverSenal,
  resolverVentana,
  resta,
  segundosDeHora,
  senalDesconocida,
} from '../../herramientas.mjs'

/**
 * Una señal pedida por su nombre → su clave, dentro de la máquina que toque.
 *
 * ── POR QUÉ EXISTE ESTA FUNCIÓN ────────────────────────────────────
 *
 * Porque hay dos catálogos y sólo uno tiene resolvedor con sinónimos. El del
 * tanque acepta «la bomba», «el voltaje» o «cuánta agua»; el de las demás
 * máquinas se resuelve por el registro, con la clave o la etiqueta.
 *
 * Sin `sistema` se resuelve contra el TANQUE, exactamente como antes: ninguna
 * llamada existente cambia. Con `sistema`, contra el catálogo de esa máquina.
 *
 * Es una solución de transición y conviene que se note: lo bueno es un solo
 * índice de nombres, por máquina, con los sinónimos de cada una (B3 del
 * backlog). Mientras eso no exista, esto es lo que permite que el asistente
 * pregunte por la historia de las vibraciones sin inventarse un segundo índice.
 *
 * Devuelve `{ ok: true, clave, meta, sistemaId, historizada, conSerie }` o el
 * `fallo()` que corresponda — con la lista de máquinas si el id no existe.
 */
function resolverSenalDeSistema(senal, sistemaId) {
  const id = sistemaId ? String(sistemaId).trim() : 'tanque'
  const s = SISTEMA[id]
  if (!s) {
    return fallo(`No hay ningún sistema llamado "${sistemaId}" en esta planta.`, {
      sistemas: Object.keys(SISTEMA),
    })
  }

  /* El tanque conserva su índice con sinónimos: es el que sabe que «la bomba»
     es la carga del motor. Para las demás máquinas se busca en el registro. */
  if (id === 'tanque') {
    const clave = resolverSenal(senal)
    if (!clave) return senalDesconocida(senal, { paraHistoria: true })
    return {
      ok: true,
      clave,
      meta: senalInfo(clave),
      sistemaId: id,
      historizada: esHistorizada(clave),
      conSerie: historizadas().map((k) => SENALES[k].label),
    }
  }

  const encontrados = sistemasDeSenal(senal).filter((x) => x.sistema === id)
  if (!encontrados.length) {
    return fallo(
      `«${senal}» no es una señal de «${s.nombre}». Sus señales se llaman como las enseña ` +
        `estado_del_sistema(sistema="${id}").`,
      { sistema: id }
    )
  }
  if (encontrados.length > 1) {
    /* El mismo criterio que en el resto del proyecto: elegir una es como se
       contesta correctamente sobre el punto de medida equivocado. */
    return fallo(
      `«${senal}» no identifica UNA señal de «${s.nombre}»: encaja con ${encontrados.length} ` +
        `(${encontrados.map((x) => s.etiquetaDe(x.clave) ?? x.clave).join('; ')}). Pregunta cuál.`,
      { sistema: id, claves: encontrados.map((x) => x.clave) }
    )
  }

  const { clave } = encontrados[0]
  return {
    ok: true,
    clave,
    /* La forma que espera el cuerpo de la herramienta: rótulo y unidad. La
       unidad sale del catálogo de la máquina, no del registro. */
    meta: { label: s.etiquetaDe(clave) ?? clave, unidad: '' },
    sistemaId: id,
    historizada: s.esHistorizada(clave),
    conSerie: s.series.historizadas().map((k) => s.etiquetaDe(k) ?? k),
  }
}

/**
 * Las nueve herramientas de historia.
 *
 * `dameHerramientas` es la misma indirección que usa `documentacion/`:
 * `comparar_periodos` y `generar_reporte` llaman a otras herramientas, y en el
 * momento de construir esta familia el catálogo todavía se está construyendo.
 * Se pasa una función para resolverlo en tiempo de ejecución.
 *
 * @param {object} args
 * @param {object} args.client     cliente de ICONICS (para el estado en vivo)
 * @param {object} args.turnos     configuración de turnos, para «el turno de ayer»
 * @param {object} args.reportes   carpeta y purga de los PDF
 * @param {object} args.historia   ayudantes de `lib/historia.mjs`
 * @param {object} args.maquina    ayudantes de `lib/maquina.mjs`
 * @param {string[]} args.senalesPronostico  claves con serie propia verificada
 */
export function crearHerramientasDeHistoricos({
  client, turnos, reportes, historia, maquina, senalesPronostico, dameHerramientas,
}) {
  const { leerSerie, leerSerieEnRango, leerHistoriaLarga } = historia
  const { leerMaquina, resolverSistema } = maquina
  const SENALES_PRONOSTICO = senalesPronostico

  return {
    /**
     * ── DESGASTE ACUMULADO, CON SUS CUATRO LÍMITES DECLARADOS ──────────
     *
     * Cuenta horas de exposición sobre el histórico del tanque. Los límites de
     * lo que puede afirmar van EN LA RESPUESTA y no sólo en el código, porque
     * es el modelo quien va a redactar la frase final y el error caro es que
     * convierta «horas estimadas de exposición» en «le quedan dos años».
     */
    async pronostico_de_desgaste({ sistema = 'tanque', dias = 30 } = {}) {
      /*
       * ── LA GUARDA DEL PUNTO 3 DEL ALTA ─────────────────────────────
       *
       * Un pronóstico es exposición ACUMULADA, así que necesita dos cosas que
       * no toda máquina tiene: histórico del que contar horas, y mecanismos de
       * desgaste declarados que digan a qué avería lleva cada condición.
       *
       * Vibraciones no tiene ninguna de las dos, y su entrada del registro lo
       * declara (`series.historizadas()` vacío, `desgaste: null`). Sin esta
       * guarda, pedir su pronóstico habría resuelto las señales contra el
       * catálogo del tanque y contestado sobre el agua — correctamente, y
       * sobre la máquina equivocada.
       *
       * `sistema` sí tiene defecto aquí, al contrario que en las otras: esta
       * herramienta sólo la puede servir una máquina hoy, y exigir el argumento
       * para una única respuesta posible sería ceremonia.
       */
      const elegido = resolverSistema(sistema)
      if (!elegido.ok) return elegido

      /*
       * El orden de las dos guardas importa, y es éste a propósito.
       *
       * Primero se contesta por CAPACIDAD —«esta máquina no tiene histórico ni
       * mecanismos»—, que es la razón de dominio y la que le sirve a quien
       * pregunta. La de abajo es una limitación NUESTRA, del código sin
       * parametrizar, y sólo se alcanza cuando la máquina sí podría tener
       * pronóstico. Al revés, una máquina sin histórico recibiría una excusa
       * de implementación en vez de la verdad sobre sus datos.
       */
      if (!elegido.sistema.desgaste || !tieneHistoria(elegido.sistema.id)) {
        return fallo(
          `«${elegido.sistema.nombre}» no tiene pronóstico de desgaste. ${elegido.sistema.series.nota} ` +
            'Sin histórico no hay exposición acumulada que contar, y sin mecanismos declarados no ' +
            'se sabe a qué avería llevaría. Puedes dar su estado de AHORA con ' +
            `estado_del_sistema(sistema="${elegido.sistema.id}"), pero no afirmes ninguna tendencia.`,
          { sistema: elegido.sistema.id, con_historia: tieneHistoria(elegido.sistema.id) }
        )
      }

      /*
       * ── Y EL CUERPO DE ABAJO ES DEL TANQUE, LITERALMENTE ───────────
       *
       * `SENALES_PRONOSTICO` son claves del tanque; `esHistorizada` y
       * `leerSerieEnRango` vienen de `senales.js` e `historia.js`, que son su
       * catálogo y su historiador. Nada de eso mira `elegido`.
       *
       * Hoy no se nota porque la guarda de arriba sólo deja pasar al tanque:
       * es la única máquina con `desgaste` e histórico. Pero esa guarda mide
       * CAPACIDAD, no parametrización, y el día que la máquina #3 declare sus
       * mecanismos y sus series la pasaría legítimamente — y entraría aquí a
       * leer las señales del agua. Cifras reales, unidades reales, y un
       * pronóstico sobre la instalación equivocada.
       *
       * Esta segunda guarda es la que dice la verdad: mientras el cuerpo no
       * esté parametrizado, esta herramienta sirve al tanque y a nadie más.
       * No se borra al generalizarlo; se cae sola cuando `SENALES_PRONOSTICO`
       * salga del registro, porque entonces dejará de haber un `id` que citar.
       */
      if (elegido.sistema.id !== 'tanque') {
        return fallo(
          `El pronóstico de desgaste todavía está escrito contra el catálogo del tanque, así que ` +
            `NO puede servir a «${elegido.sistema.nombre}» aunque declare histórico. Contestar ` +
            'con estas señales sería hablar de otra máquina. Da su estado de AHORA con ' +
            `estado_del_sistema(sistema="${elegido.sistema.id}").`,
          { sistema: elegido.sistema.id, motivo: 'herramienta no parametrizada' }
        )
      }

      const d = Math.max(1, Math.min(90, Number(dias) || 30))
      const fin = new Date()
      const inicio = new Date(fin.getTime() - d * 86400000)

      const claves = SENALES_PRONOSTICO.filter((k) => esHistorizada(k))
      const series = {}
      for (const k of claves) {
        const r = await leerSerieEnRango(k, { inicio, fin })
        series[k] = r?.muestras ?? []
      }

      /* Las series llegan por separado y el motor necesita filas: se alinean
         por marca de tiempo, y una fila con un hueco se queda con el hueco en
         vez de rellenarse — un valor inventado ahí contaría horas falsas. */
      const marcas = new Set()
      for (const k of claves) for (const m of series[k]) marcas.add(m.timestamp)
      const filas = [...marcas].sort().map((t) => {
        const fila = {}
        for (const k of claves) {
          const m = series[k].find((x) => x.timestamp === t)
          fila[k] = m && Number.isFinite(m.value) ? m.value : null
        }
        return fila
      })

      const r = evaluarPronostico(filas, d * 24)

      return {
        ok: true,
        sistema: 'Tanque y grupo de bombeo',
        ventana_dias: d,
        muestras: r.muestras,
        mecanismos: r.activos.map((x) => ({
          titulo: x.titulo,
          componente: x.componente,
          horas_estimadas: x.horasEstimadas,
          fraccion_del_tiempo: x.fraccion,
          por_que_degrada: x.mecanismo,
          a_donde_lleva: x.consecuencia,
          que_revisar: x.accion,
          norma: x.norma ?? undefined,
        })),
        sin_exposicion: r.sinExposicion?.map((x) => x.titulo) ?? [],
        sin_comprobar: r.noEvaluables?.map((x) => ({ titulo: x.titulo, por_que: x.porque })) ?? [],
        aviso:
          'Las horas son ESTIMADAS a partir de la fracción de muestras que cumplían la condición, ' +
          'no contadas reloj en mano. El historiador promedia, así que los episodios más cortos ' +
          'que el intervalo no aparecen. NO estimes cuántos meses o años tardará en averiarse ' +
          'nada: estas horas dicen cuánta exposición se ha acumulado, no cuánta vida queda.',
      }
    },

    /**
     * Todo el sistema de una vez.
     *
     * ── POR QUÉ DEVUELVE LAS OCHO Y NO ADMITE FILTRO ───────────────────
     *
     * Porque son ocho. El catálogo entero cabe en una respuesta que cuesta una
     * sola lectura en lote, y el modelo tiene **una consulta por pregunta**
     * (ver `chat.mjs`): una herramienta que devolviera sólo la señal pedida
     * obligaría a elegir bien a la primera, y «¿va todo bien?» no nombra
     * ninguna señal. Devolverlo todo hace que la pregunta vaga y la concreta
     * se respondan con la misma llamada.
     */

    /**
     * La tendencia de UNA señal en un período.
     *
     * Una señal y no varias: el historiador se pide punto a punto, y cuatro
     * señales serían cuatro idas y vueltas para una pregunta que casi siempre
     * es sobre una sola magnitud. Si hicieran falta dos, la segunda pregunta
     * las trae — y el modelo tiene una consulta por turno de todos modos.
     */
    async historia_de_senal({ senal, periodo, sistema } = {}) {
      /*
       * ── DOS CAMINOS, PORQUE HAY DOS CATÁLOGOS ──────────────────────
       *
       * El del tanque tiene índice de nombres con sinónimos («la bomba», «el
       * voltaje»); el de las demás máquinas se resuelve por el registro. Son
       * dos resolvedores distintos y unificarlos es B3 del backlog.
       *
       * Mientras tanto, `sistema` elige cuál se usa. Sin argumento se sigue
       * resolviendo contra el tanque, que es lo que hacía siempre: ninguna
       * llamada existente cambia de comportamiento.
       */
      const resuelto = resolverSenalDeSistema(senal, sistema)
      if (!resuelto.ok) return resuelto

      const { clave, meta, sistemaId, historizada, conSerie } = resuelto

      /*
       * La guarda, ANTES de la red. Ver la cabecera del archivo.
       *
       * El error nombra las que sí tienen serie y explica el motivo real
       * —el tag no está coleccionado— para que el modelo pueda ofrecer el valor
       * en vivo en su lugar en vez de quedarse en «no puedo».
       */
      if (!historizada) {
        return fallo(
          `${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE} ` +
            `Pedírsela devolvería la curva de otra señal —la temperatura del tanque— sin avisar, ` +
            `así que no se pide. Sí se puede dar su valor actual con estado_del_sistema.`,
          {
            senalesConHistoria: conSerie,
            senalPedida: meta.label,
          }
        )
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const serie = await leerSerie(clave, v, sistemaId)
      if (!serie.ok) {
        // 502 y 504 los pone el puente: significan que no se llegó al servidor.
        // Decir entonces «no hay datos» manda a revisar el Data Historian
        // cuando lo que hay que hacer es levantar los servicios.
        if (serie.status >= 502) {
          return fallo(
            'No se pudo contactar con el servidor ICONICS para leer el historiador. No es que ' +
              'falten datos: el servidor no está respondiendo. Si acaban de arrancarse los ' +
              'servicios GENESIS, tardan 3-4 minutos en atender.'
          )
        }
        return fallo(
          `El historiador no devolvió la serie de ${meta.label} en ${v.etiqueta}: ` +
            `${serie.error ?? 'error del servidor'}.`
        )
      }

      const resumen = resumirSerie(serie.datos, meta.decimales, serie.ventana)
      if (!resumen) {
        return fallo(
          `No hay ninguna muestra de ${meta.label} en ${v.etiqueta}. El historiador no guarda ` +
            `ese tramo, o todas las muestras vinieron con mala calidad.`
        )
      }

      return {
        ok: true,
        senal: meta.label,
        tag: meta.tag,
        periodo: v.etiqueta,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        ...resumen,
        ...(serie.truncada ? { avisoTruncada: AVISO_TRUNCADA } : {}),
        ...(UMBRALES[clave] ? { banda: bandaLegible(UMBRALES[clave]) } : {}),
        ...(meta.nota ? { nota: meta.nota } : {}),
        ...(meta.soloEnMarcha
          ? {
            avisoReposo:
                'Esta señal sólo significa algo con la instalación impulsando. La instalación está ' +
                'parada la mayor parte del tiempo, así que un promedio bajo o un mínimo de cero ' +
                'reflejan las horas en reposo y no un problema.',
          }
          : {}),
        ...avisoDeUmbrales(),
      }
    },

    /**
     * Cuánto marcaba UNA señal en UN momento concreto.
     *
     * ── POR QUÉ NO VALÍA `historia_de_senal` ───────────────────────────
     *
     * Porque contestan preguntas distintas. Aquélla resume un TRAMO —mínimo,
     * máximo, promedio— y para «¿cuánto marcaba a las 11:16?» eso obliga al
     * modelo a elegir una de las tres cifras, que es justo la interpretación
     * que no queremos que haga. Preguntado eso mismo, el asistente contestaba
     * con el rango del día entero y decía no tener el dato de esa hora.
     *
     * ── POR QUÉ `Interpolative` Y NO `Average` ─────────────────────────
     *
     * `Average` promedia lo que haya DENTRO de la ventana, así que necesita
     * una ventana ancha para no salir vacía —y entonces ya no es el valor de
     * ese momento, sino el de un tramo—. `Interpolative` devuelve el valor
     * vigente EN el instante, que es literalmente la pregunta. Medido contra
     * el servidor real: a las 11:16 del 21-08-2026 el interpolado (6.10 %) y
     * la muestra cruda más cercana —a 20 s— (6.19 %) coinciden dentro del
     * ruido de la señal, porque este historiador guarda del orden de una
     * muestra por segundo.
     *
     * Aun así se devuelve `exacto: false` y la hora real de la muestra: es un
     * valor reconstruido, y el operador tiene derecho a saberlo.
     */
    async valor_en_momento({ senal, momento } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })

      const meta = senalInfo(clave)

      // La misma guarda de catálogo que el resto, y por el mismo motivo: sin
      // ella el servidor devuelve la curva de otra señal sin dar error.
      if (!esHistorizada(clave)) {
        return fallo(
          `${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE} ` +
            `Sí se puede dar su valor actual con estado_del_sistema.`,
          { senalesConHistoria: historizadas().map(k => SENALES[k].label), senalPedida: meta.label }
        )
      }

      const m = resolverInstante(momento)
      if (m.error) return fallo(m.error)

      /*
       * Una ventana de un minuto que EMPIEZA en el instante pedido: con
       * `Interpolative` el servidor rotula el punto al inicio del bucket, así
       * que así el único punto que vuelve es el del momento exacto.
       */
      const r = await client.readHistory({
        pointName: pointName(clave),
        startDate: m.instante.toISOString(),
        endDate: new Date(m.instante.getTime() + 60_000).toISOString(),
        aggregate: 'Interpolative',
        interval: '00:01:00',
      })

      if (!r?.ok) {
        if (r?.status >= 502) {
          return fallo(
            'No se pudo contactar con el servidor ICONICS para leer el historiador. No es que ' +
              'falten datos: el servidor no está respondiendo.'
          )
        }
        return fallo(`El historiador no devolvió el valor de ${meta.label} en ${m.etiqueta}.`)
      }

      const [punto] = normalizar(r.data)
      if (!punto) {
        return fallo(
          `El historiador no tiene ningún valor de ${meta.label} en ${m.etiqueta}. Puede que ese ` +
            `tramo no se guardara o que la muestra viniera con mala calidad.`
        )
      }

      return {
        ok: true,
        senal: meta.label,
        tag: meta.tag,
        momento: m.etiqueta,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        valor: +punto.valor.toFixed(meta.decimales),
        exacto: false,
        marcaDeTiempo: horaLocalDe(punto.t),
        nota:
          'Es el valor vigente en ese instante, reconstruido por el historiador entre las dos ' +
          'muestras que lo rodean. Cítalo como el valor de ese momento; no lo llames mínimo, ' +
          'máximo ni promedio, que son de un tramo y esto es un punto.',
        ...(UMBRALES[clave] ? { banda: bandaLegible(UMBRALES[clave]) } : {}),
        ...(meta.nota ? { nota2: meta.nota } : {}),
        ...avisoDeUmbrales(),
      }
    },

    /**
     * La misma señal en dos períodos, con su diferencia.
     *
     * La diferencia se calcula AQUÍ. Es la misma regla que ya regía con el OEE:
     * pedirle al modelo que reste dos números es pedirle aritmética, y una
     * resta mal hecha en la frase final estropea una consulta que salió bien.
     */
    async comparar_periodos({ senal, periodoA, periodoB } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })

      const [a, b] = await Promise.all([
        dameHerramientas().historia_de_senal({ senal, periodo: periodoA }),
        dameHerramientas().historia_de_senal({ senal, periodo: periodoB }),
      ])

      if (!a.ok) return a
      if (!b.ok) return b

      const meta = senalInfo(clave)

      return {
        ok: true,
        senal: meta.label,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        // Las claves son las etiquetas YA resueltas, para que el modelo redacte
        // con el período real y no con el «ayer» que escribió él.
        [a.periodo]: a,
        [b.periodo]: b,
        diferencia: {
          promedio: resta(b.promedio, a.promedio),
          minimo: resta(b.minimo, a.minimo),
          maximo: resta(b.maximo, a.maximo),
        },
        nota:
          `La diferencia es «${b.periodo}» menos «${a.periodo}». Un valor negativo significa que ` +
          `el segundo período fue más bajo.`,
        ...avisoDeUmbrales(),
      }
    },


    /**
     * Análisis estadístico y proyección de una señal.
     */
    async analisis_de_senal({ senal, periodo, horizonteMinutos = 60 } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })
      const meta = senalInfo(clave)

      if (!esHistorizada(clave)) {
        return fallo(
          `${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE}`
        )
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const serie = await leerSerie(clave, v)
      if (!serie.ok) {
        if (serie.status >= 502) {
          return fallo(
            'No se pudo contactar con el servidor ICONICS para leer el historiador.'
          )
        }
        return fallo(`El historiador no devolvió la serie de ${meta.label} en ${v.etiqueta}.`)
      }

      const validos = serie.datos.filter(d => typeof d.valor === 'number')
      if (validos.length < 3) {
        return fallo(
          `Hay ${validos.length} muestra(s) de ${meta.label} en ${v.etiqueta}: no son ` +
            `suficientes para un análisis estadístico. Hacen falta al menos 3.`
        )
      }

      const stats = estadisticasBasicas(validos.map(d => d.valor), meta.decimales)
      const regresion = regresionLineal(validos)
      const proyeccion = regresion ? proyectar(regresion, horizonteMinutos, meta.decimales) : null
      const anomalias = detectarAnomalias(validos, { media: stats.media, desv: stats.desv })

      return {
        ok: true,
        senal: meta.label,
        periodo: v.etiqueta,
        unidad: meta.unidad || null,
        estadisticas: stats,
        tendencia: calcularTendencia(validos),
        proyeccion: proyeccion
          ? {
              horizonteMinutos,
              valorEstimado: proyeccion.valor,
              rangoEsperado: [proyeccion.valorMin, proyeccion.valorMax],
              aviso:
                'Proyección lineal simple a partir de la tendencia reciente, con un margen ' +
                'del 95%. No es una predicción garantizada ni sustituye una alarma.',
            }
          : null,
        anomalias: anomalias.length ? anomalias : undefined,
        ...(meta.soloEnMarcha
          ? {
              avisoReposo:
                'Esta señal sólo significa algo con la instalación impulsando; si hubo tramos ' +
                'en reposo, la tendencia puede reflejar eso y no un cambio real.',
            }
          : {}),
      }
    },

    /**
     * Qué es NORMAL para una señal, medido sobre semanas de historia.
     *
     * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────
     *
     * Las demás herramientas juzgan contra `UMBRALES`, que son suposiciones
     * nuestras y siguen sin confirmar (ver `shared/eva/umbrales.js`). Medido
     * contra la instalación real en agosto de 2026, esas suposiciones no se
     * parecen a esta planta: la banda de la temperatura es veinte veces más
     * ancha que su variación real, la del caudal está en una escala diez veces
     * mayor, y la presión relativa vive ENTERA por debajo de su «mínimo
     * crítico». Sobre bandas así, «está en banda» no informa de nada.
     *
     * Esta herramienta no supone: mide. Dice dónde ha vivido la señal, cuánto
     * ha variado y qué percentiles ocupa, y sitúa el valor de AHORA dentro de
     * esa distribución. «La presión está en 0,9 y eso es más alta que el 97 %
     * de las lecturas del último mes» es una frase accionable; «la presión
     * está fuera de límite» contra un límite inventado no lo es.
     *
     * ── POR QUÉ ES LA BASE DE LO PREDICTIVO ────────────────────────────
     *
     * Una tendencia sin línea base no predice: `analisis_de_senal` dice que el
     * nivel sube 2 puntos por hora, pero no si eso es lo de siempre a esta
     * hora o algo que no había pasado nunca. Con el perfil delante, el modelo
     * puede decir cuál de las dos cosas es.
     */
    async perfil_de_senal({ senal, dias = 14 } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })
      const meta = senalInfo(clave)

      if (!esHistorizada(clave)) {
        return fallo(
          `${meta.label} no tiene serie histórica propia, así que no se puede perfilar. ` +
            `${SIN_SERIE} Su valor actual sí se puede dar con estado_del_sistema.`,
          { senalesConHistoria: historizadas().map(k => SENALES[k].label) }
        )
      }

      const cuantos = Math.max(1, Math.min(MAX_DIAS_PERFIL, Math.round(Number(dias) || 14)))
      const { muestras, diasLeidos } = await leerHistoriaLarga(clave, cuantos)

      const valores = muestras
        .filter(m => typeof m.valor === 'number' && Number.isFinite(m.valor))
        .map(m => m.valor)

      if (valores.length < MIN_MUESTRAS_PERFIL) {
        return fallo(
          `Sólo hay ${valores.length} muestras de ${meta.label} en ${cuantos} días ` +
            `(${diasLeidos} de ${cuantos} días respondieron). Hacen falta al menos ` +
            `${MIN_MUESTRAS_PERFIL} para decir qué es normal. El historiador guarda muy poco de ` +
            `esta señal, o el período pedido cae fuera de lo que conserva.`
        )
      }

      const orden = [...valores].sort((a, b) => a - b)
      const stats = estadisticasBasicas(valores, meta.decimales)
      const p = (q) => redondear(percentil(orden, q), meta.decimales)

      // El valor de ahora, para situarlo dentro de la distribución. Es lo que
      // convierte el perfil en una respuesta y no en una tabla.
      // `sistema.senales` es un objeto indexado POR CLAVE, no un array: la
      // lista plana es `sistema.lista`. Buscarlo con `.find` devolvía siempre
      // `undefined` y el perfil salía sin el dato de ahora, que es justo lo que
      // convierte la tabla de percentiles en una respuesta.
      const lectura = await leerMaquina(SISTEMA.tanque)
      const actual = lectura.ok ? lectura.estado.dominio.senales[clave]?.valor ?? null : null

      /*
       * Cuántas lecturas hubo POR DEBAJO del valor actual, en tanto por ciento.
       *
       * Es la cifra que de verdad responde «¿esto es raro?». Un 50 significa
       * que está justo en lo habitual; un 99, que sólo una de cada cien
       * lecturas del período fue tan alta.
       */
      const posicion = typeof actual === 'number'
        ? Math.round(100 * orden.filter(v => v < actual).length / orden.length)
        : null

      const ceros = valores.filter(v => Math.abs(v) < 1e-9).length

      return {
        ok: true,
        senal: meta.label,
        unidad: meta.unidad || null,
        fuente: 'historiador',
        periodo: `los últimos ${cuantos} días`,
        diasConDatos: diasLeidos,
        muestras: valores.length,

        rangoObservado: { minimo: redondear(orden[0], meta.decimales), maximo: redondear(orden.at(-1), meta.decimales) },
        estadisticas: stats,
        /*
         * Percentiles y no «media ± desviación».
         *
         * Estas señales no se distribuyen como una campana: el caudal está a
         * cero el 15 % del tiempo y el nivel vive clavado en 50 con subidas
         * ocasionales al 100. Sobre eso, «media ± 2 desviaciones» produce
         * límites que no existen —incluido un caudal negativo— mientras que un
         * percentil siempre cae sobre una lectura que de verdad ocurrió.
         */
        percentiles: { p1: p(0.01), p5: p(0.05), p25: p(0.25), p50: p(0.5), p75: p(0.75), p95: p(0.95), p99: p(0.99) },

        ...(ceros
          ? {
            aCero: `${Math.round(100 * ceros / valores.length)} % de las lecturas fueron exactamente 0` +
              (meta.soloEnMarcha ? ', que en esta señal es la instalación en reposo.' : '.'),
          }
          : {}),

        ...(typeof actual === 'number'
          ? {
            valorActual: redondear(actual, meta.decimales),
            posicionDelActual:
                `El valor de ahora es más alto que el ${posicion} % de las lecturas del período.`,
          }
          : { valorActual: null }),

        /*
         * Se compara la banda inventada contra lo observado, y se dice cuando
         * no cuadran.
         *
         * Es la forma de que el desajuste salga a la luz por sí solo en vez de
         * quedarse en un comentario de código: si la instalación pasa la mitad
         * del tiempo fuera de su «banda normal», el problema es la banda.
         */
        ...(UMBRALES[clave] ? comparacionConLaBanda(clave, orden) : {}),

        /*
         * El aviso que evita el error de lectura más probable de esta
         * herramienta, y que se vio en la primera prueba contra el servidor
         * real: la presión marcaba 5,66 y el perfil de 14 días topaba en 1,05,
         * así que salía «más alta que el 100 % de las lecturas» — cierto, y
         * engañoso. La instalación estaba bombeando en ese momento y llevaba
         * dos semanas parada casi siempre, de modo que el percentil describía
         * el reposo, no la marcha.
         *
         * Sin esta advertencia, el modelo redacta «valor nunca visto» y manda a
         * alguien a revisar una bomba que está funcionando como debe.
         */
        ...(meta.soloEnMarcha
          ? {
            avisoReposo:
                'Esta señal sólo significa algo con la instalación impulsando, y la instalación ' +
                'está parada la mayor parte del tiempo. El perfil mezcla las dos situaciones, así ' +
                'que los percentiles describen sobre todo el reposo: un valor por encima del p95 ' +
                'puede ser simplemente que ahora está bombeando y antes no. NO lo cuentes como ' +
                'anomalía sin comprobar antes, con estado_del_sistema, si el sistema está en marcha.',
          }
          : {}),

        aviso:
          'Este perfil es lo que la instalación ha hecho de verdad, medido del historiador. No ' +
          'dice qué es correcto, dice qué es habitual: si la instalación lleva semanas ' +
          'funcionando mal, lo anómalo aquí sería lo bueno.',
      }
    },

    /**
     * Varias señales sobre la MISMA ventana, con su correlación y sus
     * coincidencias en el tiempo.
     *
     * ── PARA QUÉ EXISTE ────────────────────────────────────────────────
     *
     * Es la herramienta del diagnóstico. «¿Por qué se paró la bomba?» no se
     * responde con una señal: se responde viendo que la tensión de línea se
     * hundió a las 14:32 y que la carga del motor cayó a cero justo después.
     * Con `historia_de_senal` eso exigía dos consultas y que el modelo cruzara
     * las horas de cabeza — y cruzar horas de cabeza es aritmética, que es
     * justo lo que tiene prohibido hacer.
     *
     * ── LO QUE ESTA HERRAMIENTA NO DICE ────────────────────────────────
     *
     * No dice cuál causó cuál. Devuelve el coeficiente, las anomalías de cada
     * señal con su hora, y qué anomalías cayeron cerca en el tiempo. Que dos
     * cosas pasen juntas es un indicio; el aviso que viaja en la respuesta lo
     * dice con esas palabras para que el modelo no lo convierta en una
     * afirmación causal al redactar.
     */
    async correlacionar_senales({ senales, periodo } = {}) {
      /*
       * Se acepta lista o cadena separada por comas.
       *
       * Medido con el 4B: pide un array de strings unas veces y una cadena
       * «nivel, presión» otras, con el mismo esquema delante. Rechazar la
       * cadena costaría una ronda entera de 30 segundos para corregir algo que
       * se entiende perfectamente.
       */
      const lista = Array.isArray(senales)
        ? senales
        : String(senales ?? '').split(/[,;]|\by\b/).map(s => s.trim()).filter(Boolean)

      if (lista.length < 2) {
        return fallo(
          'Para correlacionar hacen falta al menos DOS señales. Dime cuáles quieres comparar.',
          { senalesConHistoria: historizadas().map(k => SENALES[k].label) }
        )
      }

      /* Se resuelven todas antes de salir a la red: si una no existe o no tiene
         historia, decirlo ahora ahorra las lecturas de las demás. */
      const claves = []
      for (const nombre of lista) {
        const clave = resolverSenal(nombre)
        if (!clave) return senalDesconocida(nombre, { paraHistoria: true })
        if (!esHistorizada(clave)) {
          return fallo(
            `${senalInfo(clave).label} no tiene serie histórica propia, así que no se puede ` +
              `correlacionar. ${SIN_SERIE}`,
            { senalesConHistoria: historizadas().map(k => SENALES[k].label) }
          )
        }
        if (!claves.includes(clave)) claves.push(clave)
      }

      /*
       * ── LA PROHIBICIÓN, APLICADA POR EL CÓDIGO Y NO POR EL PROMPT ──
       *
       * `NO_COMPARTEN` vivía sólo en las instrucciones, y una regla que sólo
       * vive ahí falla de las dos maneras: se salta cuando no debe, y —lo que
       * se vio en pantalla— se aplica cuando NO toca. Preguntado por el nivel
       * del tanque contra la presión de la red, el modelo se negó diciendo que
       * eran «sistemas separados». No lo son: son dos ACTIVOS de la misma
       * máquina, el mismo PLC y la misma agua, unidos por una tubería. La
       * correlación era legítima y la herramienta la hace sin problema — el
       * modelo ni siquiera llegó a llamarla.
       *
       * Ahora la comprobación es de verdad: se pregunta al registro si las
       * señales son de la misma máquina. El modelo ya no tiene que razonarlo, y
       * si de verdad cruza dos instalaciones recibe un error que puede contar
       * tal cual. Es además el primer llamador de `mismoSistema`, que llevaba
       * exportada desde que existe el registro sin que nadie la usara.
       */
      const deSistemas = [...new Set(claves.map((k) => sistemaDePunto(pointName(k))?.id))]
      if (deSistemas.length > 1) {
        return fallo(
          `Esas señales no son de la misma máquina: pertenecen a ${deSistemas.join(' y ')}. ` +
            `${NO_COMPARTEN}`,
          { sistemas: deSistemas }
        )
      }

      if (claves.length < 2) {
        return fallo('Las señales que has dado son la misma. Dime dos distintas para comparar.')
      }
      if (claves.length > 4) {
        // Sólo hay cuatro señales historizadas; más que eso es que algo se
        // repitió. El tope existe para que el resultado quepa en el contexto:
        // cuatro señales ya son seis pares.
        return fallo('Como mucho cuatro señales a la vez.')
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const series = await Promise.all(claves.map(clave => leerSerie(clave, v)))

      const fallidas = claves.filter((_, i) => !series[i].ok)
      if (fallidas.length) {
        return fallo(
          `El historiador no devolvió la serie de ${fallidas.map(k => senalInfo(k).label).join(' y ')} ` +
            `en ${v.etiqueta}.`
        )
      }

      /*
       * Tolerancia de emparejamiento: media distancia entre muestras.
       *
       * Se deriva de la ventana y no es fija porque el intervalo lo fija
       * `leerSerie` en función de lo que se pida —15 min en una ventana corta,
       * más en una larga—. Una tolerancia fija de un minuto no emparejaría nada
       * en una ventana de una semana; una de una hora emparejaría muestras
       * sin relación en una de treinta minutos.
       */
      const segundosVentana = (v.fin - v.inicio) / 1000
      const puntosEsperados = Math.max(2, Math.min(MAX_PUNTOS, Math.round(segundosVentana / 900)))
      const toleranciaMs = (segundosVentana / puntosEsperados) * 1000 * 0.5

      /* ── Cada señal por separado: resumen y anomalías ───────────────── */
      const porSenal = claves.map((clave, i) => {
        const meta = senalInfo(clave)
        const validos = series[i].datos.filter(d => typeof d.valor === 'number')
        const stats = validos.length >= 2
          ? estadisticasBasicas(validos.map(d => d.valor), meta.decimales)
          : null

        return {
          clave,
          meta,
          datos: series[i].datos,
          senal: meta.label,
          unidad: meta.unidad || null,
          muestras: validos.length,
          ...(stats ? { estadisticas: stats } : {}),
          anomalias: stats?.desv
            ? detectarAnomalias(validos, { media: stats.media, desv: stats.desv })
                .map(a => ({ hora: horaLocal(a.hora), valor: a.valor, z: a.z }))
            : [],
        }
      })

      const pobres = porSenal.filter(s => s.muestras < 3)
      if (pobres.length) {
        return fallo(
          `No hay muestras suficientes de ${pobres.map(s => s.senal).join(' y ')} en ` +
            `${v.etiqueta} para correlacionar: hacen falta al menos 3 de cada una.`
        )
      }

      /* ── Cada par: correlación sobre instantes alineados ────────────── */
      const pares = []
      for (let i = 0; i < porSenal.length; i++) {
        for (let j = i + 1; j < porSenal.length; j++) {
          const { xs, ys } = alinearSeries(porSenal[i].datos, porSenal[j].datos, toleranciaMs)
          const r = correlacionPearson(xs, ys)

          pares.push({
            entre: `${porSenal[i].senal} y ${porSenal[j].senal}`,
            muestrasComparadas: xs.length,
            ...(xs.length < 3
              ? {
                relacion:
                    'no se puede calcular: las dos señales no tienen muestras en los mismos ' +
                    'instantes dentro de esta ventana',
              }
              : {
                coeficiente: r === null ? null : +r.toFixed(2),
                relacion: describirCorrelacion(r),
              }),
          })
        }
      }

      /* ── Anomalías que cayeron juntas ───────────────────────────────── */
      const coincidencias = []
      for (let i = 0; i < porSenal.length; i++) {
        for (let j = i + 1; j < porSenal.length; j++) {
          for (const a of porSenal[i].anomalias) {
            for (const b of porSenal[j].anomalias) {
              // Se comparan las horas ya formateadas a HH:MM:SS, que es la
              // resolución con la que se van a citar de todos modos.
              const distancia = Math.abs(segundosDeHora(a.hora) - segundosDeHora(b.hora))
              if (distancia * 1000 <= toleranciaMs * 2) {
                coincidencias.push({
                  hora: a.hora,
                  descripcion:
                    `${porSenal[i].senal} marcó ${a.valor} y ${porSenal[j].senal} marcó ` +
                    `${b.valor} casi en el mismo instante; las dos son valores atípicos para ` +
                    `esta ventana.`,
                })
              }
            }
          }
        }
      }

      return {
        ok: true,
        periodo: v.etiqueta,
        fuente: 'historiador',
        senales: porSenal.map(({ clave, meta, datos, ...resto }) => resto),
        correlaciones: pares,
        /*
         * Se recortan a seis, y se dice cuántas quedaron fuera.
         *
         * Un solo evento de treinta segundos produce una anomalía por muestra
         * de cada señal, y cruzarlas da decenas de coincidencias que describen
         * el MISMO suceso. Mandárselas todas al modelo no añade información:
         * llena el contexto y le invita a contar «hubo 28 anomalías» de algo
         * que fue una sola caída de presión. Seis bastan para situarlo en el
         * tiempo, y el recuento real va aparte para no ocultar nada.
         */
        ...(coincidencias.length
          ? {
            anomaliasSimultaneas: coincidencias.slice(0, 6),
            ...(coincidencias.length > 6
              ? {
                notaCoincidencias:
                      `Hay ${coincidencias.length} pares de valores atípicos simultáneos en ` +
                      `total; arriba van los primeros 6. Suelen ser el mismo suceso repetido ` +
                      `muestra a muestra, así que descríbelo como UN episodio y no como ` +
                      `${coincidencias.length} incidencias distintas.`,
              }
              : {}),
          }
          : {
            anomaliasSimultaneas:
                'Ninguna. No hubo valores atípicos de dos señales distintas en el mismo instante.',
          }),
        /*
         * Éste SÍ es un `aviso`: tiene que llegar al operador aunque el modelo
         * se olvide de contarlo, porque es la diferencia entre un indicio y un
         * diagnóstico, y sobre él se decide si se va a abrir una máquina.
         *
         * Por eso está redactado para que se lea BIEN pegado al final de la
         * respuesta, sin imperativos dirigidos al modelo. La versión anterior
         * decía «Dilo así al redactar», y cuando la red de seguridad lo añadía
         * el operador leía una orden dada a otro.
         */
        /*
         * ── SIN `avisoDeUmbrales()`, Y NO ES UN OLVIDO ───────────────
         *
         * Estaba, y PISABA este aviso. Los dos usan la clave `aviso` y el
         * spread iba detrás, así que el operador leía «los límites con los que
         * se ha evaluado cada señal son estimaciones nuestras» al pie de una
         * respuesta que no evaluó ninguna señal contra ningún límite — esta
         * herramienta no devuelve estado, ni banda, ni límite: devuelve un
         * coeficiente y unos atípicos. Visto en pantalla el 27-08-2026.
         *
         * El aviso de umbrales no aplica aquí, y el que sí aplica —correlación
         * no es causa— es el que llevaba tres frases escritas para leerse bien
         * pegado al final y nunca llegaba. Un aviso que no viene a cuento
         * cuesta lo mismo que uno que falta: enseña a saltarse la línea del ⚠,
         * y entonces se pierde el día que dice algo.
         */
        aviso:
          'Que dos señales se muevan juntas es un indicio de que algo las relaciona, no una ' +
          'prueba de que una cause la otra: puede haber una tercera causa común, o ser ' +
          'casualidad en una ventana corta. Correlación no es causa.',
      }
    },

    /**
     * Gráfico de una señal. La serie es real, no generada.
     *
     * ── LA IMAGEN NO ENTRA EN EL CONTEXTO DEL MODELO ───────────────────
     *
     * Viaja bajo `_adjunto`, y el guion bajo es el contrato: `chat.mjs` saca
     * esas claves del resultado ANTES de meterlo en los mensajes y las emite
     * por su propio evento SSE hacia la pantalla.
     *
     * Sin eso, el dibujo entero —decenas de miles de caracteres— se le
     * entregaba al modelo como texto de la herramienta. Con 512 tokens de
     * presupuesto y un contexto de 4k, eso no es una ineficiencia: desborda la
     * ventana, expulsa las instrucciones y el dato que había que contar, y el
     * modelo redacta sobre lo que quedó. Un gráfico correcto acompañado de una
     * frase equivocada.
     *
     * Al modelo se le manda en su lugar el RESUMEN de la serie: es lo que
     * necesita para escribir («subió de 41 a 63 entre las 8 y las 11») y no
     * puede describir de memoria una imagen que nunca ve.
     */
    async grafico_de_senal({ senal, periodo } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })
      const meta = senalInfo(clave)

      if (!esHistorizada(clave)) {
        return fallo(`${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE}`)
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const serie = await leerSerie(clave, v)
      if (!serie.ok) {
        return fallo(`El historiador no devolvió la serie de ${meta.label} en ${v.etiqueta}.`)
      }
      if (!serie.datos.length) {
        return fallo(`No hay muestras de ${meta.label} en ${v.etiqueta} para dibujar.`)
      }

      let svg
      try {
        svg = renderizarGraficoSerie(serie.datos, {
          titulo: meta.label,
          unidad: meta.unidad || null,
          banda: UMBRALES[clave] ? bandaLegible(UMBRALES[clave]) : null,
        })
      } catch (error) {
        // El caso conocido es una sola muestra válida en la ventana. Se cuenta
        // como lo que es —no hay con qué dibujar— y no como una avería.
        return fallo(
          `No se pudo dibujar ${meta.label} en ${v.etiqueta}: ${error.message} ` +
            `Su resumen numérico sí se puede dar con historia_de_senal.`
        )
      }

      const resumen = resumirSerie(serie.datos, meta.decimales, serie.ventana)

      /*
       * Tendencia y anomalías, calculadas aquí y no adivinadas por el modelo.
       *
       * Antes el `nota` de abajo le pedía al modelo que INTERPRETARA la curva
       * a partir de mínimo/máximo/promedio — y con un 9B eso, medido, seguía
       * saliendo como una lista de cifras reformulada, no una lectura real.
       * `calcularTendencia` (misma función que usa `analisis_de_senal`) le da
       * un veredicto YA calculado —sube, baja o está estable, con su propio
       * aviso de fiabilidad— para que el modelo lo cite en vez de inferirlo.
       */
      const valores = serie.datos.filter(d => typeof d.valor === 'number').map(d => d.valor)
      const stats = estadisticasBasicas(valores, meta.decimales)
      const tendencia = calcularTendencia(serie.datos)
      const anomalias = detectarAnomalias(serie.datos, { media: stats.media, desv: stats.desv })

      return {
        ok: true,
        senal: meta.label,
        periodo: v.etiqueta,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        // El resumen, para que el modelo pueda hablar de la curva que no ve.
        ...(resumen ?? {}),
        ...(serie.truncada ? { avisoTruncada: AVISO_TRUNCADA } : {}),
        tendencia,
        anomalias: anomalias.length ? anomalias : undefined,
        graficoEntregado: true,
        nota:
          'El gráfico ya se le ha enviado a la pantalla del usuario; no hace falta que lo ' +
          'describas punto por punto ni repitas mínimo/máximo/promedio como una lista. Usa ' +
          '"tendencia.direccion" para decir si sube, baja o se mantiene estable —cita ' +
          '"tendencia.nota" si el ajuste es poco fiable, en vez de sonar más seguro de lo que el ' +
          'dato permite—; si "anomalias" trae algo, son los puntos que más se apartaron de lo ' +
          'habitual y merece la pena señalarlos con su hora. No inventes una tendencia, un ciclo o ' +
          'una causa que estos campos no sostengan.',
        _adjunto: { tipo: 'grafico', formato: 'svg', contenido: svg, titulo: meta.label },
      }
    },

    /**
     * Reporte PDF de la instalación: gráficos de las señales con historia,
     * tabla de valores actuales de las demás (Plan 14 Fase 5).
     *
     * ── MISMO CONTRATO QUE grafico_de_senal, CON UN ENLACE EN VEZ DE UNA IMAGEN ──
     *
     * El PDF nunca viaja al modelo, ni siquiera como adjunto binario: viaja
     * un ENLACE (`_adjunto.url`), porque a diferencia del SVG del gráfico —que
     * la pantalla pinta inline— el reporte es un archivo que se descarga.
     * `GET /api/reportes` lo sirve por separado. Ninguna cifra del PDF la
     * escribe el modelo: las compone este archivo con datos reales del
     * historiador, igual que hace `grafico_de_senal`.
     *
     * ── DOS EXPLICACIONES, NO UNA (feedback: "el PDF no traía explicación") ──
     *
     * El PDF se cierra y se guarda ANTES de que el modelo escriba una sola
     * palabra —es una única llamada síncrona—, así que una explicación que
     * dependiera SÓLO de que el modelo se acuerde de dársela saldría del PDF
     * la mayoría de las veces. Por eso cada gráfico lleva una `interpretacion`
     * que compone el propio backend con `describirTendencia` (garantizada,
     * siempre igual para los mismos datos, igual que `describirCorrelacion`).
     * El parámetro `explicacion` es la SEGUNDA capa, opcional: si el usuario
     * pide explícitamente que se comente el reporte, el modelo puede mirar
     * antes la tendencia de la señal principal (con `grafico_de_senal` o
     * `analisis_de_senal`) y pasar aquí su propio comentario, que se imprime
     * aparte y con su procedencia dicha, nunca mezclado con las cifras.
     */
    async generar_reporte({ senales, periodo, explicacion } = {}) {
      const v = resolverVentana(periodo, { turnos, maxHoras: MAX_DIAS_REPORTE * 24 })
      if (v.error) return fallo(v.error)

      let claves
      const desconocidas = []
      if (senales && senales.length) {
        claves = []
        for (const nombre of senales) {
          const clave = resolverSenal(nombre)
          if (clave) claves.push(clave)
          else desconocidas.push(nombre)
        }
        if (!claves.length) {
          return fallo(
            `Ninguna de las señales pedidas se reconoce: ${desconocidas.join(', ')}. El catálogo ` +
              'está en tus instrucciones.'
          )
        }
      } else {
        claves = [...SENAL_KEYS]
      }

      const historizadasPedidas = claves.filter(esHistorizada)
      const sinHistoriaPedidas = claves.filter(c => !esHistorizada(c))
      const notas = []

      const graficos = historizadasPedidas.length
        ? await Promise.all(
          historizadasPedidas.map(async clave => {
            const meta = senalInfo(clave)
            const { muestras, diasLeidos, diasTotal } = await leerSerieEnRango(clave, v)

            if (!muestras.length) {
              return {
                titulo: meta.label,
                unidad: meta.unidad || null,
                svg: null,
                resumen: null,
                nota: `Sin muestras de ${meta.label} en ${v.etiqueta}.`,
              }
            }

            let svg
            try {
              // Downsample SÓLO para el dibujo: un trimestre son miles de
              // muestras (~100/día × hasta 90 días) apretadas en 640 px de
              // ancho, que sin esto se ven como un bloque sólido en vez de
              // una curva. El
              // resumen numérico de abajo sigue viniendo de `muestras`
              // completo, sin downsamplear — los extremos reales no se
              // pierden, sólo se suaviza el dibujo.
              svg = renderizarGraficoSerie(downsamplear(muestras, PUNTOS_GRAFICO_REPORTE), {
                titulo: meta.label,
                unidad: meta.unidad || null,
                banda: UMBRALES[clave] ? bandaLegible(UMBRALES[clave]) : null,
              })
            } catch (error) {
              return {
                titulo: meta.label,
                unidad: meta.unidad || null,
                svg: null,
                resumen: null,
                nota: `No se pudo dibujar ${meta.label}: ${error.message}`,
              }
            }

            if (diasLeidos < diasTotal) {
              notas.push(
                `${meta.label}: sólo se pudieron leer ${diasLeidos} de ${diasTotal} días del historiador.`
              )
            }

            // Sobre la serie COMPLETA, no la downsampleada: la tendencia real
            // no debe depender de cuántos puntos entraron en el dibujo.
            // Mismo cálculo que `grafico_de_senal`.
            const tendencia = calcularTendencia(muestras)

            return {
              titulo: meta.label,
              unidad: meta.unidad || null,
              svg,
              resumen: resumirSerie(muestras, meta.decimales),
              tendencia,
              // La explicación GARANTIZADA del PDF — ver la cabecera de
              // `generar_reporte`. No depende de que el modelo la pida.
              interpretacion: describirTendencia(tendencia, meta.unidad),
              nota: null,
            }
          })
        )
        : []

      let tablaActual = []
      if (sinHistoriaPedidas.length) {
        /* `sistema` es OBLIGATORIO desde que estas herramientas sirven a
           cualquier máquina del registro: llamar sin él devuelve un fallo, y
           el reporte caía al respaldo «sin dato» sin decir por qué. El reporte
           es del tanque —sus señales salen de `SENAL_KEYS`— así que se nombra. */
        const estado = await dameHerramientas().estado_del_sistema({ sistema: 'tanque' })
        if (estado.ok) {
          const todas = estado.activos.flatMap(a => a.senales)
          tablaActual = sinHistoriaPedidas.map(clave => {
            const meta = senalInfo(clave)
            const s = todas.find(x => x.clave === clave)
            return s
              ? { senal: s.senal, valor: s.valor, unidad: s.unidad, estado: s.estado }
              : { senal: meta.label, valor: null, unidad: meta.unidad || null, estado: 'sin dato' }
          })
        } else {
          notas.push('No se pudo leer el valor actual de las señales sin historia.')
        }
      }

      if (desconocidas.length) {
        notas.push(`No se reconocieron estas señales y se omitieron: ${desconocidas.join(', ')}.`)
      }
      if (sinHistoriaPedidas.length) {
        notas.push(
          `${sinHistoriaPedidas.length} de las ${claves.length} señales pedidas no tienen serie ` +
            'histórica en este servidor; van con su valor actual, sin gráfico.'
        )
      }

      // Carga perezosa DENTRO de la herramienta, nunca en la cabecera del
      // módulo: si pdfkit no está instalado, esto falla y se captura aquí sin
      // tumbar el backend. Ver la cabecera de `reporte.mjs`.
      let reporteMod
      try {
        reporteMod = await import('../../reporte.mjs')
      } catch (error) {
        return fallo(
          'Los reportes PDF no están disponibles ahora mismo: falta instalar las dependencias del ' +
            `backend. El resto del asistente sigue funcionando. (${error.message})`
        )
      }

      if (!reportes?.dir) {
        return fallo('Los reportes PDF no están configurados en este servidor.')
      }

      const pdf = await reporteMod.componerReportePdf({
        instalacion: 'Sistema de agua industrial',
        periodo: v.etiqueta,
        generadoEl: horaLocal(new Date().toISOString()),
        graficos,
        tablaActual,
        notas,
        // Comentario del MODELO, opcional y aparte de `interpretacion` (que
        // pone el propio backend en cada gráfico). Se imprime con su
        // procedencia dicha — ver `reporte.mjs` — para no mezclar lo medido
        // con lo que el modelo opina.
        explicacion: typeof explicacion === 'string' && explicacion.trim() ? explicacion.trim() : null,
      })

      const id = randomUUID()
      await mkdir(reportes.dir, { recursive: true })
      await purgarReportesViejos(reportes.dir, reportes.maxDias)
      await writeFile(join(reportes.dir, `${id}.pdf`), pdf)

      return {
        ok: true,
        instalacion: 'Sistema de agua industrial',
        periodo: v.etiqueta,
        senalesConGrafico: historizadasPedidas.map(c => senalInfo(c).label),
        senalesEnTabla: sinHistoriaPedidas.map(c => senalInfo(c).label),
        ...(notas.length ? { notas } : {}),
        nota:
          'El reporte ya se ha generado y el enlace de descarga se le ha entregado al usuario; no ' +
          'hace falta que describas el PDF punto por punto, sólo confirma qué trae. Cada gráfico del ' +
          'PDF YA incluye su propia interpretación de la tendencia, generada por el sistema — no ' +
          'digas que el reporte "no trae explicación".',
        _adjunto: {
          tipo: 'reporte',
          formato: 'pdf',
          url: `/api/reportes?id=${id}`,
          titulo: `Reporte — ${v.etiqueta}`,
        },
      }
    },
  }
}
