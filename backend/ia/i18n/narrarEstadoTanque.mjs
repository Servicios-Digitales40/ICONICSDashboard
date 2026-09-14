/**
 * Rehace en inglés el resultado de `resumenTanqueParaAsistente()`
 * (`shared/eva/tanque/estadoTanque.js`), que el asistente sirve tal cual en
 * `estado_del_sistema`/`resumen_de_turno`.
 *
 * ── POR QUÉ ESTO FALTABA (el hallazgo del 12-09-2026) ───────────────────
 *
 * F1-F4 tradujeron lo que el MODELO narra a partir de un dato ya evaluado
 * (evidencia de riesgos, tendencias, avisos de dominio) y el PDF. Pero
 * `estado_del_sistema` para el tanque no pasa por ninguno de esos —su
 * `resumen()` ni siquiera consume `riesgos` (tiene su propia herramienta
 * para eso, ver la cabecera de `estadoTanque.js`)—, así que devolvía
 * `"Estado general: En aviso"`, `"Sistema de agua industrial"`, etc. en
 * español SIEMPRE, sin que nada en la cadena de `idioma` lo tocara. El
 * modelo recibía ese bloque en español y lo citaba en español —no estaba
 * desobedeciendo el prompt, estaba narrando fielmente un dato que ya venía
 * roto—. Confirmado con vibraciones: mismo hueco, mismo motivo.
 *
 * ── POR QUÉ SE REÚSAN `machines.json`/`sensors.json` DEL FRONTEND ──────
 *
 * Porque ya existen, ya están probados (`useDominio.js`, `verificar-i18n.mjs`)
 * y cubren la mayor parte de este vocabulario: los 5 estados
 * (`machines:status`), los 4 activos originales (`machines:assets`), el
 * nombre de la máquina (`machines:systems`) y las 52 señales
 * (`sensors:signals`). Copiarlas a un segundo catálogo sería la misma
 * divergencia que `CLAUDE.md` §2.6 prohíbe. Lo que no existe ahí —las
 * frases explicativas y las etiquetas de valor booleano/enumerado— se
 * declara aquí, aparte, y con fallback a español si falta.
 *
 * `valvulasYAire` y `seguridad` (Plan 27 F5) no tienen todavía entrada en
 * `machines.json`: es una brecha del propio catálogo del frontend, anterior
 * a esto. Se hereda el mismo fallback a español — no se inventa aquí una
 * traducción que el tablero no tiene.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTIVO_IDS } from "../../../shared/eva/tanque/activos.js";
import { SENALES } from "../../../shared/eva/tanque/senales.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_LOCALES = join(
  AQUI, "..", "..", "..", "react-dashboard", "src", "i18n", "locales"
);

function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}

const MACHINES_EN = leerJson(join(RAIZ_LOCALES, "en", "machines.json"));
const SENSORS_EN = leerJson(join(RAIZ_LOCALES, "en", "sensors.json"));

/**
 * Las frases y etiquetas que NO viven en ningún JSON del frontend porque
 * nunca hicieron falta ahí: el tablero no las pinta, sólo las lee el
 * asistente. Por clave del texto español — no por id de señal — porque el
 * mismo par (p. ej. "Activa"/"Inactiva") lo repiten varias señales
 * distintas y sería redundante declararlo una vez por cada una.
 */
const ETIQUETAS_VALOR_EN = {
  "Manual": "Manual",
  "Automático": "Automatic",
  "Activa": "Active",
  "Inactiva": "Inactive",
  "En marcha": "Running",
  "Detenida": "Stopped",
  "Habilitada": "Enabled",
  "Deshabilitada": "Disabled",
  "Encendido": "On",
  "Apagado": "Off",
  "Abrir": "Open",
  "Cerrar": "Close",
  "Bloqueada": "Blocked",
  "Disponible": "Available",
  "Sin emergencia": "No emergency",
  "Emergencia activada": "Emergency active",
  "Error": "Error",
  "Mantenimiento": "Maintenance",
};

const FRASES_EN = {
  queSignificaReposo:
    "The plant is not pumping water: the motor is at zero and no flow is circulating. This is " +
    "its usual condition. Signals that only make sense while running (flow, pressure, motor " +
    "load and efficiency) are not evaluated against their band while this lasts, and show as " +
    "«Idle» instead of out of range.",
  queSonLosActivos:
    "The six assets are PARTS of this same machine —the same PLC, the same installation—, " +
    "grouped this way because each answers a different question. Their signals CAN be " +
    "correlated with each other.",
  porQueReposo:
    "The system is not pumping, so this signal does not mean anything right now.",
  avisoDeUmbrales:
    "The limits used to evaluate each signal are OUR OWN ESTIMATES for a generic water system, " +
    "not ranges confirmed by whoever operates this installation. Say so when giving a verdict.",
};

