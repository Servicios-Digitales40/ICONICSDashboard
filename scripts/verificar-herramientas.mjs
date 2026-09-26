#!/usr/bin/env node
/**
 * scripts/verificar-herramientas.mjs
 * ------------------------------------------------------------------
 * Comprueba las tres herramientas que el modelo de lenguaje puede invocar
 * sobre el sistema de agua industrial, **sin modelo y sin servidor ICONICS**.
 *
 * ── POR QUÉ SIN MODELO ─────────────────────────────────────────────
 *
 * Con el 4B en una GPU de 8 GB, una respuesta del asistente tarda entre 30 y
 * 90 segundos. Una capa de herramientas que sólo se pudiera probar esperando
 * eso no se probaría nunca. Aquí se ejecutan directamente, contra un cliente
 * de ICONICS de mentira, y tardan milisegundos.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * Las reglas de dominio que son el motivo de que estas herramientas existan en
 * vez de dejar que el modelo llame a la API REST en crudo:
 *
 *  - **Tres señales devuelven la serie de OTRA, y el servidor no da error.**
 *    Es la invariante cara de este archivo: pedir la historia de la carga del
 *    motor NO puede llegar a la red. Si esta prueba se cae, el asistente pasa
 *    a contestar grados centígrados bajo el nombre «carga del motor».
 *  - El punto histórico se nombra con `ac:`, no con `hda:`.
 *  - Un valor de mala calidad es un HUECO, nunca un cero.
 *  - Una instalación PARADA no es una instalación en alarma.
 *  - Las unidades no se inventan: las que el servidor no declara van vacías.
 *  - Los umbrales son NUESTROS, y cada respuesta que los usa lo dice.
 *  - **Una sola herramienta escribe**, y con dos guardas propias.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-herramientas.mjs
 *
 * Código de salida: 0 si todo se cumple, 1 si algo falla.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DEFINICIONES,
  createHerramientas,
  resolverVentana,
} from '../backend/ia/conversacion/herramientas.mjs'
import { ESQUEMAS } from '../backend/ia/conversacion/definiciones.mjs'
import { bandaLegible } from '../backend/ia/herramientas/lib/formato.mjs'
import {
  RAIZ,
  SENALES,
  SENAL_KEYS,
  TODOS_LOS_PUNTOS,
  esHistorizada,
  historizadas,
  parsePointName,
  pointName,
  puntoHistorico,
} from '../shared/eva/tanque/senales.js'
/* El diario de accionamientos: desde el Plan 23 F6 también lo alimenta la
   herramienta del asistente, no sólo el botón del tablero. */
import { crearDiario } from '../backend/lib/diario.mjs'
import { PROVISIONALES } from '../shared/eva/comun/umbrales.js'
import {
  NO_COMPARTEN,
  SISTEMA,
  SISTEMAS,
  SISTEMAS_EN_SERVICIO,
  mismoSistema,
  registrarSistema,
  sistemasDeSenal,
  sistemaPorNombre,
  tieneHistoria,
} from '../shared/eva/comun/sistemas.js'
import { construirSistema } from '../shared/eva/comun/construirSistema.js'
import { tipoDe } from '../shared/eva/tipos/index.js'
import { createFakeIconicsClient } from '../backend/iconics/fakeClient.mjs'
import { configuracionEspejo } from './lib/configuracionEspejo.mjs'
import { crearAyudantesDeHistoria } from '../backend/ia/herramientas/lib/historia.mjs'
/* El resolver de señales del Plan 44 F3.6, que sustituyó al índice de nombres
   escrito a mano del tanque. Lo ejercitan las comprobaciones portadas (B19). */
import { crearAyudantesDeMaquina } from '../backend/ia/herramientas/lib/maquina.mjs'
import { crearResolvedorDeSenales } from '../backend/ia/herramientas/lib/senales.mjs'
import { puntoHistorico as puntoHistoricoVib, puntoMedida } from '../shared/eva/vibraciones/vibraciones.js'
import { valorVibracionEn } from '../shared/eva/vibraciones/simuladorVibraciones.js'

/*
 * ── LA MÁQUINA DE VIBRACIONES ES LA ESPEJO, PARA TODO EL GUION (Plan 40 F3) ─
 *
 * Hasta el 21-09-2026 este guion probaba las herramientas contra la máquina
 * de vibraciones ESCRITA A MANO (`SISTEMA.vibraciones`) y, en un bloque aparte,
 * contra una configurada espejo. La escrita a mano se retiró (Plan 40): la
 * espejo se registra aquí, al principio, y es la máquina de vibraciones de
 * todas las comprobaciones. `ESPEJO.id` donde antes iba `'vibraciones'`.
 */
const ESPEJO = configuracionEspejo({ verificadasDelCatalogo: true }).configurada
const configurada = registrarSistema(construirSistema(ESPEJO, tipoDe('vibraciones')))
import { enMarchaVib } from '../shared/eva/vibraciones/simuladorVibraciones.js'
import { MAX_PUNTOS, resumirSerie } from '../shared/eva/comun/historia.js'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

function check(nombre, fn) {
  try {
    const r = fn()
    if (r instanceof Promise) throw new Error('usa checkAsync para comprobaciones asíncronas')
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

async function checkAsync(nombre, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

/* ── OMITIR, QUE NO ES LO MISMO QUE BORRAR ──────────────────────────── */

/**
 * Cuántas comprobaciones se saltaron, y por qué.
 *
 * ── POR QUÉ ESTE MECANISMO EXISTE (rama `Vibraciones1.0`, 17-09-2026) ──
 *
 * Al cerrar la estación de llenado, 48 de las 191 comprobaciones de este guion
 * se pusieron en rojo de golpe. Ninguna estaba mal: todas usan el TANQUE como
 * escenario —es la máquina madura, la que tiene catálogo, umbrales y
 * simulador— y ese sistema ya no contesta, porque `resolverSistema()` lo niega
 * a propósito.
 *
 * La salida obvia era borrarlas o comentarlas. Las dos son peores:
 *
 *  · Borrarlas tira 48 comprobaciones que vuelven a valer el día que se
 *    reabra, y nadie se acordará de reescribirlas.
 *  · Comentarlas las esconde: un guion que pasa en verde sin decir que dejó de
 *    mirar la mitad de lo que miraba es exactamente el rojo que enseña a
 *    ignorar el rojo.
 *
 * `omitir()` es la tercera vía: la comprobación no corre, pero SE CUENTA y se
 * dice. El resumen final imprime cuántas y por qué, así que la próxima persona
 * ve de un vistazo que este guion está cubriendo menos de lo que cubría.
 */
const omitidas = []

/**
 * Salta una comprobación, dejando constancia.
 *
 * @param {string} nombre  el mismo que tendría el `check`
 * @param {string} motivo  por qué no se puede correr AHORA
 */
function omitir(nombre, motivo) {
  omitidas.push({ nombre, motivo })
  console.log(`  ${c.gris}○ ${nombre} — ${motivo}${c.reset}`)
}

/** Motivo único de todas las omisiones de esta rama. */
const CERRADA = 'la estación de llenado está cerrada (rama Vibraciones1.0)'

/**
 * Sustituye a `check`/`checkAsync` en las comprobaciones que usan el TANQUE
 * como escenario.
 *
 * Recibe el cuerpo y NO lo ejecuta: por eso la comprobación sigue escrita,
 * entera y a la vista, en vez de comentada. El día que se reabra la estación
 * de llenado, esto vuelve a ser `checkAsync` con un buscar-y-reemplazar y las
 * que quedan vuelven a correr sin reescribir ni una línea.
 *
 * ── LO QUE YA NO ESTÁ AQUÍ (B19, 24-09-2026) ───────────────────────
 *
 * El Plan 44 F3.6 dejó 88 omitidas, y sólo cuatro nombraban el tanque: las
 * demás comprobaban MECÁNICA GENÉRICA —tramos, cobertura, 502, hora local,
 * idioma, flancos— con el tanque de escenario, porque era la máquina por
 * omisión. Cuarenta y tres se portaron a la espejo y llevan `[espejo]` en su
 * nombre: 88 omitidas pasaron a 45, y las correctas de 134 a 177. Las que
 * siguen omitidas son las que de verdad dependen de esa máquina: su bomba,
 * su catálogo escrito a mano y su narración.
 */
function omitirEnvuelto(nombre, _fn) {
  omitir(nombre, CERRADA)
}

/* ── Cliente de ICONICS de mentira ───────────────────────────────────── */

/**
 * Valores en vivo por tag. Es la instalación PARADA, que es como está la mayor
 * parte del tiempo: caudal 0, motor 0, eficiencia 0. Elegido a propósito —es
 * el estado en el que un tablero mal hecho abre en rojo permanente—.
 */
const EN_REPOSO = {
  NIVEL_TANQUE: 62.5,
  TEMPERATURA_TANQUE: 21.3,
  CARGA_TRABAJO_MOTOR: 0,
  'Modo_AM_VDF': false,
  FLUJO_INSTANTANEO: 0,
  PRESION_RELATIVA: 0.2,
  INDICE_DESVIACION_VOLTAJE: 122.1,
  KPIEFICIENCIA_ENERGETICA: 0,
  // Plan 27 F3: las ocho alarmas del PLC, ninguna activa — es la instalación
  // sana, igual que los siete valores de arriba. CONTROL apagado y el paro de
  // emergencia en su reposo declarado por el PDF (TRUE = sin emergencia).
  NIVEL_ALTO_ALTO: false,
  NIVEL_ALTO: false,
  NIVEL_BAJO_BAJO: false,
  NIVEL_BAJO: false,
  PRESION_ALTA: false,
  FALTA_DE_PRESION: false,
  DP_BAJO_FLUJO: false,
  FALLA_VARIADOR_DE_FRECUENCIA: false,
  CONTROL: false,
  PARO_DE_EMERGENCIA: true,
  // Plan 27 F4: energía, variador y automatismo. La instalación en reposo:
  // el motor parado da los "crudos" del variador en su valor de reposo (0,
  // salvo los dos parámetros fijos), y el automatismo sin ninguna orden activa.
  DP_CORRIENTE_L1: 1.2,
  POTENCIA_REACTIVA_QN_L1: 0.3,
  DP_ENERGIA_APARENTEL1: 4821.6,
  TENSION_L1_N: 266.5,
  TENSION_MAXIMA_L1_N: 279.1,
  POTENCIA_ACTIVA_L1: 210,
  POTENCIA_APARENTE_L1: 260,
  FRECUENCIA_DE_SALIDA: 0,
  VELOCIDAD: 0,
  DP_CORRIENTE: 0,
  TORQUE: 0,
  PWR_ACTUAL: 0,
  KWH_TOTAL: 1345,
  VOLTAJE_BUS_DC: 310,
  REFERENCIA: 0,
  POTENCIA_NOMINAL: 1500,
  VOLTAJE_SALIDA: 0,
  ARRANQUE_PARO_LLENADO: false,
  ARRANQUE_PARO_VACIADO: false,
  RECIRCULACION_AUTOMATICA: true,
  SETPOINT_LLENANDO: 80,
  SETPOINT_VACIADO: 40,
  // Plan 27 F5: en reposo, S1 (llenado) abierta y en marcha; S2 (vaciado) y
  // la bomba de aire, cerradas/paradas. Ninguna en mantenimiento.
  MANUAL_AUTO_S1: false,
  START_STOP_S1: true,
  MTTO_S1: false,
  ESTADO_S1: 2,
  MANUAL_AUTO_S2: false,
  START_STOP_S2: false,
  MTTO_S2: false,
  ESTADO_S2: 1,
  MANUAL_AUTO_BA: false,
  START_STOP_BA: false,
  MTTO_BA: false,
  ESTADO_BA: 1,
}

/**
 * Un cliente falso.
 *
 * `historial` registra TODA llamada al historiador: es como se comprueba que
 * una consulta prohibida no llegó a salir a la red, que es distinto de que
 * devolviera un error.
 */
function clienteFalso({
  valores = EN_REPOSO,
  calidad = {},
  historia = null,
  aceptaEscritura = true,
  // Que el servidor acepte la escritura NO significa que el punto cambie: es
  // el caso real que vive `controlar_bomba` contra un tag mal configurado, y
  // el motivo de que relea antes de dar la orden por cumplida.
  escrituraTomaEfecto = true,
  controlInicial = false,
} = {}) {
  const historial = []
  const lotes = []
  const escrituras = []
  const lecturasSueltas = []
  const control = { valor: controlInicial }

  return {
    historial,
    lotes,
    escrituras,
    lecturasSueltas,

    async readPoints(puntos) {
      lotes.push(puntos)
      const payload = {}
      for (const p of puntos) {
        /*
         * El tag sale de `parsePointName` + el catálogo, no de restar el
         * prefijo de una rama fija: desde el Plan 27 cada señal vive en la
         * suya, y una resta a ciegas se rompe en cuanto una señal se muda
         * (pasó con las tres del F2 del 09-09-2026). Así el fixture no
         * depende de en qué rama esté hoy cada una.
         */
        const tag = SENALES[parsePointName(p)]?.tag ?? ''
        payload[p] = {
          ok: true,
          payload: { value: valores[tag], quality: calidad[tag] ?? 0 },
        }
      }
      return { ok: true, payload }
    },

    /*
     * `CONTROL` no es una señal del catálogo: es el punto sobre el que escribe
     * `controlar_bomba`. Vive aparte, en su propia variable, porque lo que
     * estas comprobaciones miran es justamente que una escritura aceptada por
     * el servidor y una lectura que la confirma son dos cosas distintas.
     */
    control,

    /*
     * Desde el Plan 21 F5 el cliente real RELEE lo escrito y adjunta
     * `confirmacion` / `confirmada` (ver `confirmarEscrituras` en
     * `iconics/client.mjs`). Este falso tiene que hacer lo mismo, y no por
     * cortesía: `controlar_bomba` decide con esos campos, así que un falso que
     * no los diera haría fallar la orden SIEMPRE — que es exactamente lo que
     * pasó al introducir F5, y lo que estas dos comprobaciones atraparon.
     *
     * La relectura se apunta en `lecturasSueltas` igual que la del cliente
     * real, porque es lo que una de ellas comprueba: que se relee de verdad.
     */
    async writePoint(punto, valor) {
      escrituras.push({ punto, valor })
      if (!aceptaEscritura) return { ok: false, error: 'punto de solo lectura' }
      if (escrituraTomaEfecto) control.valor = valor

      lecturasSueltas.push(punto)
      const leido = control.valor
      const coincide = leido === valor

      return {
        ok: true,
        confirmacion: { pointName: punto, pedido: valor, leido, coincide },
        confirmada: coincide,
      }
    },

    async readPoint(punto) {
      lecturasSueltas.push(punto)
      return { ok: true, payload: { value: control.valor, quality: 0 } }
    },

    async readHistory(opciones) {
      historial.push(opciones)
      if (historia) return historia(opciones)

      const t0 = new Date(opciones.startDate).getTime()
      const t1 = new Date(opciones.endDate).getTime()
      const data = []
      for (let i = 0; i < 24; i++) {
        data.push({
          timestamp: new Date(t0 + (i * (t1 - t0)) / 24).toISOString(),
          value: 60 + Math.sin(i / 3) * 8,
          quality: 0,
        })
      }
      return { ok: true, data }
    },
  }
}

/**
 * Índice de documentación de mentira: `buscar()` ignora la consulta y
 * devuelve los fragmentos que se le pasan, en el mismo orden. Aquí no se
 * prueba BM25 —eso es cosa de `documentos.mjs`— sino que `limites_del_manual`
 * y `diagnostico` extraen y componen bien lo que el índice les da.
 */
/**
 * Doble del índice de documentación.
 *
 * `ultimaBusqueda` guarda las opciones de la última llamada a `buscar()`, y
 * existe por una razón concreta: el aislamiento por máquina (Plan 17 F3a, G7)
 * vive DENTRO de `buscar()`, así que un doble que devuelva fragmentos sin
 * mirar el filtro no puede distinguir «la herramienta acotó» de «la
 * herramienta no acotó». Medido el 03-09-2026: `consultar_documentacion` y
 * `limites_del_manual` llevaban desde entonces sin pasar `sistema` nunca, y
 * ninguna prueba lo notó porque ninguna miraba lo que se pasaba.
 */
function indiceDocumentosFalso(fragmentos) {
  const doble = {
    ultimaBusqueda: null,
    async buscar(_consulta, opciones = {}) {
      const { top = 3 } = opciones
      doble.ultimaBusqueda = opciones
      return fragmentos.slice(0, top)
    },
    estado() {
      return { cargado: true, carpeta: 'x', modo: 'BM25', documentos: [], ilegibles: [] }
    },
  }
  return doble
}

console.log(`\n${c.negrita}Herramientas del asistente · sistema de agua${c.reset}`)

/* ── El catálogo ─────────────────────────────────────────────────────── */

console.log('\n── El catálogo ─────────────────────────────────────────────')

check('todos los puntos se nombran bajo la raíz de la demo', () => {
  assert.equal(TODOS_LOS_PUNTOS.length, SENAL_KEYS.length)
  for (const p of TODOS_LOS_PUNTOS) {
    assert.ok(p.startsWith(RAIZ), `"${p}" no cuelga de ${RAIZ}`)
  }
})

check('el punto de TIEMPO REAL y el HISTÓRICO ya no son el mismo nombre (Plan 27 F6)', () => {
  // Cierto hasta el 09-09-2026: el redirect del historiador vivía configurado
  // en el activo del servidor, y `ac:` servía para las dos cosas. La
  // reorganización del árbol lo rompió para doce de las trece ramas —
  // `/History` contra `ac:` da 500, y sólo `hda:...DEMO TANQUE\…` contesta.
  const vivo = pointName('nivelTanque')
  const historico = puntoHistorico('nivelTanque')
  assert.ok(vivo.startsWith('ac:'), 'el punto en vivo sigue siendo ac:')
  assert.ok(historico.startsWith('hda:'), 'el punto histórico ya es hda:')
  assert.notEqual(vivo, historico)
})

check('sólo las señales verificadas están marcadas como historizadas', () => {
  // Plan 27 F6 (10-09-2026): cincuenta de las cincuenta y dos. El
  // 14-09-2026 planta le dio Historical data source propio a las dos que
  // quedaban fuera (`cargaMotor`, `eficienciaEnergetica`), así que hoy son
  // las 52.
  assert.equal(historizadas().length, 52)
  for (const k of ['cargaMotor', 'eficienciaEnergetica']) {
    assert.equal(esHistorizada(k), true, `${k} SÍ está historizada`)
  }
})

check('el catálogo que va al prompt no inventa unidades, y sin id es el de la única máquina en servicio', () => {
  /* Hasta el Plan 44 F3.6 era el del tanque; ahora, sin id, la única configurada en servicio. */
  const cat = createHerramientas({ client: clienteFalso() }).catalogo()
  assert.ok(cat.length > 0, 'sin id tiene que salir la única configurada en servicio')
  const vrms = cat.find(s => /Velocidad eficaz · Lado acople/.test(s.nombre))
  assert.equal(vrms.unidad, 'mm/s', 'la unidad la pone el rol del tipo')
  for (const fila of cat) assert.ok(fila.unidad === null || typeof fila.unidad === 'string', `${fila.nombre}: unidad inventada`)
  assert.ok(cat.every(s => s.sistema === ESPEJO.id))
})
/* ── Resolver el nombre de una señal ─────────────────────────────────── */

console.log('\n── Resolver la señal ───────────────────────────────────────')

/*
 * ── PORTADAS DEL TANQUE A LA ESPEJO (B19, 24-09-2026) ───────────────
 *
 * Las cinco de esta familia probaban `resolverSenal`, el índice de nombres
 * ESCRITO A MANO del tanque, que el Plan 44 F3.6 borró. No se pueden
 * «reactivar» reabriendo la estación de llenado: la función no existe.
 *
 * Lo que las sustituye es `resolverSenalDeSistema` (`herramientas/lib/
 * senales.mjs`), que resuelve DENTRO de la máquina del turno y sale del
 * registro, no de un mapa a mano. Ese resolver no tenía ni una comprobación
 * directa hasta aquí: se ejercitaba sólo de refilón, a través de las
 * herramientas.
 *
 * Se conserva lo que cada una AFIRMABA —la clave y el rótulo resuelven, el
 * habla del operador se acepta, lo que no existe no resuelve, una frase
 * ambigua no elige— contra la espejo y su vocabulario.
 */
const { resolverSistema } = crearAyudantesDeMaquina({ client: clienteFalso() })
const resolver = crearResolvedorDeSenales({ resolverSistema })

/**
 * El transporte falso de la espejo, ANOTANDO lo que se le pide (B19).
 *
 * ── POR QUÉ UN ENVOLTORIO Y NO OTRO CLIENTE FALSO ──────────────────
 *
 * Las comprobaciones de la familia de historia no miran el dato que vuelve:
 * miran CÓMO se pidió —cuántas llamadas, con qué agregado, con qué prefijo,
 * con qué intervalo—. El `clienteFalso` de este guion lleva ese `historial`,
 * pero sólo sabe servir el catálogo del tanque, que ya no existe en el
 * asistente. `createFakeIconicsClient` sí sirve la espejo, y no anota.
 *
 * Envolverlo da las dos cosas sin duplicar ninguna: el dato lo sigue
 * componiendo el falso de verdad, y aquí sólo se apunta la llamada. `historia`
 * permite además sustituir la respuesta, que es como se prueban el troceado
 * de rangos largos y el 502 sin depender de cuántas muestras invente el falso.
 */
function espejoFalso({ historia = null, limits } = {}) {
  const base = createFakeIconicsClient(limits ? { limits } : {})
  const historial = []
  const lotes = []
  return {
    ...base,
    historial,
    lotes,
    async readPoints(puntos) {
      lotes.push(puntos)
      return base.readPoints(puntos)
    },
    async readHistory(opciones) {
      historial.push(opciones)
      return historia ? historia(opciones) : base.readHistory(opciones)
    },
  }
}

check('[espejo] la clave y el rótulo de una señal resuelven solos, dentro de su máquina', () => {
  for (const clave of ['vRMS_S1', 'aRMS_S2', 'DKW_S3', 'velocidad']) {
    const porClave = resolver.resolverSenalDeSistema(clave, ESPEJO.id)
    assert.equal(porClave.ok, true, `falló la clave "${clave}"`)
    assert.equal(porClave.clave, clave)

    const etiqueta = configurada.etiquetaDe(clave)
    const porRotulo = resolver.resolverSenalDeSistema(etiqueta, ESPEJO.id)
    assert.equal(porRotulo.ok, true, `falló el rótulo "${etiqueta}"`)
    assert.equal(porRotulo.clave, clave, `"${etiqueta}" resolvió a otra señal`)
  }
})

check('[espejo] se aceptan las formas en que habla un operador', () => {
  /* Mayúsculas, espacios de sobra y el nombre del punto de medida en vez de
     la etiqueta compuesta: nadie escribe «Velocidad eficaz · Lado acople». */
  const formas = {
    vRMS_S1: ['Velocidad eficaz · Lado acople', 'velocidad eficaz del lado acople', '  VELOCIDAD EFICAZ DEL LADO ACOPLE  '],
    vRMS_S3: ['velocidad eficaz del lado libre'],
    velocidad: ['velocidad del variador'],
  }
  for (const [clave, lista] of Object.entries(formas)) {
    for (const forma of lista) {
      const r = resolver.resolverSenalDeSistema(forma, ESPEJO.id)
      assert.equal(r.ok, true, `no resolvió "${forma}"`)
      assert.equal(r.clave, clave, `"${forma}" resolvió a ${r.clave}`)
    }
  }
})

check('[espejo] un nombre que no existe NO resuelve a nada, y lo dice con las que sí', () => {
  /* El vocabulario del tablero anterior: si «OEE» resolviera a cualquier
     cosa, el asistente contestaría una señal de vibración a una pregunta de
     producción. La negativa ofrece las que sí existen para no gastar otra
     ronda con el modelo. */
  for (const fantasma of ['OEE', 'la Línea 1', 'disponibilidad', 'piezas rechazadas', '']) {
    const r = resolver.resolverSenalDeSistema(fantasma, ESPEJO.id)
    assert.equal(r.ok, false, `"${fantasma}" no debería resolver`)
    assert.ok(r.error, `"${fantasma}" se niega sin decir por qué`)
  }
})

check('[espejo] una frase con DOS señales no elige ninguna', () => {
  /* Elegir la primera daría una respuesta correcta sobre la señal
     equivocada, que es peor que un error: nadie la revisaría. */
  const r = resolver.resolverSenalDeSistema('compara la velocidad eficaz y la aceleración eficaz', ESPEJO.id)
  assert.equal(r.ok, false, 'una frase con dos señales no puede resolver a una')
})

check('[espejo] una señal de otra máquina no se sirve como si fuera de ésta', () => {
  /* Lo que antes hacía el índice del tanque —resolver cualquier nombre
     conocido— ahora lo acota la máquina del turno. Una señal del tanque
     (cerrado) no puede colarse en una consulta sobre la espejo. */
  const r = resolver.resolverSenalDeSistema('nivel del tanque', ESPEJO.id)
  assert.equal(r.ok, false)
  assert.ok(/no es una señal|ninguna máquina/i.test(r.error), `el motivo no explica de quién es: ${r.error}`)
})

/* ── Resolver el período ─────────────────────────────────────────────── */

console.log('\n── Resolver el período ─────────────────────────────────────')

check('sin período se usan las últimas 6 horas, como las gráficas de Planta', () => {
  const v = resolverVentana('')
  const horas = (v.fin - v.inicio) / 3_600_000
  assert.ok(Math.abs(horas - 6) < 0.01, `fueron ${horas} h`)
  assert.match(v.etiqueta, /6 horas/)
})

check('las horas relativas son la forma natural aquí', () => {
  const casos = [['última hora', 1], ['últimas 3 horas', 3], ['hace 12 horas', 12]]
  for (const [texto, esperadas] of casos) {
    const v = resolverVentana(texto)
    assert.ok(!v.error, `"${texto}" dio error: ${v.error}`)
    const horas = (v.fin - v.inicio) / 3_600_000
    assert.ok(Math.abs(horas - esperadas) < 0.01, `"${texto}" dio ${horas} h`)
  }
})

check('«esta hora» y los números con letra, que es como se pregunta de verdad', () => {
  // Los dos salieron de probar contra el modelo real. El ejemplo de la
  // interfaz —«compara la presión de esta hora con la de hace seis horas»— usa
  // ambas formas, y el 4B las copia tal cual porque es lo que se le pide.
  const esta = resolverVentana('esta hora')
  assert.ok(!esta.error, `"esta hora" dio error: ${esta.error}`)
  assert.ok(Math.abs((esta.fin - esta.inicio) / 3_600_000 - 1) < 0.01)

  const seis = resolverVentana('hace seis horas')
  assert.ok(!seis.error, `"hace seis horas" dio error: ${seis.error}`)
  assert.ok(Math.abs((seis.fin - seis.inicio) / 3_600_000 - 6) < 0.01, 'seis tiene que ser 6')

  assert.ok(!resolverVentana('últimas doce horas').error)
})

check('«últimas horas» en plural son las 6 de la vista de Planta, no una', () => {
  // Con 1 h se contestaba a «¿cómo ha ido la temperatura estas últimas horas?»
  // con un tramo seis veces más corto del que se enseña en pantalla.
  const v = resolverVentana('últimas horas')
  assert.ok(Math.abs((v.fin - v.inicio) / 3_600_000 - 6) < 0.01, 'el plural sin número son 6 h')

  const una = resolverVentana('última hora')
  assert.ok(Math.abs((una.fin - una.inicio) / 3_600_000 - 1) < 0.01, 'el singular sigue siendo 1 h')
})

check('los minutos también, porque el sondeo vivo va a 3 s', () => {
  const v = resolverVentana('últimos 30 minutos')
  const minutos = (v.fin - v.inicio) / 60_000
  assert.ok(Math.abs(minutos - 30) < 0.1, `fueron ${minutos} min`)
})

check('el calendario se delega en shared/periodo.js y sigue funcionando', () => {
  const ayer = resolverVentana('ayer')
  assert.ok(!ayer.error, ayer.error)
  assert.match(ayer.etiqueta, /^el \d{4}-\d{2}-\d{2}$/)

  const hoy = resolverVentana('hoy')
  assert.ok(!hoy.error, hoy.error)
  // Un período que llega hasta hoy se recorta en el presente: pedir las horas
  // que no han pasado sólo trae muestras vacías.
  assert.ok(hoy.fin <= new Date(Date.now() + 1000), 'no puede pasar del presente')
})

check('un mes cabe dentro del tope (Plan 15 Fase 4: 90 días, no 7)', () => {
  // Con el troceado unificado (Fase 2) siguiendo la continuación real del
  // servidor (Fase 1) y una concurrencia acotada (Fase 3), alargar la
  // ventana ya no diluye la resolución de la misma forma que cuando esto
  // eran 100 puntos sin trocear: un mes entero ahora se acepta.
  const v = resolverVentana('julio 2026')
  assert.ok(!v.error, `un mes debería caber en el nuevo tope de 90 días: ${v.error}`)
})

check('una ventana que SÍ excede el nuevo tope (90 días) se NIEGA y dice qué hacer', () => {
  const v = resolverVentana('últimos 200 días')
  assert.ok(v.error, '200 días tendría que rechazarse')
  assert.match(v.error, /90 días|más corto/i, 'y decir qué hacer en su lugar')

  const h = resolverVentana('últimas 3000 horas') // 125 días
  assert.ok(h.error, '3000 horas (125 días) tendría que rechazarse')
})

check('las alternativas que ofrece un rechazo se entienden de verdad', () => {
  /*
   * La trampa cerrada aquí: al negar «el mes pasado», el 4B proponía por su
   * cuenta «la última semana» — que en ese momento NO se entendía. El
   * operador seguía el consejo del asistente y volvía a chocar, después de
   * haber esperado dos veces.
   *
   * Ahora las alternativas se escriben en el propio error, así que esta prueba
   * comprueba lo único que importa: que todas las que ofrecemos funcionen.
   */
  for (const forma of ['últimas 6 horas', 'últimos 3 días', 'la última semana', 'ayer']) {
    const v = resolverVentana(forma)
    assert.ok(!v.error, `ofrecemos "${forma}" y no se entiende: ${v.error}`)
  }
})

check('el futuro se rechaza', () => {
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const v = resolverVentana(manana)
  assert.ok(v.error, 'mañana no tiene datos')
  assert.match(v.error, /futuro/i)
})

/* ── Una herramienta, todas las máquinas ─────────────────────────────── */

console.log('\n-- Una herramienta, todas las maquinas ---------------------')

/*
 * Este bloque recorre los sistemas EN SERVICIO, no nombra máquinas. Lo que
 * fija es que `estado_del_sistema` y `riesgos_activos` sirvan a CUALQUIERA de
 * los que el tablero está leyendo — el motivo entero de haberlas
 * parametrizado en vez de escribir una por instalación, que es como el tanque
 * llegó a tener ocho herramientas y vibraciones una.
 *
 * ── EN SERVICIO, NO TODOS (rama `Vibraciones1.0`, 17-09-2026) ──────
 *
 * Una máquina cerrada por mantenimiento NO debe servirse: `resolverSistema()`
 * la niega a propósito, así que pedirle su estado aquí comprobaría lo
 * contrario de lo que el cierre quiere. Recorrer `SISTEMAS_EN_SERVICIO` hace
 * que este bucle siga diciendo lo mismo —«cualquiera de las que el tablero
 * lee»— sin una condición añadida.
 *
 * Al reabrir el tanque vuelve solo, sin tocar este archivo.
 */
for (const sistema of SISTEMAS_EN_SERVICIO) {
  await checkAsync(`«${sistema.id}»: estado_del_sistema lo sirve`, async () => {
    const client = createFakeIconicsClient({ rnd: () => 0.99 })
    const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', { sistema: sistema.id })

    assert.equal(r.ok, true, r.error)
    // Cada máquina se narra a su manera —el tanque con campos sueltos,
    // vibraciones con la frase ya hecha— pero las dos tienen que decir de
    // QUIÉN hablan, o el modelo mezcla instalaciones al redactar.
    assert.match(JSON.stringify(r), /sistema|instalacion/i)
  })

  await checkAsync(`«${sistema.id}»: riesgos_activos lo evalúa de verdad`, async () => {
    const client = createFakeIconicsClient({ rnd: () => 0.99 })
    const r = await createHerramientas({ client }).ejecutar('riesgos_activos', { sistema: sistema.id })

    assert.equal(r.ok, true, r.error)
    // `evaluadas: 0` significaría que esta máquina no tiene motor de reglas
    // enchufado: la herramienta contestaría «sin riesgos» de algo que nadie
    // miró, que es el peor silencio posible.
    assert.equal(r.reglas_evaluadas > 0, true, `${sistema.id} no evaluó ninguna regla`)
    assert.ok(r.sin_comprobar, 'falta el recuento de lo que NO se pudo mirar')
  })
}

/*
 * ── LA MÁQUINA CONFIGURADA (Plan 39 F0) ─────────────────────────────
 *
 * Hasta el 21-09-2026 todas las comprobaciones de este guion eran sobre las
 * máquinas escritas a mano. Las herramientas sirven también a las que entran
 * por configuración (Plan 38 F1), y nada aquí lo miraba: lo que el Plan 39
 * abre se habría probado sólo contra planta, a seis minutos la tanda.
 *
 * Se registra la configurada ESPEJO de vibraciones —derivada del catálogo,
 * `lib/configuracionEspejo.mjs`— y se le pide lo mismo que a las escritas a
 * mano. Sus puntos son los mismos tags, así que el transporte falso le da
 * valores sin tocar nada: `sistemaDePunto()` los atribuye a la escrita a mano,
 * que sí tiene física simulada.
 *
 * Desde el Plan 40 F3 la espejo está registrada para TODO el guion (arriba,
 * junto a los imports): la escrita a mano ya no existe y la espejo es la
 * máquina de vibraciones de todas las comprobaciones. Este bloque conserva
 * las que la miran como configurada.
 */
console.log('\n── La máquina configurada (Plan 39 F0) ─────────────────────')

const antesDeConfigurada = passed

check('[configurada] entra en el registro y en servicio, y es la única dueña de su raíz', () => {
  assert.equal(SISTEMA[ESPEJO.id], configurada)
  assert.ok(SISTEMAS_EN_SERVICIO.includes(configurada), 'no está en servicio')
  assert.equal(configurada.configurada, true)
  assert.equal(configurada.tipo, 'vibraciones')
  // Hasta el Plan 40 F3 compartía raíz con la escrita a mano y lo declaraba en
  // `solapes`. Retirada aquélla, nadie más reclama sus puntos.
  assert.equal(configurada.solapes, undefined, 'ya no hay escrita a mano con la que solaparse')
})

await checkAsync('[configurada] sistemas_de_la_planta la lista con su id, su nombre y sus herramientas', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('sistemas_de_la_planta', {})
  assert.equal(r.ok, true, r.error)
  const suya = r.sistemas.find(s => s.id === ESPEJO.id)
  assert.ok(suya, 'no aparece en la lista')
  assert.equal(suya.nombre, ESPEJO.nombre)
  // Las herramientas salen de las CAPACIDADES de la configuración, no de una
  // lista fija: con series verificadas, la historia se ofrece.
  assert.deepEqual(suya.herramientas, ['estado_del_sistema', 'riesgos_activos', 'historia_de_senal'])
  assert.ok(suya.limitaciones.length > 0, 'una configurada tiene que confesar lo que no sabe hacer')
})

await checkAsync('sistemas_de_la_planta dice CUÁL está cerrada, y por qué (Plan 45 F2.5)', async () => {
  /*
   * El inventario omitía el cierre, y el modelo no puede saber lo que no se le
   * dice: medido el 24-09-2026 contra el modelo real, a «¿qué máquinas hay?»
   * contestó «hay dos máquinas independientes» y presentó la estación de
   * llenado —cerrada, sin vistas, y que toda herramienta niega— como una más.
   *
   * La guarda de `resolverSistema()` sigue siendo la que impide contestar por
   * ella; esto es lo que impide OFRECERLA. Son dos cosas distintas y hacen
   * falta las dos.
   */
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('sistemas_de_la_planta', {})
  assert.equal(r.ok, true, r.error)

  /* `sistemas` son las que SE PUEDEN consultar, y `cuantos` las cuenta a ellas
     (Plan 45 F3.2): el modelo decía «hay dos máquinas» contando una cerrada. */
  assert.ok(r.sistemas.every((s) => !s.cerrado), 'ninguna cerrada puede ir entre las de la planta')
  assert.equal(r.cuantos, r.sistemas.length, '`cuantos` tiene que contar las que se pueden consultar')
  const enServicio = r.sistemas.find((s) => s.id === ESPEJO.id)
  assert.ok(enServicio, 'la espejo está en servicio y tiene que salir')

  /* Pero NO se ocultan: sin esto, una pregunta legítima por el tanque se
     contestaría «no existe», que es falso. Van aparte y con su motivo. */
  const cerrada = (r.cerradas ?? []).find((s) => s.id === 'tanque')
  assert.ok(cerrada, 'la cerrada sigue en la respuesta, en su propio campo')
  assert.ok(cerrada.motivo, 'y tiene que decir por qué lo está')
  assert.equal(typeof cerrada.motivo, 'string')
  assert.ok(cerrada.motivo.length > 10, 'el motivo tiene que ser una frase, no una marca')
  assert.match(r.sobre_las_cerradas, /No las cuentes/)
})

/*
 * La simulación de vibraciones depende de la HORA: la máquina alterna marcha
 * y paro en un ciclo de diez minutos (`enMarchaVib`), y en paro el variador y
 * las velocidades no entregan. Un aserto sobre «cuántos sin lectura» sin fijar
 * el instante daba 2 o 30 según cuándo corriera. Se fija un instante EN MARCHA
 * y se comparan las dos entradas en ese mismo instante.
 */
let instanteEnMarcha = 0
while (!enMarchaVib(instanteEnMarcha)) instanteEnMarcha += 60_000

await checkAsync('[configurada] estado_del_sistema la lee con la física del tipo: apoyos con sus cifras', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }) })
  const suya = await h.ejecutar('estado_del_sistema', { sistema: ESPEJO.id })
  assert.equal(suya.ok, true, suya.error)
  assert.equal(suya.sistema, ESPEJO.id)
  assert.equal(suya.configurada, true)
  assert.equal(suya.puntosPedidos, ESPEJO.variables.length)

  /*
   * Plan 39 F1: el estado lo compone el TIPO. Tres apoyos redactados con su
   * número, y el número es el de la física del tipo para ese apoyo en ese
   * instante —hasta el Plan 40 se comparaba con la escrita a mano, que ya no
   * existe; la física es la misma (`valorVibracionEn`)—.
   */
  assert.equal(suya.apoyos.length, 3, 'tres apoyos redactados')
  for (const [i, canal] of ['S1', 'S2', 'S3'].entries()) {
    const esperado = valorVibracionEn(puntoMedida('vRMS', canal), instanteEnMarcha)
    assert.ok(typeof esperado === 'number', `la física tiene que dar valor a ${canal} en marcha`)
    assert.ok(suya.apoyos[i].includes(`velocidad eficaz ${esperado.toFixed(3)} mm/s`), `${canal}: ${suya.apoyos[i]}`)
  }
  assert.ok(suya.variador && suya.norma && suya.servidor_de_alarmas, 'variador, norma y contadores vienen del tipo')
  assert.match(suya.aviso, new RegExp(`sistema="${ESPEJO.id}"`), 'el aviso remite a SU id')
})

