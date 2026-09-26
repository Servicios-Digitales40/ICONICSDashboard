/**
 * De lo MARCADO en el árbol a una configuración de máquina, y de una máquina
 * guardada a lo que hay que marcar. Plan 36 F1–F3.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────
 *
 * La pantalla de configuración enseña tres árboles —tiempo real, historizadas,
 * alarmas— y deja marcar activos y variables. Lo que sale de ahí tiene que ser
 * exactamente lo que `POST /api/maquinas` acepta: assets, variables con su
 * `pointName`, su `historyPointName`, su `assetId` y su `rol`.
 *
 * Esa traducción es dominio, no presentación: decide qué activo es cada
 * variable, qué serie se le propone, qué rol le corresponde y cómo se llama.
 * Una vista que lo hiciera con sus propios `if` estaría decidiendo reglas de
 * negocio (`CLAUDE.md` §4.3), y no se podría probar sin montar React. Aquí se
 * prueba en Node con `verificar-configurar-desde-arbol.mjs`.
 *
 * ── LAS DECISIONES QUE TOMA, CON SU PORQUÉ ────────────────────────
 *
 * **El activo es la carpeta directa bajo la raíz.** `S1`, `V20`, `Jaritza`.
 * Es lo que hay en el árbol (Plan 36 §2.1) y lo que el usuario pidió marcar:
 * «marcar el activo marque todas las variables». Una hoja que cuelgue
 * directamente de la raíz pertenece al activo raíz.
 *
 * **El `assetId` de una variable es su canal si el tipo lo reconoce, y si no
 * su carpeta.** `dominioDesdeRoles` coloca las variables de ámbito `apoyo`
 * buscando `rol@assetId` con el id del canal (`S1`), así que para las que el
 * tipo reconoce hay que respetar ese nombre aunque la carpeta se llamara de
 * otra forma. Es el mismo criterio que `descubrirVariables` en el backend.
 *
 * **El id de la variable es su nombre final**, y si dos hojas de carpetas
 * distintas se llaman igual, la segunda lleva la carpeta delante
 * (`L2/Tension L-N`). Sin esto dos variables compartirían clave y el
 * resolvedor de nombres del asistente contestaría sobre una por la otra.
 *
 * **Todo entra como `acceso: "read"` y `historyVerified: false`.** Lo pone
 * `crearVariable`; aquí no se manda ninguno de los dos. Marcar una variable
 * como escribible es una decisión con consecuencias sobre la planta y no
 * entra en este plan (Plan 36 §5); prometer historia se gana sondeando.
 *
 * **Una variable guardada que ya no está en el árbol se SEÑALA, no se
 * borra.** `compararConArbol` distingue tres casos que desde fuera se ven
 * igual —la variable no aparece—: está (`presentes`), su carpeta se pudo
 * mirar y no está (`ausentes`), su carpeta no se pudo mirar
 * (`sinComprobar`). Colapsar los dos últimos daría de baja media máquina en
 * un corte de red: es `UNKNOWN` ≠ `INVALID` (Plan 33) aplicado variable a
 * variable.
 */
import {
  canalesDe,
  emparejarPorNombre,
  esCarpetaEnVivo,
  nombreDeCarpeta,
  nombreFinal,
  proponerRol,
} from "./arbolIconics.js";
import { aliasLimpios } from "./configuracionMaquina.js";

/**
 * La carpeta directa bajo la raíz de la que cuelga un punto en vivo, o `null`
 * si el punto no está bajo esa raíz.
 *
 *   raíz `ac:TDCON/X/Vibraciones/` + `ac:TDCON/X/Vibraciones/S1/vRMS_S1`
 *   → `{ id: 'S1', pointName: 'ac:TDCON/X/Vibraciones/S1/' }`
 *
 * Una hoja que cuelga directamente de la raíz devuelve la raíz misma como
 * activo: pertenece a ella.
 *
 * @param {string} raiz
 * @param {string} pointName
 */
export function activoDe(raiz, pointName) {
  if (!raiz || typeof pointName !== "string" || !pointName.startsWith(raiz)) return null;
  const resto = pointName.slice(raiz.length);
  const corte = resto.indexOf("/");
  if (corte === -1) {
    return { id: nombreDeCarpeta(raiz), pointName: raiz, esRaiz: true };
  }
  const nombre = resto.slice(0, corte);
  return { id: nombre, pointName: `${raiz}${nombre}/`, esRaiz: false };
}

/**
 * La carpeta inmediata de un punto: `ac:.../S1/vRMS_S1` → `ac:.../S1/`.
 * Para un hijo de un área de alarmas (`ae:/AREA=Contador`), el área.
 *
 * @param {string} pointName
 */
