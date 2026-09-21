/**
 * backend/lib/descubrirDesdeArbol.mjs
 * ------------------------------------------------------------------
 * Las variables de una máquina, PROPUESTAS desde el árbol de ICONICS.
 * Plan 34 F1.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────
 *
 * Porque hoy dar de alta una máquina es escribir su catálogo a mano —1 154
 * líneas en `vibraciones/vibraciones.js`— y el generador que existe
 * (`scripts/generar-configuracion-vibraciones.mjs`) lo deriva de ese mismo
 * catálogo. El flujo va al revés de donde está la verdad:
 *
 *   hoy       catálogo escrito a mano  →  configuración
 *   con esto  árbol de ICONICS         →  configuración
 *
 * Y la diferencia no es de comodidad. El 21-09-2026 se descubrió que el grupo
 * del historiador llevaba semanas siendo otro (`DEMO 3` → `DEMO_VIBRACIONES`,
 * Plan 34 F0): el catálogo afirmaba un árbol que ya no existía, y nadie se
 * enteró porque nada comparaba una cosa con la otra. **El árbol es la fuente
 * de verdad sobre qué existe**; este módulo es el que va a preguntárselo.
 *
 * ── PROPONE, NO DECIDE ────────────────────────────────────────────
 *
 * Todo lo que sale de aquí es una PROPUESTA para que una persona la revise en
 * `Planta › Configuración`. No escribe nada, no registra ninguna máquina y no
 * da por buena ninguna correspondencia.
 *
 * Es la misma línea que `verificarConfiguracion.mjs`: «el sistema informa; una
 * persona decide» (`CLAUDE.md` §2.5). Aquí pesa más todavía, porque una
 * variable mal emparejada no da error: da una pantalla que enseña la señal
 * equivocada con el rótulo correcto.
 *
 * ── EL EMPAREJAMIENTO `ac:` ↔ `hda:` NO SE DERIVA POR REGLA ───────
 *
 * Son dos árboles distintos, con distinto contenido y distinto nombre para la
 * misma señal:
 *
 *   ac:   73 puntos    ac:TDCON/DEMO_VIBRACIONES/Vibraciones/S1/vRMS_S1
 *   hda:  94 tags      hda:\Configuration\DEMO_VIBRACIONES\S1:vRMS_S1
 *
 * La intención es que el administrador de ICONICS mantenga las carpetas
 * iguales, y este módulo **saca partido de eso sin depender de ello**: cuando
 * el nombre final coincide, propone el emparejamiento; cuando no, lo deja
 * vacío y lo dice. Nunca lo inventa.
 *
 * Es la lección del incidente B10 (09-09-2026), que ya está escrita en
 * `crearVariable`: «no derivan uno del otro por regla fija». Un emparejamiento
 * derivado por patrón sobrevive hasta que alguien renombra una carpeta, y
 * entonces falla en silencio.
 *
 * El árbol real da la razón a esta cautela: hay erratas que sólo están en una
 * de las dos puntas —`Alarrma_S1` con dos erres en `ac:`, bien escrito en
 * `hda:`— y erratas de espaciado dentro del propio historiador (`LOWERLEVEL 2`
 * sin espacio junto a `LOWER LEVEL 1` con él, `UPER LEVEL 3` sin la P).
 * Ninguna regla de nombres acierta con eso; una persona mirándolo, sí.
 *
 * ── POR QUÉ VIVE EN `backend/` Y NO EN `shared/` ──────────────────
 *
 * Porque recorre ICONICS, y el dominio compartido no toca red (`CLAUDE.md`
 * §2.7). El reparto es el mismo que ya separa `configuracionMaquina.js` (la
 * forma, en `shared/`) de `verificarConfiguracion.mjs` (la red, aquí).
 *
 * La forma de las variables que devuelve la pone `crearVariable`, importada
 * de `shared/`: así una propuesta nace con los mismos valores seguros que
 * cualquier otra variable —`acceso: "read"`, `historyVerified: false`— y no
 * hay una segunda definición de qué es una variable válida.
 */
