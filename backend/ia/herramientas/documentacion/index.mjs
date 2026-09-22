/**
 * backend/ia/herramientas/documentacion/index.mjs
 * ------------------------------------------------------------------
 * Las tres herramientas que leen los MANUALES de planta: buscar en ellos,
 * sacar los límites que declaran para una señal, y el diagnóstico que cruza
 * esos límites con lo que ICONICS está midiendo.
 *
 * ── QUÉ LAS HACE UNA FAMILIA ───────────────────────────────────────
 *
 * Que las tres dependen de UNA sola cosa —`indiceDocumentos`, el índice BM25
 * que construye `ia/indices/documentos.mjs`— y de nada más de la clausura. No tocan el
 * `client` de ICONICS: los datos medidos que necesita `diagnostico` no los
 * pide él, se los pasa el ensamblador ya leídos.
 *
 * Por eso esta factoría recibe exactamente eso: el índice, y nada más.
 *
 * ── LA REGLA QUE ESTE GRUPO NO PUEDE ROMPER ────────────────────────
 *
 * Que lo MEDIDO y lo DOCUMENTADO no se mezclan. Un manual dice lo que el
 * fabricante escribió; ICONICS dice lo que el sensor está entregando ahora, y
 * las dos cosas pueden discrepar —de hecho, cuando discrepan es justo cuando
 * el diagnóstico sirve—. `diagnostico` las devuelve en campos separados
 * (`medido` y `documentacion`) y `chat.mjs` pide al modelo que las narre por
 * separado.
 *
 * Sin índice cargado (falta `IA_DOCS_DIR`), las tres se NIEGAN y lo dicen, en
 * vez de contestar de memoria. Un modelo al que se le pregunta por el límite
 * de un manual que no ha leído se lo inventa con total aplomo, y eso en una
 * planta es peor que no contestar.
 */
import { SENALES, esHistorizada, historizadas, senalInfo } from '../../../../shared/eva/tanque/senales.js'
/* `sistemaValido` conoce los sistemas declarados y acepta vacío como «toda la
 * planta»; es el mismo validador que usa el manifiesto de manuales, para que
 * el asistente y la pantalla midan «sistema válido» con la misma vara. */
import { sistemaValido } from '../../../../shared/eva/comun/manuales.js'
/* Quién reclama un nombre de señal, preguntando al REGISTRO y no a un
   catálogo concreto. Devuelve una lista y nunca elige — Plan 33 F7. */
import { SISTEMA, sistemasDeSenal } from '../../../../shared/eva/comun/sistemas.js'
import { tipoDe } from '../../../../shared/eva/tipos/index.js'
import { fallo } from '../lib/respuesta.mjs'
import { compararConLimites } from '../lib/limites.mjs'

/**
 * La única máquina que el dossier compuesto sabe armar.
 *
 * No es una preferencia: `senalesMencionadas`, `SENALES` e `historizadas()`
 * son el catálogo del tanque, así que ese es el alcance real de la
 * herramienta. Está aquí como constante, y no repartido por el archivo, para
 * que el día que la resolución de nombres se parametrice por máquina se vea
 * de un vistazo qué hay que tocar.
 */
const SISTEMA_DEL_DOSSIER = 'tanque'
/*
 * `resolverSenal` y `senalesMencionadas` viven todavía en `herramientas.mjs`:
 * son el índice de nombres del tanque, con sus sinónimos, y sacarlos es parte
 * de la fase que parametrice la resolución de señales por máquina. Se importan
 * de allí a propósito, en vez de duplicar el índice aquí — dos resolvedores de
 * nombres es exactamente el fallo que este proyecto ya arregló una vez.
 */
import {
  normalizarTexto,
  resolverSenal,
  senalDesconocida,
  senalesMencionadas,
  trocearEnOraciones,
} from '../../conversacion/herramientas.mjs'

/**
 * Palabras con las que un manual anuncia un límite. Con acento Y sin él —el
 * fragmento que se busca es el texto CRUDO del documento, con sus acentos
 * intactos, así que un patrón sin `[áa]`/`[íi]` no encuentra «máximo» ni
 * «mínimo», que son justo las dos palabras más comunes en un manual técnico
 * en español. Cubren tanto la forma directa («máximo 150 V») como la
 * perifrástica («no debe exceder los 150 V»).
 */
const PALABRAS_LIMITE =
  /\b(m[áa]xim[oa]s?|m[íi]nim[oa]s?|no debe exceder|no super(?:ar|e|a)|l[íi]mite|rango admisible|admisible|hasta)\b/g

/**
 * Número seguido, opcionalmente, de una unidad de las que aparecen en hojas
 * de datos industriales. La unidad es opcional a propósito: «el límite es
 * 40» sin unidad al lado sigue siendo un candidato, y descartarlo perdería
 * justo el caso en que el manual da el número en una frase y la unidad en
 * el título de la tabla.
 */
