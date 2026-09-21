/**
 * backend/lib/sondearSeries.mjs
 * ------------------------------------------------------------------
 * ¿La serie que devuelve el historiador es de VERDAD la de esta variable?
 * Plan 34 F2.
 *
 * ── POR QUÉ PREGUNTAR NO BASTA ────────────────────────────────────
 *
 * Porque el servidor contesta que sí y devuelve la serie de otra señal, con
 * marcas de tiempo correctas y sin dar error. No es una hipótesis: está
 * medido en las dos máquinas de esta planta.
 *
 *   aPeak_S1   1805 de 1805 valores IDÉNTICOS a los de aRMS_S1  (el 100 %)
 *   QC_*       las NUEVE calidades de los tres apoyos, una sola serie
 *
 * Una variable con la serie de otra no produce un hueco ni un error: produce
 * una gráfica que se rellena con el número equivocado bajo el rótulo
 * correcto, y eso no se ve mirando la pantalla. Por eso
 * `configuracionMaquina.js` hace arrancar `historyVerified` en `false` y dice
 * que «sólo pasa a `true` tras un sondeo que compare». Esto es ese sondeo.
 *
 * ── LO QUE SE COMPARA, Y POR QUÉ ES UNA HUELLA ────────────────────
 *
 * No se compara «tiene datos» —eso ya lo contesta el propio historiador— sino
 * si DOS variables distintas traen la misma serie. Para eso se resume cada
 * una en una huella: sus primeros valores, redondeados y en orden.
 *
 * Dos huellas iguales entre variables distintas significan que el servidor
 * está sirviendo la misma serie con dos nombres. Ninguna de las dos se marca
 * como verificada: no se sabe cuál de ellas es la legítima —puede que
 * ninguna— y elegir una sería exactamente la afirmación que este módulo
 * existe para no hacer.
 *
 * ── LA TRAMPA DE LA MÁQUINA PARADA ────────────────────────────────
 *
 * **Dos series de ceros parecen la misma serie.** Con la instalación
 * detenida, todas las variables devuelven cero y todas las huellas colisionan
 * — y marcar `false` a las cuarenta por eso sería dar por falso lo que no se
 * ha podido comprobar.
 *
 * Es el principio de `CLAUDE.md` §2.4 en su forma más afilada: la ausencia de
 * VARIACIÓN no se disfraza de comprobación fallida. Una serie sin variación
 * no verifica y no desmiente: queda `UNKNOWN`, con su motivo, y se vuelve a
 * sondear cuando la máquina gire.
 *
 * ── ESTO SE VUELVE A CORRER, NO SE CORRE UNA VEZ ──────────────────
 *
 * Es la lección del 21-09-2026 y la razón de que la fase exista. El sondeo
 * anterior se hizo el 28-08-2026, su resultado se copió a una lista blanca, y
 * durante casi un mes el código afirmó tener 40 series verificadas **sobre un
 * grupo del historiador que había dejado de existir**. Una verificación
 * guardada no envejece sola: envejece el servidor debajo de ella.
 *
 * Y el servidor de esta planta se mueve. El mismo día se descubrió que había
 * cambiado la raíz del historiador, la raíz en vivo y el nombre de un tag; y
 * esa misma tarde el Hyper Historian dejó de contestar consultas mientras el
 * árbol seguía respondiendo.
 *
 * Por eso lo que hay aquí es una FUNCIÓN que se vuelve a llamar, y no una
 * tabla. Cuando el historiador empiece a registrar señales que hoy no
 * registra —o cuando se añadan variables nuevas— lo que hay que hacer es
 * volver a sondear, no editar una lista. El resultado de hoy no es una
 * conclusión: es una foto con fecha.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ────────────────────────────────────
 *
 * **No escribe.** Guardar el resultado es de `indices/maquinas.mjs`
 * (`anotarRevision`), igual que con `verificarConfiguracion.mjs`. Separarlo es
 * lo que permite probar esto sin tocar disco.
 *
 * **No repara.** Una variable cuya serie es la de otra se marca y se explica;
 * qué hacer con ella lo decide una persona (`CLAUDE.md` §2.5).
 *
 * **No recuerda.** No compara contra el sondeo anterior ni avisa de que algo
 * cambió desde la última vez. Hoy no hace falta —se vuelve a sondear entero y
 * es barato— y hacerlo exigiría guardar un histórico de sondeos que nadie ha
 * pedido todavía (`CLAUDE.md` §4.8).
 */