export function carpetaDe(pointName) {
  if (typeof pointName !== "string" || !pointName) return null;
  if (pointName.startsWith("ae:")) {
    const marca = pointName.search(/[=.\\]/);
    return marca === -1 ? pointName : pointName.slice(0, marca);
  }
  const corte = pointName.lastIndexOf("/");
  return corte === -1 ? null : pointName.slice(0, corte + 1);
}

/**
 * Los activos que ofrece una raíz, a partir de sus hijos directos ya leídos.
 *
 * Se separan en dos grupos, y la separación es una PROPUESTA del tipo, no una
 * lista escrita a mano:
 *
 *   reconocidos   al menos una de sus hojas encaja en un rol del tipo
 *   otros         ninguna encaja
 *
 * Con el tipo de vibraciones y el árbol del 21-09-2026: `S1`, `S2`, `S3` y
 * `V20` salen reconocidos; `Jaritza`, `Alarm` y `Pantalla` salen en «otros».
 * Los tres se ofrecen igual —esconder lo que existe es lo que el Plan 34 F1
 * prohíbe— pero no se presentan como activos de la máquina: los dos últimos
 * no lo son (el usuario lo confirmó) y el primero sí, y lo marca una persona.
 * El código no puede distinguir «Jaritza» de «Pantalla»; sí puede decir que el
 * tipo no reconoce ninguna de las dos, y eso es lo que dice.
 *
 * Una carpeta cuyas hojas no se han leído todavía queda en `otros` con
 * `hojas: null`: no se afirma nada sobre lo que no se ha mirado.
 *
 * @param {string} raiz
 * @param {Array<{pointName: string, shortName?: string}>} hijosDeRaiz
 * @param {Map<string, Array<{pointName: string}>>} hijosPorCarpeta  lo leído
 * @param {object|null} tipo
 */
export function activosDesdeRaiz(raiz, hijosDeRaiz, hijosPorCarpeta, tipo) {
  const canales = canalesDe(tipo);
  const reconocidos = [];
  const otros = [];
  const sueltas = [];

  for (const hijo of hijosDeRaiz ?? []) {
    const pointName = hijo?.pointName;
    if (!pointName) continue;
    if (!esCarpetaEnVivo(pointName)) {
      sueltas.push(pointName);
      continue;
    }
    const hojas = hojasBajo(pointName, hijosPorCarpeta);
    const conRol = hojas
      ? hojas.filter((h) => proponerRol(nombreFinal(h), tipo, { canales }).candidatos.length > 0).length
      : 0;
    const activo = {
      id: nombreDeCarpeta(pointName),
      pointName,
      hojas: hojas ? hojas.length : null,
      conRol,
      cargada: hojas !== null,
    };
    (hojas && conRol > 0 ? reconocidos : otros).push(activo);
  }

  /* Las hojas que cuelgan directamente de la raíz son del activo raíz. */
  const raizComoActivo = sueltas.length
    ? {
        id: nombreDeCarpeta(raiz),
        pointName: raiz,
        hojas: sueltas.length,
        conRol: sueltas.filter(
          (h) => proponerRol(nombreFinal(h), tipo, { canales }).candidatos.length > 0,
        ).length,
        cargada: true,
        esRaiz: true,
      }
    : null;

  return { reconocidos, otros, raiz: raizComoActivo };
}

/**
 * Todas las hojas bajo una carpeta, recorriendo lo que YA está leído.
 * Devuelve `null` si alguna carpeta del camino no se ha leído: no se afirma
 * un conteo sobre un árbol a medias.
 *
 * @param {string} carpeta
 * @param {Map<string, Array<{pointName: string}>>} hijosPorCarpeta
 * @returns {string[]|null}
 */
export function hojasBajo(carpeta, hijosPorCarpeta) {
  const hijos = hijosPorCarpeta?.get(carpeta);
  if (!hijos) return null;
  const hojas = [];
  for (const h of hijos) {
    if (!h?.pointName) continue;
    if (esCarpetaEnVivo(h.pointName)) {
      const dentro = hojasBajo(h.pointName, hijosPorCarpeta);
      if (dentro === null) return null;
      hojas.push(...dentro);
    } else {
      hojas.push(h.pointName);
    }
  }
  return hojas;
}

