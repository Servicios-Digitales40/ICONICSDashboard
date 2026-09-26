/**
 * El TIPO de máquina «estación de llenado»: lo que vale para CUALQUIER tanque
 * con su grupo de bombeo, no sólo para el que hay montado — Plan 46 F7.
 *
 * ── LA REGLA QUE HACE QUE ESTO NO SEA UNA COPIA ────────────────────
 *
 * La misma que rige `vibraciones.js`, y aquí importa más todavía porque el
 * dominio del tanque son 3.393 líneas: **aquí no se transcribe nada**. Todo lo
 * que este módulo expone lo IMPORTA de donde ya vivía —`tanque/senales.js`,
 * `estado.js`, `riesgos.js`, `sistema.js`, `estadoTanque.js`— y se limita a
 * decir qué pieza pertenece al tipo.
 *
 * Copiar las 17 reglas para «tenerlas en el tipo» crearía dos listas con la
 * misma intención y el riesgo de irse a destiempo, que es el incidente que
 * `shared/README.md` documenta y que `CLAUDE.md` §2.6 existe para no repetir.
 * Se ve en que este archivo no declara ni un umbral ni una regla: los importa.
 *
 * ── CÓMO SE LEE LA FRONTERA ────────────────────────────────────────
 *
 *   «¿Esto seguiría siendo cierto en OTRA estación de llenado?»
 *
 *   sí  → el tipo       que un tanque tiene nivel y el nivel se mide en % ·
 *                       que un variador tiene modo A/M · las 17 reglas · qué
 *                       es un activo (tanque, bombeo, distribución…)
 *   no  → la instancia  su raíz en AssetWorX · qué solenoides tiene montados ·
 *                       su grupo del historiador («DEMO TANQUE», con espacio)
 *
 * Por eso aquí no aparece `RAIZ` ni ninguna ruta de ICONICS, aunque
 * `senales.js` la exporte: es de la instalación, y viaja en la configuración
 * de la máquina.
 *
 * ── POR QUÉ LOS ROLES SE DERIVAN DEL CATÁLOGO ──────────────────────
 *
 * `vibraciones` declara sus roles a mano porque su catálogo es corto y
 * regular: cuatro medidas × tres apoyos. El del tanque son 52 señales de seis
 * naturalezas distintas, y escribirlas otra vez aquí sería justo la
 * transcripción que la regla de arriba prohíbe.
 *
 * Así que el rol de cada señal SALE de su entrada del catálogo: la naturaleza
 * da la familia y la `key` da la clave. Una señal nueva en `senales.js`
 * aparece aquí sola, que es lo que evita que las dos listas se separen.
 *
 * ── LO QUE ESTE TIPO NO DECLARA, Y ES DELIBERADO ──────────────────
 *
 *   canales            un tanque no tiene apoyos: tiene ACTIVOS, que son
 *                      partes distintas de la instalación (el depósito, el
 *                      grupo de bombeo, la red) y no tres vistas de la misma
 *                      pieza. `canalesDeMaquina()` devuelve `[]` sin ellos.
 *   VIEW_3D            la maqueta del tanque se retiró con sus vistas (Plan
 *                      42.5 F4). Si vuelve, se añade la capacidad.
 *   WRITABLE_VARIABLES nunca se deriva. Deny by default (Plan 33 §20), y esta
 *                      instalación tiene mandos de verdad: arrancar una bomba
 *                      desde el tablero es una decisión aparte.
 */
import { ACTIVO_IDS, activoInfo } from "../tanque/activos.js";
import { estadoDeSenal, estadoInfo, peor } from "../tanque/estado.js";
import { evaluarRiesgos, preguntaSobreRiesgo, REGLAS } from "../tanque/riesgos.js";
import { SENAL_KEYS, SENALES } from "../tanque/senales.js";
import { valorEn } from "../tanque/simulador.js";
import { estadoDelTanque, resumenTanqueParaAsistente } from "../tanque/estadoTanque.js";

/** `familia:clave`, el mismo nombre de rol que usa el resto del proyecto. */
export const rolDe = (familia, clave) => `${familia}:${clave}`;

/**
 * ── LA FAMILIA SALE DE LA NATURALEZA DEL CATÁLOGO ─────────────────
 *
 * `senales.js` ya clasifica cada señal —`alarma`, `mando`, `crudo`,
 * `consigna`, `estado`, y las que no dicen nada son medidas—. Esa distinción
 * está razonada allí y no se vuelve a decidir aquí: se traduce.
 *
 * `medida` es el caso por omisión y no una familia inventada: es lo que una
 * señal ES cuando no es ninguna de las otras cosas, y el catálogo lo expresa
 * dejando `naturaleza` sin poner.
 */
const FAMILIA_DE_NATURALEZA = Object.freeze({
  alarma: "alarma",
  mando: "mando",
  crudo: "crudo",
  consigna: "consigna",
  estado: "estado",
});

const familiaDeSenal = (s) => FAMILIA_DE_NATURALEZA[s?.naturaleza] ?? "medida";

