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
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createHerramientas,
  resolverSenal,
  resolverVentana,
} from '../backend/ia/herramientas.mjs'
import {
  RAIZ,
  SENALES,
  SENAL_KEYS,
  TODOS_LOS_PUNTOS,
  esHistorizada,
  historizadas,
  pointName,
} from '../shared/eva/senales.js'
import { PROVISIONALES } from '../shared/eva/umbrales.js'
import { MAX_PUNTOS, resumirSerie } from '../shared/eva/historia.js'

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

/* ── Cliente de ICONICS de mentira ───────────────────────────────────── */

/**
 * Valores en vivo por tag. Es la instalación PARADA, que es como está la mayor
 * parte del tiempo: caudal 0, motor 0, eficiencia 0. Elegido a propósito —es
 * el estado en el que un tablero mal hecho abre en rojo permanente—.
 */
const EN_REPOSO = {
  SNIVEL_TANQUE: 62.5,
  STEMPERATURA_TANQUE: 21.3,
  CARGA_TRABAJO_MOTOR: 0,
  'Modo AM VDF': false,
  SFLUJO_INSTANTANEO: 0,
  SPRESION_RELATIVA: 0.2,
  INDICE_DESVIACION_VOLTAJE: 122.1,
  KPIEFICIENCIA_ENERGETICA: 0,
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
        const tag = p.slice(RAIZ.length)
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

    async writePoint(punto, valor) {
      escrituras.push({ punto, valor })
      if (!aceptaEscritura) return { ok: false, error: 'punto de solo lectura' }
      if (escrituraTomaEfecto) control.valor = valor
      return { ok: true }
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
function indiceDocumentosFalso(fragmentos) {
  return {
    async buscar(_consulta, { top = 3 } = {}) {
      return fragmentos.slice(0, top)
    },
    estado() {
      return { cargado: true, carpeta: 'x', modo: 'BM25', documentos: [], ilegibles: [] }
    },
  }
}

console.log(`\n${c.negrita}Herramientas del asistente · sistema de agua${c.reset}`)

/* ── El catálogo ─────────────────────────────────────────────────────── */

console.log('\n── El catálogo ─────────────────────────────────────────────')

check('los ocho puntos se nombran bajo la raíz de la demo', () => {
  assert.equal(TODOS_LOS_PUNTOS.length, 8)
  for (const p of TODOS_LOS_PUNTOS) {
    assert.ok(p.startsWith(RAIZ), `"${p}" no cuelga de ${RAIZ}`)
  }
})

check('el punto histórico es el de TIEMPO REAL, con ac: y no con hda:', () => {
  // Medido contra el servidor: `hda:\Configuration\…` responde 500 para este
  // árbol. Es la diferencia con el catálogo de Resonac, y la que hace que estas
  // herramientas no puedan reutilizar `historyPointName`.
  const p = pointName('nivelTanque')
  assert.ok(p.startsWith('ac:'), 'tiene que empezar por ac:')
  assert.ok(!p.includes('hda:'), 'hda: responde 500 en este árbol')
})

check('sólo las señales verificadas están marcadas como historizadas', () => {
  assert.deepEqual(historizadas().sort(), [
    'flujoInstantaneo', 'nivelTanque', 'presionRelativa', 'temperaturaTanque',
    'tensionLinea',
  ])
  /*
   * Las que el servidor sigue resolviendo a la serie de la temperatura.
   *
   * `tensionLinea` salió de esta lista el 24-08-2026: se le configuró el
   * `Historical data source` del activo —`hda:\Configuration\DEMO DANONE:Tension`—
   * y desde entonces sirve SU serie. Comprobado contra el servidor real: su
   * histórico da ~121 V donde antes daba ~23, que era la temperatura.
   *
   * Las otras dos siguen sin recolectarse. El día que se les configure el
   * mismo campo, se marcan arriba y se quitan de aquí — la lista no es un
   * número fijo, es lo que esté verificado.
   */
  for (const k of ['cargaMotor', 'eficienciaEnergetica']) {
    assert.equal(esHistorizada(k), false, `${k} NO puede estar historizada`)
  }
})

check('el catálogo que va al prompt no inventa unidades', () => {
  const cat = createHerramientas({ client: clienteFalso() }).catalogo()
  const caudal = cat.find(s => s.nombre === 'Caudal instantáneo')
  // El tag no dice si son l/s o m³/h. Poner una de las dos sería inventarse
  // la magnitud, y el modelo la copiaría tal cual.
  assert.equal(caudal.unidad, null, 'el caudal no tiene unidad declarada')
  assert.equal(cat.find(s => s.nombre === 'Nivel del tanque').unidad, '%')
})

/* ── Resolver el nombre de una señal ─────────────────────────────────── */

console.log('\n── Resolver la señal ───────────────────────────────────────')

check('la clave, el tag y los dos rótulos resuelven solos', () => {
  for (const k of SENAL_KEYS) {
    const s = SENALES[k]
    assert.equal(resolverSenal(k), k, `falló la clave "${k}"`)
    assert.equal(resolverSenal(s.tag), k, `falló el tag "${s.tag}"`)
    assert.equal(resolverSenal(s.label), k, `falló el rótulo "${s.label}"`)
    assert.equal(resolverSenal(s.corto), k, `falló el corto "${s.corto}"`)
  }
})

check('se aceptan las formas en que habla un operador', () => {
  const formas = {
    nivelTanque: ['nivel', 'el nivel del tanque', 'NIVEL', ' nivel '],
    temperaturaTanque: ['temperatura', 'temperatura del agua', 'los grados'],
    cargaMotor: ['la bomba', 'el motor', 'carga del motor'],
    flujoInstantaneo: ['caudal', 'el flujo'],
    presionRelativa: ['presion', 'presión', 'la presión de red'],
    tensionLinea: ['voltaje', 'tensión', 'la tensión de línea'],
    eficienciaEnergetica: ['eficiencia', 'eficiencia energética'],
    modoVdf: ['el variador', 'modo del variador'],
  }

  for (const [clave, lista] of Object.entries(formas)) {
    for (const forma of lista) {
      assert.equal(resolverSenal(forma), clave, `falló "${forma}"`)
    }
  }
})

check('«índice de desviación» resuelve a la tensión, que es lo que entrega', () => {
  // El tag se llama así pero devuelve ~122, que es una tensión. Quien pregunte
  // por el nombre del tag está preguntando por esta señal; mandarle un «no
  // existe» sería mentirle.
  assert.equal(resolverSenal('índice de desviación de voltaje'), 'tensionLinea')
  assert.equal(resolverSenal('INDICE_DESVIACION_VOLTAJE'), 'tensionLinea')
})

check('un nombre que no existe NO resuelve a nada', () => {
  // Sobre todo el vocabulario del tablero anterior: si «OEE» resolviera a
  // cualquier cosa, el asistente contestaría una señal de agua a una pregunta
  // de producción.
  for (const fantasma of ['OEE', 'la Línea 1', 'disponibilidad', 'piezas rechazadas',
    'el compresor', 'la válvula', '']) {
    assert.equal(resolverSenal(fantasma), null, `"${fantasma}" no debería resolver`)
  }
})

check('una frase con DOS señales no elige ninguna', () => {
  // Elegir la primera daría una respuesta correcta sobre la señal equivocada,
  // que es peor que un error: nadie la revisaría.
  assert.equal(resolverSenal('compara el nivel y la presion'), null)
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

/* ── estado_del_sistema ──────────────────────────────────────────────── */

console.log('\n── estado_del_sistema ──────────────────────────────────────')

await checkAsync('las ocho señales se leen en UNA sola llamada en lote', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', {})

  assert.equal(r.ok, true)
  assert.equal(client.lotes.length, 1, 'una petición, no ocho')
  assert.equal(client.lotes[0].length, 8)
})

await checkAsync('una instalación PARADA no es una instalación en alarma', async () => {
  // Es el motivo de que exista `reposo`. Sin él, caudal 0 y eficiencia 0 caen
  // bajo su límite duro y la demo abre en rojo permanente — la pantalla que
  // enseña a ignorar las alertas.
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('estado_del_sistema', {})

  assert.equal(r.enReposo, true)
  assert.equal(r.recuento.fueraDeLimite, 0, 'parada no es fuera de límite')
  assert.ok(r.queSignificaReposo, 'y hay que explicar qué significa')

  const senales = r.activos.flatMap(a => a.senales)
  const caudal = senales.find(s => s.clave === 'flujoInstantaneo')
  assert.equal(caudal.estado, 'En reposo')
  assert.ok(caudal.porQueReposo, 'con su explicación al lado')
})

await checkAsync('un valor de MALA CALIDAD es un hueco, nunca un cero', async () => {
  // Sin este filtro el asistente diría «el tanque está al 0 %» de una
  // instalación llena, que es la peor respuesta posible: parece un dato.
  const client = clienteFalso({ calidad: { SNIVEL_TANQUE: 24 } })
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', {})

  const nivel = r.activos.flatMap(a => a.senales).find(s => s.clave === 'nivelTanque')
  assert.equal(nivel.valor, null, 'mala calidad tiene que ser null')
  assert.notEqual(nivel.valor, 0, 'y desde luego no un cero')
  assert.equal(nivel.estado, 'Sin dato')
  assert.equal(r.recuento.sinDato, 1)
})

await checkAsync('las unidades que el servidor no declara viajan vacías', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('estado_del_sistema', {})
  const senales = r.activos.flatMap(a => a.senales)

  const caudal = senales.find(s => s.clave === 'flujoInstantaneo')
  assert.equal(caudal.unidad, null, 'inventarle l/s sería inventarse la magnitud')
  assert.ok(caudal.nota, 'y hay que decir por qué está vacía')

  assert.equal(senales.find(s => s.clave === 'nivelTanque').unidad, '%')
})

await checkAsync('el float crudo del PLC se redondea a los decimales del catálogo', async () => {
  /*
   * Salió probando contra el servidor REAL, no contra este cliente falso: los
   * valores de aquí venían ya limpios y no podían enseñarlo. ICONICS entrega
   * `50.09765625` y `23.258464813232422`, y el modelo los citaba tal cual —«el
   * tanque está al 50.09765625 %»—. Trece decimales sugieren una exactitud que
   * el sensor no tiene.
   */
  const client = clienteFalso({
    valores: { ...EN_REPOSO, SNIVEL_TANQUE: 50.09765625, STEMPERATURA_TANQUE: 23.258464813232422 },
  })
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', {})
  const senales = r.activos.flatMap(a => a.senales)

  assert.equal(senales.find(s => s.clave === 'nivelTanque').valor, 50.1)
  assert.equal(senales.find(s => s.clave === 'temperaturaTanque').valor, 23.3)
})

await checkAsync('redondear no convierte un hueco ni un booleano en cero', async () => {
  const client = clienteFalso({ calidad: { SNIVEL_TANQUE: 24 } })
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', {})
  const senales = r.activos.flatMap(a => a.senales)

  assert.equal(senales.find(s => s.clave === 'nivelTanque').valor, null, 'null, no 0')
  assert.equal(senales.find(s => s.clave === 'modoVdf').valor, false, 'false, no 0')
})

await checkAsync('la booleana se dice con su palabra, no con true/false', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('estado_del_sistema', {})
  const modo = r.activos.flatMap(a => a.senales).find(s => s.clave === 'modoVdf')

  assert.equal(modo.texto, 'Automático')
  assert.ok(modo.nota, 'y se confiesa que la correspondencia no está confirmada')
})

await checkAsync('el aviso de umbrales viaja en el campo QUE VIGILA la red de seguridad', async () => {
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
    ['estado_del_sistema', {}],
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

await checkAsync('la hora de lectura se da legible y en local, no en ISO', async () => {
  // Medido con el 4B: con un ISO delante lo copió tal cual en la respuesta
  // («leído a las 2026-08-18T14:48:44.253Z»). Además va en UTC, así que en
  // España marcaría dos horas menos que el reloj de la pared.
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('estado_del_sistema', {})

  assert.match(r.leidoA, /^\d{2}:\d{2}:\d{2}$/, `leidoA fue "${r.leidoA}"`)
})

await checkAsync('cada señal lleva su banda, para no obligar al modelo a restar', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('estado_del_sistema', {})
  const nivel = r.activos.flatMap(a => a.senales).find(s => s.clave === 'nivelTanque')

  assert.deepEqual(nivel.banda, {
    limiteInferior: 15, avisoInferior: 25, avisoSuperior: 90, limiteSuperior: 95,
  })

  // `null` en un extremo es «sin límite», no cero. Leído como 0 marcaría en
  // rojo media instalación.
  const carga = r.activos.flatMap(a => a.senales).find(s => s.clave === 'cargaMotor')
  assert.equal(carga.banda.limiteInferior, 'sin límite')
})

await checkAsync('un servidor caído se cuenta como tal y no como instalación vacía', async () => {
  const client = {
    async readPoints() { return { ok: false, error: 'ICONICS no responde', status: 502 } },
    async readHistory() { return { ok: false, status: 502 } },
  }
  const r = await createHerramientas({ client }).ejecutar('estado_del_sistema', {})

  assert.equal(r.ok, false)
  assert.match(r.error, /no se pudo leer/i)
})

/* ── historia_de_senal · LA GUARDA ───────────────────────────────────── */

console.log('\n── historia_de_senal · la guarda ───────────────────────────')

await checkAsync('pedir la historia de una señal NO historizada no llega a la red', async () => {
  /*
   * La invariante cara de todo el archivo.
   *
   * El servidor NO da error: devuelve `ok: true`, con marcas de tiempo
   * correctas, y la serie de `STEMPERATURA_TANQUE`. Así que no basta con
   * comprobar que la herramienta falla — hay que comprobar que **no preguntó**.
   * Si algún día alguien mueve la guarda detrás de la llamada, esto se cae.
   */
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
})

await checkAsync('el modo del variador tampoco tiene serie', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'modo del variador' })

  assert.equal(r.ok, false)
  assert.equal(client.historial.length, 0)
})

