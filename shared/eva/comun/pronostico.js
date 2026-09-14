/**
 * Pronóstico: qué se está desgastando, medido por ACUMULACIÓN en el tiempo.
 *
 * ── QUÉ RESUELVE, Y POR QUÉ NO LO RESUELVE `riesgos.js` ────────────
 *
 * `riesgos.js` mira el INSTANTE: ahora mismo el tanque está alto y la bomba
 * impulsa, luego puede rebosar. Eso es operación.
 *
 * Esto mira la HISTORIA: la bomba ha aspirado con nivel insuficiente 47 de las
 * últimas 720 horas. Ninguna de esas 47 horas disparó una alarma —cada una,
 * por separado, era un episodio corto y tolerable— pero sumadas son desgaste
 * que ya ocurrió y que nadie contó. Eso es mantenimiento.
 *
 * La diferencia práctica: un riesgo se atiende hoy; un pronóstico se convierte
 * en una parada programada dentro de tres semanas, que es cuando sale barata.
 *
 * ── LAS TRES REGLAS DE HONESTIDAD DE ESTE ARCHIVO ──────────────────
 *
 * 1. LAS HORAS SON ESTIMADAS, NO CONTADAS. El historiador no entrega una
 *    rejilla uniforme —hay huecos de horas y días, medidos en esta misma
 *    instalación—, así que no se puede sumar «tiempo entre muestras». Lo que
 *    se calcula es la FRACCIÓN de muestras válidas que cumplían la condición,
 *    y se multiplica por la ventana. Con cobertura pareja es una buena
 *    estimación; con cobertura irregular, no. Por eso viaja `muestras` al
 *    lado de cada resultado: quien lo pinte tiene que poder decir sobre
 *    cuántas medidas se está afirmando algo.
 *
 * 2. «EN MARCHA» SE RECONSTRUYE DEL CAUDAL, NO DE LA CARGA DEL MOTOR. Sería
 *    mejor la carga del motor, pero NO TIENE HISTORIA en este servidor: el
 *    historiador devuelve ahí la curva de la temperatura del tanque, sin dar
 *    error (ver `senales.js`). El caudal sí es suyo, así que se usa como
 *    sustituto, y quien lo lea tiene que saber que es un sustituto.
 *
 * 3. NO SE PREDICEN AÑOS HASTA LA AVERÍA. Se puede pedir —y se ha pedido—
 *    pero una cifra así necesitaría un modelo térmico del devanado y medir
 *    su temperatura, y aquí no se mide ninguna de las dos cosas. Lo que sí
 *    se puede afirmar, y es lo que se afirma, son tres cosas verificables:
 *    cuánta exposición se acumuló, por qué mecanismo degrada, y si la
 *    exposición está subiendo o bajando. Una cifra de años inventada sobre
 *    esas tres suena mucho mejor y no vale nada.
 *
 * 4. ESTO MIDE LO SOSTENIDO, Y ES CIEGO A LO BREVE. El historiador se lee con
 *    el agregado `Average` (ver `historia.js`), así que cada muestra es la
 *    MEDIA de su intervalo, y un intervalo aquí dura horas: el tope del
 *    puente es de 100 muestras por petición, o sea ~1,7 h por muestra en una
 *    ventana de 7 días y ~7 h en una de 30.
 *
 *    Consecuencia directa: veinte minutos de cavitación dentro de un
 *    intervalo de siete horas se promedian con las otras seis horas y
 *    cuarenta y desaparecen. Este módulo NO los ve y no puede verlos.
 *
 *    No es un defecto que haya que disculpar: para desgaste acumulado, la
 *    media del intervalo es justo la pregunta correcta —¿estuvo la condición
 *    presente de forma sostenida?—. Pero significa que un cero aquí quiere
 *    decir «no hubo nada sostenido», nunca «no pasó nada», y la pantalla
 *    tiene que decirlo con esas palabras.
 *
 * ── ALCANCE: SÓLO EL SISTEMA DEL TANQUE ────────────────────────────
 *
 * Todo lo de aquí habla de UNA instalación: el tanque y su grupo de bombeo.
 * El sistema de vibraciones es OTRA máquina, con otro motor y otro variador
 * —ver la nota de los dos sistemas en `senales.js`—. Cuando se añadan sus
 * mecanismos de desgaste, no pueden compartir activo ni cruzarse con el
 * caudal de este tanque: serían dos máquinas distintas en la misma frase.
 */
import { REPOSO, UMBRALES } from "./umbrales.js";

/* ── Utilidades ────────────────────────────────────────────────────── */

