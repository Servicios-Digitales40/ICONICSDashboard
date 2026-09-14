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
import { evaluarCaso, numerosDisponibles, resumir } from '../backend/ia/evaluacion/evaluador.mjs'
import { SISTEMAS } from '../shared/eva/comun/sistemas.js'
/*
 * Para REEJECUTAR lo que el modelo pidió (Plan 23 F4 · IA-02). Ver
 * `herramientasParaAuditar` más abajo: son las mismas piezas que monta
 * `app.mjs`, construidas aparte para poder volver a llamar a una herramienta
 * con los argumentos que ya viajaron por el flujo.
 */
import { createHerramientas } from '../backend/ia/conversacion/herramientas.mjs'
import { createAuthenticator } from '../backend/iconics/authenticator.mjs'
import { createIconicsClient } from '../backend/iconics/client.mjs'
import { createFakeIconicsClient } from '../backend/iconics/fakeClient.mjs'
import { createIndiceDocumentos } from '../backend/ia/indices/documentos.mjs'

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

/**
 * Una instancia de herramientas SOLO para auditar (Plan 23 F4 · IA-02).
 *
 * ── POR QUÉ HACE FALTA UNA SEGUNDA ─────────────────────────────────
 *
 * Porque el flujo SSE lleva QUÉ herramienta se llamó y con qué argumentos,
 * pero no su resultado: el resultado va al modelo, no a la pantalla, y eso es
 * deliberado (ver `separarAdjuntos` en `chat.mjs`). Sin el resultado no se
 * puede saber si una cifra del texto salió de un dato o se la inventó el
 * modelo, que es justo lo que este banco quiere medir.
 *
 * De las dos salidas que el hueco admitía —que el flujo llevara los resultados
 * detrás de una bandera, o que este guion los reconstruyera— se toma la
 * segunda: mide lo mismo sin tocar el camino de producción. `app.inject` no
 * expone las herramientas que la app montó por dentro, así que se montan aquí
 * con la MISMA configuración y el MISMO cliente.
 *
 * ── LO QUE SÍ HAY QUE PASARLE, Y SE APRENDIÓ MIDIENDO ──────────────
 *
 * La primera versión omitía `indiceDocumentos` y `reportes` razonando que las
 * herramientas que dependen de ellos «se niegan solas y no aportan números
 * falsos, sólo no aportan ninguno». **Era falso, y el instrumento lo demostró
 * en su primera tanda contra el modelo real (11-09-2026):**
 *
 *   · `limite-del-manual` — el modelo citó «5.8 psi» y «3.3» CON su archivo y
 *     su página. Correcto. La reejecución falló con «falta IA_DOCS_DIR», no
 *     devolvió números, y las dos cifras se marcaron como inventadas.
 *   · `reporte-en-pdf` — el «7» de «últimos 7 días» quedó sin respaldo porque
 *     `generar_reporte` se negó por falta de carpeta.
 *
 * Una herramienta que no puede correr no deja el resultado «vacío»: deja la
 * auditoría CIEGA, y una auditoría ciega acusa. Es justo lo que la cabecera de
 * este archivo advertía —un evaluador con falsos positivos se apaga a la
 * semana— reintroducido por el atajo. Así que se le pasa todo lo que el turno
 * pudo usar.
 *
 * El `diario` sigue fuera, y ése sí a propósito: reejecutar no es accionar, y
 * una medición no debe dejar escrituras de mentira en el diario de
 * accionamientos.
 */
const herramientasParaAuditar = createHerramientas({
  client: config.iconics.fake
    ? createFakeIconicsClient({ limits: config.limits })
    : createIconicsClient(config, createAuthenticator(config)),
  turnos: config.ia.turnos,
  /* Solo lectura SIEMPRE, pase lo que pase en la config: si el banco llegara a
     tener un caso que acciona la bomba, reejecutarlo la accionaría de verdad
     una segunda vez. Medir no puede tener efectos sobre la planta. */
  readOnly: true,
  historyConcurrencia: config.limits.historyConcurrencia,
  indiceDocumentos: config.ia.docsDir
    ? createIndiceDocumentos({
      carpeta: config.ia.docsDir,
      embeddingBase: config.ia.embeddingBase,
      embeddingModelo: config.ia.embeddingModelo,
    })
    : null,
  reportes: config.reportes,
})

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

/**
 * ¿Cada cifra no respaldada es una DERIVA o una INVENCIÓN?
 *
 * Se considera deriva si el resultado trae un número parecido —dentro del 2 %
 * o de media unidad, lo que sea mayor—, que es el orden en que se mueve una
 * señal en vivo entre el turno y la reejecución. No perdona nada: sólo lo
 * cuenta aparte, para que la medición diga qué está midiendo.
 */
