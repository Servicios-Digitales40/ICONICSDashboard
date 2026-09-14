/**
 * Enlaces de descarga que caducan y no se pueden fabricar (Plan 22 F7 · SEG-09).
 *
 * ── QUÉ PROBLEMA CIERRA ────────────────────────────────────────────
 *
 * `GET /api/reportes?id=<uuid>` sirve cualquier PDF de las dos carpetas. El
 * patrón de UUID protege del recorrido de rutas —eso ya estaba bien resuelto—
 * pero no hay caducidad ni autorización por documento: la purga es por
 * antigüedad del archivo, o sea 30 días. Un informe de proceso reenviado por
 * chat sigue descargable meses después por cualquiera que tenga la URL.
 *
 * Con la firma, el enlace lleva su propia fecha de caducidad y sólo lo puede
 * emitir quien tiene el secreto. El PDF sigue estando en disco lo que dure la
 * purga; lo que caduca es el permiso para pedirlo.
 *
 * ── POR QUÉ HMAC Y NO UN TOKEN GUARDADO ────────────────────────────
 *
 * Porque una lista de enlaces vigentes es estado compartido que hay que
 * escribir al emitir y leer al descargar — y eso es una base de datos por la
 * puerta de atrás (CLAUDE.md §2.2). Un HMAC no guarda nada: la firma ES la
 * autorización, y el servidor la recalcula. El precio es que un enlace emitido
 * no se puede revocar antes de tiempo, y por eso el plazo es corto.
 *
 * ── EL USUARIO VA EN LA FIRMA AUNQUE HOY NO HAYA USUARIOS ──────────
 *
 * Con `AUTH_HABILITADA=false` todo el mundo es `anonimo` y atar el enlace a
 * `anonimo` no ata nada. Va igualmente, por lo mismo que `request.usuario` se
 * rellena siempre (Plan 20 F5): el día que se encienda la autenticación, un
 * enlace firmado para Ana deja de servirle a Juan **sin tocar este archivo**.
 * Si el campo no estuviera, ese día habría que cambiar el formato de la firma
 * y todos los enlaces vigentes se caerían a la vez.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Firma un enlace de descarga.
 *
 * Devuelve la ruta entera con sus parámetros, lista para entregar. La ruta se
 * arma aquí y no en quien llama para que el orden de los parámetros —que entra
 * en la firma sólo a través de los valores, no del texto— no dependa de tres
 * sitios distintos.
 *
 * @param {object} opciones
 * @param {string} opciones.id        el UUID del PDF
 * @param {string} opciones.usuario   a quién se le entrega
 * @param {number} opciones.minutos   cuánto vale
 * @param {string} opciones.secreto
 * @param {() => number} [opciones.ahora]
 */
export function firmarEnlace({ id, usuario, minutos, secreto, ahora = Date.now }) {
  const expira = Math.floor(ahora() / 1000) + minutos * 60
  const firma = calcularFirma({ id, expira, usuario, secreto })
  return `/api/reportes?id=${encodeURIComponent(id)}&expira=${expira}` +
    `&u=${encodeURIComponent(usuario)}&firma=${firma}`
}

/**
 * ¿Vale este enlace?
 *
 * Devuelve `{ ok: true }` o `{ ok: false, motivo }`, con `motivo` en
 * `'sinFirma' | 'firma' | 'caducado' | 'usuario'`. Cada uno lleva a un arreglo
 * distinto y la ruta los traduce a códigos distintos — un 404 genérico para
 * los cuatro mandaría a buscar el fallo en el sitio equivocado.
 *
 * ── EL ORDEN DE LAS COMPROBACIONES IMPORTA ─────────────────────────
 *
 * La firma ANTES que la caducidad. Al revés, un enlace inventado con una fecha
 * pasada respondería «caducó», que le confirma a quien lo probó que el id
 * existe. Comprobando la firma primero, lo que no salió de aquí no llega a
 * enterarse de nada.
 */
export function verificarEnlace({ id, expira, firma, usuario, secreto, ahora = Date.now }) {
  if (!firma || !expira) return { ok: false, motivo: 'sinFirma' }

  const expiraNumero = Number(expira)
  if (!Number.isFinite(expiraNumero)) return { ok: false, motivo: 'firma' }

  const esperada = calcularFirma({ id, expira: expiraNumero, usuario: usuario ?? '', secreto })
  if (!iguales(firma, esperada)) return { ok: false, motivo: 'firma' }

  if (expiraNumero * 1000 < ahora()) return { ok: false, motivo: 'caducado' }

  return { ok: true }
}

/**
 * ¿El enlace se emitió para esta persona?
 *
 * Aparte de `verificarEnlace` porque quien lo pregunta es la ruta, que es la
 * única que sabe quién está pidiendo. Con la autenticación apagada los dos
 * lados valen `anonimo` y esto siempre dice que sí — ver la cabecera.
 */
export function esDelUsuario(usuarioDelEnlace, usuarioQuePide) {
  return (usuarioDelEnlace ?? '') === (usuarioQuePide ?? '')
}

function calcularFirma({ id, expira, usuario, secreto }) {
  /*
   * Los campos van separados por `|` y no concatenados: sin separador,
   * ("ab", "c") y ("a", "bc") producen la misma firma, y eso deja fabricar un
   * enlace válido moviendo un carácter de un campo al siguiente. Ninguno de
   * los tres puede contener `|` —un UUID, un número y un id de usuario que el
   * censo no deja que lo lleve— así que el separador es inequívoco.
   */
  return createHmac('sha256', secreto)
    .update(`${id}|${expira}|${usuario}`)
    .digest('hex')
}

/** Comparación en tiempo constante, tolerante a longitudes distintas. */
function iguales(a, b) {
  const bufA = Buffer.from(String(a), 'utf8')
  const bufB = Buffer.from(String(b), 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
