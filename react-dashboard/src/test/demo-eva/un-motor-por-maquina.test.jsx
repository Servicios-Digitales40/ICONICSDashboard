// @vitest-environment jsdom
/**
 * Un motor de sondeo POR MÁQUINA, aunque la miren dos vistas a la vez (Plan
 * 42.5 F1, contramedida 4 de §3.6; es la prueba que el backlog F7 pedía
 * ANTES de que hubiera un segundo consumidor de la fuente).
 *
 * `PlantaMaquina` (por `useEstadoDeMaquina`) y «Estado mecánico»
 * (`Vibraciones`, por `useDominioVibracion`) montadas juntas sobre la misma
 * máquina tienen que abrir UN `pollingEngine`, no dos: la fuente se pide a la
 * misma caché. Si alguien escribe un hook que abra el suyo, esto lo caza.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crearMaquina } from "@shared/eva/comun/configuracionMaquina.js";

const { createPollingEngine } = vi.hoisted(() => ({ createPollingEngine: vi.fn() }));
vi.mock("@/lib/iconics", async (importOriginal) => {
  const original = await importOriginal();
  createPollingEngine.mockImplementation((...a) => original.createPollingEngine(...a));
  return { ...original, createPollingEngine };
});

const RAIZ = "ac:OTRA/PLANTA/Motor/";
const CONFIGURADA = crearMaquina({
  id: "otra-vibraciones",
  nombre: "Otra máquina",
  tipo: "vibraciones",
  plc: "PLC_9 · ua:OTRA",
  cadenciaMs: 200,
  assets: [
    { id: "Motor", pointName: RAIZ, rol: "raiz" },
    { id: "S1", pointName: `${RAIZ}S1/` },
  ],
  variables: [
    { id: "vRMS_S1", pointName: `${RAIZ}S1/vRMS_S1`, assetId: "S1", rol: "medida:vRMS" },
    { id: "aRMS_S1", pointName: `${RAIZ}S1/aRMS_S1`, assetId: "S1", rol: "medida:aRMS" },
  ],
});

vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquina: () => ({
    id: CONFIGURADA.id, configurada: CONFIGURADA, registro: null,
    enServicio: true, cerrada: null, enServicioIds: [CONFIGURADA.id],
  }),
}));

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { fuenteDeMaquinaConfigurada, olvidarFuentesDeMaquina } from "@/Demo-EVA/data/comunes/fuenteDeMaquina.js";
import PlantaMaquina from "@/Demo-EVA/views/maquina/PlantaMaquina.jsx";
import Vibraciones from "@/Demo-EVA/views/vibraciones/Vibraciones.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
  globalThis.fetch = vi.fn(() => {
    throw new Error("el origen simulado no debe salir a la red");
  });
  createPollingEngine.mockClear();
});

afterEach(() => {
  cleanup();
  olvidarFuentesDeMaquina();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

describe("dos vistas sobre la misma máquina", () => {
  it("abren UN solo motor de sondeo, y es el mismo que la caché devuelve", async () => {
    render(
      <ThemeProvider>
        <DataSourceProvider>
          <PlantaMaquina onNavigate={vi.fn()} />
          <Vibraciones />
        </DataSourceProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText("Estado de las variables")).toBeTruthy(), { timeout: 3000 });
    await waitFor(() => expect(screen.getAllByText("Otra máquina").length).toBeGreaterThan(0), { timeout: 3000 });

    expect(createPollingEngine).toHaveBeenCalledTimes(1);
    /* Y pidiendo la fuente otra vez no se abre otro: es la misma instancia. */
    const antes = createPollingEngine.mock.calls.length;
    const fuente = fuenteDeMaquinaConfigurada(CONFIGURADA, "simulado");
    expect(createPollingEngine.mock.calls.length).toBe(antes);
    expect(fuente.puntos()).toEqual(CONFIGURADA.variables.map((v) => v.pointName));
  });

  it("al desmontar la última vista, sus puntos se sueltan: nadie sondea por una pantalla cerrada", async () => {
    const { unmount } = render(
      <ThemeProvider>
        <DataSourceProvider>
          <PlantaMaquina onNavigate={vi.fn()} />
        </DataSourceProvider>
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByText("Estado de las variables")).toBeTruthy(), { timeout: 3000 });
    const fuente = fuenteDeMaquinaConfigurada(CONFIGURADA, "simulado");
    await waitFor(() => expect(fuente.lecturaDe("vRMS_S1").receivedAt).toBeInstanceOf(Date), { timeout: 3000 });

    unmount();

    /* El motor libera los puntos al soltar el último suscriptor (`acquire` →
       `release`): sin nadie que los pida, la lectura vuelve a «sin dato». Es la
       misma regla que `motor-por-sistema.test.js` afirma para el tanque. */
    expect(fuente.lecturaDe("vRMS_S1")).toEqual({ valor: null, receivedAt: null, stale: true, motivo: null });
  });
});

describe("la caché de fuentes distingue una máquina renombrada (Plan 42.5 F6)", () => {
  it("cambiar el nombre o los alias de un asset rehace la fuente; la misma configuración devuelve la misma", () => {
    const configurada = CONFIGURADA;
    const a = fuenteDeMaquinaConfigurada(configurada, "simulado");
    /* Misma configuración (otra copia): la misma fuente, no un segundo motor. */
    expect(fuenteDeMaquinaConfigurada(structuredClone(configurada), "simulado")).toBe(a);

    const renombrada = {
      ...configurada,
      assets: configurada.assets.map((x) => (x.id === "S1" ? { ...x, nombre: "Acople chiquito" } : x)),
    };
    const b = fuenteDeMaquinaConfigurada(renombrada, "simulado");
    expect(b).not.toBe(a);
    expect(b.sistema.metaDe("vRMS_S1").label).toContain("Acople chiquito");

    const conAlias = { ...renombrada, assets: renombrada.assets.map((x) => (x.id === "S1" ? { ...x, alias: ["el chico"] } : x)) };
    expect(fuenteDeMaquinaConfigurada(conAlias, "simulado")).not.toBe(b);
  });
});