/**
 * Las variables PROPUESTAS para un conjunto de puntos en vivo marcados.
 *
 * Cada una trae lo que `crearVariable` necesita más lo que la pantalla
 * necesita para que una persona la revise: `rolCandidatos` cuando hay más de
 * uno, `procedencia` del emparejamiento, y el `activo` del que cuelga.
 *
 * @param {object} entrada
 * @param {string} entrada.raiz              la raíz en vivo
 * @param {string[]} entrada.marcados         puntos en vivo marcados
 * @param {string[]} entrada.tagsHistoricos   tags del historiador ya leídos
 * @param {Map<string, string|null>} [entrada.emparejamientos]  vivo → tag
 *   decidido A MANO; manda sobre la propuesta por nombre
 * @param {Map<string, string|null>} [entrada.roles]  vivo → rol elegido a
 *   mano (para los ambiguos); manda sobre la propuesta
 * @param {object|null} entrada.tipo
 */
export function proponerVariables({
  raiz,
  marcados,
  tagsHistoricos = [],
  emparejamientos = new Map(),
  roles = new Map(),
  tipo = null,
}) {
  const canales = canalesDe(tipo);
  const { pares, procedencia } = emparejarPorNombre(marcados, tagsHistoricos);

  /* Ids únicos: la segunda hoja con el mismo nombre lleva su carpeta delante. */
  const vistos = new Map();
  for (const p of marcados) {
    const n = nombreFinal(p) ?? p;
    vistos.set(n, (vistos.get(n) ?? 0) + 1);
  }

  return marcados.map((pointName) => {
    const corto = nombreFinal(pointName) ?? pointName;
    const activo = activoDe(raiz, pointName);
    const { rol, candidatos, canal } = proponerRol(corto, tipo, { canales });

    const aMano = emparejamientos.has(pointName);
    const historyPointName = aMano ? emparejamientos.get(pointName) : pares.get(pointName) ?? null;

    return {
      /* Si el nombre se repite, el id es la ruta entera bajo la raíz
         (`Jaritza/L1/Tension`): la carpeta directa no basta cuando la
         repetición está dos niveles más abajo. */
      id: vistos.get(corto) > 1 ? pointName.slice(raiz.length) || corto : corto,
      pointName,
      historyPointName: historyPointName || null,
      /* El canal del tipo manda sobre la carpeta: ver la cabecera. */
      assetId: canal ?? activo?.id ?? null,
      rol: roles.has(pointName) ? roles.get(pointName) : rol,
      rolCandidatos: candidatos,
      procedencia: aMano ? "a-mano" : procedencia.get(pointName),
      activo: activo?.id ?? null,
    };
  });
}

/**
 * La configuración que se manda al servidor, a partir de lo marcado.
 *
 * No trae `historyVerified` ni `acceso`: los pone el servidor con sus valores
 * seguros (`false`, `"read"`), y mandarlos sólo invitaría a creer que sirven
 * de algo. Trae `arboles` —las tres raíces— para poder volver a abrir la
 * máquina donde se configuró (F3).
 *
 * @param {object} entrada
 * @param {{id: string, nombre?: string, tipo: string, plc?: string, cadenciaMs?: number}} entrada.formulario
 * @param {{enVivo: string, historico?: string|null, alarmas?: string|null}} entrada.arboles
 * @param {ReturnType<typeof proponerVariables>} entrada.variables
 * @param {Array<{pointName: string, corto?: string}>} [entrada.contadores]  los
 *   contadores del área de alarmas marcados
 */
/**
 * Las limitaciones escritas a mano, como lista limpia: acepta un arreglo o un
 * texto con una por línea, quita espacios y líneas vacías, y no repite.
 *
 * @param {string[]|string|null|undefined} entrada
 * @returns {string[]}
 */
export function limitacionesLimpias(entrada) {
  const lineas = Array.isArray(entrada) ? entrada : String(entrada ?? "").split(/\r?\n/);
  return [...new Set(lineas.map((l) => String(l ?? "").trim()).filter(Boolean))];
}

/**
 * Lo que quien configura escribió de cada asset —nombre y alias— en la forma
 * del editor: `{ [id]: { nombre, alias } }`, con los alias como texto
 * separado por comas, que es como se escriben. Sólo los assets que tienen
 * algo: sembrar vacíos no aporta nada (Plan 42.5 F6, D15).
 */
export function detallesDeAssets(maquina) {
  /** @type {Record<string, {nombre: string, alias: string}>} */
  const salida = {};
  for (const a of maquina?.assets ?? []) {
    const nombre = a?.nombre ?? "";
    const alias = Array.isArray(a?.alias) ? a.alias.join(", ") : "";
    if (nombre || alias) salida[a.id] = { nombre, alias };
  }
  return salida;
}