import { ESTADO_CONFIGURACION } from '../../shared/eva/comun/configuracionMaquina.js'

/**
 * Cuántas muestras entran en la huella.
 *
 * Ocho bastan para distinguir dos señales físicas distintas y mantienen la
 * comparación barata con decenas de variables. Si dos series coinciden en
 * ocho muestras consecutivas y siguen siendo distintas, la diferencia es tan
 * pequeña que el emparejamiento merece una mirada humana igualmente.
 */
const MUESTRAS_HUELLA = 8

/**
 * Cuántos decimales sobreviven a la huella.
 *
 * Seis: suficiente para no colapsar dos medidas cercanas, y suficientemente
 * poco para que un redondeo distinto en dos peticiones no invente una
 * diferencia que no existe.
 */
const DECIMALES_HUELLA = 6

/**
 * El resumen comparable de una serie.
 *
 * Devuelve `null` cuando no hay con qué comparar. Es distinto de una huella
 * vacía: `null` significa «no se puede opinar», y quien llama lo trata como
 * tal en vez de compararlo con otros `null` y declararlos iguales.
 */
export function huellaDe(muestras) {
  if (!Array.isArray(muestras) || !muestras.length) return null

  const valores = muestras
    .slice(0, MUESTRAS_HUELLA)
    .map((m) => (typeof m?.value === 'number' ? m.value.toFixed(DECIMALES_HUELLA) : null))

  if (valores.some((v) => v === null)) return null
  return valores.join(',')
}

/**
 * ¿Esta serie varía lo suficiente como para poder distinguirla de otra?
 *
 * Una serie constante —típicamente todo ceros, con la máquina parada— no
 * distingue nada: coincide con cualquier otra serie constante del mismo
 * valor. Verificar sobre ella sería afirmar una coincidencia que no se ha
 * medido.
 */
export function tieneVariacion(muestras) {
  if (!Array.isArray(muestras) || muestras.length < 2) return false
  const numeros = muestras.map((m) => m?.value).filter((v) => typeof v === 'number')
  if (numeros.length < 2) return false
  return new Set(numeros).size > 1
}

/**
 * Sondea las series de una máquina y dice cuáles son de verdad suyas.
 *
 * @param {object} maquina  su configuración, con `variables[]`
 * @param {object} deps
 * @param {(opciones: object) => Promise<object>} deps.leerSerie  normalmente
 *   `client.readHistory`. Entra por la puerta para poder probar esto sin red.
 * @param {string} deps.desde  inicio de la ventana, ISO
 * @param {string} deps.hasta  fin de la ventana, ISO
 * @returns {Promise<{estado: string, motivo: string, variables: object[], resumen: object}>}
 */
