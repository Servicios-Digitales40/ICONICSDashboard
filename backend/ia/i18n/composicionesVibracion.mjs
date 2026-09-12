/**
 * Las tres reglas de vibraciones cuya evidencia enumera PALABRAS, no sólo
 * cifras — resueltas para el inglés que consume el modelo.
 *
 * ── POR QUÉ ESTO NO ESTÁ DENTRO DE `narrarRiesgo.mjs` ──────────────────
 *
 * Es el mismo reparto que ya existe en el frontend: `narrarRiesgo.mjs` es el
 * mecanismo genérico (interpolar `{{clave}}`, elegir `_contexto`) y esto es
 * la excepción de tres reglas concretas, igual que `COMPOSICIONES` en
 * `react-dashboard/src/i18n/useProsa.js` es la excepción sobre el mecanismo
 * genérico de ahí. Mismo criterio, mismo porqué: `disparadas` en
 * `vigilancia-en-aviso` no es una cifra que se interpole tal cual, es una
 * lista de pares «vigilancia: estado» que hay que traducir palabra por
 * palabra ANTES de unir con `. `, y ninguna interpolación genérica hace eso.
 *
 * `bajas` y `asimetria-entre-apoyos.canal` con NOTACIÓN (VRMS, S1) no se
 * traducen — igual que en el frontend — porque son identificadores, no
 * palabras.
 *
 * Si `shared/eva/vibraciones/riesgosVibracion.js` gana una cuarta regla con
 * esta forma, se añade aquí Y en `useProsa.js` — son dos consumidores del
 * mismo problema, y `scripts/verificar-dominio.mjs` sólo vigila el catálogo
 * de texto, no esta lista; queda anotado para quien la toque después.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA_MACHINES_EN = join(
  AQUI, "..", "..", "..", "react-dashboard", "src", "i18n", "locales", "en", "machines.json"
);

let MACHINES_EN = null;
try {
  MACHINES_EN = JSON.parse(readFileSync(RUTA_MACHINES_EN, "utf8"));
} catch {
  MACHINES_EN = null;
}

const vigilancia = (clave) => MACHINES_EN?.vibration?.watches?.[clave] ?? clave;
const estadoVigilancia = (id) => MACHINES_EN?.vibration?.watchState?.[id] ?? id;
const canal = (id) => MACHINES_EN?.vibration?.channels?.[id] ?? id;

export const COMPOSICIONES_EN = {
  "vigilancia-en-aviso": ({ disparadas }) => ({
    disparadas: (disparadas ?? [])
      .map((v) => `${vigilancia(v.clave)}: ${estadoVigilancia(v.estado)}`)
      .join(". "),
  }),
  "confianza-de-medida-baja": ({ bajas }) => ({
    bajas: (bajas ?? []).map((q) => `${q.label}: ${q.valor}`).join(", "),
  }),
  "asimetria-entre-apoyos": ({ canal: idCanal }) => ({
    canal: idCanal ? canal(idCanal) : idCanal,
  }),
};

/**
 * Resuelve las palabras de un riesgo de vibraciones, si su id tiene
 * composición declarada. Sin `MACHINES_EN` cargado, cae en las claves
 * crudas (S1, bpfo…) en vez de reventar — mismo criterio que
 * `narrarRiesgo.mjs`.
 */
export function resolverPalabrasVibracion(id, valoresCrudos) {
  const componer = COMPOSICIONES_EN[id];
  if (!componer) return {};
  return componer(valoresCrudos ?? {});
}
