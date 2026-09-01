/**
 * Motor de embeddings compartido: llamar al servidor de embeddings por
 * lotes, con caché persistente por hash de texto.
 *
 * ── POR QUÉ ESTO SE SEPARÓ DE `documentos.mjs` ──────────────────────
 *
 * Nació ahí, en el Plan 16 Fase 0, para el índice de manuales. La Fase 2 le
 * añadió un segundo consumidor —`casos.mjs`, el índice de intervenciones
 * previas (Fuente #3 del diagnóstico)— que necesita EXACTAMENTE lo mismo:
 * el mismo servidor de embeddings, el mismo lote de 16, la misma caché
 * persistente por hash, el mismo reintento fragmento a fragmento cuando un
 * lote falla. Copiar las ~90 líneas de esa lógica a un segundo archivo
 * habría sido la clase de duplicación que este proyecto ya ha pagado antes
 * —ver `EXTENSIONES_MANUAL` en `shared/eva/manuales.js`, o `RUTA_APRENDIZAJE`
 * en `herramientas/aprendizaje/index.mjs`— así que se extrajo en cuanto
 * apareció el segundo consumidor real, no antes.
 *
 * Lo que NO viaja aquí es específico de cada índice: qué se trocea y cómo
 * (`documentos.mjs`), qué cuenta como «cambió» (huella de archivo allí,
 * lista de intervenciones en `casos.mjs`). Este módulo sólo sabe convertir
 * texto en vectores, con caché, sin saber de dónde salió ese texto.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { logger } from '../logger.mjs'

/**
 * Cuántos textos van en cada llamada al servidor de embeddings.
 *
 * Deliberadamente conservador. El endpoint es compatible con OpenAI y acepta
 * `input` como lista, así que un lote más grande son menos llamadas HTTP —
 * pero el contexto del modelo de embeddings es un presupuesto compartido
 * entre TODOS los textos del lote, y no hay forma de saber desde aquí cuánto
 * le queda configurado. Si un lote se pasa, la llamada falla entera y
 * `asegurarVectores` reintenta ESE lote uno a uno — más lento, pero nunca
 * pierde un vector por el tamaño del lote.
 */
export const TAMANO_LOTE = 16

/** Huella de un texto, para la caché: la clave es el texto mismo, así que
 *  dos textos idénticos —vengan de un fragmento de manual o de una
 *  intervención distinta— comparten vector y comparten caché. */
export function hashDeTexto(texto) {
  return createHash('sha256').update(texto).digest('hex')
}

/**
 * Lee la caché de disco. Cualquier fallo —no existe, JSON roto— se trata como
 * caché vacía: es un acelerador, no una fuente de verdad, así que perderla
 * nunca debe impedir arrancar.
 *
 * Recibe la ruta en vez de asumir una fija: cada índice tiene la suya
 * —`documentos.mjs` y `casos.mjs` no comparten archivo de caché, aunque
 * compartan este motor— y las pruebas de cada uno apuntan a un archivo
 * temporal propio.
 */
export async function leerCacheEmbeddings(ruta) {
  try {
    const bruto = JSON.parse(await readFile(ruta, 'utf8'))
    return {
      modelo: typeof bruto?.modelo === 'string' ? bruto.modelo : null,
      vectores: bruto?.vectores && typeof bruto.vectores === 'object' ? bruto.vectores : {},
    }
  } catch {
    return { modelo: null, vectores: {} }
  }
}

/** Guarda la caché. Un fallo de disco se avisa y no interrumpe la indexación:
 *  los vectores ya están en memoria y la búsqueda funciona igual; sólo se
 *  perderían al reiniciar. */
export async function guardarCacheEmbeddings(ruta, cache) {
  await mkdir(dirname(ruta), { recursive: true })
  await writeFile(ruta, JSON.stringify(cache), 'utf8')
}

/** Similitud coseno entre dos vectores del mismo tamaño. `0` si alguno es
 *  nulo —dos vectores nulos no son «parecidos», son «no comparables»—, para
 *  no dividir entre cero silenciosamente. */
export function coseno(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom < 1e-9 ? 0 : dot / denom
}