const hay = (v) => typeof v === "number" && Number.isFinite(v);

/** Umbral declarado de una señal; `null` si no tiene banda. */
const lim = (key, cual) => UMBRALES[key]?.[cual] ?? null;

/* ── El catálogo de mecanismos ─────────────────────────────────────── */

/**
 * Forma de un mecanismo:
 *
 *   id            estable; clave para la interfaz
 *   titulo        el titular, en lenguaje de mantenimiento
 *   componente    qué se está desgastando
 *   necesita      claves de señal sin las cuales no se puede evaluar
 *   soloEnMarcha  si sólo cuenta mientras la bomba impulsa
 *   cuando        (v) => boolean — la condición que acumula desgaste
 *   mecanismo     POR QUÉ degrada. Física, no adivinanza.
 *   consecuencia  a qué avería lleva si sigue
 *   accion        qué mirar
 *   norma         de dónde sale el criterio, cuando sale de algún sitio
 *   confirmar     duda abierta sobre el dato de entrada, si la hay
 */
export const MECANISMOS = [
  {
    id: "cavitacion-acumulada",
    titulo: "Horas aspirando con nivel insuficiente",
    componente: "Sello mecánico e impulsor de la bomba",
    necesita: ["nivelTanque"],
    soloEnMarcha: true,
    cuando: (v) => v.nivelTanque <= lim("nivelTanque", "avisoMin"),
    mecanismo:
      "Con nivel bajo, la presión en la aspiración cae por debajo de la presión de vapor y se " +
      "forman burbujas que implosionan contra el impulsor. Cada implosión arranca una cantidad " +
      "minúscula de material; el daño es acumulativo y no se revierte.",
    consecuencia:
      "Erosión del impulsor, pérdida progresiva de caudal a la misma velocidad, y destrucción " +
      "del sello mecánico —que es lo que suele fallar primero y lo que obliga a abrir la bomba.",
    accion: "Revisar la consigna de paro por nivel bajo y el tiempo de reacción del lazo.",
  },
  {
    id: "sobrepresion-sostenida",
    titulo: "Horas con la red por encima de su presión de servicio",
    componente: "Juntas, sellos y tramos débiles de la red",
    necesita: ["presionRelativa"],
    soloEnMarcha: true,
    cuando: (v) => v.presionRelativa >= lim("presionRelativa", "avisoMax"),
    mecanismo:
      "Los elastómeros de juntas y sellos se deforman de forma permanente bajo presión " +
      "sostenida (compression set). No es un fallo por rebasar un límite una vez: es fatiga " +
      "proporcional al tiempo acumulado por encima de la presión de diseño.",
    consecuencia:
      "Fugas en juntas, pérdida de estanqueidad progresiva y, en el peor caso, rotura de un " +
      "tramo por fatiga.",
    accion: "Revisar la consigna del variador y el tarado de la válvula de alivio.",
  },
  {
    id: "agua-caliente-sostenida",
    titulo: "Horas con el agua por encima de su banda",
    componente: "Aspiración de la bomba y aptitud del agua",
    necesita: ["temperaturaTanque"],
    soloEnMarcha: false,
    cuando: (v) => v.temperaturaTanque >= lim("temperaturaTanque", "avisoMax"),
    mecanismo:
      "Cuanto más caliente está el agua, más baja es la presión a la que hierve, y menos " +
      "margen de aspiración le queda a la bomba antes de cavitar. El agua caliente no daña " +
      "por sí sola: estrecha el margen con el que trabaja todo lo demás.",
    consecuencia:
      "Aumenta la probabilidad de cavitación con niveles que hasta ahora eran suficientes, y " +
      "el agua deja de ser apta para su uso de proceso.",
    accion: "Comprobar el aporte térmico y la renovación del tanque.",
  },
  {
    id: "tension-fuera-de-tolerancia",
    titulo: "Horas con la alimentación fuera de tolerancia",
    componente: "Devanados del motor y bus de continua del variador",
    necesita: ["tensionLinea"],
    soloEnMarcha: true,
    cuando: (v) =>
      v.tensionLinea < lim("tensionLinea", "min") || v.tensionLinea > lim("tensionLinea", "max"),
    mecanismo:
      "Por debajo de tolerancia, el motor compensa el par absorbiendo más corriente, y la " +
      "corriente calienta el devanado. Por encima, el núcleo se satura y suben las pérdidas en " +
      "el hierro. En los dos sentidos el resultado es la misma variable: temperatura del " +
      "aislamiento. La regla clásica —Montsinger, recogida en IEC 60034-1— es que la vida del " +
      "aislamiento se reduce a la MITAD por cada 10 K sostenidos por encima de su clase.",
    consecuencia:
      "Envejecimiento acelerado del aislamiento del estátor y de los condensadores del bus de " +
      "continua del variador. Ninguno avisa: fallan de golpe, al final.",
    accion: "Revisar el suministro y las protecciones del variador.",
    norma: "NEMA MG-1 §12.44 (±10 % de la tensión nominal) · IEC 60034-1",
    /*
     * Nominal CONFIRMADO por el usuario el 25-08-2026: red 208Y/120.
     *
     * `INDICE_DESVIACION_VOLTAJE` mide UNA línea contra neutro de este
     * sistema, de ahí que lea 121-127 V y no 208. El nominal que aplica es por
     * tanto 120 V, y la banda 108-132 de `umbrales.js` es el ±10 % correcto.
     *
     * Este mecanismo ya no cuelga de ninguna suposición: las horas que cuenta
     * son horas de exposición real.
     */
  },
  {
    /*
     * Se deja en el catálogo A PROPÓSITO aunque hoy nunca pueda evaluarse.
     *
     * `cargaMotor` no tiene historia en este servidor, así que este mecanismo
     * sale siempre como «sin comprobar». Borrarlo dejaría la pantalla más
     * limpia y escondería que hay un desgaste que nadie está vigilando. Que
     * aparezca en la lista de lo no evaluable es justamente lo que hace
     * visible que falta configurar el historiador.
     */
    id: "esfuerzo-sin-resultado",
    titulo: "Horas moviendo poco caudal con el motor cargado",
    componente: "Impulsor y rodamientos de la bomba",
    necesita: ["cargaMotor", "flujoInstantaneo"],
    soloEnMarcha: true,
    cuando: (v) =>
      v.cargaMotor >= lim("cargaMotor", "avisoMax") &&
      v.flujoInstantaneo <= lim("flujoInstantaneo", "avisoMin"),
    mecanismo:
      "Trabajar lejos del punto de mejor rendimiento carga el eje de forma asimétrica: la " +
      "fuerza radial sobre el impulsor crece y se descarga entera sobre los rodamientos.",
    consecuencia: "Desgaste acelerado de rodamientos y del sello, y consumo sin trabajo útil.",
    accion: "Comparar el punto de trabajo real con la curva de la bomba.",
    norma: "ISO 10816-7 (bombas rotodinámicas)",
  },
];

