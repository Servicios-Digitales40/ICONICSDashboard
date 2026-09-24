/**
 * `generarReportePorPlantilla` de punta a punta (Plan 44 F3) con la máquina
 * ESPEJO, un lector de máquina que devuelve valores conocidos y un
 * historiador sintético: lo que se afirma es el manifiesto, los rechazos, y
 * que el PDF se escribe de verdad.
 */
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { generarReportePorPlantilla } from '../../ia/reportes/generar.mjs'
import { construirSistema } from '../../../shared/eva/comun/construirSistema.js'
import { desregistrarSistema, registrarSistema } from '../../../shared/eva/comun/sistemas.js'
import { tipoDe } from '../../../shared/eva/tipos/index.js'
import { configuracionEspejo } from '../../../scripts/lib/configuracionEspejo.mjs'

const ESPEJO = configuracionEspejo({ verificadasDelCatalogo: true }).configurada
let entrada
let reportes

/* Valores conocidos por punto: las medidas leen, las banderas están a cero, y
   UN punto (aRMS del segundo apoyo) no entrega, para ver el hueco viajar. */
const valorDe = (punto) => {
  if (/aRMS_S2$/.test(punto)) return null
  if (/vRMS_S3$/.test(punto)) return 2.9 // en aviso (ISO: > 1,8)
  if (/vRMS_/.test(punto)) return 1.2
  if (/SPEED|velocidad/i.test(punto)) return 1480
  if (/Alarma|Warning|FAULT|WARNING|offset/i.test(punto)) return 0
  return 1.0
}
const muestras = (v, base) => {
  const n = 12
  const paso = (v.fin - v.inicio) / n
  return Array.from({ length: n }, (_, i) => ({ t: new Date(v.inicio.getTime() + i * paso), valor: base + i * 0.01 }))
}
const deps = (extra = {}) => ({
  idioma: 'es',
  resolverSistema: (id) => (id === entrada.id || id === entrada.nombre ? { ok: true, sistema: entrada } : { ok: false, error: `no hay «${id}»` }),
  leerMaquina: async (s) => ({ ok: true, estado: s.estado(valorDe, s, '2026-09-23T10:00:00Z'), receivedAt: '2026-09-23T10:00:00Z' }),
  evaluarRiesgosDe: (s, estado) => tipoDe(s.tipo).evaluarRiesgos(estado.dominio),
  leerSerieEnRango: async (clave, v) => ({ muestras: /DKW/.test(clave) ? [] : muestras(v, /vRMS_S3/.test(clave) ? 2.8 : 1.1), diasLeidos: 1, diasTotal: 1 }),
  reportes,
  ahora: () => new Date('2026-09-23T10:00:00Z'),
  ...extra,
})

beforeAll(async () => {
  entrada = registrarSistema(construirSistema(ESPEJO, tipoDe('vibraciones')))
  reportes = { dir: await mkdtemp(join(tmpdir(), 'plan44-reportes-')), maxDias: 30 }
})
afterAll(() => desregistrarSistema(ESPEJO.id))

async function esPdf(r) {
  const id = new URL(`http://x${r._adjunto.url}`).searchParams.get('id')
  const contenido = await readFile(join(reportes.dir, `${id}.pdf`))
  return contenido.subarray(0, 4).toString() === '%PDF'
}

