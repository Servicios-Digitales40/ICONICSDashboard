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
 * ── DE SOLO LECTURA POR CONSTRUCCIÓN ───────────────────────────────
 *
 * El registro no contiene ni una operación de escritura. `ICONICS_READ_ONLY`
 * sigue siendo la última puerta, pero la primera es que `writePoint` no está
 * en el catálogo: ninguna instrucción astuta metida en el chat puede alcanzar
 * algo que no existe aquí.
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
  TODOS_LOS_PUNTOS,
  esHistorizada,
  historizadas,
  parsePointName,
  pointName,
  senalInfo,
} from '../../shared/eva/senales.js'
import { ACTIVOS, ACTIVO_IDS } from '../../shared/eva/activos.js'
import { DERIVADO, estadoInfo } from '../../shared/eva/estado.js'
import { PROVISIONALES, UMBRALES } from '../../shared/eva/umbrales.js'
import { createSistema } from '../../shared/eva/sistema.js'
import {
  AGREGADO,
  MAX_PUNTOS,
  SIN_SERIE,
  VENTANA,
  intervaloHMS,
  normalizar,
  resumirSerie,
} from '../../shared/eva/historia.js'
import { isGoodQuality } from '../../shared/quality.js'
import { TIPOS, isoLocal, resolverPeriodo } from '../../shared/periodo.js'

/**
 * Ventana máxima que se puede pedir de una vez, en horas. Siete días.
 *
 * ── POR QUÉ HAY TOPE ───────────────────────────────────────────────
 *
 * Con `MAX_PUNTOS` fijo, alargar la ventana no cuesta más red: cuesta
 * RESOLUCIÓN. Un mes en 100 puntos es una muestra cada siete horas y media, y
 * el «máximo» de ese resumen ya no es el pico real sino el promedio del tramo
 * en que ocurrió. Preferimos negar el mes a devolver un extremo suavizado que
 * nadie podría distinguir del bueno.
 */
const MAX_HORAS_VENTANA = 24 * 7

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

