/**
 * El ENSAMBLADOR de las herramientas que el modelo puede invocar.
 *
 * ── QUÉ HACE HOY ESTE ARCHIVO ──────────────────────────────────────
 *
 * Construir el contexto —el cliente de ICONICS, los turnos, la carpeta de
 * reportes, el tope de concurrencia—, dárselo a cada FAMILIA y juntar lo que
 * devuelven en un solo catálogo. Las diecinueve implementaciones viven en
 * `herramientas/`, una subcarpeta por familia:
 *
 *   aprendizaje/    3 · hechos y propuestas. No toca ICONICS
 *   registro/       1 · qué máquinas hay. Abre el catálogo a propósito
 *   maquina/        3 · el instante de una máquina, y la única que ESCRIBE
 *   historicos/     9 · todo lo que pregunta al pasado
 *   documentacion/  3 · los manuales, y el diagnóstico que los cruza
 *
 * Llegó a tener 4100 líneas. El reparto no es temático sino de DEPENDENCIA:
 * cada familia recibe exactamente lo que necesita, y su firma lo declara.
 * `aprendizaje/` y `registro/` no reciben nada, y esa firma vacía es el dato.
 *
 * ── LO QUE TODAVÍA VIVE AQUÍ, Y POR QUÉ ────────────────────────────
 *
 * El índice de nombres de señal del tanque (`resolverSenal`, sus sinónimos,
 * `senalDesconocida`), el resolvedor de ventanas de tiempo y las piezas de
 * estadística redactada. No es que no tengan sitio: es que su sitio depende de
 * una decisión que no está tomada —el índice de nombres tiene que pasar a ser
 * por máquina, y hoy sólo conoce una—. Ver B3 en `docs/BACKLOG-BACKEND.md`.
 *
 * Mientras tanto las familias los importan de aquí. El ciclo de imports lo
 * resuelve ESM sin problema, y la alternativa era un segundo índice de
 * nombres: exactamente el fallo que este proyecto ya arregló una vez.
 *
 * ── EL ORDEN DEL CATÁLOGO NO ES COSMÉTICO ──────────────────────────
 *
 * Es lo primero que lee el modelo. `sistemas_de_la_planta` abre, porque es la
 * que tiene que encontrar cuando no sabe de qué máquina le hablan; las de
 * manuales cierran, porque son las que menos veces son la respuesta. En medio,
 * las de una máquina antes que las de historia: primero cómo está, después
 * cómo ha estado. Lo fija entero `scripts/verificar-herramientas.mjs`.
 *
 * ── QUÉ CAMBIÓ EN AGOSTO DE 2026, Y POR QUÉ NO FUE UN RENOMBRADO ───
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
import { UMBRALES } from '../../shared/eva/umbrales.js'
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
import {
  NO_COMPARTEN,
  SISTEMA,
  SISTEMAS,
  SISTEMA_IDS,
  historizadasDe,
  sistemaDePunto,
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
import { isoLocal, resolverPeriodo } from '../../shared/periodo.js'
import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
/*
 * El esquema que lee el modelo vive aparte (`definiciones.mjs`): es texto
 * dirigido a un modelo de lenguaje, no código que se ejecute, y se edita por
 * otros motivos que la implementación. Se REEXPORTA desde aquí porque
 * `chat.mjs` y los verificadores llevan importándolo de este módulo desde que
 * existe, y mover un archivo no es motivo para tocarlos.
 */
import { DEFINICIONES } from './definiciones.mjs'
/*
 * Las piezas de presentación que no dependen de nada (Fase 0 del reparto):
 * ni del `client`, ni de la configuración, ni de estado. Ver la cabecera de
 * `herramientas/lib/formato.mjs`.
 */
import { fallo } from './herramientas/lib/respuesta.mjs'
/* Fase 1 del reparto: las tres herramientas del almacén de lo aprendido. No
   reciben nada —no tocan el `client`— y por eso salen antes que las demás. */