/** Traduce el `label` de un estado, a partir de su CLAVE (`critico`, `atencion`, `nominal`…). */
export function narrarEstadoPorClave(clave, labelEspanol) {
  return MACHINES_EN?.status?.[clave]?.label ?? labelEspanol;
}

/** Traduce el nombre y la pregunta de un activo, a partir de su id. */
export function narrarActivo(id, labelEspanol, preguntaEspanol) {
  const info = MACHINES_EN?.assets?.[id];
  return {
    label: info?.label ?? labelEspanol,
    pregunta: info?.pregunta ?? preguntaEspanol,
  };
}

/** El nombre de la máquina («Sistema de agua industrial»). */
export function narrarSistema(id, nombreEspanol) {
  return MACHINES_EN?.systems?.[id] ?? nombreEspanol;
}

/** El nombre (`label`) de una señal, a partir de su clave de catálogo. */
export function narrarSenal(clave, labelEspanol) {
  return SENSORS_EN?.signals?.[clave]?.label ?? labelEspanol;
}

/*
 * `conHistoria` (campo de `resumenTanqueParaAsistente()`) sólo trae LABELS
 * ya resueltos —`estado.senales.filter(...).map(s => s.label)`, sin la
 * clave— así que no se puede usar `narrarSenal()` ahí. Se construye un mapa
 * inverso label-español → clave, una vez al cargar el módulo, para poder
 * traducir por texto cuando es lo único que se tiene.
 */
const CLAVE_POR_LABEL = Object.fromEntries(
  Object.entries(SENALES).map(([clave, meta]) => [meta.label, clave])
);

/** Los labels de `conHistoria`, traducidos — ver el porqué arriba. */
export function narrarConHistoria(labelsEspanol) {
  return labelsEspanol?.map((label) => {
    const clave = CLAVE_POR_LABEL[label];
    return clave ? narrarSenal(clave, label) : label;
  });
}

/** La `nota` de una señal, a partir de su clave de catálogo. */
export function narrarNotaSenal(clave, notaEspanol) {
  if (!notaEspanol) return notaEspanol;
  return SENSORS_EN?.signals?.[clave]?.nota ?? notaEspanol;
}

/** Una etiqueta de valor booleano/enumerado («Manual», «Activa»…). */
export function narrarEtiquetaDeValor(textoEspanol) {
  if (!textoEspanol) return textoEspanol;
  return ETIQUETAS_VALOR_EN[textoEspanol] ?? textoEspanol;
}

/** Una de las frases fijas propias de este narrador (no viven en ningún JSON). */
export function narrarFrase(clave, textoEspanol) {
  return FRASES_EN[clave] ?? textoEspanol;
}

/*
 * ── `limitaciones[0]` DE CADA SISTEMA (`shared/eva/comun/sistemas.js`) ──
 *
 * `riesgos_activos`/`estado_del_sistema` citan `elegido.sistema.
 * limitaciones?.[0]` en su `aviso` — es la única que sale en la respuesta
 * VISIBLE al usuario (las demás sólo viajan en el prompt de sistema, vía
 * `inventarioDeLaPlanta()` en chat.mjs, que es contexto para el modelo, no
 * texto citado). Se traduce sólo esa, con fallback a español: traducir las
 * diez completas sin que nada más las cite sería trabajo sin consumidor.
 */
const LIMITACION_0_EN = {
  tanque:
    "The limits used to evaluate each signal are our own estimates for a generic water " +
    "system, not ranges confirmed by whoever operates the installation.",
  vibraciones:
    "Peak acceleration on the drive-end bearing (aPeak_S1) does not have its own series: " +
    "the historian returns the RMS acceleration of the same bearing there instead. Its trend " +
    "cannot be discussed, though the other two bearings' can.",
};

/** `elegido.sistema.limitaciones?.[0]`, traducida — ver el porqué arriba. */
export function narrarPrimeraLimitacion(sistemaId, textoEspanol) {
  return LIMITACION_0_EN[sistemaId] ?? textoEspanol;
}

