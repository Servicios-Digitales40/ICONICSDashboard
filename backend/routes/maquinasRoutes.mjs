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
 * ── QUIÉN LAS CONSUME HOY ──────────────────────────────────────────
 *
 * Nacieron sin consumidor (Plan 33 F2: «una fase de persistencia que además
 * cambie lo que el programa hace no se podría distinguir de una regresión»).
 * Hoy las lee el registro (`construirSistema`, F3) y las llama la pantalla de
 * `Planta › Configuración`: la lista y la ficha desde el Plan 33 F5, y el alta
 * y la edición marcando el árbol desde el Plan 36.
 *
 * **La forma de la máquina no es lo único que se comprueba.** Que sus puntos
 * sigan existiendo lo contesta `/verificar` (Plan 33 F8); que sus series sean
 * de verdad suyas, `/sondear` (Plan 34 F2). Una máquina recién guardada está
 * `UNKNOWN`, que es exactamente lo que significa: nadie ha mirado todavía.
 *
 * ── POR QUÉ `exigirRol` VA RUTA POR RUTA Y `autenticar` NO ─────────
 *
 * `autenticar` la aplica el ámbito en `app.mjs` desde el Plan 20 F5: la
 * llevaban trece de treinta y tres rutas, y olvidarla en la siguiente no rompía
 * nada visible. `exigirRol` sí se declara aquí porque es donde hay criterio —
 * quién puede configurar una máquina no es la misma pregunta que quién puede
 * verla (`CLAUDE.md` §2.11).
 *
 * ── LO QUE PROTEGE EL ROL, Y LO QUE SIGUE SIN PODERSE HACER ───────
 *
 * Este bloque decía «`AUTH_HABILITADA=false`: los roles no protegen nada». El
 * Plan 35 la encendió (21-09-2026) y todo `/api/maquinas` pide
 * `administrador`. Estas rutas escriben configuración, no planta: ninguna
 * puede mover un actuador. Pero **marcar una variable como escribible sí es
 * una decisión con consecuencias**, y por eso sigue fuera de la pantalla de
 * configuración (Plan 36 §5): el esquema la acepta por la API, la pantalla no
 * la ofrece, y `WRITABLE_VARIABLES` nunca se deriva (Plan 33 §20).
 */
import {
  CrearMaquinaSchema,
  DescubrirMaquinaSchema,
  EditarMaquinaSchema,
  MaquinaParamsSchema,
} from '../http/esquemas.mjs'
import { CODIGOS } from '../http/codigos.mjs'
import {
  ESTADO_CONFIGURACION,
  capacidadesDe,
} from '../../shared/eva/comun/configuracionMaquina.js'
import { construirSistema } from '../../shared/eva/comun/construirSistema.js'
import { verificarMaquina } from '../lib/verificarConfiguracion.mjs'
import { descubrirAlarmas, descubrirVariables } from '../lib/descubrirDesdeArbol.mjs'
import { sondearSeries } from '../lib/sondearSeries.mjs'
import { resumenDeTipos, tipoDe } from '../../shared/eva/tipos/index.js'

/**
 * Una máquina tal como sale por HTTP: su configuración más lo que se DERIVA de
 * ella.
 *
 * Las capacidades no se guardan en disco y no se mandan desde el cliente: se
 * calculan aquí a partir de la configuración y del tipo. Guardarlas sería
 * tener dos versiones de la misma verdad, y la almacenada se quedaría vieja en
 * cuanto alguien editara una variable.
 *
 * ── LAS LIMITACIONES TAMBIÉN SE DERIVAN (Plan 34 F4) ───────────────
 *
 * Y hasta el 21-09-2026 **no salían por aquí**. El defecto se destapó dando de
 * alta una máquina desde el árbol con variables que el tipo no reconoce: la
 * API contestó `capacidades: [..., "DIAGNOSTICS"]` con **cero roles
 * requeridos cubiertos**, y sin una sola línea que lo dijera.
 *
 * Eso es exactamente lo que `construirSistema` evita cuando registra la
 * máquina —«el asistente diría "no hay riesgos" de una máquina cuyas reglas
 * nunca se evaluaron»— pero quien consulta la API veía otra cosa. Dos
 * versiones de la misma verdad, que es lo que el párrafo de arriba prohíbe
 * para las capacidades y valía igual para esto.
 *
 * Se derivan del mismo sitio que el registro, no de una copia: se construye la
 * entrada y se le piden sus `limitaciones`. Un tipo desconocido no puede
 * construirse, y entonces viajan las declaradas a mano y nada más.
 */
