/**
 * El TIPO de máquina «sensado»: un conjunto de sensores de planta que se
 * MIRAN, no se diagnostican — Plan 46 F2.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ NO SE PARECE A `vibraciones` ─────────
 *
 * `vibraciones` sabe juzgar: tiene una norma detrás (ISO 10816-1), 19 reglas
 * y un motor que decide bandas y causas. Este tipo no juzga nada, y eso es
 * una decisión del usuario del 24-09-2026, no una fase pendiente: lo que se
 * pidió para esta máquina es **visualización**. Cuatro tomas de planta
 * —corriente de acometida, corriente de luminarias, ambiente e iluminación—
 * cuyo valor es que se vean claras en un tablero, no que disparen un aviso.
 *
 * De ahí que sea el primer tipo **OBSERVADOR** del proyecto, y que la F1 del
 * Plan 46 tuviera que hacerle sitio: hasta ese día `validarTipos()` exigía
 * reglas a todo tipo, así que un tipo que sólo observa ni siquiera dejaba
 * arrancar el proceso. Ahora la coherencia se comprueba en los dos sentidos:
 * quien promete `DIAGNOSTICS` trae reglas, y quien no lo promete no las trae.
 *
 * ── LA FRONTERA, LA MISMA PREGUNTA DE SIEMPRE ─────────────────────
 *
 *   «¿Esto seguiría siendo cierto en OTRO juego de sensores como éste?»
 *
 *   sí  → el tipo       que una dona trifásica tiene tres líneas · que la
 *                       corriente se mide en amperios · que el CO2 se mide
 *                       en ppm · que una batería va de 0 a 100
 *   no  → la instancia  que la raíz es `ac:TDCON/DEMO_SENSORES/` · que hay
 *                       DOS sensores de ambiente · dónde está montado cada uno
 *
 * Por eso aquí no aparece ni una sola ruta de ICONICS. La raíz sondeada el
 * 24-09-2026 vive en la configuración de la máquina, no en este archivo.
 *
 * ── LAS BANDAS NO SON UMBRALES, Y LA DISTINCIÓN IMPORTA ───────────
 *
 * `escala` existe para que una vista sepa dibujar un arco o un eje sin
 * inventarse los extremos, y `confort` para situar un valor de ambiente. NO
 * son umbrales de alarma y no encienden `DIAGNOSTICS`: son referencia de
 * dibujo. Pintar de rojo un CO2 de 1 200 ppm por encima de un límite que
 * nadie calibró sería exactamente lo que `CLAUDE.md` §2.5 prohíbe — decir
 * que algo está mal sin tener con qué sostenerlo.
 *
 * Quien las use debe enseñarlas como lo que son: contexto, no juicio.
 *
 * ── LO QUE ESTE TIPO NO DECLARA, Y ES DELIBERADO ──────────────────
 *
 *   reglas / evaluarRiesgos reales · DIAGNOSTICS · ALARMS · canales
 *   contadoresAlarma · VIEW_3D · WRITABLE_VARIABLES
 *
 * `canales` se queda fuera porque sus assets NO son apoyos de una misma
 * pieza: una dona de corriente y un sensor de CO2 no son dos vistas del
 * mismo equipo, como sí lo son dos acelerómetros de un motor. Son tomas
 * independientes, y `canalesDeMaquina()` ya devuelve `[]` cuando el tipo no
 * declara canales, así que no hay nada que apagar.
 */

import { toNumber } from "../../valores.js";

/** `familia:clave`, el mismo nombre de rol que usa el resto del proyecto. */
export const rolDe = (familia, clave) => `${familia}:${clave}`;

/**
 * ── LAS TRES FAMILIAS ──────────────────────────────────────────────
 *
 * `electrica` y `optica` son de ÁMBITO MÁQUINA y `ambiente` también, y eso
 * merece explicación porque en `vibraciones` casi todo es de ámbito apoyo:
 * allí una medida sin apoyo no significa nada («la velocidad eficaz» ¿de
 * cuál de los tres?). Aquí cada señal es única dentro de su asset y se
 * nombra sola: «la corriente de la línea 1», «el CO2».
 *
 * La `escala` es el rango de DIBUJO, no un límite: de dónde a dónde va el
 * arco de un medidor. Se escoge por lo que el instrumento puede entregar,
 * no por lo que se observó un día.
 */
