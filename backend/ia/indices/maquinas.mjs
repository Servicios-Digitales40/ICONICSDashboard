/**
 * backend/ia/indices/maquinas.mjs
 * ------------------------------------------------------------------
 * Leer y escribir `datos/maquinas.json`: las máquinas configuradas por la
 * vista de `Planta > Configuración`. Plan 33 F2.
 *
 * ── POR QUÉ AQUÍ Y NO EN `shared/` ─────────────────────────────────
 *
 * Porque esto toca disco, y `shared/` es dominio puro (`CLAUDE.md` §2.7). La
 * FORMA de una configuración —qué campos tiene, qué la hace válida— vive en
 * `shared/eva/comun/configuracionMaquina.js`, y este archivo se apoya en ella.
 *
 * Es el mismo reparto que ya separa `manuales.js` (forma) de este mismo
 * directorio, `indices/manuales.mjs` (disco). No es una convención estética:
 * es lo que permite que la vista de configuración valide con las MISMAS reglas
 * que el backend, sin que el frontend tenga que importar nada que sepa de
 * ficheros.
 *
 * ── POR QUÉ NO HAY BASE DE DATOS ───────────────────────────────────
 *
 * `CLAUDE.md` §2.2: la persistencia de este proyecto es JSON. Un puñado de
 * máquinas no justifica un motor, y `lib/jsonAtomico.mjs` ya resuelve lo único
 * que de verdad hacía falta —que dos escrituras simultáneas no se pisen— con
 * un candado por archivo.
 *
 * Si algún día son cientos, se revisa CON MEDICIÓN. Escribirlo aquí es lo que
 * impide que la revisión se haga por intuición.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ─────────────────────────────────────
 *
 * **No comprueba contra ICONICS.** Valida que la configuración esté bien
 * FORMADA; que además siga siendo CIERTA —que sus puntos existan todavía— es
 * `lib/verificarConfiguracion.mjs`, y es una pregunta distinta que necesita
 * red.
 *
 * **No construye entradas del registro.** Eso es F3. Aquí sólo se guarda y se
 * lee; nadie consume esto todavía, y es deliberado: F2 es persistencia, y una
 * fase de persistencia que además cambie lo que hace el programa no se puede
 * distinguir de una regresión si falla.
 */
import { readFile } from 'node:fs/promises'

import {
  configuracionVacia,
  crearAsset,
  crearMaquina,
  crearVariable,
  ESTADO_CONFIGURACION,
  normalizarConfiguracion,
  problemasDeMaquina,
  raicesDe,
} from '../../../shared/eva/comun/configuracionMaquina.js'

/**
 * Las variables de una máquina tras una edición: las que llegan, con lo que
 * ya se SABÍA de ellas conservado. Plan 36 F3.
 *
 * ── LO QUE ESTO EVITA ─────────────────────────────────────────────
 *
 * Un `PATCH` con `variables` sustituía la lista entera tal como llegaba. Y la
 * lista que llega de la pantalla no puede traer `historyVerified` —el esquema
 * lo rechaza a propósito: prometer historia es una afirmación sobre el
 * servidor que sólo el sondeo puede hacer—, así que editar una máquina para
 * añadirle una variable **borraba la verificación de las otras 36**. Sin
 * error: la máquina seguía válida, sólo que ciega para su pasado.
 *
 * Es el riesgo que el Plan 36 F3 señala como lo caro de la fase: «no es la
 * UI, es no perder información al guardar».
 *
 * ── LA REGLA ──────────────────────────────────────────────────────
 *
 * Una variable que llega se empareja con la anterior por `pointName` —es su
 * identidad en ICONICS; el `id` lo pone la pantalla y puede cambiar—. Si la
 * anterior existía y su `historyPointName` no cambió, conserva
 * `historyVerified` y `estado`: lo que se sondeó sigue siendo cierto de la
 * misma serie. Si cambió el punto histórico, la verificación ya no habla de
 * esa serie y vuelve a `false`, que es el valor seguro. Una variable nueva
 * pasa por `crearVariable`, como en el alta.
 *
 * Las variables que NO llegan se quitan: eso es lo que significa editar la
 * lista. Quitar una en silencio no es un riesgo aquí porque la pantalla las
 * enseña todas antes de guardar, incluidas las que el árbol ya no tiene.
 */
