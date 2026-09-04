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
        /*
         * ── ANTES ERA UNA DISYUNTIVA; AHORA SE SABE CUÁL ES ───────────
         *
         * Este aviso decía «puede ser deliberado … o puede que nadie las
         * haya transcrito todavía», y no era pereza: la distinción vivía en
         * la cabecera de `causas.js`, en prosa, y el código no podía leerla.
         *
         * Con un huérfano de diez pasaba desapercibido. Medido el
         * 03-09-2026, en vibraciones son 15 de 18: la respuesta ambigua era
         * la MAYORITARIA de esa máquina, y dejaba al técnico sin saber si el
         * sistema está bien o incompleto. `porQueSinCausas` lo resuelve.
         */
        const sinCausas = resultado.sinCausas ?? { deliberado: false, clase: 'sin-clasificar' }

        const aviso = sinCausas.deliberado
          ? `Este riesgo no tiene causas candidatas, y es correcto que no las tenga: ` +
            `${sinCausas.motivo}`
          : sinCausas.clase === 'pendiente'
            ? `Este riesgo SÍ debería tener causas candidatas y todavía no las tiene: ` +
              `${sinCausas.motivo} Es una pieza que nos falta, no una característica del riesgo.`
            : 'Este riesgo no tiene causas candidatas cargadas, y nadie ha dejado escrito si es ' +
              'deliberado o si faltan por transcribir. Conviene revisarlo.'

        return {
          ok: true,
          sistema,
          riesgoId,
          causas: [],
          // Para el TÉCNICO: sin tuteo al modelo y sin nombres de herramientas.
          aviso,
          // Para que quien integre pueda ramificar sin analizar la prosa.
          sinCausas,
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
            'candidatas declaradas. ' +
            (sinCausas.deliberado
              ? 'Y NO lo presentes como una carencia del sistema: el aviso explica por qué este ' +
                'riesgo concreto no tiene nada debajo que diagnosticar. Decir "todavía no está ' +
                'cargado" sería falso. '
              : 'Aquí sí es una pieza que nos falta: dilo, sin dramatizarlo y sin prometer ' +
                'cuándo estará. ') +
            /*
             * La sugerencia depende de la MÁQUINA desde que el dossier
             * compuesto se acotó al tanque: ofrecérselo para un riesgo de
             * vibraciones mandaría al modelo contra una negativa, y la
             * mayoría de los huérfanos son justamente de esa máquina.
             */
            (sistema === 'tanque'
              ? 'Si el técnico quiere seguir, tú puedes llamar a diagnostico(sintoma=...) para un ' +
                'dossier de datos y manual sobre el síntoma, o a consultar_documentacion'
              : 'Si el técnico quiere seguir, tú puedes llamar a estado_del_sistema e ' +
                'historia_de_senal para esa máquina, o a consultar_documentacion acotada a ella') +
            ' — hazlo tú, no se lo pidas a él, y no menciones los nombres de las herramientas ' +
            'en tu respuesta.',
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
          'mencionar los casos previos que la respaldan pierde la mitad del punto de llamarla. ' +
          /*
           * ── LA CONTRAPARTIDA, QUE FALTABA ────────────────────────────
           *
           * Medido el 03-09-2026 sobre `sobrepresion`: el motor devolvió
           * `casos: 0` y ningún `casosCitados` en las dos causas —la
           * bitácora estaba archivada entera— y el modelo escribió «3 casos
           * previos» en las DOS. Un número inventado, dos veces, en un
           * diagnóstico.
           *
           * No fue por falta de dato: `respaldo.casos` iba a 0 en el mismo
           * objeto. Fue por la frase de arriba, que dice que no mencionar
           * casos «pierde la mitad del punto» y no tenía ningún «y si no
           * hay, no los menciones». Un modelo de 4B lee esa presión y
           * rellena el hueco. Y `casosCitados` se OMITE cuando está vacío
           * —«nada que decir no se dice»—, así que ni siquiera veía una
           * lista vacía que le recordara la ausencia.
           *
           * Esto es la misma clase de defecto que el `aviso` que hablaba
           * con el modelo: una instrucción escrita mirando sólo el caso en
           * que hay algo que contar.
           */
          'Si NO viene `casosCitados`, es que no hay ningún caso previo para esa causa: no los ' +
          'menciones, no des un número y no digas que los hay. `respaldo.casos` en 0 significa ' +
          'exactamente eso. Inventar un caso que nadie registró es peor que no citar ninguno. Si ' +
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
