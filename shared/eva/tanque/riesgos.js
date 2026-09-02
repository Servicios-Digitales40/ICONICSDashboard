/**
 * Riesgos por combinación: qué puede pasar, dado cómo está la instalación AHORA.
 *
 * ── QUÉ RESUELVE, Y POR QUÉ NO LO RESUELVE YA `estado.js` ──────────
 *
 * `estado.js` juzga señales de una en una: el nivel está en banda, la presión
 * está alta. Eso no basta para operar, porque los problemas de una instalación
 * hidráulica viven en las COMBINACIONES:
 *
 *   nivel al 93 %            → alto, pero si nadie está llenando, se queda ahí
 *   nivel al 93 % + bomba impulsando → va a rebosar
 *
 * Es la misma lectura y el mismo umbral. Lo que cambia el desenlace es la otra
 * señal. Un panel que sólo pinta señales sueltas obliga al operador a hacer ese
 * cruce de cabeza, cada vez, para las ocho.
 *
 * ── POR QUÉ ESTO ES CÓDIGO Y NO UNA PREGUNTA AL ASISTENTE ──────────
 *
 * Porque tiene que estar SIEMPRE evaluado, no cuando alguien pregunta; porque
 * el resultado tiene que ser el mismo a las 3 de la mañana que a mediodía; y
 * porque un modelo de lenguaje no debe decidir si algo puede reventar. Aquí las
 * condiciones son aritmética comparada contra umbrales, auditable línea a
 * línea. El asistente sirve para EXPLICAR un riesgo que este archivo ya
 * detectó — no para detectarlo.
 *
 * ── LA SEPARACIÓN QUE NO SE PUEDE PERDER ───────────────────────────
 *
 * Cada regla distingue tres cosas, y la interfaz tiene que pintarlas distinto:
 *
 *   evidencia     lo MEDIDO. Cifras que vienen de las señales, sin interpretar.
 *   consecuencia  la HIPÓTESIS. Lo que PUEDE pasar si esto sigue así.
 *   accion        qué mirar. Nunca una orden de maniobra.
 *
 * Mezclarlas produce el peor resultado posible en una pantalla de planta: que
 * una deducción nuestra se lea con la misma autoridad que una medición. Es la
 * misma regla que se le exige al asistente al redactar un diagnóstico.
 *
 * ── LO QUE ESTE ARCHIVO NO ES ──────────────────────────────────────
 *
 * NO es un sistema de alarmas. Las alarmas de esta instalación están en el
 * servidor —once, con límites puestos por quien conoce el proceso— y mandan
 * sobre cualquier cosa que se calcule aquí. Esto es una capa de anticipación
 * ENCIMA: avisa de combinaciones que todavía no han disparado ninguna alarma.
 * Si una alarma dice una cosa y una regla de aquí dice otra, gana la alarma.
 *
 * ── Y LA ADVERTENCIA GRANDE ────────────────────────────────────────
 *
 * Las condiciones se comparan contra `umbrales.js`, y hoy `PROVISIONALES` está
 * en `true`: esos límites los estimamos nosotros y NO se parecen a esta
 * instalación —medido, la presión relativa pasa el 92 % del tiempo por debajo
 * de su «mínimo»—. Por tanto TODO lo que salga de aquí hereda esa duda, y
 * `evaluarRiesgos` la devuelve explícita en `provisional` para que la pantalla
 * la confiese. Cuando lleguen los umbrales reales, esto se vuelve fiable solo.
 */
import { REPOSO, UMBRALES } from "../comun/umbrales.js";

/* ── Utilidades de lectura ─────────────────────────────────────────── */

/** Valor numérico de una señal, o `null` si no hay lectura utilizable. */
function num(sistema, key) {
  const v = sistema?.senales?.[key]?.valor;
  return Number.isFinite(v) ? v : null;
}

/** Valor booleano de una señal, o `null`. */
function bool(sistema, key) {
  const v = sistema?.senales?.[key]?.valor;
  return typeof v === "boolean" ? v : null;
}