/**
 * Las calibraciones guardadas de una máquina, por id de variable y como las
 * edita el formulario (`{ ultima: "AAAA-MM-DD"|"", proxima: … }`); sólo las
 * variables que tienen alguna. Espejo de `detallesDeAssets` para la
 * calibración (Plan 44 §6.1).
 *
 * @param {object|null} maquina
 * @returns {Record<string, {ultima: string, proxima: string}>}
 */
export function calibracionesDeVariables(maquina) {
  /** @type {Record<string, {ultima: string, proxima: string}>} */
  const salida = {};
  for (const v of maquina?.variables ?? []) {
    const c = v?.calibracion;
    if (c && (c.ultima || c.proxima)) salida[v.id] = { ultima: c.ultima ?? "", proxima: c.proxima ?? "" };
  }
  return salida;
}

export function configuracionDesdeMarcas({ formulario, arboles, variables, contadores = [], detallesDeAsset = {}, calibraciones = {} }) {
  const raiz = arboles.enVivo;
  /* Nombre y alias de un asset, si quien configura escribió algo (D15). Un
     asset sin detalle va como siempre: sin campos que nadie pidió. */
  const conDetalle = (asset) => {
    const d = detallesDeAsset?.[asset.id];
    if (!d) return asset;
    const nombre = String(d.nombre ?? "").trim();
    const alias = aliasLimpios(d.alias);
    return { ...asset, ...(nombre ? { nombre } : {}), ...(alias.length ? { alias } : {}) };
  };
  const assets = [
    conDetalle({ id: nombreDeCarpeta(raiz) ?? "raiz", pointName: raiz, rol: "raiz" }),
  ];

  /* Un asset por carpeta marcada, en el orden en que aparecen. */
  const carpetas = new Map();
  for (const v of variables) {
    const activo = activoDe(raiz, v.pointName);
    if (activo && !activo.esRaiz && !carpetas.has(activo.pointName)) {
      carpetas.set(activo.pointName, activo);
    }
  }
  for (const a of carpetas.values()) {
    assets.push(conDetalle({ id: a.id, pointName: a.pointName, rol: "secundario" }));
  }

  const variablesLimpias = variables.map((v) => {
    /* La calibración, si quien configura la escribió para esta variable
       (Plan 44 §6.1). Vacía no viaja: `null` es «sin registro» en toda la cadena. */
    const cal = calibraciones?.[v.id];
    const ultima = String(cal?.ultima ?? "").trim();
    const proxima = String(cal?.proxima ?? "").trim();
    return {
      id: v.id,
      pointName: v.pointName,
      historyPointName: v.historyPointName ?? null,
      assetId: v.assetId ?? null,
      rol: v.rol ?? null,
      ...(ultima || proxima ? { calibracion: { ultima: ultima || null, proxima: proxima || null } } : {}),
    };
  });

  if (arboles.alarmas && contadores.length) {
    const areaId = nombreDeCarpeta(arboles.alarmas) ?? "alarmas";
    assets.push(conDetalle({ id: areaId, pointName: arboles.alarmas, rol: "secundario" }));
    for (const c of contadores) {
      variablesLimpias.push({
        id: nombreFinal(c.pointName) ?? c.pointName,
        pointName: c.pointName,
        historyPointName: null,
        assetId: areaId,
        /* Los contadores no son roles del tipo (Plan 34 F3): van sin rol. */
        rol: null,
      });
    }
  }

  return {
    id: formulario.id,
    nombre: formulario.nombre?.trim() || formulario.id,
    tipo: formulario.tipo,
    ...(formulario.plc ? { plc: formulario.plc } : {}),
    ...(formulario.cadenciaMs ? { cadenciaMs: formulario.cadenciaMs } : {}),
    arboles: {
      enVivo: arboles.enVivo,
      historico: arboles.historico || null,
      alarmas: arboles.alarmas || null,
    },
    assets,
    variables: variablesLimpias,
    /*
     * Lo que quien opera sabe de la instalación y el tablero no puede
     * deducir («el motor gira sin carga acoplada»). Siempre un arreglo,
     * aunque vaya vacío: al editar, vacío significa «borra las mías», y
     * omitirlo significaría «no toques nada». Una por línea en el editor;
     * aquí llegan ya partidas.
     */
    limitaciones: limitacionesLimpias(formulario.limitaciones),
  };
}

/**
 * Las tres raíces de una máquina guardada, para volver a abrirla donde se
 * configuró.
 *
 * Si la máquina las guardó (`arboles`, Plan 36 F2) se usan tal cual. Si no
 * —una configurada por la API antes de este plan— se DERIVAN de lo que sí
 * hay: la raíz es el asset marcado `raiz`, el área el asset que empieza por
 * `ae:`, y el historiador no se puede deducir (los nombres `hda:` no se
 * derivan de nada, B10) así que queda vacío y lo rellena una persona.
 *
 * @param {object} maquina
 */
