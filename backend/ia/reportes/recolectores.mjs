/**
 * Los recolectores de los reportes por plantilla (Plan 44 F2): lo que una
 * plantilla necesita saber de una máquina, calculado en código y con la
 * misma forma para las ocho.
 *
 * ── PUROS, Y CON LAS FUENTES INYECTADAS ─────────────────────────────
 *
 * Nada de aquí abre red ni disco. `recolectar` recibe en `fuentes` las cuatro
 * cosas que sí lo hacen —leer la máquina, evaluar sus riesgos, leer una serie
 * del historiador, dibujar una gráfica— y las llama; lo demás es dar forma:
 * qué medidas son «las principales», cuánto cambió una respecto al período
 * anterior, cuál es el peor estado de un activo, qué banderas están activas.
 * Así se prueban con un cliente falso y la máquina espejo, y así ninguna
 * plantilla vuelve a calcular lo mismo a su manera (§2.6 de `CLAUDE.md`).
 *
 * ── LO QUE NO SE INVENTA ─────────────────────────────────────────────
 *
 * Una señal sin lectura sale `null`, nunca cero. Una serie sin muestras sale
 * con `nota`, no con un resumen vacío. Una variación sin período anterior
 * comparable es `null`. Y las «principales» son las que el TIPO declara
 * (`tipo.indicadores`, por rol); si no declara ninguna, las primeras medidas
 * en el orden con que el tipo compone el estado — nunca una lista escrita
 * aquí para una máquina concreta.
 *
 * Y la probabilidad de la matriz de riesgos se OBSERVA contando instantes
 * del historiador (Plan 44 F4, D15), nunca se estima: una regla que no se
 * pueda observar sale de la matriz con su motivo en vez de recibir un
 * número plausible.
 */
import { downsamplear } from '../herramientas/lib/formato.mjs'
import { calcularTendencia, describirTendencia, PUNTOS_GRAFICO_REPORTE } from '../conversacion/herramientas.mjs'
import { resumirSerie } from '../../../shared/eva/comun/historia.js'
import { observarFrecuencia, armarMatriz } from '../../../shared/eva/comun/matrizRiesgo.js'
import { eventosDeAlarma } from '../../../shared/eva/comun/eventosDeAlarma.js'
import { peor } from '../../../shared/eva/tanque/estado.js'

/** La familia de un rol `familia:clave`, o `null`. */
export const familiaDe = (rol) => (typeof rol === 'string' && rol.includes(':') ? rol.split(':')[0] : null)

/** Un número con sus decimales, o `null` si no hay número. */
export function formatear(valor, decimales = 3) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return null
  return Number(valor).toFixed(Math.max(0, Math.min(6, decimales ?? 3)))
}

/** Las claves de familia `medida` de un estado, en el orden en que el tipo las compuso. */
export function medidasDe(senales, metaDe) {
  return (senales ?? []).map((s) => s.clave).filter((clave) => familiaDe(metaDe(clave)?.rol) === 'medida')
}

/**
 * Las señales «principales» de un estado: hasta `tope`, una por rol.
 *
 * Por rol y no por señal porque una máquina con tres apoyos mide la velocidad
 * eficaz tres veces: el indicador es UNO —la mayor de las tres, con el apoyo
 * al lado— y no tres tarjetas iguales. Los roles los declara el tipo en
 * `indicadores`; sin ellos, las familias `medida` en su orden.
 *
 * @returns {{clave: string, rol: string, senal: object}[]}
 */
export function principalesDe({ senales, metaDe, tipo, tope = 4 }) {
  const lista = senales ?? []
  const rolDe = (s) => metaDe(s.clave)?.rol ?? null
  const rolesDeclarados = Array.isArray(tipo?.indicadores) ? tipo.indicadores : null
  const roles = rolesDeclarados
    ?? [...new Set(lista.map(rolDe).filter((r) => familiaDe(r) === 'medida'))]

  const elegidas = []
  for (const rol of roles) {
    if (elegidas.length >= tope) break
    const candidatas = lista.filter((s) => rolDe(s) === rol)
    if (!candidatas.length) continue
    const conValor = candidatas.filter((s) => Number.isFinite(Number(s.valor)) && s.valor !== null)
    /* La mayor, no la primera: en una medida por apoyo la que importa es la
       que más se acerca al límite. Sin ninguna con valor, la primera, y la
       tarjeta dirá «sin lectura». */
    const elegida = conValor.length
      ? conValor.reduce((a, b) => (Number(b.valor) > Number(a.valor) ? b : a))
      : candidatas[0]
    elegidas.push({ clave: elegida.clave, rol, senal: elegida })
  }
  return elegidas
}

