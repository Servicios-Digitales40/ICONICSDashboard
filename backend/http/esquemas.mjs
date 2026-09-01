/**
 * Esquemas de los cuerpos que acepta la API.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Antes cada ruta validaba su cuerpo a mano, y eso tenía dos costes que se
 * pagaron de verdad:
 *
 *   1. La MISMA regla escrita dos veces y divergiendo. `historial` se
 *      comprobaba con `Array.isArray(...)` en `POST /api/chat` y otra vez, con
 *      criterio distinto y más estricto, en `POST /api/chat/exportar`. Dos
 *      copias de una regla son dos oportunidades de que una se quede atrás.
 *
 *   2. Reglas que faltaban sin que se notara. `historial` no tenía techo: una
 *      lista de diez mil turnos entraba entera y acababa en el prompt del
 *      modelo. Nada fallaba, sólo se gastaba una GPU.
 *
 * Con un esquema por ruta, la validación no se puede olvidar al añadir el
 * siguiente endpoint: es parte de la declaración de la ruta, no un `if` que
 * alguien tiene que acordarse de escribir.
 *
 * ── LO QUE NO SE VALIDA AQUÍ ───────────────────────────────────────
 *
 * Los nombres de punto de ICONICS siguen validándose con
 * `iconics/validation.mjs` y sus expresiones regulares. Son una lista blanca
 * de la sintaxis real del servidor —con sus barras invertidas, sus corchetes
 * de GridWorX y su `$info:`— documentada con ejemplos tomados de la máquina.
 * Un `z.string()` no expresa eso mejor; sólo lo escondería.
 */
import { z } from 'zod'
import { isSafeHistoryArgument, isSafePointName } from '../iconics/validation.mjs'
import { SISTEMA_IDS } from '../../shared/eva/sistemas.js'

/** Longitud máxima de una pregunta. Más que esto no es una pregunta. */
export const MAX_PREGUNTA = 2000

/**
 * Turnos de conversación que se envían como contexto.
 *
 * El techo existe porque sin él la lista entra entera en el prompt: veinte
 * turnos ya son más contexto del que este modelo aprovecha, y cada uno de más
 * es tiempo de GPU gastado en algo que el modelo va a ignorar. `chat.responder()`
 * recorta por su cuenta según el presupuesto real de tokens; esto es el tope
 * duro que impide que llegue una lista absurda.
 */
const MAX_TURNOS = 20

/** Longitud máxima del texto de un turno del historial. */
const MAX_TEXTO_TURNO = 4000

/**
 * Un nombre de punto que además pasa la lista blanca de ICONICS.
 *
 * Se envuelve el validador existente en vez de reescribir su patrón: la regla
 * sigue viviendo en un solo sitio y aquí sólo se conecta con Zod.
 */
const NombrePunto = z.string().refine(isSafePointName, {
  /*
   * El texto es el que ya devolvía la validación a mano y NO se cambia: es el
   * contrato con el frontend y con los guiones de `scripts/`, que comparan la
   * cadena entera.
   */
  message: 'Invalid pointName parameter.',
})

/**
 * Un parámetro opcional que, si viene, tiene que ser un nombre de punto
 * válido, y que admite la cadena vacía como «no se ha pedido nada».
 *
 * La distinción importa y no es cosmética: la validación a mano decía
 * `if (path && !isSafePointName(path))`, es decir, sólo comprobaba el valor
 * cuando había uno. Navegar sin `path` es pedir la RAÍZ del árbol, que es lo
 * primero que hace la pantalla de exploración al abrirse; un esquema que
 * rechace `''` deja esa pantalla con un 400 nada más entrar.
 *
 * `isSafePointName` no acepta la cadena vacía —su patrón exige al menos un
 * carácter— así que hay que permitirla explícitamente aquí.
 */
const NombrePuntoOpcional = z
  .string()
  .refine(valor => valor === '' || isSafePointName(valor), {
    message: 'Invalid pointName parameter.',
  })
  .optional()
  .default('')

/**
 * Mismo criterio que `NombrePuntoOpcional`: la validación a mano comprobaba
 * estos cuatro sólo cuando traían valor (`value && !isSafeHistoryArgument(value)`),
 * y omitirlos es legítimo — sin `aggregate` ni `interval` el historiador aplica
 * sus propios defectos.
 */
const ArgumentoHistoriaOpcional = z
  .string()
  .refine(valor => valor === '' || isSafeHistoryArgument(valor), {
    message: 'Parámetro de historia con caracteres no admitidos.',
  })
  .optional()
  .default('')

