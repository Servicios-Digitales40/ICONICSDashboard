/**
 * Reglas de riesgo del SISTEMA DE VIBRACIONES, evaluadas sobre el instante.
 *
 * ── POR QUÉ SOBRE EL INSTANTE Y NO SOBRE TENDENCIA ─────────────────
 *
 * Porque el grupo `DEMO 3` del historiador no registra: sus 119 tags están
 * definidos y devuelven HTTP 500. Lo comprobado el 25-08-2026 es que se leen
 * EN VIVO perfectamente, y nada más. Así que aquí no hay una sola regla que
 * diga «lleva subiendo»: eso pertenece a `pronostico.js`, y no se podrá
 * escribir hasta que alguien active el registro en Workbench.
 *
 * Esta separación es deliberada. Una regla de tendencia alimentada de lecturas
 * sueltas produce frases que suenan a diagnóstico y no lo son.
 *
 * ── QUÉ SE AFIRMA Y QUÉ SE SUPONE ──────────────────────────────────
 *
 * Cada regla separa tres cosas, igual que `riesgos.js`:
 *
 *   evidencia     lo MEDIDO. Números que vienen del servidor.
 *   consecuencia  la HIPÓTESIS. Lo que podría estar pasando si la evidencia
 *                 se mantiene. Nunca se presenta como hecho.
 *   accion        qué mirar para confirmarla o descartarla.
 *
 * ── EL ORDEN IMPORTA: LA VELOCIDAD MANDA ───────────────────────────
 *
 * ISO 10816 evalúa la banda 10–1000 Hz, así que su criterio sólo aplica por
 * encima de unas 600 rpm. Por debajo, la frecuencia de giro se sale de la
 * banda y el filtro atenúa justo la componente de desequilibrio que se quería
 * medir: las lecturas salen bajas POR CONSTRUCCIÓN, y entonces las reglas de
 * ISO **se declaran no evaluables** en vez de dar un veredicto tranquilizador
 * que la norma no respalda.
 *
 * Entre 600 y 720 rpm hay una franja intermedia que merece su propio aviso: la
 * norma sí se pronuncia, pero la frecuencia de giro está tan pegada al corte
 * del filtro que la lectura llega recortada. El 25-08-2026 esta máquina giraba
 * a 604 rpm, justo ahí. El veredicto vale; el margen, no se ve en el número, y
 * por eso se dice aparte.
 */
import {
  CANALES,
  LIMITES_ISO,
  QC_NOMINAL,
  RPM_BORDE_ISO,
  RPM_MINIMA_ISO,
  RPM_MINIMA_MODULO,
  VIGILANCIAS,
} from "./vibraciones.js";

/** ¿Hay número utilizable? Una calidad mala llega como `null` o `undefined`. */
const hay = (v) => v !== null && v !== undefined && Number.isFinite(v);

/**
 * Un contador de alarmas como número.
 *
 * Sin lectura devuelve 0 —y no `null`— porque estos contadores sólo se usan
 * con `> 0`: la pregunta es «¿hay alguna?», y sin dato la respuesta honesta
 * es que no consta ninguna. La ausencia de la lectura se ve aparte, en la
 * lista de puntos sin dato de la pantalla.
 */
const num = (v) => (hay(v) ? v : 0);

/**
 * Par por debajo del cual se considera que la máquina gira EN VACÍO.
 *
 * No sale de ninguna norma: es el ruido del propio tag. El variador publicaba
 * `TORQUE_BMS` en 0,00 y −0,01 en lecturas consecutivas con la máquina
 * girando, así que cualquier cosa por debajo de un 2 % es indistinguible de
 * cero. Se deja nombrado y con su porqué para que se pueda discutir.
 */
const PAR_EN_VACIO = 2;

/**
 * Cuántas veces por encima de sus compañeros tiene que estar un apoyo para que
 * merezca mirarse.
 *
 * Tampoco sale de una norma —ISO 10816 no dice nada de comparar apoyos entre
 * sí—, es una convención de mantenimiento. Se elige 3 porque por debajo la
 * dispersión normal entre puntos de medida de la misma máquina ya la alcanza.
 */
const VECES_ASIMETRIA = 3;