/**
 * Los roles de este tipo, derivados del catálogo.
 *
 * Todos son de ámbito MÁQUINA y ninguno de apoyo: una estación de llenado no
 * repite la misma medida en varios sitios —hay UN nivel, UNA presión de red—,
 * y su reparto por partes lo lleva `activo`, que es otra cosa (ver la
 * cabecera sobre `canales`).
 *
 * `escala` se aplana a `[min, max]` porque es la forma que esperan las vistas
 * genéricas; en el catálogo viene como `{min, max}` y se traduce aquí en vez
 * de obligar a cada consumidor a conocer las dos formas.
 */
export const ROLES = Object.freeze(
  Object.fromEntries(
    SENAL_KEYS.map((key) => {
      const s = SENALES[key];
      const familia = familiaDeSenal(s);
      return [
        rolDe(familia, key),
        Object.freeze({
          clave: key,
          tag: s.tag,
          ambito: "maquina",
          familia,
          label: s.label,
          corto: s.corto ?? null,
          unidad: s.unidad ?? null,
          decimales: s.decimales ?? null,
          escala: s.escala ? [s.escala.min, s.escala.max] : null,
          /* De qué parte de la instalación es. Lo usa la vista para agrupar,
             igual que `sensado` usa el asset. */
          activo: s.activo ?? null,
          /* Que el tipo sepa qué señales tienen historia es lo que permite
             ofrecer `historia_de_senal` sin prometer de más. */
          historizado: Boolean(s.historizado),
          nota: s.nota ?? null,
        }),
      ];
    }),
  ),
);

/**
 * ── LOS ROLES REQUERIDOS SALEN DE LAS REGLAS, NO DE UNA LISTA ─────
 *
 * Se derivan del `necesita` de las propias 17 reglas. Escribirlos a mano sería
 * una segunda lista que se queda vieja en cuanto alguien añade una regla, y el
 * fallo no se vería: una máquina se daría de alta «completa» y sus reglas
 * nunca se evaluarían.
 *
 * Es el mismo criterio que `ROLES_REQUERIDOS` de `vibraciones`, cuya cabecera
 * lo argumenta con el incidente que lo motivó.
 */
export const ROLES_REQUERIDOS = Object.freeze([
  ...new Set(
    REGLAS.flatMap((r) => r.necesita ?? []).map((clave) => {
      const s = SENALES[clave];
      return s ? rolDe(familiaDeSenal(s), clave) : null;
    }).filter(Boolean),
  ),
]);