function clasificarDesajustes(detalle, resultados) {
  const disponibles = new Set()
  for (const resultado of resultados ?? []) numerosDisponibles(resultado, disponibles)

  const citadas = [...detalle.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m => Number(m[0].replace(',', '.')))
  const notas = []

  for (const cifra of citadas) {
    const margen = Math.max(0.5, Math.abs(cifra) * 0.02)
    const cerca = [...disponibles].filter(n => Math.abs(n - cifra) <= margen)
    if (cerca.length) {
      notas.push(`${cifra} ≈ ${cerca[0]} (deriva de señal viva)`)
    }
  }

  return notas.length ? ` — parece deriva, no invención: ${notas.join('; ')}.` : ' — sin nada parecido en el resultado.'
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
  /** `{nombre, argumentos}` de cada llamada, para poder reejecutarla. */
  const llamadas = []

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
    if (evento.tipo === 'herramienta' && evento.argumentos) {
      llamadas.push({ nombre: evento.nombre, argumentos: evento.argumentos })
    }
  }

  /*
   * ── EL LADO DERECHO DE LA AUDITORÍA (Plan 23 F4 · IA-02) ───────────
   *
   * Aquí estaba el hueco que este guion documentaba en dos comentarios: el
   * flujo trae los argumentos pero no los resultados, así que la auditoría de
   * cifras no tenía contra qué contrastar y se desactivaba dándole por buenos
   * todos los números del texto. Con eso no podía fallar nunca, lo cual anulaba
   * de facto la comprobación que más importa de un asistente que habla de datos
   * de planta.
   *
   * Se cierra reejecutando cada llamada con los argumentos que YA viajaron por
   * el flujo. No se le pide nada nuevo a `chat.mjs`.
   *
   * ── LO QUE ESTO MIDE, Y LO QUE NO ──────────────────────────────────
   *
   * Mide si la cifra que el modelo escribió existe en el dato que la
   * herramienta devuelve. NO mide que sea el mismo instante: entre la llamada
   * del turno y esta reejecución pasan segundos, y una señal en vivo puede
   * haberse movido. Por eso un número que no encaje no es «el modelo mintió»
   * sino «no está respaldado por lo que la herramienta devuelve ahora», y por
   * eso el banco marca `dependeDelEstado` en los casos donde eso es esperable
   * — el resumen los cuenta aparte.
   *
   * Un fallo al reejecutar no invalida el caso: se guarda igual, y como no
   * aporta números, la auditoría tratará como inventadas las cifras que
   * dependían de él. Es lo correcto: si no se puede demostrar de dónde salió
   * un número, no está demostrado.
   */
  const resultados = []
  for (const { nombre, argumentos } of llamadas) {
    try {
      resultados.push(await herramientasParaAuditar.ejecutar(nombre, argumentos))
    } catch (error) {
      resultados.push({ ok: false, error: `no se pudo reejecutar: ${error.message}` })
    }
  }

  return { texto, herramientas, resultados, llamadas }
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
   * La auditoría de cifras corre DE VERDAD desde el Plan 23 F4.
   *
   * `tambienValidos` lleva sólo los números del catálogo de la planta —los que
   * viajan en las instrucciones del sistema y el modelo puede citar sin
   * haberlos leído de ninguna herramienta—. Todo lo demás tiene que estar en
   * el resultado de una herramienta que se ha vuelto a ejecutar.
   *
   * Antes aquí se metían ADEMÁS todos los números del propio texto, lo que
   * daba por buena cualquier cifra por el hecho de estar escrita: la
   * comprobación no podía fallar. Lo que queda ahora sí puede, y eso es el
   * punto.
   */
  const evaluacion = evaluarCaso(caso, turno, { tambienValidos: catalogo })

  /*
   * ── DERIVA NO ES INVENCIÓN, Y LA DIFERENCIA SE DICE ────────────────
   *
   * Medido el 11-09-2026 contra la planta real: el modelo contestó «73.6 %» y
   * la reejecución, treinta segundos después, devolvió «73.4 %». El nivel del
   * tanque es una señal VIVA —tres lecturas seguidas dieron 73.4, 73.5, 73.5—
   * así que esa diferencia es el tiempo que pasa entre el turno y la
   * auditoría, no una cifra inventada.
   *
   * Lo que NO se hace es perdonarlo con una tolerancia: un margen puesto a ojo
   * en la única comprobación que existe para impedir números a ojo taparía
   * justo las invenciones pequeñas, que son las creíbles y por tanto las
   * peligrosas. Lo que se hace es DECIR de qué tipo es cada desajuste, y que
   * quien lea la medición decida:
   *
   *   · «cerca de» un número que sí está  → deriva de una señal en vivo
   *   · sin nada parecido en el resultado → invención
   *
   * Con eso, una tanda con muchas derivas dice «esta medición se tomó sobre
   * señales que se mueven», y una con invenciones dice otra cosa muy distinta.
   */
  /*
   * ── SI LA REEJECUCIÓN FALLÓ, NO SE PUEDE ACUSAR ────────────────────
   *
   * Un turno cuyas herramientas no se pudieron volver a ejecutar deja la
   * auditoría sin nada contra qué contrastar, y entonces TODA cifra del texto
   * parece inventada. Eso no es una medición: es el instrumento roto acusando
   * al medido. Se dice, y no se cuenta como invención.
   */
  const reejecucionUtil = (turno.resultados ?? []).some(r => r?.ok !== false)

  for (const fallo of evaluacion.fallos) {
    if (fallo.tipo !== 'cifra') continue
    fallo.detalle += reejecucionUtil
      ? clasificarDesajustes(fallo.detalle, turno.resultados)
      : ' — NO VERIFICABLE: ninguna herramienta se pudo reejecutar, así que no hay con qué contrastar.'
  }

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