/**
 * ¿Está la bomba IMPULSANDO ahora mismo?
 *
 * No es `!sistema.enReposo`, y confundirlos es el error que haría disparar
 * media pantalla en falso. `enReposo` devuelve `false` tanto cuando la bomba
 * impulsa como cuando NO SE SABE si impulsa —le falta una de las dos lecturas—,
 * porque afirmar el reposo sin datos silenciaría media instalación.
 *
 * Aquí hace falta lo contrario: afirmar la MARCHA. Y para afirmarla hay que
 * haberla medido, así que sin carga del motor esto devuelve `null` («no se
 * sabe») y las reglas que dependen de ella se declaran no evaluables en vez de
 * suponer que la bomba está parada.
 */
function impulsando(sistema) {
  const carga = num(sistema, "cargaMotor");
  if (carga === null) return null;
  return carga > REPOSO.cargaMotor;
}

/** Umbral declarado de una señal; `null` si esa señal no tiene banda. */
const lim = (key, cual) => UMBRALES[key]?.[cual] ?? null;

/* ── El catálogo de reglas ─────────────────────────────────────────── */

/**
 * Forma de una regla:
 *
 *   id            estable; la interfaz lo usa de clave y para no repetir avisos
 *   titulo        el titular, en el lenguaje del operador
 *   severidad     "critico" | "atencion" | "informativo"
 *   necesita      claves de señal SIN las cuales la regla no se puede evaluar
 *   cuando        (v, ctx) => boolean   — sólo aritmética, sin efectos
 *   evidencia     (v) => string         — lo MEDIDO, con cifras
 *   consecuencia  qué PUEDE pasar si esto sigue        (hipótesis)
 *   accion        qué conviene mirar                    (nunca una maniobra)
 *
 * `v` es un objeto plano `{ clave: valor }` con las señales ya leídas, para que
 * la condición se lea como la frase que la describe.
 */
