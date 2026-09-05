/**
 * Causas candidatas por riesgo — Plan 16 Fase 3.
 *
 * ── ESTO NO ES AUTORÍA, ES TRANSCRIPCIÓN ────────────────────────────
 *
 * Cada entrada de aquí sale de un campo que YA EXISTÍA antes de este archivo:
 * el `accion` o la `consecuencia` de una regla de `riesgos.js` /
 * `riesgosVibracion.js`. Quien escribió esa regla ya había pensado «si esto
 * pasa, qué se mira primero» — este archivo sólo lo saca de una frase en
 * prosa y lo pone en una forma que `diagnostico.mjs` (Fase 4) pueda puntuar y
 * ordenar, sin haber entrevistado a nadie ni inventado nada que no estuviera
 * ya escrito. Ver docs/PLAN-16-DIAGNOSTICO-RAG.md §3 para la decisión
 * completa.
 *
 * ── POR QUÉ NO TODOS LOS RIESGOS ESTÁN AQUÍ ─────────────────────────
 *
 * Un riesgo entra si su `accion`/`consecuencia` NOMBRA algo que pueda fallar
 * — «revisar la válvula de alivio» es una causa candidata. Quedan fuera a
 * propósito los riesgos puramente informativos (`variador-en-manual`) y los
 * que son sobre el estado de la instrumentación, no de la máquina
 * (`sensor-con-desviacion`, `confianza-de-medida-baja`,
 * `alarmas-activas`, `alarmas-sin-reconocer`, `dkw-sin-referencia`,
 * `rodamientos-sin-vigilar`, `medida-sin-vigilar`, `vigilancia-en-aviso` —
 * ésta última ya dice QUÉ vigilancia concreta se disparó en su propia
 * `evidencia`, con el nombre del defecto que trae declarado
 * `VIGILANCIAS` en `vibraciones.js`, así que no necesita una lista aparte—,
 * y las de rango de medida (`velocidad-fuera-de-norma`,
 * `velocidad-en-el-borde-de-la-banda`, `por-debajo-del-minimo-del-modulo`,
 * `medida-en-vacio`).
 *
 * `diagnostico.mjs` no falla ante un riesgo sin entrada aquí: lo dice, en vez
 * de callarse. Ver `causasDe()` al final del archivo.
 *
 * Y desde el 04-09-2026 esa lista de exclusiones ya no vive sólo en este
 * párrafo: está en `SIN_CAUSAS_DELIBERADO`, con el motivo de cada una, y un
 * verificador exige que TODO riesgo sin causas esté clasificado ahí o en
 * `SIN_CAUSAS_PENDIENTE`. Mientras fue prosa, dos huérfanos se colaron sin
 * que nadie pudiera notarlo.
 *
 * ── DOS CLASES DE «PROVISIONAL», Y NO SE CONFUNDEN ──────────────────
 *
 * Las causas del TANQUE heredan `PROVISIONALES` de `umbrales.js` en vivo:
 * son provisionales porque el UMBRAL que dispara el riesgo es una estimación
 * nuestra, y cuando alguien confirme los rangos reales dejan de serlo solas,
 * sin tocar este archivo.
 *
 * Las de VIBRACIÓN por vibración alta (`vibracion-en-alarma`,
 * `vibracion-en-aviso`) NO son provisionales por esa razón: están detrás de
 * ISO 10816-1, una norma de verdad, no una estimación nuestra. La de
 * `asimetria-entre-apoyos` sí es provisional, pero por un motivo DISTINTO e
 * independiente de `PROVISIONALES`: no hay norma detrás, es una convención
 * de mantenimiento —lo dice la propia regla en `riesgosVibracion.js`— y eso
 * no cambia el día que se confirmen los umbrales del tanque.
 */
import { PROVISIONALES } from "./umbrales.js";

/**
 * Azúcar para no repetir `provisional`/`origen` en cada causa del tanque.
 *
 * `firmaTemporal` es OPCIONAL (Plan 17 Fase 6, G5): una causa sin ella saca
 * `temporal: 0` y no se penaliza —ver `backend/ia/motor/temporal.mjs`—. Cuando se
 * declara, es la MISMA regla de transcripción del resto del archivo: sale
 * de una frase que YA ESTABA escrita en `riesgos.js`, no de una relación
 * física inventada aquí.
 */
