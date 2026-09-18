/**
 * La forma de una MÁQUINA CONFIGURADA: qué campos tiene, qué la hace válida y
 * qué significa que una parte suya haya dejado de existir en ICONICS.
 * Plan 33 F2.
 *
 * ── EN QUÉ SE DIFERENCIA DE `sistemas.js` ──────────────────────────
 *
 * `sistemas.js` es el REGISTRO: entradas ejecutables con `puntos()`,
 * `parse()`, `modelo()`. Esto es la CONFIGURACIÓN: los datos con los que se
 * construye una de esas entradas. Uno es el resultado; el otro, la materia
 * prima.
 *
 * Mismo reparto que ya separa `manuales.js` (forma, aquí) de
 * `backend/ia/indices/manuales.mjs` (disco, allí). Este archivo no toca disco
 * ni red: es dominio puro (`CLAUDE.md` §2.7) y se prueba en Node sin arrancar
 * nada. Quien lee y escribe `datos/maquinas.json` es
 * `backend/ia/indices/maquinas.mjs`.
 *
 * ── POR QUÉ LA VALIDACIÓN VIVE AQUÍ Y NO EN LA RUTA HTTP ───────────
 *
 * Porque la va a necesitar los dos lados. El backend, para no guardar una
 * configuración rota; y la vista de `Planta > Configuración`, para poder decir
 * qué falta ANTES de enviar — que es la diferencia entre un formulario que
 * guía y uno que rechaza al final sin explicar.
 *
 * Duplicarla sería el incidente que `shared/README.md` documenta: dos copias
 * de la misma regla de negocio, y la segunda quedándose vieja.
 *
 * ── LO QUE ESTA VALIDACIÓN NO PUEDE HACER ──────────────────────────
 *
 * **Comprobar que los puntos existen en ICONICS.** Eso necesita red, y aquí no
 * la hay. Lo hace `backend/lib/verificarConfiguracion.mjs`, y es una
 * comprobación distinta con un resultado distinto: aquí se decide si la
 * configuración está BIEN FORMADA; allí, si además sigue siendo CIERTA.
 *
 * Confundirlas sería grave en la dirección peligrosa: una configuración bien
 * formada que apunta a tags borrados pasaría por buena.
 */
import { SISTEMAS } from "./sistemas.js";

/** Versión del esquema del archivo. Sube cuando cambie la forma en disco. */
export const VERSION_CONFIGURACION = 1;

/**
 * ── LOS CUATRO ESTADOS DE UNA MÁQUINA CONFIGURADA ──────────────────
 *
 * Son cuatro y no tres, y la distinción que justifica el cuarto es la que
 * evita el fallo más caro de esta fase.
 *
 *   VALID     todo lo que declara existe y responde.
 *   DEGRADED  falta algo NO esencial. Funciona, y lo confiesa.
 *   INVALID   falta el asset raíz, o ninguna variable responde.
 *   UNKNOWN   NO SE PUDO COMPROBAR.
 *
 * `UNKNOWN` no es `INVALID`. Que ICONICS esté caído no significa que la
 * máquina haya dejado de existir, y colapsarlos daría de baja la planta entera
 * en un corte de red. Es el mismo principio que `CLAUDE.md` §2.4 aplica a los
 * valores —la ausencia de dato nunca se disfraza de nada— un nivel más arriba:
 * aquí la ausencia de COMPROBACIÓN no se disfraza de comprobación fallida.
 */
export const ESTADO_CONFIGURACION = Object.freeze({
  VALID: "VALID",
  DEGRADED: "DEGRADED",
  INVALID: "INVALID",
  UNKNOWN: "UNKNOWN",
});

export const ESTADOS_CONFIGURACION = Object.freeze(Object.values(ESTADO_CONFIGURACION));

/**
 * ── LA CAPACIDAD DE ACCESO DE UNA VARIABLE ─────────────────────────
 *
 * `read` es el valor por defecto en todas partes, y no por comodidad: es
 * **deny by default** (Plan 33 §20). Una variable cuyo acceso no se declaró es
 * de sólo lectura, nunca al revés.
 *
 * ICONICS **no publica esta capacidad** en `/Data/Browse` —comprobado: el
 * árbol devuelve sólo `pointName`— así que no hay forma de derivarla. Tiene
 * que declararla una persona, y por eso el valor ausente tiene que ser el
 * seguro.
 */
