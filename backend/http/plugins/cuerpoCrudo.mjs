/**
 * Parser de cuerpo en bruto, para las rutas cuyo cuerpo NO es JSON: el audio
 * de `/api/voz` y los archivos de `/api/rag/documentos` (Plan 16 Fase 1).
 *
 * ── POR QUÉ SE REGISTRA UNA SOLA VEZ, AQUÍ, Y NO EN CADA RUTA ───────
 *
 * Cada content-type sólo puede tener un parser en el árbol de contextos de
 * Fastify, y un hijo NO puede sombrear el de su padre: hereda una COPIA de
 * los parsers ya registrados, así que si dos rutas —cada una en su propio
 * archivo, sin saber la una de la otra— intentan registrar
 * `application/octet-stream` por su cuenta, la segunda revienta el arranque
 * entero con «Content type parser already present», y sólo se descubre
 * probando las dos rutas juntas. Ocurrió exactamente así al añadir
 * `/api/rag/documentos`: `/api/voz` ya lo tenía registrado.
 *
 * Con un solo registro, `fastify-plugin` (`fp`) evita además que quede
 * encapsulado dentro de este archivo: sin él, sólo verían este parser las
 * rutas registradas COMO HIJAS de este plugin, y cualquier otra encapsulación
 * —como la de cada grupo de rutas en `app.mjs`— se quedaría sin él.
 *
 * ── EL TOPE DE AQUÍ ES UN TECHO, NO EL LÍMITE DE NADIE ──────────────
 *
 * `bodyLimit` en el registro del parser es sólo la cota de seguridad más
 * alta que se espera necesitar —hoy, un manual de 40 MB—. El límite real de
 * cada ruta es el suyo propio, declarado como opción `bodyLimit` en su
 * `fastify.post(...)`/`put(...)`: Fastify usa el de la RUTA si lo declara, y
 * sólo cae al de aquí si la ruta no dice nada. Así `/api/voz` sigue cortando
 * en `config.limits.maxAudioBytes` (6 MB) aunque el parser que usa admita
 * hasta 40.
 */
import fp from 'fastify-plugin'

/** Content-types que llegan como bytes, no como texto ni como JSON. El audio
 *  del navegador puede anunciarse con cualquiera de los cuatro según el
 *  `MediaRecorder` que lo generó; los archivos de manuales van siempre como
 *  `application/octet-stream`. */
const TIPOS_EN_BRUTO = ['application/octet-stream', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/webm']

/** El mayor cuerpo que este servidor aceptará de CUALQUIER ruta en bruto. Hoy
 *  lo fija `documentos.mjs` (`MAX_BYTES`, 40 MB) para los manuales; se deja
 *  como número aparte —y no importado desde allí— para que este plugin no
 *  dependa de qué rutas existan hoy. */
const BODY_LIMIT_TECHO = 40 * 1024 * 1024

async function cuerpoCrudoPlugin(fastify) {
  fastify.addContentTypeParser(
    TIPOS_EN_BRUTO,
    { parseAs: 'buffer', bodyLimit: BODY_LIMIT_TECHO },
    (request, cuerpo, hecho) => hecho(null, cuerpo)
  )
}

export default fp(cuerpoCrudoPlugin, { name: 'cuerpo-crudo' })