/* ── Evaluación ────────────────────────────────────────────────────── */

/** Cortes de exposición, en fracción del tiempo evaluado. */
const CORTES = { critico: 0.2, atencion: 0.05, informativo: 0.01 };

function severidadDe(fraccion) {
  if (fraccion >= CORTES.critico) return "critico";
  if (fraccion >= CORTES.atencion) return "atencion";
  if (fraccion >= CORTES.informativo) return "informativo";
  return null;
}

/**
 * ¿Estaba impulsando en esta muestra?
 *
 * Del CAUDAL, no de la carga del motor — ver la regla 2 de la cabecera. Sin
 * lectura de caudal devuelve `null` («no se sabe»), y la muestra no cuenta ni
 * a favor ni en contra: descartarla es correcto, suponer que estaba parada
 * sería inventar horas de reposo que nadie midió.
 */
function impulsandoEn(fila) {
  const q = fila.flujoInstantaneo;
  if (!hay(q)) return null;
  return Math.abs(q) > REPOSO.flujo;
}

/**
 * Evalúa todos los mecanismos sobre una rejilla histórica.
 *
 * @param {object[]} filas    `[{ t, nivelTanque, presionRelativa, … }]`, la
 *                            rejilla que devuelve `useSeriesHistoricas`
 * @param {number}   horasVentana  ancho del período pedido, para estimar horas
 * @returns {{activos: object[], sinExposicion: object[], noEvaluables: object[], muestras: number, provisional: boolean}}
 *
 *   `activos` — mecanismos con exposición, los graves primero.
 *   `sinExposicion` — evaluados y limpios.
 *   `noEvaluables` — sin los datos que necesitan, y qué faltó.
 *   `muestras` — filas con marca de tiempo utilizable.
 *   `provisional` — si los umbrales usados son estimaciones nuestras.
 */
