/**
 * Registro de los SISTEMAS de la planta.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque hoy hay dos y mañana habrá más. Sin un sitio donde se declaren, cada
 * sistema nuevo obliga a tocar el asistente, sus instrucciones y cada
 * herramienta: el que sabe qué sistemas existen acaba siendo un `if` repetido
 * en cinco archivos, y el quinto siempre se olvida.
 *
 * Con esto, dar de alta un sistema es añadir una entrada aquí y su catálogo de
 * señales. El asistente lo descubre solo.
 *
 * ── LO QUE ESTE REGISTRO EXISTE PARA IMPEDIR ───────────────────────
 *
 * Que alguien cruce dos sistemas que no se tocan.
 *
 * Los dos que hay hoy están en la misma planta y en el mismo servidor ICONICS,
 * pero son instalaciones **separadas**: distinto motor, distinto variador,
 * distinto PLC. Un modelo al que se le pregunte «¿por qué vibra más cuando
 * sube el caudal?» contestará algo —siempre contesta algo—, y esa frase uniría
 * dos máquinas que no comparten ni un tornillo.
 *
 * Por eso cada entrada declara su `plc` y su `raiz`, y `NO_COMPARTEN` viaja en
 * las instrucciones. Dos sistemas con PLC distinto no se correlacionan sin que
 * alguien lo justifique primero.
 *
 * ── EL CAMPO `limitaciones` NO ES DOCUMENTACIÓN ────────────────────
 *
 * Es lo que el asistente tiene que decir en voz alta al contestar sobre ese
 * sistema. Un dato que no existe y un dato que vale cero se ven igual en una
 * respuesta bien redactada, y la diferencia importa.
 *
 * ── ADEMÁS DE DESCRIBIR, AHORA SIRVE ───────────────────────────────
 *
 * Durante un tiempo este registro fue sólo metadatos para el asistente, y todo
 * lo ejecutable —qué puntos sondear, cómo se parsea uno, de dónde sale su valor
 * simulado— vivía repartido en `if`s por el frontend y por el transporte falso
 * del backend. Cada máquina nueva añadía una rama a cinco funciones de
 * `fakeClient.mjs`, y el fallo que eso produce ya se ha visto DOS veces en este
 * proyecto: un simulador que sólo conoce un árbol deja la máquina nueva
 * respondiendo `value: null` con calidad BUENA. La pantalla no ve un fallo; ve
 * una máquina que contesta y no dice nada.
 *
 * Por eso cada entrada declara ahora también su COMPORTAMIENTO:
 *
 *   raices          prefijos de sus puntos. PLURAL: un sistema puede ocupar más
 *                   de un espacio de nombres (ver la nota de `raices` abajo)
 *   puntos()        todos sus puntos, para registrarlos de una vez
 *   parse(nombre)   nombre → identidad dentro del sistema, o `null`
 *   modelo(n, ms)   valor simulado de un punto. Ver el contrato abajo
 *   esHistorizada() ¿se puede pedir la serie de esta clave sin mentir?
 *   cadenciaMs      cada cuánto se relee esta máquina
 *
 * Con eso, dar de alta un sistema es escribir su catálogo, su física y sus
 * reglas, y añadir una entrada aquí. El transporte falso, el simulado y el
 * asistente lo descubren solos.
 *
 * ── EL CONTRATO DE `modelo` ────────────────────────────────────────
 *
 *   modelo(nombreDePunto, ms) → valor | null | undefined
 *
 *   `undefined`  el punto no es de este sistema
 *   `null`       es de este sistema y AHORA MISMO no entrega valor
 *   otra cosa    el valor
 *
 * Las dos primeras no son lo mismo y no pueden colapsarse. «No es mío» hace
 * que el transporte deje el punto fuera de la respuesta; «no entrega» hace que
 * lo sirva con calidad de sin-dato y **sin `value`**, que es lo que hace el
 * servidor de verdad. Colapsarlas devuelve el fallo de arriba.
 *
 * ── ESTE REGISTRO NO ES UNA PUERTA PARA CRUZAR SISTEMAS ────────────
 *
 * Es la advertencia más importante del archivo, y va aquí porque generalizar
 * hace la infracción MÁS fácil, no menos. En cuanto existe
 * `SISTEMAS.flatMap(s => s.puntos())`, alguien pedirá un solo lote con las dos
 * máquinas y las meterá en el mismo búfer — que es exactamente lo que la
 * cabecera de `Demo-EVA/data/vibracion.js` explica que no debe pasar.
 *
 * Dos reglas, y no son negociables:
 *
 *   · Un motor de sondeo POR SISTEMA. La unificación es del código, nunca del
 *     lote.
 *   · La identidad del sistema viaja PEGADA al punto (`parsePuntoDeSistema`),
 *     no se deduce después mirando el nombre.
 */

/**
 * Forma de un sistema:
 *
 *   id            identificador estable
 *   nombre        cómo se llama para una persona
 *   maquina       qué equipo es, cuando se sabe
 *   plc           de dónde vienen sus datos. DOS SISTEMAS CON PLC DISTINTO
 *                 SON MÁQUINAS DISTINTAS
 *   raices        prefijos de sus puntos en ICONICS (uno o varios)
 *   mide          qué señales tiene, en lenguaje de persona
 *   herramientas  qué puede llamar el asistente para este sistema
 *   historia      qué se puede pedir del pasado, y qué no
 *   limitaciones  lo que hay que confesar al contestar sobre él
 *
 * Y su comportamiento (ver la cabecera):
 *
 *   puntos, parse, modelo, esHistorizada, cadenciaMs
 */