export const ACCESO = Object.freeze({
  READ: "read",
  WRITE: "write",
  READWRITE: "readwrite",
});

export const ACCESOS = Object.freeze(Object.values(ACCESO));

/** ¿Permite escribir este acceso? Sólo dos de los tres. */
export const permiteEscritura = (acceso) =>
  acceso === ACCESO.WRITE || acceso === ACCESO.READWRITE;

/** Un archivo de configuración en blanco. */
export function configuracionVacia() {
  return { version: VERSION_CONFIGURACION, maquinas: [] };
}

/**
 * Una variable nueva, con los valores seguros por defecto.
 *
 * ── LOS DOS NOMBRES DE PUNTO, Y POR QUÉ NO SE DERIVA UNO DEL OTRO ──
 *
 * `pointName` es el valor EN VIVO (`ac:`); `historyPointName` es el ARCHIVO
 * (`hda:`). **No derivan uno del otro por regla fija**, y confundirlos es el
 * defecto B10 de este proyecto: el 09-09-2026 una reorganización del árbol
 * rompió el histórico de doce de las trece ramas del tanque, porque el nombre
 * histórico había dejado de poder deducirse del nombre en vivo.
 *
 * Las dos máquinas de hoy lo demuestran: el tanque nombra su punto histórico
 * con una tabla rama→carpeta, y vibraciones con el grupo `DEMO 3` delante. Por
 * eso `series.punto` es obligatorio en el registro y lanza si falta.
 *
 * Así que aquí se guarda **literal y completo**, nunca un patrón.
 *
 * ── POR QUÉ `historyVerified` ARRANCA EN `false` ───────────────────
 *
 * Porque preguntarle al servidor si una variable está historizada **no basta**:
 * contesta que sí y devuelve la serie de otra. Está medido en las dos
 * máquinas —dos señales del tanque reciben la serie de la temperatura del
 * tanque, y `aPeak_S1` la de `aRMS_S1`— con marcas de tiempo correctas y sin
 * dar error.
 *
 * Una variable con `historyVerified: false` EXISTE y se lee en vivo. Lo que no
 * hace es prometer historia. Sólo pasa a `true` tras un sondeo que compare.
 */
export function crearVariable({
  id,
  pointName,
  historyPointName = null,
  assetId = null,
  rol = null,
  alias = [],
  unidad = null,
  descripcion = null,
  acceso = ACCESO.READ,
}) {
  return {
    id,
    pointName,
    historyPointName: historyPointName || null,
    historyVerified: false,
    assetId: assetId || null,
    rol: rol || null,
    alias: Array.isArray(alias) ? alias.filter(Boolean) : [],
    unidad: unidad || null,
    descripcion: descripcion || null,
    /* Deny by default: lo que no se declara, no se escribe. */
    acceso: ACCESOS.includes(acceso) ? acceso : ACCESO.READ,
    estado: ESTADO_CONFIGURACION.UNKNOWN,
  };
}

/** Un asset nuevo. `rol` distingue la raíz de los demás. */
export function crearAsset({ id, pointName, rol = "secundario", nombre = null }) {
  return { id, pointName, rol, nombre: nombre || null };
}

/**
 * Una máquina configurada nueva.
 *
 * `plc` no tiene valor por defecto y es obligatorio en la validación: es lo
 * que hace funcionar `NO_COMPARTEN`. Dos máquinas con PLC distinto no se
 * correlacionan, y una máquina sin PLC declarado no se puede comparar con
 * ninguna — lo que en la práctica significa que el asistente perdería la
 * defensa que impide cruzar dos instalaciones.
 */
