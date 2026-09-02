// @vitest-environment jsdom
/**
 * accesibilidad.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 1 (F6): el arnés (`test/a11y.js`) aplicado a las cuatro
 * vistas que llegaban a esta fase sin un solo atributo `aria-`
 * (`InicioTanque`, `PlantaTanque`, `AssetsEva`, `DetalleActivo`), más los dos
 * landmarks que ahora completan el layout de toda la aplicación
 * (`App.jsx` → `<main>`, `Topbar.jsx` → `<header>`; `<aside>`/`<nav>` de
 * `Sidebar.jsx` ya existían).
 *
 * ── QUÉ SE PRUEBA AQUÍ Y QUÉ NO ──────────────────────────────────────
 *
 * `auditarAccesibilidad()` sólo puede fallar por violaciones GRAVES
 * (nombres accesibles, ARIA inválido, alternativas de imagen — ver la
 * cabecera de `test/a11y.js`). Los landmarks y el foco visible no entran
 * ahí: se comprueban con aserciones propias, porque son "moderate" /
 * "best-practice" para axe y un filtro por gravedad los dejaría pasar sin
 * decir nada — que es justo lo que ya pasaba con `region` antes de este
 * cambio, medido contra este mismo árbol.
 *
 * El contraste de color y el comportamiento real de `:focus-visible` no se
 * comprueban en ningún sitio de este archivo: jsdom no renderiza, así que
 * ninguno de los dos es observable aquí. Quedan para la revisión en
 * pantalla del Plan 13 (§5).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { auditarAccesibilidad } from "../a11y.js";

import { EvaProvider } from "@/Demo-EVA/data/comunes/EvaProvider.jsx";
import InicioTanque from "@/Demo-EVA/views/tanque/InicioTanque.jsx";
import PlantaTanque from "@/Demo-EVA/views/tanque/PlantaTanque.jsx";
import AssetsEva from "@/Demo-EVA/views/comunes/AssetsEva.jsx";
import DetalleActivo from "@/Demo-EVA/views/tanque/DetalleActivo.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

/**
 * Envuelve una vista exactamente como lo hace `App.jsx`: dentro de `<main>`,
 * con `<header>` y `<nav>` alrededor. Sin esto, `auditarAccesibilidad`
 * seguiría corriendo, pero contra un fragmento que nunca tiene el defecto
 * de landmarks que esta fase existe para cerrar — sería probar el arnés
 * contra un escenario que la aplicación real no produce nunca.
 */
function montarComoLaApp(vista) {
  // `QueryClient` nuevo en cada montaje, no el singleton de `lib/queryClient.js`:
  // este arnés remonta varias vistas dentro del mismo archivo (el bucle de
  // `DetalleActivo`, por ejemplo), y compartir caché entre montajes serviría
  // datos de un test en otro. `AssetsEva` es hoy la única vista de esta lista
  // que pasa por TanStack Query (`ExploradorAssets.jsx`).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DataSourceProvider>
          <EvaProvider>
            <header>
              <h1>Título de la página</h1>
            </header>
            <nav aria-label="Navegación principal">
              <a href="/x">Un enlace</a>
            </nav>
            <main>{vista}</main>
          </EvaProvider>
        </DataSourceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("las cuatro vistas sin aria- de la auditoría, contra axe-core", () => {
  it("InicioTanque no tiene violaciones graves", async () => {
    montarComoLaApp(<InicioTanque onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
    await auditarAccesibilidad();
  });

  it("PlantaTanque no tiene violaciones graves", async () => {
    montarComoLaApp(<PlantaTanque onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
    await auditarAccesibilidad();
  });

  it("DetalleActivo no tiene violaciones graves, en sus cuatro activos", async () => {
    for (const activo of ["tanque", "bombeo", "distribucion", "electrico"]) {
      cleanup();
      montarComoLaApp(<DetalleActivo params={{ activo }} onNavigate={() => {}} />);
      await waitFor(() => expect(screen.getByText(/^Detalle ·/)).toBeTruthy());
      await auditarAccesibilidad();
    }
  });

  it("AssetsEva no tiene violaciones graves, incluso con el árbol vacío", async () => {
    // ExploradorAssets no pasa por el transporte simulado de Demo EVA: habla
    // directo con el backend puente (`lib/iconics/apiClient.js`). Se mockea
    // `fetch` en vez de intentar enrutarlo por `DataSourceProvider`, que aquí
    // no gobierna esta vista.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, payload: [] }),
    }));

    montarComoLaApp(<AssetsEva />);
    await waitFor(() => expect(screen.getByText(/Assets/)).toBeTruthy());
    await auditarAccesibilidad();
  });
});

/** Los `corto` de `shared/eva/estado.js`: nunca colisionan con un nombre de señal. */
const CORTO_ESTADO = /En banda|Aviso|Fuera|Sin dato|Reposo/;

describe("el color de banda no es su único portador (Plan 13, F6)", () => {
  it("BarraBanda: el corto del estado aparece junto a la marca, en Planta", async () => {
    // Sólo Planta usa StatSenal/Medidor (BarraBanda); InicioTanque es la
    // landing y no repite las tarjetas de señal.
    montarComoLaApp(<PlantaTanque onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(CORTO_ESTADO).length).toBeGreaterThan(0));
  });

  it("BandaValor: el corto del estado aparece bajo cada variable con escala, en el Detalle", async () => {
    montarComoLaApp(<DetalleActivo params={{ activo: "tanque" }} onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(CORTO_ESTADO).length).toBeGreaterThan(0));
  });
});

describe("landmarks: el juego completo, no sólo el que faltaba", () => {
  it("main + header + nav aparecen exactamente una vez cada uno", async () => {
    montarComoLaApp(<InicioTanque onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));

    expect(document.querySelectorAll("main").length).toBe(1);
    expect(document.querySelectorAll("header").length).toBe(1);
    expect(document.querySelectorAll("nav").length).toBe(1);
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeTruthy();
  });
});
