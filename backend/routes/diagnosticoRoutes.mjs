/**
 * El diagnóstico de un riesgo, por HTTP. Plan 16 Fase 5 (UI A).
 *
 *   GET /api/diagnostico?sistema=&riesgoId=    las causas candidatas, puntuadas
 *
 * ── PARA QUÉ EXISTE, SI YA HAY UNA HERRAMIENTA DE CHAT ──────────────
 *
 * `diagnosticar_falla` (Plan 16 Fase 4) le da el mismo resultado al MODELO,
 * para que lo narre. Esta ruta le da el mismo resultado —literalmente el
 * mismo `motorDiagnostico.diagnosticar()`, ninguna lógica propia— a la
 * pantalla de cierre de diagnóstico (`CierreDiagnostico.jsx`), que necesita
 * la lista de causas para PRE-RELLENAR el formulario sin pasar por una
 * conversación con el modelo — el técnico no está ahí para charlar, está
 * ahí para cerrar un caso.
 *
 * La guarda de autenticación ya NO se declara aquí, y no porque se haya
 * quitado: desde el Plan 20 F5 la pone el ámbito donde se registran las rutas
 * de API (`app.mjs`), para las treinta y tres a la vez. Esta cabecera decía
 * que las rutas de sólo lectura no la llevaban — y ese criterio, aplicado ruta
 * por ruta, dejó veinte sin guarda de las que nadie llevaba la cuenta.
 *
 * ── Y DESDE EL PLAN 35 F2 TAMBIÉN LLEVAN `exigirRol` ───────────────
 *
 * Con `visualizador`, que es el rol mínimo. Aquí decía que estas rutas no lo
 * llevaban porque «leer un diagnóstico ya calculado no acciona nada», y eso
 * seguía siendo cierto — lo que cambió es que ahora hay un rol POR DEBAJO de
 * operador, y una ruta sin rol declarado no distingue a quien sólo mira de
 * quien puede actuar.
 *
 * Declararlo no restringe a nadie que antes pasara: un operador alcanza
 * `visualizador` por jerarquía. Lo que hace es que la ruta diga a qué nivel
 * pertenece, en vez de quedarse en «basta con tener sesión».
 */
import { z } from 'zod'
import { sistemaConocido } from '../http/esquemas.mjs'
import { CODIGOS, responderError } from '../http/codigos.mjs'
import { resumirDiagnosticos } from '../ia/motor/metricas.mjs'
import { crearHerramientasDeDiagnostico } from '../ia/herramientas/diagnostico/index.mjs'

/**
 * ── `valoresSensores` POR FIN TIENE QUIEN LO TRAIGA (PLAN 28 F1) ────
 *
 * `diagnosticar()` admite `valoresSensores` desde el Plan 17 F4 —es lo que le
 * permite citar la frase de `datos` con cifras— y su JSDoc decía, medido el
 * 09-09-2026, que **no lo traía NADIE**: esta ruta era la única entrada de
 * producción y su Zod sólo dejaba pasar `sistema` y `riesgoId`. Un camino
 * escrito, probado y nunca recorrido.
 *
 * Llega como JSON en la query porque este endpoint es un GET y la muestra es
 * un objeto pequeño —las señales que declara el `necesita` de una regla, no la
 * planta entera—. Si alguna vez crece, el sitio correcto es un POST, no un
 * query string más largo.
 *
 * Es OPCIONAL y sigue siéndolo: sin él el diagnóstico es exactamente el de
 * siempre. Lo que cambia es que ahora la frase de `datos` y el snapshot pueden
 * llevar las lecturas de verdad cuando quien llama las tiene a mano.
 */
const ValoresSensoresSchema = z
  .string()
  .transform((texto, ctx) => {
    try {
      const objeto = JSON.parse(texto)
      if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
        ctx.addIssue({ code: 'custom', message: '"valoresSensores" tiene que ser un objeto JSON.' })
        return z.NEVER
      }
      return objeto
    } catch {
      ctx.addIssue({ code: 'custom', message: '"valoresSensores" no es JSON válido.' })
      return z.NEVER
    }
  })
  .optional()

const DiagnosticoQuerySchema = z.object({
  sistema: sistemaConocido(),
  riesgoId: z.string().min(1, 'Falta "riesgoId".'),
  valoresSensores: ValoresSensoresSchema,
})