await checkAsync('[configurada] estado_del_sistema(idioma: "en") narra sus apoyos en inglés y conserva su id', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }) })
  const en = await h.ejecutar('estado_del_sistema', { sistema: ESPEJO.id }, { idioma: 'en' })
  assert.equal(en.ok, true, en.error)
  assert.equal(en.sistema, ESPEJO.id, 'el id no se traduce')
  assert.equal(en.apoyos.length, 3)
  for (const a of en.apoyos) assert.match(a, /RMS velocity/)
  assert.match(en.aviso, new RegExp(`sistema="${ESPEJO.id}"`))
})

await checkAsync('[configurada] riesgos_activos la evalúa con las reglas de su TIPO', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const suya = await h.ejecutar('riesgos_activos', { sistema: ESPEJO.id })
  assert.equal(suya.ok, true, suya.error)
  // Todas las reglas del tipo se consideran: las que no se pudieron evaluar
  // van en `sin_comprobar`, nunca desaparecen.
  assert.ok(suya.reglas_evaluadas > 0, 'no evaluó ninguna regla')
  // Las reglas por apoyo se evalúan una vez POR APOYO, así que el recuento
  // supera al número de reglas del tipo; lo que no puede es superar reglas × apoyos.
  const tipo = tipoDe('vibraciones')
  assert.ok(suya.reglas_evaluadas <= tipo.reglas.length * Math.max(1, ESPEJO.apoyos?.length ?? 3),
    `evaluó ${suya.reglas_evaluadas} reglas con ${tipo.reglas.length} en el tipo`)
  assert.ok(suya.sin_comprobar, 'falta el recuento de lo que NO se pudo mirar')
})

await checkAsync('[configurada] historia_de_senal pide su serie por el nombre LITERAL del historiador, con su unidad', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }) })
  const r = await h.ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
  // El punto del historiador es LITERAL en la configuración y es el del
  // catálogo de la demo: deducirlo del nombre en vivo es el defecto B10.
  assert.equal(configurada.series.punto('vRMS_S1'), puntoHistoricoVib('vRMS_S1'))
  assert.equal(r.ok, true, r.error)
  assert.equal(r.unidad, 'mm/s')
  assert.ok(r.muestras > 0, 'el falso sirve la serie de una configurada con serie verificada (Plan 39 F2)')
  assert.match(r.senal, /Velocidad eficaz/)
})

await checkAsync('[configurada] la frecuencia del variador viaja en Hz y con los decimales de su rol', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }) })
  const r = await h.ejecutar('historia_de_senal', { senal: 'frecuencia', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.unidad, 'Hz')
  // Dos decimales, los del rol `variador:frecuencia`; el float crudo del PLC
  // no se cita tal cual (ver `metaDe` en historicos/).
  assert.ok(/^-?\d+(\.\d{1,2})?$/.test(String(r.promedio)), `promedio con más de 2 decimales: ${r.promedio}`)
})

await checkAsync('[configurada] alarma_sostenida se niega por la NATURALEZA de la señal, no por la máquina', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }) })
  const r = await h.ejecutar('alarma_sostenida', { alarma: 'vRMS_S1', sistema: ESPEJO.id })
  assert.equal(r.ok, false)
  assert.match(r.error, /medida continua/, 'una velocidad eficaz no es una alarma booleana')
  assert.doesNotMatch(r.error, /del tanque/, 'hasta el Plan 39 F2 se negaba por no ser el tanque')
})

await checkAsync('[configurada] resumen_de_turno le pide la tendencia de sus series, no una lista vacía', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }) })
  const r = await h.ejecutar('resumen_de_turno', { sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
  assert.equal(r.ok, true, r.error)
  // Hasta el Plan 39 F2 pedía `series.claves()`, que no existe, y la
  // tendencia salía `null` para TODAS las máquinas.
  assert.ok(r.tendencia?.ok, 'la tendencia de las series con historia tiene que venir')
  assert.ok(r.tendencia.senales.length >= 2)
  // Con su unidad donde la hay (la desviación del sensor no tiene, y viaja vacía, no inventada).
  assert.ok(r.tendencia.senales.some(s => s.unidad === 'mm/s'), 'la velocidad eficaz viaja en mm/s')
})

await checkAsync('un id de sistema que no existe NO se convierte en el tanque al leer una serie', async () => {
  // `lib/historia.mjs` hacía `SISTEMA[id] ?? SISTEMA.tanque`: con «velocidad»,
  // que existe en las dos máquinas, servía la curva del tanque sin dar error.
  const { leerSerie } = crearAyudantesDeHistoria({ client: clienteFalso(), historyConcurrencia: 2 })
  const r = await leerSerie('velocidad', { inicio: new Date(Date.now() - 3_600_000), fin: new Date() }, 'no-existe')
  assert.equal(r.ok, false)
  assert.match(r.motivo, /no-existe/)
})

await checkAsync('[configurada] diagnosticar_falla acepta su id y llega al motor', async () => {
  const motorDiagnostico = {
    async diagnosticar({ sistema, riesgoId }) {
      return { sistema, riesgoId, huerfano: false, causas: [] }
    },
  }
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: ESPEJO.id, riesgoId: 'velocidad-fuera-de-norma' })
  assert.equal(r.ok, true, r.error)
})

check('[configurada] sin series verificadas no ofrece historia, y lo dice', () => {
  const sinSondear = construirSistema(configuracionEspejo().configurada, tipoDe('vibraciones'))
  assert.equal(sinSondear.esHistorizada('vRMS_S1'), false)
  assert.deepEqual(sinSondear.herramientas, ['estado_del_sistema', 'riesgos_activos'])
  assert.match(sinSondear.historia, /sin serie verificada/i)
})

check('[configurada] su etiqueta tiene UNA sola dueña: la escrita a mano ya no existe (Plan 40 F3)', () => {
  // Hasta el 21-09-2026 «Velocidad eficaz · Lado acople» tenía dos dueñas —la
  // escrita a mano y la espejo— y una pregunta por la etiqueta sin decir
  // máquina no podía resolverse sola. Retirada la escrita a mano, resuelve.
  assert.deepEqual(
    sistemasDeSenal('Velocidad eficaz · Lado acople').map(x => x.sistema),
    [ESPEJO.id],
  )
})

const sobreConfigurada = passed - antesDeConfigurada

/*
 * ── EL IDIOMA DE LA EVIDENCIA (i18n del asistente) ──────────────────
 *
 * `chat.mjs` ya hace que el modelo NARRE en el idioma del tablero; esto
 * comprueba que lo que se le entrega para narrar —`evidencia`, `titulo`—
 * también nace en ese idioma, con las MISMAS cifras. Sin esto, un tablero en
 * inglés le pasaba al modelo una frase española y le tocaba traducirla sobre
 * la marcha — justo lo que `chat.mjs` ya decide no permitir para la SALIDA
 * (ver su cabecera). El mismo argumento vale para lo que entra.
 */
await omitirEnvuelto('riesgos_activos(idioma: "en") narra en inglés, con las mismas cifras', async () => {
  // Nivel bajo con la bomba impulsando: activa «marcha-en-seco», que declara
  // `datos()` — el caso donde más importa que la cifra citada sea la misma.
  const client = clienteFalso({
    valores: { ...EN_REPOSO, NIVEL_TANQUE: 5, CARGA_TRABAJO_MOTOR: 60 },
  })
  const h = createHerramientas({ client })

  const es = await h.ejecutar('riesgos_activos', { sistema: 'tanque' })
  const en = await h.ejecutar('riesgos_activos', { sistema: 'tanque' }, { idioma: 'en' })

  const riesgoEs = es.riesgos.find(r => r.id === 'marcha-en-seco')
  const riesgoEn = en.riesgos.find(r => r.id === 'marcha-en-seco')

  assert.ok(riesgoEs, 'el fixture tiene que activar marcha-en-seco')
  assert.match(riesgoEs.titulo, /Riesgo de marcha en seco/)
  assert.match(riesgoEn.titulo, /Dry-running risk/)
  assert.match(riesgoEn.evidencia_medida, /5(\.0)? %/, 'la cifra tiene que seguir siendo 5, no traducida')
  assert.match(riesgoEn.evidencia_medida, /below the 25 % mark/)
})

await checkAsync('riesgos_activos(idioma: "en") en vibraciones traduce también las PALABRAS', async () => {
  // «rodamientos-sin-vigilar» agrupa tres apoyos y su evidencia enumera
  // notación (BPFO, BPFI, FTF) — no debe traducirse — dentro de una frase
  // que sí. Buen caso para las tres COMPOSICIONES que necesitan resolverse
  // antes de interpolar.
  const client = createFakeIconicsClient({ rnd: () => 0.99 })
  const h = createHerramientas({ client })

  const en = await h.ejecutar('riesgos_activos', { sistema: ESPEJO.id }, { idioma: 'en' })
  const riesgo = en.riesgos.find(r => r.id === 'rodamientos-sin-vigilar')

  assert.ok(riesgo, 'el fixture tiene que activar rodamientos-sin-vigilar')
  assert.match(riesgo.titulo, /bearing diagnosis is switched off/i)
  const evidencia = Array.isArray(riesgo.evidencia_medida) ? riesgo.evidencia_medida[0] : riesgo.evidencia_medida
  assert.match(evidencia, /BPFO, BPFI, FTF/, 'la notación no se traduce')
  assert.match(evidencia, /3 of 3/, 'la cuenta sí se narra en inglés')
})

await omitirEnvuelto('sin `idioma` (o con "es"), riesgos_activos sigue en español: no rompe nada existente', async () => {
  const client = clienteFalso({
    valores: { ...EN_REPOSO, NIVEL_TANQUE: 5, CARGA_TRABAJO_MOTOR: 60 },
  })
  const h = createHerramientas({ client })

  const sinContexto = await h.ejecutar('riesgos_activos', { sistema: 'tanque' })
  const conEs = await h.ejecutar('riesgos_activos', { sistema: 'tanque' }, { idioma: 'es' })

  assert.deepEqual(sinContexto.riesgos, conEs.riesgos)
  assert.match(sinContexto.riesgos[0].titulo, /Riesgo de marcha en seco/)
})

await checkAsync('estado_del_sistema(idioma: "en") narra los riesgos que trae dentro', async () => {
  /*
   * Los riesgos de `estado_del_sistema` pasan por `sistema.resumen()`, un
   * camino distinto al de `riesgos_activos` — hay que probar los dos. El
   * tanque no sirve de caso: `resumenTanqueParaAsistente()` no usa `riesgos`
   * en su respuesta a propósito («tiene su propia herramienta para eso», ver
   * su cabecera) — vibraciones sí, «porque es donde vive la mitad de su
   * respuesta».
   */
  const client = createFakeIconicsClient({ rnd: () => 0.99 })
  const h = createHerramientas({ client })

  const en = await h.ejecutar('estado_del_sistema', { sistema: ESPEJO.id }, { idioma: 'en' })
  const texto = JSON.stringify(en)

  assert.match(texto, /Bearing diagnosis is switched off/)
  assert.doesNotMatch(texto, /diagnóstico de rodamientos está apagado/)
})

/*
 * ── EL HALLAZGO DEL 12-09-2026: `resumen()` NUNCA RECIBÍA `idioma` ─────
 *
 * Reportado en producción: con el tablero en inglés, "How is the plant
 * doing right now?" devolvía la respuesta ENTERA en español —"Estado
 * actual de la planta", "Situación: La instalación está En reposo"—. No
 * era el modelo desobedeciendo el prompt: `estado_del_sistema` para el
 * TANQUE nunca pasa por `riesgos` (tiene su propia herramienta para eso),
 * así que su `resumen()` —nombre de instalación, estado general, nombres
 * de activo, la frase de reposo— salía siempre en español, sin que nada
 * en la cadena de `idioma` lo tocara. Vibraciones tenía el mismo hueco en
 * TODO lo que no fuera `riesgos`: nombre de sistema, la frase de cada
 * apoyo, variador, servidor de alarmas, `sin_comprobar`, `aviso`.
 */
await omitirEnvuelto('estado_del_sistema(idioma: "en") del TANQUE narra TODO el resumen, no sólo riesgos', async () => {
  const client = clienteFalso({
    valores: { ...EN_REPOSO, NIVEL_TANQUE: 54.2 },
  })
  const h = createHerramientas({ client })
  const en = await h.ejecutar('estado_del_sistema', { sistema: 'tanque' }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)
  assert.equal(en.instalacion, 'Industrial Water System')
  assert.equal(en.estadoGeneral, 'Idle')
  assert.match(en.queSignificaReposo, /is not pumping water/)
  assert.match(en.queSonLosActivos, /PARTS of this same machine/)
  assert.equal(en.activos[0].activo, 'Storage Tank')
  assert.equal(en.activos[0].responde, 'Is there water, and in what condition?')
  const nivel = en.activos.flatMap((a) => a.senales).find((s) => s.clave === 'nivelTanque')
  assert.equal(nivel.senal, 'Tank Level')
  assert.equal(nivel.estado, 'In Range')
  assert.match(en.conHistoria[0], /^[A-Z]/, 'conHistoria trae sólo el label, sin clave: tiene que traducirse por texto')
  assert.doesNotMatch(JSON.stringify(en), /Nivel del tanque|Sistema de agua industrial|En reposo/)
})

await checkAsync('estado_del_sistema(idioma: "en") de VIBRACIONES narra el nombre de sistema, apoyos y avisos', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const en = await h.ejecutar('estado_del_sistema', { sistema: ESPEJO.id }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)
  /* Plan 40 F3: sin entrada escrita a mano, el nombre del sistema es el de la
     configurada, y ese no se traduce: es un identificador, no una etiqueta. */
  assert.equal(en.sistema, ESPEJO.id)
  assert.match(en.apoyos[0], /Drive end \(S1, bearing/)
  assert.match(en.apoyos[0], /RMS velocity/)
  assert.doesNotMatch(en.apoyos[0], /Lado acople|velocidad eficaz/)
  assert.match(en.servidor_de_alarmas.detalle, /Only area counters are available/)
  assert.match(en.aviso, /There IS history of its measurements/)
  /* Y el aviso inglés dejó de abrir con «ANOTHER MACHINE, not the tank», igual
     que el español (Plan 45 F2.4): las dos mitades del mismo aviso tienen que
     decir lo mismo en los dos idiomas. */
  assert.doesNotMatch(en.aviso, /ANOTHER MACHINE|not the tank/)
  assert.doesNotMatch(en.aviso, /OTRA MÁQUINA/)
})

await checkAsync('el aviso de estado no nombra la máquina cerrada, y los puntos mudos van por su id (Plan 45 F2.4)', async () => {
  /*
   * El aviso viaja DENTRO del resultado de la herramienta, donde el modelo lo
   * lee con más peso que una instrucción, y lo copia literal al final de cada
   * respuesta de estado (medido el 24-09-2026 contra el modelo real). Dos
   * cosas hacía mal:
   *
   *  · abría con «OTRA MÁQUINA, no el tanque», que introduce el nombre de una
   *    máquina cerrada en una respuesta donde nadie la mencionó. Lo que evita
   *    de verdad cruzar dos PLC es `NO_COMPARTEN`, que es código;
   *  · daba los puntos mudos CONTADOS y no nombrados, y el modelo rellenó el
   *    hueco: «probablemente alarmas o contadores del servidor de alarmas».
   *    Eran los del variador.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }) })
  const r = await h.ejecutar('estado_del_sistema', { sistema: ESPEJO.id })
  assert.equal(r.ok, true, r.error)

  assert.doesNotMatch(r.aviso, /OTRA MÁQUINA|no el tanque/)
  /* Lo que el aviso SÍ tiene que seguir diciendo: qué se puede pedir y qué no. */
  assert.match(r.aviso, /SÍ hay histórico/)
  assert.match(r.aviso, /poner plazo a una avería/)

  /* Y si hay mudos, van por su id y con la orden de no suponer de quién son. */
  assert.ok(Array.isArray(r.cuales_sin_lectura), 'los mudos tienen que viajar como lista')
  if (r.puntos_sin_lectura > 0) {
    assert.match(r.aviso, /no supongas/)
    for (const id of r.cuales_sin_lectura.slice(0, 8)) assert.ok(r.aviso.includes(id), `el aviso no nombra ${id}`)
  }
})

await checkAsync('riesgos_activos(idioma: "en") de vibraciones traduce «apoyos» agrupados, y el aviso completo', async () => {
  /*
   * `agruparPorRegla` cita `x.canalLabel` (S1→"Lado acople") y
   * `elegido.sistema.limitaciones[0]` en el aviso final — dos campos que
   * F2/F3 no tradujeron porque sólo tocaron `titulo`/`evidencia`/etc. de
   * cada riesgo, no el envoltorio que los agrupa.
   */
  /*
   * ── POR QUÉ SE BUSCA EL RIESGO Y NO SE USA `riesgos[0]` ────────────
   *
   * Esto miraba `riesgos[0]`, y por eso llevaba semanas dando un rojo
   * intermitente en CI que aquí no se reproducía —seis corridas locales
   * limpias, y en el runner «Input: 'Non-drive end'»—. El commit `3864acb` lo
   * declaró «preexistente y no relacionado» y se quedó así.
   *
   * La causa no es el azar del transporte falso (`rnd: () => 0.99` apaga el
   * caos) ni el reloj (barridas 24 h simuladas: el resultado no se mueve). Es
   * que este escenario activa CUATRO riesgos —`rodamientos-sin-vigilar`,
   * `dkw-sin-referencia`, `medida-sin-vigilar`, `alarmas-sin-reconocer`— y
   * sólo el primero agrupa los tres apoyos. El orden entre riesgos de la misma
   * severidad no está garantizado, así que `[0]` apunta a uno distinto según
   * la máquina.
   *
   * Lo que esta prueba quiere comprobar es la TRADUCCIÓN de un `apoyos`
   * agrupado, no qué riesgo sale primero. Se busca por id: si mañana el orden
   * vuelve a cambiar, esto sigue diciendo lo mismo.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const en = await h.ejecutar('riesgos_activos', { sistema: ESPEJO.id }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)

  const agrupado = (en.riesgos ?? []).find((r) => r.apoyos?.includes(','))
  assert.ok(agrupado, 'el escenario tiene que producir al menos un riesgo con varios apoyos')
  assert.match(agrupado.apoyos, /Drive end, Intermediate bearing, Non-drive end/)
  assert.doesNotMatch(agrupado.apoyos, /Lado acople/)

  // Y ningún riesgo, agrupado o no, puede quedarse con la etiqueta en español.
  for (const riesgo of en.riesgos ?? []) {
    assert.doesNotMatch(riesgo.apoyos ?? '', /Lado acople|Rodamiento intermedio|Lado libre/)
  }

  assert.match(en.aviso, /Peak acceleration on the drive-end bearing/)
  assert.doesNotMatch(en.aviso, /aceleración de pico/)
})

await omitirEnvuelto('sin `idioma`, el resumen de ambas máquinas sigue en español: no rompe nada existente', async () => {
  const h1 = createHerramientas({ client: clienteFalso() })
  const es1 = await h1.ejecutar('estado_del_sistema', { sistema: 'tanque' })
  assert.equal(es1.instalacion, 'Sistema de agua industrial')

  const h2 = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const es2 = await h2.ejecutar('estado_del_sistema', { sistema: ESPEJO.id })
  assert.match(es2.sistema, /Sistema de vibraciones — OTRA MÁQUINA/)
  assert.match(es2.apoyos[0], /Lado acople/)
})

await omitirEnvuelto('pronostico_de_desgaste(idioma: "en") narra sus mecanismos con el catálogo de dominio', async () => {
  // Reutiliza `mechanisms` de `domain.json` — el mismo catálogo que ya prueba
  // `verificar-dominio.mjs` — así que no hace falta fijar un mecanismo activo
  // concreto: basta con que los NO EVALUABLES salgan en inglés.
  const h = createHerramientas({ client: clienteFalso() })
  const en = await h.ejecutar('pronostico_de_desgaste', { sistema: 'tanque' }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)
  assert.ok(en.sin_comprobar.length > 0, 'el fixture en reposo tiene que dejar mecanismos sin exposición')
  assert.match(en.sin_comprobar[0].titulo, /^[A-Z]/, 'el título tiene que estar en inglés')
  assert.match(en.aviso, /ESTIMATED/)
})

await checkAsync('sin `sistema` no se contesta: se pregunta cuál', async () => {
  /*
   * El defecto tendría que ser el tanque, y entonces una pregunta sobre
   * vibraciones a la que el modelo olvidara el argumento se contestaría
   * CORRECTAMENTE SOBRE LA MÁQUINA EQUIVOCADA: cifras reales, unidades reales,
   * y ni un error en el log. Fallar cuesta un turno y se corrige solo.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('estado_del_sistema', {})

  assert.equal(r.ok, false)
  assert.match(r.error, /de qué sistema/i)
  assert.equal(r.sistemas.length, SISTEMAS.length, 'el fallo tiene que enseñar los ids')
})

await checkAsync('un sistema inventado no se sirve con el de al lado', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('estado_del_sistema', { sistema: 'prensa' })

  assert.equal(r.ok, false)
  assert.match(r.error, /no hay ningún sistema/i)
})

await checkAsync('una señal de OTRA máquina se resuelve sola si es inequívoca', async () => {
  /*
   * Antes el mensaje era «sólo existen las ocho de la lista», cierto del tanque
   * y mentira de la planta. Luego pasó a decir «vuelve a llamar añadiendo
   * sistema="vibraciones"», que es correcto y que el modelo de 4B **no sigue**:
   * medido con la pregunta real —el promedio de ayer de la velocidad eficaz—
   * reintentaba con otro nombre y acababa diciendo que no podía dar un dato
   * que el historiador tenía.
   *
   * Ahora, si el nombre identifica UNA sola señal en el registro, se resuelve
   * sin pedir el id: la respuesta sería la misma y el reintento sólo añadía
   * una ronda que el modelo no siempre acierta.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('historia_de_senal', {
    senal: 'Velocidad eficaz · Lado acople', periodo: 'hoy',
  })

  /* El cliente falso no simula el historiador de esta máquina, así que la
     llamada llega hasta la red y falla ahí. Lo que se fija es que llegue: que
     la señal se RESOLVIÓ en vez de rebotar por no ser del tanque. */
  assert.doesNotMatch(r.error ?? '', /no es una señal del tanque/i)
  assert.doesNotMatch(r.error ?? '', /no hay ninguna señal/i)
})

