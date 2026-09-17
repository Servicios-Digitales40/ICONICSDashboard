/**
 * scripts/verificar-narrador.mjs — Plan 31 F2.
 *
 * ── QUÉ SE PRUEBA AQUÍ, Y POR QUÉ NO BASTA CON `verificar-chat` ─────
 *
 * El narrador de avisos NO pasa por el bucle de conversación: es una llamada
 * suelta al modelo, sin herramientas, para poner en prosa un diagnóstico que ya
 * está calculado. Eso le da un conjunto de fallos propio, y tres de ellos son
 * de los que no se ven mirando la pantalla:
 *
 *  1. **Que el modelo no reciba herramientas.** Con el catálogo en la mano, un
 *     modelo al que se le pide narrar un diagnóstico puede llamar a
 *     `diagnosticar_falla` y traerse otro. Lo que narraría entonces ya no sería
 *     lo que el motor decidió, y el resultado SEGUIRÍA PARECIENDO CORRECTO —es
 *     la peor clase de ruptura de `CLAUDE.md` §2.3.
 *  2. **Que la instrucción sea la del motor, no una copia.** Cada cláusula de
 *     `comoRedactar` tiene un defecto medido detrás. Una segunda versión
 *     «parecida» significa que el próximo arreglo entra en una y no en la otra.
 *  3. **Que un fallo del modelo no se lleve el diagnóstico por delante.** Sin
 *     `IA_BASE`, con el servidor caído, con un 500 o con una respuesta vacía, la
 *     ruta tiene que seguir devolviendo las causas. La narración es el adorno;
 *     el diagnóstico es el dato.
 *
 * No necesita red, ni GPU, ni llama-server, ni ICONICS.
 */
import { createServer } from 'node:http'

import { crearNarrador, instruccionDeNarracion } from '../backend/ia/motor/narrador.mjs'
import { crearHerramientasDeDiagnostico } from '../backend/ia/herramientas/diagnostico/index.mjs'
import { loadConfig } from '../backend/config.mjs'

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

let passed = 0
const fallos = []

async function check(nombre, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ${c.verde}✓${c.reset} ${nombre}`)
  } catch (error) {
    fallos.push(`${nombre} — ${error.message}`)
    console.log(`  ${c.rojo}✗${c.reset} ${nombre}`)
  }
}

function igual(a, b, mensaje) {
  if (a !== b) throw new Error(`${mensaje}: esperaba ${JSON.stringify(b)}, llegó ${JSON.stringify(a)}`)
}

/* ── llama-server falso ──────────────────────────────────────────────── */

/** Qué contesta la próxima llamada; cada prueba lo reemplaza. */
let guion = { contenido: 'El caudal está alto con la presión baja.' }
/** Los cuerpos recibidos, para poder afirmar sobre lo que SE MANDÓ. */
let recibidos = []

const llama = createServer(async (req, res) => {
  if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {
    res.writeHead(404).end('{}')
    return
  }

  const trozos = []
  for await (const t of req) trozos.push(t)
  recibidos.push(JSON.parse(Buffer.concat(trozos).toString()))

  if (guion.estado && guion.estado !== 200) {
    res.writeHead(guion.estado, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'lo que sea' }))
    return
  }
  if (guion.retrasoMs) await new Promise(r => setTimeout(r, guion.retrasoMs))

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: guion.contenido ?? '' } }],
  }))
})

await new Promise(r => llama.listen(0, '127.0.0.1', r))
const llamaBase = `http://127.0.0.1:${llama.address().port}`

/* ── Un diagnóstico de mentira, con la forma de `diagnosticar_falla` ─── */

const DIAGNOSTICO = Object.freeze({
  ok: true,
  sistema: 'tanque',
  riesgoId: 'fuga-en-red',
  causas: [
    { id: 'fuga-red', titulo: 'Fuga o rotura en la red', banda: 'alto', respaldo: { total: 7, datos: 3, manual: 2, casos: 2 } },
    { id: 'valvula', titulo: 'Válvula de impulsión cerrada', banda: 'bajo', respaldo: { total: 2, datos: 1, manual: 1, casos: 0 } },
  ],
  comoRedactar: 'INSTRUCCION-DEL-MOTOR-SIN-CONFUNDIR-CON-OTRA',
})

function narradorDePrueba(extra = {}) {
  const config = loadConfig({ IA_BASE: llamaBase, LOG_LEVEL: 'ERROR', ...extra })
  return crearNarrador({ config })
}

console.log(`\n${c.negrita}── El narrador narra, y no diagnostica ─────────────────────${c.reset}`)

await check('un diagnóstico con causas se narra y devuelve texto', async () => {
  guion = { contenido: 'Caudal alto con presión baja: lo más respaldado es una fuga en la red.' }
  recibidos = []

  const { texto, motivo } = await narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO })

  igual(motivo, null, 'no debería haber motivo de fallo')
  if (!texto?.includes('fuga')) throw new Error(`el texto no llegó: ${JSON.stringify(texto)}`)
})

