/**
 * Las vistas y la capa de datos GENÉRICAS no nombran ninguna máquina (Plan
 * 42.5 F1, contramedida 3 de §3.6).
 *
 * El atajo natural al escribir una vista «para cualquier máquina» es copiar
 * la del tanque y cambiar nombres, o meter un `if (sistema.id === "vib-…")`
 * para el caso que se tiene delante. Cada uno de esos literales es una
 * máquina #3 que no entra sin tocar código. Esta prueba lee los archivos y
 * falla ante los que delatan ese atajo: los ids de las dos máquinas de hoy,
 * las claves del catálogo del tanque, los apoyos de vibraciones escritos a
 * mano, y los módulos que son de UNA máquina (`domain/senales.js`,
 * `useDominioVibracion`, `evaluarRiesgosVibracion`…).
 *
 * Lo que sí se permite, y por qué: `TarjetaRiesgo` de
 * `components/riesgoVibracion.jsx`. Es la tarjeta con la que `RiesgosVibracion`
 * pinta un riesgo de una configurada, y hoy es la única que hay; la deuda
 * —que la tarjeta la ofrezca el TIPO— queda anotada en el plan. Se permite
 * por nombre y sólo ese import, para que no se cuele otro.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CARPETAS = ["Demo-EVA/views/maquina", "Demo-EVA/components/maquina"];
const ARCHIVOS = [
  "Demo-EVA/data/comunes/historia.js",
  "Demo-EVA/data/comunes/useEstadoDeMaquina.js",
  "Demo-EVA/data/comunes/useSeriesDe.js",
  "Demo-EVA/data/comunes/seriesUnidas.js",
];

/** Lo que delata una vista escrita para UNA máquina. */
const PROHIBIDOS = [
  { patron: /["'`]tanque["'`]/, motivo: "el id del tanque" },
  { patron: /["'`]vib-/, motivo: "el id de una máquina de vibraciones" },
  { patron: /nivelTanque|flujoInstantaneo|presionRelativa|cargaMotor/, motivo: "una clave del catálogo del tanque" },
  { patron: /["'`]S[123]["'`]/, motivo: "un apoyo de vibraciones escrito a mano" },
  { patron: /domain\/(senales|activos|riesgos|sistema)\.js/, motivo: "el dominio del tanque" },
  { patron: /\bSENALES\b|\bACTIVO_IDS\b|\bSENAL_KEYS\b/, motivo: "el catálogo del tanque" },
  { patron: /useDominioVibracion|evaluarRiesgosVibracion|useSistemaAgua|useEvaSource/, motivo: "la fuente de una sola máquina" },
  { patron: /sistema\.id\s*===|maquina\.id\s*===|tipo\s*===\s*["']/, motivo: "un `if` por máquina o por tipo" },
];

/** Los imports permitidos que, por nombre, parecerían de una máquina. */
const PERMITIDOS = [/import \{ TarjetaRiesgo \} from ["'].*riesgoVibracion\.jsx["'];/];

function archivosDe(carpeta) {
  const ruta = join(SRC, carpeta);
  return readdirSync(ruta)
    .map((f) => join(ruta, f))
    .filter((f) => statSync(f).isFile() && /\.(jsx?|mjs)$/.test(f));
}

const objetivos = [...CARPETAS.flatMap(archivosDe), ...ARCHIVOS.map((a) => join(SRC, a))];

describe("el código genérico de máquina no nombra ninguna máquina", () => {
  it("hay algo que revisar", () => {
    expect(objetivos.length).toBeGreaterThan(3);
  });

  for (const archivo of objetivos) {
    it(`${archivo.slice(SRC.length + 1).replaceAll("\\", "/")} no lleva literales de máquina`, () => {
      let texto = readFileSync(archivo, "utf8");
      for (const permitido of PERMITIDOS) texto = texto.replace(permitido, "");
      // Los comentarios pueden citar al tanque para explicar por qué NO se
      // hace algo; lo que se vigila es el código.
      const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

      const hallazgos = PROHIBIDOS.filter(({ patron }) => patron.test(codigo)).map(({ motivo, patron }) => {
        const linea = codigo.split("\n").findIndex((l) => patron.test(l)) + 1;
        return `${motivo} (línea ~${linea})`;
      });

      expect(hallazgos).toEqual([]);
    });
  }
});
