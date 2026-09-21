/**
 * backend/routes/maquinasRoutes.mjs
 * ------------------------------------------------------------------
 * El CRUD de máquinas configuradas, y el catálogo de tipos. Plan 33 F2.
 *
 * ── QUÉ ES ESTO Y QUÉ NO ES ────────────────────────────────────────
 *
 * Es la puerta HTTP de `ia/indices/maquinas.mjs`. **No decide nada**: la
 * validación vive en `shared/eva/comun/configuracionMaquina.js` —dominio puro,
 * usado también por la vista— y la persistencia en el gestor. Aquí sólo se
 * traduce entre HTTP y esas dos piezas, que es lo que hace el resto de
 * `routes/`.
 *
 * ── LO QUE ESTAS RUTAS NO HACEN TODAVÍA ────────────────────────────
 *
 * **Nadie las consume.** Ni el registro las lee (eso es F3), ni hay pantalla
 * que las llame (F5). Es deliberado: F2 es persistencia, y una fase de
 * persistencia que además cambie lo que el programa hace no se podría
 * distinguir de una regresión si fallara.
 *
 * **No comprueban contra ICONICS.** Que los puntos existan es otra pregunta,
 * necesita red, y la contesta `POST /api/maquinas/:id/verificar` cuando exista
 * (F8). Hoy una máquina se guarda bien formada y con estado `UNKNOWN`, que es
 * exactamente lo que significa: nadie ha mirado todavía.
 *
 * ── POR QUÉ `exigirRol` VA RUTA POR RUTA Y `autenticar` NO ─────────
 *
 * `autenticar` la aplica el ámbito en `app.mjs` desde el Plan 20 F5: la
 * llevaban trece de treinta y tres rutas, y olvidarla en la siguiente no rompía
 * nada visible. `exigirRol` sí se declara aquí porque es donde hay criterio —
 * quién puede configurar una máquina no es la misma pregunta que quién puede
 * verla (`CLAUDE.md` §2.11).
 *
 * ── UN AVISO QUE HAY QUE TENER DELANTE ─────────────────────────────
 *
 * `AUTH_HABILITADA=false`. Los roles están implementados y probados, pero HOY
 * NO PROTEGEN NADA, a propósito. Estas rutas escriben configuración, no
 * planta: ninguna de ellas puede mover un actuador. Pero **marcar una variable
 * como escribible sí es una decisión con consecuencias**, y por eso el Plan 33
 * §20 declara la autenticación del tablero (Plan 25) como dependencia dura de
 * la pantalla de configuración (F5), no de esta fase.
 */
import {
  CrearMaquinaSchema,
  EditarMaquinaSchema,
  MaquinaParamsSchema,
} from '../http/esquemas.mjs'
import { CODIGOS } from '../http/codigos.mjs'
import {
  ESTADO_CONFIGURACION,
  capacidadesDe,
} from '../../shared/eva/comun/configuracionMaquina.js'
import { verificarMaquina } from '../lib/verificarConfiguracion.mjs'
import { resumenDeTipos, tipoDe } from '../../shared/eva/tipos/index.js'

/**
 * Una máquina tal como sale por HTTP: su configuración más lo que se DERIVA de
 * ella.
 *
 * Las capacidades no se guardan en disco y no se mandan desde el cliente: se
 * calculan aquí a partir de la configuración y del tipo. Guardarlas sería
 * tener dos versiones de la misma verdad, y la almacenada se quedaría vieja en
 * cuanto alguien editara una variable.
 */
const conCapacidades = maquina => ({
  ...maquina,
  capacidades: capacidadesDe(maquina, tipoDe(maquina.tipo)),
})

