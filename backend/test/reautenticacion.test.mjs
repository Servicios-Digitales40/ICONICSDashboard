/**
 * Que la página de login de OIDC no pase por una lectura (B9).
 *
 * ── EL INCIDENTE QUE ESTO FIJA ─────────────────────────────────────
 *
 * Medido el 11-09-2026 contra la planta, en un puente con 7 h 53 min de
 * marcha. ICONICS había invalidado la sesión por su cuenta y, en vez de un
 * 401, devolvía esto a cada lectura:
 *
 *     HTTP 200
 *     <html><head><title>Working...</title></head>
 *     <form action="https://bms-server/.../connect/authorize">…
 *
 * Como petición HTTP salió bien, así que el cliente lo envolvía en un
 * `{ ok: true, status: 200, payload: "<html>…" }` y ese HTML viajaba por el
 * sistema como si fuera el valor de un punto. El tablero se quedaba en «Sin
 * dato» y la pantalla de Salud —la que existe para diagnosticar— decía «token
 * válido», porque `hasValidToken()` comprueba nuestro reloj y nunca al
 * servidor.
 *
 * Es el modo de fallo del §2.4 del CLAUDE.md: un servidor que contesta y no
 * dice nada. Y el diagnóstico que daba la pantalla era el equivocado.
 *
 * ── POR QUÉ UN SERVIDOR DE VERDAD Y NO UN `fetch` SUSTITUIDO ───────
 *
 * Mismo criterio que `rutas/salud.test.mjs`: lo que se comprueba es que el
 * camino ENTERO —desde el cuerpo que llega por el socket hasta lo que
 * `estadoLecturas()` le cuenta al health— trata esto como lo que es. Con el
 * `fetch` mockeado se estaría probando la función de detección, que es la
 * parte fácil.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'

import { createIconicsClient } from '../iconics/client.mjs'
import { loadConfig } from '../config.mjs'
import { estadoDeLosDatos } from '../routes/systemRoutes.mjs'

/** El cuerpo exacto que devolvió `bms-server`, recortado. */
const PAGINA_DE_LOGIN =
  '<html><head><title>Working...</title></head><body>' +
  '<form method="POST" name="hiddenform" ' +
  'action="https://bms-server/fwxserverweb/security/connect/authorize">' +
  '<input type="hidden" name="client_id" value="in_house_client" />' +
  '<input type="hidden" name="redirect_uri" value="https://bms-server/fwxapi/signin-oidc" />' +
  '</form></body></html>'

/** Un autenticador que dice que todo va bien: es justo el que se equivoca. */
const AUTENTICADOR_CONFIADO = {
  authorizationHeaders: async () => ({}),
  hasValidToken: () => true,
}

describe('un ICONICS con la sesión caducada', () => {
  let server
  let client

  beforeAll(async () => {
    server = createServer((_req, res) => {
      // 200, no 401: es lo que hace el servidor real y lo que engañaba al puente.
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(PAGINA_DE_LOGIN)
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))

    const config = loadConfig({
      ICONICS_API_BASE: `http://127.0.0.1:${server.address().port}/fwxapi/rest/v1`,
      ICONICS_USERNAME: 'u',
      ICONICS_PASSWORD: 'p',
      ICONICS_POINT_NAME: 'ac:x',
      LOG_LEVEL: 'ERROR',
      PORT: '0',
    })
    client = createIconicsClient(config, AUTENTICADOR_CONFIADO)
  })

  afterAll(() => new Promise(r => server.close(r)))

  it('no se cuenta como una lectura buena, aunque venga con 200', async () => {
    const sobre = await client.readPoints(['ac:TDCON/DEMO/NIVEL_TANQUE'])

    expect(sobre.ok).toBe(false)
    /* 401 es lo que el servidor debería haber contestado, y es lo que hace que
       quien llame lo trate como lo que es: una sesión que hay que renovar. */
    expect(sobre.status).toBe(401)
    expect(sobre.error).toMatch(/reautenticación/i)
  })

  it('el HTML NO viaja como si fuera el valor de un punto', async () => {
    const sobre = await client.readPoints(['ac:TDCON/DEMO/NIVEL_TANQUE'])

    /* El fallo original entero: el `payload` llevaba la página dentro y el
       resto del sistema la trataba como un dato de planta. */
    expect(JSON.stringify(sobre)).not.toContain('<html>')
    expect(JSON.stringify(sobre)).not.toContain('connect/authorize')
  })

  it('el health lo dice como REAUTENTICACIÓN, no como «la lectura falló»', async () => {
    await client.readPoints(['ac:TDCON/DEMO/NIVEL_TANQUE'])

    const tarjeta = estadoDeLosDatos({
      config: { iconics: { fake: false, readOnly: false, origin: 'https://bms-server' } },
      connectivity: { reachable: true },
      /* El autenticador sigue diciendo que el token vale —y por eso hacía
         falta esto: lo único que sabe la verdad es la respuesta que llegó. */
      tokenValid: true,
      lecturas: client.estadoLecturas(),
      ahora: Date.now(),
    })

    expect(tarjeta.estado).toBe('error')
    expect(tarjeta.plantilla.clave).toBe('needsReauth')
    expect(tarjeta.detalle).toMatch(/REAUTENTICACIÓN/)
    expect(tarjeta.detalle).toMatch(/reiniciando el puente/i)
  })
})