await checkAsync('las que SÍ tienen serie se leen con Average y bajo el tope', async () => {
  const client = clienteFalso()
  const h = createHerramientas({ client })

  for (const nombre of ['nivel', 'temperatura', 'caudal', 'presión']) {
    const r = await h.ejecutar('historia_de_senal', { senal: nombre, periodo: 'últimas 6 horas' })
    assert.equal(r.ok, true, `"${nombre}" falló: ${r.error}`)
  }

  assert.equal(client.historial.length, 4)
  for (const llamada of client.historial) {
    // `Average` y no `Interpolative`: las ocho señales son magnitudes
    // instantáneas y ninguna es acumulativa.
    assert.equal(llamada.aggregate, 'Average')
    assert.ok(llamada.pointName.startsWith('ac:'), 'con ac:, no con hda:')
    assert.match(llamada.interval, /^\d{2}:\d{2}:\d{2}$/, 'el intervalo va como HH:MM:SS')
  }
})

await checkAsync('un rango largo se trocea (Plan 15 Fase 4): no cae en el patrón "1 muestra de todo el mes"', async () => {
  // Medido contra el servidor real: una ventana de 30 días pedida en UNA
  // sola llamada con un intervalo grueso devolvía una única muestra de todo
  // el mes, sin ningún error — el mismo patrón patológico que documenta
  // planificar()/trocear(). `leerSerie()` trocea por dentro cuando el rango
  // lo pide (>14 días con la regla de tramosDe), y aquí se comprueba que
  // hace VARIAS llamadas (no una) y fusiona sus datos.
  let llamadas = 0
  const client = clienteFalso({
    historia: async (opciones) => {
      llamadas += 1
      // Cada tramo trae una muestra propia, con timestamp dentro de su rango
      // — así se puede comprobar que el orden final está bien fusionado.
      return {
        ok: true,
        data: [{ timestamp: opciones.startDate, value: 50 + llamadas, quality: 0 }],
      }
    },
  })

  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', {
    senal: 'nivel', periodo: 'últimos 30 días',
  })

  assert.equal(r.ok, true, `debería tener éxito: ${r.error}`)
  assert.ok(llamadas > 1, `llamadas=${llamadas}: un rango de 30 días debe trocearse, no ser 1 sola llamada`)
  assert.equal(r.muestras, llamadas, 'una muestra por tramo, todas fusionadas')
})