/**
 * Forma de una regla:
 *
 *   id           identificador estable
 *   titulo       qué pasa, en una línea
 *   ambito       "canal" (se evalúa una vez por sensor) | "maquina"
 *   necesita     qué datos hacen falta; sin ellos la regla es NO EVALUABLE,
 *                que no es lo mismo que estar tranquila
 *   exigeNorma   si true, no se evalúa cuando la velocidad deja fuera a ISO
 *   nivel        "critico" | "atencion" | "informativo"
 *   cuando       (datos) => boolean
 *   evidencia    (datos) => string. Sólo lo medido.
 *   consecuencia hipótesis, en condicional
 *   accion       qué comprobar
 *   norma        de dónde sale el criterio, cuando sale de algún sitio
 */
export const REGLAS = [
  /* ── Lo que invalida a las demás ─────────────────────────────── */
  {
    id: "velocidad-fuera-de-norma",
    titulo: "La máquina gira demasiado despacio para juzgarla con ISO 10816",
    ambito: "maquina",
    necesita: ["velocidad"],
    exigeNorma: false,
    nivel: "informativo",
    cuando: (d) => d.velocidad < RPM_MINIMA_ISO,
    evidencia: (d) =>
      `El variador entrega ${fmt(d.frecuencia, 2)} Hz y el motor gira a ` +
      `${fmt(d.velocidad, 0)} rpm, por debajo de las ${RPM_MINIMA_ISO} rpm ` +
      `desde las que la norma se pronuncia.`,
    consecuencia:
      "Las lecturas de velocidad eficaz salen BAJAS por construcción: a esta " +
      "velocidad la frecuencia de giro cae fuera de la banda 10–1000 Hz que " +
      "mide la norma, y el filtro atenúa la componente de desequilibrio. Un " +
      "«dentro de límite» aquí no significa que la máquina esté bien; " +
      "significa que la norma no se ha pronunciado.",
    accion:
      "Para evaluar contra ISO, medir con la máquina a su velocidad de " +
      "servicio. Mientras tanto, guiarse por el aRMS y por la comparación " +
      "entre apoyos, que no dependen de esa banda.",
    norma: "ISO 10816-1 (banda de medida 10–1000 Hz)",
  },
  {
    id: "velocidad-en-el-borde-de-la-banda",
    titulo: "La máquina gira pegada al borde inferior de la banda de medida",
    ambito: "maquina",
    necesita: ["velocidad"],
    exigeNorma: false,
    nivel: "informativo",
    /*
     * Franja intermedia: la norma SÍ se pronuncia, pero el número llega
     * recortado. Es la situación medida el 25-08-2026 —604 rpm, 20,15 Hz— y
     * merece decirse, porque el veredicto verde que la acompaña es correcto y
     * a la vez más frágil de lo que aparenta.
     */
    cuando: (d) => d.velocidad >= RPM_MINIMA_ISO && d.velocidad < RPM_BORDE_ISO,
    evidencia: (d) =>
      `${fmt(d.velocidad, 0)} rpm son ${fmt(d.velocidad / 60, 2)} Hz de giro, ` +
      `justo por encima de los 10 Hz en que arranca la banda de medida de la norma.`,
    consecuencia:
      "El filtro paso alto de 10 Hz no corta en seco: en su propia frecuencia " +
      "atenúa cerca de un 30 %. La componente de desequilibrio, que es la que " +
      "más pesa en la velocidad eficaz, entra recortada. El veredicto de ISO " +
      "sigue siendo válido, pero con menos margen del que sugiere la cifra.",
    accion:
      "Si se quiere una medida de referencia fiable, tomarla con la máquina " +
      "a su velocidad de servicio, donde la banda la recoge entera.",
    norma: "ISO 10816-1 (banda de medida 10–1000 Hz)",
  },
  {
    id: "por-debajo-del-minimo-del-modulo",
    titulo: "La máquina gira por debajo de lo que el módulo puede medir",
    ambito: "maquina",
    necesita: ["velocidad"],
    exigeNorma: false,
    nivel: "atencion",
    cuando: (d) => d.velocidad > 0 && d.velocidad < RPM_MINIMA_MODULO,
    evidencia: (d) =>
      `${fmt(d.velocidad, 0)} rpm, por debajo de las ${RPM_MINIMA_MODULO} rpm ` +
      "mínimas del SIPLUS CMS SM 1281.",
    consecuencia:
      "El módulo no garantiza sus medidas por debajo de ese régimen. Lo que " +
      "publique ahora mismo no es comparable con nada.",
    accion: "No usar estas lecturas para decidir. Repetir a régimen normal.",
    norma: "Manual SIPLUS CMS 1200 SM 1281",
  },
  {
    id: "medida-en-vacio",
    titulo: "La máquina gira sin carga",
    ambito: "maquina",
    necesita: ["par"],
    exigeNorma: false,
    nivel: "informativo",
    cuando: (d) => Math.abs(d.par) < PAR_EN_VACIO,
    evidencia: (d) =>
      `El par del variador es ${fmt(d.par, 2)} %` +
      (hay(d.potencia) ? ` y la potencia ${fmt(d.potencia, 2)} kW` : "") +
      ": la máquina gira, pero no está trabajando.",
    consecuencia:
      "En vacío no aparecen las vibraciones que sólo se manifiestan bajo " +
      "carga —desalineación forzada por el par, holguras que se cierran, " +
      "cavitación—. Una medida limpia aquí no descarta un problema en marcha.",
    accion:
      "Tomar la medida de referencia con la máquina en su condición normal " +
      "de trabajo, no en vacío.",
    norma: null,
  },

  /* ── ISO, sobre la velocidad eficaz ──────────────────────────── */
  {
    id: "vibracion-en-alarma",
    titulo: "Vibración en zona de daño",
    ambito: "canal",
    necesita: ["vRMS"],
    exigeNorma: true,
    nivel: "critico",
    cuando: (d) => d.vRMS > LIMITES_ISO.alarma,
    evidencia: (d) =>
      `Velocidad eficaz ${fmt(d.vRMS, 3)} mm/s, por encima de los ` +
      `${LIMITES_ISO.alarma} mm/s en que ISO 10816-1 Clase I sitúa la zona D.`,
    consecuencia:
      "Zona D es la de daño: a este nivel la máquina se está deteriorando " +
      "mientras funciona. Las causas habituales en este rango son " +
      "desequilibrio importante, desalineación o aflojamiento del anclaje.",
    accion:
      "Parar en cuanto el proceso lo permita y revisar equilibrado, " +
      "alineación y fijación de la bancada.",
    norma: "ISO 10816-1 Clase I (zona D, > 4,5 mm/s)",
  },
  {
    id: "vibracion-en-aviso",
    titulo: "Vibración fuera de servicio prolongado",
    ambito: "canal",
    necesita: ["vRMS"],
    exigeNorma: true,
    nivel: "atencion",
    cuando: (d) => d.vRMS > LIMITES_ISO.aviso && d.vRMS <= LIMITES_ISO.alarma,
    evidencia: (d) =>
      `Velocidad eficaz ${fmt(d.vRMS, 3)} mm/s: zona C de ISO 10816-1 Clase I ` +
      `(por encima de ${LIMITES_ISO.aviso} mm/s).`,
    consecuencia:
      "Zona C es «insatisfactoria»: la máquina puede seguir funcionando, " +
      "pero no de forma indefinida. Dejarla ahí acorta la vida de los " +
      "rodamientos y del acoplamiento.",
    accion: "Programar intervención. No hace falta parar hoy.",
    norma: "ISO 10816-1 Clase I (zona C, 1,8–4,5 mm/s)",
  },

  /* ── Lo que dice el propio módulo ────────────────────────────── */
  {
    id: "alarma-del-modulo",
    titulo: "El módulo de vibraciones tiene la alarma activa",
    ambito: "canal",
    necesita: ["alarma"],
    exigeNorma: false,
    nivel: "critico",
    cuando: (d) => d.alarma === true,
    evidencia: () =>
      "El SM 1281 ha activado su salida de alarma para este canal.",
    consecuencia:
      "El módulo ha cruzado uno de sus propios umbrales durante el tiempo de " +
      "retardo configurado. No dice CUÁL: puede ser velocidad, aceleración o " +
      "valor de daño.",
    accion:
      "Mirar en el servidor web del módulo qué límite concreto se ha " +
      "superado, y contrastarlo con las medidas de esta pantalla.",
    norma: null,
  },
  {
    id: "aviso-del-modulo",
    titulo: "El módulo de vibraciones tiene el aviso activo",
    ambito: "canal",
    necesita: ["aviso"],
    exigeNorma: false,
    nivel: "atencion",
    cuando: (d) => d.aviso === true && d.alarma !== true,
    evidencia: () => "El SM 1281 ha activado su salida de aviso para este canal.",
    consecuencia:
      "Se ha cruzado el umbral de aviso, que es el que avisa antes de que " +
      "haya daño. Es el momento útil para actuar.",
    accion: "Comprobar qué medida concreta lo ha disparado antes de que suba.",
    norma: null,
  },

  /* ── Lo que impide vigilar ───────────────────────────────────── */
  {
    id: "dkw-sin-referencia",
    titulo: "El valor de daño no tiene referencia aprendida",
    ambito: "canal",
    necesita: [],
    exigeNorma: false,
    nivel: "atencion",
    /*
     * El DKW es la única medida RELATIVA del módulo: compara el estado actual
     * con una referencia que se aprende con la máquina sana. Sin aprendizaje,
     * el tag devuelve calidad mala y aquí llega como `null`.
     *
     * Se comprobó el 25-08-2026: `DKW_S1` sin dato mientras S2 y S3 daban
     * número. O sea que el aprendizaje se hizo en unos canales y no en otros.
     */
    cuando: (d) => !hay(d.DKW),
    evidencia: () =>
      "El servidor no entrega valor de daño para este canal: la referencia " +
      "no está aprendida o el canal no está en modo de monitorización.",
    consecuencia:
      "El valor de daño es la medida que antes detecta un rodamiento que " +
      "empieza a picarse, antes que la velocidad y antes que la aceleración. " +
      "Sin referencia, ese aviso temprano no existe para este apoyo.",
    accion:
      "Dejar el módulo en «RUN: Medir» con la máquina sana, y después pulsar " +
      "«Aplicar» en la configuración DKW de su servidor web. Ojo: si se " +
      "aprende con un rodamiento ya dañado, el daño queda DENTRO de la " +
      "referencia y la vigilancia arranca ciega.",
    norma: "Manual SIPLUS CMS 1200 SM 1281",
  },
  {
    id: "sensor-con-desviacion",
    titulo: "El sensor acusa desviación",
    ambito: "canal",
    necesita: ["offset"],
    exigeNorma: false,
    nivel: "atencion",
    cuando: (d) => Math.abs(d.offset) > 0,
    evidencia: (d) => `Desviación declarada por el módulo: ${fmt(d.offset, 4)}.`,
    consecuencia:
      "Una desviación distinta de cero apunta al montaje o al cableado del " +
      "acelerómetro —base floja, par de apriete insuficiente, alimentación " +
      "IEPE al límite—, no a la máquina. Mientras esté, todas las medidas de " +
      "este canal arrastran el error.",
    accion:
      "Revisar el montaje de la sonda y su cable antes de creerse ninguna " +
      "otra lectura de este canal.",
    norma: null,
  },
  {
    id: "variador-en-fallo",
    titulo: "El variador de esta máquina está en fallo",
    ambito: "maquina",
    necesita: ["fallo"],
    exigeNorma: false,
    nivel: "critico",
    cuando: (d) => d.fallo !== 0,
    evidencia: (d) =>
      `\`FAULT_BMS\` vale ${fmt(d.fallo, 0)}` +
      (hay(d.ultimoFallo) ? ` y el último fallo registrado fue ${fmt(d.ultimoFallo, 0)}` : "") +
      ".",
    consecuencia:
      "Con el variador en fallo, la velocidad publicada puede no " +
      "corresponderse con lo que hace el eje, y toda la evaluación de " +
      "vibración que dependa de ella queda en el aire.",
    accion: "Atender el fallo del variador antes de interpretar las vibraciones.",
    norma: null,
  },

  /* ── Lo que el módulo vigila, y lo que NO ────────────────────── */
  {
    id: "rodamientos-sin-vigilar",
    titulo: "El diagnóstico de rodamientos está apagado",
    ambito: "canal",
    necesita: [],
    exigeNorma: false,
    /*
     * Crítico, y no «conviene mirarlo», aunque nada esté fallando. Lo que está
     * apagado es la única vigilancia que distingue un rodamiento picado de una
     * máquina que simplemente vibra un poco más, y su ausencia no se nota
     * mirando la pantalla: todo lo demás sale en verde exactamente igual.
     */
    nivel: "critico",
    cuando: (d) => rodamientosApagados(d).length > 0,
    evidencia: (d) => {
      const off = rodamientosApagados(d);
      return (
        `${off.length} de 3 vigilancias de rodamiento están sin vigilar en este ` +
        `apoyo: ${off.map((v) => v.corto).join(", ")}.`
      );
    },
    consecuencia:
      "El módulo calcula el espectro de envolvente y sabe mirar las frecuencias " +
      "exactas a las que golpea cada defecto de un rodamiento. Con eso apagado, " +
      "un rodamiento picándose sólo se verá cuando haya subido lo bastante como " +
      "para mover el valor eficaz —y para entonces el daño ya está hecho—.",
    accion:
      "Configurar la geometría del rodamiento en el canal: número de elementos " +
      "rodantes, diámetro medio, diámetro del elemento y ángulo de contacto. Sin " +
      "esos cuatro datos el módulo no puede calcular BPFO, BPFI ni FTF, y por eso " +
      "los deja apagados.",
    norma: null,
  },
  {
    id: "medida-sin-vigilar",
    titulo: "Hay medidas que se publican pero no se vigilan",
    ambito: "canal",
    necesita: [],
    exigeNorma: false,
    nivel: "atencion",
    /*
     * Una medida en la posición «no se vigila» sigue publicando su número, y
     * ese número se pinta igual de bonito. La diferencia es que nadie va a
     * avisar cuando suba.
     */
    cuando: (d) => umbralesApagados(d).length > 0,
    evidencia: (d) =>
      `Se publican pero nadie las compara con un límite: ` +
      `${umbralesApagados(d).map((v) => v.corto).join(", ")}.`,
    consecuencia:
      "El valor aparece en pantalla y parece vigilado. No lo está: si sube, el " +
      "módulo no encenderá ni aviso ni alarma.",
    accion: "Poner umbral a esa medida en el canal, o asumir que es sólo informativa.",
    norma: null,
  },
  {
    id: "vigilancia-en-aviso",
    titulo: "El módulo tiene una vigilancia en aviso o alarma",
    ambito: "canal",
    necesita: [],
    exigeNorma: false,
    nivel: "critico",
    cuando: (d) => vigilanciasDisparadas(d).length > 0,
    evidencia: (d) =>
      vigilanciasDisparadas(d)
        .map((v) => `${v.label}: ${v.estado.label}`)
        .join(". ") + ".",
    consecuencia:
      "El módulo ha cruzado uno de sus propios criterios. A diferencia de las " +
      "banderas generales de alarma y aviso, esto dice QUÉ vigilancia concreta " +
      "se ha disparado.",
    accion:
      "Mirar esa medida en el servidor web del módulo y contrastarla con el " +
      "resto de apoyos antes de tocar nada.",
    /*
     * Las posiciones 2 y 3 del estado nunca se han observado en este servidor:
     * se leen como aviso y alarma por ser el orden natural del enumerado, pero
     * eso está SIN CONFIRMAR contra el manual. Va escrito en la propia tarjeta
     * y no sólo aquí, porque quien la lea tiene que saberlo.
     */
    nota: "La lectura de este estado está deducida, no confirmada contra el manual del SM 1281.",
    norma: null,
  },
  {
    id: "confianza-de-medida-baja",
    titulo: "El módulo desconfía de una de sus medidas",
    ambito: "canal",
    necesita: [],
    exigeNorma: false,
    nivel: "atencion",
    cuando: (d) => confianzasBajas(d).length > 0,
    evidencia: (d) =>
      confianzasBajas(d)
        .map((q) => `${q.label}: ${fmt(q.valor, 3)} (lo normal es ${QC_NOMINAL})`)
        .join(". ") + ".",
    consecuencia:
      "El módulo acompaña cada medida con su propia confianza. Cuando baja, el " +
      "número sigue publicándose igual: no se distingue del bueno mirándolo.",
    accion:
      "Comprobar el montaje de la sonda y que la máquina esté por encima del " +
      "régimen mínimo del módulo antes de creerse esa medida.",
    norma: null,
  },

  /* ── El servidor de alarmas de ICONICS ───────────────────────── */
  {
    id: "alarmas-activas",
    titulo: "El servidor de alarmas tiene alarmas activas en esta área",
    ambito: "maquina",
    necesita: [],
    exigeNorma: false,
    nivel: "critico",
    cuando: (d) => num(d.alarmas?.activasSinReconocer) > 0 || num(d.alarmas?.activasReconocidas) > 0,
    evidencia: (d) => {
      const sin = num(d.alarmas?.activasSinReconocer);
      const con = num(d.alarmas?.activasReconocidas);
      const sev = d.alarmas?.severidadActivas;
      return (
        `${sin + con} alarma(s) activa(s) en «DEMO VIBRACIONES»` +
        (sin ? `, ${sin} sin reconocer` : "") +
        (hay(sev) ? `. Severidad máxima ${fmt(sev, 0)}` : "") +
        "."
      );
    },
    /*
     * Estas alarmas las emite ICONICS con límites puestos por quien conoce el
     * proceso. MANDAN sobre todo lo que deduce esta pantalla: si el servidor
     * dice que hay una alarma, hay una alarma, aunque aquí todo salga en banda.
     */
    consecuencia:
      "Son las alarmas del servidor, no deducciones de esta pantalla: alguien " +
      "les puso límite a conciencia y mandan sobre cualquier cosa que se " +
      "concluya aquí.",
    accion:
      "Abrir el visor de alarmas de ICONICS para ver CUÁLES son. Esta pantalla " +
      "sólo puede contarlas: la API no expone el estado alarma por alarma.",
    nota: "Se lee el contador del área. Cuál de las 57 alarmas configuradas se ha disparado no se puede saber desde aquí.",
    norma: null,
  },
  {
    id: "alarmas-sin-reconocer",
    titulo: "Hay alarmas que dispararon y nadie reconoció",
    ambito: "maquina",
    necesita: [],
    exigeNorma: false,
    /*
     * Informativo, no ámbar: la máquina YA está bien. Lo que queda es la
     * constancia de que pasó algo y nadie lo miró. Pintarlo como problema
     * activo enseñaría a ignorar el color que sí avisa de uno.
     */
    nivel: "informativo",
    cuando: (d) =>
      num(d.alarmas?.normalSinReconocer) > 0 &&
      num(d.alarmas?.activasSinReconocer) === 0 &&
      num(d.alarmas?.activasReconocidas) === 0,
    evidencia: (d) =>
      `${num(d.alarmas?.normalSinReconocer)} alarma(s) de «DEMO VIBRACIONES» ` +
      "dispararon y volvieron a normal sin que nadie las reconociera.",
    consecuencia:
      "La máquina está bien AHORA. Pero algo la sacó de banda mientras nadie " +
      "miraba, y sin reconocerlas no queda constancia de que se revisara qué fue.",
    accion:
      "Revisar y reconocer esas alarmas en el visor de ICONICS, para que la " +
      "próxima vez que aparezca una se distinga de las viejas.",
    norma: null,
  },

  /* ── Comparación entre apoyos ────────────────────────────────── */
  {
    id: "asimetria-entre-apoyos",
    titulo: "Un apoyo vibra mucho más que los demás",
    ambito: "maquina",
    necesita: [],
    exigeNorma: false,
    nivel: "atencion",
    /*
     * Con dos apoyos no se puede comparar: «uno alto» y «otro bajo» son la
     * misma pareja de números, y no hay tercero que desempate. Se declara no
     * evaluable en vez de callar, que es lo que hacía antes de tener esta
     * puerta y no se notaba en la pantalla.
     */
    evaluable: (d) => {
      const conDato = Object.values(d.aRMSPorCanal ?? {}).filter(hay).length;
      return conDato >= 3
        ? { ok: true }
        : { ok: false, porque: `Sólo ${conDato} de ${CANALES.length} apoyos entregan aceleración; hacen falta 3 para comparar.` };
    },
    cuando: (d) => Boolean(peorApoyo(d.aRMSPorCanal)),
    evidencia: (d) => {
      const p = peorApoyo(d.aRMSPorCanal);
      return (
        `${p.label} mide ${fmt(p.valor, 3)} m/s² de aceleración eficaz, ` +
        `${fmt(p.veces, 1)} veces lo que el resto de apoyos de la misma ` +
        `máquina (${fmt(p.referencia, 3)} m/s² de mediana).`
      );
    },
    consecuencia:
      "Una diferencia grande entre apoyos del mismo eje suele ser local: " +
      "rodamiento en mal estado, base floja o desalineación tirando de ese " +
      "lado. Si fuera un problema de toda la máquina, subirían todos.",
    accion:
      "Mirar ese apoyo primero: apriete de la fijación, estado del " +
      "rodamiento y alineación del acoplamiento en ese extremo.",
    /*
     * Sin norma detrás, y dicho aquí para que nadie lo cite como si la
     * tuviera: ISO 10816 acota valores absolutos por máquina, no compara
     * apoyos entre sí. Esto es una convención de mantenimiento.
     */
    norma: null,
  },
];

