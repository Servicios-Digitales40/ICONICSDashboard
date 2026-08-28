/**
 * Las herramientas que el modelo de lenguaje puede invocar, sobre el **sistema
 * de agua industrial** de `ac:TDCON/DEMO/SENSORES/`.
 *
 * ── QUÉ CAMBIÓ, Y POR QUÉ NO FUE UN RENOMBRADO ─────────────────────
 *
 * Este archivo consultaba OEE, disponibilidad, rendimiento, calidad y
 * contadores de pieza de las diez máquinas de Resonac. Nada de eso existe en
 * el árbol de la demo: bajo esa raíz hay **ocho magnitudes planas de una sola
 * instalación**, sin tag `Estado`, sin alarmas configuradas y sin producción
 * (Plan 8 §1.1 y §1.4). No es el mismo dominio con otros nombres — es otra
 * forma de datos, y por eso las herramientas son otras y no las de antes con
 * las etiquetas cambiadas.
 *
 * Lo que **no** cambió es el criterio, que es lo que hacía útiles a las
 * anteriores:
 *
 * ── SON DE DOMINIO Y NO LA API REST EN CRUDO ───────────────────────
 *
 * La alternativa era dejar que el modelo construyera la llamada al
 * historiador. Aquí hay cuatro reglas no obvias que hay que acertar a la vez
 * —el punto histórico se nombra con `ac:` y no con `hda:`, el agregado es
 * `Average` y no `Interpolative`, hay tope de 100 muestras por petición, y
 * **tres de las ocho señales devuelven la serie de otra**— y un modelo de 4B
 * las inventa con aplomo. Están medidas en `docs/PLAN-8-DEMO-EVA.md` y
 * resueltas en `shared/eva/historia.js`.
 *
 * Aquí el modelo elige QUÉ preguntar; el CÓMO lo sabe este archivo.
 *
 * ── LA GUARDA QUE JUSTIFICA TODO EL ARCHIVO ────────────────────────
 *
 * A `CARGA_TRABAJO_MOTOR`, `KPIEFICIENCIA_ENERGETICA` e
 * `INDICE_DESVIACION_VOLTAJE` el Data Historian les devuelve la curva de
 * `STEMPERATURA_TANQUE`. **No da error**: responde `ok: true`, con marcas de
 * tiempo correctas y valores plausibles. Un asistente que pidiera la serie sin
 * comprobarlo no fallaría, contestaría — y diría que la carga del motor llegó
 * al 41 % cuando eso son grados centígrados de un tanque.
 *
 * Por eso `historia_de_senal` rechaza por catálogo **antes de salir a la red**,
 * y por eso la marca vive en `shared/eva/senales.js` y no en cada consulta.
 *
 * ── EL ESTADO ES NUESTRO, Y SE DICE ────────────────────────────────
 *
 * El servidor no publica estado para este árbol. Los cinco estados salen de
 * comparar cada señal contra los umbrales de `shared/eva/umbrales.js`, que son
 * **nuestros y siguen sin confirmar**. Las respuestas lo llevan escrito
 * (`avisoUmbrales`) mientras `PROVISIONALES` esté en `true`, igual que la vista
 * de Planta pinta su aviso. Un asistente que afirmara «está fuera de límite»
 * sin decir de quién es el límite estaría prestando al servidor una autoridad
 * que no nos ha dado.
 *
 * ── LA ÚNICA ESCRITURA, Y CON GUARDA PROPIA ─────────────────────────
 *
 * `controlar_bomba` es la única función del catálogo que llama a
 * `client.writePoint`. Dos puertas la protegen, en este orden:
 *
 *  1. `ICONICS_READ_ONLY` (server-side, la misma que usa `/api/iconics/write`):
 *     con el puente en solo lectura la herramienta ni intenta escribir.
 *  2. El nivel del tanque: encender la bomba con el tanque ya por encima del
 *     aviso superior de `UMBRALES.nivelTanque` se rechaza aquí, ANTES de
 *     escribir, para que una instrucción del chat no pueda desbordarlo.
 *
 * Hay una tercera comprobación DESPUÉS de escribir: un `writePoint` que
 * responde `ok: true` no demuestra que el punto haya cambiado. Se comprobó
 * contra el tag real de esta demo primero configurado como «Static value»
 * —aceptaba la escritura y seguía leyendo `true` siempre— y luego como fuente
 * en tiempo real con escaneo cada ~1 s, donde una relectura inmediata puede
 * traer el valor de antes del ciclo. `controlar_bomba` relee el mismo punto
 * tras escribir, con un par de reintentos cortos para dar tiempo al escaneo,
 * y sólo confirma el encendido o apagado si la relectura coincide; si no, lo
 * dice como lo que es, una escritura sin efecto confirmado, y no como una
 * orden cumplida.
 *
 * El resto del catálogo sigue siendo de solo lectura: ninguna otra función
 * llama a `writePoint`, así que ninguna instrucción astuta metida en el chat
 * puede alcanzar una escritura que no sea ésta.
 */
import {
  alinearSeries,
  correlacionPearson,
  describirCorrelacion,
  estadisticasBasicas,
  regresionLineal,
  proyectar,
  detectarAnomalias,
} from '../../shared/eva/estadistica.js'
import { renderizarGraficoSerie } from '../../shared/eva/graficos.js'
import {
  RAIZ,
  SENALES,
  SENAL_KEYS,
  esHistorizada,
  historizadas,
  pointName,
  senalInfo,
} from '../../shared/eva/senales.js'
import { ACTIVOS } from '../../shared/eva/activos.js'
import { PROVISIONALES, UMBRALES } from '../../shared/eva/umbrales.js'
import { toBooleano } from '../../shared/eva/sistema.js'
import {
  AGREGADO,
  MAX_PUNTOS,
  SIN_SERIE,
  VENTANA,
  intervaloHMS,
  normalizar,
  horaLocal as horaLocalDe,
  resumirSerie,
} from '../../shared/eva/historia.js'
import { planificar } from '../../shared/eva/rango.js'
import { evaluarRiesgos } from '../../shared/eva/riesgos.js'
import { evaluarPronostico } from '../../shared/eva/pronostico.js'
import { evaluarRiesgosVibracion } from '../../shared/eva/riesgosVibracion.js'
import {
  NO_COMPARTEN,
  SISTEMA,
  SISTEMAS,
  historizadasDe,
  resumenDeSistemas,
  sistemasDeSenal,
  tieneHistoria,
} from '../../shared/eva/sistemas.js'
import {
  VACIO as APRENDIZAJE_VACIO,
  crearHecho,
  crearPropuesta,
  hechosVigentes,
  normalizarAlmacen,
  pendientes,
  validarPropuesta,
} from '../../shared/eva/aprendizaje.js'
import { isGoodQuality } from '../../shared/quality.js'
import { conConcurrenciaAcotada } from '../../shared/concurrencia.js'
import { TIPOS, isoLocal, resolverInstante, resolverPeriodo } from '../../shared/periodo.js'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Ventana máxima que se puede pedir de una vez, en horas. Noventa días
 * (Plan 15 Fase 4).
 *
 * ── POR QUÉ 90 DÍAS, Y POR QUÉ YA NO ES "EL TOPE DE 100 MUESTRAS" ──
 *
 * Hasta el Plan 15 esto eran 7 días, justificados por `MAX_PUNTOS` (100):
 * una ventana más larga en una sola petición SIN trocear diluía la
 * resolución hasta que el «máximo» dejaba de ser el pico real. Esa
 * justificación ya no aplica igual — `leerSerie`/`leerSerieEnRango`
 * TROCEAN el rango con `planificar()` (Fase 2, densidad fija por tramo) y
 * cada tramo sigue la paginación real del servidor (Fase 1), así que la
 * resolución no se degrada al alargar la ventana, sólo crece el número de
 * tramos — acotado por la concurrencia de la Fase 3.
 *
 * El tope que queda es de EXPERIENCIA, no de protocolo: medido contra el
 * servidor real, un perfil de 90 días tarda bastante menos de un segundo
 * (`historyConcurrencia` en paralelo), así que 90 días es holgado para
 * cualquier pregunta de diagnóstico razonable sin dejar una ventana
 * ilimitada que pudiera convertirse en cientos de tramos por una frase mal
 * interpretada del modelo.
 */
const MAX_HORAS_VENTANA = 24 * 90

/**
 * Días máximos que puede abarcar un perfil. Noventa (Plan 15 Fase 4), el
 * mismo techo que `MAX_HORAS_VENTANA` — ver esa constante para el porqué del
 * cambio. Con la Fase 3 (concurrencia acotada) esto sigue siendo del orden
 * de un segundo, no de "la paciencia de quien preguntó".
 */
const MAX_DIAS_PERFIL = 90

/**
 * Muestras mínimas para atreverse a decir qué es normal.
 *
 * Aquí «muestras» son las que devuelve `leerSerie` —`Average` sobre una
 * rejilla de 15 min—, NO las que guarda el historiador. Con un punto cada
 * cuarto de hora, 30 son unas siete horas y media de operación; por debajo de
 * eso un percentil no distingue lo habitual de lo que pasó el martes.
 *
 * ── LO QUE EL HISTORIADOR GUARDA DE VERDAD ─────────────────────────
 *
 * Medido por paginación sobre el 21-08-2026 (nivel del tanque): **26.754
 * muestras en el día**, repartidas de forma muy desigual —y esa desigualdad
 * es lo que importa, no la media:
 *
 *   · en operación (allí 07:00-16:00): ~3.200 por hora, cerca de 1 Hz
 *   · en reposo (allí 00:00-07:00):    exactamente 12 por hora, una cada 5 min
 *
 * De ahí venía el «unas doce muestras al día» que decía este comentario: el
 * 12 era real y medido, pero es 12 por HORA en reposo. Y por eso la media
 * diaria no describe ningún momento real de la instalación: no hay instante
 * en que se muestree a esa velocidad.
 *
 * La consecuencia práctica está en `leerSerie`: contra ~1 Hz, `MAX_PUNTOS`
 * (100) se agota en menos de dos minutos de datos crudos. Cualquier lectura
 * sin agregar que abarque más se trunca, y por eso el aviso de `hasMore` no
 * es un adorno — ver `AVISO_TRUNCADA`.
 */
const MIN_MUESTRAS_PERFIL = 30

/**
 * Ventana máxima de un reporte, en días (Plan 14 Fase 5; subido a 90 en el
 * Plan 15 Fase 4 para quedar consistente con `MAX_HORAS_VENTANA` y
 * `MAX_DIAS_PERFIL` — las tres preguntas del asistente que tocan un rango
 * largo comparten ya el mismo techo de un trimestre, en vez de tres números
 * distintos sin relación entre sí).
 */
const MAX_DIAS_REPORTE = 90

/**
 * Puntos con los que se dibuja un gráfico de reporte, como mucho.
 *
 * Mismo orden de magnitud que `MAX_PUNTOS` (el tope del historiador por
 * petición) porque es exactamente para lo que se diseñó el ancho del SVG de
 * `renderizarGraficoSerie`. Un reporte de varios días junta muchas de esas
 * peticiones y hay que volver a bajar a esta escala antes de dibujar — ver
 * `downsamplear`.
 */
const PUNTOS_GRAFICO_REPORTE = 120

/**
 * Ventana relativa por defecto cuando no se dice período: las mismas 6 h que
 * pintan las gráficas de la vista de Planta (`VENTANA`), para que el chat y la
 * pantalla no cuenten dos historias distintas del mismo momento.
 */
const VENTANA_POR_DEFECTO = VENTANA.horas

/**
 * Los períodos que SÍ se entienden, para ofrecerlos al negar uno.
 *
 * Se escriben aquí, literales, porque un error que sólo dice «pide un tramo
 * más corto» deja al modelo improvisando la alternativa — y medido con el 4B,
 * improvisó «la última semana», que en ese momento tampoco se entendía. Un
 * asistente que sugiere una frase que luego rechaza manda al operador a un
 * callejón sin salida por el que ya ha esperado.
 */
const ALTERNATIVAS =
  'Pide un tramo más corto: "últimas 6 horas", "últimos 3 días", "la última semana", ' +
  '"ayer" o un día concreto.'

/**
 * Lo que hay que decir cuando el servidor recortó la serie.
 *
 * Va redactado como instrucción al modelo y no como dato suelto porque un
 * `truncada: true` en el JSON no se traduce solo: el resumen que lo acompaña
 * tiene pinta de completo —promedio, mínimo y máximo, todos reales— y sin esta
 * frase el modelo lo citaría como el del período entero. El extremo que falta
 * es justo el que haría cambiar de opinión a quien pregunta.
 */
const AVISO_TRUNCADA =
  'ATENCIÓN: el servidor recortó esta serie por su tope de muestras y sólo se leyó el ' +
  'PRINCIPIO del período pedido. El mínimo, el máximo y el promedio son de ese trozo, no ' +
  'del período completo: dilo así y no presentes estas cifras como las del período entero. ' +
  'Para una respuesta completa, pide un tramo más corto.'

/** Error uniforme que además enseña al modelo cómo corregirse en la misma pasada. */
/**
 * La primera frase de un texto largo.
 *
 * ── POR QUÉ SE RECORTA LO QUE SE LE MANDA AL MODELO ────────────────
 *
 * Porque el contexto es un recurso y se estaba gastando en prosa que el modelo
 * no usa. Los textos de `riesgos.js` están escritos para una PANTALLA —donde
 * alguien los lee enteros y agradece el detalle—, y medido, `estado_de_
 * vibraciones` devolvía 9.888 caracteres de los cuales 6.856 eran esos
 * párrafos. Con las instrucciones y el catálogo, el modelo empezaba a
 * contestar con 13.000 de sus 16.000 tokens ya gastados, y el 9B ni arrancaba.
 *
 * El modelo redacta su respuesta de nuevo de todas formas: lo que necesita es
 * la afirmación, no el párrafo. Y esos párrafos están escritos con la
 * afirmación DELANTE, así que la primera frase es justo lo que hay que
 * conservar.
 *
 * La pantalla sigue recibiendo el texto entero: esto sólo recorta el camino
 * hacia el modelo.
 */
function primeraFrase(texto, tope = 180) {
  const t = String(texto ?? '').trim()
  if (t.length <= tope) return t
  const corte = t.slice(0, tope)
  const punto = corte.lastIndexOf('. ')
  return punto > 60 ? corte.slice(0, punto + 1) : `${corte.trimEnd()}…`
}

/**
 * Riesgos agrupados por regla, con los apoyos afectados juntos.
 *
 * La EVIDENCIA de cada apoyo se conserva entera y por separado: es el hecho
 * medido, y es lo único que distingue un apoyo de otro cuando la regla es la
 * misma. Lo que se dice una sola vez es la hipótesis y la acción, que son
 * idénticas por definición —vienen de la misma regla—.
 */
function agruparPorRegla(activos) {
  const porId = new Map()
  for (const x of activos) {
    const previo = porId.get(x.id)
    if (previo) {
      previo.apoyos.push(x.canalLabel ?? 'toda la máquina')
      previo.evidencia_medida.push(x.evidencia)
      continue
    }
    porId.set(x.id, {
      titulo: x.titulo,
      severidad: x.nivel ?? x.severidad,
      apoyos: [x.canalLabel ?? 'toda la máquina'],
      evidencia_medida: [x.evidencia],
      hipotesis: primeraFrase(x.consecuencia),
      que_revisar: primeraFrase(x.accion),
      nota: x.nota ?? undefined,
    })
  }
  return [...porId.values()].map((g) => ({
    ...g,
    apoyos: g.apoyos.join(', '),
    /* Con una sola evidencia se manda la frase, no un arreglo de una: un
       arreglo invita a que el modelo lo describa como si fueran varias. */
    evidencia_medida: g.evidencia_medida.length === 1 ? g.evidencia_medida[0] : g.evidencia_medida,
  }))
}

function fallo(error, extra = {}) {
  return { ok: false, error, ...extra }
}

/**
 * Tendencia de una serie, en palabras que el modelo pueda citar sin restar.
 *
 * Antes vivía sólo dentro de `analisis_de_senal`; ahora también la usan
 * `grafico_de_senal` y `generar_reporte` (Plan 14 §5, feedback de que el
 * modelo se limitaba a repetir mínimo/máximo/promedio en vez de interpretar
 * la curva). Un mismo cálculo, no tres copias del mismo criterio de
 * clasificación —qué pendiente cuenta como "estable"— que podrían divergir.
 */
function calcularTendencia(puntos) {
  const regresion = regresionLineal(puntos)
  if (!regresion) return { direccion: 'sin datos suficientes para calcularla' }

  const cambioPorHora = +(regresion.pendiente * 3600).toFixed(3)
  return {
    direccion:
      Math.abs(cambioPorHora) < 0.01 ? 'estable' : cambioPorHora > 0 ? 'subiendo' : 'bajando',
    cambioPorHora,
    ajuste: `${Math.round(regresion.r2 * 100)} de 100`,
    nota:
      regresion.r2 < 0.4
        ? 'El ajuste es bajo: hay mucho ruido y la tendencia no es muy fiable.'
        : 'El ajuste es razonable para esta ventana.',
  }
}

/**
 * `calcularTendencia()` en una frase, para sitios sin modelo delante que la
 * narre — el PDF de `generar_reporte` es el caso: el documento ya está
 * cerrado y guardado antes de que el modelo escriba nada, así que si la
 * interpretación depende de que el modelo la redacte, el PDF sale sin ella
 * salvo que se acuerde de pedirlo. Mismo criterio que `describirCorrelacion`:
 * la frase la escribe el backend siempre igual, para no dejar la explicación
 * del reporte a que un 9B se acuerde de darla.
 */
function describirTendencia(tendencia, unidad = '') {
  if (!tendencia || tendencia.cambioPorHora === undefined) {
    return 'No hay muestras suficientes en este período para calcular una tendencia.'
  }

  if (tendencia.direccion === 'estable') {
    return 'Se mantuvo prácticamente estable en el período, sin una tendencia clara de subida o bajada.'
  }

  const u = unidad ? ` ${unidad}` : ''
  const verbo = tendencia.direccion === 'subiendo' ? 'Subió' : 'Bajó'
  const pocoFiable = tendencia.nota?.startsWith('El ajuste es bajo')

  return (
    `${verbo} a un ritmo medio de ${Math.abs(tendencia.cambioPorHora)}${u} por hora` +
    (pocoFiable
      ? ', aunque con bastante variación dentro del período: la tendencia no es muy fiable.'
      : ' de forma razonablemente sostenida.')
  )
}

/* ── Resolver el nombre de una señal ─────────────────────────────────── */

/** Quita acentos y unifica separadores para poder comparar nombres escritos a mano. */
function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    // Escrito con escapes y no con acentos literales: son caracteres
    // combinantes, invisibles al abrir el archivo, y un editor que los
    // recomponga al guardar rompería la expresión sin dejar rastro. Mismo
    // motivo y misma forma que en `shared/periodo.js`.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Sinónimos con los que un operador nombra cada señal.
 *
 * ── POR QUÉ ESTO NO ES TRABAJO DEL MODELO ──────────────────────────
 *
 * Es la misma regla que regía con las máquinas de Resonac: **resolver es
 * trabajo del backend; elegir es trabajo del modelo.** Un 4B al que se le pide
 * que traduzca «la bomba» a una clave de dominio se inventa `bomba` o
 * `caudalBomba`, y el error llega como «señal desconocida» después de treinta
 * segundos de espera.
 *
 * La lista es corta a propósito. No pretende cubrir toda forma de hablar: los
 * rótulos del catálogo ya entran solos (ver `construirIndice`), y esto sólo
 * añade las palabras que la pantalla NO enseña pero la gente sí dice —«bomba»
 * por el grupo de bombeo, «voltaje» por la tensión, «litros» por el caudal—.
 *
 * Ojo con `tensionLinea`: el tag se llama «índice de desviación de voltaje» y
 * entrega ~122 V, así que se aceptan los dos nombres. Quien pregunte por «el
 * índice de desviación» está preguntando por esta señal aunque el rótulo de la
 * pantalla diga otra cosa, y mandarle un «no existe» sería mentirle.
 */
const SINONIMOS = {
  nivelTanque: ['nivel', 'nivel del tanque', 'tanque', 'llenado', 'agua', 'cuanta agua'],
  temperaturaTanque: ['temperatura', 'temperatura del agua', 'temp', 'grados', 'calor'],
  cargaMotor: ['carga', 'carga del motor', 'motor', 'bomba', 'bombeo', 'esfuerzo del motor'],
  modoVdf: ['modo', 'vdf', 'variador', 'modo del variador', 'automatico', 'manual', 'modo am'],
  flujoInstantaneo: ['caudal', 'flujo', 'caudal instantaneo', 'litros', 'cuanta agua sale'],
  presionRelativa: ['presion', 'presion relativa', 'bares', 'presion de red'],
  tensionLinea: ['tension', 'voltaje', 'tension de linea', 'volts', 'voltios', 'red electrica',
    'indice de desviacion', 'indice de desviacion de voltaje', 'desviacion de voltaje'],
  eficienciaEnergetica: ['eficiencia', 'eficiencia energetica', 'kpi', 'rendimiento energetico',
    'consumo'],
}