export function registerMaquinasRoutes(
  fastify,
  { gestorMaquinas, contarCasosDe = null, client = null } = {}
) {
  if (!gestorMaquinas) {
    throw new Error(
      'registerMaquinasRoutes necesita `gestorMaquinas`. Sin él las rutas existirían y ' +
        'responderían como si no hubiera ninguna máquina configurada, que es peor que no estar.'
    )
  }

  const responderError = (reply, status, codigo, error, extra = {}) =>
    reply.code(status).send({ ok: false, error, codigo, ...extra })

  /* ── Lectura ──────────────────────────────────────────────────────── */

  /**
   * Los tipos que este programa sabe interpretar.
   *
   * Va aquí y no en una ruta propia porque es la primera pregunta de la
   * pantalla de configuración —«¿de qué tipo es esta máquina?»— y porque un
   * tipo no existe sin máquinas que lo usen.
   */
  fastify.get('/api/maquinas/tipos', async () => ({
    ok: true,
    tipos: resumenDeTipos(),
  }))

  fastify.get('/api/maquinas', async () => {
    const maquinas = await gestorMaquinas.listar()
    return { ok: true, cuantas: maquinas.length, maquinas: maquinas.map(conCapacidades) }
  })

  fastify.get(
    '/api/maquinas/:id',
    { schema: { params: MaquinaParamsSchema } },
    async (request, reply) => {
      const maquina = await gestorMaquinas.obtener(request.params.id)
      if (!maquina) {
        return responderError(
          reply, 404, CODIGOS.ERROR_MAQUINA_NO_ENCONTRADA,
          `No hay ninguna máquina configurada con el id "${request.params.id}".`
        )
      }
      return { ok: true, maquina: conCapacidades(maquina) }
    }
  )

  /**
   * ── ¿SIGUE SIENDO CIERTA ESTA CONFIGURACIÓN? (Plan 33 F8) ─────────
   *
   * Contrasta sus puntos contra ICONICS y anota el resultado.
   *
   * ── POR QUÉ ES POST Y NO GET ──────────────────────────────────────
   *
   * Porque MODIFICA: guarda el estado y la fecha de revisión en
   * `maquinas.json`. Un GET que escriba es el tipo de ruta que alguien acaba
   * llamando desde un sondeo o un prefetch del navegador, y entonces cada
   * carga de la pantalla saldría a leer los 73 puntos de cada máquina.
   *
   * ── POR QUÉ BAJO DEMANDA Y NO EN CADA LECTURA ─────────────────────
   *
   * Porque comprobar cuesta una lectura completa de la máquina, y el limitador
   * corta en 300 peticiones por minuto y por IP. Verificar al pintar la lista
   * pondría a la pantalla de configuración a competir con el sondeo del
   * tablero por el mismo presupuesto.
   *
   * Sin rol: es una LECTURA de la planta, como `/api/iconics/data`. Lo que
   * escribe es nuestro propio archivo de configuración, no la instalación.
   */
  fastify.post(
    '/api/maquinas/:id/verificar',
    { schema: { params: MaquinaParamsSchema } },
    async (request, reply) => {
      const maquina = await gestorMaquinas.obtener(request.params.id)
      if (!maquina) {
        return responderError(
          reply, 404, CODIGOS.ERROR_MAQUINA_NO_ENCONTRADA,
          `No hay ninguna máquina configurada con el id "${request.params.id}".`
        )
      }

      /*
       * Sin cliente no se inventa un veredicto: se dice que no se pudo mirar.
       * Es `UNKNOWN`, que es exactamente lo que significa — y NO se anota, para
       * no pisar con «no pude comprobar» un `VALID` de ayer que sigue siendo la
       * mejor información disponible.
       */
      if (!client) {
        return {
          ok: true,
          estado: ESTADO_CONFIGURACION.UNKNOWN,
          motivo:
            'Este servidor no tiene cliente de ICONICS, así que no se puede comprobar si los ' +
            'puntos siguen existiendo.',
          anotado: false,
        }
      }

      const resultado = await verificarMaquina(maquina, {
        leerPuntos: (puntos) => client.readPoints(puntos),
      })

      /*
       * ── UN `UNKNOWN` NO PISA LO QUE YA SE SABÍA ────────────────────
       *
       * Si no se pudo mirar, lo anterior sigue siendo la mejor información que
       * hay. Guardar `UNKNOWN` encima de un `VALID` de ayer perdería un dato
       * cierto a cambio de uno que sólo dice «hubo un corte de red».
       *
       * Sí se devuelve al cliente: quien pidió la comprobación tiene derecho a
       * saber que no salió.
       */
      const anotar = resultado.estado !== ESTADO_CONFIGURACION.UNKNOWN

      if (anotar) {
        await gestorMaquinas.anotarRevision(maquina.id, {
          estado: resultado.estado,
          variables: resultado.variables,
        })
      }

      request.log.info(
        {
          maquina: maquina.id,
          estado: resultado.estado,
          ausentes: resultado.resumen.ausentes,
          total: resultado.resumen.total,
        },
        `Comprobada «${maquina.id}» contra ICONICS: ${resultado.estado} ` +
          `(${resultado.resumen.presentes}/${resultado.resumen.total} puntos)`
      )

      return {
        ok: true,
        estado: resultado.estado,
        motivo: resultado.motivo,
        resumen: resultado.resumen,
        /* Sólo las que faltan: devolver las 73 para decir que 70 están bien es
           mandar ruido a una pantalla que va a pintar las 3 que importan. */
        ausentes: resultado.variables
          .filter((v) => v.estado === ESTADO_CONFIGURACION.INVALID)
          .map((v) => ({ id: v.id, pointName: v.pointName })),
        anotado: anotar,
      }
    }
  )

  /* ── Escritura ────────────────────────────────────────────────────── */

  /**
   * Da de alta una máquina.
   *
   * ── POR QUÉ LOS PROBLEMAS VIAJAN COMO LISTA ────────────────────
   *
   * Porque van a una pantalla que tiene que señalar el campo. Un 400 con una
   * frase suelta obliga a quien la rellena a adivinar cuál de los seis pasos
   * está mal, y la vista acabaría reimplementando la validación para saberlo —
   * que es cómo nacen las dos copias de una misma regla.
   */
  fastify.post(
    '/api/maquinas',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('administrador')],
      schema: { body: CrearMaquinaSchema },
    },
    async (request, reply) => {
      const resultado = await gestorMaquinas.crear(request.body)

      if (!resultado.ok) {
        return responderError(
          reply, 400, CODIGOS.ERROR_MAQUINA_INVALIDA,
          'La configuración de la máquina no está completa.',
          { problemas: resultado.problemas }
        )
      }

      request.log.info(
        {
          maquina: resultado.maquina.id,
          tipo: resultado.maquina.tipo,
          variables: resultado.maquina.variables.length,
          usuario: request.usuario?.id,
        },
        `Máquina configurada: ${resultado.maquina.id} (${resultado.maquina.variables.length} variables)`
      )

      /* Los avisos viajan en una alta correcta: son lo que la máquina tendrá
         que confesar —reglas que no podrá evaluar—, no errores. */
      return reply.code(201).send({
        ok: true,
        maquina: conCapacidades(resultado.maquina),
        avisos: resultado.avisos ?? [],
      })
    }
  )

  fastify.patch(
    '/api/maquinas/:id',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('administrador')],
      schema: { params: MaquinaParamsSchema, body: EditarMaquinaSchema },
    },
    async (request, reply) => {
      const resultado = await gestorMaquinas.editar(request.params.id, request.body)

      if (resultado.noExiste) {
        return responderError(
          reply, 404, CODIGOS.ERROR_MAQUINA_NO_ENCONTRADA,
          `No hay ninguna máquina configurada con el id "${request.params.id}".`
        )
      }
      if (!resultado.ok) {
        return responderError(
          reply, 400, CODIGOS.ERROR_MAQUINA_INVALIDA,
          'La configuración de la máquina no está completa.',
          { problemas: resultado.problemas }
        )
      }

      request.log.info(
        { maquina: request.params.id, usuario: request.usuario?.id },
        `Configuración actualizada: ${request.params.id}`
      )

      return {
        ok: true,
        maquina: conCapacidades(resultado.maquina),
        avisos: resultado.avisos ?? [],
      }
    }
  )

  /**
   * Da de baja una máquina.
   *
   * ── DESACTIVAR NO ES BORRAR, Y AQUÍ IMPORTA LA DIFERENCIA ──────
   *
   * Los casos previos guardan `sistema: "<id>"`. Borrar una máquina con
   * historia dejaría esas intervenciones apuntando a un sistema que el backend
   * no reconoce, y `purgar-casos-invalidos.mjs` las daría por inválidas.
   *
   * Es la misma decisión que se tomó al cerrar la estación de llenado, con su
   * motivo escrito en `sistemas.js`: **ocultar una máquina no puede invalidar
   * su historia — eso no es cerrarla, es borrarla.**
   *
   * Quién cuenta los casos entra por la puerta (`contarCasosDe`) en vez de que
   * esta ruta consulte el índice: sin esa inyección, registrar el CRUD
   * obligaría a tener el motor de casos montado, y una ruta de configuración
   * no debería necesitar el motor entero para existir.
   */
  fastify.delete(
    '/api/maquinas/:id',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('administrador')],
      schema: { params: MaquinaParamsSchema },
    },
    async (request, reply) => {
      const { id } = request.params

      /*
       * Sin contador no se asume cero: cero autoriza a BORRAR, y asumirlo
       * convertiría una dependencia no cableada en pérdida de historia. Ante la
       * duda, se desactiva — el error barato.
       */
      const casosAsociados = contarCasosDe ? await contarCasosDe(id) : 1

      const resultado = await gestorMaquinas.eliminar(id, { casosAsociados })

      if (resultado.noExiste) {
        return responderError(
          reply, 404, CODIGOS.ERROR_MAQUINA_NO_ENCONTRADA,
          `No hay ninguna máquina configurada con el id "${id}".`
        )
      }

      request.log.info(
        { maquina: id, desactivada: resultado.desactivada, casos: casosAsociados, usuario: request.usuario?.id },
        resultado.desactivada
          ? `Máquina ${id} desactivada: tiene ${casosAsociados} caso(s) que la nombran`
          : `Máquina ${id} eliminada`
      )

      return {
        ok: true,
        desactivada: resultado.desactivada,
        casosAsociados,
        /* Que la respuesta DIGA por qué no se borró: un 200 que promete un
           borrado y deja la máquina en disco sería el peor silencio de esta
           ruta. */
        ...(resultado.desactivada
          ? {
            motivo:
                `No se borró porque ${casosAsociados} caso(s) previo(s) la nombran. Queda ` +
                'desactivada: deja de verse, y su historia sigue siendo válida.',
          }
          : {}),
      }
    }
  )
}
