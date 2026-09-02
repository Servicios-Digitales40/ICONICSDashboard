/**
 * backend/ia/herramientas/aprendizaje/index.mjs
 * ------------------------------------------------------------------
 * Las cuatro herramientas de lo APRENDIDO: consultar los hechos confirmados
 * de la planta, anotar una intervención, cerrar un diagnóstico ya narrado
 * con su causa real, y proponer una regla de vigilancia.
 *
 * ── POR QUÉ SALEN JUNTAS Y POR QUÉ SALEN PRONTO ────────────────────
 *
 * Porque forman un grupo cerrado: las cuatro —y sólo ellas— hablan con el
 * almacén JSON de `datos/aprendizaje.json`, y ninguna toca el `client` de
 * ICONICS. No leen el servidor, no piden series y no evalúan reglas; su
 * materia prima es un archivo (y, para `cerrar_diagnostico`, también
 * `shared/eva/comun/causas.js` — una función pura, no un servidor).
 *
 * Eso las hace de las primeras del reparto (Fase 1). Esta factoría no recibe
 * `client`, ni `turnos`, ni concurrencia: no recibe nada. Si algún día una de
 * ellas necesitara leer del servidor, la firma de abajo tendría que cambiar
 * —y ese cambio de firma es justo la señal de que el grupo dejó de ser cerrado.
 *
 * ── LA REGLA QUE ESTE GRUPO PROTEGE ────────────────────────────────
 *
 * Que el asistente APRENDE pero no DECIDE. `recordar_hecho` guarda algo que
 * alguien confirmó; `proponer_regla` deja una propuesta anotada que no vigila
 * nada hasta que una persona la revisa con `scripts/revisar-propuestas.mjs`.
 * Ninguna de las dos activa nada por su cuenta, y sus avisos lo dicen en el
 * texto que el modelo cita literal.
 *
 * ── `cerrar_diagnostico`, PLAN 17 (FASE DE PARIDAD CON EL CIERRE) ──
 *
 * Hasta esta fase, el chat sólo podía ESCUCHAR una corrección
 * (`registrar_intervencion` guarda `causa` como texto libre); nunca podía
 * REGISTRARLA con la fuerza que el motor necesita para aprender de ella —
 * eso vivía sólo en `POST /api/casos`, la puerta que usa
 * `CierreDiagnostico.jsx`, con sus campos estructurados
 * (`causaReal.tipo`, `diagnostico.propuesta`, `diagnosticoCorrecto`,
 * `disparador.riesgoId`). `cerrar_diagnostico` le da al chat la misma
 * capacidad, con la misma validación dura que ya protege esa puerta: un
 * `causaId` que no está entre las candidatas del riesgo se RECHAZA, no se
 * adivina — mismo criterio que ya usa `registrar_intervencion` con
 * `sistema`. La alternativa —dejar que el modelo escriba `causaReal.tipo`
 * en texto libre desde el chat— habría reintroducido la proxy de texto que
 * el Plan 17 (Fase 2, G3) se pasó una fase entera evitando, con el
 * agravante de que un id mal mapeado por un modelo local no falla ruidoso:
 * corrompe en silencio la señal de la que depende toda esa fase.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  VACIO as APRENDIZAJE_VACIO,
  crearHecho,
  crearPropuesta,
  hechosVigentes,
  normalizarAlmacen,
  pendientes,
  validarPropuesta,
  crearIntervencion,
  intervencionesRecientes,
} from '../../../../shared/eva/comun/aprendizaje.js'
import { SISTEMA_IDS } from '../../../../shared/eva/comun/sistemas.js'
import { causasDe } from '../../../../shared/eva/comun/causas.js'
import { fallo } from '../lib/respuesta.mjs'

/**
 * ── EL ALMACÉN DE LO APRENDIDO ────────────────────────────────────
 *
 * Un JSON en `datos/`, al lado de los reportes. Se lee entero en cada
 * llamada y no se cachea: son unos kilobytes, y una caché aquí haría que dos
 * conversaciones simultáneas se pisaran los hechos que acaban de guardar.
 *
 * A NIVEL DE MÓDULO y exportada —no dentro de `crearHerramientasDeAprendizaje`
 * como antes— porque desde Plan 16 hay una TERCERA punta que necesita leer
 * este archivo: `backend/ia/motor/casos.mjs`, el índice de la Fuente #3 del
 * diagnóstico. Con la constante escondida dentro de una función, la única
 * forma de que `casos.mjs` supiera dónde está el archivo habría sido
 * escribir la ruta una vez más — que es EXACTAMENTE el fallo que el
 * comentario de abajo ya describe haber costado una vez.
 */
