/**
 * Rehace en inglés el resultado de `resumenVibracionesParaAsistente()`
 * (`shared/eva/vibraciones/estadoVibraciones.js`), que el asistente sirve
 * tal cual en `estado_del_sistema`/`resumen_de_turno`.
 *
 * ── MISMO HALLAZGO QUE EL TANQUE, CON MÁS SUPERFICIE ────────────────────
 *
 * Ver la cabecera de `narrarEstadoTanque.mjs` para el porqué general. Aquí
 * el problema es mayor: `apoyos` no son campos sueltos, son FRASES COMPLETAS
 * compuestas en `estadoVibraciones.js` —a propósito, porque el modelo local
 * confundía magnitudes con nombres parecidos cuando recibía campos sueltos
 * (ver esa cabecera)—, así que no basta con traducir un valor: hay que
 * RECONSTRUIR la frase con las mismas cifras, igual que ya hace
 * `narrarRiesgoEnIngles` con la evidencia de un riesgo.
 *
 * Por eso esta función recibe el `estado` CRUDO (con `.dominio.canales`,
 * `.normaAplicable`) y no el string ya compuesto: traducir palabra por
 * palabra un texto en español ya armado reordenaría mal las cifras en
 * inglés — el mismo argumento que `chat.mjs` ya usa para no traducir la
 * salida del modelo con un traductor. Replica el mismo cálculo que
 * `estadoVibraciones.js:211-216` (apagadas, veredicto ISO), sólo cambian
 * las palabras alrededor.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CANALES, LIMITES_ISO, VIGILANCIAS, bandaISO } from "../../../shared/eva/vibraciones/vibraciones.js";

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

/** El nombre de un canal/apoyo (S1/S2/S3), ya traducido por el frontend. */
function narrarCanal(id, labelEspanol) {
  return MACHINES_EN?.vibration?.channels?.[id] ?? labelEspanol;
}

/**
 * El nombre de un canal, a partir de su LABEL español («Lado acople»), no
 * de su id. Hace falta para `agruparPorRegla()` en `herramientas.mjs`, que
 * sólo tiene `x.canalLabel` (el label, puesto por `shared/eva/vibraciones/
 * riesgosVibracion.js`) y no el id — construir el mapa aquí, una vez al
 * cargar el módulo, evita que cada llamador repita el `CANALES.find(...)`.
 */
const LABEL_A_ID = Object.fromEntries(CANALES.map((c) => [c.label, c.id]));
export function narrarCanalPorLabel(labelEspanol) {
  const id = LABEL_A_ID[labelEspanol];
  return id ? narrarCanal(id, labelEspanol) : labelEspanol;
}

/** La zona ISO ("Zone A"…), mismo criterio que `bandaISO()`: sólo cambia el idioma del label. */
const ZONA_ISO_EN = { A: "Zone A", B: "Zone B", C: "Zone C", D: "Zone D" };

const CIFRA_EN = (x, u, n) => (Number.isFinite(x) ? `${x.toFixed(n)} ${u}` : "could not be read");

/** «NO SE PUDO LEER» → «COULD NOT BE READ», sin tocar un valor real. */
const noSePudoLeerEnIngles = (v) => (v === "NO SE PUDO LEER" ? "COULD NOT BE READ" : v);

/**
 * Reconstruye, para UN apoyo, la misma frase que compone
 * `resumenVibracionesParaAsistente()` — con las MISMAS cifras crudas.
 * `d` es `canales[c.id]` del dominio (`estado.dominio.canales`), nunca el
 * string español ya armado: hace falta el número, no la frase.
 */
function narrarApoyoEnIngles(c, d, normaAplicable) {
  const apagadas = VIGILANCIAS.filter(
    (v) => v.grupo === "rodamiento" && d.vigilancias[v.key]?.id === "apagado",
  ).map((v) => v.key.toUpperCase())
  const veredicto = bandaISO(d.vRMS, normaAplicable)
  const veredictoLabelIso = veredicto ? ZONA_ISO_EN[veredicto.zona] : null

  const banderas =
    d.alarma === null || d.aviso === null
      ? "The module is not reporting this bearing's status, so neither is recorded."
      : d.alarma === true
        ? "The module has the ALARM on for this bearing."
        : d.aviso === true
          ? "The module has the WARNING on for this bearing."
          : "The module reports it as fine: neither alarm nor warning are on.";

  return (
    `${narrarCanal(c.id, c.label)} (${c.id}, bearing ${c.rodamiento ?? "unidentified"}): ` +
    `RMS velocity ${CIFRA_EN(d.vRMS, "mm/s", 3)}` +
    (veredictoLabelIso ? `, which is ${veredictoLabelIso} per ISO 10816-1 Class I` : "") +
    `. RMS acceleration ${CIFRA_EN(d.aRMS, "m/s²", 3)}. ` +
    `Damage value: ${Number.isFinite(d.DKW) ? d.DKW.toFixed(3) : "no learned reference"}. ` +
    banderas +
    (apagadas.length
      ? ` Bearing diagnosis is OFF here (${apagadas.join(", ")}): nobody is watching it.`
      : "")
  );
}

