#!/usr/bin/env node
/**
 * scripts/verificar-chat.mjs
 * ------------------------------------------------------------------
 * Comprueba el bucle de conversación con herramientas **sin modelo real**.
 *
 * Levanta un llama-server falso al que se le dice qué contestar en cada
 * pasada, y monta el chat contra él. Eso permite provocar en milisegundos los
 * casos que con el modelo de verdad tardarían noventa segundos cada uno —y
 * los que no se pueden provocar a voluntad en absoluto, como que el modelo
 * conteste de memoria—.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 *  - Que una respuesta CON cifras y SIN herramienta no salga. Es el fallo de
 *    arrancar llama-server sin `--jinja`, y el más peligroso del sistema
 *    porque parece que funciona.
 *  - Que una herramienta inventada por el modelo no tumbe la petición.
 *  - Que el asistente caído no arrastre al tablero.
 *  - Que dos preguntas a la vez no se repartan la GPU.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-chat.mjs
 *
 * No necesita red, ni GPU, ni llama-server, ni ICONICS.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApp } from '../backend/app.mjs'
import { loadConfig } from '../backend/config.mjs'
import { createChat } from '../backend/ia/chat.mjs'

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

/* ── llama-server falso ──────────────────────────────────────────────── */

/**
 * Qué contesta la próxima pasada. Se reemplaza en cada prueba.
 * @type {{ toolCall?: object, contenido?: string, texto?: string, retrasoMs?: number }}
 */
let guion = {}
let llamadasAlModelo = 0
/** Cuerpos que recibió el modelo, para comprobar QUÉ se le pidió. */
let peticiones = []

const llama = createServer(async (req, res) => {
  if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {
    res.writeHead(404).end()
    return
  }

  let body = ''
  for await (const trozo of req) body += trozo
  const peticion = JSON.parse(body)
  llamadasAlModelo += 1
  peticiones.push(peticion)

  if (guion.retrasoMs) await new Promise(r => setTimeout(r, guion.retrasoMs))
  if (guion.status) {
    res.writeHead(guion.status, { 'Content-Type': 'text/plain' })
    return res.end('modelo caído')
  }

  /* Pasada con streaming: la de redactar. */
  if (peticion.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })

    // Qwen manda el pensamiento por `reasoning_content`, aparte de `content`.
    // El cliente tiene que ignorarlo: enseñarlo sería volcar el borrador del
    // modelo en la pantalla de planta.
    for (const trozo of (guion.razonamiento ?? '').match(/.{1,6}/gs) ?? []) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: trozo } }] })}\n\n`)
    }
    for (const trozo of (guion.texto ?? 'Respuesta.').match(/.{1,6}/gs) ?? []) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: trozo } }] })}\n\n`)
      // Cede el turno para que Node entregue cada evento por separado. Sin
      // esto los fusiona en un solo trozo del cuerpo y no se estaría probando
      // el flujo, sino una entrega de golpe.
      await new Promise(r => setImmediate(r))
    }
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  /* Pasada con herramientas: la de decidir. */
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    choices: [{
      message: {
        content: guion.contenido ?? '',
        ...(guion.toolCall ? { tool_calls: [guion.toolCall] } : {}),
      },
    }],
  }))
})

await new Promise(r => llama.listen(0, '127.0.0.1', r))
const llamaBase = `http://127.0.0.1:${llama.address().port}`

/* ── Herramientas de mentira ─────────────────────────────────────────── */

let ejecutadas = []

