/**
 * Los rótulos fijos del PDF (`ia/reporte.mjs`), en el idioma del tablero.
 *
 * ── POR QUÉ ESTO ES DISTINTO DE `narrarRiesgo.mjs`/`narrarTendencia.mjs` ───
 *
 * Los dos anteriores traducen HECHOS que compone el dominio o el motor de
 * reglas —una evidencia con cifras, una dirección de tendencia—. Esto es la
 * plantilla del documento en sí: títulos de sección, cabeceras de columna,
 * el nombre del rol en el diálogo. No hay ningún cálculo detrás, así que no
 * hace falta interpolar ni resolver `context`: es un mapa fijo por clave.
 *
 * ── POR QUÉ EL PDF Y NO SÓLO EL PROMPT ─────────────────────────────────
 *
 * El PDF se cierra y se guarda ANTES de que el modelo escriba una palabra
 * (ver la cabecera de `generar_reporte` en `historicos/index.mjs`): es un
 * archivo, no una respuesta de chat. `idioma` no le llega al modelo para
 * que lo narre, le llega a `reporte.mjs` para que componga el documento
 * directamente en ese idioma — la misma razón por la que `describirTendencia`
 * y `sintesisAutomatica` ya redactan en código y no esperan al modelo.
 */

const ES = {
  reporteTitulo: 'REPORTE TÉCNICO',
  reporteSubtitulo: 'Monitoreo y análisis de planta',
  generadoEl: (fecha) => `Generado el ${fecha}`,
  folio: 'FOLIO',
  folioPie: 'Folio',
  paginaDe: (n, total) => `Página ${n} de ${total}`,
  seccionSintesis: 'Síntesis',
  seccionResumenAsistente: 'Resumen del asistente',
  seccionValoresActuales: 'Valores actuales (sin serie histórica)',
  colSenal: 'SEÑAL',
  colValor: 'VALOR',
  colEstado: 'ESTADO',
  sinDato: 'sin dato',
  seccionTendencias: 'Tendencias',
  resumenGrafico: (r, unidad) =>
    `Mínimo ${r.minimo}${unidad} · Máximo ${r.maximo}${unidad} · Promedio ${r.promedio}${unidad} ` +
    `· ${r.muestras} muestras`,
  coberturaParcial: (c) =>
    `Sólo ${c.diasLeidos} de los ${c.diasTotal} días del rango tienen registro en el historiador: ` +
    'estas cifras son de esos días, no del período entero.',
  seccionNotasYAvisos: 'Notas y avisos',
  conversacionTitulo: 'REPORTE DE CONVERSACIÓN',
  conversacionSubtitulo: 'Diálogo con el asistente de planta',
  rolOperador: 'Operador',
  rolAsistente: 'Asistente',
  instalacion: 'Sistema de agua industrial',

  /* ── Los bloques del compositor por plantilla (Plan 44 F1) ──────────
     Lo genérico del documento: lo que una sección dice cuando su fuente no
     trajo nada, y el rótulo que separa lo medido de lo que redactó el modelo.
     Los títulos de cada plantilla van en `plantillas`, más abajo. */
  sinDatos: 'Sin datos en esta sección para esta máquina y este período.',
  redaccionAsistente: 'Redacción del asistente',
  sinValor: '—',

  /* ── Las plantillas (Plan 44 F3): títulos, columnas y las frases en código ─ */
  plantillas: {
    comun: {
      elaboro: 'Elaboró',
      reviso: 'Revisó',
      aprobo: 'Aprobó',
      firmaAsistente: 'Asistente de planta TDCON · generado automáticamente',
      sintesis: 'Síntesis del sistema',
      chipSistema: 'Sistema',
      chipPeriodo: 'Periodo',
      chipGenerado: 'Generado',
      chipCondicion: 'Condición',
      chipEquipo: 'Equipo',
      chipPlanta: 'Planta',
      chipActivos: 'Activos',
      todaLaMaquina: 'Toda la máquina',
      sinCriterio: 'Sin criterio de banda',
      sinLectura: 'Sin lectura',
      sinSerieCorto: 'sin serie verificada',
      sinMuestrasCorto: 'sin muestras',
      coberturaCompleta: 'completa',
      cobertura: (c) => `${c.diasLeidos} de ${c.diasTotal} días`,
      vsAnterior: 'vs. período anterior',
      deTotal: (n) => `de ${n} señales`,
      banderasSinLectura: (n) => `${n} bandera(s) sin lectura`,
      nivel: { critico: 'Crítico', atencion: 'Atención', informativo: 'Informativo' },
      prioridad: { critico: 'Alta', atencion: 'Media', informativo: 'Baja' },
      sinMuestras: (label, periodo) => `Sin muestras de ${label} en ${periodo}.`,
      noSeDibujo: (label, error) => `No se pudo dibujar ${label}: ${error}`,
      sinSeries: (nombre) => `«${nombre}» no tiene ninguna serie verificada en el historiador para estas medidas: se puede decir cómo está ahora, no cómo estuvo.`,
      sinDominio: 'Esta máquina no reconstruye su dominio por roles: las reglas de riesgo no se pueden evaluar.',
      reglasEvaluadas: (n) => `${n} regla(s) del tipo evaluadas con la lectura actual. Son reglas del tablero cruzando señales, no alarmas del servidor ICONICS.`,
      riesgosNoEvaluables: (n, evaluadas) => `${n} regla(s) no se pudieron evaluar por falta de lecturas (${evaluadas} sí). «Sin riesgos» aquí no significa «está bien» para esas.`,
      sinRiesgosActivos: (evaluadas, noEvaluables) => `Ninguna de las ${evaluadas} reglas evaluadas está activa${noEvaluables ? `; ${noEvaluables} no se pudieron evaluar por falta de lecturas` : ''}. No hay acción que el tipo recomiende.`,
      observacion: (r) => {
        const partes = [`${r.conLectura} de ${r.total} señales con lectura`]
        if (r.fuera) partes.push(`${r.fuera} fuera de límite`)
        if (r.aviso) partes.push(`${r.aviso} en aviso`)
        if (r.enBanda) partes.push(`${r.enBanda} en banda`)
        return `${partes.join(', ')}.`
      },
      resumen: ({ nombre, periodo, conLectura, total, estado, activos, noEvaluables }) =>
        `«${nombre}», ${periodo}: ${conLectura} de ${total} señales con lectura` +
        (total - conLectura ? ` (${total - conLectura} sin lectura)` : '') +
        `. Estado general con criterio de banda: ${estado ?? 'sin señal con criterio que leer'}. ` +
        (activos === null
          ? 'Las reglas de riesgo no se pudieron evaluar.'
          : `${activos} riesgo(s) activo(s)${noEvaluables ? `, ${noEvaluables} regla(s) sin poder evaluar` : ''}.`),
      resumenSensores: ({ nombre, periodo, sensores, conLectura, fuera, aviso, verificadas }) =>
        `«${nombre}», ${periodo}: ${conLectura} de ${sensores} sensores con lectura` +
        (fuera ? `, ${fuera} fuera de límite` : '') + (aviso ? `, ${aviso} en aviso` : '') +
        `. ${verificadas} de ${sensores} con serie verificada en el historiador.`,
      conclusion: ({ estado, fuera, aviso, sinLectura, activos, subiendo }) => {
        const partes = []
        partes.push(estado ? `La máquina cierra el período ${estado.toLowerCase()} en lo que tiene criterio de banda` : 'Ninguna señal con criterio de banda tuvo lectura, así que no hay veredicto de banda')
        if (fuera || aviso) partes.push(`${fuera ? `${fuera} fuera de límite` : ''}${fuera && aviso ? ' y ' : ''}${aviso ? `${aviso} en aviso` : ''}`)
        if (sinLectura) partes.push(`${sinLectura} señal(es) sin lectura, que no se cuentan como cero`)
        if (activos) partes.push(`${activos} riesgo(s) activo(s) según las reglas del tipo`)
        if (subiendo?.length) partes.push(`con tendencia al alza en el período: ${subiendo.join(', ')}`)
        return `${partes.join('; ')}.`
      },
    },
    tecnico: {
      titulo: 'REPORTE TÉCNICO',
      lema: 'Monitoreo y análisis de planta',
      secciones: {
        resumen: '1. Resumen operativo',
        indicadores: '2. Indicadores principales',
        tendencias: '3. Tendencias de variables',
        estadisticas: '4. Estadísticas del período',
        analisis: '5. Análisis técnico',
        conclusiones: '6. Conclusiones',
        firmas: '7. Firmas',
      },
      columnas: {
        variable: 'Variable', minimo: 'Mínimo', maximo: 'Máximo', promedio: 'Promedio', unidad: 'Unidad', cobertura: 'Cobertura',
        activo: 'Activo', condicion: 'Condición', observacion: 'Observación', recomendacion: 'Recomendación',
      },
      pieAnalisis: 'La condición es el peor estado con criterio de banda del activo; la observación y la recomendación salen de las reglas del tipo que están activas. Un guion es «nada que recomendar», no «todo bien».',
    },
    vibraciones: {
      titulo: 'REPORTE DE VIBRACIONES CMS',
      lema: 'Monitoreo de condición para mayor confiabilidad',
      secciones: {
        estado: '1. Estado general CMS',
        puntos: '2. Puntos de medición',
        espectro: '3. Espectro de vibración',
        tendencias: '4. Tendencias RMS',
        diagnostico: '5. Diagnóstico',
        diagnosticoAsistente: '5b. Diagnóstico probable (redacción)',
        recomendaciones: '6. Recomendaciones',
        firmas: '7. Firmas',
      },
      kpis: {
        condicion: 'Condición global',
        condicionSub: 'peor estado con criterio ISO',
        rmsMax: 'vRMS máximo del período',
        alarmas: 'Banderas activas ahora',
        alarmasSub: 'alarma, aviso, fallo del variador',
        sinLectura: 'Señales sin lectura',
      },
      notaTemperatura: 'Este tipo de máquina no instrumenta temperatura: la maqueta la pide y aquí no hay sensor que la dé. No existe un «índice de salud»; la condición global es el peor estado con criterio de banda.',
      columnas: {
        punto: 'Punto', estado: 'Estado', riesgo: 'Riesgo', apoyo: 'Apoyo', nivel: 'Nivel', evidencia: 'Evidencia', norma: 'Norma',
        accion: 'Acción', prioridad: 'Prioridad', responsable: 'Responsable', fecha: 'Fecha',
      },
      piePuntos: 'Un valor por sensor: el módulo mide un eje por apoyo, no axial/horizontal/vertical. El estado es el de la velocidad eficaz contra ISO 10816-1; las demás medidas no tienen banda declarada.',
      sinApoyos: 'Este tipo no mide vibración por apoyo: no hay puntos de medición que listar.',
      sinEspectro: 'El módulo publica vigilancias del espectro (estados MonState), no el espectro de frecuencias: no hay serie que dibujar. Lo que sí hay son las medidas eficaces por apoyo, en la sección siguiente.',
      pieRecomendaciones: 'La prioridad se deriva del nivel de la regla (crítico → alta, atención → media, informativo → baja). Responsable y fecha se llenan a mano.',
    },
    sensores: {
      titulo: 'REPORTE DE LECTURA DE SENSORES',
      lema: 'Datos confiables para mejores decisiones',
      secciones: {
        variables: '1. Variables monitoreadas',
        lecturas: '2. Lecturas y trazabilidad',
        tendencia: '3. Tendencia de lecturas',
        calidad: '4. Calibración y calidad de dato',
        acciones: '5. Acciones',
        cierre: '6. Cierre',
        firmas: '7. Firmas',
      },
      columnas: {
        tag: 'Tag', variable: 'Variable', rango: 'Rango', lectura: 'Lectura', desvio: 'Desvío', estado: 'Estado',
        ultima: 'Última calibración', proxima: 'Próxima', calidad: 'Calidad (QC)', serie: 'Serie',
        no: 'No.', accion: 'Acción', responsable: 'Responsable', fecha: 'Fecha', estatus: 'Estatus',
      },
      rangoAvisoAlarma: (aviso, alarma, u) => `aviso ${aviso} · alarma ${alarma}${u}`,
      rangoHasta: (avisoMax, max, u) => [avisoMax !== null ? `aviso ${avisoMax}${u}` : null, max !== null ? `límite ${max}${u}` : null].filter(Boolean).join(' · '),
      pieLecturas: (periodo) => `El desvío es la lectura actual frente al promedio de su serie en ${periodo}; sin serie verificada no se calcula. El rango es la banda que declara el tipo, sólo donde la hay.`,
      sinRegistro: 'sin registro',
      serieVerificada: 'verificada',
      serieSinVerificar: 'sin verificar',
      notaCalibracion: 'No hay registro de calibración en ICONICS ni en la configuración de la máquina: las dos columnas salen «sin registro». La calidad es el código QC que publica el módulo por medida, y la serie dice si el sondeo la verificó.',
      pieCalidad: 'Un código QC distinto de cero es del fabricante del módulo; su significado está en el manual del SM 1281, no lo interpreta este reporte.',
      notaAcciones: 'Filas en blanco a propósito: las acciones las decide quien lee el reporte, no el sistema.',
      sinSensores: (tipo) => `El tipo «${tipo}» no compone ninguna señal numérica de medida o variador: no hay sensores que listar.`,
    },
    pendientes: {
      riesgos: { titulo: 'REPORTE DE RIESGOS', motivo: 'la matriz probabilidad × impacto necesita un criterio que el usuario tiene que confirmar (Plan 44, D15): el motor da un nivel, no una probabilidad ni un impacto.' },
      alarmas: { titulo: 'REPORTE DE ALARMAS', motivo: 'está previsto para la F4 del Plan 44: severidad derivada del rol de cada bandera y eventos por flancos de las series verificadas.' },
      ingenieria: { titulo: 'REPORTE DE INGENIERÍA', motivo: 'está previsto para la F5 del Plan 44: hallazgos derivados de riesgos, hechos e intervenciones; lo de gestión queda en blanco.' },
      energias: { titulo: 'REPORTE DE ENERGÍAS, FLUJO Y ELECTRICIDAD', motivo: 'está previsto para la F5 del Plan 44: potencia, corriente y tensión del variador, y los kWh estimados por integración de la potencia, declarados como estimación.' },
      predicciones: { titulo: 'REPORTE DE PREDICCIONES DE ENERGÍA Y FALLAS', motivo: 'ninguna máquina configurada declara mecanismos de desgaste (nacen con desgaste nulo), así que no hay pronóstico que reportar; la plantilla existe para cuando un tipo los declare.' },
    },
  },
}