/* ── Utilidades ─────────────────────────────────────────────────── */

function fmt(v, dec) {
  return hay(v) ? v.toFixed(dec) : "—";
}

/**
 * Las vigilancias de un canal, ya decodificadas y emparejadas con su catálogo.
 *
 * El estado llega decodificado desde la capa de datos —ahí es donde se sabe
 * leer el base64 del módulo—; aquí sólo se agrupa. Las que no tienen estado se
 * descartan: sin lectura no se puede decir ni que está vigilada ni que no.
 */
function vigilanciasDe(datos) {
  return VIGILANCIAS
    .map((v) => ({ ...v, corto: nombreCorto(v), estado: datos?.vigilancias?.[v.key] ?? null }))
    .filter((v) => v.estado !== null);
}

/** Rótulo breve para meter varias en una frase sin que se haga interminable. */
function nombreCorto(v) {
  if (v.grupo === "rodamiento") return v.key.toUpperCase();
  return v.tag.replace("MonState_", "").replace("_", " ");
}

/** Las vigilancias de rodamiento que están apagadas. */
function rodamientosApagados(datos) {
  return vigilanciasDe(datos).filter((v) => v.grupo === "rodamiento" && v.estado.id === "apagado");
}

/**
 * Las vigilancias de umbral y espectro que están apagadas.
 *
 * Las de rodamiento se excluyen porque tienen su propia regla: mezclarlas
 * diluiría la única que importa de verdad en una lista de cinco.
 */
