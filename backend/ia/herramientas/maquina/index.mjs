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
/*
 * `agruparPorRegla` sigue en `herramientas.mjs`: la usan también las de
 * históricos, y sacarla es parte de la limpieza que queda cuando el
 * ensamblador se quede sólo con lo que ensambla.
 */
import { agruparPorRegla, horaLocal, redondear } from '../../conversacion/herramientas.mjs'
import { RAIZ } from '../../../../shared/eva/tanque/senales.js'

/** Punto de control de la bomba: no es una señal del catálogo, así que vive aparte. */
const TAG_CONTROL_BOMBA = `${RAIZ}CONTROL`

/**
 * Veces que se relee `CONTROL` tras escribir, y espera entre cada una.
 *
 * El tag escanea cada ~1 s (su `Scan rate` en el servidor), pero ese ciclo
 * tiene jitter (cola de escaneo, latencia de red al PLC/OPC): con 3 intentos
 * de 700 ms (1,4 s de margen total) se vieron falsos rechazos en los que la
 * bomba sí llegaba a encenderse, solo que después de que el guard ya había
 * dado la escritura por perdida. Cinco intentos con 800 ms (3,2 s de margen)
 * cubren ese jitter sin alargar demasiado la respuesta en el caso normal.
 */
const INTENTOS_RELECTURA_CONTROL = 5
const ESPERA_RELECTURA_CONTROL_MS = 800

/** Pausa async simple, para esperar entre reintentos de relectura. */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Las tres herramientas de máquina.
 *
 * @param {object} args
 * @param {object}  args.client    cliente de ICONICS (sólo lo usa controlar_bomba)
 * @param {boolean} args.readOnly  si está en true, ninguna escritura sale
 * @param {object}  args.maquina   ayudantes de `lib/maquina.mjs`
 */
export function crearHerramientasDeMaquina({ client, readOnly, maquina }) {
  const { leerMaquina, resolverSistema, evaluarRiesgosDe } = maquina

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
     * Enciende o apaga la bomba escribiendo en `ac:TDCON/DEMO/SENSORES/CONTROL`.
     *
     * La única función de este archivo que escribe. Dos guardas, en orden: ver
     * la cabecera del archivo. La del nivel sólo se aplica al ENCENDIDO — apagar
     * la bomba nunca puede desbordar el tanque, así que no se retrasa.
     */
    async controlar_bomba({ encender } = {}) {
      if (typeof encender !== 'boolean') {
        return fallo('Falta decir si hay que encender (true) o apagar (false) la bomba.')
      }

      if (readOnly) {
        return fallo(
          'El puente ICONICS está en modo solo lectura (ICONICS_READ_ONLY=true), así que no puedo ' +
            'escribir en la instalación. Dile al operador que para habilitar el control tiene que ' +
            'arrancar el servidor con ICONICS_READ_ONLY=false.'
        )
      }

      if (encender) {
        const lectura = await leerMaquina(SISTEMA.tanque)
        if (!lectura.ok) {
          return fallo(
            `No puedo comprobar el nivel del tanque antes de encender la bomba, así que no la ` +
              `enciendo: ${lectura.error}`
          )
        }

        const nivel = lectura.estado.dominio.senales?.nivelTanque?.valor
        const u = UMBRALES.nivelTanque
        if (typeof nivel !== 'number' || !Number.isFinite(nivel)) {
          return fallo(
            'No hay una lectura válida del nivel del tanque ahora mismo, así que no enciendo la ' +
              'bomba: encenderla a ciegas podría desbordarlo.'
          )
        }
        if (u && typeof u.avisoMax === 'number' && nivel >= u.avisoMax) {
          return fallo(
            `No enciendo la bomba: el tanque está al ${redondear(nivel, 1)} %, por encima del ` +
              `${u.avisoMax} % de aviso. Encenderla ahora arriesga desbordarlo. Espera a que baje ` +
              `el nivel o dile al operador que lo revise antes de forzarlo.`,
            { nivelTanque: redondear(nivel, 1), avisoSuperior: u.avisoMax }
          )
        }
      }

      const r = await client.writePoint(TAG_CONTROL_BOMBA, encender)
      if (!r?.ok) {
        return fallo(
          `El servidor ICONICS no aceptó la escritura sobre la bomba: ${r?.error ?? 'error del servidor'}.`
        )
      }

      /*
       * El servidor puede responder `ok: true` a la escritura sin que el punto
       * cambie de verdad todavía. `CONTROL` es una fuente en tiempo real que el
       * motor de ICONICS escanea cada ~1 s (ver `Scan rate` del tag), así que
       * una relectura inmediata puede devolver el valor anterior aunque la
       * escritura sí vaya a tomar efecto en el siguiente ciclo. Se reintenta
       * unas pocas veces con una espera corta antes de dar la escritura por
       * sin efecto — confirmar sólo porque la petición HTTP no dio error sería
       * prestarle al servidor una ejecución que no ha demostrado.
       */
      let valorLeido = null
      let relecturaOk = false
      for (let intento = 0; intento < INTENTOS_RELECTURA_CONTROL; intento++) {
        if (intento > 0) await esperar(ESPERA_RELECTURA_CONTROL_MS)
        const relectura = await client.readPoint(TAG_CONTROL_BOMBA)
        relecturaOk = Boolean(relectura?.ok)
        valorLeido = toBooleano(relectura?.payload?.value ?? relectura?.payload?.Value ?? null)
        if (relecturaOk && valorLeido === encender) break
      }

      if (!relecturaOk || valorLeido === null || valorLeido !== encender) {
        return fallo(
          `Mandé la orden de ${encender ? 'encender' : 'apagar'} la bomba y el servidor la aceptó, ` +
            `pero al releer ${TAG_CONTROL_BOMBA} sigue valiendo ${valorLeido ?? 'sin dato'} en vez de ` +
            `${encender}. La escritura no ha tenido efecto real sobre la instalación: dile al usuario ` +
            `que la orden no se aplicó y que hay que revisar la configuración de ese punto en el ` +
            `servidor ICONICS, no reintentarlo tal cual.`,
          { valorEscrito: encender, valorLeido }
        )
      }

      return {
        ok: true,
        accion: encender ? 'encendida' : 'apagada',
        tag: TAG_CONTROL_BOMBA,
      }
    },
  }
}
