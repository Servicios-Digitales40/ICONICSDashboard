/**
 * Mide cómo contesta el asistente sobre una MÁQUINA CONFIGURADA. Plan 38 F3.
 *
 *   node --env-file=.env.local scripts/medir-asistente-configurada.mjs
 *   node --env-file=.env.local scripts/medir-asistente-configurada.mjs --maquina vib-motor-03
 *   node --env-file=.env.local scripts/medir-asistente-configurada.mjs --caso desde-su-pantalla
 *   node --env-file=.env.local scripts/medir-asistente-configurada.mjs --modelo qwen-3.5-9B --idioma en
 *
 * ── QUÉ MIDE, Y POR QUÉ NO ES UN CASO MÁS DEL BANCO ────────────────
 *
 * El banco de `medir-asistente.mjs` pregunta por las máquinas escritas a
 * mano, que están en el repo y en cualquier despliegue. Una máquina
 * configurada NO está en el repo: vive en `datos/maquinas.json`, que es del
 * despliegue y no se versiona. Un caso del banco que dijera «¿cómo está
 * Nuevo-Modor?» fallaría en cualquier otra planta, y con razón.
 *
 * Así que este instrumento construye sus preguntas a partir de la máquina
 * que HAY —su nombre, su id, sus señales con serie— y mide una sola cosa,
 * que es la que el Plan 38 dejó sin comprobar: si una pregunta sobre esa
 * máquina LLEGA a esa máquina. Con tres salidas posibles por caso:
 *
 *   · llegó: alguna herramienta corrió con `sistema=<su id>`;
 *   · llegó corrigiendo: antes probó otra cosa (su nombre, un id inventado)
 *     y el error de la herramienta la encaminó — cuesta una ronda más;
 *   · se fue a OTRA máquina: alguna herramienta corrió con el id de otra
 *     entrada del registro. Es la peor: contesta con seguridad sobre la
 *     máquina equivocada, y con dos entradas que describen la misma
 *     instalación (hasta el Plan 34 F5) nadie lo nota por los números.
 *
 * Cada pregunta se hace de dos formas cuando tiene sentido: SIN contexto
 * (nombrando la máquina, como quien pregunta desde cualquier pantalla) y
 * CON el contexto que manda su propia pantalla (`contexto.sistema=<id>`,
 * como declara `Vibraciones.jsx` desde el Plan 37 F3). Separarlas es lo que
 * dice si el problema está en encontrar el id o en hacer caso al contexto.
 *
 * ── ESTO NO ES UN VERIFICADOR ──────────────────────────────────────
 *
 * No devuelve código de error: mide, como sus hermanos `medir-*`. Se corre
 * antes y después de tocar el prompt o las definiciones de las herramientas,
 * y la diferencia es el efecto del cambio. Necesita `IA_BASE` con un
 * `llama-server` arrancado con `--jinja`, e ICONICS alcanzable: con el
 * transporte falso una máquina configurada no tiene física simulada y todos
 * sus puntos vienen sin dato, que es un resultado legítimo pero no el que se
 * quiere medir aquí.
 *
 * ── POR QUÉ APAGA LA AUTENTICACIÓN ─────────────────────────────────
 *
 * La app se monta EN PROCESO y se le pregunta con `app.inject`: no abre
 * ningún puerto, nadie más puede hablarle. Con `AUTH_HABILITADA=true`
 * (que es como está `.env.local` desde el Plan 35) cada `inject` sin token
 * sería un 401, y no hay clave que pedir: las de `AUTH_USUARIOS` son hashes.
 * Se apaga sólo para este proceso, antes de leer la configuración.
 */
process.env.AUTH_HABILITADA = 'false'

import { loadConfig } from '../backend/config.mjs'
import { createApp } from '../backend/app.mjs'
import { SISTEMA, SISTEMA_IDS, sistemasConfigurados } from '../shared/eva/comun/sistemas.js'

const c = {
  reset: '\x1b[0m', negrita: '\x1b[1m', verde: '\x1b[32m', rojo: '\x1b[31m',
  amarillo: '\x1b[33m', gris: '\x1b[90m',
}