const herramientasFalsas = {
  definiciones: [
    { type: 'function', function: { name: 'oee_de_maquina', description: 'x', parameters: {} } },
  ],
  nombres: ['oee_de_maquina', 'listar_maquinas'],

  // El catálogo NO es una herramienta: va en las instrucciones del sistema.
  catalogo: () => [{ id: 'LIN/1', nombre: 'Lineal 1', area: 'Lineales', tieneHistoria: true }],

  async ejecutar(nombre, argumentos) {
    ejecutadas.push({ nombre, argumentos })

    if (nombre === 'listar_maquinas') {
      return { ok: true, maquinas: [{ id: 'LIN/1', nombre: 'Lineal 1', area: 'Lineales', tieneHistoria: true }] }
    }
    if (nombre === 'oee_de_maquina') {
      return { ok: true, maquina: 'LIN/1', fecha: argumentos.fecha, oee: 62.4 }
    }
    return { ok: false, error: `No existe la herramienta "${nombre}".`, herramientas: ['oee_de_maquina'] }
  },
}

function chatDePrueba(extra = {}) {
  const config = loadConfig({ IA_BASE: llamaBase, LOG_LEVEL: 'ERROR', ...extra })
  return createChat({ config, herramientas: herramientasFalsas })
}

/** Recoge todos los eventos de una respuesta. */
async function preguntar(chat, pregunta, historial) {
  const eventos = []
  const resumen = await chat.responder({ pregunta, historial, onEvento: e => eventos.push(e) })
  const texto = eventos.filter(e => e.tipo === 'texto').map(e => e.delta).join('')
  return { eventos, resumen, texto }
}

console.log(`\n${c.negrita}Bucle de conversación con herramientas${c.reset}`)
console.log('\n── El camino feliz ─────────────────────────────────────────')

await check('una pregunta con herramienta: se ejecuta y se redacta', async () => {
  ejecutadas = []
  guion = {
    toolCall: {
      id: 'c1', type: 'function',
      function: { name: 'oee_de_maquina', arguments: '{"maquina":"LIN/1","fecha":"2025-03-25"}' },
    },
    texto: 'El OEE de la Lineal 1 el 25 de marzo de 2025 fue del 62,4 %.',
  }

  const { eventos, resumen, texto } = await preguntar(chatDePrueba(), '¿OEE de la Línea 1 el 25/3/2025?')

  const ejecutada = ejecutadas.find(e => e.nombre === 'oee_de_maquina')
  assert.ok(ejecutada, 'la herramienta debía ejecutarse')
  assert.equal(ejecutada.argumentos.fecha, '2025-03-25')
  assert.equal(resumen.herramienta, 'oee_de_maquina')
  assert.equal(resumen.bloqueada, false)
  assert.match(texto, /62,4/)
  assert.ok(eventos.some(e => e.tipo === 'herramienta'), 'debe anunciar qué herramienta usa')
})

await check('los estados se emiten en orden, para que la pantalla no parezca colgada', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{}' } },
    texto: 'Listo.',
  }
  const { eventos } = await preguntar(chatDePrueba(), 'algo')
  const estados = eventos.filter(e => e.tipo === 'estado').map(e => e.valor)
  assert.equal(estados.length, 3, `esperaba 3 estados, hubo ${estados.length}`)
  assert.match(estados[0], /pensando/i)
  assert.match(estados[1], /consultando/i)
  assert.match(estados[2], /redactando/i)
})

await check('el texto llega troceado, no de golpe al final', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{}' } },
    texto: 'Una respuesta bastante larga para que se parta en varios trozos.',
  }
  const { eventos } = await preguntar(chatDePrueba(), 'algo')
  assert.ok(eventos.filter(e => e.tipo === 'texto').length > 3, 'debería llegar en varios deltas')
})

/* ── El razonamiento del modelo ──────────────────────────────────────── */

console.log('\n── Razonamiento (Qwen y similares) ─────────────────────────')

await check('se piensa para ELEGIR la herramienta y no para redactar', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Hay 10 máquinas.',
  }
  await preguntar(chatDePrueba(), '¿qué máquinas hay?')

  // La primera pasada del bucle es la que lleva `tools`. La de listar el
  // catálogo para el prompt no pasa por el modelo.
  const conHerramientas = peticiones.find(p => p.tools)
  const redactando = peticiones.find(p => p.stream)

  assert.equal(conHerramientas.chat_template_kwargs.enable_thinking, true,
    'elegir herramienta y convertir fechas es donde el razonamiento sirve')
  assert.equal(redactando.chat_template_kwargs.enable_thinking, false,
    'redactar con el dato delante no necesita pensar, y pensar se come el presupuesto')
})

