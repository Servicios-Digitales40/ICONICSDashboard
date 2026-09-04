/**
 * El modelo físico del SISTEMA DE VIBRACIONES: **la señal, no el transporte**.
 *
 * Hermano de `simulador.js`, y hermano **separado** a propósito. Aquel describe
 * el tanque y su grupo de bombeo; esto describe el motor con acelerómetros, que
 * tiene otro PLC, otro variador y ningún punto en común con el otro. Un solo
 * archivo con las dos instalaciones sería la invitación exacta a que alguien
 * hiciera depender la vibración de aquí del caudal de allí — la correlación que
 * `vibraciones.js` lleva su cabecera entera pidiendo que no se haga.
 *
 * Lo comparten dos programas, igual que `simulador.js`: el transporte simulado
 * del FRONTEND (`Demo-EVA/data/simuladorVibracion.js`), por el mismo hueco por
 * el que entrarían lecturas reales, y el transporte falso del BACKEND
 * (`backend/iconics/fakeClient.mjs`, `ICONICS_FAKE=true`), con la forma del
 * cliente REST. La física se escribe una vez.
 *
 * ── QUÉ DEVUELVE, Y POR QUÉ TRES COSAS Y NO DOS ────────────────────
 *
 *   `undefined`  el punto no es de este árbol. El transporte lo ignora, igual
 *                que hace el servidor real con lo que no tiene.
 *   `null`       el punto ES de este árbol y AHORA MISMO no entrega valor. El
 *                transporte lo sirve con calidad mala.
 *   otra cosa    el valor: número, booleano o la cadena base64 de un estado.
 *
 * La distinción entre las dos primeras es la mitad de lo que este simulador
 * tiene que enseñar. Un modelo que sirviera los veintiún puntos siempre buenos
 * dejaría la pantalla de riesgos sin su sección «Sin comprobar», que es
 * exactamente la que la separa de un contador de alarmas — y la máquina real
 * se calla continuamente.
 *
 * ── LO QUE SE CALLA, Y POR QUÉ ESOS Y NO OTROS ─────────────────────
 *
 * No es una elección de diseño: está MEDIDO. El 26-08-2026 a las 13:10:31,
 * quince de veintiún puntos dejaron de entregar valor de golpe. Sobrevivieron
 * `aRMS` y `aPeak`, que se miden sin conocer la velocidad; murieron todos los
 * `vRMS` —que necesitan la velocidad para integrar la aceleración— y el
 * variador entero, que es de donde sale esa velocidad.
 *
 * Aquí eso es el PARO: durante los dos últimos minutos de cada ciclo el
 * variador no publica, y con él se van los `vRMS`, los `DKW` y sus estados de
 * vigilancia y confianza. La aceleración sigue. Ver la cabecera de
 * `Demo-EVA/data/vibracion.js`, que es donde se documentó el suceso.
 *
 * Y hay un punto que se calla SIEMPRE: `DKW_S1`. El 25-08-2026 devolvía calidad
 * mala mientras S2 y S3 daban número, y tiene sentido físico — el DKW es
 * relativo a una referencia que el módulo aprende con la máquina sana, y ese
 * canal no la tiene aprendida. Por eso su vigilancia sale «apagada» y su
 * confianza tampoco tiene valor: las tres cosas dicen lo mismo.
 *
 * ── POR QUÉ ES PURA ────────────────────────────────────────────────
 *
 * Ningún `Math.random()`. Recargar la página no da un salto, dos navegadores
 * abiertos a la vez enseñan lo mismo, y el backend y el frontend sirviendo el
 * mismo instante coinciden. Lo aleatorio —huecos, calidad mala, latencia— es
 * cosa del transporte, que es donde un suceso pasajero pertenece.
 *
 * ── LOS HELPERS SE REPITEN Y NO SE IMPORTAN ────────────────────────
 *
 * `onda`, `frac` y `rizado` son cuatro líneas de trigonometría y están también
 * en `simulador.js`. Importarlas de allí ataría este modelo al del tanque por
 * la única razón de ahorrar cuatro líneas, y el día que aquel quisiera cambiar
 * su rizado se lo cambiaría a una máquina que no es la suya.
 */
import {
  LIMITES_ISO,
  QC_NOMINAL,
  codificarVigilancia,
  parsePunto,
} from './vibraciones.js'

const TAU = Math.PI * 2
const frac = x => x - Math.floor(x)

/** Onda senoidal en [-1, 1] con periodo y desfase propios. */
const onda = (ms, periodoMs, desfase = 0) => Math.sin(TAU * (ms / periodoMs + desfase))