import {
  SENALES,
  SENAL_KEYS,
  TODOS_LOS_PUNTOS,
  RAIZ,
  esHistorizada as esHistorizadaTanque,
  historizadas as historizadasTanque,
  parsePointName,
  pointName,
} from "../tanque/senales.js";
import { valorDePunto } from "../tanque/simulador.js";
import { estadoDelTanque, resumenTanqueParaAsistente } from "../tanque/estadoTanque.js";
import { estadoDeVibraciones, resumenVibracionesParaAsistente } from "../vibraciones/estadoVibraciones.js";
import { MECANISMOS } from "./pronostico.js";
import {
  AREA_ALARMAS,
  BANDERAS as BANDERAS_VIB,
  CALIDADES as CALIDADES_VIB,
  CANALES as CANALES_VIB,
  GRUPO_HISTORIADOR,
  MEDIDAS as MEDIDAS_VIB,
  RAIZ_VIB,
  VARIADOR as VARIADOR_VIB,
  esHistorizada as esHistorizadaVibracion,
  historizadas as historizadasVibracion,
  parsePunto,
  puntoHistorico as puntoHistoricoVibracion,
  todosLosPuntos as todosLosPuntosVibracion,
} from "../vibraciones/vibraciones.js";
import { valorVibracionEn } from "../vibraciones/simuladorVibraciones.js";