/**
 * Reconstruye `sin_comprobar`, citando los títulos YA traducidos de
 * `noEvaluables` — mismo criterio y mismo tope (4) que
 * `estadoVibraciones.js:270-274`, para que la cuenta y la lista coincidan
 * con lo que el resto del sistema ya calculó.
 */
function narrarSinComprobar(noEvaluables, sinComprobarEspanol) {
  if (!sinComprobarEspanol) return sinComprobarEspanol;
  if (!noEvaluables?.length) return "none: all rules could be evaluated";
  const titulos = [...new Set(noEvaluables.map((x) => x.titulo))].slice(0, 4).join("; ");
  return `${noEvaluables.length} rules could not be evaluated due to missing readings: ${titulos}`;
}

function narrarAvisoVibraciones(avisoEspanol, sinLectura, puntosPedidos) {
  if (!avisoEspanol) return avisoEspanol;
  const base =
    "ANOTHER MACHINE, not the tank: do not relate these vibrations to its flow, pressure or " +
    "level. There IS history of its measurements, flags and drive: it can be queried with " +
    "historia_de_senal(sistema=\"vibraciones\"). What CANNOT be done is put a timeframe on a " +
    "failure: this machine has no declared wear mechanisms.";
  const coda = sinLectura > 0
    ? ` Right now ${sinLectura} of ${puntosPedidos} points are not returning a reading: that is ` +
      "not a quiet machine, it is a silent one."
    : "";
  return base + coda;
}

/**
 * @param {object} resumen — lo que devuelve `resumenVibracionesParaAsistente(estado, ctx)`
 * @param {object} estado — el mismo `estado` (crudo) que se le pasó a esa
 *   función: trae `estado.dominio.canales` y `estado.normaAplicable`, los
 *   números con los que reconstruir `apoyos` en inglés.
 * @param {{noEvaluables: {titulo:string}[]}} riesgosYaNarrados — el MISMO
 *   `riesgos` (ya con `narrarTituloEnIngles` aplicado) que se le pasó al
 *   `resumen()` original: `sin_comprobar` cita esos títulos dentro de una
 *   frase propia del narrador, así que hay que reconstruirla con los
 *   títulos YA en inglés, no traducir el string ya unido.
 * @returns {object} el mismo resumen, con sus campos en inglés
 */
export function narrarResumenVibracionesEnIngles(resumen, estado, riesgosYaNarrados) {
  if (!resumen) return resumen;
  const canales = estado?.dominio?.canales ?? {}

  return {
    ...resumen,
    sistema: MACHINES_EN?.systems?.vibraciones
      ? `${MACHINES_EN.systems.vibraciones} — ANOTHER MACHINE, not the tank`
      : resumen.sistema,
    apoyos: CANALES.map((c, i) => {
      const d = canales[c.id]
      return d ? narrarApoyoEnIngles(c, d, estado?.normaAplicable) : resumen.apoyos[i]
    }),
    variador: {
      velocidad_rpm: noSePudoLeerEnIngles(resumen.variador.velocidad_rpm),
      frecuencia_hz: noSePudoLeerEnIngles(resumen.variador.frecuencia_hz),
      par_pct: noSePudoLeerEnIngles(resumen.variador.par_pct),
      fallo: noSePudoLeerEnIngles(resumen.variador.fallo),
    },
    servidor_de_alarmas: {
      activas_sin_reconocer: noSePudoLeerEnIngles(resumen.servidor_de_alarmas.activas_sin_reconocer),
      activas_reconocidas: noSePudoLeerEnIngles(resumen.servidor_de_alarmas.activas_reconocidas),
      volvieron_a_normal_sin_reconocer: noSePudoLeerEnIngles(
        resumen.servidor_de_alarmas.volvieron_a_normal_sin_reconocer
      ),
      detalle: "Only area counters are available: WHICH alarm tripped cannot be known from here.",
    },
    norma: `ISO 10816-1 Class I: warning ${LIMITES_ISO.aviso} mm/s, alarm ${LIMITES_ISO.alarma} mm/s`,
    sin_comprobar: narrarSinComprobar(riesgosYaNarrados?.noEvaluables, resumen.sin_comprobar),
    aviso: narrarAvisoVibraciones(resumen.aviso, resumen.puntos_sin_lectura, estado?.puntosPedidos),
  };
}