function causaTanque({ id, titulo, componente, terminosManual, riesgoId, firmaTemporal = null }) {
  return {
    id,
    titulo,
    componente,
    terminosManual,
    origen: `riesgos.js · accion (${riesgoId})`,
    provisional: PROVISIONALES,
    ...(firmaTemporal ? { firmaTemporal } : {}),
  };
}

/** Las tres causas habituales de vibración alta según ISO 10816-1 —mismo
 *  fenómeno físico, dos zonas de severidad distinta (`vibracion-en-alarma` es
 *  zona D, `vibracion-en-aviso` es zona C)—, así que las dos reglas comparten
 *  exactamente estas tres candidatas. */
function causasVibracionAlta(riesgoId) {
  return [
    {
      id: "desequilibrio",
      titulo: "Desequilibrio del rotor",
      componente: "Rotor / acoplamiento",
      terminosManual: ["desequilibrio", "balanceo", "rotor"],
      origen: `riesgosVibracion.js · consecuencia (${riesgoId})`,
      provisional: false, // ISO 10816-1, no una estimación nuestra
    },
    {
      id: "desalineacion",
      titulo: "Desalineación del acoplamiento",
      componente: "Acoplamiento motor-bomba",
      terminosManual: ["desalineacion", "alineacion", "acoplamiento"],
      origen: `riesgosVibracion.js · consecuencia (${riesgoId})`,
      provisional: false,
    },
    {
      id: "aflojamiento-anclaje",
      titulo: "Aflojamiento del anclaje o la bancada",
      componente: "Bancada / pernos de anclaje",
      terminosManual: ["aflojamiento", "anclaje", "bancada", "fijacion"],
      origen: `riesgosVibracion.js · consecuencia (${riesgoId})`,
      provisional: false,
    },
  ];
}

/**
 * Las familias de disparo del variador V20, TRANSCRITAS de su manual.
 *
 * ── DE DÓNDE SALE CADA UNA ──────────────────────────────────────────
 *
 * De la tabla «Lista de códigos de fallo» del manual de servicio del
 * SINAMICS V20 (A5E31842763, 02/2013), página 272 y siguientes, que trae tres
 * columnas: Fallo, Causa y Remedio. Cada entrada de aquí agrupa los códigos
 * de una misma familia y copia SU causa — no hay nada inventado, igual que en
 * el resto de este archivo.
 *
 * Ese manual es el que se acaba de asignar al sistema de vibraciones, así que
 * el término de búsqueda de cada causa cae dentro del documento correcto y
 * `manualCitado` sale con su página real.
 *
 * ── LA OBJECIÓN, DICHA EN VOZ ALTA ──────────────────────────────────
 *
 * La cabecera de este archivo argumentaba que `variador-en-fallo` no debía
 * tener causas: «el fallo YA ESTÁ identificado por el propio riesgo». El
 * argumento es bueno y depende de una pieza que NO EXISTE — que alguien lea
 * el código de fallo y lo busque en el manual.
 *
 * El variador sí lo publica: la máquina expone `ultimoFallo`, y el propio
 * manual documenta `r0947` como «último código de fallo», con historial de
 * ocho disparos. Pero ninguna herramienta lo lee hoy, así que el riesgo se
 * quedaba sin causas Y sin lectura del código: lo peor de las dos opciones.
 *
 * Estas candidatas son el puente mientras eso llegue. Cuando una herramienta
 * lea `ultimoFallo`, el código exacto DEBE ganar a esta lista — una familia
 * puntuada por parecido al manual no compite con un código que el equipo
 * declara. Ese día, esto se sustituye por la búsqueda del código; no se
 * suman.
 *
 * Por eso van todas con `provisional: true`: no es que el umbral esté sin
 * confirmar —aquí no hay umbral—, es que son la familia probable y no el
 * fallo concreto, y el técnico tiene que saber que puede mirar el código.
 */