await check('la pasada de decidir lleva presupuesto propio para pensar', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  await preguntar(chatDePrueba({ IA_MAX_TOKENS: '512' }), 'algo')

  const conHerramientas = peticiones.find(p => p.tools)
  const redactando = peticiones.find(p => p.stream)

  assert.ok(conHerramientas.max_tokens > redactando.max_tokens,
    'sin reserva, un razonamiento largo trunca la llamada a la herramienta')
  assert.equal(redactando.max_tokens, 512, 'la respuesta sí usa el tope configurado')
})

await check('el razonamiento NO se enseña: no es la respuesta', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    razonamiento: 'El usuario pregunta por las máquinas. Debería mirar el catálogo y...',
    texto: 'Hay 10 máquinas.',
  }
  const { texto } = await preguntar(chatDePrueba(), '¿qué máquinas hay?')

  assert.equal(texto, 'Hay 10 máquinas.')
  assert.ok(!texto.includes('El usuario pregunta'), 'el borrador del modelo no va a la pantalla')
})

await check('el marcado de una SEGUNDA herramienta no llega a la pantalla', async () => {
  // Visto en planta: preguntando por «el OEE más alto de julio», el modelo
  // consultó el catálogo y luego intentó llamar a otra herramienta. Como la
  // pasada de redactar no lleva herramientas, llama-server no lo interpretó y
  // su marcado salió como texto: un `<tool_call>` crudo en la burbuja.
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{"maquina":"LIN/1","fecha":"2025-03-25"}' } },
    texto: 'LIN/1 tiene datos históricos. Consulto el OEE de julio.\n\n<tool_call>\n<function=get_oee_historico>\n</function>\n</tool_call>',
  }
  const { resumen, texto } = await preguntar(chatDePrueba(), '¿el OEE más alto de julio?')

  assert.ok(!texto.includes('<tool_call>'), 'el marcado no puede llegar al operador')
  assert.ok(!texto.includes('<function='), 'ni en su forma abreviada')
  assert.equal(resumen.marcado, true, 'y tiene que quedar registrado que pasó')
})

await check('lo que dijo ANTES del marcado sí se conserva', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{"maquina":"LIN/1","fecha":"2025-03-25"}' } },
    texto: 'Voy a consultarlo.<tool_call>basura</tool_call>',
  }
  const { texto } = await preguntar(chatDePrueba(), 'algo')

  assert.match(texto, /Voy a consultarlo/, 'el preámbulo es texto legítimo')
  assert.ok(!texto.includes('basura'), 'lo de dentro del marcado no')
})

await check('tras cortar el marcado, el DATO se cuenta igual', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{"maquina":"LIN/1","fecha":"2025-03-25"}' } },
    texto: 'Ahora consulto.<tool_call>x</tool_call>',
  }
  const { texto } = await preguntar(chatDePrueba(), 'algo')

  // La herramienta ya devolvió el dato; perderlo porque el modelo no supo
  // redactarlo sería tirar una consulta que salió bien.
  assert.match(texto, /LIN\/1/, 'el resumen de respaldo tiene que aparecer')
})