await checkAsync('un rango largo con tramos parcialmente vacíos no falla si ALGUNO trae dato', async () => {
  // Reproduce el caso real medido: el historiador sólo tiene datos desde
  // hace unos días, así que un período de 30 días tiene ~20 tramos vacíos y
  // unos pocos con dato. Un tramo sin datos no debe invalidar el resto.
  let llamada = 0
  const client = clienteFalso({
    historia: async () => {
      llamada += 1
      // Sólo la mitad de los tramos "responden" con una muestra.
      return llamada % 2 === 0
        ? { ok: true, data: [{ timestamp: new Date().toISOString(), value: 55, quality: 0 }] }
        : { ok: true, data: [] }
    },
  })

  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', {
    senal: 'nivel', periodo: 'últimos 60 días',
  })

  assert.equal(r.ok, true, `no debería fallar por tramos parciales: ${r.error}`)
  assert.ok(r.muestras > 0, 'al menos los tramos con dato deben contarse')
})

await checkAsync('nunca se piden más muestras de las que el servidor entrega', async () => {
  // Si se piden más, el servidor recorta y devuelve una serie incompleta SIN
  // decirlo: el máximo de un día sería el de sus primeras horas.
  const client = clienteFalso()
  await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'nivel', periodo: 'ayer' })

  const { startDate, endDate, interval } = client.historial[0]
  const segundos = (new Date(endDate) - new Date(startDate)) / 1000
  const [h, m, s] = interval.split(':').map(Number)
  const puntos = segundos / (h * 3600 + m * 60 + s)

  assert.ok(puntos <= MAX_PUNTOS, `pidió ${Math.round(puntos)} puntos, el tope es ${MAX_PUNTOS}`)
})

