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
import { eventosDeAlarma } from "@shared/eva/comun/eventosDeAlarma.js";
import { ALARMAS, SENALES, SENAL_KEYS, pointName } from "../../domain/senales.js";
import { leerSerie } from "../tanque/historia.js";

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
 * Historial de una alarma en las últimas `horas`, DERIVADO de su serie.
 *
 * ── POR QUÉ NO SE USA `/AlarmHistory`, QUE ERA LO DE ANTES ─────────
 *
 * Porque esta instalación no tiene Alarm Historian. Medido contra `bms-server`
 * el 12-09-2026 con `scripts/sondear-alarmas.mjs`: `/AlarmHistory` devuelve
 * **500** con las dos rutas —el tag en vivo (`ac:`) y el del historiador
 * (`hda:`)— y 400 sin `pointName`, con el token ya caliente. No era un fallo de
 * autenticación ni de parámetros: el subsistema no está montado, y por eso la
 * pantalla enseñaba «ICONICS AlarmHistory request failed» hiciera lo que
 * hiciera.
 *
 * Lo que sí hay es Hyper Historian, y las nueve alarmas del PLC están
 * declaradas ahí como booleanos historizados. `/History` las sirve —200, con
 * muestras `{ timestamp, quality, value }`— y de ahí salen los eventos mirando
 * los flancos. En treinta días de esa corrida, tres alarmas tenían flancos
 * reales: `presionAlta` (18 entradas), `faltaDePresion` (17) y `bajoFlujo` (8).
 *
 * ── LO QUE SE GANA Y LO QUE SE PIERDE ──────────────────────────────
 *
 * Se gana: una pantalla que funciona con el servidor que hay, con entrada,
 * salida y duración de cada evento.
 *
 * Se pierde: mensaje, severidad y acuse. Son campos que el Alarm Server escribe
 * en SUS eventos y que un flanco no tiene. No se inventan (`CLAUDE.md` §2.4), y
 * el botón «Reconocer» sale de esta pestaña — reconocer es una operación sobre
 * un `eventId` del Alarm Server, y aquí ese id no existe.
 *
 * ── POR QUÉ SE APOYA EN `leerSerie` Y NO PIDE POR SU CUENTA ────────
 *
 * Porque `leerSerie` ya resuelve lo difícil: el nombre `hda:` correcto
 * (`puntoHistorico`, con su tabla rama→carpeta del Plan 27 F6), el troceado de
 * una ventana larga en varias peticiones, el filtro por calidad y el
 * `hasMore` cuando el servidor recorta. Repetir eso aquí sería una segunda
 * copia que se queda vieja.
 *
 * @param {number} horas
 * @param {string} clave  Clave de dominio de la alarma (`nivelAltoAlto`…).
 * @returns {Promise<{eventos: object[], clave: string, hasMore: boolean}>}
 */
export async function leerAlarmas(horas = 1, clave = ALARMAS_HISTORIZABLES[0]) {
  /*
   * Sin alarma que consultar no se pregunta. Es la diferencia entre una lista
   * vacía —«no ha pasado nada»— y un error: preguntar igual provocaría un fallo
   * del servidor que esta función existe para no provocar.
   */
  if (!clave) return { eventos: [], clave: null, hasMore: false };

  const fin = new Date();
  const inicio = new Date(fin.getTime() - horas * 3_600_000);

  const { datos, motivo, hasMore } = await leerSerie(clave, { inicio, fin });

  /*
   * `motivo` es «esta señal no tiene serie propia», no un fallo de red: se
   * propaga como lista vacía y no como excepción, igual que hace el resto del
   * tablero con una señal sin historiador.
   */
  if (motivo) return { eventos: [], clave, hasMore: false, motivo };

  return { eventos: eventosDeAlarma(datos), clave, hasMore: Boolean(hasMore) };
}