/** Índice por CLAVE del rol, para `construirSistema` y el descubridor. */
const formaComparable = (s) => String(s ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

const POR_CLAVE = new Map();
const POR_TAG = new Map();
for (const [rolId, r] of Object.entries(ROLES)) {
  const k = formaComparable(r.clave);
  POR_CLAVE.set(k, [...(POR_CLAVE.get(k) ?? []), rolId]);
  if (r.tag) {
    const t = formaComparable(r.tag);
    POR_TAG.set(t, [...(POR_TAG.get(t) ?? []), rolId]);
  }
}

export const rolesDeClave = (clave) => POR_CLAVE.get(formaComparable(clave)) ?? [];
export const rolesDeTag = (tag) => POR_TAG.get(formaComparable(tag)) ?? [];

/** Los roles de un ámbito, como en los demás tipos. */
export const rolesDeAmbito = (ambito) =>
  Object.entries(ROLES).filter(([, r]) => r.ambito === ambito).map(([rol]) => rol);

/**
 * Los nombres por los que una persona pide una de estas señales.
 *
 * Corto a propósito, como en los otros tipos: sólo lo que alguien dice de
 * verdad delante del tablero. El rótulo y el corto entran solos desde el rol;
 * esto se suma encima.
 */
const SINONIMOS_DE_ROL = Object.freeze({
  [rolDe("medida", "nivelTanque")]: ["nivel", "el tanque", "cuánta agua hay"],
  [rolDe("medida", "presionRelativa")]: ["presión", "presión de la red"],
  [rolDe("medida", "flujoInstantaneo")]: ["flujo", "caudal", "litros por minuto"],
  [rolDe("medida", "temperaturaTanque")]: ["temperatura", "temperatura del agua"],
  [rolDe("medida", "cargaMotor")]: ["carga", "carga del motor", "esfuerzo de la bomba"],
  [rolDe("medida", "tensionLinea")]: ["tensión", "voltaje", "desviación de voltaje"],
  [rolDe("alarma", "nivelAltoAlto")]: ["nivel alto", "rebose", "se desborda"],
  [rolDe("alarma", "paroDeEmergencia")]: ["seta", "paro de emergencia", "emergencia"],
  [rolDe("alarma", "fallaVariador")]: ["falla del variador", "variador en falla"],
  [rolDe("alarma", "presionAlta")]: ["presión alta", "sobrepresión"],
});

function aliasDeVariable(variable) {
  const rol = variable?.rol ? ROLES[variable.rol] : null;
  if (!rol) return [];
  const propios = [rol.corto, rol.label, ...(SINONIMOS_DE_ROL[variable.rol] ?? [])].filter(Boolean);
  /* El activo se suma como forma larga: «el nivel del tanque» distingue de
     otra estación cuando haya dos. */
  const act = rol.activo ? activoInfo(rol.activo) : null;
  if (!act?.label) return [...new Set(propios)];
  return [...new Set([...propios, ...propios.map((n) => `${n} ${act.label}`)])];
}

export const TIPO_ESTACION_LLENADO = Object.freeze({
  id: "estacion-de-llenado",
  nombre: "Estación de llenado",
  descripcion:
    "Tanque de almacenamiento con su grupo de bombeo, red de distribución y suministro " +
    "eléctrico: nivel, flujo, presión y temperatura, con el variador, los solenoides y " +
    "sus alarmas de proceso.",

  roles: ROLES,
  rolesRequeridos: ROLES_REQUERIDOS,
  rolesDeClave,
  rolesDeTag,

  /* Sin canales: sus partes son ACTIVOS, no apoyos — ver la cabecera. */

  /*
   * Los activos que este tipo reconoce. El descubridor los necesita para
   * colocar cada variable en su parte de la instalación, y son del TIPO
   * porque cualquier estación de llenado tiene un depósito, un grupo de
   * bombeo y una red; cuáles están montados hoy es de la instancia.
   */
  activos: Object.freeze(
    ACTIVO_IDS.map((id) => {
      const a = activoInfo(id);
      return Object.freeze({ id, sugerencia: a?.label ?? id });
    }),
  ),

  /*
   * Dos señales de esta instalación pueden coincidir sin ser la misma: las
   * nueve alarmas están casi siempre en 0 a la vez. Se declara igual que en
   * `vibraciones`, para que el sondeo no acuse un cruce del historiador donde
   * lo que hay es una planta tranquila.
   */
  seriesEquivalentes: (a, b) => {
    const ra = ROLES[a] ?? Object.values(ROLES).find((r) => r.clave === a);
    const rb = ROLES[b] ?? Object.values(ROLES).find((r) => r.clave === b);
    return Boolean(ra && rb && ra.familia === "alarma" && rb.familia === "alarma");
  },

  /* Las 17 reglas y su motor, IMPORTADOS. Ver la cabecera: aquí no se
     transcribe ninguna. */
  reglas: REGLAS,
  evaluarRiesgos,
  preguntaSobreRiesgo,

  /* La forma común y el resumen, los que ya existían. */
  estado: estadoDelTanque,
  resumen: resumenTanqueParaAsistente,

  /* El vocabulario del oficio, para que el asistente reconozca lo que se le
     pide sin que la pantalla lo enseñe. */
  vocabulario:
    "tanque, nivel, llenado, vaciado, bomba, grupo de bombeo, variador, VFD, " +
    "solenoide, electroválvula, flujo, caudal, presión, red de distribución, " +
    "rebose, paro de emergencia, seta, consigna",

  aliasDe: (variable) => aliasDeVariable(variable),

  /* El criterio de estado por señal, que es del tipo y no de la instalación. */
  estadoDeSenal,
  estadoInfo,
  peorEstado: peor,

  /*
   * Lo que una vista enseña PRIMERO: las cuatro medidas que describen la
   * instalación de un vistazo. No es un juicio de importancia física, es qué
   * se mira al entrar.
   */
  indicadores: [
    rolDe("medida", "nivelTanque"),
    rolDe("medida", "flujoInstantaneo"),
    rolDe("medida", "presionRelativa"),
    rolDe("medida", "cargaMotor"),
  ],

  /** El rango declarado de un rol, y sus bandas si el dominio las da. */
  bandaDe: (rolId) => {
    const r = ROLES[rolId];
    if (!r) return null;
    return Object.freeze({
      escala: r.escala,
      unidad: r.unidad,
      decimales: r.decimales,
      /* A diferencia de `sensado`, aquí SÍ hay criterio detrás: `estadoDeSenal`
         sabe juzgar estas señales, y por eso este tipo declara DIAGNOSTICS. */
      esUmbral: true,
    });
  },

  /* La física de la instalación, para el transporte simulado (Plan 40 F0). */
  simular: (descriptor, ms) => valorEn(descriptor, ms),
  descriptorDe: (rol) => ROLES[rol]?.clave ?? null,

  /*
   * ── QUÉ SABE SERVIR ESTE TIPO ──────────────────────────────────
   *
   * El techo, no lo que una máquina concreta servirá: las capacidades reales
   * se DERIVAN de su configuración.
   *
   * `VIEW_3D` y `WRITABLE_VARIABLES` no están — ver la cabecera. `ALARMS` sí:
   * esta instalación tiene nueve alarmas de proceso declaradas en su catálogo,
   * que es lo que la distingue de una que sólo mide.
   */
  capacidadesPosibles: Object.freeze([
    "CURRENT_DATA",
    "HISTORICAL_DATA",
    "ALARMS",
    "DIAGNOSTICS",
    "RAG",
    "PREVIOUS_CASES",
  ]),
});

export default TIPO_ESTACION_LLENADO;