const ELECTRICAS = Object.freeze([
  { key: "corrienteL1", label: "Corriente línea 1", corto: "L1", unidad: "A", decimales: 1, escala: [0, 100] },
  { key: "corrienteL2", label: "Corriente línea 2", corto: "L2", unidad: "A", decimales: 1, escala: [0, 100] },
  { key: "corrienteL3", label: "Corriente línea 3", corto: "L3", unidad: "A", decimales: 1, escala: [0, 100] },
  { key: "corrienteMono", label: "Corriente monofásica", corto: "Mono", unidad: "A", decimales: 1, escala: [0, 100] },
]);

/*
 * `confort` es el rango en que un humano diría «esto está normal», y sólo lo
 * tienen las de ambiente porque son las únicas en que esa frase significa
 * algo: 400 ppm es aire de calle y 1 500 ppm es una sala mal ventilada. Una
 * corriente no tiene «confort» — depende por completo de qué haya enchufado.
 */
const AMBIENTE = Object.freeze([
  { key: "temperatura", label: "Temperatura", corto: "Temp", unidad: "°C", decimales: 1, escala: [-10, 50], confort: [18, 26] },
  { key: "co2", label: "Dióxido de carbono", corto: "CO₂", unidad: "ppm", decimales: 0, escala: [0, 2000], confort: [400, 1000] },
  { key: "humedad", label: "Humedad relativa", corto: "HR", unidad: "%", decimales: 0, escala: [0, 100], confort: [30, 60] },
  { key: "presion", label: "Presión barométrica", corto: "Presión", unidad: null, decimales: 1, escala: null, confort: null },
]);

const OPTICAS = Object.freeze([
  { key: "iluminacion", label: "Iluminación", corto: "Luz", unidad: null, decimales: 0, escala: [0, 1000] },
  { key: "bateria", label: "Batería del sensor", corto: "Batería", unidad: "%", decimales: 0, escala: [0, 100] },
]);

/**
 * ── DOS UNIDADES A `null` A PROPÓSITO (D4 del Plan 46) ────────────
 *
 * `presion` e `iluminacion` NO declaran unidad, y no es un olvido.
 *
 * El tag del servidor se llama `LUMEN`, pero un sensor fijo montado en una
 * sala mide iluminancia (**lux**), no flujo luminoso (lumen): el lumen es la
 * luz total que emite una fuente y no depende de dónde se mida. Poner «lm»
 * aquí sería rotular mal un eje en pantalla, y poner «lx» sería contradecir
 * el nombre que planta le dio sin haberlo confirmado.
 *
 * Con la presión pasa lo mismo entre hPa, kPa y mbar. El servidor no ayuda:
 * los assets de `DEMO_SENSORES` devuelven `.Attributes` vacío (sondeado el
 * 24-09-2026), así que la unidad no viaja con el dato.
 *
 * `null` significa «la pone quien configura la máquina» —el editor tiene
 * `variables[].unidad`— y hasta entonces la vista enseña el número sin
 * unidad, que es honesto. Inventarla sería peor que no tenerla.
 */
export const ROLES = Object.freeze({
  ...Object.fromEntries(
    ELECTRICAS.map((m) => [
      rolDe("electrica", m.key),
      Object.freeze({
        clave: m.key, ambito: "maquina", familia: "electrica",
        label: m.label, corto: m.corto, unidad: m.unidad,
        decimales: m.decimales, escala: m.escala, confort: null,
      }),
    ]),
  ),
  ...Object.fromEntries(
    AMBIENTE.map((m) => [
      rolDe("ambiente", m.key),
      Object.freeze({
        clave: m.key, ambito: "maquina", familia: "ambiente",
        label: m.label, corto: m.corto, unidad: m.unidad,
        decimales: m.decimales, escala: m.escala, confort: m.confort,
      }),
    ]),
  ),
  ...Object.fromEntries(
    OPTICAS.map((m) => [
      rolDe("optica", m.key),
      Object.freeze({
        clave: m.key, ambito: "maquina", familia: "optica",
        label: m.label, corto: m.corto, unidad: m.unidad,
        decimales: m.decimales, escala: m.escala, confort: null,
      }),
    ]),
  ),
});

/**
 * ── NINGÚN ROL ES REQUERIDO, Y ES LA DECISIÓN CORRECTA AQUÍ ───────
 *
 * En `vibraciones` los roles requeridos existen porque sus reglas los
 * necesitan: sin `vRMS` no hay nada que juzgar, y una máquina a la que le
 * falte debe quedar incompleta para que se vea. Aquí no hay reglas, así que
 * no hay nada que pueda quedarse sin suelo.
 *
 * Y hay un motivo de planta: los sensores se van montando. El de iluminación
 * «estará ubicado en la demo» —aún no lo estaba el 24-09-2026—, así que una
 * máquina que exigiera las diez señales para darse de alta no se podría
 * configurar hasta el último día. Con esto, se configura lo que hay y lo que
 * llegue después se añade.
 */