await checkAsync('una máquina sin MECANISMOS no pronostica, aunque tenga historia', async () => {
  /*
   * El punto 3 del alta, ahora por su otra mitad. Vibraciones ya tiene series
   * (28-08-2026), pero un pronóstico necesita DOS cosas: histórico del que
   * contar horas Y mecanismos de desgaste declarados que digan a qué avería
   * lleva cada condición. Sigue sin los segundos (`desgaste: null`), así que
   * sigue negándose — y ahora la negativa prueba algo distinto: que tener
   * datos no basta para afirmar una tendencia.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('pronostico_de_desgaste', { sistema: ESPEJO.id })

  assert.equal(r.ok, false)
  assert.match(r.error, /no tiene pronóstico de desgaste/i)
  assert.equal(tieneHistoria(ESPEJO.id), true, 'historia SÍ tiene; mecanismos no')
})

await checkAsync('el registro no deja dar de alta una máquina que calle sobre su historia', () => {
  // Una máquina sin series es válida; el silencio no, porque se lee como que sí
  // las tiene. Lo valida `sistemas.js` al cargarse, y aquí se comprueba que la
  // declaración existe de verdad en las dadas de alta.
  for (const sistema of SISTEMAS) {
    assert.ok(sistema.series?.nota, `«${sistema.id}» no declara qué se puede pedir de su historia`)
    assert.equal(
      tieneHistoria(sistema.id), sistema.series.historizadas().length > 0,
      `«${sistema.id}»: tieneHistoria no concuerda con su lista`,
    )
  }
})

/* ── LA MÁQUINA #3, ANTES DE QUE EXISTA ──────────────────────────────── */

console.log('\n-- Dar de alta una máquina nueva ---------------------------')

/*
 * ── POR QUÉ ESTE BLOQUE AÑADE UNA MÁQUINA EN VEZ DE RECORRER LAS DOS ──
 *
 * Los bucles `for (const sistema of SISTEMAS)` de más arriba prueban lo que
 * está dado de alta, y eso deja fuera la afirmación central del registro: que
 * dar de alta una máquina es añadir una entrada y que el resto se entera solo.
 *
 * Esa afirmación no se puede comprobar con las máquinas que ya funcionan —las
 * dos tienen motor de reglas, catálogo y herramientas escritas—, porque lo que
 * hay que ver es qué pasa con la que todavía NO tiene nada de eso. El
 * comentario de `verificar-transporte-falso` decía que la #3 «queda cubierta el
 * día que se añada»: eso cubre después del alta, y el fallo caro ocurre durante.
 *
 * Así que aquí se registra una máquina mínima de mentira y se comprueba lo
 * único que de verdad importa de ella: que **no conteste en verde**. Una
 * máquina a medio dar de alta tiene que fallar de forma visible, nunca
 * contestar «sin riesgos» de algo que nadie ha mirado.
 *
 * La entrada se quita del registro al terminar, con `finally`: este script
 * comparte el módulo con el resto de bloques y una máquina fantasma dejada
 * dentro cambiaría los recuentos de los que vienen después.
 *
 * ── UN DETALLE QUE ESTA PRUEBA DESTAPÓ ─────────────────────────────
 *
 * `SISTEMA` (el mapa por id) se construye con `Object.fromEntries` en el
 * import, así que es una INSTANTÁNEA: empujar a `SISTEMAS` no lo actualiza, y
 * `resolverSistema` —que busca por el mapa— contestaba «no hay ningún sistema
 * llamado "prensa"» sobre una entrada que sí estaba en la lista.
 *
 * En producción no es un fallo: el registro es estático y las dos estructuras
 * nacen a la vez. Pero deja dicho que dar de alta una máquina EN CALIENTE no
 * está soportado — hay que declararla en el módulo, no inyectarla— y por eso
 * el alta de prueba toca las dos a mano en vez de fingir que basta con una.
 */
const altaDePrueba = (entrada) => {
  SISTEMAS.push(entrada)
  SISTEMA[entrada.id] = entrada
}
const bajaDePrueba = (entrada) => {
  SISTEMAS.splice(SISTEMAS.indexOf(entrada), 1)
  delete SISTEMA[entrada.id]
}
await checkAsync('una máquina a medio dar de alta NO contesta «sin riesgos»', async () => {
  const RAIZ_3 = 'ac:TDCON/DEMO3/PRENSA/'
  const maquina3 = {
    id: 'prensa',
    nombre: 'Prensa hidráulica',
    maquina: 'Prensa de prueba, para verificar el alta',
    plc: 'PLC_9 · ua:DEMO9',
    raices: [RAIZ_3],
    puntos: () => [`${RAIZ_3}PRESION`],
    parse: (n) => (n.startsWith(RAIZ_3) ? { tipo: 'senal', clave: 'presion', canal: null } : null),
    modelo: (n) => (n.startsWith(RAIZ_3) ? 120 : undefined),
    estado: () => ({ senales: [], sinLectura: [], puntosPedidos: 1, dominio: {} }),
    resumen: () => ({ resumen: 'prensa de prueba' }),
    claves: () => ['presion'],
    etiquetaDe: () => 'Presión de prensa',
    esHistorizada: () => false,
    series: { historizadas: () => [], ruta: 'hda:', agregado: 'Average', nota: 'Sin histórico.' },
    desgaste: null,
    cadenciaMs: 5_000,
    mide: ['presión del circuito'],
    herramientas: ['estado_del_sistema', 'riesgos_activos'],
    historia: 'Sin histórico.',
    limitaciones: ['Máquina de prueba.'],
  }

  altaDePrueba(maquina3)
  try {
    const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
    const r = await h.ejecutar('riesgos_activos', { sistema: 'prensa' })

    /*
     * Lo que fallaba: `evaluarRiesgosDe` no tiene rama para esta máquina, su
     * `default` devolvía `evaluadas: 0`, y con eso la respuesta salía `ok: true`
     * con `riesgos: []` y —lo grave— `sin_comprobar: "ninguna: se pudieron
     * evaluar todas las reglas"`. El número decía la verdad en el JSON y la
     * frase decía lo contrario en prosa, que es lo que lee el modelo.
     */
    assert.equal(r.ok, false, 'una máquina sin motor de reglas NO puede contestar ok')
    assert.match(r.error, /no tiene motor de reglas/i)
    assert.equal(r.reglas_evaluadas, 0)
    assert.doesNotMatch(
      JSON.stringify(r), /se pudieron evaluar todas las reglas/i,
      'no puede afirmar que se evaluó todo cuando no se evaluó nada',
    )
  } finally {
    bajaDePrueba(maquina3)
  }
})

await checkAsync('una máquina nueva NO hereda el pronóstico del tanque', async () => {
  /*
   * El cuerpo de `pronostico_de_desgaste` está escrito contra el catálogo del
   * tanque. Mientras lo esté, una máquina que declare histórico y mecanismos
   * pasaría la guarda de capacidad y leería las señales del AGUA: un pronóstico
   * con cifras reales sobre la instalación equivocada.
   *
   * Por eso esta máquina de prueba SÍ declara las dos cosas — es el caso que la
   * guarda de capacidad, por sí sola, dejaba pasar.
   */
  const RAIZ_4 = 'ac:TDCON/DEMO4/HORNO/'
  const maquina4 = {
    id: 'horno',
    nombre: 'Horno de recocido',
    maquina: 'Horno de prueba, con histórico declarado',
    plc: 'PLC_8 · ua:DEMO8',
    raices: [RAIZ_4],
    puntos: () => [`${RAIZ_4}TEMP`],
    parse: (n) => (n.startsWith(RAIZ_4) ? { tipo: 'senal', clave: 'temp', canal: null } : null),
    modelo: (n) => (n.startsWith(RAIZ_4) ? 800 : undefined),
    estado: () => ({ senales: [], sinLectura: [], puntosPedidos: 1, dominio: {} }),
    resumen: () => ({ resumen: 'horno de prueba' }),
    claves: () => ['temp'],
    etiquetaDe: () => 'Temperatura de horno',
    esHistorizada: () => true,
    series: {
      historizadas: () => ['temp'], ruta: 'ac:', agregado: 'Average', nota: 'Con histórico.',
    },
    desgaste: [{ id: 'fatiga', titulo: 'Fatiga térmica' }],
    cadenciaMs: 5_000,
    mide: ['temperatura'],
    herramientas: ['estado_del_sistema'],
    historia: 'Con histórico.',
    limitaciones: ['Máquina de prueba.'],
  }

  altaDePrueba(maquina4)
  try {
    const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
    const r = await h.ejecutar('pronostico_de_desgaste', { sistema: 'horno' })

    assert.equal(r.ok, false, 'no puede pronosticar una máquina cuyo catálogo no usa')
    assert.match(r.error, /ninguna de las señales que necesitan/i, 'sus mecanismos no nombran señales con serie')
    // Y sobre todo: que no se haya colado ninguna señal del agua en la respuesta.
    assert.doesNotMatch(JSON.stringify(r), /nivelTanque|temperaturaTanque|presionRelativa/i)
  } finally {
    bajaDePrueba(maquina4)
  }
})

await checkAsync('una señal de otra máquina se reconoce sin escribir su etiqueta exacta', () => {
  /*
   * `sistemasDeSenal` sólo comparaba con `===`, y las etiquetas de esta planta
   * son compuestas: «Velocidad eficaz · Lado acople». Nadie escribe eso. Con
   * «velocidad eficaz» devolvía lista VACÍA, y quien llama —`senalDesconocida`—
   * caía al último mensaje, que hablaba sólo del tanque: «no hay ninguna señal
   * llamada así, sólo existen las ocho de la lista».
   *
   * Es decir: preguntando por una señal que SÍ existe, en la máquina de al
   * lado, el asistente contestaba que no existe en la planta.
   */
  assert.equal(sistemasDeSenal('velocidad eficaz').length, 3, 'son los tres apoyos, no cero')
  assert.ok(
    sistemasDeSenal('velocidad eficaz').every((x) => x.sistema === ESPEJO.id),
    'las tres son de la máquina de vibraciones',
  )
  // La etiqueta exacta sigue resolviendo a UNA, y gana sobre la contención.
  assert.deepEqual(
    sistemasDeSenal('Velocidad eficaz · Lado acople'),
    [{ sistema: ESPEJO.id, clave: 'vRMS_S1' }],
  )
  // Y el nombre del punto de medida basta para desambiguar sin más ayuda.
  assert.deepEqual(
    sistemasDeSenal('velocidad eficaz del lado libre'),
    [{ sistema: ESPEJO.id, clave: 'vRMS_S3' }],
  )
})

await checkAsync('«velocidad» a secas no se resuelve como «velocidad eficaz»', () => {
  /*
   * La trampa del catálogo de vibraciones: «Velocidad» (rpm del variador) es
   * subcadena de «Velocidad eficaz» (mm/s de un acelerómetro). Son dos señales,
   * dos unidades y dos sitios de la máquina.
   *
   * Al reconocer nombres parciales, una frase larga podía encajar SÓLO con la
   * corta y devolver un único resultado — que se lee como certeza. Se prefiere
   * el encaje más específico, así que la frase que nombra la eficaz no puede
   * acabar en la del variador.
   */
  const eficaz = sistemasDeSenal('velocidad eficaz').map((x) => x.clave)
  assert.ok(!eficaz.includes('velocidad'), 'la del variador no puede colarse aquí')

  /*
   * Plan 27 F4 añadió `velocidadMotor` al tanque —el mismo tag `VELOCIDAD`
   * del PDF, del variador de la BOMBA— así que «velocidad del variador» deja
   * de ser exclusiva de vibraciones: hoy nombra un concepto real en las DOS
   * máquinas, y son rpm de dos motores distintos. Preguntarlo sin decir cuál
   * es ambiguo de verdad, no una falla de resolución — es exactamente el
   * caso que `sistemasDeSenal` existe para no adivinar.
   */
  const variador = sistemasDeSenal('velocidad del variador')
  assert.equal(variador.length, 2, 'las dos máquinas tienen su propia "velocidad del variador"')
  assert.deepEqual(
    new Set(variador.map((x) => x.sistema)),
    new Set(['tanque', ESPEJO.id]),
  )
})

await checkAsync('un nombre que no existe en NINGUNA máquina no cita sólo el tanque', async () => {
  /*
   * El último mensaje de `senalDesconocida` decía «en el sistema del tanque
   * sólo existen las ocho de la lista, y no hay más puntos bajo ac:…». Cierto
   * del tanque y falso de la planta, y es el camino por el que se sale cuando
   * el nombre no se reconoce en ninguna parte — justo cuando menos se puede
   * afirmar que la lista de una máquina es la lista que importa.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('historia_de_senal', { senal: 'zumbido del compresor', periodo: 'hoy' })

  assert.equal(r.ok, false)
  assert.doesNotMatch(r.error, /sólo existen las ocho/i, 'ya no puede hablar sólo del tanque')
  assert.match(r.error, /ninguna máquina/i)
  // El error nombra todas las máquinas en las que se buscó, no una.
  for (const s of SISTEMAS) assert.ok(r.error.includes(s.nombre), `falta «${s.nombre}»`)
})

await checkAsync('una señal SIN serie sí manda al instante, y una ambigua se pregunta', async () => {
  /*
   * Las dos salidas que quedan cuando resolver sola no es posible, y son
   * distintas a propósito.
   *
   * `aPeak_S1` se resuelve —es inequívoca— pero no tiene serie: el historiador
   * devuelve ahí la de `aRMS_S1`. La salida es el valor de AHORA, que es lo
   * único que se puede dar de ella. La diferencia es de la SEÑAL y no de la
   * máquina: vibraciones tiene series para 40 de sus 73 puntos.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const sinSerie = await h.ejecutar('historia_de_senal', { senal: 'aPeak_S1', periodo: 'hoy' })

  assert.equal(sinSerie.ok, false)
  assert.match(sinSerie.error, /no tiene serie histórica propia|no tiene serie/i)

  /* Y lo AMBIGUO se sigue preguntando. Resolver sola una señal inequívoca no
     puede convertirse en elegir por quien pregunta: «velocidad eficaz» son los
     tres apoyos, y contestar por uno sería correcto sobre el punto equivocado. */
  const ambigua = await h.ejecutar('historia_de_senal', {
    senal: 'velocidad eficaz', periodo: 'hoy', sistema: ESPEJO.id,
  })

  assert.equal(ambigua.ok, false)
  assert.match(ambigua.error, /no identifica UNA señal/i)
  assert.equal(ambigua.claves.length, 3)
})

await checkAsync('un nombre corto como «DKW» encuentra su señal', async () => {
  /*
   * ── EL CASO QUE FALLÓ EN PANTALLA ──────────────────────────────
   *
   * «Como se comportó la variable DKW del Sensor 1 en vibraciones el día de
   * ayer» → «No existe el nombre DKW». Existe, y tiene serie.
   *
   * Dos causas, las dos en la resolución de nombres:
   *
   *  · «DKW» son TRES letras y la contención exigía cuatro, así que el nombre
   *    corto de la medida no llegaba a compararse. La etiqueta —«Valor
   *    característico de daño»— no contiene esas letras por ningún lado.
   *  · El registro sólo miraba la clave y la etiqueta. El catálogo declara
   *    `corto: "DKW"` desde siempre y nadie lo exponía, y «sensor 1» no era
   *    nombre de nada: el apoyo se rotula «Lado acople».
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('historia_de_senal', { senal: 'DKW del Sensor 1', periodo: 'ayer' })

  assert.doesNotMatch(r.error ?? '', /no hay ninguna señal/i, 'DKW_S1 existe y tiene serie')
  assert.doesNotMatch(r.error ?? '', /no es una señal del tanque/i)
})

await checkAsync('un ALIAS del asset puesto por quien configura encuentra la señal: «DKW del acople chiquito»', async () => {
  /*
   * Plan 42.5 F6, D15. La espejo lleva `alias: ["acople chiquito"]` en S1, como
   * lo escribiría el usuario en el editor. El alias es del ACTIVO y se
   * propaga a todas sus variables por `tipo.aliasDe`, así que ninguna
   * herramienta cambió: sólo el nombre llega más lejos.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('historia_de_senal', { senal: 'DKW del acople chiquito', periodo: 'ayer' })
  assert.doesNotMatch(r.error ?? '', /no hay ninguna señal/i, 'el alias del apoyo S1 llega a DKW_S1')

  const exactas = sistemasDeSenal('DKW del acople chiquito')
  assert.equal(exactas.length, 1, 'el alias identifica UNA señal')
  assert.equal(exactas[0].clave, 'DKW_S1')
  /* Y el alias de S1 no se le pega a S2. */
  assert.equal(sistemasDeSenal('DKW del acople chiquito').some((x) => x.clave === 'DKW_S2'), false)
})

await checkAsync('un alias de la MÁQUINA (en su activo raíz) la identifica: «vivi»', async () => {
  /*
   * Plan 42.5 F6.6. El usuario puso «vivi» como alias del activo raíz y preguntó
   * «¿qué es vivi?»: el modelo no sabía qué era y contestó de memoria. La raíz
   * ES la máquina, así que su alias es de la máquina: `resolverSistema` lo
   * acepta donde antes exigía el id, y el inventario del prompt lo dice.
   */
  const espejo = sistemaPorNombre('vivi')
  assert.ok(espejo, '«vivi» identifica una máquina')
  assert.equal(espejo.id, ESPEJO.id)
  assert.equal(sistemaPorNombre('VIVI')?.id, ESPEJO.id, 'sin distinguir mayúsculas')
  assert.equal(sistemaPorNombre(ESPEJO.nombre)?.id, ESPEJO.id, 'también por su nombre')
  assert.equal(sistemaPorNombre('vi'), null, 'un trozo no vale: exacto, no contención')

  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('estado_del_sistema', { sistema: 'vivi' })
  assert.doesNotMatch(r.error ?? '', /No hay ningún sistema/i, 'el alias resuelve la máquina')
  assert.equal(r.error, undefined, 'estado_del_sistema con el alias contesta')
})

await checkAsync('el nombre corto solo, sin apoyo, devuelve los tres', () => {
  // Reconocer más nombres no puede convertirse en elegir por quien pregunta.
  const dkw = sistemasDeSenal('DKW')
  assert.equal(dkw.length, 3)
  assert.equal(dkw.every((x) => x.clave.startsWith('DKW_')), true)

  // Y nombrar sólo el APOYO tampoco elige una medida: son diez señales suyas.
  const apoyo = sistemasDeSenal('sensor 1')
  assert.ok(apoyo.length > 1, 'el apoyo no identifica UNA señal')
  assert.equal(apoyo.every((x) => x.clave.endsWith('_S1')), true)
})

await checkAsync('lo corto no dispara dentro de otra palabra', () => {
  /* La razón del umbral de cuatro caracteres sigue viva: se conserva
     exigiendo palabra completa en vez de descartando lo corto. El «1» pegado
     a «601» no puede resolver al apoyo 1. */
  assert.deepEqual(sistemasDeSenal('cota 601'), [])
  assert.deepEqual(sistemasDeSenal('zumbido del compresor'), [])
  /* Hasta el Plan 41 F2 aquí se exigía `sistemasDeSenal('601 rpm') → []`.
     Desde entonces «rpm» es palabra del oficio del tipo vibraciones y
     resuelve a la velocidad del variador —que es lo que pregunta quien dice
     «¿va a 601 rpm?»—, y el «1» sigue sin tocar el apoyo 1. */
  const rpm = sistemasDeSenal('601 rpm')
  assert.ok(rpm.length > 0, '«rpm» tiene que resolver a la velocidad del variador')
  assert.ok(rpm.every((x) => x.clave === 'velocidad'), 'y sólo a ella')
})

await checkAsync('las seis de historia sirven a cualquier máquina, no sólo al tanque', async () => {
  /*
   * ── EL CASO QUE FALLÓ EN PANTALLA ──────────────────────────────
   *
   * «Cómo se ha comportado vRMS de lado acople de diferente entre ayer y hoy»
   * → «Ayer: NO SE PUDO LEER. Hoy: NO SE PUDO LEER. No hay datos históricos
   * disponibles para esta señal.» Los había: 40 de los 73 puntos de esa
   * máquina tienen serie.
   *
   * La causa no era el dato ni el nombre: era que `comparar_periodos` y
   * `valor_en_momento` sólo servían al tanque. `historia_de_senal` se había
   * parametrizado y las otras seis no, así que el modelo elegía la herramienta
   * correcta para la pregunta y recibía «esa señal es de otra máquina».
   *
   * Peor que un error: el modelo lo redactó como **ausencia de datos**, y
   * llegó a sugerir revisar si los sensores estaban averiados. Un límite de la
   * herramienta contado como un fallo de la planta.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })

  const llamadas = [
    ['valor_en_momento', { senal: 'vRMS_S1', momento: 'ayer a las 12:00' }],
    ['comparar_periodos', { senal: 'vRMS_S1', periodoA: 'ayer', periodoB: 'hoy' }],
    ['analisis_de_senal', { senal: 'vRMS_S1', periodo: 'ayer' }],
    ['perfil_de_senal', { senal: 'vRMS_S1', dias: 7 }],
    ['grafico_de_senal', { senal: 'vRMS_S1', periodo: 'ayer' }],
    ['correlacionar_senales', { senales: ['vRMS_S1', 'aRMS_S2'], periodo: 'ayer' }],
  ]

  for (const [nombre, args] of llamadas) {
    const r = await h.ejecutar(nombre, args)
    /* El cliente falso no simula el historiador de esta máquina, así que fallan
       al leer. Lo que se fija es que LLEGUEN: que ninguna rebote por no ser del
       tanque, que era el fallo. */
    assert.doesNotMatch(
      r.error ?? '', /no es una señal del tanque|sólo sirve al tanque/i,
      `${nombre} sigue sirviendo sólo al tanque`,
    )
  }
})

await checkAsync('las seis declaran `sistema` al modelo, no sólo lo aceptan', () => {
  /*
   * Una herramienta que acepta un argumento sin anunciarlo es un argumento que
   * el modelo no usa: sólo lee el esquema. Es la mitad que se olvida, y la que
   * hace que el arreglo no sirva de nada en la conversación real.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const conSistema = [
    'historia_de_senal', 'valor_en_momento', 'comparar_periodos', 'analisis_de_senal',
    'perfil_de_senal', 'grafico_de_senal', 'correlacionar_senales',
  ]

  for (const nombre of conSistema) {
    const d = h.definiciones.find((x) => x.function.name === nombre)
    assert.ok(
      d.function.parameters.properties.sistema,
      `${nombre} acepta \`sistema\` pero no se lo dice al modelo`,
    )
  }
})

await checkAsync('el registro no acepta una máquina que no declare su comportamiento', () => {
  /*
   * `validarRegistro()` corre en el import y no se puede volver a llamar desde
   * fuera, así que lo que se fija aquí es su CRITERIO: los campos que hacen
   * ejecutable a una entrada están todos declarados en las dadas de alta. Si
   * alguien añade una máquina copiando otra y se deja `parse` o `modelo`, el
   * proceso no arranca — y esta comprobación dice cuáles son esos campos.
   */
  const obligatorios = ['raices', 'puntos', 'parse', 'modelo', 'estado', 'resumen', 'claves', 'series']
  for (const sistema of SISTEMAS) {
    for (const campo of obligatorios) {
      assert.ok(
        sistema[campo] !== undefined && sistema[campo] !== null,
        `«${sistema.id}» no declara «${campo}», y el registro tendría que haberlo impedido`,
      )
    }
  }
})

/* ── Activos frente a sistemas ───────────────────────────────────────── */

console.log('\n-- Activos frente a sistemas -------------------------------')

await omitirEnvuelto('dos ACTIVOS de la misma máquina SÍ se correlacionan', async () => {
  /*
   * El caso que falló en pantalla. Preguntado por el nivel del tanque contra la
   * presión de la red, el asistente se negó: «son sistemas separados». No lo
   * son — son dos activos del MISMO PLC, unidos por una tubería, y «el nivel
   * baja porque la presión está al mínimo» es justo la hipótesis que el
   * historiador puede confirmar o desmentir.
   *
   * El modelo ni llegó a llamar a la herramienta: se negó desde el prompt. Por
   * eso la regla dejó de vivir sólo ahí, y por eso esto se comprueba aquí.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('correlacionar_senales', {
    senales: ['nivel del tanque', 'presión relativa'],
    periodo: 'hoy',
  })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.correlaciones.length, 1, 'un par, el que se pidió')
  assert.match(r.correlaciones[0].entre, /Nivel del tanque y Presión relativa/)
})

check('las señales del tanque son de activos distintos y del MISMO sistema', () => {
  // Es la premisa de la comprobación de arriba: si algún día `nivelTanque` y
  // `presionRelativa` acabaran en sistemas distintos, aquélla pasaría a estar
  // comprobando lo contrario de lo que cree.
  const activos = new Set(['nivelTanque', 'presionRelativa'].map((k) => SENALES[k].activo))
  assert.equal(activos.size, 2, 'tienen que ser activos DISTINTOS')

  assert.equal(
    mismoSistema(pointName('nivelTanque'), pointName('presionRelativa')), true,
    'y del mismo sistema',
  )
})

await checkAsync('una señal de OTRA máquina no se cruza: se dice de cuál es y que está cerrada (Plan 44 F3.6)', async () => {
  /* Hasta el Plan 44 F3.6 esto era «cruzar dos máquinas se rechaza»: las señales
     se resolvían en toda la planta y se detectaba la mezcla después. Ahora se
     resuelven DENTRO de la máquina del turno, así que una de otra no es un
     cruce sino una señal ajena, y el código dice de quién es. */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('correlacionar_senales', {
    senales: ['nivel del tanque', 'vRMS_S1'],
    periodo: 'hoy',
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /no es una señal de «Sistema de vibraciones»/)
  assert.match(r.error, /Tanque y grupo de bombeo» \(cerrada\)/)
  assert.deepEqual(r.enOtras, ['tanque'])
})
/**
 * El cruce de máquinas, pedido COMO LO ESCRIBE UN OPERADOR.
 *
 * ── POR QUÉ ESTA PRUEBA EXISTE APARTE DE LA DE ARRIBA ──────────────
 *
 * Porque la de arriba usa claves técnicas (`vRMS_S1`) y con ellas el fallo no
 * aparece. Medido el 11-09-2026: **10 de las 42 etiquetas de vibraciones
 * resolvían a una señal del tanque**, porque el índice del tanque engancha
 * «velocidad» dentro de «Velocidad eficaz · Lado acople» por su respaldo de
 * contención, y al resolver las dos al tanque la guarda de `NO_COMPARTEN` no
 * saltaba: para el código eran de la misma máquina.
 *
 * El resultado era `ok: true` con una señal de vibraciones renombrada a
 * «Velocidad calculada del motor» bajo `sistema: "tanque"`. Cifras reales de
 * la máquina equivocada, sin error en ninguna parte — el modo de fallo que el
 * CLAUDE.md señala como el peor, y contra la regla nº 1 del proyecto.
 *
 * Se prueba con el nombre completo de catálogo a propósito: es el que devuelve
 * `estado_del_sistema`, o sea el que el modelo ha leído justo antes de
 * preguntar, y el que un técnico escribiría.
 */
await checkAsync('una señal ajena se detecta con el NOMBRE, no sólo con la clave, en las dos herramientas de varias señales', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  for (const herramienta of ['correlacionar_senales', 'tendencia_multiple']) {
    const r = await h.ejecutar(herramienta, {
      senales: ['nivel del tanque', 'Velocidad eficaz · Lado acople'],
      periodo: 'últimas 6 horas',
    })
    assert.equal(r.ok, false, `${herramienta} aceptó una señal de otra máquina`)
    assert.match(r.error, /no es una señal de «Sistema de vibraciones»/, `${herramienta}: el motivo no es la señal ajena`)
    assert.deepEqual(r.enOtras, ['tanque'], `${herramienta}: no dice de quién es`)
  }
})
/** La contrapartida: el arbitraje resuelve a la máquina buena, no se niega. */
await checkAsync('un nombre inequívoco de otra máquina resuelve a ESA máquina', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('historia_de_senal', {
    senal: 'Velocidad eficaz · Lado acople',
    periodo: 'últimas 6 horas',
  })

  // El cliente falso no sirve el historiador de vibraciones, así que la
  // lectura falla; lo que se fija es que NO la contestó el tanque.
  assert.doesNotMatch(
    r.senal ?? '', /Velocidad calculada del motor/,
    'la señal de vibraciones se contestó con una del tanque'
  )
})

/**
 * Un nombre AMBIGUO entre las dos máquinas sigue resolviendo como siempre.
 *
 * «Velocidad» a secas existe en el tanque y en vibraciones, así que el
 * arbitraje no se aplica —no es inequívoca de otra— y gana el índice del
 * tanque, que es el comportamiento anterior. La guarda corrige el caso claro
 * sin volverse una adivinanza nueva.
 */
await omitirEnvuelto('el arbitraje NO cambia lo que ya resolvía bien', async () => {
  const h = createHerramientas({ client: clienteFalso() })

  for (const nombre of ['nivel', 'presión', 'nivel del tanque', 'temperatura']) {
    const r = await h.ejecutar('historia_de_senal', { senal: nombre, periodo: 'últimas 6 horas' })
    assert.equal(r.ok, true, `"${nombre}" dejó de resolverse en el tanque: ${r.error}`)
  }
})

/**
 * Varias señales se pueden pedir como lista O como cadena.
 *
 * El 4B manda las dos formas con el mismo esquema delante, y la herramienta lo
 * perdona desde antes. Al declarar el esquema Zod como `z.array()` a secas
 * (Plan 23 F0) esa tolerancia se volvió inalcanzable: la validación rechazaba
 * la cadena antes de llegar. Esta prueba fija que las dos formas llegan — y
 * sustituye a la que, al escribirse F0, certificaba la regresión como si fuera
 * lo correcto.
 */
await omitirEnvuelto('«nivel, presión» se acepta igual que ["nivel", "presión"]', async () => {
  const h = createHerramientas({ client: clienteFalso() })

  for (const herramienta of ['correlacionar_senales', 'tendencia_multiple']) {
    const conCadena = await h.ejecutar(herramienta, {
      senales: 'nivel, presión',
      periodo: 'últimas 6 horas',
    })

    assert.doesNotMatch(
      conCadena.error ?? '', /tiene que ser una lista/,
      `${herramienta} rechazó la cadena que sabe interpretar`
    )
    assert.equal(conCadena.ok, true, `${herramienta} con cadena: ${conCadena.error}`)
  }
})

