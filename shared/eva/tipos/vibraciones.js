/**
 * El TIPO de máquina «vibraciones»: lo que vale para CUALQUIER motor vigilado
 * con un SIPLUS CMS SM 1281, no sólo para el que hay montado hoy.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────
 *
 * Porque hoy una máquina se da de alta escribiendo su catálogo entero a mano:
 * 1 154 líneas en `vibraciones/vibraciones.js` y 934 en `riesgosVibracion.js`.
 * De todo eso, la mayor parte NO es de esta instalación — que la velocidad
 * eficaz se mide en mm/s, que la acota ISO 10816-1, que un factor de cresta
 * alto separa un golpe de rodamiento de un ruido de desbalance: eso vale para
 * el siguiente motor igual que para éste.
 *
 * Lo que sí es de esta instalación es `RAIZ_VIB`, que S1 tiene sensibilidad
 * 100,05 mV/g y rodamiento 6205 ZZ, y que S2 es una chumacera sin referencia
 * conocida. Otro motor tendrá otra raíz, otras sensibilidades y puede que otra
 * geometría.
 *
 * Este archivo es la primera mitad. La segunda —la configuración de cada
 * máquina— llega en la F2 del Plan 33.
 *
 * ── LA REGLA QUE HACE QUE ESTO NO SEA UNA COPIA ────────────────────
 *
 * **Aquí no se transcribe nada.** Todo lo que este módulo expone lo IMPORTA de
 * donde ya vivía. Copiar las 18 reglas para «tenerlas en el tipo» crearía dos
 * listas con la misma intención y el riesgo de irse a destiempo — que es
 * exactamente el incidente que `shared/README.md` documenta y que el §2.6 de
 * `CLAUDE.md` existe para no repetir.
 *
 * Así que este archivo es COMPOSICIÓN, no contenido. Su trabajo es decir qué
 * pieza de las que ya hay pertenece al tipo, y eso se ve en que no declara ni
 * un umbral: los importa.
 *
 * ── CÓMO SE LEE LA FRONTERA ────────────────────────────────────────
 *
 * La pregunta que decide de qué lado cae cada cosa es una sola:
 *
 *   «¿Esto seguiría siendo cierto en OTRO motor del mismo tipo?»
 *
 *   sí  → el tipo         vRMS se mide en mm/s · ISO 10816-1 Clase I
 *                         · las 18 reglas · qué es un apoyo
 *   no  → la instancia    su raíz en AssetWorX · sensibilidad 100,05
 *                         · rodamiento 6205 ZZ · su grupo del historiador
 *
 * Las dos rutas de ese ejemplo se movieron el 21-09-2026 —y las dos son de la
 * instancia, que es justo lo que esta frontera predecía—. Por eso aquí ya no
 * se escriben: el tipo no tiene por qué saberlas, y citarlas era la forma de
 * que este archivo caducara con ellas.
 *
 * El mejor ejemplo de que la frontera está bien puesta ya está escrito en el
 * catálogo: S2 declara `rodamiento: null` porque es una chumacera y no sale
 * del catálogo WEG. Si el rodamiento fuese del tipo, ese `null` no se podría
 * expresar — y sin él se calcularían BPFO/BPFI con la geometría de otra pieza.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE ────────────────────────────────────
 *
 * No construye máquinas. No lee disco. No sabe de ICONICS. Es dominio puro
 * (`CLAUDE.md` §2.7) y se prueba en Node sin arrancar nada.
 *
 * Y no cambia el comportamiento de nadie: mientras la F3 no exista, este
 * módulo no lo consume nadie salvo sus pruebas. Es deliberado — F1 es una
 * extracción, y una extracción que cambia lo que hace el programa no se puede
 * distinguir de una regresión.
 */