/**
 * Cuánto cambió el promedio de una serie respecto al período anterior.
 * `null` si falta cualquiera de los dos promedios. El signo queda en cero
 * cuando la diferencia no llega a medio decimal: eso no es un cambio, es
 * redondeo.
 *
 * @returns {{signo: number, diferencia: number, texto: string}|null}
 */
export function variacionDe(actual, anterior, { decimales = 3, unidad = '' } = {}) {
  const a = actual?.promedio
  const b = anterior?.promedio
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const diferencia = a - b
  const umbral = 0.5 * 10 ** -(decimales ?? 3)
  const signo = Math.abs(diferencia) < umbral ? 0 : Math.sign(diferencia)
  const texto = `${signo > 0 ? '+' : ''}${formatear(diferencia, decimales)}${unidad ? ` ${unidad}` : ''}`
  return { signo, diferencia, texto }
}

/** Desvío porcentual de una lectura respecto a un promedio; `null` si no se puede. */
export function desvioPorciento(valor, promedio) {
  if (!Number.isFinite(Number(valor)) || valor === null || !Number.isFinite(promedio) || promedio === 0) return null
  return ((Number(valor) - promedio) / Math.abs(promedio)) * 100
}

/**
 * El peor estado de un conjunto de señales, contando SÓLO las que tienen
 * criterio de banda (`critico`, `atencion`, `nominal`). `null` si ninguna lo
 * tiene: «sin criterio» no es «en banda» (Plan 39 F4).
 */
export function peorEstadoDe(senales) {
  const conCriterio = (senales ?? []).map((s) => s.estado).filter((e) => e === 'critico' || e === 'atencion' || e === 'nominal')
  return conCriterio.length ? peor(conCriterio) : null
}

/** Recuento de un grupo de señales: cuántas leen y cuántas están en cada estado. */
export function recuentoDe(senales) {
  const lista = senales ?? []
  const con = (e) => lista.filter((s) => s.estado === e).length
  return {
    total: lista.length,
    conLectura: lista.filter((s) => s.valor !== null && s.valor !== undefined).length,
    sinLectura: lista.filter((s) => s.valor === null || s.valor === undefined).length,
    fuera: con('critico'),
    aviso: con('atencion'),
    enBanda: con('nominal'),
  }
}

/**
 * Las banderas booleanas activas ahora, leídas del dominio que reconstruye el
 * tipo por roles (`dominio.canales[apoyo][clave]` y `dominio.variador[clave]`).
 * Una bandera es activa si vale `true` o `1`; `null` es «sin lectura», no
 * «inactiva», y se cuenta aparte.
 *
 * @returns {{activas: {canal: string|null, rol: string, clave: string, label: string}[], sinLectura: number}}
 */
export function banderasActivas({ estado, tipo }) {
  const dominio = estado?.dominio
  const activas = []
  let sinLectura = 0
  /* Sin dominio no hay banderas que mirar: ni activas ni «sin lectura». Contar
     huecos de un dominio que no existe sería afirmar que se buscó. */
  if (!dominio) return { activas, sinLectura }
  const roles = tipo?.roles ?? {}
  const activa = (v) => v === true || v === 1
  for (const [rol, r] of Object.entries(roles)) {
    const booleana = r.tipo === 'booleano' || r.familia === 'bandera' && r.tipo !== 'real'
    if (!booleana) continue
    if (r.familia === 'bandera' && r.ambito === 'apoyo') {
      for (const [canal, d] of Object.entries(dominio?.canales ?? {})) {
        const v = d?.[r.clave]
        if (v === null || v === undefined) sinLectura += 1
        else if (activa(v)) activas.push({ canal, rol, clave: r.clave, label: r.label ?? r.clave })
      }
    } else if (r.familia === 'variador' && (r.clave === 'fallo' || r.clave === 'aviso')) {
      const v = dominio?.variador?.[r.clave]
      if (v === null || v === undefined) sinLectura += 1
      else if (activa(v)) activas.push({ canal: null, rol, clave: r.clave, label: r.label ?? r.clave })
    }
  }
  return { activas, sinLectura }
}