export function crearMaquina(
  { id, nombre, tipo, plc, assets = [], variables = [], cadenciaMs = 5000, limitaciones = [] },
  ahora = new Date(),
) {
  return {
    id,
    nombre: nombre?.trim() || id,
    tipo,
    plc: plc || null,
    assets: assets.map((a) => crearAsset(a)),
    /*
     * ── LAS VARIABLES PASAN POR `crearVariable`, SIEMPRE ───────────
     *
     * Antes se guardaban tal como llegaban, y eso vaciaba los valores por
     * defecto justo donde más importan: una variable creada por HTTP quedaba
     * con `acceso: undefined` y `historyVerified: undefined` en vez de
     * `"read"` y `false`.
     *
     * Hoy `permiteEscritura(undefined)` devuelve `false`, así que no llegó a
     * haber agujero. Pero el deny-by-default tiene que estar **en el dato**,
     * no en que cada lector futuro se acuerde de tratar `undefined` como
     * lectura: el primero que escriba `if (v.acceso !== "read")` para decidir
     * si pide confirmación abriría la puerta sin tocar esta línea.
     *
     * Lo mismo con `historyVerified`: ausente se lee como «no consta», y lo
     * que tiene que constar es que NO está verificada.
     *
     * Lo encontró la prueba de contrato HTTP, no la del dominio — el dominio
     * llamaba a `crearVariable` a mano en sus casos de prueba y por eso no lo
     * veía.
     */
    variables: variables.map((v) => crearVariable(v)),
    cadenciaMs,
    limitaciones: Array.isArray(limitaciones) ? limitaciones : [],
    estado: ESTADO_CONFIGURACION.UNKNOWN,
    creada: ahora.toISOString(),
    revisada: null,
  };
}

/**
 * El archivo tal como llega de disco, con forma garantizada.
 *
 * Nunca lanza: una entrada sin lo mínimo se descarta en vez de propagar
 * `undefined` más adelante. Mismo criterio que `normalizarManifiesto` y que
 * `normalizarAlmacen` en `aprendizaje.js`.
 *
 * ── LO QUE DESCARTAR AQUÍ SIGNIFICA, Y POR QUÉ NO ES SILENCIO ──────
 *
 * Una máquina descartada no aparece, y eso podría parecer un fallo callado.
 * No lo es, porque quien llama recibe la cuenta: `leerConfiguracion()` en el
 * backend compara cuántas entradas traía el archivo con cuántas sobrevivieron
 * y lo registra. Descartar es la respuesta correcta a un JSON a medio escribir;
 * callarlo, no.
 */
export function normalizarConfiguracion(bruto) {
  const maquinas = Array.isArray(bruto?.maquinas) ? bruto.maquinas : [];

  return {
    version: VERSION_CONFIGURACION,
    maquinas: maquinas
      .filter((m) => m && typeof m.id === "string" && typeof m.tipo === "string")
      .map((m) => ({
        ...m,
        assets: Array.isArray(m.assets) ? m.assets : [],
        variables: Array.isArray(m.variables) ? m.variables : [],
        limitaciones: Array.isArray(m.limitaciones) ? m.limitaciones : [],
        estado: ESTADOS_CONFIGURACION.includes(m.estado)
          ? m.estado
          : ESTADO_CONFIGURACION.UNKNOWN,
      })),
  };
}

/** Los ids de sistema que ya están ocupados por el registro escrito a mano. */
const IDS_DEL_REGISTRO = () => SISTEMAS.map((s) => s.id);

/**
 * ¿Está bien formada esta máquina? Devuelve la lista de problemas, vacía si no
 * hay ninguno.
 *
 * ── POR QUÉ DEVUELVE PROBLEMAS Y NO LANZA ──────────────────────────
 *
 * Al revés que `validarRegistro()` en `sistemas.js`, que sí lanza. La
 * diferencia es quién produce el dato: el registro lo escribe un programador y
 * un error suyo es un defecto del código, así que es mejor no arrancar. Una
 * configuración la escribe una persona por una pantalla, y un campo que le
 * falta no es un defecto: es un formulario a medio llenar, y merece una lista
 * de qué corregir, no una excepción.
 *
 * @param {object} maquina
 * @param {object} [ctx]
 * @param {(id: string) => object|null} [ctx.tipoDe]  resolvedor de tipos
 * @param {string[]} [ctx.otrosIds]  ids de OTRAS máquinas ya configuradas
 * @param {string[]} [ctx.otrasRaices]  raíces de OTRAS máquinas
 * @returns {{campo: string, problema: string, aviso?: boolean}[]}
 */