/** Rizado determinista: pequeño, rápido y distinto por señal. */
function rizado(ms, semilla, amplitud) {
  return (
    amplitud *
    (Math.sin(TAU * (ms / 9_000 + semilla * 0.41)) * 0.6 +
      Math.sin(TAU * (ms / 3_700 + semilla * 0.83)) * 0.4)
  )
}

/** Arrastra un valor hacia un objetivo con la intensidad del evento. */
const haciaObjetivo = (base, objetivo, intensidad) => base + (objetivo - base) * intensidad

/* ── Los dos relojes ────────────────────────────────────────────── */

/**
 * Arranque y paro del motor. Diez minutos, y no los seis del ciclo de bombeo
 * del tanque: son dos máquinas y no tienen por qué latir a la vez. Que los dos
 * periodos no coincidan evita además que las dos secciones parezcan moverse al
 * unísono, que insinuaría una relación que no existe.
 */
export const CICLO_VIB_MS = 10 * 60_000

/** Qué parte del ciclo está el motor girando. */
const FRACCION_MARCHA = 0.8

/** Deriva lenta: es la que pasea la velocidad por las tres bandas de ISO. */
export const JORNADA_VIB_MS = 4 * 3_600_000

/** Posición dentro del ciclo del motor, en [0, 1). */
export const faseCicloVib = ms => frac(ms / CICLO_VIB_MS)

/** ¿Está el motor girando en este instante? */
export const enMarchaVib = ms => faseCicloVib(ms) < FRACCION_MARCHA

/**
 * Los últimos veinticuatro segundos de la marcha son la RAMPA DE PARADA: el
 * variador baja la consigna antes de dejar de publicar, no se apaga de golpe.
 *
 * Que exista no es cosmético. Durante esa bajada el motor pasa por debajo de
 * las 120 rpm que el SM 1281 necesita para medir, y esa es la única forma de
 * ver en el simulador lo que la pantalla dice cuando el módulo está midiendo
 * por debajo de su mínimo. Con un corte instantáneo, esa regla no se disparaba
 * nunca y la máquina saltaba de 900 rpm al silencio en un ciclo de sondeo,
 * que es algo que ningún variador hace.
 */
const RAMPA_PARO = 0.04

/** Régimen en [0, 1]: 1 en marcha plena, bajando en la rampa, 0 parado. */
function regimen(ms) {
  const f = faseCicloVib(ms)
  if (f >= FRACCION_MARCHA) return 0
  const desde = FRACCION_MARCHA - RAMPA_PARO
  return f <= desde ? 1 : (FRACCION_MARCHA - f) / RAMPA_PARO
}

/* ── Eventos ────────────────────────────────────────────────────── */

/**
 * Qué le pasa al motor en cada ciclo. Ocho ciclos —80 min— y vuelta a empezar.
 *
 * Los cinco están elegidos para tocar familias de regla DISTINTAS de
 * `riesgosVibracion.js`: el rodamiento mueve la aceleración y la asimetría
 * entre apoyos, el desequilibrio mueve la velocidad eficaz contra ISO, el
 * vacío invalida la medida sin que nada esté mal, el sensor suelto es del
 * montaje y no de la máquina, y el fallo es del variador. Un simulador con un
 * solo evento dejaría cuatro quintas partes de la pantalla sin ejercitar.
 */
const EVENTOS = ['', 'rodamiento', '', 'desequilibrio', 'enVacio', 'sensorSuelto', '', 'falloVariador']

/** Cuándo empieza y acaba un evento dentro de su ciclo; siempre en marcha. */
const EVENTO_DESDE = 0.15
const EVENTO_HASTA = 0.7

