// @vitest-environment jsdom
/**
 * selector-rango.test.jsx
 * ------------------------------------------------------------------
 * Plan 11, Fases 3-4 y 7: el selector de rango de tiempo dentro de la vista
 * de detalle. Mismo criterio que `detalle-activo-simulada.test.jsx`: montar
 * la vista real sobre el origen Simulado, sin red.
 *
 * Lo que se protege:
 *  1. El control sólo aparece donde hay algo que rangear (Tanque,
 *     Distribución) — Bombeo y Eléctrico no tienen señales historizadas y no
 *     deben mostrarlo, igual que ya no muestran `GraficaHistoria`.
 *  2. Los cuatro accesos marcan el que está activo, y «Tiempo real» —el que
 *     arranca activo— lee del búfer en vivo, no del historiador: se nota en
 *     la insignia de origen de la tarjeta («Sesión actual» vs «Historiador»).
 *  3. El calendario personalizado no deja aplicar sin los dos días, y al
 *     aplicar pasa a ser el rango vigente.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import DetalleActivo from "@/Demo-EVA/views/DetalleActivo.jsx";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

function cortarLaRed() {
  const trampa = vi.fn(() => {
    throw new Error("el origen simulado no debe salir a la red");
  });
  globalThis.fetch = trampa;
  return trampa;
}

const montar = (params) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <DetalleActivo params={params} onNavigate={() => {}} />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("selector de rango: dónde aparece", () => {
  it("Tanque (con señales historizadas) muestra los cuatro accesos", async () => {
    cortarLaRed();
    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("group", { name: /Rango de tiempo/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Tiempo real" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ayer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hace una semana" })).toBeTruthy();
  });

  it.each(["bombeo", "electrico"])("«%s» (sin señales historizadas) no muestra el selector", async (activo) => {
    cortarLaRed();
    montar({ activo });

    await waitFor(() => expect(screen.getByText(/^Detalle ·/)).toBeTruthy());
    expect(screen.queryByRole("group", { name: /Rango de tiempo/i })).toBeNull();
  });
});

describe("selector de rango: los accesos rápidos", () => {
  it("«Tiempo real» arranca activo, y elegir «Ayer» lo marca activo a él", async () => {
    cortarLaRed();
    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Tiempo real" })).toBeTruthy());

    const btnVivo = screen.getByRole("button", { name: "Tiempo real" });
    const btnAyer = screen.getByRole("button", { name: "Ayer" });
    expect(btnVivo.getAttribute("aria-pressed")).toBe("true");
    expect(btnAyer.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(btnAyer);

    await waitFor(() => expect(btnAyer.getAttribute("aria-pressed")).toBe("true"));
    expect(btnVivo.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("selector de rango: «Tiempo real» lee del búfer, no del historiador", () => {
  it("al entrar, la insignia de origen dice «Sesión actual» y no «Historiador»", async () => {
    cortarLaRed();
    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Tiempo real" })).toBeTruthy());

    expect(screen.getAllByText(/Sesión actual/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Historiador/)).toBeNull();
  });

  it("sin muestras vivas todavía, lo dice — no confunde «recién montado» con «sin rango»", async () => {
    cortarLaRed();
    montar({ activo: "tanque" });

    // Justo al montar, el búfer de esta sesión aún no acumuló ni dos
    // lecturas: el mensaje tiene que ser el de sesión, no el genérico de
    // rango vacío del historiador.
    await waitFor(() => expect(screen.getAllByText("Sin muestras todavía en esta sesión.").length).toBeGreaterThan(0));
  });

  it("elegir «Ayer» cambia la insignia a «Historiador»", async () => {
    cortarLaRed();
    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Ayer" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ayer" }));

    await waitFor(() => expect(screen.getAllByText(/Historiador/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Sesión actual/)).toBeNull();
  });
});

describe("selector de rango: el calendario personalizado", () => {
  it("«Aplicar» está deshabilitado hasta elegir los dos días, y confirmar cierra y marca Personalizado", async () => {
    cortarLaRed();
    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("button", { name: /Personalizado/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));

    const aplicar = await waitFor(() => screen.getByRole("button", { name: "Aplicar" }));
    expect(aplicar.disabled).toBe(true);

    // Dos días distintos del mes visible (hoy y dos días antes), evitando
    // los bordes del mes para no cruzar a una celda vacía.
    const hoy = new Date();
    const diaValido = (delta) => {
      const d = new Date(hoy);
      d.setDate(d.getDate() - delta);
      return d.getDate() > 3 ? d : null; // se salta si cae cerca del inicio de mes
    };
    const diaFin = diaValido(0) ?? hoy;
    const diaInicio = diaValido(2) ?? hoy;

    fireEvent.click(screen.getByRole("button", { name: String(diaInicio.getDate()) }));
    fireEvent.click(screen.getByRole("button", { name: String(diaFin.getDate()) }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar" }).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    // El popover se cierra (el botón "Aplicar" ya no está) y "Personalizado"
    // queda como el acceso activo.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Aplicar" })).toBeNull());
    expect(screen.getByRole("button", { name: /Personalizado/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("marca con un punto de acento los días que sí tienen muestras del historiador", async () => {
    // El simulador genera dato continuo para cualquier día pasado de una
    // señal historizada (Plan 9: es función del reloj, sin límite inferior),
    // así que un día de ayer dentro del mes visible tiene que quedar
    // marcado en cuanto la consulta del mes resuelva.
    cortarLaRed();
    montar({ activo: "tanque" });

    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: /Personalizado/ })));

    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    // Si ayer cruzó a otro mes (hoy es día 1), se usa hoy mismo: sigue
    // dentro del mes visible por defecto y también debería tener dato.
    const diaSonda = ayer.getMonth() === hoy.getMonth() ? ayer : hoy;

    const boton = await waitFor(() => screen.getByRole("button", { name: String(diaSonda.getDate()) }));

    await waitFor(() => {
      const punto = boton.querySelector("span");
      expect(punto).toBeTruthy();
      expect(punto.style.background).not.toBe("transparent");
    });
  });

  it("«Cancelar» cierra sin tocar el rango vigente", async () => {
    cortarLaRed();
    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("button", { name: /Personalizado/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull());
    expect(screen.getByRole("button", { name: "Tiempo real" }).getAttribute("aria-pressed")).toBe("true");
  });
});