function causasVariadorEnFallo() {
  const origen = "manual SINAMICS V20 · Lista de códigos de fallo (p. 272)";
  return [
    {
      id: "sobrecorriente-o-cortocircuito",
      titulo: "Sobrecorriente en la salida (F1): cortocircuito, defecto a tierra o motor mal parametrizado",
      componente: "Variador V20 / cable de motor",
      terminosManual: ["sobrecorriente", "cortocircuito", "defectos a tierra", "F1"],
      origen,
      provisional: true,
    },
    {
      id: "sobretension-de-bus",
      titulo: "Sobretensión del circuito intermedio (F2): deceleración demasiado rápida o red alta",
      componente: "Variador V20 / circuito intermedio DC",
      terminosManual: ["sobretension", "tension de la interconexion de DC", "deceleracion", "F2"],
      origen,
      provisional: true,
    },
    {
      id: "subtension-de-alimentacion",
      titulo: "Subtensión de alimentación (F3): caída o corte breve de la red",
      componente: "Acometida eléctrica",
      terminosManual: ["subtension", "alimentacion", "red", "F3"],
      origen,
      provisional: true,
    },
    {
      id: "sobretemperatura",
      titulo: "Sobretemperatura del variador o del motor (F4, F5, F11): ventilación o ciclo de carga",
      componente: "Variador V20 / motor",
      terminosManual: ["sobretemperatura", "sobrecalentamiento del motor", "ventilacion", "F4"],
      origen,
      provisional: true,
    },
    {
      /*
       * La que más habla con ESTA máquina. El manual describe la vigilancia
       * de carga (P2181) como la que «vigila fallos mecánicos en la cadena
       * cinemática, p. ej., correas defectuosas» y detecta «estados que
       * producen sobrecargas, p. ej., bloqueos». En una bancada rotativa
       * vigilada por vibración, ese disparo y una vibración alta suelen ser
       * el mismo problema visto por dos instrumentos.
       */
      id: "disparo-de-vigilancia-de-carga",
      titulo: "Disparo de la vigilancia de carga (F452): fallo mecánico en la cadena cinemática o bloqueo",
      componente: "Transmisión / acoplamiento",
      terminosManual: ["vigilancia de carga", "cadena cinematica", "correas", "bloqueo", "F452"],
      origen,
      provisional: true,
    },
  ];
}

/**
 * Causas candidatas, por id de riesgo. Un riesgo que no aparece aquí no
 * tiene causas declaradas — `causasDe()` lo dice explícitamente, nunca lo
 * calla ni lo confunde con una lista vacía por descuido.
 */