/**
 * El apoyo al que le toca cada evento local.
 *
 * `rodamiento` va a S3 y no a S1 por un motivo que no es estético: `DKW_S1` no
 * entrega valor (ver cabecera), así que una degradación en S1 no podría
 * enseñar cómo sube el valor de daño ni cómo cae su confianza — que son dos
 * tercios de lo que un rodamiento picado se ve venir. S3 sí publica DKW.
 *
 * ── ESTE PÁRRAFO DECÍA ALGO MÁS, Y ERA FALSO (04-09-2026) ──────────
 *
 * Decía además que S3 «sí tiene rodamiento de catálogo (`6204 ZZ`)», y que S2
 * era «el único de los tres sin rodamiento conocido». Las dos frases se
 * cayeron a la vez cuando el levantamiento de campo situó S2 y S3 sobre las
 * chumaceras del tren de rotor y no sobre el motor: el 6204 era el rodamiento
 * del lado ventilador del WEG, una pieza que S3 no está midiendo. Ver la
 * cabecera de `vibraciones.js`.
 *
 * Hoy **ni S2 ni S3 tienen rodamiento identificado**, así que el reparto ya no
 * se puede justificar por ahí. Lo que queda en pie:
 *
 *   `rodamiento`    → S3, por el DKW, que es la mitad que sí seguía siendo
 *                     cierta. Que el rodamiento sea desconocido no impide
 *                     simular su degradación: el evento mueve aRMS, aPeak y
 *                     DKW, ninguno de los cuales necesita la geometría de la
 *                     pieza. Lo que no se puede es calcular su BPFO — y el
 *                     simulador nunca lo hizo.
 *   `sensorSuelto`  → S2, por separación y no por catálogo: tiene que caer en
 *                     un apoyo distinto del que lleva el evento de rodamiento
 *                     para que los dos no se solapen y se puedan leer por
 *                     separado en la pantalla.
 */
const CANAL_DEL_EVENTO = { rodamiento: 'S3', sensorSuelto: 'S2' }

/**
 * Evento activo, con su intensidad en [0, 1].
 *
 * Sube y baja como medio seno en vez de encenderse de golpe: una transición
 * instantánea saltaría de «en banda» a «en alarma» sin pasar por el aviso, y
 * el aviso es el estado que la pantalla existe para enseñar.
 */
export function eventoVibDe(ms) {
  const nombre = EVENTOS[Math.floor(ms / CICLO_VIB_MS) % EVENTOS.length]
  if (!nombre) return null

  const f = faseCicloVib(ms)
  if (f < EVENTO_DESDE || f > EVENTO_HASTA) return null

  return {
    nombre,
    canal: CANAL_DEL_EVENTO[nombre] ?? null,
    intensidad: Math.sin(Math.PI * ((f - EVENTO_DESDE) / (EVENTO_HASTA - EVENTO_DESDE))),
  }
}

/** ¿Le toca a ESTE canal el evento activo? Los de máquina no tienen canal. */
const afecta = (ev, nombre, canalId) => ev?.nombre === nombre && ev.canal === canalId

/* ── El variador ────────────────────────────────────────────────── */

/**
 * Velocidad del motor, en rpm.
 *
 * El recorrido —de ~420 a ~1380 rpm a lo largo de la jornada— está elegido
 * para CRUZAR los tres cortes que `riesgosVibracion.js` conoce: las 600 rpm
 * por debajo de las cuales ISO 10816 no se pronuncia, las 720 del borde en el
 * que el veredicto vale pero el margen no se ve, y el resto de la banda donde
 * la norma manda sin matices. Una velocidad cómoda en 1450 dejaría dos de las
 * tres reglas de norma sin ejercitar nunca.
 */
function velocidadEn(ms) {
  return (900 + 480 * onda(ms, JORNADA_VIB_MS, 0.05) + rizado(ms, 1, 4)) * regimen(ms)
}

/** Motor de cuatro polos: 1500 rpm de sincronismo a 50 Hz. */
const rpmAHz = rpm => rpm / 30

/**
 * El par, en % del nominal. `enVacio` lo baja hasta ser indistinguible de
 * cero, que es lo que ve el variador cuando el motor gira sin arrastrar nada.
 */
function parEn(ms, ev) {
  const base = (38 + 22 * onda(ms, JORNADA_VIB_MS * 0.7, 0.3) + rizado(ms, 2, 1.4)) * regimen(ms)
  return ev?.nombre === 'enVacio' ? haciaObjetivo(base, 0.6, ev.intensidad) : base
}

