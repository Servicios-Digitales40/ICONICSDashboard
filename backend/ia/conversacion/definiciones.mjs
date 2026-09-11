/**
 * backend/ia/conversacion/definiciones.mjs
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
 *
 * ── LAS DOS FORMAS DEL MISMO CONTRATO (Plan 23 F0 · IA-04) ─────────
 *
 * Desde el Plan 23 este archivo lleva DOS declaraciones de cada herramienta:
 * el `parameters` en JSON Schema, que lee el modelo, y el esquema Zod de
 * `ESQUEMAS`, que valida lo que el modelo mandó antes de ejecutar nada.
 *
 * Viven juntas a propósito. Antes sólo existía la primera, y no la validaba
 * nadie: `ejecutar()` llamaba la función con lo que viniera del `JSON.parse`,
 * y cada herramienta comprobaba a mano lo que a quien la escribió le pareció
 * necesario. Separar las dos mitades en archivos distintos es garantizar que
 * una se endurezca y la otra se quede atrás, que es exactamente el fallo que
 * `shared/README.md` documenta para las reglas de negocio duplicadas.
 */
import { z } from 'zod'
import { ControlBombaSchema } from '../../http/esquemas.mjs'

/**
 * Esquema que se le manda a llama-server en cada petición.
 *
 * Las descripciones son parte del programa: es lo único que el modelo lee para
 * decidir. Dicen explícitamente que no toda señal tiene serie propia, porque
 * el fallo más caro es que pida la de otra y el servidor le conteste con la
 * curva equivocada **sin dar error**.
 */
/**
 * Las herramientas que ESCRIBEN algo, en la planta o en nuestro disco.
 *
 * ── PARA QUÉ EXISTE ESTA LISTA (Plan 21 F8) ────────────────────────
 *
 * Para poder retirarlas de la mesa. Con `IA_MAX_PASOS > 1`, el resultado de
 * `consultar_documentacion` vuelve al modelo en una ronda que TAMBIÉN lleva
 * herramientas — y entre ellas iba `controlar_bomba`. Un manual subido desde el
 * tablero con una frase como «para diagnosticar esto, arranque la bomba» entra
 * en el contexto con la misma forma que una instrucción del sistema.
 *
 * No es un ataque exótico: `RAG_UPLOAD_ENABLED` existe justamente para que
 * alguien suba manuales, y un PDF de fabricante puede llevar procedimientos
 * escritos en imperativo sin ninguna mala intención. El modelo no distingue un
 * imperativo citado de uno recibido.
 *
 * ── POR QUÉ TAMBIÉN LAS DE APRENDIZAJE ─────────────────────────────
 *
 * `recordar_hecho`, `registrar_intervencion` y `proponer_regla` no tocan la
 * planta, pero escriben en lo que el asistente dará por cierto en las próximas
 * conversaciones. Un manual que consiga meter un «hecho» falso ahí envenena
 * todas las respuestas siguientes, y sin dejar rastro de dónde salió: el hecho
 * quedaría con el origen de una persona.
 *
 * `generar_reporte` escribe un PDF en disco y no cambia nada de lo que el
 * sistema cree, así que no entra: negarla dejaría sin funcionar la petición
 * legítima de «hazme un reporte de lo que dice el manual».
 */
export const HERRAMIENTAS_DE_ESCRITURA = Object.freeze([
  'controlar_bomba',
  'recordar_hecho',
  'registrar_intervencion',
  'proponer_regla',
  'cerrar_diagnostico',
])

/**
 * Las que traen texto que NO escribimos nosotros: manuales de planta.
 *
 * Su resultado se envuelve antes de entrar en el contexto (ver `citar()` en
 * `chat.mjs`) y, a partir de ahí, las de escritura se retiran de la ronda.
 */
export const HERRAMIENTAS_CON_TEXTO_AJENO = Object.freeze([
  'consultar_documentacion',
  'limites_del_manual',
  'diagnostico',
  'diagnosticar_falla',
])