export const SISTEMAS = [
  {
    id: "tanque",
    nombre: "Tanque y grupo de bombeo",
    maquina: "Tanque de almacenamiento, bomba, red de distribución y su suministro",
    plc: "PLC_1 · ua:DEMO2",
    raices: [RAIZ],
    puntos: () => TODOS_LOS_PUNTOS,
    /* `parse` devuelve la clave de dominio envuelta, para que las dos máquinas
       tengan la MISMA forma de identidad aunque una la tenga plana y la otra
       necesite tipo, familia y canal. */
    parse: (nombre) => {
      const clave = parsePointName(nombre);
      return clave === null ? null : { tipo: "senal", clave, canal: null };
    },
    modelo: valorDePunto,
    estado: estadoDelTanque,
    /** Cómo se cuenta esta máquina al asistente. Ver `estadoTanque.js`. */
    resumen: resumenTanqueParaAsistente,
    /** Claves de esta máquina, para resolver un nombre de señal. */
    claves: () => SENAL_KEYS,
    etiquetaDe: (clave) => SENALES[clave]?.label ?? null,
    /* Las cuatro formas que ya trae el catálogo. Los SINÓNIMOS de persona
       —«la bomba», «el voltaje»— siguen en el índice de `herramientas.mjs`
       mientras esa tabla no suba al registro (B3 del backlog). */
    aliasDe: (clave) => {
      const s = SENALES[clave];
      return s ? [clave, s.tag, s.label, s.corto].filter(Boolean) : [];
    },
    esHistorizada: esHistorizadaTanque,
    /*
     * ── LA MECÁNICA DEL HISTORIADOR ES DE CADA MÁQUINA ─────────────
     *
     * Estaba dentro de `historia.js`, escrita para el tanque: `ac:` y no
     * `hda:`, `Average` y no `Interpolative`. Otra máquina puede necesitar
     * otra combinación —vibraciones ya sabe que su sitio es `hda:` el día que
     * registre—, y con una sola copia la segunda tendría que elegir entre
     * mentir o tocar el archivo de la primera.
     *
     * `historizadas` es la puerta, y no una lista informativa: a TRES de las
     * ocho señales el historiador les devuelve la serie de la temperatura del
     * tanque, con marcas de tiempo correctas y sin dar error. Lo que no está
     * aquí no se puede pedir.
     */
    series: {
      historizadas: historizadasTanque,
      ruta: "ac:",
      agregado: "Average",
      /* En el tanque el punto histórico se pide con el MISMO nombre que en
         vivo. En vibraciones no, y por eso esto es un campo del registro y no
         una función importada por quien lee. Ver `puntoHistorico` allí. */
      punto: pointName,
      nota:
        "Cinco de las ocho señales tienen serie propia verificada. A las otras tres el " +
        "historiador les devuelve la serie de la temperatura del tanque, sin dar error.",
    },
    /** Mecanismos de desgaste acumulado, para el pronóstico. */
    desgaste: MECANISMOS,
    cadenciaMs: 3_000,
    mide: [
      "nivel y temperatura del tanque",
      "caudal instantáneo y presión relativa de la red",
      "carga del motor y modo del variador",
      "tensión de línea y eficiencia energética",
    ],
    /*
     * Las palabras que Whisper tiene que oír bien EN ESTE SISTEMA. Ver
     * `vocabularioDe` al final del archivo: sin ellas delante, el modelo de
     * audio escribe el vocabulario de planta como le suena —«Cerabar» salía
     * como «cera bar»— y la pregunta llega deformada al asistente.
     */
    vocabulario:
      "tanque, bomba, caudal, presión, nivel, temperatura, tensión de línea, " +
      "variador, derrame, marcha en seco, cavitación, Cerabar",
    /* Qué pantallas hablan de este sistema. Lo usa el dictado para elegir el
       vocabulario, y vive aquí porque «qué pantallas son mías» es una
       propiedad del sistema, no de la interfaz. */
    rutas: ["eva-inicio", "eva-planta", "eva-riesgos", "eva-3d", "eva-alarmas", "eva-assets"],
    herramientas: [
      "estado_del_sistema",
      "historia_de_senal",
      "riesgos_activos",
      "pronostico_de_desgaste",
      "analisis_de_senal",
      "perfil_de_senal",
      "correlacionar_senales",
      "grafico_de_senal",
    ],
    historia: "Cinco de las ocho señales tienen serie propia verificada. Las otras tres NO.",
    limitaciones: [
      "Los límites con los que se evalúa cada señal son estimaciones nuestras para un " +
        "sistema de agua genérico, no rangos confirmados por quien opera la instalación.",
      "El servidor no publica alarmas para este árbol: el estado de cada señal es un " +
        "cálculo del tablero, no un dato de ICONICS.",
      "La correspondencia Automático/Manual del modo del variador no está confirmada.",
    ],
  },
  {
    id: "vibraciones",
    nombre: "Sistema de vibraciones",
    maquina: "Motor WEG W22 143/5T, 2 HP (1,5 kW), 2 polos, con SIPLUS CMS 1200 SM 1281",
    plc: "PLC_2 · ua:DEMO3",
    /*
     * DOS raíces, y por eso el campo es plural.
     *
     * Los contadores de alarma de esta máquina no son puntos de activo: son de
     * AlarmWorX y viven en `ae:`, otro espacio de nombres. Con una sola raíz
     * `ac:TDCON/Motors/01/`, `sistemaDePunto` devolvía `null` para los cuatro
     * —comprobado— y `mismoSistema` contestaba «no sé» sobre dos puntos de la
     * MISMA máquina. No rompía nada porque nadie llamaba a esas funciones
     * todavía; era un fallo esperando a su primer usuario.
     */
    raices: [RAIZ_VIB, AREA_ALARMAS],
    puntos: todosLosPuntosVibracion,
    parse: parsePunto,
    modelo: valorVibracionEn,
    estado: estadoDeVibraciones,
    resumen: resumenVibracionesParaAsistente,
    /* Las claves de esta máquina son compuestas: la familia y su apoyo. Es lo
       que hace que «vRMS» sola sea ambigua —hay tres— y que el resolvedor
       tenga que pedir el apoyo en vez de elegir uno.

       Entran las TRES familias que tienen serie: las medidas, las banderas
       (alarma, aviso, offset) y la calidad de cada medida. Las vigilancias y
       el estado del sensor se quedan fuera porque no se historizan, y este
       método es lo que usa el resolvedor de nombres para saber por qué se
       puede preguntar. */
    claves: () => [
      ...CANALES_VIB.flatMap((c) => [
        ...MEDIDAS_VIB.map((m) => `${m.key}_${c.id}`),
        ...BANDERAS_VIB.map((b) => `${b.key}_${c.id}`),
        ...CALIDADES_VIB.map((q) => `${q.key}_${c.id}`),
      ]),
      ...VARIADOR_VIB.map((v) => v.key),
    ],
    /*
     * ── LOS OTROS NOMBRES CON LOS QUE SE PIDE UNA SEÑAL ────────────
     *
     * La etiqueta de `DKW_S1` es «Valor característico de daño · Lado acople»,
     * y nadie pregunta así. Se pregunta «el DKW del sensor 1» — con el nombre
     * CORTO de la medida, que el catálogo declara y el registro no exponía, y
     * con «sensor N» en vez del rótulo del apoyo.
     *
     * Sin estos alias, «DKW» resolvía a CERO señales: la etiqueta no contiene
     * esas tres letras por ningún lado, y la clave sí las contiene pero la
     * contención exige cuatro caracteres —el umbral que impide que «S1» o
     * «kpi» disparen dentro de otra palabra—. El resultado era que el
     * asistente afirmaba que la señal no existe, teniendo su serie.
     *
     * `aliasDe` es parte del contrato del registro: la máquina que se dé de
     * alta declara cómo la nombra la gente, no sólo cómo la rotula la pantalla.
     */
    aliasDe: (clave) => {
      const v = VARIADOR_VIB.find((x) => x.key === clave);
      if (v) return [v.key, v.label];

      const corte = clave.lastIndexOf("_");
      const base = clave.slice(0, corte);
      const c = CANALES_VIB.find((x) => x.id === clave.slice(corte + 1));
      if (!c) return [];

      const f =
        MEDIDAS_VIB.find((x) => x.key === base) ??
        BANDERAS_VIB.find((x) => x.key === base) ??
        CALIDADES_VIB.find((x) => x.key === base);
      if (!f) return [];

      /* El apoyo se nombra de tres formas: su id (`S1`), su rótulo («Lado
         acople») y «sensor 1», que es como lo dice quien mira la máquina y
         cuenta los acelerómetros. Las tres se cruzan con el nombre corto y con
         el largo de la medida. */
      const numero = c.sufijo.replace(/\D/g, "");
      const apoyos = [c.id, c.label, `sensor ${numero}`, `apoyo ${numero}`];
      const nombres = [f.corto, f.label].filter(Boolean);

      return nombres.flatMap((nom) => apoyos.map((ap) => `${nom} ${ap}`));
    },
    etiquetaDe: (clave) => {
      const v = VARIADOR_VIB.find((x) => x.key === clave);
      if (v) return v.label;

      const corte = clave.lastIndexOf("_");
      const base = clave.slice(0, corte);
      const c = CANALES_VIB.find((x) => x.id === clave.slice(corte + 1));
      if (!c) return null;

      /* Las tres familias de apoyo, en el mismo orden que `claves()`. */
      const f =
        MEDIDAS_VIB.find((x) => x.key === base) ??
        BANDERAS_VIB.find((x) => x.key === base) ??
        CALIDADES_VIB.find((x) => x.key === base);
      return f ? `${f.label} · ${c.label}` : null;
    },
    esHistorizada: esHistorizadaVibracion,
    /*
     * ── CON SERIES DESDE EL 28-08-2026 ─────────────────────────────
     *
     * El grupo `DEMO 3` registra. Veintitrés de las veinticuatro claves tienen
     * serie propia verificada punto por punto contra el servidor.
     *
     * La que falta es `aPeak_S1`, que devuelve la serie de `aRMS_S1` sin dar
     * error — el mismo fallo que el tanque tiene con tres de sus ocho. Por eso
     * `historizadas` es una lista blanca de `vibraciones.js` y no `() => true`.
     *
     * Y por eso la RUTA importa: esta máquina se lee por `hda:` con el grupo
     * en el nombre, al revés que el tanque, que se lee por `ac:` con el mismo
     * nombre que en vivo. Son dos mecánicas distintas y cada una es de su
     * máquina — ver la cabecera de `series` en la entrada del tanque.
     */
    series: {
      historizadas: historizadasVibracion,
      ruta: GRUPO_HISTORIADOR,
      agregado: "Average",
      punto: puntoHistoricoVibracion,
      nota:
        "El grupo DEMO 3 registra 40 de los 73 puntos de esta máquina, sondeados uno a uno el " +
        "28-08-2026: las doce medidas de los tres apoyos (menos aPeak_S1), sus banderas y su " +
        "calidad, y el variador entero. NO se historizan las vigilancias del módulo " +
        "(MonState_*), el estado de los sensores ni los contadores de alarma. La aceleración " +
        "de pico del lado acople (aPeak_S1) queda fuera aunque el servidor conteste: devuelve " +
        "la serie de la aceleración eficaz del mismo apoyo, sin dar error.",
    },
    /* Sin mecanismos de desgaste: sin historia no hay exposición acumulada
       que contar, y un pronóstico sobre el instante sería adivinación. */
    desgaste: null,
    /* Más lenta que el tanque: el SM 1281 publica cada pocos segundos y no
       tiene sentido pedirle más de lo que produce. */
    cadenciaMs: 5_000,
    mide: [
      "velocidad eficaz, aceleración eficaz, pico y valor de daño en TRES apoyos",
      "estado de las vigilancias del módulo, incluidas las frecuencias de defecto de rodamiento",
      "velocidad, frecuencia, par y fallo de su propio variador",
      "contadores del área de alarmas de ICONICS",
    ],
    /*
     * El del tanque no vale aquí: son máquinas distintas y suenan distinto.
     * Preguntando por vibraciones con el vocabulario del agua delante, «lado
     * acople» y «rodamiento» salían deformados — que es justo lo que hace que
     * el asistente conteste sobre otra cosa.
     */
    vocabulario:
      "vibración, rodamiento, lado acople, lado libre, apoyo, velocidad eficaz, " +
      "aceleración eficaz, valor de daño, DKW, aRMS, vRMS, envolvente, espectro, " +
      "BPFO, BPFI, factor de cresta, variador, milímetros por segundo",
    rutas: ["eva-vibraciones"],
    /*
     * Eran una sola —`estado_de_vibraciones`— porque cada herramienta estaba
     * escrita contra la forma de dominio del tanque. Desde que hay una forma
     * común (`estadoMaquina.js`) esta máquina hereda las que no dependen de
     * tener histórico, y las que sí se niegan solas citando `series.nota`.
     */
    /* `historia_de_senal` se suma el 28-08-2026, cuando el grupo del historiador
       empezó a registrar. Las demás de historia —análisis, perfil, correlación,
       gráfico, reporte— siguen resolviendo nombres contra el catálogo del
       tanque y todavía no aceptan `sistema`: ver B3 del backlog. */
    herramientas: ["estado_del_sistema", "riesgos_activos", "historia_de_senal"],
    historia:
      "40 de los 73 puntos tienen serie propia desde el 28-08-2026: medidas, banderas, calidad " +
      "y variador. Las vigilancias del módulo y el estado de los sensores NO se historizan, " +
      "aunque sí se leen en vivo. aPeak_S1 devuelve la serie de aRMS_S1 y queda fuera.",
    limitaciones: [
      "La aceleración de pico del lado acople (aPeak_S1) NO tiene serie propia: el " +
        "historiador devuelve ahí la de la aceleración eficaz del mismo apoyo. No se puede " +
        "hablar de su evolución, aunque las de los otros dos apoyos sí.",
      "Las vigilancias del módulo (MonState_*) y el estado de los sensores se leen EN VIVO " +
        "pero no se historizan: se puede decir cómo están ahora, nunca cómo estaban antes.",
      "El histórico empezó el 26-08-2026: no hay nada anterior, y las primeras horas se " +
        "grabaron mientras la configuración todavía se movía.",
      "Sin mecanismos de desgaste declarados no hay pronóstico: se puede describir cómo ha " +
        "evolucionado una medida, pero NO poner plazo a una avería.",
      "El diagnóstico de rodamientos (BPFO, BPFI, FTF) está apagado en los tres apoyos: " +
        "el módulo no los vigila, así que un rodamiento picándose sólo se verá cuando ya " +
        "haya movido el valor eficaz.",
      "Del servidor de alarmas sólo se leen contadores del área: CUÁL alarma se disparó " +
        "no se puede saber, y su historial tampoco responde.",
      "La máquina suele girar cerca de 604 rpm, pegada al borde inferior de la banda de " +
        "medida de ISO 10816: el veredicto vale, pero la lectura llega recortada.",
    ],
  },
];

