/**
 * Índice de la documentación de planta: manuales, hojas de datos,
 * procedimientos.
 *
 * El modelo NUNCA recibe un documento entero. Recibe fragmentos citables, con
 * el nombre del archivo y la página de donde salen, y las instrucciones le
 * obligan a citar la fuente. Es la diferencia entre «el Cerabar PMP63B admite
 * hasta 40 bar» —verificable— y la misma frase dicha de memoria por un modelo
 * de 4B, que suena igual y puede ser falsa.
 *
 * ── POR QUÉ VIVE AQUÍ Y NO EN `shared/` ────────────────────────────
 *
 * Estuvo en `shared/eva/documentos.mjs`, y no podía funcionar: lee del disco
 * con `node:fs` —cosa que el frontend no puede hacer— e importaba
 * `../logger.mjs`, que desde `shared/` apunta a un archivo que no existe. El
 * criterio de `shared/` es «reglas de negocio que backend y frontend necesitan
 * iguales»; un índice de archivos no es eso.
 *
 * ── DOS MODOS DE BÚSQUEDA, Y EL POR DEFECTO ES EL LÉXICO ───────────
 *
 * Con embeddings la búsqueda entiende sinónimos, pero exige un SEGUNDO
 * servidor: llama-server sirve un modelo a la vez, y el que atiende el chat no
 * puede además generar embeddings (y si se le piden, los devuelve de un modelo
 * generativo, que para esto son malos). Montar ese segundo servidor es una
 * decisión de instalación, no algo que deba dar por supuesto el código.
 *
 * Por eso el modo por defecto es BM25 —búsqueda léxica clásica, cero
 * dependencias, cero servidores— que en documentación técnica funciona
 * sorprendentemente bien: los manuales usan el vocabulario exacto del dominio y
 * quien pregunta suele usarlo también. Si hay `IA_EMBEDDING_BASE`, se usan
 * embeddings y BM25 pasa a ser el desempate.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { inflateSync, inflateRawSync } from 'node:zlib'
import { logger } from '../logger.mjs'

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

/** Extensiones que se saben leer. El resto se ignoran en silencio. */
const SOPORTADAS = new Set(['.txt', '.md', '.csv', '.log', '.pdf', '.docx'])

/**
 * Cada cuánto se mira si la carpeta cambió, en milisegundos.
 *
 * Diez segundos: quien deja un manual nuevo lo prueba en seguida, y esperar
 * ese rato no molesta. Bajarlo a cero haría un `readdir` con sus `stat` en
 * cada pregunta, y sobre una unidad de red —que es donde acaban los manuales
 * de una planta— eso sí se nota.
 */
const MS_ENTRE_COMPROBACIONES = 10000

/** Tope de archivo, en bytes. Un PDF de 200 MB no es documentación de consulta. */
const MAX_BYTES = 40 * 1024 * 1024

/* ── Extracción de texto ─────────────────────────────────────────────── */

/**
 * Saca el texto de un PDF sin dependencias.
 *
 * ── HASTA DÓNDE LLEGA ESTO ─────────────────────────────────────────
 *
 * Un PDF no guarda texto: guarda instrucciones de dibujo dentro de flujos
 * comprimidos. Esto los descomprime con `zlib` —que Node trae— y recoge los
 * operadores de texto (`Tj`, `TJ`, `'`, `"`). Cubre el caso normal: manuales
 * generados por Word, InDesign o FrameMaker, que es de donde salen las hojas
 * de datos de los fabricantes.
 *
 * **No** cubre dos casos, y los dos se detectan y se avisan en vez de devolver
 * basura:
 *
 *  - **PDF escaneado.** Son imágenes; no hay texto que extraer. Haría falta
 *    OCR, que sí es una dependencia grande.
 *  - **Fuentes con codificación propia** (subconjuntos sin `ToUnicode`), donde
 *    los códigos no son ASCII y salen caracteres sin sentido.
 *
 * La alternativa era `pdf-parse` o `pdfjs-dist`. Se descartó por lo mismo que
 * `chartjs-node-canvas`: este backend arranca sin instalar nada, y esa
 * propiedad vale más que cubrir el PDF escaneado, que de todos modos
 * necesitaría OCR aparte.
 */
