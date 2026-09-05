/**
 * Pruebas de `loadConfig`.
 *
 * `loadConfig(env)` acepta el entorno como parámetro —estaba escrito así desde
 * el principio— así que se puede probar entero sin tocar `process.env`.
 *
 * Lo que se cubre es lo que rompe una instalación: los defectos seguros (solo
 * lectura, CORS cerrado, asistente apagado), y los mensajes de error de las
 * variables mal puestas, que son lo único que ve quien arranca el servidor.
 */
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config.mjs'

/** Lo mínimo para que `loadConfig` no falle por otra cosa. */
const BASE = { ICONICS_API_BASE: 'https://planta.local/api' }

describe('loadConfig — defectos seguros', () => {
  it('arranca en solo lectura si nadie dice lo contrario', () => {
    expect(loadConfig(BASE).iconics.readOnly).toBe(true)
  })

  it('deja CORS cerrado si nadie lo abre', () => {
    expect(loadConfig(BASE).corsOrigins).toEqual([])
  })

  it('deja el asistente apagado sin IA_BASE', () => {
    expect(loadConfig(BASE).ia.isConfigured).toBe(false)
  })

  it('deja el dictado apagado sin IA_WHISPER_BASE', () => {
    expect(loadConfig(BASE).ia.whisper.isConfigured).toBe(false)
  })

  it('deja la autenticación de usuarios apagada', () => {
    expect(loadConfig(BASE).auth.habilitada).toBe(false)
  })

  it('no confía en X-Forwarded-For salvo que se declare un proxy', () => {
    expect(loadConfig(BASE).trustProxy).toBe(false)
  })
})

describe('loadConfig — la escritura se pide a propósito', () => {
  it('habilita la escritura sólo con ICONICS_READ_ONLY=false', () => {
    expect(loadConfig({ ...BASE, ICONICS_READ_ONLY: 'false' }).iconics.readOnly).toBe(false)
  })

  it('rechaza el arranque si el valor no es "true" ni "false"', () => {
    /*
     * No cae al defecto seguro: lanza. Es lo correcto y es más estricto de lo
     * que parece —un `ICONICS_READ_ONLY=0` mal escrito no debe interpretarse
     * como "false" ni como "true" en silencio, porque las dos lecturas son
     * defendibles y la equivocada habilita la escritura sobre la planta.
     */
    expect(() => loadConfig({ ...BASE, ICONICS_READ_ONLY: 'no' })).toThrow(/ICONICS_READ_ONLY/)
  })
})

describe('loadConfig — validación de la entrada', () => {
  it('rechaza una ICONICS_API_BASE que no es una URL absoluta', () => {
    expect(() => loadConfig({ ICONICS_API_BASE: 'planta.local/api' })).toThrow(/URL absoluta/)
  })

  it('rechaza una IA_BASE que no es una URL', () => {
    /*
     * `localhost:8080` NO sirve como caso: `new URL()` lo acepta leyendo
     * `localhost:` como protocolo. Hace falta algo que no sea una URL en
     * absoluto para que salte.
     */
    expect(() => loadConfig({ ...BASE, IA_BASE: '//sin-protocolo' })).toThrow(/IA_BASE/)
  })

  it('conserva sólo el origen de IA_BASE', () => {
    const config = loadConfig({ ...BASE, IA_BASE: 'http://localhost:8080/v1/algo' })
    expect(config.ia.base).toBe('http://localhost:8080')
  })

  it('nombra la variable culpable en el mensaje', () => {
    // El mensaje es lo único que ve quien arranca el servidor: si no dice qué
    // variable está mal, hay que ir a buscarlo al código.
    expect(() => loadConfig({ ICONICS_API_BASE: 'roto' })).toThrow(/ICONICS_API_BASE/)
  })
})

describe('loadConfig — modo simulado', () => {
  it('se considera configurado sin ICONICS_API_BASE', () => {
    // Con el transporte falso no hay a dónde conectarse, así que no exigir la
    // base es lo correcto: es lo que permite trabajar sin la máquina de planta.
    const config = loadConfig({ ICONICS_FAKE: 'true' })
    expect(config.iconics.fake).toBe(true)
    expect(config.iconics.isConfigured).toBe(true)
  })
})

describe('loadConfig — CORS', () => {
  it('trocea la lista y descarta los huecos', () => {
    const config = loadConfig({
      ...BASE,
      CORS_ORIGINS: 'http://localhost:5173, ,http://localhost:4173',
    })
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://localhost:4173'])
  })
})

describe('loadConfig — CONNECT_ORIGINS', () => {
  it('está vacío si nadie lo declara, y la CSP se queda como estaba', () => {
    expect(loadConfig(BASE).connectOrigins).toEqual([])
  })

  it('admite varios orígenes exactos y les quita la barra final', () => {
    const config = loadConfig({
      ...BASE,
      CONNECT_ORIGINS: 'http://10.10.17.13:8000/, https://otro.local',
    })
    expect(config.connectOrigins).toEqual(['http://10.10.17.13:8000', 'https://otro.local'])
  })

  it('rechaza el comodín, que aquí no existe igual que en CORS', () => {
    expect(() => loadConfig({ ...BASE, CONNECT_ORIGINS: '*' })).toThrow(/no es un origen/)
  })

  it('rechaza un origen con ruta: en la cabecera no significa lo que parece', () => {
    // `connect-src http://x:8000/api/` NO limita a esa ruta de la forma que
    // quien lo escribe espera, y colarlo deja la cabecera diciendo otra cosa.
    expect(() =>
      loadConfig({ ...BASE, CONNECT_ORIGINS: 'http://10.10.17.13:8000/api/v1' })
    ).toThrow(/lleva algo más que el origen/)
  })
})

describe('loadConfig — el objeto es inmutable', () => {
  it('no deja modificar la configuración después de cargarla', () => {
    const config = loadConfig(BASE)
    // `Object.freeze` en modo módulo (estricto) lanza al asignar.
    expect(() => { config.iconics.readOnly = false }).toThrow()
  })
})