/** Sistema por id. */
export const SISTEMA = Object.fromEntries(SISTEMAS.map((s) => [s.id, s]));

/** Ids, en orden de presentación. */
export const SISTEMA_IDS = SISTEMAS.map((s) => s.id);

/**
 * La advertencia que viaja con cualquier respuesta que toque más de un sistema.
 *
 * Se escribe una vez y se cita en las instrucciones del modelo y en las
 * herramientas, para que no haya dos versiones que puedan divergir.
 */
export const NO_COMPARTEN =
  "Cada sistema es una instalación SEPARADA: su propio motor, su propio variador y su " +
  "propio PLC. No relaciones una señal de un sistema con una de otro —ni para explicar, " +
  "ni para correlacionar, ni para sacar una causa— salvo que alguien haya confirmado que " +
  "esos equipos están físicamente conectados. Dos sistemas con PLC distinto no comparten " +
  "nada por estar en la misma planta. " +
  /*
   * ── LA SEGUNDA MITAD, QUE FALTABA Y COSTÓ UNA RESPUESTA MALA ───────
   *
   * Sin ella, este aviso se sobregeneraliza. Preguntado por el nivel del tanque
   * contra la presión de la red, el modelo se negó diciendo que eran «sistemas
   * separados»: no lo son, son dos ACTIVOS del mismo PLC unidos por una
   * tubería, y la correlación que se le pedía era exactamente la buena.
   *
   * Una prohibición sin su límite se aplica de más, y aplicarse de más aquí
   * cuesta lo mismo que aplicarse de menos: una respuesta que no sirve.
   */
  "PERO dentro de una MISMA máquina sus activos SÍ se relacionan: son el mismo PLC y la " +
  "misma instalación, y agrupar sus señales por activo es una comodidad de lectura, no una " +
  "separación. Cruzar señales de activos distintos del mismo sistema es legítimo y a menudo " +
  "es la respuesta.";