export const REGLAS = [
  /* ── Tanque ─────────────────────────────────────────────────────── */
  {
    id: "derrame",
    titulo: "Riesgo de derrame",
    severidad: "critico",
    necesita: ["nivelTanque", "cargaMotor"],
    cuando: (v, ctx) => ctx.impulsando && v.nivelTanque >= lim("nivelTanque", "avisoMax"),
    evidencia: (v) =>
      `El tanque está al ${v.nivelTanque.toFixed(1)} % y la bomba sigue impulsando ` +
      `(carga del motor ${v.cargaMotor.toFixed(1)} %).`,
    consecuencia:
      "Si la bomba no para, el nivel puede alcanzar el rebose y derramar agua en el cubeto.",
    accion: "Confirmar que el corte por nivel alto está operativo y que el lazo de control responde.",
  },
  {
    // El más caro de la lista. Una bomba centrífuga que aspira en vacío destruye
    // el sello mecánico en minutos, y el daño no se ve hasta que se abre.
    id: "marcha-en-seco",
    titulo: "Riesgo de marcha en seco",
    severidad: "critico",
    necesita: ["nivelTanque", "cargaMotor"],
    cuando: (v, ctx) => ctx.impulsando && v.nivelTanque <= lim("nivelTanque", "avisoMin"),
    evidencia: (v) =>
      `El tanque está al ${v.nivelTanque.toFixed(1)} % —por debajo del ${lim("nivelTanque", "avisoMin")} %— ` +
      `y la bomba está impulsando (carga ${v.cargaMotor.toFixed(1)} %).`,
    consecuencia:
      "Aspirar con nivel insuficiente provoca cavitación y puede destruir el sello mecánico " +
      "y los rodamientos en poco tiempo.",
    accion: "Verificar el nivel real y la protección por nivel bajo antes de seguir bombeando.",
  },

  /* ── Presión y caudal ───────────────────────────────────────────── */
  {
    id: "sobrepresion",
    titulo: "Sobrepresión en la red",
    severidad: "critico",
    necesita: ["presionRelativa", "cargaMotor"],
    cuando: (v, ctx) => ctx.impulsando && v.presionRelativa >= lim("presionRelativa", "avisoMax"),
    evidencia: (v) =>
      `Presión relativa ${v.presionRelativa.toFixed(2)} con la bomba impulsando ` +
      `(carga ${v.cargaMotor.toFixed(1)} %).`,
    consecuencia:
      "Sostener la red por encima de su presión de servicio castiga juntas, sellos y los " +
      "tramos más débiles, y puede provocar una rotura.",
    accion: "Revisar la consigna del variador y el estado de la válvula de alivio.",
  },
  {
    // La firma hidráulica de una válvula cerrándose o una línea obstruida:
    // la bomba empuja contra algo, así que la presión sube y el caudal no la
    // acompaña. Se pide carga de motor para no confundirlo con la bomba parada.
    id: "obstruccion",
    titulo: "Posible obstrucción aguas abajo",
    severidad: "atencion",
    necesita: ["presionRelativa", "flujoInstantaneo", "cargaMotor"],
    cuando: (v, ctx) =>
      ctx.impulsando &&
      v.presionRelativa >= lim("presionRelativa", "avisoMax") &&
      v.flujoInstantaneo <= lim("flujoInstantaneo", "avisoMin"),
    evidencia: (v) =>
      `Presión alta (${v.presionRelativa.toFixed(2)}) con caudal bajo ` +
      `(${v.flujoInstantaneo.toFixed(2)}) y el motor cargado al ${v.cargaMotor.toFixed(1)} %.`,
    consecuencia:
      "La bomba empuja contra una resistencia: compatible con válvula cerrada, filtro sucio " +
      "u obstrucción en la línea. Trabajar así calienta la bomba y desperdicia energía.",
    accion: "Revisar válvulas de la línea de impulsión y el estado de los filtros.",
  },
  {
    /*
     * ── LA BOMBA GIRA, HAY PRESIÓN, Y NO SALE NADA ────────────────
     *
     * Caudal CERO —no «bajo»: cero— con la bomba impulsando y presión en la
     * línea. Es la firma de una válvula de impulsión cerrada, y no la cubría
     * ninguna de las reglas que parecen cubrirla:
     *
     *   `obstruccion`  exige presión por encima del aviso. Una bomba a caudal
     *                  cero contra su altura de cierre puede quedarse en
     *                  presión perfectamente normal, y entonces esa regla
     *                  calla.
     *
     *   `esfuerzo-sin-resultado`  exige carga de motor ALTA, y aquí la física
     *                  va justo al revés: al cerrar la impulsión, una bomba
     *                  centrífuga de impulsor radial se desplaza hacia su
     *                  punto de cierre, donde absorbe MENOS potencia. O sea
     *                  que la regla pensada para «trabaja y no rinde» es
     *                  precisamente la que no puede ver esto.
     *
     *   `marcha-en-seco`  es el otro caso de caudal cero, pero SIN presión:
     *                  no hay nada que bombear. La presión es lo que separa
     *                  los dos, y por eso entra en la condición.
     *
     * Es crítica porque el daño es rápido: sin caudal, toda la potencia del
     * eje se queda dentro de la voluta calentando la misma agua atrapada.
     */
    id: "bomba-sin-salida",
    titulo: "La bomba gira contra una salida cerrada",
    severidad: "critico",
    necesita: ["presionRelativa", "flujoInstantaneo", "cargaMotor"],
    cuando: (v, ctx) =>
      ctx.impulsando &&
      Math.abs(v.flujoInstantaneo) <= REPOSO.flujo &&
      v.presionRelativa >= lim("presionRelativa", "min"),
    evidencia: (v) =>
      `Caudal ${v.flujoInstantaneo.toFixed(2)} —prácticamente nulo— con presión ` +
      `${v.presionRelativa.toFixed(2)} y la bomba impulsando (carga ${v.cargaMotor.toFixed(1)} %).`,
    consecuencia:
      "Sin caudal no hay agua que se lleve el calor: toda la potencia del eje se queda " +
      "dentro de la bomba calentando el mismo líquido atrapado. El sello mecánico y el " +
      "impulsor se dañan en minutos, no en semanas, y el vapor que se forma puede llegar " +
      "a reventar la voluta.",
    accion:
      "Comprobar si la válvula de impulsión está cerrada y si existe línea de recirculación " +
      "mínima. Parar la bomba antes que abrir de golpe: abrir contra una bomba caliente " +
      "mete un golpe de ariete en la red.",
    /*
     * La sensibilidad de esta regla cuelga del límite inferior de presión, que
     * hoy es una estimación (`PROVISIONALES`). Con el número real de la
     * instalación se afina; con éste puede callar cuando debería hablar.
     */
    nota: "El umbral de «hay presión» todavía es una estimación nuestra, no un dato de la instalación.",
  },
  {
    id: "posible-fuga",
    titulo: "Posible fuga en la red",
    severidad: "atencion",
    necesita: ["presionRelativa", "flujoInstantaneo", "cargaMotor"],
    cuando: (v, ctx) =>
      ctx.impulsando &&
      v.presionRelativa <= lim("presionRelativa", "avisoMin") &&
      v.flujoInstantaneo >= lim("flujoInstantaneo", "avisoMax"),
    evidencia: (v) =>
      `Caudal alto (${v.flujoInstantaneo.toFixed(2)}) con presión baja ` +
      `(${v.presionRelativa.toFixed(2)}) y la bomba impulsando.`,
    consecuencia:
      "Mucho caudal sin presión es lo que se ve cuando la red está abierta por algún sitio: " +
      "compatible con fuga, rotura o una salida quedada abierta.",
    accion: "Recorrer la red buscando descarga anómala y comparar con el consumo esperado.",
  },

  /* ── Motor y suministro ─────────────────────────────────────────── */
  {
    id: "esfuerzo-sin-resultado",
    titulo: "El motor trabaja y mueve poco",
    severidad: "atencion",
    necesita: ["cargaMotor", "flujoInstantaneo"],
    cuando: (v) =>
      v.cargaMotor >= lim("cargaMotor", "avisoMax") &&
      v.flujoInstantaneo <= lim("flujoInstantaneo", "avisoMin"),
    evidencia: (v) =>
      `Carga del motor ${v.cargaMotor.toFixed(1)} % moviendo un caudal de ` +
      `${v.flujoInstantaneo.toFixed(2)}.`,
    consecuencia:
      "Consumo alto sin trabajo hidráulico a cambio. Compatible con impulsor desgastado, " +
      "obstrucción o un problema mecánico, y sostenido calienta el motor.",
    accion: "Comparar con el punto de trabajo habitual de la bomba a esa carga.",
  },
  {
    id: "tension-fuera-con-motor",
    titulo: "Alimentación fuera de tolerancia con el motor en carga",
    severidad: "critico",
    necesita: ["tensionLinea", "cargaMotor"],
    cuando: (v, ctx) =>
      ctx.impulsando &&
      (v.tensionLinea < lim("tensionLinea", "min") || v.tensionLinea > lim("tensionLinea", "max")),
    evidencia: (v) =>
      `Tensión de línea ${v.tensionLinea.toFixed(1)} V, fuera del rango ` +
      `${lim("tensionLinea", "min")}–${lim("tensionLinea", "max")} V, con el motor al ` +
      `${v.cargaMotor.toFixed(1)} %.`,
    consecuencia:
      "Alimentar un motor en carga fuera de tolerancia sobrecalienta los devanados y acorta " +
      "su vida; por debajo del mínimo, además, sube la corriente absorbida.",
    accion: "Revisar el suministro y las protecciones del variador.",
  },

  /* ── Operación ──────────────────────────────────────────────────── */
  {
    // Informativo a propósito: operar en Manual es legítimo y se hace a diario.
    // Lo que importa es que quede DICHO, porque cambia quién está protegiendo
    // la instalación mientras dure.
    id: "variador-en-manual",
    titulo: "El variador está en Manual",
    severidad: "informativo",
    necesita: ["modoVdf"],
    cuando: (v) => v.modoVdf === true,
    evidencia: () => "El modo del variador se lee como Manual.",
    consecuencia:
      "En Manual los automatismos que protegen la instalación pueden no actuar: el control " +
      "depende de quien esté operando.",
    accion: "Confirmar que la operación en Manual es intencionada y que hay alguien atendiéndola.",
    // La correspondencia Automático/Manual NO está documentada en el servidor
    // (ver `senales.js`); se asume `false = Automático`. Se confiesa aquí para
    // que la tarjeta pueda decirlo en vez de afirmar un modo que no consta.
    nota: "La correspondencia Automático/Manual no está confirmada en el servidor.",
  },
  {
    id: "agua-caliente",
    titulo: "Temperatura del agua alta",
    severidad: "atencion",
    necesita: ["temperaturaTanque"],
    cuando: (v) => v.temperaturaTanque >= lim("temperaturaTanque", "avisoMax"),
    evidencia: (v) => `El agua del tanque está a ${v.temperaturaTanque.toFixed(1)} °C.`,
    consecuencia:
      "Por encima de su banda de servicio el agua pierde aptitud para el proceso, y si sigue " +
      "subiendo aumenta el riesgo de cavitación en la aspiración.",
    accion: "Comprobar el aporte térmico y la renovación del tanque.",
  },
];

