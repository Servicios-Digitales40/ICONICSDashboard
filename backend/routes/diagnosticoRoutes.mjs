/**
 * El diagnóstico de un riesgo, por HTTP. Plan 16 Fase 5 (UI A).
 *
 *   GET /api/diagnostico?sistema=&riesgoId=    las causas candidatas, puntuadas
 *
 * ── PARA QUÉ EXISTE, SI YA HAY UNA HERRAMIENTA DE CHAT ──────────────
 *
 * `diagnosticar_falla` (Plan 16 Fase 4) le da el mismo resultado al MODELO,
 * para que lo narre. Esta ruta le da el mismo resultado —literalmente el
 * mismo `motorDiagnostico.diagnosticar()`, ninguna lógica propia— a la
 * pantalla de cierre de diagnóstico (`CierreDiagnostico.jsx`), que necesita
 * la lista de causas para PRE-RELLENAR el formulario sin pasar por una
 * conversación con el modelo — el técnico no está ahí para charlar, está
 * ahí para cerrar un caso.
 *
 * La guarda de autenticación ya NO se declara aquí, y no porque se haya
 * quitado: desde el Plan 20 F5 la pone el ámbito donde se registran las rutas
 * de API (`app.mjs`), para las treinta y tres a la vez. Esta cabecera decía
 * que las rutas de sólo lectura no la llevaban — y ese criterio, aplicado ruta
 * por ruta, dejó veinte sin guarda de las que nadie llevaba la cuenta.
 *
 * Lo que sigue sin llevar esta ruta es `exigirRol`: leer un diagnóstico ya
 * calculado no acciona nada.
 */
import { z } from 'zod'
import { SISTEMA_IDS } from '../../shared/eva/comun/sistemas.js'
import { CODIGOS, responderError } from '../http/codigos.mjs'
import { resumirDiagnosticos } from '../ia/motor/metricas.mjs'

/**
 * ── `valoresSensores` POR FIN TIENE QUIEN LO TRAIGA (PLAN 28 F1) ────
 *
 * `diagnosticar()` admite `valoresSensores` desde el Plan 17 F4 —es lo que le
 * permite citar la frase de `datos` con cifras— y su JSDoc decía, medido el
 * 09-09-2026, que **no lo traía NADIE**: esta ruta era la única entrada de
 * producción y su Zod sólo dejaba pasar `sistema` y `riesgoId`. Un camino
 * escrito, probado y nunca recorrido.
 *
 * Llega como JSON en la query porque este endpoint es un GET y la muestra es
 * un objeto pequeño —las señales que declara el `necesita` de una regla, no la
 * planta entera—. Si alguna vez crece, el sitio correcto es un POST, no un
 * query string más largo.
 *
 * Es OPCIONAL y sigue siéndolo: sin él el diagnóstico es exactamente el de
 * siempre. Lo que cambia es que ahora la frase de `datos` y el snapshot pueden
 * llevar las lecturas de verdad cuando quien llama las tiene a mano.
 */
const ValoresSensoresSchema = z
  .string()
  .transform((texto, ctx) => {
    try {
      const objeto = JSON.parse(texto)
      if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
        ctx.addIssue({ code: 'custom', message: '"valoresSensores" tiene que ser un objeto JSON.' })
        return z.NEVER
      }
      return objeto
    } catch {
      ctx.addIssue({ code: 'custom', message: '"valoresSensores" no es JSON válido.' })
      return z.NEVER
    }
  })
  .optional()

const DiagnosticoQuerySchema = z.object({
  sistema: z.enum(SISTEMA_IDS, { error: 'Falta o no reconozco "sistema".' }),
  riesgoId: z.string().min(1, 'Falta "riesgoId".'),
  valoresSensores: ValoresSensoresSchema,
})

/**
 * Cuántos diagnósticos, de qué clase y cuánto tardaron — Plan 28 F7.
 *
 *   GET /api/diagnostico/metricas?horas=   el resumen de la ventana
 *
 * ── SE AGREGA DEL DIARIO, NO DE CONTADORES EN MEMORIA ───────────────
 *
 * El porqué está en la cabecera de `ia/motor/metricas.mjs`, y en resumen: un
 * contador paralelo puede desincronizarse del diario y se va con el proceso —
 * justo cuando más interesa mirarlo, que es después de un incidente.
 *
 * ── POR QUÉ NO LLEVA `exigirRol` ────────────────────────────────────
 *
 * A diferencia de `GET /api/diario`, esto NO es un registro de personas: son
 * agregados del proceso —cuántos diagnósticos salieron insuficientes, qué
 * fuente se cayó más, cuánto tardó el p95—. No hay ninguna IP ni ningún
 * usuario en la respuesta. Mismo criterio que el resto de lecturas de este
 * backend, que no lo llevan.
 *
 * La guarda de autenticación sí, y la pone el ámbito (`app.mjs`), como a las
 * demás rutas de API.
 */
const MetricasQuerySchema = z.object({
  /*
   * La ventana acota el recorrido: el diario llega a megas y agregar dos años
   * para contestar «¿cómo va hoy?» sería trabajo de sobra. 24 h por defecto,
   * una semana de tope — más allá conviene leer el archivo directamente.
   */
  horas: z.coerce.number().int().min(1).max(168).optional(),
})

export function registerDiagnosticoRoutes(fastify, { motorDiagnostico, diarioDiagnosticos }) {
  fastify.get(
    '/api/diagnostico/metricas',
    { schema: { querystring: MetricasQuerySchema } },
    async (request, reply) => {
      if (!diarioDiagnosticos) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el diario de diagnósticos montado.',
          codigo: CODIGOS.ERROR_DIARIO_SIN_MONTAR,
        })
      }

      const horas = request.query.horas ?? 24
      const desde = new Date(Date.now() - horas * 3_600_000)

      try {
        /*
         * `limite` alto a propósito: aquí se quiere AGREGAR la ventana entera,
         * no paginarla. El tope existe para que una ventana absurda no se lleve
         * la memoria del proceso, no para recortar el resultado — y si se
         * alcanza, `truncado` lo dice en vez de servir un promedio calculado
         * sobre la mitad de los datos sin avisar (§2.4).
         */
        const TOPE = 5000
        const { entradas, total } = await diarioDiagnosticos.leer({
          desde, hasta: new Date(), limite: TOPE,
        })

        return {
          ok: true,
          ventanaHoras: horas,
          desde: desde.toISOString(),
          ...resumirDiagnosticos(entradas),
          ...(total > TOPE ? { truncado: { tope: TOPE, hay: total } } : {}),
        }
      } catch (error) {
        return responderError(reply, 500, CODIGOS.ERROR_DIAGNOSTICO, error.message)
      }
    }
  )

  fastify.get(
    '/api/diagnostico',
    { schema: { querystring: DiagnosticoQuerySchema } },
    async (request, reply) => {
      if (!motorDiagnostico) {
        return reply.code(503).send({
          ok: false,
          error: 'Este servidor no tiene el motor de diagnóstico montado.',
          codigo: CODIGOS.ERROR_MOTOR_SIN_MONTAR,
        })
      }

      try {
        const resultado = await motorDiagnostico.diagnosticar(request.query)
        return { ok: true, ...resultado }
      } catch (error) {
        // `diagnosticar()` lanza TypeError ante un riesgoId que no encaja
        // con el sistema — un error de quien llama, no del motor.
        return responderError(reply, 400, CODIGOS.ERROR_DIAGNOSTICO, error.message)
      }
    }
  )
}