/*
 * Ruta FIJA, no derivada de la de reportes. Derivarla con un `..` dependía de
 * si `reportesDir` venía como `datos` o como `datos/reportes`, y el archivo
 * acabó en la raíz del repositorio mientras `revisar-propuestas.mjs` lo
 * buscaba en `datos/`: el asistente guardaba y el revisor no veía nada, sin
 * un solo error por ningún lado. Todas las puntas usan esta misma constante.
 */
export const RUTA_APRENDIZAJE = join('datos', 'aprendizaje.json')

/**
 * `ruta` es opcional —por defecto `RUTA_APRENDIZAJE`— para que
 * `backend/ia/motor/casos.mjs` y sus pruebas puedan apuntar a un almacén propio sin
 * tocar el de verdad, mismo criterio que `rutaCache` en `documentos.mjs`.
 */
export async function leerAprendizaje(ruta = RUTA_APRENDIZAJE) {
  try {
    return normalizarAlmacen(JSON.parse(await readFile(ruta, 'utf8')))
  } catch {
    /* Que no exista es lo normal la primera vez, y un archivo corrupto no
       puede tumbar el asistente entero: se parte de vacío y los hechos de
       fábrica siguen ahí, que viven en el código. */
    return { ...APRENDIZAJE_VACIO, hechos: [], propuestas: [] }
  }
}

/** `ruta` opcional por el mismo motivo que en `leerAprendizaje`: sólo las
 *  pruebas la usan, para no escribir sobre el `aprendizaje.json` de verdad. */