/**
 * Cuántos diagnósticos, de qué clase y cuánto tardaron — Plan 28 F7.
 *
 *   GET /api/diagnostico/metricas?horas=   el resumen de la ventana
 *
 * ── SE AGREGA DEL DIARIO, NO DE CONTADORES EN MEMORIA ───────────────
 *
 * El porqué está en la cabecera de `ia/motor/metricas.mjs`, y en resumen: un
 * contador paralelo puede desincronizarse del diario y se va con el proceso —
 * justo cuando más interesa mirarlo, que es después de un incidente.
 *
 * ── POR QUÉ SU ROL MÍNIMO ES `visualizador` Y NO `operador` ────────
 *
 * A diferencia de `GET /api/diario`, esto NO es un registro de personas: son
 * agregados del proceso —cuántos diagnósticos salieron insuficientes, qué
 * fuente se cayó más, cuánto tardó el p95—. No hay ninguna IP ni ningún
 * usuario en la respuesta, así que no hay nada que proteger de quien sólo
 * mira.
 *
 * La guarda de autenticación la pone el ámbito (`app.mjs`), como a las demás
 * rutas de API; el rol se declara aquí, que es donde hay criterio.
 */
const MetricasQuerySchema = z.object({
  /*
   * La ventana acota el recorrido: el diario llega a megas y agregar dos años
   * para contestar «¿cómo va hoy?» sería trabajo de sobra. 24 h por defecto,
   * una semana de tope — más allá conviene leer el archivo directamente.
   */
  horas: z.coerce.number().int().min(1).max(168).optional(),
})

/**
 * Un diagnóstico, calculado y NARRADO — Plan 31 F2.
 *
 *   GET /api/diagnostico/narrado?sistema=&riesgoId=&idioma=
 *
 * ── POR QUÉ ES UNA RUTA APARTE Y NO UNA BANDERA DE LA DE ARRIBA ─────
 *
 * Porque tardan dos órdenes de magnitud distintos y fallan por motivos
 * distintos. `/api/diagnostico` es determinista y contesta en milisegundos;
 * ésta llama a un modelo de lenguaje y puede tardar decenas de segundos o no
 * contestar. Meterlas en la misma ruta con `?narrar=1` habría hecho que quien
 * sólo quiere las causas —`CierreDiagnostico`, que las necesita para
 * pre-rellenar un formulario— compartiera contrato con algo que puede tardar
 * un minuto.
 *
 * ── LA NARRACIÓN PUEDE FALTAR, Y LA RESPUESTA SIGUE SIENDO ÚTIL ─────
 *
 * `narracion: null` con su `motivo` no es un error: es el caso normal de un
 * servidor sin `IA_BASE`, y la vista enseña el diagnóstico sin narrar. Por eso
 * esto NO devuelve 503 cuando falta el modelo — devolvería un error sobre una
 * respuesta que está entera salvo el adorno. Sí lo devuelve si falta el MOTOR,
 * que es la parte que no se puede degradar.
 */
const NarradoQuerySchema = z.object({
  sistema: sistemaConocido(),
  riesgoId: z.string().min(1, 'Falta "riesgoId".'),
  valoresSensores: ValoresSensoresSchema,
  /*
   * El idioma lo manda la PANTALLA, no se deduce de una cabecera: el tablero
   * ya sabe en qué idioma está y `Accept-Language` dice lo que puso el
   * navegador, que es otra cosa. Un aviso en inglés bajo una interfaz en
   * español es exactamente el defecto que `verificar-i18n` persigue.
   */
  idioma: z.enum(['es', 'en']).optional(),
})

