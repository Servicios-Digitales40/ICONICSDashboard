/**
 * El catálogo de manuales de planta: qué archivos hay, de qué sistema, en qué
 * versión y si siguen activos. Plan 16 Fase 1.
 *
 * ── EN QUÉ SE DIFERENCIA DE `backend/ia/indices/documentos.mjs` ────────────
 *
 * Ese archivo es el ÍNDICE: lee lo que hay en la carpeta y construye BM25 +
 * embeddings sobre ello, sin saber nada de quién subió qué ni de qué máquina
 * habla cada manual. Este es el CATÁLOGO: el manifiesto que asocia cada
 * archivo con su sistema, su título para humanos, su versión y si sigue
 * activo. El índice lee la carpeta entera a ciegas; el catálogo es lo que
 * sabe contar la historia de cómo llegó cada archivo ahí.
 *
 * Vive en `shared/` y no en `backend/` porque su forma —qué campos tiene un
 * manual, qué estados admite, qué hace válido un `sistema`— es una regla de
 * negocio, no E/S: `backend/ia/indices/manuales.mjs` es quien lee y escribe el
 * manifiesto en disco, apoyándose en las funciones puras de aquí. Mismo
 * reparto que `aprendizaje.js` (forma) y `herramientas/aprendizaje/index.mjs`
 * (disco).
 *
 * ── POR QUÉ LAS EXTENSIONES VIVEN AQUÍ Y NO EN `documentos.mjs` ────
 *
 * Antes eran dos listas —`SOPORTADAS` en el índice, y la que hubiera escrito
 * la ruta de subida— con la misma intención y el riesgo de irse a destiempo:
 * alguien añade `.rtf` a una y se le olvida la otra, y entonces o se aceptan
 * subidas que el índice no sabe leer, o se rechazan archivos que sí sabría.
 * Una sola lista, usada por los dos lados.
 */
import { SISTEMAS } from "./sistemas.js";

/**
 * Extensiones que el índice de documentación sabe extraer. La misma lista que
 * usaba `SOPORTADAS` en `documentos.mjs`, ahora declarada una sola vez.
 */
export const EXTENSIONES_MANUAL = Object.freeze([".txt", ".md", ".csv", ".log", ".pdf", ".docx"]);

/**
 * El nombre del manifiesto, DENTRO de la carpeta de manuales — nunca en
 * `datos/`, ver la cabecera de `backend/ia/indices/manuales.mjs`.
 *
 * Vive aquí, en `shared/`, y no en `backend/ia/indices/manuales.mjs` —que es quien
 * lee y escribe el archivo— porque `backend/ia/indices/documentos.mjs` (Plan 17
 * Fase 3a, G7) también necesita saberlo, para leer qué `sistema` tiene cada
 * manual y aislar el RAG documental igual que `casos.mjs` ya aísla el de
 * casos. `documentos.mjs` no puede importarlo de `manuales.mjs` sin crear un
 * ciclo: `manuales.mjs` ya importa `MAX_BYTES` de `documentos.mjs`.
 */
export const NOMBRE_MANIFIESTO = ".manifiesto.json";

/**
 * `activo` se indexa y aparece en las respuestas del asistente. `archivado`
 * sigue en disco —Fase 1 no borra nada, ver la cabecera de
 * `backend/ia/indices/manuales.mjs`— pero se mueve fuera de la carpeta que lee el
 * índice, así que deja de contestar preguntas sin perder el archivo.
 */
export const ESTADOS_MANUAL = Object.freeze(["activo", "archivado"]);

/** Forma vacía del manifiesto, para cuando el archivo aún no existe. */
export const VACIO = Object.freeze({ version: 1, manuales: Object.freeze([]) });

/**
 * Un manifiesto en blanco NUEVO.
 *
 * `Object.freeze` es superficial: `{ ...VACIO }` seguía compartiendo el
 * arreglo `manuales`, así que un `push` sobre el manifiesto "vacío" que
 * devuelve `leerManifiesto()` cuando el archivo no existe habría quedado
 * pegado al módulo. Congelado también el arreglo, eso lanza; y quien necesite
 * uno editable llama aquí. Mismo motivo, y misma historia, que en
 * `aprendizaje.js`.
 */
export function manifiestoVacio() {
  return { version: 1, manuales: [] };
}

/**
 * ¿Es éste el id de un sistema declarado en el registro, o el valor
 * explícito de «toda la planta»?
 *
 * `null` es una respuesta válida a propósito: un procedimiento general
 * —«arranque de la instalación»— no pertenece a una sola máquina, y forzarlo
 * a elegir una sería mentir sobre su alcance. Lo que NO es válido es un id
 * que no está en `SISTEMAS`: eso sí es un error, porque un manual «del
 * sistema que no existe» no ayuda a nadie a encontrarlo.
 */
export function sistemaValido(id) {
  if (id === null || id === undefined || id === "") return true;
  return SISTEMAS.some((s) => s.id === id);
}

/**
 * Una entrada nueva del manifiesto.
 *
 * `version` empieza en 1 y sólo sube con `reemplazar` (Fase 1, en
 * `backend/ia/indices/manuales.mjs`) — nunca se reescribe entera, para que «versión 3»
 * siga significando lo mismo delante de un técnico que pregunta «¿esto es el
 * manual más reciente?».
 */
export function crearManual({ id, archivo, sistema = null, titulo, subidoPor }, ahora = new Date()) {
  return {
    id,
    archivo,
    sistema: sistema || null,
    titulo: titulo?.trim() || archivo,
    version: 1,
    estado: "activo",
    subidoPor: subidoPor || "desconocido",
    fecha: ahora.toISOString(),
  };
}

/**
 * El manifiesto tal como llega de disco, con forma garantizada aunque el JSON
 * esté a medio escribir o venga de una versión anterior del esquema. Mismo
 * criterio que `normalizarAlmacen` en `aprendizaje.js`: nunca lanza, y una
 * entrada que no tiene lo mínimo se descarta en vez de propagar `undefined`
 * más adelante.
 */
export function normalizarManifiesto(bruto) {
  const manuales = Array.isArray(bruto?.manuales) ? bruto.manuales : [];
  return {
    version: 1,
    manuales: manuales.filter(
      (m) => m && typeof m.id === "string" && typeof m.archivo === "string"
    ),
  };
}
