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
    /*
     * Un `maquinas.json` VACÍO y propio. Desde el Plan 38 el backend registra
     * al arrancar las máquinas configuradas del archivo; con el valor por
     * defecto (`datos/maquinas.json`) cada prueba metería en el registro las
     * máquinas de quien la corre, y el inventario de sistemas dependería del
     * disco de cada máquina de desarrollo. Las pruebas que necesitan máquinas
     * configuradas pasan su propia ruta en `extra`.
     */
    MAQUINAS_RUTA: join(reportesDir, 'maquinas.json'),
    /*
     * ── LOS CUATRO ARCHIVOS DE `datos/`, EN LA CARPETA TEMPORAL ──────
     *
     * Mismo motivo que `MAQUINAS_RUTA` de arriba, y con un historial peor:
     * sin esto, `cd backend && npm test` escribía en el despliegue DE VERDAD
     * de quien corriera la suite. Los tres diarios se resuelven contra
     * `PROJECT_ROOT` (`config.mjs`), así que las pruebas de chat, control y
     * diagnóstico iban sumando líneas a `datos/*.jsonl`: el 24-09-2026,
     * 2 441 de las 2 630 entradas del diario de conversaciones eran de la
     * suite. La bitácora era peor todavía: su ruta era RELATIVA al `cwd`, así
     * que las pruebas de `/api/casos` escribían en un SEGUNDO archivo,
     * `backend/datos/aprendizaje.json`, que nadie mira y que había que borrar
     * a mano cada pocos días (Plan 45 F2.1; la ruta ya es absoluta).
     *
     * Ninguna prueba necesitaba ese acoplamiento: las que comprueban lo que
     * se anotó leen el archivo por la ruta que ellas mismas pasan.
     */
    DIARIO_ACCIONAMIENTOS: join(reportesDir, 'diario-accionamientos.jsonl'),
    DIARIO_CONVERSACIONES: join(reportesDir, 'diario-conversaciones.jsonl'),
    DIARIO_DIAGNOSTICOS: join(reportesDir, 'diario-diagnosticos.jsonl'),
    CUADERNO_RUTA: join(reportesDir, 'cuaderno.jsonl'),
    APRENDIZAJE_RUTA: join(reportesDir, 'aprendizaje.json'),
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