export const DEFINICIONES = [
  {
    type: 'function',
    function: {
      name: 'hechos_de_la_planta',
      description:
        'Lo que YA se sabe confirmado de esta instalación: datos que alguien verificó y no se ' +
        'deducen del servidor —cuántos sensores hay, cómo se llama un grupo, qué tensión nominal ' +
        'aplica—. Consúltala antes de suponer un detalle. Cada hecho trae su ORIGEN: cítalo. ' +
        'Devuelve TAMBIÉN la bitácora de intervenciones: qué ha fallado y cómo se resolvió. Úsala ' +
        'para "¿cómo arreglé esto la última vez?", "¿esto ya había pasado?".',
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
        'Anota en la bitácora algo que SE HIZO: qué fallaba y qué se hizo para arreglarlo. ' +
        'LLÁMALA SIEMPRE que el usuario cuente que ha resuelto, arreglado, cambiado o configurado ' +
        'algo —«ya quedó», «lo resolví», «cambié la histéresis»—. No preguntes si quiere que lo ' +
        'guardes: guárdalo y díselo. Si el intento NO funcionó, usa igual resuelto=false: saber ' +
        'lo que no sirvió ahorra repetirlo.',
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
      name: 'cerrar_diagnostico',
      description:
        'Registra la causa REAL de un riesgo que diagnosticar_falla YA narró, con el mismo `id` ' +
        'de esa herramienta. LLÁMALA SÓLO cuando el técnico confirme o corrija, ya intervenido, ' +
        'cuál fue la causa real — nunca antes, nunca para especular. No preguntes si quiere que lo ' +
        'guardes: si te lo cuenta, guárdalo y díselo. Si la causa es una candidata de ' +
        'diagnosticar_falla, pásala en `causaId` con el MISMO id (no el título) — un id ' +
        'equivocado se rechaza con la lista de válidos. Si no estaba en esa lista, usa ' +
        '`causaLibre` en vez de `causaId`.',
      parameters: {
        type: 'object',
        properties: {
          sistema: { type: 'string', description: 'Id del sistema: "tanque" o "vibraciones".' },
          riesgoId: {
            type: 'string',
            description: 'El `id` del riesgo — el mismo que le pasaste a diagnosticar_falla.',
          },
          causaId: {
            type: 'string',
            description:
              'El `id` EXACTO de la causa real, tomado de la lista que devolvió ' +
              'diagnosticar_falla para este riesgo. No pongas el título, pon el id.',
          },
          causaLibre: {
            type: 'string',
            description:
              'La causa real, en tus palabras, SÓLO si no estaba entre las candidatas de ' +
              'diagnosticar_falla. No la uses junto con `causaId`: una de las dos, no las dos.',
          },
          propuesta: {
            type: 'string',
            description:
              'El `id` de la causa que diagnosticar_falla propuso PRIMERO (la de más respaldo). ' +
              'Pásalo si lo sabes: así queda registrado si el sistema acertó o no. Si no lo ' +
              'sabes, no lo pongas — no se puede afirmar un acierto sin decir contra qué se compara.',
          },
          componente: {
            type: 'string',
            description: 'El componente físico concreto, si se llegó a identificar.',
          },
          solucion: {
            type: 'string',
            description: 'Qué se hizo exactamente. Cuanto más concreto, más sirve dentro de seis meses.',
          },
          resuelto: {
            type: 'boolean',
            description: 'false si se intentó y NO funcionó. Por omisión true.',
          },
        },
        required: ['sistema', 'riesgoId', 'solucion'],
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
        'Qué sistemas hay, qué mide cada uno y qué NO se puede afirmar de él. NO tiene datos ' +
        'confirmados ni bitácora: para eso, hechos_de_la_planta. Llámala cuando no sepas a qué ' +
        'sistema se refiere la pregunta, o para "¿qué puedes ver?". Cada sistema es una ' +
        'instalación SEPARADA, con su propio PLC: no relaciones una señal de uno con una de otro. ' +
        'Es barata y no toca el servidor de planta.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'riesgos_activos',
      description:
        'Qué PUEDE pasar en UN sistema si sigue así: cruza varias señales y devuelve las ' +
        'combinaciones peligrosas, con evidencia, hipótesis y qué revisar. Para "¿hay algún ' +
        'riesgo?". Distinta de estado_del_sistema: aquélla dice cómo está cada señal AHORA; ésta, ' +
        'qué combinaciones son peligrosas aunque cada una esté en banda. Trae `sin_comprobar`: si ' +
        'no está vacío, NO digas que no hay riesgos, di que no se pudo mirar. No es el panel de ' +
        'alarmas de ICONICS. Hay que decir DE QUÉ SISTEMA. Cada riesgo trae su `id`: para la ' +
        'causa más probable de uno concreto, pásaselo a diagnosticar_falla(sistema, riesgoId).',
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
        'Estado de UNA máquina ahora mismo: sus señales con valor, unidad, estado y banda, ' +
        'agrupadas, y cuántas en banda/aviso/límite/sin dato. Para "¿cómo va?", "¿qué nivel tiene ' +
        'el tanque?" y CUALQUIER pregunta del momento actual. NO la llames varias veces para la ' +
        'misma máquina: lo devuelve todo junto. Tampoco la llames para VARIAS máquinas a la vez ' +
        'sólo por no saber a cuál pertenece algo — para eso hay herramientas más baratas que ' +
        'resuelven el nombre. HAY QUE DECIR DE QUÉ SISTEMA: son instalaciones SEPARADAS, con su ' +
        'propio PLC.',
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
        'Cómo ha evolucionado UNA señal en un período: mínimo y máximo con su hora, promedio, ' +
        'primer y último valor, y cuántas muestras hubo. Úsala para "¿cómo ha ido el nivel esta ' +
        'mañana?". Sirve a CUALQUIER máquina — si el nombre de la señal es ambiguo entre dos, la ' +
        'herramienta lo dice con la lista de candidatas, así que es la vía barata para saber de ' +
        'qué máquina es algo sin pedirle el estado completo a ninguna. No todas las señales ' +
        'tienen serie propia: si pides una que no la tiene, la herramienta lo dice.',
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
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
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
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
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
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
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
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
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
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
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
        'Compara DOS O MÁS señales en la misma ventana: si se movieron juntas (coeficiente -1 a 1 ' +
        'y su lectura en palabras), más los valores atípicos de cada una CON SU HORA y cuáles ' +
        'coincidieron. LA HERRAMIENTA DEL DIAGNÓSTICO: úsala para "¿por qué se paró la bomba?". ' +
        'Sólo con señales que tengan serie propia. Devuelve un INDICIO, no una causa demostrada: ' +
        'dilo así. Los activos de una MISMA máquina SÍ se cruzan —nivel del tanque y presión de ' +
        'la red lo son—; si fueran de dos máquinas, la herramienta lo detecta y te lo dice.',
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
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senales'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tendencia_multiple',
      description:
        'Cómo han ido VARIAS señales (2 a 4) en el MISMO período, cada una con su mínimo, ' +
        'máximo y promedio por separado. Úsala para "¿cómo van el nivel, la presión y el ' +
        'caudal esta mañana?" en vez de llamar a historia_de_senal una vez por señal — eso ' +
        'agota las rondas y te quedas sin contestar. NO calcula ninguna relación entre ellas: ' +
        'si lo que preguntan es si se mueven juntas, usa correlacionar_senales. Todas tienen ' +
        'que ser de la MISMA máquina y tener serie propia.',
      parameters: {
        type: 'object',
        properties: {
          senales: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Las señales, en lenguaje llano, de dos a cuatro: ["nivel", "presión", "caudal"]. ' +
              'Mismas formas de nombrarlas que en historia_de_senal.',
          },
          periodo: {
            type: 'string',
            description: 'El período, igual que en historia_de_senal. Si se omite, las últimas 6 horas.',
          },
          sistema: {
            type: 'string',
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senales'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_evento',
      description:
        'CUÁNDO cruzó una señal un valor: la primera y la última vez que estuvo por debajo o ' +
        'por encima de un umbral en un período, con su hora y su valor exactos. Para "¿cuándo ' +
        'fue la última vez que la presión bajó de 2?", "¿ha pasado hoy de 80 grados?". ' +
        'Contesta también que NO ocurrió, y eso es un resultado medido, no una falta de datos. ' +
        'Úsala en vez de pedir la serie entera: tú no puedes recorrerla ni comparar muestra a ' +
        'muestra, y esta herramienta ya lo hace.',
      parameters: {
        type: 'object',
        properties: {
          senal: { type: 'string', description: 'Nombre de la señal, en lenguaje llano.' },
          condicion: {
            type: 'string',
            enum: ['por debajo de', 'por encima de', 'igual a'],
            description: 'Qué se busca: que estuviera por debajo, por encima o igual al valor.',
          },
          valor: { type: 'number', description: 'El valor umbral con el que comparar.' },
          periodo: {
            type: 'string',
            description: 'Dónde buscar, igual que en historia_de_senal. Si se omite, las últimas 6 horas.',
          },
          sistema: {
            type: 'string',
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
          },
        },
        required: ['senal', 'condicion', 'valor'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_de_turno',
      description:
        'COMPUESTA: qué ha pasado en una máquina durante un período, en UNA llamada — su estado ' +
        'de ahora, los riesgos activos y cómo han ido sus señales con serie. Para "¿qué pasó en ' +
        'las últimas 8 horas?", "resúmeme el turno", "¿cómo ha ido la mañana?". Úsala en vez de ' +
        'encadenar estado_del_sistema + riesgos_activos + varias historia_de_senal: es lo mismo ' +
        'en un solo viaje. Si alguna parte no está disponible lo dice; no la des por vacía.',
      parameters: {
        type: 'object',
        properties: {
          sistema: { type: 'string', description: 'Id del sistema. Los ids salen de sistemas_de_la_planta.' },
          periodo: {
            type: 'string',
            description: 'El período a resumir, igual que en historia_de_senal. Si se omite, las últimas 6 horas.',
          },
        },
        required: ['sistema'],
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
            description: 'Máquina si NO es el tanque, p.ej. "vibraciones". Omítelo para el tanque.',
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
        'Genera un PDF descargable: un gráfico por cada señal con historia que se pida (o TODO ' +
        'el catálogo del tanque si no se nombra ninguna — hoy 52 señales) más una tabla con el ' +
        'valor actual de las que no tienen serie. Úsala para "genera un reporte", "quiero un PDF ' +
        'de esta semana", "un reporte de todas las señales". Período hasta ~90 días, igual que ' +
        'historia_de_senal. El enlace de descarga se entrega automáticamente; no lo repitas ni lo ' +
        'inventes. Cada gráfico YA lleva su interpretación de tendencia — no hace falta pedirla ' +
        'aparte.',
      parameters: {
        type: 'object',
        properties: {
          senales: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Nombres de señal en lenguaje llano, ej. ["nivel", "temperatura"], SÓLO si el ' +
              'usuario pidió señales concretas. Si pidió "todas", "el catálogo entero" o no ' +
              'especificó ninguna, OMITE este campo por completo — así entra la instalación ' +
              'entera: las que tienen serie como gráfico y las que no como tabla de valores ' +
              'actuales. No selecciones tú un subconjunto "representativo": eso deja fuera ' +
              'señales que el usuario sí esperaba ver.',
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
        'Busca en manuales y procedimientos, devuelve los fragmentos más parecidos, citables por ' +
        'archivo y página. Úsala para "¿cómo se arranca la bomba?". Si la pregunta es claramente ' +
        'de UNA máquina, pasa su `sistema` para que no compitan los manuales de la otra. Si es ' +
        'general o no estás seguro, NO lo pases — acotar de más esconde el manual que contesta.',
      parameters: {
        type: 'object',
        properties: {
          pregunta: {
            type: 'string',
            description: 'Qué quieres consultar en la documentación, en lenguaje llano.',
          },
          sistema: {
            type: 'string',
            description:
              'OPCIONAL. Id del sistema al que se acota la búsqueda, de sistemas_de_la_planta. ' +
              'Los manuales sin máquina asignada ("toda la planta") entran igual. Omítelo para ' +
              'buscar en toda la documentación.',
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
        'Busca en el manual un límite documentado de UNA señal (máximo, mínimo, rango) y lo ' +
        'devuelve como número con su unidad y de qué página sale, en vez de un párrafo a ' +
        'interpretar. Úsala para comparar una lectura contra el manual: "¿150 V es demasiado?". ' +
        'Son CANDIDATOS por patrón, no lecturas garantizadas: puede haber más de uno o ninguno ' +
        'correcto.',
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
        'COMPUESTA, SÓLO DEL TANQUE Y SU GRUPO DE BOMBEO: en una llamada reúne estado actual, ' +
        'historia con fecha de los extremos, correlación entre las señales implicadas y límites ' +
        'del manual con su exceso ya calculado. Si el síntoma es de vibraciones, usa ' +
        'diagnosticar_falla o estado_del_sistema/historia_de_senal por separado. ÚSALA SIEMPRE ' +
        'que pregunten por qué falló algo o cuenten un síntoma del tanque ("se paró la bomba tras ' +
        'un pico de tensión") — normalmente la ÚNICA llamada que hace falta, en vez de encadenar ' +
        'varias herramientas sueltas. Nombra en el síntoma las señales que conozcas; si no ' +
        'nombras ninguna, mira las que tienen historia. Separa lo MEDIDO de lo DOCUMENTADO al ' +
        'redactar. Si el síntoma es un riesgo YA activo con `id` conocido, usa mejor ' +
        'diagnosticar_falla: da causas ya puntuadas con casos previos, que ésta no consulta.',
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
        'estado_del_sistema, o de una pregunta que ya lo menciona—: cruza los datos que lo ' +
        'dispararon, el manual y los casos previos con el MISMO síntoma, y devuelve causas YA ' +
        'ORDENADAS de más a menos respaldada, cada una con su banda ALTO/MEDIO/BAJO y su fuente. ' +
        'NARRA LA LISTA EN EL ORDEN EN QUE LLEGA, SIN REORDENARLA — el orden ya es la puntuación. ' +
        'Cita el `origen` de cada causa y di cuándo un caso previo la respalda o la descarta. ' +
        'Distinta de diagnostico: aquélla arma un dossier libre desde un síntoma en prosa; ésta ' +
        'puntúa las causas de un riesgo ya identificado, con casos previos incluidos.',
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

/* ── La otra mitad del contrato: qué se acepta ejecutar ──────────────── */

/**
 * Un nombre de señal, de sistema o de período tal y como lo escribe el modelo.
 *
 * `z.string()` y nada más, deliberadamente: el SIGNIFICADO lo resuelven
 * `resolverSenal`, `resolverSistema` y `resolverVentana`, cada uno con su
 * catálogo y su mensaje de error, que además lleva dentro la lista de válidos
 * para que el modelo se corrija sin gastar otra ronda. Un `z.enum()` aquí
 * duplicaría ese catálogo en un segundo sitio y lo dejaría divergir.
 */
const Texto = z.string()

/**
 * Un número tal cual lo mande el modelo, SIN rango.
 *
 * Y esto es una decisión, no un olvido: `dias` y `horizonteMinutos` ya se
 * acotan donde se usan (`Math.max(1, Math.min(90, …))` en
 * `herramientas/historicos/index.mjs`). Poner aquí `.min(1).max(90)`
 * convertiría un `dias: 500` —que hoy se recorta a 90 y contesta— en un
 * rechazo. Eso no es validar: es cambiar el comportamiento con la excusa de
 * validarlo. Zod comprueba la FORMA (que sea un número y no "muchos"); el
 * rango sigue siendo del dominio.
 */
const Numero = z.number()

/**
 * Varias señales: una lista, o una cadena separada por comas.
 *
 * ── POR QUÉ LAS DOS FORMAS, Y POR QUÉ ESTO ES UNA CORRECCIÓN ───────
 *
 * `correlacionar_senales` acepta desde antes las dos, con su comentario y su
 * prueba: medido con el 4B, pide un array unas veces y una cadena «nivel,
 * presión» otras, con el mismo esquema delante. Rechazar la cadena cuesta una
 * ronda entera de treinta segundos para corregir algo que se entiende.
 *
 * Al declarar el esquema como `z.array()` a secas (Plan 23 F0), esa tolerancia
 * se volvió código muerto: la validación rechazaba la cadena antes de que la
 * herramienta pudiera perdonarla. F0 prometía validar la FORMA sin cambiar el
 * comportamiento, y ahí lo cambió — y la prueba que se escribió entonces fijó
 * la regresión como si fuera lo correcto, que es la peor parte.
 *
 * El esquema describe ahora lo que la herramienta de verdad acepta. Quien
 * normaliza sigue siendo la herramienta: aquí sólo se deja pasar.
 */
const ListaDeSenales = z.union([z.array(Texto), Texto])

/**
 * Lo que se acepta ejecutar, por herramienta.
 *
 * ── POR QUÉ `.passthrough()` Y NO ESTRICTO ─────────────────────────
 *
 * Un modelo pequeño añade campos que no existen («sistema» a una herramienta
 * que no lo lleva) con la misma facilidad con que olvida uno. Rechazar por un
 * campo de más gasta una ronda de treinta segundos en algo que la
 * implementación ya ignora por sí sola, porque desestructura sólo lo que
 * conoce. Lo que sí se rechaza es el campo REQUERIDO que falta y el tipo
 * equivocado: eso no lo puede ignorar nadie sin inventarse un valor.
 *
 * ── LA QUE ESCRIBE NO DECLARA LO SUYO DOS VECES ────────────────────
 *
 * `controlar_bomba` no trae un `z.boolean()` propio: reutiliza
 * `ControlBombaSchema`, el mismo que valida `POST /api/control/bomba` para el
 * botón del tablero. Son las DOS entradas al único punto de este proyecto que
 * escribe en la planta, y tienen la misma consecuencia física. Con dos
 * esquemas separados, endurecer el de la ruta y olvidar el de la herramienta
 * deja la puerta ancha justo por donde no se mira — y el mensaje de error,
 * que ya estaba escrito para una persona, se hereda gratis.
 */
export const ESQUEMAS = Object.freeze({
  /* Aprendizaje: escriben en nuestro JSON, no en la planta. */
  hechos_de_la_planta: z.object({ sistema: Texto.optional() }).passthrough(),
  registrar_intervencion: z.object({
    sintoma: Texto,
    solucion: Texto,
    causa: Texto.optional(),
    sistema: Texto.optional(),
    resuelto: z.boolean().optional(),
  }).passthrough(),
  cerrar_diagnostico: z.object({
    sistema: Texto,
    riesgoId: Texto,
    causaId: Texto.optional(),
    causaLibre: Texto.optional(),
    propuesta: Texto.optional(),
    componente: Texto.optional(),
    solucion: Texto,
    resuelto: z.boolean().optional(),
  }).passthrough(),
  recordar_hecho: z.object({
    hecho: Texto,
    sistema: Texto.optional(),
    origen: Texto,
  }).passthrough(),
  proponer_regla: z.object({
    titulo: Texto,
    sistema: Texto.optional(),
    /* El único enum de verdad: son tres valores nuestros, cerrados, y no hay
       un resolvedor detrás que sepa corregir «grave» por «critico». */
    severidad: z.enum(['critico', 'atencion', 'informativo']),
    condicion: Texto,
    senales: z.array(Texto),
    evidencia: Texto,
    consecuencia: Texto,
    accion: Texto.optional(),
  }).passthrough(),

  /* Registro: sin argumentos. */
  sistemas_de_la_planta: z.object({}).passthrough(),

  /* Máquina. */
  riesgos_activos: z.object({ sistema: Texto }).passthrough(),
  pronostico_de_desgaste: z.object({
    sistema: Texto.optional(),
    dias: Numero.optional(),
  }).passthrough(),
  estado_del_sistema: z.object({ sistema: Texto }).passthrough(),

  /* Históricos. */
  historia_de_senal: z.object({
    senal: Texto,
    periodo: Texto.optional(),
    sistema: Texto.optional(),
  }).passthrough(),
  valor_en_momento: z.object({
    senal: Texto,
    momento: Texto,
    sistema: Texto.optional(),
  }).passthrough(),
  comparar_periodos: z.object({
    senal: Texto,
    periodoA: Texto,
    periodoB: Texto,
    sistema: Texto.optional(),
  }).passthrough(),
  analisis_de_senal: z.object({
    senal: Texto,
    periodo: Texto.optional(),
    horizonteMinutos: Numero.optional(),
    sistema: Texto.optional(),
  }).passthrough(),
  perfil_de_senal: z.object({
    senal: Texto,
    dias: Numero.optional(),
    sistema: Texto.optional(),
  }).passthrough(),
  correlacionar_senales: z.object({
    senales: ListaDeSenales,
    periodo: Texto.optional(),
    sistema: Texto.optional(),
  }).passthrough(),
  tendencia_multiple: z.object({
    senales: ListaDeSenales,
    periodo: Texto.optional(),
    sistema: Texto.optional(),
  }).passthrough(),
  buscar_evento: z.object({
    senal: Texto,
    /* El enum SÍ se valida aquí, al contrario que los nombres de señal: son
       tres valores nuestros, cerrados, y no hay resolvedor detrás que sepa
       corregir «menor que» por «por debajo de». La herramienta contesta con la
       lista de válidas de todos modos. */
    condicion: z.enum(['por debajo de', 'por encima de', 'igual a']),
    valor: Numero,
    periodo: Texto.optional(),
    sistema: Texto.optional(),
  }).passthrough(),
  resumen_de_turno: z.object({
    sistema: Texto,
    periodo: Texto.optional(),
  }).passthrough(),
  grafico_de_senal: z.object({
    senal: Texto,
    periodo: Texto.optional(),
    sistema: Texto.optional(),
  }).passthrough(),
  generar_reporte: z.object({
    senales: z.array(Texto).optional(),
    periodo: Texto.optional(),
    explicacion: Texto.optional(),
  }).passthrough(),

  /* Documentación y diagnóstico. */
  consultar_documentacion: z.object({
    pregunta: Texto,
    sistema: Texto.optional(),
  }).passthrough(),
  limites_del_manual: z.object({ senal: Texto }).passthrough(),
  diagnostico: z.object({
    sintoma: Texto,
    periodo: Texto.optional(),
  }).passthrough(),
  diagnosticar_falla: z.object({
    sistema: Texto,
    riesgoId: Texto,
  }).passthrough(),

  /* La única que escribe en la planta. Ver la cabecera de arriba. */
  controlar_bomba: ControlBombaSchema.passthrough(),
})
