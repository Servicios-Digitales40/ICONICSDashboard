/**
 * Entrar, renovar y saber quién eres (Plan 22 F6 · SEG-01, primera mitad).
 *
 * ── POR QUÉ EL LOGIN QUEDA FUERA DE LA GUARDA ──────────────────────
 *
 * Porque exigir una sesión para pedir una sesión no lo puede cumplir nadie. Es
 * la segunda excepción del ámbito de API, junto a las sondas de salud, y como
 * aquélla está declarada en un solo sitio (`app.mjs`) y vigilada por
 * `test/rutas/guardas.test.mjs`, que exige que toda excepción esté escrita.
 *
 * `renovar` y `yo` SÍ pasan por la guarda: las dos parten de una sesión que ya
 * existe.
 *
 * ── LO QUE ESTAS RUTAS NO HACEN ────────────────────────────────────
 *
 * No hay logout. Un JWT es válido hasta que caduca por definición: «cerrar
 * sesión» sería el cliente tirando su token, y una ruta que dijera `ok: true`
 * sin invalidar nada en el servidor daría a entender lo contrario. Invalidar
 * de verdad exige una lista de tokens revocados —estado compartido, releído en
 * cada petición— y eso es una base de datos por la puerta de atrás
 * (CLAUDE.md §2.2). El día que haga falta revocar de verdad, la respuesta es la
 * federación con el IdP de ICONICS (Plan 26), que ya la tiene.
 *
 * Tampoco hay alta de usuarios: el censo es configuración de despliegue. Ver
 * `http/usuarios.mjs`.
 */
import { LoginSchema } from '../http/esquemas.mjs'
import { claveCoincide } from '../http/usuarios.mjs'
import { CODIGOS, responderError } from '../http/codigos.mjs'