/**
 * Índice de nombres → clave de señal.
 *
 * Entran solas las cuatro formas que ya existen en el catálogo —la clave, el
 * tag, el rótulo largo y el corto—, de modo que **renombrar una señal actualiza
 * el índice sin tocar este archivo**. Los sinónimos se añaden encima.
 */
function construirIndice() {
  const indice = new Map()
  const registrar = (clave, key) => {
    const k = normalizarTexto(clave)
    if (k && !indice.has(k)) indice.set(k, key)
  }

  for (const key of SENAL_KEYS) {
    const s = SENALES[key]
    registrar(key, key)          // nivelTanque
    registrar(s.tag, key)        // SNIVEL_TANQUE
    registrar(s.label, key)      // Nivel del tanque
    registrar(s.corto, key)      // Nivel
    for (const alias of SINONIMOS[key] ?? []) registrar(alias, key)
  }
  return indice
}

const INDICE_SENALES = construirIndice()

/** Nombre escrito por una persona → clave de señal, o `null`. */
export function resolverSenal(texto) {
  const k = normalizarTexto(texto)
  if (!k) return null

  const exacto = INDICE_SENALES.get(k)
  if (exacto) return exacto

  /*
   * Respaldo por CONTENCIÓN, y sólo si una entrada gana sin empate.
   *
   * Cubre lo que el modelo escribe de más —«el nivel del tanque ahora mismo»,
   * «temperatura del tanque en °C»— sin abrir la puerta a la adivinanza: si
   * la frase contiene dos nombres de señal distintos no se elige ninguno, se
   * pregunta. Elegir el primero en un «compara el nivel y la presión» daría
   * una respuesta correcta sobre la señal equivocada, que es peor que un error.
   */
  const candidatas = new Set()
  for (const [nombre, key] of INDICE_SENALES) {
    // Se exigen 4 caracteres para no disparar con fragmentos como «kpi» o «vdf»
    // metidos dentro de otra palabra.
    if (nombre.length >= 4 && k.includes(nombre)) candidatas.add(key)
  }

  return candidatas.size === 1 ? [...candidatas][0] : null
}

/**
 * Todas las señales que se nombran dentro de una frase libre, no sólo una.
 *
 * Es el mismo respaldo por contención de `resolverSenal` —sin acentos, sin
 * signos, con el umbral de 4 caracteres para no disparar con «vdf» o «kpi»
 * sueltos dentro de otra palabra— pero sin la regla del empate: un síntoma
 * como «caudal abundante por sobretensión progresiva» nombra DOS señales a
 * propósito, y `diagnostico` necesita las dos, no ninguna.
 */
function senalesMencionadas(texto) {
  const t = normalizarTexto(texto)
  const claves = new Set()
  for (const [nombre, key] of INDICE_SENALES) {
    if (nombre.length >= 4 && t.includes(nombre)) claves.add(key)
  }
  return [...claves]
}

/** Catálogo breve que viaja DENTRO del error, para que el reintento no gaste otra ronda. */
function catalogoBreve() {
  return SENAL_KEYS.map(k => ({
    senal: SENALES[k].label,
    clave: k,
    historia: SENALES[k].historizado,
  }))
}

/** El error de señal no reconocida, siempre con la lista de las que sí existen. */
/**
 * El fallo de «esa señal no es de aquí» — y la puerta por la que pasan las
 * OCHO herramientas que reciben un nombre de señal.
 *
 * ── POR QUÉ MIRA ANTES EN LAS DEMÁS MÁQUINAS ───────────────────────
 *
 * Porque el mensaje de antes era falso desde que hay dos instalaciones:
 * «sólo existen las ocho de la lista» es cierto del tanque y mentira de la
 * planta. Preguntado por la velocidad eficaz de un apoyo, el asistente
 * contestaba que esa señal no existe — y existe, sólo que en la otra máquina.
 *
 * Ahora se busca en el registro entero y se contesta lo que de verdad pasa,
 * que son tres casos distintos y sólo uno es un error:
 *
 *   · es de otra máquina Y esa máquina tiene historia → se dice cuál es, para
 *     que el modelo repita la llamada con el sistema correcto
 *   · es de otra máquina y esa máquina NO tiene historia → se dice, con la
 *     nota de por qué. Es el punto 3 del alta: una máquina sin serie propia se
 *     niega a contestar tendencias en vez de inventarlas
 *   · no es de ninguna → el error de siempre, ahora sí verdadero
 *
 * Es una sola función y arregla las ocho herramientas a la vez, que es la
 * ventaja de que todas resuelvan el nombre por el mismo sitio.
 */
function senalDesconocida(texto, { paraHistoria = false } = {}) {
  const enOtras = sistemasDeSenal(texto)

  if (enOtras.length === 1) {
    const { sistema, clave } = enOtras[0]
    const s = SISTEMA[sistema]

    if (paraHistoria && !tieneHistoria(sistema)) {
      return fallo(
        `«${texto}» es del sistema «${s.nombre}» (${s.plc}), que NO tiene histórico utilizable. ` +
          `${s.series.nota} Puedes dar su valor de AHORA con estado_del_sistema(sistema="${sistema}"), ` +
          'pero no afirmes ninguna tendencia ni pongas plazo a una avería.',
        { sistema, clave, con_historia: false }
      )
    }

    return fallo(
      `«${texto}» no es del sistema del tanque: es del sistema «${s.nombre}» (${s.plc}), que es ` +
        'OTRA MÁQUINA. Vuelve a llamar indicando ese sistema.',
      { sistema, clave }
    )
  }

  if (enOtras.length > 1) {
    /* Dos máquinas reclaman el mismo nombre. Elegir una sería contestar
       correctamente sobre la instalación equivocada. */
    return fallo(
      `«${texto}» existe en más de un sistema (${enOtras.map((x) => x.sistema).join(', ')}), y no ` +
        'son la misma máquina. Pregunta de cuál se trata antes de contestar.',
      { sistemas: enOtras }
    )
  }

  return fallo(
    `No hay ninguna señal llamada "${texto}" en esta planta. En el sistema del tanque sólo ` +
      `existen las ocho de la lista, y no hay más puntos bajo ${RAIZ}.`,
    { senales: catalogoBreve() }
  )
}

/* ── Resolver el período ─────────────────────────────────────────────── */

/**
 * De texto llano a una ventana absoluta `{ inicio, fin }`.
 *
 * ── POR QUÉ HAY UN RESOLVEDOR PROPIO Y NO SOLO `resolverPeriodo` ───
 *
 * Porque la pregunta natural sobre esta instalación es **relativa a ahora** y
 * no de calendario. En Resonac se pregunta por el turno de ayer; aquí se
 * pregunta «cómo ha ido el nivel esta última hora», porque lo que se vigila es
 * una tendencia en curso y no el cierre de un día de producción. `resolverPeriodo`
 * no conoce las horas relativas —fue escrito para días— y añadírselas allí
 * cambiaría el comportamiento del tablero de Resonac, que no lo ha pedido.
 *
 * El orden importa: primero lo relativo, y lo que no lo sea se delega en
 * `shared/periodo.js`, que ya sabe de «ayer», «julio 2026» y «últimos 7 días».
 * Así una forma sólo se implementa una vez.
 *
 * @returns {{ inicio: Date, fin: Date, etiqueta: string } | { error: string }}
 */
export function resolverVentana(texto, { turnos = {}, maxHoras = MAX_HORAS_VENTANA } = {}) {
  const crudo = String(texto ?? '').trim()
  const ahora = new Date()

  // Sin período, o preguntando por el presente: la ventana por defecto.
  if (!crudo || /^(ahora|ahora mismo|actual|en vivo|hoy mismo)$/i.test(normalizarTexto(crudo))) {
    return ventanaDeHoras(VENTANA_POR_DEFECTO, ahora)
  }

  // Los números se escriben con letra tan a menudo como con cifra —«hace seis
  // horas»— y el modelo copia la frase del usuario tal cual, que es justo lo
  // que se le pide. Sin esto, «hace seis horas» no resolvía y la respuesta era
  // pedirle al operador que reescribiera su propia pregunta.
  const t = enCifras(normalizarTexto(crudo))

  /*
   * 1 · La hora en curso: «esta hora», «la hora actual».
   *
   * Va antes que el resto porque `resolverPeriodo` no la conoce —fue escrito
   * para días— y sin ella caía hasta el error final. Se descubrió al pulsar el
   * ejemplo «compara la presión de esta hora con la de hace seis horas», que
   * es exactamente la forma en que se pregunta esto.
   */
  if (/\b(esta|la) hora( actual| en curso)?\b/.test(t) && !/ultim|pasad|hace/.test(t)) {
    return ventanaDeHoras(1, ahora, 'la última hora')
  }

  /* 2 · Horas relativas: «última hora», «últimas 6 horas», «hace 2 horas». */
  const horas = t.match(/\b(?:ultim[oa]s?|pasad[oa]s?|hace|en las?)\s*(\d+)?\s*(hora|horas|h)\b/)
  if (horas) {
    /*
     * Sin número, el plural manda: «la última hora» es una, «estas últimas
     * horas» son las 6 de la ventana por defecto —las mismas que pintan las
     * gráficas de Planta—. Antes ambas daban 1 h, y a «¿cómo ha ido la
     * temperatura estas últimas horas?» se le contestaba con un tramo seis
     * veces más corto del que se le enseña en pantalla.
     */
    const n = horas[1] ? Number(horas[1]) : (horas[2] === 'horas' ? VENTANA_POR_DEFECTO : 1)
    if (n < 1) return { error: 'La ventana tiene que ser de al menos una hora.' }
    if (n > maxHoras) {
      return {
        error:
          `${n} horas son demasiadas para una sola lectura: como mucho ${maxHoras} horas ` +
          `(${Math.round(maxHoras / 24)} días). ${ALTERNATIVAS}`,
      }
    }
    return ventanaDeHoras(n, ahora)
  }

  /*
   * 3 · «última semana».
   *
   * `resolverPeriodo` conoce «esta semana» y «semana pasada», pero no ésta — y
   * es la forma que el propio modelo propone cuando rechazamos un mes por
   * demasiado largo. Un asistente que sugiere una frase que luego no entiende
   * manda al operador a un callejón sin salida, así que se resuelve como los
   * últimos 7 días, que es lo que significa.
   */
  if (/\bultimas? semanas?\b/.test(t)) {
    return ventanaDeHoras(24 * 7, ahora, 'los últimos 7 días')
  }

  /* 4 · Minutos relativos: «últimos 30 minutos». Se aceptan porque el sondeo
   *     vivo va a 3 s y una tendencia corta es una pregunta razonable aquí. */
  const minutos = t.match(/\b(?:ultim[oa]s?|pasad[oa]s?|hace|en los?)\s*(\d+)\s*(minutos?|min)\b/)
  if (minutos) {
    const n = Number(minutos[1])
    if (n < 1) return { error: 'La ventana tiene que ser de al menos un minuto.' }
    return ventanaDeHoras(n / 60, ahora, `los últimos ${n} minutos`)
  }

  /* 5 · Todo lo demás es calendario, y de eso sabe `shared/periodo.js`. */
  const p = resolverPeriodo(crudo, { turnos })
  if (p.error) return { error: p.error }

  const inicio = fecha(p.diaDesde, p.horaDesde)
  // `horaHasta === 24` es «hasta el final del día», que es el día siguiente a
  // las 00:00. Sumarlo como hora 24 daría una fecha inválida en algunos husos.
  const fin = p.horaHasta >= 24 ? fecha(siguienteDia(p.diaHasta), 0) : fecha(p.diaHasta, p.horaHasta)

  // Un período que llega hasta hoy se recorta en el presente: pedirle al
  // historiador las horas que aún no han pasado devuelve muestras vacías que
  // sólo sirven para ensuciar el recuento.
  const finReal = fin > ahora ? ahora : fin

  if (finReal <= inicio) {
    return { error: `El período "${crudo}" no ha empezado todavía; no hay datos que leer.` }
  }

  const duracionHoras = (finReal - inicio) / 3_600_000
  if (duracionHoras > maxHoras) {
    return {
      error:
        `"${p.etiqueta}" abarca más de ${Math.round(maxHoras / 24)} días, el máximo de una sola ` +
        `lectura. ${ALTERNATIVAS}`,
    }
  }

  return { inicio, fin: finReal, etiqueta: p.etiqueta }
}

/**
 * Números escritos con letra → cifra, del uno al veinticuatro.
 *
 * Sólo hasta 24 a propósito: es el techo útil aquí —más horas que eso ya se
 * piden en días— y una tabla corta no puede confundir «un» artículo con «un»
 * número, que es el error clásico de hacer esto con una lista larga. Por eso
 * «un/una» NO está: «en una hora» quiere decir una hora, y el respaldo del
 * plural ya lo resuelve sin ayuda.
 */
const NUMEROS = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuna: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
}

/** Sustituye los números escritos con letra por su cifra. */
function enCifras(texto) {
  return texto.replace(
    /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiuna|veintiuno|veintidos|veintitres|veinticuatro)\b/g,
    (m) => String(NUMEROS[m])
  )
}

/** Una ventana de N horas que termina ahora. */
function ventanaDeHoras(n, ahora, etiqueta) {
  return {
    inicio: new Date(ahora.getTime() - n * 3_600_000),
    fin: ahora,
    etiqueta: etiqueta ?? (n === 1 ? 'la última hora' : `las últimas ${n} horas`),
  }
}

/** `YYYY-MM-DD` + hora → `Date` en la zona local del servidor. */
function fecha(iso, hora) {
  return new Date(`${iso}T${String(hora).padStart(2, '0')}:00:00`)
}

/** El día siguiente en ISO, sin aritmética de milisegundos que el horario de verano rompe. */
function siguienteDia(iso) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return isoLocal(d)
}

/* ── Las herramientas ────────────────────────────────────────────────── */

/** Punto de control de la bomba: no es una señal del catálogo, así que vive aparte. */
const TAG_CONTROL_BOMBA = `${RAIZ}CONTROL`

/**
 * Veces que se relee `CONTROL` tras escribir, y espera entre cada una.
 *
 * El tag escanea cada ~1 s (su `Scan rate` en el servidor), pero ese ciclo
 * tiene jitter (cola de escaneo, latencia de red al PLC/OPC): con 3 intentos
 * de 700 ms (1,4 s de margen total) se vieron falsos rechazos en los que la
 * bomba sí llegaba a encenderse, solo que después de que el guard ya había
 * dado la escritura por perdida. Cinco intentos con 800 ms (3,2 s de margen)
 * cubren ese jitter sin alargar demasiado la respuesta en el caso normal.
 */
const INTENTOS_RELECTURA_CONTROL = 5
const ESPERA_RELECTURA_CONTROL_MS = 800

