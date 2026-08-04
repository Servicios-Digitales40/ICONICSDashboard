/**
 * Servidor de los archivos estáticos del frontend compilado (SPA).
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { sendText } from './responses.mjs'

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const FALLBACK_CONTENT_TYPE = 'application/octet-stream'
const INDEX_FILE = '/index.html'

/** Rutas que son archivos reales del build y nunca rutas de la SPA. */
const ASSET_PREFIXES = ['/assets/']
const ASSET_PATHS = ['/favicon.svg', '/icons.svg']

export function isAssetPath(pathname) {
  return ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix)) || ASSET_PATHS.includes(pathname)
}

/**
 * @param {string} staticDir Directorio raíz del build, ya absoluto.
 */
export function createStaticFileServer(staticDir) {
  const root = normalize(staticDir)

  /**
   * El guardia anterior era `normalizedPath.startsWith(distDir)`, que también
   * acepta un directorio hermano cuyo nombre empiece igual (`dist-backup/`).
   * Comparar con el separador incluido exige que sea realmente un descendiente.
   */
  function isInsideRoot(candidate) {
    return candidate === root || candidate.startsWith(root + sep)
  }

  async function serve(response, requestPath) {
    const resolvedPath = normalize(join(root, requestPath))

    if (!isInsideRoot(resolvedPath)) {
      sendText(response, 403, 'Forbidden')
      return
    }

    try {
      const stats = await stat(resolvedPath)
      if (!stats.isFile()) {
        sendText(response, 404, 'Not found')
        return
      }

      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(resolvedPath)] ?? FALLBACK_CONTENT_TYPE,
      })
      createReadStream(resolvedPath).pipe(response)
    } catch {
      sendText(response, 404, 'Not found')
    }
  }

  /**
   * Entrega el `index.html` para que el enrutador del navegador resuelva la
   * ruta. Si no hay build, lo dice: un 404 seco aquí se confunde con una ruta
   * mal escrita, cuando lo que falta es compilar el frontend.
   */
  async function serveIndex(response) {
    try {
      const stats = await stat(join(root, 'index.html'))
      if (!stats.isFile()) throw new Error('index.html no es un archivo')
    } catch {
      sendText(response, 503, `Frontend build not found in ${root}. Ejecuta "npm run build" en react-dashboard/.`)
      return
    }

    await serve(response, INDEX_FILE)
  }

  return { serve, serveIndex }
}