await checkAsync('el resumen trae los extremos CON su hora, y no las muestras crudas', async () => {
  // Devolverle 24 muestras al modelo y pedirle el mayor es pedirle aritmética,
  // que es justo lo que el prompt le prohíbe.
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', { senal: 'nivel del tanque', periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true)
  for (const campo of ['minimo', 'maximo', 'promedio', 'primero', 'ultimo', 'muestras']) {
    assert.ok(r[campo] !== undefined, `falta ${campo}`)
  }
  assert.ok(r.minimoEn && r.maximoEn, 'un extremo sin su hora no se puede contrastar')
  assert.ok(r.minimo <= r.maximo)
  assert.equal(r.fuente, 'historiador')
})

await checkAsync('una señal que sólo vale en marcha lo advierte en su historia', async () => {
  // La instalación está parada casi siempre, así que un promedio de caudal
  // cercano a cero refleja las horas en reposo y no una avería.
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', { senal: 'caudal', periodo: 'ayer' })

  assert.ok(r.avisoReposo, 'el caudal sólo significa algo con la bomba en marcha')
})

await checkAsync('sin ninguna muestra se dice, en vez de devolver un resumen de ceros', async () => {
  const client = clienteFalso({ historia: async () => ({ ok: true, data: [] }) })
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'nivel' })

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

