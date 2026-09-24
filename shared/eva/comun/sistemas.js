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
  RAMAS,
  esHistorizada as esHistorizadaTanque,
  historizadas as historizadasTanque,
  parsePointName,
  puntoHistorico as puntoHistoricoTanque,
} from "../tanque/senales.js";
import { valorDePunto } from "../tanque/simulador.js";
import { estadoDelTanque, resumenTanqueParaAsistente } from "../tanque/estadoTanque.js";
import { MECANISMOS } from "./pronostico.js";
import { REGLAS as REGLAS_TANQUE, evaluarRiesgos as evaluarRiesgosTanque } from "../tanque/riesgos.js";
/*
 * ── LA MÁQUINA DE VIBRACIONES YA NO ESTÁ ESCRITA AQUÍ (Plan 40 F3) ─
 *
 * Hasta el 21-09-2026 este array tenía una segunda entrada, `vibraciones`,
 * escrita a mano desde `../vibraciones/vibraciones.js`. Esa máquina existe
 * ahora sólo CONFIGURADA: `datos/maquinas.json` → `construirSistema()` con el
 * tipo `vibraciones` (`../tipos/vibraciones.js`), registrada al arrancar por
 * `backend/ia/indices/registroConfigurado.mjs`. Lo que aquí era la máquina
 * —tags, series, etiquetas— es hoy la configuración; lo que era conocimiento
 * del tipo —roles, reglas, física, resumen— sigue en `shared/eva/vibraciones/`
 * y lo expone el tipo. La fixture de pruebas que la sustituye es
 * `scripts/lib/vibraciones-espejo.json`.
 */