/*
 * ── ESTAS FUNCIONES SUELTAS SÍ BASTARÍAN, PERO EL RESUMEN TIENE FORMA ──
 * PROPIA Y REPETIR SU RECORRIDO EN CADA LLAMADOR SERÍA DIVERGENCIA. Por
 * eso hay una función que orquesta el objeto ENTERO que devuelve
 * `resumenTanqueParaAsistente()` — igual que `narrarRiesgoEnIngles` orquesta
 * un riesgo entero en vez de dejar que cada llamador traduzca campo a campo.
 *
 * IMPORTANTE: esto vive en el BACKEND, nunca en `shared/eva/tanque/
 * estadoTanque.js`. `resumenTanqueParaAsistente()` sigue componiendo SIEMPRE
 * en español —dominio puro, CLAUDE.md §2.7— y esta función se aplica
 * DESPUÉS, sobre lo que esa función ya devolvió, exactamente igual que
 * `narrarRiesgoEnIngles` nunca toca `shared/eva/tanque/riesgos.js`.
 */

/**
 * @param {object} resumen — lo que devuelve `resumenTanqueParaAsistente()`
 * @returns {object} el mismo resumen, con sus campos en inglés
 */
export function narrarResumenTanqueEnIngles(resumen) {
  if (!resumen) return resumen;

  // `bandaLegible()` (en `estadoTanque.js`) pone "sin límite" en el lado sin
  // tope; es el mismo texto en las cuatro claves, así que se traduce con el
  // mismo criterio "sin límite"/"no limit" que ya usa `formato.mjs` del backend.
  const narrarBanda = (banda) => {
    if (!banda) return banda;
    const lado = (v) => (v === "sin límite" ? "no limit" : v);
    return {
      limiteInferior: lado(banda.limiteInferior),
      avisoInferior: lado(banda.avisoInferior),
      avisoSuperior: lado(banda.avisoSuperior),
      limiteSuperior: lado(banda.limiteSuperior),
    };
  };

  const narrarSenalObjeto = (s) => ({
    ...s,
    senal: narrarSenal(s.clave, s.senal),
    // `describir()`/`describirCompacto()` ya resolvieron `estadoInfo(...).label`
    // antes de devolver esto — aquí sólo llega el label español, no la clave.
    estado: narrarEstadoLabelPorTexto(s.estado),
    ...(s.texto !== undefined ? { texto: narrarEtiquetaDeValor(s.texto) } : {}),
    ...(s.banda ? { banda: narrarBanda(s.banda) } : {}),
    ...(s.nota ? { nota: narrarNotaSenal(s.clave, s.nota) } : {}),
    ...(s.porQueReposo ? { porQueReposo: narrarFrase("porQueReposo", s.porQueReposo) } : {}),
  });

  return {
    ...resumen,
    instalacion: narrarSistema("tanque", resumen.instalacion),
    estadoGeneral: narrarEstadoLabelPorTexto(resumen.estadoGeneral),
    ...(resumen.queSignificaReposo
      ? { queSignificaReposo: narrarFrase("queSignificaReposo", resumen.queSignificaReposo) }
      : {}),
    queSonLosActivos: narrarFrase("queSonLosActivos", resumen.queSonLosActivos),
    activos: resumen.activos?.map((a, i) => {
      const id = ACTIVO_IDS[i];
      const traducido = id ? narrarActivo(id, a.activo, a.responde) : null;
      return {
        ...a,
        activo: traducido?.label ?? a.activo,
        responde: traducido?.pregunta ?? a.responde,
        estado: narrarEstadoLabelPorTexto(a.estado),
        senales: a.senales?.map(narrarSenalObjeto),
      };
    }),
    ...(resumen.conHistoria ? { conHistoria: narrarConHistoria(resumen.conHistoria) } : {}),
    ...(resumen.aviso ? { aviso: narrarFrase("avisoDeUmbrales", resumen.aviso) } : {}),
  };
}

/*
 * `estadoGeneral`/`a.estado`/`s.estado` llegan como LABEL YA RESUELTO
 * (`estadoInfo(...).label`, español) — `resumenTanqueParaAsistente()` no
 * expone la clave cruda en su salida. Se traduce por el VALOR del label
 * español, no por clave, porque es lo único que se tiene en este punto; los
 * cinco labels son fijos y no colisionan entre sí, así que no hay ambigüedad.
 */
const LABEL_A_CLAVE = {
  "Fuera de límite": "critico",
  "En aviso": "atencion",
  "Sin dato": "sin_dato",
  "En reposo": "reposo",
  "En banda": "nominal",
};

function narrarEstadoLabelPorTexto(labelEspanol) {
  const clave = LABEL_A_CLAVE[labelEspanol];
  return clave ? narrarEstadoPorClave(clave, labelEspanol) : labelEspanol;
}
