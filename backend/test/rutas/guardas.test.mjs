/**
 * Ninguna ruta de la API se queda sin la guarda de autenticación.
 *
 * ── POR QUÉ ESTA PRUEBA Y NO UNA REVISIÓN ──────────────────────────
 *
 * Porque el fallo que persigue no se ve leyendo el diff que lo introduce.
 * Alguien añade `POST /api/algo` en un archivo de rutas nuevo, se olvida de la
 * guarda, y todo funciona igual: las pruebas de esa ruta pasan, el tablero la
 * usa, y nadie se entera. La consecuencia llega meses después, el día que se
 * ponga `AUTH_HABILITADA=true` y esa ruta —sólo esa— siga abierta.
 *
 * Antes del Plan 20 F5 la guarda se declaraba ruta por ruta y faltaba en
 * veinte de las treinta y tres. Ahora la pone el ámbito en `app.mjs`, y esto es
 * lo que impide que vuelva a haber un hueco: recorre el inventario REAL de
 * rutas registradas —no una lista escrita a mano aquí, que sería el mismo
 * problema con otro nombre— y comprueba que cada una pasa por `autenticar`.
 *
 * ── CÓMO SE OBSERVA ────────────────────────────────────────────────
 *
 * `autenticar` se resuelve en cada petición (`instancia.autenticar(...)` dentro
 * del hook), así que sustituirlo después de `ready()` por un envoltorio que
 * anota la URL es suficiente para ver por dónde pasa. No hace falta que la
 * autenticación esté implementada: lo que se comprueba es que la guarda CORRE,
 * no lo que decide.
 */
import { describe, expect, it } from 'vitest'
import { montarApp } from '../ayudas.mjs'

/**
 * Las que quedan fuera a propósito, con el motivo. Ver el hook en `app.mjs`.
 *
 *  · `/api/health*` — las llama el orquestador cada pocos segundos, sin sesión
 *    y sin nadie delante. Exigirles token convertiría un despliegue con
 *    autenticación activada en un contenedor que se reinicia solo porque su
 *    propia sonda responde 401.
 *  · `POST /api/auth/login` (Plan 22 F6) — exigir una sesión para pedir una
 *    sesión no lo puede cumplir nadie.
 *  · `GET /api/auth/yo` (Plan 35 F4) — es la ruta que el tablero pregunta
 *    ANTES de tener sesión, para decidir si pinta la pantalla de acceso. Aquí
 *    ponía que «parte de una que ya existe y SÍ pasa por la guarda», y era
 *    falso: con la guarda contestaba 401 a quien todavía no había entrado,
 *    que es justo el caso que existe para resolver. El tablero cargaba
 *    entero sin pedir credenciales — no era un agujero, porque las rutas de
 *    datos seguían cerradas, pero parecía que la autenticación no estaba
 *    puesta.
 *
 *    **La ruta no queda abierta**: resuelve el token a mano y sin lanzar, así
 *    que distingue a quien trae uno válido de quien no. Lo comprueban dos
 *    pruebas en `autenticacion.test.mjs`.
 *
 * `/api/auth/renovar` sí parte de una sesión que ya existe y sigue pasando
 * por la guarda. Esta lista es estrecha a propósito.
 */
const SIN_GUARDA = [
  /^\/api\/health/,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/yo$/,
]

/**
 * Un cuerpo cualquiera para los métodos que lo llevan.
 *
 * No tiene que ser válido: la validación del esquema corre DESPUÉS de
 * `onRequest`, así que un 400 sirve igual de bien que un 200 para demostrar
 * que la guarda se ejecutó antes.
 */
const CUERPO = { sonda: 'guardas.test.mjs' }

describe('la guarda de autenticación cubre toda la API', () => {
  it('cada ruta de /api/ pasa por `autenticar`, salvo las sondas de salud', async () => {
    const { app } = await montarApp()

    const vistas = new Set()
    const original = app.autenticar
    app.autenticar = async (request, reply) => {
      vistas.add(request.url.split('?')[0])
      return original(request, reply)
    }

    const inventario = app.inventarioApi()
    expect(inventario.length).toBeGreaterThan(20)

    const sinGuarda = []
    for (const { url, metodos } of inventario) {
      if (SIN_GUARDA.some(patron => patron.test(url))) continue

      const metodo = metodos[0]
      await app.inject({
        method: metodo,
        url,
        ...(metodo === 'GET' || metodo === 'DELETE' ? {} : { payload: CUERPO }),
      })

      if (!vistas.has(url)) sinGuarda.push(`${metodo} ${url}`)
    }

    expect(
      sinGuarda,
      `Estas rutas no pasan por la guarda de autenticación:\n  ${sinGuarda.join('\n  ')}\n\n` +
        'Si es a propósito, añádela a SIN_GUARDA con su motivo; si no, comprueba que se ' +
        'registra dentro del ámbito guardado de `app.mjs`.'
    ).toEqual([])

    app.autenticar = original
    await app.close()
  })

  it('las sondas de salud quedan fuera, que es lo que permite reiniciar sin sesión', async () => {
    const { app } = await montarApp()

    let llamada = false
    const original = app.autenticar
    app.autenticar = async (request, reply) => {
      llamada = true
      return original(request, reply)
    }

    const respuesta = await app.inject({ method: 'GET', url: '/api/health/live' })

    expect(respuesta.statusCode).toBe(200)
    expect(llamada).toBe(false)

    app.autenticar = original
    await app.close()
  })

  it('deja `request.usuario` relleno en una ruta de sólo lectura', async () => {
    /*
     * Varias rutas registran `usuario: request.usuario?.id` en sus logs de
     * escritura. Con la guarda sólo en algunas, ese campo salía vacío según por
     * dónde se hubiera entrado — y un registro de auditoría que a veces trae el
     * usuario y a veces no es peor que uno que nunca lo trae, porque el hueco
     * parece un dato.
     */
    const { app } = await montarApp()

    let usuario = null
    const original = app.autenticar
    app.autenticar = async (request, reply) => {
      await original(request, reply)
      usuario = request.usuario
    }

    await app.inject({ method: 'GET', url: '/api/iconics/data?pointName=ac:TDCON/DEMO/SENSORES/NIVEL' })

    expect(usuario).toEqual({ id: 'anonimo', roles: ['operador'], autenticado: false })

    app.autenticar = original
    await app.close()
  })
})

