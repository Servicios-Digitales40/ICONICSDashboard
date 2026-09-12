/**
 * Historial de alarmas de UNA alarma del PLC — no un semáforo de alarmas
 * ACTIVAS. `GET /api/iconics/alarms` llama a `readAlarmHistory` en el
 * puente: lo que trae es "qué ha pasado", nunca "qué está sonando ahora
 * mismo". Prometer lo segundo con lo primero sería exactamente el tipo de
 * mentira que este tablero evita en todo lo demás — la vista y la insignia
 * del Topbar tienen que decirlo tal cual.
 *
 * ── «DE UNA ALARMA» Y NO «DE LA INSTALACIÓN» (12-09-2026) ───────────
 *
 * Esta cabecera decía «de la instalación», y era la promesa que rompía la
 * pantalla: el servidor no sirve el historial sin un punto concreto. Ver
 * `leerAlarmas()` abajo para el fallo exacto y la decisión. Se corrige aquí
 * porque una cabecera que promete más de lo que el archivo hace es peor que
 * ninguna.
 *
 * ── LA FORMA DE UN EVENTO, Y LO QUE NO SE PUEDE DAR POR HECHO ────────
 *
 * Sólo hay DOS campos confirmados contra el propio backend
 * (`scripts/verificar-backend.mjs`): `eventId` y `startDate` (texto
 * "AAAA-MM-DD HH:MM:SS"). Qué más trae cada evento —el punto, un mensaje,
 * una severidad— lo decide GENESIS64 y no hay un ejemplo real contra el que
 * confirmarlo en este repositorio. `puntoDe()` prueba varios nombres de
 * campo razonables y se queda sin filtrar si ninguno aparece, en vez de
 * asumir uno y filtrar sobre un campo que no existe — eso dejaría la lista
 * VACÍA en silencio, que es peor que enseñarla sin filtrar.
 */
import { fetchIconicsAlarms } from "@/lib/iconics";
import { ALARMAS, SENALES, SENAL_KEYS, pointName, puntoHistorico } from "../../domain/senales.js";

/** Nombres de campo que ICONICS podría usar para el punto de origen del evento. */
const CAMPOS_PUNTO = ["pointName", "PointName", "tag", "Tag", "point", "Point"];

/** El punto de un evento, probando varios nombres posibles de campo. `null` si ninguno aparece. */
function puntoDe(alarma) {
  for (const campo of CAMPOS_PUNTO) {
    if (typeof alarma?.[campo] === "string" && alarma[campo]) return alarma[campo];
  }
  return null;
}

/**
 * Mapa `pointName completo → activo`, calculado una vez: `SENAL_KEYS` no
 * cambia en caliente, así que no hace falta recalcularlo en cada filtro.
 */
const ACTIVO_POR_PUNTO = new Map(SENAL_KEYS.map((key) => [pointName(key), SENALES[key].activo]));

/**
 * ¿Este evento pertenece a `activoId`? Con `activoId` vacío, todo pasa (sin
 * filtro). Un evento cuyo punto no se pudo identificar —`puntoDe` devolvió
 * `null`, o el punto no está en el catálogo de esta demo— pasa el filtro
 * igual: descartarlo en silencio escondería alarmas reales de la vista.
 */
export function perteneceAlActivo(alarma, activoId) {
  if (!activoId) return true;
  const punto = puntoDe(alarma);
  if (!punto) return true;
  const activo = ACTIVO_POR_PUNTO.get(punto);
  return activo ? activo === activoId : true;
}

/** El punto de un evento, en su forma corta (`corto` del catálogo) para mostrar en la lista — o el punto crudo si no se reconoce. */
export function etiquetaDePunto(alarma) {
  const punto = puntoDe(alarma);
  if (!punto) return null;
  const key = [...ACTIVO_POR_PUNTO.keys()].includes(punto)
    ? SENAL_KEYS.find((k) => pointName(k) === punto)
    : null;
  return key ? SENALES[key].corto : punto;
}

/**
 * Las alarmas del PLC que se pueden consultar en el historiador, para el
 * selector de la vista.
 *
 * Sale del catálogo y no de una lista escrita a mano: las ocho llevan
 * `naturaleza: "alarma"` desde el Plan 27 F3, y quien añada una novena la
 * declara ahí y aparece aquí sola.
 */
export const ALARMAS_HISTORIZABLES = ALARMAS.filter((key) => SENALES[key]?.historizado);

/**
 * Historial de una alarma en las últimas `horas`.
 *
 * ── POR QUÉ AHORA PIDE UN PUNTO, Y ANTES NO ────────────────────────
 *
 * Porque sin él el servidor no contesta. Esta función llamaba a
 * `fetchIconicsAlarms(undefined, horas)`, y con `pointName` ausente el puente
 * lo omite del querystring (`withParams` en `iconics/client.mjs` sólo pone lo
 * que tiene valor): a `/AlarmHistory` le llegaba una petición SIN filtro de
 * punto —el historial de la planta entera— y respondía con el error que la
 * pantalla enseñaba, «ICONICS AlarmHistory request failed».
 *
 * ── Y POR QUÉ LA RUTA `hda:` Y NO EL TAG EN VIVO ───────────────────
 *
 * Porque es la que el historiador reconoce:
 * `hda:\Configuration\DEMO TANQUE\ALARMAS:NIVEL_ALTO_ALTO`, confirmada contra
 * el servidor real el 12-09-2026. Es la misma distinción que el Plan 27 F6 ya
 * descubrió para las SERIES del tanque —el nombre en vivo (`ac:`) y el del
 * historiador no coinciden desde la reorganización del árbol del 09-09-2026— y
 * `puntoHistorico()` es quien la resuelve, para que esta capa no repita la
 * tabla de rama→carpeta.
 *
 * ── LO QUE ESTO CAMBIA DE LA PANTALLA, Y ES UNA DECISIÓN ───────────
 *
 * La pestaña «Historial» pasa a ser de UNA alarma, no de toda la instalación.
 * No es un recorte por comodidad: pedir las ocho serían ocho peticiones por
 * cada cambio de ventana, y el historiador las sirve de una en una. Lo que se
 * gana es que la pantalla dice la verdad sobre lo que está mirando; lo que se
 * pierde es la vista agregada, y eso vuelve a estar sobre la mesa el día que
 * `ICO-10` (Plan 26) confirme si el servidor sabe servirla.
 *
 * @param {number} horas
 * @param {string} clave  Clave de dominio de la alarma (`nivelAltoAlto`…).
 */
export async function leerAlarmas(horas = 1, clave = ALARMAS_HISTORIZABLES[0]) {
  const punto = clave ? puntoHistorico(clave) : null;

  /*
   * Sin punto no se pregunta. Es la diferencia entre una lista vacía —«no ha
   * pasado nada»— y un error que dice qué falta: preguntar igual devolvería el
   * mismo fallo del servidor que esta función existe para no provocar.
   */
  if (!punto) return [];

  const { alarms } = await fetchIconicsAlarms(punto, horas);
  return Array.isArray(alarms) ? alarms : [];
}