/** Pausa async simple, para esperar entre reintentos de relectura. */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createHerramientas({
  client,
  turnos = {},
  readOnly = true,
  indiceDocumentos = null,
  // Carpeta y purga de los PDF de `generar_reporte` (Plan 14 Fase 5). Mismo
  // criterio que `indiceDocumentos`: un objeto de configuración, no variables
  // de entorno leídas aquí — eso lo hace `config.mjs`.
  reportes = null,
  // Tope de tramos simultáneos en `leerSerieEnRango()` (Plan 15 Fase 3):
  // `config.limits.historyConcurrencia`, mismo criterio que los dos de
  // arriba — un número que viene de fuera, no una variable de entorno leída
  // aquí.
  historyConcurrencia = 6,
} = {}) {
  if (!client?.readPoints) {
    throw new Error('createHerramientas requiere el cliente de ICONICS')
  }

  /**
   * Lee TODOS los puntos de una máquina y devuelve su estado en la forma común.
   *
   * ── POR QUÉ UNA SOLA FUNCIÓN PARA TODAS ────────────────────────────
   *
   * Porque antes había dos, una por máquina, y cada herramienta se escribía
   * contra una de las dos formas. Ése es el motivo de que el tanque tuviera
   * ocho herramientas y vibraciones una: no faltaban por escribir, es que no
   * había forma común contra la que escribirlas.
   *
   * Que el chat y la pantalla vean lo mismo sigue garantizado igual: el estado
   * sale de `sistema.estado()`, que construye por dentro el MISMO objeto de
   * dominio que pinta la vista —viaja en `estado.dominio`—, con las mismas
   * lecturas y los mismos umbrales.
   *
   * La calidad se filtra aquí, en la frontera, exactamente igual que hace el
   * motor de sondeo del frontend: un valor de mala calidad llega como 0 y, sin
   * filtrar, el asistente diría «el tanque está al 0 %» de una instalación
   * llena. Un hueco es `null` y el dominio lo pinta como «sin dato».
   */
  async function leerMaquina(sistema) {
    const puntos = sistema.puntos()
    const respuesta = await client.readPoints(puntos)
    if (!respuesta.ok) return { ok: false, error: respuesta.error, status: respuesta.status }

    const mapa = respuesta.payload ?? {}
    const receivedAt = new Date().toISOString()

    const valorDe = (punto) => {
      const entrada = mapa[punto]
      if (!entrada?.ok) return null
      const p = entrada.payload ?? {}
      const quality = p.quality ?? p.Quality ?? null
      if (!isGoodQuality(quality)) return null
      const v = p.value ?? p.Value
      return v === undefined ? null : v
    }

    return { ok: true, estado: sistema.estado(valorDe, sistema, receivedAt), receivedAt }
  }

  /**
   * `sistema` del argumento → entrada del registro, o el fallo que enseña al
   * modelo cuáles hay.
   *
   * ── POR QUÉ NO TIENE VALOR POR DEFECTO ─────────────────────────────
   *
   * Porque el defecto tendría que ser el tanque, y entonces una pregunta sobre
   * vibraciones a la que el modelo olvidara el argumento se contestaría
   * **correctamente sobre la máquina equivocada**: cifras reales, unidades
   * reales, y ni un error en el log. Es el fallo más caro de este proyecto y el
   * que la separación de sistemas existe para impedir.
   *
   * Fallar cuesta un turno y se corrige solo: el error trae la lista de ids.
   */
  function resolverSistema(id) {
    if (!id) {
      return fallo(
        'Falta decir de qué sistema. Cada uno es una instalación SEPARADA, con su propio PLC, ' +
          'y contestar del otro sería contestar de otra máquina.',
        { sistemas: SISTEMAS.map((s) => ({ sistema: s.id, es: s.nombre })) }
      )
    }
    const s = SISTEMA[String(id).trim()]
    if (!s) {
      return fallo(`No hay ningún sistema llamado "${id}" en esta planta.`, {
        sistemas: SISTEMAS.map((x) => ({ sistema: x.id, es: x.nombre })),
      })
    }
    return { ok: true, sistema: s }
  }

  /**
   * El motor de reglas de una máquina, sobre su estado ya leído.
   *
   * ── POR QUÉ ESTO SIGUE SIENDO UN `switch` Y NO UN CAMPO ────────────
   *
   * Porque las dos funciones NO reciben lo mismo: `evaluarRiesgos` espera el
   * `Sistema` del tanque y `evaluarRiesgosVibracion` espera
   * `{ canales, variador, alarmas }`. Los dos salen de `estado.dominio`, pero
   * son objetos distintos, y declarar `riesgos: evaluarRiesgos` en el registro
   * exigiría que las dos aceptaran la misma entrada — es decir, reescribir los
   * dos motores de reglas contra la forma común.
   *
   * Eso es trabajo real y no está hecho, así que se dice en vez de fingirlo.
   * Mientras tanto, la máquina que se dé de alta añade su línea aquí; una que
   * no la añada sale sin riesgos y con `evaluadas: 0`, que es visible en la
   * respuesta y no un silencio.
   */
  function evaluarRiesgosDe(sistema, estado) {
    switch (sistema.id) {
      case 'tanque':
        return evaluarRiesgos(estado.dominio)
      case 'vibraciones':
        return evaluarRiesgosVibracion(estado.dominio)
      default:
        return { activos: [], noEvaluables: [], evaluadas: 0 }
    }
  }

  /**
   * Una llamada SUELTA a `readHistory`, sin trocear — la pieza de más abajo
   * de `leerSerie()`. Existe separada porque tanto una ventana corta (un
   * único tramo) como cada tramo de una ventana larga acaban aquí.
   */
  async function leerUnTramo(clave, ventana, tramoPlanificado) {
    const segundos = (ventana.fin - ventana.inicio) / 1000
    // Un punto cada 15 min como en la vista de Planta, pero sin pasar del tope
    // del servidor: por debajo de 25 h manda la resolución, por encima el tope.
    const puntos = Math.max(2, Math.min(MAX_PUNTOS, Math.round(segundos / 900)))
    // `leerSerie()` ya calculó el tramo con `planificar()` (Plan 15 Fase 2,
    // la MISMA regla que usa el frontend) y lo pasa aquí para no
    // recalcularlo dos veces con criterios distintos dentro del mismo
    // archivo; sin este tercer argumento (una ventana corta, de un único
    // tramo) se calcula como siempre.
    const interval = tramoPlanificado?.interval ?? intervaloHMS(segundos / puntos)
    const segundosPorPunto = tramoPlanificado?.segundosPorPunto ?? segundos / puntos

    const r = await client.readHistory({
      // Con `ac:`, el mismo nombre que en vivo. `hda:\Configuration\…` responde
      // 500 para este árbol: ver `shared/eva/historia.js`.
      pointName: pointName(clave),
      startDate: ventana.inicio.toISOString(),
      endDate: ventana.fin.toISOString(),
      aggregate: AGREGADO,
      interval,
    })

    if (!r?.ok) return { ok: false, status: r?.status ?? 0, error: r?.error }

    /*
     * `hasMore` se propaga porque el recorte del servidor es SILENCIOSO en los
     * datos: con el tope de `MAX_PUNTOS` la respuesta llega `ok: true` y con
     * marcas de tiempo correctas, sólo que le faltan las horas del final. Un
     * mínimo diario calculado sobre ese trozo es un número real del período
     * equivocado —indistinguible del bueno—, que es justo el modo de fallo que
     * el resto de este archivo se esfuerza en evitar.
     *
     * El frontend ya lo consumía (`data/historia.js`); esta ruta lo tiraba.
     */
    /*
     * La rejilla viaja con los datos para que `resumirSerie` pueda declarar la
     * COBERTURA: cuántos tramos de los pedidos traían dato. Sin ella, un día
     * con nueve horas de actividad y quince de silencio se resume con el
     * promedio de las nueve y se lee como el del día entero.
     */
    return {
      ok: true,
      datos: normalizar(r.data),
      truncada: Boolean(r.hasMore),
      ventana: { inicio: ventana.inicio, fin: ventana.fin, segundosPorPunto },
    }
  }

  /**
   * Una serie del historiador, ya normalizada — la función pública que usan
   * `historia_de_senal`, `analisis_de_senal`, `comparar_periodos` y
   * `grafico_de_senal`.
   *
   * **La guarda de `historizado` va antes que la red**, no después: ver la
   * cabecera del archivo. Devolver `motivo` en vez de lanzar es deliberado —no
   * es una avería, es un hecho de la instalación que el asistente tiene que
   * poder explicar—.
   *
   * ── POR QUÉ TROCEA POR DENTRO (Plan 15 Fase 4) ─────────────────────
   *
   * Antes de esto, una ventana larga se pedía en UNA sola llamada con un
   * intervalo grueso — y ese es exactamente el patrón patológico que
   * documenta `planificar()`/`trocear()`: medido contra el servidor real,
   * un rango de 30 días con un intervalo de 7 h 12 min devolvió **una sola
   * muestra** de todo el mes, sin ningún error que lo delate (`hasMore:
   * false`, la petición "terminó bien"). Con `MAX_HORAS_VENTANA` subido a
   * 90 días (Fase 4), este archivo empezó a poder disparar esa trampa desde
   * una herramienta que un operador usa todos los días.
   *
   * La solución no es la Fase 1 (paginación): el servidor no estaba diciendo
   * "hay más", estaba diciendo honestamente "esto es todo lo que hay con
   * este intervalo" — el problema es la ELECCIÓN del intervalo, no la
   * paginación. La solución es la Fase 2: trocear con `planificar()`, igual
   * que ya hacía `leerSerieEnRango()`, y fusionar los tramos aquí para que
   * los cuatro llamadores no tengan que saber que la ventana se troceó.
   */
  async function leerSerie(clave, ventana) {
    if (!esHistorizada(clave)) return { ok: false, motivo: SIN_SERIE }

    const { tramos } = planificar({ inicio: ventana.inicio, fin: ventana.fin, puntosPorTramo: 96 })

    // Un solo tramo: la ventana ya es corta, la llamada de siempre sin
    // recomponer nada — mismo `interval` que si `planificar()` no existiera.
    if (tramos.length === 1) return leerUnTramo(clave, ventana)

    // Concurrencia ACOTADA (Plan 15 Fase 3): mismo criterio que
    // `leerSerieEnRango()`, y por el mismo motivo — más tramos con la Fase 1
    // debajo pueden ser más páginas HTTP por tramo.
    const tareas = tramos.map(
      (tramo) => () => leerUnTramo(clave, { inicio: tramo.desde, fin: tramo.hasta }, tramo)
    )
    const resultados = await conConcurrenciaAcotada(tareas, historyConcurrencia)

    const datos = []
    let truncada = false
    let huboExito = false
    for (const resultado of resultados) {
      if (!resultado.ok) continue
      huboExito = true
      datos.push(...resultado.datos)
      if (resultado.truncada) truncada = true
    }

    // Sin ningún tramo con éxito, se propaga el primer error real — mismo
    // criterio de `leerSerieEnRango`: un tramo que falla no invalida el
    // resto, pero si fallan TODOS no hay nada bueno que devolver.
    if (!huboExito) {
      const primerFallo = resultados.find((r) => !r.ok)
      return primerFallo ?? { ok: false, status: 0, error: 'El historiador no devolvió ningún tramo.' }
    }

    datos.sort((a, b) => a.t - b.t)
    const segundos = (ventana.fin - ventana.inicio) / 1000
    return {
      ok: true,
      datos,
      truncada,
      ventana: { inicio: ventana.inicio, fin: ventana.fin, segundosPorPunto: segundos / 96 },
    }
  }

  /**
   * Muchos días de una señal, leídos DÍA A DÍA.
   *
   * ── POR QUÉ NO SE PIDE LA VENTANA ENTERA DE UNA VEZ ────────────────
   *
   * Porque el servidor topa en `MAX_PUNTOS` muestras por petición, y ese tope
   * es por PETICIÓN, no por día. Pedir treinta días de golpe devuelve cien
   * puntos: uno cada siete horas. Sobre eso no se puede decir qué es normal —
   * cada punto es ya el promedio de media jornada, así que los extremos han
   * desaparecido y la variabilidad medida es la de los promedios, no la de la
   * señal.
   *
   * Troceando por días se conserva la resolución de un cuarto de hora, que es
   * la que hace falta para que un percentil signifique algo.
   *
   * Un día que falle no invalida el perfil: se cuenta y se sigue. Con treinta
   * días, perder uno no cambia la respuesta, y abortar por él dejaría al
   * operador sin perfil por un hueco del historiador.
   */
  async function leerHistoriaLarga(clave, dias) {
    const ahora = new Date()
    const { muestras, diasLeidos } = await leerSerieEnRango(clave, {
      inicio: new Date(ahora.getTime() - dias * 86400000),
      fin: ahora,
    })
    return { muestras, diasLeidos }
  }

  /**
   * Igual que arriba, pero para un rango explícito en vez de "N días hacia
   * atrás desde ahora". La usa `generar_reporte` (Plan 14 Fase 5), que puede
   * pedir cualquier ventana, no sólo la que termina en el presente.
   *
   * El troceado en tramos es `planificar()` de `@shared/eva/rango.js` (Plan
   * 15 Fase 2) — la MISMA regla escalonada que usa el frontend, en vez de la
   * de "siempre 1 día por tramo" que tenía este archivo antes: menos tramos
   * en rangos largos son menos peticiones HTTP, y con la Fase 1
   * (`readHistory` siguiendo la continuación) cada tramo ya puede ser varias
   * páginas por debajo.
   *
   * `diasLeidos`/`diasTotal` siguen contando en DÍAS DE CALENDARIO, no en
   * tramos —el asistente narra cobertura como "12 de 30 días respondieron"—,
   * así que un tramo de varios días que trae dato cuenta como TODOS sus
   * días leídos, sin distinguir si sólo una parte del tramo respondió. Es
   * una aproximación deliberada: la alternativa (pedir cada día suelto para
   * contar fino) es exactamente el problema que esta unificación resuelve.
   */
  async function leerSerieEnRango(clave, { inicio, fin }) {
    const muestras = []
    let diasLeidos = 0
    const diasTotal = Math.max(1, Math.ceil((fin - inicio) / 86400000))

    // 96 puntos por tramo, el mismo techo bajo `MAX_PUNTOS` que ya usaba
    // este archivo para un tramo de 1 día — `planificar()` sólo cambia CUÁN
    // ANCHO es cada tramo, no cuánta densidad se le pide dentro.
    const { tramos } = planificar({ inicio, fin, puntosPorTramo: 96 })

    // Concurrencia ACOTADA, no todo a la vez (Plan 15 Fase 3): un mes son
    // varios tramos, y con la Fase 1 (`readHistory` siguiendo la
    // continuación) cada tramo puede ser varias peticiones HTTP por debajo —
    // lanzarlos todos de golpe multiplicaría la carga contra el historiador
    // de producción justo cuando se amplíe cuánto se puede leer (Fase 4).
    // `leerUnTramo`, no `leerSerie`: cada elemento de `tramos` YA es un
    // tramo final de `planificar()` — pasarlo por `leerSerie()` volvería a
    // trocearlo (con otro `puntosPorTramo` distinto) en vez de pedirlo tal
    // cual.
    const tareas = tramos.map(
      (tramo) => () => leerUnTramo(clave, { inicio: tramo.desde, fin: tramo.hasta }, tramo)
    )

    const resultados = await conConcurrenciaAcotada(tareas, historyConcurrencia)
    resultados.forEach((resultado, i) => {
      if (!resultado.ok) return
      diasLeidos += tramos[i].dias
      muestras.push(...resultado.datos)
    })

    return { muestras, diasLeidos: Math.min(diasLeidos, diasTotal), diasTotal }
  }

  /**
   * Reduce una serie a como mucho `max` puntos, promediando por grupos.
   *
   * Sólo para el DIBUJO de `generar_reporte` (Plan 14 Fase 5): el SVG de
   * `renderizarGraficoSerie` tiene 640 px de ancho fijo y fue pensado para
   * las ventanas cortas del resto de herramientas (como mucho ~100 puntos,
   * el tope del historiador por petición). Un reporte de varios días junta
   * muchas de esas peticiones, y sin reducir el trazo se convierte en un
   * bloque sólido ilegible. Promediar por grupo (y no descartar puntos sin
   * más) conserva la forma de la curva; los extremos EXACTOS para el
   * resumen numérico siguen viniendo de la serie completa, sin pasar por
   * aquí.
   */
  function downsamplear(muestras, max) {
    if (muestras.length <= max) return muestras

    const factor = Math.ceil(muestras.length / max)
    const resultado = []
    for (let i = 0; i < muestras.length; i += factor) {
      const grupo = muestras.slice(i, i + factor)
      const suma = grupo.reduce((acc, m) => acc + m.valor, 0)
      resultado.push({ t: grupo[Math.floor(grupo.length / 2)].t, valor: suma / grupo.length })
    }
    return resultado
  }

  /* ── Presentación de una señal ─────────────────────────────────────── */

  /**
   * Una señal evaluada → lo que el modelo puede citar.
   *
   * ── POR QUÉ VIAJA LA BANDA Y NO SOLO EL ESTADO ─────────────────────
   *
   * Porque «en aviso» sin el número del umbral no es accionable: el operador
   * no sabe si está rozando el límite o muy pasado. Y porque el modelo tiene
   * prohibido hacer aritmética, así que si no le damos la banda no puede
   * decir cuánto margen queda — lo estimaría, que es exactamente lo que no
   * queremos.
   *
   * `unidad` es `null` cuando el servidor no la declara, y entonces viaja
   * `nota` diciéndolo. Es la diferencia entre «el caudal es 12,4» y «el caudal
   * es 12,4 l/s»: lo segundo nadie nos ha dicho que sea verdad.
   */
  /**
   * La banda en palabras que el modelo pueda copiar sin restar nada.
   *
   * `null` en un extremo significa **sin límite por ese lado**, no cero: una
   * eficiencia energética no es peor por ser alta. Escribirlo como «sin límite»
   * y no omitirlo evita que el modelo rellene el hueco con un 0 inventado.
   */
  function bandaLegible(u) {
    const lado = (v) => (v === null || v === undefined ? 'sin límite' : v)
    return {
      limiteInferior: lado(u.min),
      avisoInferior: lado(u.avisoMin),
      avisoSuperior: lado(u.avisoMax),
      limiteSuperior: lado(u.max),
    }
  }

  /**
   * El aviso de procedencia de los umbrales, cuando toca.
   *
   * Va en el RESULTADO y no en el prompt del sistema por el mismo motivo por
   * el que iba el aviso de OEE imposible: una advertencia que sólo vive en las
   * instrucciones se diluye a los tres turnos de conversación, y ésta tiene que
   * acompañar a cada cifra que se compare contra una banda.
   */
  const avisoDeUmbrales = () =>
    PROVISIONALES
      ? {
        /*
         * La clave es `aviso` y no `avisoUmbrales`, y no es cosmético: es el
         * campo que `chat.mjs` vigila para añadir la advertencia detrás cuando
         * el modelo no la cuenta. Con cualquier otro nombre la red de
         * seguridad no se entera, y medido con el 4B eso pasa: contestó «el
         * nivel está fuera de límite» sin decir de quién era el límite.
         */
        aviso:
            'Los límites con los que se ha evaluado cada señal son estimaciones nuestras para un ' +
            'sistema de agua genérico, no rangos confirmados por quien opera esta instalación, y ' +
            'el servidor no publica alarmas para este árbol. El estado de cada señal es un ' +
            'cálculo del tablero, no un dato de ICONICS.',
      }
      : {}

  /*
   * Las señales del pronóstico: sólo las que tienen serie PROPIA verificada.
   * `cargaMotor` no está y no puede estar — el historiador devuelve ahí la
   * curva de la temperatura del tanque sin dar error.
   */
  /**
   * ── EL ALMACÉN DE LO APRENDIDO ────────────────────────────────────
   *
   * Un JSON en `datos/`, al lado de los reportes. Se lee entero en cada
   * llamada y no se cachea: son unos kilobytes, y una caché aquí haría que dos
   * conversaciones simultáneas se pisaran los hechos que acaban de guardar.
   */
  /*
   * Ruta FIJA, no derivada de la de reportes. Derivarla con un `..` dependía de
   * si `reportesDir` venía como `datos` o como `datos/reportes`, y el archivo
   * acabó en la raíz del repositorio mientras `revisar-propuestas.mjs` lo
   * buscaba en `datos/`: el asistente guardaba y el revisor no veía nada, sin
   * un solo error por ningún lado. Las dos puntas usan esta misma constante.
   */
  const RUTA_APRENDIZAJE = join('datos', 'aprendizaje.json')

  async function leerAprendizaje() {
    try {
      return normalizarAlmacen(JSON.parse(await readFile(RUTA_APRENDIZAJE, 'utf8')))
    } catch {
      /* Que no exista es lo normal la primera vez, y un archivo corrupto no
         puede tumbar el asistente entero: se parte de vacío y los hechos de
         fábrica siguen ahí, que viven en el código. */
      return { ...APRENDIZAJE_VACIO, hechos: [], propuestas: [] }
    }
  }

  async function guardarAprendizaje(almacen) {
    try {
      await mkdir(dirname(RUTA_APRENDIZAJE), { recursive: true })
      await writeFile(RUTA_APRENDIZAJE, JSON.stringify(almacen, null, 2), 'utf8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  }

  const SENALES_PRONOSTICO = [
    'nivelTanque', 'temperaturaTanque', 'presionRelativa', 'tensionLinea', 'flujoInstantaneo',
  ]

  const herramientas = {
    /**
     * ── LO QUE YA SE SABE DE ESTA PLANTA ──────────────────────────────
     *
     * El modelo no recuerda nada entre conversaciones. Esto es lo más parecido
     * a que recuerde: los hechos que alguien confirmó alguna vez, entregados
     * cada vez que hacen falta.
     *
     * Son cosas que costaron días de averiguar y que NO se deducen mirando el
     * servidor —que hay tres sensores y no dos, que el grupo del historiador
     * lleva un espacio en el nombre—. Sin esto, cada conversación las vuelve a
     * suponer, y suponerlas mal es gratis.
     */
    async hechos_de_la_planta({ sistema = null } = {}) {
      const almacen = await leerAprendizaje()
      const todos = hechosVigentes(almacen)
      const hechos = sistema ? todos.filter((h) => h.sistema === sistema || h.sistema === null) : todos

      return {
        ok: true,
        cuantos: hechos.length,
        hechos: hechos.map((h) => ({
          sobre: h.sistema ?? 'toda la planta',
          hecho: h.hecho,
          /* El origen viaja siempre: «lo confirmó quien opera la instalación»
             y «lo dedujo el modelo» no valen lo mismo, y leídos en la misma
             lista sin esta línea serían indistinguibles. */
          origen: h.origen,
        })),
        propuestas_pendientes: pendientes(almacen).length,
      }
    },

    /**
     * ── APRENDER ALGO NUEVO, CUANDO UNA PERSONA LO CONFIRMA ───────────
     *
     * Sólo se llama cuando el usuario AFIRMA un dato de la instalación. No
     * para guardar lo que el modelo deduzca: para eso está `proponer_regla`,
     * que pasa por revisión.
     *
     * La diferencia importa dentro de un mes, cuando alguien lea la lista y no
     * pueda distinguir un dato de planta de una conjetura bien redactada.
     */
    async recordar_hecho({ hecho, sistema = null, origen = null } = {}) {
      const texto = String(hecho ?? '').trim()
      if (texto.length < 10) {
        return fallo('Un hecho tiene que decir algo concreto sobre la instalación.')
      }
      if (!origen) {
        return fallo(
          'Falta el origen: quién lo confirmó y cuándo. Sin eso no se puede guardar, porque ' +
          'dentro de un mes nadie sabrá si lo dijo quien opera la planta o lo dedujo el asistente.'
        )
      }

      const almacen = await leerAprendizaje()
      const nuevo = crearHecho({ hecho: texto, sistema, origen }, new Date())
      almacen.hechos.push(nuevo)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        guardado: nuevo.hecho,
        sobre: nuevo.sistema ?? 'toda la planta',
        total_hechos: hechosVigentes(almacen).length,
        aviso:
          'Queda guardado, y estará disponible en las siguientes conversaciones. ' +
          'Se ha anotado junto con su origen, para que más adelante se sepa quién lo confirmó.',
      }
    },

    /**
     * ── PROPONER UNA REGLA, QUE NO ES LO MISMO QUE CREARLA ────────────
     *
     * Esto NO añade una regla al sistema. Deja una propuesta esperando a que
     * una persona la revise.
     *
     * Y es deliberado. Estas reglas deciden si una pantalla de planta dice
     * «riesgo de derrame»: una inventada que salta sin motivo se desactiva a
     * la semana y se lleva por delante la credibilidad de las que sí valen.
     * Contra este mismo servidor, el modelo local dijo tres veces seguidas
     * «velocidad eficaz 1,13 mm/s» leyendo la ACELERACIÓN. Quien confunde un
     * campo no firma el criterio con el que se para una bomba.
     *
     * Lo que sí aporta, y es mucho: mirar semanas de datos, ver un patrón que
     * a nadie se le había ocurrido, y dejarlo redactado con su evidencia para
     * que alguien lo juzgue en treinta segundos.
     */
    async proponer_regla(datos = {}) {
      const v = validarPropuesta(datos)
      if (!v.ok) {
        return fallo(
          `A la propuesta le faltan campos: ${v.faltan.join(', ')}. La evidencia tiene que ` +
          'llevar las cifras que la sostienen, no sólo la idea: sin ellas, quien la revise ' +
          'tendría que ir a buscar los datos él mismo y la propuesta no le ahorra nada.',
          { faltan: v.faltan }
        )
      }

      const almacen = await leerAprendizaje()
      const p = crearPropuesta(datos, new Date())
      almacen.propuestas.push(p)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        id: p.id,
        estado: p.estado,
        titulo: p.titulo,
        pendientes_de_revisar: pendientes(almacen).length,
        /*
         * `aviso` lo cita el modelo LITERAL en su respuesta —se comprobó—, así
         * que va escrito para quien lo lee. Las instrucciones al modelo viven
         * en las reglas de `chat.mjs`, no aquí: una frase como «dile al
         * usuario que…» acaba impresa en pantalla tal cual.
         */
        aviso:
          'Esto queda ANOTADO como propuesta y no vigila nada todavía: ninguna regla se ' +
          'aplica sin que una persona la revise. Para revisarla: ' +
          '`node scripts/revisar-propuestas.mjs`',
      }
    },

    /**
     * ── QUÉ SISTEMAS HAY EN ESTA PLANTA ───────────────────────────────
     *
     * El asistente no puede saber de antemano cuántos hay: hoy dos, mañana
     * los que se den de alta en `shared/eva/sistemas.js`. Esta herramienta es
     * como los descubre, con lo que cada uno mide, qué herramientas lo cubren
     * y —lo que importa— qué NO se puede afirmar de él.
     *
     * Existe sobre todo por el error que evita: sin ella, preguntado por algo
     * de un sistema que no conoce, el modelo llamaría a la herramienta del
     * otro y contestaría con datos de la máquina equivocada, en una frase
     * perfectamente redactada.
     */
    async sistemas_de_la_planta() {
      return {
        ok: true,
        cuantos: SISTEMAS.length,
        sistemas: resumenDeSistemas(),
        aviso: NO_COMPARTEN,
      }
    },

    /**
     * ── LO QUE PUEDE PASAR, NO LO QUE ESTÁ PASANDO ─────────────────────
     *
     * `estado_del_sistema` contesta «¿cómo va?». Ésta contesta «¿qué puede
     * pasar si sigue así?», que es otra pregunta y tiene otras respuestas: las
     * reglas cruzan VARIAS señales, y una combinación puede ser peligrosa con
     * las ocho señales dentro de su banda —nivel alto no es un problema; nivel
     * alto CON la bomba impulsando, sí—.
     *
     * Devuelve `sin_comprobar` siempre, y no sólo cuando hay riesgos. Es la
     * mitad que evita el peor fallo del modelo con esta herramienta: contestar
     * «no hay ningún riesgo» cuando lo que pasa es que faltaba una lectura y no
     * se pudo mirar nada.
     */
    /**
     * ── LOS RIESGOS DE CUALQUIER MÁQUINA ───────────────────────────────
     *
     * Cada sistema trae su motor de reglas: el tanque cruza nivel, caudal y
     * carga; vibraciones cruza apoyos, norma ISO y estado del módulo. Lo que
     * comparten es la FORMA del resultado —activos, no evaluables, evidencia
     * separada de la hipótesis—, y sobre esa forma se escribe esta herramienta
     * una sola vez.
     *
     * `sin_comprobar` NO es relleno: una regla que no se pudo evaluar y una que
     * se evaluó y no se cumple salen las dos en verde si sólo se cuentan las
     * activas. En una máquina que puede quedarse muda —y las dos pueden— esa
     * diferencia es la respuesta entera.
     */
    async riesgos_activos({ sistema } = {}) {
      const elegido = resolverSistema(sistema)
      if (!elegido.ok) return elegido

      const lectura = await leerMaquina(elegido.sistema)
      if (!lectura.ok) {
        return fallo(
          `No se pudo leer «${elegido.sistema.nombre}» del servidor ICONICS: ${lectura.error}`
        )
      }

      const estado = lectura.estado
      const r = evaluarRiesgosDe(elegido.sistema, estado)
      const mudos = estado.sinLectura.length

      return {
        ok: true,
        sistema: elegido.sistema.nombre,
        maquina: elegido.sistema.maquina,
        fuente: 'tiempo real',
        momento: lectura.receivedAt,
        reglas_evaluadas: r.evaluadas,
        /* Agrupados por regla: las de ámbito de canal se evalúan una vez por
           apoyo, y cuando la causa es común salen tres entradas casi idénticas.
           En el tanque, donde todas son de máquina, agrupar no cambia nada. */
        riesgos: agruparPorRegla(r.activos),
        sin_comprobar:
          r.noEvaluables.length === 0
            ? 'ninguna: se pudieron evaluar todas las reglas'
            : `${r.noEvaluables.length} no se pudieron evaluar por falta de lecturas: ` +
              [...new Set(r.noEvaluables.map((x) => x.titulo))].slice(0, 4).join('; '),
        ...(mudos > 0
          ? {
            puntos_sin_lectura: `${mudos} de ${estado.puntosPedidos} puntos no entregan lectura ahora mismo.`,
          }
          : {}),
        aviso:
          (r.activos.length === 0 && r.noEvaluables.length > 0
            ? 'NO digas que no hay riesgos: hay reglas que no se pudieron evaluar por falta de ' +
              'lecturas. «Sin riesgos detectados» y «no se pudo mirar» son cosas distintas. '
            : '') +
          'Estas reglas las evalúa el tablero cruzando señales, NO son alarmas del servidor ' +
          'ICONICS. ' +
          (elegido.sistema.limitaciones?.[0] ?? ''),
      }
    },

    /**
     * ── DESGASTE ACUMULADO, CON SUS CUATRO LÍMITES DECLARADOS ──────────
     *
     * Cuenta horas de exposición sobre el histórico del tanque. Los límites de
     * lo que puede afirmar van EN LA RESPUESTA y no sólo en el código, porque
     * es el modelo quien va a redactar la frase final y el error caro es que
     * convierta «horas estimadas de exposición» en «le quedan dos años».
     */
    async pronostico_de_desgaste({ sistema = 'tanque', dias = 30 } = {}) {
      /*
       * ── LA GUARDA DEL PUNTO 3 DEL ALTA ─────────────────────────────
       *
       * Un pronóstico es exposición ACUMULADA, así que necesita dos cosas que
       * no toda máquina tiene: histórico del que contar horas, y mecanismos de
       * desgaste declarados que digan a qué avería lleva cada condición.
       *
       * Vibraciones no tiene ninguna de las dos, y su entrada del registro lo
       * declara (`series.historizadas()` vacío, `desgaste: null`). Sin esta
       * guarda, pedir su pronóstico habría resuelto las señales contra el
       * catálogo del tanque y contestado sobre el agua — correctamente, y
       * sobre la máquina equivocada.
       *
       * `sistema` sí tiene defecto aquí, al contrario que en las otras: esta
       * herramienta sólo la puede servir una máquina hoy, y exigir el argumento
       * para una única respuesta posible sería ceremonia.
       */
      const elegido = resolverSistema(sistema)
      if (!elegido.ok) return elegido

      if (!elegido.sistema.desgaste || !tieneHistoria(elegido.sistema.id)) {
        return fallo(
          `«${elegido.sistema.nombre}» no tiene pronóstico de desgaste. ${elegido.sistema.series.nota} ` +
            'Sin histórico no hay exposición acumulada que contar, y sin mecanismos declarados no ' +
            'se sabe a qué avería llevaría. Puedes dar su estado de AHORA con ' +
            `estado_del_sistema(sistema="${elegido.sistema.id}"), pero no afirmes ninguna tendencia.`,
          { sistema: elegido.sistema.id, con_historia: tieneHistoria(elegido.sistema.id) }
        )
      }

      const d = Math.max(1, Math.min(90, Number(dias) || 30))
      const fin = new Date()
      const inicio = new Date(fin.getTime() - d * 86400000)

      const claves = SENALES_PRONOSTICO.filter((k) => esHistorizada(k))
      const series = {}
      for (const k of claves) {
        const r = await leerSerieEnRango(k, { inicio, fin })
        series[k] = r?.muestras ?? []
      }

      /* Las series llegan por separado y el motor necesita filas: se alinean
         por marca de tiempo, y una fila con un hueco se queda con el hueco en
         vez de rellenarse — un valor inventado ahí contaría horas falsas. */
      const marcas = new Set()
      for (const k of claves) for (const m of series[k]) marcas.add(m.timestamp)
      const filas = [...marcas].sort().map((t) => {
        const fila = {}
        for (const k of claves) {
          const m = series[k].find((x) => x.timestamp === t)
          fila[k] = m && Number.isFinite(m.value) ? m.value : null
        }
        return fila
      })

      const r = evaluarPronostico(filas, d * 24)

      return {
        ok: true,
        sistema: 'Tanque y grupo de bombeo',
        ventana_dias: d,
        muestras: r.muestras,
        mecanismos: r.activos.map((x) => ({
          titulo: x.titulo,
          componente: x.componente,
          horas_estimadas: x.horasEstimadas,
          fraccion_del_tiempo: x.fraccion,
          por_que_degrada: x.mecanismo,
          a_donde_lleva: x.consecuencia,
          que_revisar: x.accion,
          norma: x.norma ?? undefined,
        })),
        sin_exposicion: r.sinExposicion?.map((x) => x.titulo) ?? [],
        sin_comprobar: r.noEvaluables?.map((x) => ({ titulo: x.titulo, por_que: x.porque })) ?? [],
        aviso:
          'Las horas son ESTIMADAS a partir de la fracción de muestras que cumplían la condición, ' +
          'no contadas reloj en mano. El historiador promedia, así que los episodios más cortos ' +
          'que el intervalo no aparecen. NO estimes cuántos meses o años tardará en averiarse ' +
          'nada: estas horas dicen cuánta exposición se ha acumulado, no cuánta vida queda.',
      }
    },

    /**
     * Todo el sistema de una vez.
     *
     * ── POR QUÉ DEVUELVE LAS OCHO Y NO ADMITE FILTRO ───────────────────
     *
     * Porque son ocho. El catálogo entero cabe en una respuesta que cuesta una
     * sola lectura en lote, y el modelo tiene **una consulta por pregunta**
     * (ver `chat.mjs`): una herramienta que devolviera sólo la señal pedida
     * obligaría a elegir bien a la primera, y «¿va todo bien?» no nombra
     * ninguna señal. Devolverlo todo hace que la pregunta vaga y la concreta
     * se respondan con la misma llamada.
     */
    /**
     * ── UNA HERRAMIENTA PARA TODAS LAS MÁQUINAS ────────────────────────
     *
     * Antes eran dos —`estado_del_sistema` para el tanque y
     * `estado_de_vibraciones` para la otra— y esa asimetría explicaba el resto:
     * el tanque tenía ocho herramientas y vibraciones una, porque cada una
     * estaba escrita contra la forma de dominio de una máquina concreta.
     *
     * Con diez máquinas serían diez herramientas casi idénticas en el contexto
     * del modelo, y eso no es sólo feo: un modelo local elige peor cuál llamar
     * cuando hay veinte descripciones que se parecen. La calidad de las
     * respuestas caería por un motivo que no tiene nada que ver con los datos.
     *
     * Lo que NO se unificó es cómo se cuenta cada máquina: eso lo declara su
     * entrada del registro (`resumen`), porque lo que un modelo pequeño
     * necesita para no equivocarse depende del catálogo que tenga delante. Ver
     * la cabecera de `estadoVibraciones.js`.
     */
    async estado_del_sistema({ sistema } = {}) {
      const elegido = resolverSistema(sistema)
      if (!elegido.ok) return elegido

      const lectura = await leerMaquina(elegido.sistema)
      if (!lectura.ok) {
        return fallo(
          `No se pudo leer «${elegido.sistema.nombre}» del servidor ICONICS: ${lectura.error}`
        )
      }

      const estado = lectura.estado

      /* Los riesgos van dentro del estado y no en una segunda llamada: son la
         mitad de la respuesta a «¿cómo está?», y pedirlos aparte costaba un
         turno que el modelo casi nunca daba. */
      const riesgos = evaluarRiesgosDe(elegido.sistema, estado)

      return {
        ok: true,
        ...elegido.sistema.resumen(estado, {
          riesgos,
          agrupar: agruparPorRegla,
          horaLocal: horaLocal(lectura.receivedAt),
        }),
      }
    },

    /**
     * La tendencia de UNA señal en un período.
     *
     * Una señal y no varias: el historiador se pide punto a punto, y cuatro
     * señales serían cuatro idas y vueltas para una pregunta que casi siempre
     * es sobre una sola magnitud. Si hicieran falta dos, la segunda pregunta
     * las trae — y el modelo tiene una consulta por turno de todos modos.
     */
    async historia_de_senal({ senal, periodo } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })

      const meta = senalInfo(clave)

      /*
       * La guarda, ANTES de la red. Ver la cabecera del archivo.
       *
       * El error nombra las cuatro que sí tienen serie y explica el motivo real
       * —el tag no está coleccionado— para que el modelo pueda ofrecer el valor
       * en vivo en su lugar en vez de quedarse en «no puedo».
       */
      if (!esHistorizada(clave)) {
        return fallo(
          `${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE} ` +
            `Pedírsela devolvería la curva de otra señal —la temperatura del tanque— sin avisar, ` +
            `así que no se pide. Sí se puede dar su valor actual con estado_del_sistema.`,
          {
            senalesConHistoria: historizadas().map(k => SENALES[k].label),
            senalPedida: meta.label,
          }
        )
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const serie = await leerSerie(clave, v)
      if (!serie.ok) {
        // 502 y 504 los pone el puente: significan que no se llegó al servidor.
        // Decir entonces «no hay datos» manda a revisar el Data Historian
        // cuando lo que hay que hacer es levantar los servicios.
        if (serie.status >= 502) {
          return fallo(
            'No se pudo contactar con el servidor ICONICS para leer el historiador. No es que ' +
              'falten datos: el servidor no está respondiendo. Si acaban de arrancarse los ' +
              'servicios GENESIS, tardan 3-4 minutos en atender.'
          )
        }
        return fallo(
          `El historiador no devolvió la serie de ${meta.label} en ${v.etiqueta}: ` +
            `${serie.error ?? 'error del servidor'}.`
        )
      }

      const resumen = resumirSerie(serie.datos, meta.decimales, serie.ventana)
      if (!resumen) {
        return fallo(
          `No hay ninguna muestra de ${meta.label} en ${v.etiqueta}. El historiador no guarda ` +
            `ese tramo, o todas las muestras vinieron con mala calidad.`
        )
      }

      return {
        ok: true,
        senal: meta.label,
        tag: meta.tag,
        periodo: v.etiqueta,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        ...resumen,
        ...(serie.truncada ? { avisoTruncada: AVISO_TRUNCADA } : {}),
        ...(UMBRALES[clave] ? { banda: bandaLegible(UMBRALES[clave]) } : {}),
        ...(meta.nota ? { nota: meta.nota } : {}),
        ...(meta.soloEnMarcha
          ? {
            avisoReposo:
                'Esta señal sólo significa algo con la instalación impulsando. La instalación está ' +
                'parada la mayor parte del tiempo, así que un promedio bajo o un mínimo de cero ' +
                'reflejan las horas en reposo y no un problema.',
          }
          : {}),
        ...avisoDeUmbrales(),
      }
    },

    /**
     * Cuánto marcaba UNA señal en UN momento concreto.
     *
     * ── POR QUÉ NO VALÍA `historia_de_senal` ───────────────────────────
     *
     * Porque contestan preguntas distintas. Aquélla resume un TRAMO —mínimo,
     * máximo, promedio— y para «¿cuánto marcaba a las 11:16?» eso obliga al
     * modelo a elegir una de las tres cifras, que es justo la interpretación
     * que no queremos que haga. Preguntado eso mismo, el asistente contestaba
     * con el rango del día entero y decía no tener el dato de esa hora.
     *
     * ── POR QUÉ `Interpolative` Y NO `Average` ─────────────────────────
     *
     * `Average` promedia lo que haya DENTRO de la ventana, así que necesita
     * una ventana ancha para no salir vacía —y entonces ya no es el valor de
     * ese momento, sino el de un tramo—. `Interpolative` devuelve el valor
     * vigente EN el instante, que es literalmente la pregunta. Medido contra
     * el servidor real: a las 11:16 del 21-08-2026 el interpolado (6.10 %) y
     * la muestra cruda más cercana —a 20 s— (6.19 %) coinciden dentro del
     * ruido de la señal, porque este historiador guarda del orden de una
     * muestra por segundo.
     *
     * Aun así se devuelve `exacto: false` y la hora real de la muestra: es un
     * valor reconstruido, y el operador tiene derecho a saberlo.
     */
    async valor_en_momento({ senal, momento } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })

      const meta = senalInfo(clave)

      // La misma guarda de catálogo que el resto, y por el mismo motivo: sin
      // ella el servidor devuelve la curva de otra señal sin dar error.
      if (!esHistorizada(clave)) {
        return fallo(
          `${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE} ` +
            `Sí se puede dar su valor actual con estado_del_sistema.`,
          { senalesConHistoria: historizadas().map(k => SENALES[k].label), senalPedida: meta.label }
        )
      }

      const m = resolverInstante(momento)
      if (m.error) return fallo(m.error)

      /*
       * Una ventana de un minuto que EMPIEZA en el instante pedido: con
       * `Interpolative` el servidor rotula el punto al inicio del bucket, así
       * que así el único punto que vuelve es el del momento exacto.
       */
      const r = await client.readHistory({
        pointName: pointName(clave),
        startDate: m.instante.toISOString(),
        endDate: new Date(m.instante.getTime() + 60_000).toISOString(),
        aggregate: 'Interpolative',
        interval: '00:01:00',
      })

      if (!r?.ok) {
        if (r?.status >= 502) {
          return fallo(
            'No se pudo contactar con el servidor ICONICS para leer el historiador. No es que ' +
              'falten datos: el servidor no está respondiendo.'
          )
        }
        return fallo(`El historiador no devolvió el valor de ${meta.label} en ${m.etiqueta}.`)
      }

      const [punto] = normalizar(r.data)
      if (!punto) {
        return fallo(
          `El historiador no tiene ningún valor de ${meta.label} en ${m.etiqueta}. Puede que ese ` +
            `tramo no se guardara o que la muestra viniera con mala calidad.`
        )
      }

      return {
        ok: true,
        senal: meta.label,
        tag: meta.tag,
        momento: m.etiqueta,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        valor: +punto.valor.toFixed(meta.decimales),
        exacto: false,
        marcaDeTiempo: horaLocalDe(punto.t),
        nota:
          'Es el valor vigente en ese instante, reconstruido por el historiador entre las dos ' +
          'muestras que lo rodean. Cítalo como el valor de ese momento; no lo llames mínimo, ' +
          'máximo ni promedio, que son de un tramo y esto es un punto.',
        ...(UMBRALES[clave] ? { banda: bandaLegible(UMBRALES[clave]) } : {}),
        ...(meta.nota ? { nota2: meta.nota } : {}),
        ...avisoDeUmbrales(),
      }
    },

    /**
     * La misma señal en dos períodos, con su diferencia.
     *
     * La diferencia se calcula AQUÍ. Es la misma regla que ya regía con el OEE:
     * pedirle al modelo que reste dos números es pedirle aritmética, y una
     * resta mal hecha en la frase final estropea una consulta que salió bien.
     */
    async comparar_periodos({ senal, periodoA, periodoB } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })

      const [a, b] = await Promise.all([
        herramientas.historia_de_senal({ senal, periodo: periodoA }),
        herramientas.historia_de_senal({ senal, periodo: periodoB }),
      ])

      if (!a.ok) return a
      if (!b.ok) return b

      const meta = senalInfo(clave)

      return {
        ok: true,
        senal: meta.label,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        // Las claves son las etiquetas YA resueltas, para que el modelo redacte
        // con el período real y no con el «ayer» que escribió él.
        [a.periodo]: a,
        [b.periodo]: b,
        diferencia: {
          promedio: resta(b.promedio, a.promedio),
          minimo: resta(b.minimo, a.minimo),
          maximo: resta(b.maximo, a.maximo),
        },
        nota:
          `La diferencia es «${b.periodo}» menos «${a.periodo}». Un valor negativo significa que ` +
          `el segundo período fue más bajo.`,
        ...avisoDeUmbrales(),
      }
    },

    /**
     * Enciende o apaga la bomba escribiendo en `ac:TDCON/DEMO/SENSORES/CONTROL`.
     *
     * La única función de este archivo que escribe. Dos guardas, en orden: ver
     * la cabecera del archivo. La del nivel sólo se aplica al ENCENDIDO — apagar
     * la bomba nunca puede desbordar el tanque, así que no se retrasa.
     */
    async controlar_bomba({ encender } = {}) {
      if (typeof encender !== 'boolean') {
        return fallo('Falta decir si hay que encender (true) o apagar (false) la bomba.')
      }

      if (readOnly) {
        return fallo(
          'El puente ICONICS está en modo solo lectura (ICONICS_READ_ONLY=true), así que no puedo ' +
            'escribir en la instalación. Dile al operador que para habilitar el control tiene que ' +
            'arrancar el servidor con ICONICS_READ_ONLY=false.'
        )
      }

      if (encender) {
        const lectura = await leerMaquina(SISTEMA.tanque)
        if (!lectura.ok) {
          return fallo(
            `No puedo comprobar el nivel del tanque antes de encender la bomba, así que no la ` +
              `enciendo: ${lectura.error}`
          )
        }

        const nivel = lectura.estado.dominio.senales?.nivelTanque?.valor
        const u = UMBRALES.nivelTanque
        if (typeof nivel !== 'number' || !Number.isFinite(nivel)) {
          return fallo(
            'No hay una lectura válida del nivel del tanque ahora mismo, así que no enciendo la ' +
              'bomba: encenderla a ciegas podría desbordarlo.'
          )
        }
        if (u && typeof u.avisoMax === 'number' && nivel >= u.avisoMax) {
          return fallo(
            `No enciendo la bomba: el tanque está al ${redondear(nivel, 1)} %, por encima del ` +
              `${u.avisoMax} % de aviso. Encenderla ahora arriesga desbordarlo. Espera a que baje ` +
              `el nivel o dile al operador que lo revise antes de forzarlo.`,
            { nivelTanque: redondear(nivel, 1), avisoSuperior: u.avisoMax }
          )
        }
      }

      const r = await client.writePoint(TAG_CONTROL_BOMBA, encender)
      if (!r?.ok) {
        return fallo(
          `El servidor ICONICS no aceptó la escritura sobre la bomba: ${r?.error ?? 'error del servidor'}.`
        )
      }

      /*
       * El servidor puede responder `ok: true` a la escritura sin que el punto
       * cambie de verdad todavía. `CONTROL` es una fuente en tiempo real que el
       * motor de ICONICS escanea cada ~1 s (ver `Scan rate` del tag), así que
       * una relectura inmediata puede devolver el valor anterior aunque la
       * escritura sí vaya a tomar efecto en el siguiente ciclo. Se reintenta
       * unas pocas veces con una espera corta antes de dar la escritura por
       * sin efecto — confirmar sólo porque la petición HTTP no dio error sería
       * prestarle al servidor una ejecución que no ha demostrado.
       */
      let valorLeido = null
      let relecturaOk = false
      for (let intento = 0; intento < INTENTOS_RELECTURA_CONTROL; intento++) {
        if (intento > 0) await esperar(ESPERA_RELECTURA_CONTROL_MS)
        const relectura = await client.readPoint(TAG_CONTROL_BOMBA)
        relecturaOk = Boolean(relectura?.ok)
        valorLeido = toBooleano(relectura?.payload?.value ?? relectura?.payload?.Value ?? null)
        if (relecturaOk && valorLeido === encender) break
      }

      if (!relecturaOk || valorLeido === null || valorLeido !== encender) {
        return fallo(
          `Mandé la orden de ${encender ? 'encender' : 'apagar'} la bomba y el servidor la aceptó, ` +
            `pero al releer ${TAG_CONTROL_BOMBA} sigue valiendo ${valorLeido ?? 'sin dato'} en vez de ` +
            `${encender}. La escritura no ha tenido efecto real sobre la instalación: dile al usuario ` +
            `que la orden no se aplicó y que hay que revisar la configuración de ese punto en el ` +
            `servidor ICONICS, no reintentarlo tal cual.`,
          { valorEscrito: encender, valorLeido }
        )
      }

      return {
        ok: true,
        accion: encender ? 'encendida' : 'apagada',
        tag: TAG_CONTROL_BOMBA,
      }
    },

    /**
     * Análisis estadístico y proyección de una señal.
     */
    async analisis_de_senal({ senal, periodo, horizonteMinutos = 60 } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })
      const meta = senalInfo(clave)

      if (!esHistorizada(clave)) {
        return fallo(
          `${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE}`
        )
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const serie = await leerSerie(clave, v)
      if (!serie.ok) {
        if (serie.status >= 502) {
          return fallo(
            'No se pudo contactar con el servidor ICONICS para leer el historiador.'
          )
        }
        return fallo(`El historiador no devolvió la serie de ${meta.label} en ${v.etiqueta}.`)
      }

      const validos = serie.datos.filter(d => typeof d.valor === 'number')
      if (validos.length < 3) {
        return fallo(
          `Hay ${validos.length} muestra(s) de ${meta.label} en ${v.etiqueta}: no son ` +
            `suficientes para un análisis estadístico. Hacen falta al menos 3.`
        )
      }

      const stats = estadisticasBasicas(validos.map(d => d.valor), meta.decimales)
      const regresion = regresionLineal(validos)
      const proyeccion = regresion ? proyectar(regresion, horizonteMinutos, meta.decimales) : null
      const anomalias = detectarAnomalias(validos, { media: stats.media, desv: stats.desv })

      return {
        ok: true,
        senal: meta.label,
        periodo: v.etiqueta,
        unidad: meta.unidad || null,
        estadisticas: stats,
        tendencia: calcularTendencia(validos),
        proyeccion: proyeccion
          ? {
              horizonteMinutos,
              valorEstimado: proyeccion.valor,
              rangoEsperado: [proyeccion.valorMin, proyeccion.valorMax],
              aviso:
                'Proyección lineal simple a partir de la tendencia reciente, con un margen ' +
                'del 95%. No es una predicción garantizada ni sustituye una alarma.',
            }
          : null,
        anomalias: anomalias.length ? anomalias : undefined,
        ...(meta.soloEnMarcha
          ? {
              avisoReposo:
                'Esta señal sólo significa algo con la instalación impulsando; si hubo tramos ' +
                'en reposo, la tendencia puede reflejar eso y no un cambio real.',
            }
          : {}),
      }
    },

    /**
     * Qué es NORMAL para una señal, medido sobre semanas de historia.
     *
     * ── EL PROBLEMA QUE RESUELVE ───────────────────────────────────────
     *
     * Las demás herramientas juzgan contra `UMBRALES`, que son suposiciones
     * nuestras y siguen sin confirmar (ver `shared/eva/umbrales.js`). Medido
     * contra la instalación real en agosto de 2026, esas suposiciones no se
     * parecen a esta planta: la banda de la temperatura es veinte veces más
     * ancha que su variación real, la del caudal está en una escala diez veces
     * mayor, y la presión relativa vive ENTERA por debajo de su «mínimo
     * crítico». Sobre bandas así, «está en banda» no informa de nada.
     *
     * Esta herramienta no supone: mide. Dice dónde ha vivido la señal, cuánto
     * ha variado y qué percentiles ocupa, y sitúa el valor de AHORA dentro de
     * esa distribución. «La presión está en 0,9 y eso es más alta que el 97 %
     * de las lecturas del último mes» es una frase accionable; «la presión
     * está fuera de límite» contra un límite inventado no lo es.
     *
     * ── POR QUÉ ES LA BASE DE LO PREDICTIVO ────────────────────────────
     *
     * Una tendencia sin línea base no predice: `analisis_de_senal` dice que el
     * nivel sube 2 puntos por hora, pero no si eso es lo de siempre a esta
     * hora o algo que no había pasado nunca. Con el perfil delante, el modelo
     * puede decir cuál de las dos cosas es.
     */
    async perfil_de_senal({ senal, dias = 14 } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })
      const meta = senalInfo(clave)

      if (!esHistorizada(clave)) {
        return fallo(
          `${meta.label} no tiene serie histórica propia, así que no se puede perfilar. ` +
            `${SIN_SERIE} Su valor actual sí se puede dar con estado_del_sistema.`,
          { senalesConHistoria: historizadas().map(k => SENALES[k].label) }
        )
      }

      const cuantos = Math.max(1, Math.min(MAX_DIAS_PERFIL, Math.round(Number(dias) || 14)))
      const { muestras, diasLeidos } = await leerHistoriaLarga(clave, cuantos)

      const valores = muestras
        .filter(m => typeof m.valor === 'number' && Number.isFinite(m.valor))
        .map(m => m.valor)

      if (valores.length < MIN_MUESTRAS_PERFIL) {
        return fallo(
          `Sólo hay ${valores.length} muestras de ${meta.label} en ${cuantos} días ` +
            `(${diasLeidos} de ${cuantos} días respondieron). Hacen falta al menos ` +
            `${MIN_MUESTRAS_PERFIL} para decir qué es normal. El historiador guarda muy poco de ` +
            `esta señal, o el período pedido cae fuera de lo que conserva.`
        )
      }

      const orden = [...valores].sort((a, b) => a - b)
      const stats = estadisticasBasicas(valores, meta.decimales)
      const p = (q) => redondear(percentil(orden, q), meta.decimales)

      // El valor de ahora, para situarlo dentro de la distribución. Es lo que
      // convierte el perfil en una respuesta y no en una tabla.
      // `sistema.senales` es un objeto indexado POR CLAVE, no un array: la
      // lista plana es `sistema.lista`. Buscarlo con `.find` devolvía siempre
      // `undefined` y el perfil salía sin el dato de ahora, que es justo lo que
      // convierte la tabla de percentiles en una respuesta.
      const lectura = await leerMaquina(SISTEMA.tanque)
      const actual = lectura.ok ? lectura.estado.dominio.senales[clave]?.valor ?? null : null

      /*
       * Cuántas lecturas hubo POR DEBAJO del valor actual, en tanto por ciento.
       *
       * Es la cifra que de verdad responde «¿esto es raro?». Un 50 significa
       * que está justo en lo habitual; un 99, que sólo una de cada cien
       * lecturas del período fue tan alta.
       */
      const posicion = typeof actual === 'number'
        ? Math.round(100 * orden.filter(v => v < actual).length / orden.length)
        : null

      const ceros = valores.filter(v => Math.abs(v) < 1e-9).length

      return {
        ok: true,
        senal: meta.label,
        unidad: meta.unidad || null,
        fuente: 'historiador',
        periodo: `los últimos ${cuantos} días`,
        diasConDatos: diasLeidos,
        muestras: valores.length,

        rangoObservado: { minimo: redondear(orden[0], meta.decimales), maximo: redondear(orden.at(-1), meta.decimales) },
        estadisticas: stats,
        /*
         * Percentiles y no «media ± desviación».
         *
         * Estas señales no se distribuyen como una campana: el caudal está a
         * cero el 15 % del tiempo y el nivel vive clavado en 50 con subidas
         * ocasionales al 100. Sobre eso, «media ± 2 desviaciones» produce
         * límites que no existen —incluido un caudal negativo— mientras que un
         * percentil siempre cae sobre una lectura que de verdad ocurrió.
         */
        percentiles: { p1: p(0.01), p5: p(0.05), p25: p(0.25), p50: p(0.5), p75: p(0.75), p95: p(0.95), p99: p(0.99) },

        ...(ceros
          ? {
            aCero: `${Math.round(100 * ceros / valores.length)} % de las lecturas fueron exactamente 0` +
              (meta.soloEnMarcha ? ', que en esta señal es la instalación en reposo.' : '.'),
          }
          : {}),

        ...(typeof actual === 'number'
          ? {
            valorActual: redondear(actual, meta.decimales),
            posicionDelActual:
                `El valor de ahora es más alto que el ${posicion} % de las lecturas del período.`,
          }
          : { valorActual: null }),

        /*
         * Se compara la banda inventada contra lo observado, y se dice cuando
         * no cuadran.
         *
         * Es la forma de que el desajuste salga a la luz por sí solo en vez de
         * quedarse en un comentario de código: si la instalación pasa la mitad
         * del tiempo fuera de su «banda normal», el problema es la banda.
         */
        ...(UMBRALES[clave] ? comparacionConLaBanda(clave, orden) : {}),

        /*
         * El aviso que evita el error de lectura más probable de esta
         * herramienta, y que se vio en la primera prueba contra el servidor
         * real: la presión marcaba 5,66 y el perfil de 14 días topaba en 1,05,
         * así que salía «más alta que el 100 % de las lecturas» — cierto, y
         * engañoso. La instalación estaba bombeando en ese momento y llevaba
         * dos semanas parada casi siempre, de modo que el percentil describía
         * el reposo, no la marcha.
         *
         * Sin esta advertencia, el modelo redacta «valor nunca visto» y manda a
         * alguien a revisar una bomba que está funcionando como debe.
         */
        ...(meta.soloEnMarcha
          ? {
            avisoReposo:
                'Esta señal sólo significa algo con la instalación impulsando, y la instalación ' +
                'está parada la mayor parte del tiempo. El perfil mezcla las dos situaciones, así ' +
                'que los percentiles describen sobre todo el reposo: un valor por encima del p95 ' +
                'puede ser simplemente que ahora está bombeando y antes no. NO lo cuentes como ' +
                'anomalía sin comprobar antes, con estado_del_sistema, si el sistema está en marcha.',
          }
          : {}),

        aviso:
          'Este perfil es lo que la instalación ha hecho de verdad, medido del historiador. No ' +
          'dice qué es correcto, dice qué es habitual: si la instalación lleva semanas ' +
          'funcionando mal, lo anómalo aquí sería lo bueno.',
      }
    },

    /**
     * Varias señales sobre la MISMA ventana, con su correlación y sus
     * coincidencias en el tiempo.
     *
     * ── PARA QUÉ EXISTE ────────────────────────────────────────────────
     *
     * Es la herramienta del diagnóstico. «¿Por qué se paró la bomba?» no se
     * responde con una señal: se responde viendo que la tensión de línea se
     * hundió a las 14:32 y que la carga del motor cayó a cero justo después.
     * Con `historia_de_senal` eso exigía dos consultas y que el modelo cruzara
     * las horas de cabeza — y cruzar horas de cabeza es aritmética, que es
     * justo lo que tiene prohibido hacer.
     *
     * ── LO QUE ESTA HERRAMIENTA NO DICE ────────────────────────────────
     *
     * No dice cuál causó cuál. Devuelve el coeficiente, las anomalías de cada
     * señal con su hora, y qué anomalías cayeron cerca en el tiempo. Que dos
     * cosas pasen juntas es un indicio; el aviso que viaja en la respuesta lo
     * dice con esas palabras para que el modelo no lo convierta en una
     * afirmación causal al redactar.
     */
    async correlacionar_senales({ senales, periodo } = {}) {
      /*
       * Se acepta lista o cadena separada por comas.
       *
       * Medido con el 4B: pide un array de strings unas veces y una cadena
       * «nivel, presión» otras, con el mismo esquema delante. Rechazar la
       * cadena costaría una ronda entera de 30 segundos para corregir algo que
       * se entiende perfectamente.
       */
      const lista = Array.isArray(senales)
        ? senales
        : String(senales ?? '').split(/[,;]|\by\b/).map(s => s.trim()).filter(Boolean)

      if (lista.length < 2) {
        return fallo(
          'Para correlacionar hacen falta al menos DOS señales. Dime cuáles quieres comparar.',
          { senalesConHistoria: historizadas().map(k => SENALES[k].label) }
        )
      }

      /* Se resuelven todas antes de salir a la red: si una no existe o no tiene
         historia, decirlo ahora ahorra las lecturas de las demás. */
      const claves = []
      for (const nombre of lista) {
        const clave = resolverSenal(nombre)
        if (!clave) return senalDesconocida(nombre, { paraHistoria: true })
        if (!esHistorizada(clave)) {
          return fallo(
            `${senalInfo(clave).label} no tiene serie histórica propia, así que no se puede ` +
              `correlacionar. ${SIN_SERIE}`,
            { senalesConHistoria: historizadas().map(k => SENALES[k].label) }
          )
        }
        if (!claves.includes(clave)) claves.push(clave)
      }

      if (claves.length < 2) {
        return fallo('Las señales que has dado son la misma. Dime dos distintas para comparar.')
      }
      if (claves.length > 4) {
        // Sólo hay cuatro señales historizadas; más que eso es que algo se
        // repitió. El tope existe para que el resultado quepa en el contexto:
        // cuatro señales ya son seis pares.
        return fallo('Como mucho cuatro señales a la vez.')
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const series = await Promise.all(claves.map(clave => leerSerie(clave, v)))

      const fallidas = claves.filter((_, i) => !series[i].ok)
      if (fallidas.length) {
        return fallo(
          `El historiador no devolvió la serie de ${fallidas.map(k => senalInfo(k).label).join(' y ')} ` +
            `en ${v.etiqueta}.`
        )
      }

      /*
       * Tolerancia de emparejamiento: media distancia entre muestras.
       *
       * Se deriva de la ventana y no es fija porque el intervalo lo fija
       * `leerSerie` en función de lo que se pida —15 min en una ventana corta,
       * más en una larga—. Una tolerancia fija de un minuto no emparejaría nada
       * en una ventana de una semana; una de una hora emparejaría muestras
       * sin relación en una de treinta minutos.
       */
      const segundosVentana = (v.fin - v.inicio) / 1000
      const puntosEsperados = Math.max(2, Math.min(MAX_PUNTOS, Math.round(segundosVentana / 900)))
      const toleranciaMs = (segundosVentana / puntosEsperados) * 1000 * 0.5

      /* ── Cada señal por separado: resumen y anomalías ───────────────── */
      const porSenal = claves.map((clave, i) => {
        const meta = senalInfo(clave)
        const validos = series[i].datos.filter(d => typeof d.valor === 'number')
        const stats = validos.length >= 2
          ? estadisticasBasicas(validos.map(d => d.valor), meta.decimales)
          : null

        return {
          clave,
          meta,
          datos: series[i].datos,
          senal: meta.label,
          unidad: meta.unidad || null,
          muestras: validos.length,
          ...(stats ? { estadisticas: stats } : {}),
          anomalias: stats?.desv
            ? detectarAnomalias(validos, { media: stats.media, desv: stats.desv })
                .map(a => ({ hora: horaLocal(a.hora), valor: a.valor, z: a.z }))
            : [],
        }
      })

      const pobres = porSenal.filter(s => s.muestras < 3)
      if (pobres.length) {
        return fallo(
          `No hay muestras suficientes de ${pobres.map(s => s.senal).join(' y ')} en ` +
            `${v.etiqueta} para correlacionar: hacen falta al menos 3 de cada una.`
        )
      }

      /* ── Cada par: correlación sobre instantes alineados ────────────── */
      const pares = []
      for (let i = 0; i < porSenal.length; i++) {
        for (let j = i + 1; j < porSenal.length; j++) {
          const { xs, ys } = alinearSeries(porSenal[i].datos, porSenal[j].datos, toleranciaMs)
          const r = correlacionPearson(xs, ys)

          pares.push({
            entre: `${porSenal[i].senal} y ${porSenal[j].senal}`,
            muestrasComparadas: xs.length,
            ...(xs.length < 3
              ? {
                relacion:
                    'no se puede calcular: las dos señales no tienen muestras en los mismos ' +
                    'instantes dentro de esta ventana',
              }
              : {
                coeficiente: r === null ? null : +r.toFixed(2),
                relacion: describirCorrelacion(r),
              }),
          })
        }
      }

      /* ── Anomalías que cayeron juntas ───────────────────────────────── */
      const coincidencias = []
      for (let i = 0; i < porSenal.length; i++) {
        for (let j = i + 1; j < porSenal.length; j++) {
          for (const a of porSenal[i].anomalias) {
            for (const b of porSenal[j].anomalias) {
              // Se comparan las horas ya formateadas a HH:MM:SS, que es la
              // resolución con la que se van a citar de todos modos.
              const distancia = Math.abs(segundosDeHora(a.hora) - segundosDeHora(b.hora))
              if (distancia * 1000 <= toleranciaMs * 2) {
                coincidencias.push({
                  hora: a.hora,
                  descripcion:
                    `${porSenal[i].senal} marcó ${a.valor} y ${porSenal[j].senal} marcó ` +
                    `${b.valor} casi en el mismo instante; las dos son valores atípicos para ` +
                    `esta ventana.`,
                })
              }
            }
          }
        }
      }

      return {
        ok: true,
        periodo: v.etiqueta,
        fuente: 'historiador',
        senales: porSenal.map(({ clave, meta, datos, ...resto }) => resto),
        correlaciones: pares,
        /*
         * Se recortan a seis, y se dice cuántas quedaron fuera.
         *
         * Un solo evento de treinta segundos produce una anomalía por muestra
         * de cada señal, y cruzarlas da decenas de coincidencias que describen
         * el MISMO suceso. Mandárselas todas al modelo no añade información:
         * llena el contexto y le invita a contar «hubo 28 anomalías» de algo
         * que fue una sola caída de presión. Seis bastan para situarlo en el
         * tiempo, y el recuento real va aparte para no ocultar nada.
         */
        ...(coincidencias.length
          ? {
            anomaliasSimultaneas: coincidencias.slice(0, 6),
            ...(coincidencias.length > 6
              ? {
                notaCoincidencias:
                      `Hay ${coincidencias.length} pares de valores atípicos simultáneos en ` +
                      `total; arriba van los primeros 6. Suelen ser el mismo suceso repetido ` +
                      `muestra a muestra, así que descríbelo como UN episodio y no como ` +
                      `${coincidencias.length} incidencias distintas.`,
              }
              : {}),
          }
          : {
            anomaliasSimultaneas:
                'Ninguna. No hubo valores atípicos de dos señales distintas en el mismo instante.',
          }),
        /*
         * Éste SÍ es un `aviso`: tiene que llegar al operador aunque el modelo
         * se olvide de contarlo, porque es la diferencia entre un indicio y un
         * diagnóstico, y sobre él se decide si se va a abrir una máquina.
         *
         * Por eso está redactado para que se lea BIEN pegado al final de la
         * respuesta, sin imperativos dirigidos al modelo. La versión anterior
         * decía «Dilo así al redactar», y cuando la red de seguridad lo añadía
         * el operador leía una orden dada a otro.
         */
        aviso:
          'Que dos señales se muevan juntas es un indicio de que algo las relaciona, no una ' +
          'prueba de que una cause la otra: puede haber una tercera causa común, o ser ' +
          'casualidad en una ventana corta. Correlación no es causa.',
        ...avisoDeUmbrales(),
      }
    },

    /**
     * Gráfico de una señal. La serie es real, no generada.
     *
     * ── LA IMAGEN NO ENTRA EN EL CONTEXTO DEL MODELO ───────────────────
     *
     * Viaja bajo `_adjunto`, y el guion bajo es el contrato: `chat.mjs` saca
     * esas claves del resultado ANTES de meterlo en los mensajes y las emite
     * por su propio evento SSE hacia la pantalla.
     *
     * Sin eso, el dibujo entero —decenas de miles de caracteres— se le
     * entregaba al modelo como texto de la herramienta. Con 512 tokens de
     * presupuesto y un contexto de 4k, eso no es una ineficiencia: desborda la
     * ventana, expulsa las instrucciones y el dato que había que contar, y el
     * modelo redacta sobre lo que quedó. Un gráfico correcto acompañado de una
     * frase equivocada.
     *
     * Al modelo se le manda en su lugar el RESUMEN de la serie: es lo que
     * necesita para escribir («subió de 41 a 63 entre las 8 y las 11») y no
     * puede describir de memoria una imagen que nunca ve.
     */
    async grafico_de_senal({ senal, periodo } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })
      const meta = senalInfo(clave)

      if (!esHistorizada(clave)) {
        return fallo(`${meta.label} no tiene serie histórica propia en este servidor. ${SIN_SERIE}`)
      }

      const v = resolverVentana(periodo, { turnos })
      if (v.error) return fallo(v.error)

      const serie = await leerSerie(clave, v)
      if (!serie.ok) {
        return fallo(`El historiador no devolvió la serie de ${meta.label} en ${v.etiqueta}.`)
      }
      if (!serie.datos.length) {
        return fallo(`No hay muestras de ${meta.label} en ${v.etiqueta} para dibujar.`)
      }

      let svg
      try {
        svg = renderizarGraficoSerie(serie.datos, {
          titulo: meta.label,
          unidad: meta.unidad || null,
          banda: UMBRALES[clave] ? bandaLegible(UMBRALES[clave]) : null,
        })
      } catch (error) {
        // El caso conocido es una sola muestra válida en la ventana. Se cuenta
        // como lo que es —no hay con qué dibujar— y no como una avería.
        return fallo(
          `No se pudo dibujar ${meta.label} en ${v.etiqueta}: ${error.message} ` +
            `Su resumen numérico sí se puede dar con historia_de_senal.`
        )
      }

      const resumen = resumirSerie(serie.datos, meta.decimales, serie.ventana)

      /*
       * Tendencia y anomalías, calculadas aquí y no adivinadas por el modelo.
       *
       * Antes el `nota` de abajo le pedía al modelo que INTERPRETARA la curva
       * a partir de mínimo/máximo/promedio — y con un 9B eso, medido, seguía
       * saliendo como una lista de cifras reformulada, no una lectura real.
       * `calcularTendencia` (misma función que usa `analisis_de_senal`) le da
       * un veredicto YA calculado —sube, baja o está estable, con su propio
       * aviso de fiabilidad— para que el modelo lo cite en vez de inferirlo.
       */
      const valores = serie.datos.filter(d => typeof d.valor === 'number').map(d => d.valor)
      const stats = estadisticasBasicas(valores, meta.decimales)
      const tendencia = calcularTendencia(serie.datos)
      const anomalias = detectarAnomalias(serie.datos, { media: stats.media, desv: stats.desv })

      return {
        ok: true,
        senal: meta.label,
        periodo: v.etiqueta,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        // El resumen, para que el modelo pueda hablar de la curva que no ve.
        ...(resumen ?? {}),
        ...(serie.truncada ? { avisoTruncada: AVISO_TRUNCADA } : {}),
        tendencia,
        anomalias: anomalias.length ? anomalias : undefined,
        graficoEntregado: true,
        nota:
          'El gráfico ya se le ha enviado a la pantalla del usuario; no hace falta que lo ' +
          'describas punto por punto ni repitas mínimo/máximo/promedio como una lista. Usa ' +
          '"tendencia.direccion" para decir si sube, baja o se mantiene estable —cita ' +
          '"tendencia.nota" si el ajuste es poco fiable, en vez de sonar más seguro de lo que el ' +
          'dato permite—; si "anomalias" trae algo, son los puntos que más se apartaron de lo ' +
          'habitual y merece la pena señalarlos con su hora. No inventes una tendencia, un ciclo o ' +
          'una causa que estos campos no sostengan.',
        _adjunto: { tipo: 'grafico', formato: 'svg', contenido: svg, titulo: meta.label },
      }
    },

    /**
     * Reporte PDF de la instalación: gráficos de las señales con historia,
     * tabla de valores actuales de las demás (Plan 14 Fase 5).
     *
     * ── MISMO CONTRATO QUE grafico_de_senal, CON UN ENLACE EN VEZ DE UNA IMAGEN ──
     *
     * El PDF nunca viaja al modelo, ni siquiera como adjunto binario: viaja
     * un ENLACE (`_adjunto.url`), porque a diferencia del SVG del gráfico —que
     * la pantalla pinta inline— el reporte es un archivo que se descarga.
     * `GET /api/reportes` lo sirve por separado. Ninguna cifra del PDF la
     * escribe el modelo: las compone este archivo con datos reales del
     * historiador, igual que hace `grafico_de_senal`.
     *
     * ── DOS EXPLICACIONES, NO UNA (feedback: "el PDF no traía explicación") ──
     *
     * El PDF se cierra y se guarda ANTES de que el modelo escriba una sola
     * palabra —es una única llamada síncrona—, así que una explicación que
     * dependiera SÓLO de que el modelo se acuerde de dársela saldría del PDF
     * la mayoría de las veces. Por eso cada gráfico lleva una `interpretacion`
     * que compone el propio backend con `describirTendencia` (garantizada,
     * siempre igual para los mismos datos, igual que `describirCorrelacion`).
     * El parámetro `explicacion` es la SEGUNDA capa, opcional: si el usuario
     * pide explícitamente que se comente el reporte, el modelo puede mirar
     * antes la tendencia de la señal principal (con `grafico_de_senal` o
     * `analisis_de_senal`) y pasar aquí su propio comentario, que se imprime
     * aparte y con su procedencia dicha, nunca mezclado con las cifras.
     */
    async generar_reporte({ senales, periodo, explicacion } = {}) {
      const v = resolverVentana(periodo, { turnos, maxHoras: MAX_DIAS_REPORTE * 24 })
      if (v.error) return fallo(v.error)

      let claves
      const desconocidas = []
      if (senales && senales.length) {
        claves = []
        for (const nombre of senales) {
          const clave = resolverSenal(nombre)
          if (clave) claves.push(clave)
          else desconocidas.push(nombre)
        }
        if (!claves.length) {
          return fallo(
            `Ninguna de las señales pedidas se reconoce: ${desconocidas.join(', ')}. El catálogo ` +
              'está en tus instrucciones.'
          )
        }
      } else {
        claves = [...SENAL_KEYS]
      }

      const historizadasPedidas = claves.filter(esHistorizada)
      const sinHistoriaPedidas = claves.filter(c => !esHistorizada(c))
      const notas = []

      const graficos = historizadasPedidas.length
        ? await Promise.all(
          historizadasPedidas.map(async clave => {
            const meta = senalInfo(clave)
            const { muestras, diasLeidos, diasTotal } = await leerSerieEnRango(clave, v)

            if (!muestras.length) {
              return {
                titulo: meta.label,
                unidad: meta.unidad || null,
                svg: null,
                resumen: null,
                nota: `Sin muestras de ${meta.label} en ${v.etiqueta}.`,
              }
            }

            let svg
            try {
              // Downsample SÓLO para el dibujo: un trimestre son miles de
              // muestras (~100/día × hasta 90 días) apretadas en 640 px de
              // ancho, que sin esto se ven como un bloque sólido en vez de
              // una curva. El
              // resumen numérico de abajo sigue viniendo de `muestras`
              // completo, sin downsamplear — los extremos reales no se
              // pierden, sólo se suaviza el dibujo.
              svg = renderizarGraficoSerie(downsamplear(muestras, PUNTOS_GRAFICO_REPORTE), {
                titulo: meta.label,
                unidad: meta.unidad || null,
                banda: UMBRALES[clave] ? bandaLegible(UMBRALES[clave]) : null,
              })
            } catch (error) {
              return {
                titulo: meta.label,
                unidad: meta.unidad || null,
                svg: null,
                resumen: null,
                nota: `No se pudo dibujar ${meta.label}: ${error.message}`,
              }
            }

            if (diasLeidos < diasTotal) {
              notas.push(
                `${meta.label}: sólo se pudieron leer ${diasLeidos} de ${diasTotal} días del historiador.`
              )
            }

            // Sobre la serie COMPLETA, no la downsampleada: la tendencia real
            // no debe depender de cuántos puntos entraron en el dibujo.
            // Mismo cálculo que `grafico_de_senal`.
            const tendencia = calcularTendencia(muestras)

            return {
              titulo: meta.label,
              unidad: meta.unidad || null,
              svg,
              resumen: resumirSerie(muestras, meta.decimales),
              tendencia,
              // La explicación GARANTIZADA del PDF — ver la cabecera de
              // `generar_reporte`. No depende de que el modelo la pida.
              interpretacion: describirTendencia(tendencia, meta.unidad),
              nota: null,
            }
          })
        )
        : []

      let tablaActual = []
      if (sinHistoriaPedidas.length) {
        const estado = await herramientas.estado_del_sistema()
        if (estado.ok) {
          const todas = estado.activos.flatMap(a => a.senales)
          tablaActual = sinHistoriaPedidas.map(clave => {
            const meta = senalInfo(clave)
            const s = todas.find(x => x.clave === clave)
            return s
              ? { senal: s.senal, valor: s.valor, unidad: s.unidad, estado: s.estado }
              : { senal: meta.label, valor: null, unidad: meta.unidad || null, estado: 'sin dato' }
          })
        } else {
          notas.push('No se pudo leer el valor actual de las señales sin historia.')
        }
      }

      if (desconocidas.length) {
        notas.push(`No se reconocieron estas señales y se omitieron: ${desconocidas.join(', ')}.`)
      }
      if (sinHistoriaPedidas.length) {
        notas.push(
          `${sinHistoriaPedidas.length} de las ${claves.length} señales pedidas no tienen serie ` +
            'histórica en este servidor; van con su valor actual, sin gráfico.'
        )
      }

      // Carga perezosa DENTRO de la herramienta, nunca en la cabecera del
      // módulo: si pdfkit no está instalado, esto falla y se captura aquí sin
      // tumbar el backend. Ver la cabecera de `reporte.mjs`.
      let reporteMod
      try {
        reporteMod = await import('./reporte.mjs')
      } catch (error) {
        return fallo(
          'Los reportes PDF no están disponibles ahora mismo: falta instalar las dependencias del ' +
            `backend. El resto del asistente sigue funcionando. (${error.message})`
        )
      }

      if (!reportes?.dir) {
        return fallo('Los reportes PDF no están configurados en este servidor.')
      }

      const pdf = await reporteMod.componerReportePdf({
        instalacion: 'Sistema de agua industrial',
        periodo: v.etiqueta,
        generadoEl: horaLocal(new Date().toISOString()),
        graficos,
        tablaActual,
        notas,
        // Comentario del MODELO, opcional y aparte de `interpretacion` (que
        // pone el propio backend en cada gráfico). Se imprime con su
        // procedencia dicha — ver `reporte.mjs` — para no mezclar lo medido
        // con lo que el modelo opina.
        explicacion: typeof explicacion === 'string' && explicacion.trim() ? explicacion.trim() : null,
      })

      const id = randomUUID()
      await mkdir(reportes.dir, { recursive: true })
      await purgarReportesViejos(reportes.dir, reportes.maxDias)
      await writeFile(join(reportes.dir, `${id}.pdf`), pdf)

      return {
        ok: true,
        instalacion: 'Sistema de agua industrial',
        periodo: v.etiqueta,
        senalesConGrafico: historizadasPedidas.map(c => senalInfo(c).label),
        senalesEnTabla: sinHistoriaPedidas.map(c => senalInfo(c).label),
        ...(notas.length ? { notas } : {}),
        nota:
          'El reporte ya se ha generado y el enlace de descarga se le ha entregado al usuario; no ' +
          'hace falta que describas el PDF punto por punto, sólo confirma qué trae. Cada gráfico del ' +
          'PDF YA incluye su propia interpretación de la tendencia, generada por el sistema — no ' +
          'digas que el reporte "no trae explicación".',
        _adjunto: {
          tipo: 'reporte',
          formato: 'pdf',
          url: `/api/reportes?id=${id}`,
          titulo: `Reporte — ${v.etiqueta}`,
        },
      }
    },

    /**
     * Busca en la documentación de planta.
     *
     * ── POR QUÉ VIAJA LA RELEVANCIA ────────────────────────────────────
     *
     * Porque BM25 SIEMPRE devuelve algo si alguna palabra coincide, y ese algo
     * puede no responder la pregunta. Sin el número, el modelo trata igual el
     * fragmento que encaja exactamente y el que sólo comparte la palabra
     * «presión» con un manual entero sobre presión. Con él —y con la
     * instrucción de abajo— puede decir que no lo encontró, que es la respuesta
     * correcta cuando no está documentado.
     */
    async consultar_documentacion({ pregunta } = {}) {
      if (!indiceDocumentos) {
        return fallo(
          'Este servidor no tiene documentación de planta cargada (falta la variable ' +
            'IA_DOCS_DIR). No puedo consultar manuales: dilo así y no contestes de memoria.'
        )
      }
      if (!pregunta || !pregunta.trim()) {
        return fallo('Necesito saber sobre qué quieres consultar en la documentación.')
      }

      const resultados = await indiceDocumentos.buscar(pregunta, { top: 3 })

      if (!resultados.length) {
        const estado = indiceDocumentos.estado()
        // Qué documentos SÍ hay viaja en el error a propósito: «no lo encontré»
        // a secas deja al operador sin saber si el manual no está cargado o si
        // está y no lo dice. Son dos problemas con arreglos distintos.
        return fallo(
          'No he encontrado nada sobre eso en la documentación cargada. Puede que no esté ' +
            'documentado, o que el manual lo llame de otra forma.',
          {
            documentosDisponibles: estado.documentos.map(d => d.archivo),
            ...(estado.ilegibles.length ? { noSePudieronLeer: estado.ilegibles } : {}),
          }
        )
      }

      return {
        ok: true,
        fragmentos: resultados.map(r => ({
          documento: r.archivo,
          pagina: r.pagina,
          texto: r.texto,
          relevancia: +r.score.toFixed(2),
        })),
        /*
         * `comoRedactar` y NO `aviso`, y la diferencia importa.
         *
         * `aviso` es el campo que `chat.mjs` vigila para PEGARLO detrás de la
         * respuesta cuando el modelo no lo cuenta. Ese mecanismo existe para
         * las advertencias que el operador tiene que leer sí o sí —que los
         * umbrales son estimaciones nuestras—, y aquí no aplica: esto es una
         * instrucción de estilo para el modelo.
         *
         * Con la clave `aviso` se veía en pantalla, literal, debajo de una
         * respuesta correcta: «Cita el documento y la página… La relevancia va
         * de 0 a 1…». Al operador eso no le dice nada y le hace desconfiar de
         * la respuesta. Cualquier clave que no sea `aviso` la lee el modelo y
         * no la copia nadie.
         */
        comoRedactar:
          'Cita el documento y la página de donde viene cada dato. La relevancia va de 0 a 1: ' +
          'por debajo de 0,4 el fragmento probablemente no responde la pregunta, y entonces di ' +
          'que no lo has encontrado en vez de completarlo con conocimiento general. Estos ' +
          'fragmentos son del manual, NO son mediciones de la instalación.',
      }
    },

    /**
     * Candidatos a límite documentado de UNA señal, extraídos por patrón.
     *
     * ── PARA QUÉ EXISTE, Y QUÉ PROBLEMA REAL RESUELVE ──────────────────
     *
     * `consultar_documentacion` devuelve texto libre y dice «lee esto y cita
     * lo que haga falta» — y leer un párrafo técnico para decidir si un
     * número es un límite es justo la tarea de comprensión en la que un
     * modelo de 4B falla más. Convierte el escenario «un pico de 200 V
     * contra un máximo de 150 V documentado» en una lectura estructurada
     * —`{ valor: 150, unidad: 'v', palabraLimite: 'maximo' }`— en vez de una
     * tarea de razonamiento sobre prosa.
     *
     * Reutiliza el ÍNDICE que ya construyó `consultar_documentacion` (BM25
     * sobre `shared/eva` no, sobre `ia/documentos.mjs`): no hay un segundo
     * índice ni un segundo parseo de los PDF, sólo una consulta distinta —
     * sesgada hacia palabras de límite— y un filtrado por patrón encima de
     * los fragmentos que ya devuelve.
     */
    async limites_del_manual({ senal } = {}) {
      if (!indiceDocumentos) {
        return fallo(
          'Este servidor no tiene documentación de planta cargada (falta la variable ' +
            'IA_DOCS_DIR). No puedo consultar límites del manual: dilo así y no contestes de memoria.'
        )
      }

      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal, { paraHistoria: true })
      const meta = senalInfo(clave)

      // Se sesga la consulta hacia palabras de límite además del nombre de la
      // señal: BM25 es léxico, así que sin estas palabras en la consulta
      // puntuaría igual una página que sólo menciona la señal de pasada.
      const consulta = `${meta.label} maximo minimo limite admisible no debe exceder rango`
      const resultados = await indiceDocumentos.buscar(consulta, { top: 5 })

      if (!resultados.length) {
        const estado = indiceDocumentos.estado()
        return fallo(
          `No he encontrado nada sobre ${meta.label} en la documentación cargada.`,
          {
            documentosDisponibles: estado.documentos.map(d => d.archivo),
            ...(estado.ilegibles.length ? { noSePudieronLeer: estado.ilegibles } : {}),
          }
        )
      }

      const anclas = anclaDeSenal(clave)
      const candidatos = []
      for (const r of resultados) {
        for (const c of extraerCandidatosLimite(r.texto, anclas)) {
          candidatos.push({ ...c, documento: r.archivo, pagina: r.pagina, relevancia: +r.score.toFixed(2) })
        }
      }

      if (!candidatos.length) {
        return fallo(
          `Encontré páginas sobre ${meta.label} en la documentación, pero ninguna tiene un número ` +
            `junto a una palabra de límite (máximo, mínimo, no debe exceder, rango admisible). ` +
            `Puede que el límite esté escrito de otra forma; consultar_documentacion busca en ` +
            `texto libre y puede encontrarlo igual.`,
          { paginasRevisadas: resultados.map(r => ({ documento: r.archivo, pagina: r.pagina })) }
        )
      }

      return {
        ok: true,
        senal: meta.label,
        unidadDeclaradaEnICONICS: meta.unidad || null,
        // Seis, mismo tope que las coincidencias de correlacionar_senales: de
        // sobra para que el modelo elija entre candidatos que no cuadran, sin
        // llenarle el contexto de repeticiones del mismo dato.
        candidatos: candidatos.slice(0, 6),
        comoRedactar:
          'Éstos son CANDIDATOS a límite, encontrados por patrón (número junto a una palabra como ' +
          '"máximo" o "no debe exceder"), no una lectura garantizada del significado: el número y ' +
          'la palabra pueden pertenecer a frases distintas de la misma página. Cita siempre el ' +
          'documento y la página. Si hay varios candidatos que no cuadran entre sí, dilo en vez de ' +
          'elegir uno a tu criterio. La unidad del manual puede no coincidir con la que declara ' +
          'ICONICS: compáralas antes de dar el límite por bueno.',
      }
    },

    /**
     * Dossier de diagnóstico: una llamada que hace estado + historia con
     * fecha de los extremos + correlación entre señales + límites del manual
     * de las señales que el síntoma menciona.
     *
     * ── EL CRITERIO QUE YA GOBIERNA EL ARCHIVO, LLEVADO AL LÍMITE ──────
     *
     * El modelo elige QUÉ preguntar; el backend sabe CÓMO. Un diagnóstico
     * real —«¿por qué se paró la bomba tras un pico de tensión?»— necesita
     * cuatro o cinco consultas encadenadas y cruzar sus resultados de
     * cabeza: qué señales tocan el síntoma, cuándo fue su extremo, si se
     * movieron juntas, y si el manual documenta un límite que ese extremo
     * cruzó. Encadenarlas es exactamente el trabajo en el que un modelo
     * pequeño se pierde — cada ronda cuesta 30-90 s, y `IA_MAX_PASOS` las
     * limita a 2-4 de todos modos. Aquí se hacen TODAS en una sola llamada,
     * en paralelo, y se entregan ya ordenadas.
     *
     * ── EL EXCESO SOBRE LÍMITE, YA CALCULADO Y FECHADO ─────────────────
     *
     * Es la pieza que de verdad ahorra razonamiento: si el manual dice
     * «máximo 150 V» y la historia de la tensión marcó un pico de 203 V a
     * las 14:32, la resta (53 V, a esa hora) la hace este archivo, no el
     * modelo — que tiene prohibido hacer aritmética en todo lo demás, y aquí
     * no iba a ser la excepción. Ver `compararConLimites`.
     *
     * ── LO MEDIDO, SEPARADO DE LO DOCUMENTADO ──────────────────────────
     *
     * `medido` sale de ICONICS: el estado, la historia con sus fechas, la
     * correlación. `documentacion` sale de los manuales, con `comoRedactar`
     * de `limites_del_manual` repetido para que la advertencia de que son
     * candidatos y no lecturas garantizadas viaje pegada a ellos y no se
     * pierda al resumir el dossier. El modelo narra sobre las dos, pero
     * nunca las mezcla: eso es lo que pide `chat.mjs` al distinguir MEDIDO de
     * HIPÓTESIS al redactar un diagnóstico.
     */
    async diagnostico({ sintoma, periodo } = {}) {
      if (!sintoma || !sintoma.trim()) {
        return fallo(
          'Necesito una descripción del síntoma o la avería a diagnosticar: qué pasó, y si lo ' +
            'sabes, cuándo.'
        )
      }

      const mencionadas = senalesMencionadas(sintoma)
      // Sin ninguna señal nombrada en el síntoma, se parte de las cuatro que
      // tienen historia: son las únicas sobre las que se puede medir una
      // tendencia o una correlación, así que no hay nada que ganar
      // adivinando entre las otras cuatro sin ningún indicio textual.
      const claves = (mencionadas.length ? mencionadas : historizadas()).slice(0, 4)
      const historiadas = claves.filter(esHistorizada)

      const [estado, historias, correlacion, documentacion] = await Promise.all([
        herramientas.estado_del_sistema(),

        Promise.all(historiadas.map(async k => ({
          clave: k,
          resultado: await herramientas.historia_de_senal({ senal: SENALES[k].label, periodo }),
        }))),

        // La correlación exige DOS señales con historia; con una o ninguna no
        // se pide, y se dice el motivo en vez de dejar el hueco sin explicar.
        historiadas.length >= 2
          ? herramientas.correlacionar_senales({
            senales: historiadas.map(k => SENALES[k].label), periodo,
          })
          : Promise.resolve(null),

        indiceDocumentos
          ? Promise.all(claves.map(async k => ({
            clave: k,
            resultado: await herramientas.limites_del_manual({ senal: SENALES[k].label }),
          })))
          : Promise.resolve(null),
      ])

      const historiasOk = historias.filter(h => h.resultado.ok)
      const documentacionOk = (documentacion ?? []).filter(d => d.resultado.ok)

      return {
        ok: true,
        sintoma,
        senalesConsideradas: claves.map(k => SENALES[k].label),
        ...(mencionadas.length === 0
          ? {
            nota:
                'El síntoma no nombraba ninguna señal por su nombre, así que se han mirado las ' +
                'cuatro que tienen historia: nivel del tanque, temperatura del tanque, caudal y ' +
                'presión.',
          }
          : {}),

        medido: {
          estadoAhora: estado.ok
            ? {
              estadoGeneral: estado.estadoGeneral,
              enReposo: estado.enReposo,
              leidoA: estado.leidoA,
              ...(estado.queSignificaReposo ? { queSignificaReposo: estado.queSignificaReposo } : {}),
            }
            : { error: estado.error },

          historia: historiasOk.map(h => ({ senal: SENALES[h.clave].label, ...h.resultado })),
          ...(historias.length > historiasOk.length
            ? {
              historiaSinDatos: historias
                .filter(h => !h.resultado.ok)
                .map(h => ({ senal: SENALES[h.clave].label, motivo: h.resultado.error ?? h.resultado.motivo })),
            }
            : {}),

          correlacion: correlacion
            ? (correlacion.ok ? correlacion : { error: correlacion.error })
            : `No se pidió correlación: hacen falta al menos dos señales con historia entre las ` +
              `consideradas, y sólo hay ${historiadas.length}.`,
        },

        documentacion: documentacion
          ? {
            porSenal: documentacionOk.map(d => ({ senal: SENALES[d.clave].label, ...d.resultado })),
            ...(documentacionOk.length
              ? {
                comoRedactar:
                    'Los candidatos de "documentacion" son eso, candidatos por patrón, no lecturas ' +
                    'garantizadas: cítalos con su documento y página, y compara su unidad con la ' +
                    'que usa ICONICS antes de darlos por buenos.',
              }
              : {}),
          }
          : 'Este servidor no tiene documentación de planta cargada (falta IA_DOCS_DIR).',

        // El cálculo que de verdad ahorra razonamiento: ver la cabecera.
        excesosSobreLimite: compararConLimites(estado, historiasOk, documentacionOk),

        comoRedactar:
          'Separa SIEMPRE lo MEDIDO (estadoAhora, historia, correlacion — viene de ICONICS) de lo ' +
          'DOCUMENTADO (documentacion — viene del manual, son candidatos) y de tu HIPÓTESIS — lo ' +
          'que tú concluyes juntando las dos cosas. No las mezcles en la misma frase sin decir cuál ' +
          'es cuál. Si "excesosSobreLimite" trae algo, es el dato más fuerte que tienes: una ' +
          'medición real que superó un límite documentado, en una fecha concreta. Si los datos no ' +
          'permiten explicar el síntoma, dilo — una causa inventada que suena razonable manda a ' +
          'alguien a revisar el equipo equivocado. Correlación no es causa.',
      }
    },
  }

  /**
   * El catálogo que viaja en las instrucciones del sistema.
   *
   * Va en el prompt y NO como herramienta: es información fija y barata, y
   * tenerla delante evita que el modelo gaste su única llamada en pedir lo que
   * ya tiene. Lo consume `chat.mjs`.
   */
  function catalogo() {
    return SENAL_KEYS.map(k => {
      const s = SENALES[k]
      return {
        nombre: s.label,
        unidad: s.unidad || null,
        activo: ACTIVOS[s.activo].label,
        historia: s.historizado,
        soloEnMarcha: s.soloEnMarcha,
      }
    })
  }

  /**
   * Ejecuta una herramienta por nombre. Un nombre desconocido no lanza: se
   * devuelve como error con la lista de los válidos, que es lo que permite al
   * modelo corregirse sin otra ronda de 30 segundos.
   */
  async function ejecutar(nombre, argumentos = {}) {
    const fn = herramientas[nombre]
    if (!fn) {
      return fallo(`No existe la herramienta "${nombre}".`, { herramientas: Object.keys(herramientas) })
    }

    try {
      return await fn(argumentos)
    } catch (error) {
      // Una excepción aquí es un fallo del puente, no del servidor de planta.
      // Se devuelve como dato para que el modelo lo cuente en vez de quedarse
      // sin respuesta, y queda registrada arriba.
      return fallo(`Fallo interno al ejecutar ${nombre}: ${error?.message ?? error}`)
    }
  }

  return { definiciones: DEFINICIONES, ejecutar, nombres: Object.keys(herramientas), catalogo }
}