const NUMERO_UNIDAD =
  /*
   * Las unidades de vibración (Plan 39 F3): `mm/s`, `m/s²`. El cierre es
   * `(?!\w)` y no `\b` porque «²» y «%» no son caracteres de palabra, y
   * tras ellos `\b` no encontraba frontera: el patrón retrocedía y devolvía
   * el número SIN unidad.
   */
  /(\d+(?:[.,]\d+)?)\s*(mm\/s|m\/s[²2]?|v|voltios?|bar(?:es)?|mbar|psi|°c|celsius|%|kw|hz|amperios?|l\/s|m3\/h|rpm)?(?!\w)/i

/** Cuántos caracteres a cada lado de la palabra de límite se miran buscando un número. */
const VENTANA_CANDIDATO = 40

/**
 * La palabra ancla de una señal, para `extraerCandidatosLimite`: SÓLO la
 * primera palabra distintiva de su rótulo («carga» de «Carga de trabajo del
 * motor», «tensión» de «Tensión de línea»), no el rótulo entero ni sus
 * sinónimos.
 *
 * ── POR QUÉ UNA SOLA, Y POR QUÉ NO LOS SINÓNIMOS ───────────────────
 *
 * Se probó con todas las palabras del rótulo más `SINONIMOS[clave]`, y falló
 * por generosa: «motor» aparece en la frase de casi cualquier señal —«con el
 * motor encendido o apagado» describe la condición de la temperatura, no un
 * límite de la carga— así que un ancla tan común dejaba pasar el «25 °C» de
 * la temperatura como si fuera un límite de la carga del motor. La primera
 * palabra del rótulo es la más distintiva de las que tiene cada señal
 * («carga», «tensión», «caudal», «presión»…) y ninguna se repite entre
 * señales del catálogo.
 */
function anclaDeSenal(clave) {
  return anclaGenerica(SENALES[clave].label)
}

/** La misma regla, para una etiqueta cualquiera: la primera palabra con cuerpo. */
function anclaGenerica(label) {
  const [primera] = normalizarTexto(label ?? '').split(' ').filter(p => p.length >= 4)
  return primera ? [primera] : []
}

/**
 * Candidatos a límite dentro de UN fragmento del índice de documentación.
 *
 * ── QUÉ RESUELVE Y QUÉ NO ────────────────────────────────────────────
 *
 * Convierte «la presión de descarga no debe exceder los 8 bar» en un dato
 * estructurado —`{ valor: 8, unidad: 'bar', palabraLimite: 'no debe exceder' }`—
 * en vez de dejar que el modelo lea el párrafo y decida de memoria si ese
 * número es un límite o una medida cualquiera, que es la tarea de lectura en
 * la que un modelo de 4B falla más.
 *
 * NO valida que el número y la palabra de límite hablen de lo mismo: es un
 * patrón léxico —número cerca de una palabra de límite—, no una lectura del
 * significado. Dos frases seguidas, una con un número y la siguiente con
 * «máximo» de otra magnitud, producen un candidato que no es tal. Por eso
 * `limites_del_manual` los llama CANDIDATOS y no límites confirmados, y se lo
 * dice al modelo explícitamente en `comoRedactar`.
 *
 * ── LAS ANCLAS, Y POR QUÉ HACEN FALTA ──────────────────────────────
 *
 * Un fragmento de 900 caracteres puede hablar de VARIAS señales seguidas —una
 * hoja de datos compacta las mete todas en la misma página—, y sin más
 * comprobación un límite de la tensión se cuela como candidato de la
 * temperatura sólo por estar en el mismo fragmento. `anclas` trae la palabra
 * ancla de la señal (`anclaDeSenal`): un candidato sólo cuenta si aparece en
 * la oración de la palabra de límite, o en la de al lado —ver
 * `trocearEnOraciones`—, no en cualquier parte del fragmento. Medido con un
 * manual de dos páginas: sin esto, pedir el límite de la tensión devolvía
 * también el máximo de carga del motor de la página siguiente.
 */
