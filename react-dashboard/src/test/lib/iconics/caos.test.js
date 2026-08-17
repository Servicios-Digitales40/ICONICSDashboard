/**
 * caos.test.js
 * ------------------------------------------------------------------
 * El grado de caos del simulador, y sobre todo que `none` sea de verdad cero.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * El simulador sirve para dos cosas que tiran en direcciones opuestas:
 *
 *  - **Desarrollar.** Ahí el caos tiene que estar encendido. Sin él la
 *    interfaz se escribe dando por hecho que todos los tags existen siempre y
 *    que la calidad siempre es buena, y las dos suposiciones fallan con el
 *    servidor real. Por eso `soft` es el valor por defecto.
 *
 *  - **Enseñar la aplicación.** Ahí el caos es un problema: una máquina que
 *    cae a «Sin dato» a mitad de una presentación no es un caso de prueba, es
 *    un accidente. Para eso está `none`.
 *
 * Esto es lo que sustituye a los números fijos del modo demo que el Plan 5
 * retiró, así que conviene que esté **probado y no supuesto**: si `none`
 * dejara pasar un solo hueco, la sustitución no sería equivalente y nadie se
 * enteraría hasta tener público delante.
 *
 * El otro extremo importa igual: si `soft` dejara de inyectar nada, los
 * caminos de error dejarían de ejercitarse a diario sin que ninguna prueba
 * fallara.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAOS_ALTO, CAOS_SUAVE, SIN_CAOS, createFakeTransport } from "@/lib/iconics/fakeTransport.js";
import { RESUMEN_TAGS, listMachines, pointName } from "@shared/tagCatalog.js";
import { isGoodQuality } from "@shared/quality.js";

afterEach(() => vi.unstubAllEnvs());

/** Todos los puntos del resumen para las 10 máquinas: 80 lecturas por ciclo. */
const PUNTOS = listMachines().flatMap((m) =>
  RESUMEN_TAGS.map((tag) => pointName(m.areaId, m.machineId, tag))
);

/** Lee `ciclos` veces y aplana el resultado. */
async function leerVarias(transport, ciclos) {
  const salida = [];
  for (let i = 0; i < ciclos; i++) {
    const mapa = await transport.read(PUNTOS);
    for (const punto of PUNTOS) salida.push({ punto, lectura: mapa.get(punto) });
  }
  return salida;
}

describe("SIN_CAOS · el modo para enseñar", () => {
  it("no deja ni un punto ausente ni una calidad mala", async () => {
    const transport = createFakeTransport({ chaos: SIN_CAOS });
    const lecturas = await leerVarias(transport, 12);

    // 12 ciclos × 80 puntos = 960 lecturas. Con `soft` (1 % de ausencia)
    // saldrían ~10 huecos; aquí no puede salir ninguno.
    expect(lecturas).toHaveLength(960);

    for (const { punto, lectura } of lecturas) {
      expect(lectura, `${punto} vino ausente`).toBeDefined();
      expect(isGoodQuality(lectura.quality), `${punto} vino con calidad mala`).toBe(true);
    }
  });

  it("no produce valores no finitos", async () => {
    // `noFinito` imita el `Infinity` que el servidor real devuelve al dividir
    // entre cero. Es exactamente lo que no se quiere en pantalla con público.
    const transport = createFakeTransport({ chaos: SIN_CAOS });
    const lecturas = await leerVarias(transport, 12);

    for (const { punto, lectura } of lecturas) {
      if (typeof lectura.value !== "number") continue;
      expect(Number.isFinite(lectura.value), `${punto} vino no finito`).toBe(true);
    }
  });

  it("nunca falla la petición entera", async () => {
    const transport = createFakeTransport({ chaos: SIN_CAOS });
    await expect(leerVarias(transport, 20)).resolves.toBeDefined();
  });

  it("no espera: la latencia es cero", async () => {
    // Con latencia, una demo en un equipo lento arrastra el arranque sin
    // ningún motivo — no hay red que imitar.
    expect(SIN_CAOS.latenciaMs).toBe(0);

    const transport = createFakeTransport({ chaos: SIN_CAOS });
    const t0 = Date.now();
    await transport.read(PUNTOS);
    expect(Date.now() - t0).toBeLessThan(80);
  });
});

describe("CAOS_SUAVE · el modo para desarrollar", () => {
  it("sigue inyectando fallos: los caminos de error se ejercitan a diario", async () => {
    // Si alguien pusiera los tres a cero «para que no moleste», la interfaz
    // volvería a escribirse suponiendo que el servidor nunca falla.
    expect(CAOS_SUAVE.malaCalidad).toBeGreaterThan(0);
    expect(CAOS_SUAVE.ausente).toBeGreaterThan(0);
    expect(CAOS_SUAVE.noFinito).toBeGreaterThan(0);
  });

  it("no tumba la petición entera: eso es cosa del grado alto", async () => {
    // Un `errorPeticion` > 0 en el grado por defecto haría que el backoff
    // saltara durante el desarrollo normal y se confundiría con un bug.
    expect(CAOS_SUAVE.errorPeticion).toBe(0);
  });

  it("con suficientes ciclos aparece al menos un hueco", async () => {
    // El transporte es determinista (PRNG sembrado), así que esto no es una
    // prueba aleatoria: con esta semilla y estos ciclos, sale.
    const transport = createFakeTransport({ chaos: CAOS_SUAVE, seed: "prueba-suave" });
    const lecturas = await leerVarias(transport, 20);

    const degradadas = lecturas.filter(
      ({ lectura }) => lectura === undefined || !isGoodQuality(lectura.quality)
    );
    expect(degradadas.length).toBeGreaterThan(0);
  });
});

describe("los tres grados están ordenados", () => {
  it("none ≤ soft ≤ high en cada dimensión", () => {
    for (const clave of ["malaCalidad", "ausente", "noFinito", "errorPeticion", "latenciaMs"]) {
      expect(SIN_CAOS[clave], clave).toBeLessThanOrEqual(CAOS_SUAVE[clave]);
      expect(CAOS_SUAVE[clave], clave).toBeLessThanOrEqual(CAOS_ALTO[clave]);
    }
  });
});

describe("selección del grado por variable de entorno", () => {
  const presetCon = async (valor) => {
    vi.resetModules();
    vi.stubEnv("VITE_ICONICS_CHAOS", valor ?? "");
    const { presetCaos } = await import("@/lib/iconics/transport.js");
    return presetCaos();
  };

  it("sin variable, el grado suave", async () => {
    expect(await presetCon(undefined)).toEqual(CAOS_SUAVE);
  });

  it("«none» apaga el caos", async () => {
    expect(await presetCon("none")).toEqual(SIN_CAOS);
  });

  it("«high» lo sube", async () => {
    expect(await presetCon("high")).toEqual(CAOS_ALTO);
  });

  it("un valor desconocido cae en suave, no en none", async () => {
    // Importa la dirección del fallo: caer en `none` por una errata dejaría un
    // simulador que no ejercita nada y nadie lo notaría, porque todo iría bien.
    for (const basura of ["ninguno", "off", "0", "NONE"]) {
      expect(await presetCon(basura), `valor "${basura}"`).toEqual(CAOS_SUAVE);
    }
  });
});