const argumentos = process.argv.slice(2)
function opcion(nombre) {
  const i = argumentos.indexOf(`--${nombre}`)
  return i === -1 ? null : argumentos[i + 1]
}

const config = loadConfig(process.env)

if (!config.ia.isConfigured) {
  console.log(
    `\n${c.rojo}Falta IA_BASE.${c.reset} Este instrumento habla con el modelo de verdad:\n` +
    '  node --env-file=.env.local scripts/medir-asistente-configurada.mjs\n'
  )
  process.exit(1)
}

/* El registro se llena con las configuradas al montar la app (Plan 38 F1). */
const app = await createApp(config)
await app.ready()

const configuradas = sistemasConfigurados()
const idPedido = opcion('maquina')
/*
 * Con UNA configurada no hay que decir cuál. Con varias se exige `--maquina`:
 * la primera tanda (21-09-2026) midió sin querer la que iba primero en el
 * registro, y una medición sobre la máquina equivocada se lee igual de bien
 * que una buena.
 */
const maquina = idPedido
  ? configuradas.find(s => s.id === idPedido)
  : (configuradas.length === 1 ? configuradas[0] : null)

if (!maquina) {
  console.log(
    idPedido
      ? `\n${c.rojo}No hay ninguna máquina configurada con id "${idPedido}".${c.reset}`
      : configuradas.length > 1
        ? `\n${c.rojo}Hay ${configuradas.length} máquinas configuradas: di cuál con --maquina <id>.${c.reset}`
        : `\n${c.rojo}No hay ninguna máquina configurada activa en ${config.maquinas.ruta}.${c.reset}`
  )
  if (configuradas.length) {
    console.log(`${c.gris}Las que hay: ${configuradas.map(s => `${s.id} (${s.nombre})`).join(', ')}${c.reset}`)
  } else {
    console.log(`${c.gris}Configura una desde el tablero (Configuración de planta → Nueva máquina) y vuelve.${c.reset}`)
  }
  await app.close()
  process.exit(1)
}

const idioma = opcion('idioma') ?? 'es'
const modelo = opcion('modelo')
if (modelo) {
  const respuesta = await app.inject({ method: 'POST', url: '/api/chat/modelo', payload: { modelo } })
  if (respuesta.statusCode !== 200) {
    console.log(`\n${c.rojo}No se pudo cambiar al modelo "${modelo}".${c.reset} ${respuesta.body}\n`)
    await app.close()
    process.exit(1)
  }
}

/**
 * Una señal con serie propia de la máquina, para la pregunta de historia.
 * Se prefiere una medida de vibración; si no hay, la primera que tenga serie.
 * Sin ninguna, el caso de historia se omite: preguntar por una historia que
 * no existe mide otra cosa (que el asistente se niegue, y eso ya lo mide el
 * banco con `historia-de-la-que-no-tiene`).
 */
function senalConSerie(sistema) {
  const conSerie = sistema.claves().filter(clave => sistema.esHistorizada(clave))
  const clave = conSerie.find(k => /^vRMS/i.test(k)) ?? conSerie[0]
  return clave ? { clave, etiqueta: sistema.etiquetaDe(clave) } : null
}

const { id, nombre } = maquina
const senal = senalConSerie(maquina)

/**
 * @typedef {object} Caso
 * @property {string} id
 * @property {string} pregunta
 * @property {boolean} conContexto   Si viaja `contexto.sistema=<id>` como desde su pantalla.
 * @property {string[]} herramienta  Las que resuelven la pregunta; basta con una.
 * @property {string} porque
 * @property {boolean} [dependeDelEstado]
 */

