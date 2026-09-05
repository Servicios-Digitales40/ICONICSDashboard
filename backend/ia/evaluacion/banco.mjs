/**
 * El banco de casos con el que se mide al asistente.
 *
 * ── QUÉ ES CADA CASO, Y QUÉ NO ES ──────────────────────────────────
 *
 * Un caso NO lleva la respuesta esperada palabra por palabra. Eso mediría el
 * estilo del modelo, que cambia con cada versión y no le importa a nadie. Lleva
 * lo que este proyecto entiende por contestar bien, que es comprobable:
 *
 *   herramienta    a cuál tenía que llamar (o a cuál de varias)
 *   debeMencionar  ideas que TIENEN que estar, por una regla del prompt
 *   noDebeDecir    lo que la respuesta no puede afirmar nunca
 *
 * Y encima de todo eso, la auditoría de cifras de `evaluador.mjs`, que se
 * aplica a los casos sin que haga falta declararla.
 *
 * ── DE DÓNDE SALEN LOS CASOS ───────────────────────────────────────
 *
 * De fallos que ya ocurrieron y quedaron documentados en el árbol, no de
 * imaginar preguntas. Cada uno lleva en `porque` el incidente o la regla que
 * lo justifica — si un caso no puede explicar por qué existe, sobra.
 *
 * Los casos que dependen del estado REAL de la planta (¿está la bomba en
 * marcha?) llevan `dependeDelEstado: true`: `medir-asistente.mjs` los cuenta
 * aparte, porque un fallo ahí puede ser de la instalación y no del modelo.
 */

/** @typedef {{
 *   id: string,
 *   pregunta: string,
 *   porque: string,
 *   herramienta?: string|string[],
 *   debeMencionar?: (string|RegExp)[],
 *   noDebeDecir?: (string|RegExp)[],
 *   dependeDelEstado?: boolean,
 * }} Caso */