export const CAUSAS_POR_RIESGO = {
  "variador-en-fallo": causasVariadorEnFallo(),

  /* ── Tanque ───────────────────────────────────────────────────────── */

  derrame: [
    causaTanque({
      id: "corte-nivel-alto-no-actua",
      titulo: "El corte automático por nivel alto no está actuando",
      componente: "Lazo de control de nivel alto",
      terminosManual: ["nivel alto", "corte", "enclavamiento", "lazo de control"],
      riesgoId: "derrame",
    }),
  ],

  "marcha-en-seco": [
    causaTanque({
      id: "nivel-real-insuficiente",
      titulo: "El nivel real del tanque es insuficiente",
      componente: "Suministro de agua al tanque",
      terminosManual: ["nivel", "suministro", "llenado", "aporte de agua"],
      riesgoId: "marcha-en-seco",
    }),
    causaTanque({
      id: "proteccion-nivel-bajo-no-actua",
      titulo: "La protección por nivel bajo no está actuando",
      componente: "Lazo de control de nivel bajo",
      terminosManual: ["nivel bajo", "proteccion", "enclavamiento", "corte"],
      riesgoId: "marcha-en-seco",
    }),
  ],

  sobrepresion: [
    causaTanque({
      id: "consigna-variador-alta",
      titulo: "La consigna del variador está por encima de lo debido",
      componente: "Variador de frecuencia",
      terminosManual: ["consigna", "variador", "frecuencia", "velocidad"],
      riesgoId: "sobrepresion",
    }),
    causaTanque({
      id: "valvula-alivio-no-actua",
      titulo: "La válvula de alivio no está actuando",
      componente: "Válvula de alivio",
      terminosManual: ["valvula de alivio", "seguridad", "tarado"],
      riesgoId: "sobrepresion",
    }),
  ],

  obstruccion: [
    causaTanque({
      id: "valvula-impulsion-parcialmente-cerrada",
      titulo: "Válvula de la línea de impulsión parcialmente cerrada",
      componente: "Válvula de impulsión",
      terminosManual: ["valvula", "impulsion", "cierre"],
      riesgoId: "obstruccion",
    }),
    causaTanque({
      id: "filtro-colmatado",
      titulo: "Filtro de línea colmatado",
      componente: "Filtro de línea",
      terminosManual: ["filtro", "colmatado", "obstruccion"],
      riesgoId: "obstruccion",
    }),
  ],

  "bomba-sin-salida": [
    causaTanque({
      id: "valvula-impulsion-cerrada",
      titulo: "Válvula de impulsión cerrada o agarrotada",
      componente: "Válvula de impulsión",
      terminosManual: ["valvula", "impulsion", "cierre", "agarrotada"],
      riesgoId: "bomba-sin-salida",
    }),
    causaTanque({
      id: "sin-recirculacion-minima",
      titulo: "Sin línea de recirculación mínima",
      componente: "Línea de recirculación",
      terminosManual: ["recirculacion", "caudal minimo", "by-pass"],
      riesgoId: "bomba-sin-salida",
      /*
       * Transcrita, no inventada: la propia `consecuencia` de la regla
       * `bomba-sin-salida` en `riesgos.js` dice «la temperatura del líquido
       * atrapado en la bomba puede subir rápidamente» — es el mecanismo
       * PROPIO de esta causa (sin salida de calor, el líquido se calienta
       * con el tiempo), y no el de `valvula-impulsion-cerrada` (una válvula
       * cerrada es un cambio de estado, no una tendencia). Es exactamente
       * la fuente que discrimina entre las dos causas del mismo riesgo que
       * `datos` —misma evidencia física para las dos— no puede dar.
       */
      firmaTemporal: [{ senal: "temperaturaTanque", direccion: "sube", ventanaH: 1 }],
    }),
  ],

  "posible-fuga": [
    causaTanque({
      id: "fuga-o-rotura-en-la-red",
      titulo: "Fuga, rotura o salida abierta en la red",
      componente: "Red de distribución",
      terminosManual: ["fuga", "rotura", "descarga anomala"],
      riesgoId: "posible-fuga",
    }),
  ],

  "esfuerzo-sin-resultado": [
    {
      // Mismo `id` de riesgo en riesgos.js y de mecanismo en pronostico.js —
      // la única correspondencia literal entre los dos catálogos—, así que
      // el componente se toma de `MECANISMOS` (más preciso: nombra también
      // los rodamientos) en vez de repetir sólo lo que dice `consecuencia`.
      id: "impulsor-desgastado",
      titulo: "Impulsor desgastado",
      componente: "Impulsor y rodamientos de la bomba",
      terminosManual: ["impulsor", "desgaste", "rodete", "rodamientos"],
      origen: "riesgos.js · consecuencia + pronostico.js · MECANISMOS (esfuerzo-sin-resultado)",
      provisional: PROVISIONALES,
    },
    causaTanque({
      id: "obstruccion-interna-bomba",
      titulo: "Obstrucción interna en la bomba o la línea",
      componente: "Bomba / línea de impulsión",
      terminosManual: ["obstruccion", "atasco"],
      riesgoId: "esfuerzo-sin-resultado",
    }),
  ],

  "tension-fuera-con-motor": [
    causaTanque({
      id: "problema-en-el-suministro",
      titulo: "Problema en el suministro eléctrico",
      componente: "Acometida / suministro eléctrico",
      terminosManual: ["suministro", "acometida", "tension de linea"],
      riesgoId: "tension-fuera-con-motor",
    }),
    causaTanque({
      id: "protecciones-variador-mal-ajustadas",
      titulo: "Protecciones del variador mal ajustadas",
      componente: "Variador de frecuencia",
      terminosManual: ["protecciones", "variador", "ajuste"],
      riesgoId: "tension-fuera-con-motor",
    }),
  ],

  "agua-caliente": [
    causaTanque({
      id: "aporte-termico-externo",
      titulo: "Aporte térmico externo al tanque",
      componente: "Entorno / proceso aguas arriba",
      terminosManual: ["aporte termico", "calor", "temperatura ambiente"],
      riesgoId: "agua-caliente",
    }),
    causaTanque({
      id: "falta-renovacion-de-agua",
      titulo: "Falta de renovación de agua en el tanque",
      componente: "Circuito de llenado",
      terminosManual: ["renovacion", "recambio", "llenado"],
      riesgoId: "agua-caliente",
    }),
  ],

  /* ── Vibraciones ──────────────────────────────────────────────────── */

  "vibracion-en-alarma": causasVibracionAlta("vibracion-en-alarma"),
  "vibracion-en-aviso": causasVibracionAlta("vibracion-en-aviso"),

  "asimetria-entre-apoyos": [
    {
      id: "rodamiento-en-mal-estado",
      titulo: "Rodamiento en mal estado en ese apoyo",
      componente: "Rodamiento del apoyo señalado",
      terminosManual: ["rodamiento", "picado", "desgaste"],
      origen: "riesgosVibracion.js · consecuencia (asimetria-entre-apoyos)",
      // Convención de mantenimiento, no norma — ver la cabecera del archivo.
      provisional: true,
    },
    {
      id: "fijacion-floja-en-el-apoyo",
      titulo: "Fijación floja en ese apoyo",
      componente: "Pernos de fijación del apoyo señalado",
      terminosManual: ["fijacion", "apriete", "base floja"],
      origen: "riesgosVibracion.js · consecuencia (asimetria-entre-apoyos)",
      provisional: true,
    },
    {
      id: "desalineacion-localizada",
      titulo: "Desalineación del acoplamiento tirando de ese lado",
      componente: "Acoplamiento, lado del apoyo señalado",
      terminosManual: ["desalineacion", "acoplamiento"],
      origen: "riesgosVibracion.js · consecuencia (asimetria-entre-apoyos)",
      provisional: true,
    },
  ],
};