/**
 * Observa en el historiador con qué frecuencia estuvo activa cada riesgo.
 *
 * ── QUÉ SE MIDE, Y QUÉ SE DECLARA NO MEDIBLE ───────────────────────
 *
 * Es la mitad observada de la matriz P×I (D15 del Plan 44): el impacto lo
 * declara la regla, y la probabilidad SE CUENTA aquí, reevaluando la
 * condición de la regla sobre las muestras del período. Sólo se puede con
 * las reglas cuyo `necesita` se resuelve a roles con serie propia:
 *
 *   · una regla con `necesita: []` mira la configuración del módulo o sus
 *     vigilancias, no una señal: no hay nada que historizar;
 *   · una regla de apoyo se observa CON LAS SERIES DE SU APOYO —el riesgo
 *     salió de ese canal—, no con las del primero que aparezca;
 *   · si a cualquiera de sus señales le falta serie, la regla no entra en
 *     la matriz y se dice por qué.
 *
 * Devuelve un Map de id de riesgo a `{fraccion, cobertura}` o a `{motivo}`,
 * que es justo lo que `armarMatriz` espera. Las series se leen una sola vez
 * por clave aunque varias reglas las compartan.
 */
async function observarRiesgos({ riesgos, senales, tipo, ventana, fuentes, historizada, metaDe }) {
  const activos = riesgos?.activos ?? []
  if (!activos.length) return new Map()

  const rolDeClave = tipo?.rolDeClaveRequerida ?? {}
  /* El apoyo de una señal es su `grupo` en el estado común; el del riesgo,
     su `canal`. Una regla de apoyo se observa con las series de SU apoyo:
     medir el riesgo de S1 con la vRMS de S2 daría una frecuencia creíble de
     algo que no pasó ahí. Sin coincidencia no se cae a otro apoyo. */
  const senalesDe = (rol, canal) => {
    const delRol = (senales ?? []).filter((s) => metaDe(s.clave)?.rol === rol)
    const candidatas = canal ? delRol.filter((s) => s.grupo === canal) : delRol
    return candidatas.map((s) => s.clave)
  }

  /* Qué claves hacen falta en total, sin repetir: una serie se lee una vez. */
  const planes = new Map()
  for (const riesgo of activos) {
    const necesita = riesgo.necesita ?? []
    if (!necesita.length) {
      planes.set(riesgo.id, { motivo: null, claves: null })
      continue
    }
    const porNombre = new Map()
    let falta = null
    for (const nombre of necesita) {
      const rol = rolDeClave[nombre]
      const candidatas = rol ? senalesDe(rol, riesgo.canal).filter(historizada) : []
      if (!candidatas.length) { falta = nombre; break }
      porNombre.set(nombre, candidatas[0])
    }
    planes.set(riesgo.id, falta ? { falta } : { claves: porNombre })
  }

  const necesarias = new Set()
  for (const plan of planes.values()) {
    if (plan.claves) for (const clave of plan.claves.values()) necesarias.add(clave)
  }

  const leidas = new Map()
  await Promise.all([...necesarias].map(async (clave) => {
    const { muestras } = await fuentes.leerSerie(clave, ventana)
    leidas.set(clave, muestras ?? [])
  }))

  const frecuencias = new Map()
  for (const riesgo of activos) {
    const plan = planes.get(riesgo.id)
    if (!plan.claves) {
      frecuencias.set(riesgo.id, {
        motivo: plan.falta
          ? `sin serie historizada para «${plan.falta}» en este punto`
          : 'esta regla no mira ninguna señal historizable: depende de la configuración del módulo o de sus vigilancias',
      })
      continue
    }
    const series = new Map([...plan.claves].map(([nombre, clave]) => [nombre, leidas.get(clave) ?? []]))
    frecuencias.set(riesgo.id, observarFrecuencia(reglaDe(tipo, riesgo.id) ?? riesgo, series))
  }
  return frecuencias
}

/** La regla que produjo un riesgo, que es quien sabe evaluar su condición. */
const reglaDe = (tipo, id) => (tipo?.reglas ?? []).find((r) => r.id === id) ?? null

/**
 * La severidad de una señal de alarma, derivada de su ROL en el tipo.
 *
 * El servidor no publica severidad: publica un booleano por señal. La
 * jerarquía es nuestra y vive sólo aquí (§1 del Plan 44, fila de `alarmas`),
 * para que el pie del PDF pueda declararla y nadie la reescriba distinta en
 * otra plantilla. Un rol que no esté en esta tabla sale `media`: es la
 * lectura conservadora, y no callar la señal es lo que importa.
 */
export function severidadDeRol(rol) {
  if (rol === 'bandera:alarma' || rol === 'variador:fallo') return 'critica'
  if (rol === 'bandera:aviso' || rol === 'variador:aviso') return 'alta'
  return 'media'
}