function extraerCandidatosLimite(texto, anclas = []) {
  const candidatos = []
  const vistos = new Set()
  const oraciones = anclas.length ? trocearEnOraciones(texto) : []
  const re = new RegExp(PALABRAS_LIMITE.source, 'gi')
  let m

  while ((m = re.exec(texto)) !== null) {
    const desde = Math.max(0, m.index - VENTANA_CANDIDATO)
    const hasta = Math.min(texto.length, re.lastIndex + VENTANA_CANDIDATO)
    const ventana = texto.slice(desde, hasta)

    if (anclas.length) {
      const i = oraciones.findIndex(o => m.index >= o.inicio && m.index < o.fin)
      const desdeOracion = oraciones[Math.max(0, i - 1)]?.inicio ?? 0
      const hastaOracion = oraciones[Math.min(oraciones.length - 1, i + 1)]?.fin ?? texto.length
      const ventanaAncla = normalizarTexto(texto.slice(desdeOracion, hastaOracion))
      if (!anclas.some(a => ventanaAncla.includes(a))) continue
    }

    /*
     * El número MÁS CERCANO a la palabra de límite, no el primero de la
     * ventana. La ventana mira a los dos lados de la palabra —«132 V. La
     * tensión no debe exceder los 150 V» tiene un número ANTES y otro
     * DESPUÉS de «no debe exceder»— y quedarse con el primero en orden de
     * lectura habría emparejado el 132 (que pertenece a la frase anterior)
     * con esta palabra en vez del 150 que de verdad la acompaña.
     */
    const inicioEnVentana = m.index - desde
    const finEnVentana = re.lastIndex - desde
    const numRe = new RegExp(NUMERO_UNIDAD.source, 'gi')
    let numero = null
    let distanciaMinima = Infinity
    let nm
    while ((nm = numRe.exec(ventana)) !== null) {
      const centro = (nm.index + numRe.lastIndex) / 2
      const distancia = centro < inicioEnVentana
        ? inicioEnVentana - centro
        : Math.max(0, centro - finEnVentana)
      if (distancia < distanciaMinima) {
        distanciaMinima = distancia
        numero = nm
      }
    }
    if (!numero) continue

    const valor = Number(numero[1].replace(',', '.'))
    if (!Number.isFinite(valor)) continue

    const unidad = numero[2] ? numero[2].toLowerCase() : null
    const palabraLimite = m[0].toLowerCase()

    // Mismo valor y misma palabra ya visto en este fragmento: el manual suele
    // repetir la cifra en el cuerpo y en una tabla de la misma página, y
    // duplicarlo no añade un candidato distinto.
    const clave = `${valor}|${unidad ?? ''}|${palabraLimite}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    candidatos.push({ valor, unidad, palabraLimite, contexto: ventana.trim() })
  }

  return candidatos
}

/**
 * Las tres herramientas de documentación.
 *
 * ── POR QUÉ RECIBE `herramientas` Y NO SÓLO EL ÍNDICE ──────────────
 *
 * Porque `diagnostico` no es una herramienta más: es un ORQUESTADOR. Para
 * armar su dossier llama a otras cuatro —`estado_del_sistema`,
 * `historia_de_senal`, `correlacionar_senales` y `limites_del_manual`— y las
 * tres primeras viven todavía en la clausura grande.
 *
 * Se pasa una función y no el objeto ya hecho porque en el momento de
 * construir esta familia el objeto de herramientas TODAVÍA NO EXISTE: se está
 * construyendo, y esta familia es una de sus partes. `dameHerramientas()` se
 * llama en tiempo de EJECUCIÓN, cuando ya está completo — es una indirección
 * de una línea que evita un huevo y la gallina.
 *
 * Es también la única dependencia de esta familia que no es su índice, y deja
 * dicho cuál es el trabajo pendiente: mientras `diagnostico` orqueste
 * herramientas de otras familias, no es del todo independiente.
 *
 * @param {object} args
 * @param {object|null} args.indiceDocumentos  índice BM25 de `ia/indices/documentos.mjs`
 * @param {() => object} args.dameHerramientas  el catálogo ya ensamblado
 */
export function crearHerramientasDeDocumentacion({ indiceDocumentos, dameHerramientas }) {
  return {
    /**
     * Busca en la documentación de planta.
     *
     * ── POR QUÉ VIAJA LA RELEVANCIA ────────────────────────────────────
     *
     * Porque BM25 SIEMPRE devuelve algo si alguna palabra coincide, y ese algo
     * puede no responder la pregunta. Sin el número, el modelo trata igual el
     * fragmento que encaja exactamente y el que sólo comparte la palabra
     * «presión» con un manual entero sobre presión. Con él —y con la
     * instrucción de abajo— puede decir que no lo encontró, que es la respuesta
     * correcta cuando no está documentado.
     */
    async consultar_documentacion({ pregunta, sistema } = {}) {
      if (!indiceDocumentos) {
        return fallo(
          'Este servidor no tiene documentación de planta cargada (falta la variable ' +
            'IA_DOCS_DIR). No puedo consultar manuales: dilo así y no contestes de memoria.'
        )
      }
      if (!pregunta || !pregunta.trim()) {
        return fallo('Necesito saber sobre qué quieres consultar en la documentación.')
      }
      /*
       * ── EL AISLAMIENTO POR MÁQUINA, POR FIN ALCANZABLE ────────────────
       *
       * `buscar()` sabe filtrar por sistema desde el Plan 17 Fase 3a (G7): un
       * manual asignado a una máquina sólo compite en ESA máquina, y uno sin
       * asignar compite siempre. Pero esta herramienta nunca le pasaba
       * `sistema`, así que el filtro era inalcanzable desde la conversación —
       * el motor de diagnóstico lo usaba y el técnico preguntando, no.
       *
       * Sigue siendo OPCIONAL, y omitirlo mantiene el comportamiento de
       * siempre. Una pregunta general («¿cada cuánto se revisan las
       * protecciones?») no tiene por qué ser de una máquina, y forzar a
       * elegir una escondería el manual de planta que la contesta.
       */
      if (sistema && !sistemaValido(sistema)) {
        return fallo(
          `"${sistema}" no es un sistema de esta planta. Los ids salen de ` +
            `sistemas_de_la_planta; omite el parámetro para buscar en toda la documentación.`
        )
      }

      const resultados = await indiceDocumentos.buscar(pregunta, {
        top: 3,
        ...(sistema ? { sistema } : {}),
      })

      if (!resultados.length) {
        const estado = indiceDocumentos.estado()
        // Qué documentos SÍ hay viaja en el error a propósito: «no lo encontré»
        // a secas deja al operador sin saber si el manual no está cargado o si
        // está y no lo dice. Son dos problemas con arreglos distintos.
        return fallo(
          'No he encontrado nada sobre eso en la documentación cargada. Puede que no esté ' +
            'documentado, o que el manual lo llame de otra forma.' +
            /*
             * Si la búsqueda iba acotada, decirlo: sin esta frase, «no lo
             * encontré» tapa un tercer motivo —está documentado, pero en un
             * manual asignado a la otra máquina— que tiene un arreglo
             * distinto a los otros dos.
             */
            (sistema
              ? ` Ojo: he buscado SÓLO en la documentación de "${sistema}" y en la que vale ` +
                `para toda la planta. Si crees que está en un manual de otra máquina, ` +
                `vuelve a preguntar sin acotar el sistema.`
              : ''),
          {
            ...(sistema ? { busquedaAcotadaA: sistema } : {}),
            documentosDisponibles: estado.documentos.map(d => d.archivo),
            ...(estado.ilegibles.length ? { noSePudieronLeer: estado.ilegibles } : {}),
          }
        )
      }

      return {
        ok: true,
        fragmentos: resultados.map(r => ({
          documento: r.archivo,
          pagina: r.pagina,
          texto: r.texto,
          relevancia: +r.score.toFixed(2),
        })),
        /*
         * `comoRedactar` y NO `aviso`, y la diferencia importa.
         *
         * `aviso` es el campo que `chat.mjs` vigila para PEGARLO detrás de la
         * respuesta cuando el modelo no lo cuenta. Ese mecanismo existe para
         * las advertencias que el operador tiene que leer sí o sí —que los
         * umbrales son estimaciones nuestras—, y aquí no aplica: esto es una
         * instrucción de estilo para el modelo.
         *
         * Con la clave `aviso` se veía en pantalla, literal, debajo de una
         * respuesta correcta: «Cita el documento y la página… La relevancia va
         * de 0 a 1…». Al operador eso no le dice nada y le hace desconfiar de
         * la respuesta. Cualquier clave que no sea `aviso` la lee el modelo y
         * no la copia nadie.
         */
        comoRedactar:
          'Cita el documento y la página de donde viene cada dato. La relevancia va de 0 a 1: ' +
          'por debajo de 0,4 el fragmento probablemente no responde la pregunta, y entonces di ' +
          'que no lo has encontrado en vez de completarlo con conocimiento general. Estos ' +
          'fragmentos son del manual, NO son mediciones de la instalación.',
      }
    },

    /**
     * Candidatos a límite documentado de UNA señal, extraídos por patrón.
     *
     * ── PARA QUÉ EXISTE, Y QUÉ PROBLEMA REAL RESUELVE ──────────────────
     *
     * `consultar_documentacion` devuelve texto libre y dice «lee esto y cita
     * lo que haga falta» — y leer un párrafo técnico para decidir si un
     * número es un límite es justo la tarea de comprensión en la que un
     * modelo de 4B falla más. Convierte el escenario «un pico de 200 V
     * contra un máximo de 150 V documentado» en una lectura estructurada
     * —`{ valor: 150, unidad: 'v', palabraLimite: 'maximo' }`— en vez de una
     * tarea de razonamiento sobre prosa.
     *
     * Reutiliza el ÍNDICE que ya construyó `consultar_documentacion` (BM25
     * sobre `shared/eva` no, sobre `ia/indices/documentos.mjs`): no hay un segundo
     * índice ni un segundo parseo de los PDF, sólo una consulta distinta —
     * sesgada hacia palabras de límite— y un filtrado por patrón encima de
     * los fragmentos que ya devuelve.
     */
    async limites_del_manual({ senal, sistema } = {}) {
      if (!indiceDocumentos) {
        return fallo(
          'Este servidor no tiene documentación de planta cargada (falta la variable ' +
            'IA_DOCS_DIR). No puedo consultar límites del manual: dilo así y no contestes de memoria.'
        )
      }

      /*
       * ── DE QUÉ MÁQUINA ES ESTA SEÑAL (Plan 33 F7) ────────────────────
       *
       * Hasta hoy esta herramienta resolvía SIEMPRE contra el catálogo del
       * tanque y acotaba la búsqueda a `sistema: 'tanque'`. El comentario de
       * abajo ya avisaba de que ese literal dejaría de ser cierto «al
       * parametrizar la resolución por máquina».
       *
       * Ese momento es éste. `sistemasDeSenal()` pregunta al REGISTRO qué
       * máquinas reclaman un nombre, y devuelve una lista: con un nombre
       * ambiguo salen varias y hay que preguntar, porque elegir es cómo se
       * contesta correctamente sobre la instalación equivocada.
       *
       * El `sistema` del argumento sólo DESEMPATA. No se usa para forzar la
       * máquina: una señal que sólo existe en una no cambia de dueño porque
       * alguien pase el id de otra.
       */
      /* `duenos` y no `candidatos`: más abajo hay otro `candidatos`, el de los
         límites extraídos del manual, y son cosas distintas. */
      const duenos = sistemasDeSenal(senal)
      let encontrado = duenos[0] ?? null

      if (duenos.length > 1) {
        const acotado = sistema
          ? duenos.filter((d) => d.sistema === String(sistema).trim())
          : duenos

        if (acotado.length !== 1) {
          return fallo(
            `«${senal}» existe en más de un sitio: ` +
              `${acotado.map((d) => `${d.clave} (${d.sistema})`).join('; ')}. ` +
              'Di de qué sistema y con qué nombre exacto.',
            { candidatos: acotado }
          )
        }
        encontrado = acotado[0]
      }

      const sistemaDeLaSenal = encontrado?.sistema ?? null

      /*
       * ── DE QUÉ MÁQUINA, Y CON QUÉ PALABRAS (Plan 39 F3) ──────────────
       *
       * Hasta el 22-09-2026 esto se negaba para toda máquina que no fuera el
       * tanque: los límites se extraían con `anclaDeSenal` y `senalInfo`, que
       * son de SU catálogo. Una máquina configurada no tiene ese catálogo,
       * pero tiene algo mejor para esto: su entrada dice qué ROL cumple cada
       * variable (`metaDe(clave).rol`) y el TIPO declara, por rol, con qué
       * palabras habla un manual de esa medida (`terminosManual`). Así que la
       * etiqueta sale de la máquina y las anclas del tipo, y la misma
       * extracción sirve para las dos.
       *
       * Lo que sigue sin poderse es una entrada sin `metaDe`: sin etiqueta ni
       * rol no hay con qué buscar, y se dice.
       */
      let meta
      let anclas
      let consulta
      if (sistemaDeLaSenal && sistemaDeLaSenal !== 'tanque') {
        const entrada = SISTEMA[sistemaDeLaSenal]
        const propia = entrada?.metaDe?.(encontrado.clave) ?? null
        if (!propia) {
          return fallo(
            `«${senal}» es del sistema «${sistemaDeLaSenal}», y esa entrada no declara metaDe(): ` +
              'sin etiqueta ni rol no sé con qué términos buscar su límite. Su documentación sí ' +
              `se puede buscar con consultar_documentacion(sistema="${sistemaDeLaSenal}").`,
            { sistema: sistemaDeLaSenal }
          )
        }
        const rol = tipoDe(entrada.tipo)?.roles?.[propia.rol] ?? null
        const terminos = [rol?.label, rol?.corto, ...(rol?.terminosManual ?? [])].filter(Boolean)
        meta = { label: propia.label, unidad: propia.unidad }
        anclas = terminos.length
          ? [...new Set(terminos.map(normalizarTexto).filter(t => t.length >= 3))]
          : anclaGenerica(propia.label)
        consulta =
          `${[propia.label, ...terminos, rol?.norma ?? ''].filter(Boolean).join(' ')} ` +
          'maximo minimo limite admisible no debe exceder rango'
      } else {
        const clave = resolverSenal(senal)
        if (!clave) return senalDesconocida(senal, { paraHistoria: true })
        meta = senalInfo(clave)
        anclas = anclaDeSenal(clave)
        // Se sesga la consulta hacia palabras de límite además del nombre de la
        // señal: BM25 es léxico, así que sin estas palabras en la consulta
        // puntuaría igual una página que sólo menciona la señal de pasada.
        consulta = `${meta.label} maximo minimo limite admisible no debe exceder rango`
      }
      /*
       * ── EL SISTEMA NO SE PREGUNTA AQUÍ: SE SABE ─────────────────────
       *
       * Esta herramienta resuelve el nombre de la señal con `resolverSenal`,
       * que es el índice de nombres DEL TANQUE —ver la nota de los imports de
       * este archivo—, y `senalInfo` sale de `tanque/senales.js`. O sea: si
       * llegamos hasta aquí, la señal es del tanque, necesariamente.
       *
       * Así que acotar la búsqueda es gratis y no depende de que el modelo
       * acierte a pasar un parámetro. Un límite de vibración no puede
       * respaldar una señal de agua, y hasta hoy podía: los nueve manuales
       * estaban sin asignar y competían todos contra todo.
       *
       * ── YA NO ES UN LITERAL (Plan 33 F7, 18-09-2026) ────────────────
       *
       * Esto decía `sistema: 'tanque'` a pelo, con una nota avisando de que
       * dejaría de ser cierto al parametrizar la resolución por máquina. Ese
       * momento llegó: ahora la máquina sale de `sistemasDeSenal()` arriba, y
       * si la señal fuera de otra, la guarda de allí ya se ha negado.
       *
       * El `?? 'tanque'` cubre el caso en que el registro no reclame el nombre
       * pero `resolverSenal` sí lo reconozca —pasa con los sinónimos del
       * tanque, que el registro no conoce—. Ahí la señal es del tanque por
       * construcción: `senalInfo` viene de su catálogo.
       *
       * Desde el Plan 39 F3 la señal puede ser de una configurada: entonces
       * `sistemaDeLaSenal` es su id y la búsqueda se acota a SUS manuales y a
       * los de toda la planta, que es donde vive la norma.
       */
      const resultados = await indiceDocumentos.buscar(consulta, {
        top: 5,
        sistema: sistemaDeLaSenal ?? 'tanque',
      })

      if (!resultados.length) {
        const estado = indiceDocumentos.estado()
        return fallo(
          `No he encontrado nada sobre ${meta.label} en la documentación cargada.`,
          {
            documentosDisponibles: estado.documentos.map(d => d.archivo),
            ...(estado.ilegibles.length ? { noSePudieronLeer: estado.ilegibles } : {}),
          }
        )
      }

      const candidatos = []
      for (const r of resultados) {
        for (const c of extraerCandidatosLimite(r.texto, anclas)) {
          candidatos.push({ ...c, documento: r.archivo, pagina: r.pagina, relevancia: +r.score.toFixed(2) })
        }
      }

      if (!candidatos.length) {
        return fallo(
          `Encontré páginas sobre ${meta.label} en la documentación, pero ninguna tiene un número ` +
            `junto a una palabra de límite (máximo, mínimo, no debe exceder, rango admisible). ` +
            `Puede que el límite esté escrito de otra forma; consultar_documentacion busca en ` +
            `texto libre y puede encontrarlo igual.`,
          { paginasRevisadas: resultados.map(r => ({ documento: r.archivo, pagina: r.pagina })) }
        )
      }

      return {
        ok: true,
        senal: meta.label,
        sistema: sistemaDeLaSenal ?? 'tanque',
        unidadDeclaradaEnICONICS: meta.unidad || null,
        // Seis, mismo tope que las coincidencias de correlacionar_senales: de
        // sobra para que el modelo elija entre candidatos que no cuadran, sin
        // llenarle el contexto de repeticiones del mismo dato.
        candidatos: candidatos.slice(0, 6),
        comoRedactar:
          'Éstos son CANDIDATOS a límite, encontrados por patrón (número junto a una palabra como ' +
          '"máximo" o "no debe exceder"), no una lectura garantizada del significado: el número y ' +
          'la palabra pueden pertenecer a frases distintas de la misma página. Cita siempre el ' +
          'documento y la página. Si hay varios candidatos que no cuadran entre sí, dilo en vez de ' +
          'elegir uno a tu criterio. La unidad del manual puede no coincidir con la que declara ' +
          'ICONICS: compáralas antes de dar el límite por bueno.',
      }
    },

    /**
     * Dossier de diagnóstico: una llamada que hace estado + historia con
     * fecha de los extremos + correlación entre señales + límites del manual
     * de las señales que el síntoma menciona.
     *
     * ── EL CRITERIO QUE YA GOBIERNA EL ARCHIVO, LLEVADO AL LÍMITE ──────
     *
     * El modelo elige QUÉ preguntar; el backend sabe CÓMO. Un diagnóstico
     * real —«¿por qué se paró la bomba tras un pico de tensión?»— necesita
     * cuatro o cinco consultas encadenadas y cruzar sus resultados de
     * cabeza: qué señales tocan el síntoma, cuándo fue su extremo, si se
     * movieron juntas, y si el manual documenta un límite que ese extremo
     * cruzó. Encadenarlas es exactamente el trabajo en el que un modelo
     * pequeño se pierde — cada ronda cuesta 30-90 s, y `IA_MAX_PASOS` las
     * limita a 2-4 de todos modos. Aquí se hacen TODAS en una sola llamada,
     * en paralelo, y se entregan ya ordenadas.
     *
     * ── EL EXCESO SOBRE LÍMITE, YA CALCULADO Y FECHADO ─────────────────
     *
     * Es la pieza que de verdad ahorra razonamiento: si el manual dice
     * «máximo 150 V» y la historia de la tensión marcó un pico de 203 V a
     * las 14:32, la resta (53 V, a esa hora) la hace este archivo, no el
     * modelo — que tiene prohibido hacer aritmética en todo lo demás, y aquí
     * no iba a ser la excepción. Ver `compararConLimites`.
     *
     * ── LO MEDIDO, SEPARADO DE LO DOCUMENTADO ──────────────────────────
     *
     * `medido` sale de ICONICS: el estado, la historia con sus fechas, la
     * correlación. `documentacion` sale de los manuales, con `comoRedactar`
     * de `limites_del_manual` repetido para que la advertencia de que son
     * candidatos y no lecturas garantizadas viaje pegada a ellos y no se
     * pierda al resumir el dossier. El modelo narra sobre las dos, pero
     * nunca las mezcla: eso es lo que pide `chat.mjs` al distinguir MEDIDO de
     * HIPÓTESIS al redactar un diagnóstico.
     */
    async diagnostico({ sintoma, periodo, sistema = SISTEMA_DEL_DOSSIER } = {}) {
      if (!sintoma || !sintoma.trim()) {
        return fallo(
          'Necesito una descripción del síntoma o la avería a diagnosticar: qué pasó, y si lo ' +
            'sabes, cuándo.'
        )
      }
      /*
       * ── ESTA HERRAMIENTA SÓLO CUBRE EL TANQUE, Y AHORA LO DICE ────────
       *
       * Todo lo que usa para armar el dossier es del tanque: `senalesMencionadas`
       * y `SENALES` son su catálogo, e `historizadas()` sus cinco series. Nunca
       * pudo servir a vibraciones.
       *
       * Lo que hacía hasta el 03-09-2026 era peor que negarse: contestaba
       * `ok: true` igual. Medido con «El apoyo S2 vibra más tras un cambio de
       * carga», devolvía `senalesConsideradas: ["Carga de trabajo del motor"]`
       * —una señal del TANQUE, pescada por la palabra «carga»— y un dossier
       * vacío. Un síntoma de una máquina contestado con el catálogo de la otra.
       *
       * Negarse y decir a dónde ir es la respuesta correcta mientras la
       * resolución de nombres siga sin parametrizar por máquina (ver la nota de
       * los imports de este archivo).
       */
      if (sistema !== SISTEMA_DEL_DOSSIER) {
        /*
         * Se niega POR CAPACIDAD, no por id (Plan 39 F3): el dossier encadena
         * `senalesMencionadas` e `historizadas()` del catálogo del tanque, y un
         * tipo tendría que declarar su equivalente —qué señales nombra un
         * síntoma, cuáles tienen historia— para que se pudiera componer. Hoy
         * ningún tipo lo declara, y el mensaje dice qué faltaría en vez de
         * fingir que la máquina no existe.
         */
        const entrada = SISTEMA[String(sistema).trim()]
        const porTipo = entrada?.tipo
          ? ` La máquina «${sistema}» es del tipo «${entrada.tipo}», y ese tipo no declara dossier ` +
            '(qué señales nombra un síntoma y cuáles tienen historia).'
          : ''
        return fallo(
          `El dossier compuesto sólo cubre "${SISTEMA_DEL_DOSSIER}" hoy: su catálogo de señales ` +
            `es el de esa máquina.${porTipo} Para "${sistema}", usa diagnosticar_falla con el id de un ` +
            `riesgo activo —da causas ya puntuadas—, limites_del_manual para un límite concreto, ` +
            `o pide estado_del_sistema, historia_de_senal y consultar_documentacion por separado ` +
            `con ese sistema.`
        )
      }

      const mencionadas = senalesMencionadas(sintoma)
      // Sin ninguna señal nombrada en el síntoma, se parte de las cuatro que
      // tienen historia: son las únicas sobre las que se puede medir una
      // tendencia o una correlación, así que no hay nada que ganar
      // adivinando entre las otras cuatro sin ningún indicio textual.
      const claves = (mencionadas.length ? mencionadas : historizadas()).slice(0, 4)
      const historiadas = claves.filter(esHistorizada)

      const [estado, historias, correlacion, documentacion] = await Promise.all([
        /*
         * ── EL `sistema` QUE FALTABA ──────────────────────────────────
         *
         * Esto llamaba a `estado_del_sistema()` SIN argumentos. Cuando entró
         * la segunda máquina, esa herramienta pasó a exigir `sistema` —«cada
         * uno es una instalación separada, contestar del otro sería contestar
         * de otra máquina»— y este llamador interno se quedó sin actualizar.
         *
         * Resultado, medido el 03-09-2026 y en las DOS máquinas: `estadoAhora`
         * devolvía `{error: "Falta decir de qué sistema..."}` en todos los
         * diagnósticos, y `excesosSobreLimite` —que compara el estado contra
         * los límites— se quedaba sin la mitad de su materia prima. Nada lo
         * delataba porque el dossier seguía saliendo con `ok: true`.
         *
         * Es la pata que la descripción de esta herramienta promete primero:
         * «reúne el estado actual, la historia…».
         */
        dameHerramientas().estado_del_sistema({ sistema }),

        Promise.all(historiadas.map(async k => ({
          clave: k,
          resultado: await dameHerramientas().historia_de_senal({ senal: SENALES[k].label, periodo }),
        }))),

        // La correlación exige DOS señales con historia; con una o ninguna no
        // se pide, y se dice el motivo en vez de dejar el hueco sin explicar.
        historiadas.length >= 2
          ? dameHerramientas().correlacionar_senales({
            senales: historiadas.map(k => SENALES[k].label), periodo,
          })
          : Promise.resolve(null),

        indiceDocumentos
          ? Promise.all(claves.map(async k => ({
            clave: k,
            resultado: await dameHerramientas().limites_del_manual({ senal: SENALES[k].label }),
          })))
          : Promise.resolve(null),
      ])

      const historiasOk = historias.filter(h => h.resultado.ok)
      const documentacionOk = (documentacion ?? []).filter(d => d.resultado.ok)

      return {
        ok: true,
        sintoma,
        senalesConsideradas: claves.map(k => SENALES[k].label),
        ...(mencionadas.length === 0
          ? {
            nota:
                'El síntoma no nombraba ninguna señal por su nombre, así que se han mirado las ' +
                'cuatro que tienen historia: nivel del tanque, temperatura del tanque, caudal y ' +
                'presión.',
          }
          : {}),

        medido: {
          estadoAhora: estado.ok
            ? {
              estadoGeneral: estado.estadoGeneral,
              enReposo: estado.enReposo,
              leidoA: estado.leidoA,
              ...(estado.queSignificaReposo ? { queSignificaReposo: estado.queSignificaReposo } : {}),
            }
            : { error: estado.error },

          historia: historiasOk.map(h => ({ senal: SENALES[h.clave].label, ...h.resultado })),
          ...(historias.length > historiasOk.length
            ? {
              historiaSinDatos: historias
                .filter(h => !h.resultado.ok)
                .map(h => ({ senal: SENALES[h.clave].label, motivo: h.resultado.error ?? h.resultado.motivo })),
            }
            : {}),

          correlacion: correlacion
            ? (correlacion.ok ? correlacion : { error: correlacion.error })
            : `No se pidió correlación: hacen falta al menos dos señales con historia entre las ` +
              `consideradas, y sólo hay ${historiadas.length}.`,
        },

        documentacion: documentacion
          ? {
            porSenal: documentacionOk.map(d => ({ senal: SENALES[d.clave].label, ...d.resultado })),
            ...(documentacionOk.length
              ? {
                comoRedactar:
                    'Los candidatos de "documentacion" son eso, candidatos por patrón, no lecturas ' +
                    'garantizadas: cítalos con su documento y página, y compara su unidad con la ' +
                    'que usa ICONICS antes de darlos por buenos.',
              }
              : {}),
          }
          : 'Este servidor no tiene documentación de planta cargada (falta IA_DOCS_DIR).',

        // El cálculo que de verdad ahorra razonamiento: ver la cabecera.
        excesosSobreLimite: compararConLimites(estado, historiasOk, documentacionOk),

        comoRedactar:
          'Separa SIEMPRE lo MEDIDO (estadoAhora, historia, correlacion — viene de ICONICS) de lo ' +
          'DOCUMENTADO (documentacion — viene del manual, son candidatos) y de tu HIPÓTESIS — lo ' +
          'que tú concluyes juntando las dos cosas. No las mezcles en la misma frase sin decir cuál ' +
          'es cuál. Si "excesosSobreLimite" trae algo, es el dato más fuerte que tienes: una ' +
          'medición real que superó un límite documentado, en una fecha concreta. Si los datos no ' +
          'permiten explicar el síntoma, dilo — una causa inventada que suena razonable manda a ' +
          'alguien a revisar el equipo equivocado. Correlación no es causa.',
      }
    },
  }
}