const EN = {
  reporteTitulo: 'TECHNICAL REPORT',
  reporteSubtitulo: 'Plant monitoring and analysis',
  generadoEl: (fecha) => `Generated on ${fecha}`,
  folio: 'FOLIO',
  folioPie: 'Folio',
  paginaDe: (n, total) => `Page ${n} of ${total}`,
  seccionSintesis: 'Summary',
  seccionResumenAsistente: 'Assistant summary',
  seccionValoresActuales: 'Current values (no history)',
  colSenal: 'SIGNAL',
  colValor: 'VALUE',
  colEstado: 'STATUS',
  sinDato: 'no data',
  seccionTendencias: 'Trends',
  resumenGrafico: (r, unidad) =>
    `Min ${r.minimo}${unidad} · Max ${r.maximo}${unidad} · Average ${r.promedio}${unidad} ` +
    `· ${r.muestras} samples`,
  coberturaParcial: (c) =>
    `Only ${c.diasLeidos} of the ${c.diasTotal} days in this range have a record in the historian: ` +
    'these figures cover only those days, not the whole period.',
  seccionNotasYAvisos: 'Notes and warnings',
  conversacionTitulo: 'CONVERSATION REPORT',
  conversacionSubtitulo: 'Dialogue with the plant assistant',
  rolOperador: 'Operator',
  rolAsistente: 'Assistant',
  instalacion: 'Industrial water system',

  sinDatos: 'No data in this section for this machine and this period.',
  redaccionAsistente: 'Written by the assistant',
  sinValor: '—',

  plantillas: {
    comun: {
      elaboro: 'Prepared by',
      reviso: 'Reviewed by',
      aprobo: 'Approved by',
      firmaAsistente: 'TDCON plant assistant · generated automatically',
      sintesis: 'System summary',
      chipSistema: 'System',
      chipPeriodo: 'Period',
      chipGenerado: 'Generated',
      chipCondicion: 'Condition',
      chipEquipo: 'Equipment',
      chipPlanta: 'Plant',
      chipActivos: 'Assets',
      todaLaMaquina: 'Whole machine',
      sinCriterio: 'No band criterion',
      sinLectura: 'No reading',
      sinSerieCorto: 'no verified series',
      sinMuestrasCorto: 'no samples',
      coberturaCompleta: 'complete',
      cobertura: (c) => `${c.diasLeidos} of ${c.diasTotal} days`,
      vsAnterior: 'vs. previous period',
      deTotal: (n) => `of ${n} signals`,
      banderasSinLectura: (n) => `${n} flag(s) with no reading`,
      nivel: { critico: 'Critical', atencion: 'Warning', informativo: 'Informational' },
      prioridad: { critico: 'High', atencion: 'Medium', informativo: 'Low' },
      sinMuestras: (label, periodo) => `No samples of ${label} in ${periodo}.`,
      noSeDibujo: (label, error) => `Could not draw ${label}: ${error}`,
      sinSeries: (nombre) => `"${nombre}" has no verified historian series for these measures: its present can be described, not its past.`,
      sinDominio: 'This machine does not rebuild its domain by roles: risk rules cannot be evaluated.',
      reglasEvaluadas: (n) => `${n} rule(s) of the type evaluated on the current reading. They are dashboard rules crossing signals, not ICONICS server alarms.`,
      riesgosNoEvaluables: (n, evaluadas) => `${n} rule(s) could not be evaluated due to missing readings (${evaluadas} could). "No risks" does not mean "fine" for those.`,
      sinRiesgosActivos: (evaluadas, noEvaluables) => `None of the ${evaluadas} evaluated rules is active${noEvaluables ? `; ${noEvaluables} could not be evaluated due to missing readings` : ''}. The type recommends no action.`,
      observacion: (r) => {
        const partes = [`${r.conLectura} of ${r.total} signals with a reading`]
        if (r.fuera) partes.push(`${r.fuera} out of limits`)
        if (r.aviso) partes.push(`${r.aviso} in warning`)
        if (r.enBanda) partes.push(`${r.enBanda} in band`)
        return `${partes.join(', ')}.`
      },
      resumen: ({ nombre, periodo, conLectura, total, estado, activos, noEvaluables }) =>
        `"${nombre}", ${periodo}: ${conLectura} of ${total} signals with a reading` +
        (total - conLectura ? ` (${total - conLectura} without)` : '') +
        `. Overall status with a band criterion: ${estado ?? 'no signal with a criterion could be read'}. ` +
        (activos === null
          ? 'Risk rules could not be evaluated.'
          : `${activos} active risk(s)${noEvaluables ? `, ${noEvaluables} rule(s) could not be evaluated` : ''}.`),
      resumenSensores: ({ nombre, periodo, sensores, conLectura, fuera, aviso, verificadas }) =>
        `"${nombre}", ${periodo}: ${conLectura} of ${sensores} sensors with a reading` +
        (fuera ? `, ${fuera} out of limits` : '') + (aviso ? `, ${aviso} in warning` : '') +
        `. ${verificadas} of ${sensores} with a verified historian series.`,
      conclusion: ({ estado, fuera, aviso, sinLectura, activos, subiendo }) => {
        const partes = []
        partes.push(estado ? `The machine closes the period "${estado}" in what has a band criterion` : 'No signal with a band criterion had a reading, so there is no band verdict')
        if (fuera || aviso) partes.push(`${fuera ? `${fuera} out of limits` : ''}${fuera && aviso ? ' and ' : ''}${aviso ? `${aviso} in warning` : ''}`)
        if (sinLectura) partes.push(`${sinLectura} signal(s) with no reading, not counted as zero`)
        if (activos) partes.push(`${activos} active risk(s) per the type's rules`)
        if (subiendo?.length) partes.push(`rising over the period: ${subiendo.join(', ')}`)
        return `${partes.join('; ')}.`
      },
    },
    tecnico: {
      titulo: 'TECHNICAL REPORT',
      lema: 'Plant monitoring and analysis',
      secciones: {
        resumen: '1. Operating summary',
        indicadores: '2. Key indicators',
        tendencias: '3. Variable trends',
        estadisticas: '4. Period statistics',
        analisis: '5. Technical analysis',
        conclusiones: '6. Conclusions',
        firmas: '7. Signatures',
      },
      columnas: {
        variable: 'Variable', minimo: 'Min', maximo: 'Max', promedio: 'Average', unidad: 'Unit', cobertura: 'Coverage',
        activo: 'Asset', condicion: 'Condition', observacion: 'Observation', recomendacion: 'Recommendation',
      },
      pieAnalisis: 'Condition is the worst band status of the asset; observation and recommendation come from the active rules of the type. A dash means "nothing to recommend", not "all fine".',
    },
    vibraciones: {
      titulo: 'CMS VIBRATION REPORT',
      lema: 'Condition monitoring for higher reliability',
      secciones: {
        estado: '1. Overall CMS status',
        puntos: '2. Measurement points',
        espectro: '3. Vibration spectrum',
        tendencias: '4. RMS trends',
        diagnostico: '5. Diagnosis',
        diagnosticoAsistente: '5b. Probable diagnosis (narrative)',
        recomendaciones: '6. Recommendations',
        firmas: '7. Signatures',
      },
      kpis: {
        condicion: 'Overall condition',
        condicionSub: 'worst status with ISO criterion',
        rmsMax: 'Max vRMS in period',
        alarmas: 'Flags active now',
        alarmasSub: 'alarm, warning, drive fault',
        sinLectura: 'Signals with no reading',
      },
      notaTemperatura: 'This machine type does not instrument temperature: the template asks for it and there is no sensor here. There is no "health index"; the overall condition is the worst band status.',
      columnas: {
        punto: 'Point', estado: 'Status', riesgo: 'Risk', apoyo: 'Bearing', nivel: 'Level', evidencia: 'Evidence', norma: 'Standard',
        accion: 'Action', prioridad: 'Priority', responsable: 'Owner', fecha: 'Date',
      },
      piePuntos: 'One value per sensor: the module measures one axis per bearing, not axial/horizontal/vertical. Status is that of the RMS velocity against ISO 10816-1; the other measures have no declared band.',
      sinApoyos: 'This type does not measure vibration per bearing: there are no measurement points to list.',
      sinEspectro: 'The module publishes spectrum watchdogs (MonState statuses), not the frequency spectrum: there is no series to draw. What exists are the RMS measures per bearing, in the next section.',
      pieRecomendaciones: 'Priority derives from the rule level (critical → high, warning → medium, informational → low). Owner and date are filled in by hand.',
    },
    sensores: {
      titulo: 'SENSOR READINGS REPORT',
      lema: 'Reliable data for better decisions',
      secciones: {
        variables: '1. Monitored variables',
        lecturas: '2. Readings and traceability',
        tendencia: '3. Reading trends',
        calidad: '4. Calibration and data quality',
        acciones: '5. Actions',
        cierre: '6. Closing',
        firmas: '7. Signatures',
      },
      columnas: {
        tag: 'Tag', variable: 'Variable', rango: 'Range', lectura: 'Reading', desvio: 'Deviation', estado: 'Status',
        ultima: 'Last calibration', proxima: 'Next', calidad: 'Quality (QC)', serie: 'Series',
        no: 'No.', accion: 'Action', responsable: 'Owner', fecha: 'Date', estatus: 'Status',
      },
      rangoAvisoAlarma: (aviso, alarma, u) => `warning ${aviso} · alarm ${alarma}${u}`,
      rangoHasta: (avisoMax, max, u) => [avisoMax !== null ? `warning ${avisoMax}${u}` : null, max !== null ? `limit ${max}${u}` : null].filter(Boolean).join(' · '),
      pieLecturas: (periodo) => `Deviation is the current reading against the average of its series in ${periodo}; without a verified series it is not computed. Range is the band the type declares, only where there is one.`,
      sinRegistro: 'no record',
      serieVerificada: 'verified',
      serieSinVerificar: 'unverified',
      notaCalibracion: 'There is no calibration record in ICONICS or in the machine configuration: both columns read "no record". Quality is the QC code the module publishes per measure, and Series says whether probing verified it.',
      pieCalidad: 'A non-zero QC code is the module manufacturer\'s; its meaning is in the SM 1281 manual and this report does not interpret it.',
      notaAcciones: 'Blank rows on purpose: actions are decided by whoever reads the report, not by the system.',
      sinSensores: (tipo) => `Type "${tipo}" composes no numeric measure or drive signal: there are no sensors to list.`,
    },
    pendientes: {
      riesgos: { titulo: 'RISK REPORT', motivo: 'the probability × impact matrix needs a criterion the user has yet to confirm (Plan 44, D15): the engine yields a level, not a probability or an impact.' },
      alarmas: { titulo: 'ALARM REPORT', motivo: 'planned for Plan 44 F4: severity derived from each flag\'s role and events from edges of the verified series.' },
      ingenieria: { titulo: 'ENGINEERING REPORT', motivo: 'planned for Plan 44 F5: findings derived from risks, facts and interventions; management fields stay blank.' },
      energias: { titulo: 'ENERGY, FLOW AND ELECTRICITY REPORT', motivo: 'planned for Plan 44 F5: drive power, current and voltage, and kWh estimated by integrating power, declared as an estimate.' },
      predicciones: { titulo: 'ENERGY AND FAILURE PREDICTION REPORT', motivo: 'no configured machine declares wear mechanisms (they are born with null wear), so there is no forecast to report; the template exists for when a type declares them.' },
    },
  },
}

/**
 * @param {"es"|"en"} idioma
 * @returns {typeof ES} el catálogo de ese idioma; español si `idioma` no es
 *   ninguno de los dos soportados — mismo criterio "fail-safe a español"
 *   que `ChatSchema.idioma` y el resto de i18n del asistente.
 */
export function etiquetasDeReporte(idioma) {
  return idioma === 'en' ? EN : ES
}
