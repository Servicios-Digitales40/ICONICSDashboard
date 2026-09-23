// @vitest-environment jsdom
/**
 * «Planta» de una máquina configurada, punta a punta y con la red CORTADA
 * (Plan 42.5 F1, contramedida 5 de §3.6): en origen «Simulado» las series
 * verificadas dibujan curva sin que `fetch` se llame ni una vez, y las no
 * verificadas no dibujan nada tampoco en simulado.
 *
 * Mismo montaje que `vibraciones-simulada.test.jsx`: `useMaquina` doblado en
 * vez de `MaquinaProvider` (el real sale a `/api/maquinas`), `VITE_ICONICS_FAKE`
 * para que `DataSourceProvider` arranque en simulado, sin caos para que el
 * conteo sea determinista, y `olvidarFuentesDeMaquina()` al terminar porque la
 * caché de fuentes es del MÓDULO, no del árbol.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crearMaquina } from "@shared/eva/comun/configuracionMaquina.js";

const RAIZ = "ac:OTRA/PLANTA/Motor/";
const HDA = (id) => `hda:\\Configuration\\OTRA\\${id}`;

const medida = (apoyo, rol, conSerie) => ({
  id: `${rol}_${apoyo}`,
  pointName: `${RAIZ}${apoyo}/${rol}_${apoyo}`,
  historyPointName: conSerie ? HDA(`${rol}_${apoyo}`) : null,
  assetId: apoyo,
  rol: `medida:${rol}`,
});

const CONFIGURADA = crearMaquina({
  id: "otra-vibraciones",
  nombre: "Otra máquina",
  tipo: "vibraciones",
  plc: "PLC_9 · ua:OTRA",
  cadenciaMs: 200,
  assets: [
    { id: "Motor", pointName: RAIZ, rol: "raiz" },
    { id: "S1", pointName: `${RAIZ}S1/` },
    { id: "S2", pointName: `${RAIZ}S2/` },
    { id: "Variador", pointName: `${RAIZ}Variador/` },
  ],
  variables: [
    medida("S1", "vRMS", true),
    medida("S1", "aRMS", false),
    medida("S2", "vRMS", true),
    medida("S2", "aRMS", false),
    { id: "SPEED", pointName: `${RAIZ}Variador/SPEED`, assetId: "Variador", rol: "variador:velocidad" },
  ],
});
/* `crearVariable` arranca SIEMPRE en `historyVerified: false` (nadie verifica
   una serie por declararla). Aquí se da por sondeada la que trae `hda:`. */
for (const v of CONFIGURADA.variables) v.historyVerified = Boolean(v.historyPointName);

vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquina: () => ({
    id: CONFIGURADA.id, configurada: CONFIGURADA, registro: null,
    enServicio: true, cerrada: null, enServicioIds: [CONFIGURADA.id],
  }),
}));

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { olvidarFuentesDeMaquina } from "@/Demo-EVA/data/comunes/fuenteDeMaquina.js";
import PlantaMaquina from "@/Demo-EVA/views/maquina/PlantaMaquina.jsx";

function cortarLaRed() {
  const trampa = vi.fn(() => {
    throw new Error("el origen simulado no debe salir a la red");
  });
  globalThis.fetch = trampa;
  return trampa;
}

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

const montar = () =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <PlantaMaquina onNavigate={vi.fn()} />
      </DataSourceProvider>
    </ThemeProvider>,
  );

describe("Planta en origen simulado, sin red", () => {
  it("las dos series verificadas dibujan su sparkline y el historiador simulado contesta; fetch no se toca", async () => {
    const trampa = cortarLaRed();
    const { container } = montar();

    await waitFor(() => expect(screen.getByText("2 series con historia")).toBeTruthy(), { timeout: 3000 });
    await waitFor(() => expect(container.querySelectorAll("svg path.trazo-dibujo").length).toBe(2), { timeout: 3000 });

    /* Las cinco variables aparecen en el estado, con o sin serie. */
    expect(screen.getByText("Estado de las variables")).toBeTruthy();
    expect(screen.getByText("Tendencias")).toBeTruthy();
    expect(trampa).not.toHaveBeenCalled();
  });

  it("la máquina se declara por su nombre, y el aRMS sin serie no tiene curva ni en simulado", async () => {
    cortarLaRed();
    const { container } = montar();

    await waitFor(() => expect(screen.getByText("Otra máquina")).toBeTruthy(), { timeout: 3000 });
    await waitFor(() => expect(container.querySelectorAll("svg path.trazo-dibujo").length).toBe(2), { timeout: 3000 });

    /* Dos sparklines para dos verificadas: ninguna de las tres no verificadas coló una curva. */
    expect(container.querySelectorAll("svg path.trazo-dibujo").length).toBe(2);
  });
});
