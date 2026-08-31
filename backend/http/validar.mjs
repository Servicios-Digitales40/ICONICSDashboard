/**
 * Puente entre los esquemas de Zod y las rutas de Fastify.
 *
 * Fastify valida con JSON Schema por defecto. Se usa Zod en su lugar porque
 * los esquemas de esta API necesitan reglas que JSON Schema no expresa —que
 * `endDate` sea posterior a `startDate`, que un nombre de punto pase la lista
 * blanca de ICONICS— y tener las dos mitades de la validación en dos lenguajes
 * distintos es la forma segura de que una se quede atrás.
 *
 * Los errores se lanzan como `ZodError` y los traduce la frontera de
 * `plugins/errores.mjs`, que es el único sitio que decide la forma de una
 * respuesta de error.
 */

/**
 * Valida el cuerpo de la petición contra un esquema y lo sustituye por el
 * resultado ya parseado.
 *
 * Sustituirlo importa: los esquemas aplican `.trim()`, `.default()` y
 * coerciones de fecha, así que el handler recibe valores normalizados y no
 * tiene que repetir ese trabajo — que es donde antes divergían dos rutas que
 * leían el mismo campo.
 *
 * @example
 *   fastify.post('/api/chat', { preHandler: validarCuerpo(ChatSchema) }, handler)
 */
export function validarCuerpo(esquema) {
  return async request => {
    request.body = await esquema.parseAsync(request.body ?? {})
  }
}

/**
 * Lo mismo para la cadena de consulta.
 *
 * Todo lo que llega por query string es texto, así que los esquemas que la
 * validan usan `z.coerce` donde esperan un número o una fecha.
 */
export function validarConsulta(esquema) {
  return async request => {
    request.query = await esquema.parseAsync(request.query ?? {})
  }
}