import {
  BANDERAS,
  CALIDADES,
  CANALES,
  CONTADORES_ALARMA,
  LIMITES_ISO,
  MEDIDAS,
  QC_NOMINAL,
  RPM_BORDE_ISO,
  RPM_MINIMA_ISO,
  RPM_MINIMA_MODULO,
  VARIADOR,
  VIGILANCIAS,
  bandaISO,
  decodificarVigilancia,
  normaAplicableDe,
  peorZonaDe,
} from "../vibraciones/vibraciones.js";
import {
  REGLAS,
  evaluarRiesgosVibracion,
  preguntaSobreRiesgoVibracion,
} from "../vibraciones/riesgosVibracion.js";
import {
  estadoDeVibraciones,
  resumenVibracionesParaAsistente,
} from "../vibraciones/estadoVibraciones.js";
import { valorVibracionDe } from "../vibraciones/simuladorVibraciones.js";

/**
 * ── LOS ROLES: QUÉ PUEDE MEDIR UNA MÁQUINA DE ESTE TIPO ────────────
 *
 * Un «rol» es el papel que juega una variable dentro del tipo, con
 * independencia de cómo se llame su tag en un servidor concreto. `vRMS` es un
 * rol; `ac:TDCON/DEMO_VIBRACIONES/Vibraciones/S1/vRMS` es el punto que lo cumple en ESTA máquina.
 *
 * Es la pieza que hace posible el alta por configuración: al dar de alta un
 * motor, quien configura dice «este punto cumple el rol vRMS del apoyo S1», y
 * con eso las 18 reglas ya saben leerlo. Sin roles, cada máquina nueva
 * obligaría a reescribir las reglas contra sus nombres de tag.
 *
 * ── POR QUÉ `ambito` Y NO UNA LISTA PLANA ──────────────────────────
 *
 * Porque hay dos clases de variable en este tipo y se comportan distinto:
 *
 *   "apoyo"    hay UNA POR SENSOR. Un motor con tres apoyos tiene tres vRMS,
 *              y «vRMS» a secas es ambiguo — es lo que obliga al resolvedor
 *              de nombres a preguntar cuál en vez de elegir.
 *   "maquina"  hay UNA SOLA. La velocidad del variador no es de un apoyo.
 *
 * La distinción no es cosmética: `evaluarRiesgosVibracion` la usa para saber
 * qué reglas evalúa una vez y cuáles una vez por sensor (`ambito` en la forma
 * de una regla), y una configuración que la pierda haría que una regla de
 * apoyo se evaluara una sola vez sobre tres sensores.
 *
 * Se DERIVA de los catálogos, no se transcribe. Una medida nueva en `MEDIDAS`
 * aparece aquí sola.
 */
/**
 * ── POR QUÉ UN ROL SE NOMBRA `familia:clave` Y NO `clave` ──────────
 *
 * Porque la clave sola NO identifica un rol en este tipo, y eso se descubrió
 * midiendo: `aviso` es a la vez una BANDERA de apoyo —el aviso del módulo, uno
 * por sensor— y una clave del VARIADOR —el aviso del variador, uno por
 * máquina—. Son treinta entradas en los cinco catálogos y veintinueve claves
 * distintas.
 *
 * Con un objeto plano indexado por clave, la segunda machaca a la primera **en
 * silencio**: `ROLES.aviso` quedaba con `ambito: "maquina"` mientras
 * `ROLES_REQUERIDOS` seguía pidiéndolo porque las reglas necesitan la bandera
 * de apoyo. Una configuración construida sobre eso mapearía UNA señal de
 * máquina donde las reglas esperan TRES de apoyo, y el diagnóstico saldría
 * evaluando la regla equivocada sobre el dato equivocado — sin error en
 * ningún log.
 *
 * Es el mismo fallo de fondo que `sistemas.js` documenta con `modelo()`: dos
 * cosas distintas que se ven iguales al colapsarlas. Así que no se colapsan.
 *
 * `rolDe(familia, clave)` es el nombre, y `ROLES` va indexado por él.
 */
export const rolDe = (familia, clave) => `${familia}:${clave}`;

