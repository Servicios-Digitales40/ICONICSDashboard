/**
 * Sacar texto de un archivo binario, DENTRO DE UN HILO APARTE.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE (Plan 22 F2 · SEG-10) ──────────────
 *
 * Todo lo que hay aquí vivía en `documentos.mjs` y corría en el hilo que
 * atiende las lecturas de planta. Extraer texto de un PDF es trabajo de CPU
 * puro y síncrono a trozos: `inflateSync` sobre cada flujo, expresiones
 * regulares sobre megabytes de `latin1`, y una vuelta por cada página. Un
 * manual malformado, o uno de miles de páginas, congelaba el bucle de eventos
 * —y con él TODAS las pantallas— mientras se procesaba. Y `RAG_UPLOAD_ENABLED`
 * existe precisamente para que alguien suba archivos.
 *
 * En un `worker_thread` el peor caso es que la indexación de ese archivo se
 * quede sin terminar. Que un manual mal formado degrade la búsqueda es
 * aceptable; que congele el tablero, no.
 *
 * ── LO QUE NO CAMBIÓ AL MUDARSE ────────────────────────────────────
 *
 * Ni una línea de la extracción: es el mismo código, con las mismas cifras
 * medidas el 03-09-2026 en las cabeceras de abajo. Lo único que se añade son
 * los dos topes que el hilo principal no podía imponer sin bloquearse él
 * mismo —páginas y caracteres— y que se declaran cuando muerden en vez de
 * devolver medio manual como si fuera entero (CLAUDE.md §2.4).
 *
 * ── EL CONTRATO CON `extraccion.mjs` ───────────────────────────────
 *
 * Entra `{ ruta, ext, maxPaginas, maxCaracteres }` por `workerData`; sale un
 * único mensaje `{ paginas, truncado }` o `{ error }`. La firma del archivo la
 * comprueba el llamador ANTES de arrancar este hilo: no tiene sentido pagar un
 * hilo para descubrir que un `.pdf` no empieza por `%PDF-`.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inflateSync, inflateRawSync } from 'node:zlib'
import { parentPort, workerData } from 'node:worker_threads'

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

async function extraerTextoPdf(buffer, { maxPaginas, maxCaracteres }) {
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
  /*
   * Los dos topes del Plan 22 F2, y por qué son DOS.
   *
   * `maxPaginas` para el PDF de miles de páginas, y `maxCaracteres` para el
   * que tiene pocas pero enormes —una tabla de datos exportada a PDF cabe en
   * veinte páginas y trae megabytes de texto—. Uno solo deja pasar el otro
   * caso, y los dos acaban igual: miles de fragmentos que después hay que
   * embeber uno a uno.
   *
   * Cuál mordió se DECLARA. Devolver 1500 de 4000 páginas sin decirlo es un
   * manual que el asistente cree tener entero y del que le falta la mitad —el
   * mismo modo de fallo que la ausencia de dato disfrazada de cero.
   */
  let caracteres = 0
  let truncado = null

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (n > maxPaginas) {
        truncado = { motivo: 'paginas', leidas: paginas.length, total: doc.numPages, tope: maxPaginas }
        break
      }
      if (caracteres >= maxCaracteres) {
        truncado = { motivo: 'caracteres', leidas: paginas.length, total: doc.numPages, tope: maxCaracteres }
        break
      }

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
      if (texto) {
        paginas.push({ pagina: n, texto })
        caracteres += texto.length
      }
      pagina.cleanup()
    }
  } finally {
    await tarea.destroy()
  }
  return { paginas, truncado }
}


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
 * ── POR QUÉ YA NO SE USA, Y QUÉ COSTÓ AVERIGUARLO ──────────────────
 *
 * Esta función **quedó como respaldo**: la extracción real la hace ahora
 * `pdfjs-dist`. La decisión anterior —«se descartó `pdf-parse` o
 * `pdfjs-dist` porque este backend arranca sin instalar nada»— era
 * razonable mientras los únicos PDF fueran los dos generados a medida de
 * `Documentacion/`. Dejó de serlo el 03-09-2026, cuando entraron manuales
 * de fabricante de verdad y se midió lo que este código sacaba de ellos:
 *
 *   ISO 20816-3   9 páginas · 39 fuentes · 0 imágenes  →  9 fragmentos,
 *                 y los NUEVE eran la misma cabecera de página. El cuerpo
 *                 de la norma vive en flujos que este lector no abre.
 *   Siemens V20   332 páginas · 37 233 operadores de texto  →  46 fragmentos
 *                 de ~50 caracteres, trozos de tabla pegados.
 *   Endress+H.    742 operadores de texto  →  2 fragmentos.
 *
 * Con `pdfjs-dist`, los mismos archivos dan 31 512, 639 100 y 16 451
 * caracteres. No era que los PDF fueran malos: era que este extractor sólo
 * sabe leer los fáciles.
 *
 * Y el fallo no era silencioso a medias, era peor: los nueve fragmentos de
 * cabecera del ISO **se recuperaban** en una búsqueda sobre vibraciones, así
 * que `manualCitado` habría enseñado «ISO 20816-3, páginas 1 y 2» como
 * respaldo de una causa. Una cita que parece evidencia y no lo es — el
 * defecto exacto que la auditoría del 01-09-2026 vino a cerrar.
 *
 * Se conserva y no se borra porque cubre un caso que `pdfjs` no: un PDF
 * cuyos flujos estén sin comprimir o con una estructura que haga fallar al
 * lector entero. Es el plan B, no el plan.
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