function extraerTextoPdf(buffer) {
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

/* ── Búsqueda léxica (BM25) ──────────────────────────────────────────── */

/**
 * Palabras que aparecen en casi toda frase en español y no discriminan nada.
 *
 * BM25 ya las penaliza por frecuencia, pero quitarlas de la CONSULTA además
 * evita que «¿cómo se calibra el sensor de presión?» gaste su peso en «cómo» y
 * «se» cuando lo que importa es «calibra», «sensor» y «presión».
 */
const VACIAS = new Set([
  'a', 'al', 'algo', 'ante', 'como', 'con', 'cual', 'cuando', 'cuanto', 'de', 'del', 'desde',
  'donde', 'dos', 'el', 'ella', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'ese', 'eso', 'esta',
  'este', 'esto', 'ha', 'hace', 'hasta', 'hay', 'la', 'las', 'le', 'lo', 'los', 'mas', 'me', 'mi',
  'muy', 'no', 'nos', 'o', 'para', 'pero', 'por', 'que', 'se', 'ser', 'si', 'sin', 'sobre', 'son',
  'su', 'sus', 'te', 'tiene', 'todo', 'un', 'una', 'uno', 'y', 'ya',
])

/** Texto → lista de términos comparables: sin acentos, sin signos, sin vacías. */
function terminos(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    // Escrito con escapes y no con acentos literales: son caracteres
    // combinantes, invisibles al abrir el archivo. Mismo motivo y misma forma
    // que en `shared/periodo.js` y en `herramientas.mjs`.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !VACIAS.has(t))
}

/** Constantes clásicas de BM25. No hay motivo para tocarlas. */
const BM25_K1 = 1.5
const BM25_B = 0.75

/**
 * Puntúa cada fragmento contra la consulta.
 *
 * BM25 y no un simple recuento de coincidencias porque las dos correcciones
 * que aporta importan aquí: una palabra que sale en TODOS los fragmentos
 * («presión», en un manual de un transmisor de presión) no debe puntuar, y un
 * fragmento largo no debe ganar sólo por ser largo.
 */
function puntuarBm25(fragmentos, consulta) {
  const q = terminos(consulta)
  if (!q.length) return []

  const N = fragmentos.length
  const largoMedio = fragmentos.reduce((s, f) => s + f.terminos.length, 0) / N || 1

  // En cuántos fragmentos aparece cada término de la consulta.
  const df = new Map()
  for (const t of new Set(q)) {
    df.set(t, fragmentos.filter(f => f.frecuencias.has(t)).length)
  }

  return fragmentos.map(f => {
    let score = 0
    for (const t of q) {
      const tf = f.frecuencias.get(t) ?? 0
      if (!tf) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const norma = 1 - BM25_B + BM25_B * (f.terminos.length / largoMedio)
      score += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norma))
    }
    return { ...f, score }
  })
}

/* ── Búsqueda semántica (opcional) ───────────────────────────────────── */

function coseno(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom < 1e-9 ? 0 : dot / denom
}

/* ── El índice ───────────────────────────────────────────────────────── */

/**
 * @param {object} opciones
 * @param {string} opciones.carpeta         de dónde se leen los documentos
 * @param {string} [opciones.embeddingBase] servidor de embeddings; vacío = sólo BM25
 * @param {string} [opciones.embeddingModelo]
 */
