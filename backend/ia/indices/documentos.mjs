/**
 * Índice documental con fragmentos citables por archivo y página.
 * Extrae PDF con PDF.js y un lector de respaldo; no incluye OCR.
 * BM25 funciona sin servicios adicionales; embeddings añade búsqueda híbrida.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { inflateSync, inflateRawSync } from 'node:zlib'
import { logger } from '../../logger.mjs'
import { EXTENSIONES_MANUAL, NOMBRE_MANIFIESTO, normalizarManifiesto } from '../../../shared/eva/comun/manuales.js'
import { indexarTerminos, puntuarBm25 } from './bm25.mjs'
import {
  coseno,
  crearMotorEmbeddings,
  guardarCacheEmbeddings,
  hashDeTexto,
  leerCacheEmbeddings,
} from './embeddings.mjs'

/**
 * Tamaño de fragmento, en caracteres.
 *
 * 900 son unas 12 líneas de manual: lo bastante para que un procedimiento
 * quepa entero y lo bastante poco para que tres fragmentos no ahoguen el
 * contexto del modelo, que aquí es escaso.
 */
const TAMANO_FRAGMENTO = 900

/** Solape entre fragmentos, para que una frase partida en dos aparezca entera en uno. */
const SOLAPE = 150

/**
 * Extensiones que se saben leer. El resto se ignoran en silencio.
 *
 * Declaradas en `shared/eva/comun/manuales.js` y no aquí: la ruta de subida (Plan
 * 16 Fase 1) necesita la MISMA lista para rechazar de entrada un archivo que
 * el índice no sabría leer. Dos listas con la misma intención es la forma en
 * que una acaba aceptando algo que la otra rechaza.
 */
const SOPORTADAS = new Set(EXTENSIONES_MANUAL)

/**
 * Cada cuánto se mira si la carpeta cambió, en milisegundos.
 *
 * Diez segundos: quien deja un manual nuevo lo prueba en seguida, y esperar
 * ese rato no molesta. Bajarlo a cero haría un `readdir` con sus `stat` en
 * cada pregunta, y sobre una unidad de red —que es donde acaban los manuales
 * de una planta— eso sí se nota.
 */
const MS_ENTRE_COMPROBACIONES = 10000

/**
 * Tope de archivo, en bytes. Un PDF de 200 MB no es documentación de consulta.
 *
 * Exportado para que la ruta de subida (Plan 16 Fase 1) rechace un archivo
 * demasiado grande ANTES de escribirlo a disco, con el mismo número que
 * usaría el índice para descartarlo después — sin esto, se podría subir un
 * archivo que la carga acepta y el índice nunca llega a leer.
 */
export const MAX_BYTES = 40 * 1024 * 1024

/**
 * ── PLAN 16 FASE 0: POR QUÉ HACÍA FALTA ESTO ────────────────────────
 *
 * `recargar()` volvía a embeber TODOS los fragmentos, de uno en uno, cada vez
 * que la carpeta cambiaba — un manual de 200 páginas son unos 600 fragmentos,
 * o sea 600 llamadas HTTP secuenciales, y añadir un manual nuevo repetía las
 * de los que ya estaban. Aceptable mientras la carpeta se llenaba a mano antes
 * de arrancar el backend; no en cuanto exista un botón «Subir manual» — eso
 * convertiría la subida en una pantalla congelada varios minutos.
 *
 * Dos mejoras, independientes entre sí:
 *
 *  1. CACHÉ PERSISTENTE, por hash del contenido del fragmento — el motor
 *     genérico de `embeddings.mjs`, que desde la Fase 2 comparte con
 *     `casos.mjs`. Un fragmento que ya se embebió en un proceso anterior no
 *     vuelve a costar una llamada HTTP, sobreviva o no el backend a un
 *     reinicio.
 *  2. INDEXADO INCREMENTAL, por archivo, que sí es específico de este índice.
 *     Un archivo cuya huella (tamaño + fecha) no cambió no se vuelve a leer
 *     ni a trocear: sus fragmentos —con sus términos de BM25 y su vector— se
 *     reutilizan tal cual.
 *
 * Juntas: archivo nuevo → sólo SUS fragmentos pasan por la extracción y el
 * embedding. Los demás ni se tocan.
 */

/**
 * Dónde vive la caché de embeddings entre reinicios del backend.
 *
 * En `datos/`, junto a los reportes y lo aprendido: es estado que el backend
 * genera en marcha, no código, y por eso está en `.gitignore` (ver la cabecera
 * de ese archivo). Perderla no es grave — se reconstruye sola, fragmento a
 * fragmento, en el primer arranque— pero conservarla es lo que hace que un
 * `pm2 restart` no vuelva a pagar el embedding de una documentación que no
 * cambió.
 *
 * Archivo propio, distinto del de `casos.mjs`: comparten el motor de
 * `embeddings.mjs`, no el archivo de caché — mezclar vectores de fragmentos
 * de manual con vectores de intervenciones en un solo JSON no aportaría nada
 * y complicaría inspeccionar cada caché por separado.
 */
const RUTA_CACHE_EMBEDDINGS = join('datos', 'embeddings-cache.json')

/* ── Extracción de texto ─────────────────────────────────────────────── */

