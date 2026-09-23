/**
 * Las cinco plantillas DECLARADAS pero todavía no compuestas (Plan 44, F4 y
 * F5): riesgos, alarmas, ingeniería, energías y predicciones.
 *
 * ── POR QUÉ EXISTEN ANTES DE PODER DIBUJARSE ─────────────────────────
 *
 * El usuario decidió el 23-09-2026 desarrollar primero las tres plantillas
 * para las que hay toda la información y «dejar preparado» el resto. Preparado
 * significa: el tipo existe en el enum que ve el modelo, el normalizador lo
 * reconoce, su portada y su folio están decididos, y su esqueleto de
 * secciones —transcrito de la maqueta— está escrito. Lo que falta en cada
 * una es `documento(d, ctx)`, y el motivo por el que falta está aquí mismo,
 * en el idioma del PDF, para que la herramienta se lo diga a quien lo pida
 * en vez de emitir un PDF con ocho «sin fuente» (D12).
 *
 * Completar una es: escribir su `documento`, poner `disponible: true`, y
 * añadir sus comprobaciones. Nada más se toca.
 */

/** Un esqueleto: qué secciones lleva la maqueta y con qué bloque saldrían. */
const esqueleto = (secciones) => secciones.map(([id, bloque]) => ({ id, bloque }))

export const riesgos = {
  id: 'riesgos',
  folioPrefijo: 'RIE',
  disponible: false,
  portada: { arte: 'riesgos', disposicion: 'lateral' },
  motivo: (etq) => etq.plantillas.pendientes.riesgos.motivo,
  secciones: esqueleto([['matriz', 'tabla'], ['principales', 'tabla'], ['mitigacion', 'tabla'], ['residual', 'texto'], ['firmas', 'firmas']]),
  claves: ({ medidas }) => medidas,
}

export const alarmas = {
  id: 'alarmas',
  folioPrefijo: 'AL',
  disponible: false,
  portada: { arte: 'alarmas', disposicion: 'lateral' },
  motivo: (etq) => etq.plantillas.pendientes.alarmas.motivo,
  secciones: esqueleto([['resumen', 'indicadores'], ['eventos', 'tabla'], ['distribucion', 'graficas'], ['causas', 'tabla'], ['plan', 'tabla'], ['firmas', 'firmas']]),
  claves: () => [],
}

export const ingenieria = {
  id: 'ingenieria',
  folioPrefijo: 'ING',
  disponible: false,
  portada: { arte: 'ingenieria', disposicion: 'lateral' },
  motivo: (etq) => etq.plantillas.pendientes.ingenieria.motivo,
  secciones: esqueleto([['resumen', 'texto'], ['avance', 'indicadores'], ['hallazgos', 'tabla'], ['evidencia', 'graficas'], ['decisiones', 'texto'], ['plan', 'tabla'], ['firmas', 'firmas']]),
  claves: ({ medidas }) => medidas,
}

export const energias = {
  id: 'energias',
  folioPrefijo: 'ENE',
  disponible: false,
  portada: { arte: 'energias', disposicion: 'lateral' },
  motivo: (etq) => etq.plantillas.pendientes.energias.motivo,
  secciones: esqueleto([['consumo', 'indicadores'], ['tendencia', 'graficas'], ['balance', 'tabla'], ['eficiencia', 'indicadores'], ['oportunidades', 'tabla'], ['firmas', 'firmas']]),
  /* Las del variador con magnitud eléctrica: potencia, corriente, tensión, bus. */
  claves: ({ senales, metaDe }) => senales.map((s) => s.clave).filter((k) => /^variador:(potencia|corriente|tensionSalida|busCC)$/.test(metaDe(k)?.rol ?? '')),
}

export const predicciones = {
  id: 'predicciones',
  folioPrefijo: 'PRE',
  disponible: false,
  portada: { arte: 'predicciones', disposicion: 'lateral' },
  motivo: (etq) => etq.plantillas.pendientes.predicciones.motivo,
  secciones: esqueleto([['fallas', 'indicadores'], ['equipos', 'tabla'], ['consumo', 'graficas'], ['variables', 'tabla'], ['recomendaciones', 'texto'], ['seguimiento', 'tabla']]),
  claves: () => [],
}
