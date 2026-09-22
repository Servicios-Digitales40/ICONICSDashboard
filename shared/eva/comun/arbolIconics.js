/**
 * Lo que se puede decir del árbol de ICONICS SIN recorrerlo: cómo se nombra
 * un nodo, qué es carpeta y qué es hoja en cada uno de los tres espacios, y
 * cómo se PROPONE un emparejamiento entre el valor en vivo y su serie.
 * Plan 36 F1.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ EN `shared/` ─────────────────────────
 *
 * Hasta el 21-09-2026 estas reglas vivían en `backend/lib/descubrirDesdeArbol.mjs`,
 * pegadas al recorrido por red. La pantalla de configuración (Plan 36) las
 * necesita también: tiene delante los mismos nodos que devuelve `browse` y
 * tiene que decidir lo mismo —cuál es carpeta, cuál tag coincide con cuál
 * punto, qué hijo de un área es contador y cuál es acción—.
 *
 * Reescribirlas en el tablero habría sido tener dos copias de la misma regla
 * de negocio, que es el incidente que `shared/README.md` documenta y que
 * `CLAUDE.md` §2.6 existe para no repetir. Así que se mueven aquí, una sola
 * vez, y el descubridor del backend las importa igual que la pantalla.
 *
 * Nada de esto toca red: recibe nombres y nodos ya leídos y devuelve
 * decisiones. El recorrido —que sí necesita `browse`— sigue en el backend.
 *
 * ── LOS TRES ESPACIOS DE NOMBRES, QUE NO SON INTERCAMBIABLES ──────
 *
 *   ac:   el valor EN VIVO      `ac:TDCON/DEMO_VIBRACIONES/Vibraciones/S1/vRMS_S1`
 *                               carpeta = termina en `/`
 *   hda:  el ARCHIVO            `hda:\Configuration\DEMO_VIBRACIONES\S1:vRMS_S1`
 *                               carpeta = termina en `\` · tag = lleva `:` tras la última `\`
 *   ae:   las ALARMAS           `ae:/DEMO VIBRACIONES=ActiveUnackedCount`
 *                               el prefijo del nombre corto dice qué es cada hijo
 *
 * Confundirlos es el incidente B10 (09-09-2026): una reorganización rompió el
 * histórico de doce de trece ramas porque el nombre `hda:` había dejado de
 * poder deducirse del nombre `ac:`. **No derivan uno del otro por regla
 * fija.** Por eso aquí el emparejamiento se PROPONE por coincidencia del
 * nombre final y nunca se inventa.
 */

/** Separador de carpeta del historiador. `hda:` usa contrabarra, `ac:` barra. */
export const BARRA_HDA = String.fromCharCode(92);

/**
 * El nombre final de un punto, sea del árbol que sea.
 *
 *   `ac:TDCON/.../S1/vRMS_S1`                → `vRMS_S1`
 *   `hda:\Configuration\DEMO_VIB\S1:vRMS_S1` → `vRMS_S1`
 *   `ae:/DEMO VIBRACIONES=ActiveUnackedCount` → `ActiveUnackedCount`
 *
 * Es lo único que se compara para PROPONER un emparejamiento. No se
 * normalizan mayúsculas ni se quitan espacios a propósito: dos nombres que
 * sólo se parecen no son el mismo punto, y afinar la coincidencia aquí sería
 * empezar a adivinar. Lo que no case exacto lo resuelve una persona.
 *
 * @param {string} pointName
 * @returns {string|null}
 */
export function nombreFinal(pointName) {
  if (typeof pointName !== "string" || !pointName) return null;
  const trasDosPuntos = pointName.includes(":")
    ? pointName.slice(pointName.lastIndexOf(":") + 1)
    : pointName;
  /* `=` es el marcador de contador en un área de alarmas. */
  const trasIgual = trasDosPuntos.includes("=")
    ? trasDosPuntos.slice(trasDosPuntos.lastIndexOf("=") + 1)
    : trasDosPuntos;
  const trozos = trasIgual.split(/[/\\]/);
  return trozos[trozos.length - 1] || null;
}

/**
 * El nombre de una CARPETA, que `nombreFinal` no sabe dar porque termina en
 * separador: `ac:TDCON/DEMO_VIBRACIONES/Vibraciones/` → `Vibraciones`.
 *
 * Vale también para un área de alarmas (`ae:/DEMO VIBRACIONES` →
 * `DEMO VIBRACIONES`) y para una carpeta del historiador.
 *
 * @param {string} pointName
 * @returns {string|null}
 */