await check('un AVISO de la herramienta llega aunque el modelo lo ignore', async () => {
  // Visto en planta: con `rendimiento = 110,4 %` el modelo dio la cifra sin
  // una palabra. Una advertencia que depende de que se acuerde no sirve.
  const conAviso = {
    ...herramientasFalsas,
    ejecutar: async () => ({
      ok: true, maquina: 'LIN/1', oee: 107.9,
      aviso: 'Valor superior al 100 %, no es una medición válida.',
    }),
  }
  const chat = createChat({
    config: loadConfig({ IA_BASE: llamaBase, LOG_LEVEL: 'ERROR' }),
    herramientas: conAviso,
  })

  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{}' } },
    texto: 'El OEE fue del 107,9 por ciento.',   // el modelo omite el aviso
  }
  const { texto } = await preguntar(chat, 'algo')

  assert.match(texto, /no es una medición válida/i, 'el backend tiene que añadirlo')
})

await check('si el modelo YA contó el aviso, no se repite', async () => {
  const conAviso = {
    ...herramientasFalsas,
    ejecutar: async () => ({
      ok: true, maquina: 'LIN/1', oee: 107.9,
      aviso: 'Valor superior al 100 %, no es una medición válida.',
    }),
  }
  const chat = createChat({
    config: loadConfig({ IA_BASE: llamaBase, LOG_LEVEL: 'ERROR' }),
    herramientas: conAviso,
  })

  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{}' } },
    texto: 'El OEE fue 107,9 pero no es una medición válida por un fallo de cálculo.',
  }
  const { texto } = await preguntar(chat, 'algo')

  assert.equal(texto.match(/no es una medición válida/gi)?.length, 1, 'una sola vez')
})

await check('si no redacta nada, se dice el dato igual', async () => {
  // Pasó de verdad con el 4B: el razonamiento se comió `max_tokens` entero y
  // `content` llegó vacío. Una burbuja en blanco no se distingue de una avería.
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{"maquina":"LIN/1","fecha":"2025-03-25"}' } },
    texto: '',
  }
  const { resumen, texto } = await preguntar(chatDePrueba(), '¿OEE de la Línea 1?')

  assert.equal(resumen.sinRedactar, true)
  assert.ok(texto.trim().length > 0, 'no puede quedarse en blanco')
  assert.match(texto, /LIN\/1|Lineal 1/, 'el dato consultado tiene que aparecer')
})

/* ── La regla que no se puede relajar ────────────────────────────────── */

console.log('\n── Respuestas sin herramienta ──────────────────────────────')

await check('CIFRAS sin herramienta NO salen (el fallo de arrancar sin --jinja)', async () => {
  guion = { contenido: 'El OEE de la Línea 1 el 25 de marzo fue del 87,3 %.', toolCall: null }

  const { resumen, texto } = await preguntar(chatDePrueba(), '¿OEE de la Línea 1?')

  assert.equal(resumen.bloqueada, true, 'la respuesta debía bloquearse')
  assert.equal(resumen.herramienta, null)
  assert.ok(!texto.includes('87,3'), 'la cifra inventada no puede llegar al usuario')
  assert.match(texto, /día/i, 'dice lo que SÍ se puede preguntar, que es lo accionable')
  assert.match(texto, /--jinja/, 'y, sin ninguna llamada aún, sugiere revisar la bandera')
})

await check('si el modelo YA usó herramientas, el aviso no culpa a --jinja', async () => {
  // Con `--jinja` bien puesto, una respuesta sin consultar significa que la
  // pregunta no encaja en ninguna herramienta —un rango, un mes—, no que
  // falte la bandera. Mandar a revisarla es enviar a nadie a buscar nada.
  const chat = chatDePrueba()

  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Hay 10 máquinas.',
  }
  await preguntar(chat, '¿qué máquinas hay?')

  guion = { contenido: 'El OEE más alto de julio fue del 87,3 %.', toolCall: null }
  const { resumen, texto } = await preguntar(chat, '¿el OEE más alto de julio?')

  assert.equal(resumen.bloqueada, true)
  assert.ok(!texto.includes('--jinja'), 'la bandera está bien; no hay que mandar a revisarla')
  assert.match(texto, /rangos|día/i, 'y sí decir qué SÍ se puede preguntar')
})

