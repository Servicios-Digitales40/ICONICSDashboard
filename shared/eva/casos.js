/**
 * El texto por el que se BUSCA un caso — Plan 16 Fase 2, Fuente #3 del
 * diagnóstico (junto a los datos en vivo y los manuales).
 *
 * ── UN «CASO» NO ES UN TIPO NUEVO DE DATO ───────────────────────────
 *
 * Es una `intervencion` de `aprendizaje.js` —síntoma, causa, solución,
 * sistema, si funcionó— vista desde el ángulo de la búsqueda por parecido.
 * La forma del registro ya la declara `crearIntervencion`, y la bitácora ya
 * la rellena hoy, por voz y por chat, con `registrar_intervencion`. Lo que
 * faltaba no era un almacén nuevo: era CÓMO se convierte esa intervención en
 * el texto que se embebe para encontrarla dentro de seis meses, y por qué no
 * es su JSON crudo.
 *
 * Este archivo no toca disco ni red: sólo esa conversión, y por eso vive en
 * `shared/` — la misma regla que separa `documentos.mjs` (E/S) de lo que
 * describe qué es un fragmento.
 */
import { SISTEMAS } from "./sistemas.js";

/**
 * La frase de recuperación de una intervención: lo que se embebe, NO el
 * JSON del registro.
 *
 * Un JSON embebido recupera mal: `"resuelto": true`, las comillas y las
 * llaves del propio formato son ruido sintáctico que diluye la señal
 * semántica real —el texto del síntoma y de la solución, que es lo que de
 * verdad se parecerá a un problema futuro—. Se arma en cambio una frase en
 * lenguaje natural, con las mismas partes en el orden en que alguien las
 * contaría en voz alta.
 *
 * El sistema va primero y en un idioma que el propio texto ya usa —«Sistema
 * de vibraciones», no el id `"vibraciones"` a secas— porque el modelo de
 * embeddings entiende palabras, no claves de un registro.
 *
 * ── EL DESMENTIDO, PLAN 17 FASE 2 (G3) ──────────────────────────────
 *
 * `backend/ia/motor/diagnostico.mjs · respaldoDeCasos` ya empareja por el id
 * estructurado (`causaReal.tipo`, `diagnostico.propuesta` +
 * `diagnosticoCorrecto`) cuando existe, y ESO no depende de este texto. Lo
 * que sí depende de este texto es que el caso llegue a aparecer entre los
 * candidatos de `buscarCasosSimilares` para empezar: la búsqueda puntúa por
 * parecido léxico/semántico con el título de la causa, y un cierre cuya
 * `causa` en prosa no menciona la causa PROPUESTA —sólo la real— podía
 * quedar fuera de la búsqueda que evalúa esa causa propuesta, precisamente
 * el caso que hace falta encontrar para poder refutarla.
 *
 * Medido en la auditoría del 01-09-2026: un caso con
 * `diagnostico.propuesta: "consigna-variador-alta"` y
 * `causaReal.tipo: "valvula-alivio-no-actua"` sólo mencionaba, en su
 * `causa` de texto libre, la válvula — nunca el variador. Sin esas dos
 * frases aquí, la causa refutada no baja de banda: el caso que la refuta
 * ni se encuentra al buscar por su título.
 */
export function textoDeRecuperacion(intervencion) {
  const sistema = SISTEMAS.find((s) => s.id === intervencion.sistema);

  const partes = [
    sistema ? `Sistema: ${sistema.nombre}.` : "Toda la planta, sin un sistema concreto.",
    intervencion.sintoma,
    intervencion.causa ? `Causa: ${intervencion.causa}.` : null,
    `Solución: ${intervencion.solucion}.`,
    /*
     * Se dice explícitamente, no se calla, cuando NO funcionó: un intento
     * fallido tiene que aparecer en la búsqueda igual que uno que sí
     * funcionó —es la mitad de por qué existe la bitácora, ver
     * `intervenciones` en `aprendizaje.js`— y si el texto no lo menciona,
     * el propio embedding no tiene forma de distinguir los dos casos.
     */
    intervencion.resuelto === false ? "Este intento NO funcionó." : "El intento funcionó.",
    // El desmentido: sólo cuando hay algo que desmentir, es decir, cuando
    // hubo una propuesta del sistema Y una causa real confirmada distinta.
    // `causaReal.tipo` nombra la causa real con el mismo vocabulario que
    // `causa.titulo` en `shared/eva/causas.js` — es lo que hace que la
    // búsqueda por el título de la causa REAL también encuentre este caso.
    intervencion.causaReal?.tipo && intervencion.diagnostico?.propuesta
      ? `El sistema propuso "${intervencion.diagnostico.propuesta}"; la causa real fue "${intervencion.causaReal.tipo}".`
      : null,
  ];

  return partes.filter(Boolean).join(" ");
}
