/**
 * Corre el banco de evaluación contra el modelo DE VERDAD.
 *
 *   node --env-file=.env.local scripts/medir-asistente.mjs
 *   node --env-file=.env.local scripts/medir-asistente.mjs --caso nivel-ahora
 *   node --env-file=.env.local scripts/medir-asistente.mjs --modelo qwen-3.5-9B
 *
 * ── ESTO NO ES UN VERIFICADOR, Y POR ESO NO SE LLAMA `verificar-` ──
 *
 * No afirma nada: MIDE. No devuelve código de error aunque el modelo suspenda,
 * igual que `medir-calibracion.mjs` y `medir-narracion.mjs`, y por la misma
 * razón — un modelo local pequeño no aprueba el cien por cien y meter esto en
 * una tanda de `verificar-*` pondría la tanda en rojo permanente, que es la
 * forma más rápida de que nadie la vuelva a mirar.
 *
 * Su hermano SÍ es un verificador: `verificar-evaluacion.mjs` prueba que el
 * evaluador juzga como debe, con turnos escritos a mano y sin GPU. Separarlos
 * es lo que impide la trampa obvia — aflojar el evaluador hasta que el modelo
 * apruebe.
 *
 * ── QUÉ NECESITA ───────────────────────────────────────────────────
 *
 * `IA_BASE` apuntando a llama-server (arrancado con `--jinja`, o el modelo no
 * ve las herramientas) e ICONICS alcanzable o `ICONICS_FAKE=true`. Con el
 * transporte falso los números son inventados por el simulador, y eso está
 * bien: lo que se mide es de dónde dice el modelo que salen, no cuánto valen.
 *
 * ── PARA QUÉ SIRVE LO QUE IMPRIME ──────────────────────────────────
 *
 * Para comparar. Se corre antes y después de tocar el prompt, de cambiar de
 * modelo o de añadir una herramienta, y la diferencia es el efecto del cambio.
 * Sin esto, «creo que el 9B va mejor» no se puede contrastar con nada.
 */
import { loadConfig } from '../backend/config.mjs'
import { createApp } from '../backend/app.mjs'
import { BANCO, CASO } from '../backend/ia/evaluacion/banco.mjs'
import { evaluarCaso, resumir } from '../backend/ia/evaluacion/evaluador.mjs'
import { SISTEMAS } from '../shared/eva/comun/sistemas.js'

const c = {
  reset: '\x1b[0m', negrita: '\x1b[1m', verde: '\x1b[32m', rojo: '\x1b[31m',
  amarillo: '\x1b[33m', gris: '\x1b[90m',
}

const argumentos = process.argv.slice(2)
function opcion(nombre) {
  const i = argumentos.indexOf(`--${nombre}`)
  return i === -1 ? null : argumentos[i + 1]
}

/**
 * Los números que el modelo puede citar sin haberlos leído de una herramienta:
 * los del catálogo de la planta, que viajan en sus instrucciones.
 *
 * Salen del registro y no de una lista a mano, por el mismo motivo que el
 * propio prompt (ver `inventarioDeLaPlanta` en `chat.mjs`): una máquina nueva
 * trae los suyos —el «1281» de su módulo, el «10816» de su norma— y nadie va a
 * acordarse de añadirlos aquí.
 */
function numerosDelCatalogo() {
  const textos = SISTEMAS.flatMap(s => [s.nombre, s.maquina, s.historia, ...s.mide, ...s.limitaciones])
  const numeros = new Set()
  for (const texto of textos) {
    for (const bruto of String(texto).matchAll(/-?\d+(?:[.,]\d+)?/g)) {
      numeros.add(Number(bruto[0].replace(',', '.')))
    }
  }
  return [...numeros]
}

const config = loadConfig(process.env)

if (!config.ia.isConfigured) {
  console.log(
    `\n${c.rojo}Falta IA_BASE.${c.reset} Este instrumento habla con el modelo de verdad:\n` +
    '  node --env-file=.env.local scripts/medir-asistente.mjs\n\n' +
    `${c.gris}Para probar el MECANISMO del evaluador sin GPU:\n` +
    `  node scripts/verificar-evaluacion.mjs${c.reset}\n`
  )
  process.exit(1)
}

const app = await createApp(config)
await app.ready()

const soloUno = opcion('caso')
const casos = soloUno ? [CASO[soloUno]].filter(Boolean) : BANCO

if (soloUno && !casos.length) {
  console.log(`\n${c.rojo}No hay ningún caso con id "${soloUno}".${c.reset}`)
  console.log(`${c.gris}Los que hay: ${BANCO.map(caso => caso.id).join(', ')}${c.reset}\n`)
  await app.close()
  process.exit(1)
}

const modelo = opcion('modelo')
if (modelo) {
  const respuesta = await app.inject({
    method: 'POST', url: '/api/chat/modelo', payload: { modelo },
  })
  if (respuesta.statusCode !== 200) {
    console.log(`\n${c.rojo}No se pudo cambiar al modelo "${modelo}".${c.reset} ${respuesta.body}\n`)
    await app.close()
    process.exit(1)
  }
}