/* ── Chat ─────────────────────────────────────────────────────────── */

export const TurnoSchema = z.object({
  rol: z.enum(['usuario', 'asistente']),
  texto: z.string().trim().min(1).max(MAX_TEXTO_TURNO),
})

export const ChatSchema = z.object({
  pregunta: z
    .string()
    .trim()
    .min(1, 'Falta la pregunta.')
    .max(MAX_PREGUNTA, `La pregunta no puede pasar de ${MAX_PREGUNTA} caracteres.`),
  /*
   * El hilo anterior, para que «¿y el día anterior?» signifique algo.
   *
   * `catch([])` y no `default([])`: un historial con un turno mal formado no
   * debe tumbar la consulta con un 400 —la pregunta es válida y el operador
   * espera una respuesta—, simplemente se atiende sin contexto previo. Es la
   * misma tolerancia que tenía el `Array.isArray()` anterior, ahora explícita.
   */
  historial: z.array(TurnoSchema).max(MAX_TURNOS).catch([]).default([]),
})

/**
 * Exportar la conversación a PDF.
 *
 * ── POR QUÉ SE FILTRA Y NO SE RECHAZA ──────────────────────────────
 *
 * Los turnos que no son del usuario ni del asistente se DESCARTAN y el resto
 * se exporta. Es el comportamiento que ya tenía la validación a mano
 * (`turnos.filter(...)`) y no es una concesión: el historial que manda el
 * frontend puede llevar turnos de servicio —avisos de sistema, marcas de
 * estado— que no son parte de la conversación y que nunca debieron salir en el
 * documento. Rechazar el lote entero por uno de ésos dejaría sin exportar una
 * conversación perfectamente válida.
 *
 * El 400 se reserva para cuando NO QUEDA NADA que exportar, que es la única
 * situación en la que no hay documento posible.
 */
export const ExportarChatSchema = z.object({
  /*
   * `default([])` para que un cuerpo SIN `historial` caiga en el mismo
   * mensaje que uno con la lista vacía —«No hay conversación que exportar»—
   * y no en el genérico de campo obligatorio, que no le dice nada a quien lo
   * lee en la pantalla.
   */
  historial: z
    .array(z.unknown())
    .max(500)
    .default([])
    .transform(turnos => turnos.filter(turno => TurnoSchema.safeParse(turno).success))
    .refine(turnos => turnos.length > 0, {
      message: 'No hay conversación que exportar.',
    }),
})

export const CambiarModeloSchema = z.object({
  modelo: z.string().trim().min(1, 'Falta el modelo.'),
})

/* ── Control de planta ────────────────────────────────────────────── */

export const ControlBombaSchema = z.object({
  encender: z.boolean({
    error: issue =>
      issue.input === undefined
        ? 'Falta decir si hay que encender (true) o apagar (false) la bomba.'
        : 'El campo "encender" tiene que ser true o false.',
  }),
})

/* ── ICONICS ──────────────────────────────────────────────────────── */

/**
 * Series admitidas en una sola llamada a `/history/batch`.
 *
 * Cinco son las del pronóstico, que es el consumidor que motivó la ruta;
 * ocho, el catálogo entero del sistema del tanque. Diez deja margen sin
 * dejarlo abierto: cada señal multiplica los tramos, y una lista sin techo
 * convierte una petición en cientos de lecturas al historiador.
 */
export const MAX_SERIES_BATCH = 10

export const HistoryBatchSchema = z
  .object({
    points: z
      .array(NombrePunto)
      .min(1, 'points must be a non-empty array of point names.')
      .max(MAX_SERIES_BATCH, `No more than ${MAX_SERIES_BATCH} points per request.`),
    /*
     * `z.coerce.date()` acepta tanto una cadena ISO como un número de época,
     * que es lo que mandaban los dos clientes de esta ruta, y rechaza lo que
     * `new Date()` habría convertido en `Invalid Date` sin avisar.
     */
    startDate: z.coerce.date({ error: 'startDate must be a valid date.' }),
    endDate: z.coerce.date({ error: 'endDate must be a valid date.' }),
    aggregate: ArgumentoHistoriaOpcional,
  })
  .refine(datos => datos.endDate > datos.startDate, {
    message: 'endDate must be after startDate.',
    path: ['endDate'],
  })

export const WritePointSchema = z.object({
  pointName: NombrePunto,
  /*
   * El valor puede ser número, texto o booleano según el tipo del tag. Lo
   * único que se exige es que venga: `null` y `undefined` no son escrituras,
   * y dejarlos pasar escribiría un valor vacío sobre la planta.
   */
  value: z.union([z.string(), z.number(), z.boolean()], {
    error: issue =>
      issue.input === undefined
        ? 'value is required.'
        : 'value must be a string, number or boolean.',
  }),
})