/**
 * Las causas candidatas de un riesgo, o `null` si no hay ninguna declarada.
 *
 * `null` y no `[]`: un array vacío se confunde con «se buscaron y no hay
 * ninguna», y aquí el caso real es «este riesgo no tiene causas transcritas
 * todavía» — la propia cabecera del archivo explica cuáles se dejaron fuera y
 * por qué. `diagnostico.mjs` decide qué decir con cada uno de los dos casos;
 * este archivo sólo distingue si el riesgo aparece en el mapa.
 */
export function causasDe(riesgoId) {
  return CAUSAS_POR_RIESGO[riesgoId] ?? null;
}

/**
 * POR QUÉ un riesgo no tiene causas: la cabecera de este archivo, en código.
 *
 * ── EL PROBLEMA QUE ESTO CIERRA ─────────────────────────────────────
 *
 * `causasDe()` devuelve `null` en dos situaciones que no se parecen en nada:
 *
 *   · el riesgo NO TIENE causas debajo, y es correcto que no las tenga
 *   · el riesgo SÍ las tendría, pero nadie las ha transcrito todavía
 *
 * La cabecera de este archivo distingue las dos desde el primer día, pero en
 * prosa: el código no podía leerla, así que `diagnosticar_falla` contestaba
 * «puede ser deliberado, o puede que nadie las haya transcrito» y dejaba al
 * técnico sin saber si el sistema está bien o incompleto.
 *
 * Con un riesgo de diez eso era tolerable. Medido el 03-09-2026 dejó de
 * serlo: en el tanque falta 1 de 10, pero en vibraciones faltan 15 de 18, así
 * que la respuesta ambigua pasó a ser la MAYORITARIA de esa máquina.
 *
 * ── TRES CLASES, NO UNA ─────────────────────────────────────────────
 *
 * Son las mismas que la cabecera ya nombraba, y se distinguen porque lo que
 * el técnico tiene que hacer con cada una es distinto:
 *
 *   informativo     el riesgo sólo informa de un modo de operación
 *   instrumentacion habla del estado de la MEDIDA, no de la máquina
 *   rango-medida    la lectura cae fuera de donde la norma o el módulo saben
 *                   juzgar; no es una avería, es que no se puede opinar
 *
 * ── `PENDIENTES` NO ES UNA LISTA DE VERGÜENZA ───────────────────────
 *
 * Es la otra mitad, y tiene que existir para que el verificador pueda exigir
 * que TODO riesgo sin causas esté clasificado en una de las dos. Sin ella,
 * añadir un riesgo y olvidarse de sus causas no lo nota nadie — que es
 * exactamente como llegaron aquí estos dos.
 */