await checkAsync('un 502 manda a levantar servicios, no a revisar el historiador', async () => {
  // Son dos averías que se arreglan en sitios distintos. 500 es «el punto no
  // está coleccionado»; 502/504 los pone el puente y significan que no se
  // llegó al servidor.
  const client = clienteFalso({ historia: async () => ({ ok: false, status: 504 }) })
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'nivel' })

  assert.equal(r.ok, false)
  assert.match(r.error, /no se pudo contactar|GENESIS/i)
})

await checkAsync('una señal inventada devuelve el catálogo para corregirse sin otra ronda', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client }).ejecutar('historia_de_senal', { senal: 'el OEE' })

  assert.equal(r.ok, false)
  assert.equal(client.historial.length, 0, 'ni siquiera se pregunta')
  assert.equal(r.senales.length, 8, 'y viaja la lista de las que sí existen')
})

/* ── comparar_periodos ───────────────────────────────────────────────── */

console.log('\n── comparar_periodos ───────────────────────────────────────')

await checkAsync('la diferencia la calcula el backend, no el modelo', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('comparar_periodos', {
    senal: 'nivel', periodoA: 'últimas 4 horas', periodoB: 'última hora',
  })

  assert.equal(r.ok, true)
  assert.ok(r.diferencia, 'la resta viene hecha')
  assert.ok('promedio' in r.diferencia)
  assert.match(r.nota, /menos/, 'y se dice en qué sentido va la resta')
})

await checkAsync('las claves son los períodos YA resueltos, no el texto del modelo', async () => {
  // Para que redacte con el período real y no con el «ayer» que escribió él.
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('comparar_periodos', {
    senal: 'nivel', periodoA: 'última hora', periodoB: 'últimas 2 horas',
  })

  assert.ok(r['la última hora'], 'falta el período A resuelto')
  assert.ok(r['las últimas 2 horas'], 'falta el período B resuelto')
})

await checkAsync('comparar una señal SIN historia se niega igual, y sin salir a la red', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client }).ejecutar('comparar_periodos', {
    senal: 'carga del motor', periodoA: 'última hora', periodoB: 'ayer',
  })

  assert.equal(r.ok, false)
  assert.equal(client.historial.length, 0)
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
  assert.equal(r.senales.length, 8)
})

