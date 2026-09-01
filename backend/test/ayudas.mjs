/**
 * Utilidades compartidas por las pruebas de rutas.
 *
 * La app se monta entera —con sus plugins, sus guardas y su frontera de
 * errores— y se le inyectan peticiones en memoria. No se abre ningún puerto ni
 * se toca ICONICS: el cliente es el simulado, que cumple la misma firma.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.mjs'
import { loadConfig } from '../config.mjs'

/**
 * Monta la app con el transporte simulado.
 *
 * @param {Record<string,string>} extra Variables de entorno que añadir o pisar.
 */
export async function montarApp(extra = {}) {
  const reportesDir = await mkdtemp(join(tmpdir(), 'iconics-test-'))
  /*
   * Carpeta APARTE, y no la misma `reportesDir` reutilizada — desde que Plan
   * 16 separó `generar_reporte` (config.reportes.dir) de la exportación de
   * chat (config.backlogChat.dir), compartir una sola carpeta en las pruebas
   * escondería un fallo real: `GET /api/reportes` probando dos carpetas que
   * en realidad fueran la misma no demostraría que la segunda búsqueda
   * funciona, sólo que la primera encontró el archivo.
   */
  const backlogChatDir = await mkdtemp(join(tmpdir(), 'iconics-test-chat-'))

  const config = loadConfig({
    ICONICS_FAKE: 'true',
    /*
     * Silencio en las pruebas: lo que se comprueba son las respuestas, y el
     * log de once rutas por archivo taparía los fallos de verdad. Se apaga
     * entero —no basta con 'error'— porque varias pruebas provocan fallos a
     * propósito (un llama-server que no responde) y sus trazas son ruido
     * esperado, no información.
     */
    LOG_LEVEL: 'silent',
    STATIC_DIR: reportesDir,
    // La clave del entorno es `IA_REPORTES_DIR` —lee `config.mjs`—, no
    // `REPORTES_DIR` a secas: con el nombre equivocado esto no hacía NADA, y
    // las pruebas que creían tener una carpeta temporal aislada escribían
    // sobre el `Documentos/Reportes` de verdad de quien las corriera.
    IA_REPORTES_DIR: reportesDir,
    IA_BACKLOG_CHAT_DIR: backlogChatDir,
    ...extra,
  })

  const app = await createApp(config)
  await app.ready()
  return { app, config, reportesDir, backlogChatDir }
}

/** El cuerpo JSON de una respuesta de `inject()`. */
export function json(respuesta) {
  return JSON.parse(respuesta.body)
}

/**
 * Trocea un flujo SSE en los eventos que transporta.
 *
 * Se parsea de verdad —separando por la línea en blanco y quitando el prefijo
 * `data: `— en lugar de buscar subcadenas: lo que se quiere comprobar es que
 * el formato del flujo sigue siendo el que el frontend sabe leer.
 */
export function eventosSse(cuerpo) {
  return cuerpo
    .split('\n\n')
    .map(bloque => bloque.trim())
    .filter(bloque => bloque.startsWith('data: '))
    .map(bloque => JSON.parse(bloque.slice('data: '.length)))
}