/** Error uniforme que además enseña al modelo cómo corregirse en la misma pasada. */
function fallo(error, extra = {}) {
  return { ok: false, error, ...extra }
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

/** Catálogo breve que viaja DENTRO del error, para que el reintento no gaste otra ronda. */
function catalogoBreve() {
  return SENAL_KEYS.map(k => ({
    senal: SENALES[k].label,
    clave: k,
    historia: SENALES[k].historizado,
  }))
}

/** El error de señal no reconocida, siempre con la lista de las que sí existen. */
function senalDesconocida(texto) {
  return fallo(
    `No hay ninguna señal llamada "${texto}" en esta instalación. Sólo existen las ocho de la ` +
      `lista, y no hay más puntos bajo ${RAIZ}.`,
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
export function resolverVentana(texto, { turnos = {} } = {}) {
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
    if (n > MAX_HORAS_VENTANA) {
      return {
        error:
          `${n} horas son demasiadas para una sola lectura: con el tope de ${MAX_PUNTOS} muestras ` +
          `del servidor, cada punto sería el promedio de varias horas y el máximo dejaría de ser ` +
          `el pico real. Como mucho ${MAX_HORAS_VENTANA} horas (7 días). ${ALTERNATIVAS}`,
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
  if (duracionHoras > MAX_HORAS_VENTANA) {
    return {
      error:
        `"${p.etiqueta}" abarca más de 7 días. Con el tope de ${MAX_PUNTOS} muestras del ` +
        `servidor, cada punto sería el promedio de varias horas y los extremos dejarían de ser ` +
        `los reales. ${ALTERNATIVAS}`,
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

export function createHerramientas({ client, turnos = {}, indiceDocumentos = null } = {}) {
  if (!client?.readPoints) {
    throw new Error('createHerramientas requiere el cliente de ICONICS')
  }

  /**
   * Lee las ocho señales en **una sola** llamada en lote y las convierte en el
   * `Sistema` de dominio — el mismo objeto que pinta la vista de Planta.
   *
   * Que sea el mismo objeto no es una comodidad, es la garantía: no puede
   * haber un caso en que el chat diga «en banda» de una señal que la tarjeta
   * pinta en rojo, porque los dos llaman a `createSistema` con las mismas
   * lecturas y los mismos umbrales.
   *
   * La calidad se filtra aquí, en la frontera, exactamente igual que hace el
   * motor de sondeo del frontend: un valor de mala calidad llega como 0 y, sin
   * filtrar, el asistente diría «el tanque está al 0 %» de una instalación
   * llena. Un hueco es `null` y el dominio lo pinta como «sin dato».
   */
  async function leerSistema() {
    const respuesta = await client.readPoints(TODOS_LOS_PUNTOS)
    if (!respuesta.ok) return { ok: false, error: respuesta.error, status: respuesta.status }

    const mapa = respuesta.payload ?? {}
    const receivedAt = new Date().toISOString()
    const lecturas = {}

    for (const [nombre, entrada] of Object.entries(mapa)) {
      // `parsePointName` devuelve `null` ante cualquier punto que no reconozca,
      // para que un cambio en el servidor se vea como dato ausente y nunca como
      // una asignación a la señal equivocada.
      const clave = parsePointName(nombre)
      if (!clave || !entrada?.ok) continue

      const p = entrada.payload ?? {}
      const quality = p.quality ?? p.Quality ?? null
      if (!isGoodQuality(quality)) continue

      lecturas[clave] = { value: p.value ?? p.Value ?? null, receivedAt }
    }

    return { ok: true, sistema: createSistema(lecturas), receivedAt }
  }

  /**
   * Una serie del historiador, ya normalizada.
   *
   * **La guarda de `historizado` va antes que la red**, no después: ver la
   * cabecera del archivo. Devolver `motivo` en vez de lanzar es deliberado —no
   * es una avería, es un hecho de la instalación que el asistente tiene que
   * poder explicar—.
   */
  async function leerSerie(clave, ventana) {
    if (!esHistorizada(clave)) return { ok: false, motivo: SIN_SERIE }

    const segundos = (ventana.fin - ventana.inicio) / 1000
    // Un punto cada 15 min como en la vista de Planta, pero sin pasar del tope
    // del servidor: por debajo de 25 h manda la resolución, por encima el tope.
    const puntos = Math.max(2, Math.min(MAX_PUNTOS, Math.round(segundos / 900)))

    const r = await client.readHistory({
      // Con `ac:`, el mismo nombre que en vivo. `hda:\Configuration\…` responde
      // 500 para este árbol: ver `shared/eva/historia.js`.
      pointName: pointName(clave),
      startDate: ventana.inicio.toISOString(),
      endDate: ventana.fin.toISOString(),
      aggregate: AGREGADO,
      interval: intervaloHMS(segundos / puntos),
    })

    if (!r?.ok) return { ok: false, status: r?.status ?? 0, error: r?.error }

    return { ok: true, datos: normalizar(r.data) }
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
  function describirSenal(s) {
    const u = UMBRALES[s.key]

    return {
      senal: s.label,
      clave: s.key,
      tag: s.tag,
      /*
       * Redondeado a los decimales del catálogo, y esto NO es cosmética.
       *
       * ICONICS entrega el float crudo del PLC. Medido contra el servidor
       * real: el nivel llega como `50.09765625` y la temperatura como
       * `23.258464813232422`, y el modelo los cita tal cual —«el tanque está
       * al 50.09765625 %»—. Trece decimales en una lectura de tanque no son
       * precisión, son ruido: sugieren una exactitud que el sensor no tiene y
       * hacen la frase ilegible de un vistazo, que es justo lo que un
       * operador necesita.
       *
       * Los decimales son los MISMOS que usa la pantalla (`decimales` del
       * catálogo), así que el chat y la tarjeta dicen la misma cifra. El
       * histórico ya lo hacía por su cuenta, en `resumirSerie`.
       */
      valor: redondear(s.valor, s.decimales),
      ...(s.texto ? { texto: s.texto } : {}),
      unidad: s.unidad || null,
      estado: estadoInfo(s.estado).label,
      ...(s.estado === 'reposo'
        ? { porQueReposo: 'El sistema no está impulsando, así que esta señal no significa nada ahora.' }
        : {}),
      ...(u ? { banda: bandaLegible(u) } : {}),
      historia: s.historizado,
      ...(s.nota ? { nota: s.nota } : {}),
    }
  }

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

  const herramientas = {
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
    async estado_del_sistema() {
      const lectura = await leerSistema()
      if (!lectura.ok) {
        return fallo(
          `No se pudo leer la instalación del servidor ICONICS: ${lectura.error}`
        )
      }

      const s = lectura.sistema
      const r = s.resumen

      return {
        ok: true,
        instalacion: 'Sistema de agua industrial',
        raiz: RAIZ,
        fuente: 'tiempo real',
        /*
         * La hora, en local y legible, NO en ISO.
         *
         * Medido con el 4B: con `2026-08-18T14:48:44.253Z` delante lo copió
         * tal cual en la respuesta —«leído a las 2026-08-18T14:48:44.253Z»—.
         * El operador no lee eso, y además está en UTC, así que en España
         * marcaría dos horas menos que el reloj de la pared.
         */
        leidoA: horaLocal(lectura.receivedAt),

        estadoGeneral: estadoInfo(s.estado).label,
        enReposo: s.enReposo,
        ...(s.enReposo
          ? {
            queSignificaReposo:
                'La instalación no está impulsando agua: el motor está a cero y no circula caudal. ' +
                'Es su situación habitual. Las señales que sólo tienen sentido en marcha (caudal, ' +
                'presión, carga del motor y eficiencia) no se evalúan contra su banda mientras dure, ' +
                'y aparecen como «En reposo» en vez de fuera de límite.',
          }
          : {}),

        recuento: {
          senales: r.totalSenales,
          conMedicion: r.medidas,
          enBanda: r.enBanda,
          enAviso: r.enAviso,
          fueraDeLimite: r.fueraDeLimite,
          sinDato: r.sinDato,
        },

        // Agrupadas como en la pantalla: cada activo responde una pregunta
        // («¿hay agua?», «¿se está impulsando?»), y esa agrupación es NUESTRA
        // porque el servidor no publica equipos bajo esta raíz.
        activos: ACTIVO_IDS.map(id => {
          const a = s.activos.find(x => x.id === id)
          return {
            activo: ACTIVOS[id].label,
            responde: ACTIVOS[id].pregunta,
            estado: estadoInfo(a.estado).label,
            senales: a.senales.map(describirSenal),
          }
        }),

        conHistoria: historizadas().map(k => SENALES[k].label),
        ...(DERIVADO ? avisoDeUmbrales() : {}),
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
      if (!clave) return senalDesconocida(senal)

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

      const resumen = resumirSerie(serie.datos, meta.decimales)
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
     * La misma señal en dos períodos, con su diferencia.
     *
     * La diferencia se calcula AQUÍ. Es la misma regla que ya regía con el OEE:
     * pedirle al modelo que reste dos números es pedirle aritmética, y una
     * resta mal hecha en la frase final estropea una consulta que salió bien.
     */
    async comparar_periodos({ senal, periodoA, periodoB } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal)

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
     * Análisis estadístico y proyección de una señal.
     */
    async analisis_de_senal({ senal, periodo, horizonteMinutos = 60 } = {}) {
      const clave = resolverSenal(senal)
      if (!clave) return senalDesconocida(senal)
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

      const pendientePorHora = regresion ? +(regresion.pendiente * 3600).toFixed(3) : null

      return {
        ok: true,
        senal: meta.label,
        periodo: v.etiqueta,
        unidad: meta.unidad || null,
        estadisticas: stats,
        tendencia: regresion
          ? {
              direccion:
                Math.abs(pendientePorHora) < 0.01
                  ? 'estable'
                  : pendientePorHora > 0
                    ? 'subiendo'
                    : 'bajando',
              cambioPorHora: pendientePorHora,
              ajuste: `${Math.round(regresion.r2 * 100)} de 100`,
              nota:
                regresion.r2 < 0.4
                  ? 'El ajuste es bajo: hay mucho ruido y la tendencia no es muy fiable.'
                  : 'El ajuste es razonable para esta ventana.',
            }
          : { direccion: 'sin datos suficientes para calcularla' },
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
        if (!clave) return senalDesconocida(nombre)
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
        aviso:
          'CORRELACIÓN NO ES CAUSA. Que dos señales se muevan juntas es un indicio de que ' +
          'algo las relaciona, no una prueba de que una cause la otra: puede haber una tercera ' +
          'causa común, o ser casualidad en una ventana corta. Dilo así al redactar, y no ' +
          'afirmes una causa que estos datos no demuestran.',
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
      if (!clave) return senalDesconocida(senal)
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

      const resumen = resumirSerie(serie.datos, meta.decimales)

      return {
        ok: true,
        senal: meta.label,
        periodo: v.etiqueta,
        fuente: 'historiador',
        unidad: meta.unidad || null,
        // El resumen, para que el modelo pueda hablar de la curva que no ve.
        ...(resumen ?? {}),
        graficoEntregado: true,
        nota:
          'El gráfico ya se le ha enviado a la pantalla del usuario; no hace falta que lo ' +
          'describas punto por punto. Menciona que lo acompañas y comenta lo que se ve usando ' +
          'las cifras de este resumen.',
        _adjunto: { tipo: 'grafico', formato: 'svg', contenido: svg, titulo: meta.label },
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
        aviso:
          'Cita el documento y la página de donde viene cada dato. La relevancia va de 0 a 1: ' +
          'por debajo de 0,4 el fragmento probablemente no responde la pregunta, y entonces di ' +
          'que no lo has encontrado en vez de completarlo con conocimiento general. Estos ' +
          'fragmentos son del manual, NO son mediciones de la instalación.',
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
 * `HH:MM:SS` → segundos desde medianoche.
 *
 * Se comparan horas ya formateadas y no marcas de tiempo porque es la
 * resolución con la que se van a citar. La contrapartida —dos anomalías a un
 * lado y otro de la medianoche salen a 24 h de distancia en vez de a un
 * segundo— es aceptable: la ventana máxima son 7 días y una coincidencia
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
      name: 'estado_del_sistema',
      description:
        'Estado de TODA la instalación de agua ahora mismo, de una sola vez: las ocho señales con ' +
        'su valor, su unidad, su estado y su banda de límites; los cuatro activos (tanque, grupo ' +
        'de bombeo, red de distribución y suministro eléctrico) con su estado; si la instalación ' +
        'está impulsando o en reposo; y cuántas señales están en banda, en aviso, fuera de límite ' +
        'o sin dato. Úsala para "¿cómo va la instalación?", "¿está bombeando?", "¿qué nivel tiene ' +
        'el tanque?", "¿hay algo fuera de límite?", "¿qué temperatura hay?" y para CUALQUIER ' +
        'pregunta sobre el momento actual. NO la llames varias veces: lo devuelve todo junto, ' +
        'incluidas las señales que no tienen historia.',
      parameters: { type: 'object', properties: {}, required: [] },
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
              '"hoy", "ayer", "2026-07-20", "ayer a las 12", "últimos 3 días", "la última semana". ' +
              'MÁXIMO 7 días: un mes entero no cabe, y si lo piden llama igualmente y la ' +
              'herramienta te dará las alternativas. Si el usuario no dice período, omítelo y se ' +
              'usan las últimas 6 horas. NO lo conviertas tú a fechas: pásalo tal cual y el ' +
              'servidor lo resuelve.',
          },
        },
        required: ['senal'],
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
        'el nivel?", "¿cómo se está comportando la presión?", "¿hay algo raro en la temperatura?". ' +
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
]
