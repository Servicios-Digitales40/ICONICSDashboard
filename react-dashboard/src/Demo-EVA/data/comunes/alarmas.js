/**
 * Historial de alarmas de la instalación — no un semáforo de alarmas
 * ACTIVAS. `GET /api/iconics/alarms` llama a `readAlarmHistory` en el
 * puente: lo que trae es "qué ha pasado", nunca "qué está sonando ahora
 * mismo". Prometer lo segundo con lo primero sería exactamente el tipo de
 * mentira que este tablero evita en todo lo demás — la vista y la insignia
 * del Topbar tienen que decirlo tal cual.
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
import { SENALES, SENAL_KEYS, pointName } from "../../domain/senales.js";

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
 * Historial de alarmas de las últimas `horas`. Delgado a propósito: sólo
 * envuelve `fetchIconicsAlarms` para que la vista y la insignia del Topbar
 * no tengan que saber de la forma HTTP de la respuesta.
 */
export async function leerAlarmas(horas = 1) {
  const { alarms } = await fetchIconicsAlarms(undefined, horas);
  return Array.isArray(alarms) ? alarms : [];
}
