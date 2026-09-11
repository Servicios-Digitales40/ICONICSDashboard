/**
 * backend/ia/herramientas/maquina/index.mjs
 * ------------------------------------------------------------------
 * Las tres herramientas que hablan de UNA máquina en el instante: cómo está,
 * qué riesgos tiene, y —sólo en el tanque— encenderla o apagarla.
 *
 * ── QUÉ LAS HACE UNA FAMILIA ───────────────────────────────────────
 *
 * Que las tres parten de la misma secuencia: resolver de qué máquina se habla,
 * leerla del servidor y proyectarla a la forma común. Ninguna toca el
 * historiador — eso es la familia `historicos/` — y todas se apoyan en los
 * ayudantes de `lib/maquina.mjs`.
 *
 * ── `sistema` ES OBLIGATORIO, Y NO ES CEREMONIA ────────────────────
 *
 * `estado_del_sistema` y `riesgos_activos` sirven a cualquier máquina del
 * registro y exigen que se diga cuál, sin valor por defecto. El defecto tendría
 * que ser el tanque, y entonces una pregunta sobre otra máquina a la que el
 * modelo olvidara el argumento se contestaría CORRECTAMENTE SOBRE LA MÁQUINA
 * EQUIVOCADA: cifras reales, unidades reales y ni un error en el log. Fallar
 * cuesta un turno y se corrige solo — el error trae la lista de ids.
 *
 * ── LA ÚNICA QUE ESCRIBE EN LA PLANTA ──────────────────────────────
 *
 * `controlar_bomba`, y por eso vive aquí con sus dos guardas propias:
 * `ICONICS_READ_ONLY` y el nivel del tanque. Es la razón de que esta familia
 * reciba `readOnly` además del `client`. No se puede parametrizar por sistema
 * como las otras dos: escribir en el PLC de una máquina que no se ha modelado
 * no es una capacidad que se herede, es un accidente que se provoca.
 */
import { SISTEMA } from '../../../../shared/eva/comun/sistemas.js'
import { UMBRALES } from '../../../../shared/eva/comun/umbrales.js'
import { toBooleano } from '../../../../shared/eva/tanque/sistema.js'
import { fallo } from '../lib/respuesta.mjs'
/* Para avisar de que el diario no pudo escribir (Plan 23 F6). No se propaga el
   fallo —cuando se anota, la bomba ya se accionó— pero tampoco se traga: un
   diario que dejó de escribir sin que nadie se entere es el mismo problema que
   no tenerlo, descubierto más tarde. */
import { logger } from '../../../logger.mjs'
/*
 * `agruparPorRegla` sigue en `herramientas.mjs`: la usan también las de
 * históricos, y sacarla es parte de la limpieza que queda cuando el
 * ensamblador se quede sólo con lo que ensambla.
 */
import { agruparPorRegla, horaLocal, redondear } from '../../conversacion/herramientas.mjs'

/**
 * Punto de control de la bomba: no es una señal del catálogo, así que vive
 * aparte y no sale de `RAIZ` de `senales.js` (que ya no es una sola cadena,
 * ver Plan 27 F1).
 *
 * **Se movió el 09-09-2026** (Plan 27): vivía en `SENSORES/CONTROL`, y planta
 * lo trasladó a `SEGURIDAD/CONTROL`, junto al paro de emergencia — es el
 * mando de mayor alcance del árbol, y ahí es donde corresponde. La ruta
 * vieja sigue devolviendo `ok: true` con calidad mala (`2147483652`, no
 * `value`) en vez de un error: es exactamente el punto fantasma que
 * `shared/quality.js` existe para no dejar pasar como una lectura válida.
 */
const TAG_CONTROL_BOMBA = 'ac:TDCON/DEMO/SEGURIDAD/CONTROL'

