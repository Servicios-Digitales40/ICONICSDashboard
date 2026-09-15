/**
 * El ciclo de vida de un aviso — Plan 31 F3.
 *
 * ── QUÉ DECIDE ESTE ARCHIVO, Y QUÉ NO ───────────────────────────────
 *
 * Decide QUÉ avisos existen en un instante y en qué estado está cada uno. No
 * los pinta, no los narra y no los diagnostica: recibe los riesgos activos de
 * ahora más los avisos que ya había, y devuelve la lista resultante.
 *
 * Vive en `shared/` porque es una regla de negocio, no de presentación
 * (`CLAUDE.md` §4.3): «un aviso se queda hasta que alguien lo lea» y «un riesgo
 * que parpadea no re-narra» son decisiones del dominio. Una vista que las
 * reimplementara con sus propios `if` acabaría discrepando de la siguiente.
 *
 * ── LA DECISIÓN DE FONDO: EL AVISO SOBREVIVE AL RIESGO ──────────────
 *
 * Decidido el 15-09-2026. La alternativa —que el aviso desapareciera al
 * apagarse el riesgo— dejaba la vista siempre hablando del presente, y es lo
 * que parecía más limpio. Se descartó por un caso concreto: un riesgo que se
 * enciende veinte minutos de madrugada y se apaga solo no habría dejado ni
 * rastro en la pantalla que existe para avisar de él. Quedaría en el diario,
 * sí, pero el diario es donde se mira DESPUÉS de saber que hay algo que mirar.
 *
 * ── Y EL PROBLEMA QUE ESO CREA, QUE ES LA MITAD DEL ARCHIVO ─────────
 *
 * Si un aviso sobrevive a su riesgo, la vista pasa a mezclar presente y pasado.
 * Dos avisos con el mismo aspecto —uno de un riesgo que sigue activo AHORA y
 * otro de uno que se apagó hace una hora— es exactamente la forma de que la
 * gente deje de mirar la pantalla: si no se puede distinguir lo urgente de lo
 * histórico de un vistazo, todo se lee como histórico.
 *
 * Por eso `estado` no es decoración: es lo que hace sostenible la decisión de
 * arriba. Un aviso `vigente` y uno `resuelto` son cosas distintas y se dicen
 * distinto.
 *
 * ── LO QUE NO SE INVENTA ────────────────────────────────────────────
 *
 * `resuelto` significa «este riesgo ya no está activo», NO «alguien lo
 * arregló». Nadie ha confirmado nada: el riesgo dejó de cumplirse, que puede
 * ser porque se resolvió, porque la bomba se paró o porque el sensor dejó de
 * dar dato. El nombre dice lo que se midió y el texto de la vista no promete
 * más (§2.5).
 */

/** Los dos estados de un aviso. */
export const ESTADO_AVISO = Object.freeze({
  /** Su riesgo sigue activo ahora mismo. */
  VIGENTE: 'vigente',
  /** Su riesgo dejó de estar activo. Nadie ha confirmado que se arreglara. */
  RESUELTO: 'resuelto',
})

/**
 * Cuánto tiempo no se vuelve a narrar el mismo riesgo.
 *
 * ── POR QUÉ HACE FALTA UN COOLDOWN ──────────────────────────────────
 *
 * Porque narrar cuesta una llamada al modelo, y con el 4B son 30-90 s. Un
 * contacto que rebota —un presostato en el límite, un caudalímetro con ruido—
 * puede encender y apagar su riesgo cada pocos segundos: sin cooldown, cada
 * rebote encolaría otra narración y el modelo quedaría ocupado durante minutos
 * sin que nadie lo haya pedido, mientras el asistente de al lado espera turno
 * (ver `ia/conversacion/cola.mjs`).
 *
 * ── POR QUÉ 30 MINUTOS ──────────────────────────────────────────────
 *
 * Es el orden de magnitud en el que la NARRACIÓN deja de valer, no el riesgo.
 * El texto describe una situación —«caudal alto con presión baja»— que a media
 * hora vista puede haber cambiado de causa. Menos tiempo no protegería del
 * rebote (que es de segundos); mucho más dejaría un párrafo describiendo una
 * planta que ya no es esa.
 *
 * No es un umbral medido y no se presenta como tal: es una elección de diseño
 * con su razón escrita. Si alguna vez se mide cada cuánto rebota de verdad un
 * riesgo en esta planta, este número es lo que hay que revisar.
 */
export const COOLDOWN_NARRACION_MS = 30 * 60 * 1000

/** El id estable de un aviso: la MÁQUINA y el RIESGO, nunca el momento. */
export function idDeAviso(sistema, riesgoId) {
  /*
   * ── POR QUÉ NO SE USA `diagnosticEventId` ───────────────────────────
   *
   * Porque identifica UNA LLAMADA al motor, no un aviso: `diagnostico.mjs` lo
   * genera con `Date.now()` en cada `diagnosticar()`, así que pedir dos veces
   * el mismo riesgo da dos ids. Usarlo aquí convertiría cada sondeo en un
   * aviso «nuevo» y la vista crecería sin parar con el mismo hallazgo repetido.
   *
   * Lleva el sistema delante por `NO_COMPARTEN`: dos máquinas pueden tener un
   * riesgo con el mismo id y no son el mismo aviso.
   */
  return `${sistema}:${riesgoId}`
}

