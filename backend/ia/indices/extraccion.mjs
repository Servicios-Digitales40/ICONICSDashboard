/**
 * La puerta al hilo que extrae texto: firma del archivo, topes y corte por
 * tiempo. El trabajo de verdad está en `extraccion.worker.mjs`.
 *
 * ── POR QUÉ ESTE ARCHIVO Y NO UN `new Worker()` SUELTO (Plan 22 F2) ──
 *
 * Porque las tres guardas de SEG-10 son distintas y se contestan en tres
 * momentos distintos, y ponerlas todas en el índice lo habría llenado de
 * detalle que no es suyo:
 *
 *  1. **La firma**, ANTES de arrancar nada. No cuesta un hilo descubrir que
 *     un `.pdf` no empieza por `%PDF-`.
 *  2. **Los topes**, dentro del hilo, donde se puede parar entre página y
 *     página.
 *  3. **El reloj**, fuera del hilo, porque un hilo colgado no se mide a sí
 *     mismo.
 *
 * ── POR QUÉ LA FIRMA Y NO LA EXTENSIÓN ─────────────────────────────
 *
 * Hasta el Plan 22 la extensión decidía qué parser corría: un archivo llamado
 * `manual.pdf` iba a `pdfjs` fuera lo que fuese por dentro. Se validaba el
 * TAMAÑO (`MAX_BYTES`) y nada más. Los dos primeros bytes son gratis y
 * descartan el caso entero — un `.zip` renombrado, un ejecutable, un archivo
 * a medio subir— antes de que ningún parser toque bytes de nadie.
 *
 * No pretende ser una detección de tipo completa: un PDF con `%PDF-` y
 * basura detrás sigue pasando, y de ése ya se encarga `pareceTexto`. Lo que
 * cierra es la puerta a que la EXTENSIÓN, que la elige quien sube el archivo,
 * decida qué código corre.
 *
 * ── UN HILO POR ARCHIVO, Y POR QUÉ SALE BARATO ─────────────────────
 *
 * Arrancar un `worker_thread` cuesta del orden de decenas de milisegundos.
 * Frente a la extracción de un manual —segundos— es ruido, y sólo ocurre al
 * indexar: nunca en una búsqueda, que es lo que tiene que contestar rápido.
 * Un pool sería optimizar lo que no duele, y traería el problema de qué hacer
 * con un hilo del pool que se quedó envenenado por un archivo roto.
 */
