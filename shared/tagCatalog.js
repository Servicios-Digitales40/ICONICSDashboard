/**
 * Contrato con ICONICS: qué máquinas existen, qué propiedades tiene cada una
 * y cómo se nombra un punto.
 *
 * Derivado del export de configuración unificada, hoja `EquipmentProperty`.
 * Cuando cambie la configuración del servidor se edita este archivo y ninguno
 * más: el resto de la app habla en términos de dominio (`disponibilidad`,
 * `aprobadas`) y nunca de nombres de tag.
 *
 * Ver docs/TAGS.md para la tabla completa Excel → punto → dominio.
 */

/** Raíz del modelo de planta en AssetWorX. */
export const PLANT = "RESONAC";

/**
 * Las 10 máquinas reales. Conviene usar esta lista y no recorrer el árbol de
 * ICONICS, que produce máquinas fantasma e infla los agregados de planta:
 *
 *  - `RESONAC_` (con guión bajo) es un árbol paralelo de navegación de
 *    pantallas; duplica los nombres pero sus nodos están vacíos.
 *  - La numeración de rectificadoras tiene huecos reales: son la 10, la 11
 *    y la 13.
 */
export const AREAS = {
  LIN: { id: "LIN", label: "Lineales", machineIds: ["1", "2", "3", "4", "5", "6", "7"] },
  REC: { id: "REC", label: "Rectificadoras", machineIds: ["10", "11", "13"] },
};

export const AREA_IDS = Object.keys(AREAS);

/** Propiedad de dominio → nombre de la propiedad en AssetWorX. */
export const TAGS = {
  oee: "OEE",
  disponibilidad: "OEE_Disp",
  rendimiento: "OEE_Rend",
  calidad: "OEE_Cal",

  aprobadas: "Pz_OK",
  rechazadas: "Pz_NOK",
  producidas: "Prod_Real_Total",

  estado: "Estado",
  modelo: "Modelo",

  tCiclo: "T_Ciclo",
  tCicloCalc: "T_Ciclo_Calc",
  tCicloTeo: "T_Ciclo_Teo",
  tDispPot: "T_Disp_pot",
  tInacPlan: "T_Inac_plan",
  tMuerto: "T_Muerto_Ico",
};

/**
 * Tags que no existen en todas las áreas.
 *
 * `T_Ciclo_Calc` solo está en las líneas, que calculan el rendimiento como
 * T_Ciclo_Teo/T_Ciclo_Calc; las rectificadoras usan T_Ciclo_Teo/T_Ciclo.
 * Pedir un tag inexistente devuelve un hueco indistinguible de un fallo de
 * lectura, así que no se pide.
 */
const TAGS_POR_AREA = {
  LIN: Object.keys(TAGS),
  REC: Object.keys(TAGS).filter((t) => t !== "tCicloCalc"),
};

/**
 * Subconjunto que basta para las vistas de planta y de área. Pedir los 14
 * tags cuando la pantalla solo muestra el OEE y sus factores duplicaría el
 * tráfico sin enseñar nada más.
 */
export const RESUMEN_TAGS = [
  "oee", "disponibilidad", "rendimiento", "calidad",
  "aprobadas", "rechazadas", "estado", "tMuerto",
];

/**
 * Tags casi estáticos: se refrescan en la cadencia lenta (5 min). `Modelo`
 * cambia con la receta, `T_Disp_pot` es una constante y `T_Inac_plan` se
 * actualiza por turno.
 */
export const TAGS_ESTATICOS = ["modelo", "tDispPot", "tInacPlan"];

/** Etiqueta visible de una máquina. El Excel las llama así en `DisplayName`. */
const ETIQUETA = {
  LIN: (n) => `Lineal ${n}`,
  REC: (n) => `Multi ${n}`,
};

/** Identificador estable y único en toda la app: "LIN/1", "REC/13". */
export const machineKey = (areaId, machineId) => `${areaId}/${machineId}`;

/** Las 10 máquinas, en el orden en que deben mostrarse. */
export function listMachines() {
  return AREA_IDS.flatMap((areaId) =>
    AREAS[areaId].machineIds.map((machineId) => ({
      id: machineKey(areaId, machineId),
      areaId,
      machineId,
      equipo: ETIQUETA[areaId](machineId),
    }))
  );
}

/** Tags disponibles en un área concreta. */
export const tagsForArea = (areaId) => TAGS_POR_AREA[areaId] ?? [];

/**
 * Punto de tiempo real: `ac:RESONAC/LIN/1/OEE`.
 * `ac:` es el espacio de nombres de AssetWorX.
 */
export function pointName(areaId, machineId, tag) {
  return `ac:${PLANT}/${areaId}/${machineId}/${TAGS[tag]}`;
}

/**
 * Punto histórico: `hda:\Configuration\RESONAC\LIN\1:OEE`.
 * Usa otro prefijo y otra sintaxis (contrabarras y dos puntos), así que no
 * se deriva del de tiempo real con un reemplazo.
 */
export function historyPointName(areaId, machineId, tag) {
  return `hda:\\Configuration\\${PLANT}\\${areaId}\\${machineId}:${TAGS[tag]}`;
}

/** Nombre de propiedad → clave de dominio. Se construye una vez. */
const DOMINIO_POR_PROPIEDAD = Object.fromEntries(
  Object.entries(TAGS).map(([dominio, propiedad]) => [propiedad, dominio])
);

/**
 * Inverso de `pointName`: reparte cada valor de la respuesta en lote a su
 * máquina y su campo de dominio.
 *
 * Devuelve `null` ante un punto que no reconozca, para que un cambio en el
 * servidor se vea como dato ausente y no como una asignación al campo
 * equivocado.
 */
export function parsePointName(name) {
  if (typeof name !== "string" || !name.startsWith("ac:")) return null;

  const partes = name.slice(3).split("/");
  if (partes.length !== 4) return null;

  const [plant, areaId, machineId, propiedad] = partes;
  if (plant !== PLANT || !AREAS[areaId]) return null;
  if (!AREAS[areaId].machineIds.includes(machineId)) return null;

  const tag = DOMINIO_POR_PROPIEDAD[propiedad];
  return tag ? { areaId, machineId, tag, id: machineKey(areaId, machineId) } : null;
}