await check('ni herramienta ni texto: NUNCA una burbuja vacía', async () => {
  // Visto con el 4B: preguntando por «el OEE más alto de julio» gastó 16 s
  // pensando, no llamó a nada y devolvió contenido vacío. En pantalla es una
  // burbuja en blanco, indistinguible de una avería.
  guion = { contenido: '', toolCall: null }
  const { resumen, texto } = await preguntar(chatDePrueba(), '¿el OEE más alto de julio?')

  assert.ok(texto.trim().length > 0, 'tiene que decir algo')
  assert.match(texto, /día/i, 'y enumerar lo que sí se puede preguntar')
  assert.equal(resumen.sinRedactar, true)
})

await check('una respuesta SIN cifras sí pasa: un saludo es legítimo', async () => {
  guion = { contenido: 'Hola, puedo consultarte el estado de las máquinas de la planta.', toolCall: null }
  const { resumen, texto } = await preguntar(chatDePrueba(), 'hola')
  assert.equal(resumen.bloqueada, false)
  assert.match(texto, /Hola/)
})

await check('nombrar una máquina no cuenta como cifra inventada', async () => {
  guion = { contenido: '¿Te refieres a la Línea 1 o a la Multi 13?', toolCall: null }
  const { resumen, texto } = await preguntar(chatDePrueba(), 'la linea')
  assert.equal(resumen.bloqueada, false, 'pedir una aclaración es legítimo')
  assert.match(texto, /Multi 13/)
})

/* ── Memoria de conversación (Plan 7) ────────────────────────────────── */

console.log('\n── Memoria de conversación ─────────────────────────────────')

/** Los mensajes que recibió el modelo en la pasada de elegir herramienta. */
const mensajesDeDecidir = () => peticiones.find(p => p.tools).messages

const turnoBase = [
  { rol: 'usuario', texto: '¿OEE de la Línea 1 el 30 de julio de 2026?' },
  { rol: 'asistente', texto: 'El OEE de la Línea 1 el 30 de julio fue del 61,9 %.' },
]

await check('el hilo anterior llega al modelo, y en orden', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{}' } },
    texto: 'Listo.',
  }
  await preguntar(chatDePrueba(), '¿y el día anterior?', turnoBase)

  const m = mensajesDeDecidir()
  assert.equal(m[0].role, 'system', 'las instrucciones van primero')
  assert.equal(m[1].role, 'user')
  assert.match(m[1].content, /30 de julio/)
  assert.equal(m[2].role, 'assistant')
  assert.match(m[2].content, /61,9/)
  assert.equal(m[3].role, 'user')
  assert.equal(m[3].content, '¿y el día anterior?', 'la pregunta nueva va la última')
})

await check('sin historial se comporta como antes', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  const { resumen } = await preguntar(chatDePrueba(), '¿qué máquinas hay?')

  assert.equal(mensajesDeDecidir().length, 2, 'solo system + pregunta')
  assert.equal(resumen.turnosRecordados, 0)
})

await check('el tope lo pone el SERVIDOR, no el cliente', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }

  // Un cliente que manda cincuenta turnos no puede alargar el prompt de todos.
  const largo = Array.from({ length: 50 }, (_, i) => ({
    rol: i % 2 ? 'asistente' : 'usuario',
    texto: `turno ${i}`,
  }))
  const { resumen } = await preguntar(chatDePrueba(), 'otra', largo)

  assert.equal(resumen.turnosRecordados, 8, 'ocho mensajes = cuatro intercambios')
  assert.equal(mensajesDeDecidir().length, 10, 'system + 8 + pregunta')
})

await check('se conservan los ÚLTIMOS turnos, no los primeros', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  const largo = Array.from({ length: 20 }, (_, i) => ({
    rol: i % 2 ? 'asistente' : 'usuario',
    texto: `turno ${i}`,
  }))
  await preguntar(chatDePrueba(), 'otra', largo)

  const m = mensajesDeDecidir()
  assert.match(m[1].content, /turno 12/, 'el hilo reciente es el que importa')
  assert.match(m.at(-2).content, /turno 19/)
})