function umbralesApagados(datos) {
  return vigilanciasDe(datos).filter((v) => v.grupo !== "rodamiento" && v.estado.id === "apagado");
}

/** Las que están en aviso o alarma, sean del grupo que sean. */
function vigilanciasDisparadas(datos) {
  return vigilanciasDe(datos).filter((v) => v.estado.id === "aviso" || v.estado.id === "alarma");
}

/**
 * Las medidas cuya confianza se aparta del valor observado con la máquina sana.
 *
 * Se compara con `<` y no con `!==`: una confianza POR ENCIMA del nominal no
 * es un problema, y como la escala exacta está sin confirmar, tratar cualquier
 * desviación como fallo llenaría la pantalla de avisos sobre un número que
 * todavía no sabemos leer del todo.
 */
function confianzasBajas(datos) {
  const q = datos?.calidades ?? {};
  return Object.entries(q)
    .filter(([, v]) => hay(v) && v < QC_NOMINAL)
    .map(([key, valor]) => ({
      key,
      valor,
      label: key.replace("qc", "").toUpperCase(),
    }));
}

/** Mediana, que aguanta un valor disparado mucho mejor que la media. */
function mediana(nums) {
  const orden = [...nums].sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
}

/**
 * El apoyo que se sale, si es que hay uno.
 *
 * Se compara contra la mediana de LOS DEMÁS, no contra la de todos: si se
 * incluye al sospechoso en su propia referencia, él mismo tira de la mediana
 * hacia arriba y se esconde. Con tres canales eso importa de verdad.
 */
