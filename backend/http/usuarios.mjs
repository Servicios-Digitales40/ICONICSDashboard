/**
 * Quién puede entrar al tablero, y con qué rol.
 *
 * ── POR QUÉ UN DIRECTORIO EN EL ENTORNO Y NO UNA TABLA ─────────────
 *
 * Porque este directorio está DESTINADO A DESAPARECER. La decisión de largo
 * plazo es federar contra el IdP OIDC de ICONICS —no mantener un segundo censo
 * de personas— y eso es el Plan 26, que necesita la planta para desarrollarse
 * (con `ICONICS_FAKE=true` el cliente real ni se construye, así que el flujo no
 * se ejercita nunca).
 *
 * Lo que queda para entonces es sustituir QUIÉN FIRMA el token, no rehacer el
 * modelo: los roles, las rutas que exigen sesión y qué contesta cada una ya
 * están decididos desde el Plan 20 F5. Así que lo que se monta ahora tiene que
 * ser lo más barato que funcione de verdad, y una tabla de usuarios con su
 * CRUD, su pantalla y sus migraciones sería construir para tirar.
 *
 * Tampoco un JSON en `datos/`: ahí vive estado que el backend GENERA (lo
 * aprendido, las cachés, el diario). Un censo de personas es configuración de
 * despliegue —cambia cuando cambia la plantilla, no cuando corre el
 * programa— y va donde va el resto de la configuración.
 *
 * ── LO QUE NUNCA SE GUARDA ─────────────────────────────────────────
 *
 * La contraseña. Lo que viaja en `AUTH_USUARIOS` es un derivado de `scrypt`
 * con sal por usuario, del que no se puede volver atrás. `scrypt` y no bcrypt
 * o argon2 porque lo trae `node:crypto`: una dependencia menos en un puente
 * que corre en una planta y se actualiza poco.
 *
 * `scripts/hash-clave.mjs` genera la línea. Sin él, esto sería una función que
 * nadie puede usar — es el mismo criterio que documentar cómo exportar el
 * certificado en F5.
 *
 * ── FORMATO ────────────────────────────────────────────────────────
 *
 *   AUTH_USUARIOS="ana:supervisor,operador:<hash>;juan:operador:<hash>"
 *
 * Entradas separadas por `;`, y dentro `id:roles:hash`. Los roles por comas.
 * El hash es `scrypt$<sal en hex>$<derivado en hex>` y no lleva ninguno de los
 * dos separadores, así que no hay que escapar nada.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivar = promisify(scrypt)

/**
 * Coste de `scrypt`.
 *
 * N=16384 es el valor de referencia de la documentación de Node y ronda los
 * 100 ms por verificación en una máquina de oficina. Es mucho para una
 * comparación y ése es exactamente el objetivo: encarece probar contraseñas a
 * lo bruto. Un login por turno no nota la diferencia.
 *
 * `maxmem` explícito porque el defecto de Node (32 MB) se queda corto para
 * N=16384 con r=8 y falla con `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` — que es un
 * error críptico para lo que en realidad es un límite de memoria.
 */
const COSTE = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const LONGITUD_DERIVADO = 64

/** `scrypt$sal$derivado`, todo en hexadecimal. */
export async function hashDeClave(clave, sal = randomBytes(16).toString('hex')) {
  const derivado = await derivar(clave, sal, LONGITUD_DERIVADO, COSTE)
  return `scrypt$${sal}$${derivado.toString('hex')}`
}

/**
 * ¿Es ésta la clave?
 *
 * Compara con `timingSafeEqual` y no con `===`: una comparación que sale antes
 * al primer byte distinto filtra, medida muchas veces, cuánto del derivado se
 * acertó. Es barato hacerlo bien y no hay motivo para no hacerlo.
 *
 * Devuelve `false` ante un hash con formato inválido en vez de lanzar: un
 * `AUTH_USUARIOS` mal escrito ya lo caza `leerUsuarios` al arrancar, y aquí lo
 * que hay delante es alguien intentando entrar — a quien no se le cuenta nada
 * sobre el estado interno.
 */
export async function claveCoincide(clave, hash) {
  const partes = String(hash ?? '').split('$')
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false

  const [, sal, esperado] = partes
  let derivado
  try {
    derivado = await derivar(clave, sal, LONGITUD_DERIVADO, COSTE)
  } catch {
    return false
  }

  const esperadoBytes = Buffer.from(esperado, 'hex')
  if (esperadoBytes.length !== derivado.length) return false
  return timingSafeEqual(derivado, esperadoBytes)
}

/**
 * `AUTH_USUARIOS` → `Map<id, { id, roles, hash }>`.
 *
 * Lanza ante cualquier entrada mal formada, con el id señalado. Es la misma
 * doctrina que el resto de `config.mjs`: una configuración a medias que
 * arranca se diagnostica mucho peor que una que no arranca. Y aquí de más:
 * un usuario que se cae por un `:` de menos deja a una persona sin poder
 * entrar el día que se active la autenticación, sin ninguna pista.
 */
export function leerUsuarios(rawValue) {
  const usuarios = new Map()
  if (!rawValue?.trim()) return usuarios

  for (const entrada of rawValue.split(';')) {
    const texto = entrada.trim()
    if (!texto) continue

    const partes = texto.split(':')
    if (partes.length !== 3) {
      throw new Error(
        `AUTH_USUARIOS: la entrada "${recortar(texto)}" no tiene la forma "id:roles:hash" ` +
          `(se encontraron ${partes.length} campos separados por ":", y son 3). ` +
          'Genera la línea con: node scripts/hash-clave.mjs <id> <roles>'
      )
    }

    const [id, rolesCrudos, hash] = partes.map(p => p.trim())

    if (!id) throw new Error(`AUTH_USUARIOS: hay una entrada sin id ("${recortar(texto)}").`)
    if (usuarios.has(id)) {
      throw new Error(
        `AUTH_USUARIOS: "${id}" aparece dos veces. Con dos entradas del mismo id, cuál gana ` +
          'depende del orden y sólo una de las dos contraseñas funcionaría.'
      )
    }

    const roles = rolesCrudos.split(',').map(r => r.trim()).filter(Boolean)
    if (!roles.length) {
      throw new Error(
        `AUTH_USUARIOS: el usuario "${id}" no declara ningún rol. Un usuario sin roles puede ` +
          'entrar y no puede hacer nada, que casi nunca es lo que se quería escribir.'
      )
    }

    if (!hash.startsWith('scrypt$')) {
      throw new Error(
        `AUTH_USUARIOS: el hash de "${id}" no empieza por "scrypt$". Si ahí has puesto la ` +
          'contraseña en claro, quítala del entorno y genera el hash con: ' +
          'node scripts/hash-clave.mjs ' + id + ' ' + roles.join(',')
      )
    }

    usuarios.set(id, Object.freeze({ id, roles: Object.freeze(roles), hash }))
  }

  return usuarios
}

/** Para que un mensaje de error no vuelque un hash entero en el log. */
function recortar(texto) {
  return texto.length > 40 ? `${texto.slice(0, 40)}…` : texto
}