export function registerDiagnosticoRoutes(fastify, { motorDiagnostico, diarioDiagnosticos, narrador }) {
  fastify.get(
    '/api/diagnostico/metricas',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('visualizador')],
      schema: { querystring: MetricasQuerySchema },
    },
    async (request, reply) => {
      if (!diarioDiagnosticos) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el diario de diagnósticos montado.',
          codigo: CODIGOS.ERROR_DIARIO_SIN_MONTAR,
        })
      }

      const horas = request.query.horas ?? 24
      const desde = new Date(Date.now() - horas * 3_600_000)

      try {
        /*
         * `limite` alto a propósito: aquí se quiere AGREGAR la ventana entera,
         * no paginarla. El tope existe para que una ventana absurda no se lleve
         * la memoria del proceso, no para recortar el resultado — y si se
         * alcanza, `truncado` lo dice en vez de servir un promedio calculado
         * sobre la mitad de los datos sin avisar (§2.4).
         */
        const TOPE = 5000
        const { entradas, total } = await diarioDiagnosticos.leer({
          desde, hasta: new Date(), limite: TOPE,
        })

        return {
          ok: true,
          ventanaHoras: horas,
          desde: desde.toISOString(),
          ...resumirDiagnosticos(entradas),
          ...(total > TOPE ? { truncado: { tope: TOPE, hay: total } } : {}),
        }
      } catch (error) {
        return responderError(reply, 500, CODIGOS.ERROR_DIAGNOSTICO, error.message)
      }
    }
  )

  fastify.get(
    '/api/diagnostico/narrado',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('visualizador')],
      schema: { querystring: NarradoQuerySchema },
    },
    async (request, reply) => {
      if (!motorDiagnostico) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el motor de diagnóstico montado.',
          codigo: CODIGOS.ERROR_MOTOR_SIN_MONTAR,
        })
      }

      const { idioma = 'es', ...entrada } = request.query

      let resultado
      try {
        resultado = await motorDiagnostico.diagnosticar(entrada)
      } catch (error) {
        return responderError(reply, 400, CODIGOS.ERROR_DIAGNOSTICO, error.message)
      }

      /*
       * ── LA INSTRUCCIÓN SALE DE LA HERRAMIENTA, NO SE REESCRIBE ───────
       *
       * `comoRedactar` vive en `herramientas/diagnostico/index.mjs` porque
       * nació para el modelo del chat, y cada una de sus cláusulas tiene un
       * defecto medido detrás: «si NO viene `casosCitados`, no los menciones»
       * es el «3 casos previos» del 03-09-2026; «narra en ESE orden» es §2.3;
       * «si viene `estado`, DILO antes» es el Plan 28 F3.
       *
       * Se pide a la MISMA herramienta que usa el chat —no se copia su texto
       * aquí— para que el día que alguien añada una cláusula por un defecto
       * nuevo, valga para las dos superficies. Es §2.6 aplicado a una
       * instrucción en vez de a una regla de negocio; el modo de fallo es el
       * mismo.
       *
       * Se le pasa un motor de un solo uso que devuelve el resultado YA
       * calculado, en vez de dejar que lo recalcule: es el mismo diagnóstico,
       * y pedirlo dos veces duplicaría la escritura en el diario —dos entradas
       * para un solo diagnóstico falsearían las métricas del Plan 28 F7.
       */
      const paraNarrar = await crearHerramientasDeDiagnostico({
        motorDiagnostico: { diagnosticar: async () => resultado },
      }).diagnosticar_falla(entrada)

      const narracion = narrador && paraNarrar?.ok
        ? await narrador.narrar({ diagnostico: paraNarrar, idioma })
        : { texto: null, motivo: 'sin_servidor' }

      return {
        ok: true,
        ...resultado,
        /*
         * `fuentesCaidas` la calcula la HERRAMIENTA a partir de
         * `estadoFuentes`, no el motor, así que `...resultado` no la trae y
         * la respuesta salía con `fuentesCaidas: undefined` — medido el
         * 17-09-2026. Quien consuma esto no podía distinguir «ninguna fuente
         * se cayó» de «esta versión no lo sabe», que es justo la distinción
         * que §2.4 exige. Se toma de `paraNarrar`, que es quien la calculó.
         */
        fuentesCaidas: paraNarrar?.fuentesCaidas ?? [],
        /*
         * La narración va en su propio campo y NO fusionada con el resultado:
         * quien consuma esto tiene que poder distinguir lo que calculó el motor
         * de lo que escribió el modelo. Mezclarlos haría imposible auditar cuál
         * de los dos dijo qué — que es la pregunta que se hace después de un
         * «3 casos previos».
         */
        narracion: narracion.texto,
        ...(narracion.motivo ? { sinNarracion: narracion.motivo } : {}),
      }
    }
  )

  fastify.get(
    '/api/diagnostico',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('visualizador')],
      schema: { querystring: DiagnosticoQuerySchema },
    },
    async (request, reply) => {
      if (!motorDiagnostico) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el motor de diagnóstico montado.',
          codigo: CODIGOS.ERROR_MOTOR_SIN_MONTAR,
        })
      }

      try {
        const resultado = await motorDiagnostico.diagnosticar(request.query)
        return { ok: true, ...resultado }
      } catch (error) {
        // `diagnosticar()` lanza TypeError ante un riesgoId que no encaja
        // con el sistema — un error de quien llama, no del motor.
        return responderError(reply, 400, CODIGOS.ERROR_DIAGNOSTICO, error.message)
      }
    }
  )
}