export function registerAuthRoutes(fastify, { config }) {
  const habilitada = config.auth?.habilitada ?? false

  fastify.post(
    '/api/auth/login',
    { schema: { body: LoginSchema } },
    async (request, reply) => {
      if (!habilitada) {
        /*
         * 503 y no 404: la ruta existe, lo que no está es la función. Un 404
         * mandaría a quien integra el tablero a buscar un error de despliegue.
         * Y `ok:false` con el nombre de la variable, como el resto del puente.
         */
        return responderError(
          reply, 503, CODIGOS.ERROR_AUTH_DESACTIVADA,
          'La autenticación de usuarios está desactivada en este servidor ' +
          '(AUTH_HABILITADA=false). No hay sesión que iniciar.',
        )
      }

      const { usuario: id, clave } = request.body
      const usuario = config.auth.usuarios.get(id)

      /*
       * ── POR QUÉ SE COMPRUEBA LA CLAVE DE UN USUARIO QUE NO EXISTE ──
       *
       * Contra un id desconocido se verifica igualmente un hash de mentira. Sin
       * eso, «usuario que no existe» contesta en un milisegundo y «usuario que
       * existe con clave mala» tarda los ~100 ms de scrypt: la diferencia es
       * medible desde fuera y convierte el login en un buscador de nombres de
       * usuario válidos.
       */
      const coincide = await claveCoincide(clave, usuario?.hash ?? HASH_INEXISTENTE)

      if (!usuario || !coincide) {
        request.log.warn(
          { usuario: id, ip: request.ip, motivo: usuario ? 'clave' : 'usuario' },
          `Intento de acceso fallido para "${id}" desde ${request.ip}`
        )
        /*
         * Un solo mensaje para los dos casos, aunque el log sí los distinga:
         * quien está fuera no tiene por qué saber si acertó el nombre.
         */
        return responderError(
          reply, 401, CODIGOS.ERROR_CREDENCIALES, 'Usuario o contraseña incorrectos.',
        )
      }

      const token = fastify.jwt.sign({ sub: usuario.id, roles: [...usuario.roles] })

      request.log.info(
        { usuario: usuario.id, roles: usuario.roles, ip: request.ip },
        `Sesión iniciada por "${usuario.id}" desde ${request.ip}`
      )

      return {
        ok: true,
        token,
        // En minutos y no como fecha absoluta: el reloj del navegador y el del
        // puente no tienen por qué coincidir (Plan 21 F6), y una fecha
        // absoluta invita a compararlos.
        expiraEnMinutos: config.auth.minutos,
        usuario: { id: usuario.id, roles: [...usuario.roles] },
      }
    }
  )

  fastify.post(
    '/api/auth/renovar',
    { onRequest: [fastify.autenticar] },
    async request => {
      if (!habilitada) return { ok: true, token: null, expiraEnMinutos: null, usuario: ANONIMO_PUBLICO }

      /*
       * Renovar es firmar uno nuevo con los datos del actual, que la guarda ya
       * verificó. Los roles se releen del CENSO y no se copian del token: si a
       * alguien se le quitó un rol, la renovación tiene que enterarse — si no,
       * un token viejo se prolongaría a sí mismo con permisos que ya no tiene.
       */
      const usuario = config.auth.usuarios.get(request.usuario.id)
      if (!usuario) {
        request.log.warn(
          { usuario: request.usuario.id },
          'Renovación denegada: el usuario ya no está en AUTH_USUARIOS'
        )
        return {
          ok: false,
          error: 'Tu usuario ya no existe en este servidor. Vuelve a entrar.',
          codigo: CODIGOS.ERROR_USUARIO_DESCONOCIDO,
        }
      }

      return {
        ok: true,
        token: fastify.jwt.sign({ sub: usuario.id, roles: [...usuario.roles] }),
        expiraEnMinutos: config.auth.minutos,
        usuario: { id: usuario.id, roles: [...usuario.roles] },
      }
    }
  )

  /**
   * ¿Quién soy, y hace falta entrar?
   *
   * ── POR QUÉ NO LLEVA `autenticar` (defecto del 21-09-2026) ────────
   *
   * Porque es la ruta que el tablero pregunta **antes** de tener sesión, para
   * decidir si pinta la pantalla de acceso. Llevaba la guarda, y entonces
   * contestaba **401** a quien todavía no había entrado — que es justo el
   * caso que tiene que saber resolver.
   *
   * El comentario de esta ruta ya decía lo que quería conseguir: «el tablero
   * puede decidir con eso si pinta una pantalla de acceso, sin tener que
   * adivinarlo por el código de estado de otra ruta». Con la guarda puesta,
   * había que adivinarlo por el código de estado de esta misma — y el
   * proveedor caía en su `catch`, que asume «pendiente» sin saber si la
   * autenticación está siquiera encendida.
   *
   * **Se vio al encender el interruptor de verdad** (Plan 35 F4): el tablero
   * cargaba entero sin pedir credenciales. No era un agujero —toda ruta de
   * datos seguía devolviendo 401 y la pantalla salía vacía— pero sí la peor
   * forma de fallar: parecía que la autenticación no estaba puesta.
   *
   * Sin guarda, `request.usuario` no lo pone el hook, así que se resuelve el
   * token **a mano** y sin lanzar: quien traiga uno válido recibe su
   * identidad, y quien no, `autenticado: false`, que es la respuesta correcta
   * a «todavía no he entrado».
   */
  fastify.get('/api/auth/yo', async request => {
    if (!habilitada) {
      return {
        ok: true,
        usuario: { id: 'anonimo', roles: ['operador'], autenticado: false },
        habilitada,
      }
    }

    try {
      const { sub, roles } = await request.jwtVerify()
      return {
        ok: true,
        usuario: { id: sub, roles: roles ?? [], autenticado: true },
        habilitada,
      }
    } catch {
      /* Un token ausente, caducado o falso son el mismo caso desde aquí: no
         hay sesión. Cuál de los tres es no cambia lo que el tablero hace —
         pedir acceso— y distinguirlos aquí filtraría si un usuario existe. */
      return {
        ok: true,
        usuario: { id: null, roles: [], autenticado: false },
        habilitada,
      }
    }
  })
}

/**
 * Un hash con la forma correcta y de una contraseña que nadie tiene, para
 * gastar el mismo tiempo ante un usuario inexistente. Ver el porqué arriba.
 */
const HASH_INEXISTENTE =
  'scrypt$00000000000000000000000000000000$' + '0'.repeat(128)

/** Lo que devuelve `/yo` cuando no hay autenticación que hacer. */
const ANONIMO_PUBLICO = Object.freeze({ id: 'anonimo', roles: ['operador'], autenticado: false })
