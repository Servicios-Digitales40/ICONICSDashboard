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
      firmaUsuario: (usuario) => `${usuario} · vía el asistente de planta TDCON`,
      sintesis: 'Síntesis del sistema',
      /* Para un párrafo que explica CÓMO se obtuvo algo, o por qué falta: no
         es una síntesis del estado y rotularlo como tal confunde las dos. */
      metodo: 'Cómo se obtuvo',
      carencia: 'Lo que esta máquina no mide',
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
      pieRecomendaciones: 'La prioridad se deriva del nivel de la regla (crítico: alta, atención: media, informativo: baja). Responsable y fecha se llenan a mano.',
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
      notaCalibracion: 'La calibración la anota quien configura la máquina (editor, «Calibración de sensores»): ICONICS no la sabe. Donde nadie la anotó, «sin registro». La calidad es el código QC que publica el módulo por medida, y la serie dice si el sondeo la verificó y cómo.',
      serieVerificadaComo: { 'serie-propia': 'verificada · serie propia', 'registrada-constante': 'verificada · constante registrada' },
      pieCalidad: 'Un código QC distinto de cero es del fabricante del módulo; su significado está en el manual del SM 1281, no lo interpreta este reporte.',
      notaAcciones: 'Filas en blanco a propósito: las acciones las decide quien lee el reporte, no el sistema.',
      sinSensores: (tipo) => `El tipo «${tipo}» no compone ninguna señal numérica de medida o variador: no hay sensores que listar.`,
    },
    riesgos: {
      titulo: 'REPORTE DE RIESGOS',
      lema: 'Análisis preventivo para una operación segura',
      secciones: {
        matriz: '1. Matriz de riesgos',
        principales: '2. Principales riesgos',
        sinObservar: '2b. Riesgos que no se pueden situar en la matriz',
        mitigacion: '3. Plan de mitigación',
        residual: '4. Riesgo residual / conclusión',
        firmas: '5. Aprobaciones',
      },
      columnas: {
        riesgo: 'Riesgo', probabilidad: 'Prob.', impacto: 'Impacto', nivel: 'Nivel', estado: 'Estado',
        punto: 'Punto', evidencia: 'Evidencia', motivo: 'Por qué no se puede observar',
        numero: 'No.', accion: 'Acción', control: 'Control', responsable: 'Responsable',
      },
      ejeProbabilidad: 'Probabilidad observada',
      ejeImpacto: 'Impacto declarado',
      activo: 'Activo',
      pieMatriz:
        'El impacto (1–5) lo declara cada regla del tipo como criterio de ingeniería. La probabilidad (1–5) se observa: ' +
        'es la fracción del período en que la condición de la regla estuvo activa en el historiador, no una estimación. ' +
        'Un riesgo sin serie para observarlo no se sitúa en la rejilla y se lista aparte.',
      pieHeredado:
        'Alguna regla no declara su impacto y lo hereda de su nivel (crítico 5, atención 3, informativo 1). Es una equivalencia nuestra, no una medida.',
      pieMitigacion:
        'La acción sale de la regla que encendió el riesgo. Control, responsable y estado no salen de planta: se llenan a mano.',
      sinRiesgos: 'Ninguna regla del tipo está activa en esta máquina: no hay riesgo que situar en la matriz.',
      fraccionDelPeriodo: (pct, evaluados) => `activo el ${pct} % de ${evaluados} instantes observados`,
      residualSinCriterio:
        'El riesgo residual es un juicio de quien acepta el riesgo, no un dato de planta: este reporte no lo calcula. ' +
        'Debajo va lo observado, para sostener esa decisión.',
    },
    alarmas: {
      titulo: 'REPORTE DE ALARMAS',
      lema: 'Eventos, severidad y atención',
      secciones: {
        resumen: '1. Resumen de alarmas',
        interpretacion: '1b. Interpretación',
        eventos: '2. Eventos recientes',
        distribucion: '3. Distribución por intervalo',
        causa: '4. Análisis de causa',
        acciones: '5. Plan de acción',
        firmas: '6. Firmas',
      },
      columnas: {
        senal: 'Señal', punto: 'Punto', severidad: 'Severidad', estado: 'Estado',
        cuando: 'Cuándo', evento: 'Evento', intervalo: 'Intervalo', ocurrencias: 'Ocurrencias',
        causa: 'Riesgo que lo explica', evidencia: 'Evidencia', accion: 'Acción',
        numero: 'No.', responsable: 'Responsable', fecha: 'Fecha',
      },
      severidad: { critica: 'Crítica', alta: 'Alta', media: 'Media' },
      activa: 'Activa',
      subida: 'Se activó',
      bajada: 'Se normalizó',
      recuento: ({ criticas, altas, medias, total }) =>
        `${total} señal(es) de alarma activas ahora: ${criticas} crítica(s), ${altas} alta(s), ${medias} media(s).`,
      sinActivas: 'Ninguna señal de alarma está activa en este momento.',
      pieSeveridad:
        /* Con dos puntos y no con una flecha: Helvetica no tiene «→» en
           WinAnsi y saldría como un par de signos raros (D13 del Plan 44). */
        'La severidad no la publica el servidor: se deriva del rol de cada señal en el tipo. Alarma y fallo del variador: ' +
        'crítica; aviso: alta; desviación del sensor: media. Es una convención nuestra, escrita en un solo sitio.',
      sinEventos: (periodo) => `Ninguna señal de alarma cambió de estado en ${periodo}: no hay eventos que listar, y eso es un hecho medido, no un hueco.`,
      sinSerieEventos: 'Ninguna de las señales de alarma de esta máquina tiene serie verificada en el historiador: no se pueden reconstruir sus flancos.',
      sinCausa: 'Ninguna regla del tipo explica las alarmas activas.',
      pieAcciones: 'Responsable y fecha no salen de planta: se llenan a mano.',
    },
    ingenieria: {
      titulo: 'REPORTE DE INGENIERÍA',
      lema: 'Análisis técnico para un desempeño confiable',
      secciones: {
        resumen: '1. Resumen del sistema',
        indicadores: '2. Indicadores',
        hallazgos: '3. Hallazgos técnicos',
        evidencia: '4. Evidencia / tendencias',
        decisiones: '5. Decisiones de ingeniería',
        plan: '6. Plan de acción',
        firmas: '7. Aprobaciones',
      },
      columnas: {
        numero: 'No.', hallazgo: 'Hallazgo', punto: 'Punto', impacto: 'Impacto', prioridad: 'Prioridad',
        accion: 'Acción', responsable: 'Responsable', fecha: 'Fecha', estado: 'Estado',
      },
      indicadores: { hallazgos: 'Hallazgos', riesgo: 'Riesgo actual', sinLectura: 'Sin lectura', conSerie: 'Con serie' },
      subHallazgos: 'técnicos', subRiesgo: 'nivel actual', subSinLectura: 'señales de la máquina', subConSerie: 'verificadas',
      sinHallazgos: 'Ninguna regla del tipo está activa: no hay hallazgo técnico que reportar.',
      pieHallazgos:
        'Cada hallazgo sale de una regla del tipo que está activa ahora. El impacto es su consecuencia declarada y la prioridad, su nivel.',
      pieGestion:
        'Avance por disciplina, pendientes, objetivo del proyecto, responsables y fechas no salen de planta: son de gestión del proyecto y se llenan a mano.',
      decisionesSinCriterio:
        'Las decisiones de ingeniería —solución propuesta, criterios de diseño, restricciones y próximos pasos— las toma quien firma el proyecto, no este reporte. Debajo va lo observado, para sostenerlas.',
    },
    energias: {
      titulo: 'REPORTE DE ENERGÍAS, FLUJO Y ELECTRICIDAD',
      lema: 'Monitoreo para un mundo más sostenible',
      secciones: {
        consumo: '1. Consumo energético',
        notaConsumo: '1b. Cómo se calculó',
        tendencia: '2. Tendencia de consumo',
        balance: '3. Balance de variables',
        eficiencia: '4. Eficiencia del sistema',
        oportunidades: '5. Oportunidades de mejora',
        conclusion: '6. Conclusión',
        firmas: '7. Firmas',
      },
      columnas: {
        variable: 'Variable', unidad: 'Unidad', minimo: 'Mín', maximo: 'Máx', promedio: 'Promedio',
        meta: 'Meta', estado: 'Estado', cobertura: 'Cobertura',
      },
      indicadores: { energia: 'Energía estimada', demanda: 'Demanda máxima', media: 'Potencia media', cobertura: 'Cobertura' },
      subEnergia: 'estimada, no medida',
      subDemanda: 'máxima del período',
      subMedia: 'del período',
      subCobertura: 'del período integrado',
      /* La frase que convierte el número en una estimación declarada. Va al
         pie de su sección, no en una nota final que nadie lee. */
      pieEstimacion: ({ tramos, huecos, horas }) =>
        'Esta planta NO tiene medidor de energía: los kWh se ESTIMAN integrando la potencia que publica el variador ' +
        `(regla del trapecio sobre ${tramos} tramo(s), ${horas} h cubiertas` +
        `${huecos ? `, ${huecos} hueco(s) del historiador sin integrar` : ''}). ` +
        'Es aritmética sobre un dato real, no una lectura de contador: un medidor cuenta lo que pasó entre muestra y muestra, y esto supone que la potencia varió linealmente.',
      sinPotencia: 'Esta máquina no publica la potencia de su variador, así que no hay nada que integrar: sin medidor y sin potencia, la energía no se puede estimar.',
      sinMuestrasPotencia: (periodo) => `La potencia del variador no tiene muestras en ${periodo}: no hay serie que integrar.`,
      sinFlujo: 'Esta máquina no mide caudal ni volumen: el consumo específico (kWh/m³) y el balance de agua necesitan un tipo con medidor de flujo.',
      sinFactorPotencia: 'El variador no publica factor de potencia ni energía reactiva: la calidad eléctrica no se puede calcular con lo que hay.',
      sinMeta: 'sin meta declarada',
      sinOportunidades:
        'Detectar oportunidades de ahorro exige una referencia con la que comparar —una meta de consumo, un histórico de la misma carga o un modelo del proceso— y esta máquina no declara ninguna. No se inventa un porcentaje de ahorro.',
      pieBalance: 'Mín, máx y promedio salen del historiador en el período. Ninguna de estas variables tiene meta declarada en esta máquina.',
    },
    /*
     * `predicciones` tiene sus rótulos aunque hoy no se emita: su plantilla
     * está escrita entera (§6.3) y `documento()` los usa. Faltarían el día
     * que un tipo declare desgaste y se encienda — y eso se descubriría con
     * un `undefined` en mitad del PDF, no antes.
     */
    predicciones: {
      titulo: 'REPORTE DE PREDICCIONES DE ENERGÍA Y FALLAS',
      lema: 'Inteligencia de datos para un futuro más eficiente',
      secciones: {
        fallas: '1. Predicción de fallas',
        equipos: '2. Equipos / score de riesgo',
        consumo: '3. Consumo de energía pronosticado',
        variables: '4. Variables influyentes',
        recomendaciones: '5. Recomendaciones predictivas',
        seguimiento: '6. Seguimiento',
        firmas: '7. Firmas',
      },
      columnas: {
        equipo: 'Equipo', prediccion: 'Predicción', probabilidad: 'Probabilidad', horizonte: 'Horizonte',
        accion: 'Acción', variable: 'Variable', peso: 'Peso', comportamiento: 'Comportamiento', observacion: 'Observación',
        numero: 'No.', responsable: 'Responsable', fecha: 'Fecha', estado: 'Estado',
      },
      indicadores: { probabilidad: 'Prob. de falla', confianza: 'Confianza', horizonte: 'Horizonte', equipos: 'Equipos' },
      sinMecanismos: (maquina) =>
        `«${maquina}» no declara mecanismos de desgaste, así que no hay nada que pronosticar. ` +
        'Un pronóstico necesita que el TIPO de la máquina declare qué se degrada, con qué señal se mide y a qué ritmo; ' +
        'toda máquina configurada nace sin esa declaración.',
    },
    pendientes: {
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
      firmaUsuario: (usuario) => `${usuario} · via the TDCON plant assistant`,
      sintesis: 'System summary',
      metodo: 'How it was obtained',
      carencia: 'What this machine does not measure',
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
      pieRecomendaciones: 'Priority derives from the rule level (critical: high, warning: medium, informational: low). Owner and date are filled in by hand.',
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
      notaCalibracion: 'Calibration is written down by whoever configures the machine (editor, "Sensor calibration"): ICONICS does not know it. Where nobody did, "no record". Quality is the QC code the module publishes per measure, and Series says whether probing verified it and how.',
      serieVerificadaComo: { 'serie-propia': 'verified · own series', 'registrada-constante': 'verified · recorded constant' },
      pieCalidad: 'A non-zero QC code is the module manufacturer\'s; its meaning is in the SM 1281 manual and this report does not interpret it.',
      notaAcciones: 'Blank rows on purpose: actions are decided by whoever reads the report, not by the system.',
      sinSensores: (tipo) => `Type "${tipo}" composes no numeric measure or drive signal: there are no sensors to list.`,
    },
    riesgos: {
      titulo: 'RISK REPORT',
      lema: 'Preventive analysis for safe operation',
      secciones: {
        matriz: '1. Risk matrix',
        principales: '2. Main risks',
        sinObservar: '2b. Risks that cannot be placed on the matrix',
        mitigacion: '3. Mitigation plan',
        residual: '4. Residual risk / conclusion',
        firmas: '5. Approvals',
      },
      columnas: {
        riesgo: 'Risk', probabilidad: 'Prob.', impacto: 'Impact', nivel: 'Level', estado: 'Status',
        punto: 'Point', evidencia: 'Evidence', motivo: 'Why it cannot be observed',
        numero: 'No.', accion: 'Action', control: 'Control', responsable: 'Owner',
      },
      ejeProbabilidad: 'Observed probability',
      ejeImpacto: 'Declared impact',
      activo: 'Active',
      pieMatriz:
        'Impact (1–5) is declared by each rule of the type as an engineering judgement. Probability (1–5) is observed: ' +
        'it is the fraction of the period during which the rule condition held in the historian, not an estimate. ' +
        'A risk with no series to observe is left off the grid and listed separately.',
      pieHeredado:
        'Some rule does not declare its impact and inherits it from its level (critical 5, attention 3, informational 1). That is our equivalence, not a measurement.',
      pieMitigacion:
        'The action comes from the rule that raised the risk. Control, owner and status do not come from the plant: fill them in by hand.',
      sinRiesgos: 'No rule of the type is active on this machine: there is no risk to place on the matrix.',
      fraccionDelPeriodo: (pct, evaluados) => `active ${pct} % of ${evaluados} observed instants`,
      residualSinCriterio:
        'Residual risk is a judgement by whoever accepts the risk, not plant data: this report does not compute it. ' +
        'What was observed follows, to support that decision.',
    },
    alarmas: {
      titulo: 'ALARM REPORT',
      lema: 'Events, severity and response',
      secciones: {
        resumen: '1. Alarm summary',
        interpretacion: '1b. Interpretation',
        eventos: '2. Recent events',
        distribucion: '3. Distribution by interval',
        causa: '4. Root cause analysis',
        acciones: '5. Action plan',
        firmas: '6. Signatures',
      },
      columnas: {
        senal: 'Signal', punto: 'Point', severidad: 'Severity', estado: 'Status',
        cuando: 'When', evento: 'Event', intervalo: 'Interval', ocurrencias: 'Occurrences',
        causa: 'Risk that explains it', evidencia: 'Evidence', accion: 'Action',
        numero: 'No.', responsable: 'Owner', fecha: 'Date',
      },
      severidad: { critica: 'Critical', alta: 'High', media: 'Medium' },
      activa: 'Active',
      subida: 'Raised',
      bajada: 'Cleared',
      recuento: ({ criticas, altas, medias, total }) =>
        `${total} alarm signal(s) active right now: ${criticas} critical, ${altas} high, ${medias} medium.`,
      sinActivas: 'No alarm signal is active at this moment.',
      pieSeveridad:
        /* Colons, not arrows: Helvetica has no «→» in WinAnsi (Plan 44 D13). */
        'Severity is not published by the server: it is derived from each signal role in the type. Alarm and drive fault: ' +
        'critical; warning: high; sensor offset: medium. It is our convention, written in a single place.',
      sinEventos: (periodo) => `No alarm signal changed state during ${periodo}: there are no events to list, and that is a measured fact, not a gap.`,
      sinSerieEventos: 'None of the alarm signals of this machine has a verified series in the historian: their edges cannot be reconstructed.',
      sinCausa: 'No rule of the type explains the active alarms.',
      pieAcciones: 'Owner and date do not come from the plant: fill them in by hand.',
    },
    ingenieria: {
      titulo: 'ENGINEERING REPORT',
      lema: 'Technical analysis for reliable performance',
      secciones: {
        resumen: '1. System summary',
        indicadores: '2. Indicators',
        hallazgos: '3. Technical findings',
        evidencia: '4. Evidence / trends',
        decisiones: '5. Engineering decisions',
        plan: '6. Action plan',
        firmas: '7. Approvals',
      },
      columnas: {
        numero: 'No.', hallazgo: 'Finding', punto: 'Point', impacto: 'Impact', prioridad: 'Priority',
        accion: 'Action', responsable: 'Owner', fecha: 'Date', estado: 'Status',
      },
      indicadores: { hallazgos: 'Findings', riesgo: 'Current risk', sinLectura: 'No reading', conSerie: 'With series' },
      subHallazgos: 'technical', subRiesgo: 'current level', subSinLectura: 'machine signals', subConSerie: 'verified',
      sinHallazgos: 'No rule of the type is active: there is no technical finding to report.',
      pieHallazgos:
        'Each finding comes from a rule of the type that is active right now. Impact is its declared consequence and priority, its level.',
      pieGestion:
        'Progress by discipline, open items, project objective, owners and dates do not come from the plant: they belong to project management and are filled in by hand.',
      decisionesSinCriterio:
        'Engineering decisions —proposed solution, design criteria, constraints and next steps— are made by whoever signs the project, not by this report. What was observed follows, to support them.',
    },
    energias: {
      titulo: 'ENERGY, FLOW AND ELECTRICITY REPORT',
      lema: 'Monitoring for a more sustainable world',
      secciones: {
        consumo: '1. Energy consumption',
        notaConsumo: '1b. How it was computed',
        tendencia: '2. Consumption trend',
        balance: '3. Variable balance',
        eficiencia: '4. System efficiency',
        oportunidades: '5. Improvement opportunities',
        conclusion: '6. Conclusion',
        firmas: '7. Signatures',
      },
      columnas: {
        variable: 'Variable', unidad: 'Unit', minimo: 'Min', maximo: 'Max', promedio: 'Average',
        meta: 'Target', estado: 'Status', cobertura: 'Coverage',
      },
      indicadores: { energia: 'Estimated energy', demanda: 'Peak demand', media: 'Average power', cobertura: 'Coverage' },
      subEnergia: 'estimated, not metered',
      subDemanda: 'peak in the period',
      subMedia: 'over the period',
      subCobertura: 'of the period integrated',
      pieEstimacion: ({ tramos, huecos, horas }) =>
        'This plant has NO energy meter: kWh are ESTIMATED by integrating the power published by the drive ' +
        `(trapezoidal rule over ${tramos} segment(s), ${horas} h covered` +
        `${huecos ? `, ${huecos} historian gap(s) left out` : ''}). ` +
        'That is arithmetic on real data, not a meter reading: a meter counts what happened between samples, and this assumes power varied linearly.',
      sinPotencia: 'This machine does not publish its drive power, so there is nothing to integrate: with no meter and no power, energy cannot be estimated.',
      sinMuestrasPotencia: (periodo) => `Drive power has no samples during ${periodo}: there is no series to integrate.`,
      sinFlujo: 'This machine measures neither flow nor volume: specific consumption (kWh/m³) and the water balance need a type with a flow meter.',
      sinFactorPotencia: 'The drive publishes neither power factor nor reactive energy: electrical quality cannot be computed from what is available.',
      sinMeta: 'no target declared',
      sinOportunidades:
        'Spotting savings requires something to compare against —a consumption target, a history of the same load or a process model— and this machine declares none. No savings percentage is invented.',
      pieBalance: 'Min, max and average come from the historian over the period. None of these variables has a target declared on this machine.',
    },
    predicciones: {
      titulo: 'ENERGY AND FAILURE PREDICTION REPORT',
      lema: 'Data intelligence for a more efficient future',
      secciones: {
        fallas: '1. Failure prediction',
        equipos: '2. Equipment / risk score',
        consumo: '3. Forecast energy consumption',
        variables: '4. Influencing variables',
        recomendaciones: '5. Predictive recommendations',
        seguimiento: '6. Follow-up',
        firmas: '7. Signatures',
      },
      columnas: {
        equipo: 'Equipment', prediccion: 'Prediction', probabilidad: 'Probability', horizonte: 'Horizon',
        accion: 'Action', variable: 'Variable', peso: 'Weight', comportamiento: 'Behaviour', observacion: 'Note',
        numero: 'No.', responsable: 'Owner', fecha: 'Date', estado: 'Status',
      },
      indicadores: { probabilidad: 'Failure prob.', confianza: 'Confidence', horizonte: 'Horizon', equipos: 'Equipment' },
      sinMecanismos: (maquina) =>
        `«${maquina}» declares no wear mechanisms, so there is nothing to forecast. ` +
        'A forecast requires the machine TYPE to declare what degrades, which signal measures it and at what rate; ' +
        'every configured machine is born without that declaration.',
    },
    pendientes: {
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