await check('un turno larguísimo se recorta', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  await preguntar(chatDePrueba(), 'otra', [{ rol: 'usuario', texto: 'x'.repeat(5000) }])

  const m = mensajesDeDecidir()
  assert.ok(m[1].content.length <= 600, `llegó con ${m[1].content.length} caracteres`)
})

await check('la basura en el historial se descarta sin lanzar', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  const basura = [null, 'texto suelto', { rol: 'usuario' }, { texto: '   ' }, { rol: 'usuario', texto: 'válido' }]
  const { resumen } = await preguntar(chatDePrueba(), 'otra', basura)

  assert.equal(resumen.turnosRecordados, 1, 'solo sobrevive el turno bien formado')
})

await check('el historial NO lleva resultados de herramientas', async () => {
  peticiones = []
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  await preguntar(chatDePrueba(), '¿y la Línea 2?', turnoBase)

  // Los `role: tool` de turnos pasados invitarían al modelo a citar la cifra
  // vieja como si fuera la nueva. Solo puede haberlos en la pasada de
  // redactar, que es la de ESTE turno.
  const m = mensajesDeDecidir()
  assert.deepEqual(
    [...new Set(m.map(x => x.role))].sort(),
    ['assistant', 'system', 'user'],
    'en la pasada de decidir no puede haber mensajes de herramienta'
  )
})

/* ── Caminos tristes ─────────────────────────────────────────────────── */

console.log('\n── Caminos tristes ─────────────────────────────────────────')

await check('una herramienta inventada por el modelo no tumba la petición', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'borrar_planta', arguments: '{}' } },
    texto: 'No tengo esa capacidad.',
  }
  const { resumen, texto } = await preguntar(chatDePrueba(), 'borra todo')
  assert.equal(resumen.ok, false, 'la herramienta debe reportar el fallo')
  assert.match(texto, /No tengo/)
})

await check('argumentos mal formados no lanzan', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'oee_de_maquina', arguments: '{esto no es json' } },
    texto: 'Necesito la fecha.',
  }
  const { resumen } = await preguntar(chatDePrueba(), 'algo')
  assert.equal(resumen.herramienta, 'oee_de_maquina')
})

await check('llama-server caído da un error que dice que el tablero sigue', async () => {
  const chat = createChat({
    config: loadConfig({ IA_BASE: 'http://127.0.0.1:1', LOG_LEVEL: 'ERROR' }),
    herramientas: herramientasFalsas,
  })
  await assert.rejects(() => preguntar(chat, 'algo'))
})

await check('un 500 del modelo se propaga con su código', async () => {
  guion = { status: 500 }
  await assert.rejects(
    () => preguntar(chatDePrueba(), 'algo'),
    /llama-server respondió 500/
  )
})

/* ── La ruta HTTP ────────────────────────────────────────────────────── */

console.log('\n── La ruta /api/chat ───────────────────────────────────────')

const baseEnv = { PORT: '0', LOG_LEVEL: 'ERROR', STATIC_DIR: 'react-dashboard/dist' }

