/**
 * `generar_reporte` con `tipo`: de la petición al PDF de una plantilla.
 *
 * ── POR QUÉ ESTÁ AQUÍ Y NO EN `historicos/index.mjs` ─────────────────
 *
 * La herramienta de siempre (el catálogo) sigue en la familia `historicos`;
 * cuando llega un `tipo` distinto de `catalogo`, delega aquí. Así el archivo
 * de la familia —zona de Gustavo, Plan 44 D11— cambia en cuatro líneas, y
 * todo lo nuevo vive en `reportes/`. Se importa con `await import()` desde la
 * herramienta, como `reporte.mjs`: si pdfkit no está, falla dentro de la
 * herramienta y no en el arranque.
 *
 * ── LO QUE SE NIEGA, Y POR QUÉ ────────────────────────────────────────
 *
 * - Un `tipo` que no se reconoce: `fallo` con la lista. No un PDF genérico.
 * - Una frase que nombra dos tipos: `fallo` pidiendo elegir.
 * - Una plantilla declarada pero no compuesta (F4/F5): `fallo` con su motivo
 *   y los tipos que sí están.
 * - Una máquina que no es configurada: las plantillas hablan por familias de
 *   rol y capacidades; el tanque (cerrado) no las tiene.
 * - Ninguna sección con dato (D12): `fallo`, no un documento de ausencias.
 *
 * Las dependencias que abren red o disco llegan inyectadas (`deps`), para
 * probarlo con la máquina espejo y un historiador sintético.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { MAX_DIAS_REPORTE, purgarReportesViejos, resolverVentana } from '../conversacion/herramientas.mjs'
import { fallo } from '../herramientas/lib/respuesta.mjs'
import { etiquetasDeReporte } from '../i18n/etiquetasReporte.mjs'
import { renderizarGraficoSerie } from '../../../shared/eva/comun/graficos.js'
import { tipoDe } from '../../../shared/eva/tipos/index.js'

import { componerPorPlantilla } from './compositor.mjs'
import { recolectar } from './recolectores.mjs'
import { configuradasEnServicio, sistemaPorOmision } from './sistemaPorOmision.mjs'
import { CATALOGO, TIPOS, TIPOS_DISPONIBLES, plantillaDe, tipoDeReporte } from './plantillas/index.mjs'

/* La máquina por omisión vive en su módulo, sin pdfkit, porque la usa también
   el catálogo de siempre al arrancar (ver la cabecera de `sistemaPorOmision.mjs`). */
export { sistemaPorOmision } from './sistemaPorOmision.mjs'

/**
 * @param {{tipo: string, sistema?: string, periodo?: string, explicacion?: string}} args
 * @param {object} deps
 * @param {'es'|'en'} deps.idioma
 * @param {(id: string) => {ok: boolean, sistema?: object, error?: string}} deps.resolverSistema
 * @param {(sistema: object) => Promise<{ok: boolean, estado?: object, error?: string}>} deps.leerMaquina
 * @param {(sistema: object, estado: object) => {activos: object[], noEvaluables: object[], evaluadas: number}} deps.evaluarRiesgosDe
 * @param {(clave: string, ventana: {inicio: Date, fin: Date}, sistemaId: string) => Promise<{muestras: object[], diasLeidos: number, diasTotal: number}>} deps.leerSerieEnRango
 * @param {{dir: string, maxDias: number}} deps.reportes
 * @param {object} [deps.turnos]
 * @param {() => Date} [deps.ahora]
 */