/** Valor de un tag del variador, o `null` si no está publicando. */
function valorVariador(clave, ms) {
  if (!enMarchaVib(ms)) return null

  const ev = eventoVibDe(ms)
  const rpm = velocidadEn(ms)
  const hz = rpmAHz(rpm)
  const par = parEn(ms, ev)
  const enFallo = ev?.nombre === 'falloVariador' && ev.intensidad > 0.5

  switch (clave) {
    case 'velocidad':
      return rpm
    case 'frecuencia':
      return hz
    /* Control escalar: la tensión sigue a la frecuencia hasta el nominal. */
    case 'tensionSalida':
      return Math.min(400, 400 * (hz / 50))
    case 'corriente':
      return 1.6 + 2.1 * (par / 100) + rizado(ms, 3, 0.06)
    case 'par':
      return par
    /* 1,5 kW de placa: la potencia es el par por la velocidad, no un tercer
       número independiente. Que cuadren importa — `medida-en-vacio` mira el
       par, y una potencia alta al lado lo desmentiría. */
    case 'potencia':
      return 1.5 * (par / 100) * (rpm / 1450)
    case 'busCC':
      return 325 + rizado(ms, 4, 1.8)
    /* Código 7 del V20: sobretensión del bus. `ultimoFallo` lo recuerda
       siempre, porque un variador guarda el último aunque ya no esté en él. */
    case 'fallo':
      return enFallo ? 7 : 0
    case 'ultimoFallo':
      return 7
    case 'aviso':
      return ev?.nombre === 'falloVariador' ? 1 : 0
    case 'listo':
      return enFallo ? 0 : 1
    case 'habilitado':
      return enFallo ? 0 : 1
    default:
      return undefined
  }
}

/* ── Los tres apoyos ────────────────────────────────────────────── */

/**
 * Aceleración eficaz de fondo de cada apoyo, en m/s².
 *
 * Los tres son distintos y ninguno es redondo: tres sondas del mismo motor no
 * miden lo mismo, y hacerlas coincidir enseñaría una máquina que no existe.
 * Están además lo bastante cerca entre sí como para que la regla de asimetría
 * —tres veces la mediana de los demás— NO salte sin un evento detrás.
 */
const ARMS_BASE = { S1: 0.86, S2: 0.63, S3: 0.74 }

/** Semilla de rizado por apoyo, para que no se muevan los tres a la vez. */
const SEMILLA = { S1: 11, S2: 12, S3: 13 }

/**
 * Aceleración eficaz de un apoyo. Se mide SIN conocer la velocidad, así que
 * sobrevive al paro del variador — es lo que se observó el 26-08.
 */
function aRMSEn(canalId, ms) {
  const ev = eventoVibDe(ms)
  const semilla = SEMILLA[canalId] ?? 10

  // Parado, un acelerómetro no marca cero: marca el ruido de la planta.
  if (!enMarchaVib(ms)) return 0.05 + Math.abs(rizado(ms, semilla, 0.02))

  const carga = parEn(ms, ev) / 40
  const base =
    (ARMS_BASE[canalId] ?? 0.7) * (0.75 + 0.35 * carga) +
    0.09 * onda(ms, JORNADA_VIB_MS * 0.8, semilla * 0.1) +
    rizado(ms, semilla, 0.04)

  /* Un rodamiento picado sube la energía de alta frecuencia mucho antes de
     que se note en la velocidad. 2,9 m/s² sobre una mediana de ~0,7 son más
     de cuatro veces: cruza las tres de `asimetria-entre-apoyos` con margen.
     El techo no es libre — el pico sale de multiplicar esto por el factor de
     cresta, y tiene que caber en la `escala` de 0-20 que el catálogo declara
     para `aPeak` y sobre la que están construidos el arco y las barras. */
  return afecta(ev, 'rodamiento', canalId)
    ? haciaObjetivo(base, 2.9, ev.intensidad)
    : base
}

/**
 * A dónde lleva el desequilibrio la velocidad eficaz de cada apoyo.
 *
 * S3 pasa el 4,5 mm/s de la zona D de ISO; S1 y S2 se quedan en el aviso. Que
 * los tres suban a la vez es lo que distingue un desequilibrio —un problema de
 * toda la máquina— de un rodamiento, que es de un apoyo. Las dos formas se
 * pueden ver en la misma pantalla con veinte minutos de diferencia.
 */
const VRMS_OBJETIVO = { S1: 3.1, S2: 2.4, S3: LIMITES_ISO.alarma + 0.7 }

/** Velocidad eficaz de un apoyo, en mm/s, o `null` sin variador. */
function vRMSEn(canalId, ms) {
  if (!enMarchaVib(ms)) return null

  const ev = eventoVibDe(ms)
  const semilla = SEMILLA[canalId] ?? 10
  const rpm = velocidadEn(ms)

  /* La velocidad eficaz crece con el régimen: a 400 rpm la misma máquina
     vibra menos que a 1400, y sin esto la banda ISO no diría nada del punto
     de trabajo. */
  const base =
    0.55 * (0.55 + 0.75 * (rpm / 1200)) +
    0.12 * onda(ms, JORNADA_VIB_MS * 0.9, semilla * 0.07) +
    rizado(ms, semilla + 3, 0.05)

  return ev?.nombre === 'desequilibrio'
    ? haciaObjetivo(base, VRMS_OBJETIVO[canalId] ?? 2.2, ev.intensidad)
    : base
}