export async function sondearSeries(maquina, { leerSerie, desde, hasta }) {
  const declaradas = (maquina?.variables ?? []).filter((v) => v?.historyPointName)

  if (!declaradas.length) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo: 'Ninguna variable declara punto histórico: no hay series que sondear.',
      variables: [],
      resumen: { total: 0, verificadas: 0, compartidas: 0, sinVariacion: 0, sinDatos: 0, fallos: 0 },
    }
  }

  /* Una lectura por variable, en serie. El historiador pagina y una ráfaga de
     cuarenta peticiones simultáneas es justo lo que `HISTORY_CONCURRENCIA`
     existe para no hacer. */
  const leidas = []
  for (const v of declaradas) {
    try {
      const r = await leerSerie({
        pointName: v.historyPointName,
        startDate: desde,
        endDate: hasta,
        aggregate: 'Average',
        interval: 0,
      })
      leidas.push({
        variable: v,
        ok: r?.ok === true,
        motivo: r?.ok === true ? null : (r?.error ?? `HTTP ${r?.status ?? '?'}`),
        muestras: r?.data ?? [],
      })
    } catch (error) {
      leidas.push({
        variable: v,
        ok: false,
        motivo: error?.message ?? 'error desconocido',
        muestras: [],
      })
    }
  }

  /*
   * Las huellas se agrupan ANTES de decidir nada: una variable sólo se puede
   * declarar verificada si su serie no la comparte nadie, y eso no se sabe
   * hasta haberlas visto todas.
   */
  const porHuella = new Map()
  for (const l of leidas) {
    if (!l.ok) continue
    const huella = tieneVariacion(l.muestras) ? huellaDe(l.muestras) : null
    l.huella = huella
    if (!huella) continue
    if (!porHuella.has(huella)) porHuella.set(huella, [])
    porHuella.get(huella).push(l.variable.id ?? l.variable.pointName)
  }

  const variables = leidas.map((l) => {
    const base = { ...l.variable }

    if (!l.ok) {
      /*
       * No se pudo leer: `historyVerified` NO se toca. Bajarlo a `false`
       * borraría una verificación anterior buena por un corte de red, que es
       * el mismo fallo que `UNKNOWN` ≠ `INVALID` evita un nivel más arriba.
       */
      return {
        ...base,
        sondeo: {
          estado: ESTADO_CONFIGURACION.UNKNOWN,
          causa: 'no-se-pudo-leer',
          motivo: `No se pudo leer la serie: ${l.motivo}.`,
        },
      }
    }

    if (!l.muestras.length) {
      return {
        ...base,
        historyVerified: false,
        sondeo: {
          estado: ESTADO_CONFIGURACION.DEGRADED,
          causa: 'sin-muestras',
          motivo: 'El historiador contesta, pero no hay muestras en la ventana pedida.',
        },
      }
    }

    if (!l.huella) {
      /* Sin variación: ni se verifica ni se desmiente. Ver la cabecera. */
      return {
        ...base,
        sondeo: {
          estado: ESTADO_CONFIGURACION.UNKNOWN,
          causa: 'sin-variacion',
          motivo:
            'La serie no varía en toda la ventana, así que no se puede distinguir de ' +
            'cualquier otra igual de plana. Hay que volver a sondear con la máquina en marcha.',
        },
      }
    }

    const comparten = porHuella.get(l.huella) ?? []
    if (comparten.length > 1) {
      const otras = comparten.filter((id) => id !== (l.variable.id ?? l.variable.pointName))
      return {
        ...base,
        historyVerified: false,
        sondeo: {
          estado: ESTADO_CONFIGURACION.INVALID,
          causa: 'serie-compartida',
          motivo:
            `El historiador devuelve para esta variable la MISMA serie que para ` +
            `${otras.join(', ')}. No se puede saber cuál es la legítima, así que ninguna ` +
            'promete historia.',
          compartidaCon: otras,
        },
      }
    }

    return {
      ...base,
      historyVerified: true,
      sondeo: {
        estado: ESTADO_CONFIGURACION.VALID,
        causa: 'serie-propia',
        motivo: `Serie propia: ${l.muestras.length} muestras, distinta de las demás.`,
      },
    }
  })

  /* Se cuenta por `causa` y no por el texto del motivo: dos casos distintos
     comparten estado `UNKNOWN` —no se pudo leer, y no varía— y distinguirlos
     por cómo empieza una frase se rompe al reescribir esa frase. */
  const porCausa = (causa) => variables.filter((v) => v.sondeo.causa === causa).length
  const resumen = {
    total: variables.length,
    verificadas: variables.filter((v) => v.historyVerified === true).length,
    compartidas: porCausa('serie-compartida'),
    sinVariacion: porCausa('sin-variacion'),
    sinDatos: porCausa('sin-muestras'),
    fallos: porCausa('no-se-pudo-leer'),
  }

  /*
   * El estado del sondeo entero. `UNKNOWN` si no se pudo verificar ninguna:
   * un sondeo que no verificó nada porque la máquina estaba parada no es un
   * sondeo fallido, es uno que hay que repetir.
   */
  const estado = resumen.verificadas
    ? (resumen.compartidas || resumen.fallos || resumen.sinVariacion
        ? ESTADO_CONFIGURACION.DEGRADED
        : ESTADO_CONFIGURACION.VALID)
    : ESTADO_CONFIGURACION.UNKNOWN

  return {
    estado,
    motivo:
      `${resumen.verificadas} de ${resumen.total} series verificadas como propias. ` +
      `${resumen.compartidas} comparten serie con otra, ${resumen.sinVariacion} no varían ` +
      `en la ventana, ${resumen.sinDatos} sin muestras y ${resumen.fallos} no se pudieron leer.`,
    variables,
    resumen,
  }
}