export const ROLES_REQUERIDOS = Object.freeze([]);

/**
 * Los nombres por los que una persona pide una de estas señales.
 *
 * Corta a propósito, como los sinónimos de las otras máquinas: sólo lo que
 * alguien dice de verdad delante del tablero. «Sensor» a secas no está —
 * serían los cuatro activos a la vez— y el resolvedor ya pregunta cuál
 * cuando hay varios candidatos.
 */
const SINONIMOS_DE_ROL = Object.freeze({
  [rolDe("electrica", "corrienteL1")]: ["línea 1", "l1", "fase 1", "amperaje línea 1"],
  [rolDe("electrica", "corrienteL2")]: ["línea 2", "l2", "fase 2", "amperaje línea 2"],
  [rolDe("electrica", "corrienteL3")]: ["línea 3", "l3", "fase 3", "amperaje línea 3"],
  [rolDe("electrica", "corrienteMono")]: ["monofásica", "luminarias", "corriente de luminarias", "alumbrado"],
  [rolDe("ambiente", "temperatura")]: ["temperatura", "grados", "calor"],
  [rolDe("ambiente", "co2")]: ["co2", "dióxido de carbono", "ppm", "calidad del aire"],
  [rolDe("ambiente", "humedad")]: ["humedad", "humedad relativa"],
  [rolDe("ambiente", "presion")]: ["presión", "presión barométrica", "barómetro"],
  [rolDe("optica", "iluminacion")]: ["luz", "iluminación", "luminosidad", "lux", "lúmenes"],
  [rolDe("optica", "bateria")]: ["batería", "pila", "carga del sensor"],
});

/**
 * Los alias de UNA variable, derivados de su rol y de su asset.
 *
 * A diferencia de `vibraciones`, aquí el asset se suma en vez de ser
 * obligatorio: «temperatura» sin más es ambiguo si hay dos sensores de
 * ambiente, pero «temperatura» a secas sigue siendo una petición legítima
 * que el resolvedor debe poder desambiguar preguntando. Devolver `[]` como
 * hace el tipo de vibraciones dejaría la señal sin ningún nombre.
 */
function aliasDeVariable(variable, asset) {
  const rol = variable?.rol ? ROLES[variable.rol] : null;
  if (!rol) return [];
  const propios = [...new Set([rol.corto, rol.label, ...(SINONIMOS_DE_ROL[variable.rol] ?? [])].filter(Boolean))];
  const formas = [
    asset?.label && asset.label !== asset.id ? asset.label : null,
    ...(Array.isArray(asset?.alias) ? asset.alias : []),
  ].filter(Boolean);
  return [...propios, ...propios.flatMap((n) => formas.map((f) => `${n} ${f}`))];
}

/** Los roles de un ámbito, como en los demás tipos. */
export const rolesDeAmbito = (ambito) =>
  Object.entries(ROLES).filter(([, r]) => r.ambito === ambito).map(([rol]) => rol);

/* Índices inversos: los necesita quien descubre una máquina desde el árbol,
   que recibe UN TIPO y no puede importar este archivo. Misma forma que en
   `vibraciones`: devuelven LISTA, y con más de un candidato el descubridor
   no propone ninguno. */
const formaComparable = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

const POR_CLAVE = new Map();
for (const [rolId, r] of Object.entries(ROLES)) {
  const k = formaComparable(r.clave);
  POR_CLAVE.set(k, [...(POR_CLAVE.get(k) ?? []), rolId]);
}

/**
 * ── LOS TAGS DEL SERVIDOR NO SE ESCRIBEN AQUÍ, SE RECONOCEN ───────
 *
 * `LINEA_1` aparece en DOS assets distintos (la dona trifásica y la
 * monofásica) y significa cosas distintas en cada uno: en una es una fase de
 * la acometida y en la otra es el alumbrado entero. Por eso el índice por tag
 * devuelve los dos candidatos de `LINEA_1` y deja que el descubridor
 * pregunte, en vez de adivinar por el orden.
 *
 * Es el mismo criterio que ya aplica `rolesDeTag` en vibraciones, y aquí se
 * nota más porque la colisión es real y no hipotética.
 */
