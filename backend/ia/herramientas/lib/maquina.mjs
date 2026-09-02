/**
 * backend/ia/herramientas/lib/maquina.mjs
 * ------------------------------------------------------------------
 * Leer UNA máquina del registro, resolver cuál es, y evaluar sus reglas.
 *
 * ── EL CONTEXTO ES AHORA UN PARÁMETRO, NO UNA CLAUSURA ─────────────
 *
 * Estas tres funciones vivían dentro de `createHerramientas`, y de las tres
 * sólo `leerMaquina` necesitaba algo de fuera: el `client` de ICONICS. Las
 * otras dos —`resolverSistema` y `evaluarRiesgosDe`— no necesitaban nada, y
 * estaban ahí por vecindad.
 *
 * Ahora el `client` entra por la puerta. No cambia lo que hacen; cambia que se
 * pueda ver qué necesitan sin leer 3000 líneas, y que se puedan probar dándoles
 * un cliente de mentira sin montar la factoría entera.
 *
 * ── POR QUÉ LAS TRES JUNTAS ────────────────────────────────────────
 *
 * Porque son la secuencia completa de una pregunta sobre una máquina: cuál es
 * (`resolverSistema`), cómo está (`leerMaquina`) y qué se deduce de eso
 * (`evaluarRiesgosDe`). Las tres herramientas de la familia `maquina/` llaman a
 * las tres en ese orden.
 */
import { SISTEMA, SISTEMAS } from '../../../../shared/eva/comun/sistemas.js'
import { evaluarRiesgos } from '../../../../shared/eva/tanque/riesgos.js'
import { evaluarRiesgosVibracion } from '../../../../shared/eva/vibraciones/riesgosVibracion.js'
import { isGoodQuality } from '../../../../shared/quality.js'
import { fallo } from './respuesta.mjs'

/**
 * Los ayudantes de máquina, atados a un cliente de ICONICS.
 *
 * @param {object} ctx
 * @param {object} ctx.client  el cliente de ICONICS (real o falso)
 */
export function crearAyudantesDeMaquina({ client }) {

/**
 * Lee TODOS los puntos de una máquina y devuelve su estado en la forma común.
 *
 * ── POR QUÉ UNA SOLA FUNCIÓN PARA TODAS ────────────────────────────
 *
 * Porque antes había dos, una por máquina, y cada herramienta se escribía
 * contra una de las dos formas. Ése es el motivo de que el tanque tuviera
 * ocho herramientas y vibraciones una: no faltaban por escribir, es que no
 * había forma común contra la que escribirlas.
 *
 * Que el chat y la pantalla vean lo mismo sigue garantizado igual: el estado
 * sale de `sistema.estado()`, que construye por dentro el MISMO objeto de
 * dominio que pinta la vista —viaja en `estado.dominio`—, con las mismas
 * lecturas y los mismos umbrales.
 *
 * La calidad se filtra aquí, en la frontera, exactamente igual que hace el
 * motor de sondeo del frontend: un valor de mala calidad llega como 0 y, sin
 * filtrar, el asistente diría «el tanque está al 0 %» de una instalación
 * llena. Un hueco es `null` y el dominio lo pinta como «sin dato».
 */
async function leerMaquina(sistema) {
  const puntos = sistema.puntos()
  const respuesta = await client.readPoints(puntos)
  if (!respuesta.ok) return { ok: false, error: respuesta.error, status: respuesta.status }

  const mapa = respuesta.payload ?? {}
  const receivedAt = new Date().toISOString()

  const valorDe = (punto) => {
    const entrada = mapa[punto]
    if (!entrada?.ok) return null
    const p = entrada.payload ?? {}
    const quality = p.quality ?? p.Quality ?? null
    if (!isGoodQuality(quality)) return null
    const v = p.value ?? p.Value
    return v === undefined ? null : v
  }

  return { ok: true, estado: sistema.estado(valorDe, sistema, receivedAt), receivedAt }
}

/**
 * `sistema` del argumento → entrada del registro, o el fallo que enseña al
 * modelo cuáles hay.
 *
 * ── POR QUÉ NO TIENE VALOR POR DEFECTO ─────────────────────────────
 *
 * Porque el defecto tendría que ser el tanque, y entonces una pregunta sobre
 * vibraciones a la que el modelo olvidara el argumento se contestaría
 * **correctamente sobre la máquina equivocada**: cifras reales, unidades
 * reales, y ni un error en el log. Es el fallo más caro de este proyecto y el
 * que la separación de sistemas existe para impedir.
 *
 * Fallar cuesta un turno y se corrige solo: el error trae la lista de ids.
 */
function resolverSistema(id) {
  if (!id) {
    return fallo(
      'Falta decir de qué sistema. Cada uno es una instalación SEPARADA, con su propio PLC, ' +
        'y contestar del otro sería contestar de otra máquina.',
      { sistemas: SISTEMAS.map((s) => ({ sistema: s.id, es: s.nombre })) }
    )
  }
  const s = SISTEMA[String(id).trim()]
  if (!s) {
    return fallo(`No hay ningún sistema llamado "${id}" en esta planta.`, {
      sistemas: SISTEMAS.map((x) => ({ sistema: x.id, es: x.nombre })),
    })
  }
  return { ok: true, sistema: s }
}

/**
 * El motor de reglas de una máquina, sobre su estado ya leído.
 *
 * ── POR QUÉ ESTO SIGUE SIENDO UN `switch` Y NO UN CAMPO ────────────
 *
 * Porque las dos funciones NO reciben lo mismo: `evaluarRiesgos` espera el
 * `Sistema` del tanque y `evaluarRiesgosVibracion` espera
 * `{ canales, variador, alarmas }`. Los dos salen de `estado.dominio`, pero
 * son objetos distintos, y declarar `riesgos: evaluarRiesgos` en el registro
 * exigiría que las dos aceptaran la misma entrada — es decir, reescribir los
 * dos motores de reglas contra la forma común.
 *
 * Eso es trabajo real y no está hecho, así que se dice en vez de fingirlo.
 * Mientras tanto, la máquina que se dé de alta añade su línea aquí.
 *
 * ── Y LA QUE NO LA AÑADA NO SALE EN VERDE ──────────────────────────
 *
 * Durante un tiempo se dijo aquí que `evaluadas: 0` era «visible en la
 * respuesta y no un silencio». No lo era: quien llama construía con eso un
 * `ok: true` que además afirmaba «ninguna: se pudieron evaluar todas las
 * reglas». El número estaba en el JSON y la frase decía lo contrario, y la
 * frase es lo que lee un modelo de lenguaje.
 *
 * El `default` sigue existiendo —una máquina sin motor es un estado válido
 * mientras se escribe el suyo—, pero ahora `riesgos_activos` lo convierte
 * en un fallo explícito. Este `default` NO es la salvaguarda; es la señal
 * que la salvaguarda lee.
 */
function evaluarRiesgosDe(sistema, estado) {
  switch (sistema.id) {
    case 'tanque':
      return evaluarRiesgos(estado.dominio)
    case 'vibraciones':
      return evaluarRiesgosVibracion(estado.dominio)
    default:
      return { activos: [], noEvaluables: [], evaluadas: 0 }
  }
}

/**
 * Una llamada SUELTA a `readHistory`, sin trocear — la pieza de más abajo
 * de `leerSerie()`. Existe separada porque tanto una ventana corta (un
 * único tramo) como cada tramo de una ventana larga acaban aquí.
 */

  return { leerMaquina, resolverSistema, evaluarRiesgosDe }
}