await check('NO se le mandan herramientas: no puede rediagnosticar', async () => {
  /*
   * La comprobación central de §2.3 en esta superficie. Con `tools` en el
   * cuerpo, el modelo puede llamar a `diagnosticar_falla` y narrar un
   * diagnóstico DISTINTO del que el motor calculó — y la respuesta seguiría
   * pareciendo correcta, que es lo que la hace difícil de detectar sin esto.
   */
  guion = { contenido: 'x' }
  recibidos = []

  await narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO })

  const cuerpo = recibidos[0]
  if ('tools' in cuerpo) throw new Error('se mandaron herramientas al narrador')
  if ('tool_choice' in cuerpo) throw new Error('se mandó tool_choice al narrador')
})

await check('la instrucción del motor viaja LITERAL, no reescrita', async () => {
  /*
   * `comoRedactar` es un registro de defectos medidos («3 casos previos» del
   * 03-09-2026, el orden de §2.3, el `estado` del Plan 28 F3). Si esta ruta
   * escribiera su propia versión, el próximo arreglo entraría en una de las
   * dos y no en la otra — §2.6 aplicado a una instrucción.
   */
  guion = { contenido: 'x' }
  recibidos = []

  await narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO })

  const sistema = recibidos[0].messages.find(m => m.role === 'system')?.content ?? ''
  if (!sistema.includes(DIAGNOSTICO.comoRedactar)) {
    throw new Error('el `comoRedactar` del motor no llegó entero a la instrucción')
  }
})

await check('el diagnóstico llega como JSON, con sus nombres de campo', async () => {
  // `comoRedactar` habla de campos por su nombre («si NO viene `casosCitados`»),
  // así que resumirlo a prosa antes de enseñárselo dejaría esa instrucción
  // hablando de algo que el modelo no tiene delante.
  guion = { contenido: 'x' }
  recibidos = []

  await narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO })

  const usuario = recibidos[0].messages.find(m => m.role === 'user')?.content ?? ''
  if (!usuario.includes('"banda"')) throw new Error('el diagnóstico no viajó como JSON con sus campos')
  if (usuario.includes('INSTRUCCION-DEL-MOTOR')) {
    throw new Error('`comoRedactar` se coló en el mensaje de datos; va en el de sistema')
  }
})

await check('no razona: el pensamiento gastaría del mismo presupuesto del párrafo', async () => {
  guion = { contenido: 'x' }
  recibidos = []

  await narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO })

  igual(recibidos[0].chat_template_kwargs?.enable_thinking, false, 'enable_thinking')
})

console.log(`\n${c.negrita}── Un huérfano no se narra ─────────────────────────────────${c.reset}`)

await check('sin causas no se llama al modelo: es donde se inventaría una', async () => {
  /*
   * Pedirle a un modelo que redacte sobre cero causas es exactamente la
   * situación que produce una causa inventada. La vista ya sabe decir «este
   * riesgo no tiene causas declaradas» sin ayuda de nadie.
   */
  guion = { contenido: 'me invento una causa' }
  recibidos = []

  const { texto, motivo } = await narradorDePrueba().narrar({
    diagnostico: { ok: true, causas: [], aviso: 'no hay causas', comoRedactar: 'x' },
  })

  igual(texto, null, 'no debería narrar')
  igual(motivo, 'sin_causas', 'motivo')
  igual(recibidos.length, 0, 'no debería haberse llamado al modelo')
})

console.log(`\n${c.negrita}── Un fallo del modelo NO se lleva el diagnóstico ───────────${c.reset}`)

await check('sin IA_BASE devuelve null con su motivo, y no lanza', async () => {
  const narrador = crearNarrador({ config: loadConfig({ LOG_LEVEL: 'ERROR' }) })
  const { texto, motivo } = await narrador.narrar({ diagnostico: DIAGNOSTICO })

  igual(texto, null, 'texto')
  igual(motivo, 'sin_servidor', 'motivo')
})

