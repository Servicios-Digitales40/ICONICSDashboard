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
 */

/**
 * Forma de un sistema:
 *
 *   id            identificador estable
 *   nombre        cómo se llama para una persona
 *   maquina       qué equipo es, cuando se sabe
 *   plc           de dónde vienen sus datos. DOS SISTEMAS CON PLC DISTINTO
 *                 SON MÁQUINAS DISTINTAS
 *   raiz          prefijo de sus puntos en ICONICS
 *   mide          qué señales tiene, en lenguaje de persona
 *   herramientas  qué puede llamar el asistente para este sistema
 *   historia      qué se puede pedir del pasado, y qué no
 *   limitaciones  lo que hay que confesar al contestar sobre él
 */
export const SISTEMAS = [
  {
    id: "tanque",
    nombre: "Tanque y grupo de bombeo",
    maquina: "Tanque de almacenamiento, bomba, red de distribución y su suministro",
    plc: "PLC_1 · ua:DEMO2",
    raiz: "ac:TDCON/DEMO/SENSORES/",
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
    raiz: "hda:\\Configuration\\DEMO 3:",
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

/** A qué sistema pertenece un punto de ICONICS, o `null`. */
export function sistemaDePunto(punto) {
  if (typeof punto !== "string") return null;
  return SISTEMAS.find((s) => punto.startsWith(s.raiz)) ?? null;
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