async function guardarAprendizaje(almacen, ruta = RUTA_APRENDIZAJE) {
  try {
    await mkdir(dirname(ruta), { recursive: true })
    await writeFile(ruta, JSON.stringify(almacen, null, 2), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

/**
 * ── EL CIERRE DE DIAGNÓSTICO (PLAN 16 FASE 5) ─────────────────────
 *
 * `POST /api/casos` llama a esto, no escribe el archivo por su cuenta.
 * `guardarAprendizaje` queda privada de este módulo a propósito —ver la
 * cabecera del archivo sobre por qué `leerAprendizaje` sí se exportó, y por
 * qué eso no significa abrir también la escritura—: cada puerta de
 * escritura tiene su propia función con nombre (`registrar_intervencion`,
 * `recordar_hecho`, `proponer_regla`, y ahora ésta), no un `guardar()`
 * genérico que cualquier código nuevo pueda invocar con cualquier cosa.
 *
 * Es una `crearIntervencion` más rica, ver su cabecera en
 * `shared/eva/comun/aprendizaje.js`, pero la validación de mínimos —sintoma y
 * solucion con contenido de verdad— vive en el esquema Zod de
 * `casosRoutes.mjs`, no aquí: esta función confía en su llamador, igual
 * que `crearIntervencion` confía en el suyo. Repetir la validación en las
 * dos capas sólo interesa si un día ganan un tercer llamador.
 *
 * `ruta` es el mismo mecanismo de siempre para las pruebas: ver
 * `RUTA_APRENDIZAJE` arriba.
 */
export async function registrarCaso(datos, { ruta = RUTA_APRENDIZAJE } = {}) {
  const almacen = await leerAprendizaje(ruta)
  const nueva = crearIntervencion(datos, new Date())
  almacen.intervenciones.push(nueva)
  const guardado = await guardarAprendizaje(almacen, ruta)
  if (!guardado.ok) return { ok: false, error: `No se pudo guardar: ${guardado.error}` }
  return { ok: true, caso: nueva }
}

/**
 * ── LA BITÁCORA ENTERA, PARA REVISARLA ────────────────────────────
 *
 * `GET /api/casos` llama a esto. Devuelve TODAS las intervenciones, de la
 * más reciente a la más antigua, sin recortar: quien abre la pantalla de
 * revisión quiere ver lo que hay, no una muestra. Son unos kilobytes de
 * JSON y no crecen rápido —una intervención por avería atendida—, así que
 * paginar aquí sería resolver un problema que esta instalación no tiene.
 *
 * Distinto de `hechos_de_la_planta`, que sí recorta a 8: aquello entra en
 * el contexto de un modelo con ventana escasa, esto entra en una tabla.
 */
export async function listarCasos({ ruta = RUTA_APRENDIZAJE } = {}) {
  const almacen = await leerAprendizaje(ruta)
  return intervencionesRecientes(almacen, almacen.intervenciones.length, { incluirArchivadas: true })
}

/**
 * ── ARCHIVAR Y DEVOLVER UNA INTERVENCIÓN ──────────────────────────
 *
 * `PATCH /api/casos/:id` llama a esto. El porqué de que la baja sea
 * archivar y no borrar está en `estaArchivada`, en
 * `shared/eva/comun/aprendizaje.js` — resumido: la regla «lo que pasó,
 * pasó» sigue en pie, y retirar un caso de lo que alimenta el diagnóstico
 * no es lo mismo que reescribir la historia.
 *
 * ── POR QUÉ NO ES UNA EXCEPCIÓN A «NO SE EDITA» ──────────────────
 *
 * Porque no toca ni un campo de lo que se contó: `sintoma`, `causa`,
 * `solucion`, `fecha` y `resuelto` quedan exactamente como se escribieron.
 * `archivado` no es parte del relato, es una marca sobre él. Un lector que
 * quiera saber qué pasó aquel día lee lo mismo que antes; lo único que
 * cambia es si el índice lo cuenta.
 *
 * Una función con nombre, y no un `guardar()` genérico, por el criterio de
 * la cabecera del archivo: cada puerta de escritura tiene la suya.
 *
 * Devuelve `encontrado: false` en vez de un error cuando el id no está: que
 * alguien archive dos veces desde dos pestañas no es un fallo del servidor,
 * y la ruta lo traduce a un 404 con su propia frase.
 */
export async function archivarCaso(id, { archivado = true, ruta = RUTA_APRENDIZAJE } = {}) {
  const almacen = await leerAprendizaje(ruta)
  const caso = almacen.intervenciones.find((i) => i.id === id)
  if (!caso) return { ok: true, encontrado: false, caso: null }

  /*
   * Devolver una intervención BORRA el campo en vez de dejar
   * `archivado: false`. Así una que nunca se archivó y una que se archivó y
   * se devolvió quedan idénticas en disco — no hay dos formas de decir lo
   * mismo, que es lo que obliga después a comparar contra las dos.
   */
  if (archivado) caso.archivado = true
  else delete caso.archivado

  const guardado = await guardarAprendizaje(almacen, ruta)
  if (!guardado.ok) return { ok: false, error: `No se pudo guardar: ${guardado.error}` }
  return { ok: true, encontrado: true, caso }
}

/**
 * Las tres herramientas de aprendizaje.
 *
 * No recibe nada a propósito: ver la cabecera. Devuelve el mismo objeto
 * `{ nombre: fn }` que el ensamblador mezcla con el de las demás familias.
 */
export function crearHerramientasDeAprendizaje() {
  return {
    /**
     * ── LO QUE YA SE SABE DE ESTA PLANTA ──────────────────────────────
     *
     * El modelo no recuerda nada entre conversaciones. Esto es lo más parecido
     * a que recuerde: los hechos que alguien confirmó alguna vez, entregados
     * cada vez que hacen falta.
     *
     * Son cosas que costaron días de averiguar y que NO se deducen mirando el
     * servidor —que hay tres sensores y no dos, que el grupo del historiador
     * lleva un espacio en el nombre—. Sin esto, cada conversación las vuelve a
     * suponer, y suponerlas mal es gratis.
     */
    async hechos_de_la_planta({ sistema = null } = {}) {
      const almacen = await leerAprendizaje()
      const todos = hechosVigentes(almacen)
      const hechos = sistema ? todos.filter((h) => h.sistema === sistema || h.sistema === null) : todos

      return {
        ok: true,
        cuantos: hechos.length,
        hechos: hechos.map((h) => ({
          sobre: h.sistema ?? 'toda la planta',
          hecho: h.hecho,
          /* El origen viaja siempre: «lo confirmó quien opera la instalación»
             y «lo dedujo el modelo» no valen lo mismo, y leídos en la misma
             lista sin esta línea serían indistinguibles. */
          origen: h.origen,
        })),
        /*
         * La bitácora viaja CON los hechos y no en su propia herramienta.
         *
         * «¿Cómo arreglé esto la última vez?» es la pregunta que la justifica,
         * y el modelo pequeño elige mal entre herramientas parecidas: pedirle
         * que acierte entre `hechos_de_la_planta` y otra de intervenciones era
         * regalarle una forma más de equivocarse. Aquí llegan las dos cosas
         * con la llamada que ya hace bien.
         */
        intervenciones: intervencionesRecientes(almacen, 8).map((i) => ({
          cuando: i.fecha.slice(0, 10),
          sobre: i.sistema ?? 'toda la planta',
          sintoma: i.sintoma,
          causa: i.causa ?? undefined,
          que_se_hizo: i.solucion,
          /* Un intento que NO funcionó vale tanto como uno que sí: ahorra
             repetirlo. Por eso se dice, en vez de listar sólo los buenos. */
          funciono: i.resuelto,
        })),
        propuestas_pendientes: pendientes(almacen).length,
      }
    },

    /**
     * ── LA BITÁCORA: LO QUE SE HIZO, PARA DENTRO DE SEIS MESES ────────
     *
     * Un HECHO dice cómo es la planta. Esto dice qué le pasó y qué se hizo, y
     * son cosas distintas: un hecho se corrige cuando cambia, una intervención
     * está fechada y no se corrige nunca.
     *
     * Su valor entero está en poder leerla cuando el mismo síntoma vuelva. Es
     * lo primero que se pierde en una planta —quien lo arregló se va, o
     * simplemente lo olvida— y la única forma de que no se pierda es que
     * anotarlo cueste una frase dicha en voz alta.
     *
     * `origen` NO es obligatorio aquí, al revés que en `recordar_hecho`. Ahí
     * distingue un dato de planta de una conjetura y por eso se exige; aquí lo
     * está contando quien lo hizo, y un campo de más era una razón más para
     * que el modelo pequeño no llegara a llamar a la herramienta.
     */
    async registrar_intervencion({ sintoma, solucion, causa = null, sistema = null, resuelto = true, origen = null } = {}) {
      const s = String(sintoma ?? '').trim()
      const q = String(solucion ?? '').trim()
      if (s.length < 8 || q.length < 8) {
        return fallo(
          'Hacen falta las dos mitades: QUÉ pasaba y QUÉ se hizo. Una sola no sirve dentro de ' +
          'seis meses, que es cuando esto se lee.'
        )
      }

      /*
       * Plan 17 Fase 0 (G4): esta puerta aceptaba `sistema` como texto
       * libre, mientras que `POST /api/casos` ya lo validaba con
       * `z.enum(SISTEMA_IDS)`. La diferencia no era cosmética: el filtro de
       * `casos.mjs` compara `sistema` por igualdad exacta y va ANTES de
       * puntuar, así que un id inválido no fallaba aquí y hacía el caso
       * invisible para siempre allá — medido en la auditoría del
       * 01-09-2026, 2 de 5 intervenciones reales con
       * `sistema: "grupo de bombeo"`, un id que no existe. `null` sigue
       * siendo válido: es "toda la planta", no un error.
       */
      if (sistema !== null && !SISTEMA_IDS.includes(sistema)) {
        return fallo(
          `"${sistema}" no es un sistema conocido. Usa uno de: ${SISTEMA_IDS.join(', ')} — ` +
          'o no lo digas, si es de toda la planta.'
        )
      }

      const almacen = await leerAprendizaje()
      const nueva = crearIntervencion({ sintoma: s, solucion: q, causa, sistema, resuelto, origen }, new Date())
      almacen.intervenciones.push(nueva)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        anotado: nueva.sintoma,
        que_se_hizo: nueva.solucion,
        funciono: nueva.resuelto,
        total_en_bitacora: almacen.intervenciones.length,
        aviso:
          'Queda en la bitácora con su fecha. La próxima vez que se pregunte por este síntoma ' +
          'aparecerá junto a los datos de la instalación.',
      }
    },

    /**
     * ── CERRAR UN DIAGNÓSTICO YA NARRADO, CON SU CAUSA REAL ───────────
     *
     * La contraparte de `CierreDiagnostico.jsx · POST /api/casos` para el
     * chat: registra qué causa resultó ser la real, con el mismo id
     * estructurado que usa el emparejamiento exacto de
     * `backend/ia/motor/diagnostico.mjs · respaldoDeCasos` (Plan 17 Fase 2, G3),
     * no como una frase que haya que adivinar la próxima vez.
     *
     * SÓLO se llama después de que el técnico confirme o corrija,
     * explícitamente, la causa de un riesgo que `diagnosticar_falla` ya
     * narró — nunca antes, nunca para especular. Lo dice la descripción de
     * la herramienta, que es lo único que el modelo lee para decidir
     * cuándo llamarla.
     *
     * `causaId` se valida contra `causasDe(riesgoId)` — el MISMO catálogo
     * que ya usó `diagnosticar_falla` para proponer candidatas, así que un
     * id que el modelo entendió mal (o inventó) se rechaza aquí, con la
     * lista de los válidos, en vez de guardarse silenciosamente. Es el
     * mismo criterio de validación dura que `sistema` ya tiene arriba: un
     * dato mal formado no se adivina, se devuelve para corregir.
     */
    async cerrar_diagnostico({
      sistema, riesgoId, causaId = null, causaLibre = null, propuesta = null,
      componente = null, solucion, resuelto = true,
    } = {}) {
      if (!sistema || !SISTEMA_IDS.includes(sistema)) {
        return fallo(`"${sistema}" no es un sistema conocido. Usa uno de: ${SISTEMA_IDS.join(', ')}.`)
      }
      if (!riesgoId) {
        return fallo(
          'Hace falta el `riesgoId` del diagnóstico que se cierra — el mismo que le pasaste a ' +
          'diagnosticar_falla.'
        )
      }
      const q = String(solucion ?? '').trim()
      if (q.length < 8) {
        return fallo(
          'Hace falta describir QUÉ se hizo, con detalle — es lo que sirve dentro de seis meses.'
        )
      }

      const candidatas = causasDe(riesgoId)
      if (!candidatas) {
        return fallo(
          `"${riesgoId}" no tiene causas candidatas transcritas — no hay contra qué validar la ` +
          'causa real. Usa registrar_intervencion para dejar constancia en texto libre.'
        )
      }

      let causaRealTipo = null
      if (causaId) {
        const candidata = candidatas.find((c) => c.id === causaId)
        if (!candidata) {
          return fallo(
            `"${causaId}" no es una causa candidata de "${riesgoId}". Usa uno de: ` +
            `${candidatas.map((c) => c.id).join(', ')} — o, si la causa real no estaba en esa ` +
            'lista, descríbela en `causaLibre` en vez de `causaId`.'
          )
        }
        causaRealTipo = candidata.id
      } else if (causaLibre) {
        // Mismo criterio que "Otra causa" en CierreDiagnostico.jsx: el texto
        // libre viaja en `causaReal.tipo` tal cual, sin fingir que es un id
        // del catálogo — no compite con `causasDe()`, no hay contra qué
        // validarlo.
        causaRealTipo = String(causaLibre).trim()
      } else {
        return fallo(
          'Hace falta `causaId` (si la causa real estaba entre las que propuso diagnosticar_falla) ' +
          'o `causaLibre` (si no lo estaba).'
        )
      }

      if (propuesta && !candidatas.some((c) => c.id === propuesta)) {
        return fallo(
          `"${propuesta}" tampoco es una causa candidata de "${riesgoId}". Usa uno de: ` +
          `${candidatas.map((c) => c.id).join(', ')}.`
        )
      }

      const almacen = await leerAprendizaje()
      const nueva = crearIntervencion({
        sistema,
        sintoma: `Cierre de diagnóstico — ${riesgoId}.`,
        solucion: q,
        causa: causaRealTipo,
        resuelto,
        disparador: { tipo: 'riesgo', riesgoId },
        causaReal: { tipo: causaRealTipo, ...(componente ? { componente } : {}) },
        // Sólo se afirma `diagnosticoCorrecto` cuando hay `propuesta` con
        // que compararla — mismo criterio, literal, que
        // `CierreDiagnostico.jsx`: "no hay acierto que evaluar sin
        // propuesta". Sin ella, el campo ni se manda.
        ...(propuesta
          ? { diagnostico: { propuesta }, diagnosticoCorrecto: causaRealTipo === propuesta }
          : {}),
      }, new Date())
      almacen.intervenciones.push(nueva)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        riesgoId,
        causa_real: causaRealTipo,
        ...(propuesta ? { diagnostico_correcto: causaRealTipo === propuesta } : {}),
        aviso:
          'Queda en la bitácora con el id exacto de la causa. La próxima vez que este mismo ' +
          'riesgo se diagnostique, esta corrección cuenta de verdad — no como una frase que hay ' +
          'que adivinar. Dile al técnico que quedó registrado, con qué causa real.',
      }
    },

    /**
     * ── APRENDER ALGO NUEVO, CUANDO UNA PERSONA LO CONFIRMA ───────────
     *
     * Sólo se llama cuando el usuario AFIRMA un dato de la instalación. No
     * para guardar lo que el modelo deduzca: para eso está `proponer_regla`,
     * que pasa por revisión.
     *
     * La diferencia importa dentro de un mes, cuando alguien lea la lista y no
     * pueda distinguir un dato de planta de una conjetura bien redactada.
     */
    async recordar_hecho({ hecho, sistema = null, origen = null } = {}) {
      const texto = String(hecho ?? '').trim()
      if (texto.length < 10) {
        return fallo('Un hecho tiene que decir algo concreto sobre la instalación.')
      }

      /*
       * ── LA ELECCIÓN EQUIVOCADA TAMBIÉN TIENE QUE FUNCIONAR ──────────
       *
       * El modelo local elige mal entre estas dos herramientas. Medido: se le
       * contó «ya resolví la falla del pico de S1, lo arreglé cambiando la
       * configuración» y llamó a `recordar_hecho` en vez de a
       * `registrar_intervencion`, dos veces seguidas, con las descripciones
       * diciendo explícitamente cuál era cuál.
       *
       * Refinar las descripciones no sirvió, y no iba a servir: con un modelo
       * pequeño, cada herramienta parecida es una forma más de equivocarse.
       * Así que la reparación se guarda IGUAL, en la bitácora, aunque haya
       * entrado por la puerta de al lado.
       *
       * Las palabras son las que usa quien lo cuenta —«ya quedó», «lo
       * resolví»—, no una lista de sinónimos exhaustiva: si alguna se escapa
       * se guarda como hecho, que es peor pero no se pierde.
       */
      /* El modelo REESCRIBE lo que le dicen antes de guardarlo: a quien dijo
         «ya resolví la falla» le anotó «la falla está resuelta». Por eso las
         raíces cubren también el participio —`resuelt`, `arreglad`—, que es la
         forma en que el modelo lo redacta, no la que usa quien lo cuenta. */
      const esReparacion =
        /(resolv|resuelt|arregl|repar|correg|cambi|ajust|configur|solucion|sustitu|reemplaz)/i.test(texto) ||
        /ya (qued|est)/i.test(texto)
      if (esReparacion) {
        const almacen = await leerAprendizaje()
        const nueva = crearIntervencion(
          { sintoma: texto, solucion: texto, sistema, origen: origen ?? 'el usuario' },
          new Date(),
        )
        almacen.intervenciones.push(nueva)
        const guardado = await guardarAprendizaje(almacen)
        if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)
        return {
          ok: true,
          anotado: texto,
          donde: 'bitácora de intervenciones',
          total_en_bitacora: almacen.intervenciones.length,
          aviso:
            'Esto describe algo que se HIZO, así que va a la bitácora con su fecha y no a la ' +
            'lista de datos de la instalación. La próxima vez que se pregunte por este síntoma ' +
            'aparecerá. Dile al usuario que queda anotado en la bitácora.',
        }
      }
      if (!origen) {
        return fallo(
          'Falta el origen: quién lo confirmó y cuándo. Sin eso no se puede guardar, porque ' +
          'dentro de un mes nadie sabrá si lo dijo quien opera la planta o lo dedujo el asistente.'
        )
      }

      const almacen = await leerAprendizaje()
      const nuevo = crearHecho({ hecho: texto, sistema, origen }, new Date())
      almacen.hechos.push(nuevo)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        guardado: nuevo.hecho,
        sobre: nuevo.sistema ?? 'toda la planta',
        total_hechos: hechosVigentes(almacen).length,
        aviso:
          'Queda guardado, y estará disponible en las siguientes conversaciones. ' +
          'Se ha anotado junto con su origen, para que más adelante se sepa quién lo confirmó.',
      }
    },

    /**
     * ── PROPONER UNA REGLA, QUE NO ES LO MISMO QUE CREARLA ────────────
     *
     * Esto NO añade una regla al sistema. Deja una propuesta esperando a que
     * una persona la revise.
     *
     * Y es deliberado. Estas reglas deciden si una pantalla de planta dice
     * «riesgo de derrame»: una inventada que salta sin motivo se desactiva a
     * la semana y se lleva por delante la credibilidad de las que sí valen.
     * Contra este mismo servidor, el modelo local dijo tres veces seguidas
     * «velocidad eficaz 1,13 mm/s» leyendo la ACELERACIÓN. Quien confunde un
     * campo no firma el criterio con el que se para una bomba.
     *
     * Lo que sí aporta, y es mucho: mirar semanas de datos, ver un patrón que
     * a nadie se le había ocurrido, y dejarlo redactado con su evidencia para
     * que alguien lo juzgue en treinta segundos.
     */
    async proponer_regla(datos = {}) {
      const v = validarPropuesta(datos)
      if (!v.ok) {
        return fallo(
          `A la propuesta le faltan campos: ${v.faltan.join(', ')}. La evidencia tiene que ` +
          'llevar las cifras que la sostienen, no sólo la idea: sin ellas, quien la revise ' +
          'tendría que ir a buscar los datos él mismo y la propuesta no le ahorra nada.',
          { faltan: v.faltan }
        )
      }

      const almacen = await leerAprendizaje()
      const p = crearPropuesta(datos, new Date())
      almacen.propuestas.push(p)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        id: p.id,
        estado: p.estado,
        titulo: p.titulo,
        pendientes_de_revisar: pendientes(almacen).length,
        /*
         * `aviso` lo cita el modelo LITERAL en su respuesta —se comprobó—, así
         * que va escrito para quien lo lee. Las instrucciones al modelo viven
         * en las reglas de `chat.mjs`, no aquí: una frase como «dile al
         * usuario que…» acaba impresa en pantalla tal cual.
         */
        aviso:
          'Esto queda ANOTADO como propuesta y no vigila nada todavía: ninguna regla se ' +
          'aplica sin que una persona la revise. Para revisarla: ' +
          '`node scripts/revisar-propuestas.mjs`',
      }
    },
  }
}