/**
 * El valor de daño de un apoyo, o `null`.
 *
 * `S1` no lo entrega NUNCA: no tiene referencia aprendida (ver cabecera). Los
 * otros dos rondan el 1, que es «como cuando se aprendió», y el rodamiento
 * lleva al suyo a 4,8 — casi cinco veces peor que sano.
 */
function dkwEn(canalId, ms) {
  if (canalId === 'S1') return null
  if (!enMarchaVib(ms)) return null

  const ev = eventoVibDe(ms)
  const semilla = SEMILLA[canalId] ?? 10
  const base =
    1.05 + 0.22 * onda(ms, JORNADA_VIB_MS * 1.1, semilla * 0.05) + rizado(ms, semilla + 6, 0.05)

  return afecta(ev, 'rodamiento', canalId)
    ? haciaObjetivo(base, 4.8, ev.intensidad)
    : base
}

/** Desviación del sensor. Cero salvo que el montaje se afloje. */
function offsetEn(canalId, ms) {
  const ev = eventoVibDe(ms)
  return afecta(ev, 'sensorSuelto', canalId) ? 0.42 * ev.intensidad : 0
}

/* ── Los estados que publica el módulo ──────────────────────────── */

const APAGADO = 0
const OK = 1
const EN_AVISO = 2

/**
 * Estado de una vigilancia, ya en base64, o `null`.
 *
 * Las tres de rodamiento salen APAGADAS, y no es un descuido del simulador: es
 * lo que se midió el 26-08-2026 en los tres canales. La pantalla tiene una
 * regla entera —`rodamientos-sin-vigilar`— dedicada a decirlo, y un simulador
 * que las encendiera dejaría esa regla sin disparar jamás mientras la máquina
 * real vive con ellas apagadas.
 *
 * La excepción es el apoyo al que le toca el evento de rodamiento: su BPFO
 * pasa a aviso. Es la única forma de ver qué hace la pantalla cuando el módulo
 * —y no nosotros— dice que algo pasa en el espectro de envolvente.
 */
function vigilanciaEn(clave, canalId, ms) {
  const ev = eventoVibDe(ms)
  const marcha = enMarchaVib(ms)

  // Sin variador no hay velocidad, y sin velocidad estas dos no se calculan.
  if (!marcha && (clave === 'monVRMS' || clave === 'monDKW')) return null

  switch (clave) {
    case 'monVRMS':
    case 'monARMS':
    case 'monEspectroA':
    case 'monEspectroV':
      return codificarVigilancia(OK)
    /* Sin referencia aprendida no hay nada que vigilar en S1, y el módulo lo
       dice: apagada. Es coherente con que su DKW no entregue valor. */
    case 'monDKW':
      return codificarVigilancia(canalId === 'S1' ? APAGADO : OK)
    case 'bpfo':
      return codificarVigilancia(
        afecta(ev, 'rodamiento', canalId) && ev.intensidad > 0.35 ? EN_AVISO : APAGADO,
      )
    case 'bpfi':
    case 'ftf':
      return codificarVigilancia(APAGADO)
    default:
      return undefined
  }
}

/**
 * Confianza de una medida. Vale 1 con la máquina sana —es lo que se midió— y
 * cae cuando el módulo deja de fiarse de lo que mide: un rodamiento degradado
 * ensucia el espectro del que sale el valor de daño.
 */
function calidadEn(clave, canalId, ms) {
  const ev = eventoVibDe(ms)
  const marcha = enMarchaVib(ms)

  if (!marcha && (clave === 'qcVRMS' || clave === 'qcDKW')) return null
  // Sin DKW no hay confianza del DKW que publicar: las dos dicen lo mismo.
  if (clave === 'qcDKW' && canalId === 'S1') return null

  if (clave === 'qcDKW' && afecta(ev, 'rodamiento', canalId)) {
    return haciaObjetivo(QC_NOMINAL, 0.78, ev.intensidad)
  }
  return QC_NOMINAL
}

/** Estado del propio sensor: montaje y cableado. */
function sensorEn(canalId, ms) {
  const ev = eventoVibDe(ms)
  return codificarVigilancia(
    afecta(ev, 'sensorSuelto', canalId) && ev.intensidad > 0.3 ? EN_AVISO : OK,
  )
}

/* ── El servidor de alarmas ─────────────────────────────────────── */