/* ── La entrada del hilo ─────────────────────────────────────────────── */

/**
 * Un `.pdf` con `pdfjs`, y el lector casero como respaldo.
 *
 * No es cinturón y tirantes: un PDF con la estructura rota hace fallar a
 * `pdfjs` entero, y el casero —que va a la bruta buscando flujos— a veces saca
 * algo de esos. Quedarse sin nada por no intentarlo sería peor que un texto
 * parcial, que al menos `pareceTexto` (en `documentos.mjs`) puede juzgar.
 *
 * El aviso del respaldo sale por `motivoRespaldo` y no por el logger: aquí no
 * hay logger —es otro hilo— y quien sabe si esto merece una línea de registro
 * es el índice, que es quien conoce el archivo por su nombre.
 */
async function leerPdf(buffer, topes) {
  try {
    return { ...(await extraerTextoPdf(buffer, topes)), motivoRespaldo: null }
  } catch (error) {
    const crudas = extraerTextoPdfCasero(buffer).map((texto, i) => ({ pagina: i + 1, texto }))
    return { ...recortar(crudas, topes), motivoRespaldo: error.message }
  }
}

/**
 * El tope de caracteres para lo que ya viene extraído de una sola vez.
 *
 * `extraerTextoPdf` puede parar ANTES de abrir la página siguiente, que es
 * mejor. El lector casero y el de `.docx` no: los dos inflan el archivo entero
 * de golpe y sólo después hay texto que medir. Aquí el tope no ahorra trabajo,
 * evita que veinte megas de texto entren al troceado y de ahí al embebido.
 *
 * ── POR QUÉ CORTA LA PÁGINA Y NO LA DESCARTA ───────────────────────
 *
 * Porque un `.docx` es UNA sola página: descartar la que se pasa dejaría el
 * documento en cero páginas, y el índice lo leería como «no se pudo extraer
 * nada» —ilegible— cuando lo que pasa es justo lo contrario, que tiene
 * demasiado. Dos estados opuestos con la misma cara. Cortando el texto, un
 * documento enorme entra recortado y lo dice, que es lo que es.
 */
function recortar(paginas, { maxCaracteres }) {
  const salida = []
  let caracteres = 0

  for (let i = 0; i < paginas.length; i++) {
    const cabe = maxCaracteres - caracteres
    if (cabe <= 0) {
      return {
        paginas: salida,
        truncado: { motivo: 'caracteres', leidas: salida.length, total: paginas.length, tope: maxCaracteres },
      }
    }

    const { pagina, texto } = paginas[i]
    if (texto.length <= cabe) {
      salida.push(paginas[i])
      caracteres += texto.length
      continue
    }

    salida.push({ pagina, texto: texto.slice(0, cabe) })
    return {
      paginas: salida,
      truncado: { motivo: 'caracteres', leidas: salida.length, total: paginas.length, tope: maxCaracteres },
    }
  }

  return { paginas: salida, truncado: null }
}

async function extraer({ ruta, ext, maxPaginas, maxCaracteres }) {
  const buffer = await readFile(ruta)
  const topes = { maxPaginas, maxCaracteres }

  if (ext === '.pdf') return leerPdf(buffer, topes)

  if (ext === '.docx') {
    const crudas = extraerTextoDocx(buffer).map((texto, i) => ({ pagina: i + 1, texto }))
    return { ...recortar(crudas, topes), motivoRespaldo: null }
  }

  throw new Error(`El hilo de extracción no sabe abrir "${ext}" — sólo .pdf y .docx llegan aquí.`)
}

try {
  parentPort.postMessage(await extraer(workerData))
} catch (error) {
  /*
   * El error viaja como TEXTO, no como objeto: un `Error` no sobrevive al
   * paso por `postMessage` con su `message` intacto en todos los casos, y lo
   * único que el índice necesita para escribir su línea de `ilegibles` es la
   * frase.
   */
  parentPort.postMessage({ error: error.message })
}