export function evaluarPronostico(filas, horasVentana) {
  const rejilla = Array.isArray(filas) ? filas : [];
  const ventana = hay(horasVentana) && horasVentana > 0 ? horasVentana : 0;

  const activos = [];
  const sinExposicion = [];
  const noEvaluables = [];

  for (const m of MECANISMOS) {
    // Muestras en las que TODAS las señales que el mecanismo necesita tienen
    // lectura. Una muestra a la que le falta una no se puede juzgar, y no se
    // juzga: no cuenta en el denominador.
    const utiles = [];
    for (const fila of rejilla) {
      const v = {};
      let completa = true;
      for (const k of m.necesita) {
        if (!hay(fila[k])) { completa = false; break }
        v[k] = fila[k];
      }
      if (!completa) continue;

      if (m.soloEnMarcha) {
        const marcha = impulsandoEn(fila);
        // `null` = no se sabe si impulsaba. Se descarta la muestra entera.
        if (marcha !== true) continue;
      }
      utiles.push(v);
    }

    if (utiles.length === 0) {
      const falta = m.necesita
        .filter((k) => !rejilla.some((f) => hay(f[k])))
        .join(", ");
      noEvaluables.push({
        id: m.id,
        titulo: m.titulo,
        componente: m.componente,
        falta: falta || (m.soloEnMarcha ? "horas de marcha con datos completos" : "datos en el período"),
      });
      continue;
    }

    const expuestas = utiles.filter((v) => m.cuando(v)).length;
    const fraccion = expuestas / utiles.length;

    // Tendencia: la MISMA condición en la primera y la segunda mitad de la
    // ventana. Es una comparación cruda a propósito — con cobertura irregular,
    // una regresión sobre el tiempo mediría los huecos del historiador tanto
    // como el proceso.
    const mitad = Math.floor(utiles.length / 2);
    const fraccionDe = (arr) => (arr.length ? arr.filter((v) => m.cuando(v)).length / arr.length : null);
    const antes = mitad >= 5 ? fraccionDe(utiles.slice(0, mitad)) : null;
    const despues = mitad >= 5 ? fraccionDe(utiles.slice(mitad)) : null;

    let tendencia = "sin determinar";
    if (antes !== null && despues !== null) {
      const delta = despues - antes;
      if (Math.abs(delta) < 0.02) tendencia = "estable";
      else tendencia = delta > 0 ? "empeorando" : "mejorando";
    }

    const comun = {
      id: m.id,
      titulo: m.titulo,
      componente: m.componente,
      mecanismo: m.mecanismo,
      consecuencia: m.consecuencia,
      accion: m.accion,
      norma: m.norma ?? null,
      confirmar: m.confirmar ?? null,
      soloEnMarcha: Boolean(m.soloEnMarcha),
      muestras: utiles.length,
      expuestas,
      fraccion,
      // Estimadas, no contadas. Ver la regla 1 de la cabecera.
      horasEstimadas: ventana ? +(fraccion * ventana).toFixed(1) : null,
      tendencia,
      antes,
      despues,
    };

    const severidad = severidadDe(fraccion);
    if (severidad) activos.push({ ...comun, severidad });
    else sinExposicion.push(comun);
  }

  const PESO = { critico: 0, atencion: 1, informativo: 2 };
  activos.sort((a, b) => PESO[a.severidad] - PESO[b.severidad] || b.fraccion - a.fraccion);

  return {
    activos,
    sinExposicion,
    noEvaluables,
    muestras: rejilla.length,
    provisional: true,
  };
}

/**
 * La pregunta con la que se le pide al asistente que analice un pronóstico.
 *
 * Lleva dentro lo MEDIDO —fracción, horas, tendencia— para que el modelo
 * razone sobre el mismo hecho que el operador está viendo, y le prohíbe
 * explícitamente inventar un plazo. Sin esa prohibición, «¿cuánto durará?» es
 * justo la pregunta que un modelo contesta con una cifra inventada que suena
 * muy bien.
 */
export function preguntaSobrePronostico(p) {
  if (!p) return "";
  const horas = p.horasEstimadas !== null ? `unas ${p.horasEstimadas} horas` : "una parte del período";
  return [
    `Sobre el desgaste de "${p.componente}": la condición "${p.titulo}" se cumplió en`,
    `${(p.fraccion * 100).toFixed(1)} % de las ${p.muestras} muestras evaluadas (${horas}),`,
    `y la tendencia es "${p.tendencia}".`,
    "Consulta los datos de la planta, dime qué señales confirman o descartan este desgaste,",
    "y qué conviene revisar en la próxima parada.",
    "NO estimes cuántos años o meses faltan para la avería: no hay datos para eso.",
    "Separa claramente lo que midas de lo que sea hipótesis.",
  ].join(" ");
}