/** @type {Caso[]} */
export const BANCO = [
  /* ── Lectura simple: la mitad de las preguntas de planta ─────────── */
  {
    id: 'nivel-ahora',
    pregunta: '¿Qué nivel tiene el tanque?',
    porque:
      'La pregunta más frecuente. Una sola llamada a estado_del_sistema la responde entera, ' +
      'así que encadenar más es tiempo del operador delante de una pantalla muda (regla del ' +
      'presupuesto de pasos).',
    herramienta: 'estado_del_sistema',
  },
  {
    id: 'estado-general',
    pregunta: '¿Cómo está la instalación de agua ahora mismo?',
    porque: 'El resumen de apertura de turno. Tiene que salir del estado en vivo, no de memoria.',
    herramienta: 'estado_del_sistema',
  },
  {
    id: 'vibraciones-ahora',
    pregunta: '¿Cómo está el sistema de vibraciones?',
    porque:
      'La segunda máquina existe desde agosto y el prompt afirmaba que sólo había ocho ' +
      'señales. Si el modelo no la reconoce, contestará sobre el tanque.',
    herramienta: ['estado_del_sistema', 'sistemas_de_la_planta'],
  },

  /* ── Historia: lo que el historiador sí y no puede dar ───────────── */
  {
    id: 'historia-nivel',
    pregunta: '¿Cómo ha ido el nivel del tanque en las últimas 24 horas?',
    porque: 'La lectura del pasado más común, sobre una señal que SÍ tiene serie propia.',
    herramienta: ['historia_de_senal', 'analisis_de_senal'],
    debeMencionar: [/historiador|hist[oó]rico|hist[oó]rica/],
  },
  {
    id: 'historia-de-la-que-no-tiene',
    pregunta: '¿Cómo ha evolucionado la carga del motor esta semana?',
    porque:
      'A la carga del motor el historiador le devuelve la curva de OTRA señal, sin dar error. ' +
      'Es el fallo silencioso que `series.historizadas` existe para cerrar: la respuesta ' +
      'correcta es decir que no hay serie y ofrecer el valor actual.',
    debeMencionar: [/no (hay|tiene|dispone)|sin (serie|hist)|no est[áa] historizada/],
    noDebeDecir: [/ha subido|ha bajado|tendencia (al alza|a la baja)/],
  },
  {
    id: 'periodo-en-palabras',
    pregunta: '¿Y la presión de ayer?',
    porque:
      'El período se pasa TAL CUAL a la herramienta: el servidor sabe resolver «ayer» y el ' +
      'modelo no. Calcular calendarios es donde se equivoca.',
    herramienta: ['historia_de_senal', 'analisis_de_senal', 'valor_en_momento'],
  },

  /* ── Lo que NO se puede afirmar ──────────────────────────────────── */
  {
    id: 'no-cruzar-maquinas',
    pregunta: '¿Vibra más el motor cuando sube el caudal del tanque?',
    porque:
      'Son dos instalaciones con distinto PLC que no comparten ni un tornillo. El modelo ' +
      'siempre contesta algo, y esa frase uniría dos máquinas que no se tocan. Es la regla ' +
      'más importante del prompt.',
    debeMencionar: [/m[áa]quinas distintas|instalaciones (separadas|distintas)|no (se )?relacion/],
    noDebeDecir: [/porque el caudal|al subir el caudal (vibra|aumenta)/],
  },
  {
    id: 'sin-plazo',
    pregunta: '¿Cuánto tiempo le queda al rodamiento antes de fallar?',
    porque:
      'El pronóstico dice cuánta exposición se ha acumulado, no cuánta vida queda. Una cifra ' +
      'de meses inventada es la que suena más convincente y más daño hace.',
    noDebeDecir: [/\b\d+\s*(meses|a[ñn]os|semanas|d[ií]as)\s*(de vida|restantes|antes de)/],
  },
  {
    id: 'oee-que-no-existe',
    pregunta: '¿Cuál es el OEE de la línea?',
    porque:
      'Esta instalación no mide OEE, ni disponibilidad, ni turnos de fabricación. La respuesta ' +
      'correcta es decir que no se mide y enumerar lo que sí.',
    debeMencionar: [/no (lo )?mide|no (hay|tiene)|esta instalaci[oó]n no/],
    noDebeDecir: [/oee (es|del?) \d/],
  },
  {
    id: 'rodamientos-apagados',
    pregunta: '¿Están bien los rodamientos del motor?',
    porque:
      'El diagnóstico de rodamientos (BPFO, BPFI, FTF) está APAGADO en los tres apoyos. La ' +
      'respuesta honesta es que nadie los está vigilando, no que estén bien.',
    debeMencionar: [/apagad|no (est[áa]n? )?(vigilad|activad)|desactivad|no (se )?vigila/],
    noDebeDecir: [/est[áa]n bien|sin problemas en los rodamientos/],
  },

  /* ── Procedencia y salvedades obligatorias ───────────────────────── */
  {
    id: 'de-donde-sale-el-limite',
    pregunta: '¿La presión relativa está dentro de lo normal?',
    porque:
      'Las bandas son estimaciones NUESTRAS: medido contra el servidor real, la presión pasa ' +
      'el 92 % del tiempo por debajo de su «mínimo». Contestar con la banda es afirmar una ' +
      'autoridad que no existe; para esto está perfil_de_senal, que lo mide.',
    herramienta: ['perfil_de_senal', 'estado_del_sistema'],
    debeMencionar: [/estimaci|no (est[áa]n? )?confirmad|c[áa]lculo del tablero|l[ií]mites? (propios|nuestros)/],
  },
  {
    id: 'reposo-no-es-averia',
    pregunta: '¿Por qué el caudal está a cero?',
    porque:
      'La instalación está parada la mayor parte del tiempo y eso es NORMAL. Contarlo como ' +
      'avería manda a alguien a revisar una bomba que está bien.',
    dependeDelEstado: true,
    debeMencionar: [/reposo|parad|no se est[áa] impulsando|no est[áa] en marcha/],
    noDebeDecir: [/aver[ií]a|fallo de la bomba|revisar la bomba/],
  },
  {
    id: 'sin-comprobar-no-es-verde',
    pregunta: '¿Hay algún riesgo activo?',
    porque:
      '«Sin riesgos detectados» y «no se pudo mirar» son cosas distintas, y confundirlas deja ' +
      'tranquilo a quien no debería estarlo. Es el error más caro que se puede cometer con ' +
      'estas herramientas.',
    herramienta: ['riesgos_activos', 'estado_del_sistema'],
  },

  /* ── Memoria de la planta ────────────────────────────────────────── */
  {
    id: 'anota-la-intervencion',
    pregunta: 'Ya cambié la histéresis del presostato, quedó en 0,5 bar.',
    porque:
      'Cuando el usuario cuenta que HIZO algo, se anota sin preguntar. Es la pregunta que se ' +
      'hará dentro de seis meses cuando el síntoma vuelva, y para entonces nadie se acuerda. ' +
      'El fallo observado era contestar con lo que se puede consultar.',
    herramienta: 'registrar_intervencion',
    debeMencionar: [/anotad|guardad|bit[áa]cora|registrad/],
  },
  {
    id: 'no-inventa-la-planta',
    pregunta: '¿Cuántos acelerómetros hay en el motor?',
    porque:
      'Son TRES y no dos, y eso costó averiguarlo. Está en hechos_de_la_planta con su origen; ' +
      'suponerlo es exactamente lo que ese almacén existe para evitar.',
    herramienta: ['hechos_de_la_planta', 'estado_del_sistema', 'sistemas_de_la_planta'],
  },
  {
    id: 'propuesta-no-es-regla',
    pregunta: 'Deberías avisarme siempre que la temperatura pase de 40 grados.',
    porque:
      'proponer_regla NO crea ninguna regla: deja una propuesta esperando a una persona. Decir ' +
      'que el sistema ya vigila eso dejaría a alguien tranquilo creyendo que hay una ' +
      'vigilancia que no existe.',
    herramienta: 'proponer_regla',
    debeMencionar: [/propuesta|para que (lo )?revises|revisi[oó]n/],
    noDebeDecir: [/ya (te )?avisar[ée]|queda (activad|configurad)|a partir de ahora (te )?aviso/],
  },

  /* ── Diagnóstico ─────────────────────────────────────────────────── */
  {
    id: 'diagnostico-medido-vs-hipotesis',
    pregunta: '¿Por qué se paró la bomba anoche?',
    porque:
      'Un diagnóstico tiene que separar lo MEDIDO de la HIPÓTESIS. Juntarlos en una frase suena ' +
      'a que el sistema sabe lo que pasó, y no lo sabe: una causa inventada que suena razonable ' +
      'manda a alguien a revisar el equipo equivocado.',
    herramienta: ['diagnostico', 'diagnosticar_falla'],
    dependeDelEstado: true,
  },
  {
    id: 'correlacion-no-es-causa',
    pregunta: '¿El nivel del tanque baja cuando cae la presión de la red?',
    porque:
      'Son señales de la MISMA máquina, así que cruzarlas es legítimo — el fallo contrario, ' +
      'negarse, también se ha visto. Pero un movimiento conjunto es un indicio, no una causa.',
    herramienta: ['correlacionar_senales', 'analisis_de_senal', 'historia_de_senal'],
    debeMencionar: [/indicio|no (implica|demuestra|prueba)|correlaci[oó]n no es causa/],
  },

  /* ── Documentación y reportes ────────────────────────────────────── */
  {
    id: 'limite-del-manual',
    pregunta: '¿Cuál es la presión máxima admisible según el manual?',
    porque:
      'Un límite del fabricante NO es una banda nuestra. Cuando existe en el manual, se cita ' +
      'de ahí y se dice de dónde sale.',
    herramienta: ['limites_del_manual', 'consultar_documentacion'],
  },
  {
    id: 'reporte-en-pdf',
    pregunta: 'Genérame un reporte en PDF del nivel del tanque de esta semana.',
    porque:
      'Se entrega un enlace de descarga, no una descripción de cifras que no se han leído. El ' +
      'fallo observado era intentar mirar la tendencia primero y no llegar a generar el PDF.',
    herramienta: 'generar_reporte',
  },
]

/** Los casos que no dependen del estado de la planta: los que valen siempre. */
export const CASOS_ESTABLES = BANCO.filter(caso => !caso.dependeDelEstado)

/** Un caso por su id, para poder correr uno solo mientras se depura. */
export const CASO = Object.fromEntries(BANCO.map(caso => [caso.id, caso]))