/**
 * Los flancos de las señales de alarma en el período, y su distribución.
 *
 * ── POR QUÉ PUEDE SALIR VACÍO Y ESO ESTAR BIEN ─────────────────────
 *
 * Una señal de alarma que nunca se activó no produce ningún evento. Eso no
 * es un hueco de dato: es la medida. La plantilla lo dice con esas palabras
 * («ninguna cambió de estado en el período»), distinto de cuando ninguna
 * señal tiene serie verificada, que sí es una limitación del historiador y
 * se dice aparte (D3).
 *
 * Sólo se leen las señales de alarma CON SERIE: reconstruir flancos de una
 * lectura en vivo no se puede, y suponer que estuvo apagada entre dos
 * lecturas sería inventar los tramos que no se vieron.
 */
async function recolectarEventos({ senales, ventana, fuentes, historizada, metaDe }) {
  const deAlarma = (senales ?? []).filter((s) => {
    const rol = metaDe(s.clave)?.rol
    const familia = familiaDe(rol)
    return familia === 'bandera' || (familia === 'variador' && /fallo|aviso/.test(rol ?? ''))
  })

  const conSerie = deAlarma.filter((s) => historizada(s.clave))
  if (!conSerie.length) return { eventos: [], conSerie: 0, sinSerie: deAlarma.length }

  const eventos = []
  await Promise.all(conSerie.map(async (s) => {
    const { muestras } = await fuentes.leerSerie(s.clave, ventana)
    if (!muestras?.length) return
    /* Ya vienen normalizadas (`{t, valor}`, sin mala calidad): quien lee el
       historiador las pasa por `normalizar` una vez. Hacerlo aquí otra vez
       las descartaba TODAS —esa función espera la forma cruda del servidor,
       `{timestamp, value, quality}`— y la sección salía «sin eventos» como
       si fuera una medida. */
    for (const e of eventosDeAlarma(muestras)) {
      eventos.push({ ...e, clave: s.clave, label: metaDe(s.clave)?.label ?? s.clave, grupo: s.grupo ?? null, severidad: severidadDeRol(metaDe(s.clave)?.rol) })
    }
  }))

  eventos.sort((a, b) => b.inicio - a.inicio)
  return { eventos, conSerie: conSerie.length, sinSerie: deAlarma.length - conSerie.length }
}

/**
 * Reparte los eventos en tramos iguales del período.
 *
 * El número de tramos sale de la duración —un día en horas, una semana en
 * días— porque un histograma de 168 barras no se lee y uno de 2 no dice
 * nada. Cuenta ENTRADAS (flancos 0→1), no tiempo activo: la pregunta de la
 * sección es «cuántas veces pasó», y el tiempo activo ya lo da la duración
 * de cada evento en la tabla anterior.
 */
export function distribuirEventos(eventos, ventana) {
  const total = ventana.fin - ventana.inicio
  if (!total || !eventos?.length) return []
  const horas = total / 3_600_000
  const tramos = horas <= 2 ? 4 : horas <= 48 ? Math.ceil(horas / 2) : Math.min(14, Math.ceil(horas / 24))
  const ancho = total / tramos

  return Array.from({ length: tramos }, (_, i) => {
    const desde = new Date(ventana.inicio.getTime() + i * ancho)
    const hasta = new Date(ventana.inicio.getTime() + (i + 1) * ancho)
    /* `desdeAntes` no cuenta: su flanco de entrada no ocurrió en el período. */
    const n = eventos.filter((e) => !e.desdeAntes && e.inicio >= desde && e.inicio < hasta).length
    return { desde, hasta, ocurrencias: n }
  })
}

/**
 * Lee UNA serie y la deja lista para la plantilla: resumen, tendencia,
 * cobertura, el SVG y la interpretación en código. Sin muestras, una `nota`
 * y nada más — nunca un resumen vacío.
 */