export function nombreDeCarpeta(pointName) {
  if (typeof pointName !== "string" || !pointName) return null;
  const sinCola = pointName.replace(/[/\\]+$/, "");
  return nombreFinal(sinCola);
}

/**
 * ¿Es un nodo del SISTEMA, no de la planta? En `ac:` el servidor cuelga de
 * cada carpeta un `.Attributes` (medido el 21-09-2026: `class: 1`, sin barra
 * final) que no es ni carpeta ni señal. Se filtra al pintar y al marcar, igual
 * que hace el explorador de Assets.
 *
 * SÓLO en `ac:`: en un área de alarmas (`ae:`) el punto delante del nombre
 * corto es la marca de ALARMA, no de nodo de sistema (ver `clasificarArea`).
 */
export const esNodoDeSistema = (nodo) =>
  typeof nodo?.pointName === "string" &&
  nodo.pointName.startsWith("ac:") &&
  typeof nodo?.shortName === "string" &&
  nodo.shortName.startsWith(".");

/** ¿Es una carpeta del árbol en vivo? En `ac:` las carpetas terminan en `/`. */
export const esCarpetaEnVivo = (pointName) =>
  typeof pointName === "string" && pointName.endsWith("/");

/**
 * ¿Es un TAG del historiador? Lleva `:` después de la última contrabarra:
 * `hda:\Configuration\DEMO_VIBRACIONES\S1:vRMS_S1`.
 *
 * El `:` del esquema (`hda:`) no cuenta: `hda:\Configuration` es una carpeta.
 * La forma del nombre manda, y la clase del nodo (`class: 1` para carpetas)
 * sólo refuerza: no todos los árboles la publican.
 */
export function esTagHistorico(pointName) {
  if (typeof pointName !== "string" || !pointName.startsWith("hda:")) return false;
  const dosPuntos = pointName.lastIndexOf(":");
  if (dosPuntos <= "hda".length) return false;
  return dosPuntos > pointName.lastIndexOf(BARRA_HDA);
}

/**
 * ¿Es una carpeta del historiador? Todo nodo `hda:` que no sea un tag.
 *
 * ── LAS CARPETAS DEL HISTORIADOR NO TERMINAN EN `\` (medido 21-09-2026) ──
 *
 * `browse` de `hda:\Configuration\DEMO_VIBRACIONES` devuelve
 * `hda:\Configuration\DEMO_VIBRACIONES\S1` —sin contrabarra final— y pedir
 * la misma carpeta CON contrabarra final da **500**. Es al revés que en
 * `ac:`, donde la carpeta lleva la barra. Una regla «carpeta = termina en
 * separador» valía para un árbol y rompía el otro, y por eso aquí se define
 * por exclusión: lo que no es tag, es carpeta.
 *
 * Se tolera la contrabarra final por si alguien la escribe —el catálogo
 * escrito a mano la lleva en `GRUPO_HISTORIADOR`— pero al EXPLORAR hay que
 * quitarla: ver `normalizarRaizHistorica`.
 */
export const esCarpetaHistorica = (pointName) =>
  typeof pointName === "string" && pointName.startsWith("hda:") && !esTagHistorico(pointName);

/**
 * Una raíz del historiador tal como la acepta `browse`: sin contrabarra final.
 *
 * `hda:\Configuration\DEMO_VIBRACIONES\` → `hda:\Configuration\DEMO_VIBRACIONES`
 *
 * @param {string} ruta
 */
export function normalizarRaizHistorica(ruta) {
  if (typeof ruta !== "string") return ruta;
  const limpia = ruta.trim().replace(/\\+$/, "");
  return limpia;
}

/**
 * La carpeta hermana en el historiador de una carpeta en vivo, POR NOMBRE.
 *
 *   raíz `hda:\Configuration\DEMO_VIBRACIONES` + carpeta `S1`
 *   → `hda:\Configuration\DEMO_VIBRACIONES\S1`
 *
 * Es una PROPUESTA de dónde mirar, no una afirmación de que exista: quien la
 * use tiene que explorarla y aceptar que el servidor conteste que no.
 *
 * @param {string} raizHistorico
 * @param {string} nombreCarpeta
 */