export const ROLES = Object.freeze({
  ...Object.fromEntries(
    MEDIDAS.map((m) => [
      rolDe("medida", m.key),
      Object.freeze({
        clave: m.key,
        tag: m.tag,
        ambito: "apoyo",
        familia: "medida",
        label: m.label,
        corto: m.corto,
        unidad: m.unidad,
        decimales: m.decimales,
        escala: m.escala,
        norma: m.norma,
        mide: m.mide,
        /* Con qué palabras lo nombra un manual: lo usa `limites_del_manual`
           para anclar un número a ESTA medida y no a la de al lado. */
        terminosManual: Object.freeze([...(m.terminosManual ?? [])]),
      }),
    ]),
  ),
  ...Object.fromEntries(
    BANDERAS.map((b) => [
      rolDe("bandera", b.key),
      Object.freeze({
        clave: b.key,
        tag: b.tag,
        ambito: "apoyo",
        familia: "bandera",
        label: b.label,
        tipo: b.tipo,
      }),
    ]),
  ),
  ...Object.fromEntries(
    CALIDADES.map((q) => [
      rolDe("calidad", q.key),
      Object.freeze({ clave: q.key, tag: q.tag, ambito: "apoyo", familia: "calidad", label: q.label }),
    ]),
  ),
  ...Object.fromEntries(
    VIGILANCIAS.map((v) => [
      rolDe("vigilancia", v.key),
      Object.freeze({
        clave: v.key,
        tag: v.tag,
        ambito: "apoyo",
        familia: "vigilancia",
        label: v.label,
        grupo: v.grupo,
        /* Sólo las de rodamiento lo traen: es lo que se picaría si la
           vigilancia disparase, y sin ella la frase no dice a qué pieza
           apunta. */
        defecto: v.defecto ?? null,
      }),
    ]),
  ),
  ...Object.fromEntries(
    VARIADOR.map((v) => [
      rolDe("variador", v.key),
      Object.freeze({
        clave: v.key,
        tag: v.tag,
        ambito: "maquina",
        familia: "variador",
        label: v.label,
        unidad: v.unidad ?? null,
        /* Los decimales con que se cita (Plan 39 F2): la frecuencia con dos,
           la velocidad sin ninguno. Sin ellos, una configurada redondeaba el
           variador entero a cero decimales y la escrita a mano no. */
        decimales: v.decimales ?? null,
      }),
    ]),
  ),
});

/** Los roles de un ámbito. Para que la configuración pregunte por apoyo. */
export const rolesDeAmbito = (ambito) =>
  Object.entries(ROLES)
    .filter(([, r]) => r.ambito === ambito)
    .map(([rol]) => rol);

/**
 * Qué roles reclaman una clave. Devuelve una LISTA, nunca el primero.
 *
 * Es el mismo criterio que `sistemasDeSenal()` aplica entre máquinas y por el
 * mismo motivo: `aviso` encaja en dos familias, y elegir una es como se
 * contesta correctamente sobre la señal equivocada. Quien llama pregunta.
 */
export const rolesDeClave = (clave) =>
  Object.entries(ROLES)
    .filter(([, r]) => r.clave === clave)
    .map(([rol]) => rol);

/**
 * Qué roles reclaman un TAG del servidor. La otra puerta del mismo índice.
 *
 * ── POR QUÉ HACEN FALTA LAS DOS (Plan 34 F1) ──────────────────────
 *
 * Porque la clave de dominio y el tag del servidor **no son el mismo texto**,
 * y sólo coinciden por casualidad en una de las cinco familias:
 *
 *   medida     vRMS      → `vRMS`         coinciden
 *   calidad    qcVRMS    → `QC_vRMS`      no
 *   bandera    aviso     → `Warning`      no
 *   variador   velocidad → `SPEED_BMS`    no
 *
 * Quien descubre una máquina desde el árbol tiene el TAG delante —es lo que
 * `browse` devuelve— y no la clave. Preguntando sólo por clave se resolvían
 * 12 de 184 puntos: las doce medidas, justo las que coinciden. El resto caía
 * en «sin rol» y habría ido entero a revisión manual, que es el trabajo que
 * esto existe para ahorrar.
 *
 * Devuelve una LISTA por el mismo motivo que `rolesDeClave`: dos familias
 * pueden reclamar el mismo nombre, y elegir una por su cuenta es contestar
 * correctamente sobre la señal equivocada.
 */