async function serieLista({ clave, meta, ventana, banda, fuentes, etq, idioma }) {
  const { muestras, diasLeidos, diasTotal } = await fuentes.leerSerie(clave, ventana)
  const base = { clave, titulo: meta.label, unidad: meta.unidad || null, meta }
  if (!muestras?.length) {
    return { ...base, muestras: [], svg: null, resumen: null, tendencia: null, cobertura: null, interpretacion: null, nota: etq.plantillas.comun.sinMuestras(meta.label, ventana.etiqueta) }
  }
  let svg = null
  let nota = null
  try {
    svg = fuentes.graficar(downsamplear(muestras, PUNTOS_GRAFICO_REPORTE), { titulo: meta.label, unidad: meta.unidad || null, banda })
  } catch (error) {
    nota = etq.plantillas.comun.noSeDibujo(meta.label, error.message)
  }
  const tendencia = calcularTendencia(muestras)
  return {
    ...base,
    muestras,
    svg,
    resumen: resumirSerie(muestras, meta.decimales),
    tendencia,
    cobertura: diasTotal ? { diasLeidos, diasTotal, completa: diasLeidos >= diasTotal } : null,
    interpretacion: describirTendencia(tendencia, meta.unidad, idioma),
    nota,
  }
}

/**
 * Todo lo que una plantilla necesita de una máquina, en un solo objeto.
 *
 * @param {object} args
 * @param {object} args.entrada   la entrada del registro (`SISTEMA[id]`)
 * @param {object} args.tipo      su tipo (`tipoDe(entrada.tipo)`)
 * @param {object} args.plantilla el módulo de la plantilla: decide qué claves se leen (`claves(ctx)`)
 * @param {{inicio: Date, fin: Date, etiqueta: string}} args.ventana
 * @param {object} args.etq
 * @param {'es'|'en'} args.idioma
 * @param {{leerMaquina: Function, evaluarRiesgos: Function, leerSerie: Function, graficar: Function}} args.fuentes
 * @param {number} [args.tope]    cuántas series como mucho (D14)
 */
export async function recolectar({ entrada, tipo, plantilla, ventana, etq, idioma, fuentes, tope = 8 }) {
  const lectura = await fuentes.leerMaquina(entrada)
  if (!lectura?.ok) return { ok: false, error: lectura?.error ?? 'sin lectura' }

  const estado = lectura.estado
  const senales = estado.senales ?? []
  const metaDe = (clave) => entrada.metaDe(clave)
  const historizada = (clave) => Boolean(entrada.esHistorizada?.(clave))
  const bandaDe = (clave) => tipo?.bandaDe?.(metaDe(clave)?.rol) ?? null

  const riesgos = estado.dominio ? fuentes.evaluarRiesgos(entrada, estado) : null
  const medidas = medidasDe(senales, metaDe)
  const principales = principalesDe({ senales, metaDe, tipo })

  const ctx = { entrada, tipo, estado, senales, medidas, principales, historizada, metaDe }
  const pedidas = [...new Set(plantilla.claves(ctx))].filter(historizada).slice(0, tope)

  const series = new Map()
  await Promise.all(pedidas.map(async (clave) => {
    series.set(clave, await serieLista({ clave, meta: metaDe(clave), ventana, banda: bandaDe(clave), fuentes, etq, idioma }))
  }))

  /* El período ANTERIOR, de la misma duración y pegado al actual, sólo para
     las principales con serie: es lo que da el ▲▼ de cada indicador. */
  const duracion = ventana.fin - ventana.inicio
  const anterior = { inicio: new Date(ventana.inicio.getTime() - duracion), fin: ventana.inicio, etiqueta: ventana.etiqueta }
  const anteriores = new Map()
  await Promise.all(principales.filter((p) => historizada(p.clave)).map(async (p) => {
    const { muestras } = await fuentes.leerSerie(p.clave, anterior)
    anteriores.set(p.clave, muestras?.length ? resumirSerie(muestras, metaDe(p.clave)?.decimales) : null)
  }))

  /* La matriz P×I sólo la pide `riesgos`, y observar cada regla cuesta una
     serie más por señal que necesita. Se calcula bajo petición de la
     plantilla (`plantilla.observaRiesgos`) y no «por si acaso» (D14). */
  let matriz = null
  if (plantilla.observaRiesgos && riesgos?.activos?.length) {
    const frecuencias = await observarRiesgos({ riesgos, senales, tipo, ventana, fuentes, historizada, metaDe })
    matriz = armarMatriz(riesgos.activos, frecuencias)
  }

  /* Lo mismo con los flancos: sólo los pide `alarmas`, y son una serie por
     cada señal de alarma con historia. */
  const eventos = plantilla.observaEventos
    ? await recolectarEventos({ senales, ventana, fuentes, historizada, metaDe })
    : null

  return {
    ok: true,
    lectura,
    estado,
    senales,
    grupos: estado.grupos ?? [],
    riesgos,
    matriz,
    eventos,
    medidas,
    principales,
    series,
    anteriores,
    banderas: banderasActivas({ estado, tipo }),
    historizada,
    metaDe,
    bandaDe,
  }
}