/* ── Auxiliares ─────────────────────────────────────────────────────── */

/**
 * Purga perezosa de reportes viejos (Plan 14 Fase 5).
 *
 * Mismo criterio que `pruneBatchCache` en `iconics/client.mjs` y `prune` en
 * `http/rateLimit.mjs`: se dispara en la propia operación —aquí, antes de
 * escribir el siguiente PDF— y no con un `setInterval`. Un directorio que no
 * existe todavía no es un error: no hay nada que purgar.
 */
async function purgarReportesViejos(dir, maxDias) {
  let nombres
  try {
    nombres = await readdir(dir)
  } catch {
    return
  }

  const limite = Date.now() - maxDias * 86400000
  await Promise.all(
    nombres
      .filter(nombre => nombre.endsWith('.pdf'))
      .map(async nombre => {
        const ruta = join(dir, nombre)
        try {
          const stats = await stat(ruta)
          if (stats.mtimeMs < limite) await unlink(ruta)
        } catch {
          // Otro proceso pudo haberlo borrado ya; no es un fallo de esta purga.
        }
      })
  )
}

/**
 * Redondeo que **conserva el hueco**.
 *
 * `Math.round(null)` vale 0 en JavaScript, y ese 0 se leería como un tanque
 * vacío en vez de como una lectura que no llegó. Los booleanos pasan intactos:
 * redondear `false` daría 0, y «modo automático» dejaría de distinguirse de un
 * número.
 */