function peorApoyo(porCanal) {
  const utiles = Object.entries(porCanal ?? {}).filter(([, v]) => hay(v));
  if (utiles.length < 3) return null;

  let peor = null;
  for (const [id, valor] of utiles) {
    const otros = utiles.filter(([o]) => o !== id).map(([, v]) => v);
    const ref = mediana(otros);
    if (ref <= 0) continue;
    const veces = valor / ref;
    if (veces >= VECES_ASIMETRIA && (!peor || veces > peor.veces)) {
      const canal = CANALES.find((c) => c.id === id);
      peor = { id, label: canal?.label ?? id, valor, referencia: ref, veces };
    }
  }
  return peor;
}

/* ── Evaluación ─────────────────────────────────────────────────── */

/**
 * Evalúa el estado de vibración.
 *
 * `estado` tiene la forma:
 *
 *   {
 *     canales:  { S1: { vRMS, aRMS, aPeak, DKW, alarma, aviso, offset }, ... },
 *     variador: { velocidad, frecuencia, par, potencia, fallo, ultimoFallo },
 *   }
 *
 * Devuelve `{ activos, noEvaluables, evaluadas, normaAplicable, provisional }`.
 *
 * `noEvaluables` no es relleno: es la lista de lo que NO se ha podido mirar.
 * Una pantalla que enseña cinco riesgos apagados y calla que otros tres no se
 * han evaluado transmite una calma que no le corresponde.
 */