const POR_TAG = new Map();
const TAGS_CONOCIDOS = Object.freeze({
  LINEA_1: [rolDe("electrica", "corrienteL1"), rolDe("electrica", "corrienteMono")],
  LINEA_2: [rolDe("electrica", "corrienteL2")],
  LINEA_3: [rolDe("electrica", "corrienteL3")],
  TEMPERATURA: [rolDe("ambiente", "temperatura")],
  CO2: [rolDe("ambiente", "co2")],
  HUMEDAD: [rolDe("ambiente", "humedad")],
  PRESION_BAROMETRICA: [rolDe("ambiente", "presion")],
  LUMEN: [rolDe("optica", "iluminacion")],
  BATERIA: [rolDe("optica", "bateria")],
});
for (const [tag, roles] of Object.entries(TAGS_CONOCIDOS)) POR_TAG.set(formaComparable(tag), roles);

export const rolesDeClave = (clave) => POR_CLAVE.get(formaComparable(clave)) ?? [];
export const rolesDeTag = (tag) => POR_TAG.get(formaComparable(tag)) ?? [];

/**
 * El estado de la máquina en la forma común.
 *
 * ── POR QUÉ NO HAY UN `estadoSensado.js` APARTE ───────────────────
 *
 * Porque no hay nada que componer. `estadoDeVibraciones` existe como archivo
 * propio porque tiene que cruzar apoyos, variador, alarmas y norma para
 * decidir una zona ISO. Aquí el estado ES la lista de lecturas: no hay peor
 * zona que calcular ni bandera que interpretar.
 *
 * `estado` NUNCA es un juicio en este tipo. Devuelve `null` en `general`, y
 * eso no es un hueco por rellenar: es la respuesta correcta. Un tipo que no
 * diagnostica no tiene un «estado general» que ofrecer, y fabricar uno
 * —«NORMAL» porque nada falló— sería afirmar que se ha comprobado algo.
 *
 * @param {(punto: string) => any} valorDe
 * @param {object} sistemaRegistro  su entrada del registro
 * @param {string|null} [leidoA]
 * @param {object} [opciones]
 * @param {(clave: string) => object|null} [opciones.resolver]
 * @param {string[]} [opciones.sinLectura]
 * @param {number} [opciones.puntosPedidos]
 */
export function estadoDeSensado(valorDe, sistemaRegistro, leidoA = null, opciones = {}) {
  const resolver = opciones.resolver ?? (() => null);
  const senales = [];

  for (const [rolId, rol] of Object.entries(ROLES)) {
    /*
     * ── SE PREGUNTA POR LA CLAVE, NO POR EL ROL ENTERO ──────────────
     *
     * `construirSistema` indexa sus variables por la CLAVE del rol
     * (`corrienteL1`), no por su nombre completo (`electrica:corrienteL1`):
     * para los roles de ámbito apoyo le añade el sufijo del apoyo
     * (`vRMS_S1`), y la familia nunca entra en esa llave.
     *
     * La primera versión de este archivo preguntaba por `rolId` y el
     * resolvedor devolvía `null` SIEMPRE, así que este bucle no emitía ni una
     * señal. No se vio como una pantalla vacía porque `construirSistema`
     * tiene una red debajo —«ninguna variable configurada desaparece del
     * estado»— que las sacaba todas por el camino genérico, sin familia, sin
     * escala y sin banda. La vista, que filtra por familia, encontraba cero.
     *
     * Es un fallo silencioso de los caros: el estado parecía correcto (diez
     * señales con su valor) y sólo faltaba lo que cada pieza necesita para
     * dibujarse.
     */
    const r = resolver(rol.clave);
    /* Sin resolvedor que la declare, la señal no existe en ESTA máquina. No
       se emite como hueco: una máquina con un solo sensor no puede salir con
       diez lecturas «sin dato» de sensores que nadie montó. Mismo criterio
       que `estadoDeVibraciones` con sus apoyos. */
    if (!r) continue;

    /*
     * ── EL VALOR SE SANEA AQUÍ, EN LA FRONTERA (Plan 46 F6.1) ───────
     *
     * ICONICS entrega sus lecturas como CADENA —`"7"`, no `7`—, y esto las
     * pasaba tal cual. La vista llamaba a `valor.toFixed(...)` sobre un
     * string y **tumbaba la pantalla entera** con «animado.toFixed is not a
     * function»; lo vio el usuario, no la tanda.
     *
     * Por qué no se cazó: las ocho comprobaciones de la F5 y las de la vista
     * pasan NÚMEROS, que es lo que uno escribe sin pensar al fabricar un
     * doble. El transporte real no se parece al doble justo en esto.
     *
     * `toNumber` es la conversión de la casa (`shared/valores.js`) y su
     * cabecera dice dónde va: «en la frontera». Ésta es la frontera de este
     * tipo. Devuelve `null` ante NaN, Infinity y cadena vacía, así que una
     * lectura corrupta acaba en hueco —con su motivo— en vez de contaminar el
     * resto (`CLAUDE.md` §2.4).
     */
    const valor = r.tag ? toNumber(valorDe(r.tag)) : null;
    senales.push(Object.freeze({
      clave: r.clave ?? rol.clave,
      rol: rolId,
      familia: rol.familia,
      tag: r.tag ?? null,
      label: r.label ?? rol.label,
      corto: rol.corto,
      unidad: r.unidad ?? rol.unidad,
      decimales: rol.decimales,
      escala: rol.escala,
      confort: rol.confort,
      assetId: r.assetId ?? null,
      valor: valor ?? null,
      ...(valor === null || valor === undefined
        ? { sinDato: true, motivo: "El punto no entregó valor en esta lectura." }
        : { sinDato: false }),
      ...(r.historia !== undefined ? { historia: r.historia } : {}),
    }));
  }

  const conDato = senales.filter((s) => !s.sinDato).length;

  return Object.freeze({
    sistema: sistemaRegistro?.id ?? null,
    instalacion: sistemaRegistro?.nombre ?? null,
    leidoA: leidoA ?? null,
    /* Ver la cabecera: este tipo no juzga, y `null` lo dice. */
    general: null,
    senales: Object.freeze(senales),
    recuento: Object.freeze({
      total: senales.length,
      conDato,
      sinDato: senales.length - conDato,
      puntosPedidos: opciones.puntosPedidos ?? senales.length,
    }),
    sinLectura: Object.freeze([...(opciones.sinLectura ?? [])]),
  });
}