import { crearHerramientasDeAprendizaje } from './herramientas/aprendizaje/index.mjs'
/* Fase 2: las tres que leen los manuales. Sólo necesitan `indiceDocumentos`. */
import { crearHerramientasDeDocumentacion } from './herramientas/documentacion/index.mjs'
/*
 * Fase 3: los ayudantes que SÍ dependen del cliente de ICONICS. Salen de la
 * clausura recibiendo un contexto con nombre en vez de cerrarse sobre ella.
 */
import { crearAyudantesDeMaquina } from './herramientas/lib/maquina.mjs'
import { crearAyudantesDeHistoria } from './herramientas/lib/historia.mjs'
/* Fase 4: las familias que ya reciben el contexto en vez de cerrarse sobre él. */
import { crearHerramientasDeRegistro } from './herramientas/registro/index.mjs'
import { crearHerramientasDeMaquina } from './herramientas/maquina/index.mjs'
import { crearHerramientasDeHistoricos } from './herramientas/historicos/index.mjs'

export { DEFINICIONES }

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
export const MAX_DIAS_PERFIL = 90

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
export const MIN_MUESTRAS_PERFIL = 30

/**
 * Ventana máxima de un reporte, en días (Plan 14 Fase 5; subido a 90 en el
 * Plan 15 Fase 4 para quedar consistente con `MAX_HORAS_VENTANA` y
 * `MAX_DIAS_PERFIL` — las tres preguntas del asistente que tocan un rango
 * largo comparten ya el mismo techo de un trimestre, en vez de tres números
 * distintos sin relación entre sí).
 */
export const MAX_DIAS_REPORTE = 90

/**
 * Puntos con los que se dibuja un gráfico de reporte, como mucho.
 *
 * Mismo orden de magnitud que `MAX_PUNTOS` (el tope del historiador por
 * petición) porque es exactamente para lo que se diseñó el ancho del SVG de
 * `renderizarGraficoSerie`. Un reporte de varios días junta muchas de esas
 * peticiones y hay que volver a bajar a esta escala antes de dibujar — ver
 * `downsamplear`.
 */