export function evaluarRiesgosVibracion(estado) {
  const canales = estado?.canales ?? {};
  const variador = estado?.variador ?? {};

  const velocidad = variador.velocidad;
  /*
   * `null` —y no `false`— cuando no se sabe la velocidad. «No se sabe si la
   * norma aplica» y «la norma no aplica» son cosas distintas, y la segunda
   * apagaría las reglas de ISO en silencio.
   */
  const normaAplicable = hay(velocidad) ? velocidad >= RPM_MINIMA_ISO : null;

  const aRMSPorCanal = Object.fromEntries(
    Object.entries(canales).map(([id, c]) => [id, c?.aRMS]),
  );
  const datosMaquina = { ...variador, aRMSPorCanal, alarmas: estado?.alarmas ?? {} };

  const activos = [];
  const noEvaluables = [];
  let evaluadas = 0;

  for (const regla of REGLAS) {
    const objetivos =
      regla.ambito === "canal"
        ? CANALES.map((c) => ({ canal: c, datos: canales[c.id] ?? {} }))
        : [{ canal: null, datos: datosMaquina }];

    for (const { canal, datos } of objetivos) {
      const faltan = regla.necesita.filter((k) => !hay(datos[k]) && typeof datos[k] !== "boolean");

      if (faltan.length) {
        noEvaluables.push({
          id: regla.id,
          canal: canal?.id ?? null,
          canalLabel: canal?.label ?? null,
          titulo: regla.titulo,
          porque: `Sin dato de ${faltan.join(", ")}.`,
        });
        continue;
      }

      /* Condición propia de la regla, para lo que no se expresa como «falta
         este dato»: por ejemplo, hacen falta tres apoyos para comparar. */
      const propia = regla.evaluable ? regla.evaluable(datos) : { ok: true };
      if (!propia.ok) {
        noEvaluables.push({
          id: regla.id,
          canal: canal?.id ?? null,
          canalLabel: canal?.label ?? null,
          titulo: regla.titulo,
          porque: propia.porque,
        });
        continue;
      }

      /* ISO no se pronuncia por debajo de su banda: la regla no se «apaga»,
         se declara no evaluable, que es lo único honesto. */
      if (regla.exigeNorma && normaAplicable !== true) {
        noEvaluables.push({
          id: regla.id,
          canal: canal?.id ?? null,
          canalLabel: canal?.label ?? null,
          titulo: regla.titulo,
          porque:
            normaAplicable === null
              ? "No se conoce la velocidad, así que no se sabe si ISO 10816 aplica."
              : `A ${fmt(velocidad, 0)} rpm la máquina está por debajo de las ` +
                `${RPM_MINIMA_ISO} rpm desde las que ISO 10816 se pronuncia.`,
        });
        continue;
      }

      evaluadas += 1;
      if (!regla.cuando(datos)) continue;

      activos.push({
        id: regla.id,
        canal: canal?.id ?? null,
        canalLabel: canal?.label ?? null,
        titulo: regla.titulo,
        nivel: regla.nivel,
        evidencia: regla.evidencia(datos),
        consecuencia: regla.consecuencia,
        accion: regla.accion,
        norma: regla.norma ?? null,
        /* Advertencia sobre la propia lectura del dato, cuando la hay. Viaja
           hasta la tarjeta: si el estado está deducido y no confirmado, quien
           lo lea tiene que verlo junto al veredicto, no en el código. */
        nota: regla.nota ?? null,
      });
    }
  }

  const orden = { critico: 0, atencion: 1, informativo: 2 };
  activos.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

  return {
    activos,
    noEvaluables,
    evaluadas,
    normaAplicable,
    /*
     * Mientras el grupo `DEMO 3` no registre, esto vigila el instante y nada
     * más. La marca viaja con el resultado para que la pantalla lo diga en vez
     * de dejar que el usuario suponga que hay tendencia detrás.
     */
    provisional: true,
    sinHistoria: true,
  };
}

/**
 * Pregunta para el asistente sobre un riesgo de vibración.
 *
 * Lleva la evidencia YA MEDIDA dentro del texto, y prohíbe explícitamente lo
 * que un modelo hace solo si no se le dice: poner plazo a la avería. Sin
 * historia no hay tendencia, y sin tendencia no hay «le quedan seis meses».
 */
export function preguntaSobreRiesgoVibracion(riesgo) {
  const donde = riesgo.canalLabel ? ` en el apoyo «${riesgo.canalLabel}»` : "";
  return (
    `En el sistema de vibraciones${donde} se ha detectado: ${riesgo.titulo}.\n\n` +
    `Evidencia medida: ${riesgo.evidencia}\n` +
    `Hipótesis: ${riesgo.consecuencia}\n` +
    (riesgo.norma ? `Criterio: ${riesgo.norma}\n` : "") +
    `\nExplícame qué comprobaría un técnico de mantenimiento, en qué orden y ` +
    `por qué. NO estimes cuántos meses o años tardará en averiarse: este ` +
    `sistema no tiene histórico registrado, sólo lecturas del momento, así ` +
    `que no hay tendencia sobre la que calcular un plazo.`
  );
}