async function montar(env) {
  const server = createServer(createApp(loadConfig({ ...baseEnv, ...env })))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${server.address().port}`, server }
}

await check('sin IA_BASE el chat responde 503 y NO cae al index.html', async () => {
  const { base, server } = await montar({})

  const estado = await fetch(`${base}/api/chat`).then(r => r.json())
  assert.equal(estado.habilitado, false)

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta: 'hola' }),
  })
  assert.equal(res.status, 503, 'un 200 con HTML haría creer al frontend que el asistente existe')
  const cuerpo = await res.json()
  assert.match(cuerpo.error, /IA_BASE/)

  server.close()
})

await check('con IA_BASE el estado dice que está habilitado', async () => {
  const { base, server } = await montar({ IA_BASE: llamaBase })
  const estado = await fetch(`${base}/api/chat`).then(r => r.json())
  assert.equal(estado.habilitado, true)
  assert.equal(estado.ocupado, false)
  server.close()
})

await check('una pregunta vacía se rechaza con 400', async () => {
  const { base, server } = await montar({ IA_BASE: llamaBase })
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta: '   ' }),
  })
  assert.equal(res.status, 400)
  server.close()
})

await check('la respuesta es un flujo SSE con sus eventos', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Hay 10 máquinas.',
  }
  const { base, server } = await montar({ IA_BASE: llamaBase })

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta: '¿qué máquinas hay?' }),
  })

  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/event-stream/)
  assert.equal(res.headers.get('x-accel-buffering'), 'no', 'IIS acumularía el flujo sin esto')

  const texto = await res.text()
  const eventos = texto.split('\n\n').filter(Boolean).map(l => JSON.parse(l.replace(/^data: /, '')))

  assert.ok(eventos.some(e => e.tipo === 'estado'), 'faltan los estados')
  assert.ok(eventos.some(e => e.tipo === 'texto'), 'falta el texto')
  assert.ok(eventos.at(-1).tipo === 'fin', 'el último evento debe ser fin')

  server.close()
})

await check('dos preguntas a la vez: la segunda recibe 409, no una espera muda', async () => {
  guion = {
    retrasoMs: 400,
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  const { base, server } = await montar({ IA_BASE: llamaBase })

  const pedir = () => fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta: 'hola' }),
  })

  const primera = pedir()
  await new Promise(r => setTimeout(r, 120))
  const segunda = await pedir()

  assert.equal(segunda.status, 409)
  assert.match((await segunda.json()).error, /otra consulta en curso/i)

  await (await primera).text()
  server.close()
})

await check('tras terminar, el hueco queda libre para la siguiente', async () => {
  guion = {
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  const { base, server } = await montar({ IA_BASE: llamaBase })

  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: 'hola' }),
    })
    assert.equal(res.status, 200, `la petición ${i + 1} debería pasar`)
    await res.text()
  }

  const estado = await fetch(`${base}/api/chat`).then(r => r.json())
  assert.equal(estado.ocupado, false, 'el hueco debe quedar libre')

  server.close()
})

await check('cancelar aborta también la llamada al modelo', async () => {
  guion = {
    retrasoMs: 3000,
    toolCall: { id: 'c1', type: 'function', function: { name: 'listar_maquinas', arguments: '{}' } },
    texto: 'Listo.',
  }
  const { base, server } = await montar({ IA_BASE: llamaBase })

  const abortador = new AbortController()
  const peticion = fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta: 'hola' }),
    signal: abortador.signal,
  })

  await new Promise(r => setTimeout(r, 150))
  abortador.abort()
  await peticion.catch(() => {})

  // El hueco tiene que liberarse sin esperar a que el modelo acabe sus 3 s.
  await new Promise(r => setTimeout(r, 250))
  const estado = await fetch(`${base}/api/chat`).then(r => r.json())
  assert.equal(estado.ocupado, false, 'cancelar debe liberar el hueco de inmediato')

  server.close()
})

/* ── Cierre ──────────────────────────────────────────────────────────── */

llama.close()

console.log()
if (fallos.length) {
  console.log(`${c.rojo}${c.negrita}${fallos.length} comprobación(es) fallida(s)${c.reset}`)
  for (const f of fallos) console.log(`  ${c.rojo}✗${c.reset} ${f}`)
  console.log(`${c.gris}Revisa backend/ia/chat.mjs y backend/routes/chatRoutes.mjs.${c.reset}`)
  process.exit(1)
}

console.log(`${c.verde}${c.negrita}${passed} comprobaciones correctas: el bucle del asistente se mantiene.${c.reset}`)
process.exit(0)
