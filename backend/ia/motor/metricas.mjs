/**
 * Cómo se está comportando el motor de diagnóstico — Plan 28 F7.
 *
 * ── SE LEEN DEL DIARIO, NO SE CUENTAN APARTE ────────────────────────
 *
 * Es la decisión que define este archivo. Lo obvio sería llevar contadores en
 * memoria e irlos incrementando en `diagnosticar()`, y sería peor por dos
 * motivos:
 *
 *  1. **Dos verdades sobre lo mismo.** El diario (F2) ya guarda cada
 *     diagnóstico con su estado, su duración y sus fuentes caídas. Un contador
 *     paralelo puede desincronizarse del diario —un `anotar` que falla, un
 *     contador que no—, y entonces hay dos respuestas a «¿cuántos
 *     diagnósticos insuficientes hubo?» sin forma de saber cuál vale.
 *  2. **Los contadores en memoria se van con el proceso.** Un reinicio del
 *     backend los pone a cero, justo cuando más interesa mirarlos: después de
 *     un incidente. El diario sobrevive.
 *
 * Así que esto no cuenta nada: LEE lo que ya está escrito y lo agrega. El coste
 * es recorrer un JSONL de unos megas, y por eso la ruta que lo sirve acota por
 * ventana en vez de leerlo entero siempre.
 *
 * ── NADA EXTERNO, POR LA MISMA RAZÓN QUE NO HAY BASE DE DATOS ───────
 *
 * No se monta Prometheus ni un cliente de métricas. Sería el mismo salto que
 * §2.2 descarta para la persistencia: una pieza más que instalar, configurar y
 * mantener en una planta, para responder preguntas que un `reduce` sobre un
 * archivo de texto ya contesta.
 *
 * ── LO QUE ESTAS MÉTRICAS SIRVEN PARA VER ───────────────────────────
 *
 * No son decoración de un panel. Cada una responde a una pregunta que hoy no
 * se puede contestar:
 *
 *   huérfanos    ¿cuántos riesgos siguen sin causas transcritas? En
 *                vibraciones eran 15 de 18 el 03-09-2026, y conviene ver ese
 *                número BAJAR conforme se transcriben.
 *   insuficientes ¿con qué frecuencia el diagnóstico sale sin ninguna fuente?
 *                Si sube, algo se está cayendo en planta y nadie lo mira.
 *   fuentes caídas cuál de las tres falla más — el índice de manuales, el de
 *                casos o el historiador.
 *   vetos        cuántas señales se descartan por calidad, y por qué motivo.
 *                Es lo que hace VISIBLE la F4: sin esto, un sensor que lleva
 *                un mes en mala calidad baja bandas en silencio.
 *   duración     p50 y p95. La media escondería el caso lento, que es el que
 *                el técnico nota.
 */

/**
 * Percentil sobre una lista YA ordenada, por interpolación lineal.
 *
 * No se usa la media a propósito: un diagnóstico que tarda diez veces más que
 * los demás desaparece en una media y es exactamente el que hay que ver. El
 * p95 lo enseña.
 */
function percentil(ordenados, p) {
  if (ordenados.length === 0) return null
  if (ordenados.length === 1) return ordenados[0]

  const posicion = (ordenados.length - 1) * p
  const abajo = Math.floor(posicion)
  const arriba = Math.ceil(posicion)
  if (abajo === arriba) return ordenados[abajo]
  return Math.round(ordenados[abajo] + (ordenados[arriba] - ordenados[abajo]) * (posicion - abajo))
}

/** Suma uno a `clave` dentro de `mapa`. */
function contar(mapa, clave) {
  if (clave === undefined || clave === null) return
  mapa[clave] = (mapa[clave] ?? 0) + 1
}

/**
 * Agrega las entradas del diario de diagnósticos.
 *
 * @param {object[]} entradas  tal como las devuelve `crearDiario().leer()`
 * @returns {object} el resumen, listo para servir por HTTP
 */
export function resumirDiagnosticos(entradas = []) {
  /*
   * Las líneas de PODA se saltan: `lib/diario.mjs` las escribe para dejar
   * constancia de lo que se llevó, y contarlas como diagnósticos inflaría los
   * totales con algo que no lo es. Se cuentan aparte, porque una poda
   * significa que faltan entradas que existieron — y quien lea estas métricas
   * tiene que poder distinguir «no pasó» de «ya no está guardado» (§2.4).
   */
  const diagnosticos = entradas.filter((e) => e?.tipo === 'diagnostico')
  const podas = entradas.filter((e) => e?.tipo === 'poda').length

  const porSistema = {}
  const porEstado = {}
  const fuentesCaidas = {}
  const vetosPorMotivo = {}
  const duraciones = []

  let huerfanos = 0
  let conflictos = 0
  let conVeto = 0

  for (const d of diagnosticos) {
    contar(porSistema, d.sistema)
    /*
     * `sin_declarar` y NO «completo» cuando el campo falta. Una línea escrita
     * antes de la F3 no sabe su estado, y darla por completa afirmaría algo
     * que no se midió — el mismo §2.4 que impide disfrazar de cero un dato
     * ausente. Con el nombre a la vista, quien lea las métricas ve que hay
     * entradas viejas en la ventana en vez de creer que todo fue bien.
     */
    contar(porEstado, d.estado ?? 'sin_declarar')

    if (d.huerfano) huerfanos += 1
    if (d.conflicto) conflictos += 1

    for (const fuente of d.snapshot?.fuentesCaidas ?? []) contar(fuentesCaidas, fuente)

    /*
     * Los vetos de calidad (F4) se leen de las CALIDADES archivadas, no de un
     * campo aparte: el snapshot ya guarda el motivo de cada señal, así que
     * contar desde ahí no puede desincronizarse de lo que de verdad pasó.
     */
    const calidades = d.snapshot?.calidades ?? null
    let vetadaAlguna = false
    for (const info of Object.values(calidades ?? {})) {
      if (info?.motivo) {
        contar(vetosPorMotivo, info.motivo)
        vetadaAlguna = true
      }
    }
    if (vetadaAlguna) conVeto += 1

    if (typeof d.duracionMs === 'number') duraciones.push(d.duracionMs)
  }

  duraciones.sort((a, b) => a - b)

  return {
    total: diagnosticos.length,
    porSistema,
    porEstado,
    huerfanos,
    conflictos,
    /*
     * `conVeto` es cuántos DIAGNÓSTICOS tuvieron alguna señal descartada;
     * `porMotivo` cuenta SEÑALES, y un diagnóstico puede tener varias. Son dos
     * preguntas distintas —«¿a cuántos les faltó un dato?» y «¿qué está
     * fallando?»— y sumar una para responder la otra daría un número que no
     * significa nada.
     */
    vetosDeCalidad: { diagnosticosAfectados: conVeto, porMotivo: vetosPorMotivo },
    fuentesCaidas,
    duracionMs: {
      p50: percentil(duraciones, 0.5),
      p95: percentil(duraciones, 0.95),
      max: duraciones.at(-1) ?? null,
    },
    /*
     * Se declara SIEMPRE, aunque sea 0: que el campo exista y valga cero dice
     * «se miró y no hubo podas», y que falte diría «esta versión no lo sabe».
     * No es lo mismo.
     */
    podas,
  }
}