/**
 * ¿Estas dos señales son del mismo sistema?
 *
 * Devuelve `null` cuando alguna no se reconoce, y quien llama decide qué hacer
 * con eso. Un `false` de consuelo ante un punto desconocido daría vía libre a
 * correlacionar cualquier cosa que no esté en el registro.
 */
export function mismoSistema(puntoA, puntoB) {
  const a = sistemaDePunto(puntoA);
  const b = sistemaDePunto(puntoB);
  if (!a || !b) return null;
  return a.id === b.id;
}

/**
 * A qué sistema pertenece un punto de ICONICS, o `null`.
 *
 * Mira TODAS las raíces de cada sistema, no una. Con una sola, los cuatro
 * contadores de alarma de vibraciones —que viven en `ae:` y no en `ac:`—
 * quedaban fuera del registro: su propia máquina no los reconocía.
 */
export function sistemaDePunto(punto) {
  if (typeof punto !== "string") return null;
  return SISTEMAS.find((s) => s.raices.some((r) => punto.startsWith(r))) ?? null;
}

/**
 * Punto → `{ sistema, tipo, clave, canal }`, o `null` si no es de nadie.
 *
 * ── POR QUÉ LA IDENTIDAD DEL SISTEMA VIAJA PEGADA ──────────────────
 *
 * Porque la alternativa es deducirla después, y «después» es donde se pierde.
 * Un valor suelto en un búfer no dice de qué máquina es; en cuanto dos sistemas
 * comparten código, la única defensa contra cruzarlos es que su procedencia sea
 * un campo del dato y no algo que haya que volver a mirar.
 *
 * Se prueba primero la raíz —barato, y descarta la mayoría— y sólo después se
 * pide al catálogo del sistema que reconozca el punto. Que la raíz encaje no
 * basta: un tag borrado en el servidor sigue empezando por la raíz correcta, y
 * tiene que verse como dato ausente y nunca como otra señal.
 */
export function parsePuntoDeSistema(punto) {
  const sistema = sistemaDePunto(punto);
  if (!sistema) return null;

  const detalle = sistema.parse(punto);
  return detalle === null ? null : { sistema: sistema.id, ...detalle };
}

/**
 * El valor simulado de un punto, venga de la máquina que venga.
 *
 * Es la función que permite que UN transporte falso sirva la planta entera, y
 * la que hace que añadir una máquina no toque ni el backend ni el frontend:
 * basta con que su entrada del registro traiga `modelo`.
 *
 * Devuelve `undefined` para un punto que no es de ningún sistema — el mismo
 * contrato que cada `modelo` (ver la cabecera), para que quien la llame no
 * tenga que distinguir «no hay sistema» de «el sistema no lo conoce». Las dos
 * cosas significan lo mismo para un transporte: no es mío.
 */
export function valorSimuladoDe(punto, ms) {
  return sistemaDePunto(punto)?.modelo(punto, ms);
}

/**
 * ¿Esta máquina tiene alguna señal con serie propia?
 *
 * Es la puerta del punto 3 del alta: **siempre habrá al menos una**, salvo
 * cuando el servidor todavía no la entregue. Una máquina sin historia se da de
 * alta igual, pero queda declarada como tal y las herramientas de tendencia se
 * NIEGAN citando su nota, en vez de contestar con una serie que no existe o
 * —peor— con la de otra señal.
 */
export function tieneHistoria(sistemaId) {
  return (SISTEMA[sistemaId]?.series?.historizadas() ?? []).length > 0;
}

/** Las claves con serie propia de una máquina. Vacío = no se puede pedir. */
export function historizadasDe(sistemaId) {
  return SISTEMA[sistemaId]?.series?.historizadas() ?? [];
}