/*
 * ── LA RELECTURA DE CONFIRMACIÓN SE MUDÓ AL CLIENTE (Plan 21 F5) ────
 *
 * Aquí vivían `INTENTOS_RELECTURA_CONTROL`, `ESPERA_RELECTURA_CONTROL_MS`, un
 * `esperar()` y el bucle que los usaba. Fueron lo primero que necesitó
 * confirmar una escritura, y por eso se midieron aquí — pero el problema no es
 * de la bomba: es de CUALQUIER escritura, porque un `ok: true` del servidor
 * dice que aceptó la petición y no que el PLC tomara el valor.
 *
 * Desde F5 lo hace `client.writePoint()`, que devuelve `confirmacion` con lo
 * pedido, lo leído y si coinciden. Los números viajaron con su medición a
 * `writeConfirmIntentos` en `config.mjs`.
 *
 * Lo que se queda aquí es lo que SÍ es de la bomba: las dos guardas (solo
 * lectura, nivel de tanque) y la decisión de que una escritura sin confirmar
 * sea un error. El cliente informa; quién lo trata como fallo depende de la
 * consecuencia, y una bomba que se cree encendida y no lo está la tiene.
 */

/**
 * Las tres herramientas de máquina.
 *
 * @param {object} args
 * @param {object}  args.client    cliente de ICONICS (sólo lo usa controlar_bomba)
 * @param {boolean} args.readOnly  si está en true, ninguna escritura sale
 * @param {object}  args.maquina   ayudantes de `lib/maquina.mjs`
 */