import {
  crearVariable,
  ESTADO_CONFIGURACION,
} from '../../shared/eva/comun/configuracionMaquina.js'
import {
  BARRA_HDA,
  canalesDe,
  clasificarArea,
  emparejarPorNombre,
  nombreFinal,
  normalizarRaizHistorica,
  proponerRol,
} from '../../shared/eva/comun/arbolIconics.js'

/*
 * ── LAS REGLAS PURAS SE MOVIERON A `shared/` (Plan 36 F1) ──────────
 *
 * `nombreFinal`, `proponerRol`, la clasificación de un área y el
 * emparejamiento por nombre vivían aquí hasta el 21-09-2026. La pantalla de
 * configuración las necesita también —tiene delante los mismos nodos— y
 * reescribirlas en el tablero habría sido dos copias de la misma regla
 * (`CLAUDE.md` §2.6). Viven en `shared/eva/comun/arbolIconics.js`; aquí se
 * re-exportan para que quien las importaba de este módulo siga funcionando.
 *
 * Lo que se queda aquí es lo que necesita red: el RECORRIDO.
 */
export { nombreFinal, proponerRol }

/**
 * ── LOS TRES ESPACIOS DE NOMBRES, QUE NO SON INTERCAMBIABLES ──────
 *
 * ICONICS publica esta máquina en tres sitios distintos, y confundirlos es el
 * defecto B10:
 *
 *   ac:   el valor EN VIVO      un punto por señal
 *   hda:  el ARCHIVO            un tag por serie
 *   ae:   las ALARMAS           un área con contadores y alarmas dentro
 *
 * El tercero no es «una variable más con otro prefijo», y por eso el
 * descubrimiento lo trata aparte: lo que cuelga de un área de AlarmWorX no se
 * lee igual ni significa lo mismo. Ver `descubrirAlarmas`.
 */

/**
 * Recorre una rama y devuelve sus puntos hoja, con su ruta.
 *
 * ── POR QUÉ DISTINGUE «NO HAY NADA» DE «NO SE PUDO MIRAR» ─────────
 *
 * Porque son la misma imagen desde fuera —una lista vacía— y significan cosas
 * opuestas. Una rama vacía es una rama vacía; una rama que dio 500 es una
 * pregunta sin contestar. Colapsarlas haría que un corte de red se leyera como
 * «esta máquina no tiene variables», que es el fallo que `UNKNOWN` existe para
 * evitar (Plan 33) y el mismo principio de `CLAUDE.md` §2.4.
 *
 * Por eso el recorrido acumula `fallos` en vez de tragárselos, y quien llama
 * los recibe junto a los hallazgos.
 */
async function recorrer(raiz, { explorar, profundidadMax }) {
  const puntos = []
  const fallos = []
  const vistas = new Set()

  async function bajar(ruta, profundidad) {
    if (profundidad > profundidadMax) {
      fallos.push({ ruta, motivo: `profundidad máxima (${profundidadMax}) alcanzada` })
      return
    }
    /* Un árbol con un ciclo colgaría el descubrimiento sin decir por qué. */
    if (vistas.has(ruta)) return
    vistas.add(ruta)

    let respuesta
    try {
      respuesta = await explorar(ruta)
    } catch (error) {
      fallos.push({ ruta, motivo: error?.message ?? 'error desconocido' })
      return
    }

    if (!respuesta?.ok) {
      fallos.push({
        ruta,
        motivo: respuesta?.error ?? `HTTP ${respuesta?.status ?? '?'}`,
      })
      return
    }

    for (const hijo of respuesta.payload ?? []) {
      const nombre = hijo?.pointName
      if (!nombre) continue

      /*
       * Hoja o rama. ICONICS marca las carpetas con `class: 1`, pero no en
       * todos los árboles: en `hda:` los tags cuelgan con `:` en el nombre y
       * las carpetas con contrabarra. Se usa la forma del nombre, que es lo
       * que vale en los dos, y la clase sólo como refuerzo.
       */
      const esHoja = nombre.includes(':') && !nombre.endsWith(BARRA_HDA)
        ? nombre.lastIndexOf(':') > nombre.lastIndexOf(BARRA_HDA)
        : false

      if (esHoja) {
        puntos.push({ pointName: nombre, corto: hijo.shortName ?? nombreFinal(nombre), rama: ruta })
      } else {
        await bajar(nombre, profundidad + 1)
      }
    }
  }

  await bajar(raiz, 0)
  return { puntos, fallos }
}