/**
 * Qué máquinas reclaman una señal con este nombre.
 *
 * ── POR QUÉ DEVUELVE UNA LISTA Y NO LA PRIMERA ─────────────────────
 *
 * Porque elegir la primera es cómo se contesta correctamente sobre la máquina
 * equivocada. Hoy los dos catálogos no comparten ni un nombre de clave, así
 * que la lista tiene siempre cero o un elemento; con cinco máquinas eso deja
 * de ser cierto —«temperatura» y «presión» son nombres que se repiten en
 * cualquier planta— y quien llame tendrá que preguntar en vez de adivinar.
 *
 * Se compara contra la clave y contra la etiqueta, sin acentos ni mayúsculas,
 * porque quien pregunta escribe «velocidad eficaz» y no `vRMS_S1`.
 *
 * ── POR QUÉ LA IGUALDAD EXACTA NO BASTABA ──────────────────────────
 *
 * Porque nadie escribe la etiqueta entera. Las de esta planta son compuestas
 * —«Velocidad eficaz · Lado acople»— y quien pregunta dice «velocidad eficaz»
 * o «la vibración del motor». Comparando sólo con `===`, TODAS esas frases
 * devolvían lista vacía, y quien llama (`senalDesconocida`) las mandaba al
 * mensaje del tanque: «no hay ninguna señal llamada así, sólo existen las
 * ocho de la lista». Falso, y sobre la máquina equivocada — el mismo error
 * que esta función se escribió para evitar, por la puerta de al lado.
 *
 * Así que hay dos pasadas, y el orden importa:
 *
 *   1. IGUALDAD sobre clave o etiqueta. Si alguien acierta el nombre exacto,
 *      eso manda y no compite con nada.
 *   2. CONTENCIÓN, sólo si la primera no encontró nada en NINGUNA máquina.
 *
 * La segunda pasada es el mismo respaldo que `resolverSenal` ya aplicaba en el
 * backend para el tanque —umbral de 4 caracteres, para que «vdf» o «S1» no
 * disparen dentro de otra palabra—, que estaba escrito para una sola máquina.
 * Aquí sirve a todas.
 *
 * ── LO QUE SIGUE SIN HACERSE: ELEGIR ───────────────────────────────
 *
 * La contención AMPLÍA lo que se reconoce, nunca lo que se decide. Si «eficaz»
 * encaja en tres claves, salen las tres y quien llama pregunta; si encajan en
 * dos máquinas, salen las dos. La regla de esta función no cambia —devolver
 * todo lo que reclama el nombre y no elegir— porque elegir es como se contesta
 * correctamente sobre la instalación equivocada.
 */
const normalizar = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Umbral de la contención: por debajo, un fragmento encaja en cualquier parte. */
const MIN_CONTENCION = 4;

/** Marca «este encaje no fue por contención directa»: no desempata por prefijo. */
const SIN_PREFIJO = -1;

/**
 * Cuánto de un nombre está DICHO dentro de una frase, aunque no seguido.
 *
 * ── POR QUÉ NO BASTA CON `includes` ────────────────────────────────
 *
 * Porque las etiquetas de esta planta llevan su punto de medida pegado
 * —«Velocidad eficaz · Lado acople»— y quien pregunta intercala palabras:
 * «la velocidad eficaz del apoyo 1 ahora mismo». Ahí la etiqueta larga no
 * encaja en NINGÚN sentido: ni la frase la contiene entera, ni ella contiene
 * la frase. El único encaje literal que quedaba era «Velocidad» —la del
 * variador, en rpm— y la función devolvía esa, sola y en singular.
 *
 * Ese es el peor resultado posible: una lista de un elemento se lee como
 * certeza, y la respuesta sale con cifras reales, unidad real y la señal
 * cambiada. Preferimos varios candidatos y una pregunta.
 *
 * Se cuentan las palabras del nombre presentes en la frase, y se devuelve el
 * peso de las que encajaron —no cuántas—, para que compita en la misma escala
 * que `includes`, que mide caracteres. Un nombre a medias vale menos que uno
 * entero, y así «Velocidad eficaz · Lado acople» (dos palabras dichas) gana a
 * «Velocidad» (una), que es justo el desempate que faltaba.
 *
 * Exige que TODAS las palabras largas del nombre estén dichas. Con «velocidad»
 * suelta no se activa: «Lado» y «acople» no aparecen, y entonces esa frase no
 * apunta a un apoyo concreto — que es la verdad, y por eso salen los tres.
 */