await checkAsync('dos señales de la MISMA otra máquina sí se correlacionan', async () => {
  /*
   * La contrapartida, y la que faltaba: la regla prohíbe cruzar máquinas, no
   * usar una que no sea el tanque. Con las seis herramientas de historia
   * parametrizadas, dos señales de vibraciones son una correlación legítima.
   *
   * El cliente falso no simula el historiador de esa máquina, así que la
   * llamada falla al leer. Lo que se fija es que llegue hasta ahí: que NO la
   * pare ni la resolución de nombres ni la regla de cruce.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('correlacionar_senales', {
    senales: ['vRMS_S1', 'aRMS_S2'],
    periodo: 'hoy',
  })

  assert.doesNotMatch(r.error ?? '', /no son de la misma máquina/i)
  assert.doesNotMatch(r.error ?? '', /no es una señal del tanque/i)
})

await omitirEnvuelto('el aviso de una correlación habla de la correlación, no de umbrales', async () => {
  /*
   * Visto en pantalla el 27-08-2026: al pie de una correlación aparecía «los
   * límites con los que se ha evaluado cada señal son estimaciones nuestras»,
   * sobre una respuesta que no evaluó ninguna señal contra ningún límite —esta
   * herramienta devuelve un coeficiente y unos atípicos, no estado ni banda—.
   *
   * La causa: `...avisoDeUmbrales()` iba DESPUÉS de `aviso:` en el mismo objeto
   * y usaba la misma clave, así que pisaba el aviso propio. El que se perdía
   * llevaba tres frases escritas para leerse pegado al final y no llegaba
   * nunca.
   *
   * Un aviso que no viene a cuento cuesta lo mismo que uno que falta: enseña a
   * saltarse la línea del ⚠, y entonces se pierde el día que dice algo.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const r = await h.ejecutar('correlacionar_senales', {
    senales: ['nivel del tanque', 'presión relativa'],
    periodo: 'hoy',
  })

  assert.equal(r.ok, true, r.error)
  assert.match(r.aviso, /correlaci[oó]n no es causa/i)
  assert.doesNotMatch(r.aviso, /estimaciones nuestras/i)

  // Y la premisa: esta respuesta no trae nada que un umbral pudiera calificar.
  assert.equal('banda' in r, false)
  assert.equal('estado' in r, false)
})

check('el aviso de sistemas separados declara su LÍMITE', () => {
  // Una prohibición sin su límite se aplica de más, y aplicarse de más cuesta
  // lo mismo que aplicarse de menos: una respuesta que no sirve.
  assert.match(NO_COMPARTEN, /activos/i)
  assert.match(NO_COMPARTEN, /misma máquina/i)
})

/* ── estado_del_sistema ──────────────────────────────────────────────── */

console.log('\n── estado_del_sistema ──────────────────────────────────────')

await omitirEnvuelto('todas las señales se leen en UNA sola llamada en lote', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', { sistema: 'tanque' })

  assert.equal(r.ok, true)
  assert.equal(client.lotes.length, 1, 'una petición, no una por señal')
  assert.equal(client.lotes[0].length, SENAL_KEYS.length)
})

await omitirEnvuelto('una instalación PARADA no es una instalación en alarma', async () => {
  // Es el motivo de que exista `reposo`. Sin él, caudal 0 y eficiencia 0 caen
  // bajo su límite duro y la demo abre en rojo permanente — la pantalla que
  // enseña a ignorar las alertas.
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('estado_del_sistema', { sistema: 'tanque' })

  assert.equal(r.enReposo, true)
  assert.equal(r.recuento.fueraDeLimite, 0, 'parada no es fuera de límite')
  assert.ok(r.queSignificaReposo, 'y hay que explicar qué significa')

  const senales = r.activos.flatMap(a => a.senales)
  const caudal = senales.find(s => s.clave === 'flujoInstantaneo')
  assert.equal(caudal.estado, 'En reposo')
  assert.ok(caudal.porQueReposo, 'con su explicación al lado')
})

/*
 * ── LA AUSENCIA NUNCA SE DISFRAZA DE CERO, EN LA ESPEJO (B19) ───────
 *
 * Estas comprobaciones son §2.4 de `CLAUDE.md`, el no negociable del
 * proyecto, y usaban el tanque de escenario. Se portan a la forma COMÚN del
 * estado (`leerMaquina(entrada).estado.senales`), que es la que hoy
 * construye toda máquina configurada y la que consumen el reporte, el motor
 * y las herramientas. `estado_del_sistema` de una configurada devuelve prosa
 * narrada por el tipo, así que la forma estructurada se mira donde vive.
 */
const espejoLeida = async (opciones = {}) => {
  const { leerMaquina } = crearAyudantesDeMaquina({ client: createFakeIconicsClient({ rnd: () => 0.5, ...opciones }) })
  const l = await leerMaquina(configurada)
  assert.equal(l.ok, true, l.error)
  return l.estado
}

await checkAsync('[espejo] un valor de MALA CALIDAD es un hueco, nunca un cero', async () => {
  /* Sin este filtro el asistente diría «la velocidad eficaz es 0 mm/s» de un
     apoyo que vibra, que es la peor respuesta posible: parece un dato. El
     transporte falso marca mala calidad con `CAOS.malaCalidad`, así que con
     `rnd` bajo todas las lecturas salen malas. */
  const estado = await espejoLeida({ rnd: () => 0 })
  const conValor = estado.senales.filter((s) => s.valor !== null && s.valor !== undefined)

  assert.equal(conValor.length, 0, 'con toda la calidad mala no puede quedar ni un valor')
  for (const s of estado.senales) {
    assert.notEqual(s.valor, 0, `«${s.clave}» salió como cero en vez de hueco`)
  }
  assert.ok(estado.sinLectura.length > 0, 'y los puntos sin lectura se cuentan aparte')
})

await checkAsync('[espejo] una unidad que nadie declara viaja vacía, no inventada', async () => {
  /* Inventarle una unidad a una señal es inventarse su magnitud: un número
     en mm/s y el mismo número en m/s² dicen cosas distintas. La que SÍ la
     tiene declarada la lleva; la que no, la lleva vacía y se nota. */
  const estado = await espejoLeida()

  assert.equal(estado.senales.find((s) => s.clave === 'vRMS_S1').unidad, 'mm/s')
  assert.equal(estado.senales.find((s) => s.clave === 'aRMS_S1').unidad, 'm/s²')

  for (const s of estado.senales) {
    assert.ok(
      s.unidad === null || s.unidad === undefined || typeof s.unidad === 'string',
      `«${s.clave}» tiene una unidad que no es ni texto ni vacío`,
    )
    assert.notEqual(s.unidad, 'undefined', `«${s.clave}» arrastra la cadena "undefined" como unidad`)
  }
})

await checkAsync('[espejo] cada señal declara los decimales de su rol, para no citar trece', async () => {
  /*
   * Salió probando contra el servidor REAL: ICONICS entrega `50.09765625` y
   * `23.258464813232422`, y el modelo los citaba tal cual. Trece decimales
   * sugieren una exactitud que el sensor no tiene.
   *
   * En una configurada los decimales los declara el ROL del tipo, no un
   * catálogo escrito a mano, así que lo que se comprueba es que viajen con
   * cada señal —quien narre tiene con qué redondear— y que sean sensatos.
   */
  const estado = await espejoLeida()
  for (const s of estado.senales) {
    assert.ok(Number.isInteger(s.decimales), `«${s.clave}» no declara decimales`)
    assert.ok(s.decimales >= 0 && s.decimales <= 6, `«${s.clave}» declara ${s.decimales} decimales`)
  }
  /* Una medida de vibración lleva tres, que es lo que declara su rol. */
  assert.equal(estado.senales.find((s) => s.clave === 'vRMS_S1').decimales, 3)

  /*
   * Las banderas de apoyo salen con 1 decimal por esta ruta y con 0 por
   * `metaDe`: los roles de BANDERAS no declaran `decimales` y el estado cae
   * al valor por omisión de `estadoMaquina.js`. No se afirma aquí cuál es el
   * correcto —arreglarlo cambia lo que el asistente cita— y queda como B20.
   * Lo que sí se exige es que los dos caminos no se contradigan en las
   * MEDIDAS, que son las que llevan cifras que alguien lee.
   */
  for (const s of estado.senales.filter((x) => x.clave.startsWith('vRMS') || x.clave.startsWith('aRMS'))) {
    assert.equal(s.decimales, configurada.metaDe(s.clave)?.decimales, `«${s.clave}» discrepa entre el estado y metaDe`)
  }
})

await checkAsync('[espejo] un hueco y un booleano no se confunden con cero', async () => {
  const estado = await espejoLeida()
  const sinLectura = estado.senales.filter((s) => s.valor === null || s.valor === undefined)

  assert.ok(sinLectura.length > 0, 'la espejo tiene puntos sin lectura: son los que importan aquí')
  for (const s of sinLectura) {
    assert.notEqual(s.valor, 0, `«${s.clave}» es un hueco y salió como cero`)
    assert.notEqual(s.valor, false, `«${s.clave}» es un hueco y salió como false`)
  }
  /* Y al revés: un booleano apagado es `false`/0 de verdad, no un hueco. */
  const bandera = estado.senales.find((s) => s.clave === 'alarma_S1')
  assert.ok(bandera.valor !== null && bandera.valor !== undefined, 'la bandera SÍ tiene lectura')
})

await omitirEnvuelto('la booleana se dice con su palabra, no con true/false', async () => {
  // `modoVdf` es `nominal` (ni alarma ni reposo): desde el Plan 27
  // (compactación del contexto, 10-09-2026) una señal nominal viaja con la
  // forma mínima, pero `texto` —el propio valor legible— sigue presente
  // aun ahí, no es parte de lo que se recorta.
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('estado_del_sistema', { sistema: 'tanque' })
  const modo = r.activos.flatMap(a => a.senales).find(s => s.clave === 'modoVdf')

  assert.equal(modo.texto, 'Automático')

  // La nota sí se recorta en una señal nominal: se comprueba directamente
  // en el dominio, que es donde vive de verdad y no depende de este resumen.
  assert.ok(SENALES.modoVdf.nota, 'y el catálogo confiesa que la correspondencia no está confirmada')
})

await omitirEnvuelto('el aviso de umbrales viaja en el campo QUE VIGILA la red de seguridad', async () => {
  /*
   * Va en el RESULTADO y no sólo en el prompt: una advertencia que sólo vive
   * en las instrucciones se diluye a los tres turnos de conversación.
   *
   * Y va en el campo `aviso` concretamente, que es el que `chat.mjs` mira para
   * añadirlo detrás cuando el modelo no lo cuenta. Con cualquier otro nombre
   * el aviso sigue viéndose en el JSON —así que a veces el modelo lo dice— y
   * la red de seguridad no salta nunca. Medido con el 4B: contestó «el nivel
   * está fuera de límite» sin decir de quién era el límite.
   */
  const h = createHerramientas({ client: clienteFalso() })

  for (const [nombre, args] of [
    ['estado_del_sistema', { sistema: 'tanque' }],
    ['historia_de_senal', { senal: 'nivel' }],
    ['comparar_periodos', { senal: 'nivel', periodoA: 'última hora', periodoB: 'hace 3 horas' }],
  ]) {
    const r = await h.ejecutar(nombre, args)
    if (PROVISIONALES) {
      assert.ok(r.aviso, `${nombre} tiene que llevar el aviso en \`aviso\``)
      assert.match(r.aviso, /estimaciones|no.*confirmad/i)
    }
  }
})

await checkAsync('[espejo] ninguna marca de tiempo llega al modelo como ISO en crudo', async () => {
  /*
   * Medido con el 4B: con un ISO delante lo copió tal cual en la respuesta
   * («leído a las 2026-08-18T14:48:44.253Z»). Además va en UTC, así que aquí
   * marcaría seis horas menos que el reloj de la pared.
   *
   * La comprobación original miraba `leidoA` del tanque, que lo formateaba a
   * hora local. Una configurada NO publica esa marca por esta herramienta
   * (en la capa común `estado.leidoA` sigue siendo ISO, pero no sale de ahí),
   * así que lo que se exige es lo que de verdad importa: que en TODO lo que
   * viaja al modelo no aparezca una marca ISO cruda.
   */
  const r = await createHerramientas({ client: espejoFalso() }).ejecutar('estado_del_sistema', { sistema: ESPEJO.id })
  assert.equal(r.ok, true, r.error)

  const iso = JSON.stringify(r).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g) ?? []
  assert.deepEqual(iso, [], `una marca ISO se coló en el resultado: ${iso[0]}`)

  /* Y lo mismo por la otra puerta, la que sí da horas: los extremos de una
     serie viajan con su hora legible, no con su ISO. */
  const h = await createHerramientas({ client: espejoFalso() })
    .ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
  if (h.ok) {
    assert.doesNotMatch(String(h.maximoEn), /^\d{4}-\d{2}-\d{2}T/, `maximoEn fue "${h.maximoEn}"`)
  }
})

await omitirEnvuelto('la señal que pide atención lleva su banda, para no obligar al modelo a restar', async () => {
  // Desde el Plan 27 (compactación del contexto, 10-09-2026) sólo las
  // señales que piden algo —crítico, aviso, sin dato o reposo— llevan la
  // banda completa; una `nominal` no la necesita porque el estado ya dice
  // «En banda» y no hay nada que el modelo tenga que verificar restando. Se
  // fuerza el nivel a aviso para seguir probando que, cuando SÍ hace falta,
  // la banda entera viaja tal cual.
  const client = clienteFalso({ valores: { ...EN_REPOSO, NIVEL_TANQUE: 20 } })
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', { sistema: 'tanque' })
  const nivel = r.activos.flatMap(a => a.senales).find(s => s.clave === 'nivelTanque')

  assert.equal(nivel.estado, 'En aviso')
  assert.deepEqual(nivel.banda, {
    limiteInferior: 15, avisoInferior: 25, avisoSuperior: 90, limiteSuperior: 95,
  })

  // `null` en un extremo es «sin límite», no cero. Leído como 0 marcaría en
  // rojo media instalación. `cargaMotor` está en reposo en el fixture, y
  // reposo también lleva detalle completo.
  const carga = r.activos.flatMap(a => a.senales).find(s => s.clave === 'cargaMotor')
  assert.equal(carga.banda.limiteInferior, 'sin límite')
})

await omitirEnvuelto('un servidor caído se cuenta como tal y no como instalación vacía', async () => {
  const client = {
    async readPoints() { return { ok: false, error: 'ICONICS no responde', status: 502 } },
    async readHistory() { return { ok: false, status: 502 } },
  }
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', { sistema: 'tanque' })

  assert.equal(r.ok, false)
  assert.match(r.error, /no se pudo leer/i)
})

/* ── historia_de_senal · LA GUARDA ───────────────────────────────────── */

console.log('\n── historia_de_senal · la guarda ───────────────────────────')

await omitirEnvuelto('pedir la historia de una señal NO historizada no llega a la red', async () => {
  /*
   * La invariante cara de todo el archivo.
   *
   * El servidor NO da error: devuelve `ok: true`, con marcas de tiempo
   * correctas, y la serie de `TEMPERATURA_TANQUE`. Así que no basta con
   * comprobar que la herramienta falla — hay que comprobar que **no preguntó**.
   * Si algún día alguien mueve la guarda detrás de la llamada, esto se cae.
   */
  // Desde el 14-09-2026 el catálogo del tanque está historizado por
  // completo (ver más arriba): se apagan las dos banderas sólo para esta
  // prueba, y se restauran al final, para seguir ejercitando la guarda sin
  // depender de una señal real que ya no existe en el catálogo.
  for (const k of ['cargaMotor', 'eficienciaEnergetica']) SENALES[k].historizado = false
  try {
    const client = clienteFalso()
    const h = createHerramientas({ client })

    for (const nombre of ['carga del motor', 'eficiencia energética']) {
      const r = await h.ejecutar('historia_de_senal', { senal: nombre })
      assert.equal(r.ok, false, `"${nombre}" no puede devolver serie`)
      assert.match(r.error, /no tiene serie hist[oó]rica propia/i)
      // Cuántas hay se lee del catálogo, no de un número escrito aquí: la lista
      // crece según se configuren en el Data Historian.
      assert.equal(r.senalesConHistoria?.length, historizadas().length, 'y decir cuáles sí la tienen')
    }

    assert.equal(client.historial.length, 0, 'NINGUNA pudo salir a la red')
  } finally {
    for (const k of ['cargaMotor', 'eficienciaEnergetica']) SENALES[k].historizado = true
  }
})

await omitirEnvuelto('el modo del variador ya tiene serie (Plan 27 F6)', async () => {
  // Hasta el 10-09-2026 era el ejemplo de señal SIN historia; F6 le confirmó
  // la suya (`hda:...MANDO_DEL_VARIADOR_VFD:MODO_AM_VDF`). El 14-09-2026 se
  // le confirmó la suya también a `cargaMotor` y `eficienciaEnergetica`, así
  // que hoy el catálogo del tanque está historizado por completo.
  const client = clienteFalso()
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'modo del variador' })

  assert.equal(r.ok, true, r.error)
  assert.equal(client.historial.length, 1)
})

await checkAsync('[espejo] las que SÍ tienen serie se leen con Average y por el punto histórico', async () => {
  const client = espejoFalso()
  const h = createHerramientas({ client })

  for (const clave of ['vRMS_S1', 'aRMS_S1', 'vRMS_S2', 'velocidad']) {
    const r = await h.ejecutar('historia_de_senal', { senal: clave, sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
    assert.equal(r.ok, true, `"${clave}" falló: ${r.error}`)
  }

  assert.equal(client.historial.length, 4)
  for (const llamada of client.historial) {
    /* `Average` y no `Interpolative`: son magnitudes instantáneas, ninguna
       acumulativa. */
    assert.equal(llamada.aggregate, 'Average')
    /* Plan 27 F6: el histórico se pide por su punto de archivo, no por el
       nombre en vivo. En esta máquina el archivo es `hda:`. */
    assert.ok(llamada.pointName.startsWith('hda:'), `con hda:, no con «${llamada.pointName}»`)
    assert.match(llamada.interval, /^\d{2}:\d{2}:\d{2}$/, 'el intervalo va como HH:MM:SS')
  }
})

await checkAsync('[espejo] un rango largo se trocea (Plan 15 Fase 4): no cae en el patrón "1 muestra de todo el mes"', async () => {
  /* Medido contra el servidor real: una ventana de 30 días pedida en UNA
     sola llamada con un intervalo grueso devolvía una única muestra de todo
     el mes, sin ningún error — el patrón patológico que documenta
     planificar()/trocear(). Aquí se comprueba que hace VARIAS llamadas y
     fusiona sus datos. La respuesta se sustituye para que el recuento no
     dependa de cuántas muestras invente el transporte falso. */
  let llamadas = 0
  const client = espejoFalso({
    historia: async (opciones) => {
      llamadas += 1
      return { ok: true, data: [{ timestamp: opciones.startDate, value: 1 + llamadas / 100, quality: 0 }] }
    },
  })

  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', {
    senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimos 30 días',
  })

  assert.equal(r.ok, true, `debería tener éxito: ${r.error}`)
  assert.ok(llamadas > 1, `llamadas=${llamadas}: un rango de 30 días debe trocearse, no ser 1 sola llamada`)
  assert.equal(r.muestras, llamadas, 'una muestra por tramo, todas fusionadas')
})

await checkAsync('[espejo] un rango largo con tramos parcialmente vacíos no falla si ALGUNO trae dato', async () => {
  /* Reproduce el caso real medido: el historiador sólo tiene datos desde hace
     unos días, así que un período de 30 días tiene ~20 tramos vacíos y unos
     pocos con dato. Un tramo sin datos no debe invalidar el resto. */
  let llamada = 0
  const client = espejoFalso({
    historia: async () => {
      llamada += 1
      return llamada % 2 === 0
        ? { ok: true, data: [{ timestamp: new Date().toISOString(), value: 1.2, quality: 0 }] }
        : { ok: true, data: [] }
    },
  })

  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', {
    senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimos 60 días',
  })

  assert.equal(r.ok, true, `no debería fallar por tramos parciales: ${r.error}`)
  assert.ok(r.muestras > 0, 'al menos los tramos con dato deben contarse')
})

await checkAsync('[espejo] nunca se piden más muestras de las que el servidor entrega', async () => {
  /* Si se piden más, el servidor recorta y devuelve una serie incompleta SIN
     decirlo: el máximo de un día sería el de sus primeras horas. */
  const client = espejoFalso()
  await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'ayer' })

  const { startDate, endDate, interval } = client.historial[0]
  const segundos = (new Date(endDate) - new Date(startDate)) / 1000
  const [h, m, s] = interval.split(':').map(Number)
  const puntos = segundos / (h * 3600 + m * 60 + s)

  assert.ok(puntos <= MAX_PUNTOS, `pidió ${Math.round(puntos)} puntos, el tope es ${MAX_PUNTOS}`)
})

await checkAsync('[espejo] el resumen trae los extremos CON su hora, y no las muestras crudas', async () => {
  /* Devolverle 24 muestras al modelo y pedirle el mayor es pedirle aritmética,
     que es justo lo que el prompt le prohíbe. */
  const r = await createHerramientas({ client: espejoFalso() })
    .ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true)
  for (const campo of ['minimo', 'maximo', 'promedio', 'primero', 'ultimo', 'muestras']) {
    assert.ok(r[campo] !== undefined, `falta ${campo}`)
  }
  assert.ok(r.minimoEn && r.maximoEn, 'un extremo sin su hora no se puede contrastar')
  assert.ok(r.minimo <= r.maximo)
  assert.equal(r.fuente, 'historiador')
})

await omitirEnvuelto('una señal que sólo vale en marcha lo advierte en su historia', async () => {
  // La instalación está parada casi siempre, así que un promedio de caudal
  // cercano a cero refleja las horas en reposo y no una avería.
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', { senal: 'caudal', periodo: 'ayer' })

  assert.ok(r.avisoReposo, 'el caudal sólo significa algo con la bomba en marcha')
})

await checkAsync('[espejo] sin ninguna muestra se dice, en vez de devolver un resumen de ceros', async () => {
  /* Un resumen de ceros sobre una serie vacía es §2.4 de CLAUDE.md al revés:
     la ausencia disfrazada del dato más creíble que hay. */
  const client = espejoFalso({ historia: async () => ({ ok: true, data: [] }) })
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id })

  assert.equal(r.ok, false)
  assert.match(r.error, /no hay ninguna muestra/i)
})

await checkAsync('toda la serie de mala calidad es un hueco, no una serie de ceros', async () => {
  const client = clienteFalso({
    historia: async () => ({
      ok: true,
      data: [{ timestamp: new Date().toISOString(), value: 0, quality: 24 }],
    }),
  })
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'nivel' })

  assert.equal(r.ok, false, 'una muestra mala no es una muestra')
})

await checkAsync('[espejo] un 502 manda a levantar servicios, no a revisar el historiador', async () => {
  /* Son dos averías que se arreglan en sitios distintos. 500 es «el punto no
     está coleccionado»; 502/504 los pone el puente y significan que no se
     llegó al servidor. */
  const client = espejoFalso({ historia: async () => ({ ok: false, status: 504 }) })
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id })

  assert.equal(r.ok, false)
  assert.match(r.error, /no se pudo contactar|GENESIS/i)
})

await omitirEnvuelto('una señal inventada devuelve el catálogo para corregirse sin otra ronda', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'el OEE' })

  assert.equal(r.ok, false)
  assert.equal(client.historial.length, 0, 'ni siquiera se pregunta')
  assert.equal(r.senales.length, SENAL_KEYS.length, 'y viaja la lista de las que sí existen')
})

/* ── comparar_periodos ───────────────────────────────────────────────── */

console.log('\n── comparar_periodos ───────────────────────────────────────')

await checkAsync('[espejo] la diferencia la calcula el backend, no el modelo', async () => {
  const r = await createHerramientas({ client: espejoFalso() }).ejecutar('comparar_periodos', {
    senal: 'vRMS_S1', sistema: ESPEJO.id, periodoA: 'últimas 4 horas', periodoB: 'última hora',
  })

  assert.equal(r.ok, true)
  assert.ok(r.diferencia, 'la resta viene hecha')
  assert.ok('promedio' in r.diferencia)
  assert.match(r.nota, /menos/, 'y se dice en qué sentido va la resta')
})

await checkAsync('[espejo] las claves son los períodos YA resueltos, no el texto del modelo', async () => {
  /* Para que redacte con el período real y no con el «ayer» que escribió él. */
  const r = await createHerramientas({ client: espejoFalso() }).ejecutar('comparar_periodos', {
    senal: 'vRMS_S1', sistema: ESPEJO.id, periodoA: 'última hora', periodoB: 'últimas 2 horas',
  })

  assert.ok(r['la última hora'], 'falta el período A resuelto')
  assert.ok(r['las últimas 2 horas'], 'falta el período B resuelto')
})

await checkAsync('comparar una señal SIN historia se niega igual, y sin salir a la red', async () => {
  // Desde el 14-09-2026 `cargaMotor` SÍ tiene serie propia (ver más arriba);
  // se apaga la bandera sólo para esta prueba, y se restaura al final, para
  // seguir ejercitando la guarda sin depender de una señal real que ya no
  // existe en el catálogo del tanque.
  SENALES.cargaMotor.historizado = false
  try {
    const client = clienteFalso()
    const r = await createHerramientas({ client }).ejecutar('comparar_periodos', {
      senal: 'carga del motor', periodoA: 'última hora', periodoB: 'ayer',
    })

    assert.equal(r.ok, false)
    assert.equal(client.historial.length, 0)
  } finally {
    SENALES.cargaMotor.historizado = true
  }
})

await checkAsync('[espejo] comparar_periodos(idioma: "en") reenvía el idioma a las DOS mitades de la comparación', async () => {
  /*
   * Llama a `historia_de_senal` dos veces por dentro, vía `dameHerramientas()`
   * —no por `ejecutar()`—, así que sin reenviar `idioma` a mano las dos
   * mitades habrían narrado siempre en español pese a pedir inglés.
   */
  const h = createHerramientas({ client: espejoFalso() })
  const en = await h.ejecutar('comparar_periodos', {
    senal: 'vRMS_S1', sistema: ESPEJO.id, periodoA: 'última hora', periodoB: 'últimas 2 horas',
  }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)
  const texto = JSON.stringify(en)
  assert.match(texto, /estimate/i, 'el aviso de umbrales tiene que llegar en inglés')
  assert.doesNotMatch(texto, /estimaciones nuestras/i, 'no en español')
})

check('bandaLegible(idioma: "en") dice «no limit», no «sin límite»', () => {
  const { limiteInferior, avisoInferior } = bandaLegible({ min: null, avisoMin: null, avisoMax: 85, max: 95 }, 'en')
  assert.equal(limiteInferior, 'no limit')
  assert.equal(avisoInferior, 'no limit')
})

check('bandaLegible() sin idioma sigue en español: no rompe nada existente', () => {
  const { limiteInferior } = bandaLegible({ min: null, avisoMin: null, avisoMax: 85, max: 95 })
  assert.equal(limiteInferior, 'sin límite')
})

/* ── El idioma de la tendencia (i18n del asistente) ──────────────────── */

console.log('\n── analisis_de_senal / perfil_de_senal: tendencia en inglés ─')

/* Portadas del tanque a la espejo (B19): la señal cambia, lo que afirman no. */
await checkAsync('[espejo] analisis_de_senal(idioma: "en") narra la dirección de la tendencia en inglés', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient() })
  const en = await h.ejecutar('analisis_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)
  assert.match(en.tendencia.direccion, /steady|rising|falling/)
  assert.doesNotMatch(en.tendencia.direccion, /estable|subiendo|bajando/)
})

await checkAsync('[espejo] sin `idioma`, analisis_de_senal sigue en español: no rompe nada existente', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient() })
  const r = await h.ejecutar('analisis_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true, r.error)
  assert.match(r.tendencia.direccion, /estable|subiendo|bajando/)
})

await checkAsync('[espejo] perfil_de_senal pide el valor de AHORA a su máquina, no al tanque (Plan 45 F3.3)', async () => {
  /*
   * Era `leerMaquina(SISTEMA.tanque)` fijo: los percentiles salían de la
   * máquina correcta y el «valor actual» de OTRA. Con el tanque cerrado eso
   * daba `null` en silencio —la tabla perdía la línea que la convierte en
   * respuesta— y, si la clave existiera en las dos, habría dado el número de
   * la máquina equivocada sin avisar.
   *
   * `vRMS_S1` es justo una clave que el tanque NO tiene, así que si se leyera
   * el tanque el actual sería `null`. Se fija el reloj en un instante EN
   * MARCHA porque parado el simulador no publica, y entonces `null` sería
   * legítimo y la comprobación no distinguiría una cosa de la otra.
   */
  const h = createHerramientas({
    client: createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha }),
  })
  const r = await h.ejecutar('perfil_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, dias: 7 })

  assert.equal(r.ok, true, r.error)
  assert.equal(typeof r.valorActual, 'number', 'el valor de ahora tiene que venir de SU máquina')
  /* Y situado dentro de su propia distribución, que es para lo que sirve: sin
     el actual, `posicionDelActual` no se puede calcular y la respuesta se
     queda en una tabla de percentiles que no dice si esto es raro. */
  assert.ok(r.posicionDelActual, 'sin valor actual no hay dónde situarlo')
})

