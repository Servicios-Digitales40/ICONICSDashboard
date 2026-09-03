/**
 * backend/ia/herramientas/diagnostico/index.mjs
 * ------------------------------------------------------------------
 * Una única herramienta: `diagnosticar_falla`. Plan 16 Fase 4 — el momento
 * en que el modelo por fin tiene algo que llamar con la lista que puntúa
 * `backend/ia/motor/diagnostico.mjs`.
 *
 * ── POR QUÉ ES SU PROPIA FAMILIA, DE UNA SOLA HERRAMIENTA ──────────
 *
 * Porque no depende de `client` de ICONICS —los datos que necesita ya los
 * trae resuelto el propio `riesgoId`, no los vuelve a leer— ni de nada más
 * de la clausura grande. Su única dependencia es `motorDiagnostico`
 * (`createMotorDiagnostico`, que ya lleva dentro `indiceDocumentos` e
 * `indiceCasos`). Meterla en la familia de `documentacion/` la habría atado
 * a un índice que no es el único que usa, y meterla en la de `maquina/` la
 * habría atado a un `client` que no toca.
 *
 * ── SIN `motorDiagnostico`, SE NIEGA Y LO DICE ──────────────────────
 *
 * Mismo criterio que `consultar_documentacion` sin `indiceDocumentos`: un
 * servidor sin las tres fuentes montadas no inventa una respuesta, dice qué
 * falta. En la práctica esto no debería pasar en producción —`app.mjs`
 * siempre construye el motor—, pero las pruebas y un arranque a medio
 * configurar sí pueden dejarlo en `null`.
 */
import { fallo } from '../lib/respuesta.mjs'

/**
 * @param {object} args
 * @param {{diagnosticar: Function}|null} args.motorDiagnostico  de `ia/motor/diagnostico.mjs`
 */