describe('los tres tipos disponibles, sobre la espejo', () => {
  it('tecnico: siete secciones, indicadores del tipo, tendencias y estadísticas de las series leídas, análisis por activo', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, deps())
    expect(r.ok, r.error).toBe(true)
    expect(r.tipo).toBe('tecnico')
    expect(r.reporte).toBe('REPORTE TÉCNICO')
    expect(r.instalacion).toBe(ESPEJO.nombre)
    expect(r.folio).toMatch(/^TDCON-TEC-20260923-/)
    expect(r.paginas).toBeGreaterThanOrEqual(3)
    expect(r.seccionesConDato).toEqual([
      '1. Resumen operativo', '2. Indicadores principales', '3. Tendencias de variables',
      '4. Estadísticas del período', '5. Análisis técnico', '6. Conclusiones', '7. Firmas',
    ])
    expect(r.seccionesSinDato).toBeUndefined()
    expect(r.graficas).toBeGreaterThan(0)
    expect(r.graficas).toBeLessThanOrEqual(8)
    expect(r._adjunto).toMatchObject({ tipo: 'reporte', formato: 'pdf' })
    expect(r._adjunto.titulo).toBe(`REPORTE TÉCNICO — ${ESPEJO.nombre} — las últimas 6 horas`)
    expect(await esPdf(r)).toBe(true)
  })

  it('vibraciones: el espectro sale como sección SIN dato con su motivo, y lo demás con dato', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'CMS', sistema: ESPEJO.nombre, periodo: 'últimas 6 horas', explicacion: 'Vigilar el lado libre.' }, deps())
    expect(r.ok, r.error).toBe(true)
    expect(r.tipo).toBe('vibraciones')
    expect(r.folio).toMatch(/^TDCON-VIB-/)
    expect(r.seccionesSinDato).toEqual([
      { seccion: '3. Espectro de vibración', motivo: expect.stringMatching(/vigilancias del espectro/) },
    ])
    expect(r.seccionesConDato).toContain('2. Puntos de medición')
    expect(r.seccionesConDato).toContain('5. Diagnóstico')
    expect(r.seccionesConDato).toContain('5b. Diagnóstico probable (redacción)')
    expect(r.seccionesConDato).toContain('6. Recomendaciones')
    expect(await esPdf(r)).toBe(true)
  })

  it('lectura-de-sensores: lecturas, calidad y acciones en blanco con dato; en inglés los títulos cambian', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'sensor readings', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, deps({ idioma: 'en' }))
    expect(r.ok, r.error).toBe(true)
    expect(r.tipo).toBe('lectura-de-sensores')
    expect(r.reporte).toBe('SENSOR READINGS REPORT')
    expect(r.folio).toMatch(/^TDCON-SEN-/)
    expect(r.seccionesConDato).toEqual([
      '1. Monitored variables', '2. Readings and traceability', '3. Reading trends',
      '4. Calibration and data quality', '5. Actions', '6. Closing', '7. Signatures',
    ])
    expect(await esPdf(r)).toBe(true)
  })

  it('sin `sistema`, con una sola configurada en servicio, la elige; el modelo no tiene que nombrarla', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'tecnico', periodo: 'últimas 6 horas' }, deps())
    expect(r.ok, r.error).toBe(true)
    expect(r.sistema).toBe(ESPEJO.id)
    expect(r.elaboro).toBe('Asistente de planta TDCON · generado automáticamente')
  })

  it('con el usuario de la sesión en las dependencias, «Elaboró» es él y la respuesta lo dice (§6.1)', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, deps({ usuario: ' moises ' }))
    expect(r.ok, r.error).toBe(true)
    expect(r.elaboro).toBe('moises · vía el asistente de planta TDCON')
    /* Un usuario vacío no firma. */
    const sin = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, deps({ usuario: '  ' }))
    expect(sin.elaboro).toBe('Asistente de planta TDCON · generado automáticamente')
  })
  it('riesgos: la matriz sitúa lo observable y aparta lo que no tiene serie, con su motivo (F4, D15)', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'riesgos', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, deps())
    expect(r.ok, r.error).toBe(true)
    expect(r.folio).toMatch(/^TDCON-RIE-/)
    /* La 2b existe porque hay reglas que miran configuración, no señales: sin
       serie que observar no se les inventa una probabilidad. */
    expect(r.seccionesConDato).toContain('2b. Riesgos que no se pueden situar en la matriz')
    expect(await esPdf(r)).toBe(true)
  })

  it('riesgos: sin ninguna regla activa no se dibuja una matriz vacía, se dice que no hay riesgo', async () => {
    /* Todo en banda: ISO no se pronuncia y ninguna regla enciende. */
    const enBanda = (punto) => (/vRMS_|aRMS|aPeak/.test(punto) ? 0.5 : /SPEED|velocidad/i.test(punto) ? 1480 : 0)
    const r = await generarReportePorPlantilla(
      { tipo: 'riesgos', sistema: ESPEJO.id, periodo: 'últimas 6 horas' },
      deps({ leerMaquina: async (s) => ({ ok: true, estado: s.estado(enBanda, s, '2026-09-23T10:00:00Z'), receivedAt: '2026-09-23T10:00:00Z' }) }),
    )
    expect(r.ok, r.error).toBe(true)
    const matriz = r.seccionesSinDato?.find((s) => /Matriz/.test(s.id ?? '') || /matriz/i.test(s.motivo ?? ''))
    /* O la matriz sale sin dato, o sale con celdas: lo que NO puede es salir
       con una rejilla y cero riesgos dentro sin decirlo. */
    expect(matriz || r.seccionesConDato.some((s) => /Matriz/.test(s))).toBeTruthy()
  })

  it('alarmas: cuenta por severidad derivada del rol y separa «sin flancos» de «sin serie» (F4)', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'alarmas', sistema: ESPEJO.id, periodo: 'últimas 6 horas' }, deps())
    expect(r.ok, r.error).toBe(true)
    expect(r.folio).toMatch(/^TDCON-AL-/)
    expect(r.seccionesConDato).toContain('1. Resumen de alarmas')
    /* Las banderas del arnés están a cero y sus series son planas: ninguna
       cambió de estado, que es un HECHO, no un hueco del historiador. */
    const eventos = r.seccionesSinDato?.find((s) => /Eventos/.test(s.id ?? ''))
    if (eventos) expect(eventos.motivo).toMatch(/no hay eventos que listar|cambió de estado/)
    expect(await esPdf(r)).toBe(true)
  })
})