export function fusionarVariables(anteriores, entrantes) {
  const porPunto = new Map((anteriores ?? []).map(v => [v.pointName, v]))

  return (entrantes ?? []).map(entrante => {
    const nueva = crearVariable(entrante)
    const previa = porPunto.get(entrante.pointName)
    if (!previa) return nueva

    const mismaSerie = (previa.historyPointName ?? null) === (nueva.historyPointName ?? null)
    return {
      ...nueva,
      historyVerified: mismaSerie ? Boolean(previa.historyVerified) : false,
      estado: previa.estado ?? nueva.estado,
    }
  })
}
import { tipoDe } from '../../../shared/eva/tipos/index.js'
import { conCandado, escribirJsonAtomico } from '../../lib/jsonAtomico.mjs'
import { logger } from '../../logger.mjs'

/**
 * El gestor de máquinas configuradas.
 *
 * @param {object} opciones
 * @param {string} opciones.ruta  dónde vive `maquinas.json`
 */
export function createGestorMaquinas({ ruta }) {
  if (!ruta) {
    throw new Error(
      'createGestorMaquinas necesita `ruta`: dónde vive maquinas.json. Sin ella el gestor ' +
        'escribiría en un sitio indeterminado, que es peor que no arrancar.'
    )
  }

  /**
   * El archivo, con forma garantizada.
   *
   * ── POR QUÉ UN ARCHIVO ILEGIBLE NO ES UN ARCHIVO VACÍO ─────────
   *
   * `normalizarConfiguracion` descarta lo que no tiene lo mínimo, y eso está
   * bien: un JSON a medio escribir no debe propagar `undefined`. Lo que NO
   * está bien es que el descarte sea mudo.
   *
   * Aquí se cuenta cuántas entradas traía el archivo y cuántas sobrevivieron.
   * Si se perdió alguna, se registra con su número — porque «la máquina
   * desapareció del tablero» y «el archivo tenía una entrada corrupta» son la
   * misma observación desde dos sitios, y sin este log sólo se ve la primera.
   */
  async function leer() {
    let bruto
    try {
      bruto = JSON.parse(await readFile(ruta, 'utf8'))
    } catch (error) {
      /* Que no exista es normal: todavía no se ha configurado ninguna. Que
         exista y no se pueda leer, no — y esas dos no se confunden. */
      if (error?.code !== 'ENOENT') {
        logger.warn(
          `No se pudo leer ${ruta}. Se sigue con la configuración vacía: el tablero no verá ` +
            'ninguna máquina configurada, y las escritas a mano en el registro siguen igual.',
          { ruta, error: error?.message }
        )
      }
      return configuracionVacia()
    }

    const brutas = Array.isArray(bruto?.maquinas) ? bruto.maquinas.length : 0
    const config = normalizarConfiguracion(bruto)
    const perdidas = brutas - config.maquinas.length

    if (perdidas > 0) {
      logger.warn(
        `${perdidas} máquina(s) de ${ruta} se descartaron por no traer id o tipo. No se ` +
          'perdieron del archivo —no se ha reescrito— pero el tablero no las verá.',
        { ruta, perdidas, leidas: config.maquinas.length }
      )
    }

    return config
  }

  /** Todas las máquinas configuradas. */
  async function listar() {
    return (await leer()).maquinas
  }

  /** Una máquina por su id, o `null`. */
  async function obtener(id) {
    const buscado = String(id ?? '').trim()
    return (await leer()).maquinas.find(m => m.id === buscado) ?? null
  }

  /**
   * El contexto de validación de una máquina: los ids y las raíces de las
   * DEMÁS.
   *
   * Se calcula excluyendo la propia, y eso no es un detalle: al EDITAR una
   * máquina, sus propias raíces están en el archivo, y sin excluirlas se
   * solaparía consigo misma. Habría sido un rechazo imposible de entender
   * —«la raíz se solapa con la raíz»— sobre una edición legítima.
   */
  function contextoDe(maquinas, idPropio = null) {
    const otras = maquinas.filter(m => m.id !== idPropio)
    return {
      tipoDe,
      otrosIds: otras.map(m => m.id),
      otrasRaices: otras.flatMap(raicesDe),
    }
  }

  /**
   * Guarda una máquina nueva.
   *
   * Devuelve `{ ok: false, problemas }` en vez de lanzar: los problemas de una
   * configuración son de quien la escribió, y llegan a una pantalla que tiene
   * que poder pintarlos campo por campo. Ver `problemasDeMaquina`.
   */
  async function crear(datos) {
    return conCandado(ruta, async () => {
      const config = await leer()
      const maquina = crearMaquina(datos)

      /* Una sola pasada: `maquinaValida` es `problemas.every(p => p.aviso)`, y
         calcularlo dos veces sobre el mismo objeto sólo invita a que las dos
         llamadas se separen algún día y decidan cosas distintas. */
      const problemas = problemasDeMaquina(maquina, contextoDe(config.maquinas))
      const bloquean = problemas.filter(p => !p.aviso)
      if (bloquean.length) return { ok: false, problemas }

      config.maquinas.push(maquina)
      await escribirJsonAtomico(ruta, config)

      logger.info(
        `Máquina «${maquina.id}» dada de alta con ${maquina.variables.length} variable(s).`,
        { maquina: maquina.id, tipo: maquina.tipo, variables: maquina.variables.length }
      )

      /* Los avisos viajan aunque haya ido bien: son las limitaciones que la
         máquina tiene que confesar, no errores. */
      return { ok: true, maquina, avisos: problemas.filter(p => p.aviso) }
    })
  }

  /**
   * Modifica una máquina existente.
   *
   * ── LO QUE NO SE DEJA CAMBIAR, Y POR QUÉ ───────────────────────
   *
   * El `id`. Es lo que guardan los casos previos (`intervencion.sistema`), y
   * cambiarlo dejaría esos casos apuntando a una máquina que ya no existe con
   * ese nombre. Es la misma regla que impidió filtrar `SISTEMA_IDS` al cerrar
   * la estación de llenado: **ocultar o reconfigurar una máquina no puede
   * invalidar su historia**.
   *
   * Quien de verdad quiera otro id, crea otra máquina. Que sea trabajo es
   * correcto: mover los casos es una decisión, no un efecto colateral.
   */
  async function editar(id, cambios) {
    return conCandado(ruta, async () => {
      const config = await leer()
      const i = config.maquinas.findIndex(m => m.id === id)
      if (i === -1) return { ok: false, noExiste: true, problemas: [] }

      if (cambios?.id && cambios.id !== id) {
        return {
          ok: false,
          problemas: [
            {
              campo: 'id',
              problema:
                'El id de una máquina no se cambia: es lo que guardan sus casos previos, y ' +
                'cambiarlo los dejaría apuntando a una máquina que ya no existe con ese ' +
                'nombre. Para otro id, crea otra máquina.',
            },
          ],
        }
      }

      const anterior = config.maquinas[i]
      const variables = cambios?.variables
        ? fusionarVariables(anterior.variables ?? [], cambios.variables)
        : null

      /*
       * ── EL ESTADO DE LA MÁQUINA VUELVE A `UNKNOWN` SI CAMBIÓ QUÉ LEE ──
       *
       * `estado: VALID` significa «todos sus puntos siguen existiendo», y lo
       * anotó una comprobación sobre UNA lista de variables. Si la lista
       * cambia —se añaden 20 puntos que nadie ha mirado— ese veredicto ya no
       * habla de esta máquina. Se destapó usándola el 21-09-2026: una máquina
       * editada de 24 a 44 variables seguía diciendo `VALID` con 20 de ellas
       * en `UNKNOWN`. Cada variable conserva SU estado (`fusionarVariables`);
       * lo que se retira es la afirmación sobre el conjunto.
       *
       * Se compara por `pointName`: volver a guardar la misma lista no borra
       * nada.
       */
      const conjunto = lista => new Set((lista ?? []).map(v => v.pointName))
      const cambioQueLee =
        variables &&
        (conjunto(variables).size !== conjunto(anterior.variables).size ||
          [...conjunto(variables)].some(p => !conjunto(anterior.variables).has(p)))

      const actualizada = {
        ...anterior,
        ...cambios,
        id,
        ...(cambios?.assets ? { assets: cambios.assets.map(a => crearAsset(a)) } : {}),
        ...(variables ? { variables } : {}),
        ...(cambioQueLee ? { estado: ESTADO_CONFIGURACION.UNKNOWN } : {}),
      }
      const ctx = contextoDe(config.maquinas, id)

      const problemas = problemasDeMaquina(actualizada, ctx)
      if (problemas.some(p => !p.aviso)) return { ok: false, problemas }

      config.maquinas[i] = actualizada
      await escribirJsonAtomico(ruta, config)

      logger.info(`Máquina «${id}» actualizada.`, { maquina: id })
      return { ok: true, maquina: actualizada, avisos: problemas.filter(p => p.aviso) }
    })
  }

  /**
   * Da de baja una máquina.
   *
   * ── POR QUÉ ESTO NO BORRA CUANDO HAY HISTORIA ──────────────────
   *
   * Porque los casos previos guardan `sistema: "<id>"`, y borrar la máquina
   * dejaría once intervenciones —en el caso del tanque— con un `sistema` que
   * el backend no reconoce. `scripts/purgar-casos-invalidos.mjs` los daría por
   * inválidos.
   *
   * Es exactamente la decisión que ya se tomó al cerrar la estación de
   * llenado, y su motivo está escrito en `sistemas.js`: **ocultar una máquina
   * no puede invalidar su historia — eso no es cerrarla, es borrarla.**
   *
   * Así que quien llama dice cuántos casos tiene esa máquina, y con casos se
   * DESACTIVA. El código no consulta el índice de casos por su cuenta a
   * propósito: esa dependencia convertiría este módulo, que sólo sabe de un
   * archivo, en algo que necesita el motor entero para arrancar.
   */
  async function eliminar(id, { casosAsociados = 0 } = {}) {
    return conCandado(ruta, async () => {
      const config = await leer()
      const i = config.maquinas.findIndex(m => m.id === id)
      if (i === -1) return { ok: false, noExiste: true }

      if (casosAsociados > 0) {
        config.maquinas[i] = { ...config.maquinas[i], activa: false }
        await escribirJsonAtomico(ruta, config)

        logger.info(
          `Máquina «${id}» DESACTIVADA en vez de borrada: tiene ${casosAsociados} caso(s) ` +
            'previo(s) que la nombran, y borrarla los dejaría huérfanos.',
          { maquina: id, casos: casosAsociados }
        )
        return { ok: true, desactivada: true, casosAsociados }
      }

      config.maquinas.splice(i, 1)
      await escribirJsonAtomico(ruta, config)

      logger.info(`Máquina «${id}» eliminada: no tenía casos asociados.`, { maquina: id })
      return { ok: true, desactivada: false }
    })
  }

  /**
   * Anota el resultado de una comprobación contra ICONICS.
   *
   * Lo calcula `lib/verificarConfiguracion.mjs`; aquí sólo se guarda. Separarlo
   * es lo que permite que este módulo no necesite red — y que la comprobación
   * se pueda probar sin tocar disco.
   */
  async function anotarRevision(id, { estado, variables = null }, ahora = new Date()) {
    return conCandado(ruta, async () => {
      const config = await leer()
      const i = config.maquinas.findIndex(m => m.id === id)
      if (i === -1) return { ok: false, noExiste: true }

      config.maquinas[i] = {
        ...config.maquinas[i],
        estado,
        revisada: ahora.toISOString(),
        ...(variables ? { variables } : {}),
      }
      await escribirJsonAtomico(ruta, config)
      return { ok: true, maquina: config.maquinas[i] }
    })
  }

  return { listar, obtener, crear, editar, eliminar, anotarRevision }
}
