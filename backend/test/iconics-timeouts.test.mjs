/**
 * Que TODA salida hacia ICONICS lleve corte por tiempo.
 *
 * ── EL FALLO QUE ESTA PRUEBA FIJA ──────────────────────────────────
 *
 * Los saltos del login OIDC salían SIN timeout, mientras que las llamadas de
 * datos de `client.mjs` sí lo tenían desde el principio. Contra un ICONICS que
 * acepta la conexión y no contesta —el modo de fallo de un servidor saturado,
 * no el de uno caído— el login se quedaba esperando para siempre, y con él
 * TODA petición que necesitara token: el puente se quedaba mudo, sin una sola
 * línea en el log que lo explicara.
 *
 * Es peor que el mismo fallo en una lectura, porque el login corre ANTES que
 * cualquier lectura: no se degradaba una pantalla, se paraban todas.
 *
 * ── POR QUÉ SE LEE EL CÓDIGO EN VEZ DE ABRIR UN SOCKET ─────────────
 *
 * La comprobación natural sería levantar un servidor que no conteste y medir
 * que el login se rinde. Se hizo, y funciona —264 ms contra los infinitos de
 * antes—, pero como prueba de Vitest cuelga el worker: el socket pendiente de
 * `AbortSignal.timeout` sobrevive al final del archivo y el proceso no
 * termina, con lo que la suite entera se queda sin salida.
 *
 * Leer el módulo comprueba lo mismo que de verdad importa —que ningún `fetch`
 * saliente se queda sin corte— sin depender del ciclo de vida del runner, y
 * además falla si alguien AÑADE una llamada nueva sin `signal`, que es cuando
 * volvería el fallo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function leer(rutaRelativa) {
  return readFileSync(fileURLToPath(new URL(rutaRelativa, import.meta.url)), 'utf8')
}

/**
 * Trocea el archivo por cada `fetch(` y se queda con las opciones de cada uno
 * —hasta el `})` que las cierra—, que es donde tiene que aparecer `signal`.
 */
function llamadasFetch(fuente) {
  return fuente
    .split(/\bfetch\(/)
    .slice(1)
    .map(trozo => trozo.slice(0, 700))
}

describe('el autenticador OIDC', () => {
  const fuente = leer('../iconics/authenticator.mjs')

  it('tiene todas sus llamadas salientes con corte por tiempo', () => {
    const llamadas = llamadasFetch(fuente)

    expect(llamadas.length).toBeGreaterThan(0)
    for (const [indice, llamada] of llamadas.entries()) {
      expect(
        /signal:\s*AbortSignal\.timeout|signal:\s*\w*[Ss]ignal|timeoutMs\s*\?/.test(llamada),
        `El fetch nº ${indice + 1} de authenticator.mjs sale sin timeout: un ICONICS que ` +
          'acepte y no conteste dejaría el login colgado para siempre, y con él toda ' +
          'petición que necesite token.'
      ).toBe(true)
    }
  })

  it('usa el mismo corte que las llamadas de datos', () => {
    /*
     * Si el servidor de planta es lento, lo es para todo. Dos números que
     * ajustar por separado invitan a que uno se quede corto sin que se note.
     */
    expect(fuente).toMatch(/upstreamTimeoutMs/)
  })
})

describe('el cliente de datos', () => {
  const fuente = leer('../iconics/client.mjs')

  it('mantiene el corte en su única llamada saliente', () => {
    for (const llamada of llamadasFetch(fuente)) {
      expect(llamada).toMatch(/signal:\s*AbortSignal\.timeout/)
    }
  })

  it('distingue el corte por tiempo de no poder conectar', () => {
    /*
     * «El servidor tardó más de 15 s» y «no se pudo conectar» se arreglan en
     * sitios distintos, y un 502 genérico los confunde justo cuando hay prisa
     * por saber cuál de los dos es.
     */
    expect(fuente).toMatch(/TimeoutError/)
    expect(fuente).toMatch(/504/)
  })
})