export function problemasDeMaquina(maquina, { tipoDe, otrosIds = [], otrasRaices = [] } = {}) {
  /*
   * `aviso` se declara en el tipo aunque `mal()` no lo ponga: los avisos se
   * empujan aparte, más abajo, y sin esta anotación `tsc` infiere la forma del
   * primer `push` y rechaza el segundo.
   *
   * @type {{campo: string, problema: string, aviso?: boolean}[]}
   */
  const problemas = [];
  const mal = (campo, problema) => problemas.push({ campo, problema });

  if (!maquina || typeof maquina !== "object") {
    return [{ campo: "maquina", problema: "No es un objeto." }];
  }

  /* ── Identidad ─────────────────────────────────────────────────── */

  if (!maquina.id || typeof maquina.id !== "string") {
    mal("id", "Falta el id, que es cómo la nombran los casos previos y el asistente.");
  } else {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(maquina.id)) {
      mal("id", `«${maquina.id}» no es un id válido: minúsculas, dígitos y guiones.`);
    }
    /*
     * Chocar con el registro escrito a mano es un error, no una sustitución.
     * Una configuración que se llamara `tanque` produciría DOS entradas con el
     * mismo id en `SISTEMAS`, y `SISTEMA[id]` devolvería una de las dos sin
     * decir cuál — con los 11 casos previos del tanque apuntando a la que
     * ganara el sorteo.
     */
    if (IDS_DEL_REGISTRO().includes(maquina.id)) {
      mal("id", `Ya hay un sistema declarado en el registro con el id «${maquina.id}».`);
    }
    if (otrosIds.includes(maquina.id)) {
      mal("id", `Ya hay otra máquina configurada con el id «${maquina.id}».`);
    }
  }

  if (!maquina.plc) {
    mal(
      "plc",
      "Falta el PLC. Es lo que permite saber si dos máquinas son instalaciones separadas: " +
        "sin él, la regla que impide cruzarlas no puede aplicarse a ésta.",
    );
  }

  /* ── Tipo ──────────────────────────────────────────────────────── */

  const tipo = typeof tipoDe === "function" ? tipoDe(maquina.tipo) : null;
  if (!maquina.tipo) {
    mal("tipo", "Falta el tipo de máquina.");
  } else if (typeof tipoDe === "function" && !tipo) {
    mal("tipo", `No hay ningún tipo de máquina llamado «${maquina.tipo}».`);
  }

  /* ── Assets ────────────────────────────────────────────────────── */

  const assets = Array.isArray(maquina.assets) ? maquina.assets : [];
  if (!assets.length) {
    mal("assets", "Hace falta al menos un asset.");
  }

  const raices = assets.filter((a) => a?.rol === "raiz");
  if (assets.length && !raices.length) {
    mal("assets", "Ninguno de los assets está marcado como raíz.");
  }

  /*
   * ── EL SOLAPE DE RAÍCES, QUE NO ES UN DETALLE ──────────────────
   *
   * `sistemaDePunto()` devuelve **la primera máquina cuya raíz encaja**. Dos
   * máquinas con raíces que se solapan hacen que los puntos de una se
   * atribuyan a la otra, en silencio y de forma estable: siempre gana la misma,
   * así que ni siquiera parece intermitente.
   *
   * Se compara en los dos sentidos porque cualquiera de las dos contiene a la
   * otra según quién se declare primero.
   */
  for (const a of assets) {
    if (!a?.pointName) {
      mal("assets", "Hay un asset sin pointName.");
      continue;
    }
    for (const otra of otrasRaices) {
      if (a.pointName.startsWith(otra) || otra.startsWith(a.pointName)) {
        mal(
          "assets",
          `La raíz «${a.pointName}» se solapa con «${otra}», que ya es de otra máquina. ` +
            "Los puntos de una se atribuirían a la otra sin dar error.",
        );
      }
    }
  }

  /* ── Variables ─────────────────────────────────────────────────── */

  const variables = Array.isArray(maquina.variables) ? maquina.variables : [];
  if (!variables.length) {
    mal("variables", "Hace falta al menos una variable.");
  }

  const vistos = new Set();
  for (const v of variables) {
    if (!v?.pointName) {
      mal("variables", "Hay una variable sin pointName.");
      continue;
    }
    if (vistos.has(v.pointName)) {
      mal("variables", `El punto «${v.pointName}» está declarado dos veces.`);
    }
    vistos.add(v.pointName);

    if (v.acceso && !ACCESOS.includes(v.acceso)) {
      mal("variables", `«${v.pointName}» declara un acceso desconocido: «${v.acceso}».`);
    }

    /*
     * Prometer historia sin haberla verificado es el fallo que
     * `historyVerified` existe para impedir. Una variable puede declarar su
     * punto histórico antes de sondearlo —es lo normal al configurarla— pero
     * no puede darse por verificada sin él.
     */
    if (v.historyVerified && !v.historyPointName) {
      mal(
        "variables",
        `«${v.pointName}» se declara verificada para historia y no dice con qué punto. ` +
          "El nombre histórico no se deduce del nombre en vivo.",
      );
    }
  }

  /* ── Cobertura de los roles que el tipo necesita ───────────────── */

  if (tipo?.rolesRequeridos?.length) {
    const cubiertos = new Set(variables.map((v) => v.rol).filter(Boolean));
    const faltan = tipo.rolesRequeridos.filter((r) => !cubiertos.has(r));

    /*
     * Esto NO invalida la máquina, y la diferencia importa: una instalación
     * puede no tener variador, y entonces las reglas que lo necesitan
     * simplemente no se evalúan. Lo que no puede pasar es que eso se calle —
     * una máquina que no evalúa la mitad de sus reglas y no lo dice se lee como
     * una máquina sana.
     *
     * Por eso sale como AVISO y acaba en `limitaciones`, que es el campo cuyo
     * contrato ya dice que es «lo que hay que confesar al contestar».
     */
    if (faltan.length) {
      problemas.push({
        campo: "variables",
        aviso: true,
        problema:
          `Sin estos roles, las reglas que los necesitan no se evaluarán: ${faltan.join(", ")}. ` +
          "La máquina es válida, pero tiene que declararlo en sus limitaciones.",
      });
    }
  }

  return problemas;
}