await checkAsync('[espejo] perfil_de_senal(idioma: "en") narra sus avisos en inglés, con las mismas cifras', async () => {
  const h = createHerramientas({ client: createFakeIconicsClient() })
  const en = await h.ejecutar('perfil_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, dias: 14 }, { idioma: 'en' })
  const es = await h.ejecutar('perfil_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, dias: 14 })

  assert.equal(en.ok, true, en.error)
  /* El aviso es la frase larga de esta herramienta —«esto es lo que la planta
     ha hecho, no lo que es correcto»— y es la que más cuesta traducir bien. */
  assert.match(en.aviso, /what the plant has actually done|it says what is usual/i)
  assert.doesNotMatch(en.aviso, /instalación|historiador/i)
  assert.match(es.aviso, /lo que la instalación ha hecho|lo que es habitual/i)

  /*
   * Las CIFRAS no se comparan entre las dos llamadas: el transporte falso
   * simula ausencias y mala calidad, y su serie no es la misma dos veces
   * seguidas (ni con `rnd` fijo, porque además depende del instante). Un
   * `deepEqual` aquí mediría el azar y parpadearía. Lo que sí se exige es la
   * FORMA: los mismos campos, y números en los dos idiomas.
   */
  assert.deepEqual(Object.keys(en.percentiles).sort(), Object.keys(es.percentiles).sort())
  for (const p of Object.values(en.percentiles)) assert.ok(Number.isFinite(p), 'un percentil sin número')

  /* `posicionDelActual` sólo existe con lectura en vivo; si aparece, en
     inglés. Su ausencia contra el transporte falso no es un fallo. */
  if (en.posicionDelActual) {
    assert.match(en.posicionDelActual, /higher than \d+ % of this period's readings/)
  }
})

/* ── limites_del_manual (Plan 14 §4) ─────────────────────────────────── */

console.log('\n── limites_del_manual ───────────────────────────────────────')

await checkAsync('sin documentación cargada, lo dice y no inventa un límite', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('limites_del_manual', {
    senal: 'tensión',
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /no tiene documentación/i)
})

await checkAsync('una señal que no existe se rechaza igual que en las demás herramientas', async () => {
  const indiceDocumentos = indiceDocumentosFalso([])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('limites_del_manual', { senal: 'el OEE' })
  assert.equal(r.ok, false)
  assert.match(r.error, /ninguna máquina de esta planta/)
  assert.ok(r.sistemas.includes(ESPEJO.id))
})

await omitirEnvuelto('un número junto a una palabra de límite es un candidato citable', async () => {
  const indiceDocumentos = indiceDocumentosFalso([
    {
      archivo: 'Manual_Sistema.pdf', pagina: 12, score: 0.8,
      texto: 'La tensión de línea no debe exceder los 150 V en ningún momento de operación.',
    },
  ])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('limites_del_manual', { senal: 'tensión' })

  assert.equal(r.ok, true)
  assert.equal(r.candidatos.length, 1)
  const [cand] = r.candidatos
  assert.equal(cand.valor, 150)
  assert.equal(cand.unidad, 'v')
  assert.equal(cand.documento, 'Manual_Sistema.pdf')
  assert.equal(cand.pagina, 12)
})

await omitirEnvuelto('una página sobre la señal sin ningún patrón de límite lo dice, no inventa uno', async () => {
  const indiceDocumentos = indiceDocumentosFalso([
    { archivo: 'Manual.pdf', pagina: 3, score: 0.5, texto: 'La tensión de línea alimenta el variador de frecuencia.' },
  ])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('limites_del_manual', { senal: 'tensión' })

  assert.equal(r.ok, false)
  assert.match(r.error, /ning[uú]na tiene un n[uú]mero/i)
})

/* ── El aislamiento por máquina, alcanzable desde la conversación ────── */

await checkAsync('consultar_documentacion acota la búsqueda cuando le pasan un sistema', async () => {
  /*
   * `buscar()` sabe filtrar por sistema desde el Plan 17 F3a (G7), pero esta
   * herramienta nunca le pasaba el parámetro: el motor de diagnóstico usaba
   * el aislamiento y el técnico preguntando, no. Medido el 03-09-2026.
   */
  const indiceDocumentos = indiceDocumentosFalso([
    { archivo: 'M.pdf', pagina: 1, score: 0.9, texto: 'Procedimiento de arranque.' },
  ])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('consultar_documentacion', { pregunta: '¿cómo se arranca?', sistema: ESPEJO.id })

  assert.equal(r.ok, true)
  assert.equal(indiceDocumentos.ultimaBusqueda.sistema, ESPEJO.id,
    'la herramienta no propagó el sistema a buscar()')
})

await checkAsync('sin sistema, consultar_documentacion NO acota', async () => {
  /*
   * Omitirlo tiene que seguir buscando en todo. Una pregunta general de
   * planta no es de ninguna máquina, y acotar de más escondería el manual
   * que la contesta — por eso el parámetro es opcional y no obligatorio.
   */
  const indiceDocumentos = indiceDocumentosFalso([
    { archivo: 'M.pdf', pagina: 1, score: 0.9, texto: 'Revisión de protecciones.' },
  ])
  await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('consultar_documentacion', { pregunta: '¿cada cuánto se revisan las protecciones?' })

  assert.equal(indiceDocumentos.ultimaBusqueda.sistema, undefined,
    'acotó una búsqueda que nadie pidió acotar')
})

await checkAsync('un sistema que no existe se rechaza con la pista de dónde sacarlo', async () => {
  const indiceDocumentos = indiceDocumentosFalso([])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('consultar_documentacion', { pregunta: 'algo', sistema: 'compresor' })

  assert.equal(r.ok, false)
  assert.match(r.error, /sistemas_de_la_planta/)
  assert.equal(indiceDocumentos.ultimaBusqueda, null, 'buscó igual con un sistema inválido')
})

await checkAsync('no encontrar nada CON sistema dice que la búsqueda iba acotada', async () => {
  /*
   * Sin esta frase, «no lo encontré» tapa un tercer motivo —está
   * documentado, pero en un manual de la otra máquina— cuyo arreglo es
   * distinto a los otros dos.
   */
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos: indiceDocumentosFalso([]) })
    .ejecutar('consultar_documentacion', { pregunta: 'algo', sistema: 'tanque' })

  assert.equal(r.ok, false)
  assert.match(r.error, /s[oó]lo en la documentaci[oó]n de "tanque"/i)
  assert.equal(r.busquedaAcotadaA, 'tanque')
})

await checkAsync('limites_del_manual acota la búsqueda a la máquina DE LA SEÑAL sin que nadie se lo pida', async () => {
  const indiceDocumentos = indiceDocumentosFalso([
    { archivo: 'M.pdf', pagina: 1, score: 0.8, texto: 'La velocidad eficaz no debe exceder 4.5 mm/s.' },
  ])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('limites_del_manual', { senal: 'vRMS_S1' })
  assert.equal(indiceDocumentos.ultimaBusqueda.sistema, ESPEJO.id)
  assert.equal(r.sistema, ESPEJO.id)
})
await checkAsync('[configurada] limites_del_manual sirve a una señal de vibraciones con los términos de su TIPO', async () => {
  /*
   * Plan 39 F3. Hasta hoy esto se negaba («sólo está escrita contra el
   * catálogo del tanque»). La etiqueta sale de la máquina (`metaDe`), las
   * anclas del tipo (`terminosManual` del rol) y la búsqueda se acota a la
   * máquina, que es lo que permite que la norma —sin sistema asignado— entre.
   */
  const indiceDocumentos = indiceDocumentosFalso([
    {
      archivo: 'ISO-20816-3.pdf', pagina: 7, score: 0.9,
      texto: 'Para máquinas del grupo 2 la velocidad de vibración eficaz no debe exceder 4,5 mm/s.',
    },
  ])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('limites_del_manual', { senal: 'vRMS_S1' })

  assert.equal(r.ok, true, r.error)
  assert.equal(indiceDocumentos.ultimaBusqueda.sistema, ESPEJO.id, 'no acotó a la máquina de la señal')
  assert.equal(r.sistema, ESPEJO.id)
  assert.match(r.senal, /Velocidad eficaz/)
  assert.equal(r.unidadDeclaradaEnICONICS, 'mm/s')
  assert.equal(r.candidatos.length, 1)
  assert.equal(r.candidatos[0].valor, 4.5)
  assert.equal(r.candidatos[0].unidad, 'mm/s', 'la unidad de vibración no se reconoció')
  assert.equal(r.candidatos[0].documento, 'ISO-20816-3.pdf')
  assert.equal(r.candidatos[0].pagina, 7)
})

await checkAsync('[configurada] el límite de la aceleración no se cuela como límite de la velocidad', async () => {
  // Las anclas del tipo hacen aquí lo que `anclaDeSenal` hace con el tanque:
  // un número sólo cuenta si su oración nombra ESTA medida.
  const indiceDocumentos = indiceDocumentosFalso([
    {
      archivo: 'ISO-20816-3.pdf', pagina: 7, score: 0.9,
      texto:
        'La velocidad eficaz no debe exceder 4,5 mm/s.\n' +
        'La aceleración eficaz no debe exceder 10 m/s².',
    },
  ])
  const h = createHerramientas({ client: clienteFalso(), indiceDocumentos })

  const v = await h.ejecutar('limites_del_manual', { senal: 'vRMS_S2' })
  assert.equal(v.ok, true, v.error)
  assert.deepEqual(v.candidatos.map(c => c.valor), [4.5])

  const a = await h.ejecutar('limites_del_manual', { senal: 'aRMS_S2' })
  assert.equal(a.ok, true, a.error)
  assert.deepEqual(a.candidatos.map(c => [c.valor, c.unidad]), [[10, 'm/s²']])
})

await checkAsync('[configurada] la misma medida en tres apoyos pide desempate, y con el apoyo se resuelve', async () => {
  const indiceDocumentos = indiceDocumentosFalso([
    { archivo: 'ISO-20816-3.pdf', pagina: 7, score: 0.9, texto: 'La velocidad eficaz no debe exceder 4,5 mm/s.' },
  ])
  const h = createHerramientas({ client: clienteFalso(), indiceDocumentos })

  const ambigua = await h.ejecutar('limites_del_manual', { senal: 'velocidad eficaz' })
  assert.equal(ambigua.ok, false)
  assert.match(ambigua.error, /más de un sitio/)
  assert.ok(ambigua.candidatos.every(c => c.sistema === ESPEJO.id))

  const conApoyo = await h.ejecutar('limites_del_manual', { senal: 'velocidad eficaz S3' })
  assert.equal(conApoyo.ok, true, conApoyo.error)
  assert.match(conApoyo.senal, /S3|Lado libre/)
})

await checkAsync('[configurada] el dossier sirve a una configurada: su máquina, sus señales, sus series (Plan 44 F3.6)', async () => {
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos: indiceDocumentosFalso([]) })
    .ejecutar('diagnostico', { sintoma: 'vibra mucho', sistema: ESPEJO.id })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.sistema, ESPEJO.id)
  assert.equal(r.maquina, ESPEJO.nombre)
  assert.ok(r.senalesConsideradas.length >= 1 && r.senalesConsideradas.length <= 4)
  assert.ok(r.medido, 'trae la parte medida aunque el estado no se pueda leer con este cliente')
})
await omitirEnvuelto('«máximo» y «mínimo» CON acento se reconocen, no sólo sin él', async () => {
  // Bug real, encontrado probando contra un PDF de verdad: el patrón sólo
  // cubría "maxim"/"minim" sin tilde, así que nunca casaba con el texto
  // normal de un manual en español, que casi siempre lleva acento.
  const indiceDocumentos = indiceDocumentosFalso([
    {
      archivo: 'M.pdf', pagina: 1, score: 0.8,
      texto: 'La presión relativa tiene un mínimo de 2 psi y un máximo de 5.8 psi.',
    },
  ])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('limites_del_manual', { senal: 'presión' })

  assert.equal(r.ok, true)
  const valores = r.candidatos.map(c => c.valor).sort((a, b) => a - b)
  assert.deepEqual(valores, [2, 5.8])
})

await omitirEnvuelto('el límite de una señal no se cuela como candidato de otra en el mismo fragmento', async () => {
  // Bug real: un fragmento de 900 caracteres habla de varias señales
  // seguidas, y sin comprobar que el nombre de la señal está en la misma
  // oración, pedir el límite de la tensión devolvía también el de la carga.
  const indiceDocumentos = indiceDocumentosFalso([
    {
      archivo: 'M.pdf', pagina: 1, score: 0.8,
      texto:
        'Tensión de línea. La tensión de línea no debe exceder los 150 V.\n' +
        'Carga del motor. La carga del motor no debe exceder el 95 por ciento.',
    },
  ])
  const h = createHerramientas({ client: clienteFalso(), indiceDocumentos })

  const tension = await h.ejecutar('limites_del_manual', { senal: 'tensión' })
  assert.equal(tension.candidatos.length, 1)
  assert.equal(tension.candidatos[0].valor, 150)

  const carga = await h.ejecutar('limites_del_manual', { senal: 'carga del motor' })
  assert.equal(carga.candidatos.length, 1)
  assert.equal(carga.candidatos[0].valor, 95)
})

await omitirEnvuelto('un rango ambiguo ("de 100 a 132") no produce un exceso falso en el diagnóstico', async () => {
  // Bug real: "rango admisible de 100 V a 132 V" capturaba el 100 —el SUELO
  // del rango— y `diagnostico` lo trataba como un techo, así que una lectura
  // normal de 121 V salía como "21 V por encima del máximo documentado".
  // "rango admisible" es ambiguo a propósito y no debe alimentar el cálculo.
  const client = clienteFalso({ valores: { ...EN_REPOSO, INDICE_DESVIACION_VOLTAJE: 121 } })
  const indiceDocumentos = indiceDocumentosFalso([
    {
      archivo: 'M.pdf', pagina: 1, score: 0.8,
      texto: 'La tensión de línea tiene un rango admisible de 100 V a 132 V.',
    },
  ])
  const r = await createHerramientas({ client, indiceDocumentos }).ejecutar('diagnostico', {
    sintoma: 'revisar la tensión de línea',
  })

  assert.equal(r.excesosSobreLimite.length, 0, 'un rango ambiguo no debe producir un exceso')
})

/* ── diagnostico (Plan 14 §4) ────────────────────────────────────────── */

console.log('\n── diagnostico ──────────────────────────────────────────────')

await checkAsync('sin síntoma no hay nada que diagnosticar', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('diagnostico', {})
  assert.equal(r.ok, false)
})

await omitirEnvuelto('el dossier trae el ESTADO de verdad, no un error escondido dentro', async () => {
  /*
   * La regresión que esto fija, medida el 03-09-2026 en las DOS máquinas.
   *
   * `diagnostico` llamaba a `estado_del_sistema()` SIN argumentos. Cuando
   * entró la segunda máquina, esa herramienta pasó a exigir `sistema`, y este
   * llamador interno se quedó sin actualizar: `estadoAhora` devolvía
   * `{error: "Falta decir de qué sistema..."}` en TODOS los diagnósticos,
   * incluidos los del tanque, que es la máquina para la que se escribió.
   *
   * Nada lo delataba: el dossier seguía saliendo con `ok: true`, así que el
   * fallo viajaba dentro de una respuesta que se declaraba correcta. Es la
   * pata que la descripción de la herramienta promete PRIMERO — «reúne el
   * estado actual, la historia…» — y llevaba semanas vacía.
   */
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('diagnostico', {
    sintoma: 'la bomba se paró tras un pico de tensión',
  })

  assert.equal(r.ok, true)
  assert.ok(!r.medido.estadoAhora.error,
    `estadoAhora llegó con un error dentro: ${r.medido.estadoAhora.error}`)
  assert.ok(r.medido.estadoAhora.estadoGeneral,
    'estadoAhora no trae `estadoGeneral`: el dossier no está mirando el estado')
})

await checkAsync('[configurada] un síntoma que nombra un apoyo mira las señales de ESE apoyo', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('diagnostico', {
    sintoma: 'la velocidad eficaz del lado libre subió tras un cambio de carga',
    sistema: ESPEJO.id,
  })
  assert.equal(r.ok, true, r.error)
  assert.ok(r.senalesConsideradas.some(s => /Lado libre/.test(s)), `no miró el lado libre: ${r.senalesConsideradas}`)
  assert.equal(r.nota, undefined, 'con señal nombrada no hace falta explicar por qué se eligieron')
})
await checkAsync('sin señal nombrada, se parte de las primeras cuatro con historia de la máquina y se dice por qué', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('diagnostico', {
    sintoma: 'algo va mal, no sé qué',
  })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.sistema, ESPEJO.id, 'sin sistema, la única en servicio')
  const esperadas = configurada.series.historizadas().slice(0, 4).map(k => configurada.etiquetaDe(k) ?? k)
  assert.deepEqual(r.senalesConsideradas, esperadas)
  assert.match(r.nota, /no nombraba ninguna señal/i)
})
await omitirEnvuelto(
  'escenario 1 · "caudal abundante con el motor muy cargado": mezcla una señal CON historia ' +
    'y otra SIN historia, y no rompe ni inventa la correlación que falta',
  async () => {
    /*
     * La señal SIN historia es la CARGA DEL MOTOR, no la tensión.
     *
     * El escenario usaba la tensión hasta el 24-08-2026, cuando pasó a servir
     * su propia serie, y pasó a la carga del motor. Desde el 14-09-2026 esa
     * también tiene serie propia (ver más arriba) — y ya no queda una tercera
     * señal real sin historia en el catálogo del tanque para heredar el
     * patrón. Lo que se prueba aquí no es esa señal en concreto sino la
     * mezcla —una con historia y otra sin ella—, así que se apaga la
     * bandera sólo durante esta prueba en vez de reescribir la invariante.
     */
    SENALES.cargaMotor.historizado = false
    try {
      const client = clienteFalso()
      const r = await createHerramientas({ client }).ejecutar('diagnostico', {
        sintoma: 'caudal abundante con el motor muy cargado',
      })

      assert.equal(r.ok, true)
      assert.deepEqual(r.senalesConsideradas.sort(), ['Caudal instantáneo', 'Carga de trabajo del motor'].sort())

      // El caudal SÍ tiene historia: tiene que haberse leído.
      assert.ok(r.medido.historia.some(h => h.senal === 'Caudal instantáneo'))
      // La carga NO tiene historia: no puede aparecer como serie leída, y
      // tampoco puede haber salido a la red a pedirla.
      assert.ok(!r.medido.historia.some(h => h.senal === 'Carga de trabajo del motor'))

      // Con una sola señal historizada de las dos consideradas, no se pide
      // correlación — y el dossier tiene que decir por qué, no callarlo.
      assert.equal(typeof r.medido.correlacion, 'string')
      assert.match(r.medido.correlacion, /al menos dos/i)
    } finally {
      SENALES.cargaMotor.historizado = true
    }
  }
)

await omitirEnvuelto(
  'escenario 2 · "parada tras un pico de tensión contra el manual": el exceso sale calculado y ' +
    'fechado contra la serie del historiador',
  async () => {
    /*
     * El límite documentado es 60 V, no 150.
     *
     * Desde el 24-08-2026 la tensión SÍ tiene serie propia, así que el exceso
     * se calcula contra el máximo del historiador —que es la fuente preferida
     * porque data el momento exacto— y no contra la lectura en vivo. El
     * simulador mueve la tensión entre ~52 y ~68 V, así que un techo de 60 es
     * el que ejercita de verdad la resta; con 150 no se excedía nada y la
     * prueba no comprobaba nada.
     */
    const client = clienteFalso()
    const indiceDocumentos = indiceDocumentosFalso([
      {
        archivo: 'Manual_Sistema.pdf', pagina: 12, score: 0.8,
        texto: 'La tensión de línea no debe exceder los 60 V en ningún momento de operación.',
      },
    ])

    const r = await createHerramientas({ client, indiceDocumentos }).ejecutar('diagnostico', {
      sintoma: 'la bomba se paró después de un pico de tensión',
    })

    assert.equal(r.ok, true)
    assert.ok(r.documentacion.porSenal.some(d => d.senal === 'Tensión de línea'))

    assert.equal(r.excesosSobreLimite.length, 1)
    const [exceso] = r.excesosSobreLimite
    assert.equal(exceso.senal, 'Tensión de línea')
    assert.equal(
      exceso.fuente, 'historiador',
      'la tensión ya tiene serie propia: el exceso se data con el historiador, no con la lectura en vivo'
    )
    assert.equal(exceso.limiteDocumentado, 60)
    assert.ok(exceso.medido > 60, 'el máximo de la serie tiene que exceder el límite')
    assert.equal(exceso.exceso, +(exceso.medido - 60).toFixed(2))
    assert.ok(exceso.cuando, 'el exceso tiene que llevar fecha/hora')
    assert.equal(exceso.documento, 'Manual_Sistema.pdf')
  }
)

await checkAsync('el dossier es repetible: mismo síntoma, mismo resultado', async () => {
  const indiceDocumentos = indiceDocumentosFalso([
    { archivo: 'M.pdf', pagina: 1, score: 0.5, texto: 'El nivel del tanque máximo admisible es 95 %.' },
  ])
  const nuevo = () => createHerramientas({ client: clienteFalso(), indiceDocumentos })

  const a = await nuevo().ejecutar('diagnostico', { sintoma: 'el nivel del tanque parece alto' })
  const b = await nuevo().ejecutar('diagnostico', { sintoma: 'el nivel del tanque parece alto' })

  /*
   * Se descartan las claves que dependen del RELOJ y no de la lógica: el
   * simulador fecha sus muestras con `Date.now()`, así que dos llamadas
   * seguidas caen en milisegundos distintos. Antes sólo se quitaban `leidoA`
   * y `cuando`, y la prueba fallaba de vez en cuando —cuando las dos
   * ejecuciones cruzaban un milisegundo— por una diferencia de `.981Z` a
   * `.982Z` que no tenía nada que ver con lo que aquí se comprueba.
   */
  const DEL_RELOJ = new Set([
    'leidoA', 'cuando',
    'minimoEn', 'maximoEn', 'desde', 'hasta',
    'minimoEnUtc', 'maximoEnUtc', 'desdeUtc', 'hastaUtc',
    'marcaDeTiempo',
  ])
  const sinReloj = (x) => JSON.stringify(x, (k, v) => (DEL_RELOJ.has(k) ? undefined : v))
  assert.equal(sinReloj(a), sinReloj(b))
})

/* ── generar_reporte (Plan 14 §5) ────────────────────────────────────── */

console.log('\n── generar_reporte ──────────────────────────────────────────')

/** Carpeta temporal aislada por prueba, para no ensuciar `datos/reportes` real. */
async function reportesTmp() {
  const dir = await mkdtemp(join(tmpdir(), 'iconics-reportes-'))
  return { dir, maxDias: 30 }
}

await checkAsync('sin período válido, error, sin tocar el historiador', async () => {
  const client = clienteFalso()
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const r = await createHerramientas({ client, reportes: await reportesTmp() }).ejecutar(
    'generar_reporte',
    { periodo: manana }
  )
  assert.equal(r.ok, false)
  assert.equal(client.historial.length, 0)
})

await checkAsync('sin carpeta de reportes configurada, se niega con un error claro', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('generar_reporte', {})
  assert.equal(r.ok, false)
  assert.match(r.error, /no están configurados/i)
})

await omitirEnvuelto(
  'señales por defecto: las que tienen historia como gráfico, el resto en tabla, y el PDF ' +
    'se escribe a disco de verdad',
  async () => {
    const reportes = await reportesTmp()
    /* `sistema` explícito desde el Plan 44 F3.4: sin él entra la ÚNICA configurada
       en servicio —aquí, la espejo—, no el tanque. Lo que esta comprobación mira
       es el reparto del catálogo del tanque, así que lo nombra. */
    const r = await createHerramientas({ client: clienteFalso(), reportes }).ejecutar(
      'generar_reporte',
      { sistema: 'tanque' }
    )

    assert.equal(r.ok, true)
    // El reparto sale del catálogo, no de una lista escrita aquí: al historizar
    // una señal más, pasa sola de la tabla al gráfico. Plan 27 F6 (10-09-2026):
    // cincuenta de las cincuenta y dos ya tenían serie propia por `hda:`; el
    // 14-09-2026 planta le dio Historical data source a las dos que quedaban
    // (`cargaMotor`, `eficienciaEnergetica`), así que hoy son las 52 — no
    // queda ninguna en tabla.
    assert.deepEqual(r.senalesConGrafico.sort(), [
      'Nivel del tanque', 'Temperatura del tanque', 'Carga de trabajo del motor',
      'Modo del variador', 'Caudal instantáneo', 'Presión relativa', 'Tensión de línea',
      'Eficiencia energética',
      'Nivel alto-alto', 'Nivel alto', 'Nivel bajo-bajo', 'Nivel bajo',
      'Presión alta', 'Falta de presión', 'Bajo flujo', 'Falla del variador',
      'Mando del proceso', 'Paro de emergencia',
      'Corriente de línea (L1)', 'Potencia reactiva (L1)',
      'Energía aparente acumulada (L1)', 'Tensión de línea (L1-N)',
      'Máximo histórico de tensión (L1-N)', 'Potencia activa (L1)',
      'Potencia aparente (L1)', 'Frecuencia de salida del variador',
      'Velocidad calculada del motor', 'Corriente de salida del variador',
      'Par estimado por el variador', 'Potencia instantánea del variador',
      'Energía acumulada del variador', 'Tensión del bus de continua',
      'Consigna de frecuencia leída del variador', 'Potencia nominal parametrizada',
      'Tensión de salida hacia el motor', 'Orden de llenado', 'Orden de vaciado',
      'Recirculación automática', 'Consigna de llenado', 'Consigna de vaciado',
      'Modo de la electroválvula inferior', 'Orden de la electroválvula inferior',
      'Bloqueo de mantenimiento (S1)', 'Estado de la electroválvula inferior',
      'Modo de la electroválvula superior', 'Orden de la electroválvula superior',
      'Bloqueo de mantenimiento (S2)', 'Estado de la electroválvula superior',
      'Modo de la bomba de aire', 'Orden de la bomba de aire',
      'Bloqueo de mantenimiento (bomba de aire)', 'Estado de la bomba de aire',
    ].sort())
    assert.deepEqual(r.senalesEnTabla.sort(), [])

    // El resultado para el modelo lleva el enlace, NUNCA el PDF — mismo
    // contrato que `grafico_de_senal` con el SVG.
    assert.equal(r._adjunto.tipo, 'reporte')
    assert.match(r._adjunto.url, /^\/api\/reportes\?id=[0-9a-f-]{36}$/i)

    const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
    const contenido = await readFile(join(reportes.dir, `${id}.pdf`))
    assert.equal(contenido.subarray(0, 4).toString(), '%PDF', 'el archivo escrito es un PDF de verdad')
  }
)

await checkAsync('[configurada] catalogo(id) da las señales de la configurada, con unidad y si tienen serie; sin id, la única en servicio', async () => {
  // Plan 39 F5: es lo que el prompt pone delante del modelo desde su pantalla.
  const h = createHerramientas({ client: clienteFalso() })
  const suyo = h.catalogo(ESPEJO.id)
  assert.equal(suyo.length, configurada.claves().length)
  const vrms = suyo.find(s => /Velocidad eficaz · Lado acople/.test(s.nombre))
  assert.ok(vrms, 'falta la velocidad eficaz del lado acople')
  assert.equal(vrms.unidad, 'mm/s')
  assert.equal(vrms.historia, true, 'vRMS_S1 está verificada en la espejo')
  assert.equal(vrms.activo, null, 'una configurada no tiene los cuatro activos del tanque')
  assert.equal(suyo.filter(s => s.historia).length, configurada.series.historizadas().length)

  /* Sin id, la única configurada en servicio (Plan 44 F3.6); el tanque, sin metaDe, no se enseña. */
  assert.deepEqual(h.catalogo().map(s => s.nombre), suyo.map(s => s.nombre))
  assert.deepEqual(h.catalogo('tanque'), [])
})

await checkAsync('[configurada] generar_reporte dibuja el PDF de una configurada con sus rótulos y su unidad', async () => {
  /*
   * Plan 39 F4. Hasta hoy se negaba («todavía se dibuja contra el catálogo
   * del tanque»). La etiqueta y la unidad salen de la entrada, la serie del
   * historiador falso (Plan 39 F2) y la banda del tipo.
   */
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar('generar_reporte', {
    sistema: ESPEJO.id,
    senales: ['vRMS_S1', 'aRMS_S2'],
    periodo: 'últimas 6 horas',
  })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.sistema, ESPEJO.id)
  assert.equal(r.instalacion, ESPEJO.nombre, 'la portada lleva el nombre de la máquina, no «Sistema de agua»')
  assert.deepEqual(r.senalesConGrafico, ['Velocidad eficaz · Lado acople', 'Aceleración eficaz · Rodamiento intermedio'])
  assert.deepEqual(r.senalesEnTabla, [])
  assert.equal(r._adjunto.tipo, 'reporte')
  assert.match(r._adjunto.titulo, new RegExp(ESPEJO.nombre))

  const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
  const contenido = await readFile(join(reportes.dir, `${id}.pdf`))
  assert.equal(contenido.subarray(0, 4).toString(), '%PDF', 'el archivo escrito es un PDF de verdad')
})

await checkAsync('[configurada] sin señales, el reporte trae TODAS las suyas: las verificadas como gráfico y el resto en tabla, en el orden de su tipo', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar('generar_reporte', {
    sistema: ESPEJO.id,
    periodo: 'últimas 6 horas',
  })

  assert.equal(r.ok, true, r.error)
  // El reparto sale de la configuración —qué series están verificadas—, no de
  // una lista escrita aquí.
  assert.equal(r.senalesConGrafico.length, configurada.series.historizadas().length)
  assert.ok(r.senalesEnTabla.length > 0, 'las señales sin serie van en tabla, no desaparecen')
  // El orden lo compone el tipo: primero los apoyos (S1, S2, S3), después el
  // variador y las alarmas. No el orden del árbol de ICONICS.
  assert.match(r.senalesConGrafico[0], /Lado acople/)
  const iApoyo = r.senalesConGrafico.findIndex(s => /Lado libre/.test(s))
  const iVariador = r.senalesConGrafico.findIndex(s => /Frecuencia|Velocidad del variador|Corriente/.test(s))
  assert.ok(iApoyo >= 0 && iVariador > iApoyo, `el variador (${iVariador}) tenía que ir después de los apoyos (${iApoyo})`)
})

await checkAsync('[configurada] un reporte es de UNA máquina por construcción: una señal de otra se dice y se omite, no se mezcla (Plan 44 F3.5)', async () => {
  /* Hasta el 23-09-2026 esto pedía `nivel` (del tanque) y `vRMS_S1` y esperaba
     «no mezcla dos máquinas». Ahora las señales se resuelven DENTRO de la
     máquina del reporte —la única en servicio, sin nombrarla—, así que `nivel`
     no es suya: se reporta como no reconocida y el PDF sale con la otra. */
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar('generar_reporte', {
    senales: ['nivel', 'vRMS_S1'], periodo: 'últimas 6 horas',
  })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.sistema, ESPEJO.id)
  assert.deepEqual(r.senalesConGrafico, ['Velocidad eficaz · Lado acople'])
  assert.ok(r.notas.some((n) => /no se reconocieron.*nivel/i.test(n)), 'la del tanque se dice, no se calla')
})

/**
 * Extrae el texto de un PDF con `pdfjs-dist`, igual que hace
 * `extraccion.worker.mjs` para los manuales. El texto de pdfkit viaja
 * comprimido (FlateDecode) dentro de los content streams, así que buscar
 * los rótulos como bytes literales del archivo no funciona — hay que
 * decodificarlo de verdad.
 */
async function textoDelPdf(buffer) {
  // `pdfjs-dist` vive en `backend/node_modules`, no en la raíz — este script
  // corre desde la raíz (`node scripts/verificar-herramientas.mjs`), así que
  // se resuelve por ruta explícita, igual que
  // `backend/ia/indices/extraccion.worker.mjs`.
  const rutaPdfjs = join(
    process.cwd(), 'backend', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'
  )
  const pdfjs = await import(pathToFileURL(rutaPdfjs).href)
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false,
  }).promise
  let texto = ''
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent()
    texto += contenido.items.map((it) => it.str).join(' ') + '\n'
  }
  return texto
}