/**
 * Recorre el árbol EN VIVO (`ac:`) bajo una raíz y devuelve sus puntos.
 *
 * `ac:` no usa `:` para separar el tag, así que la heurística de hoja de
 * `recorrer` no sirve aquí: en este árbol una hoja es una rama sin hijos. Se
 * explora y lo que no devuelve nada es una hoja.
 */
async function recorrerEnVivo(raiz, { explorar, profundidadMax }) {
  const puntos = []
  const fallos = []
  const vistas = new Set()

  async function bajar(ruta, profundidad) {
    if (profundidad > profundidadMax) {
      fallos.push({ ruta, motivo: `profundidad máxima (${profundidadMax}) alcanzada` })
      return
    }
    if (vistas.has(ruta)) return
    vistas.add(ruta)

    let respuesta
    try {
      respuesta = await explorar(ruta)
    } catch (error) {
      fallos.push({ ruta, motivo: error?.message ?? 'error desconocido' })
      return
    }

    if (!respuesta?.ok) {
      fallos.push({ ruta, motivo: respuesta?.error ?? `HTTP ${respuesta?.status ?? '?'}` })
      return
    }

    const hijos = respuesta.payload ?? []

    /* Sin hijos y no es la raíz: es una hoja, o sea un punto. */
    if (!hijos.length && profundidad > 0) {
      puntos.push({ pointName: ruta, corto: nombreFinal(ruta), rama: null })
      return
    }

    for (const hijo of hijos) {
      if (hijo?.pointName) await bajar(hijo.pointName, profundidad + 1)
    }
  }

  await bajar(raiz, 0)
  return { puntos, fallos }
}

/**
 * Lo que un área de alarmas publica, clasificado por lo que se puede hacer
 * con ello.
 *
 * ── LOS TRES TIPOS DE HIJO, Y POR QUÉ SE SEPARAN ──────────────────
 *
 * Sondeada `ae:/DEMO VIBRACIONES` el 21-09-2026: **57 hijos**, y no son lo
 * mismo ni de lejos.
 *
 *   42  alarmas    `.Alarm_MonState_vRMS`, `.Error interno`…
 *    6  contadores `=ActiveUnackedCount`, `=NormalUnackedCount`…
 *    9  acciones   `\Acknowledge`, `\Silence`, `\ShelvedOn`…
 *
 * El prefijo del nombre corto es lo que los distingue, y es del servidor: un
 * punto para la alarma, un igual para el contador, una contrabarra para la
 * acción.
 *
 * ── LO QUE SE MIDIÓ, Y POR QUÉ CAMBIA QUÉ SE PUEDE OFRECER ────────
 *
 * **Los contadores leen; las alarmas individuales no.**
 *
 *   =ActiveUnackedCount    value=0    calidad 0           buena
 *   =NormalUnackedCount    value=17   calidad 0           buena
 *   .Alarm_MonState_vRMS   sin value  calidad 2147483682  MALA
 *   .Error interno         sin value  calidad 2147483682  MALA
 *
 * O sea: el área **lista** sus 42 alarmas pero no entrega el estado de
 * ninguna. Eso confirma lo que el catálogo ya decía —«la pantalla dice
 * CUÁNTAS hay y no CUÁL es cada una»— y lo acota: no es que no estén
 * publicadas, es que no responden.
 *
 * Por eso se devuelven las tres listas por separado y **las alarmas van
 * marcadas como no legibles**. Ofrecerlas para configurar como si dieran
 * estado produciría una pantalla que promete un detalle que nadie entrega —
 * que es peor que no ofrecerlo (`CLAUDE.md` §2.5).
 *
 * Las **acciones no se proponen para nada**: son escrituras, y la escritura
 * es deny by default (Plan 33 §20). Se listan para que quien configure sepa
 * que existen, no para activarlas desde aquí.
 *
 * @param {string} area  el área, p. ej. `ae:/DEMO VIBRACIONES`
 * @param {object} deps
 * @param {(ruta: string) => Promise<object>} deps.explorar  `client.browse`
 */
