/**
 * El juez de un turno del asistente.
 *
 * ── QUÉ PROBLEMA RESUELVE ──────────────────────────────────────────
 *
 * Que no había forma de saber si un cambio en el prompt mejoraba o empeoraba.
 * `verificar-chat.mjs` prueba el MECANISMO del bucle —que la herramienta se
 * ejecuta, que el marcado se filtra, que la cola respeta el orden— y no dice
 * nada sobre la CALIDAD de lo que se contesta. `medir-narracion.mjs` mide una
 * sola instrucción. Todo lo demás era leer respuestas a ojo y opinar.
 *
 * Esto convierte «suena bien» en un número. No juzga el estilo: juzga lo que
 * este proyecto entiende por una respuesta correcta, que está escrito en las
 * reglas del prompt y se puede comprobar sin un modelo.
 *
 * ── LA ASERCIÓN CENTRAL: DE DÓNDE SALE CADA CIFRA ──────────────────
 *
 * `chat.mjs` ya bloquea la respuesta que trae números SIN haber llamado a
 * ninguna herramienta. Es la mitad del problema. La otra mitad —llamar a una
 * herramienta y luego decir un número que no estaba en su resultado— pasa sin
 * que nadie la vea, y es el fallo caro que este proyecto ya midió: el modelo
 * dijo «velocidad eficaz 1,13 mm/s» leyendo el campo de la ACELERACIÓN, con
 * total aplomo y sonando perfecto.
 *
 * `auditarCifras` compara los números de la respuesta contra los que de verdad
 * hubo en los resultados de ese turno. No es un detector de mentiras: es la
 * comprobación aritmética que nadie hace a mano.
 *
 * ── POR QUÉ ES DELIBERADAMENTE PERMISIVO ───────────────────────────
 *
 * Porque un falso positivo aquí es peor que un falso negativo. Si esto marca
 * como inventada una cifra que sí estaba, la evaluación deja de creerse y se
 * apaga; si deja pasar una de más, el banco sigue siendo útil para todo lo
 * demás. Así que se admite:
 *
 *   · el REDONDEO. El servidor entrega `50.09765625` y decir «50,1» es
 *     correcto — de hecho es lo que pide la regla de los decimales.
 *   · la COMA DECIMAL. En español se escribe «1,13», en el JSON está `1.13`.
 *   · los números que aparecen DENTRO de una cadena del resultado: marcas de
 *     tiempo, códigos de fallo, nombres de campo con número.
 *   · los del CATÁLOGO de la planta, que viajan en las instrucciones y son
 *     legítimos de citar: «ISO 10816», «SM 1281», «2 HP».
 */

/**
 * Los números que aparecen en un texto, tal y como los escribiría una persona.
 *
 * Se descartan los que van pegados a un `%` de porcentaje? No: un porcentaje
 * es una medición como cualquier otra y tiene que venir de un resultado. Lo
 * que sí se descarta son los ordinales de lista de markdown (`1.` al principio
 * de línea), que son estructura y no dato.
 */
export function numerosDeTexto(texto) {
  const sinListas = String(texto ?? '').replace(/^\s*\d+[.)]\s/gm, '')
  return [...sinListas.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m => m[0])
}