/**
 * ── Y NINGUNA SE QUEDA SIN ROL MÍNIMO (Plan 35 F2) ───────────────────
 *
 * Hermana de la de arriba, y por el mismo motivo. `autenticar` contesta «¿hay
 * alguien?»; `exigirRol` contesta «¿este alguien alcanza?». Una ruta sin rol
 * declarado deja pasar a cualquiera con sesión —incluido un visualizador— y
 * **eso no se ve**: la ruta funciona, sus pruebas pasan, y el hueco aparece el
 * día que alguien que sólo debía mirar acciona algo.
 *
 * Antes de esta fase lo declaraban 18 de 37 URLs. El resto sólo exigía estar
 * autenticado, que con tres roles ya no distingue nada.
 */
describe('la guarda de rol cubre toda la API', () => {
  /**
   * Las que quedan fuera a propósito, con su motivo.
   *
   *  · `/api/health*` y `POST /api/auth/login` — ni siquiera pasan por
   *    `autenticar`: no hay rol que exigir a quien todavía no tiene sesión.
   *  · `/api/auth/renovar` y `/api/auth/yo` — parten de una sesión que ya
   *    existe y su trabajo es justamente decir cuál es. Exigirles un rol
   *    mínimo impediría a un visualizador saber que es visualizador.
   *  · `GET /api/reportes` — el enlace va firmado (`REPORTES_SECRETO`) y se
   *    abre desde el propio adjunto del chat. Su control de acceso es la
   *    firma, no el rol; exigir los dos rompería la descarga sin añadir nada
   *    que la firma no diga ya.
   */
  const SIN_ROL = [
    /^\/api\/health/,
    /^\/api\/auth\//,
    /^\/api\/reportes$/,
  ]

  /**
   * ── CÓMO SE OBSERVA, Y POR QUÉ ASÍ ──────────────────────────────────
   *
   * No espiando `exigirRol` —se llama al REGISTRAR la ruta, así que para
   * cuando la prueba puede envolverlo los hooks ya están puestos— sino
   * midiendo el efecto: **se enciende la autenticación, se entra como el rol
   * más bajo y se mira qué deja pasar**.
   *
   * Es lo que de verdad importa. Una ruta que devuelve 200 a un visualizador
   * está declarando que un visualizador puede usarla, lo haya escrito alguien
   * a propósito o se le haya olvidado. Y así la prueba no depende de CÓMO se
   * declara el rol, sólo de que el resultado sea el correcto.
   */
  it('ninguna ruta deja pasar a un visualizador si no lo declara', async () => {
    const { app } = await montarApp({
      AUTH_HABILITADA: 'true',
      AUTH_SECRETO: 'clave-de-pruebas-suficientemente-larga-32',
      /* Un censo de uno: sólo hace falta el rol más bajo. El hash da igual
         porque el token se firma aquí, sin pasar por el login. */
      AUTH_USUARIOS: 'miron:visualizador:scrypt$00$00',
    })

    const token = app.jwt.sign({ sub: 'miron', roles: ['visualizador'] })
    const inventario = app.inventarioApi()
    expect(inventario.length).toBeGreaterThan(20)

    /* Las que un visualizador SÍ puede usar, por decisión de esta fase: leer
       valores, historia, alarmas, diagnósticos y el catálogo de casos. Es la
       lista de lo permitido, no de lo olvidado, y por eso se escribe entera. */
    const VISUALIZADOR_PUEDE = [
      /^\/api\/iconics\//,
      /^\/api\/diagnostico/,
      /^\/api\/context$/,
      /^\/api\/casos$/,
      /^\/api\/chat$/,
      /^\/api\/voz$/,
      /^\/api\/rag\/documentos$/,
    ]

    const dejanPasar = []
    for (const { url, metodos } of inventario) {
      if (SIN_ROL.some(patron => patron.test(url))) continue
      if (VISUALIZADOR_PUEDE.some(patron => patron.test(url))) continue

      for (const metodo of metodos) {
        const respuesta = await app.inject({
          method: metodo,
          url,
          headers: { authorization: `Bearer ${token}` },
          ...(metodo === 'GET' || metodo === 'DELETE' ? {} : { payload: CUERPO }),
        })

        /* 403 es lo que se espera. Cualquier otra cosa —incluido un 400 por
           cuerpo inválido— significa que la petición LLEGÓ a la ruta, o sea
           que la guarda de rol no la paró. */
        if (respuesta.statusCode !== 403) {
          dejanPasar.push(`${metodo} ${url} → ${respuesta.statusCode}`)
        }
      }
    }

    expect(
      dejanPasar,
      `Estas rutas dejan pasar a un visualizador:\n  ${dejanPasar.join('\n  ')}\n\n` +
        'Si un visualizador debe poder usarlas, añádelas a VISUALIZADOR_PUEDE; ' +
        'si no, declara su rol mínimo con `fastify.exigirRol(...)`.'
    ).toEqual([])

    await app.close()
  })
})