export async function descubrirAlarmas(area, { explorar }) {
  const vacio = { contadores: [], alarmas: [], acciones: [] }

  if (!area) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo: 'Esta máquina no declara área de alarmas.',
      ...vacio,
    }
  }

  let respuesta
  try {
    respuesta = await explorar(area)
  } catch (error) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo: `No se pudo explorar «${area}»: ${error?.message ?? 'error desconocido'}.`,
      ...vacio,
    }
  }

  if (!respuesta?.ok) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo:
        `ICONICS no contestó a la exploración de «${area}» ` +
        `(${respuesta?.error ?? `HTTP ${respuesta?.status ?? '?'}`}). No se ha podido mirar.`,
      ...vacio,
    }
  }

  /* La clasificación es regla pura y vive en `shared/` (ver la cabecera de
     `arbolIconics.js`): la pantalla la aplica a los mismos nodos. */
  const { contadores, alarmas, acciones } = clasificarArea(respuesta.payload ?? [])

  return {
    estado: ESTADO_CONFIGURACION.VALID,
    motivo:
      `${contadores.length} contador(es) que sí leen, ${alarmas.length} alarma(s) que el ` +
      'área lista pero no entrega, y ' + `${acciones.length} acción(es) de escritura.`,
    contadores,
    alarmas,
    acciones,
  }
}

/**
 * Propone las variables de una máquina a partir de sus dos raíces.
 *
 * @param {object} opciones
 * @param {string} opciones.raizEnVivo       raíz `ac:` de la máquina
 * @param {string|null} opciones.raizHistorico  raíz `hda:` del grupo, si la hay
 * @param {object} deps
 * @param {(ruta: string) => Promise<object>} deps.explorar  normalmente
 *   `client.browse`. Entra por la puerta para poder probar esto contra un
 *   servidor de mentira, igual que `verificarMaquina`.
 * @param {number} [deps.profundidadMax]  tope de recursión. 6 por defecto:
 *   el árbol real de vibraciones tiene 4 niveles y el del tanque 5.
 */