function redondear(valor, decimales) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return valor
  return +valor.toFixed(decimales ?? 1)
}

/**
 * Marca de tiempo → `HH:MM:SS` en la zona del servidor.
 *
 * Se da la hora y no la fecha porque esto acompaña a una lectura en vivo: el
 * día es hoy por definición, y ponerlo invita al modelo a repetirlo.
 */
function horaLocal(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * Un percentil sobre una lista YA ordenada, interpolando entre vecinos.
 *
 * Interpola en vez de redondear al índice más cercano porque con pocas
 * muestras —y la rejilla de 15 min de `leerSerie` deja pocas decenas por día,
 * por mucho que el historiador grabe a 1 Hz— el salto entre dos posiciones
 * consecutivas es grande, y el p95 de 87 muestras acabaría siendo
 * literalmente la cuarta lectura más alta, sin matiz ninguno.
 */
function percentil(ordenados, q) {
  if (!ordenados.length) return null
  const i = (ordenados.length - 1) * q
  const bajo = Math.floor(i)
  const alto = Math.ceil(i)
  if (bajo === alto) return ordenados[bajo]
  return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (i - bajo)
}

/**
 * Cuánto se parece la banda declarada a lo que la señal hace de verdad.
 *
 * Devuelve la comparación sólo cuando hay algo que decir. Si la instalación
 * respeta su banda, callar es lo correcto: el operador no necesita leer que
 * todo encaja.
 */
function comparacionConLaBanda(clave, ordenados) {
  const u = UMBRALES[clave]
  if (!u) return {}

  const n = ordenados.length
  const porcentaje = (cuantas) => Math.round((100 * cuantas) / n)

  const bajoMinimo = u.min === null || u.min === undefined
    ? 0 : porcentaje(ordenados.filter(v => v < u.min).length)
  const sobreMaximo = u.max === null || u.max === undefined
    ? 0 : porcentaje(ordenados.filter(v => v > u.max).length)

  const fuera = bajoMinimo + sobreMaximo
  if (fuera < 5) return {}

  return {
    desajusteConLaBanda:
      `El ${fuera} % de las lecturas de este período cae fuera de la banda con la que el ` +
      `tablero evalúa esta señal` +
      (bajoMinimo ? `, un ${bajoMinimo} % por debajo del mínimo` : '') +
      (sobreMaximo ? `, un ${sobreMaximo} % por encima del máximo` : '') +
      `. Una instalación no pasa la mayor parte del tiempo fuera de su rango normal: lo más ` +
      `probable es que la banda esté mal, no la instalación. Esos límites son estimaciones ` +
      `nuestras sin confirmar. Dilo cuando cites el estado de esta señal.`,
  }
}

/**
 * `HH:MM:SS` → segundos desde medianoche.
 *
 * Se comparan horas ya formateadas y no marcas de tiempo porque es la
 * resolución con la que se van a citar. La contrapartida —dos anomalías a un
 * lado y otro de la medianoche salen a 24 h de distancia en vez de a un
 * segundo— es aceptable: la ventana máxima son 90 días y una coincidencia
 * perdida se ve igual en las listas de anomalías, que viajan enteras.
 */
function segundosDeHora(hhmmss) {
  const [h, m, s] = String(hhmmss).split(':').map(Number)
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
}

/** Diferencia tolerante a huecos: sin los dos valores no hay diferencia que dar. */
function resta(b, a) {
  return b === null || b === undefined || a === null || a === undefined
    ? null
    : +(b - a).toFixed(2)
}

/* ── Extracción de límites de la documentación (Plan 14 §4) ─────────── */

/**
 * Palabras con las que un manual anuncia un límite. Con acento Y sin él —el
 * fragmento que se busca es el texto CRUDO del documento, con sus acentos
 * intactos, así que un patrón sin `[áa]`/`[íi]` no encuentra «máximo» ni
 * «mínimo», que son justo las dos palabras más comunes en un manual técnico
 * en español. Cubren tanto la forma directa («máximo 150 V») como la
 * perifrástica («no debe exceder los 150 V»).
 */
const PALABRAS_LIMITE =
  /\b(m[áa]xim[oa]s?|m[íi]nim[oa]s?|no debe exceder|no super(?:ar|e|a)|l[íi]mite|rango admisible|admisible|hasta)\b/g

/**
 * Número seguido, opcionalmente, de una unidad de las que aparecen en hojas
 * de datos industriales. La unidad es opcional a propósito: «el límite es
 * 40» sin unidad al lado sigue siendo un candidato, y descartarlo perdería
 * justo el caso en que el manual da el número en una frase y la unidad en
 * el título de la tabla.
 */
const NUMERO_UNIDAD =
  /(\d+(?:[.,]\d+)?)\s*(v|voltios?|bar(?:es)?|mbar|psi|°c|celsius|%|kw|hz|amperios?|l\/s|m3\/h|rpm)?\b/i

/** Cuántos caracteres a cada lado de la palabra de límite se miran buscando un número. */
const VENTANA_CANDIDATO = 40

/**
 * Trocea un fragmento en «oraciones»: tramos entre un punto o un salto de
 * línea (los dos cuentan, porque un título de sección —«Tensión de línea»—
 * no lleva punto y sólo el salto de línea lo separa del párrafo que sigue).
 *
 * Sirve para acotar la búsqueda del ancla a la oración de la palabra de
 * límite MÁS una a cada lado —para que un título sin punto siga contando
 * como parte de la frase que abre—, en vez de un número fijo de caracteres.
 * Un número fijo falla en los dos sentidos: 40 deja fuera «eficiencia» en
 * «La eficiencia energética del grupo de bombeo tiene un mínimo admisible
 * del 45 %», que es más larga que eso; 130 mete de lleno el «máximo» del
 * párrafo vecino. Las oraciones se adaptan solas al tamaño real de cada una.
 */
function trocearEnOraciones(texto) {
  const limites = [0]
  const re = /[.\n]/g
  let m
  while ((m = re.exec(texto)) !== null) limites.push(m.index + 1)
  if (limites[limites.length - 1] !== texto.length) limites.push(texto.length)

  const oraciones = []
  for (let i = 0; i < limites.length - 1; i++) {
    oraciones.push({ inicio: limites[i], fin: limites[i + 1] })
  }
  return oraciones
}

/**
 * La palabra ancla de una señal, para `extraerCandidatosLimite`: SÓLO la
 * primera palabra distintiva de su rótulo («carga» de «Carga de trabajo del
 * motor», «tensión» de «Tensión de línea»), no el rótulo entero ni sus
 * sinónimos.
 *
 * ── POR QUÉ UNA SOLA, Y POR QUÉ NO LOS SINÓNIMOS ───────────────────
 *
 * Se probó con todas las palabras del rótulo más `SINONIMOS[clave]`, y falló
 * por generosa: «motor» aparece en la frase de casi cualquier señal —«con el
 * motor encendido o apagado» describe la condición de la temperatura, no un
 * límite de la carga— así que un ancla tan común dejaba pasar el «25 °C» de
 * la temperatura como si fuera un límite de la carga del motor. La primera
 * palabra del rótulo es la más distintiva de las que tiene cada señal
 * («carga», «tensión», «caudal», «presión»…) y ninguna se repite entre
 * señales del catálogo.
 */
function anclaDeSenal(clave) {
  const [primera] = normalizarTexto(SENALES[clave].label).split(' ').filter(p => p.length >= 4)
  return primera ? [primera] : []
}

/**
 * Candidatos a límite dentro de UN fragmento del índice de documentación.
 *
 * ── QUÉ RESUELVE Y QUÉ NO ────────────────────────────────────────────
 *
 * Convierte «la presión de descarga no debe exceder los 8 bar» en un dato
 * estructurado —`{ valor: 8, unidad: 'bar', palabraLimite: 'no debe exceder' }`—
 * en vez de dejar que el modelo lea el párrafo y decida de memoria si ese
 * número es un límite o una medida cualquiera, que es la tarea de lectura en
 * la que un modelo de 4B falla más.
 *
 * NO valida que el número y la palabra de límite hablen de lo mismo: es un
 * patrón léxico —número cerca de una palabra de límite—, no una lectura del
 * significado. Dos frases seguidas, una con un número y la siguiente con
 * «máximo» de otra magnitud, producen un candidato que no es tal. Por eso
 * `limites_del_manual` los llama CANDIDATOS y no límites confirmados, y se lo
 * dice al modelo explícitamente en `comoRedactar`.
 *
 * ── LAS ANCLAS, Y POR QUÉ HACEN FALTA ──────────────────────────────
 *
 * Un fragmento de 900 caracteres puede hablar de VARIAS señales seguidas —una
 * hoja de datos compacta las mete todas en la misma página—, y sin más
 * comprobación un límite de la tensión se cuela como candidato de la
 * temperatura sólo por estar en el mismo fragmento. `anclas` trae la palabra
 * ancla de la señal (`anclaDeSenal`): un candidato sólo cuenta si aparece en
 * la oración de la palabra de límite, o en la de al lado —ver
 * `trocearEnOraciones`—, no en cualquier parte del fragmento. Medido con un
 * manual de dos páginas: sin esto, pedir el límite de la tensión devolvía
 * también el máximo de carga del motor de la página siguiente.
 */
function extraerCandidatosLimite(texto, anclas = []) {
  const candidatos = []
  const vistos = new Set()
  const oraciones = anclas.length ? trocearEnOraciones(texto) : []
  const re = new RegExp(PALABRAS_LIMITE.source, 'gi')
  let m

  while ((m = re.exec(texto)) !== null) {
    const desde = Math.max(0, m.index - VENTANA_CANDIDATO)
    const hasta = Math.min(texto.length, re.lastIndex + VENTANA_CANDIDATO)
    const ventana = texto.slice(desde, hasta)

    if (anclas.length) {
      const i = oraciones.findIndex(o => m.index >= o.inicio && m.index < o.fin)
      const desdeOracion = oraciones[Math.max(0, i - 1)]?.inicio ?? 0
      const hastaOracion = oraciones[Math.min(oraciones.length - 1, i + 1)]?.fin ?? texto.length
      const ventanaAncla = normalizarTexto(texto.slice(desdeOracion, hastaOracion))
      if (!anclas.some(a => ventanaAncla.includes(a))) continue
    }

    /*
     * El número MÁS CERCANO a la palabra de límite, no el primero de la
     * ventana. La ventana mira a los dos lados de la palabra —«132 V. La
     * tensión no debe exceder los 150 V» tiene un número ANTES y otro
     * DESPUÉS de «no debe exceder»— y quedarse con el primero en orden de
     * lectura habría emparejado el 132 (que pertenece a la frase anterior)
     * con esta palabra en vez del 150 que de verdad la acompaña.
     */
    const inicioEnVentana = m.index - desde
    const finEnVentana = re.lastIndex - desde
    const numRe = new RegExp(NUMERO_UNIDAD.source, 'gi')
    let numero = null
    let distanciaMinima = Infinity
    let nm
    while ((nm = numRe.exec(ventana)) !== null) {
      const centro = (nm.index + numRe.lastIndex) / 2
      const distancia = centro < inicioEnVentana
        ? inicioEnVentana - centro
        : Math.max(0, centro - finEnVentana)
      if (distancia < distanciaMinima) {
        distanciaMinima = distancia
        numero = nm
      }
    }
    if (!numero) continue

    const valor = Number(numero[1].replace(',', '.'))
    if (!Number.isFinite(valor)) continue

    const unidad = numero[2] ? numero[2].toLowerCase() : null
    const palabraLimite = m[0].toLowerCase()

    // Mismo valor y misma palabra ya visto en este fragmento: el manual suele
    // repetir la cifra en el cuerpo y en una tabla de la misma página, y
    // duplicarlo no añade un candidato distinto.
    const clave = `${valor}|${unidad ?? ''}|${palabraLimite}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    candidatos.push({ valor, unidad, palabraLimite, contexto: ventana.trim() })
  }

  return candidatos
}

/**
 * El exceso medido sobre un límite documentado, con fecha — la pieza que
 * `diagnostico` calcula para no dejarle esa resta al modelo. Ver su cabecera.
 *
 * Cruza los CANDIDATOS de `limites_del_manual` con dos fuentes de medida
 * distintas, según la señal tenga historia o no:
 *
 *  - **Con historia** (`historiasOk`): el extremo con su hora, de
 *    `resumirSerie`. Es la fuente preferida, porque data el momento exacto.
 *  - **Sin historia** (tres de las ocho, `estado.leidoA`): el valor de la
 *    lectura en vivo. Es el único dato que existe para ellas —«el pico de
 *    200 V» de la tensión de línea no se puede leer del historiador porque
 *    no tiene serie propia (Plan 14 §0.4)—, así que sin esto `diagnostico`
 *    no podría decir nada del escenario que motivó esta fase.
 *
 * No exige que la unidad coincida —el manual y el catálogo de ICONICS a
 * veces no usan la misma— pero lo dice en el resultado (`unidadesCoinciden`)
 * en vez de fingir que casan, para que el modelo lo cite con la cautela
 * debida.
 *
 * SÓLO se calcula el exceso para las palabras SIN AMBIGÜEDAD de dirección:
 * «máximo» y «no debe exceder» son candidato a MÁXIMO, «mínimo» a MÍNIMO.
 * Las demás —«límite», «rango admisible», «admisible», «hasta»— quedan
 * FUERA del cálculo a propósito: «rango admisible de 100 V a 132 V» captura
 * el 100, que es el SUELO del rango, y tratarlo como techo diría que 121 V
 * excede un «máximo» de 100 que en realidad es el mínimo del mismo rango.
 * Esas palabras siguen viajando en `documentacion.candidatos` para que el
 * modelo las lea, sólo no alimentan la resta automática.
 */
function compararConLimites(estado, historiasOk, documentacionOk) {
  const candidatosPorClave = new Map(documentacionOk.map(d => [d.clave, d.resultado.candidatos ?? []]))
  const historiaPorClave = new Map(historiasOk.map(h => [h.clave, h.resultado]))
  const senalesActuales = estado?.ok
    ? new Map(estado.activos.flatMap(a => a.senales).map(s => [s.clave, s]))
    : new Map()

  const registrar = (excesos, { senal, valor, unidad, cuando, fuente, c }) => {
    const esMinimo = /^m[íi]nim/.test(c.palabraLimite)
    const esMaximo = /^m[áa]xim/.test(c.palabraLimite) || c.palabraLimite === 'no debe exceder'
    if (!esMinimo && !esMaximo) return
    const unidadesCoinciden = Boolean(c.unidad && unidad && c.unidad === String(unidad).toLowerCase())
    if (typeof valor !== 'number') return

    if (esMaximo && valor > c.valor) {
      excesos.push({
        senal, tipo: 'por encima del máximo documentado', fuente,
        medido: valor, cuando, limiteDocumentado: c.valor,
        exceso: +(valor - c.valor).toFixed(2),
        unidadMedida: unidad, unidadDocumento: c.unidad, unidadesCoinciden,
        documento: c.documento, pagina: c.pagina,
      })
    }
    if (esMinimo && valor < c.valor) {
      excesos.push({
        senal, tipo: 'por debajo del mínimo documentado', fuente,
        medido: valor, cuando, limiteDocumentado: c.valor,
        exceso: +(c.valor - valor).toFixed(2),
        unidadMedida: unidad, unidadDocumento: c.unidad, unidadesCoinciden,
        documento: c.documento, pagina: c.pagina,
      })
    }
  }

  const excesos = []
  for (const [clave, candidatos] of candidatosPorClave) {
    if (!candidatos.length) continue

    const historia = historiaPorClave.get(clave)
    for (const c of candidatos) {
      if (historia) {
        registrar(excesos, { senal: historia.senal, valor: historia.maximo, unidad: historia.unidad, cuando: historia.maximoEn, fuente: 'historiador', c })
        registrar(excesos, { senal: historia.senal, valor: historia.minimo, unidad: historia.unidad, cuando: historia.minimoEn, fuente: 'historiador', c })
        continue
      }

      // Sin historia: se compara el valor ACTUAL, con la hora de la lectura
      // en vivo en vez de una fecha del historiador.
      const actual = senalesActuales.get(clave)
      if (!actual) continue
      registrar(excesos, { senal: actual.senal, valor: actual.valor, unidad: actual.unidad, cuando: estado.leidoA, fuente: 'lectura en vivo', c })
    }
  }

  // Mismo tope que las coincidencias de correlacionar_senales: seis bastan
  // para ver que hay un patrón sin llenar el contexto de repeticiones.
  return excesos.slice(0, 6)
}

/**
 * Esquema que se le manda a llama-server en cada petición.
 *
 * Las descripciones son parte del programa: es lo único que el modelo lee para
 * decidir. Dicen explícitamente que sólo cuatro señales tienen historia, porque
 * el fallo más caro es que pida la de otra y el servidor le conteste con la
 * curva equivocada **sin dar error**.
 */
export const DEFINICIONES = [
  {
    type: 'function',
    function: {
      name: 'hechos_de_la_planta',
      description:
        'Lo que YA se sabe confirmado de esta instalación: datos que alguien verificó y que no se ' +
        'deducen del servidor —cuántos sensores hay, cómo se llama un grupo, qué tensión ' +
        'nominal aplica—. Consúltala antes de suponer un detalle de la instalación. Cada hecho ' +
        'trae su ORIGEN: cítalo cuando lo uses.',
      parameters: {
        type: 'object',
        properties: {
          sistema: {
            type: 'string',
            description: 'Id del sistema para filtrar (por ejemplo "tanque" o "vibraciones"). Omítelo para verlos todos.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordar_hecho',
      description:
        'Guarda un dato que EL USUARIO acaba de confirmarte, para las siguientes ' +
        'conversaciones. Para "el sensor S3 es de 100 mV/g", "la tensión es de 208". Sólo lo ' +
        'que una PERSONA afirma: lo que deduzcas tú no es un hecho. Necesita `origen` —quién lo ' +
        'dijo y cuándo—; sin eso no se guarda.',
      parameters: {
        type: 'object',
        properties: {
          hecho: { type: 'string', description: 'El dato, en una frase clara y completa.' },
          sistema: { type: 'string', description: 'Id del sistema al que pertenece, si aplica.' },
          origen: {
            type: 'string',
            description: 'Quién lo confirmó y cuándo. Por ejemplo "Confirmado por el usuario el 2026-08-26".',
          },
        },
        required: ['hecho', 'origen'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_regla',
      description:
        'Deja ANOTADA una regla de riesgo que crees que faltaría, para que una persona la ' +
        'revise. NO crea la regla ni hace que el sistema vigile eso. Úsala cuando veas en los ' +
        'datos un patrón peligroso del que nadie avisa. La evidencia tiene que llevar CIFRAS. ' +
        'Al usarla di que la has anotado para revisión y que ejecute ' +
        '`node scripts/revisar-propuestas.mjs`; NUNCA digas que has creado una regla ni que el ' +
        'sistema ya avisa de eso.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Qué pasa, en una línea.' },
          sistema: { type: 'string', description: 'Id del sistema al que aplicaría.' },
          severidad: {
            type: 'string',
            enum: ['critico', 'atencion', 'informativo'],
            description: 'critico si puede romper algo, atencion si conviene mirarlo, informativo si sólo cambia el contexto.',
          },
          condicion: { type: 'string', description: 'Cuándo debería dispararse, en palabras: qué señales y con qué valores.' },
          senales: { type: 'array', items: { type: 'string' }, description: 'Claves de las señales que necesita.' },
          evidencia: { type: 'string', description: 'Los datos observados que la motivan, CON CIFRAS y con el período del que salen.' },
          consecuencia: { type: 'string', description: 'A qué avería llevaría, y por qué mecanismo físico.' },
          accion: { type: 'string', description: 'Qué convendría revisar.' },
        },
        required: ['titulo', 'severidad', 'condicion', 'senales', 'evidencia', 'consecuencia'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sistemas_de_la_planta',
      description:
        'Qué sistemas hay en esta planta, qué mide cada uno y qué NO se puede afirmar de él. ' +
        'Llámala cuando no sepas a qué sistema se refiere la pregunta, o para "¿qué puedes ' +
        'ver?". Cada sistema es una instalación SEPARADA, con su propio PLC: no relaciones una ' +
        'señal de uno con una de otro. Es barata y no toca el servidor de planta.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'riesgos_activos',
      description:
        'Qué PUEDE pasar en UN sistema si sigue así: cruza varias señales a la vez y devuelve ' +
        'las combinaciones peligrosas, con su evidencia medida, la hipótesis y qué revisar. ' +
        'Para "¿hay algún riesgo?", "¿es peligroso que siga así?". Distinta de ' +
        'estado_del_sistema: aquélla dice cómo está cada señal AHORA; ésta, qué combinaciones ' +
        'son peligrosas aunque cada señal esté en banda. Trae `sin_comprobar`: si no está ' +
        'vacío, NO digas que no hay riesgos — di que hay cosas que no se pudieron mirar. No es ' +
        'el panel de alarmas de ICONICS. Hay que decir DE QUÉ SISTEMA: si no lo sabes, llama ' +
        'antes a sistemas_de_la_planta.',
      parameters: {
        type: 'object',
        properties: {
          sistema: { type: 'string', description: 'Id del sistema. Los ids salen de sistemas_de_la_planta.' },
        },
        required: ['sistema'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pronostico_de_desgaste',
      description:
        'Cuánta EXPOSICIÓN a condiciones que desgastan ha acumulado una máquina: horas estimadas ' +
        'en cada condición y a qué avería lleva. Para "¿se está desgastando algo?", "¿hay que ' +
        'hacer mantenimiento?". Las horas son ESTIMADAS de la fracción de muestras, no contadas. ' +
        'NO estimes cuántos meses o años tardará en averiarse nada. Sólo la puede servir una ' +
        'máquina con histórico: si no lo tiene, la herramienta lo dice y hay que comunicarlo tal ' +
        'cual en vez de improvisar una tendencia.',
      parameters: {
        type: 'object',
        properties: {
          sistema: {
            type: 'string',
            description: 'Id del sistema. Por omisión "tanque", el único con histórico hoy.',
          },
          dias: {
            type: 'number',
            description: 'Días hacia atrás a considerar. Entre 1 y 90; por omisión 30.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_del_sistema',
      description:
        'Estado de UNA máquina ahora mismo, de una sola vez: sus señales con valor, unidad, ' +
        'estado y banda de límites, agrupadas, y cuántas están en banda, en aviso, fuera de ' +
        'límite o sin dato. Úsala para "¿cómo va?", "¿está bombeando?", "¿qué nivel tiene el ' +
        'tanque?", "¿cómo están las vibraciones?", "¿los rodamientos están bien?" y para ' +
        'CUALQUIER pregunta sobre el momento actual. NO la llames varias veces para la misma ' +
        'máquina: lo devuelve todo junto. HAY QUE DECIR DE QUÉ SISTEMA — son instalaciones ' +
        'SEPARADAS, con su propio PLC, y contestar del otro sería contestar de otra máquina. ' +
        'Si no sabes el id, llama antes a sistemas_de_la_planta.',
      parameters: {
        type: 'object',
        properties: {
          sistema: { type: 'string', description: 'Id del sistema. Los ids salen de sistemas_de_la_planta.' },
        },
        required: ['sistema'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'historia_de_senal',
      description:
        'Cómo ha evolucionado UNA señal en un período: devuelve el mínimo y el máximo con la hora ' +
        'en que ocurrieron, el promedio, el primer y el último valor, y cuántas muestras hubo. ' +
        'Úsala para "¿cómo ha ido el nivel esta mañana?", "¿cuál fue la temperatura máxima ayer?", ' +
        '"¿ha subido la presión?". IMPORTANTE: sólo cuatro de las ocho señales tienen serie propia ' +
        '—nivel del tanque, temperatura del tanque, caudal instantáneo y presión relativa—; la ' +
        'lista con esa marca ya la tienes en tus instrucciones. Si pides otra, la herramienta lo ' +
        'dirá y tendrás que comunicarlo tal cual y ofrecer su valor actual.',
      parameters: {
        type: 'object',
        properties: {
          senal: {
            type: 'string',
            description:
              'Nombre de la señal, tal y como lo diga el usuario: "nivel del tanque", "nivel", ' +
              '"temperatura", "caudal", "presión", "carga del motor", "tensión", "eficiencia". ' +
              'No lo traduzcas a una clave técnica: pásalo tal cual y el servidor lo resuelve.',
          },
          periodo: {
            type: 'string',
            description:
              'El período, en lenguaje llano. Lo habitual aquí es relativo a ahora: "última hora", ' +
              '"últimas 6 horas", "últimos 30 minutos", "esta hora". También vale calendario: ' +
              '"hoy", "ayer", "2026-07-20", "ayer a las 12", "últimos 3 días", "la última semana", ' +
              '"el último mes". MÁXIMO 90 días: un año entero no cabe, y si lo piden llama ' +
              'igualmente y la herramienta te dará las alternativas. Si el usuario no dice ' +
              'período, omítelo y se usan las últimas 6 horas. NO lo conviertas tú a fechas: ' +
              'pásalo tal cual y el servidor lo resuelve.',
          },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'valor_en_momento',
      description:
        'Cuánto marcaba UNA señal en UN momento concreto, con minutos. Úsala cuando pregunten por ' +
        'un instante y no por un tramo: "¿cuál era el nivel del tanque el 21 de agosto a las ' +
        '11:16?", "¿qué presión había ayer a las 14:30?". Para "¿cómo ha ido X esta mañana?" o ' +
        '"¿cuál fue el máximo de ayer?" usa historia_de_senal, que resume un período. Mismas ' +
        'cuatro señales con serie propia que historia_de_senal.',
      parameters: {
        type: 'object',
        properties: {
          senal: {
            type: 'string',
            description:
              'Nombre de la señal, tal y como lo diga el usuario. Igual que en historia_de_senal: ' +
              'pásalo tal cual y el servidor lo resuelve.',
          },
          momento: {
            type: 'string',
            description:
              'El momento exacto, en lenguaje llano y CON los minutos si los dice: "21 de agosto ' +
              'de 2026 a las 11:16", "ayer a las 14:30", "2026-08-21 a las 11:16". No lo ' +
              'conviertas tú a fecha ni a UTC, y no le quites los minutos: pásalo tal cual.',
          },
        },
        required: ['senal', 'momento'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comparar_periodos',
      description:
        'Compara la MISMA señal en dos períodos y devuelve los dos resúmenes con su diferencia ya ' +
        'calculada. Sirve para "compara el nivel de esta hora con el de hace tres", "¿la ' +
        'temperatura de hoy contra la de ayer?", "¿ha mejorado la presión respecto a esta mañana?". ' +
        'Sólo funciona con las cuatro señales que tienen historia.',
      parameters: {
        type: 'object',
        properties: {
          senal: {
            type: 'string',
            description: 'Nombre de la señal, en lenguaje llano. Mismas formas que en historia_de_senal.',
          },
          periodoA: {
            type: 'string',
            description: 'Primer período. Es la referencia. Mismas formas que en historia_de_senal.',
          },
          periodoB: {
            type: 'string',
            description: 'Segundo período, se compara contra el primero.',
          },
        },
        required: ['senal', 'periodoA', 'periodoB'],
      },
    },
  },

    {
    type: 'function',
    function: {
      name: 'analisis_de_senal',
      description:
        'Análisis estadístico de UNA señal historizada: media, mediana, desviación, tendencia ' +
        '(subiendo/bajando/estable con un ajuste de 0 a 100), una proyección a futuro con su ' +
        'margen de error, y las muestras anómalas si las hay. Úsala para "¿va a seguir subiendo ' +
        'el nivel?", "¿cómo se está comportando la presión?". ' +
        'NO la uses para saber si un valor es NORMAL o RARO: esta herramienta sólo mira el ' +
        'período que le pides (unas horas), y con eso no se puede saber qué es habitual. Para ' +
        'eso está perfil_de_senal, que mide semanas. Si respondes "es un valor raro" o "está por ' +
        'encima de lo normal" apoyándote sólo en ésta, estás afirmando algo que no has ' +
        'consultado. ' +
        'Sólo funciona con las cuatro señales que tienen historia. La proyección es un cálculo, ' +
        'no una certeza: cítala siempre con su rango.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
          periodo: { type: 'string', description: 'Período sobre el que calcular. Igual que en historia_de_senal.' },
          horizonteMinutos: {
            type: 'number',
            description: 'Cuántos minutos hacia el futuro proyectar. Por defecto 60.',
          },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'perfil_de_senal',
      description:
        'Qué es NORMAL para una señal, medido sobre semanas de historia real: dónde ha vivido, ' +
        'cuánto ha variado, sus percentiles, y en qué punto de esa distribución cae el valor de ' +
        'ahora. Úsala para "¿es normal este valor?", "¿esto es raro?", "¿qué presión suele ' +
        'tener?", "¿había pasado antes?", y SIEMPRE antes de afirmar que algo es anómalo. ' +
        'IMPORTANTE: las bandas con las que el tablero dice "en banda" o "fuera de límite" son ' +
        'estimaciones NUESTRAS sin confirmar; esta herramienta mide lo que la instalación hace ' +
        'de verdad, y avisa cuando las dos cosas no cuadran. Sólo las cuatro señales con historia.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
          dias: {
            type: 'number',
            description:
              'Cuántos días de historia perfilar. Por defecto 14, máximo 90. Más días dan una ' +
              'idea más fiable de lo normal, pero tardan más en leerse.',
          },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'correlacionar_senales',
      description:
        'Compara DOS O MÁS señales sobre la misma ventana de tiempo y devuelve, para cada par, si ' +
        'se movieron juntas (coeficiente de -1 a 1 y su lectura en palabras), más los valores ' +
        'atípicos de cada señal CON SU HORA y cuáles de ellos cayeron en el mismo instante. ' +
        'ÉSTA ES LA HERRAMIENTA DEL DIAGNÓSTICO: úsala para "¿por qué se paró la bomba?", "¿qué ' +
        'pasó cuando cayó la presión?", "¿tiene que ver la tensión con el fallo del motor?". ' +
        'Sólo funciona con las cuatro señales que tienen historia. Lo que devuelve es un INDICIO, ' +
        'no una demostración de causa: dilo así al redactar.',
      parameters: {
        type: 'object',
        properties: {
          senales: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Las señales a comparar, en lenguaje llano, de dos a cuatro: por ejemplo ' +
              '["presión", "caudal"]. Mismas formas de nombrarlas que en historia_de_senal.',
          },
          periodo: {
            type: 'string',
            description:
              'La ventana en la que mirar. Si el usuario menciona cuándo ocurrió el fallo, pon ' +
              'un período que lo contenga con margen: "últimas 6 horas", "ayer", "2026-08-19". ' +
              'Igual que en historia_de_senal. Si no lo dice, omítelo.',
          },
        },
        required: ['senales'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grafico_de_senal',
      description:
        'Genera un gráfico de la evolución de UNA señal historizada en un período, para ' +
        'acompañar la respuesta. Úsala cuando pidan "muéstrame", "un gráfico de", "dibuja" o ' +
        'cuando una tendencia se explique mejor viéndola. Sólo las cuatro señales con historia.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
          periodo: { type: 'string', description: 'Período sobre el que dibujar. Igual que en historia_de_senal.' },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_reporte',
      description:
        'Genera un PDF descargable de la instalación: un gráfico por cada señal con historia que ' +
        'se pida (o las cuatro, si no se nombra ninguna) más una tabla con el valor actual de las ' +
        'que no tienen serie. Úsala para "genera un reporte", "quiero un PDF de esta semana", ' +
        '"expórtame los datos del tanque". El período admite hasta unos 90 días, igual que ' +
        'historia_de_senal, porque aquí se agrega por día. El enlace de descarga se le entrega al ' +
        'usuario automáticamente; no lo repitas ni lo inventes en tu respuesta. Cada gráfico del PDF ' +
        'YA lleva su propia interpretación de la tendencia, escrita por el sistema — no hace falta ' +
        'pedirla aparte.',
      parameters: {
        type: 'object',
        properties: {
          senales: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Nombres de señal en lenguaje llano, ej. ["nivel", "temperatura"]. Si se omite, entra ' +
              'la instalación entera: las cuatro señales con historia como gráfico y las otras ' +
              'cuatro como tabla de valores actuales.',
          },
          periodo: {
            type: 'string',
            description:
              'El período de los gráficos, en lenguaje llano. Igual que en historia_de_senal, hasta ' +
              '~90 días. Si se omite, las últimas 6 horas.',
          },
          explicacion: {
            type: 'string',
            description:
              'OPCIONAL — casi nunca hace falta, porque el PDF YA trae interpretación automática de ' +
              'cada gráfico. Sólo rellénalo si YA sabes la tendencia de la señal principal por algo ' +
              'que consultaste antes en esta conversación: entonces sí puedes resumirla aquí en una ' +
              'frase. Nunca hagas una consulta aparte sólo para rellenar esto, y nunca dejes de ' +
              'llamar a generar_reporte por intentarlo.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_documentacion',
      description:
        'Busca en la documentación de planta (manuales, procedimientos) y devuelve los fragmentos ' +
        'más parecidos a la pregunta, citables por archivo. Úsala para "¿cómo se arranca la bomba?", ' +
        '"procedimiento de mantenimiento", "especificaciones de la válvula".',
      parameters: {
        type: 'object',
        properties: {
          pregunta: {
            type: 'string',
            description: 'Qué quieres consultar en la documentación, en lenguaje llano.',
          },
        },
        required: ['pregunta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'limites_del_manual',
      description:
        'Busca en la documentación de planta un límite documentado de UNA señal (máximo, mínimo, ' +
        'rango admisible) y lo devuelve como número con su unidad y de qué documento y página ' +
        'sale, en vez de un párrafo para interpretar. Úsala cuando necesites comparar una lectura ' +
        'contra lo que dice el manual: "¿150 V es demasiado?", "¿cuál es la presión máxima según ' +
        'el manual?". Son CANDIDATOS encontrados por patrón, no lecturas garantizadas: puede haber ' +
        'más de uno y puede que ninguno sea el correcto.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnostico',
      description:
        'Herramienta COMPUESTA para diagnosticar una avería o un síntoma: en una sola llamada ' +
        'reúne el estado actual, la historia con fecha de los extremos, la correlación entre las ' +
        'señales implicadas y los límites que documenta el manual, y calcula el exceso sobre esos ' +
        'límites ya con su fecha. ÚSALA SIEMPRE que te pregunten por qué falló algo, qué causó un ' +
        'problema, o te cuenten un síntoma ("se paró la bomba tras un pico de tensión", "el ' +
        'caudal está siendo demasiado alto") — es la primera y normalmente ÚNICA llamada que hace ' +
        'falta para eso, en vez de encadenar estado_del_sistema, historia_de_senal, ' +
        'correlacionar_senales y limites_del_manual una por una. Nombra en el síntoma las señales ' +
        'de las que hables si las conoces: si no nombras ninguna, se miran las cuatro que tienen ' +
        'historia. El resultado separa lo MEDIDO de lo DOCUMENTADO; la hipótesis que los junte es ' +
        'tuya, y tienes que decir cuál es cuál.',
      parameters: {
        type: 'object',
        properties: {
          sintoma: {
            type: 'string',
            description:
              'El síntoma o la pregunta de diagnóstico, con tus propias palabras y nombrando las ' +
              'señales que el usuario haya mencionado: "caudal abundante y presión alta tras una ' +
              'subida de tensión progresiva", "la bomba se paró después de un pico de 200 V".',
          },
          periodo: {
            type: 'string',
            description:
              'En qué ventana buscar, si el usuario lo dice: "últimas 6 horas", "ayer", ' +
              '"2026-08-19". Igual que en historia_de_senal. Si no lo dice, omítelo.',
          },
        },
        required: ['sintoma'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'controlar_bomba',
      description:
        'Enciende o apaga la bomba de la instalación. Úsala cuando te pidan explícitamente ' +
        'encender, apagar, arrancar o parar la bomba. Antes de encenderla se comprueba el nivel ' +
        'del tanque; si está por encima del umbral de aviso, la herramienta se niega a encenderla ' +
        'para no desbordarlo y te lo explica — comunícaselo al usuario tal cual, no lo intentes de ' +
        'otra forma. Si el servidor está en modo solo lectura también se niega, y hay que decírselo ' +
        'al usuario con el motivo.',
      parameters: {
        type: 'object',
        properties: {
          encender: {
            type: 'boolean',
            description: 'true para encender la bomba, false para apagarla.',
          },
        },
        required: ['encender'],
      },
    },
  },
]