export const SISTEMAS = [
  {
    id: "tanque",
    nombre: "Tanque y grupo de bombeo",
    maquina: "Tanque de almacenamiento, bomba, red de distribución y su suministro",
    plc: "PLC_1 · ua:DEMO2",
    /*
     * ── CERRADO POR MANTENIMIENTO (rama `Vibraciones1.0`, 17-09-2026) ──
     *
     * El motivo, en una frase, o ausente si la máquina está en servicio. No es
     * un booleano a propósito: un `cerrado: true` no dice POR QUÉ, y quien se
     * encuentre la negativa —o el asistente al explicarla— necesita el motivo,
     * no la bandera.
     *
     * Lo lee `resolverSistema()` en `ia/herramientas/lib/maquina.mjs`, que
     * niega toda herramienta de máquina sobre este sistema. La declaración vive
     * aquí, en el registro, y no en la guarda: así cerrar o reabrir una máquina
     * es editar SU entrada, y no buscar condicionales repartidos por el
     * backend.
     *
     * Para reabrir: quitar este campo y la primera entrada de `limitaciones`.
     */
    cerrado:
      "Rebuild del módulo de vibraciones (rama Vibraciones1.0): el tablero no lee esta " +
      "máquina mientras dure, y su código no se modifica.",
    /*
     * Trece ramas, no una (Plan 27 F1): la reorganización del 09-09-2026
     * dejó `SENSORES/` como una rama más, hermana de las doce que reproducen
     * el DB del PLC. `verificar-catalogo --real` explora el padre de cada
     * raíz declarada y avisa si aparece una catorceava sin que nadie la
     * añada aquí (Plan 27 F0).
     */
    raices: Object.values(RAMAS),
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
     * otra combinación, y con una sola copia la segunda tendría que elegir
     * entre mentir o tocar el archivo de la primera.
     *
     * **Corregido el 10-09-2026 (Plan 27 F6):** hasta este commit `punto`
     * era `pointName` a secas —el mismo nombre que en vivo—, que fue cierto
     * mientras el redirect del historiador vivía configurado en el activo
     * del servidor. La reorganización del árbol del 09-09-2026 lo rompió
     * para doce de las trece ramas: hoy el tanque necesita su PROPIO nombre
     * `hda:`, igual que ya lo necesitaba vibraciones desde el 27-08-2026.
     * Ver `puntoHistorico` en `tanque/senales.js` para la tabla rama→carpeta
     * y los dos nombres que no derivan por regla fija.
     *
     * `historizadas` es la puerta, y no una lista informativa: a DOS de las
     * cincuenta y dos señales el historiador les devuelve la serie de la
     * temperatura del tanque, con marcas de tiempo correctas y sin dar
     * error. Lo que no está aquí no se puede pedir.
     */
    series: {
      historizadas: historizadasTanque,
      ruta: "hda:",
      agregado: "Average",
      punto: puntoHistoricoTanque,
      nota:
        "Cincuenta de las cincuenta y dos señales tienen serie propia verificada por rama. A las " +
        "otras dos (carga del motor, eficiencia energética) el historiador les devuelve la serie " +
        "de la temperatura del tanque, sin dar error.",
    },
    /** Mecanismos de desgaste acumulado, para el pronóstico. */
    desgaste: MECANISMOS,
    /* Sus reglas y cómo se evalúan, DECLARADAS en la entrada (Plan 44 F3.6):
       el motor y las herramientas del asistente ya no tienen una tabla «si es
       el tanque…»; leen esto del registro, como de cualquier configurada. */
    reglas: REGLAS_TANQUE,
    evaluarRiesgos: evaluarRiesgosTanque,
    cadenciaMs: 3_000,
    mide: [
      "nivel y temperatura del tanque",
      "caudal instantáneo y presión relativa de la red",
      "carga del motor y modo del variador",
      "tensión de línea y eficiencia energética",
      // Plan 27 F3.
      "las ocho alarmas del PLC, y si el proceso está habilitado",
      // Plan 27 F4.
      "energía trifásica de línea, diez lecturas del variador por Modbus, y el " +
        "automatismo de llenado y vaciado",
      // Plan 27 F5.
      "el modo, la orden y el estado de las dos electroválvulas y la bomba de aire",
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
    /*
     * ── CORREGIDA EL 18-09-2026 (Plan 33 F6) ───────────────────────
     *
     * Decía `eva-3d`, que NO EXISTE: esa vista se llama `eva-maqueta`. Y
     * faltaban `eva-controles` y `eva-detalle`, las dos del tanque.
     *
     * No daba error en ningún sitio —una ruta que no existe simplemente nunca
     * encaja— pero el dictado usa esta lista para elegir vocabulario, así que
     * en la maqueta 3D del tanque pedía la transcripción sin él.
     *
     * `eva-alarmas` y `eva-assets` se quedan aunque sean de «General»: no son
     * exclusivas del tanque, pero mientras la otra máquina no las reclame,
     * darles su vocabulario transcribe mejor que dejarlas sin ninguno.
     */
    /* Todas las vistas propias del tanque se borraron en el Plan 42.5 F4 (el
       tanque volverá como máquina configurada con las genéricas `maq-*`,
       Plan 43). Queda `eva-assets` porque, mientras ninguna otra máquina la
       reclame, darle este vocabulario transcribe mejor que dejarla sin él. */
    rutas: ["eva-assets"],
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
    historia:
      "50 de las 52 señales del catálogo tienen serie propia desde el 10-09-2026 (Plan 27 F6): " +
      "medidas, alarmas, mandos y lecturas del variador. cargaMotor y eficienciaEnergetica NO " +
      "se historizan — el historiador les devuelve la serie de temperaturaTanque.",
    limitaciones: [
      /*
       * ── CERRADO POR MANTENIMIENTO (rama `Vibraciones1.0`, 17-09-2026) ──
       *
       * Va PRIMERA porque es la que cambia si se puede contestar o no, y el
       * resto sólo matiza CÓMO contestar.
       *
       * Esta máquina sigue en `SISTEMAS` a propósito. Quitarla de aquí habría
       * sido lo obvio y es lo que se descartó: el registro alimenta también el
       * motor de diagnóstico, el transporte falso y `NO_COMPARTEN` —la regla
       * que impide cruzar las dos instalaciones—, así que borrarla para callar
       * al asistente se habría llevado por delante piezas que vibraciones
       * necesita, y habría dejado sin sentido la prohibición de cruzar dos
       * máquinas cuando sólo queda una.
       *
       * Así que el sistema sigue declarado y lo que se declara es que está
       * cerrado. `limitaciones` es el campo para esto: su cabecera dice que no
       * es documentación, es «lo que hay que confesar al contestar».
       *
       * Para reabrir: quitar esta entrada.
       */
      "ESTA MÁQUINA ESTÁ CERRADA POR MANTENIMIENTO y el tablero no la está " +
        "leyendo, así que NO tienes datos suyos. No inventes valores, no digas que están en " +
        "banda y no uses lecturas de otra máquina para hablar de ésta: di que está cerrada y " +
        "ofrece el sistema de vibraciones, que sí está en servicio.",
      "Los límites con los que se evalúa cada señal son estimaciones nuestras para un " +
        "sistema de agua genérico, no rangos confirmados por quien opera la instalación.",
      /*
       * Plan 27 F3: desde el 09-09-2026 el servidor SÍ publica ocho bits de
       * alarma del PLC (`ALARMAS/`). La frase anterior —«el servidor no
       * publica alarmas»— dejó de ser cierta, y una limitación declarada que
       * ya no aplica es peor que ninguna: el asistente la repetiría. Lo que
       * sigue siendo cierto, y lo que hay que decir en su lugar, es que
       * ahora hay DOS fuentes que no siempre van a coincidir.
       */
      "Además del bit de alarma que publica el PLC para ocho condiciones, el tablero " +
        "sigue calculando su propia banda para cada señal contra umbrales nuestros. Las " +
        "dos pueden no coincidir: los del PLC son los del programa, los del tablero son " +
        "una estimación genérica. El desacuerdo es información de diagnóstico, no un " +
        "error de ninguna de las dos.",
      "La correspondencia Automático/Manual del modo del variador no está confirmada.",
      "La polaridad del paro de emergencia no está confirmada: no se pinta como alarma.",
      // Plan 27 F4.
      "Los diez registros que lee el variador por Modbus RTU llegan sin escalar: se " +
        "muestran sin unidad hasta que se confirme el factor de conversión de cada uno.",
      "La tensión de línea del medidor de energía (L1-N) se declara en voltios en el " +
        "manual, pero el valor medido no es plausible para esa magnitud: se muestra sin " +
        "unidad hasta aclarar la escala.",
    ],
  },
];

/** Sistema por id. */
export const SISTEMA = Object.fromEntries(SISTEMAS.map((s) => [s.id, s]));

/** Ids, en orden de presentación. */
export const SISTEMA_IDS = SISTEMAS.map((s) => s.id);

/**
 * Los sistemas EN SERVICIO: los que el tablero está leyendo ahora mismo.
 *
 * ── POR QUÉ NO SE FILTRA `SISTEMA_IDS` DIRECTAMENTE ─────────────────
 *
 * Porque esa lista hace DOS trabajos que se parecen y no son el mismo:
 *
 *   · **qué puede existir** — valida esquemas Zod (`http/esquemas.mjs`,
 *     `diagnosticoRoutes.mjs`) y decide si un caso guardado es válido
 *     (`scripts/purgar-casos-invalidos.mjs`).
 *   · **qué se enseña** — llena los selectores de Turno y Cuaderno.
 *
 * Filtrarla habría arreglado lo segundo rompiendo lo primero: los 11 casos
 * previos del tanque pasarían a tener un `sistema` que el backend no reconoce,
 * y el purgador los daría por inválidos. Ocultar una máquina no puede
 * invalidar su historia — eso no es cerrarla, es borrarla.
 *
 * Así que `SISTEMA_IDS` sigue diciendo qué existe, y esto dice qué está en
 * servicio. Lo consume la UI.
 *
 * Con las dos máquinas abiertas, las dos listas son iguales y esto no hace
 * nada. Es exactamente lo que debe pasar al reabrir.
 */
export const SISTEMAS_EN_SERVICIO = SISTEMAS.filter((s) => !s.cerrado);

/** Ids de los sistemas en servicio. Para selectores y filtros de la UI. */
export const SISTEMA_IDS_EN_SERVICIO = SISTEMAS_EN_SERVICIO.map((s) => s.id);

/**
 * ¿Está esta máquina cerrada? Devuelve el MOTIVO o `null`.
 *
 * Devuelve el texto y no un booleano a propósito: quien lo pinte necesita
 * decir por qué está cerrada, y un `true` obligaría a escribir ese porqué en
 * la vista —donde se quedaría viejo— en vez de leerlo del registro.
 */
export const cerradoPorMantenimiento = (sistemaId) => SISTEMA[sistemaId]?.cerrado ?? null;

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
 * ── DAR DE ALTA UNA MÁQUINA CONFIGURADA (Plan 33 F3) ────────────────
 *
 * `SISTEMAS` deja de ser sólo lo que este archivo escribe: también admite
 * entradas construidas desde `datos/maquinas.json` por
 * `construirSistema(config, tipo)`.
 *
 * ── POR QUÉ SE AÑADE AQUÍ Y NO SE SUSTITUYE EL ARRAY ────────────────
 *
 * Porque medio proyecto importa `SISTEMAS`, `SISTEMA` y `SISTEMA_IDS` —unas
 * cien veces— y todas esperan el mismo objeto. Sustituir el registro por una
 * factoría habría obligado a tocar cada una de esas importaciones para pasarle
 * la configuración, que es una reescritura, no una migración.
 *
 * Alimentarlo conserva además lo que de verdad protege este archivo: la
 * validación de abajo corre sobre lo que se añade, exactamente igual que sobre
 * lo escrito a mano.
 *
 * ── LO QUE SE VALIDA, Y POR QUÉ LANZA ──────────────────────────────
 *
 * Lanza, igual que `validarRegistro()`. Es distinto de
 * `problemasDeMaquina()`, que devuelve una lista: aquélla valida lo que
 * escribe una PERSONA en un formulario —y merece que le digan qué corregir—;
 * esto valida lo que va a ENTRAR en el registro, y una entrada mal formada ahí
 * no da un error visible más adelante, da una máquina que contesta `null` con
 * calidad buena.
 *
 * Las dos comprobaciones propias de esta puerta son las que no tienen sentido
 * sobre un módulo escrito a mano:
 *
 *   · **id repetido** — `SISTEMA[id]` devolvería una de las dos sin decir
 *     cuál, y los casos previos de esa máquina irían a la que ganara.
 *   · **raíz solapada** — `sistemaDePunto()` devuelve la PRIMERA que encaja,
 *     así que los puntos de una se atribuirían a la otra de forma estable.
 *
 * Las dos las comprueba también `problemasDeMaquina()` antes de guardar. Se
 * repiten aquí a propósito: aquélla mira contra las demás CONFIGURADAS, y ésta
 * contra el registro entero, que incluye las escritas a mano.
 *
 * ── EL SOLAPE CON UNA MÁQUINA ESCRITA A MANO SE TOLERA, Y SE DICE (Plan 38) ─
 *
 * Existió para la transición: del 21-09-2026 hasta el Plan 40 F3 la máquina
 * de vibraciones estuvo DOS veces —escrita a mano y configurada— sobre la
 * misma raíz, y registrar la configurada tenía que ser posible. Con
 * `toleraSolapeConEscritas`, el solape con una entrada escrita a mano no
 * lanza: se devuelve en `solapes` para que quien registra lo escriba en el
 * registro de arranque. Hoy la única escrita a mano es el tanque, con otras
 * raíces, así que la opción no encuentra solapes; se conserva porque el
 * tanque volverá a configurarse algún día por el mismo camino (Plan 33 F9).
 * El solape entre DOS configuradas sigue siendo un error —`problemasDeMaquina`
 * ya lo impide al guardar—.
 *
 * @param {object} entrada  lo que devuelve `construirSistema()`
 * @param {{toleraSolapeConEscritas?: boolean}} [opciones]
 * @returns {object} la misma entrada, ya registrada, con `solapes` si los hubo
 */
export function registrarSistema(entrada, { toleraSolapeConEscritas = false } = {}) {
  if (!entrada?.id) {
    throw new Error("registrarSistema: la entrada no trae `id`.");
  }
  if (SISTEMA[entrada.id]) {
    throw new Error(
      `registrarSistema: ya hay un sistema con el id «${entrada.id}». Dos entradas con el ` +
        "mismo id harían que `SISTEMA[id]` devolviera una de las dos sin decir cuál, y los " +
        "casos previos de esa máquina irían a la que ganara.",
    );
  }

  const solapes = [];
  for (const raiz of entrada.raices ?? []) {
    for (const otro of SISTEMAS) {
      for (const suya of otro.raices ?? []) {
        if (raiz.startsWith(suya) || suya.startsWith(raiz)) {
          if (toleraSolapeConEscritas && !otro.configurada) {
            solapes.push({ raiz, con: otro.id, suya });
            continue;
          }
          throw new Error(
            `registrarSistema: la raíz «${raiz}» de «${entrada.id}» se solapa con «${suya}» ` +
              `de «${otro.id}». \`sistemaDePunto()\` devuelve la primera que encaja, así que ` +
              "los puntos de una se atribuirían a la otra sin dar error.",
          );
        }
      }
    }
  }
  if (solapes.length) entrada.solapes = solapes;

  SISTEMAS.push(entrada);
  SISTEMA[entrada.id] = entrada;
  SISTEMA_IDS.push(entrada.id);

  /*
   * En servicio salvo que se declare cerrada. Se recalcula en vez de empujar
   * para que las dos listas no puedan divergir — que una máquina esté en
   * `SISTEMAS` y no en `SISTEMAS_EN_SERVICIO` es un estado legítimo, pero
   * mantenerlo a mano en dos sitios es como deja de serlo.
   */
  if (!entrada.cerrado) {
    SISTEMAS_EN_SERVICIO.push(entrada);
    SISTEMA_IDS_EN_SERVICIO.push(entrada.id);
  }

  /* La MISMA validación que las escritas a mano. Si la entrada construida no
     la pasa, es un defecto de `construirSistema`, y es mejor no arrancar. */
  validarRegistro();

  return entrada;
}

/**
 * Saca del registro una máquina CONFIGURADA. Plan 38.
 *
 * Sólo las configuradas: una escrita a mano es código y se retira editando el
 * código, no en caliente. Existe porque la configuración cambia en vivo —se
 * edita una máquina, se sondean sus series, se quita del tablero— y la
 * entrada del registro es una FOTO de esa configuración: para que el registro
 * diga la verdad hay que rehacerla, y rehacerla empieza por quitar la vieja.
 *
 * Devuelve `true` si había algo que quitar. No lanza por un id que no está:
 * quien sincroniza quita todas las configuradas antes de volver a
 * registrarlas, y «no estaba» es un estado normal ahí.
 */
export function desregistrarSistema(id) {
  const entrada = SISTEMA[id];
  if (!entrada) return false;
  if (!entrada.configurada) {
    throw new Error(
      `desregistrarSistema: «${id}» está escrita a mano en el código, no configurada. Una ` +
        "máquina de código se retira editando el código, no en caliente.",
    );
  }
  const quitar = (lista) => {
    const i = lista.indexOf(entrada);
    if (i !== -1) lista.splice(i, 1);
  };
  quitar(SISTEMAS);
  quitar(SISTEMAS_EN_SERVICIO);
  const quitarId = (lista) => {
    const i = lista.indexOf(id);
    if (i !== -1) lista.splice(i, 1);
  };
  quitarId(SISTEMA_IDS);
  quitarId(SISTEMA_IDS_EN_SERVICIO);
  delete SISTEMA[id];
  return true;
}

/** Las máquinas configuradas que hay hoy en el registro. */
export const sistemasConfigurados = () => SISTEMAS.filter((s) => s.configurada);

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

/**
 * Resumen del registro, para que el asistente pueda enumerarlos.
 *
 * ── `cerrado` VIAJA, Y ANTES NO (Plan 45 F2.5) ─────────────────────
 *
 * Este resumen es lo único que `sistemas_de_la_planta` le da al modelo, y
 * omitía si una máquina está cerrada por mantenimiento. El resultado, medido
 * el 24-09-2026 contra el modelo real: a «¿qué máquinas hay?» contestó «en
 * esta planta hay dos máquinas independientes», y presentó la estación de
 * llenado —cerrada desde el 17-09, sin vistas, y que toda herramienta niega—
 * como si se pudiera preguntar por ella.
 *
 * No es que el modelo se lo inventara: es que aquí no había nada que dijera
 * lo contrario. El cierre es una guarda en `resolverSistema()` a propósito
 * («una regla que importa se pone en el código, no en el prompt»), pero esa
 * guarda actúa cuando ya se ha preguntado; el inventario es lo que decide qué
 * se pregunta.
 *
 * Se entrega el CAMPO, no una lista filtrada: el filtro es del asistente
 * —quién enumera qué es suyo— y aquí sólo tiene que estar el dato. Y viaja el
 * texto entero, no un booleano, por el mismo motivo por el que el registro lo
 * guarda así: «cerrado» sin el porqué obliga a quien lo lea a inventarse uno.
 */
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
    /* `null` cuando está en servicio, que es lo normal; el motivo, cuando no. */
    cerrado: s.cerrado ?? null,
    /* Por qué otros nombres se la puede pedir, y qué activos tienen nombre (Plan 42.5 F6.6). */
    alias: s.alias ?? [],
    activos: s.activos ?? [],
  }));
}

/**
 * La entrada del registro a la que se refiere un texto —su `id`, su `nombre`
 * o uno de sus `alias`—, o `null` (Plan 42.5 F6.6).
 *
 * Comparación normalizada (sin tildes, sin mayúsculas, sin espacios de más),
 * pero EXACTA: «vivi» encuentra a la máquina cuyo alias es «vivi», y «vi» no
 * encuentra nada. Y si dos máquinas reclaman el mismo nombre, `null`: elegir
 * una sería contestar correctamente sobre la máquina equivocada, que es el
 * fallo que este registro existe para impedir; quien llama lista las dos.
 *
 * @param {string} texto
 * @param {readonly object[]} [lista]  el registro; se inyecta para probarlo
 * @returns {object|null}
 */
export function sistemaPorNombre(texto, lista = SISTEMAS) {
  const buscado = normalizar(texto);
  if (!buscado) return null;
  const candidatas = lista.filter((s) =>
    [s.id, s.nombre, ...(s.alias ?? [])].some((n) => normalizar(n) === buscado),
  );
  return candidatas.length === 1 ? candidatas[0] : null;
}