export const rolesDeTag = (tag) =>
  Object.entries(ROLES)
    .filter(([, r]) => r.tag === tag)
    .map(([rol]) => rol);

/**
 * ── LO QUE UNA MÁQUINA DE ESTE TIPO TIENE QUE APORTAR ──────────────
 *
 * Los roles sin los cuales las reglas no pueden decir nada. No son todos los
 * que existen: son los que, si faltan, dejan el diagnóstico ciego.
 *
 * Se derivan del `necesita` de las propias reglas, y esto es lo que impide que
 * la lista mienta: una regla nueva que dependa de un rol nuevo lo añade aquí
 * sola. Escrita a mano, esta lista se quedaría vieja en la primera regla que
 * alguien añadiera — y el fallo sería una máquina dada de alta como completa
 * con reglas que nunca se evalúan.
 *
 * `asimetria-entre-apoyos` declara `necesita: []` porque compara canales
 * dinámicamente; por eso la derivación filtra vacíos en vez de dar por hecho
 * que toda regla declara algo.
 */
export const CLAVES_REQUERIDAS = Object.freeze([
  ...new Set(REGLAS.flatMap((r) => r.necesita ?? [])),
]);

/**
 * Las claves de `necesita`, resueltas a roles.
 *
 * ── LO QUE PASA CUANDO UNA CLAVE ES AMBIGUA, Y POR QUÉ NO SE ELIGE ─
 *
 * `necesita` está escrito con la clave suelta —`"aviso"`, `"vRMS"`— porque las
 * reglas se escribieron cuando sólo había un catálogo y la clave bastaba. Con
 * la colisión de `aviso` (ver `rolDe`) eso deja de bastar: hay que decir SI la
 * regla quiere el aviso del módulo o el del variador.
 *
 * Esto NO se resuelve aquí adivinando. La regla que necesita `aviso` es
 * `fallo-del-variador`, y mirando su `cuando` se ve que lee el del variador —
 * pero deducir eso leyendo el cuerpo de una función es exactamente la clase de
 * inferencia que produce un acierto hoy y un error silencioso cuando alguien
 * edite la regla.
 *
 * Así que las ambiguas se DECLARAN, y el `throw` de abajo obliga a que se
 * declaren: una regla nueva con una clave ambigua no compila hasta que alguien
 * diga cuál quiere. Es la misma disciplina que `validarRegistro()` en
 * `sistemas.js` — mejor que el proceso no arranque.
 */
const DESAMBIGUA = Object.freeze({
  /*
   * La única regla que pide `aviso` es `aviso-del-modulo`, y pide el del
   * MÓDULO POR APOYO — la bandera—, no el del variador.
   *
   * Lo dice su `ambito: "canal"`: se evalúa una vez por sensor, así que el
   * dato que lee es del canal. Su `cuando` lo confirma —compara `d.aviso`
   * contra `d.alarma`, y `alarma` sólo existe como bandera de apoyo—.
   *
   * Queda escrito porque la primera versión de esta línea decía
   * `"variador:aviso"`, por parecido de nombre, y estaba mal. La guarda de
   * abajo la habría dejado pasar: una desambiguación explícita no se comprueba
   * sola. Lo que la cazó fue mirar la regla.
   */
  aviso: "bandera:aviso",
});

/**
 * ¿Concuerda una desambiguación con el ámbito de las reglas que la piden?
 *
 * ── POR QUÉ ESTA COMPROBACIÓN EXISTE ───────────────────────────────
 *
 * Porque una entrada de `DESAMBIGUA` es una afirmación escrita a mano, y la
 * primera que se escribió estaba MAL: decía `variador:aviso` cuando la regla
 * que la pide es `aviso-del-modulo`, de ámbito `canal`. El `throw` de abajo no
 * la habría cazado —sólo dispara ante ambigüedad no resuelta—, y el resultado
 * habría sido una configuración que mapea el aviso del variador donde el
 * diagnóstico espera el del apoyo.
 *
 * Una regla de ámbito `canal` necesita un rol de ámbito `apoyo`; una de ámbito
 * `maquina`, uno de ámbito `maquina`. Eso sí se puede comprobar, y comprobarlo
 * convierte el error de arriba en un arranque fallido en vez de un diagnóstico
 * torcido.
 */