/* ── Evaluación ────────────────────────────────────────────────────── */

/** Orden de presentación: lo que puede romper algo va primero. */
const PESO = { critico: 0, atencion: 1, informativo: 2 };

/**
 * Evalúa todas las reglas contra el sistema.
 *
 * Devuelve TRES listas y no una, porque «no hay riesgos» y «no se pudo mirar»
 * son cosas distintas y confundirlas es peligroso: una pantalla en verde
 * porque falta la lectura del nivel es peor que una pantalla que lo admite.
 *
 * @param {object} sistema  el que devuelve `createSistema()`
 * @returns {{
 *   activos: object[],        reglas que se cumplen ahora, las graves primero
 *   noEvaluables: object[],   reglas sin las lecturas que necesitan
 *   evaluadas: number,        cuántas sí se pudieron comprobar
 *   provisional: boolean,     si los umbrales usados son estimaciones nuestras
 * }}
 */
export function evaluarRiesgos(sistema) {
  const ctx = { impulsando: impulsando(sistema) };

  const activos = [];
  const noEvaluables = [];

  for (const regla of REGLAS) {
    // Se leen las señales que la regla declara necesitar. Una sola ausente la
    // deja sin evaluar: preferimos decir «no lo sé» a suponer un valor.
    const v = {};
    let falta = null;

    for (const key of regla.necesita) {
      const meta = sistema?.senales?.[key];
      const valor = meta?.tipo === "booleano" ? bool(sistema, key) : num(sistema, key);
      if (valor === null) { falta = meta?.label ?? key; break; }
      v[key] = valor;
    }

    // Las reglas que hablan de la bomba en marcha necesitan además SABER si lo
    // está. `impulsando === null` es «no consta», y no se resuelve suponiendo.
    const necesitaMarcha = regla.necesita.includes("cargaMotor");
    if (!falta && necesitaMarcha && ctx.impulsando === null) falta = "Carga de trabajo del motor";

    if (falta) {
      noEvaluables.push({ id: regla.id, titulo: regla.titulo, falta });
      continue;
    }

    if (!regla.cuando(v, ctx)) continue;

    activos.push({
      id: regla.id,
      titulo: regla.titulo,
      severidad: regla.severidad,
      evidencia: regla.evidencia(v),
      consecuencia: regla.consecuencia,
      accion: regla.accion,
      nota: regla.nota ?? null,
    });
  }

  activos.sort((a, b) => PESO[a.severidad] - PESO[b.severidad]);

  return {
    activos,
    noEvaluables,
    evaluadas: REGLAS.length - noEvaluables.length,
    provisional: true,
  };
}

/**
 * La pregunta con la que se le pide al asistente que explique un riesgo.
 *
 * Lleva la evidencia YA MEDIDA dentro. Sin ella el modelo arrancaría de cero y
 * podría razonar sobre otra cosa —o sobre el estado de dos horas después—; con
 * ella, la respuesta se ancla en el mismo hecho que el operador está viendo.
 */
export function preguntaSobreRiesgo(riesgo) {
  if (!riesgo) return "";
  return [
    `En la instalación se ha detectado esta situación: "${riesgo.titulo}".`,
    `Lo medido es: ${riesgo.evidencia}`,
    // Plan 16 Fase 4: el `id` va literal en la pregunta para que el modelo
    // no tenga que adivinarlo — llama a diagnosticar_falla con el nombre
    // exacto de la herramienta y los dos argumentos ya resueltos, en vez de
    // esperar a que un modelo pequeño infiera el riesgoId de un título en
    // prosa.
    `Usa diagnosticar_falla(sistema="tanque", riesgoId="${riesgo.id}") para ver las causas`,
    "candidatas, ya cruzadas con el manual y con casos previos resueltos, en vez de razonarlo",
    "de memoria.",
    "Separa claramente lo que midas de lo que sea hipótesis.",
  ].join(" ");
}
