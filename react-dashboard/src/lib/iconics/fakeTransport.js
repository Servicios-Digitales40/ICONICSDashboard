/**
 * lib/iconics/fakeTransport.js
 * ------------------------------------------------------------------
 * Imita la respuesta de ICONICS para poder construir y probar el motor
 * de polling SIN SERVIDOR.
 *
 * ── POR QUÉ NO BASTA CON `demoSource` ──────────────────────────────
 *
 * `demoSource` sustituye la capa de DOMINIO: entrega `Machine` ya
 * hechas. Pero el motor de polling vive por debajo, y su trabajo es
 * justo lo que `demoSource` se salta: agrupar puntos, trocear lotes,
 * filtrar por calidad, reintentar con backoff y marcar datos rancios.
 * Para ejercitar eso hace falta un falso al nivel del TRANSPORTE.
 *
 * ── ES ADVERSARIAL A PROPÓSITO (riesgo R-04) ───────────────────────
 *
 * Este es el riesgo característico de construir contra un falso: si solo
 * devolviera datos buenos, la UI se escribiría dando por hecho que todos
 * los tags existen siempre y que la calidad siempre es 192 — y esas dos
 * suposiciones reventarían justo el día de la conexión real.
 *
 * Por eso el caos está desde el primer día y ENCENDIDO por defecto en
 * un grado suave. La Fase 4 no se da por cerrada hasta que la UI se
 * comporta con dignidad con `chaos: CAOS_ALTO`.
 */
import { AREAS, parsePointName, tagsForArea } from "./tagCatalog.js";
import { QUALITY_GOOD } from "./quality.js";

/** Calidad OPC "uncertain": el caso que más se parece a un dato bueno y no lo es. */
const QUALITY_UNCERTAIN = 64;

/** Grado suave: suficiente para que los caminos de error se ejerciten a diario. */
export const CAOS_SUAVE = {
  malaCalidad: 0.02,
  ausente: 0.01,
  noFinito: 0.01,
  errorPeticion: 0,
  latenciaMs: 60,
};

/** Grado alto: para revisar a conciencia el comportamiento degradado. */
export const CAOS_ALTO = {
  malaCalidad: 0.25,
  ausente: 0.15,
  noFinito: 0.08,
  errorPeticion: 0.2,
  latenciaMs: 400,
};

export const SIN_CAOS = {
  malaCalidad: 0,
  ausente: 0,
  noFinito: 0,
  errorPeticion: 0,
  latenciaMs: 0,
};

/** PRNG determinista (xmur3 + mulberry32), el mismo patrón que usa `machines.js`. */
function seeded(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Valor base plausible por tag. Determinista por máquina para que la
 * misma máquina no salte entre lecturas, y coherente entre sí: el OEE
 * es el producto de sus tres factores, no un número suelto.
 */
function valorBase(areaId, machineId, tag, tick) {
  const rnd = seeded(`${areaId}/${machineId}`);
  const base = rnd();
  const onda = Math.sin(tick / 5 + base * 6) * 4;

  const disponibilidad = 72 + base * 22 + onda;
  const rendimiento = 68 + rnd() * 24 + onda;
  const calidad = 85 + rnd() * 14 + onda / 3;

  const aprobadas = Math.round(600 + base * 500 + tick * 3);
  const rechazadas = Math.round(20 + rnd() * 180);

  switch (tag) {
    case "disponibilidad": return disponibilidad;
    case "rendimiento": return rendimiento;
    case "calidad": return calidad;
    case "oee": return (disponibilidad * rendimiento * calidad) / 10000;

    case "aprobadas": return aprobadas;
    case "rechazadas": return rechazadas;
    case "producidas": return aprobadas + rechazadas;

    // Recorre los cinco códigos reales para que la UI vea todos los estados.
    case "estado": return Math.floor(base * 5 + tick / 7) % 5;
    case "modelo": return `Modelo ${String(Math.floor(base * 9)).padStart(2, "0")}`;

    case "tCiclo": return 40 + base * 25;
    case "tCicloCalc": return 42 + base * 25;
    case "tCicloTeo": return 38 + base * 20;
    case "tDispPot": return 86400;
    case "tInacPlan": return 3600 + Math.round(base * 1800);
    case "tMuerto": return Math.round(base * 5400);

    default: return 0;
  }
}

/**
 * Crea un transporte falso con la misma firma que usará el real:
 * `read(pointNames) → Promise<Map<pointName, {value, quality}>>`.
 */
export function createFakeTransport({ chaos = CAOS_SUAVE, seed = "fake" } = {}) {
  let tick = 0;
  const rnd = seeded(seed);

  async function read(pointNames) {
    tick += 1;

    if (chaos.latenciaMs > 0) {
      await new Promise((r) => setTimeout(r, chaos.latenciaMs));
    }

    // Fallo de la petición ENTERA: es como se comporta un servidor caído
    // o un token caducado, y debe disparar el backoff del motor.
    if (rnd() < chaos.errorPeticion) {
      throw new Error("fakeTransport: fallo simulado de la petición");
    }

    const salida = new Map();

    for (const name of pointNames) {
      const punto = parsePointName(name);
      if (!punto) continue;

      // Punto simplemente AUSENTE de la respuesta. Es el caso más
      // traicionero: no es un error, es un hueco silencioso.
      if (rnd() < chaos.ausente) continue;

      let value = valorBase(punto.areaId, punto.machineId, punto.tag, tick);
      let quality = QUALITY_GOOD;

      if (rnd() < chaos.malaCalidad) {
        // Mala calidad que llega con un CERO, que es justo como se
        // comporta ICONICS y por lo que existe la regla del 192.
        quality = QUALITY_UNCERTAIN;
        value = 0;
      } else if (typeof value === "number" && rnd() < chaos.noFinito) {
        // Lo que devuelve el servidor con Prod_Real_Total = 0.
        value = rnd() < 0.5 ? Infinity : NaN;
      }

      salida.set(name, { value, quality });
    }

    return salida;
  }

  return {
    read,
    /** Puntos que este falso sabe servir. Útil para pruebas de cobertura. */
    knownPoints: () =>
      Object.keys(AREAS).flatMap((areaId) =>
        AREAS[areaId].machineIds.flatMap((machineId) =>
          tagsForArea(areaId).map((tag) => ({ areaId, machineId, tag }))
        )
      ),
  };
}
