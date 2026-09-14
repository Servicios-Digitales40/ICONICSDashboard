/**
 * «¿De dónde salió este número?», contestado una sola vez para toda la app.
 *
 * ── POR QUÉ EXISTE / POR QUÉ ASÍ ────────────────────────────────────
 *
 * La respuesta ya estaba entera en el árbol, pero repartida en cinco sitios
 * que no se conocen entre sí: el tag de ICONICS lo sabe `pointName()`, el PLC
 * y la cadencia los declara `SISTEMAS`, el código de calidad lo interpreta
 * `shared/quality.js`, si hay serie propia lo decide `esHistorizada()`, y la
 * cobertura del rango la calcula `historia.js`. Para saber de dónde viene un
 * valor había que preguntar a los cinco y saber que existen.
 *
 * Esto NO calcula nada nuevo: recoge. Es la diferencia entre un panel de
 * procedencia y una segunda opinión sobre el dato — `CLAUDE.md` §4.3 prohíbe
 * que una vista recalcule una banda, y recalcular una calidad rompería la
 * misma capa. Si algún día la respuesta a una de estas preguntas cambia, se
 * cambia en su módulo y esto lo hereda.
 *
 * ── POR QUÉ ES DE UN PUNTO, Y NUNCA DE DOS ─────────────────────────
 *
 * Un panel de procedencia es, por naturaleza, una vista transversal: la misma
 * pregunta para cualquier señal de cualquier máquina. Eso lo convierte en la
 * invitación perfecta a poner dos sistemas uno al lado del otro «para
 * comparar de dónde vienen», y ahí es donde esta aplicación ya se ha cortado
 * una vez: el Plan 23 encontró que la guarda contra cruzar las dos máquinas no
 * protegía el caso real —diez de las cuarenta y dos etiquetas de vibraciones
 * resolvían a una señal del tanque— y `correlacionar_senales` podía contestar
 * `ok: true` mezclando dos PLC (corregido en `98fe465`).
 *
 * Por eso la unidad de esta API es UN punto y la firma no admite una lista.
 * Quien quiera la procedencia de dos señales llama dos veces y las pinta
 * aparte; lo que no hay es una función que devuelva una tabla de dos sistemas,
 * porque esa función es el primer paso para promediarlos.
 *
 * ── LA AUSENCIA DE DATO NO SE DISFRAZA, TAMPOCO AQUÍ ───────────────
 *
 * `CLAUDE.md` §2.4. Cada campo que no se pueda contestar viaja como `null` con
 * su motivo, nunca como un valor por defecto plausible: un punto sin lectura
 * no tiene «calidad buena», tiene calidad desconocida, y son cosas distintas.
 */
import { MOTIVO } from '../../quality.js'
import { sistemaDePunto } from './sistemas.js'

/**
 * Qué significa cada código de motivo, en una frase, para quien mira el panel.
 *
 * Vive aquí y no en el diccionario de i18n porque es DOMINIO: describe lo que
 * el servidor dijo del dato, no una etiqueta de interfaz. Quien lo pinte
 * traduce la clave; el hecho que describe es el mismo en los dos idiomas.
 *
 * Las claves son las de `MOTIVO` en `shared/quality.js`, que son estables a
 * propósito: «el TEXTO puede reescribirse; el código, no».
 */
export const EXPLICACION_MOTIVO = Object.freeze({
  [MOTIVO.MALA]: 'calidadMala',
  [MOTIVO.INCIERTA]: 'calidadIncierta',
  [MOTIVO.SIN_ENTREGA]: 'sinEntrega',
  [MOTIVO.DESCONOCIDA]: 'calidadDesconocida',
})