function comprobarDesambiguaciones() {
  const AMBITO_DE_REGLA = { canal: "apoyo", maquina: "maquina" };

  for (const [clave, rol] of Object.entries(DESAMBIGUA)) {
    const declarado = ROLES[rol];
    if (!declarado) {
      throw new Error(
        `tipos/vibraciones.js: DESAMBIGUA["${clave}"] apunta a «${rol}», que no es ningún rol ` +
          `de este tipo. Los que reclaman esa clave son ${rolesDeClave(clave).join(", ")}.`,
      );
    }

    for (const regla of REGLAS) {
      if (!(regla.necesita ?? []).includes(clave)) continue;

      const esperado = AMBITO_DE_REGLA[regla.ambito];
      if (esperado && declarado.ambito !== esperado) {
        throw new Error(
          `tipos/vibraciones.js: la regla «${regla.id}» es de ámbito "${regla.ambito}" y ` +
            `necesita «${clave}», pero DESAMBIGUA la resuelve a «${rol}», que es de ámbito ` +
            `"${declarado.ambito}". Una regla por canal lee el dato del apoyo, no el de la ` +
            "máquina: mapear el otro haría que el diagnóstico evaluara la regla correcta sobre " +
            "el dato equivocado, sin dar error.",
        );
      }
    }
  }
}

comprobarDesambiguaciones();

export const ROLES_REQUERIDOS = Object.freeze(
  CLAVES_REQUERIDAS.map((clave) => {
    if (DESAMBIGUA[clave]) return DESAMBIGUA[clave];

    const candidatos = rolesDeClave(clave);
    if (candidatos.length === 1) return candidatos[0];

    if (candidatos.length === 0) {
      throw new Error(
        `tipos/vibraciones.js: la regla que necesita «${clave}» pide un rol que no existe en ` +
          "ningún catálogo del tipo. O la clave está mal escrita, o falta declararla en " +
          "MEDIDAS/BANDERAS/CALIDADES/VIGILANCIAS/VARIADOR.",
      );
    }

    throw new Error(
      `tipos/vibraciones.js: «${clave}» es ambigua — la reclaman ${candidatos.join(" y ")}. ` +
        "Añádela a DESAMBIGUA diciendo cuál quiere la regla. No se elige por ti: mapear el rol " +
        "equivocado haría que el diagnóstico evaluara la regla correcta sobre el dato de otra " +
        "familia, sin dar error.",
    );
  }),
);

/**
 * ── LOS UMBRALES DEL TIPO ──────────────────────────────────────────
 *
 * Van aquí y no en la configuración porque **son de la norma, no de la
 * máquina**. ISO 10816-1 Clase I pone el aviso en 1,8 mm/s para cualquier
 * motor de hasta 15 kW montado sobre base rígida, no sólo para éste.
 *
 * Que la norma elegida sea la 10816-1 y no la 10816-3 SÍ depende de la
 * potencia, y por eso es una decisión que la instancia hereda del tipo al
 * declararse de este tipo: un motor de 1,5 kW es Clase I. El día que haya que
 * dar de alta uno de 50 kW, eso no es «otra configuración» — es otro tipo, o
 * un tipo con la clase como parámetro. Se decidirá con el caso delante, no
 * ahora.
 */
export const UMBRALES = Object.freeze({
  iso: LIMITES_ISO,
  rpmMinimaIso: RPM_MINIMA_ISO,
  rpmBordeIso: RPM_BORDE_ISO,
  rpmMinimaModulo: RPM_MINIMA_MODULO,
  qcNominal: QC_NOMINAL,
});

