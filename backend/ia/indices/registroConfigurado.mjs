/**
 * backend/ia/indices/registroConfigurado.mjs
 * ------------------------------------------------------------------
 * Que el REGISTRO de sistemas conozca las máquinas configuradas. Plan 38 F1.
 *
 * ── LO QUE FALTABA, Y POR QUÉ IMPORTA ─────────────────────────────
 *
 * `construirSistema()` sabía convertir una configuración en una entrada del
 * registro desde el Plan 33 F3, y `registrarSistema()` sabía meterla. Pero
 * **nadie los llamaba fuera de las pruebas**. El resultado: una máquina
 * configurada existía para la pantalla de Configuración y para nada más. El
 * asistente no la resolvía (`SISTEMA[id]` daba `undefined`), los casos previos
 * no podían nombrarla (`z.enum(SISTEMA_IDS)` la rechazaba), el motor de
 * diagnóstico no tenía sus reglas, y los manuales no se le podían asignar.
 *
 * Este módulo cierra ese hueco con UNA función que se llama al arrancar y
 * después de cada escritura en `maquinas.json`.
 *
 * ── SINCRONIZAR ES REHACER, NO PARCHEAR ───────────────────────────
 *
 * La entrada del registro es una FOTO de la configuración: qué puntos lee, qué
 * series tiene verificadas, qué roles cubre. Editar la máquina, sondear sus
 * series o quitarla del tablero cambian esa foto. En vez de intentar mantener
 * la entrada al día campo a campo —que es cómo dos copias de la misma verdad
 * acaban discrepando—, se quitan TODAS las configuradas y se vuelven a
 * registrar desde el archivo. Son un puñado de máquinas; rehacerlas cuesta
 * menos que razonar sobre qué cambió.
 *
 * ── LO QUE SE TOLERA Y LO QUE NO ──────────────────────────────────
 *
 * **El solape de raíz con una máquina escrita a mano se tolera y se registra
 * en el arranque.** Sirvió para la transición en que vibraciones existió dos
 * veces —en código y configurada—; desde el Plan 40 F3 la única escrita a
 * mano es el tanque, con otras raíces, y la tolerancia no encuentra solapes.
 * Se conserva para cuando el tanque se configure por el mismo camino.
 *
 * **Una configuración que no se puede construir se OMITE y se dice.** Un tipo
 * desconocido, una máquina sin variables: se registra el motivo y el resto
 * sigue. Tumbar el arranque por una configuración rota dejaría fuera también
 * a las buenas; callar la omisión dejaría una máquina en la pantalla de
 * Configuración que el asistente no conoce sin que nada lo explique.
 *
 * **Las desactivadas no se registran.** Siguen en disco por su historia
 * (`eliminar` las desactiva cuando hay casos que las nombran), pero no son
 * máquinas en servicio.
 *
 * **Las INVALID tampoco (Plan 39 F6).** Una máquina cuya última revisión no
 * encontró la raíz ni un punto que respondiera no tiene nada que contestar, y
 * aparecer en `sistemas_de_la_planta` sería fingir. `UNKNOWN` y `DEGRADED` sí
 * entran: que ICONICS no contestara, o que falten puntos no esenciales, no es
 * que la máquina no exista — y `construirSistema` lo pone en sus
 * `limitaciones` para que el asistente lo diga. La revisión (`anotarRevision`)
 * resincroniza, así que una INVALID que vuelva a pasar entra sola.
 */
import { ESTADO_CONFIGURACION } from '../../../shared/eva/comun/configuracionMaquina.js'
import { construirSistema } from '../../../shared/eva/comun/construirSistema.js'
import {
  desregistrarSistema,
  registrarSistema,
  sistemasConfigurados,
} from '../../../shared/eva/comun/sistemas.js'
import { tipoDe } from '../../../shared/eva/tipos/index.js'
import { logger } from '../../logger.mjs'

/**
 * Rehace las entradas configuradas del registro desde el gestor.
 *
 * @param {{ listar: () => Promise<object[]> }} gestorMaquinas
 * @returns {Promise<{registradas: string[], omitidas: {id: string, motivo: string}[], solapes: object[]}>}
 */
export async function sincronizarRegistroConfigurado(gestorMaquinas) {
  for (const s of sistemasConfigurados()) desregistrarSistema(s.id)

  const registradas = []
  const omitidas = []
  const solapes = []

  const maquinas = await gestorMaquinas.listar()
  for (const maquina of maquinas) {
    if (maquina.activa === false) {
      omitidas.push({ id: maquina.id, motivo: 'desactivada: tiene casos previos que la nombran y no está en servicio' })
      continue
    }
    if (maquina.estado === ESTADO_CONFIGURACION.INVALID) {
      omitidas.push({
        id: maquina.id,
        motivo:
          `INVALID en su última revisión (${maquina.revisada ? String(maquina.revisada).slice(0, 10) : 'sin fecha'}): ` +
          'falta la raíz o ningún punto respondió, así que no hay nada que contestar de ella. ' +
          `Vuelve a comprobarla (POST /api/maquinas/${maquina.id}/verificar); si pasa, entra sola.`,
      })
      continue
    }
    try {
      const entrada = construirSistema(maquina, tipoDe(maquina.tipo))
      registrarSistema(entrada, { toleraSolapeConEscritas: true })
      registradas.push(maquina.id)
      for (const s of entrada.solapes ?? []) solapes.push({ maquina: maquina.id, ...s })
    } catch (error) {
      omitidas.push({ id: maquina.id, motivo: error?.message ?? String(error) })
    }
  }

  if (registradas.length || omitidas.length) {
    logger.info(
      `Registro sincronizado con maquinas.json: ${registradas.length} máquina(s) configurada(s) ` +
        `registrada(s)${omitidas.length ? `, ${omitidas.length} omitida(s)` : ''}.`,
      { registradas, omitidas },
    )
  }
  for (const s of solapes) {
    logger.warn(
      `La máquina configurada «${s.maquina}» comparte raíz con «${s.con}» (escrita a mano): ` +
        `«${s.raiz}» ⊂ «${s.suya}». sistemaDePunto() atribuye esos puntos a la escrita a mano.`,
      s,
    )
  }
  for (const o of omitidas) {
    if (!o.motivo.startsWith('desactivada')) {
      logger.warn(`La máquina configurada «${o.id}» NO se registró: ${o.motivo}`, o)
    }
  }

  return { registradas, omitidas, solapes }
}

/**
 * El gestor, con el registro rehecho tras cada escritura.
 *
 * Envuelve las cuatro operaciones que cambian el archivo. La lectura no se
 * toca. Si la sincronización falla, la escritura ya se hizo —el archivo es la
 * verdad— y se registra el fallo en vez de ocultarlo o de deshacer nada.
 */
export function conRegistroSincronizado(gestorMaquinas) {
  const tras = (nombre) => async (...args) => {
    const resultado = await gestorMaquinas[nombre](...args)
    try {
      await sincronizarRegistroConfigurado(gestorMaquinas)
    } catch (error) {
      logger.error(
        `maquinas.json se escribió (${nombre}) pero el registro no se pudo rehacer: ${error?.message}. ` +
          'El tablero y el asistente pueden estar viendo la configuración anterior hasta el próximo arranque.',
        { operacion: nombre, error: error?.message },
      )
    }
    return resultado
  }

  return {
    ...gestorMaquinas,
    crear: tras('crear'),
    editar: tras('editar'),
    eliminar: tras('eliminar'),
    anotarRevision: tras('anotarRevision'),
  }
}