export async function generarReportePorPlantilla(
  { tipo, sistema, periodo, explicacion } = {},
  { idioma = 'es', usuario = null, resolverSistema, leerMaquina, evaluarRiesgosDe, leerSerieEnRango, reportes, turnos = {}, ahora = () => new Date() },
) {
  const etq = etiquetasDeReporte(idioma)

  const reconocido = tipoDeReporte(tipo)
  if (!reconocido) {
    return fallo(
      `No hay ningún tipo de reporte llamado «${tipo}». Los tipos son: ${TIPOS.join(', ')}. ` +
        `Sin \`tipo\` (o con "${CATALOGO}") sale el de siempre: todas las señales de la máquina.`,
      { tipos: TIPOS, disponibles: [CATALOGO, ...TIPOS_DISPONIBLES] },
    )
  }
  if (reconocido.ambiguo) {
    return fallo(
      `«${tipo}» nombra más de un tipo de reporte (${reconocido.ambiguo.join(', ')}). Pregunta al usuario ` +
        'cuál quiere; no elijas por él.',
      { tipos: reconocido.ambiguo },
    )
  }
  if (reconocido.tipo === CATALOGO) {
    return fallo(`El tipo "${CATALOGO}" lo compone la herramienta de siempre; esta función es sólo para plantillas.`)
  }

  const plantilla = plantillaDe(reconocido.tipo)
  if (!plantilla.disponible) {
    return fallo(
      `El reporte «${etq.plantillas[reconocido.tipo]?.titulo ?? reconocido.tipo}» está declarado pero todavía no ` +
        `se compone: ${plantilla.motivo(etq)} Los que sí se generan hoy: ${TIPOS_DISPONIBLES.join(', ')} (y "${CATALOGO}", ` +
        'el de todas las señales).',
      {
        tipo: reconocido.tipo,
        disponibles: [CATALOGO, ...TIPOS_DISPONIBLES],
        /* Medido el 23-09-2026: ante esta negativa el modelo real contestó como
           si hubiera generado OTRO reporte, con un enlace inventado. La nota
           es para él; la guarda de verdad —un enlace en la respuesta sin
           adjunto— es del bucle del chat (HANDOFF §8). */
        nota:
          'NO se generó ningún PDF y no hay ningún enlace: no digas que generaste otro reporte ni ' +
          'escribas ninguna URL. Di por qué no sale este tipo, ofrece los disponibles, y si el ' +
          'usuario quiere uno de ellos, llama a generar_reporte otra vez con ese tipo.',
      },
    )
  }

  /* La máquina: la que se nombra (id, nombre o alias, vía `resolverSistema`),
     o la única configurada en servicio si no se nombra ninguna. */
  let entrada
  if (sistema !== undefined && sistema !== null && String(sistema).trim()) {
    const elegido = resolverSistema(sistema)
    if (!elegido.ok) return elegido
    entrada = elegido.sistema
  } else {
    entrada = sistemaPorOmision()
    if (!entrada) {
      const candidatas = configuradasEnServicio()
      return fallo(
        candidatas.length
          ? `Hay ${candidatas.length} máquinas configuradas: di de cuál es el reporte (${candidatas.map((s) => s.id).join(', ')}).`
          : 'No hay ninguna máquina configurada en servicio de la que hacer un reporte por plantilla.',
        { sistemas: candidatas.map((s) => s.id) },
      )
    }
  }
  if (!entrada.configurada || !entrada.metaDe) {
    return fallo(
      `Los reportes por plantilla son de máquinas CONFIGURADAS (hablan por familias de rol y capacidades). ` +
        `«${entrada.nombre}» no lo es; su reporte de todas las señales sí se puede pedir sin \`tipo\`.`,
      { sistema: entrada.id },
    )
  }

  const ventana = resolverVentana(periodo, { turnos, maxHoras: MAX_DIAS_REPORTE * 24 })
  if (ventana.error) return fallo(ventana.error)

  const tipoObj = tipoDe(entrada.tipo)
  const fuentes = {
    leerMaquina,
    evaluarRiesgos: (s, estado) => evaluarRiesgosDe(s, estado),
    leerSerie: (clave, v) => leerSerieEnRango(clave, v, entrada.id),
    graficar: (muestras, opciones) => renderizarGraficoSerie(muestras, opciones),
  }
  const d = await recolectar({ entrada, tipo: tipoObj, plantilla, ventana, etq, idioma, fuentes })
  if (!d.ok) {
    return fallo(`No se pudo leer «${entrada.nombre}» del servidor ICONICS: ${d.error}`)
  }

  /* Fecha Y hora: un PDF se archiva y se lee otro día; «16:19» solo no dice cuándo. */
  const generadoEl = ahora().toLocaleString(idioma === 'en' ? 'en-US' : 'es-MX', { dateStyle: 'short', timeStyle: 'short' })
  /* Quién firma «Elaboró»: el id de la sesión que preguntó, si la hay (§6.1). */
  const firmante = typeof usuario === 'string' && usuario.trim() ? usuario.trim() : null
  const documento = plantilla.documento(d, {
    etq, idioma, entrada, tipo: tipoObj, ventana, generadoEl, usuario: firmante,
    explicacion: typeof explicacion === 'string' && explicacion.trim() ? explicacion.trim() : null,
  })

  /* D12: si NINGUNA sección de contenido trae dato, no hay reporte que emitir.
     Las firmas no cuentan como dato: siempre están. */
  const contenido = documento.secciones.filter((s) => s.bloque !== 'firmas')
  const sinNada = contenido.every((s) => s.ausente || !tieneAlgo(s))
  if (sinNada) {
    return fallo(
      `«${entrada.nombre}» no tiene dato para ninguna sección del reporte «${documento.titulo}»: ` +
        contenido.map((s) => `${s.titulo}: ${s.ausente ?? etq.sinDatos}`).join(' · ') +
        ' No se emite un PDF vacío.',
      { tipo: plantilla.id, sistema: entrada.id },
    )
  }

  if (!reportes?.dir) return fallo('Los reportes PDF no están configurados en este servidor.')

  const { pdf, paginas, folio, secciones } = await componerPorPlantilla({ plantilla, documento, etq })

  const id = randomUUID()
  await mkdir(reportes.dir, { recursive: true })
  await purgarReportesViejos(reportes.dir, reportes.maxDias)
  await writeFile(join(reportes.dir, `${id}.pdf`), pdf)

  const titulosPorId = new Map(documento.secciones.map((s) => [s.id, s.titulo]))
  const conDato = secciones.filter((s) => s.conDato).map((s) => titulosPorId.get(s.id))
  const sinDato = secciones.filter((s) => !s.conDato).map((s) => ({ seccion: titulosPorId.get(s.id), motivo: s.motivo }))

  return {
    ok: true,
    tipo: plantilla.id,
    reporte: documento.titulo,
    instalacion: entrada.nombre,
    sistema: entrada.id,
    periodo: ventana.etiqueta,
    folio,
    paginas,
    elaboro: firmante ? etq.plantillas.comun.firmaUsuario(firmante) : etq.plantillas.comun.firmaAsistente,
    seccionesConDato: conDato,
    ...(sinDato.length ? { seccionesSinDato: sinDato } : {}),
    graficas: d.series.size,
    nota:
      'El reporte ya se ha generado y el enlace de descarga se le ha entregado al usuario. Confirma qué ' +
      'trae citando "seccionesConDato", y si hay "seccionesSinDato" di cuáles y por qué, con el motivo ' +
      'literal: esas secciones van en el PDF con ese texto, no en blanco. No describas cifras que no ' +
      'están en esta respuesta y no inventes el enlace.',
    _adjunto: {
      tipo: 'reporte',
      formato: 'pdf',
      url: `/api/reportes?id=${id}`,
      titulo: `${documento.titulo} — ${entrada.nombre} — ${ventana.etiqueta}`,
    },
  }
}

/** ¿Trae la sección algo que dibujar? Misma regla que el compositor. */
function tieneAlgo(s) {
  return (s.items?.length ?? 0) > 0 || (s.filas?.length ?? 0) > 0 || (s.parrafos?.length ?? 0) > 0
}
