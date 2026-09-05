/**
 * Abrir sesión desde un verificador que habla HTTP de verdad.
 *
 * ── POR QUÉ HACE FALTA (PLAN 20 FASE 1) ────────────────────────────
 *
 * Desde el login nativo, toda ruta de `/api/` salvo las de salud exige una
 * cookie de sesión. Los verificadores que levantan la app y le hablan por
 * `fetch` —`verificar-chat`, `verificar-transporte-falso`— empezaban a recibir
 * 401 y a fallar por un motivo que no es el que vinieron a comprobar.
 *
 * Esto no debilita nada: los verificadores corren con `ICONICS_FAKE=true`, que
 * acepta cualquier credencial no vacía porque no hay servidor de seguridad
 * contra el que validar (ver `backend/routes/sesionRoutes.mjs`). Que la guarda
 * existe y muerde se comprueba donde toca, en
 * `backend/test/rutas/sesion.test.mjs`.
 *
 * ── POR QUÉ AQUÍ Y NO COPIADO EN CADA GUION ────────────────────────
 *
 * Porque son dos hoy y serán más, y un login copiado es un login que diverge:
 * el día que la cookie cambie de nombre habría que acordarse de todos. Es la
 * misma regla que `shared/README.md` defiende para el dominio, aplicada a los
 * guiones.
 */

/**
 * Entra y devuelve un `fetch` que ya lleva la cookie puesta.
 *
 * @param {string} base `http://127.0.0.1:<puerto>` del servidor levantado.
 * @param {string} [usuario] Con qué nombre entrar. Sirve para distinguir
 *   sesiones cuando un verificador abre más de una.
 * @param {string} [contrasena] Sólo importa cuando hay un ICONICS falso con
 *   OIDC de verdad detrás —`verificar-backend.mjs` lo tiene, y exige `u`/`p`—.
 *   Con `ICONICS_FAKE=true` cualquier valor no vacío sirve.
 * @returns {Promise<{cookie: string, pedir: (ruta: string, opciones?: object) => Promise<Response>}>}
 *   `pedir` acepta una RUTA (`/api/chat`), no una URL completa: la base ya la
 *   sabe, y así ningún sitio de llamada puede olvidarse de la cookie.
 */
export async function abrirSesionHttp(base, usuario = 'verificador', contrasena = 'da-igual-con-transporte-falso') {
  const respuesta = await fetch(`${base}/api/sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, contrasena }),
  })

  if (!respuesta.ok) {
    throw new Error(
      `No se pudo abrir la sesión del verificador (${respuesta.status}): ${await respuesta.text()}. ` +
        'Sin ella toda la API responde 401 y el guion fallaría por el motivo equivocado.'
    )
  }

  const cookie = (respuesta.headers.getSetCookie?.() ?? [])
    .map(entrada => entrada.split(';')[0])
    .join('; ')

  // Libera la respuesta de login antes de cerrar o reutilizar el servidor de prueba.
  await respuesta.arrayBuffer()

  return {
    cookie,
    pedir: (ruta, opciones = {}) =>
      fetch(`${base}${ruta}`, { ...opciones, headers: { ...opciones.headers, cookie } }),
  }
}
