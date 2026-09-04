// @vitest-environment jsdom
/**
 * accesibilidad.test.jsx
 * ------------------------------------------------------------------
 * El arnés de `test/a11y.js` aplicado a lo que queda de interfaz.
 *
 * ── POR QUÉ ESTE ARCHIVO SUSTITUYE AL DE `demo-eva/` ───────────────
 *
 * Aquél auditaba `InicioTanque`, `PlantaTanque`, `AssetsEva` y
 * `DetalleActivo`, más los landmarks del layout (`<header>` del Topbar,
 * `<aside>`/`<nav>` del Sidebar). Ninguno de los seis existe ya: la Fase 3 del
 * Plan 20 borró las vistas de planta y el layout entero.
 *
 * Reapuntarlo importa más que antes, no menos. Con veintidós pantallas, un
 * fallo de accesibilidad en una era un fallo en una; con dos, cualquier
 * defecto está en el 50 % de la aplicación y lo ve todo el mundo, todo el
 * rato.
 *
 * ── QUÉ CUBRE HOY Y QUÉ FALTA ──────────────────────────────────────
 *
 * Hoy: los dos cajones que la Fase 3 conservó. El asistente en pantalla
 * completa y el login todavía no —el primero se rehace en la Fase 5 y el
 * segundo no existe hasta la Fase 4—, y auditarlos ahora sería auditar algo
 * que va a cambiar entero. Se añaden ahí, y está anotado en el plan.
 *
 * ── QUÉ PUEDE Y QUÉ NO PUEDE FALLAR AQUÍ ───────────────────────────
 *
 * `auditarAccesibilidad()` sólo falla por violaciones GRAVES —nombres
 * accesibles, ARIA inválido, alternativas de imagen; ver la cabecera de
 * `test/a11y.js`—. El contraste de color y el comportamiento real de
 * `:focus-visible` no son observables en jsdom, que no renderiza: ésos se ven
 * en la revisión en pantalla de la Fase 5 (`impeccable audit`).
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { auditarAccesibilidad } from "../../a11y.js";

import CajonCasos from "@/features/asistente/cajones/Casos.jsx";
import CajonManuales from "@/features/asistente/cajones/Manuales.jsx";

/** Los dos cajones piden su lista al montarse; se les da una vacía. */
function fetchVacio(url) {
  const cuerpo = String(url).includes("/api/casos")
    ? { ok: true, total: 0, casos: [] }
    : { ok: true, manuales: [], indice: { estado: "vacio", fragmentos: 0 } };

  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(fetchVacio));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("los cajones no tienen violaciones graves", () => {
  it.each([
    ["Casos", CajonCasos],
    ["Manuales", CajonManuales],
  ])("cajón %s", async (_nombre, Componente) => {
    const { container } = render(
      <ThemeProvider>
        <Componente />
      </ThemeProvider>
    );

    // Los dos pintan un estado de carga antes de tener datos; auditar ese
    // primer fotograma no diría nada del cajón de verdad.
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    /*
     * El arnés LANZA con el detalle de cada violación; no devuelve una lista.
     * Se le deja propagar a propósito: el mensaje que construye —regla, nodo y
     * enlace a la documentación— es mucho más útil que un `toEqual([])`
     * fallido, que sólo diría «esperaba vacío».
     */
    await auditarAccesibilidad(container);
  });
});
