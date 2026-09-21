/**
 * backend/lib/verificarConfiguracion.mjs
 * ------------------------------------------------------------------
 * ¿Sigue siendo cierta una máquina configurada? Plan 33 F8.
 *
 * ── LA PREGUNTA QUE CONTESTA, Y LA QUE NO ──────────────────────────
 *
 * `problemasDeMaquina()` (en `shared/`) dice si una configuración está bien
 * FORMADA: que tenga raíz, que su tipo exista, que sus raíces no se solapen.
 * Eso es dominio puro y se prueba sin red.
 *
 * Esto dice otra cosa: si además sigue siendo **cierta**. Una configuración
 * impecable puede apuntar a tags que alguien borró ayer, y eso no se puede
 * saber sin preguntarle al servidor.
 *
 * Confundirlas sería grave en la dirección peligrosa: una máquina bien formada
 * que apunta a la nada pasaría por buena.
 *
 * ── LOS CUATRO ESTADOS, Y POR QUÉ SON CUATRO ───────────────────────
 *
 *   VALID     todo lo que declara responde.
 *   DEGRADED  falta parte NO esencial. Funciona, y lo confiesa.
 *   INVALID   no responde NADA. La configuración apunta a un sitio vacío.
 *   UNKNOWN   no se pudo comprobar.
 *
 * **`UNKNOWN` no es `INVALID`, y ésa es la distinción que justifica la fase.**
 * Que ICONICS esté caído no significa que la máquina haya dejado de existir.
 * Colapsarlos daría de baja la planta entera en un corte de red — y peor: la
 * daría de baja de forma convincente, con un estado rojo que parece
 * diagnóstico.
 *
 * Es el mismo principio que `CLAUDE.md` §2.4 aplica a los valores —la ausencia
 * de dato nunca se disfraza de cero— un nivel más arriba: aquí la ausencia de
 * COMPROBACIÓN no se disfraza de comprobación fallida.
 *
 * ── CÓMO SE SABE QUE UN PUNTO YA NO ESTÁ ───────────────────────────
 *
 * `readPoints` OMITE del payload los puntos que el servidor no devolvió («para
 * el motor de sondeo eso es un hueco, que es lo que es»). Así que la ausencia
 * en la respuesta es la señal: el punto no está.
 *
 * Lo que NO es señal de nada es la CALIDAD. Un punto con calidad mala existe
 * —el servidor lo conoce y contesta por él— y lo que pasa es que su sensor no
 * entrega. Tratar eso como «configuración rota» marcaría en rojo una máquina
 * cuya única falta es tener un sensor averiado, que es exactamente lo que el
 * tablero debe poder enseñar.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ─────────────────────────────────────
 *
 * **No repara.** Una variable que desaparece y reaparece con otro nombre puede
 * ser un renombrado o puede ser OTRA variable. El sistema informa; una persona
 * decide. `CLAUDE.md` §2.5: no se inventa lo que falta.
 *
 * **No escribe.** Guardar el resultado es de `indices/maquinas.mjs`
 * (`anotarRevision`). Separarlo es lo que permite probar esto sin tocar disco.
 */
import { ESTADO_CONFIGURACION } from '../../shared/eva/comun/configuracionMaquina.js'

/**
 * Contrasta una máquina configurada contra ICONICS.
 *
 * @param {object} maquina  su configuración
 * @param {object} deps
 * @param {(puntos: string[]) => Promise<object>} deps.leerPuntos  normalmente
 *   `client.readPoints`. Entra por la puerta para poder probar esto con un
 *   servidor de mentira sin montar el cliente entero.
 * @returns {Promise<{estado: string, motivo: string, variables: object[], resumen: object}>}
 */
