/**
 * Resolver una señal por su nombre DENTRO de una máquina del registro, y lo
 * que una herramienta necesita saber de ella: su meta (rótulo, unidad,
 * decimales), su banda si el tipo la declara, si tiene serie, y qué otras
 * series tiene su máquina (Plan 44 F3.6).
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ SIN NINGÚN «TANQUE» ─────────────────────
 *
 * Hasta el 23-09-2026 esto vivía dentro de `historicos/index.mjs` con una
 * rama para el tanque: sin `sistema` se resolvía contra su índice de
 * sinónimos escrito a mano, con su `senalInfo` y sus `UMBRALES`, y sólo las
 * demás máquinas pasaban por el registro. El usuario pidió que el asistente
 * no tuviera específicos: todo lo que sabe de una máquina lo sabe por su
 * entrada del registro. Así que aquí no hay índice de nadie: los nombres los
 * conoce `sistemasDeSenal` (clave, etiqueta y alias que declare la máquina),
 * la meta la da `entrada.metaDe`, la banda `entrada.bandaDe`, y sin `sistema`
 * entra la única configurada en servicio (`sistemaPorOmision`). El tanque,
 * cerrado, se niega en `resolverSistema` como cualquier otra cerrada.
 *
 * Una entrada sin `metaDe` no puede servir a estas herramientas —sin rótulo
 * ni unidad no se cita una cifra— y se dice. Toda configurada lo trae.
 */
import { SISTEMA, sistemasDeSenal } from '../../../../shared/eva/comun/sistemas.js'
import { configuradasEnServicio, sistemaPorOmision } from '../../reportes/sistemaPorOmision.mjs'
import { bandaLegible } from './formato.mjs'
import { fallo } from './respuesta.mjs'

/**
 * @param {{ resolverSistema: (id: string) => ({ok: true, sistema: object}|{ok: false, error: string}) }} deps
 */
export function crearResolvedorDeSenales({ resolverSistema }) {
  /** La máquina pedida (id, nombre o alias, con la guarda de cerrada) o la única en servicio. */
  function sistemaDe(sistemaId) {
    if (sistemaId !== undefined && sistemaId !== null && String(sistemaId).trim()) {
      return resolverSistema(sistemaId)
    }
    const unica = sistemaPorOmision()
    if (unica) return { ok: true, sistema: unica }
    const enServicio = configuradasEnServicio().map((s) => s.id)
    return fallo(
      enServicio.length
        ? `Hay ${enServicio.length} máquinas en servicio: di de cuál hablas (${enServicio.join(', ')}).`
        : 'No hay ninguna máquina configurada en servicio en esta planta.',
      { sistemas: enServicio },
    )
  }

  /** Las etiquetas de las señales con serie de una máquina, para ofrecerlas en una negativa. */
  function conSerieDe(entrada) {
    return (entrada?.series?.historizadas?.() ?? []).map((k) => entrada.etiquetaDe?.(k) ?? k)
  }

  /**
   * @returns {{ok: true, clave: string, meta: object, sistemaId: string, historizada: boolean, conSerie: string[]}|{ok: false, error: string}}
   */
  function resolverSenalDeSistema(senal, sistemaId) {
    const elegido = sistemaDe(sistemaId)
    if (!elegido.ok) return elegido
    const s = elegido.sistema
    const id = s.id

    if (!s.metaDe) {
      return fallo(
        `«${s.nombre}» no declara metaDe(): sin rótulo ni unidad por señal estas herramientas no ` +
          `pueden citar sus cifras. Su estado de ahora sí se puede dar con estado_del_sistema(sistema="${id}").`,
        { sistema: id },
      )
    }

    const todos = sistemasDeSenal(senal)
    const encontrados = todos.filter((x) => x.sistema === id)
    if (!encontrados.length) {
      /* Si el nombre es de OTRA máquina se dice cuál —y si está cerrada—, para
         que el modelo no lo reintente con otro nombre a ciegas. */
      const otras = [...new Set(todos.map((x) => x.sistema))].map((otro) => {
        const e = SISTEMA[otro]
        return e ? `«${e.nombre}»${e.cerrado ? ' (cerrada)' : ''}` : otro
      })
      if (!otras.length) {
        /* En ninguna: se dice dónde se buscó, para que el modelo no reintente
           con otro nombre a ciegas ni cite una sola máquina. */
        const buscadas = Object.values(SISTEMA).map((e) => `«${e.nombre}» (${e.claves().length} señales)`)
        return fallo(
          `«${senal}» no es una señal de «${s.nombre}» ni de ninguna máquina de esta planta. Se buscó en ` +
            `${buscadas.join(' y ')}. Sus señales se llaman como las enseña estado_del_sistema(sistema="${id}").`,
          { sistema: id, sistemas: Object.keys(SISTEMA) },
        )
      }
      return fallo(
        `«${senal}» no es una señal de «${s.nombre}». Sí existe en ${otras.join(' y ')}. ` +
          `Sus señales se llaman como las enseña estado_del_sistema(sistema="${id}").`,
        { sistema: id, enOtras: todos.map((x) => x.sistema) },
      )
    }
    if (encontrados.length > 1) {
      return fallo(
        `«${senal}» no identifica UNA señal de «${s.nombre}»: encaja con ${encontrados.length} ` +
          `(${encontrados.map((x) => s.etiquetaDe(x.clave) ?? x.clave).join('; ')}). Pregunta cuál.`,
        { sistema: id, claves: encontrados.map((x) => x.clave) },
      )
    }

    const { clave } = encontrados[0]
    return {
      ok: true,
      clave,
      meta: s.metaDe(clave),
      sistemaId: id,
      historizada: Boolean(s.esHistorizada?.(clave)),
      conSerie: conSerieDe(s),
    }
  }

  /** La meta de una clave en una máquina, o `null`. */
  const metaDe = (clave, sistemaId) => SISTEMA[sistemaId]?.metaDe?.(clave) ?? null

  /** La banda declarada por el tipo para una clave (`{min, avisoMin, avisoMax, max}`), o `null`. */
  const bandaDe = (clave, sistemaId) => SISTEMA[sistemaId]?.bandaDe?.(clave) ?? null

  /** `{ banda }` legible para la respuesta si hay banda; `{}` si no. */
  function extraBanda(clave, sistemaId, idioma = 'es') {
    const u = bandaDe(clave, sistemaId)
    return u ? { banda: bandaLegible(u, idioma) } : {}
  }

  /** Las etiquetas con serie de la máquina pedida (o la única en servicio); vacío si no hay. */
  function conSeriePorOmision(sistemaId) {
    const elegido = sistemaDe(sistemaId)
    return elegido.ok ? conSerieDe(elegido.sistema) : []
  }

  return { sistemaDe, resolverSenalDeSistema, metaDe, bandaDe, extraBanda, conSeriePorOmision }
}