/**
 * El lector de PDF de verdad: `pdfjs-dist`, el motor de Firefox.
 *
 * ── POR QUÉ UNA DEPENDENCIA, DESPUÉS DE HABERLA DESCARTADO ─────────
 *
 * Porque la alternativa medida no funcionaba con manuales reales — ver la
 * cabecera de `extraerTextoPdfCasero`, más abajo, con las cifras. Un índice
 * documental que no sabe leer el manual del variador que usa la planta no
 * es un índice documental.
 *
 * ── IMPORT DIFERIDO, COMO `reporte.mjs` CON PDFKIT ─────────────────
 *
 * `pdfjs` es grande y sólo hace falta cuando entra un `.pdf`. Una
 * instalación que sólo tenga `.txt` y `.md` en su carpeta no debería pagar
 * su carga al arrancar. Se importa la primera vez que se lee un PDF y se
 * guarda; a partir de ahí es gratis.
 *
 * ── NÚMEROS DE PÁGINA DE VERDAD ────────────────────────────────────
 *
 * Devuelve `{pagina, texto}`, no un array de textos. El lector viejo hacía
 * `if (texto.length > 40) paginas.push(texto)` y el llamador citaba con
 * `i + 1`: una página vacía o casi vacía **desplazaba la numeración de
 * todas las siguientes**, y la cita apuntaba a la página equivocada. Con un
 * PDF de dos páginas no se nota; con el manual de 332 del V20, una portada
 * y dos páginas legales de por medio mueven cada cita tres páginas.
 */
let pdfjs = null
let rutaFuentesEstandar = null

async function extraerTextoPdf(buffer) {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    /*
     * Las 14 fuentes estándar del PDF (Helvetica, Times…) no viajan dentro
     * del archivo: el lector tiene que traerlas. `pdfjs` las trae en su
     * paquete, pero por defecto las busca en una URL de navegador y aquí no
     * hay navegador. Sin esto, cada página suelta un aviso y las fuentes no
     * embebidas se descodifican peor.
     */
    const url = await import('node:url')
    rutaFuentesEstandar = url.pathToFileURL(
      join(process.cwd(), 'backend', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/'
    ).href
  }

  /*
   * La TAREA se guarda aparte del documento: en pdfjs 6 quien se destruye es
   * la tarea de carga, no el documento (`doc.destroy` no existe, y llamarlo
   * hacía caer todos los PDF al lector de respaldo — sin romper nada
   * visible, sólo devolviendo el texto pobre de antes).
   */
  const tarea = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: rutaFuentesEstandar,
    // Sin fuentes del sistema ni `eval`: aquí sólo se quiere el texto, y las
    // dos cosas son superficie de riesgo sobre un archivo que alguien subió.
    useSystemFonts: false,
    isEvalSupported: false,
  })
  const doc = await tarea.promise

  const paginas = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n)
      const contenido = await pagina.getTextContent()
      /*
       * `items` son trozos posicionados, no líneas: unirlos sin separador
       * pega palabras de columnas distintas («PZDPKW»), que es justo lo que
       * ensuciaba la extracción vieja. Un espacio entre ítems, y después el
       * colapso de espacios repetidos, deja algo que BM25 puede tokenizar.
       */
      const texto = contenido.items
        .map((i) => i.str ?? '')
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trim()
      if (texto) paginas.push({ pagina: n, texto })
      pagina.cleanup()
    }
  } finally {
    await tarea.destroy()
  }
  return paginas
}


/**
 * Lector PDF de respaldo para estructuras incompletas que PDF.js rechaza.
 * Extrae texto de streams con zlib; no sustituye al lector principal ni hace OCR.
 */
function extraerTextoPdfCasero(buffer) {
  const paginas = []

  /*
   * Se recorren los flujos en crudo sobre el buffer BINARIO.
   *
   * Convertir el PDF entero a `latin1` primero y buscar ahí es lo que hace
   * medio internet, y corrompe los flujos comprimidos: `inflate` necesita los
   * bytes exactos. Se localizan los delimitadores sobre una vista latin1 —que
   * es byte a byte, así que los índices coinciden— y se corta del buffer.
   */
  const vista = buffer.toString('latin1')
  let cursor = 0

  while (true) {
    const inicio = vista.indexOf('stream', cursor)
    if (inicio === -1) break

    // Tras `stream` viene CRLF, LF o CR. Saltarlo mal desplaza un byte y la
    // descompresión falla entera.
    let datos = inicio + 6
    if (vista[datos] === '\r') datos++
    if (vista[datos] === '\n') datos++

    const fin = vista.indexOf('endstream', datos)
    if (fin === -1) break
    cursor = fin + 9

    const crudo = buffer.subarray(datos, fin)
    let contenido = null

    try {
      // Casi todo va con FlateDecode. `inflateRaw` cubre los flujos a los que
      // les falta la cabecera zlib, que algunos generadores omiten.
      contenido = inflateSync(crudo).toString('latin1')
    } catch {
      try {
        contenido = inflateRawSync(crudo).toString('latin1')
      } catch {
        // Sin comprimir, o comprimido con un filtro que no manejamos (LZW,
        // DCT de una imagen). Se prueba en crudo: si no tiene operadores de
        // texto, `recogerTexto` devuelve vacío y se descarta solo.
        contenido = crudo.toString('latin1')
      }
    }

    const texto = recogerTexto(contenido)
    if (texto.trim().length > 40) paginas.push(texto)
  }

  return paginas
}