/**
 * Reconcilia los avisos que había con los riesgos activos de ahora.
 *
 * Es la única función que decide el ciclo de vida, y es PURA: mismos
 * argumentos, mismo resultado. El reloj entra por parámetro (`ahora`) en vez de
 * leerse dentro, que es lo que permite probar el cooldown sin esperar media
 * hora.
 *
 * @param {object} [args]
 * @param {object[]} [args.previos]   los avisos que ya estaban en la vista
 * @param {{sistema: string, riesgo: object}[]} [args.activos]  los riesgos activos AHORA
 * @param {number} [args.ahora]     ms desde la época
 * @param {number} [args.cooldownMs]
 * @returns {{avisos: object[], aNarrar: object[]}}
 *   `avisos` es la lista completa ya reconciliada; `aNarrar` son los que
 *   necesitan una llamada al modelo —el subconjunto que CUESTA— separado a
 *   propósito para que quien llame no tenga que deducirlo.
 */
export function reconciliarAvisos({
  previos = [],
  activos = [],
  ahora = Date.now(),
  cooldownMs = COOLDOWN_NARRACION_MS,
} = {}) {
  const porId = new Map(previos.map((a) => [a.id, a]))
  const activosPorId = new Map(
    activos.map(({ sistema, riesgo }) => [idDeAviso(sistema, riesgo.id), { sistema, riesgo }])
  )

  const avisos = []
  const aNarrar = []

  /*
   * Primero los ACTIVOS, en el orden en que llegan: son el presente y encabezan
   * la lista. Los resueltos van después (ver el segundo bucle) — no por
   * severidad, sino porque «lo que está pasando» antes que «lo que pasó» es el
   * único orden que no obliga a leer la lista entera para saber si hay algo
   * urgente.
   */
  for (const [id, { sistema, riesgo }] of activosPorId) {
    const previo = porId.get(id)

    /*
     * Se re-narra cuando no había narración o cuando la que hay ya caducó. Un
     * aviso que vuelve a estar vigente NO se narra de nuevo por el hecho de
     * volver: es el mismo hallazgo, y el rebote es precisamente lo que el
     * cooldown existe para no pagar.
     */
    const narracionCaducada =
      !previo?.narradoEn || ahora - previo.narradoEn >= cooldownMs

    const aviso = {
      id,
      sistema,
      riesgo,
      estado: ESTADO_AVISO.VIGENTE,
      /*
       * `vistoEn` se CONSERVA aunque el riesgo vuelva a activarse. Es una
       * decisión: quien ya leyó este aviso no necesita que reaparezca como
       * nuevo cada vez que el contacto rebota. Si el riesgo se apaga y se
       * enciende horas después, la narración habrá caducado y el texto será
       * nuevo, que es la señal útil.
       */
      vistoEn: previo?.vistoEn ?? null,
      narracion: previo?.narracion ?? null,
      narradoEn: previo?.narradoEn ?? null,
      diagnostico: previo?.diagnostico ?? null,
      /* Cuándo se vio activo por primera vez, para poder decir «desde las 10:15». */
      desde: previo?.desde ?? ahora,
      /* Un aviso vigente no tiene hora de resolución; si la traía, se borra. */
      resueltoEn: null,
    }

    avisos.push(aviso)
    if (narracionCaducada) aNarrar.push(aviso)
  }

  /*
   * Y ahora los que YA NO están activos. Sobreviven —es la decisión del
   * 15-09-2026— pero marcados, y sólo mientras nadie los haya leído: un aviso
   * resuelto Y visto no tiene ningún trabajo pendiente que representar.
   */
  for (const previo of previos) {
    if (activosPorId.has(previo.id)) continue
    if (previo.vistoEn) continue

    avisos.push({
      ...previo,
      estado: ESTADO_AVISO.RESUELTO,
      /*
       * Se sella la PRIMERA vez que se ve apagado y no se vuelve a tocar: si se
       * reescribiera en cada reconciliación, «resuelto hace 5 min» diría
       * siempre 5 minutos por muchas horas que pasaran.
       */
      resueltoEn: previo.resueltoEn ?? ahora,
    })
  }

  /*
   * Los resueltos NO se re-narran nunca: no se añade ninguno a `aNarrar`. Narrar
   * un riesgo que ya no está activo gastaría el modelo en describir un presente
   * que no existe, y el texto diría «está pasando» sobre algo que pasó.
   */
  return { avisos, aNarrar }
}

/**
 * Marca un aviso como leído por esta persona.
 *
 * Devuelve una lista NUEVA; no muta. Un aviso resuelto y leído desaparece en la
 * siguiente reconciliación —ya no hay nada que representar— y uno vigente y
 * leído se queda, porque su riesgo sigue ahí: «visto» no apaga un riesgo.
 */
export function marcarVisto(avisos, id, ahora = Date.now()) {
  return avisos.map((a) => (a.id === id ? { ...a, vistoEn: a.vistoEn ?? ahora } : a))
}