await check('un 500 del servidor no lanza: se dice el motivo', async () => {
  guion = { estado: 500 }
  recibidos = []

  const { texto, motivo } = await narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO })

  igual(texto, null, 'texto')
  igual(motivo, 'servidor_respondio_error', 'motivo')
})

await check('una respuesta VACÍA no se pinta como párrafo en blanco', async () => {
  /*
   * Un modelo que razona puede gastarse el presupuesto entero pensando y
   * devolver `content: ""` con `finish_reason: "length"`. Sin esta red, la
   * vista pintaría un párrafo vacío bajo el título del aviso.
   */
  guion = { contenido: '' }
  recibidos = []

  const { texto, motivo } = await narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO })

  igual(texto, null, 'texto')
  igual(motivo, 'respuesta_vacia', 'motivo')
})

await check('un servidor que no existe no lanza: se degrada diciéndolo', async () => {
  const narrador = crearNarrador({
    config: loadConfig({ IA_BASE: 'http://127.0.0.1:1', LOG_LEVEL: 'ERROR' }),
  })
  const { texto, motivo } = await narrador.narrar({ diagnostico: DIAGNOSTICO })

  igual(texto, null, 'texto')
  igual(motivo, 'sin_conexion', 'motivo')
})

await check('un `signal` abortado corta sin lanzar', async () => {
  guion = { contenido: 'x', retrasoMs: 2000 }
  recibidos = []

  const control = new AbortController()
  const promesa = narradorDePrueba().narrar({ diagnostico: DIAGNOSTICO, signal: control.signal })
  control.abort()

  const { texto, motivo } = await promesa
  igual(texto, null, 'texto')
  igual(motivo, 'corte_de_tiempo', 'motivo')
})

console.log(`\n${c.negrita}── La instrucción dice lo propio de un AVISO ───────────────${c.reset}`)

await check('la instrucción prohíbe saludar y preguntar: nadie está hablando', () => {
  const texto = instruccionDeNarracion('BASE')

  if (!texto.includes('BASE')) throw new Error('perdió la instrucción del motor')
  if (!/No saludes/i.test(texto)) throw new Error('no prohíbe saludar')
  if (!/no hagas preguntas/i.test(texto)) throw new Error('no prohíbe preguntar')
})

await check('la instrucción prohíbe mandar accionar la planta', () => {
  // Plan 31 §2.2: un aviso no acciona planta, y su texto tampoco lo manda.
  const texto = instruccionDeNarracion('BASE')
  if (!/No mandes accionar/i.test(texto)) throw new Error('no prohíbe mandar accionar')
})

await check('la instrucción existe en los dos idiomas, y NO mezcla', () => {
  const es = instruccionDeNarracion('BASE', { idioma: 'es' })
  const en = instruccionDeNarracion('BASE', { idioma: 'en' })

  if (es === en) throw new Error('los dos idiomas dan el mismo texto')
  if (!/No saludes/i.test(es)) throw new Error('el español no es español')
  if (!/Do not greet/i.test(en)) throw new Error('el inglés no es inglés')
  if (/No saludes/i.test(en)) throw new Error('el inglés arrastra español')
})

console.log(`\n${c.negrita}── Lo que el modelo NO puede deducir por su cuenta ─────────${c.reset}`)

