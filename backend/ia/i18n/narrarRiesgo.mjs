/**
 * Rehace en inglés la prosa de un riesgo activo, con las MISMAS cifras.
 *
 * ── POR QUÉ EXISTE (i18n del asistente, Plan «asistente bilingüe») ─────────
 *
 * El asistente ya contesta en el idioma del tablero (`chat.mjs`, «EL IDIOMA
 * DE LA RESPUESTA»): el modelo narra en `es`/`en` según lo que llega en la
 * petición. Pero lo que narra —`evidencia`, `titulo`, `consecuencia`,
 * `accion`— lo compone `shared/eva/*` SIEMPRE en español (CLAUDE.md §2.7: el
 * dominio es puro y no sabe de idiomas), así que un tablero en inglés le
 * pasaba al modelo hechos en español y le tocaba traducirlos sobre la
 * marcha — con el riesgo de que tocara una cifra o un nombre de tag, que es
 * justo lo que `chat.mjs` ya decidió no permitir (ver su cabecera: «no se
 * traduce lo que el modelo devuelve […] una traducción a posteriori tocaría
 * cifras y nombres de tag»). Ese mismo argumento vale para lo que ENTRA.
 *
 * ── POR QUÉ NO ES UN CATÁLOGO NUEVO ─────────────────────────────────────
 *
 * Porque ya existe uno, probado, y con paridad garantizada por
 * `scripts/verificar-dominio.mjs`: `react-dashboard/src/i18n/locales/en/
 * domain.json`. Lo escribió el Plan de i18n del frontend para que
 * `useProsa.js` pudiera rehacer estas mismas frases al pintarlas. Esto es la
 * MISMA idea, portada a Node sin React: se lee el mismo JSON —no una copia—
 * y se interpola con las mismas reglas (placeholders `{{clave}}`, variantes
 * por `_contexto` al estilo i18next). Copiar las traducciones a un segundo
 * archivo habría creado dos originales del mismo párrafo en dos sitios que
 * nadie edita a la vez — exactamente lo que CLAUDE.md §2.6 prohíbe.
 *
 * No se instala `i18next` en el backend para esto: sólo hace falta
 * interpolar `{{clave}}` y elegir la variante `_contexto`, que es toda la
 * mecánica que `domain.json` usa. Traer la librería completa —con su
 * detección de idioma, sus namespaces, su ciclo de vida de instancia— para
 * dos funciones de 10 líneas sería la abstracción prematura que este
 * proyecto evita.
 *
 * ── LO QUE ESTO NO HACE ─────────────────────────────────────────────────
 *
 *  · No traduce nada por sí mismo: si `en` no tiene la clave, se devuelve el
 *    texto español que ya trae el riesgo (`defaultValue`), nunca una clave
 *    cruda (`risks.derrame.evidencia` en pantalla no es aceptable).
 *  · No toca `shared/eva/*`: sigue siendo dominio puro, en español, única
 *    fuente de verdad de la regla.
 *  · No formatea cifras al vuelo con separadores regionales. Las del tanque
 *    llegan en crudo en `valores` y aquí se dejan tal cual — el modelo no
 *    necesita "12,3" vs "12.3", necesita la cifra correcta, y el separador
 *    decimal de una respuesta en prosa lo decide el propio modelo al
 *    escribir en el idioma pedido. Las de vibraciones llegan YA formateadas
 *    por la propia regla (ver la cabecera de `riesgosVibracion.js`).
 *  · No traduce nombres de canal/vigilancia por su cuenta: eso lo resuelve
 *    `resolverPalabras`, inyectado por quien llama, con el mismo catálogo
 *    `machines.json` que ya usa el frontend — ver `catalogoMaquinas.mjs`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_LOCALES = join(
  AQUI, "..", "..", "..", "react-dashboard", "src", "i18n", "locales"
);

function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

/*
 * Se carga una sola vez al importar el módulo, no por petición: es un
 * archivo de disco que sólo cambia con un despliegue nuevo, igual que el
 * catálogo de señales o el de riesgos. Si no existiera —una instalación que
 * sólo despliega `backend/` sin `react-dashboard/`— `DOMAIN_EN` queda `null`
 * y todo cae al español, que es el mismo criterio de "no se sabe, no se
 * afirma" del resto del proyecto.
 */
let DOMAIN_EN = null;
try {
  DOMAIN_EN = leerJson(join(RAIZ_LOCALES, "en", "domain.json"));
} catch {
  DOMAIN_EN = null;
}

/** Sustituye `{{clave}}` por su valor. Una clave sin valor se deja tal cual. */
function interpolar(plantilla, valores) {
  return plantilla.replace(/\{\{\s*(\w+)\s*\}\}/g, (coincide, clave) =>
    Object.prototype.hasOwnProperty.call(valores, clave) ? String(valores[clave]) : coincide
  );
}

/**
 * Busca `${campo}_${contexto}` si hay contexto y esa variante existe; si no,
 * `${campo}` sin más. Mismo criterio que i18next: `context` elige entre
 * formas de la misma frase con trozos opcionales.
 */