export function crearHerramientasDeMaquina({ client, readOnly, maquina, diario = null }) {
  const { leerMaquina, resolverSistema, evaluarRiesgosDe } = maquina

  /**
   * Anota el accionamiento en el diario, si lo hay (Plan 23 F6 · IA-10).
   *
   * ── POR QUÉ ESTO FALTABA, Y POR QUÉ IMPORTA ────────────────────────
   *
   * Hasta hoy sólo anotaba `controlRoutes.mjs`, el botón del tablero. Una
   * bomba encendida DESDE EL CHAT no dejaba rastro en el diario que existe
   * justo para contestar «¿qué se le hizo a la instalación?» meses después: el
   * mismo accionamiento, sobre el mismo tag, con las mismas consecuencias,
   * constaba o no según por qué puerta hubiera entrado.
   *
   * `origen` es lo que distingue las dos puertas. El botón anota `ip` y
   * `usuario` porque tiene un `request` delante; aquí no hay ninguno —la
   * herramienta corre dentro del bucle del modelo y no sabe quién preguntó, ni
   * tiene por qué—, así que se marca el CANAL. Quien lea el diario dentro de
   * seis meses necesita saber que aquello lo pidió alguien hablando con el
   * asistente y no pulsando un botón, porque son dos conversaciones distintas
   * las que hay que ir a buscar.
   *
   * No lanza y no cambia lo que se devuelve: cuando se anota, la bomba YA se
   * accionó. Mismo criterio que la cabecera de `lib/diario.mjs`.
   */
  async function anotarAccionamiento(entrada, yaAnota) {
    /*
     * ── POR QUÉ PUEDE HABER QUIEN ANOTE POR NOSOTROS ───────────────────
     *
     * Porque el botón del tablero **pasa por esta misma función**: su ruta
     * llama a `ejecutar('controlar_bomba', …)` para no duplicar las dos
     * guardas ni la relectura (ver la cabecera de `controlRoutes.mjs`). Al
     * añadir aquí la anotación, cada pulsación del botón dejaba DOS líneas: la
     * suya, con `ip` y `usuario`, y la nuestra marcada como `asistente` —que
     * es falso, porque nadie habló con el asistente—.
     *
     * Un diario que duplica es malo; uno que miente sobre el canal es peor,
     * porque manda a buscar una conversación que no existe. Así que quien
     * tiene el `request` delante anota él —sabe quién fue— y nos lo dice.
     */
    if (yaAnota || !diario) return
    const { ok, error } = await diario.anotar({ origen: 'asistente', ...entrada })
    if (!ok) {
      logger.error(
        `No se pudo anotar en el diario el accionamiento pedido por el asistente: ${error}. ` +
          'La orden SÍ se ejecutó; lo que falta es su constancia en disco. Revisa permisos y ' +
          'espacio en `datos/`.',
        { error }
      )
    }
  }

  return {
    /**
     * ── LOS RIESGOS DE CUALQUIER MÁQUINA ───────────────────────────────
     *
     * Cada sistema trae su motor de reglas: el tanque cruza nivel, caudal y
     * carga; vibraciones cruza apoyos, norma ISO y estado del módulo. Lo que
     * comparten es la FORMA del resultado —activos, no evaluables, evidencia
     * separada de la hipótesis—, y sobre esa forma se escribe esta herramienta
     * una sola vez.
     *
     * `sin_comprobar` NO es relleno: una regla que no se pudo evaluar y una que
     * se evaluó y no se cumple salen las dos en verde si sólo se cuentan las
     * activas. En una máquina que puede quedarse muda —y las dos pueden— esa
     * diferencia es la respuesta entera.
     */
    async riesgos_activos({ sistema } = {}) {
      const elegido = resolverSistema(sistema)
      if (!elegido.ok) return elegido

      const lectura = await leerMaquina(elegido.sistema)
      if (!lectura.ok) {
        return fallo(
          `No se pudo leer «${elegido.sistema.nombre}» del servidor ICONICS: ${lectura.error}`
        )
      }

      const estado = lectura.estado
      const r = evaluarRiesgosDe(elegido.sistema, estado)
      const mudos = estado.sinLectura.length

      /*
       * ── SIN MOTOR DE REGLAS SE FALLA, NO SE CONTESTA EN VERDE ──────
       *
       * `evaluarRiesgosDe` tiene un `default` para la máquina que todavía no
       * ha enchufado el suyo, y devuelve `{ activos: [], noEvaluables: [],
       * evaluadas: 0 }`. Con eso, esta respuesta salía `ok: true`, con la
       * lista de riesgos vacía y —lo peor— `sin_comprobar: "ninguna: se
       * pudieron evaluar todas las reglas"`, que es FALSO: no se evaluó
       * ninguna. La salvaguarda del `aviso` tampoco entraba, porque pide
       * `noEvaluables.length > 0` y ahí está vacío.
       *
       * El `evaluadas: 0` es visible para quien lea el JSON; el modelo lee la
       * frase en prosa, que afirma lo contrario. Es el mismo fallo que el
       * registro existe para impedir —una máquina que contesta y no dice
       * nada— un piso más arriba: aquí no sale `value: null` con calidad
       * buena, sale «sin riesgos» con la afirmación de que se pudo mirar todo.
       *
       * Fallar cuesta un turno y es corregible; una máquina en verde que nadie
       * evaluó se cree, y no se corrige nunca.
       */
      if (r.evaluadas === 0) {
        return fallo(
          `«${elegido.sistema.nombre}» no tiene motor de reglas de riesgo enchufado, así que NO ` +
            'se ha evaluado ninguna. NO digas que no tiene riesgos: nadie ha mirado. Puedes dar ' +
            `su estado de AHORA con estado_del_sistema(sistema="${elegido.sistema.id}").`,
          { sistema: elegido.sistema.id, reglas_evaluadas: 0 }
        )
      }

      return {
        ok: true,
        sistema: elegido.sistema.nombre,
        maquina: elegido.sistema.maquina,
        fuente: 'tiempo real',
        momento: lectura.receivedAt,
        reglas_evaluadas: r.evaluadas,
        /* Agrupados por regla: las de ámbito de canal se evalúan una vez por
           apoyo, y cuando la causa es común salen tres entradas casi idénticas.
           En el tanque, donde todas son de máquina, agrupar no cambia nada. */
        riesgos: agruparPorRegla(r.activos),
        sin_comprobar:
          r.noEvaluables.length === 0
            ? 'ninguna: se pudieron evaluar todas las reglas'
            : `${r.noEvaluables.length} no se pudieron evaluar por falta de lecturas: ` +
              [...new Set(r.noEvaluables.map((x) => x.titulo))].slice(0, 4).join('; '),
        ...(mudos > 0
          ? {
            puntos_sin_lectura: `${mudos} de ${estado.puntosPedidos} puntos no entregan lectura ahora mismo.`,
          }
          : {}),
        aviso:
          (r.activos.length === 0 && r.noEvaluables.length > 0
            ? 'NO digas que no hay riesgos: hay reglas que no se pudieron evaluar por falta de ' +
              'lecturas. «Sin riesgos detectados» y «no se pudo mirar» son cosas distintas. '
            : '') +
          'Estas reglas las evalúa el tablero cruzando señales, NO son alarmas del servidor ' +
          'ICONICS. ' +
          (elegido.sistema.limitaciones?.[0] ?? ''),
      }
    },

    /**
     * ── UNA HERRAMIENTA PARA TODAS LAS MÁQUINAS ────────────────────────
     *
     * Antes eran dos —`estado_del_sistema` para el tanque y
     * `estado_de_vibraciones` para la otra— y esa asimetría explicaba el resto:
     * el tanque tenía ocho herramientas y vibraciones una, porque cada una
     * estaba escrita contra la forma de dominio de una máquina concreta.
     *
     * Con diez máquinas serían diez herramientas casi idénticas en el contexto
     * del modelo, y eso no es sólo feo: un modelo local elige peor cuál llamar
     * cuando hay veinte descripciones que se parecen. La calidad de las
     * respuestas caería por un motivo que no tiene nada que ver con los datos.
     *
     * Lo que NO se unificó es cómo se cuenta cada máquina: eso lo declara su
     * entrada del registro (`resumen`), porque lo que un modelo pequeño
     * necesita para no equivocarse depende del catálogo que tenga delante. Ver
     * la cabecera de `estadoVibraciones.js`.
     */
    async estado_del_sistema({ sistema } = {}) {
      const elegido = resolverSistema(sistema)
      if (!elegido.ok) return elegido

      const lectura = await leerMaquina(elegido.sistema)
      if (!lectura.ok) {
        return fallo(
          `No se pudo leer «${elegido.sistema.nombre}» del servidor ICONICS: ${lectura.error}`
        )
      }

      const estado = lectura.estado

      /* Los riesgos van dentro del estado y no en una segunda llamada: son la
         mitad de la respuesta a «¿cómo está?», y pedirlos aparte costaba un
         turno que el modelo casi nunca daba. */
      const riesgos = evaluarRiesgosDe(elegido.sistema, estado)

      return {
        ok: true,
        ...elegido.sistema.resumen(estado, {
          riesgos,
          agrupar: agruparPorRegla,
          horaLocal: horaLocal(lectura.receivedAt),
        }),
      }
    },

    /**
     * Enciende o apaga la bomba escribiendo en `TAG_CONTROL_BOMBA`.
     *
     * La única función de este archivo que escribe. Dos guardas, en orden: ver
     * la cabecera del archivo. La del nivel sólo se aplica al ENCENDIDO — apagar
     * la bomba nunca puede desbordar el tanque, así que no se retrasa.
     */
    async controlar_bomba({ encender } = {}, { yaAnota = false } = {}) {
      if (typeof encender !== 'boolean') {
        /*
         * Ésta NO se anota, y es la única que no.
         *
         * Las demás salidas son órdenes que alguien dio y el puente rechazó —y
         * eso interesa—. Ésta es una llamada mal formada: no llegó a decir si
         * encender o apagar, así que no hubo orden que registrar. Anotarla
         * llenaría el diario de intentos del modelo que no son intentos sobre
         * la instalación. Mismo criterio que en `controlRoutes.mjs`, donde el
         * cuerpo vacío lo rechaza el esquema antes de llegar a la ruta y por
         * eso tampoco deja línea.
         */
        return fallo('Falta decir si hay que encender (true) o apagar (false) la bomba.')
      }

      const accionPedida = encender ? 'encender' : 'apagar'

      if (readOnly) {
        const motivo =
          'El puente ICONICS está en modo solo lectura (ICONICS_READ_ONLY=true), así que no puedo ' +
          'escribir en la instalación. Dile al operador que para habilitar el control tiene que ' +
          'arrancar el servidor con ICONICS_READ_ONLY=false.'
        await anotarAccionamiento({
          resultado: 'rechazada', accion: accionPedida, motivo,
        }, yaAnota)
        return fallo(motivo)
      }

      if (encender) {
        const lectura = await leerMaquina(SISTEMA.tanque)
        if (!lectura.ok) {
          const motivo =
            `No puedo comprobar el nivel del tanque antes de encender la bomba, así que no la ` +
            `enciendo: ${lectura.error}`
          await anotarAccionamiento({ resultado: 'rechazada', accion: accionPedida, motivo }, yaAnota)
          return fallo(motivo)
        }

        const nivel = lectura.estado.dominio.senales?.nivelTanque?.valor
        const u = UMBRALES.nivelTanque
        if (typeof nivel !== 'number' || !Number.isFinite(nivel)) {
          const motivo =
            'No hay una lectura válida del nivel del tanque ahora mismo, así que no enciendo la ' +
            'bomba: encenderla a ciegas podría desbordarlo.'
          await anotarAccionamiento({ resultado: 'rechazada', accion: accionPedida, motivo }, yaAnota)
          return fallo(motivo)
        }
        if (u && typeof u.avisoMax === 'number' && nivel >= u.avisoMax) {
          const motivo =
            `No enciendo la bomba: el tanque está al ${redondear(nivel, 1)} %, por encima del ` +
            `${u.avisoMax} % de aviso. Encenderla ahora arriesga desbordarlo. Espera a que baje ` +
            `el nivel o dile al operador que lo revise antes de forzarlo.`
          /* El nivel que la disparó va en la línea: sin él, dentro de seis
             meses «no la encendí por nivel alto» no se puede contrastar con lo
             que el historiador dice que había en ese momento. */
          await anotarAccionamiento({
            resultado: 'rechazada',
            accion: accionPedida,
            motivo,
            nivelTanque: redondear(nivel, 1),
          }, yaAnota)
          return fallo(motivo, { nivelTanque: redondear(nivel, 1), avisoSuperior: u.avisoMax })
        }
      }

      const r = await client.writePoint(TAG_CONTROL_BOMBA, encender)
      if (!r?.ok) {
        const motivo =
          `El servidor ICONICS no aceptó la escritura sobre la bomba: ${r?.error ?? 'error del servidor'}.`
        await anotarAccionamiento({
          resultado: 'rechazada', accion: accionPedida, tag: TAG_CONTROL_BOMBA, motivo,
        }, yaAnota)
        return fallo(motivo)
      }

      /*
       * `writePoint` ya releyó el punto y trae el veredicto: confirmar una
       * escritura sólo porque la petición HTTP no dio error sería prestarle al
       * servidor una ejecución que no ha demostrado. El porqué, los reintentos
       * y de dónde salen sus números están en `confirmarEscrituras`
       * (`iconics/client.mjs`) y en `writeConfirmIntentos` (`config.mjs`).
       *
       * Lo que decide AQUÍ es qué hacer con un «no coincide»: para la bomba es
       * un error, porque una bomba que se cree encendida y no lo está manda a
       * alguien a buscar la avería al sitio equivocado.
       */
      const valorLeido = toBooleano(r.confirmacion?.leido ?? null)

      if (!r.confirmada || valorLeido !== encender) {
        const motivo =
          `Mandé la orden de ${encender ? 'encender' : 'apagar'} la bomba y el servidor la aceptó, ` +
          `pero al releer ${TAG_CONTROL_BOMBA} sigue valiendo ${valorLeido ?? 'sin dato'} en vez de ` +
          `${encender}. La escritura no ha tenido efecto real sobre la instalación: dile al usuario ` +
          `que la orden no se aplicó y que hay que revisar la configuración de ese punto en el ` +
          `servidor ICONICS, no reintentarlo tal cual.`
        /* Ésta es de las importantes: la escritura SALIÓ hacia la planta y no
           tuvo efecto. Sin línea, el diario diría que nadie intentó nada
           cuando lo que pasó es que el punto está mal configurado. */
        await anotarAccionamiento({
          resultado: 'rechazada',
          accion: accionPedida,
          tag: TAG_CONTROL_BOMBA,
          motivo,
          valorPedido: encender,
          valorLeido,
          coinciden: false,
          intentos: r.intentos ?? null,
        }, yaAnota)
        return fallo(motivo, { valorEscrito: encender, valorLeido })
      }

      await anotarAccionamiento({
        resultado: 'cumplida',
        accion: accionPedida,
        tag: TAG_CONTROL_BOMBA,
        valorPedido: encender,
        valorLeido,
        coinciden: true,
        intentos: r.intentos ?? null,
      }, yaAnota)

      return {
        ok: true,
        accion: encender ? 'encendida' : 'apagada',
        tag: TAG_CONTROL_BOMBA,
        /*
         * La confirmación viaja también en el éxito (Plan 22 F3). Aquí arriba
         * ya se ha comprobado que coincide —si no, esto sería un `fallo`— así
         * que para el modelo no añade nada. Para el DIARIO sí: «pedí true,
         * releí true, coincide, en 2 intentos» es lo que distingue una orden
         * que la instalación aceptó a la primera de una que costó reintentos,
         * y eso es un síntoma que se lee meses después. Se produce desde el
         * Plan 21 F5 y hasta hoy se tiraba.
         */
        confirmacion: {
          pedido: encender,
          leido: valorLeido,
          coincide: true,
          intentos: r.intentos ?? null,
        },
      }
    },
  }
}