await checkAsync('generar_reporte(idioma: "en") compone el PDF en inglés (i18n del asistente, F4)', async () => {
  /*
   * El PDF se cierra antes de que el modelo escriba nada (ver la cabecera de
   * `generar_reporte` y de `reporte.mjs`), así que esto no se puede probar
   * mirando lo que el modelo narra — hay que abrir el propio PDF.
   */
  const reportes = await reportesTmp()
  /* Sobre la espejo desde el Plan 44 F3.5: el catálogo ya no tiene rama del tanque. */
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar(
    'generar_reporte',
    { senales: ['vRMS_S1', 'aRMS_S2'], sistema: ESPEJO.id, periodo: 'últimas 6 horas' },
    { idioma: 'en' }
  )

  assert.equal(r.ok, true, r.error)
  assert.equal(r.instalacion, ESPEJO.nombre, 'la portada lleva el nombre de la máquina en cualquier idioma')

  const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
  const pdf = await readFile(join(reportes.dir, `${id}.pdf`))
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')

  const texto = await textoDelPdf(pdf)
  assert.match(texto, /TECHNICAL REPORT/, 'el título de portada tiene que estar en inglés')
  assert.match(texto, /Trends/, 'la sección de gráficos tiene que estar en inglés')
  assert.doesNotMatch(texto, /REPORTE T[EÉ]CNICO/, 'no debe quedar el título español')
})

await checkAsync('sin `idioma`, generar_reporte sigue en español: no rompe nada existente', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar(
    'generar_reporte',
    { senales: ['vRMS_S1', 'aRMS_S2'], sistema: ESPEJO.id, periodo: 'últimas 6 horas' }
  )

  assert.equal(r.ok, true, r.error)
  assert.equal(r.instalacion, ESPEJO.nombre)

  const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
  const pdf = await readFile(join(reportes.dir, `${id}.pdf`))
  const texto = await textoDelPdf(pdf)
  assert.match(texto, /REPORTE T[EÉ]CNICO/, 'el título en español tiene que seguir saliendo por defecto')
})

await omitirEnvuelto('una lista explícita de señales: sólo esas entran, no las ocho', async () => {
  // Una CON historia (gráfico) y otra SIN ella (tabla). La tensión servía de
  // ejemplo de «sin historia» hasta que pasó a tener la suya el 24-08-2026,
  // y la carga del motor hasta el 14-09-2026 — ver más arriba. Ya no queda
  // una tercera señal real sin historia en el catálogo, así que se apaga la
  // bandera sólo durante esta prueba.
  SENALES.cargaMotor.historizado = false
  try {
    const r = await createHerramientas({ client: clienteFalso(), reportes: await reportesTmp() }).ejecutar(
      'generar_reporte',
      { senales: ['nivel', 'carga del motor'] }
    )
    assert.equal(r.ok, true)
    assert.deepEqual(r.senalesConGrafico, ['Nivel del tanque'])
    assert.deepEqual(r.senalesEnTabla, ['Carga de trabajo del motor'])
  } finally {
    SENALES.cargaMotor.historizado = true
  }
})

await checkAsync('una señal inventada en la lista se ignora y se reporta, no rompe el reporte', async () => {
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes: await reportesTmp() }).ejecutar(
    'generar_reporte',
    { senales: ['vRMS_S1', 'xyzzy inexistente'], sistema: ESPEJO.id, periodo: 'últimas 6 horas' }
  )
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(r.senalesConGrafico, ['Velocidad eficaz · Lado acople'])
  assert.ok(r.notas.some(n => /no se reconocieron/i.test(n)))
})

await checkAsync('si ninguna señal pedida se reconoce, error claro y no un reporte vacío', async () => {
  const r = await createHerramientas({ client: clienteFalso(), reportes: await reportesTmp() }).ejecutar(
    'generar_reporte',
    { senales: ['inventada uno', 'inventada dos'] }
  )
  assert.equal(r.ok, false)
})

await checkAsync('la purga borra reportes más viejos que el umbral, sin tocar los recientes', async () => {
  const reportes = await reportesTmp()
  const viejo = join(reportes.dir, 'viejo.pdf')
  const reciente = join(reportes.dir, 'reciente.pdf')
  await writeFile(viejo, 'x')
  await writeFile(reciente, 'x')
  const haceMucho = new Date(Date.now() - 40 * 86400000)
  await utimes(viejo, haceMucho, haceMucho)

  await createHerramientas({ client: clienteFalso(), reportes }).ejecutar('generar_reporte', {})

  const nombres = await readdir(reportes.dir)
  assert.ok(!nombres.includes('viejo.pdf'), 'el viejo (40 días, tope 30) se purga')
  assert.ok(nombres.includes('reciente.pdf'), 'el recién creado no se toca')
})

/* ── valor_en_momento y las marcas de tiempo (el fallo de las 11:16) ─── */

console.log('\n── El momento puntual y su hora ────────────────────────────')

await omitirEnvuelto('las marcas del resumen van en HORA LOCAL, no en UTC', async () => {
  /*
   * El fallo que motivó todo esto: con `toISOString()` una serie de las 11:00
   * locales salía rotulada «17:00Z», el asistente la comparaba con la hora que
   * había escrito el operador, no coincidían, y contestaba que no tenía el
   * dato TENIÉNDOLO. Aquí se fija que la marca legible es la de la planta.
   */
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', { senal: 'nivel del tanque', periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true)
  for (const campo of ['desde', 'hasta', 'minimoEn', 'maximoEn']) {
    assert.ok(!/[TZ]/.test(r[campo]), `${campo} sigue en formato UTC: ${r[campo]}`)
    assert.match(r[campo], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, `${campo} mal formado`)
  }

  // La UTC no se pierde: la máquina la sigue necesitando.
  assert.match(r.desdeUtc, /Z$/)
  assert.equal(new Date(r.desdeUtc).getHours(), Number(r.desde.slice(11, 13)))
})

await omitirEnvuelto('una serie recortada por el servidor se declara truncada', async () => {
  /*
   * El recorte es SILENCIOSO en los datos: llega `ok: true`, con marcas
   * correctas, y sólo faltan las horas del final. Sin este aviso el modelo
   * presenta el mínimo del trozo como el del período entero — un número real
   * del período equivocado, indistinguible del bueno.
   */
  const client = clienteFalso({
    historia: ({ startDate }) => ({
      ok: true,
      hasMore: true,
      data: [{ timestamp: startDate, value: 42, quality: 0 }],
    }),
  })

  const r = await createHerramientas({ client })
    .ejecutar('historia_de_senal', { senal: 'nivel', periodo: 'ayer' })

  assert.equal(r.ok, true)
  assert.ok(r.avisoTruncada, 'una serie recortada tiene que decirlo')
  assert.match(r.avisoTruncada, /recort/i)
})

await checkAsync('sin recorte no se inventa el aviso', async () => {
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', { senal: 'nivel', periodo: 'ayer' })

  assert.equal(r.avisoTruncada, undefined, 'una serie completa no se marca como truncada')
})

await checkAsync('[espejo] valor_en_momento pide el INSTANTE, con sus minutos', async () => {
  /*
   * Los minutos son la pregunta: `resolverPeriodo` los descarta a propósito
   * —y bien, para un tramo—, así que un instante necesita su propio camino.
   * Y el agregado tiene que ser `Interpolative`: `Average` sobre un minuto
   * promedia lo que haya dentro, que ya no es «cuánto marcaba entonces».
   */
  const client = espejoFalso({
    historia: ({ startDate }) => ({
      ok: true,
      data: [{ timestamp: startDate, value: 6.1, quality: 0 }],
    }),
  })

  const r = await createHerramientas({ client })
    .ejecutar('valor_en_momento', { senal: 'vRMS_S1', sistema: ESPEJO.id, momento: '2026-08-21 a las 11:16' })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.valor, 6.1)
  assert.equal(r.exacto, false, 'un valor reconstruido no puede anunciarse como exacto')

  const pedido = client.historial[0]
  assert.equal(pedido.aggregate, 'Interpolative')

  const inicio = new Date(pedido.startDate)
  assert.equal(inicio.getHours(), 11, 'la hora local pedida')
  assert.equal(inicio.getMinutes(), 16, 'los minutos NO se redondean a la hora')
})

await checkAsync('[espejo] el sufijo de zona horaria de la planta no rompe la frase', async () => {
  /* «hora mexico» no cambia el instante —el servidor YA está en esa zona—,
     pero antes impedía que la frase se reconociera y el operador recibía un
     «no entiendo el período» a una pregunta perfectamente formada. */
  const r = await createHerramientas({ client: espejoFalso() })
    .ejecutar('historia_de_senal', {
      senal: 'vRMS_S1',
      sistema: ESPEJO.id,
      periodo: 'el 21 de agosto de 2026 a las 11:16am hora mexico',
    })

  assert.equal(r.ok, true, r.error)
  assert.match(r.periodo, /11:00/)
})

await checkAsync('una zona que NO es la de la planta se sigue rechazando', async () => {
  // Descartar «hora de españa» devolvería datos reales de la hora equivocada,
  // que es el modo de fallo que no se ve. Mejor no entender la frase.
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('valor_en_momento', { senal: 'nivel', momento: 'ayer a las 11 hora de espana' })

  assert.equal(r.ok, false)
})

await checkAsync('valor_en_momento sin hora no adivina, y el futuro se rechaza', async () => {
  const h = createHerramientas({ client: clienteFalso() })

  const sinHora = await h.ejecutar('valor_en_momento', { senal: 'nivel', momento: '2026-08-21' })
  assert.equal(sinHora.ok, false, 'un día entero no es un instante')

  const futuro = await h.ejecutar('valor_en_momento', { senal: 'nivel', momento: '2099-01-01 a las 10:00' })
  assert.equal(futuro.ok, false, 'el futuro no tiene dato')
})

await checkAsync('[espejo] valor_en_momento respeta la guarda de señales sin historia', async () => {
  /*
   * La misma regla que el resto: sin ella el servidor devuelve la curva de
   * OTRA señal bajo este nombre, y sin dar error.
   *
   * `aPeak_S1` EXISTE en esta máquina y no está historizada, que es el caso
   * que importa. La primera versión de esta portada usó una clave inventada
   * y pasaba por el motivo equivocado —«no es una señal de esta máquina»—,
   * comprobando el resolver en vez de la guarda de historia.
   */
  assert.ok(configurada.claves().includes('aPeak_S1'), 'la señal del escenario tiene que existir')
  assert.equal(configurada.esHistorizada('aPeak_S1'), false, 'y no tener serie propia')

  const r = await createHerramientas({ client: espejoFalso() })
    .ejecutar('valor_en_momento', { senal: 'aPeak_S1', sistema: ESPEJO.id, momento: 'ayer a las 11:16' })

  assert.equal(r.ok, false, 'una señal sin serie propia no puede dar un valor de archivo')
  assert.match(r.error, /no tiene serie hist[oó]rica propia/i, `el motivo tiene que ser la historia: ${r.error}`)
})

/* ── Cobertura: qué significa el recuento de puntos ──────────────────── */

console.log('\n── La cobertura del período ────────────────────────────────')

await checkAsync('[espejo] el recuento se llama `puntos`, y `muestras` sigue como alias', async () => {
  /*
   * «28 muestras registradas» hacía entender que el sensor midió 28 veces en
   * todo el día; midió decenas de miles. Lo que hay son 28 promedios de 15
   * min. El alias se mantiene porque el frontend ya lo leía.
   */
  const r = await createHerramientas({ client: espejoFalso() })
    .ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'ayer' })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.puntos, r.muestras, '`puntos` y `muestras` tienen que coincidir')
  assert.equal(r.tramoPorPunto, '15 min', 'hay que decir de cuánto es cada punto')
})

await checkAsync('[espejo] un período con huecos declara su cobertura y advierte del sesgo', async () => {
  /*
   * El caso real del 21-08-2026: 28 de 96 tramos con dato, porque la
   * instalación sólo operó de 07:30 a 17:00. El promedio es el de esas horas,
   * no el del día, y sin decirlo se lee como si fuera el del día completo.
   */
  const client = espejoFalso({
    historia: ({ startDate }) => {
      const t0 = new Date(startDate).getTime()
      /* Cuatro puntos sueltos donde caben muchos más. */
      return {
        ok: true,
        data: [0, 1, 2, 3].map((i) => ({
          timestamp: new Date(t0 + i * 900_000).toISOString(),
          value: 1 + i / 10,
          quality: 0,
        })),
      }
    },
  })

  const r = await createHerramientas({ client })
    .ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'ayer' })

  assert.equal(r.ok, true)
  assert.equal(r.tramosConDato, 4)
  assert.ok(r.tramosPosibles > 4, 'un día da para muchos más de cuatro tramos de 15 min')
  assert.ok(r.avisoCobertura, 'con huecos hay que advertir del sesgo del promedio')
  assert.match(r.avisoCobertura, /no del período completo/)
})

await checkAsync('[espejo] sin huecos no se advierte de nada', async () => {
  /* Con todos los tramos servidos el promedio SÍ es el del período, y un
     aviso sobraría: advertir siempre enseña a ignorar la advertencia. */
  const client = espejoFalso({
    historia: ({ startDate, endDate, interval }) => {
      const t0 = new Date(startDate).getTime()
      const t1 = new Date(endDate).getTime()
      const [hh, mm, ss] = String(interval).split(':').map(Number)
      const pasoMs = ((hh * 3600) + (mm * 60) + ss) * 1000
      const n = Math.max(1, Math.round((t1 - t0) / pasoMs))
      return {
        ok: true,
        data: Array.from({ length: n }, (_, i) => ({
          timestamp: new Date(t0 + i * pasoMs).toISOString(),
          value: 1 + (i % 5) / 10,
          quality: 0,
        })),
      }
    },
  })
  const r = await createHerramientas({ client })
    .ejecutar('historia_de_senal', { senal: 'vRMS_S1', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.tramosConDato, r.tramosPosibles, 'la ventana servida entera viene completa')
  assert.equal(r.avisoCobertura, undefined, 'sin huecos no se inventa un aviso')
})

await checkAsync('resumirSerie sin rejilla sigue funcionando, sin cobertura', async () => {
  // `generar_reporte` junta varios días y no tiene una rejilla única, así que
  // el parámetro es opcional y su ausencia no puede romper el resumen.
  const t = new Date('2026-08-21T10:00:00')
  const r = resumirSerie([{ t, valor: 10 }, { t: new Date(t.getTime() + 60_000), valor: 20 }], 1)

  assert.equal(r.puntos, 2)
  assert.equal(r.promedio, 15)
  assert.equal(r.tramosPosibles, undefined, 'sin rejilla no se inventa una cobertura')
})

/* ── Concurrencia acotada (Plan 15 Fase 3) ───────────────────────────── */

console.log('\n── Concurrencia acotada al leer varios días ─────────────────')

await checkAsync('[espejo] leerSerieEnRango nunca supera el tope de tramos simultáneos', async () => {
  // `readHistory` cuenta cuántas llamadas están EN VUELO a la vez: sube el
  // contador al entrar, espera un instante (para que las que arrancan juntas
  // se solapen de verdad) y lo baja al salir. Si `leerSerieEnRango` lanzara
  // todos los días de golpe (el comportamiento de antes de esta fase), el
  // pico llegaría a 30; con la cola acotada no debe pasar del tope pedido.
  let enVuelo = 0
  let pico = 0
  const client = espejoFalso({
    // Varias muestras por LLAMADA, como el servidor real: con el troceado
    // escalonado (Plan 15 Fase 2) un rango de 30 días son unos pocos tramos
    // anchos, no 30 tramos de un día — un fake que sólo diera una muestra
    // por llamada, sin importar cuánto abarque el tramo, se quedaría corto
    // de `MIN_MUESTRAS_PERFIL` antes incluso de llegar a medir concurrencia.
    historia: async (opciones) => {
      enVuelo += 1
      pico = Math.max(pico, enVuelo)
      await new Promise((resolve) => setTimeout(resolve, 5))
      enVuelo -= 1
      const dias = Math.max(
        1, Math.round((new Date(opciones.endDate) - new Date(opciones.startDate)) / 86400000)
      )
      const data = Array.from({ length: dias * 8 }, (_, i) => ({
        timestamp: new Date(new Date(opciones.startDate).getTime() + i * 3600000).toISOString(),
        value: 60,
        quality: 0,
      }))
      return { ok: true, data }
    },
  })

  const TOPE = 4
  const r = await createHerramientas({ client, historyConcurrencia: TOPE }).ejecutar(
    'perfil_de_senal',
    { senal: 'vRMS_S1', sistema: ESPEJO.id, dias: 30 }
  )

  assert.equal(r.ok, true, r.error)
  assert.ok(pico <= TOPE, `pico de llamadas simultáneas=${pico}, tope=${TOPE}`)
  assert.ok(pico > 1, `pico=${pico}: si es 1, la prueba no está midiendo concurrencia de verdad`)
})

await checkAsync('[espejo] sin pasar historyConcurrencia, el valor por defecto sigue acotando (no "todo a la vez")', async () => {
  let enVuelo = 0
  let pico = 0
  let llamadas = 0
  const client = espejoFalso({
    // Mismo criterio que la prueba anterior: varias muestras por llamada,
    // proporcional al tramo pedido, para no quedarse corto de
    // `MIN_MUESTRAS_PERFIL` con los tramos más anchos del troceado
    // escalonado (Plan 15 Fase 2).
    historia: async (opciones) => {
      llamadas += 1
      enVuelo += 1
      pico = Math.max(pico, enVuelo)
      await new Promise((resolve) => setTimeout(resolve, 5))
      enVuelo -= 1
      const dias = Math.max(
        1, Math.round((new Date(opciones.endDate) - new Date(opciones.startDate)) / 86400000)
      )
      const data = Array.from({ length: dias * 8 }, (_, i) => ({
        timestamp: new Date(new Date(opciones.startDate).getTime() + i * 3600000).toISOString(),
        value: 60,
        quality: 0,
      }))
      return { ok: true, data }
    },
  })

  /* Sin pasar `historyConcurrencia`: el defecto de la propia función (6). */
  const r = await createHerramientas({ client }).ejecutar('perfil_de_senal', {
    senal: 'vRMS_S1',
    sistema: ESPEJO.id,
    dias: 30,
  })

  assert.equal(r.ok, true, r.error)
  assert.ok(pico <= 6, `pico=${pico}, defecto=6`)
  // Con el troceado escalonado (Plan 15 Fase 2), 30 días son unos pocos
  // tramos anchos, no 30 tramos de un día — así que "todo de golpe" ya no
  // se mide en llamadas totales (siempre serán pocas), sino en que el PICO
  // de concurrencia sea menor que el total de llamadas: si coincidieran,
  // significaría que se lanzaron todas a la vez pese al tope.
  assert.ok(pico < llamadas, `pico=${pico}, llamadas=${llamadas}: deberían lanzarse en más de una tanda`)
})

/* ── diagnosticar_falla (Plan 16 Fase 4) ─────────────────────────────── */

console.log('\n── diagnosticar_falla ───────────────────────────────────────')

/** Un `motorDiagnostico` de mentira: contesta lo que se le prepare, sin tocar ninguna fuente real. */
function motorDiagnosticoFalso(respuestaPorRiesgo) {
  return {
    async diagnosticar({ sistema, riesgoId }) {
      const r = respuestaPorRiesgo[riesgoId]
      if (!r) throw new TypeError(`"${riesgoId}" no es un riesgo de "${sistema}" — no hay nada que diagnosticar.`)
      return r
    },
  }
}

await checkAsync('sin motorDiagnostico montado, se niega y no propone nada de memoria', async () => {
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque', riesgoId: 'bomba-sin-salida' })
  assert.equal(r.ok, false)
  assert.match(r.error, /motor de diagn[oó]stico/i)
})

await checkAsync('sin `sistema`, se pide en vez de adivinar', async () => {
  const motorDiagnostico = motorDiagnosticoFalso({})
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { riesgoId: 'bomba-sin-salida' })
  assert.equal(r.ok, false)
  assert.match(r.error, /sistema/i)
})

await checkAsync('sin `riesgoId`, se pide y se remite a riesgos_activos', async () => {
  const motorDiagnostico = motorDiagnosticoFalso({})
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque' })
  assert.equal(r.ok, false)
  assert.match(r.error, /riesgos_activos/i)
})

await checkAsync('un riesgoId que no encaja con el sistema no tumba la conversación', async () => {
  const motorDiagnostico = motorDiagnosticoFalso({})
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque', riesgoId: 'vibracion-en-alarma' })
  assert.equal(r.ok, false)
  assert.match(r.error, /riesgos_activos\(sistema="tanque"\)/, 'tiene que decir dónde sacar el id correcto')
})

await checkAsync('un riesgo sin causas transcritas lo dice, no una lista vacía sin más', async () => {
  const motorDiagnostico = motorDiagnosticoFalso({
    'obstruccion': { sistema: 'tanque', riesgoId: 'obstruccion', huerfano: true, causas: [] },
  })
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque', riesgoId: 'obstruccion' })
  assert.equal(r.ok, true)
  assert.deepEqual(r.causas, [])
  assert.match(r.aviso, /no tiene causas candidatas/i)
})

await checkAsync('un huérfano DELIBERADO dice por qué, y no suena a carencia', async () => {
  /*
   * Hasta el 03-09-2026 el aviso era una disyuntiva: «puede ser deliberado …
   * o puede que nadie las haya transcrito todavía». La distinción existía en
   * la cabecera de `causas.js`, en prosa, y el código no podía leerla.
   *
   * En el tanque era 1 huérfano de 10 y se toleraba. En vibraciones son 15 de
   * 18: la respuesta ambigua pasó a ser la MAYORITARIA de esa máquina, y deja
   * al técnico sin saber si el sistema está bien o incompleto.
   */
  const motorDiagnostico = motorDiagnosticoFalso({
    'variador-en-manual': {
      sistema: 'tanque', riesgoId: 'variador-en-manual', huerfano: true, causas: [],
      sinCausas: { deliberado: true, clase: 'informativo', motivo: 'El riesgo sólo informa del modo.' },
    },
  })
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque', riesgoId: 'variador-en-manual' })

  assert.equal(r.sinCausas.deliberado, true)
  assert.match(r.aviso, /es correcto que no las tenga/i)
  assert.match(r.aviso, /El riesgo sólo informa del modo/)
  // Y al modelo se le prohíbe presentarlo como algo que falta por cargar.
  assert.match(r.comoRedactar, /NO lo presentes como una carencia/i)
})

await checkAsync('un huérfano PENDIENTE admite que la pieza falta', async () => {
  const motorDiagnostico = motorDiagnosticoFalso({
    'alarma-del-modulo': {
      sistema: ESPEJO.id, riesgoId: 'alarma-del-modulo', huerfano: true, causas: [],
      sinCausas: { deliberado: false, clase: 'pendiente', motivo: 'Falta transcribirlas desde su regla.' },
    },
  })
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: ESPEJO.id, riesgoId: 'alarma-del-modulo' })

  assert.equal(r.sinCausas.deliberado, false)
  assert.match(r.aviso, /S[IÍ] deber[ií]a tener causas/i)
  assert.match(r.aviso, /pieza que nos falta/i)

  /*
   * Y la sugerencia tiene que ser de SU máquina. El dossier compuesto se
   * acotó al tanque el 03-09-2026, así que ofrecérselo para un riesgo de
   * vibraciones mandaría al modelo contra una negativa — y la mayoría de los
   * huérfanos son justamente de esa máquina.
   */
  /* Desde el Plan 44 F3.6 el dossier sirve a cualquier máquina: se ofrece con SU sistema. */
  assert.match(r.comoRedactar, new RegExp(`diagnostico\\(sintoma=\\.\\.\\., sistema="${ESPEJO.id}"\\)`))
  assert.match(r.comoRedactar, /estado_del_sistema/)
})