export function createIndiceDocumentos({ carpeta, embeddingBase = '', embeddingModelo = 'local' }) {
  let indice = []
  let cargando = null
  let cargado = false
  /** Huella de la carpeta cuando se indexó, para saber si ha cambiado. */
  let huella = ''
  /** Cuándo se comprobó por última vez. Ver `MS_ENTRE_COMPROBACIONES`. */
  let ultimaComprobacion = 0
  /** Archivos que se encontraron pero no se pudieron leer, para poder decirlo. */
  let ilegibles = []

  const usaEmbeddings = Boolean(embeddingBase)

  async function embeber(texto) {
    const respuesta = await fetch(`${embeddingBase}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embeddingModelo, input: texto }),
      signal: AbortSignal.timeout(30000),
    })
    if (!respuesta.ok) throw new Error(`El servidor de embeddings respondió ${respuesta.status}`)
    const cuerpo = await respuesta.json()
    return cuerpo?.data?.[0]?.embedding ?? null
  }

  /** Lee un archivo y devuelve sus «páginas» de texto. Un `.txt` es una sola. */
  async function leerDocumento(ruta, archivo) {
    const ext = extname(archivo).toLowerCase()

    if (ext === '.pdf') {
      const buffer = await readFile(ruta)
      const paginas = extraerTextoPdf(buffer)
      const buenas = paginas.filter(pareceTexto)

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
      const paginas = extraerTextoDocx(await readFile(ruta))
      const buenas = paginas.filter(pareceTexto)

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
    return contenido ? [contenido] : []
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
  async function huellaDeLaCarpeta() {
    const archivos = await readdir(carpeta).catch(() => [])
    const soportados = archivos.filter(a => SOPORTADAS.has(extname(a).toLowerCase())).sort()

    const partes = []
    for (const archivo of soportados) {
      const info = await stat(join(carpeta, archivo)).catch(() => null)
      if (info) partes.push(`${archivo}:${info.size}:${info.mtimeMs}`)
    }
    return partes.join('|')
  }

  async function recargar() {
    if (cargando) return cargando

    cargando = (async () => {
      ilegibles = []
      // La huella se toma ANTES de leer, no después: si alguien copia un
      // archivo mientras se está indexando, con la huella posterior el cambio
      // se daría por recogido y ese archivo no entraría hasta el siguiente.
      huella = await huellaDeLaCarpeta()

      const archivos = await readdir(carpeta).catch(error => {
        logger.warn('No se pudo leer la carpeta de documentación', { carpeta, error: error.message })
        return []
      })

      const soportados = archivos.filter(a => SOPORTADAS.has(extname(a).toLowerCase()))
      const fragmentos = []

      for (const archivo of soportados) {
        const ruta = join(carpeta, archivo)
        try {
          const info = await stat(ruta)
          if (info.size > MAX_BYTES) {
            ilegibles.push({ archivo, motivo: `pasa de ${Math.round(MAX_BYTES / 1048576)} MB` })
            continue
          }

          const paginas = await leerDocumento(ruta, archivo)
          paginas.forEach((pagina, i) => {
            fragmentos.push(...trocear(pagina, basename(archivo), i + 1))
          })
        } catch (error) {
          ilegibles.push({ archivo, motivo: error.message })
        }
      }

      // Los términos se precalculan UNA vez al cargar. Recalcularlos en cada
      // búsqueda multiplicaría por el número de fragmentos el coste de una
      // consulta que tiene que contestar en milisegundos.
      for (const f of fragmentos) {
        f.terminos = terminos(f.texto)
        f.frecuencias = new Map()
        for (const t of f.terminos) f.frecuencias.set(t, (f.frecuencias.get(t) ?? 0) + 1)
      }

      if (usaEmbeddings) {
        for (const f of fragmentos) {
          try {
            f.vector = await embeber(f.texto)
          } catch (error) {
            // Un embedding que falla no descarta el fragmento: BM25 lo sigue
            // encontrando. Degradar es mejor que perder media documentación
            // porque el segundo servidor se reinició a media carga.
            logger.warn('No se pudo generar el embedding de un fragmento', {
              archivo: f.archivo, error: error.message,
            })
          }
        }
      }

      indice = fragmentos
      cargado = true

      logger.info('Índice de documentación cargado', {
        carpeta,
        archivos: soportados.length,
        fragmentos: indice.length,
        ilegibles: ilegibles.length,
        modo: usaEmbeddings ? 'embeddings + BM25' : 'BM25',
      })
    })().finally(() => { cargando = null })

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
   */
  async function buscar(pregunta, { top = 3 } = {}) {
    await asegurarAlDia()
    if (!indice.length) return []

    const lexico = puntuarBm25(indice, pregunta)
    if (!lexico.length) return []

    // Normalizado a 0-1 contra el mejor de esta consulta: el score crudo de
    // BM25 no tiene techo fijo y no se puede comparar con el coseno.
    const maximo = Math.max(...lexico.map(f => f.score), 1e-9)
    let puntuados = lexico.map(f => ({ ...f, score: f.score / maximo }))

    if (usaEmbeddings) {
      const vectorPregunta = await embeber(pregunta).catch(error => {
        logger.warn('Embedding de la pregunta falló; se busca sólo con BM25', {
          error: error.message,
        })
        return null
      })

      if (vectorPregunta) {
        /*
         * Mezcla 60/40 a favor de lo semántico.
         *
         * Los dos aportan cosas distintas y ninguno gana solo: el coseno
         * encuentra «cómo se pone a cero» cuando el manual dice «ajuste del
         * offset», y BM25 clava los códigos de error y las referencias
         * —«PMP63B», «F270»— que un embedding disuelve porque no significan
         * nada semánticamente.
         */
        puntuados = puntuados.map(f => ({
          ...f,
          score: f.vector ? 0.6 * coseno(vectorPregunta, f.vector) + 0.4 * f.score : f.score,
        }))
      }
    }

    return puntuados
      .sort((a, b) => b.score - a.score)
      .slice(0, top)
      .filter(f => f.score > 0)
      .map(({ archivo, pagina, texto, score }) => ({ archivo, pagina, texto, score }))
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
    }
  }

  return { buscar, recargar, estado }
}