import { open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RUTA_WORKER = join(AQUI, 'extraccion.worker.mjs')

/**
 * Los primeros bytes que tiene que traer cada formato.
 *
 * `%PDF-` está en la primera línea de todo PDF por especificación. `PK\x03\x04`
 * es la cabecera local de la primera entrada de un ZIP, y un `.docx` es un ZIP
 * — la misma firma que `extraerTextoDocx` ya busca por dentro para localizar
 * `word/document.xml`.
 *
 * Los formatos de texto (`.txt`, `.md`) no tienen firma y no aparecen aquí: no
 * pasan por un parser, se leen tal cual, y exigirles una cabecera sería
 * inventar un requisito que el formato no tiene.
 */
const FIRMAS = new Map([
  ['.pdf', Buffer.from('%PDF-', 'latin1')],
  ['.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
])

/** Las extensiones que se abren en el hilo. El resto se leen en el sitio. */
export const NECESITAN_HILO = new Set(FIRMAS.keys())

/**
 * Tope de páginas de un PDF.
 *
 * El manual más grande que hay en planta hoy es el del variador V20: 332
 * páginas. 1500 deja sitio de sobra para un catálogo de fabricante completo y
 * corta el caso que esta guarda existe para cortar —el PDF generado con miles
 * de páginas—, que no es documentación de consulta sino una forma de tener el
 * indexador ocupado un rato largo.
 */
export const MAX_PAGINAS = 1500

/**
 * Tope de texto extraído, en caracteres.
 *
 * 4 millones son ~4400 fragmentos de 900, que ya es más de lo que un índice de
 * planta debería tener en un solo archivo. Existe aparte del tope de páginas
 * porque los dos casos patológicos son distintos: muchas páginas vacías pasan
 * el de caracteres, y una tabla exportada a PDF cabe en veinte páginas y trae
 * megabytes.
 */
export const MAX_CARACTERES = 4_000_000

/**
 * Corte por tiempo, en milisegundos.
 *
 * Generoso a propósito: no está para acotar lo que tarda un manual grande
 * —eso lo hacen los topes de arriba, y con criterio— sino para que un archivo
 * que hace a `pdfjs` no terminar nunca no deje un hilo vivo para siempre. Un
 * minuto es más de lo que tarda cualquier manual medido, y bastante menos que
 * «hasta que alguien reinicie el backend».
 */
export const MS_MAX_EXTRACCION = 60_000

/**
 * ¿Los primeros bytes del archivo son los que su extensión promete?
 *
 * Devuelve `true` para lo que no tiene firma declarada: la ausencia de regla
 * no es un rechazo. Ver la cabecera sobre por qué `.txt` no la tiene.
 *
 * @param {string} ext  extensión en minúsculas, con el punto
 * @param {Buffer} bytes
 */
export function firmaCorrecta(ext, bytes) {
  const firma = FIRMAS.get(ext)
  if (!firma) return true
  if (bytes.length < firma.length) return false
  return bytes.subarray(0, firma.length).equals(firma)
}

/** Qué decirle a quien subió un archivo cuya firma no cuadra. */
export function motivoFirma(ext) {
  return `no es un ${ext.slice(1).toUpperCase()} de verdad: sus primeros bytes no lo son, sólo el nombre lo dice`
}

/**
 * Los primeros bytes del archivo en disco, para comprobar su firma sin
 * leérselo entero. Un archivo más corto que la firma no la cumple, y eso ya
 * lo resuelve `firmaCorrecta`.
 */
async function primerosBytes(ruta, cuantos = 8) {
  const fd = await open(ruta, 'r')
  try {
    const buffer = Buffer.alloc(cuantos)
    const { bytesRead } = await fd.read(buffer, 0, cuantos, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await fd.close()
  }
}

/**
 * Extrae el texto de un archivo binario en un hilo aparte.
 *
 * Devuelve siempre la misma forma —nunca lanza— porque el índice necesita
 * decidir entre «esto va a `ilegibles`» y «esto se indexa», y una excepción a
 * mitad de un bucle sobre veinte archivos deja los otros diecinueve sin
 * indexar:
 *
 *   { paginas, truncado, motivoRespaldo, error }
 *
 * `error` no nulo significa que no hay nada que indexar y por qué.
 *
 * @param {object} opciones
 * @param {string} opciones.ruta
 * @param {string} opciones.ext            en minúsculas, con el punto
 * @param {number} [opciones.msMaximo]     las pruebas lo bajan para provocar el corte
 * @param {number} [opciones.maxPaginas]
 * @param {number} [opciones.maxCaracteres]
 */
export async function extraerTexto({
  ruta,
  ext,
  msMaximo = MS_MAX_EXTRACCION,
  maxPaginas = MAX_PAGINAS,
  maxCaracteres = MAX_CARACTERES,
}) {
  const vacío = { paginas: [], truncado: null, motivoRespaldo: null }

  if (!firmaCorrecta(ext, await primerosBytes(ruta))) {
    return { ...vacío, error: motivoFirma(ext) }
  }

  const worker = new Worker(RUTA_WORKER, {
    workerData: { ruta, ext, maxPaginas, maxCaracteres },
  })

  return new Promise((resolve) => {
    let resuelto = false
    const terminar = (resultado) => {
      if (resuelto) return
      resuelto = true
      clearTimeout(reloj)
      worker.terminate()
      resolve(resultado)
    }

    /*
     * El reloj arranca aquí y no dentro del hilo: un hilo que se ha quedado
     * dando vueltas en una expresión regular no ejecuta su propio temporizador
     * —no hay bucle de eventos que lo atienda— así que sólo el hilo de fuera
     * puede medirlo. `terminate()` es la única salida de ese caso.
     */
    const reloj = setTimeout(() => {
      terminar({ ...vacío, error: `la extracción pasó de ${Math.round(msMaximo / 1000)} s y se cortó` })
    }, msMaximo)

    worker.on('message', (mensaje) => {
      if (mensaje?.error) terminar({ ...vacío, error: mensaje.error })
      else terminar({ ...vacío, ...mensaje, error: null })
    })

    // Un hilo que se cae sin mensaje: sin esto, la promesa no se resuelve
    // nunca y la indexación entera se queda esperando a un hilo que ya no está.
    worker.on('error', (error) => terminar({ ...vacío, error: error.message }))
    worker.on('exit', (código) => {
      if (código !== 0) terminar({ ...vacío, error: `el hilo de extracción terminó con código ${código}` })
    })
  })
}
