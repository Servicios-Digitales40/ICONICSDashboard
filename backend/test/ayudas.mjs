/**
 * Utilidades compartidas por las pruebas de rutas.
 *
 * La app se monta entera —con sus plugins, sus guardas y su frontera de
 * errores— y se le inyectan peticiones en memoria. No se abre ningún puerto ni
 * se toca ICONICS: el cliente es el simulado, que cumple la misma firma.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE, DEMOSTRADO (PLAN 20 FASE 1) ───────
 *
 * Al pasar la API a exigir sesión, las once pruebas de rutas tenían que
 * empezar a mandar una cookie. Con el montaje repetido en cada archivo habrían
 * sido once ediciones y once oportunidades de que una se quedara atrás
 * probando contra un servidor abierto. Aquí fue **una**: `montarApp` abre la
 * sesión y devuelve la cabecera, y `comoUsuario()` la pega a cada `inject()`.
 *
 * El login se acepta porque estas pruebas corren con `ICONICS_FAKE=true`, que
 * no tiene servidor de seguridad contra el que validar — ver la nota de
 * `routes/sesionRoutes.mjs`.
 *
 * ── LA APP QUE DEVUELVE `montarApp` VIENE CON SESIÓN ───────────────
 *
 * `app.inject()` añade la cookie SOLA. No es para esconder la guarda: es para
 * que las pruebas de esta carpeta sigan probando lo que vinieron a probar —el
 * contrato HTTP de cada ruta— sin que cada una tenga que repetir el login.
 *
 * Que la guarda existe y muerde se prueba aparte y a propósito, en
 * `test/rutas/sesion.test.mjs`, que recorre las rutas SIN sesión y exige 401.
 * Esa separación es deliberada: si la autenticación se probara de refilón en
 * cada archivo, no se probaría en ninguno.
 *
 * Para pedir explícitamente una petición sin sesión desde cualquier prueba,
 * basta con mandar la cabecera vacía: `inject({ headers: { cookie: '' } })`.
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

  const servidor = await createApp(config)
  await servidor.ready()

  const sesion = await abrirSesion(servidor)
  return {
    app: conSesionPorDefecto(servidor, sesion.comoUsuario),
    /** La instancia cruda, sin la cookie automática. */
    servidor,
    config,
    reportesDir,
    backlogChatDir,
    ...sesion,
  }
}

/**
 * Envuelve la app para que cada `inject()` viaje con la cookie de sesión.
 *
 * Respeta lo que el llamante ya haya puesto: si trae `headers.cookie` —aunque
 * sea vacía— se manda tal cual. Es lo que permite escribir la prueba de «sin
 * sesión» sin salirse de este ayudante.
 */
function conSesionPorDefecto(servidor, comoUsuario) {
  return {
    inject(opciones = {}) {
      const yaDecidio = opciones.headers && 'cookie' in opciones.headers
      return servidor.inject(yaDecidio ? opciones : comoUsuario(opciones))
    },
    ready: () => servidor.ready(),
    close: () => servidor.close(),
  }
}

/** Usuario de las pruebas. Cualquiera vale con el transporte falso. */
export const USUARIO_PRUEBA = 'tecnico.prueba'

/**
 * Abre una sesión y devuelve lo necesario para usarla.
 *
 * @returns {{cookie: string, comoUsuario: (opciones) => object}} `cookie` para
 *   quien quiera montarla a mano, y `comoUsuario` para el caso normal:
 *   `app.inject(comoUsuario({ method: 'GET', url: '/api/casos' }))`.
 */
export async function abrirSesion(app, usuario = USUARIO_PRUEBA) {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/sesion',
    payload: { usuario, contrasena: 'da-igual-con-transporte-falso' },
  })

  if (respuesta.statusCode !== 200) {
    throw new Error(
      `No se pudo abrir la sesión de prueba (${respuesta.statusCode}): ${respuesta.body}. ` +
        'Sin ella toda la API responde 401 y las pruebas fallarían por el motivo equivocado.'
    )
  }

  /*
   * `set-cookie` puede llegar como cadena o como array según cuántas se hayan
   * puesto. Se normaliza aquí, una vez, en vez de en cada prueba.
   */
  const puestas = respuesta.headers['set-cookie']
  const cookie = (Array.isArray(puestas) ? puestas : [puestas])
    .map(entrada => entrada.split(';')[0])
    .join('; ')

  return {
    cookie,
    usuario,
    comoUsuario: (opciones = {}) => ({
      ...opciones,
      headers: { ...opciones.headers, cookie },
    }),
  }
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