/** «1,13» → 1.13. Devuelve `null` si no es un número. */
function aNumero(texto) {
  const n = Number(String(texto).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Cuántos decimales escribió quien lo dijo. Es la precisión que reclama. */
function decimalesDe(texto) {
  const partes = String(texto).split(/[.,]/)
  return partes.length > 1 ? partes[1].length : 0
}

/**
 * Todos los números que hubo REALMENTE a la vista en este turno.
 *
 * Recorre el resultado entero: los números sueltos, los que van dentro de una
 * cadena (marcas de tiempo, códigos), y las LONGITUDES de los arreglos —que es
 * de donde sale legítimamente un «hay 8 señales» sin que el 8 esté escrito en
 * ningún campo.
 */
export function numerosDisponibles(valor, acumulado = new Set()) {
  if (valor === null || valor === undefined) return acumulado

  if (typeof valor === 'number') {
    acumulado.add(valor)
    return acumulado
  }

  if (typeof valor === 'string') {
    for (const bruto of numerosDeTexto(valor)) {
      const n = aNumero(bruto)
      if (n !== null) acumulado.add(n)
    }
    return acumulado
  }

  if (Array.isArray(valor)) {
    acumulado.add(valor.length)
    for (const elemento of valor) numerosDisponibles(elemento, acumulado)
    return acumulado
  }

  if (typeof valor === 'object') {
    for (const [clave, v] of Object.entries(valor)) {
      // La clave también puede llevar el número: `velocidad_eficaz_mm_s`,
      // `aceleracion_eficaz_m_s2`, `iso_10816`.
      numerosDisponibles(clave, acumulado)
      numerosDisponibles(v, acumulado)
    }
    return acumulado
  }

  return acumulado
}

/**
 * ¿Está esta cifra respaldada por alguno de los números disponibles?
 *
 * Se admite el redondeo a la precisión que la propia cifra declara: si se
 * escribió «50,1», vale cualquier valor que redondee a 50,1. Si se escribió
 * «50», vale cualquiera entre 49,5 y 50,5 — que es lo que significa decir «50»
 * sin decimales.
 */
function estaRespaldada(bruto, disponibles) {
  const cifra = aNumero(bruto)
  if (cifra === null) return true

  const decimales = decimalesDe(bruto)
  const tolerancia = 0.5 * 10 ** -decimales

  for (const disponible of disponibles) {
    if (Math.abs(disponible - cifra) <= tolerancia) return true
  }
  return false
}

/**
 * Las cifras de la respuesta que NO estaban en ningún resultado del turno.
 *
 * @param {object} opciones
 * @param {string} opciones.texto        lo que el asistente contestó
 * @param {unknown[]} opciones.resultados  lo que devolvieron sus herramientas
 * @param {Iterable<number>} [opciones.tambienValidos]
 *   Números legítimos que no vienen de una herramienta: los del catálogo de la
 *   planta, que viajan en las instrucciones.
 */
export function auditarCifras({ texto, resultados = [], tambienValidos = [] }) {
  const disponibles = new Set(tambienValidos)
  for (const resultado of resultados) numerosDisponibles(resultado, disponibles)

  const inventadas = numerosDeTexto(texto).filter(bruto => !estaRespaldada(bruto, disponibles))

  return {
    ok: inventadas.length === 0,
    inventadas: [...new Set(inventadas)],
    disponibles: disponibles.size,
  }
}

/**
 * Juzga un turno contra lo que un caso del banco espera.
 *
 * ── POR QUÉ DEVUELVE UNA LISTA DE FALLOS Y NO UN BOOLEANO ──────────
 *
 * Porque «falló el caso 12» no dice nada accionable. Lo que hace falta saber
 * al leer una tanda es QUÉ falló: si el modelo no llamó a la herramienta que
 * tocaba, si la llamó y luego se inventó un número, o si contestó bien pero se
 * dejó la salvedad obligatoria. Son tres arreglos distintos.
 *
 * @param {object} caso   una entrada de `banco.mjs`
 * @param {object} turno  `{ texto, herramientas, resultados }`
 */
export function evaluarCaso(caso, turno, { tambienValidos = [] } = {}) {
  const fallos = []
  const texto = String(turno?.texto ?? '')
  const herramientas = turno?.herramientas ?? []
  const plano = texto.replace(/\s+/g, ' ').toLowerCase()

  /* 1. ¿Llamó a lo que tocaba? */
  if (caso.herramienta) {
    const esperadas = [].concat(caso.herramienta)
    if (!esperadas.some(nombre => herramientas.includes(nombre))) {
      fallos.push({
        tipo: 'herramienta',
        detalle:
          `Se esperaba ${esperadas.join(' o ')} y llamó a ` +
          `${herramientas.length ? herramientas.join(', ') : 'ninguna herramienta'}.`,
      })
    }
  }

  /* 2. ¿Se inventó alguna cifra? Ver la cabecera. */
  const auditoria = auditarCifras({
    texto,
    resultados: turno?.resultados ?? [],
    tambienValidos,
  })
  if (!auditoria.ok) {
    fallos.push({
      tipo: 'cifra',
      detalle:
        `Estas cifras no están en ningún resultado del turno: ${auditoria.inventadas.join(', ')}.`,
    })
  }

  /* 3. ¿Dijo lo que tenía que decir? */
  for (const idea of caso.debeMencionar ?? []) {
    const encaja = idea instanceof RegExp ? idea.test(plano) : plano.includes(idea.toLowerCase())
    if (!encaja) {
      fallos.push({ tipo: 'falta', detalle: `No dice nada parecido a: ${idea}` })
    }
  }

  /* 4. ¿Dijo algo que NO podía decir? */
  for (const prohibido of caso.noDebeDecir ?? []) {
    const encaja = prohibido instanceof RegExp
      ? prohibido.test(plano)
      : plano.includes(prohibido.toLowerCase())
    if (encaja) {
      fallos.push({ tipo: 'prohibido', detalle: `Dice algo que no debía: ${prohibido}` })
    }
  }

  /* 5. Una respuesta vacía no es una respuesta. */
  if (!texto.trim()) {
    fallos.push({ tipo: 'vacia', detalle: 'El modelo no escribió nada.' })
  }

  return { id: caso.id, pasa: fallos.length === 0, fallos }
}

/** Un resumen de una tanda, con el reparto por tipo de fallo. */
export function resumir(evaluaciones) {
  const porTipo = {}
  for (const evaluacion of evaluaciones) {
    for (const fallo of evaluacion.fallos) {
      porTipo[fallo.tipo] = (porTipo[fallo.tipo] ?? 0) + 1
    }
  }

  const pasan = evaluaciones.filter(e => e.pasa).length
  return {
    total: evaluaciones.length,
    pasan,
    fallan: evaluaciones.length - pasan,
    tasa: evaluaciones.length ? pasan / evaluaciones.length : 0,
    porTipo,
  }
}
