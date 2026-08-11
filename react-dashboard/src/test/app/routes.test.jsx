/**
 * routes.test.jsx
 * ------------------------------------------------------------------
 * Qué vistas existen en cada build.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * El registro de rutas es lo que define la superficie de la aplicación en
 * planta: lo que un operador puede abrir en un monitor sin teclado. Las 13
 * propuestas de diseño de `src/prototypes/` deben existir en el build de demo
 * —donde sirven para comparar— y **no** en el de planta.
 *
 * Que eso funcione depende de dos detalles frágiles y nada obvios, los dos
 * descubiertos rompiéndolos:
 *
 *  1. Las propuestas se cargan con `import()` dinámico. Con un import normal
 *     entrarían en el bundle aunque su ruta no se registrara.
 *  2. La condición se escribe como un ternario sobre `DEMO_HABILITADO`, no
 *     como una llamada a una función auxiliar. Con la función, el
 *     empaquetador no puede probar que la rama está muerta y emitía los trece
 *     trozos igualmente en el build de planta.
 *
 * Un refactor bienintencionado —extraer ese ternario a un ayudante que lea
 * mejor— revierte (2) sin que nada falle a la vista: la aplicación funciona
 * igual y las propuestas vuelven a viajar a planta en silencio. Esta prueba
 * cubre el lado observable; el resto lo dice el `dist`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** Recarga el registro con la bandera puesta, como haría el build. */
async function rutasCon(demo) {
  vi.resetModules();
  vi.stubEnv("VITE_ENABLE_DEMO", demo ? "true" : "");
  const { ROUTES } = await import("@/app/routes/routes.jsx");
  return ROUTES.map((r) => r.id);
}

const ES_PROPUESTA = (id) =>
  id === "sandbox" || id === "dashboard-v2" || /^area[12]-/.test(id);

/**
 * Las vistas 3D. No son propuestas de diseño —no compiten contra ninguna
 * pantalla existente— pero comparten con ellas la condición de vivir sólo en
 * el build de demo, y por el mismo criterio: una vista que se orbita con el
 * ratón no pasa todavía el listón de «abrirla en un monitor sin teclado».
 *
 * Lo que está en juego aquí es distinto y más caro que en las propuestas: la
 * pila 3D pesa ~840 KB. Ver `scripts/verificar-bundle.mjs`, que comprueba el
 * otro lado —que ese peso no viaje en el arranque— sobre el `dist`.
 */
const ES_3D = (id) => id === "maquina-3d" || id === "maqueta-3d";

/** Todo lo que la demo AÑADE sobre el build de planta. */
const ES_SOLO_DEMO = (id) => ES_PROPUESTA(id) || ES_3D(id);

afterEach(() => vi.unstubAllEnvs());

describe("superficie de la aplicación", () => {
  it("el build de planta sólo tiene las vistas de operación", async () => {
    const ids = await rutasCon(false);

    expect(ids).toEqual(["dashboard", "area-LIN", "area-REC", "assets", "machine-detail"]);
    expect(ids.filter(ES_SOLO_DEMO)).toEqual([]);
  });

  it("las vistas 3D existen sólo en el build de demo", async () => {
    // El listón de `routes.jsx`: lo que se abre en un monitor sin teclado.
    // «Maqueta 3D» pasará a planta cuando esté medida en el equipo real; el
    // día que eso ocurra, esta prueba es la que hay que cambiar a propósito.
    expect((await rutasCon(false)).filter(ES_3D)).toEqual([]);
    expect((await rutasCon(true)).filter(ES_3D)).toEqual(["maquina-3d", "maqueta-3d"]);
  });

  it("el build de demo añade las 12 propuestas", async () => {
    const ids = await rutasCon(true);

    // Doce: «Planta · v2», el Sandbox y cinco variantes por área. El README
    // de `src/prototypes/` decía trece y su propia lista enumeraba doce.
    expect(ids.filter(ES_PROPUESTA)).toHaveLength(12);
    expect(ids).toContain("sandbox");
    expect(ids).toContain("dashboard-v2");
  });

  it("las propuestas van intercaladas donde se comparan, no al final", async () => {
    const ids = await rutasCon(true);

    // «Planta · v2» justo detrás de «Planta», y las variantes de cada área
    // detrás de su área: es lo que permite saltar de una a otra.
    expect(ids[ids.indexOf("dashboard") + 1]).toBe("dashboard-v2");
    expect(ids[ids.indexOf("area-LIN") + 1]).toMatch(/^area1-/);
    expect(ids[ids.indexOf("area-REC") + 1]).toMatch(/^area2-/);
  });

  it("ningún id se repite, en ninguno de los dos builds", async () => {
    for (const demo of [false, true]) {
      const ids = await rutasCon(demo);
      expect(new Set(ids).size, `demo=${demo}`).toBe(ids.length);
    }
  });

  it("las vistas de operación son las mismas en los dos builds", async () => {
    // La demo AÑADE vistas; no debe cambiar lo que se ve en planta.
    const planta = await rutasCon(false);
    const demo = (await rutasCon(true)).filter((id) => !ES_SOLO_DEMO(id));

    expect(demo).toEqual(planta);
  });
});