await checkAsync('lo que lee el TÉCNICO y lo que obedece el MODELO van separados', async () => {
  /*
   * La fuga medida el 03-09-2026. `aviso` y la instrucción al modelo eran
   * un solo campo, y el modelo hace lo que hace un modelo con la prosa que
   * recibe: copiarla. La respuesta al técnico terminaba con «Dilo así: no
   * inventes una causa para rellenar el hueco. Puedes seguir con
   * diagnostico(sintoma=...)» — el tuteo al modelo y los nombres internos
   * de las herramientas, delante del operador.
   *
   * Esta comprobación no mira si el modelo obedece —eso no es
   * determinista, va en `medir-narracion.mjs`—: mira que no le demos el
   * material para filtrarlo.
   */
  const motorDiagnostico = motorDiagnosticoFalso({
    'obstruccion': { sistema: 'tanque', riesgoId: 'obstruccion', huerfano: true, causas: [] },
  })
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque', riesgoId: 'obstruccion' })

  // El aviso es para leerlo: sin órdenes al modelo y sin nombres de herramienta.
  assert.doesNotMatch(r.aviso, /no inventes|dilo así|dilo asi/i, 'el aviso lleva una orden dirigida al modelo')
  assert.doesNotMatch(r.aviso, /diagnostico\(|consultar_documentacion|riesgos_activos/i,
    'el aviso nombra herramientas internas')

  // La instrucción existe, pero en su propio campo.
  assert.ok(r.comoRedactar, 'falta `comoRedactar`: la instrucción tiene que ir en su campo')
  assert.match(r.comoRedactar, /no inventes/i)

  /*
   * Y la frase que corrige el error concreto que cometió el modelo: explicó
   * la ausencia diciendo «el sistema no ha cargado casos resueltos para
   * este escenario». Es falso, y deja al técnico creyendo que registrando
   * casos esto se arregla.
   */
  assert.match(r.comoRedactar, /casos previos/i, 'falta la guarda contra atribuirlo a los casos')
})

await checkAsync('sin casos previos, se le PROHIBE mencionarlos — no basta con no ofrecerlos', async () => {
  /*
   * Medido el 03-09-2026 sobre `sobrepresion`: el motor devolvió `casos: 0`
   * y ningún `casosCitados` en las dos causas, y el modelo escribió «3 casos
   * previos» en las DOS. Un número inventado, dos veces, en un diagnóstico.
   *
   * No fue por falta de dato —`respaldo.casos` iba a 0 en el mismo objeto—
   * sino por la frase que dice que no mencionar casos «pierde la mitad del
   * punto» y no tenía contrapartida. Un modelo pequeño lee esa presión y
   * rellena el hueco.
   *
   * Esta comprobación mira que la prohibición esté escrita. Si obedece o no
   * es otra cosa y no es determinista: eso se mide aparte.
   */
  const motorDiagnostico = motorDiagnosticoFalso({
    'sobrepresion': {
      sistema: 'tanque', riesgoId: 'sobrepresion', huerfano: false, conflicto: false,
      causas: [{
        id: 'valvula-alivio-no-actua', titulo: 'La válvula de alivio no está actuando',
        componente: 'Válvula de alivio', banda: 'medio',
        respaldo: { datos: 2, manual: 1, casos: 0, temporal: 0, total: 3 },
        origen: 'riesgos.js', manualCitado: [{ archivo: 'm.pdf', pagina: 1 }],
        casosCitados: [], evidenciaAFavor: [], evidenciaEnContra: [],
      }],
    },
  })
  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque', riesgoId: 'sobrepresion' })

  // Sin casos, el campo ni viaja: "nada que decir no se dice".
  assert.equal(r.causas[0].casosCitados, undefined)
  assert.equal(r.causas[0].respaldo.casos, 0)

  // Y por eso la instrucción tiene que decirlo con todas las letras.
  assert.match(r.comoRedactar, /no los menciones/i, 'falta la prohibición de mencionar casos que no hay')
  assert.match(r.comoRedactar, /no des un número|no des un numero/i, 'falta la prohibición de dar un número')
})


await checkAsync('las causas llegan en el orden que da el motor, con instrucción de no reordenar', async () => {
  const motorDiagnostico = motorDiagnosticoFalso({
    'bomba-sin-salida': {
      sistema: 'tanque',
      riesgoId: 'bomba-sin-salida',
      huerfano: false,
      causas: [
        {
          id: 'valvula-impulsion-cerrada', titulo: 'Válvula cerrada', componente: 'Válvula de impulsión',
          origen: 'riesgos.js', provisional: true,
          respaldo: { datos: 3, manual: 2, casos: 2, total: 7 }, banda: 'alto',
          manualCitado: [{ archivo: 'bomba.pdf', pagina: 4 }],
          casosCitados: [{ id: 'i1', fecha: '2026-01-01', resuelto: true }],
          evidenciaAFavor: [], evidenciaEnContra: [],
        },
        {
          id: 'sin-recirculacion-minima', titulo: 'Sin recirculación', componente: 'Línea de recirculación',
          origen: 'riesgos.js', provisional: true,
          respaldo: { datos: 3, manual: 0, casos: 0, total: 3 }, banda: 'medio',
          manualCitado: [], casosCitados: [],
          evidenciaAFavor: [], evidenciaEnContra: [],
        },
      ],
    },
  })

  const r = await createHerramientas({ client: clienteFalso(), motorDiagnostico })
    .ejecutar('diagnosticar_falla', { sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

  assert.equal(r.ok, true)
  assert.equal(r.causas.length, 2)
  // El orden es el que dio el motor — la primera es la de más respaldo — y
  // no se reordena aquí por ningún criterio propio.
  assert.equal(r.causas[0].id, 'valvula-impulsion-cerrada')
  assert.equal(r.causas[1].id, 'sin-recirculacion-minima')
  assert.match(r.comoRedactar, /sin reordenarlas/i)
  assert.match(r.comoRedactar, /origen/i)
  assert.match(r.comoRedactar, /caso/i)
  // `manualCitado`/`casosCitados` vacíos no viajan: no hay nada que citar.
  assert.equal('manualCitado' in r.causas[1], false)
  assert.equal('casosCitados' in r.causas[1], false)
  assert.equal(r.causas[0].manualCitado[0].archivo, 'bomba.pdf')
})

/* ── registrar_intervencion: la puerta de voz/chat ───────────────────── */

console.log('\n── registrar_intervencion ──────────────────────────────────')

await checkAsync('un `sistema` inventado se rechaza con la lista de válidos, no escribe', async () => {
  /*
   * Plan 17 Fase 0 (G4). Antes de este cambio, `POST /api/casos` validaba
   * `sistema` con `z.enum(SISTEMA_IDS)` y esta puerta aceptaba cualquier
   * cadena — dos puertas al mismo almacén, dos reglas. Como el filtro de
   * `casos.mjs` compara `sistema` por igualdad exacta y va ANTES de
   * puntuar, un id inválido no fallaba aquí y hacía el caso invisible para
   * siempre allá, sin error, sin aviso.
   *
   * No se llama con datos reales que lleguen a `leerAprendizaje`/
   * `guardarAprendizaje`: la validación corta antes, así que esta
   * comprobación no toca `datos/aprendizaje.json` de verdad.
   */
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('registrar_intervencion', {
    sintoma: 'La bomba no arranca',
    solucion: 'Se revisó el contactor',
    sistema: 'grupo de bombeo',
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /grupo de bombeo/)
  assert.match(r.error, /tanque/)
  assert.match(r.error, /vibraciones/)
})

await checkAsync('sin `sistema` (toda la planta) no se rechaza por la validación', async () => {
  // `null` es "toda la planta", un valor válido — no debe confundirse con un
  // id desconocido. Se comprueba que la validación lo deja pasar sin llegar
  // a afirmar nada sobre el guardado (que sí toca disco).
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('registrar_intervencion', {
    sintoma: 'x'.repeat(3),
    solucion: 'y'.repeat(3),
  })

  // Falla por longitud mínima (síntoma/solución cortos), NUNCA por `sistema`.
  assert.equal(r.ok, false)
  assert.doesNotMatch(r.error, /sistema conocido/)
})

console.log('\n── cerrar_diagnostico ───────────────────────────────────────')

await checkAsync('un `causaId` que no es candidata del riesgo se rechaza con la lista de válidos', async () => {
  // No toca disco: la validación de causaId corta antes de leer/guardar.
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('cerrar_diagnostico', {
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', causaId: 'un-id-inventado', solucion: 'Se revisó todo.',
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /un-id-inventado/)
  assert.match(r.error, /valvula-impulsion-cerrada/)
  assert.match(r.error, /sin-recirculacion-minima/)
})

await checkAsync('un `riesgoId` sin causas transcritas se rechaza y remite a registrar_intervencion', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('cerrar_diagnostico', {
    // `variador-en-manual` es huérfano a propósito — mismo riesgo que usa
    // verificar-diagnostico.mjs para probar `huerfano: true`.
    sistema: 'tanque', riesgoId: 'variador-en-manual', causaId: 'x', solucion: 'Se revisó todo.',
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /registrar_intervencion/)
})

await checkAsync('sin `causaId` ni `causaLibre`, se pide uno de los dos', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('cerrar_diagnostico', {
    sistema: 'tanque', riesgoId: 'bomba-sin-salida', solucion: 'Se revisó todo.',
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /causaId.*causaLibre|causaLibre.*causaId/)
})

await checkAsync('una `propuesta` que no es candidata también se rechaza', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('cerrar_diagnostico', {
    sistema: 'tanque', riesgoId: 'bomba-sin-salida',
    causaId: 'valvula-impulsion-cerrada', propuesta: 'algo-que-no-existe', solucion: 'Se revisó todo.',
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /algo-que-no-existe/)
})

await checkAsync(
  'un cierre completo, real: se guarda con id exacto y luego se ENCUENTRA por ese id, no por texto',
  async () => {
    /*
     * Único test de este archivo que toca disco de verdad, y a propósito:
     * verificar el camino de ÉXITO completo (no sólo el rechazo) exige
     * escribir donde la herramienta de verdad escribe.
     *
     * ── SE AÍSLA CON UNA RUTA, NO CON UN `chdir` (Plan 45 F2.1) ──────
     *
     * Aquí había un `process.chdir()` a una carpeta temporal, porque la
     * factoría no aceptaba una `ruta` propia y la de fábrica era RELATIVA al
     * directorio de trabajo. Funcionaba por el mismo motivo por el que la
     * suite de backend escribía en `backend/datos/aprendizaje.json` en vez de
     * en el de la raíz: la ruta cambiaba según desde dónde se ejecutara.
     *
     * Arreglado eso, el `chdir` dejó de aislar nada —esta comprobación falló,
     * que es exactamente lo que tenía que pasar— y lo correcto es pedir la
     * ruta. El `cwd` del proceso ya no se toca.
     */
    const dirTemporal = await mkdtemp(join(tmpdir(), 'verificar-cerrar-diagnostico-'))
    const rutaAprendizaje = join(dirTemporal, 'aprendizaje.json')
    try {
      const r = await createHerramientas({
        client: clienteFalso(), rutaAprendizaje,
      }).ejecutar('cerrar_diagnostico', {
        sistema: 'tanque',
        riesgoId: 'bomba-sin-salida',
        causaId: 'sin-recirculacion-minima',
        propuesta: 'valvula-impulsion-cerrada', // lo que el sistema había propuesto primero
        solucion: 'Se abrió la línea de recirculación mínima, estaba obstruida.',
      })

      assert.equal(r.ok, true, r.error)
      assert.equal(r.causa_real, 'sin-recirculacion-minima')
      // El sistema propuso OTRA causa primero: diagnosticoCorrecto debe
      // decir que no, no quedarse sin decidir.
      assert.equal(r.diagnostico_correcto, false)

      const bruto = JSON.parse(await readFile(rutaAprendizaje, 'utf8'))
      assert.equal(bruto.intervenciones.length, 1)
      const guardado = bruto.intervenciones[0]
      assert.equal(guardado.causaReal.tipo, 'sin-recirculacion-minima')
      assert.equal(guardado.diagnostico.propuesta, 'valvula-impulsion-cerrada')
      assert.equal(guardado.diagnosticoCorrecto, false)
      assert.equal(guardado.disparador.riesgoId, 'bomba-sin-salida')

      // Y lo que de verdad importa: el motor de diagnóstico REAL, sin
      // dobles, encuentra esta corrección por id exacto — no por parecido
      // de texto — y la usa para confirmar/refutar la causa que corresponde.
      const { createIndiceCasos } = await import('../backend/ia/motor/casos.mjs')
      const { createMotorDiagnostico } = await import('../backend/ia/motor/diagnostico.mjs')
      /* El índice lee la MISMA bitácora temporal: es lo que hace que esto
         compruebe el camino entero —guardar y luego encontrar— y no dos
         mitades contra archivos distintos. */
      const indiceCasos = createIndiceCasos({ rutaAprendizaje })
      const motor = createMotorDiagnostico({ indiceCasos })
      const resultado = await motor.diagnosticar({ sistema: 'tanque', riesgoId: 'bomba-sin-salida' })

      const confirmada = resultado.causas.find((c) => c.id === 'sin-recirculacion-minima')
      const refutada = resultado.causas.find((c) => c.id === 'valvula-impulsion-cerrada')
      assert.ok(confirmada.respaldo.casos > 0, 'la causa confirmada por cerrar_diagnostico debía sumar')
      assert.ok(refutada.respaldo.casos < 0, 'la causa que el sistema propuso mal debía restar')
    } finally {
      await rm(dirTemporal, { recursive: true, force: true })
    }
  }
)

/* ── Validación de argumentos (Plan 23 F0 · IA-04) ───────────────────── */

console.log('\n── Validación de argumentos ────────────────────────────────')

check('toda herramienta anunciada tiene esquema de validación, y al revés', () => {
  const anunciadas = DEFINICIONES.map(d => d.function.name).sort()
  assert.deepEqual(
    Object.keys(ESQUEMAS).sort(),
    anunciadas,
    'lo que se le anuncia al modelo y lo que se sabe validar tienen que coincidir'
  )
})

/**
 * Las dos mitades del contrato dicen lo mismo sobre qué es obligatorio.
 *
 * El `required` del JSON Schema lo lee el modelo; el esquema Zod lo aplica el
 * backend. Si divergen, el modelo obedece una regla y el servidor exige otra —
 * exactamente el fallo que juntarlos en un archivo existe para evitar.
 */
check('lo obligatorio para el modelo es lo obligatorio para el backend', () => {
  for (const d of DEFINICIONES) {
    const nombre = d.function.name
    const requeridosDelModelo = [...(d.function.parameters?.required ?? [])].sort()

    // Los campos que el esquema Zod NO acepta ausentes.
    const forma = ESQUEMAS[nombre]._def?.shape ?? ESQUEMAS[nombre].shape ?? {}
    const requeridosDelBackend = Object.entries(forma)
      .filter(([, tipo]) => !tipo.safeParse(undefined).success)
      .map(([campo]) => campo)
      .sort()

    assert.deepEqual(
      requeridosDelBackend,
      requeridosDelModelo,
      `${nombre}: el modelo y el backend no exigen los mismos campos`
    )
  }
})

/**
 * Un tipo imposible se para ANTES de ejecutar, y se dice en español.
 *
 * Uno por cada clase de argumento que existe en el catálogo —booleano, número,
 * lista, enum y texto—, porque cada una se rechaza por un camino distinto del
 * constructor del mensaje.
 */
await checkAsync('un argumento con el tipo equivocado no llega a la herramienta', async () => {
  const client = clienteFalso()
  const h = createHerramientas({ client, readOnly: false })

  const casos = [
    ['controlar_bomba', { encender: 'sí' }, /true o false/],
    ['perfil_de_senal', { senal: 'nivel', dias: 'muchos' }, /un número.*llegó texto/],
    /* `senales` NO entra aquí: acepta lista Y cadena a propósito (ver
       `ListaDeSenales` en `definiciones.mjs`). Se prueba abajo, y se prueba
       que PASA. */
    ['analisis_de_senal', { senal: 'nivel', horizonteMinutos: 'muchos' }, /un número.*llegó texto/],
    ['estado_del_sistema', { sistema: 5 }, /texto.*llegó un número/],
    [
      'proponer_regla',
      {
        titulo: 'x', severidad: 'grave', condicion: 'x',
        senales: [], evidencia: 'x', consecuencia: 'x',
      },
      /no tiene un valor admitido/,
    ],
  ]

  for (const [nombre, argumentos, esperado] of casos) {
    const r = await h.ejecutar(nombre, argumentos)
    assert.equal(r.ok, false, `${nombre} tendría que rechazar ${JSON.stringify(argumentos)}`)
    assert.match(r.error, esperado, `${nombre} no explicó el problema`)
    assert.ok(r.argumentos_recibidos, `${nombre}: el fallo no dice qué campos llegaron`)
  }

  // Lo que de verdad importa de todo esto: la escritura nunca salió.
  assert.equal(client.escrituras.length, 0)
})

/**
 * Un requerido ausente NO lo contesta la validación: lo contesta el dominio.
 *
 * Es la decisión documentada en `problemasQueValidamos`. La prueba mira lo que
 * se perdería si alguien la revierte por parecer más estricta: la lista de ids
 * válidos y el nombre de la herramienta a la que ir, que son lo que permite al
 * modelo corregirse sin gastar otra ronda de treinta segundos.
 */
await checkAsync('un requerido que falta se contesta con la ayuda del dominio, no con Zod', async () => {
  const h = createHerramientas({ client: clienteFalso() })

  const sinSistema = await h.ejecutar('estado_del_sistema', {})
  assert.equal(sinSistema.ok, false)
  assert.match(sinSistema.error, /de qué sistema/i, 'lo contestó la validación en vez del dominio')
  assert.equal(sinSistema.sistemas.length, SISTEMAS.length, 'se perdió la lista de ids')

  /* Con el motor montado: sin él, la herramienta se niega ANTES de mirar el
     `riesgoId` y esta prueba mediría otra cosa. */
  const conMotor = createHerramientas({
    client: clienteFalso(), motorDiagnostico: motorDiagnosticoFalso({}),
  })
  const sinRiesgo = await conMotor.ejecutar('diagnosticar_falla', { sistema: 'tanque' })
  assert.equal(sinRiesgo.ok, false)
  assert.match(sinRiesgo.error, /riesgos_activos/i, 'se perdió la remisión a la otra herramienta')
})

/** Un `undefined` explícito es lo mismo que no mandarlo: no es un tipo malo. */
await checkAsync('un campo puesto a undefined cuenta como ausente, no como inválido', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('estado_del_sistema', { sistema: undefined })

  assert.equal(r.ok, false)
  assert.match(r.error, /de qué sistema/i)
  assert.ok(r.sistemas, 'tendría que haberlo contestado el dominio')
})

/**
 * El rango sigue siendo del dominio, y por eso el esquema no lo toca.
 *
 * `dias: 500` se recorta a 90 donde se usa y contesta. Si alguien añadiera
 * `.max(90)` al esquema, esto pasaría a ser un rechazo: un cambio de
 * comportamiento disfrazado de validación. Ver `Numero` en `definiciones.mjs`.
 */
await omitirEnvuelto('un número fuera de rango se recorta como siempre, no se rechaza', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('perfil_de_senal', { senal: 'nivel del tanque', dias: 500 })

  assert.equal(r.ok, true, `lo rechazó en vez de recortarlo: ${r.error}`)
  assert.match(r.periodo, /90 días/, 'no se recortó al tope del dominio')
})

/** Un campo de más no cuesta una ronda: la herramienta ya ignora lo que no conoce. */
await omitirEnvuelto('un campo que no existe en el esquema no rompe la llamada', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('estado_del_sistema', { sistema: 'tanque', profundidad: 'mucha' })

  assert.notEqual(r.ok, false, `un campo de más no debería fallar: ${r.error}`)
})

/* ── Las tres nuevas (Plan 23 F3 · IA-09) ────────────────────────────── */

console.log('\n── tendencia_multiple ──────────────────────────────────────')

await checkAsync('[espejo] varias señales en una sola llamada, cada una con su resumen', async () => {
  const h = createHerramientas({ client: espejoFalso() })
  const r = await h.ejecutar('tendencia_multiple', {
    senales: ['vRMS_S1', 'vRMS_S2', 'vRMS_S3'],
    sistema: ESPEJO.id,
    periodo: 'últimas 6 horas',
  })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.senales.length, 3, 'no devolvió una entrada por señal')
  for (const s of r.senales) {
    assert.ok(s.senal, 'una señal sin nombre')
    assert.ok(typeof s.promedio === 'number' || s.sinDato, `${s.senal} sin resumen ni hueco`)
  }
})

/**
 * NO devuelve correlación, y eso es el punto de que exista.
 *
 * Es la diferencia con `correlacionar_senales`: aquélla contesta «¿se mueven
 * juntas?» y ésta «¿cómo van?». Colar un coeficiente aquí invitaría a leer una
 * causa donde nadie preguntó por ninguna.
 */
await checkAsync('[espejo] no calcula ninguna relación entre las señales', async () => {
  const h = createHerramientas({ client: espejoFalso() })
  const r = await h.ejecutar('tendencia_multiple', {
    senales: ['vRMS_S1', 'vRMS_S2'],
    sistema: ESPEJO.id,
    periodo: 'últimas 6 horas',
  })

  assert.equal(r.correlaciones, undefined, 'devolvió correlaciones sin que se las pidieran')
  assert.match(r.nota, /no se ha calculado ninguna relación/i, 'no avisa de que no las calcula')
})

await checkAsync('[espejo] tendencia_multiple(idioma: "en") narra la banda y el aviso de umbrales en inglés', async () => {
  const h = createHerramientas({ client: espejoFalso() })
  const en = await h.ejecutar('tendencia_multiple', {
    senales: ['vRMS_S1', 'vRMS_S2'],
    sistema: ESPEJO.id,
    periodo: 'últimas 6 horas',
  }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)
  const texto = JSON.stringify(en)
  assert.match(texto, /estimate/i, 'el aviso de umbrales tiene que llegar en inglés')
  assert.doesNotMatch(texto, /estimaciones nuestras/i, 'no en español')
})

await checkAsync('una sola señal se rechaza y remite a historia_de_senal', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('tendencia_multiple', { senales: ['nivel'] })

  assert.equal(r.ok, false)
  assert.match(r.error, /historia_de_senal/, 'no dice cuál usar para una sola')
})

await checkAsync('[espejo] una señal sin serie propia se rechaza ANTES de leer nada', async () => {
  /* `aPeak_S1` existe en esta máquina y no está historizada: la guarda tiene
     que saltar antes de gastar un viaje al historiador. */
  const client = espejoFalso()
  const r = await createHerramientas({ client }).ejecutar('tendencia_multiple', {
    senales: ['vRMS_S1', 'aPeak_S1'],
    sistema: ESPEJO.id,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /no tiene serie hist[oó]rica propia/i)
  assert.equal(client.historial.length, 0, 'salió a la red pese a saber que no podía')
})

console.log('\n── buscar_evento ───────────────────────────────────────────')

await checkAsync('[espejo] encuentra la primera y la última vez que se cruzó el umbral', async () => {
  const h = createHerramientas({ client: espejoFalso() })
  const r = await h.ejecutar('buscar_evento', {
    senal: 'vRMS_S1', sistema: ESPEJO.id, condicion: 'por debajo de', valor: 999, periodo: 'últimas 6 horas',
  })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.ocurrio, true)
  assert.ok(r.primeraVez?.cuando && r.ultimaVez?.cuando, 'faltan las horas del cruce')
  assert.equal(typeof r.primeraVez.valor, 'number', 'el cruce no trae su valor')
})

/**
 * Que NO ocurriera es una respuesta medida, no una falta de datos.
 *
 * Y por eso viaja `muestrasRevisadas`: sin ese número, «no pasó» y «no lo sé»
 * se parecen demasiado, y el modelo acabaría contestando lo segundo cuando lo
 * cierto es lo primero.
 */
await checkAsync('[espejo] «no ocurrió» se distingue de «no hay datos»', async () => {
  const h = createHerramientas({ client: espejoFalso() })
  const r = await h.ejecutar('buscar_evento', {
    senal: 'vRMS_S1', sistema: ESPEJO.id, condicion: 'por debajo de', valor: -999, periodo: 'últimas 6 horas',
  })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.ocurrio, false)
  assert.ok(r.muestrasRevisadas > 0, 'no dice sobre cuántas muestras lo afirma')
  assert.match(r.nota, /no una falta de datos/i)
})

await checkAsync('una condición que no existe se rechaza con las válidas', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('buscar_evento', {
    senal: 'nivel', condicion: 'menor que', valor: 5,
  })

  assert.equal(r.ok, false)
  // La para el esquema Zod (Plan 23 F0), que es donde debe pararse: es un enum
  // cerrado y no hay resolvedor que sepa corregir «menor que».
  assert.match(r.error, /no tiene un valor admitido|condici/i)
})

await checkAsync('[espejo] sin serie propia no se puede buscar un cruce', async () => {
  const h = createHerramientas({ client: espejoFalso() })
  const r = await h.ejecutar('buscar_evento', {
    senal: 'aPeak_S1', sistema: ESPEJO.id, condicion: 'por encima de', valor: 5,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /no tiene serie hist[oó]rica propia/i)
})

console.log('\n── alarma_sostenida ─────────────────────────────────────────')

await checkAsync('[espejo] una señal que no es alarma se rechaza, con el nombre de la herramienta correcta', async () => {
  const h = createHerramientas({ client: espejoFalso() })
  const r = await h.ejecutar('alarma_sostenida', { alarma: 'vRMS_S1', sistema: ESPEJO.id })

  assert.equal(r.ok, false)
  assert.match(r.error, /no es una alarma/i)
  assert.match(r.error, /historia_de_senal/)
})

await checkAsync('[espejo] un arranque normal (un solo pulso corto) NO se marca sostenido', async () => {
  const client = espejoFalso({
    historia: async (opciones) => {
      const t0 = new Date(opciones.startDate).getTime()
      // Un pulso de 60 s cerca del principio de la ventana, y nada más.
      return {
        ok: true,
        data: [
          { timestamp: new Date(t0).toISOString(), value: false, quality: 0 },
          { timestamp: new Date(t0 + 10_000).toISOString(), value: true, quality: 0 },
          { timestamp: new Date(t0 + 70_000).toISOString(), value: false, quality: 0 },
        ],
      }
    },
  })
  const r = await createHerramientas({ client }).ejecutar('alarma_sostenida', { alarma: 'alarma_S2', sistema: ESPEJO.id })

  assert.equal(r.ok, true)
  assert.equal(r.activaAhora, false)
  assert.equal(r.activoSegundos, 60)
  assert.equal(r.sostenida, false)
})

await checkAsync('[espejo] el patrón del incidente real —parpadeo repetido— SÍ se marca sostenido', async () => {
  const client = espejoFalso({
    historia: async (opciones) => {
      const t0 = new Date(opciones.startDate).getTime()
      // Cinco pulsos de 40 s cada uno, separados: 200 s activos en total,
      // por encima del corte (150 s), sin que ninguno por separado sea largo.
      const data = []
      for (let i = 0; i < 5; i++) {
        const inicio = t0 + i * 50_000
        data.push({ timestamp: new Date(inicio).toISOString(), value: true, quality: 0 })
        data.push({ timestamp: new Date(inicio + 40_000).toISOString(), value: false, quality: 0 })
      }
      return { ok: true, data }
    },
  })
  const r = await createHerramientas({ client }).ejecutar('alarma_sostenida', { alarma: 'alarma_S2', sistema: ESPEJO.id })

  assert.equal(r.ok, true)
  assert.equal(r.eventosEnVentana, 5)
  assert.equal(r.activoSegundos, 200)
  assert.equal(r.sostenida, true)
  assert.match(r.interpretacion, /no es un arranque normal/i)
})

await checkAsync('[espejo] sigue activa AHORA MISMO, sin haberse apagado: también sostenida', async () => {
  const client = espejoFalso({
    historia: async (opciones) => {
      const t0 = new Date(opciones.startDate).getTime()
      // Entra a los 30 s de la ventana y no vuelve a apagarse.
      return {
        ok: true,
        data: [
          { timestamp: new Date(t0).toISOString(), value: false, quality: 0 },
          { timestamp: new Date(t0 + 30_000).toISOString(), value: true, quality: 0 },
        ],
      }
    },
  })
  const r = await createHerramientas({ client }).ejecutar('alarma_sostenida', { alarma: 'alarma_S2', sistema: ESPEJO.id })

  assert.equal(r.ok, true)
  assert.equal(r.activaAhora, true)
  assert.equal(r.sostenida, true)
})

await checkAsync('[espejo] alarma_sostenida(idioma: "en") narra en inglés, no sólo acepta el argumento', async () => {
  /*
   * ── POR QUÉ ESTA PRUEBA EXISTE ────────────────────────────────────
   *
   * La herramienta declaraba `idioma` y no lo usaba: ESLint lo marcaba desde
   * que se escribió (`'idioma' is assigned a value but never used`) y el error
   * se arrastró como «preexistente» sin que nadie leyera qué decía. No era
   * ruido de linter — era una traducción sin terminar: `interpretacion` y
   * `nota` salían en español con el tablero en inglés.
   *
   * Ninguna de las cuatro pruebas de arriba pasaba `idioma`, así que el hueco
   * no lo cazaba nada. Ésta lo cierra.
   */
  const client = espejoFalso({
    historia: async (opciones) => {
      const t0 = new Date(opciones.startDate).getTime()
      return {
        ok: true,
        data: [
          { timestamp: new Date(t0).toISOString(), value: false, quality: 0 },
          { timestamp: new Date(t0 + 30_000).toISOString(), value: true, quality: 0 },
        ],
      }
    },
  })
  const en = await createHerramientas({ client })
    .ejecutar('alarma_sostenida', { alarma: 'alarma_S2', sistema: ESPEJO.id }, { idioma: 'en' })

  assert.equal(en.ok, true)
  assert.match(en.interpretacion, /NOT a normal start-up/)
  assert.match(en.nota, /measures persistence, not cause/)
  assert.doesNotMatch(en.interpretacion, /arranque normal/)
  assert.doesNotMatch(en.nota, /Mide persistencia/)
})

console.log('\n── resumen_de_turno ────────────────────────────────────────')

await omitirEnvuelto('compone estado, riesgos y tendencia en una sola llamada', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('resumen_de_turno', { sistema: 'tanque', periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true, r.error)
  assert.ok(r.estadoAhora?.ok, 'el estado no llegó, o llegó con un error dentro')
  assert.ok(r.riesgos || r.riesgosNoDisponibles, 'ni riesgos ni el motivo de que falten')
  assert.ok(r.tendencia || r.tendenciaNoDisponible, 'ni tendencia ni el motivo de que falte')
})

await omitirEnvuelto('cita notas del cuaderno DENTRO de la ventana y del sistema, ninguna otra', async () => {
  /*
   * El incidente del 14-09-2026: preguntado "¿qué notas se han hecho este
   * turno?", el modelo dijo que no había ninguna —cuando sí las había— y
   * fechó mal una intervención real. La causa de fondo: `resumen_de_turno`
   * no traía notas ni intervenciones en absoluto, así que no había ningún
   * dato real que citar. Esto prueba que ahora sí llegan, y sólo las que
   * corresponden.
   */
  const cuaderno = {
    async leer({ desde, hasta }) {
      const todas = [
        { instante: '2026-09-14T15:44:17.000Z', texto: 'Se purgó la bomba', autor: 'anonimo' },
        { instante: '2026-09-14T10:00:00.000Z', texto: 'Nota de vibraciones', sistema: ESPEJO.id, autor: 'ana' },
        { instante: '2020-01-01T00:00:00.000Z', texto: 'Nota viejísima, fuera de ventana', autor: 'ana' },
      ]
      const entradas = todas.filter((n) => {
        const t = new Date(n.instante).getTime()
        return t >= desde.getTime() && t <= hasta.getTime()
      })
      return { entradas, total: entradas.length, cursor: null, podas: 0 }
    },
  }
  const h = createHerramientas({ client: clienteFalso(), cuaderno })
  const r = await h.ejecutar('resumen_de_turno', {
    sistema: 'tanque', periodo: 'últimos 90 días',
  })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.notas.length, 1, `esperaba 1 nota del tanque, salieron: ${JSON.stringify(r.notas)}`)
  assert.equal(r.notas[0].texto, 'Se purgó la bomba')
  assert.equal(r.notas[0].cuando, '2026-09-14T15:44:17.000Z', 'la fecha tiene que ser la real, no inventada')
})

omitirEnvuelto('sin cuaderno montado, lo dice — no calla la ausencia', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('resumen_de_turno', { sistema: 'tanque' })

  assert.equal(r.ok, true, r.error)
  assert.deepEqual(r.notas, [])
  assert.match(r.notasNoDisponibles ?? '', /no tiene el cuaderno de planta montado/i)
})

omitirEnvuelto('cita intervenciones DENTRO de la ventana, con su fecha real — no "ayer" inventado', async () => {
  // Relativas a AHORA, no fechas fijas: la ventana de "últimas 6 horas" se
  // resuelve contra el reloj real en el momento de ejecutar la prueba.
  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString()
  const hace10dias = new Date(Date.now() - 10 * 86_400_000).toISOString()

  const leerAprendizajeDe = async () => ({
    intervenciones: [
      {
        id: 'interv-1', fecha: haceUnaHora, sistema: 'tanque',
        sintoma: 'Problemas de presión en la bomba', causa: 'Fuga por codo de purga dañado',
        solucion: 'Se reparó el codo de purga', resuelto: true, origen: 'el usuario',
      },
      {
        // Fuera de la ventana de "últimas 6 horas": no debe aparecer.
        id: 'interv-2', fecha: hace10dias, sistema: 'tanque',
        sintoma: 'Otro síntoma antiguo', solucion: 'Otra solución', resuelto: true, origen: 'el usuario',
      },
    ],
  })
  const h = createHerramientas({ client: clienteFalso(), leerAprendizajeDe })
  const r = await h.ejecutar('resumen_de_turno', {
    sistema: 'tanque', periodo: 'últimas 6 horas',
  })

  assert.equal(r.ok, true, r.error)
  assert.equal(r.intervenciones.length, 1, `salieron: ${JSON.stringify(r.intervenciones)}`)
  assert.equal(r.intervenciones[0].cuando, haceUnaHora)
  assert.equal(r.intervenciones[0].causa, 'Fuga por codo de purga dañado')
})

await checkAsync('resumen_de_turno(idioma: "en") reenvía el idioma a las herramientas que llama por dentro', async () => {
  /*
   * Esta llama a `estado_del_sistema`/`riesgos_activos` DIRECTAMENTE, vía
   * `dameHerramientas()`, no por `ejecutar()` — que es quien normalmente
   * añade `contexto`. Sin reenviarlo a mano aquí, era el único camino que
   * se quedaba siempre en español pese a pedir inglés en toda la
   * conversación: el hueco que este caso cierra.
   */
  const h = createHerramientas({ client: createFakeIconicsClient({ rnd: () => 0.99 }) })
  const en = await h.ejecutar('resumen_de_turno', { sistema: ESPEJO.id }, { idioma: 'en' })

  assert.equal(en.ok, true, en.error)
  const texto = JSON.stringify(en)
  assert.match(texto, /Bearing diagnosis is switched off/)
  assert.doesNotMatch(texto, /diagnóstico de rodamientos está apagado/)
})

/**
 * Una parte que falta se DECLARA, no se calla.
 *
 * Es el fallo que `diagnostico` arrastró semanas: un error escondido dentro de
 * una respuesta con `ok: true`, que el modelo redacta como si estuviera
 * completa. Aquí una máquina sin motor de reglas tiene que decir por qué no
 * hay riesgos, no devolver la lista vacía.
 */
await checkAsync('lo que falta se dice, no se da por vacío', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('resumen_de_turno', { sistema: ESPEJO.id })

  assert.equal(r.ok, true, r.error)
  if (!r.riesgos) {
    assert.ok(r.riesgosNoDisponibles, 'sin riesgos y sin decir por qué')
  }
  assert.match(r.nota, /no la des por vacía/i, 'no le advierte al modelo sobre las partes ausentes')
})

await checkAsync('un sistema inventado no se resume con el de al lado', async () => {
  const h = createHerramientas({ client: clienteFalso() })
  const r = await h.ejecutar('resumen_de_turno', { sistema: 'prensa' })

  assert.equal(r.ok, false)
  assert.match(r.error, /no hay ningún sistema/i)
})

/* ── Invariantes del registro ────────────────────────────────────────── */

console.log('\n── El registro ─────────────────────────────────────────────')

