/**
 * backend/ia/definiciones.mjs
 * ------------------------------------------------------------------
 * El ESQUEMA de las herramientas: lo único que el modelo lee para decidir a
 * cuál llamar y con qué argumentos.
 *
 * ── POR QUÉ VIVE EN SU PROPIO ARCHIVO ──────────────────────────────
 *
 * Porque no es código que se ejecute: es texto dirigido a un modelo de
 * lenguaje, y se edita por motivos distintos y en momentos distintos que la
 * implementación. Una descripción se reescribe porque el modelo eligió mal la
 * herramienta —un problema de redacción—, no porque la función tuviera un
 * fallo.
 *
 * Estaba al final de `herramientas.mjs`, que pasaba de las 4000 líneas. No
 * dependía de nada de allí: `DEFINICIONES` es una constante de nivel superior,
 * sin acceso a la clausura de `createHerramientas` —ni a `client`, ni a
 * `leerSerie`— y por eso es la parte que se puede separar sin tocar ninguna
 * herramienta. Es una división mecánica, y a propósito: el archivo grande se
 * parte por donde no hay riesgo, no por donde haría falta un rediseño.
 *
 * ── LO QUE SIGUE UNIDO, Y NO POR PEREZA ────────────────────────────
 *
 * Las diecinueve implementaciones comparten una clausura con una docena de
 * ayudantes —`leerMaquina`, `leerSerie`, `leerSerieEnRango`, `resolverSistema`—
 * construidos alrededor del `client` de ICONICS que recibe la factoría.
 * Repartirlas por familias exige antes sacar esos ayudantes, y eso es un
 * rediseño con riesgo real sobre la capa que el asistente usa entera. Queda
 * pendiente y dicho, en vez de hecho a medias.
 *
 * ── LA INVARIANTE QUE ATA ESTE ARCHIVO CON EL OTRO ─────────────────
 *
 * Toda definición anunciada aquí tiene que tener implementación allí, y al
 * revés: una herramienta declarada y no implementada es una llamada que falla
 * en mitad de una conversación, y una implementada y no declarada es trabajo
 * que el modelo no sabe que puede pedir. Lo comprueba
 * `scripts/verificar-herramientas.mjs`, y por eso separar los dos archivos no
 * afloja nada.
 */

/**
 * Esquema que se le manda a llama-server en cada petición.
 *
 * Las descripciones son parte del programa: es lo único que el modelo lee para
 * decidir. Dicen explícitamente que no toda señal tiene serie propia, porque
 * el fallo más caro es que pida la de otra y el servidor le conteste con la
 * curva equivocada **sin dar error**.
 */