export function carpetaHistoricaHermana(raizHistorico, nombreCarpeta) {
  if (!raizHistorico || !nombreCarpeta) return null;
  return `${normalizarRaizHistorica(raizHistorico)}${BARRA_HDA}${nombreCarpeta}`;
}

/**
 * ── LOS TRES TIPOS DE HIJO DE UN ÁREA DE ALARMAS ───────────────────
 *
 * Sondeada `ae:/DEMO VIBRACIONES` el 21-09-2026: 57 hijos, y no son lo mismo
 * ni de lejos.
 *
 *   42  alarmas    `.Alarm_MonState_vRMS`, `.Error interno`…
 *    6  contadores `=ActiveUnackedCount`, `=NormalUnackedCount`…
 *    9  acciones   `\Acknowledge`, `\Silence`, `\ShelvedOn`…
 *
 * El prefijo del nombre corto es lo que los distingue, y es del servidor.
 *
 * **Los contadores leen; las alarmas individuales no** (medido: calidad
 * 2147483682, mala, sin `value`). Por eso las alarmas viajan con `lee: false`
 * y las acciones no se proponen para nada: son escrituras, y la escritura es
 * deny by default (Plan 33 §20). Se listan para que quien configure sepa que
 * existen, no para activarlas.
 *
 * @param {Array<{pointName?: string, shortName?: string}>} hijos
 */
export function clasificarArea(hijos) {
  const contadores = [];
  const alarmas = [];
  const acciones = [];

  for (const hijo of hijos ?? []) {
    const corto = hijo?.shortName ?? "";
    const pointName = hijo?.pointName;
    if (!pointName) continue;

    if (corto.startsWith("=")) {
      contadores.push({ pointName, corto, lee: true });
    } else if (corto.startsWith(BARRA_HDA)) {
      acciones.push({ pointName, corto });
    } else if (corto.startsWith(".")) {
      /*
       * `lee: false` medido, no supuesto. Si algún día el servidor empieza a
       * entregarlas, esto se descubre sondeando —igual que `historyVerified`—
       * y no cambiando esta marca a mano.
       */
      alarmas.push({ pointName, corto, lee: false });
    }
  }

  return { contadores, alarmas, acciones };
}

/**
 * Propone el emparejamiento `ac:` ↔ `hda:` por coincidencia del nombre final.
 *
 * ── LO QUE DEVUELVE, Y POR QUÉ CADA PARTE ──────────────────────────
 *
 *   pares        vivo → tag propuesto, o `null` si no hay
 *   procedencia  vivo → por qué se propuso eso:
 *                  `nombre-coincide`          un solo tag con ese nombre
 *                  `ambiguo-en-historiador`   dos o más tags con ese nombre:
 *                                             NO se propone ninguno
 *                  `sin-historico`            ningún tag con ese nombre
 *   sinEmparejar los tags que nadie reclamó
 *
 * La ambigüedad no se resuelve, se declara: proponer uno de dos sería elegir
 * al azar por la máquina. Y lo que el historiador publica y nadie reclamó no
 * se descarta en silencio: puede ser una señal que la máquina debería
 * declarar y no declara.
 *
 * @param {string[]} vivos       nombres de punto en vivo
 * @param {string[]} historicos  nombres de tag del historiador
 */
export function emparejarPorNombre(vivos, historicos) {
  const porNombre = new Map();
  const ambiguos = new Set();
  for (const tag of historicos ?? []) {
    const clave = nombreFinal(tag);
    if (!clave) continue;
    if (porNombre.has(clave)) ambiguos.add(clave);
    porNombre.set(clave, tag);
  }

  const pares = new Map();
  const procedencia = new Map();
  const reclamados = new Set();

  for (const vivo of vivos ?? []) {
    const clave = nombreFinal(vivo);
    if (clave && ambiguos.has(clave)) {
      pares.set(vivo, null);
      procedencia.set(vivo, "ambiguo-en-historiador");
      continue;
    }
    const tag = clave ? (porNombre.get(clave) ?? null) : null;
    pares.set(vivo, tag);
    procedencia.set(vivo, tag ? "nombre-coincide" : "sin-historico");
    if (tag) reclamados.add(tag);
  }

  return {
    pares,
    procedencia,
    sinEmparejar: (historicos ?? []).filter((tag) => !reclamados.has(tag)),
  };
}