const conCapacidades = maquina => {
  const tipo = tipoDe(maquina.tipo)

  let limitaciones = maquina.limitaciones ?? []
  if (tipo) {
    try {
      limitaciones = construirSistema(maquina, tipo).limitaciones
    } catch {
      /* Una configuración que no se puede construir es un problema, pero NO
         de esta función: `problemasDeMaquina` ya lo dice al guardarla. Aquí
         se devuelven las declaradas y no se inventa el resto. */
    }
  }

  return {
    ...maquina,
    capacidades: capacidadesDe(maquina, tipo),
    limitaciones,
  }
}

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
  fastify.get(
    '/api/maquinas/tipos',
    { onRequest: [fastify.autenticar, fastify.exigirRol('administrador')] },
    async () => ({ ok: true, tipos: resumenDeTipos() })
  )

  /**
   * ── LAS DOS LECTURAS LAS PUEDE HACER UN `visualizador` (Plan 37 F1) ─
   *
   * Hasta el 21-09-2026 todo `/api/maquinas` pedía `administrador` (Plan 35
   * F2): el panel de administración es suyo. Pero el TABLERO de una máquina
   * configurada —sus vistas de Inicio, Gráficas, 3D— lo mira cualquiera con
   * sesión, y para pintarlo hace falta saber qué puntos leer: eso es su
   * configuración. Sin esta lectura, un operador vería la sección de la
   * máquina en el menú y una pantalla que no puede cargar nada.
   *
   * Lo que se expone son nombres de punto y roles, y los nombres de punto ya
   * los puede recorrer un visualizador con `GET /api/iconics/browse`. Las
   * escrituras —alta, edición, baja, comprobar, sondear— siguen siendo del
   * administrador: leer qué máquinas hay no es lo mismo que decidirlas.
   */
  fastify.get(
    '/api/maquinas',
    { onRequest: [fastify.autenticar, fastify.exigirRol('visualizador')] },
    async () => {
      const maquinas = await gestorMaquinas.listar()
      return { ok: true, cuantas: maquinas.length, maquinas: maquinas.map(conCapacidades) }
    }
  )

  fastify.get(
    '/api/maquinas/:id',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('visualizador')],
      schema: { params: MaquinaParamsSchema },
    },
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
   * ── SU ROL MÍNIMO ES `administrador` (Plan 35 F2) ─────────────────
   *
   * Aquí decía «sin rol: es una LECTURA de la planta, como
   * `/api/iconics/data`». Eso describe lo que la ruta HACE, y el criterio de
   * esta fase es otro: **dónde vive** la acción. Comprobar una configuración
   * es trabajo del panel de administración, igual que darla de alta o
   * sondearla, y quien no puede configurar una máquina tampoco tiene por qué
   * poder lanzar una lectura de sus 73 puntos.
   */
  fastify.post(
    '/api/maquinas/:id/verificar',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('administrador')],
      schema: { params: MaquinaParamsSchema },
    },
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

  /**
   * Propone las variables de una máquina recorriendo el árbol de ICONICS.
   *
   * ── POR QUÉ NO ESCRIBE NADA ────────────────────────────────────
   *
   * Porque lo que devuelve es una PROPUESTA, no una configuración. Quien la
   * revisa decide qué entra, corrige los emparejamientos que el nombre no
   * resolvió y la guarda con el `POST /api/maquinas` de siempre.
   *
   * Guardarla aquí «para ahorrar un paso» daría de alta una máquina que nadie
   * ha mirado, con los roles que un algoritmo propuso — y una variable mal
   * emparejada no da error: da una pantalla que enseña la señal equivocada
   * con el rótulo correcto (`CLAUDE.md` §2.5).
   *
   * Es un POST porque lleva tres rutas en el cuerpo, no porque escriba.
   */
  fastify.post(
    '/api/maquinas/descubrir',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('administrador')],
      schema: { body: DescubrirMaquinaSchema },
    },
    async (request, reply) => {
      if (!client) {
        return responderError(
          reply, 503, CODIGOS.ERROR_ICONICS_NO_CONFIGURADO,
          'Este servidor no tiene cliente de ICONICS, así que no puede recorrer el árbol.'
        )
      }

      const { raizEnVivo, raizHistorico, areaAlarmas, tipo: tipoId } = request.body

      /* Un tipo inventado se rechaza en vez de descubrir sin roles y callar:
         quien pidió roles tiene que saber que no los va a recibir. */
      const tipo = tipoId ? tipoDe(tipoId) : null
      if (tipoId && !tipo) {
        return responderError(
          reply, 400, CODIGOS.ERROR_VALIDACION,
          `No existe ningún tipo de máquina "${tipoId}".`
        )
      }

      const explorar = (ruta) => client.browse(ruta)

      const hallazgo = await descubrirVariables(
        { raizEnVivo, raizHistorico: raizHistorico ?? null, tipo },
        { explorar },
      )

      /* Las alarmas son su propio espacio (`ae:`) y se piden aparte: lo que
         cuelga de un área no se lee igual ni significa lo mismo. */
      const alarmas = areaAlarmas
        ? await descubrirAlarmas(areaAlarmas, { explorar })
        : null

      request.log.info(
        { raizEnVivo, raizHistorico, areaAlarmas, ...hallazgo.resumen },
        `Descubiertas ${hallazgo.resumen.enVivo} variables en vivo bajo «${raizEnVivo}»`
      )

      return {
        ok: true,
        estado: hallazgo.estado,
        motivo: hallazgo.motivo,
        resumen: hallazgo.resumen,
        variables: hallazgo.variables,
        sinEmparejar: hallazgo.sinEmparejar,
        fallos: hallazgo.fallos,
        alarmas,
      }
    }
  )

  /**
   * Sondea las series de una máquina ya guardada y anota qué está verificado.
   *
   * ── POR QUÉ ESTE SÍ ANOTA, Y EL DE DESCUBRIR NO ────────────────
   *
   * Porque aquí no hay nada que decidir: la serie es de esta variable o es la
   * de otra, y eso lo dice el servidor comparando, no una persona mirando. Lo
   * que se guarda es el resultado de una medición.
   *
   * Y como toda medición, **puede no salir**. Una variable que no se pudo leer
   * conserva su marca anterior en vez de bajar a `false`: un corte de red no
   * puede borrar una verificación que sí se hizo (`UNKNOWN` ≠ `INVALID`).
   */
  fastify.post(
    '/api/maquinas/:id/sondear',
    {
      onRequest: [fastify.autenticar, fastify.exigirRol('administrador')],
      schema: { params: MaquinaParamsSchema },
    },
    async (request, reply) => {
      const maquina = await gestorMaquinas.obtener(request.params.id)
      if (!maquina) {
        return responderError(
          reply, 404, CODIGOS.ERROR_MAQUINA_NO_ENCONTRADA,
          `No hay ninguna máquina configurada con el id "${request.params.id}".`
        )
      }

      if (!client) {
        return {
          ok: true,
          estado: ESTADO_CONFIGURACION.UNKNOWN,
          motivo:
            'Este servidor no tiene cliente de ICONICS, así que no se pueden pedir las series.',
          anotado: false,
        }
      }

      /*
       * Siete días. Es la ventana que el historiador contesta —a treinta
       * devuelve vacío SIN dar error, medido en las dos máquinas— y la que da
       * margen para que una señal haya variado, que es lo que hace falta para
       * distinguir dos series.
       */
      const hasta = new Date()
      const desde = new Date(hasta.getTime() - 7 * 24 * 3600 * 1000)

      const resultado = await sondearSeries(maquina, {
        leerSerie: (opciones) => client.readHistory(opciones),
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
      })

      /*
       * Se anotan las variables con su `historyVerified` nuevo, pero NO el
       * estado de la máquina: el sondeo dice si sus series son suyas, no si su
       * configuración sigue siendo cierta. Eso lo contesta `/verificar`, y
       * pisarlo aquí mezclaría dos preguntas distintas.
       */
      const variables = resultado.variables.length
        ? maquina.variables.map((v) => {
            const sondeada = resultado.variables.find((s) => s.id === v.id)
            if (!sondeada) return v
            /* `undefined` es «no se tocó»: conserva lo que hubiera. */
            return sondeada.historyVerified === undefined
              ? v
              : { ...v, historyVerified: sondeada.historyVerified }
          })
        : null

      if (variables) {
        await gestorMaquinas.anotarRevision(maquina.id, {
          estado: maquina.estado ?? ESTADO_CONFIGURACION.UNKNOWN,
          variables,
        })
      }

      request.log.info(
        { maquina: maquina.id, ...resultado.resumen },
        `Sondeadas las series de «${maquina.id}»: ${resultado.resumen.verificadas} de ` +
          `${resultado.resumen.total} verificadas`
      )

      return {
        ok: true,
        estado: resultado.estado,
        motivo: resultado.motivo,
        resumen: resultado.resumen,
        /* Sólo lo que NO quedó verificado: mandar las 36 para señalar las 17
           que importan es ruido en una pantalla que va a pintar ésas. */
        pendientes: resultado.variables
          .filter((v) => v.historyVerified !== true)
          .map((v) => ({
            id: v.id,
            causa: v.sondeo.causa,
            motivo: v.sondeo.motivo,
            compartidaCon: v.sondeo.compartidaCon ?? null,
          })),
        anotado: Boolean(variables),
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