/** @type {Caso[]} */
const CASOS = [
  {
    id: 'inventario',
    pregunta: '¿Qué máquinas hay en la planta?',
    conContexto: false,
    herramienta: ['sistemas_de_la_planta'],
    porque: 'Si no la lista aquí, nada de lo demás importa: el registro no la trajo al prompt.',
  },
  {
    id: 'por-nombre',
    pregunta: `¿Cómo está ${nombre} ahora mismo?`,
    conContexto: false,
    herramienta: ['estado_del_sistema'],
    porque: 'Quien pregunta dice el NOMBRE; la herramienta quiere el ID. Mide si el modelo lo traduce.',
  },
  {
    id: 'riesgos-por-nombre',
    pregunta: `¿${nombre} tiene algún riesgo activo?`,
    conContexto: false,
    herramienta: ['riesgos_activos'],
    porque: 'Las reglas de una configurada se evalúan por TIPO (Plan 38 F1); es el camino que lo ejercita.',
  },
  {
    id: 'desde-su-pantalla',
    pregunta: '¿Cómo está esta máquina?',
    conContexto: true,
    herramienta: ['estado_del_sistema'],
    porque: 'La pregunta no dice máquina; el contexto de la pantalla sí. Es como se pregunta desde su sección.',
  },
  {
    id: 'riesgos-desde-su-pantalla',
    pregunta: '¿Hay algún riesgo activo?',
    conContexto: true,
    herramienta: ['riesgos_activos'],
    porque: 'Igual que el anterior, para la herramienta que más se usa desde Hallazgos.',
  },
  {
    id: 'apoyos-desde-su-pantalla',
    pregunta: '¿Qué vibración tiene cada apoyo ahora mismo?',
    conContexto: true,
    herramienta: ['estado_del_sistema'],
    porque:
      'Plan 39 F1: el estado de una configurada tiene que traer VALORES por apoyo, no recuentos. ' +
      'Antes de F1 el modelo contestaba «no tiene lecturas disponibles» con 64 de 94 puntos leyendo.',
    /* Además de llegar a la máquina, ¿el texto cita una velocidad con su unidad? */
    citaValores: /\d+[.,]\d+\s*mm\/s/,
    dependeDelEstado: true,
  },
  senal && {
    id: 'historia-desde-su-pantalla',
    pregunta: `¿Cómo ha ido ${senal.etiqueta} en los últimos 7 días?`,
    conContexto: true,
    herramienta: ['historia_de_senal', 'analisis_de_senal', 'perfil_de_senal', 'tendencia_multiple'],
    porque: 'Su historiador es OTRA raíz que la escrita a mano; si se va a la otra, lee series ajenas.',
    /* Plan 39 F2: la serie viaja con su unidad; antes llegaba con `unidad: ''`. */
    citaValores: /mm\/s/,
    dependeDelEstado: true,
  },
  {
    id: 'manual-desde-su-pantalla',
    pregunta: '¿Qué dice la documentación sobre los límites de vibración de esta máquina?',
    conContexto: true,
    herramienta: ['consultar_documentacion', 'limites_del_manual'],
    porque: 'El RAG filtra por sistema con el registro vivo; mide que acepte el id de una configurada.',
    dependeDelEstado: true,
  },
].filter(Boolean)

const soloUno = opcion('caso')
const casos = soloUno ? CASOS.filter(caso => caso.id === soloUno) : CASOS
if (soloUno && !casos.length) {
  console.log(`\n${c.rojo}No hay ningún caso con id "${soloUno}".${c.reset}`)
  console.log(`${c.gris}Los que hay: ${CASOS.map(caso => caso.id).join(', ')}${c.reset}\n`)
  await app.close()
  process.exit(1)
}

/** Lanza la pregunta por el mismo camino que el tablero y recoge el turno. */
async function preguntar(caso) {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/chat',
    payload: {
      pregunta: caso.pregunta,
      historial: [],
      idioma,
      ...(caso.conContexto ? { contexto: { sistema: id } } : {}),
    },
  })

  let texto = ''
  const llamadas = []
  let fin = null
  for (const bloque of respuesta.body.split('\n\n')) {
    const linea = bloque.trim()
    if (!linea.startsWith('data: ')) continue
    let evento
    try { evento = JSON.parse(linea.slice('data: '.length)) } catch { continue }
    if (evento.tipo === 'texto') texto += evento.delta ?? ''
    if (evento.tipo === 'herramienta') llamadas.push({ nombre: evento.nombre, argumentos: evento.argumentos ?? {} })
    if (evento.tipo === 'fin') fin = evento
  }
  return { status: respuesta.statusCode, texto, llamadas, fin }
}