export const PUNTOS_GRAFICO_REPORTE = 120

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
export const AVISO_TRUNCADA =
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
export function agruparPorRegla(activos) {
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

/**
 * Tendencia de una serie, en palabras que el modelo pueda citar sin restar.
 *
 * Antes vivía sólo dentro de `analisis_de_senal`; ahora también la usan
 * `grafico_de_senal` y `generar_reporte` (Plan 14 §5, feedback de que el
 * modelo se limitaba a repetir mínimo/máximo/promedio en vez de interpretar
 * la curva). Un mismo cálculo, no tres copias del mismo criterio de
 * clasificación —qué pendiente cuenta como "estable"— que podrían divergir.
 */
export function calcularTendencia(puntos) {
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
export function describirTendencia(tendencia, unidad = '') {
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
export function normalizarTexto(texto) {
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
export function senalesMencionadas(texto) {
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
export function senalDesconocida(texto, { paraHistoria = false } = {}) {
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

    /*
     * ── NO SE MANDA A UNA PUERTA QUE NO EXISTE ─────────────────────
     *
     * Este mensaje decía «vuelve a llamar indicando ese sistema». Sólo TRES
     * de las diecinueve herramientas aceptan `sistema` —`estado_del_sistema`,
     * `riesgos_activos` y `pronostico_de_desgaste`—, y ninguna de las ocho de
     * señal que pasan por aquí lo hace. El modelo obedecía, repetía la llamada
     * con un argumento que la herramienta ignora, volvía a caer en este mismo
     * error, y se gastaban turnos en un bucle del que la instrucción era la
     * causa.
     *
     * Se le dice lo que SÍ puede llamar. `estado_del_sistema` da el valor de
     * ahora de esa máquina, que es lo que casi siempre se estaba pidiendo.
     */
    return fallo(
      `«${texto}» no es una señal del tanque: es del sistema «${s.nombre}» (${s.plc}), que es ` +
        `OTRA MÁQUINA. Esta herramienta sólo sirve al tanque. Para esa señal usa ` +
        `estado_del_sistema(sistema="${sistema}"), que da su valor de ahora.`,
      { sistema, clave }
    )
  }

  if (enOtras.length > 1) {
    /*
     * ── DOS AMBIGÜEDADES DISTINTAS, Y NO SE ARREGLAN IGUAL ─────────
     *
     * Este mensaje sólo contemplaba una: dos MÁQUINAS que reclaman el mismo
     * nombre. Pero desde que el registro reconoce nombres parciales —«velocidad
     * eficaz» encaja en los tres apoyos de la misma máquina— la ambigüedad
     * frecuente es la de DENTRO de un sistema, y decirle al modelo «pregunta de
     * qué sistema se trata» ante tres claves de la misma máquina le pide
     * desambiguar por el eje equivocado: contestaría «del sistema de
     * vibraciones» y seguiría sin saber de qué apoyo.
     *
     * Se distinguen, porque la pregunta que hay que hacerle al operador es
     * distinta en cada caso.
     */
    const maquinas = [...new Set(enOtras.map((x) => x.sistema))]

    if (maquinas.length > 1) {
      return fallo(
        `«${texto}» existe en más de un sistema (${maquinas.join(', ')}), y no son la misma ` +
          'máquina. Pregunta de cuál se trata antes de contestar.',
        { sistemas: enOtras }
      )
    }

    const s = SISTEMA[maquinas[0]]
    return fallo(
      `«${texto}» no identifica UNA señal de «${s.nombre}»: encaja con ${enOtras.length} ` +
        `(${enOtras.map((x) => s.etiquetaDe(x.clave) ?? x.clave).join('; ')}). Pregunta cuál de ` +
        'ellas antes de contestar: son puntos de medida distintos y sus valores no son el mismo.',
      { sistema: s.id, claves: enOtras.map((x) => x.clave) }
    )
  }

  /*
   * ── EL ÚLTIMO MENSAJE TAMBIÉN HABLABA SÓLO DEL TANQUE ──────────────
   *
   * Decía «sólo existen las ocho de la lista, y no hay más puntos bajo
   * ac:TDCON/DEMO/SENSORES/». Las dos mitades son ciertas del tanque y falsas
   * de la planta, y este es el camino por el que se sale cuando el nombre no
   * se reconoce en NINGUNA máquina — justo cuando menos se puede afirmar que
   * la única lista que importa es la de una.
   *
   * Se arregló la rama de «es de otra máquina» y se dejó ésta con la frase
   * vieja. El síntoma es peor aquí: allí el modelo recibía el sistema correcto
   * y reintentaba; aquí recibe un catálogo de ocho señales y concluye que la
   * planta tiene ocho.
   *
   * Ahora el error dice de qué máquinas se ha buscado y cuántas señales tiene
   * cada una, y el catálogo del tanque viaja aparte y nombrado como suyo.
   */
  return fallo(
    `No hay ninguna señal llamada "${texto}" en ninguna máquina de esta planta. Se ha buscado en ` +
      SISTEMAS.map((s) => `«${s.nombre}» (${s.claves().length} señales)`).join(' y ') +
      '. Comprueba el nombre, o pide los sistemas con sistemas_de_la_planta.',
    /* `senales` sigue siendo el catálogo del tanque y conserva su nombre: es
       lo que ya leen las herramientas y las pruebas, y renombrarlo no arregla
       nada que el texto del error no arregle. Lo que faltaba era decir que hay
       más máquinas, y eso entra al lado. */
    { senales: catalogoBreve(), sistemas: SISTEMA_IDS }
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

  /*
   * ── EL CONTEXTO, EN VEZ DE UNA CLAUSURA DE 3000 LÍNEAS ─────────────
   *
   * Los ayudantes ya no se cierran sobre las variables de esta función: las
   * reciben. Es el cambio que permite que las herramientas que los usan puedan
   * mudarse a su familia — mientras `client` fuera algo que sólo existía aquí
   * dentro, nada que lo necesitara podía salir.
   *
   * Se desestructuran a nombres sueltos para que las herramientas que todavía
   * viven abajo sigan llamándolos igual que siempre. Ninguna se entera del
   * cambio, y ninguna prueba hubo que tocarla.
   */
  const { leerMaquina, resolverSistema, evaluarRiesgosDe } = crearAyudantesDeMaquina({ client })
  const { leerUnTramo, leerSerie, leerHistoriaLarga, leerSerieEnRango } =
    crearAyudantesDeHistoria({ client, historyConcurrencia })



  /*
   * Las señales del pronóstico: sólo las que tienen serie PROPIA verificada.
   * `cargaMotor` no está y no puede estar — el historiador devuelve ahí la
   * curva de la temperatura del tanque sin dar error.
   */
  const SENALES_PRONOSTICO = [
    'nivelTanque', 'temperaturaTanque', 'presionRelativa', 'tensionLinea', 'flujoInstantaneo',
  ]

  const herramientas = {
    /*
     * ── LAS FAMILIAS QUE YA VIVEN FUERA ────────────────────────────
     *
     * Cada familia repartida devuelve su propio `{ nombre: fn }` y se mezcla
     * aquí. El orden no importa —`ejecutar` busca por nombre— pero el reparto
     * sí: una familia que se mueva y no se mezcle desaparece del catálogo, y
     * `verificar-herramientas` lo detecta en el acto, porque compara lo que se
     * le anuncia al modelo contra lo que se puede ejecutar.
     */
    ...crearHerramientasDeAprendizaje(),
    /* El registro va aquí porque `sistemas_de_la_planta` abre el catálogo: es
       la que el modelo tiene que encontrar cuando no sabe de qué máquina le
       hablan, y el orden del catálogo es lo primero que lee. */
    ...crearHerramientasDeRegistro(),
    ...crearHerramientasDeMaquina({
      client, readOnly, maquina: { leerMaquina, resolverSistema, evaluarRiesgosDe },
    }),
    /* Las de historia van detrás de las de máquina: es el orden en que se
       pregunta —primero cómo está, después cómo ha estado—. */
    ...crearHerramientasDeHistoricos({
      client,
      turnos,
      reportes,
      historia: { leerSerie, leerSerieEnRango, leerHistoriaLarga },
      maquina: { leerMaquina, resolverSistema },
      senalesPronostico: SENALES_PRONOSTICO,
      dameHerramientas: () => herramientas,
    }),


    /*
     * Las de documentación van AL FINAL, que es donde estaban.
     *
     * El orden del catálogo no es cosmético: es lo primero que lee el modelo y
     * `verificar-herramientas` lo fija entero. Las de sistemas abren porque son
     * las que tiene que encontrar cuando no sabe de qué máquina le hablan, y
     * las de manuales cierran porque son las que menos veces son la respuesta.
     *
     * Al repartir por familias, el orden es lo primero que se rompe: basta con
     * mezclar un grupo donde no iba. Aquí se respeta el que había.
     */
    ...crearHerramientasDeDocumentacion({ indiceDocumentos, dameHerramientas: () => herramientas }),
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
export async function purgarReportesViejos(dir, maxDias) {
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
export function redondear(valor, decimales) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return valor
  return +valor.toFixed(decimales ?? 1)
}

/**
 * Marca de tiempo → `HH:MM:SS` en la zona del servidor.
 *
 * Se da la hora y no la fecha porque esto acompaña a una lectura en vivo: el
 * día es hoy por definición, y ponerlo invita al modelo a repetirlo.
 */
export function horaLocal(iso) {
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
export function percentil(ordenados, q) {
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
export function comparacionConLaBanda(clave, ordenados) {
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
export function segundosDeHora(hhmmss) {
  const [h, m, s] = String(hhmmss).split(':').map(Number)
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
}

/** Diferencia tolerante a huecos: sin los dos valores no hay diferencia que dar. */
export function resta(b, a) {
  return b === null || b === undefined || a === null || a === undefined
    ? null
    : +(b - a).toFixed(2)
}

/* ── Extracción de límites de la documentación (Plan 14 §4) ─────────── */

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
export function trocearEnOraciones(texto) {
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