export function crearHerramientasDeDiagnostico({ motorDiagnostico }) {
  return {
    /**
     * La causa más probable de un riesgo YA activo, con las tres fuentes
     * cruzadas y puntuadas. Ver la cabecera de `ia/motor/diagnostico.mjs` para la
     * aritmética exacta.
     */
    async diagnosticar_falla({ sistema, riesgoId } = {}) {
      if (!motorDiagnostico) {
        return fallo(
          'Este servidor no tiene el motor de diagnóstico montado. No puedo cruzar datos, ' +
            'manual y casos previos: dilo así y no propongas una causa de memoria.'
        )
      }
      if (!sistema) {
        return fallo('Hay que decir de qué sistema: los ids salen de sistemas_de_la_planta.')
      }
      if (!riesgoId) {
        return fallo(
          'Hace falta el `id` del riesgo a diagnosticar, tal cual lo trae riesgos_activos o ' +
            'estado_del_sistema — no el título en prosa.'
        )
      }

      let resultado
      try {
        resultado = await motorDiagnostico.diagnosticar({ sistema, riesgoId })
      } catch (error) {
        // reglaDe() lanza TypeError ante un sistema desconocido o un riesgoId
        // que no pertenece a ese sistema: es un error de quien llama, no del
        // motor, así que se traduce a `fallo` con la misma pista de siempre
        // —dónde sacar el id correcto— en vez de dejar que la excepción
        // tumbe la conversación.
        return fallo(
          `${error.message} Comprueba el \`id\` con riesgos_activos(sistema="${sistema}").`
        )
      }

      if (resultado.huerfano) {
        /*
         * ── DOS CAMPOS, PORQUE HABLAN CON DOS PERSONAS DISTINTAS ──────
         *
         * Esto era UN solo `aviso` que mezclaba lo que el técnico tiene que
         * leer con lo que el modelo tiene que hacer («Dilo así: no inventes
         * una causa…», más los nombres internos de otras herramientas). Un
         * modelo que recibe prosa la copia: medido el 03-09-2026, la
         * respuesta al técnico terminaba con la instrucción entera, tuteo
         * incluido. Una fuga de prompt en la pantalla de planta.
         *
         * El resto de esta herramienta ya separaba las dos cosas —los datos
         * por un lado, `comoRedactar` por otro— y esta rama era la única que
         * no lo hacía. Ahora sigue el mismo patrón.
         */
        return {
          ok: true,
          sistema,
          riesgoId,
          causas: [],
          /*
           * Para el TÉCNICO. Sin tuteo al modelo, sin nombres de
           * herramientas, y sin afirmar cuál de los dos motivos es: hay
           * riesgos deliberadamente sin causas —los informativos y los de
           * estado de la instrumentación, ver la cabecera de `causas.js`— y
           * podría haber uno al que sencillamente le falten. Decir cuál sin
           * mirarlo sería inventar.
           */
          aviso:
            'Este riesgo no tiene causas candidatas cargadas en el sistema. Puede ser ' +
            'deliberado —los riesgos informativos y los que describen el estado de la ' +
            'instrumentación no tienen una causa oculta debajo: el propio riesgo ya dice lo ' +
            'que pasa— o puede que nadie las haya transcrito todavía.',
          /*
           * Para el MODELO. La segunda frase existe por un error medido: sin
           * ella, el modelo explicó la ausencia diciendo «el sistema no ha
           * cargado casos resueltos para este escenario». Es falso y además
           * es accionable en la dirección equivocada — deja al técnico
           * pensando que registrando casos esto empezará a funcionar, cuando
           * lo que faltaría es declarar causas.
           */
          comoRedactar:
            'Traslada el aviso con tus palabras y NO inventes una causa para rellenar el ' +
            'hueco. No atribuyas la ausencia a que falten casos previos ni a que falte ' +
            'documentación: no tiene que ver con eso, es que este riesgo no tiene causas ' +
            'candidatas declaradas. Si el técnico quiere seguir, tú puedes llamar a ' +
            'diagnostico(sintoma=...) para un dossier de datos y manual sobre el síntoma, o a ' +
            'consultar_documentacion — hazlo tú, no se lo pidas a él, y no menciones los ' +
            'nombres de las herramientas en tu respuesta.',
        }
      }

      return {
        ok: true,
        sistema: resultado.sistema,
        riesgoId: resultado.riesgoId,
        // Plan 17 Fase 4 (G9): sólo viaja cuando es `true` — igual que
        // `manualCitado`/`casosCitados` vacíos, "nada que decir" no se dice.
        ...(resultado.conflicto ? { conflicto: true } : {}),
        causas: resultado.causas.map(c => ({
          id: c.id,
          titulo: c.titulo,
          componente: c.componente,
          banda: c.banda,
          respaldo: c.respaldo,
          origen: c.origen,
          ...(c.provisional ? { provisional: true } : {}),
          ...(c.manualCitado.length ? { manualCitado: c.manualCitado } : {}),
          ...(c.casosCitados.length ? { casosCitados: c.casosCitados } : {}),
          // Plan 17 Fase 4 (G6): frases, no sólo el entero de `respaldo`.
          ...(c.evidenciaAFavor.length ? { evidenciaAFavor: c.evidenciaAFavor } : {}),
          ...(c.evidenciaEnContra.length ? { evidenciaEnContra: c.evidenciaEnContra } : {}),
        })),
        /*
         * Plan 16 §2·1: "el código puntúa, el modelo redacta". Esta frase es
         * la que hace cumplir esa frontera — sin ella, un modelo que ve tres
         * causas con puntuaciones parecidas tiende a reordenarlas por su
         * propio criterio, que es exactamente la decisión que este archivo
         * existe para no dejarle tomar.
         */
        comoRedactar:
          'Las causas vienen YA ORDENADAS de más a menos respaldada: narra en ESE orden, sin ' +
          'reordenarlas por tu cuenta aunque te parezcan parecidas. Para cada una, cita su ' +
          '`origen` (de qué manual o regla sale) y di la banda tal cual (ALTO/MEDIO/BAJO), no la ' +
          'conviertas en un porcentaje. Si `manualCitado` trae algo, nombra el documento y la ' +
          'página. Si `casosCitados` trae algo, dilo explícitamente — "un caso anterior con este ' +
          'mismo síntoma tuvo esta causa" (o "se intentó y no funcionó" si alguno de esos casos ' +
          'no está resuelto) es la frase que hace valioso este cruce; una lista de causas sin ' +
          'mencionar los casos previos que la respaldan pierde la mitad del punto de llamarla. Si ' +
          'alguna causa trae `provisional: true`, dilo: el respaldo de datos se apoya en un umbral ' +
          'que todavía es una estimación nuestra, no un rango confirmado. Si una causa trae ' +
          '`evidenciaEnContra`, dilo también, con la misma seguridad que la evidencia a favor — no ' +
          'es un descargo de responsabilidad, es parte de por qué esa causa quedó donde quedó. Si ' +
          '`conflicto` es `true`, dos causas distintas están respaldadas cada una por una fuente ' +
          'distinta (datos, manual o casos): DILO explícitamente — "el manual apunta a X, pero el ' +
          'histórico apunta a Y" — y NO elijas un ganador por tu cuenta ni lo suavices como si las ' +
          'fuentes coincidieran. Enseñar el desacuerdo es el trabajo aquí, no resolverlo. ' +
          'Más adelante en la conversación, cuando el técnico cuente qué encontró o qué hizo para ' +
          'resolver ESTE riesgo —no antes, y no lo fuerces si sigue hablando de otra cosa—, usa ' +
          'cerrar_diagnostico (no registrar_intervencion) con este mismo `riesgoId`: si la causa ' +
          'real coincide con una de las de arriba, pásala por su `id`, no por el título.',
      }
    },
  }
}