/**
 * A qué máquina fue cada llamada de las herramientas que resuelven el caso.
 *
 * Las de inventario (`sistemas_de_la_planta`) no llevan `sistema` y cuentan
 * como «llegó» si el texto nombra la máquina: es lo único que pueden hacer.
 */
function evaluar(caso, turno) {
  const relevantes = turno.llamadas.filter(l => caso.herramienta.includes(l.nombre))
  const conSistema = relevantes.filter(l => l.argumentos.sistema !== undefined)
  const suyas = conSistema.filter(l => l.argumentos.sistema === id)
  const ajenas = conSistema.filter(l => l.argumentos.sistema !== id && SISTEMA_IDS.includes(l.argumentos.sistema))
  const desconocidas = conSistema.filter(l => l.argumentos.sistema !== id && !SISTEMA_IDS.includes(l.argumentos.sistema))
  const sinSistema = relevantes.filter(l => l.argumentos.sistema === undefined)

  const nombraLaMaquina = turno.texto.includes(nombre) || turno.texto.includes(id)
  const nombraOtra = ajenas.some(l => turno.texto.includes(SISTEMA[l.argumentos.sistema]?.nombre ?? '\u0000'))
  /*
   * Una llamada SIN `sistema` no dice a qué máquina fue, pero el texto sí
   * suele decirlo: en la primera tanda, «¿cómo ha ido la velocidad eficaz?»
   * desde la pantalla de Nuevo-Modor contestó «del motor WEG W22, sistema de
   * vibraciones» — la historia de la escrita a mano, sin nombrar id alguno.
   */
  const otrasNombradas = SISTEMA_IDS
    .filter(s => s !== id && SISTEMA[s]?.nombre && turno.texto.includes(SISTEMA[s].nombre))
    .filter(s => !nombraLaMaquina || !nombre.includes(SISTEMA[s].nombre))

  let veredicto
  if (!relevantes.length) veredicto = 'sin-herramienta'
  else if (caso.herramienta.includes('sistemas_de_la_planta') && !conSistema.length) veredicto = nombraLaMaquina ? 'llego' : 'no-la-nombra'
  else if (ajenas.length) veredicto = 'otra-maquina'
  else if (suyas.length) veredicto = desconocidas.length ? 'llego-corrigiendo' : 'llego'
  else if (sinSistema.length) veredicto = 'sin-decir-maquina'
  else veredicto = 'id-desconocido'

  return { veredicto, suyas, ajenas, desconocidas, sinSistema, nombraLaMaquina, nombraOtra, otrasNombradas }
}

const MARCA = {
  'llego': `${c.verde}✓${c.reset}`,
  'llego-corrigiendo': `${c.amarillo}~${c.reset}`,
  'sin-decir-maquina': `${c.amarillo}?${c.reset}`,
  'otra-maquina': `${c.rojo}✗${c.reset}`,
  'id-desconocido': `${c.rojo}✗${c.reset}`,
  'no-la-nombra': `${c.rojo}✗${c.reset}`,
  'sin-herramienta': `${c.rojo}✗${c.reset}`,
}

console.log(
  `\n${c.negrita}El asistente sobre una máquina configurada${c.reset}  ` +
  `${c.gris}${nombre} (${id}) · ${casos.length} casos · ${config.ia.base} · idioma ${idioma}${c.reset}`
)
console.log(`${c.gris}Otras entradas del registro: ${SISTEMA_IDS.filter(s => s !== id).join(', ')}${c.reset}\n`)

const resultados = []
const empezado = Date.now()