export const WriteBatchSchema = z.object({
  items: z
    .array(WritePointSchema)
    .min(1, 'items array is required ([{ pointName, value }]).')
    .max(50, 'No more than 50 writes per request.'),
})

export const AcknowledgeAlarmsSchema = z.object({
  eventIds: z.array(z.union([z.string(), z.number()])).min(1, 'eventIds array is required.'),
  comment: z.string().max(500).optional().default(''),
})

/* ── Parámetros de consulta ───────────────────────────────────────── */

export const PointNameQuerySchema = z.object({
  pointName: NombrePunto.optional(),
})

export const HistoryQuerySchema = z.object({
  pointName: NombrePunto,
  startDate: ArgumentoHistoriaOpcional,
  endDate: ArgumentoHistoriaOpcional,
  aggregate: ArgumentoHistoriaOpcional,
  interval: ArgumentoHistoriaOpcional,
})

export const BrowseQuerySchema = z.object({
  path: NombrePuntoOpcional,
})

export const SearchQuerySchema = z.object({
  query: NombrePuntoOpcional,
})

export const AlarmsQuerySchema = z.object({
  pointName: NombrePuntoOpcional,
  hours: z.coerce.number().positive().optional().default(1),
})

export const ReporteQuerySchema = z.object({
  /*
   * El patrón de UUID se valida ANTES de tocar el filesystem: eso basta como
   * guarda contra recorrido de rutas, porque un valor que no lo cumpla ni
   * siquiera llega a construirse como ruta.
   */
  id: z.string().regex(/^[0-9a-f-]{36}$/i, 'Parámetro "id" inválido.'),
})

/** El mismo patrón que `ReporteQuerySchema.id` — los ids de manual también son
 *  UUID de `randomUUID()` — para las dos rutas de manuales que identifican
 *  una entrada existente en vez de crear una. */
const IdManualSchema = z.string().regex(/^[0-9a-f-]{36}$/i, 'Parámetro "id" inválido.')

/**
 * `POST /api/rag/documentos`. El cuerpo son los BYTES del archivo —no JSON,
 * igual que `/api/voz`—, así que su metadato viaja por query string.
 * `nombre` es obligatorio porque el cuerpo en bruto no lleva un nombre de
 * archivo consigo, a diferencia de un `multipart/form-data`.
 */
export const SubirManualQuerySchema = z.object({
  nombre: z.string().min(1, 'Falta el parámetro "nombre" (el nombre del archivo).'),
  sistema: z.string().optional(),
  titulo: z.string().optional(),
})

/** `PUT /api/rag/documentos` — reemplaza el contenido de un manual existente.
 *  El cuerpo son los bytes nuevos; qué entrada sustituyen va en `id`. */
export const ReemplazarManualQuerySchema = z.object({
  id: IdManualSchema,
})

/** `PATCH /api/rag/documentos` — archiva una entrada. Sin cuerpo que mandar
 *  aparte del propio id, así que también va por query string: la misma
 *  forma que las otras dos rutas de escritura de este grupo. */
export const ArchivarManualQuerySchema = z.object({
  id: IdManualSchema,
})

/* ── Casos (Plan 16 Fase 5) ───────────────────────────────────────── */

/** El síntoma o la solución tienen que decir algo, no una frase vacía —
 *  mismo mínimo que ya exige `registrar_intervencion` por voz y chat, para
 *  que las dos puertas midan la calidad de una intervención con la misma
 *  vara (ver la cabecera de `crearHerramientasDeAprendizaje`). */
const TextoDeCasoSchema = (campo) =>
  z.string().trim().min(8, `Hacen falta las dos mitades: QUÉ pasaba y QUÉ se hizo, con detalle — "${campo}" es demasiado corto.`)

const DisparadorCasoSchema = z.object({
  tipo: z.enum(['riesgo', 'peticion']),
  riesgoId: z.string().optional(),
  severidad: z.string().optional(),
})

const CitaManualSchema = z.object({
  archivo: z.string(),
  pagina: z.number(),
})

const DiagnosticoPropuestoSchema = z.object({
  propuesta: z.string().optional(),
  respaldo: z.enum(['alto', 'medio', 'bajo']).optional(),
  fuentes: z.array(z.string()).optional(),
  manualCitado: z.array(CitaManualSchema).optional(),
})

