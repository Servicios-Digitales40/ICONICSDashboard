/**
 * routes.test.jsx
 * ------------------------------------------------------------------
 * Qué vistas existen en cada build.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * El registro de rutas es lo que define la superficie de la aplicación en
 * planta: lo que un operador puede abrir en un monitor sin teclado. Las 12
 * propuestas de diseño de `src/prototypes/` deben existir con la bandera de
 * prototipos —donde sirven para comparar— y **no** en el build de planta.
 *
 * Que eso funcione depende de dos detalles frágiles y nada obvios, los dos
 * descubiertos rompiéndolos:
 *
 *  1. Las propuestas se cargan con `import()` dinámico. Con un import normal
 *     entrarían en el bundle aunque su ruta no se registrara.
 *  2. La condición se escribe como un ternario sobre `PROTOTIPOS_HABILITADOS`,
 *     no como una llamada a una función auxiliar. Con la función, el
 *     empaquetador no puede probar que la rama está muerta y emitía los doce
 *     trozos igualmente en el build de planta.
 *
 * Un refactor bienintencionado —extraer ese ternario a un ayudante que lea
 * mejor— revierte (2) sin que nada falle a la vista: la aplicación funciona
 * igual y las propuestas vuelven a viajar a planta en silencio. Esta prueba
 * cubre el lado observable; el resto lo dice el `dist`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Recarga el registro con la bandera puesta, como haría el build.
 *
 * La bandera es `VITE_ENABLE_PROTOTYPES` y no `VITE_ENABLE_DEMO`: desde el
 * Plan 5, la superficie de la aplicación y el origen de los datos se gatean por
 * separado. Antes eran la misma variable y no se podían tener las propuestas
 * sin ofrecer además datos falsos.
 */
async function rutasCon(prototipos) {
  vi.resetModules();
  vi.stubEnv("VITE_ENABLE_PROTOTYPES", prototipos ? "true" : "");
  const { ROUTES } = await import("@/app/routes/routes.jsx");
  return ROUTES.map((r) => r.id);
}

const ES_PROPUESTA = (id) =>
  id === "sandbox" || id === "dashboard-v2" || /^area[12]-/.test(id);

/**
 * Las vistas 3D. Las dos van en los DOS builds, y no dependen de la bandera de
 * prototipos.
 *
 * «Máquina 3D» estuvo detrás de ella por herencia —nació con el modo demo— y
 * se sacó a propósito: no es un prototipo. Las propuestas COMPITEN contra una
 * pantalla existente y hay que elegir una; las vistas 3D son funcionalidad
 * pedida y las dos funcionan con datos reales.
 *
 * Lo que está en juego aquí es distinto y más caro que en las propuestas: la
 * pila 3D pesa ~840 KB, y con las dos vistas en planta ese peso está a un
 * import estático de colarse en el arranque. Ver
 * `scripts/verificar-bundle.mjs`, que comprueba ese otro lado sobre el `dist`;
 * esta prueba sólo cubre qué rutas existen.
 */
const ES_3D = (id) => id === "maquina-3d" || id === "maqueta-3d";

/** Todo lo que la bandera de prototipos AÑADE sobre el build de planta. */
const ES_SOLO_PROTOTIPOS = ES_PROPUESTA;

afterEach(() => vi.unstubAllEnvs());

describe("superficie de la aplicación", () => {
  it("el build de planta sólo tiene las vistas de operación", async () => {
    const ids = await rutasCon(false);

    expect(ids).toEqual([
      "dashboard",
      "area-LIN",
      "area-REC",
      "maquina-3d",
      "maqueta-3d",
      "assets",
      "machine-detail",
    ]);
    expect(ids.filter(ES_SOLO_PROTOTIPOS)).toEqual([]);
  });

  it("la sección 3D está entera en los dos builds", async () => {
    // Las dos vistas, no una. Es lo que las separa de las propuestas de
    // diseño: no son variantes a evaluar, son funcionalidad, y las dos
    // funcionan contra el servidor real.
    //
    // La reserva sobre el selector manual de «Máquina 3D» —enseña estados que
    // ICONICS no emite— se resuelve rotulándolos en la propia vista, no
    // escondiendo la ruta. Si algún día se decide que en planta no deben verse,
    // lo que hay que gatear es el SELECTOR, y esta prueba no cambia.
    for (const proto of [false, true]) {
      expect((await rutasCon(proto)).filter(ES_3D), `prototipos=${proto}`)
        .toEqual(["maquina-3d", "maqueta-3d"]);
    }
  });

  it("la sección «3D» sale en el mismo sitio en los dos builds", async () => {
    // `buildNav` coloca un grupo en la posición de su primer hijo, así que el
    // orden de declaración decide dónde aparece la sección en el sidebar. En
    // los dos casos tiene que quedar detrás de las áreas y delante de Assets.
    for (const proto of [false, true]) {
      const ids = await rutasCon(proto);
      const primer3D = ids.findIndex(ES_3D);
      expect(primer3D, `prototipos=${proto}`).toBeGreaterThan(ids.indexOf("area-REC"));
      expect(primer3D, `prototipos=${proto}`).toBeLessThan(ids.indexOf("assets"));
    }
  });

  it("el build con prototipos añade las 12 propuestas", async () => {
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
    for (const proto of [false, true]) {
      const ids = await rutasCon(proto);
      expect(new Set(ids).size, `prototipos=${proto}`).toBe(ids.length);
    }
  });

  it("las vistas de operación son las mismas en los dos builds", async () => {
    // La bandera AÑADE vistas; no debe cambiar lo que se ve en planta.
    const planta = await rutasCon(false);
    const conProto = (await rutasCon(true)).filter((id) => !ES_SOLO_PROTOTIPOS(id));

    expect(conProto).toEqual(planta);
  });
});