for (const caso of casos) {
  const inicio = Date.now()
  let turno
  try {
    turno = await preguntar(caso)
  } catch (error) {
    turno = { status: 0, texto: '', llamadas: [], fin: null, error: error.message }
  }
  const ev = evaluar(caso, turno)
  resultados.push({ caso, turno, ev })

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
  const estado = caso.dependeDelEstado ? `${c.amarillo}~${c.reset}` : ' '
  console.log(
    `  ${MARCA[ev.veredicto]}${estado}${caso.id.padEnd(28)} ${c.gris}${segundos} s · ` +
    `${turno.fin?.rondas ?? '?'} rondas${caso.conContexto ? ' · con contexto' : ''}${c.reset}`
  )
  const argumentosDe = l => Object.entries(l.argumentos).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
  for (const l of turno.llamadas) {
    const sist = l.argumentos.sistema
    const color = sist === undefined ? c.gris : sist === id ? c.verde : SISTEMA_IDS.includes(sist) ? c.rojo : c.amarillo
    console.log(`      ${color}${l.nombre}(${argumentosDe(l)})${c.reset}`)
  }
  if (turno.error) console.log(`      ${c.rojo}error: ${turno.error}${c.reset}`)
  if (turno.status && turno.status !== 200) console.log(`      ${c.rojo}HTTP ${turno.status}${c.reset}`)
  if (ev.veredicto === 'otra-maquina') {
    console.log(`      ${c.rojo}contestó sobre ${ev.ajenas.map(l => `"${l.argumentos.sistema}"`).join(', ')} en vez de "${id}"` +
      `${ev.nombraOtra ? ' y lo dice en el texto' : ''}${c.reset}`)
  }
  if (!ev.nombraLaMaquina) console.log(`      ${c.gris}el texto no nombra la máquina${c.reset}`)
  if (caso.citaValores) {
    const cita = caso.citaValores.test(turno.texto)
    console.log(`      ${cita ? c.verde : c.amarillo}${cita ? 'cita valores con unidad' : 'NO cita ningún valor con unidad'}${c.reset}`)
  }
  if (ev.veredicto !== 'otra-maquina' && ev.otrasNombradas.length) {
    console.log(`      ${c.amarillo}el texto habla de ${ev.otrasNombradas.map(s => `«${SISTEMA[s].nombre}»`).join(', ')}${c.reset}`)
  }
  const primeraLinea = turno.texto.trim().split('\n').find(Boolean) ?? ''
  console.log(`      ${c.gris}«${primeraLinea.slice(0, 110)}${primeraLinea.length > 110 ? '…' : ''}»${c.reset}`)
}

const cuenta = veredicto => resultados.filter(r => r.ev.veredicto === veredicto).length
const llegaron = cuenta('llego') + cuenta('llego-corrigiendo')

console.log(`\n${c.negrita}Resultado${c.reset}`)
console.log(`  llegaron a ${nombre}:          ${llegaron} de ${resultados.length}` +
  (cuenta('llego-corrigiendo') ? `  ${c.gris}(${cuenta('llego-corrigiendo')} corrigiendo el id)${c.reset}` : ''))
console.log(`  se fueron a OTRA máquina:      ${cuenta('otra-maquina') ? c.rojo : ''}${cuenta('otra-maquina')}${c.reset}`)
console.log(`  sin decir máquina:             ${cuenta('sin-decir-maquina')}`)
console.log(`  sin herramienta / sin nombrar: ${cuenta('sin-herramienta') + cuenta('no-la-nombra') + cuenta('id-desconocido')}`)

const conContexto = resultados.filter(r => r.caso.conContexto)
const sinContexto = resultados.filter(r => !r.caso.conContexto)
const tasa = lista => lista.length
  ? `${lista.filter(r => r.ev.veredicto.startsWith('llego')).length} de ${lista.length}`
  : '—'
console.log(`  ${c.gris}con el contexto de su pantalla: ${tasa(conContexto)} · nombrándola sin contexto: ${tasa(sinContexto)}${c.reset}`)

console.log(
  `\n${c.gris}${((Date.now() - empezado) / 1000).toFixed(0)} s en total. ` +
  'Esto MIDE, no afirma: no devuelve código de error. Compara esta salida con la de antes ' +
  `del cambio.${c.reset}\n`
)

await app.close()
