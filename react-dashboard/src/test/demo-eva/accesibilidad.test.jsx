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
import AssetsEva from "@/Demo-EVA/views/comunes/AssetsEva.jsx";
import PlantaMaquina from "@/Demo-EVA/views/maquina/PlantaMaquina.jsx";
import DetalleMaquina from "@/Demo-EVA/views/maquina/DetalleMaquina.jsx";
import { crearMaquina } from "@shared/eva/comun/configuracionMaquina.js";
import { olvidarFuentesDeMaquina } from "@/Demo-EVA/data/comunes/fuenteDeMaquina.js";

/*
 * Las vistas GENÉRICAS de máquina configurada (Plan 42.5 F1/F2) sustituyen a
 * `PlantaTanque` y `DetalleActivo` en esta auditoría (F4): misma exigencia
 * —cero violaciones graves—, montadas punta a punta en «Simulado» sobre una
 * configurada con series verificadas a medias, como las demás pruebas de
 * vistas. `useMaquina` se dobla porque el provider real sale a la red.
 */
const RAIZ_MAQ = "ac:OTRA/PLANTA/Motor/";
const CONFIGURADA = crearMaquina({
  id: "otra-vibraciones", nombre: "Otra máquina", tipo: "vibraciones", plc: "PLC_9 · ua:OTRA", cadenciaMs: 200,
  assets: [
    { id: "Motor", pointName: RAIZ_MAQ, rol: "raiz" },
    { id: "S1", pointName: `${RAIZ_MAQ}S1/`, nombre: "Lado acople" },
    { id: "S2", pointName: `${RAIZ_MAQ}S2/` },
  ],
  variables: [
    { id: "vRMS_S1", pointName: `${RAIZ_MAQ}S1/vRMS_S1`, historyPointName: "hda:\\O\\vRMS_S1", assetId: "S1", rol: "medida:vRMS" },
    { id: "aRMS_S1", pointName: `${RAIZ_MAQ}S1/aRMS_S1`, assetId: "S1", rol: "medida:aRMS" },
    { id: "vRMS_S2", pointName: `${RAIZ_MAQ}S2/vRMS_S2`, historyPointName: "hda:\\O\\vRMS_S2", assetId: "S2", rol: "medida:vRMS" },
  ],
});
for (const v of CONFIGURADA.variables) v.historyVerified = Boolean(v.historyPointName);
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquina: () => ({
    id: CONFIGURADA.id, configurada: CONFIGURADA, registro: null,
    enServicio: true, cerrada: null, enServicioIds: [CONFIGURADA.id],
  }),
}));

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  olvidarFuentesDeMaquina();
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

describe("las vistas sin aria- de la auditoría, contra axe-core", () => {
  /*
   * Mismo timeout explícito, y por el mismo motivo que el de abajo — aunque
   * aquí sea UNA sola pasada de axe-core.
   *
   * Esta prueba llevaba tiempo en rojo por plazo agotado, no por una
   * violación: se encontró así al cerrar el Plan 24 F0 y se comprobó entonces
   * (con `git stash`) que fallaba igual sin los cambios de esa fase. Planta
   * monta la rejilla de los cuatro activos con sus cincuenta y dos señales, y
   * auditarla entera pasa de 5 s en esta máquina.
   *
   * Se arregla aquí porque llevaba dos fases estorbando la lectura de la suite:
   * un rojo permanente que nadie atribuye a nada acaba enseñando a ignorar el
   * rojo, que es peor que la prueba lenta. El criterio no se toca — sigue
   * exigiendo cero violaciones graves.
   */
  it("PlantaMaquina (la Planta genérica) no tiene violaciones graves", async () => {
    montarComoLaApp(<PlantaMaquina onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText("Estado de las variables")).toBeTruthy(), { timeout: 4_000 });
    await auditarAccesibilidad();
  }, 30_000);

  /*
   * Timeout explícito, y no el de 5 s por defecto: esta prueba monta la vista
   * CUATRO veces y pasa axe-core por cada una, sobre un árbol que crece con la
   * aplicación. Al añadir el panel de procedencia (Plan 24 F1) cada tarjeta
   * suma un `<details>` más que auditar y las cuatro pasadas dejaron de caber.
   *
   * Se amplía el plazo en vez de recortar la cobertura —auditar dos activos en
   * lugar de cuatro habría dejado de mirar la mitad— porque lo que esta prueba
   * tarda no es un problema de la aplicación: es el coste de axe-core, que en
   * producción nadie paga. Lo que no se toca es el criterio: sigue exigiendo
   * cero violaciones graves en los cuatro.
   */
  it("DetalleMaquina (el Detalle genérico) no tiene violaciones graves, en sus dos activos", async () => {
    for (const activo of ["S1", "S2"]) {
      cleanup();
      olvidarFuentesDeMaquina();
      montarComoLaApp(<DetalleMaquina params={{ maquina: CONFIGURADA.id, activo }} onNavigate={() => {}} />);
      await waitFor(() => expect(screen.getByText(/^Detalle ·/)).toBeTruthy(), { timeout: 4_000 });
      await auditarAccesibilidad();
    }
  }, 30_000);

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

/** Los `corto` de `shared/eva/tanque/estado.js`: nunca colisionan con un nombre de señal. */
const CORTO_ESTADO = /En banda|Aviso|Fuera|Sin dato|Reposo/;

describe("el color de banda no es su único portador (Plan 13, F6)", () => {
  /* En la Planta genérica el estado sólo existe donde el tipo declara banda,
     y en «Simulado» depende del régimen del momento; ese contrato se afirma
     con estado fijado en `planta-maquina.test.jsx` («el corto acompaña al
     color»), no aquí. */

  it("BandaValor: el corto del estado aparece bajo cada variable con escala, en el Detalle genérico", async () => {
    montarComoLaApp(<DetalleMaquina params={{ maquina: CONFIGURADA.id, activo: "S1" }} onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(CORTO_ESTADO).length).toBeGreaterThan(0), { timeout: 4_000 });
  });
});

describe("landmarks: el juego completo, no sólo el que faltaba", () => {
  it("main + header + nav aparecen exactamente una vez cada uno", async () => {
    /*
     * La vista de dentro es la del explorador de Assets porque no aporta
     * ningún landmark propio; lo que se cuenta es el cromo. La Planta genérica
     * no sirve aquí: sus tarjetas de riesgo llevan un `<header>` de sección
     * dentro de cada `<article>` —que NO es un banner, pero este conteo por
     * etiqueta no distingue—. Hasta el Plan 42.5 F4 se montaba `InicioTanque`.
     */
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, payload: [] }) }));
    montarComoLaApp(<AssetsEva />);
    await waitFor(() => expect(screen.getByText(/Assets/)).toBeTruthy());

    expect(document.querySelectorAll("main").length).toBe(1);
    expect(document.querySelectorAll("header").length).toBe(1);
    expect(document.querySelectorAll("nav").length).toBe(1);
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeTruthy();
  });
});