await checkAsync('un número junto a una palabra de límite es un candidato citable', async () => {
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

await checkAsync('una página sobre la señal sin ningún patrón de límite lo dice, no inventa uno', async () => {
  const indiceDocumentos = indiceDocumentosFalso([
    { archivo: 'Manual.pdf', pagina: 3, score: 0.5, texto: 'La tensión de línea alimenta el variador de frecuencia.' },
  ])
  const r = await createHerramientas({ client: clienteFalso(), indiceDocumentos })
    .ejecutar('limites_del_manual', { senal: 'tensión' })

  assert.equal(r.ok, false)
  assert.match(r.error, /ning[uú]na tiene un n[uú]mero/i)
})

await checkAsync('«máximo» y «mínimo» CON acento se reconocen, no sólo sin él', async () => {
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

await checkAsync('el límite de una señal no se cuela como candidato de otra en el mismo fragmento', async () => {
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

await checkAsync('un rango ambiguo ("de 100 a 132") no produce un exceso falso en el diagnóstico', async () => {
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

await checkAsync('sin señal nombrada, se parte de las cuatro con historia y se dice por qué', async () => {
  const r = await createHerramientas({ client: clienteFalso() }).ejecutar('diagnostico', {
    sintoma: 'algo va mal, no sé qué',
  })
  assert.equal(r.ok, true)
  assert.deepEqual(r.senalesConsideradas.sort(), [
    'Caudal instantáneo', 'Nivel del tanque', 'Presión relativa', 'Temperatura del tanque',
  ].sort())
  assert.match(r.nota, /no nombraba ninguna señal/i)
})

await checkAsync(
  'escenario 1 · "caudal abundante con el motor muy cargado": mezcla una señal CON historia ' +
    'y otra SIN historia, y no rompe ni inventa la correlación que falta',
  async () => {
    /*
     * La señal SIN historia es la CARGA DEL MOTOR, no la tensión.
     *
     * El escenario usaba la tensión hasta el 24-08-2026, cuando pasó a servir
     * su propia serie. Lo que se prueba aquí no es esa señal en concreto sino
     * la mezcla —una con historia y otra sin ella—, así que se cambia por una
     * que siga sin tenerla en vez de reescribir la invariante.
     */
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
  }
)

await checkAsync(
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

await checkAsync(
  'señales por defecto: las que tienen historia como gráfico, el resto en tabla, y el PDF ' +
    'se escribe a disco de verdad',
  async () => {
    const reportes = await reportesTmp()
    const r = await createHerramientas({ client: clienteFalso(), reportes }).ejecutar(
      'generar_reporte',
      {}
    )

    assert.equal(r.ok, true)
    // El reparto sale del catálogo, no de una lista escrita aquí: al historizar
    // una señal más, pasa sola de la tabla al gráfico.
    assert.deepEqual(r.senalesConGrafico.sort(), [
      'Caudal instantáneo', 'Nivel del tanque', 'Presión relativa', 'Temperatura del tanque',
      'Tensión de línea',
    ].sort())
    assert.deepEqual(r.senalesEnTabla.sort(), [
      'Carga de trabajo del motor', 'Eficiencia energética', 'Modo del variador',
    ].sort())

    // El resultado para el modelo lleva el enlace, NUNCA el PDF — mismo
    // contrato que `grafico_de_senal` con el SVG.
    assert.equal(r._adjunto.tipo, 'reporte')
    assert.match(r._adjunto.url, /^\/api\/reportes\?id=[0-9a-f-]{36}$/i)

    const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
    const contenido = await readFile(join(reportes.dir, `${id}.pdf`))
    assert.equal(contenido.subarray(0, 4).toString(), '%PDF', 'el archivo escrito es un PDF de verdad')
  }
)

await checkAsync('una lista explícita de señales: sólo esas entran, no las ocho', async () => {
  const r = await createHerramientas({ client: clienteFalso(), reportes: await reportesTmp() }).ejecutar(
    'generar_reporte',
    // Una CON historia (gráfico) y otra SIN ella (tabla). La tensión servía de
    // ejemplo de «sin historia» hasta que pasó a tener la suya el 24-08-2026.
    { senales: ['nivel', 'carga del motor'] }
  )
  assert.equal(r.ok, true)
  assert.deepEqual(r.senalesConGrafico, ['Nivel del tanque'])
  assert.deepEqual(r.senalesEnTabla, ['Carga de trabajo del motor'])
})

await checkAsync('una señal inventada en la lista se ignora y se reporta, no rompe el reporte', async () => {
  const r = await createHerramientas({ client: clienteFalso(), reportes: await reportesTmp() }).ejecutar(
    'generar_reporte',
    { senales: ['nivel', 'xyzzy inexistente'] }
  )
  assert.equal(r.ok, true)
  assert.deepEqual(r.senalesConGrafico, ['Nivel del tanque'])
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

await checkAsync('las marcas del resumen van en HORA LOCAL, no en UTC', async () => {
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

await checkAsync('una serie recortada por el servidor se declara truncada', async () => {
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

await checkAsync('valor_en_momento pide el INSTANTE, con sus minutos', async () => {
  /*
   * Los minutos son la pregunta: `resolverPeriodo` los descarta a propósito
   * —y bien, para un tramo—, así que un instante necesita su propio camino.
   * Y el agregado tiene que ser `Interpolative`: `Average` sobre un minuto
   * promedia lo que haya dentro, que ya no es «cuánto marcaba entonces».
   */
  const client = clienteFalso({
    historia: ({ startDate }) => ({
      ok: true,
      data: [{ timestamp: startDate, value: 6.1, quality: 0 }],
    }),
  })

  const r = await createHerramientas({ client })
    .ejecutar('valor_en_momento', { senal: 'nivel del tanque', momento: '2026-08-21 a las 11:16' })

  assert.equal(r.ok, true)
  assert.equal(r.valor, 6.1)
  assert.equal(r.exacto, false, 'un valor reconstruido no puede anunciarse como exacto')

  const pedido = client.historial[0]
  assert.equal(pedido.aggregate, 'Interpolative')

  const inicio = new Date(pedido.startDate)
  assert.equal(inicio.getHours(), 11, 'la hora local pedida')
  assert.equal(inicio.getMinutes(), 16, 'los minutos NO se redondean a la hora')
})

await checkAsync('el sufijo de zona horaria de la planta no rompe la frase', async () => {
  // «hora mexico» no cambia el instante —el servidor YA está en esa zona—,
  // pero antes impedía que la frase se reconociera y el operador recibía un
  // «no entiendo el período» a una pregunta perfectamente formada.
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', {
      senal: 'nivel del tanque',
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

await checkAsync('valor_en_momento respeta la guarda de señales sin historia', async () => {
  // La misma regla que el resto: sin ella el servidor devuelve la curva de la
  // temperatura del tanque bajo el nombre de otra señal, y sin dar error.
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('valor_en_momento', { senal: 'carga del motor', momento: 'ayer a las 11:16' })

  assert.equal(r.ok, false)
  assert.ok(r.senalesConHistoria, 'tiene que ofrecer las que sí tienen serie')
})

/* ── Cobertura: qué significa el recuento de puntos ──────────────────── */

console.log('\n── La cobertura del período ────────────────────────────────')

await checkAsync('el recuento se llama `puntos`, y `muestras` sigue como alias', async () => {
  /*
   * «28 muestras registradas» hacía entender que el sensor midió 28 veces en
   * todo el día; midió decenas de miles. Lo que hay son 28 promedios de 15
   * min. El alias se mantiene porque el frontend ya lo leía.
   */
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', { senal: 'nivel', periodo: 'ayer' })

  assert.equal(r.ok, true)
  assert.equal(r.puntos, r.muestras, '`puntos` y `muestras` tienen que coincidir')
  assert.equal(r.tramoPorPunto, '15 min', 'hay que decir de cuánto es cada punto')
})

await checkAsync('un período con huecos declara su cobertura y advierte del sesgo', async () => {
  /*
   * El caso real del 21-08-2026: 28 de 96 tramos con dato, porque la
   * instalación sólo operó de 07:30 a 17:00. El promedio es el de esas horas,
   * no el del día, y sin decirlo se lee como si fuera el del día completo.
   */
  const client = clienteFalso({
    historia: ({ startDate }) => {
      const t0 = new Date(startDate).getTime()
      // Cuatro puntos sueltos donde caben muchos más.
      return {
        ok: true,
        data: [0, 1, 2, 3].map((i) => ({
          timestamp: new Date(t0 + i * 900_000).toISOString(),
          value: 50 + i,
          quality: 0,
        })),
      }
    },
  })

  const r = await createHerramientas({ client })
    .ejecutar('historia_de_senal', { senal: 'nivel', periodo: 'ayer' })

  assert.equal(r.ok, true)
  assert.equal(r.tramosConDato, 4)
  assert.ok(r.tramosPosibles > 4, 'un día da para muchos más de cuatro tramos de 15 min')
  assert.ok(r.avisoCobertura, 'con huecos hay que advertir del sesgo del promedio')
  assert.match(r.avisoCobertura, /no del período completo/)
})

await checkAsync('sin huecos no se advierte de nada', async () => {
  // El cliente falso rellena las 24 posiciones de la ventana por defecto: ahí
  // el promedio SÍ es el del período, y un aviso sobraría.
  const r = await createHerramientas({ client: clienteFalso() })
    .ejecutar('historia_de_senal', { senal: 'nivel', periodo: 'últimas 6 horas' })

  assert.equal(r.ok, true)
  assert.equal(r.tramosConDato, r.tramosPosibles, 'la ventana por defecto viene completa')
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

await checkAsync('leerSerieEnRango nunca supera el tope de tramos simultáneos', async () => {
  // `readHistory` cuenta cuántas llamadas están EN VUELO a la vez: sube el
  // contador al entrar, espera un instante (para que las que arrancan juntas
  // se solapen de verdad) y lo baja al salir. Si `leerSerieEnRango` lanzara
  // todos los días de golpe (el comportamiento de antes de esta fase), el
  // pico llegaría a 30; con la cola acotada no debe pasar del tope pedido.
  let enVuelo = 0
  let pico = 0
  const client = clienteFalso({
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
    { senal: 'nivel del tanque', dias: 30 }
  )

  assert.equal(r.ok, true)
  assert.ok(pico <= TOPE, `pico de llamadas simultáneas=${pico}, tope=${TOPE}`)
  assert.ok(pico > 1, `pico=${pico}: si es 1, la prueba no está midiendo concurrencia de verdad`)
})

await checkAsync('sin pasar historyConcurrencia, el valor por defecto sigue acotando (no "todo a la vez")', async () => {
  let enVuelo = 0
  let pico = 0
  let llamadas = 0
  const client = clienteFalso({
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

  // Sin pasar `historyConcurrencia`: el defecto de la propia función (6).
  const r = await createHerramientas({ client }).ejecutar('perfil_de_senal', {
    senal: 'nivel del tanque',
    dias: 30,
  })

  assert.equal(r.ok, true)
  assert.ok(pico <= 6, `pico=${pico}, defecto=6`)
  // Con el troceado escalonado (Plan 15 Fase 2), 30 días son unos pocos
  // tramos anchos, no 30 tramos de un día — así que "todo de golpe" ya no
  // se mide en llamadas totales (siempre serán pocas), sino en que el PICO
  // de concurrencia sea menor que el total de llamadas: si coincidieran,
  // significaría que se lanzaron todas a la vez pese al tope.
  assert.ok(pico < llamadas, `pico=${pico}, llamadas=${llamadas}: deberían lanzarse en más de una tanda`)
})

/* ── Invariantes del registro ────────────────────────────────────────── */

console.log('\n── El registro ─────────────────────────────────────────────')

check('son diecisiete herramientas, y sólo una de ellas escribe', () => {
  const h = createHerramientas({ client: clienteFalso() })

  assert.deepEqual(h.nombres, [
    /* Las cuatro de sistemas van primero a propósito: `sistemas_de_la_planta`
       es la que el modelo tiene que encontrar cuando no sabe de qué máquina le
       hablan, y el orden del catálogo es lo primero que lee. */
    'sistemas_de_la_planta',
    'riesgos_activos',
    'estado_de_vibraciones',
    'pronostico_de_desgaste',
    'estado_del_sistema',
    'historia_de_senal',
    'valor_en_momento',
    'comparar_periodos',
    'controlar_bomba',
    'analisis_de_senal',
    'perfil_de_senal',
    'correlacionar_senales',
    'grafico_de_senal',
    'generar_reporte',
    'consultar_documentacion',
    'limites_del_manual',
    'diagnostico',
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

await checkAsync('en modo solo lectura no escribe, y dice de quién es el límite', async () => {
  const client = clienteFalso()
  const r = await createHerramientas({ client, readOnly: true }).ejecutar('controlar_bomba', {
    encender: true,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /ICONICS_READ_ONLY/)
  // Lo que importa no es el mensaje: es que la escritura no llegó a la red.
  assert.equal(client.escrituras.length, 0)
})

await checkAsync('con el tanque por encima del aviso se niega a encender', async () => {
  const client = clienteFalso({ valores: { ...EN_REPOSO, SNIVEL_TANQUE: 97 } })
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {
    encender: true,
  })

  assert.equal(r.ok, false)
  assert.match(r.error, /desbordar/i)
  assert.equal(client.escrituras.length, 0)
})

await checkAsync('apagar NO mira el nivel: vaciar nunca desborda', async () => {
  const client = clienteFalso({ valores: { ...EN_REPOSO, SNIVEL_TANQUE: 97 }, controlInicial: true })
  const r = await createHerramientas({ client, readOnly: false }).ejecutar('controlar_bomba', {
    encender: false,
  })

  assert.equal(r.ok, true)
  assert.equal(r.accion, 'apagada')
})

await checkAsync('una escritura aceptada pero sin efecto NO se cuenta como cumplida', async () => {
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

await checkAsync('si el servidor rechaza la escritura, se cuenta el motivo', async () => {
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

check('las definiciones avisan de que sólo cuatro señales tienen historia', () => {
  // Las descripciones son parte del programa: es lo único que el modelo lee
  // para decidir, y éste es el fallo más caro que puede cometer.
  const h = createHerramientas({ client: clienteFalso() })
  const def = h.definiciones.find(d => d.function.name === 'historia_de_senal')

  assert.match(def.function.description, /cuatro/i)
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

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/herramientas.mjs y shared/eva/.${c.reset}`)
  process.exit(1)
}

console.log(`${c.verde}${c.negrita}${passed} comprobaciones correctas: las herramientas se mantienen.${c.reset}`)