/**
 * El tipo, para el índice.
 *
 * ── POR QUÉ LAS FUNCIONES VIAJAN Y NO SÓLO SUS NOMBRES ─────────────
 *
 * Porque un tipo que dijera `reglas: "vibraciones"` obligaría a alguien a
 * resolver ese nombre a un módulo, y añadiría un modo de fallo que hoy no
 * existe: un tipo que apunta a código que ya no está. Viajando la referencia,
 * eso lo caza el `import` — antes de arrancar, y señalando el archivo.
 *
 * Es la misma razón por la que `sistemas.js` declara `puntos()` y `parse()`
 * como funciones y no como nombres de función.
 */
export const TIPO_VIBRACIONES = Object.freeze({
  id: "vibraciones",
  nombre: "Vigilancia de vibraciones",
  descripcion:
    "Motor vigilado por un módulo SIPLUS CMS SM 1281: velocidad y aceleración eficaces, " +
    "aceleración de pico y valor característico de daño en uno o varios apoyos, con su " +
    "variador.",

  roles: ROLES,
  rolesRequeridos: ROLES_REQUERIDOS,
  umbrales: UMBRALES,

  /*
   * ── EL ÍNDICE INVERSO, EN EL OBJETO Y NO SÓLO SUELTO (Plan 34 F1) ─
   *
   * `rolesDeClave` ya existía como export de este módulo. Viaja además aquí
   * porque quien descubre una máquina desde el árbol recibe UN TIPO, no este
   * archivo: el descubridor es genérico y no puede importar el de
   * vibraciones sin dejar de servir para el siguiente.
   *
   * Sigue devolviendo una LISTA, y el descubridor respeta esa cautela: con
   * más de un candidato no propone ninguno.
   */
  rolesDeClave,
  /* La otra puerta del índice: por TAG del servidor, que es lo que tiene
     delante quien descubre desde el árbol. Ver su cabecera. */
  rolesDeTag,

  /*
   * Los apoyos que este tipo reconoce. El descubridor los necesita para
   * partir `vRMS_S1` en clave y canal — el rol es del tipo y no sabe de
   * apoyos, así que el sufijo hay que quitarlo antes de preguntar.
   *
   * Es una propiedad del TIPO y no de la instancia porque la FORMA de los
   * apoyos (que existen, que se nombran con un sufijo) vale para cualquier
   * motor vigilado por un SM 1281. Cuáles tiene el de hoy —tres, con estas
   * sensibilidades— sigue siendo de la instancia, en `CANALES`.
   */
  canales: Object.freeze(CANALES.map((c) => Object.freeze({ id: c.id, sufijo: c.sufijo }))),

  /*
   * Los CONTADORES que publica el área de alarmas de un SM 1281 (Plan 37 F2):
   * su clave en las reglas y el sufijo con que el servidor los nombra
   * (`=ActiveUnackedCount`). Es del tipo porque cualquier área de AlarmWorX
   * publica los mismos cuatro; QUÉ área es la de esta máquina lo dice su
   * configuración. Sin esto, una máquina configurada que marcó sus contadores
   * los guardaba como variables sin rol y `alarmas` iba vacío igual.
   */
  contadoresAlarma: Object.freeze(
    CONTADORES_ALARMA.map((c) => Object.freeze({ key: c.key, sufijo: c.sufijo, nivel: c.nivel ?? null })),
  ),

  /* Las 18 reglas, por referencia. Ver la cabecera: no se copian. */
  reglas: REGLAS,
  evaluarRiesgos: evaluarRiesgosVibracion,
  preguntaSobreRiesgo: preguntaSobreRiesgoVibracion,

  /* La forma común (`estadoMaquina.js`) la construye esta función. */
  estado: estadoDeVibraciones,

  /*
   * ── LA SIMULACIÓN ES DEL TIPO (Plan 40 F0) ─────────────────────
   *
   * El transporte falso da valores a un punto preguntándole a su entrada del
   * registro (`modelo()`). Hasta el 21-09-2026 sólo la máquina escrita a mano
   * sabía simular, porque la física parseaba SUS tags; una configurada de
   * este tipo salía «sin dato» en todo. Con el catálogo retirado (Plan 40) la
   * física tiene que servir a cualquier máquina del tipo, y lo hace por
   * descriptor: `descriptorDe(rol, apoyo)` traduce un rol a lo que la física
   * entiende, y `simular` la llama. Los contadores del área no tienen rol y
   * van por su clave (`contadoresAlarma`); el estado del sensor tampoco, y
   * sin descriptor no se simula: queda como hueco, no como cero.
   */
  /*
   * El vocabulario que se le da al dictado (whisper) cuando se habla de una
   * máquina de este tipo. Estaba en la entrada escrita a mano; es del TIPO
   * porque son las palabras del oficio, no de una máquina concreta (Plan 40
   * F3). Sin él, «lado acople» y «rodamiento» salían deformados.
   */
  vocabulario:
    "vibración, rodamiento, lado acople, lado libre, apoyo, velocidad eficaz, " +
    "aceleración eficaz, valor de daño, DKW, aRMS, vRMS, envolvente, espectro, " +
    "BPFO, BPFI, factor de cresta, variador, milímetros por segundo",

  descriptorDe: (rol, apoyo = null) => {
    const r = ROLES[rol];
    if (!r?.familia || !r?.clave) return null;
    /* Una medida de apoyo sin apoyo declarado no tiene física que simular:
       la física es POR apoyo (S3 vibra más que S1). Hueco, no un valor de
       un apoyo cualquiera. */
    if (r.ambito === "apoyo" && !apoyo) return null;
    return { tipo: r.familia, clave: r.clave, canal: r.ambito === "apoyo" ? apoyo : null };
  },
  simular: (descriptor, ms) => valorVibracionDe(descriptor, ms),

  /*
   * La banda que se dibuja bajo la serie de un rol en un reporte (Plan 39
   * F4). Sólo la velocidad eficaz tiene norma detrás (ISO 10816-1 Clase I):
   * aviso a 1,8 mm/s y alarma a 4,5. Las demás medidas no tienen banda
   * declarada, y pintarles una sería inventar un límite. Misma forma que los
   * `UMBRALES` del tanque (`min`, `avisoMin`, `avisoMax`, `max`) para que
   * `bandaLegible` la lea sin saber de qué máquina viene.
   */
  bandaDe: (rolId) =>
    rolId === rolDe("medida", "vRMS")
      ? Object.freeze({ min: null, avisoMin: null, avisoMax: LIMITES_ISO.aviso, max: LIMITES_ISO.alarma })
      : null,

  /*
   * Cómo se lee un estado de vigilancia, que llega codificado en base64.
   *
   * Viaja en el tipo porque quien reconstruye el dominio de una máquina
   * configurada (`dominioDesdeRoles`, Plan 34 F3) es genérico y no puede
   * importar el módulo de vibraciones sin dejar de servir para otro tipo.
   * Sin esta función, esas claves quedan como HUECO — nunca como «en orden»,
   * que es la lectura que apagaría ocho reglas en silencio.
   */
  decodificarVigilancia,
  resumen: resumenVibracionesParaAsistente,

  /* Criterio de norma, que es del tipo y no de la instalación. */
  bandaISO,
  normaAplicableDe,
  peorZona: peorZonaDe,

  /*
   * ── QUÉ SABE SERVIR ESTE TIPO ──────────────────────────────────
   *
   * No es lo que una máquina concreta servirá: es el techo. Una instalación
   * sin apoyos historizados tendrá `HISTORICAL_DATA` apagado aunque el tipo
   * sepa hacerlo, porque las capacidades de la máquina se DERIVAN de su
   * configuración (Plan 33 §6) y esto sólo dice qué es posible pedirle.
   *
   * `WRITABLE_VARIABLES` no está, y su ausencia es la declaración: este tipo
   * no escribe en la planta. Deny by default (Plan 33 §20).
   */
  capacidadesPosibles: Object.freeze([
    "CURRENT_DATA",
    "HISTORICAL_DATA",
    "ALARMS",
    "DIAGNOSTICS",
    "RAG",
    "PREVIOUS_CASES",
    "VIEW_3D",
  ]),
});

export default TIPO_VIBRACIONES;
