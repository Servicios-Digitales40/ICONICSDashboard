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
 */
import { downsamplear } from '../herramientas/lib/formato.mjs'
import { calcularTendencia, describirTendencia, PUNTOS_GRAFICO_REPORTE } from '../conversacion/herramientas.mjs'
import { resumirSerie } from '../../../shared/eva/comun/historia.js'
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

  return {
    ok: true,
    lectura,
    estado,
    senales,
    grupos: estado.grupos ?? [],
    riesgos,
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