/**
 * Qué rol del tipo cumple un punto, PROPUESTO por su nombre.
 *
 * ── POR QUÉ ESTO IMPORTA MÁS QUE EL RESTO ──────────────────────────
 *
 * Porque el rol es lo que conecta una variable con las reglas. Sin rol,
 * `vRMS_S1` es un número con nombre; con `medida:vRMS` en el apoyo `S1`, las
 * 18 reglas del tipo saben qué es y pueden evaluarlo.
 *
 * ── LA AMBIGÜEDAD NO SE RESUELVE, SE DECLARA ─────────────────────
 *
 * `rolesDeClave()` devuelve una LISTA a propósito: `aviso` encaja en dos
 * familias —bandera de apoyo y aviso del variador—, «y elegir una es como se
 * contesta correctamente sobre la señal equivocada». Con más de un candidato
 * **no se propone ninguno** y se devuelven todos para que decida una persona.
 *
 * ── SE PREGUNTA POR TAG, NO POR CLAVE ────────────────────────────
 *
 * La clave de dominio y el tag del servidor sólo coinciden en una de las
 * cinco familias (`vRMS`↔`vRMS` sí; `qcVRMS`↔`QC_vRMS`, `aviso`↔`Warning`,
 * `velocidad`↔`SPEED_BMS` no). `browse` devuelve el TAG. Preguntando sólo por
 * clave se resolvían 12 de 184 (Plan 34 F1); se pregunta por las dos puertas.
 *
 * El sufijo de canal se quita antes: el rol es del TIPO y no sabe de apoyos.
 * `QC_vRMS_S1` → tag `QC_vRMS`, canal `S1`.
 *
 * @param {string} corto  el nombre final del punto
 * @param {object|null} tipo  el tipo de máquina (`tipoDe(id)`)
 * @param {{canales?: string[]}} [opciones]  sufijos de canal que el tipo conoce
 */
export function proponerRol(corto, tipo, { canales = [] } = {}) {
  const nada = { rol: null, candidatos: [], canal: null };
  if (!tipo?.roles || !corto) return nada;

  const porTag = typeof tipo.rolesDeTag === "function" ? tipo.rolesDeTag : null;
  const porClave = typeof tipo.rolesDeClave === "function" ? tipo.rolesDeClave : null;
  /* Sin índice del tipo no se adivina: el catálogo de roles es suyo. */
  if (!porTag && !porClave) return nada;

  /*
   * ¿Termina en el sufijo de algún canal declarado? Los más largos primero:
   * `S1` y `S11` convivirían mal con una comparación ingenua.
   *
   * La comparación IGNORA mayúsculas y trata el espacio como el guión bajo,
   * igual que el índice de roles del tipo (22-09-2026). Sin esto, `VRMS_s1`
   * resolvía el rol pero se quedaba sin canal, y esa media resolución es peor
   * que ninguna: la señal entra sin apoyo y las reglas por apoyo no la ven.
   *
   * El canal que se DEVUELVE es el declarado por el tipo (`S1`), no el que
   * traía el nombre (`s1`): quien lo recibe lo usa como `assetId`, y dos
   * grafías del mismo apoyo partirían la máquina en dos.
   */
  const sufijos = [...canales].sort((a, b) => b.length - a.length);
  const cortoComparable = corto.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const canal =
    sufijos.find((s) => cortoComparable.endsWith(`_${String(s).toLowerCase()}`)) ?? null;
  const sinCanal = canal ? corto.slice(0, -(String(canal).length + 1)) : corto;

  /* Cuatro intentos, y los cuatro hacen falta: por tag y por clave, con y sin
     el sufijo. Los tags del variador lo llevan DENTRO (`SPEED_BMS`). */
  const candidatos = [
    ...new Set([
      ...(porTag?.(sinCanal) ?? []),
      ...(porTag?.(corto) ?? []),
      ...(porClave?.(sinCanal) ?? []),
      ...(porClave?.(corto) ?? []),
    ]),
  ];

  return {
    rol: candidatos.length === 1 ? candidatos[0] : null,
    candidatos,
    canal,
  };
}

/** Los sufijos de canal de un tipo, para `proponerRol`. */
export const canalesDe = (tipo) =>
  (tipo?.canales ?? []).map((c) => c.sufijo ?? c.id).filter(Boolean);