const CausaRealSchema = z.object({
  componente: z.string().optional(),
  tipo: z.string().optional(),
})

const ResultadoCasoSchema = z.object({
  riesgoDesaparecio: z.boolean().optional(),
  observaciones: z.string().optional(),
})

/**
 * `POST /api/casos` — el cierre de un diagnóstico (Plan 16 Fase 5, UI A).
 *
 * `sintoma`/`causa`/`solucion`/`resuelto`/`sistema`/`origen` son el mismo
 * esquema que ya rellena `registrar_intervencion`; el resto es la parte
 * nueva de §4 del plan, y sólo la rellena esta puerta —ver la cabecera de
 * `crearIntervencion` en `shared/eva/aprendizaje.js` para por qué son
 * opcionales y no un segundo esquema.
 *
 * `muestraSensores` es un volcado tal cual de lo que ya leyó el tablero: no
 * hay lista fija de claves que validar aquí sin duplicar `senales.js` para
 * dos sistemas con catálogos distintos, y esta ruta no necesita saber qué
 * significa cada una — sólo guardarla junto al resto del caso.
 */
export const CrearCasoSchema = z.object({
  sistema: z.enum(SISTEMA_IDS).nullish(),
  sintoma: TextoDeCasoSchema('sintoma'),
  causa: z.string().trim().min(1).optional(),
  solucion: TextoDeCasoSchema('solucion'),
  resuelto: z.boolean().optional(),
  origen: z.string().trim().min(1).optional(),

  disparador: DisparadorCasoSchema.optional(),
  muestraSensores: z.record(z.string(), z.unknown()).optional(),
  diagnostico: DiagnosticoPropuestoSchema.optional(),
  causaReal: CausaRealSchema.optional(),
  resultado: ResultadoCasoSchema.optional(),
  diagnosticoCorrecto: z.boolean().optional(),
})

/**
 * Los mensajes escritos a mano en los esquemas ya son frases completas —y
 * varios nombran su propio campo, como «Invalid pointName parameter.»—, así
 * que se devuelven TAL CUAL: anteponerles la ruta daría «pointName: Invalid
 * pointName parameter.», y además rompería a los guiones de `scripts/`, que
 * comparan la cadena entera.
 *
 * Sólo se antepone el campo a los que genera Zod por su cuenta, que dicen qué
 * esperaban pero no dónde: «Invalid input», «Expected string».
 */
function formatearMensaje(ruta, mensaje) {
  const esMensajeDeZod = /^(Required|Invalid input|Invalid option|Expected |Too big|Too small|Unrecognized)/.test(
    mensaje
  )
  if (!esMensajeDeZod || !ruta) return mensaje
  return `${ruta}: ${mensaje}`
}

/**
 * Traduce un fallo de Zod al texto que ya devolvía la validación a mano.
 *
 * Se toma el primer problema y no todos: la API respondía un solo mensaje por
 * error, los clientes lo pintan tal cual en un aviso, y una lista de cinco
 * problemas en un `alert` no ayuda a nadie. El resto viaja en `detalles` para
 * quien lo quiera.
 *
 * Sirve para un `ZodError` de verdad —el que lanza `esquema.parse()` fuera de
 * una ruta, como en las pruebas de este archivo—. Para el que arma Fastify al
 * validar una ruta contra un `schema` (que no es un `ZodError`, es un array
 * con otra forma), ver `primerMensajeDeValidacion`.
 */
export function primerMensaje(error) {
  const problema = error?.issues?.[0]
  if (!problema) return 'Cuerpo de la petición inválido.'
  return formatearMensaje(problema.path?.join('.') ?? '', problema.message)
}

/**
 * Lo mismo que `primerMensaje`, pero para el array que deja Fastify en
 * `error.validation` cuando una ruta rechaza `request.query` o
 * `request.body` contra su `schema` de Zod (ver `app.mjs`,
 * `setValidatorCompiler`). No es un `ZodError`: `fastify-type-provider-zod`
 * traduce cada `issue` de Zod a la forma que usa Fastify —`instancePath` en
 * vez de `path`—, pero conserva el `message` de Zod tal cual, así que el
 * mismo criterio de cuándo anteponer el campo vale igual.
 */
export function primerMensajeDeValidacion(erroresDeValidacion) {
  const problema = erroresDeValidacion?.[0]
  if (!problema) return 'Cuerpo de la petición inválido.'
  const ruta = (problema.instancePath ?? '').replace(/^\//, '').split('/').filter(Boolean).join('.')
  return formatearMensaje(ruta, problema.message)
}