export async function verificarMaquina(maquina, { leerPuntos }) {
  const variables = maquina?.variables ?? []

  /*
   * Una máquina sin variables no se puede comprobar, y eso NO es `INVALID`:
   * `problemasDeMaquina` ya la rechaza al guardarla, así que si está en disco
   * es que se guardó antes de esa guarda. Decir «no responde nada» sobre algo
   * que nunca declaró qué leer sería una respuesta a una pregunta que no se
   * hizo.
   */
  if (!variables.length) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo: 'Esta máquina no declara ninguna variable, así que no hay nada que comprobar.',
      variables: [],
      resumen: { total: 0, presentes: 0, ausentes: 0 },
    }
  }

  const puntos = variables.map((v) => v.pointName).filter(Boolean)

  let respuesta
  try {
    respuesta = await leerPuntos(puntos)
  } catch (error) {
    /*
     * Una excepción es no haber podido mirar, nunca un veredicto. Se conserva
     * el estado anterior de la máquina —quien llama decide si lo guarda— y se
     * dice qué pasó.
     */
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo: `No se pudo consultar ICONICS: ${error?.message ?? 'error desconocido'}.`,
      variables: variables.map((v) => ({ ...v, estado: ESTADO_CONFIGURACION.UNKNOWN })),
      resumen: { total: variables.length, presentes: 0, ausentes: 0 },
    }
  }

  /*
   * `readPoints` devuelve `ok: false` si CUALQUIERA de sus lotes falló, y lo
   * hace a propósito: «quien pide ocho señales y recibe seis sin saberlo pinta
   * una pantalla con dos huecos que parecen datos ausentes de la planta».
   *
   * Aquí eso significa exactamente `UNKNOWN`: puede que falten puntos y puede
   * que el puente no pudiera leer, y con la respuesta en la mano no se
   * distingue. Tratarlo como `INVALID` convertiría un corte de red en una
   * máquina dada de baja.
   */
  if (!respuesta?.ok) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo:
        `ICONICS no contestó a la lectura (${respuesta?.error ?? `HTTP ${respuesta?.status}`}). ` +
        'No se sabe si los puntos siguen existiendo: no se ha podido mirar.',
      variables: variables.map((v) => ({ ...v, estado: ESTADO_CONFIGURACION.UNKNOWN })),
      resumen: { total: variables.length, presentes: 0, ausentes: 0 },
    }
  }

  const devueltos = respuesta.payload ?? {}

  /*
   * La CALIDAD no se mira, y es deliberado: un punto con calidad mala existe
   * —el servidor contesta por él— y lo que falla es su sensor. Marcar eso como
   * configuración rota pondría en rojo una máquina cuya única falta es tener un
   * sensor averiado.
   */
  const revisadas = variables.map((v) => ({
    ...v,
    estado: Object.hasOwn(devueltos, v.pointName)
      ? ESTADO_CONFIGURACION.VALID
      : ESTADO_CONFIGURACION.INVALID,
  }))

  const ausentes = revisadas.filter((v) => v.estado === ESTADO_CONFIGURACION.INVALID)
  const presentes = revisadas.length - ausentes.length

  const resumen = { total: revisadas.length, presentes, ausentes: ausentes.length }

  if (!ausentes.length) {
    return {
      estado: ESTADO_CONFIGURACION.VALID,
      motivo: `Las ${presentes} variables declaradas siguen existiendo en ICONICS.`,
      variables: revisadas,
      resumen,
    }
  }

  /*
   * ── NINGUNA RESPONDE: `INVALID` ────────────────────────────────────
   *
   * Y sólo aquí. Que falten todas, habiendo contestado el servidor, es lo que
   * distingue «esta configuración apunta a un sitio que ya no existe» de «se
   * borraron unos tags»: una rama entera renombrada, una raíz que cambió.
   *
   * Con el servidor caído no se llega hasta aquí — eso salió arriba como
   * `UNKNOWN`.
   */
  if (!presentes) {
    return {
      estado: ESTADO_CONFIGURACION.INVALID,
      motivo:
        `Ninguna de las ${ausentes.length} variables declaradas existe ya en ICONICS. La ` +
        'configuración apunta a puntos que el servidor no reconoce: probablemente la rama se ' +
        'renombró o se movió.',
      variables: revisadas,
      resumen,
    }
  }

  /*
   * ── FALTAN ALGUNAS: `DEGRADED`, Y SE DICE CUÁLES ───────────────────
   *
   * La máquina sigue sirviendo con lo que queda. Lo que no puede es callarlo:
   * una máquina a la que le faltan diez de setenta y tres puntos contesta por
   * sesenta y tres, y quien pregunte por una de las diez merece saber que
   * falta, no un hueco indistinguible de un sensor parado.
   *
   * Los nombres viajan —hasta cinco en el motivo, todos en `variables`—:
   * «faltan 10» no le sirve a quien tiene que ir a buscarlas.
   */
  const muestra = ausentes.slice(0, 5).map((v) => v.pointName)
  return {
    estado: ESTADO_CONFIGURACION.DEGRADED,
    motivo:
      `${ausentes.length} de ${revisadas.length} variables ya no existen en ICONICS: ` +
      `${muestra.join(', ')}${ausentes.length > muestra.length ? '…' : ''}. La máquina sigue ` +
      'leyendo las demás, pero no puede contestar por éstas.',
    variables: revisadas,
    resumen,
  }
}