export async function descubrirVariables(
  { raizEnVivo, raizHistorico = null, tipo = null },
  { explorar, profundidadMax = 6 },
) {
  if (!raizEnVivo) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo: 'Falta la raíz en vivo (`ac:`): sin ella no hay nada que recorrer.',
      variables: [],
      sinEmparejar: [],
      fallos: [],
      resumen: { enVivo: 0, historico: 0, emparejados: 0, soloEnVivo: 0, soloHistorico: 0 },
    }
  }

  const vivo = await recorrerEnVivo(raizEnVivo, { explorar, profundidadMax })
  /*
   * Sin contrabarra final: el servidor contesta 500 a
   * `hda:\Configuration\DEMO_VIBRACIONES\` y bien a la misma ruta sin ella
   * (medido el 21-09-2026). El catálogo escrito a mano la lleva, y quien
   * copie de ahí la pegaría igual: se quita aquí y no se le pide a nadie que
   * lo sepa.
   */
  const historico = raizHistorico
    ? await recorrer(normalizarRaizHistorica(raizHistorico), { explorar, profundidadMax })
    : { puntos: [], fallos: [] }

  const fallos = [...vivo.fallos, ...historico.fallos]

  /*
   * Si la raíz en vivo no se pudo recorrer, no hay propuesta que hacer y
   * decirlo es la respuesta. `UNKNOWN`, nunca una lista vacía que parezca una
   * máquina sin variables.
   */
  if (!vivo.puntos.length && fallos.some((f) => f.ruta === raizEnVivo)) {
    return {
      estado: ESTADO_CONFIGURACION.UNKNOWN,
      motivo:
        `No se pudo recorrer «${raizEnVivo}»: ` +
        `${fallos.find((f) => f.ruta === raizEnVivo)?.motivo}. ` +
        'No se sabe qué variables tiene esta máquina: no se ha podido mirar.',
      variables: [],
      sinEmparejar: [],
      fallos,
      resumen: { enVivo: 0, historico: 0, emparejados: 0, soloEnVivo: 0, soloHistorico: 0 },
    }
  }

  /*
   * El emparejamiento por nombre final es regla pura y vive en `shared/`
   * (`emparejarPorNombre`): si dos tags distintos terminan igual la
   * coincidencia no es única y NO se propone —proponer una sería elegir al
   * azar por la máquina—. La pantalla aplica exactamente la misma regla.
   */
  const emparejamiento = emparejarPorNombre(
    vivo.puntos.map((p) => p.pointName),
    historico.puntos.map((p) => p.pointName),
  )

  /* Los sufijos de canal que este tipo conoce, para partir el nombre del tag.
     Salen del tipo y no de una expresión regular: qué es un apoyo lo dice él. */
  const canales = canalesDe(tipo)

  const variables = vivo.puntos.map((p) => {
    const clave = nombreFinal(p.pointName)
    const historyPointName = emparejamiento.pares.get(p.pointName) ?? null
    const ambiguo = emparejamiento.procedencia.get(p.pointName) === 'ambiguo-en-historiador'

    const { rol, candidatos, canal } = proponerRol(clave, tipo, { canales })

    return {
      ...crearVariable({
        id: clave ?? p.pointName,
        pointName: p.pointName,
        historyPointName,
        rol,
        /*
         * ── EL APOYO SE PROPONE COMO `assetId` ─────────────────────
         *
         * Y no sólo como `canal` informativo, que es como salía hasta el
         * 21-09-2026. El defecto lo destapó dar de alta una máquina desde
         * cero con lo que este módulo propone: las 65 variables llegaban con
         * `assetId: null`, y `dominioDesdeRoles` empareja por ahí —el apoyo
         * de una variable ES el activo al que pertenece (Plan 34 F3)—. Con
         * el campo vacío, ninguna encontraba su apoyo y la máquina no
         * diagnosticaba.
         *
         * Es la clase de hueco que sólo aparece recorriendo el circuito
         * entero: cada fase por separado estaba bien.
         */
        assetId: canal,
      }),
      /* Los candidatos viajan aunque haya rol: cuando son varios, la pantalla
         tiene que poder ofrecerlos en vez de pedir que se escriba uno. */
      rolCandidatos: candidatos,
      canal,
      /*
       * Por qué se propuso este emparejamiento, para que quien revise sepa si
       * mirarlo con lupa. No es decoración: es la diferencia entre confirmar
       * una lista y auditarla entera.
       */
      procedencia: historyPointName
        ? 'nombre-coincide'
        : ambiguo
          ? 'ambiguo-en-historiador'
          : 'sin-historico',
    }
  })

  /* Lo que el historiador publica y nadie reclamó. No se descarta en silencio:
     puede ser una señal que la máquina debería declarar y no declara. */
  const sinEmparejar = emparejamiento.sinEmparejar

  const conHistoria = variables.filter((v) => v.historyPointName).length
  const conRol = variables.filter((v) => v.rol).length
  const rolAmbiguo = variables.filter((v) => !v.rol && v.rolCandidatos.length > 1).length
  const sinRol = variables.filter((v) => !v.rolCandidatos.length).length

  return {
    /*
     * `DEGRADED` cuando algo del recorrido falló pero hay hallazgos: la
     * propuesta sirve y está incompleta, y las dos cosas hay que decirlas.
     */
    estado: fallos.length ? ESTADO_CONFIGURACION.DEGRADED : ESTADO_CONFIGURACION.VALID,
    motivo: fallos.length
      ? `${fallos.length} rama(s) no se pudieron recorrer: la propuesta está incompleta.`
      : 'El árbol se recorrió entero.',
    variables,
    sinEmparejar,
    fallos,
    resumen: {
      enVivo: vivo.puntos.length,
      historico: historico.puntos.length,
      emparejados: conHistoria,
      soloEnVivo: variables.length - conHistoria,
      soloHistorico: sinEmparejar.length,
      /* Del rol: cuántos se resolvieron solos, cuántos tienen más de un
         candidato y cuántos no encajan en ningún rol del tipo. Los dos
         últimos son trabajo para una persona, y saber cuánto hay antes de
         abrir la pantalla es la diferencia entre revisar y auditar. */
      conRol,
      rolAmbiguo,
      sinRol,
    },
  }
}
