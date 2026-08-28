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
  TODOS_LOS_PUNTOS,
  RAIZ,
  esHistorizada as esHistorizadaTanque,
  parsePointName,
} from "./senales.js";
import { valorDePunto } from "./simulador.js";
import {
  AREA_ALARMAS,
  RAIZ_VIB,
  esHistorizada as esHistorizadaVibracion,
  parsePunto,
  todosLosPuntos as todosLosPuntosVibracion,
} from "./vibraciones.js";
import { valorVibracionEn } from "./simuladorVibraciones.js";

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
    esHistorizada: esHistorizadaTanque,
    cadenciaMs: 3_000,
    mide: [
      "nivel y temperatura del tanque",
      "caudal instantáneo y presión relativa de la red",
      "carga del motor y modo del variador",
      "tensión de línea y eficiencia energética",
    ],
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
    esHistorizada: esHistorizadaVibracion,
    /* Más lenta que el tanque: el SM 1281 publica cada pocos segundos y no
       tiene sentido pedirle más de lo que produce. */
    cadenciaMs: 5_000,
    mide: [
      "velocidad eficaz, aceleración eficaz, pico y valor de daño en TRES apoyos",
      "estado de las vigilancias del módulo, incluidas las frecuencias de defecto de rodamiento",
      "velocidad, frecuencia, par y fallo de su propio variador",
      "contadores del área de alarmas de ICONICS",
    ],
    herramientas: ["estado_de_vibraciones"],
    historia:
      "El historiador empezó a guardar estos tags el 26-08-2026 y la configuración " +
      "todavía se estaba moviendo. NO se usan sus series: sólo el instante.",
    limitaciones: [
      "NO hay histórico utilizable: no se puede afirmar ninguna tendencia («lleva " +
        "subiendo», «cada vez peor») ni poner plazo a una avería.",
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
  "nada por estar en la misma planta.";

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