export const SIN_CAUSAS_DELIBERADO = {
  "variador-en-manual": {
    clase: "informativo",
    motivo:
      "El riesgo sólo informa de que el variador está en modo manual: no hay una avería " +
      "debajo que diagnosticar, el propio modo es el hecho.",
  },

  /*
   * Estado de la INSTRUMENTACIÓN, no de la máquina.
   *
   * `variador-en-fallo` estuvo aquí y salió el 04-09-2026: ver la cabecera de
   * `causasVariadorEnFallo`. El argumento para excluirlo —«su código ya lo
   * identifica»— dependía de una pieza que nadie había construido.
   */
  "sensor-con-desviacion": {
    clase: "instrumentacion",
    motivo: "Habla del estado del sensor, no de la máquina que mide.",
  },
  "confianza-de-medida-baja": {
    clase: "instrumentacion",
    motivo: "El módulo desconfía de su propia medida: lo que falla es la medida, no la máquina.",
  },
  "alarmas-activas": {
    clase: "instrumentacion",
    motivo:
      "Es un contador del área de alarmas del servidor. Cuál alarma se disparó no se puede " +
      "saber desde aquí, así que no hay causa que proponer.",
  },
  "alarmas-sin-reconocer": {
    clase: "instrumentacion",
    motivo: "Igual que el anterior: un contador, y además de gestión, no de máquina.",
  },
  "dkw-sin-referencia": {
    clase: "instrumentacion",
    motivo: "El valor de daño no tiene referencia aprendida todavía: falta calibración, no hay avería.",
  },
  "rodamientos-sin-vigilar": {
    clase: "instrumentacion",
    motivo:
      "El diagnóstico de rodamientos está apagado en el módulo. El riesgo dice justamente que " +
      "no se está vigilando; proponer causas de rodamiento sería fingir que sí.",
  },
  "medida-sin-vigilar": {
    clase: "instrumentacion",
    motivo: "Hay medidas que se publican y nadie vigila: es un hueco de configuración.",
  },
  "vigilancia-en-aviso": {
    clase: "instrumentacion",
    motivo:
      "Ya dice QUÉ vigilancia concreta se disparó en su propia evidencia, con el nombre del " +
      "defecto que declara VIGILANCIAS. Una lista de causas aparte sería repetirlo peor.",
  },

  /* Fuera del rango en el que alguien puede juzgar la lectura. */
  "velocidad-fuera-de-norma": {
    clase: "rango-medida",
    motivo:
      "La máquina gira fuera de la banda donde ISO 10816 sabe juzgar: no es una avería, es que " +
      "el veredicto no aplica.",
  },
  "velocidad-en-el-borde-de-la-banda": {
    clase: "rango-medida",
    motivo: "Misma razón, en el borde: la lectura llega recortada y hay que decirlo, no diagnosticarla.",
  },
  "por-debajo-del-minimo-del-modulo": {
    clase: "rango-medida",
    motivo: "Por debajo de lo que el propio módulo puede medir.",
  },
  "medida-en-vacio": {
    clase: "rango-medida",
    motivo:
      "La máquina gira sin carga: la medida es válida pero no representa el servicio, así que " +
      "no hay avería que atribuir.",
  },
};

/**
 * Riesgos que SÍ deberían tener causas y todavía no las tienen.
 *
 * Los dos que hay salieron de comparar la cabecera de este archivo con las
 * reglas reales el 03-09-2026: la cabecera enumeraba catorce huérfanos
 * deliberados y las reglas tenían dieciséis. Éstos son los dos que nadie
 * había clasificado — no por una decisión, sino porque no había forma de
 * notarlo.
 */
export const SIN_CAUSAS_PENDIENTE = {
  "alarma-del-modulo": {
    motivo:
      "El módulo levanta su alarma por vibración alta, así que debajo hay las mismas causas " +
      "mecánicas que `vibracion-en-alarma`. Falta transcribirlas desde su regla.",
  },
  "aviso-del-modulo": {
    motivo: "Lo mismo que `alarma-del-modulo`, un escalón antes.",
  },
};

/**
 * Por qué este riesgo no tiene causas, o `null` si nadie lo ha clasificado.
 *
 * `deliberado: false` NO es un error del sistema: es «esto debería tener
 * causas y no las tiene». Se dice tal cual, porque un técnico que lee «no hay
 * causas» merece saber si es que no las hay o es que faltan — el arreglo de
 * cada caso es distinto y uno de los dos es trabajo nuestro.
 */
export function porQueSinCausas(riesgoId) {
  const deliberado = SIN_CAUSAS_DELIBERADO[riesgoId];
  if (deliberado) return { deliberado: true, ...deliberado };

  const pendiente = SIN_CAUSAS_PENDIENTE[riesgoId];
  if (pendiente) return { deliberado: false, clase: "pendiente", ...pendiente };

  return null;
}