function textoDelCampo(bloque, campo, contexto) {
  if (!bloque) return null;
  if (contexto && typeof bloque[`${campo}_${contexto}`] === "string") {
    return bloque[`${campo}_${contexto}`];
  }
  return typeof bloque[campo] === "string" ? bloque[campo] : null;
}

/**
 * Rehace los campos de prosa de UN riesgo activo (o no evaluable) en inglés.
 *
 * @param {object} r - lo que devuelve `evaluarRiesgos`/`evaluarRiesgosVibracion`
 *   para una entrada de `activos` (trae `id`, `titulo`, `evidencia`,
 *   `consecuencia`, `accion`, `nota`, `valores`) o de `noEvaluables` (`id`,
 *   `titulo`).
 * @param {"risks"|"vibrationRisks"} catalogo - qué máquina, porque son dos
 *   catálogos separados y `NO_COMPARTEN` (CLAUDE.md §2.1): una colisión de
 *   id entre las dos pintaría la frase de la otra máquina.
 * @param {(valores: object) => object} [resolverPalabras] - para las pocas
 *   reglas cuya evidencia enumera PALABRAS (nombre de un apoyo, de una
 *   vigilancia) y no sólo cifras: recibe `r.valores` crudo y devuelve el
 *   subconjunto ya traducido que se debe fusionar antes de interpolar. Sin
 *   él, esas frases concretas caen a español (mismo criterio de siempre:
 *   mejor una frase en español de más que una mal armada en inglés).
 * @returns {object} el mismo `r`, con sus campos de prosa en inglés cuando
 *   existe traducción y en español cuando no.
 */
export function narrarRiesgoEnIngles(r, catalogo, resolverPalabras = null) {
  if (!r || !DOMAIN_EN) return r;

  const bloque = DOMAIN_EN[catalogo]?.[r.id];
  if (!bloque) return r; // Regla sin bloque en inglés: se queda en español.

  const { contexto, ...crudos } = r.valores ?? {};
  const palabras = resolverPalabras ? resolverPalabras(crudos) ?? {} : {};
  const valores = { ...crudos, ...palabras };

  const traducir = (campo, original) => {
    const plantilla = textoDelCampo(bloque, campo, contexto);
    return plantilla ? interpolar(plantilla, valores) : original;
  };

  const salida = { ...r };
  if (r.titulo !== undefined) salida.titulo = traducir("titulo", r.titulo);
  if (r.evidencia !== undefined) salida.evidencia = traducir("evidencia", r.evidencia);
  if (r.consecuencia !== undefined) salida.consecuencia = traducir("consecuencia", r.consecuencia);
  if (r.accion !== undefined) salida.accion = traducir("accion", r.accion);
  if (r.nota) salida.nota = traducir("nota", r.nota);
  return salida;
}

/** Sólo el título — lo que necesita una entrada de `noEvaluables`. */
export function narrarTituloEnIngles(n, catalogo) {
  if (!n || !DOMAIN_EN) return n;
  const bloque = DOMAIN_EN[catalogo]?.[n.id];
  const titulo = textoDelCampo(bloque, "titulo", null);
  return titulo ? { ...n, titulo } : n;
}

/**
 * Rehace en inglés un mecanismo de desgaste de `pronostico_de_desgaste`
 * (`shared/eva/comun/pronostico.js`, catálogo `mechanisms` de `domain.json`).
 *
 * Más simple que `narrarRiesgoEnIngles`: los mecanismos no citan cifras
 * variables —su prosa es fija por id, como ya confirma `useProsa.mecanismo()`
 * del frontend—, así que no hace falta interpolar ni resolver `context`.
 *
 * @param {{titulo,componente,mecanismo,consecuencia,accion,confirmar?}} m
 * @param {"es"|"en"} idioma
 * @returns {object} el mismo objeto, con sus campos en inglés cuando `idioma`
 *   es "en" y existe traducción; español (sin cambios) en cualquier otro caso
 */
export function narrarMecanismoEnIngles(m, idioma) {
  if (!m || idioma !== "en" || !DOMAIN_EN) return m;
  const bloque = DOMAIN_EN.mechanisms?.[m.id];
  if (!bloque) return m;

  const salida = { ...m };
  if (m.titulo !== undefined) salida.titulo = bloque.titulo ?? m.titulo;
  if (m.componente !== undefined) salida.componente = bloque.componente ?? m.componente;
  if (m.mecanismo !== undefined) salida.mecanismo = bloque.mecanismo ?? m.mecanismo;
  if (m.consecuencia !== undefined) salida.consecuencia = bloque.consecuencia ?? m.consecuencia;
  if (m.accion !== undefined) salida.accion = bloque.accion ?? m.accion;
  if (m.confirmar) salida.confirmar = bloque.confirmar ?? m.confirmar;
  return salida;
}

/** Para pruebas: si el catálogo no se pudo cargar. */
export function catalogoDisponible() {
  return DOMAIN_EN !== null;
}