export function arbolesDe(maquina) {
  const guardados = maquina?.arboles ?? {};
  const assets = maquina?.assets ?? [];
  return {
    enVivo:
      guardados.enVivo ?? assets.find((a) => a?.rol === "raiz")?.pointName ?? null,
    historico: guardados.historico ?? null,
    alarmas:
      guardados.alarmas ??
      assets.find((a) => typeof a?.pointName === "string" && a.pointName.startsWith("ae:"))
        ?.pointName ??
      null,
  };
}

/**
 * Lo que hay que MARCAR para reproducir una máquina guardada en la pantalla.
 *
 * Separa las variables en vivo de los contadores del área, y conserva lo que
 * una persona ya decidió —el punto histórico y el rol— como decisiones a
 * mano, para que abrir y guardar sin tocar nada no cambie la máquina.
 *
 * ── UN ROL AUSENTE NO ES UNA DECISIÓN (Plan 46 F3, 26-09-2026) ─────
 *
 * `roles` sólo lleva las variables que SÍ tienen rol. Antes entraban todas,
 * con `null` las que no lo tenían, y eso las dejaba sin arreglo posible desde
 * la pantalla: el editor pregunta `roles.has(pointName)` para saber si ya se
 * decidió algo, y un `null` guardado respondía «sí, se decidió que ninguno».
 * El desplegable de rol no se ofrecía y la variable se quedaba «sin rol» para
 * siempre.
 *
 * Pasó con `sensado-01`: `DONA_MONOFASICA/LINEA_1` es ambigua —`LINEA_1`
 * existe en las dos donas— y se guardó sin rol. Al reabrir, la pantalla ya no
 * dejaba elegirlo. **El mapa distingue ahora «lo eligió una persona» de «no
 * hay nada elegido»**, que es la distinción que `has()` necesita para
 * significar algo.
 *
 * Quien consuma esto y quiera el rol efectivo debe leer la variable, no este
 * mapa: aquí sólo están las decisiones manuales que mandan sobre la propuesta.
 *
 * @param {object} maquina
 */
export function marcasDe(maquina) {
  const { alarmas } = arbolesDe(maquina);
  const vivos = [];
  const contadores = [];
  const emparejamientos = new Map();
  const roles = new Map();

  for (const v of maquina?.variables ?? []) {
    if (!v?.pointName) continue;
    if (alarmas && v.pointName.startsWith(alarmas)) {
      contadores.push(v.pointName);
      continue;
    }
    vivos.push(v.pointName);
    emparejamientos.set(v.pointName, v.historyPointName ?? null);
    /* Ver la cabecera: sin rol no se anota nada, para que `has()` siga
       queriendo decir «alguien decidió esto». */
    if (v.rol) roles.set(v.pointName, v.rol);
  }

  return { vivos, contadores, emparejamientos, roles };
}

/**
 * Compara las variables de una máquina guardada con el árbol tal como se ha
 * podido leer hoy.
 *
 * ── TRES RESULTADOS, NO DOS ────────────────────────────────────────
 *
 *   presentes     su carpeta se leyó y la variable está
 *   ausentes      su carpeta se leyó y la variable NO está
 *   sinComprobar  su carpeta no se pudo leer: no se sabe
 *
 * Es el criterio de `verificarConfiguracion.mjs` con `UNKNOWN` ≠ `INVALID`,
 * variable a variable. Una ausente se señala para que decida una persona; una
 * sin comprobar no es un veredicto sobre nada.
 *
 * @param {object} maquina
 * @param {Map<string, Array<{pointName: string}>|null>} hijosPorCarpeta  lo
 *   leído por carpeta; `null` como valor significa «se intentó y falló»
 */
export function compararConArbol(maquina, hijosPorCarpeta) {
  const presentes = [];
  const ausentes = [];
  const sinComprobar = [];

  for (const v of maquina?.variables ?? []) {
    if (!v?.pointName) continue;
    const carpeta = carpetaDe(v.pointName);
    const hijos = carpeta ? hijosPorCarpeta.get(carpeta) : undefined;

    if (!hijos) {
      sinComprobar.push(v);
      continue;
    }
    const esta = hijos.some((h) => h?.pointName === v.pointName);
    (esta ? presentes : ausentes).push(v);
  }

  return { presentes, ausentes, sinComprobar };
}