/**
 * Saca el texto de un `.docx`, también sin dependencias.
 *
 * ── QUÉ ES UN DOCX POR DENTRO ──────────────────────────────────────
 *
 * Un ZIP con XML dentro. Todo el texto del documento vive en una sola entrada,
 * `word/document.xml`, comprimida con deflate — que es exactamente lo que
 * `node:zlib` sabe descomprimir. Así que leerlo es: localizar esa entrada en
 * el ZIP, inflarla, y quitar las etiquetas.
 *
 * No se implementa un lector de ZIP completo: no hace falta. Se busca la
 * cabecera local de esa única entrada recorriendo el archivo, que para un
 * documento de texto son unos pocos cientos de kilobytes.
 *
 * ── LO QUE NO CUBRE ────────────────────────────────────────────────
 *
 * `.doc` antiguo (formato binario de Word 97, que no es ZIP) y los documentos
 * cifrados con contraseña. Los dos se detectan porque no aparece la entrada, y
 * se cuentan como ilegibles en vez de indexar basura.
 */
function extraerTextoDocx(buffer) {
  const vista = buffer.toString('latin1')

  /*
   * Se busca la CABECERA LOCAL (`PK\x03\x04`) de `word/document.xml`, no la
   * entrada del directorio central.
   *
   * Las dos contienen el nombre del archivo, así que buscar el nombre a secas
   * encuentra primero la que toque y puede ser la equivocada: la del
   * directorio central no va seguida de los datos, sino de metadatos, y
   * inflarla desde ahí devuelve basura. La firma local delimita sin ambigüedad
   * dónde empiezan los bytes comprimidos.
   */
  let posicion = -1
  let desde = 0
  while (true) {
    const i = vista.indexOf('PK\x03\x04', desde)
    if (i === -1) break

    const longitudNombre = buffer.readUInt16LE(i + 26)
    const nombre = buffer.toString('latin1', i + 30, i + 30 + longitudNombre)
    if (nombre === 'word/document.xml') { posicion = i; break }
    desde = i + 4
  }

  if (posicion === -1) return []

  const metodo = buffer.readUInt16LE(posicion + 8)
  const comprimido = buffer.readUInt32LE(posicion + 18)
  const longitudNombre = buffer.readUInt16LE(posicion + 26)
  const longitudExtra = buffer.readUInt16LE(posicion + 28)
  const inicioDatos = posicion + 30 + longitudNombre + longitudExtra

  /*
   * `comprimido === 0` con streaming: Word a veces deja los tamaños a cero en
   * la cabecera local y los pone en el descriptor de datos, DETRÁS de los
   * bytes. En ese caso se infla hasta el final del archivo: `inflateRaw` para
   * solo cuando el flujo termina, así que la cola sobrante no estorba.
   */
  const fin = comprimido > 0 ? inicioDatos + comprimido : buffer.length
  const datos = buffer.subarray(inicioDatos, fin)

  let xml
  try {
    // Método 8 = deflate, que es lo que usa Word. El 0 es «sin comprimir».
    xml = metodo === 0 ? datos.toString('utf8') : inflateRawSync(datos).toString('utf8')
  } catch {
    return []
  }

  return [xmlADocumento(xml)]
}

/**
 * El XML de Word → texto llano.
 *
 * Lo que importa es respetar la estructura de párrafo ANTES de borrar las
 * etiquetas: `</w:p>` cierra un párrafo y `<w:br/>` es un salto de línea. Si se
 * quitan todas las etiquetas de golpe, el documento entero sale como un único
 * párrafo kilométrico, el troceado corta por donde le toca y ningún fragmento
 * coincide con un procedimiento — que es justo lo que se busca en un manual.
 */
function xmlADocumento(xml) {
  return String(xml)
    // Los saltos y finales de párrafo, a saltos de línea de verdad.
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    // Una celda de tabla que acaba se separa con un espacio, no se pega a la
    // siguiente: «MotorOperativo» sería una palabra que nadie va a buscar.
    .replace(/<\/w:tc>/g, ' ')
    .replace(/<\/w:tr>/g, '\n')
    // Y ahora sí, fuera el resto del marcado.
    .replace(/<[^>]+>/g, '')
    /*
     * Los códigos de campo de Word, que sobreviven al borrado de etiquetas.
     *
     * Son instrucciones, no texto: `PAGEREF _Toc238115000 \h 1` es lo que Word
     * guarda detrás de una entrada del índice para saber a qué página apunta.
     * Al usuario nunca se le enseñan, pero al quitar el marcado quedan sueltos
     * y entran en el índice como si fueran contenido — y arrastran consigo el
     * título del apartado, así que producen exactamente el mismo ruido que las
     * líneas de puntitos del PDF.
     */
    .replace(/\b(?:PAGEREF|HYPERLINK|TOC|SEQ|REF|STYLEREF)\b[^\n]*?\\\*?\s*\w*/g, '')
    .replace(/_Toc\d+/g, '')
    // Las entidades XML que Word escribe.
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Recoge los operadores de texto de un flujo de contenido ya descomprimido.
 *
 * Dos formas, y hacen falta las dos: `(hola) Tj` dibuja una cadena suelta, y
 * `[(ho) -20 (la)] TJ` dibuja varias con ajustes de espaciado entre ellas —que
 * es como sale el texto justificado, o sea, casi todo el cuerpo de un manual—.
 */
function recogerTexto(flujo) {
  const trozos = []

  // Cadenas entre paréntesis, respetando el escape `\)` del propio PDF.
  const cadena = /\((?:\\.|[^\\()])*\)/g
  // Un bloque de texto va entre BT y ET. Fuera de ahí, un paréntesis es
  // cualquier otra cosa —un nombre, un comentario— y recogerlo mete ruido.
  const bloques = flujo.split(/\bBT\b/).slice(1)

  for (const bloque of bloques) {
    const cuerpo = bloque.split(/\bET\b/)[0] ?? ''
    let linea = []
    let m

    cadena.lastIndex = 0
    while ((m = cadena.exec(cuerpo)) !== null) {
      linea.push(desescapar(m[0].slice(1, -1)))
    }
    if (linea.length) trozos.push(linea.join(''))
  }

  return trozos
    .join('\n')
    // Los saltos de línea del PDF caen donde acaba la línea impresa, no donde
    // acaba la frase. Se rehace el párrafo uniendo lo que sigue en minúscula.
    .replace(/([a-záéíóúñ,])\n([a-záéíóúñ])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ')
}

/** Escapes de cadena del PDF: `\n`, `\(`, `\\`, y los octales `\250`. */
function desescapar(s) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) => {
    switch (c) {
      case 'n': return '\n'
      case 'r': return ''
      case 't': return ' '
      case 'b': case 'f': return ''
      case '(': return '('
      case ')': return ')'
      case '\\': return '\\'
      default: return String.fromCharCode(parseInt(c, 8))
    }
  })
}