/** ¿Está bien formada? Los avisos no invalidan. */
export function maquinaValida(maquina, ctx) {
  return problemasDeMaquina(maquina, ctx).every((p) => p.aviso === true);
}

/**
 * Las raíces de una máquina configurada: los `pointName` de sus assets.
 *
 * Es lo que se le pasa a `problemasDeMaquina` como `otrasRaices` al validar la
 * siguiente, y lo que acabará en `raices` de su entrada del registro.
 */
export function raicesDe(maquina) {
  return (maquina?.assets ?? []).map((a) => a?.pointName).filter(Boolean);
}

/**
 * Las capacidades DERIVADAS de una configuración.
 *
 * ── POR QUÉ SE DERIVAN Y NO SE DECLARAN ────────────────────────────
 *
 * Porque una capacidad declarada a mano que no se cumple es exactamente el
 * fallo de «una máquina que contesta y no dice nada»: el tablero ofrecería
 * histórico de una máquina sin series, y el error aparecería al pulsar, no al
 * configurar.
 *
 * La excepción es `WRITABLE_VARIABLES`, que **no se deriva nunca**: derivarla
 * sería asumir que se puede escribir. Sale de que alguien lo haya declarado
 * variable por variable, que es deny by default (§20).
 */
export function capacidadesDe(maquina, tipo = null) {
  const variables = maquina?.variables ?? [];
  const capacidades = [];

  if (variables.length) capacidades.push("CURRENT_DATA");

  /* Sólo las VERIFICADAS. Una serie prometida y no comprobada puede ser la de
     otra señal — ver `crearVariable`. */
  if (variables.some((v) => v.historyVerified && v.historyPointName)) {
    capacidades.push("HISTORICAL_DATA");
  }

  if (tipo?.reglas?.length) capacidades.push("DIAGNOSTICS");

  if (variables.some((v) => permiteEscritura(v.acceso))) {
    capacidades.push("WRITABLE_VARIABLES");
  }

  /* Filtrado por lo que el tipo sabe servir: una máquina no puede tener una
     capacidad que su tipo no implementa. */
  const posibles = tipo?.capacidadesPosibles ?? null;
  return Object.freeze(
    capacidades.filter((c) => c === "WRITABLE_VARIABLES" || !posibles || posibles.includes(c)),
  );
}