check('son veintiséis herramientas, y sólo una escribe en la PLANTA', () => {
  const h = createHerramientas({ client: clienteFalso() })

  assert.deepEqual(h.nombres, [
    /* Las de sistemas van primero a propósito: `sistemas_de_la_planta` es la
       que el modelo tiene que encontrar cuando no sabe de qué máquina le
       hablan, y el orden del catálogo es lo primero que lee.

       Eran veinte hasta que `estado_de_vibraciones` se fusionó con
       `estado_del_sistema`. Que el número BAJE al añadir capacidad es el punto
       del cambio: las herramientas se parametrizan por sistema en vez de
       multiplicarse por máquina, porque veinte descripciones parecidas hacen
       que un modelo local elija peor cuál llamar. */
    /* Las cuatro de aprendizaje escriben, pero en un JSON nuestro: ninguna
       toca el servidor de planta. La única que sí lo toca sigue siendo una.
       `cerrar_diagnostico` (Plan 17) es la contraparte de chat de
       `POST /api/casos`: va justo después de `registrar_intervencion` —
       misma familia, mismo almacén, la diferencia es que ésta valida
       `causaId` contra `causasDe(riesgoId)` en vez de aceptar texto libre. */
    'hechos_de_la_planta',
    'registrar_intervencion',
    'cerrar_diagnostico',
    'recordar_hecho',
    'proponer_regla',
    'sistemas_de_la_planta',
    /* ── EL ORDEN AHORA AGRUPA POR FAMILIA ──────────────────────────
       Al repartir las herramientas en subcarpetas, este orden cambió: antes
       `pronostico_de_desgaste` y `controlar_bomba` caían entre las de
       históricos, y no por una razón escrita — era el orden en que se fueron
       escribiendo.

       Lo que sí está decidido y se conserva es lo de los extremos:
       `sistemas_de_la_planta` abre, porque es la que el modelo tiene que
       encontrar cuando no sabe de qué máquina le hablan, y las de manuales
       cierran, porque son las que menos veces son la respuesta.

       En medio, las de una MÁQUINA (su estado ahora, sus riesgos, encenderla)
       van juntas y antes que las de HISTORIA. Es el orden en que se pregunta:
       primero cómo está, después cómo ha estado. */
    'riesgos_activos',
    'estado_del_sistema',
    'controlar_bomba',
    'pronostico_de_desgaste',
    'historia_de_senal',
    'valor_en_momento',
    'comparar_periodos',
    'analisis_de_senal',
    'perfil_de_senal',
    'correlacionar_senales',
    'grafico_de_senal',
    'generar_reporte',
    /* Plan 23 F3: las tres nuevas cierran la familia de historia, justo antes
       de las de manuales. Es el orden en que se añadieron y el que tiene el
       registro de verdad.

       Se pensaron detrás de `correlacionar_senales` —`tendencia_multiple` es
       su pareja fácil de confundir: una resume varias señales por separado, la
       otra las cruza— y el sitio se cedió al orden real en vez de reordenar el
       objeto para que cuadrara con la intención. Lo que el modelo lee sigue
       siendo correcto: las tres están entre las de historia, que es su
       familia, y la distinción entre las dos parejas la hace su descripción,
       que es donde el modelo la mira. */
    'tendencia_multiple',
    'buscar_evento',
    /* Nueva el 14-09-2026, del mismo incidente que corrigió los umbrales de
       flujoInstantaneo/presionRelativa: mide si una ALARMA lleva sostenida
       en una ventana reciente, en vez de sólo "¿está activa ahora?". Va
       justo antes de `resumen_de_turno`, con el resto de historia. */
    'alarma_sostenida',
    'resumen_de_turno',
    'consultar_documentacion',
    'limites_del_manual',
    'diagnostico',
    /* Plan 16 Fase 4: `diagnosticar_falla` cierra el catálogo, junto a las
       de documentación — es, igual que ellas, de las que menos veces es la
       respuesta: sólo cuando ya hay un `riesgoId` concreto sobre la mesa. */
    'diagnosticar_falla',
  ])

  /*
   * Esta comprobación decía «ninguna escribe» y era la primera puerta contra
   * una instrucción astuta metida en el chat: lo que no existe en el catálogo
   * no se puede alcanzar. Desde `controlar_bomba` eso ya no es cierto, así que
   * lo que se fija aquí es lo siguiente más fuerte que sí lo es: la escritura
   * está en UNA herramienta y se llama por su nombre.
   *
   * Si algún día aparece una segunda, esta prueba se cae — y ése es justo el
   * momento en que alguien tiene que mirarla, no seis meses después.
   */
  const conEscritura = h.definiciones.filter((d) => {
    const texto = JSON.stringify(d).toLowerCase()
    return ['escrib', 'encender', 'apagar', 'write'].some((v) => texto.includes(v))
  })
  assert.deepEqual(conEscritura.map((d) => d.function.name), ['controlar_bomba'])

  // Y las que de verdad no pueden tocar nada siguen sin poder: ni borrar, ni
  // reconocer alarmas, ni escribir por la puerta de atrás.
  const texto = JSON.stringify(h.definiciones).toLowerCase()
  for (const prohibido of ['borrar', 'delete', 'acknowledge']) {
    assert.ok(!texto.includes(prohibido), `"${prohibido}" no puede aparecer`)
  }
})

/* ── controlar_bomba: la única escritura ─────────────────────────────── */

console.log('\n── controlar_bomba ─────────────────────────────────────────')

await omitirEnvuelto('en modo solo lectura no escribe, y dice de quién es el límite', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client, readOnly: true }).ejecutar('controlar_bomba', {
    encender: true,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /ICONICS_READ_ONLY/)
  // Lo que importa no es el mensaje: es que la escritura no llegó a la red.
  assert.equal(client.escrituras.length, 0)
})

await omitirEnvuelto('con el tanque por encima del aviso se niega a encender', async () => {
  const client = clienteFalso({ valores: { ...EN_REPOSO, NIVEL_TANQUE: 97 } })
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {
    encender: true,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /desbordar/i)
  assert.equal(client.escrituras.length, 0)
})

await omitirEnvuelto('apagar NO mira el nivel: vaciar nunca desborda', async () => {
  const client = clienteFalso({ valores: { ...EN_REPOSO, NIVEL_TANQUE: 97 }, controlInicial: true })
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {
    encender: false,
  })

  assert.equal(r.ok, true)
  assert.equal(r.accion, 'apagada')
})

await omitirEnvuelto('una escritura aceptada pero sin efecto NO se cuenta como cumplida', async () => {
  const client = clienteFalso({ escrituraTomaEfecto: false })
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {
    encender: true,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /no ha tenido efecto real/)
  // Sí lo intentó, y sí releyó para comprobarlo: eso es lo que la distingue de
  // una herramienta que se cree el `ok: true` del servidor.
  assert.equal(client.escrituras.length, 1)
  assert.ok(client.lecturasSueltas.length >= 1)
})

await omitirEnvuelto('si el servidor rechaza la escritura, se cuenta el motivo', async () => {
  const client = clienteFalso({ aceptaEscritura: false })
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {
    encender: true,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /no aceptó la escritura/)
})

await checkAsync('sin decir encender o apagar no se adivina', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {})

  assert.equal(r.ok, false)
  assert.equal(client.escrituras.length, 0)
})

/* ── El diario, también desde el chat (Plan 23 F6 · IA-10) ───────────── */

/** Un diario en un temporal, para no escribir en el de la instalación. */
async function diarioTemporal() {
  const dir = await mkdtemp(join(tmpdir(), 'diario-asistente-'))
  const ruta = join(dir, 'diario.jsonl')
  return {
    diario: crearDiario({ ruta }),
    async lineas() {
      const texto = await readFile(ruta, 'utf8').catch(() => '')
      return texto.split('\n').filter(Boolean).map(l => JSON.parse(l))
    },
  }
}

/**
 * El hueco que F6 cierra.
 *
 * Hasta el 11-09-2026 sólo anotaba `controlRoutes.mjs`, el botón del tablero.
 * Una bomba encendida DESDE EL CHAT no dejaba rastro en el diario que existe
 * justo para contestar «¿qué se le hizo a la instalación?» meses después: el
 * mismo accionamiento, sobre el mismo tag y con las mismas consecuencias,
 * constaba o no según la puerta por la que hubiera entrado.
 */
await omitirEnvuelto('una orden dada por el asistente deja su línea, marcada como suya', async () => {
  const { diario, lineas } = await diarioTemporal()
  const h = createHerramientas({ client: clienteFalso(), readOnly: false, diario })

  await h.ejecutar('controlar_bomba', { encender: true })

  const [entrada] = await lineas()
  assert.ok(entrada, 'la orden del asistente no dejó línea en el diario')
  assert.equal(entrada.resultado, 'cumplida')
  assert.equal(entrada.accion, 'encender')
  assert.match(entrada.tag, /SEGURIDAD\/CONTROL$/)
  assert.equal(entrada.coinciden, true, 'no persiste la confirmación de la relectura')
  /*
   * `origen` es lo que distingue las dos puertas. El botón anota `ip` y
   * `usuario` porque tiene un `request`; aquí no hay ninguno, así que se marca
   * el CANAL — quien lea el diario necesita saber que aquello se pidió
   * hablando con el asistente, porque es otra conversación la que hay que ir a
   * buscar.
   */
  assert.equal(entrada.origen, 'asistente')
})

await omitirEnvuelto('un rechazo del asistente también deja constancia, con su motivo', async () => {
  const { diario, lineas } = await diarioTemporal()
  const h = createHerramientas({ client: clienteFalso(), readOnly: true, diario })

  await h.ejecutar('controlar_bomba', { encender: true })

  const [entrada] = await lineas()
  assert.ok(entrada, 'el rechazo no dejó línea')
  assert.equal(entrada.resultado, 'rechazada')
  assert.match(entrada.motivo, /ICONICS_READ_ONLY/)
  assert.equal(entrada.origen, 'asistente')
})

/**
 * Una llamada mal formada NO es un accionamiento.
 *
 * Es la única salida que no se anota: no llegó a decir si encender o apagar,
 * así que no hubo orden sobre la instalación que registrar. Anotarla llenaría
 * el diario de tanteos del modelo. Mismo criterio que en `controlRoutes.mjs`,
 * donde el cuerpo vacío lo rechaza el esquema antes de llegar a la ruta.
 */
await checkAsync('una llamada sin `encender` no ensucia el diario', async () => {
  const { diario, lineas } = await diarioTemporal()
  const h = createHerramientas({ client: clienteFalso(), readOnly: false, diario })

  await h.ejecutar('controlar_bomba', {})

  assert.equal((await lineas()).length, 0, 'una llamada mal formada dejó línea')
})

/** Sin diario montado la bomba se acciona igual: el diario constata, no decide. */
await omitirEnvuelto('sin diario, el accionamiento funciona igual', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {
    encender: true,
  })

  assert.equal(r.ok, true, `sin diario dejó de accionar: ${r.error}`)
  assert.equal(client.escrituras.length, 1)
})

/**
 * Esta comprobación existe por un fallo real, y por eso mira algo tan tonto.
 *
 * Las tres herramientas de análisis se añadieron pegadas DENTRO del array
 * `DEFINICIONES`, como métodos de uno de sus objetos, en vez de dentro del
 * objeto `herramientas`. El archivo era JavaScript válido y el backend
 * arrancaba; el modelo veía las siete herramientas anunciadas y al llamar a
 * cualquiera de las tres nuevas recibía «no existe la herramienta».
 *
 * Un desajuste entre lo que se anuncia y lo que se puede ejecutar no da error
 * en ninguna parte: se manifiesta como un asistente que falla sólo con ciertas
 * preguntas, que es de los que cuestan una tarde.
 */
check('toda definición anunciada al modelo tiene implementación, y al revés', () => {
  const h = createHerramientas({ client: clienteFalso() })
  const anunciadas = h.definiciones.map(d => d.function?.name)

  assert.deepEqual(
    [...anunciadas].sort(),
    [...h.nombres].sort(),
    'lo que se le anuncia al modelo y lo que se puede ejecutar tienen que coincidir'
  )

  // Y que ninguna definición lleve pegado algo que no sea `type`/`function`,
  // que es exactamente la forma que tenía el archivo roto.
  for (const d of h.definiciones) {
    assert.deepEqual(
      Object.keys(d).sort(), ['function', 'type'],
      `la definición de ${d.function?.name} lleva claves de más`
    )
  }
})

check('las definiciones avisan de que NO toda señal tiene serie propia', () => {
  /*
   * Las descripciones son parte del programa: es lo único que el modelo lee
   * para decidir, y pedir la serie de una señal no historizada es el fallo más
   * caro que puede cometer —el servidor devuelve la curva de OTRA sin dar
   * error—.
   *
   * Antes esta prueba buscaba la palabra «cuatro», y esa cifra ha cambiado dos
   * veces: eran cuatro señales del tanque, luego cinco, y hoy hay además
   * cuarenta de vibraciones. Fijar el número obligaba a tocar la prueba cada
   * vez que el servidor registra un tag más, y lo que importa no es cuántas
   * son: es que la descripción lo ADVIERTA.
   */
  const h = createHerramientas({ client: clienteFalso() })
  const def = h.definiciones.find(d => d.function.name === 'historia_de_senal')

  assert.match(def.function.description, /no todas las señales tienen serie propia/i)
  assert.match(def.function.description, /la herramienta lo dice/i)
})

/* ── generar_reporte con `tipo`: los reportes por plantilla (Plan 44 F3) ─────────
 *
 * En bloque propio y al final a propósito: este archivo es de la zona del
 * asistente (HANDOFF §0) y así el merge es trivial. Lo que se afirma es el
 * MANIFIESTO que devuelve la herramienta —qué secciones salieron con dato y
 * cuáles no, con su motivo— y que el archivo es un PDF; el dibujo en sí se
 * mira en la F7, contra planta. */

console.log('\n── generar_reporte con tipo (Plan 44) ──────────────────────')

await checkAsync('[plantilla] tipo:"tecnico" sobre la espejo: siete secciones con dato, folio TEC, y el PDF escrito', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar('generar_reporte', {
    tipo: 'tecnico', sistema: ESPEJO.id, periodo: 'últimas 6 horas',
  })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.tipo, 'tecnico')
  assert.equal(r.instalacion, ESPEJO.nombre)
  assert.match(r.folio, /^TDCON-TEC-\d{8}-[0-9A-F]{4}$/)
  assert.deepEqual(r.seccionesConDato, [
    '1. Resumen operativo', '2. Indicadores principales', '3. Tendencias de variables',
    '4. Estadísticas del período', '5. Análisis técnico', '6. Conclusiones', '7. Firmas',
  ])
  assert.equal(r.seccionesSinDato, undefined, 'con el falso en marcha todas las secciones tienen fuente')
  assert.ok(r.graficas > 0 && r.graficas <= 8, `tope de series por plantilla (D14): ${r.graficas}`)
  assert.equal(r._adjunto.tipo, 'reporte')
  assert.match(r._adjunto.titulo, /^REPORTE TÉCNICO — /)
  const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
  const contenido = await readFile(join(reportes.dir, `${id}.pdf`))
  assert.equal(contenido.subarray(0, 4).toString(), '%PDF')
})

await checkAsync('[plantilla] tipo:"vibraciones": el espectro va como sección SIN dato con su motivo; los puntos de medición y el diagnóstico, con dato', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar('generar_reporte', {
    tipo: 'reporte de vibraciones', sistema: ESPEJO.id, periodo: 'últimas 6 horas',
  })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.tipo, 'vibraciones')
  assert.match(r.folio, /^TDCON-VIB-/)
  assert.deepEqual(r.seccionesSinDato.map((x) => x.seccion), ['3. Espectro de vibración'])
  assert.match(r.seccionesSinDato[0].motivo, /vigilancias del espectro/)
  assert.ok(r.seccionesConDato.includes('2. Puntos de medición'))
  assert.ok(r.seccionesConDato.includes('5. Diagnóstico'))
})

await checkAsync('[plantilla] tipo:"lectura de sensores" (texto libre) normaliza, y en inglés los títulos salen en inglés', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar(
    'generar_reporte', { tipo: 'lectura de sensores', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, { idioma: 'en', usuario: 'moises' },
  )
  assert.equal(r.ok, true, r.error)
  assert.equal(r.tipo, 'lectura-de-sensores')
  /* Quien preguntó firma «Elaboró» (Plan 44 §6.1): el id de su sesión llega por el contexto, como `idioma`. */
  assert.equal(r.elaboro, 'moises · via the TDCON plant assistant')
  assert.equal(r.reporte, 'SENSOR READINGS REPORT')
  assert.ok(r.seccionesConDato.includes('4. Calibration and data quality'))
})

await checkAsync('[plantilla] sin `tipo` la herramienta hace EXACTAMENTE lo de siempre: mismas señales con gráfico que antes del Plan 44', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const h = createHerramientas({ client, reportes })
  const sinTipo = await h.ejecutar('generar_reporte', { sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
  const catalogo = await h.ejecutar('generar_reporte', { sistema: ESPEJO.id, periodo: 'últimas 6 horas', tipo: 'catalogo' })
  assert.equal(sinTipo.ok, true, sinTipo.error)
  assert.equal(sinTipo.tipo, undefined, 'la respuesta del catálogo no cambió de forma')
  assert.deepEqual(catalogo.senalesConGrafico, sinTipo.senalesConGrafico)
  assert.equal(sinTipo.senalesConGrafico.length, configurada.series.historizadas().length)
})

await checkAsync('[plantilla] sin `sistema`, catálogo y plantilla van a la ÚNICA configurada en servicio, no al tanque cerrado (medido con el modelo real, F3.4)', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const h = createHerramientas({ client, reportes })
  const catalogo = await h.ejecutar('generar_reporte', { periodo: 'últimas 6 horas' })
  assert.equal(catalogo.ok, true, catalogo.error)
  assert.equal(catalogo.sistema, ESPEJO.id)
  const tecnico = await h.ejecutar('generar_reporte', { tipo: 'tecnico', periodo: 'últimas 6 horas' })
  assert.equal(tecnico.ok, true, tecnico.error)
  assert.equal(tecnico.sistema, ESPEJO.id)
})

await checkAsync('[plantilla] un tipo desconocido lista los tipos; "predicciones" está declarado pero se niega con su motivo y dice cuáles sí', async () => {
  const reportes = await reportesTmp()
  const h = createHerramientas({ client: clienteFalso(), reportes })
  const a = await h.ejecutar('generar_reporte', { tipo: 'bonito', sistema: ESPEJO.id })
  assert.equal(a.ok, false)
  assert.match(a.error, /No hay ningún tipo de reporte llamado «bonito»/)
  assert.ok(a.tipos.includes('lectura-de-sensores'))

  /* El ejemplo fue `riesgos` hasta la F4 y `energias` hasta la F5. Queda
     `predicciones`, y NO por falta de trabajo: su plantilla está escrita
     entera. Se niega porque no hay mecanismos de desgaste que pronosticar,
     y su motivo lo dice con esas palabras. */
  const b = await h.ejecutar('generar_reporte', { tipo: 'predicciones', sistema: ESPEJO.id })
  assert.equal(b.ok, false)
  assert.match(b.error, /todavía no se compone/)
  assert.match(b.error, /mecanismos de desgaste/)
  assert.deepEqual(b.disponibles, ['catalogo', 'tecnico', 'vibraciones', 'lectura-de-sensores', 'riesgos', 'alarmas', 'ingenieria', 'energias'])

  const c = await h.ejecutar('generar_reporte', { tipo: 'técnico de alarmas', sistema: ESPEJO.id })
  assert.equal(c.ok, false)
  assert.deepEqual(c.tipos, ['tecnico', 'alarmas'], 'dos tipos en la frase: se pregunta, no se elige')
})

await checkAsync('[plantilla] energias ESTIMA los kWh integrando la potencia, y el PDF lo declara (F5)', async () => {
  const reportes = await reportesTmp()
  const h = createHerramientas({ client: clienteFalso(), reportes })
  const r = await h.ejecutar('generar_reporte', { tipo: 'energias', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true, r.error)
  assert.match(r.folio, /^TDCON-ENE-/)
  /* La sección que explica CÓMO se calculó no puede faltar: sin ella el
     número es indistinguible de la lectura de un contador (§6.2). */
  assert.ok(
    r.seccionesConDato.some((x) => /Cómo se calculó/i.test(x)),
    'los kWh estimados tienen que ir acompañados de cómo se obtuvieron',
  )
})

await checkAsync('[plantilla] riesgos y alarmas se componen desde la herramienta, con su folio y su PDF (F4)', async () => {
  const reportes = await reportesTmp()
  const h = createHerramientas({ client: clienteFalso(), reportes })

  const riesgos = await h.ejecutar('generar_reporte', { tipo: 'riesgos', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
  assert.equal(riesgos.ok, true, riesgos.error)
  assert.match(riesgos.folio, /^TDCON-RIE-/)
  /* La matriz declara su criterio en el PDF; aquí basta con que la sección
     de los no observables exista: es la que impide que la rejilla mienta. */
  assert.ok(
    riesgos.seccionesConDato.some((s) => /no se pueden situar/i.test(s)),
    'los riesgos sin serie que observar tienen que salir aparte, no desaparecer',
  )

  const alarmas = await h.ejecutar('generar_reporte', { tipo: 'alarmas', sistema: ESPEJO.id, periodo: 'últimas 6 horas' })
  assert.equal(alarmas.ok, true, alarmas.error)
  assert.match(alarmas.folio, /^TDCON-AL-/)
  assert.ok(alarmas.seccionesConDato.some((s) => /Resumen de alarmas/i.test(s)))
})

await checkAsync('[plantilla] el tanque (cerrado) se niega por la guarda de máquina cerrada, no por la plantilla', async () => {
  const reportes = await reportesTmp()
  const r = await createHerramientas({ client: clienteFalso(), reportes }).ejecutar('generar_reporte', { tipo: 'tecnico', sistema: 'tanque' })
  assert.equal(r.ok, false)
  assert.match(r.error, /cerrad/i)
})

await checkAsync('el registro no lanza ante una herramienta inventada', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('borrar_planta', {})

  assert.equal(r.ok, false)
  assert.ok(r.herramientas, 'y devuelve las válidas para que se corrija')
})

check('sin cliente de ICONICS, el fallo es en el arranque y dice qué falta', () => {
  assert.throws(() => createHerramientas({}), /cliente de ICONICS/)
})

/* ── Resumen ─────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────────────
 * UNA MÁQUINA QUE SÓLO OBSERVA (Plan 46 F5)
 * ─────────────────────────────────────────────────────────────────────
 *
 * Todo lo de arriba se comprueba contra la espejo de VIBRACIONES, que
 * diagnostica. `sensado` es el primer tipo que no, y lo que hay que fijar es
 * distinto: no que conteste bien sobre riesgos, sino que **no se invente uno**
 * y que aun así sepa decir lo que mide.
 *
 * Se registra su propia máquina —cuatro tomas independientes, diez variables,
 * ninguna serie verificada— porque la espejo no puede representar esto: sus
 * tags llevan el apoyo en el nombre y su tipo trae 19 reglas.
 */
const SENSADO = {
  id: 'sensado-prueba',
  nombre: 'Sensado de prueba',
  tipo: 'sensado',
  plc: 'PLC_X',
  assets: [
    { id: 'DONA3', pointName: 'ac:TDCON/PRUEBA_SENSORES/DONA3/', rol: 'raiz', nombre: 'Dona trifásica', alias: [] },
    { id: 'AMB', pointName: 'ac:TDCON/PRUEBA_SENSORES/AMB/', rol: 'secundario', nombre: 'Ambiente', alias: [] },
  ],
  variables: [
    { id: 'L1', pointName: 'ac:TDCON/PRUEBA_SENSORES/DONA3/LINEA_1', rol: 'electrica:corrienteL1', assetId: 'DONA3', unidad: 'A', acceso: 'read', estado: 'VALID', historyPointName: null, historyVerified: false, alias: [] },
    { id: 'CO2', pointName: 'ac:TDCON/PRUEBA_SENSORES/AMB/CO2', rol: 'ambiente:co2', assetId: 'AMB', unidad: 'ppm', acceso: 'read', estado: 'VALID', historyPointName: null, historyVerified: false, alias: [] },
  ],
  cadenciaMs: 5000,
  limitaciones: [],
  estado: 'VALID',
}
const sensado = registrarSistema(construirSistema(SENSADO, tipoDe('sensado')))

await checkAsync('[sensado] el reporte de lectura de sensores se genera, y declara lo que NO puede decir (Plan 46 F6)', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar(
    'generar_reporte', { tipo: 'lectura de sensores', sistema: sensado.id, periodo: 'últimas 6 horas' },
  )

  assert.equal(r.ok, true, r.error)
  assert.equal(r.tipo, 'lectura-de-sensores')

  /*
   * Lo que de verdad importa de este reporte: que las secciones que NO puede
   * llenar salgan con su MOTIVO escrito, no en blanco ni con un cero.
   * Ninguna serie de esta máquina está verificada (Plan 46 F3: las diez son
   * constantes y no hay testigo), así que la tendencia no se puede dibujar —
   * y el PDF tiene que decir por qué (`CLAUDE.md` §2.4 y §2.5).
   */
  assert.ok(Array.isArray(r.seccionesSinDato))
  for (const s of r.seccionesSinDato) {
    assert.ok(s.motivo && s.motivo.length > 10, `«${s.seccion}» sale vacía SIN decir por qué`)
  }

  /* Y lo que sí hay —el instante— se cuenta: un reporte que no dijera nada de
     una máquina que lee diez señales no serviría para nada. */
  assert.ok(r.seccionesConDato.length > 0, 'algo tiene que contar: la máquina lee')
})

await checkAsync('[sensado] NO se le ofrece un reporte de vibraciones: no es una máquina de ese tipo', async () => {
  const reportes = await reportesTmp()
  const client = createFakeIconicsClient({ rnd: () => 0.99, ahora: () => instanteEnMarcha })
  const r = await createHerramientas({ client, reportes }).ejecutar(
    'generar_reporte', { tipo: 'reporte de vibraciones', sistema: sensado.id, periodo: 'últimas 6 horas' },
  )

  /*
   * Puede salir bien (con todo vacío y su motivo) o negarse. Lo que NO puede
   * es inventarse bandas ISO, zonas o un diagnóstico de un motor que no hay.
   */
  if (r.ok) {
    const texto = JSON.stringify(r)
    assert.ok(!/zona [ABCD]\b/.test(texto), 'no puede asignar una zona ISO a una máquina sin vibración')
    assert.ok(r.seccionesSinDato.length > 0, 'si no puede llenarlas, tiene que declararlo')
  }
})

console.log()
console.log(`${c.negrita}── Una máquina que sólo observa (Plan 46 F5) ──${c.reset}`)

check('[sensado] el asistente la ve en el registro, con su nombre', () => {
  assert.equal(sensado.id, 'sensado-prueba')
  assert.equal(sensado.nombre, 'Sensado de prueba')
  assert.ok(!sensado.cerrado, 'una máquina en servicio no se niega')
})

check('[sensado] NO se le ofrece diagnóstico: la herramienta ni aparece', () => {
  /*
   * La lista de herramientas se DERIVA de las capacidades (Plan 33 §6), y el
   * tipo observador no declara DIAGNOSTICS. Ofrecer una herramienta que luego
   * se niega gasta un turno del modelo para llegar al mismo sitio.
   */
  assert.ok(!sensado.herramientas.includes('diagnosticar_falla'))
  assert.ok(!sensado.herramientas.includes('riesgos_activos'))
  assert.ok(sensado.herramientas.includes('estado_del_sistema'), 'lo que SÍ sabe hacer sigue ofrecido')
})

check('[sensado] sin serie verificada tampoco se ofrece historia', () => {
  /* Ninguna de sus variables tiene serie: prometerla sería el fallo que
     `capacidadesDe` existe para no cometer. */
  assert.ok(!sensado.herramientas.includes('historia_de_senal'))
})

check('[sensado] su estado trae las señales con su familia y su unidad', () => {
  const est = sensado.estado((punto) => (punto.endsWith('LINEA_1') ? 12.5 : 640), sensado, new Date())

  assert.equal(est.senales.length, 2)
  const l1 = est.senales.find((s) => s.rol === 'electrica:corrienteL1')
  assert.equal(l1.familia, 'electrica')
  assert.equal(l1.unidad, 'A')
  assert.equal(l1.valor, 12.5)
  /*
   * `general` es null y NO es un hueco por rellenar: un tipo que no
   * diagnostica no tiene «estado general» que ofrecer, y fabricar uno
   * —«NORMAL» porque nada falló— afirmaría que se ha comprobado algo.
   */
  assert.equal(est.general, null)
})

check('[sensado] un punto mudo sale como HUECO, nunca como cero', () => {
  const est = sensado.estado(() => null, sensado, new Date())

  for (const s of est.senales) {
    assert.equal(s.valor, null, `${s.label} tendría que venir sin valor`)
    assert.equal(s.sinDato, true)
    assert.ok(s.motivo, 'un hueco sin motivo no se puede explicar')
  }
  assert.equal(est.recuento.conDato, 0)
  assert.equal(est.recuento.sinDato, 2)
})

check('[sensado] el resumen le PROHÍBE al modelo juzgar, y lo dice en su texto', () => {
  const est = sensado.estado(() => 5, sensado, new Date())
  const r = tipoDe('sensado').resumen(est)

  /*
   * El aviso viaja DENTRO del resumen y no en el prompt general porque es de
   * este tipo: quien lo lea tiene que saber que no hay veredicto que pedir.
   */
  assert.match(r.aviso, /sólo OBSERVA/i)
  assert.match(r.aviso, /no digas si están bien o mal/i)
  assert.ok(Array.isArray(r.electrica) && r.electrica.length === 1)
  assert.ok(Array.isArray(r.ambiente) && r.ambiente.length === 1)
  assert.equal(r.total, 2)
})

check('[sensado] el resumen cuenta los huecos aparte, sin disfrazarlos', () => {
  const est = sensado.estado(() => null, sensado, new Date())
  const r = tipoDe('sensado').resumen(est)

  assert.equal(r.sin_dato, 2)
  /* Y cada línea dice que falta, en vez de omitir la señal: omitirla se leería
     como «esta máquina no mide eso». */
  assert.ok(r.electrica.every((l) => /sin dato/i.test(l)))
})

check('[sensado] su tipo no produce riesgos ni con lecturas delante', () => {
  const tipo = tipoDe('sensado')
  const r = tipo.evaluarRiesgos({ canales: {}, variador: {}, alarmas: null })
  assert.deepEqual(r.activos, [])
  assert.equal(r.provisional, false, '«provisional» sonaría a pendiente, y es una decisión')
})

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/conversacion/herramientas.mjs y shared/eva/.${c.reset}`)
  process.exit(1)
}

console.log(`${c.verde}${c.negrita}${passed} comprobaciones correctas: las herramientas se mantienen.${c.reset}`)
console.log(`${c.gris}${sobreConfigurada} de ellas sobre una máquina CONFIGURADA (Plan 39 F0).${c.reset}`)

/*
 * Las omitidas se dicen SIEMPRE, y después del verde. Un guion que pasa sin
 * mencionar que dejó de mirar 48 cosas estaría afirmando más de lo que
 * comprobó — y este proyecto ya tiene la costumbre de contar lo que NO se
 * miró (ver los «Excluidos» de `npm run verificar`).
 */
if (omitidas.length) {
  console.log()
  console.log(`${c.gris}${c.negrita}${omitidas.length} omitida(s) — no se comprobaron:${c.reset}`)
  const porMotivo = new Map()
  for (const { motivo } of omitidas) porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1)
  for (const [motivo, cuantas] of porMotivo) {
    console.log(`  ${c.gris}· ${cuantas} × ${motivo}${c.reset}`)
  }
}