await check('un diagnóstico completo NO se puede narrar como si faltaran fuentes', async () => {
  /*
   * ── EL DEFECTO MEDIDO EL 17-09-2026 ─────────────────────────────────
   *
   * Primera narración de este proyecto contra el modelo real: con
   * `estado: "completo"` y `manual: 1`, el 4B escribió «No pude consultar los
   * manuales ni los casos previos». Falso — las tres fuentes contestaron; dos
   * devolvieron 0 PUNTOS, que no es lo mismo que estar caídas.
   *
   * Es el mismo patrón que el «3 casos previos» del 03-09 en la dirección
   * contraria: allí inventó respaldo, aquí inventó una avería. Y en un aviso
   * es peor, porque le dice al técnico que el sistema está roto cuando está
   * entero.
   *
   * Lo que se puede comprobar sin el modelo real es que la instrucción ya no
   * se apoya sólo en la AUSENCIA de `estado` —que fue lo que no bastó— sino
   * que afirma lo positivo y desmonta la confusión concreta.
   *
   * Se pide el `comoRedactar` de VERDAD a la herramienta, no el `'BASE'` de
   * relleno de las otras comprobaciones: la cláusula vive ahí, y afirmarlo
   * sobre un texto inventado no probaría nada del sistema real.
   */
  const { diagnosticar_falla } = crearHerramientasDeDiagnostico({
    motorDiagnostico: {
      diagnosticar: async () => ({
        sistema: 'tanque', riesgoId: 'posible-fuga',
        huerfano: false, conflicto: false, estado: 'completo',
        estadoFuentes: { manual: 'consultada', casos: 'sin_respaldo', temporal: 'sin_respaldo' },
        causas: [{
          id: 'fuga-red', titulo: 'Fuga', componente: null, banda: 'medio',
          respaldo: { datos: 3, manual: 0, casos: 0, temporal: 0, total: 3 },
          origen: 'x', manualCitado: [], casosCitados: [],
          evidenciaAFavor: [], evidenciaEnContra: [],
        }],
      }),
    },
  })
  const resultado = await diagnosticar_falla({ sistema: 'tanque', riesgoId: 'posible-fuga' })

  /*
   * El campo viaja SIEMPRE desde el 17-09-2026, también cuando está completo.
   * Antes se omitía —«nada que decir no se dice»— y era la ausencia la que el
   * modelo narraba mal: no puede afirmar «ninguna se cayó» sobre un campo que
   * no ve.
   */
  if (resultado.estado !== 'completo') throw new Error('debería venir `estado: "completo"`')
  if (!Array.isArray(resultado.fuentesCaidas) || resultado.fuentesCaidas.length !== 0) {
    throw new Error('debería venir `fuentesCaidas: []`, explícito y vacío')
  }

  const texto = instruccionDeNarracion(resultado.comoRedactar)

  /*
   * ── LO QUE DE VERDAD LO ARREGLÓ ─────────────────────────────────────
   *
   * La cláusula en `comoRedactar` NO bastó: con el mensaje exacto del
   * narrador, 6 de 6 narraciones seguían abriendo con la avería inventada. La
   * causa estaba en el bloque PROPIO del narrador —el de la forma—, que al
   * pedir «un párrafo corto» empujaba al modelo a abrir con una frase de
   * contexto, y la plantilla más a mano en el prompt era el ejemplo de cómo
   * narrar una fuente caída. Con la frase de abajo: 0 de 6.
   *
   * Por eso se comprueba aquí y no en `comoRedactar`: es donde está el
   * arreglo medido.
   */
  if (!/Empieza por lo que está pasando en la planta/i.test(texto)) {
    throw new Error('no dice por dónde EMPEZAR; prohibir sin dar alternativa no bastó (6/6 fallaban)')
  }
  if (!/NO menciones fuentes, consultas ni limitaciones/i.test(texto)) {
    throw new Error('no prohíbe hablar del sistema de diagnóstico cuando no hay nada caído')
  }
  if (!/fuentesCaidas/.test(texto)) {
    throw new Error('no dice cuál es la ÚNICA señal válida de que algo falló')
  }
  /* Y la cláusula de la herramienta sigue estando, que es la otra mitad. */
  if (!/Un `respaldo` en 0 significa que se consultó/i.test(texto)) {
    throw new Error('no distingue «respaldo 0» de «fuente caída»')
  }
})

await check('la prohibición existe en los DOS idiomas', () => {
  const en = instruccionDeNarracion('BASE', { idioma: 'en' })
  if (!/Start with what is happening in the plant/i.test(en)) {
    throw new Error('el inglés no lleva el arreglo del 17-09')
  }
  if (!/do NOT mention sources, lookups or limitations/i.test(en)) {
    throw new Error('el inglés no prohíbe hablar de las fuentes')
  }
})

await check('la forma va DESPUÉS de la verdad: si se contradicen, gana la forma', () => {
  /*
   * En la mayoría de los modelos la última instrucción pesa más. Lo de arriba
   * son las reglas sobre QUÉ se puede afirmar —donde están los defectos
   * medidos—; lo de abajo es la longitud y el tono. Es preferible que gane la
   * forma antes que la verdad.
   */
  const texto = instruccionDeNarracion('BASE')
  if (texto.indexOf('BASE') > texto.indexOf('No saludes')) {
    throw new Error('la instrucción del motor va después de la de forma')
  }
})

llama.close()

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} fallo(s):${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}·${c.reset} ${f}`)
  process.exit(1)
}
console.log(`${c.verde}${c.negrita}${passed} comprobaciones correctas: el narrador narra lo que el motor decidió.${c.reset}`)
