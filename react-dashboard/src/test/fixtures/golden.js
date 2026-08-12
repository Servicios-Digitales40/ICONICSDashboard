/**
 * fixtures/golden.js
 * ------------------------------------------------------------------
 * Acceso a la referencia numérica congelada (Plan 1, riesgo R-01).
 *
 * Es de SOLO LECTURA por defecto, a propósito. La primera versión
 * generaba el fichero cuando faltaba, pero vitest ejecuta los archivos
 * de prueba en paralelo: si otro archivo que leyera la referencia arrancaba
 * antes que `plantModel.golden.test.js`, aún no existía y la prueba fallaba de
 * forma intermitente. Una red de seguridad que falla al azar
 * se acaba desactivando.
 *
 * Para regenerarla tras un cambio DELIBERADO en el cálculo:
 *
 *     UPDATE_GOLDEN=1 npm test
 *
 * Que sea un gesto explícito también es la intención: reescribir la
 * referencia debe ser una decisión, nunca un efecto secundario.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const GOLDEN_PATH = join(HERE, "plantModel.golden.json");

export const debeActualizar = () =>
  process.env.UPDATE_GOLDEN === "1" || process.env.UPDATE_GOLDEN === "true";

export function escribirGolden(data) {
  mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
  writeFileSync(GOLDEN_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function leerGolden() {
  if (!existsSync(GOLDEN_PATH)) {
    throw new Error(
      `No existe la referencia congelada en ${GOLDEN_PATH}.\n` +
      `Genérala con:  UPDATE_GOLDEN=1 npm test`
    );
  }
  return JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
}