/**
 * @param {object} opciones
 * @param {string} opciones.embeddingBase   servidor de embeddings
 * @param {string} [opciones.embeddingModelo]
 * @returns {{
 *   embeberUno: (texto: string) => Promise<number[]|null>,
 *   asegurarVectores: (items: {texto: string, hash: string, vector?: number[]}[], cache: object) => Promise<void>,
 *   progresoActual: () => {total: number, hechos: number} | null,
 * }}
 */
export function crearMotorEmbeddings({ embeddingBase, embeddingModelo = 'local' }) {
  /** Progreso del embebido en curso. `null` fuera de una llamada a
   *  `asegurarVectores` con textos pendientes — así un índice puede exponerlo
   *  en su `estado()` sin inventar un `{0,0}` que parecería «cero de cero»
   *  en vez de «no aplica ahora mismo». */
  let progreso = { total: 0, hechos: 0 }

  /** Un solo texto. Lo usa la consulta de búsqueda —siempre es una— y el
   *  reintento uno a uno cuando un lote falla entero. */
  async function embeberUno(texto) {
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

  /**
   * Varios textos en una sola llamada. `TAMANO_LOTE` textos cuestan una
   * petición HTTP en vez de `TAMANO_LOTE` peticiones.
   *
   * Cada elemento de la respuesta trae su `index` de vuelta: no se puede
   * asumir que `data[i]` responde a `textos[i]` sólo por la posición, así que
   * se reordena contra ese índice. Si el servidor no lo manda (no todos los
   * compatibles con OpenAI lo hacen), se cae a la posición tal cual.
   */
  async function embeberLote(textos) {
    const respuesta = await fetch(`${embeddingBase}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embeddingModelo, input: textos }),
      signal: AbortSignal.timeout(60000),
    })
    if (!respuesta.ok) throw new Error(`El servidor de embeddings respondió ${respuesta.status}`)
    const cuerpo = await respuesta.json()
    const datos = Array.isArray(cuerpo?.data) ? cuerpo.data : []
    return textos.map((_, i) => (datos.find(d => d.index === i) ?? datos[i])?.embedding ?? null)
  }

  /**
   * Rellena `.vector` de cada `item` que lo necesite, con tres niveles de
   * ahorro antes de tocar la red:
   *
   *   1. Ya lo tiene en memoria (reutilizado de una recarga anterior sin
   *      cambios) — no cuesta nada.
   *   2. Está en la caché de disco (mismo texto, embebido en un proceso
   *      anterior) — no cuesta red.
   *   3. Hay que pedirlo. Se pide POR LOTES, y si un lote falla entero se
   *      reintenta ese lote uno a uno: un solo texto raro no debe tirar el
   *      embedding de los demás que iban con él.
   *
   * `items` sólo necesita `.texto` y `.hash` — no le importa si es un
   * fragmento de manual o el texto de recuperación de una intervención.
   */
  async function asegurarVectores(items, cache) {
    const pendientes = []
    for (const item of items) {
      if (item.vector) continue
      const cacheado = cache.vectores[item.hash]
      if (cacheado) { item.vector = cacheado; continue }
      pendientes.push(item)
    }
    if (!pendientes.length) return

    progreso = { total: pendientes.length, hechos: 0 }

    try {
      for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
        const lote = pendientes.slice(i, i + TAMANO_LOTE)
        let vectores

        try {
          vectores = await embeberLote(lote.map(item => item.texto))
        } catch (error) {
          logger.warn('El embedding por lotes falló; se reintenta uno a uno', {
            textos: lote.length, error: error.message,
          })
          vectores = []
          for (const item of lote) {
            vectores.push(
              await embeberUno(item.texto).catch(error2 => {
                // Degradar y no descartar: BM25 sigue encontrando este texto
                // aunque no tenga vector. Perder parte del índice porque el
                // servidor de embeddings se cayó a media carga sería peor
                // que buscar sólo por texto en ese elemento.
                logger.warn('No se pudo generar el embedding de un texto', {
                  hash: item.hash, error: error2.message,
                })
                return null
              })
            )
          }
        }

        lote.forEach((item, idx) => {
          const v = vectores[idx]
          if (v) { item.vector = v; cache.vectores[item.hash] = v }
        })
        progreso.hechos += lote.length
      }
    } finally {
      progreso = { total: 0, hechos: 0 }
    }
  }

  function progresoActual() {
    return progreso.total > 0 ? { ...progreso } : null
  }

  return { embeberUno, asegurarVectores, progresoActual }
}