/**
 * Los contadores del área `DEMO VIBRACIONES`.
 *
 * No se deducen de los riesgos que calcula la pantalla: son de ICONICS, que
 * vigila esta área con 57 alarmas puestas por quien conoce el proceso, y
 * MANDAN sobre lo que se concluya aquí. Aquí se modelan como lo que son —un
 * contador que sube cuando algo pasa—.
 *
 * `normalSinReconocer` nunca baja a cero: son alarmas que dispararon,
 * volvieron a normal y nadie reconoció. En una planta de verdad ese contador
 * arrastra semanas, y es lo que hace visible la regla `alarmas-sin-reconocer`
 * en los ciclos en los que no hay ninguna activa.
 */
function alarmaEn(clave, ms) {
  const ev = eventoVibDe(ms)
  const ciclo = Math.floor(ms / CICLO_VIB_MS)
  const activas = ev ? 1 + Math.floor(2 * ev.intensidad) : 0

  switch (clave) {
    case 'activasSinReconocer':
      return activas
    case 'activasReconocidas':
      return ev?.nombre === 'desequilibrio' && ev.intensidad > 0.6 ? 1 : 0
    case 'normalSinReconocer':
      return 3 + (ciclo % 7)
    /* Severidad OPC A&E, de 1 a 1000. 800 es «high», 500 «medium». Sin
       alarmas activas no hay severidad que dar: cero, no `null`, porque el
       contador existe y vale cero. */
    case 'severidadActivas':
      if (!activas) return 0
      return ev?.nombre === 'rodamiento' || ev?.nombre === 'desequilibrio' ? 800 : 500
    default:
      return undefined
  }
}

/* ── La puerta ──────────────────────────────────────────────────── */

/**
 * Valor de un punto del árbol de vibraciones en un instante. Pura.
 *
 * @param {string} nombre  nombre completo del punto, tal y como lo escribe el
 *                         servidor (con sus erratas: ver `vibraciones.js`)
 * @param {number} ms      reloj de pared
 * @returns {number|boolean|string|null|undefined}
 */
export function valorVibracionEn(nombre, ms) {
  const p = parsePunto(nombre)
  if (!p) return undefined

  switch (p.tipo) {
    case 'medida':
      switch (p.clave) {
        case 'vRMS':
          return vRMSEn(p.canal, ms)
        case 'aRMS':
          return aRMSEn(p.canal, ms)
        /* El pico contra el eficaz es el factor de cresta, y no es un número
           libre: un rodamiento picado da golpes secos, así que la cresta sube
           con él. Derivarlo del aRMS en vez de sortearlo aparte es lo que hace
           que las dos medidas cuenten la misma historia. */
        case 'aPeak': {
          const ev = eventoVibDe(ms)
          const cresta = afecta(ev, 'rodamiento', p.canal)
            ? haciaObjetivo(3.4, 6.4, ev.intensidad)
            : 3.4 + rizado(ms, SEMILLA[p.canal] ?? 10, 0.12)
          return aRMSEn(p.canal, ms) * cresta
        }
        case 'DKW':
          return dkwEn(p.canal, ms)
        default:
          return undefined
      }

    case 'bandera':
      switch (p.clave) {
        /* Las dos banderas del módulo salen de SU propio umbral, que aquí se
           hace coincidir con el de ISO porque es el único que conocemos. Son
           booleanas y las publica el PLC, así que sobreviven al paro del
           variador — pero sin `vRMS` no hay nada que comparar: `false`, que es
           lo que publica un módulo que no ha disparado. */
        case 'alarma': {
          const v = vRMSEn(p.canal, ms)
          return v !== null && v > LIMITES_ISO.alarma
        }
        case 'aviso': {
          const v = vRMSEn(p.canal, ms)
          return v !== null && v > LIMITES_ISO.aviso
        }
        case 'offset':
          return offsetEn(p.canal, ms)
        default:
          return undefined
      }

    case 'vigilancia':
      return vigilanciaEn(p.clave, p.canal, ms)

    case 'calidad':
      return calidadEn(p.clave, p.canal, ms)

    case 'sensor':
      return sensorEn(p.canal, ms)

    case 'variador':
      return valorVariador(p.clave, ms)

    /* Los contadores del área. `parsePunto` los marca `alarma` igual que a la
       bandera del canal, y se distinguen por el ámbito: éstos no tienen canal. */
    case 'alarma':
      return alarmaEn(p.clave, ms)

    default:
      return undefined
  }
}