/** Lanza una pregunta por el mismo camino que el tablero y recoge el turno. */
async function preguntar(pregunta) {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/chat',
    payload: { pregunta, historial: [] },
  })

  let texto = ''
  const herramientas = []
  const resultados = []

  for (const bloque of respuesta.body.split('\n\n')) {
    const linea = bloque.trim()
    if (!linea.startsWith('data: ')) continue
    let evento
    try {
      evento = JSON.parse(linea.slice('data: '.length))
    } catch {
      continue
    }

    if (evento.tipo === 'texto') texto += evento.delta ?? ''
    if (evento.tipo === 'herramienta') herramientas.push(evento.nombre)
    /*
     * ── HUECO CONOCIDO, Y NO SE DISIMULA ───────────────────────────
     *
     * El flujo SSE lleva QUÉ herramienta se llamó y con qué argumentos, pero
     * NO su resultado: el resultado va al modelo, no a la pantalla, y eso es
     * deliberado (ver `separarAdjuntos` en `chat.mjs`). Así que aquí falta el
     * lado derecho de la auditoría de cifras, y por eso más abajo se desactiva
     * en vez de aplicarla a medias — una auditoría sin los resultados
     * marcaría como inventado casi cualquier número correcto, y un evaluador
     * que da falsos positivos se apaga a la semana.
     *
     * Cerrarlo es el paso siguiente y tiene dos salidas: que el flujo lleve
     * los resultados detrás de una bandera de evaluación, o que este guion
     * construya las herramientas por su cuenta y las vuelva a ejecutar con
     * estos argumentos. La segunda mide lo mismo sin tocar el camino de
     * producción, y es la que conviene.
     */
    if (evento.tipo === 'herramienta' && evento.argumentos) {
      resultados.push({ nombre: evento.nombre, argumentos: evento.argumentos })
    }
  }

  return { texto, herramientas, resultados }
}

console.log(`\n${c.negrita}Banco del asistente${c.reset}  ${c.gris}${casos.length} casos · ${config.ia.base}${c.reset}\n`)

const catalogo = numerosDelCatalogo()
const evaluaciones = []
const empezado = Date.now()

for (const caso of casos) {
  const inicio = Date.now()
  let turno
  try {
    turno = await preguntar(caso.pregunta)
  } catch (error) {
    turno = { texto: '', herramientas: [], resultados: [], error: error.message }
  }

  /*
   * La auditoría de cifras se apoya en los ARGUMENTOS de las herramientas y no
   * en sus resultados (ver `preguntar`), así que aquí sería demasiado estricta
   * y marcaría como inventado casi cualquier número legítimo. Se desactiva
   * dándole todos los números del texto como válidos: lo que este instrumento
   * mide de verdad son las otras cuatro comprobaciones.
   *
   * La auditoría completa vive en `verificar-evaluacion.mjs`, contra turnos
   * con su resultado delante. Cerrar este hueco es el paso siguiente: exige
   * que el flujo SSE lleve los resultados, que hoy no lo hace por diseño.
   */
  const evaluacion = evaluarCaso(caso, turno, {
    tambienValidos: [...catalogo, ...(turno.texto.match(/-?\d+(?:[.,]\d+)?/g) ?? [])
      .map(n => Number(n.replace(',', '.')))],
  })

  evaluaciones.push(evaluacion)

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
  const marca = evaluacion.pasa ? `${c.verde}✓${c.reset}` : `${c.rojo}✗${c.reset}`
  const estado = caso.dependeDelEstado ? `${c.amarillo}~${c.reset}` : ' '

  console.log(`  ${marca}${estado}${caso.id.padEnd(30)} ${c.gris}${segundos} s${c.reset}`)
  for (const fallo of evaluacion.fallos) {
    console.log(`      ${c.gris}${fallo.tipo}: ${fallo.detalle}${c.reset}`)
  }
}

const resumen = resumir(evaluaciones)
const estables = evaluaciones.filter(
  e => !CASO[e.id]?.dependeDelEstado
)
const resumenEstable = resumir(estables)

console.log(`\n${c.negrita}Resultado${c.reset}`)
console.log(`  ${resumen.pasan} de ${resumen.total} (${(resumen.tasa * 100).toFixed(0)} %)`)
console.log(
  `  ${c.gris}sin los que dependen del estado de la planta: ` +
  `${resumenEstable.pasan} de ${resumenEstable.total} ` +
  `(${(resumenEstable.tasa * 100).toFixed(0)} %)${c.reset}`
)

if (Object.keys(resumen.porTipo).length) {
  console.log(`\n${c.negrita}Por tipo de fallo${c.reset}`)
  for (const [tipo, cuantos] of Object.entries(resumen.porTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tipo.padEnd(12)} ${cuantos}`)
  }
}

console.log(
  `\n${c.gris}${((Date.now() - empezado) / 1000).toFixed(0)} s en total. ` +
  'Esto MIDE, no afirma: no devuelve código de error. Compara esta salida con la de antes ' +
  `del cambio.${c.reset}\n`
)

await app.close()