/**
 * El resumen que lee el asistente.
 *
 * Plano y corto a propósito: el modelo redacta, y lo que necesita es la lista
 * de lo que hay con su valor y su unidad. Sin veredicto, porque no lo hay
 * (§ la cabecera de `estadoDeSensado`), y con el hueco contado aparte para
 * que no lo confunda con un cero (`CLAUDE.md` §2.4).
 */
export function resumenSensadoParaAsistente(estado) {
  const senales = estado?.senales ?? [];
  const por = (familia) => senales.filter((s) => s.familia === familia);
  const pinta = (s) =>
    s.sinDato
      ? `${s.label}: sin dato (${s.motivo ?? "no llegó lectura"})`
      : `${s.label}: ${s.valor}${s.unidad ? ` ${s.unidad}` : ""}`;

  return {
    instalacion: estado?.instalacion ?? null,
    leidoA: estado?.leidoA ?? null,
    /* El aviso va DENTRO del resumen y no en el prompt general porque es de
       este tipo: quien lo lea tiene que saber que no hay veredicto que pedir. */
    aviso:
      "Esta máquina sólo OBSERVA: no tiene umbrales de alarma, ni riesgos, ni diagnóstico. " +
      "Informa de los valores y de lo que falta; no digas si están bien o mal, ni propongas causas.",
    electrica: por("electrica").map(pinta),
    ambiente: por("ambiente").map(pinta),
    optica: por("optica").map(pinta),
    sin_dato: senales.filter((s) => s.sinDato).length,
    total: senales.length,
  };
}

/**
 * Sin riesgos, y la función existe igual.
 *
 * Devolver la forma vacía en vez de omitir el campo es deliberado: el
 * validador lo exige y varios llamadores lo invocan sin preguntar si está.
 * Una función honesta que dice «ningún riesgo» es más segura que un `null`
 * que habría que comprobar en cinco sitios — y el quinto siempre se olvida,
 * que es el mismo argumento por el que existe el registro de sistemas.
 */
export function evaluarRiesgosSensado() {
  return Object.freeze({ activos: Object.freeze([]), provisional: false });
}

