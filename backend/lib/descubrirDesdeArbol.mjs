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

/** Separador de carpeta del historiador. `hda:` usa contrabarra, `ac:` barra. */
const BARRA_HDA = String.fromCharCode(92)

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
 * El nombre final de un punto, sea del árbol que sea.
 *
 * `ac:TDCON/.../S1/vRMS_S1`              → `vRMS_S1`
 * `hda:\Configuration\DEMO_VIB\S1:vRMS_S1` → `vRMS_S1`
 *
 * Es lo único que se compara para PROPONER un emparejamiento. No se normaliza
 * mayúsculas ni se quitan espacios a propósito: dos nombres que sólo se
 * parecen no son el mismo punto, y afinar la coincidencia aquí sería empezar
 * a adivinar. Lo que no case exacto lo resuelve una persona.
 */
export function nombreFinal(pointName) {
  if (typeof pointName !== 'string' || !pointName) return null
  const trasDosPuntos = pointName.includes(':')
    ? pointName.slice(pointName.lastIndexOf(':') + 1)
    : pointName
  const trozos = trasDosPuntos.split(/[/\\]/)
  return trozos[trozos.length - 1] || null
}

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
 * Qué rol del tipo cumple un punto, PROPUESTO por su nombre.
 *
 * ── POR QUÉ ESTO IMPORTA MÁS QUE EL RESTO DEL DESCUBRIMIENTO ──────
 *
 * Porque el rol es lo que conecta una variable con las reglas. Sin rol,
 * `vRMS_S1` es un número con nombre; con `medida:vRMS` en el apoyo `S1`, las
 * 18 reglas del tipo saben qué es y pueden evaluarlo.
 *
 * Es la pieza que falta para cerrar el hueco de `dominio: null` —hoy una
 * máquina configurada no diagnostica (Plan 34 F3)— y por eso se propone aquí,
 * cuando el nombre del tag todavía está delante.
 *
 * ── LA AMBIGÜEDAD NO SE RESUELVE, SE DECLARA ─────────────────────
 *
 * `rolesDeClave()` devuelve una LISTA a propósito, y su cabecera dice por
 * qué: `aviso` encaja en dos familias —bandera de apoyo y aviso del
 * variador—, «y elegir una es como se contesta correctamente sobre la señal
 * equivocada».
 *
 * Así que cuando hay más de un candidato **no se propone ninguno** y se
 * devuelven todos para que decida una persona. Quedarse con el primero sería
 * rápido y estaría mal la mitad de las veces, sin dar error.
 *
 * ── SE PREGUNTA POR TAG, NO POR CLAVE ────────────────────────────
 *
 * Es la corrección que hizo útil esta función. La clave de dominio y el tag
 * del servidor sólo coinciden en una de las cinco familias:
 *
 *   medida     vRMS      → `vRMS`         coinciden
 *   calidad    qcVRMS    → `QC_vRMS`      no
 *   bandera    aviso     → `Warning`      no
 *   variador   velocidad → `SPEED_BMS`    no
 *
 * `browse` devuelve el TAG. Preguntando por clave se resolvían **12 de 184**
 * —las doce medidas, justo las que coinciden— y los otros 172 caían en «sin
 * rol». Se pregunta por las dos puertas, empezando por el tag.
 *
 * El sufijo de canal se quita antes: el rol es del TIPO y no sabe de apoyos
 * concretos. `QC_vRMS_S1` → tag `QC_vRMS`, canal `S1`.
 */
export function proponerRol(corto, tipo, { canales = [] } = {}) {
  const nada = { rol: null, candidatos: [], canal: null }
  if (!tipo?.roles || !corto) return nada

  const porTag = typeof tipo.rolesDeTag === 'function' ? tipo.rolesDeTag : null
  const porClave = typeof tipo.rolesDeClave === 'function' ? tipo.rolesDeClave : null
  /* Sin índice del tipo no se adivina: el catálogo de roles es suyo. */
  if (!porTag && !porClave) return nada

  /* ¿Termina en el sufijo de algún canal declarado? Se prueban los más largos
     primero: `S1` y `S11` convivirían mal con una comparación ingenua. */
  const sufijos = [...canales].sort((a, b) => b.length - a.length)
  const canal = sufijos.find((s) => corto.endsWith(`_${s}`)) ?? null
  const sinCanal = canal ? corto.slice(0, -(canal.length + 1)) : corto

  /*
   * Cuatro intentos, y los cuatro hacen falta: por tag y por clave, con y sin
   * el sufijo de canal. Los tags del variador lo llevan DENTRO del nombre
   * (`SPEED_BMS`, `FREQ OUTPUT_BMS`) y a los de apoyo se lo añade el canal.
   */
  const candidatos = [
    ...new Set([
      ...(porTag?.(sinCanal) ?? []),
      ...(porTag?.(corto) ?? []),
      ...(porClave?.(sinCanal) ?? []),
      ...(porClave?.(corto) ?? []),
    ]),
  ]

  return {
    rol: candidatos.length === 1 ? candidatos[0] : null,
    candidatos,
    canal,
  }
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

  const contadores = []
  const alarmas = []
  const acciones = []

  for (const hijo of respuesta.payload ?? []) {
    const corto = hijo?.shortName ?? ''
    const pointName = hijo?.pointName
    if (!pointName) continue

    if (corto.startsWith('=')) {
      contadores.push({ pointName, corto, lee: true })
    } else if (corto.startsWith(BARRA_HDA)) {
      acciones.push({ pointName, corto })
    } else if (corto.startsWith('.')) {
      /*
       * `lee: false` medido, no supuesto. Si algún día el servidor empieza a
       * entregarlas, esto se descubre sondeando —igual que `historyVerified`
       * en F2— y no cambiando esta marca a mano.
       */
      alarmas.push({ pointName, corto, lee: false })
    }
  }

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
  const historico = raizHistorico
    ? await recorrer(raizHistorico, { explorar, profundidadMax })
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
   * El índice del historiador va por nombre final. Si dos tags distintos
   * terminan igual —dos apoyos con la misma medida en carpetas distintas— la
   * coincidencia deja de ser única y NO se propone: proponer una de las dos
   * sería elegir al azar por la máquina.
   */
  const porNombre = new Map()
  const ambiguos = new Set()
  for (const p of historico.puntos) {
    const clave = nombreFinal(p.pointName)
    if (!clave) continue
    if (porNombre.has(clave)) ambiguos.add(clave)
    porNombre.set(clave, p.pointName)
  }

  /* Los sufijos de canal que este tipo conoce, para partir el nombre del tag.
     Salen del tipo y no de una expresión regular: qué es un apoyo lo dice él. */
  const canales = (tipo?.canales ?? []).map((c) => c.sufijo ?? c.id).filter(Boolean)

  const emparejados = new Set()
  const variables = vivo.puntos.map((p) => {
    const clave = nombreFinal(p.pointName)
    const ambiguo = ambiguos.has(clave)
    const historyPointName = !ambiguo ? (porNombre.get(clave) ?? null) : null
    if (historyPointName) emparejados.add(historyPointName)

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
  const sinEmparejar = historico.puntos
    .filter((p) => !emparejados.has(p.pointName))
    .map((p) => p.pointName)

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