export const DEFINICIONES = [
  {
    type: 'function',
    function: {
      name: 'hechos_de_la_planta',
      description:
        'Lo que YA se sabe confirmado de esta instalación: datos que alguien verificó y que no se ' +
        'deducen del servidor —cuántos sensores hay, cómo se llama un grupo, qué tensión ' +
        'nominal aplica—. Consúltala antes de suponer un detalle de la instalación. Cada hecho ' +
        'trae su ORIGEN: cítalo cuando lo uses. Devuelve TAMBIÉN la bitácora de intervenciones: ' +
        'qué ha fallado antes y cómo se resolvió. Úsala para "¿cómo arreglé esto la última ' +
        'vez?", "¿esto ya había pasado?", "¿qué se hizo con el aPico?".',
      parameters: {
        type: 'object',
        properties: {
          sistema: {
            type: 'string',
            description: 'Id del sistema para filtrar (por ejemplo "tanque" o "vibraciones"). Omítelo para verlos todos.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_intervencion',
      description:
        'Anota en la bitácora algo que SE HIZO en la instalación: qué fallaba y qué se hizo ' +
        'para arreglarlo. LLÁMALA SIEMPRE que el usuario cuente que ha resuelto, arreglado, ' +
        'cambiado, ajustado o configurado algo — «ya quedó», «lo resolví», «ya lo arreglé», ' +
        '«cambié la histéresis», «ya configuré los rodamientos», «lo dejé andando». No le ' +
        'preguntes si quiere que lo guardes: guárdalo y díselo. Sirve para que dentro de seis ' +
        'meses, cuando el mismo síntoma vuelva, se pueda leer cómo se resolvió — es lo primero ' +
        'que se pierde en una planta. Si el intento NO funcionó, ponlo igual con resuelto=false: ' +
        'saber lo que no sirvió ahorra repetirlo.',
      parameters: {
        type: 'object',
        properties: {
          sintoma: {
            type: 'string',
            description: 'Qué pasaba, con lo que se vio. Por ejemplo "el pico de aceleración de S1 valía lo mismo que el eficaz".',
          },
          solucion: {
            type: 'string',
            description: 'Qué se hizo exactamente. Cuanto más concreto, más sirve dentro de seis meses.',
          },
          causa: { type: 'string', description: 'Por qué pasaba, si se llegó a saber.' },
          sistema: { type: 'string', description: 'Id del sistema: "tanque" o "vibraciones".' },
          resuelto: {
            type: 'boolean',
            description: 'false si se intentó y NO funcionó. Por omisión true.',
          },
        },
        required: ['sintoma', 'solucion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordar_hecho',
      description:
        'Guarda un DATO de cómo ES la instalación: "el sensor S3 es de 100 mV/g", "la tensión ' +
        'es de 208", "el rodamiento intermedio es un 6206". Sólo lo que una PERSONA afirma. ' +
        'NO la uses para algo que se HIZO o se ARREGLÓ —«ya quedó», «lo resolví», «cambié la ' +
        'histéresis»—: eso va en registrar_intervencion, que guarda además qué fallaba y si ' +
        'funcionó. Un dato es permanente; una reparación está fechada.',
      parameters: {
        type: 'object',
        properties: {
          hecho: { type: 'string', description: 'El dato, en una frase clara y completa.' },
          sistema: { type: 'string', description: 'Id del sistema al que pertenece, si aplica.' },
          origen: {
            type: 'string',
            description: 'Quién lo confirmó y cuándo. Por ejemplo "Confirmado por el usuario el 2026-08-26".',
          },
        },
        required: ['hecho', 'origen'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_regla',
      description:
        'Deja ANOTADA una regla de riesgo que crees que faltaría, para que una persona la ' +
        'revise. NO crea la regla ni hace que el sistema vigile eso. Úsala cuando veas en los ' +
        'datos un patrón peligroso del que nadie avisa. La evidencia tiene que llevar CIFRAS. ' +
        'Al usarla di que la has anotado para revisión y que ejecute ' +
        '`node scripts/revisar-propuestas.mjs`; NUNCA digas que has creado una regla ni que el ' +
        'sistema ya avisa de eso.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Qué pasa, en una línea.' },
          sistema: { type: 'string', description: 'Id del sistema al que aplicaría.' },
          severidad: {
            type: 'string',
            enum: ['critico', 'atencion', 'informativo'],
            description: 'critico si puede romper algo, atencion si conviene mirarlo, informativo si sólo cambia el contexto.',
          },
          condicion: { type: 'string', description: 'Cuándo debería dispararse, en palabras: qué señales y con qué valores.' },
          senales: { type: 'array', items: { type: 'string' }, description: 'Claves de las señales que necesita.' },
          evidencia: { type: 'string', description: 'Los datos observados que la motivan, CON CIFRAS y con el período del que salen.' },
          consecuencia: { type: 'string', description: 'A qué avería llevaría, y por qué mecanismo físico.' },
          accion: { type: 'string', description: 'Qué convendría revisar.' },
        },
        required: ['titulo', 'severidad', 'condicion', 'senales', 'evidencia', 'consecuencia'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sistemas_de_la_planta',
      description:
        'Qué sistemas hay en esta planta, qué mide cada uno y qué NO se puede afirmar de él. ' +
        'NO tiene los datos confirmados de la instalación ni la bitácora de lo que se ha ' +
        'arreglado: para «¿qué se hizo con esto?», «¿ya había pasado?» o «¿qué sabes de la ' +
        'planta?» la herramienta es hechos_de_la_planta. ' +
        'Llámala cuando no sepas a qué sistema se refiere la pregunta, o para "¿qué puedes ' +
        'ver?". Cada sistema es una instalación SEPARADA, con su propio PLC: no relaciones una ' +
        'señal de uno con una de otro. Es barata y no toca el servidor de planta.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'riesgos_activos',
      description:
        'Qué PUEDE pasar en UN sistema si sigue así: cruza varias señales a la vez y devuelve ' +
        'las combinaciones peligrosas, con su evidencia medida, la hipótesis y qué revisar. ' +
        'Para "¿hay algún riesgo?", "¿es peligroso que siga así?". Distinta de ' +
        'estado_del_sistema: aquélla dice cómo está cada señal AHORA; ésta, qué combinaciones ' +
        'son peligrosas aunque cada señal esté en banda. Trae `sin_comprobar`: si no está ' +
        'vacío, NO digas que no hay riesgos — di que hay cosas que no se pudieron mirar. No es ' +
        'el panel de alarmas de ICONICS. Hay que decir DE QUÉ SISTEMA: si no lo sabes, llama ' +
        'antes a sistemas_de_la_planta. Cada riesgo trae su `id`: para explicar CUÁL es la causa ' +
        'más probable de uno concreto —no sólo qué podría pasar— pásaselo a ' +
        'diagnosticar_falla(sistema, riesgoId), que cruza los datos con el manual y con casos ' +
        'previos ya resueltos y te da una lista de causas puntuada.',
      parameters: {
        type: 'object',
        properties: {
          sistema: { type: 'string', description: 'Id del sistema. Los ids salen de sistemas_de_la_planta.' },
        },
        required: ['sistema'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pronostico_de_desgaste',
      description:
        'Cuánta EXPOSICIÓN a condiciones que desgastan ha acumulado una máquina: horas estimadas ' +
        'en cada condición y a qué avería lleva. Para "¿se está desgastando algo?", "¿hay que ' +
        'hacer mantenimiento?". Las horas son ESTIMADAS de la fracción de muestras, no contadas. ' +
        'NO estimes cuántos meses o años tardará en averiarse nada. Sólo la puede servir una ' +
        'máquina con histórico: si no lo tiene, la herramienta lo dice y hay que comunicarlo tal ' +
        'cual en vez de improvisar una tendencia.',
      parameters: {
        type: 'object',
        properties: {
          sistema: {
            type: 'string',
            description:
              'Id del sistema. Por omisión "tanque", HOY la única máquina a la que esta ' +
              'herramienta puede contestar: las demás reciben un error que explica por qué.',
          },
          dias: {
            type: 'number',
            description: 'Días hacia atrás a considerar. Entre 1 y 90; por omisión 30.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'estado_del_sistema',
      description:
        'Estado de UNA máquina ahora mismo, de una sola vez: sus señales con valor, unidad, ' +
        'estado y banda de límites, agrupadas, y cuántas están en banda, en aviso, fuera de ' +
        'límite o sin dato. Úsala para "¿cómo va?", "¿está bombeando?", "¿qué nivel tiene el ' +
        'tanque?", "¿cómo están las vibraciones?", "¿los rodamientos están bien?" y para ' +
        'CUALQUIER pregunta sobre el momento actual. NO la llames varias veces para la misma ' +
        'máquina: lo devuelve todo junto. HAY QUE DECIR DE QUÉ SISTEMA — son instalaciones ' +
        'SEPARADAS, con su propio PLC, y contestar del otro sería contestar de otra máquina. ' +
        'Si no sabes el id, llama antes a sistemas_de_la_planta.',
      parameters: {
        type: 'object',
        properties: {
          sistema: { type: 'string', description: 'Id del sistema. Los ids salen de sistemas_de_la_planta.' },
        },
        required: ['sistema'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'historia_de_senal',
      description:
        'Cómo ha evolucionado UNA señal en un período: devuelve el mínimo y el máximo con la hora ' +
        'en que ocurrieron, el promedio, el primer y el último valor, y cuántas muestras hubo. ' +
        'Úsala para "¿cómo ha ido el nivel esta mañana?", "¿la vibración del apoyo 1 ayer?". ' +
        'Sirve a CUALQUIER máquina. No todas las señales tienen serie propia: si pides una que ' +
        'no la tiene, la herramienta lo dice y hay que contarlo tal cual.',
      parameters: {
        type: 'object',
        properties: {
          senal: {
            type: 'string',
            description:
              'Nombre de la señal, tal y como lo diga el usuario: "nivel del tanque", "nivel", ' +
              '"temperatura", "caudal", "presión", "carga del motor", "tensión", "eficiencia". ' +
              'No lo traduzcas a una clave técnica: pásalo tal cual y el servidor lo resuelve.',
          },
          periodo: {
            type: 'string',
            description:
              'El período, en lenguaje llano. Lo habitual aquí es relativo a ahora: "última hora", ' +
              '"últimas 6 horas", "últimos 30 minutos", "esta hora". También vale calendario: ' +
              '"hoy", "ayer", "2026-07-20", "ayer a las 12", "últimos 3 días", "la última semana", ' +
              '"el último mes". MÁXIMO 90 días: un año entero no cabe, y si lo piden llama ' +
              'igualmente y la herramienta te dará las alternativas. Si el usuario no dice ' +
              'período, omítelo y se usan las últimas 6 horas. NO lo conviertas tú a fechas: ' +
              'pásalo tal cual y el servidor lo resuelve.',
          },
          sistema: {
            type: 'string',
            description: 'Id de la máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'valor_en_momento',
      description:
        'Cuánto marcaba UNA señal en UN momento concreto, con minutos. Úsala cuando pregunten por ' +
        'un instante y no por un tramo: "¿cuál era el nivel del tanque el 21 de agosto a las ' +
        '11:16?", "¿qué presión había ayer a las 14:30?". Para "¿cómo ha ido X esta mañana?" o ' +
        '"¿cuál fue el máximo de ayer?" usa historia_de_senal, que resume un período. Mismas ' +
        'cuatro señales con serie propia que historia_de_senal.',
      parameters: {
        type: 'object',
        properties: {
          senal: {
            type: 'string',
            description:
              'Nombre de la señal, tal y como lo diga el usuario. Igual que en historia_de_senal: ' +
              'pásalo tal cual y el servidor lo resuelve.',
          },
          momento: {
            type: 'string',
            description:
              'El momento exacto, en lenguaje llano y CON los minutos si los dice: "21 de agosto ' +
              'de 2026 a las 11:16", "ayer a las 14:30", "2026-08-21 a las 11:16". No lo ' +
              'conviertas tú a fecha ni a UTC, y no le quites los minutos: pásalo tal cual.',
          },
          sistema: {
            type: 'string',
            description: 'Id de la máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senal', 'momento'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comparar_periodos',
      description:
        'Compara la MISMA señal en dos períodos y devuelve los dos resúmenes con su diferencia ya ' +
        'calculada. Sirve para "compara el nivel de esta hora con el de hace tres", "¿la ' +
        'temperatura de hoy contra la de ayer?", "¿ha mejorado la presión respecto a esta mañana?". ' +
        'Sólo con señales que tengan serie propia.',
      parameters: {
        type: 'object',
        properties: {
          senal: {
            type: 'string',
            description: 'Nombre de la señal, en lenguaje llano. Mismas formas que en historia_de_senal.',
          },
          periodoA: {
            type: 'string',
            description: 'Primer período. Es la referencia. Mismas formas que en historia_de_senal.',
          },
          periodoB: {
            type: 'string',
            description: 'Segundo período, se compara contra el primero.',
          },
          sistema: {
            type: 'string',
            description: 'Id de la máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senal', 'periodoA', 'periodoB'],
      },
    },
  },

    {
    type: 'function',
    function: {
      name: 'analisis_de_senal',
      description:
        'Análisis estadístico de UNA señal historizada: media, mediana, desviación, tendencia ' +
        '(subiendo/bajando/estable con un ajuste de 0 a 100), una proyección a futuro con su ' +
        'margen de error, y las muestras anómalas si las hay. Úsala para "¿va a seguir subiendo ' +
        'el nivel?", "¿cómo se está comportando la presión?". ' +
        'NO la uses para saber si un valor es NORMAL o RARO: esta herramienta sólo mira el ' +
        'período que le pides (unas horas), y con eso no se puede saber qué es habitual. Para ' +
        'eso está perfil_de_senal, que mide semanas. Si respondes "es un valor raro" o "está por ' +
        'encima de lo normal" apoyándote sólo en ésta, estás afirmando algo que no has ' +
        'consultado. ' +
        'Sólo con señales que tengan serie propia. La proyección es un cálculo, ' +
        'no una certeza: cítala siempre con su rango.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
          periodo: { type: 'string', description: 'Período sobre el que calcular. Igual que en historia_de_senal.' },
          horizonteMinutos: {
            type: 'number',
            description: 'Cuántos minutos hacia el futuro proyectar. Por defecto 60.',
          },
          sistema: {
            type: 'string',
            description: 'Id de la máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'perfil_de_senal',
      description:
        'Qué es NORMAL para una señal, medido sobre semanas de historia real: dónde ha vivido, ' +
        'cuánto ha variado, sus percentiles, y en qué punto de esa distribución cae el valor de ' +
        'ahora. Úsala para "¿es normal este valor?", "¿esto es raro?", "¿qué presión suele ' +
        'tener?", "¿había pasado antes?", y SIEMPRE antes de afirmar que algo es anómalo. ' +
        'IMPORTANTE: las bandas con las que el tablero dice "en banda" o "fuera de límite" son ' +
        'estimaciones NUESTRAS sin confirmar; esta herramienta mide lo que la instalación hace ' +
        'de verdad, y avisa cuando las dos cosas no cuadran. Sólo señales con serie propia.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
          dias: {
            type: 'number',
            description:
              'Cuántos días de historia perfilar. Por defecto 14, máximo 90. Más días dan una ' +
              'idea más fiable de lo normal, pero tardan más en leerse.',
          },
          sistema: {
            type: 'string',
            description: 'Id de la máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'correlacionar_senales',
      description:
        'Compara DOS O MÁS señales sobre la misma ventana de tiempo y devuelve, para cada par, si ' +
        'se movieron juntas (coeficiente de -1 a 1 y su lectura en palabras), más los valores ' +
        'atípicos de cada señal CON SU HORA y cuáles de ellos cayeron en el mismo instante. ' +
        'ÉSTA ES LA HERRAMIENTA DEL DIAGNÓSTICO: úsala para "¿por qué se paró la bomba?", "¿qué ' +
        'pasó cuando cayó la presión?", "¿tiene que ver la tensión con el fallo del motor?". ' +
        'Sólo con señales que tengan serie propia. Lo que devuelve es un INDICIO, ' +
        'no una demostración de causa: dilo así al redactar. ' +
        'Los activos de una MISMA máquina SÍ se cruzan —el nivel del tanque y la presión de la ' +
        'red lo son— y no debes negarte por eso: si fueran de dos máquinas, la herramienta lo ' +
        'detecta y te lo dice.',
      parameters: {
        type: 'object',
        properties: {
          senales: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Las señales a comparar, en lenguaje llano, de dos a cuatro: por ejemplo ' +
              '["presión", "caudal"]. Mismas formas de nombrarlas que en historia_de_senal.',
          },
          periodo: {
            type: 'string',
            description:
              'La ventana en la que mirar. Si el usuario menciona cuándo ocurrió el fallo, pon ' +
              'un período que lo contenga con margen: "últimas 6 horas", "ayer", "2026-08-19". ' +
              'Igual que en historia_de_senal. Si no lo dice, omítelo.',
          },
          sistema: {
            type: 'string',
            description: 'Id de la máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senales'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grafico_de_senal',
      description:
        'Genera un gráfico de la evolución de UNA señal historizada en un período, para ' +
        'acompañar la respuesta. Úsala cuando pidan "muéstrame", "un gráfico de", "dibuja" o ' +
        'cuando una tendencia se explique mejor viéndola. Sólo señales con serie propia.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
          periodo: { type: 'string', description: 'Período sobre el que dibujar. Igual que en historia_de_senal.' },
          sistema: {
            type: 'string',
            description: 'Id de la máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_reporte',
      description:
        'Genera un PDF descargable de la instalación: un gráfico por cada señal con historia que ' +
        'se pida (o las cuatro, si no se nombra ninguna) más una tabla con el valor actual de las ' +
        'que no tienen serie. Úsala para "genera un reporte", "quiero un PDF de esta semana", ' +
        '"expórtame los datos del tanque". El período admite hasta unos 90 días, igual que ' +
        'historia_de_senal, porque aquí se agrega por día. El enlace de descarga se le entrega al ' +
        'usuario automáticamente; no lo repitas ni lo inventes en tu respuesta. Cada gráfico del PDF ' +
        'YA lleva su propia interpretación de la tendencia, escrita por el sistema — no hace falta ' +
        'pedirla aparte.',
      parameters: {
        type: 'object',
        properties: {
          senales: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Nombres de señal en lenguaje llano, ej. ["nivel", "temperatura"]. Si se omite, entra ' +
              'la instalación entera: las que tienen serie como gráfico y las otras ' +
              'cuatro como tabla de valores actuales.',
          },
          periodo: {
            type: 'string',
            description:
              'El período de los gráficos, en lenguaje llano. Igual que en historia_de_senal, hasta ' +
              '~90 días. Si se omite, las últimas 6 horas.',
          },
          explicacion: {
            type: 'string',
            description:
              'OPCIONAL — casi nunca hace falta, porque el PDF YA trae interpretación automática de ' +
              'cada gráfico. Sólo rellénalo si YA sabes la tendencia de la señal principal por algo ' +
              'que consultaste antes en esta conversación: entonces sí puedes resumirla aquí en una ' +
              'frase. Nunca hagas una consulta aparte sólo para rellenar esto, y nunca dejes de ' +
              'llamar a generar_reporte por intentarlo.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_documentacion',
      description:
        'Busca en la documentación de planta (manuales, procedimientos) y devuelve los fragmentos ' +
        'más parecidos a la pregunta, citables por archivo. Úsala para "¿cómo se arranca la bomba?", ' +
        '"procedimiento de mantenimiento", "especificaciones de la válvula".',
      parameters: {
        type: 'object',
        properties: {
          pregunta: {
            type: 'string',
            description: 'Qué quieres consultar en la documentación, en lenguaje llano.',
          },
        },
        required: ['pregunta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'limites_del_manual',
      description:
        'Busca en la documentación de planta un límite documentado de UNA señal (máximo, mínimo, ' +
        'rango admisible) y lo devuelve como número con su unidad y de qué documento y página ' +
        'sale, en vez de un párrafo para interpretar. Úsala cuando necesites comparar una lectura ' +
        'contra lo que dice el manual: "¿150 V es demasiado?", "¿cuál es la presión máxima según ' +
        'el manual?". Son CANDIDATOS encontrados por patrón, no lecturas garantizadas: puede haber ' +
        'más de uno y puede que ninguno sea el correcto.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
        },
        required: ['senal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnostico',
      description:
        'Herramienta COMPUESTA para diagnosticar una avería o un síntoma: en una sola llamada ' +
        'reúne el estado actual, la historia con fecha de los extremos, la correlación entre las ' +
        'señales implicadas y los límites que documenta el manual, y calcula el exceso sobre esos ' +
        'límites ya con su fecha. ÚSALA SIEMPRE que te pregunten por qué falló algo, qué causó un ' +
        'problema, o te cuenten un síntoma ("se paró la bomba tras un pico de tensión", "el ' +
        'caudal está siendo demasiado alto") — es la primera y normalmente ÚNICA llamada que hace ' +
        'falta para eso, en vez de encadenar estado_del_sistema, historia_de_senal, ' +
        'correlacionar_senales y limites_del_manual una por una. Nombra en el síntoma las señales ' +
        'de las que hables si las conoces: si no nombras ninguna, se miran las cuatro que tienen ' +
        'historia. El resultado separa lo MEDIDO de lo DOCUMENTADO; la hipótesis que los junte es ' +
        'tuya, y tienes que decir cuál es cuál. Si el síntoma es en realidad un riesgo YA activo ' +
        'con `id` conocido —de riesgos_activos, o de una pregunta que lo cita— usa mejor ' +
        'diagnosticar_falla: da una lista de causas ya puntuada y ordenada, cruzando también los ' +
        'casos previos resueltos, que esta herramienta no consulta.',
      parameters: {
        type: 'object',
        properties: {
          sintoma: {
            type: 'string',
            description:
              'El síntoma o la pregunta de diagnóstico, con tus propias palabras y nombrando las ' +
              'señales que el usuario haya mencionado: "caudal abundante y presión alta tras una ' +
              'subida de tensión progresiva", "la bomba se paró después de un pico de 200 V".',
          },
          periodo: {
            type: 'string',
            description:
              'En qué ventana buscar, si el usuario lo dice: "últimas 6 horas", "ayer", ' +
              '"2026-08-19". Igual que en historia_de_senal. Si no lo dice, omítelo.',
          },
        },
        required: ['sintoma'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnosticar_falla',
      description:
        'La causa más probable de UN riesgo YA activo, con su `id` —de riesgos_activos, de ' +
        'estado_del_sistema, o de una pregunta que ya lo menciona—: cruza los datos que dispararon ' +
        'el riesgo, lo que dice el manual de planta y los casos previos resueltos con el MISMO ' +
        'síntoma, y devuelve las causas candidatas YA ORDENADAS de más a menos respaldada, cada ' +
        'una con su banda ALTO/MEDIO/BAJO y de qué fuentes viene ese respaldo. NARRA LA LISTA EN ' +
        'EL ORDEN EN QUE LLEGA, SIN REORDENARLA — el orden ya es la puntuación, y reordenarla por ' +
        'tu cuenta deshace el trabajo de cruzar las tres fuentes. Cita el `origen` de cada causa ' +
        '(de qué manual o regla sale) y di explícitamente cuándo un caso previo la respalda o la ' +
        'descarta. Distinta de diagnostico: aquélla arma un dossier libre a partir de un síntoma ' +
        'en prosa; ésta puntúa las causas de un riesgo concreto y ya identificado, con casos ' +
        'previos incluidos.',
      parameters: {
        type: 'object',
        properties: {
          sistema: { type: 'string', description: 'Id del sistema. Los ids salen de sistemas_de_la_planta.' },
          riesgoId: {
            type: 'string',
            description:
              'El `id` del riesgo activo a diagnosticar, tal cual lo trae riesgos_activos o ' +
              'estado_del_sistema — no el título en prosa.',
          },
        },
        required: ['sistema', 'riesgoId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'controlar_bomba',
      description:
        'Enciende o apaga la bomba de la instalación. Úsala cuando te pidan explícitamente ' +
        'encender, apagar, arrancar o parar la bomba. Antes de encenderla se comprueba el nivel ' +
        'del tanque; si está por encima del umbral de aviso, la herramienta se niega a encenderla ' +
        'para no desbordarlo y te lo explica — comunícaselo al usuario tal cual, no lo intentes de ' +
        'otra forma. Si el servidor está en modo solo lectura también se niega, y hay que decírselo ' +
        'al usuario con el motivo.',
      parameters: {
        type: 'object',
        properties: {
          encender: {
            type: 'boolean',
            description: 'true para encender la bomba, false para apagarla.',
          },
        },
        required: ['encender'],
      },
    },
  },
]