/**
 * De dónde viene el valor en vivo de una señal.
 *
 * @param {object} [p]
 * @param {object} [p.senal]    La señal ya evaluada (`createSenal`): trae
 *   `key`, `tag`, `rama`, `historizado`, `valor`, `motivo`, `receivedAt`,
 *   `stale`. No se le pide nada que no traiga ya.
 *
 *   Opcional en la firma y no por descuido: sin señal la respuesta es `null`,
 *   porque «no hay dato del que decir la procedencia» es un caso normal aquí
 *   —una tarjeta que todavía no tiene su señal— y no un error de programación
 *   que merezca reventar. Marcarlo obligatorio obligaría a cada llamante a
 *   comprobarlo antes, y el que se olvidara pasaría `undefined` igual.
 * @param {string|null} [p.punto]  Su nombre completo de ICONICS, si quien
 *   llama lo tiene resuelto (`pointName(key)`). Es lo que identifica al
 *   SISTEMA, así que sin él la procedencia sale sin máquina en vez de
 *   adivinarla por la clave — dos catálogos pueden llamar igual a dos señales
 *   distintas, que es justo el cruce de `98fe465`.
 * @param {object|null} [p.cobertura]  La del rango que se está viendo, tal
 *   como la devuelve `historia.js` (`tramosConDato`, `tramosPosibles`).
 * @returns {{
 *   punto: string|null,
 *   sistema: {id: string, nombre: string, plc: string, cadenciaMs: number}|null,
 *   lectura: {receivedAt: Date|null, stale: boolean, hayValor: boolean, motivo: string|null, explicacion: string|null},
 *   serie: {historizada: boolean, ruta: string|null, agregado: string|null, nota: string|null},
 *   cobertura: {tramosConDato: number, tramosPosibles: number, completa: boolean}|null,
 * }}
 */
export function procedenciaDe({ senal, punto = null, cobertura = null } = {}) {
  if (!senal) return null

  const sistema = punto ? sistemaDePunto(punto) : null
  const motivo = senal.motivo ?? null

  return {
    /* El tag tal cual lo conoce el servidor. Es el dato con el que alguien
       puede ir a ICONICS a mirar el punto por su cuenta, así que va entero y
       sin acortar. */
    punto,

    sistema: sistema
      ? {
          id: sistema.id,
          nombre: sistema.nombre,
          plc: sistema.plc,
          cadenciaMs: sistema.cadenciaMs,
        }
      : null,

    lectura: {
      receivedAt: senal.receivedAt ?? null,
      stale: Boolean(senal.stale),
      /* `hayValor` y no `valor`: este módulo dice de dónde viene el dato, no
         cuánto vale. Quien pinta el panel ya tiene la señal delante. */
      hayValor: senal.valor !== null && senal.valor !== undefined,
      motivo,
      explicacion: motivo ? EXPLICACION_MOTIVO[motivo] ?? null : null,
    },

    serie: {
      historizada: Boolean(senal.historizado),
      /* La mecánica del historiador es de CADA máquina (`ac:` vs `hda:`,
         `Average` vs `Interpolative`), así que sale del registro y no de una
         constante: ver la nota de `series` en `sistemas.js`. */
      ruta: sistema?.series?.ruta ?? null,
      agregado: sistema?.series?.agregado ?? null,
      nota: sistema?.series?.nota ?? null,
    },

    cobertura: resumirCobertura(cobertura),
  }
}

/**
 * La cobertura, reducida a lo que un panel puede decir sin mentir.
 *
 * `historia.js` la devuelve con su `avisoCobertura` ya redactado en español,
 * porque nació para el asistente. Aquí sólo viajan las CUENTAS: el texto lo
 * pone quien pinta, en el idioma que toque. Es la misma separación que
 * `tiles.jsx` ya documenta para el panel de cobertura de las gráficas.
 */
function resumirCobertura(cobertura) {
  if (!cobertura) return null

  const conDato = cobertura.tramosConDato
  const posibles = cobertura.tramosPosibles ?? cobertura.tramos

  if (!Number.isFinite(conDato) || !Number.isFinite(posibles) || posibles <= 0) return null

  return {
    tramosConDato: conDato,
    tramosPosibles: posibles,
    completa: conDato >= posibles,
  }
}
