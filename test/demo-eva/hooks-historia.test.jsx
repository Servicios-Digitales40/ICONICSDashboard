// @vitest-environment jsdom
/**
 * hooks-historia.test.jsx
 * ------------------------------------------------------------------
 * Plan 11, Fase 2: `useSeriesHistoricas` tenía que dejar de pedir SOLO al
 * montar y volver a pedir cuando cambia el RANGO. Se monta sobre el origen
 * Simulado real (mismo criterio que `detalle-activo-simulada.test.jsx`) y se
 * cuenta cuántas veces se pide, sin acoplarse a la red.
 *
 * Lo que importa proteger no es "se puede cambiar el rango" —eso lo prueba
 * cualquier render manual— sino las dos formas en que esto se rompe solo:
 *
 *  1. Cambiar el VALOR del rango no dispara una nueva lectura (quedó
 *     memoizado de más, y el selector de la Fase 3 dejaría de servir).
 *  2. Un objeto `{horas, puntos}` NUEVO pero con el MISMO valor dispara una
 *     lectura en cada render (quedó memoizado de menos: es justo lo que pasa
 *     si el rango va directo en las dependencias del efecto en vez de una
 *     clave por valor — un bucle de red silencioso).
 */
import { useRef } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import { useSeriesHistoricas } from "@/Demo-EVA/data/hooks.js";
import { rangoAyer, rangoSemana } from "@/Demo-EVA/data/historia.js";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function cortarLaRed() {
  const trampa = vi.fn(() => {
    throw new Error("el origen simulado no debe salir a la red");
  });
  globalThis.fetch = trampa;
  return () => delete globalThis.fetch;
}

/**
 * Sonda: cuenta transiciones `loading` true→false, es decir, cargas que
 * de verdad terminaron — no renders. Un `rerender()` con el mismo rango
 * vuelve a ejecutar el componente aunque el efecto no dispare nada, y contar
 * "loading es false" a secas contaría ese render de más como una carga.
 */
function Sonda({ rango, cargas }) {
  const { loading } = useSeriesHistoricas(["nivelTanque"], rango);
  const anterior = useRef(null);
  if (anterior.current === true && loading === false) cargas.vistas += 1;
  anterior.current = loading;
  return <span data-testid="cargas">{cargas.vistas}</span>;
}

const montar = (rango, cargas) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <Sonda rango={rango} cargas={cargas} />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("useSeriesHistoricas y el cambio de rango", () => {
  it("cambiar el VALOR del rango dispara una nueva lectura", async () => {
    const restaurar = cortarLaRed();
    const cargas = { vistas: 0 };
    const { rerender, getByTestId } = montar(rangoSemana(), cargas);

    await waitFor(() => expect(getByTestId("cargas").textContent).toBe("1"));

    rerender(
      <ThemeProvider>
        <DataSourceProvider>
          <EvaProvider>
            <Sonda rango={rangoAyer()} cargas={cargas} />
          </EvaProvider>
        </DataSourceProvider>
      </ThemeProvider>
    );

    await waitFor(() => expect(getByTestId("cargas").textContent).toBe("2"));
    restaurar();
  });

  it("un rango con el MISMO valor, aunque sea un objeto nuevo, no repite la lectura", async () => {
    const restaurar = cortarLaRed();
    const cargas = { vistas: 0 };
    const ahora = new Date("2026-08-20T12:00:00");
    const { rerender, getByTestId } = montar(rangoSemana(ahora), cargas);

    await waitFor(() => expect(getByTestId("cargas").textContent).toBe("1"));

    // Mismo instante, objeto `{inicio, fin}` distinto: el preset se
    // reconstruye así en cada render de `DetalleActivo` mientras el usuario
    // no cambie de acceso rápido.
    rerender(
      <ThemeProvider>
        <DataSourceProvider>
          <EvaProvider>
            <Sonda rango={rangoSemana(ahora)} cargas={cargas} />
          </EvaProvider>
        </DataSourceProvider>
      </ThemeProvider>
    );

    // Se espera un giro de reloj y se confirma que se quedó en 1, no que
    // nunca llegue a 2 — lo segundo no se puede probar por ausencia.
    await new Promise((r) => setTimeout(r, 200));
    expect(getByTestId("cargas").textContent).toBe("1");
    restaurar();
  });
});

/** Sonda para F9: expone el estado entero de `useSeriesHistoricas`, sin resumir. */
function SondaMeta({ rango, salida }) {
  const estado = useSeriesHistoricas(["nivelTanque"], rango);
  Object.assign(salida, estado);
  return <span data-testid="loading">{String(estado.loading)}</span>;
}

describe("Plan 13 F9: metaPorClave, sin tocar la forma de porClave que ya existía", () => {
  it("en el camino sin fallo, metaPorClave existe y va vacío por clave", async () => {
    // El simulador ahora SÍ puede fallar a propósito (`errorPeticion`, ver
    // simulador.test.js), pero es un azar (`Math.random`) que este test de
    // integración no controla sin inyectar un transporte propio — eso ya lo
    // cubre `simulador.test.js` de forma determinista, a nivel del transporte.
    // Lo que se protege aquí es el CONTRATO: `metaPorClave` existe, tiene la
    // forma `{motivo, error}` por clave, y `porClave` sigue siendo el arreglo
    // de puntos de siempre — nada de esto debía cambiar para quien ya
    // consumía el hook antes de esta fase.
    const restaurar = cortarLaRed();
    const salida = {};

    render(
      <ThemeProvider>
        <DataSourceProvider>
          <EvaProvider>
            <SondaMeta rango={rangoSemana()} salida={salida} />
          </EvaProvider>
        </DataSourceProvider>
      </ThemeProvider>
    );

    await waitFor(() => expect(salida.loading).toBe(false));
    expect(salida.metaPorClave).toEqual({ nivelTanque: { motivo: null, error: null } });
    expect(Array.isArray(salida.porClave.nivelTanque)).toBe(true);
    expect(salida.porClave.nivelTanque.length).toBeGreaterThan(0);
    restaurar();
  });
});