export const TIPO_SENSADO = Object.freeze({
  id: "sensado",
  nombre: "Sensado de planta",
  descripcion:
    "Conjunto de sensores independientes de planta —corriente por línea, ambiente " +
    "(temperatura, CO₂, humedad, presión) e iluminación— que se leen para verlos. " +
    "No diagnostica: no tiene umbrales, riesgos ni alarmas.",

  roles: ROLES,
  rolesRequeridos: ROLES_REQUERIDOS,
  rolesDeClave,
  rolesDeTag,

  /* Sin canales: sus assets no son apoyos de una misma pieza — ver cabecera. */

  /*
   * Las diez señales son INDEPENDIENTES: dos que coincidan valor a valor son
   * sospechosas de verdad (el historiador ya sirvió una serie con dos
   * nombres, Plan 42), así que aquí no hay familia exenta como los `QC_*` de
   * vibraciones. `false` deja que el sondeo aplique su cautela entera.
   *
   * Con un matiz medido el 24-09-2026 y que conviene tener delante: hoy las
   * diez publican una CONSTANTE de prueba (un dígito del 1 al 9). El sondeo
   * las marcará `registrada-constante` —el criterio del Plan 42— y no
   * `serie-propia`. Es lo correcto: están registradas y son planas.
   */
  seriesEquivalentes: () => false,

  /* Ver la cabecera: observador, no juez. La F1 del Plan 46 hizo legal esta
     pareja, y `capacidadesPosibles` la declara sin DIAGNOSTICS. */
  reglas: Object.freeze([]),
  evaluarRiesgos: evaluarRiesgosSensado,

  estado: estadoDeSensado,
  resumen: resumenSensadoParaAsistente,

  /* Las palabras del oficio para que el asistente reconozca lo que se le
     pide sin que la pantalla las enseñe. */
  vocabulario:
    "corriente, amperios, línea, fase, dona, acometida, luminarias, alumbrado, " +
    "temperatura, CO2, dióxido de carbono, ppm, humedad, presión barométrica, " +
    "iluminación, lux, luminosidad, batería, sensor de ambiente",

  aliasDe: (variable, asset = null) => aliasDeVariable(variable, asset),

  /*
   * Lo que una vista enseña PRIMERO si tiene que elegir. No es un juicio de
   * importancia física: es qué se mira de un vistazo en un tablero. La
   * batería no está —es mantenimiento del sensor, no planta— y la presión
   * tampoco, porque apenas se mueve.
   */
  indicadores: [
    rolDe("electrica", "corrienteL1"),
    rolDe("electrica", "corrienteMono"),
    rolDe("ambiente", "temperatura"),
    rolDe("optica", "iluminacion"),
  ],

  /**
   * El rango de DIBUJO de un rol, y su franja de confort si la tiene.
   *
   * NO es una banda de alarma: no dice que un valor esté mal. Ver la cabecera
   * («LAS BANDAS NO SON UMBRALES»). Se llama `bandaDe` para que una vista
   * genérica la encuentre donde la busca, con la misma firma que en
   * vibraciones, pero lo que devuelve es contexto de pintado.
   */
  bandaDe: (rolId) => {
    const r = ROLES[rolId];
    if (!r) return null;
    return Object.freeze({
      escala: r.escala,
      confort: r.confort ?? null,
      unidad: r.unidad,
      decimales: r.decimales,
      /* Explícito, para que nadie lo lea como un umbral por descuido. */
      esUmbral: false,
    });
  },

  /*
   * ── QUÉ SABE SERVIR ESTE TIPO ──────────────────────────────────
   *
   * El techo, no lo que una máquina concreta servirá: las capacidades reales
   * se DERIVAN de su configuración (`capacidadesDe`).
   *
   * Cinco ausencias, y todas son la declaración de este tipo:
   *
   *   DIAGNOSTICS  no juzga — es lo que lo hace un observador (F1)
   *   ALARMS       sus assets no publican área de alarmas
   *   VIEW_3D      no hay maqueta de un conjunto de sensores sueltos
   *   WRITABLE_VARIABLES  no escribe en planta. Deny by default (Plan 33 §20)
   *
   * `HISTORICAL_DATA` SÍ está: el historiador registra las diez series desde
   * el 24-09-2026 (sondeado tras el despliegue de planta). Que una máquina
   * concreta lo encienda depende de que su sondeo las verifique.
   *
   * `RAG` y `PREVIOUS_CASES` están porque no dependen de diagnosticar: a esta
   * máquina se le puede asignar la hoja de datos de un sensor, y se puede
   * cerrar un caso sobre ella («el sensor de luz se quedó sin batería»).
   */
  capacidadesPosibles: Object.freeze([
    "CURRENT_DATA",
    "HISTORICAL_DATA",
    "RAG",
    "PREVIOUS_CASES",
  ]),
});

export default TIPO_SENSADO;