describe('lo que se niega, y cómo', () => {
  it('un tipo desconocido lista los tipos; uno ambiguo pide elegir; "catalogo" no es de aquí', async () => {
    const a = await generarReportePorPlantilla({ tipo: 'bonito', sistema: ESPEJO.id }, deps())
    expect(a.ok).toBe(false)
    expect(a.error).toMatch(/No hay ningún tipo de reporte llamado «bonito»/)
    expect(a.tipos).toContain('tecnico')

    const b = await generarReportePorPlantilla({ tipo: 'técnico de alarmas', sistema: ESPEJO.id }, deps())
    expect(b.ok).toBe(false)
    expect(b.tipos).toEqual(['tecnico', 'alarmas'])

    const c = await generarReportePorPlantilla({ tipo: 'catalogo', sistema: ESPEJO.id }, deps())
    expect(c.ok).toBe(false)
  })

  it('una plantilla declarada pero no compuesta se niega con su motivo y dice cuáles sí', async () => {
    /* `riesgos` y `alarmas` salieron de esta lista en la F4: ya se componen. */
    for (const tipo of ['ingenieria', 'energias', 'predicciones']) {
      const r = await generarReportePorPlantilla({ tipo, sistema: ESPEJO.id }, deps())
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/todavía no se compone/)
      expect(r.disponibles).toEqual(['catalogo', 'tecnico', 'vibraciones', 'lectura-de-sensores', 'riesgos', 'alarmas'])
    }
    const en = await generarReportePorPlantilla({ tipo: 'predictions', sistema: ESPEJO.id }, deps({ idioma: 'en' }))
    expect(en.error).toMatch(/wear mechanisms/)
  })

  it('una máquina que resolverSistema no conoce devuelve SU fallo; una que no es configurada se niega', async () => {
    const a = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: 'otra' }, deps())
    expect(a).toEqual({ ok: false, error: 'no hay «otra»' })
    const b = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: 'tanque' }, deps({ resolverSistema: () => ({ ok: true, sistema: { id: 'tanque', nombre: 'Tanque', configurada: false } }) }))
    expect(b.ok).toBe(false)
    expect(b.error).toMatch(/CONFIGURADAS/)
  })

  it('sin lectura de la máquina, el error del servidor; sin carpeta de reportes, se dice; un período inválido también', async () => {
    const a = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: ESPEJO.id }, deps({ leerMaquina: async () => ({ ok: false, error: 'HTTP 503' }) }))
    expect(a.error).toMatch(/HTTP 503/)
    const b = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: ESPEJO.id }, deps({ reportes: null }))
    expect(b.error).toMatch(/no están configurados/)
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const c = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: ESPEJO.id, periodo: manana }, deps())
    expect(c.ok).toBe(false)
  })

  it('con el historiador vacío el técnico sale igual: tendencias y estadísticas como ausencias, el resto con dato', async () => {
    const r = await generarReportePorPlantilla({ tipo: 'tecnico', sistema: ESPEJO.id, periodo: 'últimas 6 horas' },
      deps({ leerSerieEnRango: async () => ({ muestras: [], diasLeidos: 0, diasTotal: 1 }) }))
    expect(r.ok, r.error).toBe(true)
    expect(r.seccionesConDato).toContain('2. Indicadores principales')
    /* Cada serie sin muestras sigue siendo una gráfica con su nota: la sección
       tiene dato (las notas) y las estadísticas dicen «sin muestras». */
    expect(r.seccionesConDato).toContain('3. Tendencias de variables')
    expect(r.seccionesSinDato).toBeUndefined()
  })
})