function cubiertoPorPalabras(nombre, frase) {
  const palabras = nombre.split(/[^a-z0-9]+/i).filter(Boolean);
  if (palabras.length < 2) return 0;

  /*
   * ── LAS PALABRAS CORTAS CUENTAN, PERO ENTERAS ──────────────────────
   *
   * Antes se descartaban las de menos de cuatro letras, y eso dejaba fuera
   * justo los nombres que la gente usa: «DKW sensor 1» son tres palabras y
   * DOS de ellas —`dkw` y `1`— no llegaban al umbral. El alias entero se
   * ignoraba y «el DKW del sensor 1» resolvía a CERO señales, teniendo serie.
   *
   * La razón del umbral era buena —que «S1» o «kpi» no disparen dentro de
   * otra palabra— así que se conserva por otro camino: las cortas tienen que
   * aparecer como PALABRA COMPLETA en la frase, no como fragmento. «dkw»
   * encaja en «el dkw del sensor 1» y no en «bdkwx»; «1» encaja en «sensor 1»
   * y no dentro de «601 rpm».
   *
   * Las largas siguen valiendo por contención simple: son específicas de por
   * sí y exigirles palabra completa rompería «vibracion» contra «vibraciones».
   */
  let peso = 0;
  for (const p of palabras) {
    const encaja =
      p.length >= MIN_CONTENCION
        ? frase.includes(p)
        : new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`, "i").test(frase);
    if (!encaja) return 0;
    peso += p.length;
  }
  return peso;
}

export function sistemasDeSenal(texto) {
  const q = normalizar(texto);
  if (!q) return [];

  /* Todos los nombres por los que se puede pedir una señal: su clave, su
     etiqueta y los alias que declare su máquina. Ver `aliasDe`. */
  const nombresDe = (sistema, k) =>
    [k, sistema.etiquetaDe(k), ...(sistema.aliasDe?.(k) ?? [])]
      .map(normalizar)
      .filter(Boolean);

  const exactos = [];
  for (const sistema of SISTEMAS) {
    for (const k of sistema.claves()) {
      if (nombresDe(sistema, k).includes(q)) {
        exactos.push({ sistema: sistema.id, clave: k });
      }
    }
  }
  if (exactos.length) return exactos;

  /*
   * Contención en los DOS sentidos, y no es simetría gratuita:
   *
   *   · la frase contiene el nombre → «la velocidad eficaz del apoyo 1 ahora»
   *   · el nombre contiene la frase → «velocidad eficaz» dentro de
   *     «Velocidad eficaz · Lado acople», que es el caso que fallaba
   *
   * El umbral se aplica al lado corto, que es el que puede ser un fragmento.
   *
   * Se anota CUÁNTO encajó, y eso decide la ronda siguiente.
   */
  const contenidos = [];
  for (const sistema of SISTEMAS) {
    for (const k of sistema.claves()) {
      const candidatos = nombresDe(sistema, k);
      let largo = 0;
      let sobra = Infinity;
      for (const n of candidatos) {
        /* Mismo criterio que en `cubiertoPorPalabras`: lo corto vale, pero
           como palabra entera. Sin esto «DKW» —tres letras— no encajaba en
           «DKW_S1» y la señal salía como inexistente teniendo serie. */
        const comoPalabra = (aguja, pajar) =>
          new RegExp(`(^|[^a-z0-9])${aguja}([^a-z0-9]|$)`, "i").test(pajar);
        const encaja =
          (n.length >= MIN_CONTENCION ? q.includes(n) : comoPalabra(n, q)) ||
          (q.length >= MIN_CONTENCION ? n.includes(q) : comoPalabra(q, n));
        const puntos = encaja
          ? Math.min(n.length, q.length)
          : cubiertoPorPalabras(n, q);
        /* Cuánto texto pone el nombre ANTES de lo que se preguntó. Ver el
           desempate: es lo que separa «Velocidad eficaz · Lado acople» de
           «Confianza de la velocidad eficaz · Lado acople», y lo que NO separa
           a los tres apoyos entre sí —su diferencia va detrás—. */
        /*
         * El prefijo sólo desempata cuando el nombre CONTIENE la consulta
         * entera: ahí mide lo que el nombre añade por delante y separa
         * «Velocidad eficaz…» de «Confianza de la velocidad eficaz…».
         *
         * Cuando el encaje fue por palabras sueltas no significa nada, y
         * usarlo elige al azar: preguntado por «S1» a secas —que nombra el
         * apoyo y ninguna medida— ganaba `DKW_S1` sólo por tener el nombre
         * más corto. Son diez señales de ese apoyo y hay que preguntar cuál.
         */
        /*
         * El prefijo mide lo que el nombre pone ANTES de lo preguntado, y sólo
         * dice algo cuando lo preguntado es el nombre de la señal: ahí separa
         * «Velocidad eficaz · Lado acople» de «Confianza de la velocidad
         * eficaz · Lado acople».
         *
         * Si la consulta es sólo el APOYO —«S1», «sensor 1»— lo que queda
         * delante es el nombre de la medida, y elegir el más corto es elegir
         * al azar: `DKW_S1` ganaba a `vRMS_S1` por tener tres letras en vez de
         * cuatro. Son diez señales de ese apoyo y hay que preguntar cuál.
         *
         * Se detecta por el final: si el nombre TERMINA en lo preguntado, lo
         * de delante es la señal misma y no un calificador.
         */
        const soloElFinal = n.includes(q) && n.endsWith(q) && n.length > q.length;
        const prefijo = n.includes(q) && !soloElFinal ? n.indexOf(q) : SIN_PREFIJO;
        if (puntos > largo) {
          largo = puntos;
          sobra = prefijo;
        } else if (puntos === largo && puntos > 0) {
          sobra = Math.min(sobra, prefijo);
        }
      }
      if (largo > 0) contenidos.push({ sistema: sistema.id, clave: k, largo, sobra });
    }
  }

  /*
   * ── SÓLO EL ENCAJE MÁS LARGO, Y POR QUÉ ES UNA SALVAGUARDA ─────────
   *
   * «Velocidad» (rpm del variador) está CONTENIDA en «velocidad eficaz»
   * (mm/s de un acelerómetro). Son dos señales distintas, de dos unidades
   * distintas, y una es subcadena de la otra.
   *
   * Sin este corte, «la velocidad eficaz del apoyo 1 ahora mismo» encajaba
   * sólo con `velocidad` —la etiqueta larga no cabe entera en la frase, la
   * corta sí— y devolvía UN resultado, en singular y equivocado. Quien llama
   * no tiene forma de saber que eso fue un acierto parcial: una lista de un
   * elemento se lee como certeza, y la respuesta habría salido con cifras
   * reales, unidad real y la señal cambiada.
   *
   * Quedándose con los encajes más largos, esa frase resuelve a las medidas
   * eficaces y `velocidad` sale de la lista por corta. Y cuando el empate es
   * legítimo —«velocidad eficaz» encaja igual de bien en los tres apoyos—
   * salen los tres, que es lo que hace que quien llama pregunte.
   */
  if (!contenidos.length) return [];
  const mejor = Math.max(...contenidos.map((c) => c.largo));
  const empatados = contenidos.filter((c) => c.largo === mejor);

  /*
   * ── SEGUNDO DESEMPATE: EL QUE MENOS AÑADE DE SU COSECHA ────────────
   *
   * «Velocidad eficaz · Lado acople» y «Confianza de la velocidad eficaz ·
   * Lado acople» contienen las dos la frase «velocidad eficaz», y con la misma
   * longitud encajada: el primer desempate no las separa.
   *
   * Pero no son igual de buenas. La segunda es el indicador de CONFIANZA de la
   * primera —otra señal, otra unidad— y quien pregunta por la velocidad eficaz
   * no está preguntando por su calidad de medida.
   *
   * Lo que las separa es cuánto texto pone el nombre ANTES de lo preguntado:
   * cero en «Velocidad eficaz · Lado acople», trece en «Confianza de la…».
   * Y es a propósito que se mida sólo el prefijo: lo que va DETRÁS es el apoyo
   * —«· Lado libre», «· Rodamiento intermedio»— y ahí los tres empatan, así
   * que los tres siguen saliendo. Preguntado sin decir el apoyo, quien llama
   * tiene que preguntar cuál; ésa es la regla que no se toca.
   */
  /* Si NINGUNO encajó por contención directa, el prefijo no dice nada y no se
     desempata: salen todos y quien llama pregunta. */
  const conPrefijo = empatados.filter((c) => c.sobra !== SIN_PREFIJO);
  if (!conPrefijo.length) {
    return empatados.map(({ sistema, clave }) => ({ sistema, clave }));
  }

  const ajuste = Math.min(...conPrefijo.map((c) => c.sobra));
  return conPrefijo
    .filter((c) => c.sobra === ajuste)
    .map(({ sistema, clave }) => ({ sistema, clave }));
}

/**
 * Comprobaciones que se hacen al cargar el registro.
 *
 * Se ejecutan en el import y LANZAN, en vez de devolver una lista de avisos.
 * Una entrada mal declarada no produce un error visible más adelante: produce
 * una máquina que no aparece en el transporte falso, o que contesta `null` con
 * calidad buena — el fallo que este proyecto ya ha cometido dos veces. Es
 * mejor que el proceso no arranque.
 */
function validarRegistro() {
  for (const s of SISTEMAS) {
    const falta = [
      "raices", "puntos", "parse", "modelo", "estado", "resumen", "claves", "series",
    ].filter(
      (campo) => s[campo] === undefined || s[campo] === null,
    );
    if (falta.length) {
      throw new Error(`sistemas.js: «${s.id}» no declara ${falta.join(", ")}`);
    }
    if (!s.raices.length) throw new Error(`sistemas.js: «${s.id}» no declara ninguna raíz`);
    if (!s.puntos().length) throw new Error(`sistemas.js: «${s.id}» no declara ningún punto`);
    /*
     * `series.punto` es obligatorio desde que las dos máquinas nombran su punto
     * histórico distinto: el tanque con el mismo nombre que en vivo, vibraciones
     * por `hda:` con el grupo delante. Una máquina que no lo declare no puede
     * pedir su serie, y el fallo aparecería tarde y en forma de «no hay datos».
     */
    if (typeof s.series.punto !== "function") {
      throw new Error(
        `sistemas.js: «${s.id}» no declara series.punto — cómo se nombra su punto en el ` +
          "historiador. Puede ser el mismo nombre que en vivo, pero hay que decirlo.",
      );
    }
    if (!s.series.nota) {
      throw new Error(
        `sistemas.js: «${s.id}» no dice qué se puede pedir de su historia. Una máquina sin ` +
          "series es válida, pero tiene que declararlo — el silencio se lee como que sí las tiene.",
      );
    }
  }
}

validarRegistro();

/**
 * A qué sistema pertenece una pantalla.
 *
 * Se le pasa el hash de la ruta —`#/eva-vibraciones`— y devuelve el id del
 * sistema, o `null` si no lo reconoce. Quien llama decide qué hacer con el
 * `null`: en el dictado significa «usa el contexto general», que transcribe
 * algo peor pero nunca falla.
 *
 * El `null` es deliberado y no un `"tanque"` de consuelo: una pantalla nueva
 * que nadie haya declarado se vería obligada a heredar el vocabulario del
 * agua, y entonces el error —dictado deformado— no apuntaría a su causa.
 */
export function sistemaDeRuta(hash) {
  const ruta = String(hash ?? "").replace(/^#?\/?/, "").split(/[?/]/)[0];
  if (!ruta) return null;
  return SISTEMAS.find((s) => s.rutas?.includes(ruta))?.id ?? null;
}

/** Resumen del registro, para que el asistente pueda enumerarlos. */
export function resumenDeSistemas() {
  return SISTEMAS.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    maquina: s.maquina,
    origen: s.plc,
    mide: s.mide,
    herramientas: s.herramientas,
    historia: s.historia,
    limitaciones: s.limitaciones,
  }));
}