/**
 * ¿Es esto texto legible o basura de una fuente sin `ToUnicode`?
 *
 * Se mide la proporción de caracteres que podrían aparecer en un manual en
 * español. Por debajo del 80 % lo que salió no es texto, y meterlo en el índice
 * sería peor que no tenerlo: la búsqueda devolvería fragmentos ilegibles que el
 * modelo intentaría interpretar igualmente.
 */
function pareceTexto(s) {
  if (s.length < 40) return false
  const legibles = (s.match(/[a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s.,;:()\-+/%°"'#]/g) ?? []).length
  return legibles / s.length >= 0.8
}

/* ── Troceado ────────────────────────────────────────────────────────── */

/**
 * Quita las líneas del índice de contenidos.
 *
 * ── POR QUÉ ENSUCIAN TANTO ─────────────────────────────────────────
 *
 * Una entrada de índice —«9.2 Arranque en modo automático .......... 12»—
 * contiene EXACTAMENTE las palabras que alguien buscaría, y ninguna de las
 * respuestas. BM25 la puntúa altísimo porque es una línea corta llena de
 * términos de la consulta, así que desplaza al procedimiento de verdad, que
 * está tres páginas más adelante rodeado de texto normal.
 *
 * Medido con el manual de bombeo real: a «procedimiento de paro» y a
 * «alarmas», los dos mejores resultados eran líneas de puntitos. El asistente
 * las recibía como «documentación» y no tenía nada que citar.
 *
 * Se reconocen por los puntos guía —cuatro o más seguidos—, que es lo que
 * ningún texto corriente escribe.
 */
function sinIndiceDeContenidos(texto) {
  const lineas = String(texto ?? '').split('\n')

  // Puntos guía: «Arranque .......... 12». Cuatro o más seguidos, con o sin
  // espacios entre ellos, que es como los deja la extracción del PDF.
  const conPuntosGuia = lineas.filter(l => /(?:\.\s*){4,}/.test(l)).length

  /*
   * Una página con varias entradas de índice ES el índice, y se descarta
   * ENTERA.
   *
   * Quitarle sólo las líneas de puntitos no basta: lo que queda —«8.3
   * Restricciones por mantenimiento 11 En modo AUTOMÁTICO: 11»— sigue siendo
   * una lista de titulares con números de página, y sigue puntuando alto por
   * la misma razón. Medido con el manual de bombeo: tras filtrar sólo las
   * líneas, la página 3 seguía apareciendo como segundo resultado en tres de
   * cuatro consultas.
   *
   * El umbral son tres entradas: un índice de verdad tiene decenas, y un
   * párrafo normal no tiene ninguna, así que no hay zona gris que ajustar.
   */
  if (conPuntosGuia >= 3) return ''

  return lineas
    .filter(l => !/(?:\.\s*){4,}/.test(l))
    .join('\n')
    // Al quitar líneas quedan huecos; se colapsan para no inflar el troceado
    // con espacio en blanco.
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * Parte un documento en fragmentos solapados.
 *
 * Corta por PÁRRAFO cuando puede y por carácter sólo si no hay más remedio:
 * partir «la presión máxima admisible es de» / «40 bar» entre dos fragmentos
 * hace que ninguno de los dos responda la pregunta, y son justo los cortes que
 * caen en mitad de una especificación.
 */
function trocear(texto, archivo, pagina) {
  const limpio = sinIndiceDeContenidos(texto)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!limpio) return []

  const trozos = []
  let inicio = 0

  while (inicio < limpio.length) {
    let fin = Math.min(inicio + TAMANO_FRAGMENTO, limpio.length)

    if (fin < limpio.length) {
      // Se busca un corte natural en el último tercio del fragmento. Más atrás
      // desperdiciaría demasiado texto por cada trozo.
      const ventana = limpio.slice(inicio + Math.floor(TAMANO_FRAGMENTO * 0.66), fin)
      const corte = Math.max(ventana.lastIndexOf('\n\n'), ventana.lastIndexOf('. '))
      if (corte > 0) fin = inicio + Math.floor(TAMANO_FRAGMENTO * 0.66) + corte + 1
    }

    const trozo = limpio.slice(inicio, fin).trim()
    if (trozo) trozos.push({ archivo, pagina, texto: trozo })

    if (fin >= limpio.length) break
    inicio = Math.max(fin - SOLAPE, inicio + 1)
  }

  return trozos
}



/* ── El índice ───────────────────────────────────────────────────────── */

/**
 * @param {object} opciones
 * @param {string} opciones.carpeta         de dónde se leen los documentos
 * @param {string} [opciones.embeddingBase] servidor de embeddings; vacío = sólo BM25
 * @param {string} [opciones.embeddingModelo]
 * @param {string} [opciones.rutaCache]     dónde persiste la caché de embeddings entre
 *                                          reinicios. Por defecto `datos/embeddings-cache.json`;
 *                                          las pruebas la sustituyen por un archivo temporal.
 */
export function createIndiceDocumentos({
  carpeta,
  embeddingBase = '',
  embeddingModelo = 'local',
  rutaCache = RUTA_CACHE_EMBEDDINGS,
}) {
  let indice = []
  let cargando = null
  let cargado = false
  /** Huella de la carpeta cuando se indexó, para saber si ha cambiado. */
  let huella = ''
  /** Cuándo se comprobó por última vez. Ver `MS_ENTRE_COMPROBACIONES`. */
  let ultimaComprobacion = 0
  /** Archivos que se encontraron pero no se pudieron leer, para poder decirlo. */
  let ilegibles = []

  /**
   * `archivo → sistema` del manifiesto (Plan 17 Fase 3a, G7), refrescado en
   * CADA `recargar()` — independiente de la huella de contenido de cada
   * archivo. A propósito: reasignar un manual a otro sistema en el
   * manifiesto no debe exigir tocar el archivo para que el aislamiento
   * surta efecto, y si se leyera sólo al crear el fragmento, quedaría con
   * el `sistema` de la primera vez que se indexó hasta que el archivo
   * cambiara de huella. `null`/ausente = "toda la planta", igual que en
   * `shared/eva/comun/manuales.js·sistemaValido` — incluye la carpeta que nunca
   * pasó por `manuales.mjs` (archivos puestos a mano, sin manifiesto).
   */
  let mapaSistemas = new Map()

  /**
   * Lo ya procesado, por archivo: `archivo → { huella, fragmentos }`.
   *
   * Es la mitad del indexado incremental (la otra es la caché de embeddings
   * en disco). Con esto, un archivo cuya huella no cambió entre dos
   * `recargar()` no se vuelve a leer, trocear NI calcular sus términos de
   * BM25 — se reutiliza la entrada tal cual, vector incluido si ya lo tenía.
   */
  let archivosProcesados = new Map()

  /** Caché de embeddings en disco, cargada una sola vez y mantenida en
   *  memoria mientras el proceso vive. Ver `leerCacheEmbeddings`. */
  let cacheEmbeddings = { modelo: null, vectores: {} }
  let cacheEmbeddingsCargada = false

  const usaEmbeddings = Boolean(embeddingBase)

  /** El motor de embeddings —llamar al servidor por lotes, con caché
   *  persistente— es compartido con `casos.mjs` (Fase 2). Ver la cabecera de
   *  `embeddings.mjs` para por qué se extrajo de aquí. */
  const motor = crearMotorEmbeddings({ embeddingBase, embeddingModelo })

  /** Lee un archivo y devuelve sus «páginas» de texto. Un `.txt` es una sola. */
  async function leerDocumento(ruta, archivo) {
    const ext = extname(archivo).toLowerCase()

    if (ext === '.pdf') {
      const buffer = await readFile(ruta)

      /*
       * `pdfjs` primero; el lector casero como respaldo. No es cinturón y
       * tirantes: un PDF con la estructura rota hace fallar a `pdfjs`
       * entero, y el casero —que va a la bruta buscando flujos— a veces
       * saca algo de esos. Quedarse sin nada por no intentarlo sería peor
       * que un texto parcial, que al menos `pareceTexto` puede juzgar.
       */
      let paginas = []
      try {
        paginas = await extraerTextoPdf(buffer)
      } catch (error) {
        logger.warn('pdfjs no pudo abrir un PDF; se prueba con el lector de respaldo', {
          archivo, error: error.message,
        })
        paginas = extraerTextoPdfCasero(buffer).map((texto, i) => ({ pagina: i + 1, texto }))
      }

      const buenas = paginas.filter(p => pareceTexto(p.texto))

      if (!buenas.length) {
        // Se distingue el PDF escaneado del que no supimos descodificar: el
        // arreglo es distinto —OCR en un caso, convertir a texto en el otro— y
        // decir sólo «no se pudo leer» no lleva a ninguno de los dos.
        ilegibles.push({
          archivo,
          motivo: paginas.length
            ? 'el texto salió ilegible (fuente sin tabla ToUnicode); conviértelo a .txt'
            : 'no contiene texto extraíble (probablemente es un escaneo); haría falta OCR',
        })
        return []
      }
      return buenas
    }

    if (ext === '.docx') {
      const paginas = extraerTextoDocx(await readFile(ruta)).map((texto, i) => ({ pagina: i + 1, texto }))
      const buenas = paginas.filter(p => pareceTexto(p.texto))

      if (!buenas.length) {
        ilegibles.push({
          archivo,
          motivo: 'no se pudo leer el contenido; ¿es un .doc antiguo renombrado, o está protegido con contraseña?',
        })
        return []
      }
      return buenas
    }

    const contenido = await readFile(ruta, 'utf8')
    // Un .txt no tiene páginas: se cita como página 1, que es lo honesto.
    return contenido ? [{ pagina: 1, texto: contenido }] : []
  }

  /**
   * Huella de la carpeta: qué archivos hay, con su tamaño y su fecha.
   *
   * ── PARA QUÉ ───────────────────────────────────────────────────────
   *
   * Para detectar que alguien ha dejado un manual nuevo. El índice se cargaba
   * una vez y se quedaba en memoria para siempre, así que un documento añadido
   * después no existía hasta reiniciar el backend — y nada lo decía. El
   * síntoma es el peor posible: el asistente contesta «no lo he encontrado en
   * la documentación» sobre un manual que está ahí, en la carpeta, y quien lo
   * puso da por hecho que la búsqueda no sirve.
   *
   * Se compara la HUELLA y no se vigila la carpeta con `fs.watch` porque en
   * Windows ese vigilante se comporta distinto según el sistema de archivos, y
   * sobre una unidad de red —que es donde acaban los manuales de una planta—
   * no avisa en absoluto. Un `readdir` con `stat` cuesta milisegundos y es la
   * misma respuesta en todas partes.
   */
  /** El mapa `archivo → "tamaño:fecha"` en el que se apoyan tanto la huella
   *  de toda la carpeta (`asegurarAlDia`) como el indexado incremental
   *  (`recargar`, comparando entrada por entrada contra `archivosProcesados`). */
  async function huellasPorArchivo() {
    const archivos = await readdir(carpeta).catch(() => [])
    const soportados = archivos.filter(a => SOPORTADAS.has(extname(a).toLowerCase())).sort()

    const mapa = new Map()
    for (const archivo of soportados) {
      const info = await stat(join(carpeta, archivo)).catch(() => null)
      if (info) mapa.set(archivo, `${info.size}:${info.mtimeMs}`)
    }
    return mapa
  }

  async function huellaDeLaCarpeta() {
    const mapa = await huellasPorArchivo()
    return [...mapa].map(([archivo, h]) => `${archivo}:${h}`).join('|')
  }

  async function recargar() {
    if (cargando) return cargando

    cargando = (async () => {
      ilegibles = []

      if (usaEmbeddings && !cacheEmbeddingsCargada) {
        cacheEmbeddings = await leerCacheEmbeddings(rutaCache)
        // Vectores de OTRO modelo no sirven — dos modelos no comparten
        // espacio semántico, y mezclarlos daría un coseno sin sentido en vez
        // de un error. Cambiar de modelo empieza la caché de cero.
        if (cacheEmbeddings.modelo !== embeddingModelo) {
          cacheEmbeddings = { modelo: embeddingModelo, vectores: {} }
        }
        cacheEmbeddingsCargada = true
      }

      // Refrescado siempre, no sólo la primera vez: ver la cabecera de
      // `mapaSistemas` arriba. Un manifiesto ausente o roto es la carpeta
      // sin catálogo —archivos puestos a mano—, no un error: se trata como
      // "todo sin sistema asignado", igual que hace `leerAprendizaje` con
      // un almacén que todavía no existe.
      try {
        const manifiesto = normalizarManifiesto(
          JSON.parse(await readFile(join(carpeta, NOMBRE_MANIFIESTO), 'utf8'))
        )
        mapaSistemas = new Map(manifiesto.manuales.map(m => [m.archivo, m.sistema ?? null]))
      } catch {
        mapaSistemas = new Map()
      }

      // Las huellas se toman ANTES de leer, no después: si alguien copia un
      // archivo mientras se está indexando, con la huella posterior el cambio
      // se daría por recogido y ese archivo no entraría hasta el siguiente.
      const mapaHuellas = await huellasPorArchivo()
      huella = [...mapaHuellas].map(([archivo, h]) => `${archivo}:${h}`).join('|')

      const archivosNuevos = new Map()
      const pendientesEmbeber = []
      let reutilizados = 0

      for (const [archivo, h] of mapaHuellas) {
        const previo = archivosProcesados.get(archivo)
        if (previo && previo.huella === h) {
          // Sin cambios: se reutiliza la entrada entera —fragmentos, términos
          // de BM25 y vector si ya lo tenía— sin volver a leer ni trocear.
          archivosNuevos.set(archivo, previo)
          reutilizados++
          continue
        }

        const ruta = join(carpeta, archivo)
        try {
          const info = await stat(ruta)
          if (info.size > MAX_BYTES) {
            ilegibles.push({ archivo, motivo: `pasa de ${Math.round(MAX_BYTES / 1048576)} MB` })
            // No se cachea: sin entrada en `archivosNuevos`, la próxima
            // recarga lo vuelve a intentar solo — es un `stat`, no un `readFile`,
            // así que reintentarlo siempre es barato.
            continue
          }

          const paginas = await leerDocumento(ruta, archivo)
          const fragmentos = []
          // `p.pagina` es el número REAL, no el índice del array — ver la
          // cabecera de `extraerTextoPdf` sobre por qué eso importa.
          paginas.forEach((p) => {
            fragmentos.push(...trocear(p.texto, basename(archivo), p.pagina))
          })

          // Los términos se precalculan UNA vez por fragmento nuevo.
          // Recalcularlos en cada búsqueda multiplicaría por el número de
          // fragmentos el coste de una consulta que tiene que contestar en
          // milisegundos.
          for (const f of fragmentos) {
            Object.assign(f, indexarTerminos(f.texto))
            f.hash = hashDeTexto(f.texto)
          }

          // Un archivo sin fragmentos (ilegible, o vacío de verdad) tampoco
          // se cachea. `leerDocumento` ya anotó el motivo en `ilegibles`
          // arriba si aplica; dejarlo fuera de `archivosProcesados` hace que
          // se reintente en la próxima recarga —por si el manual se
          // reemplaza por una versión legible— en vez de desaparecer de
          // `ilegibles` en cuanto OTRO archivo dispare la siguiente recarga.
          if (fragmentos.length) {
            archivosNuevos.set(archivo, { huella: h, fragmentos })
            if (usaEmbeddings) pendientesEmbeber.push(...fragmentos)
          }
        } catch (error) {
          ilegibles.push({ archivo, motivo: error.message })
        }
      }

      archivosProcesados = archivosNuevos
      indice = [...archivosProcesados.values()].flatMap(e => e.fragmentos)
      cargado = true

      if (usaEmbeddings && pendientesEmbeber.length) {
        await motor.asegurarVectores(pendientesEmbeber, cacheEmbeddings)
        await guardarCacheEmbeddings(rutaCache, cacheEmbeddings).catch(error => {
          // La caché en memoria ya está al día — sólo se pierde si el
          // proceso reinicia antes de que alguien arregle el disco.
          logger.warn('No se pudo guardar la caché de embeddings en disco', { error: error.message })
        })
      }

      logger.info(
        `Documentación indexada: ${archivosProcesados.size} archivo(s) (${reutilizados} sin ` +
          `cambios) → ${indice.length} fragmentos (${usaEmbeddings ? 'embeddings + BM25' : 'sólo BM25'})` +
          (ilegibles.length
            ? `. ${ilegibles.length} archivo(s) sin texto extraíble: ${ilegibles.map(i => i.archivo).join(', ')} ` +
              '— suelen ser PDF escaneados, que son imágenes y necesitarían OCR'
            : ''),
        {
          carpeta,
          archivos: archivosProcesados.size,
          reutilizados,
          fragmentos: indice.length,
          ilegibles: ilegibles.length,
          modo: usaEmbeddings ? 'embeddings + BM25' : 'BM25',
        }
      )
    })().finally(() => {
      cargando = null
    })

    return cargando
  }

  /**
   * Se asegura de que el índice refleja lo que hay AHORA en la carpeta.
   *
   * Se llama antes de cada búsqueda. Lo caro —leer y trocear los PDF— sólo
   * ocurre si la huella cambió; lo normal es un `readdir` con unos `stat`, que
   * son milisegundos.
   *
   * Aun así se limita a una comprobación cada `MS_ENTRE_COMPROBACIONES`,
   * porque sobre una carpeta en una unidad de red esos `stat` sí cuestan, y
   * quien deja un manual nuevo puede esperar diez segundos a que aparezca.
   */
  async function asegurarAlDia() {
    if (!cargado) return recargar()

    const ahora = Date.now()
    if (ahora - ultimaComprobacion < MS_ENTRE_COMPROBACIONES) return
    ultimaComprobacion = ahora

    const actual = await huellaDeLaCarpeta()
    if (actual === huella) return

    logger.info('La documentación cambió en disco; se reindexa', { carpeta })
    return recargar()
  }

  /**
   * Los fragmentos más relevantes para una pregunta.
   *
   * Se devuelve el score para que la herramienta pueda mandarlo al modelo: un
   * fragmento con relevancia baja es información que el modelo debe tratar con
   * cautela, y ocultárselo le invita a citarlo con la misma seguridad que uno
   * que encaja exactamente.
   *
   * `sistema` es OPCIONAL, al revés que en `casos.mjs` (Plan 17 Fase 3a,
   * G7): un manual de la carpeta puede no tener catálogo —ni manifiesto, ni
   * `sistema` asignado dentro de él— y eso es "toda la planta", no un
   * error. Filtro ANTES de puntuar, mismo criterio que `casos.mjs`: un
   * fragmento de OTRO sistema no entra ni siquiera a competir, así que no
   * hay puntuación que pueda colarlo. Es la asimetría que la auditoría del
   * 01-09-2026 midió entre las dos fuentes —`casos.mjs` protegía el cruce
   * entre sistemas y este archivo no— con el mismo mecanismo que ya usaba
   * el otro lado.
   */
  async function buscar(pregunta, { top = 3, sistema } = {}) {
    await asegurarAlDia()
    if (!indice.length) return []

    const delSistema = sistema === undefined
      ? indice
      : indice.filter(f => {
        const sistemaDelArchivo = mapaSistemas.get(f.archivo) ?? null
        return sistemaDelArchivo === null || sistemaDelArchivo === sistema
      })
    if (!delSistema.length) return []

    const lexico = puntuarBm25(delSistema, pregunta)
    if (!lexico.length) return []

    /*
     * Normalizado a 0-1 contra el mejor de ESTA consulta, para el RANKING
     * —el orden entre resultados— y para poder mezclarlo con el coseno más
     * abajo: el score crudo de BM25 no tiene techo fijo. `scoreCrudo` se
     * conserva aparte (Plan 17 Fase 3, G2): dividir por el máximo garantiza
     * que el mejor fragmento de CUALQUIER consulta saque 1,00, aunque el
     * encaje sea flojo — bueno para ordenar, malo para decidir cuántos
     * PUNTOS vale ese encaje. `diagnostico.mjs · puntosDeScore` corta sobre
     * `scoreCrudo`/`coseno` (absolutos), nunca sobre este `score`
     * normalizado (relativo a la consulta).
     */
    const maximo = Math.max(...lexico.map(f => f.score), 1e-9)
    let puntuados = lexico.map(f => ({ ...f, scoreCrudo: f.score, score: f.score / maximo }))

    if (usaEmbeddings) {
      const vectorPregunta = await motor.embeberUno(pregunta).catch(error => {
        logger.warn('Embedding de la pregunta falló; se busca sólo con BM25', {
          error: error.message,
        })
        return null
      })

      if (vectorPregunta) {
        /*
         * Mezcla 60/40 a favor de lo semántico, PARA EL RANKING — no se
         * toca (Plan 17, decisión 2). El coseno se guarda también SUELTO
         * en `coseno`: es la magnitud absoluta que `puntosDeScore` corta
         * cuando hay embeddings, en vez del `score` mezclado.
         *
         * Los dos aportan cosas distintas y ninguno gana solo: el coseno
         * encuentra «cómo se pone a cero» cuando el manual dice «ajuste del
         * offset», y BM25 clava los códigos de error y las referencias
         * —«PMP63B», «F270»— que un embedding disuelve porque no significan
         * nada semánticamente.
         */
        puntuados = puntuados.map(f => {
          if (!f.vector) return f
          const cosenoValor = coseno(vectorPregunta, f.vector)
          return { ...f, coseno: cosenoValor, score: 0.6 * cosenoValor + 0.4 * f.score }
        })
      }
    }

    /*
     * Dedupe por CONTENIDO, Plan 17 Fase 3a (G8) — antes de recortar a
     * `top`, para que un duplicado no le robe el sitio a un resultado de
     * verdad distinto. Dos PDF con nombre distinto y el mismo contenido
     * byte a byte —medido en la auditoría del 01-09-2026, dos pares en
     * `Documentacion/`— producían fragmentos con el mismo `hash` (ya se
     * calculaba, ver su comentario más abajo) y `manualCitado` presentaba
     * las dos referencias como si fueran confirmaciones independientes. Se
     * conserva el de mayor `score` —el orden ya viene puesto por el
     * `.sort` de arriba— y se descartan sus duplicados exactos.
     */
    const vistos = new Set()
    const sinDuplicados = puntuados
      .sort((a, b) => b.score - a.score)
      .filter(f => {
        if (vistos.has(f.hash)) return false
        vistos.add(f.hash)
        return true
      })

    return sinDuplicados
      .slice(0, top)
      .filter(f => f.score > 0)
      // `hash` viaja desde aquí (Plan 17 Fase 5, G10): es el hash del
      // CONTENIDO de este fragmento en concreto —ya se calculaba para la
      // caché de embeddings, `hashDeTexto` en la indexación—, no del PDF
      // entero. Hace de identidad del trozo exacto cuando una página se
      // parte en varios fragmentos (`trocear`, TAMANO_FRAGMENTO+SOLAPE), y
      // de aviso si el PDF cambia: si el hash guardado en una cita antigua
      // no coincide con el de hoy, ese `{archivo, pagina}` ya no es el
      // mismo contenido.
      .map(({ archivo, pagina, texto, score, hash, scoreCrudo, coseno }) => ({
        archivo, pagina, texto, score, hash, scoreCrudo,
        // `coseno` sólo viaja cuando hubo embeddings de verdad para este
        // fragmento (`f.vector` presente arriba) — su AUSENCIA es la señal
        // que usa `puntosDeScore` para saber qué corte aplicar.
        ...(coseno !== undefined ? { coseno } : {}),
      }))
  }

  /** Qué hay indexado, para poder decírselo al usuario sin adivinar. */
  function estado() {
    const porArchivo = new Map()
    for (const f of indice) porArchivo.set(f.archivo, (porArchivo.get(f.archivo) ?? 0) + 1)

    return {
      cargado,
      carpeta,
      modo: usaEmbeddings ? 'embeddings + BM25' : 'BM25',
      documentos: [...porArchivo].map(([archivo, fragmentos]) => ({ archivo, fragmentos })),
      ilegibles,
      /*
       * Pensado para una vista que enseñe el progreso de la indexación (Plan
       * 16, la sección de Documentación): `indexando` dice si hay una
       * `recargar()` en curso ahora mismo, y `progreso` cuántos fragmentos de
       * los que le faltaban vector ya lo tienen. Fuera de una indexación con
       * embeddings pendientes, `progreso` es `null` — no un `{0,0}` que
       * parecería «cero de cero» en vez de «no aplica».
       */
      indexando: cargando !== null,
      progreso: cargando !== null ? motor.progresoActual() : null,
    }
  }

  return { buscar, recargar, estado }
}
