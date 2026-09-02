// @vitest-environment jsdom
/**
 * detalle-activo-simulada.test.jsx
 * ------------------------------------------------------------------
 * La vista «Detalle de activo» (`views/tanque/DetalleActivo.jsx`), con el origen
 * **Simulado**, para los cuatro activos.
 *
 * Mismo criterio que `planta-simulada.test.jsx`: montar la vista real sobre
 * el provider real, sin red, y comprobar que pinta para los cuatro activos, y
 * que un activo sin señal historizada (Bombeo, Eléctrico) lo dice en vez de
 * fingir un histórico que no tiene.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import DetalleActivo from "@/Demo-EVA/views/tanque/DetalleActivo.jsx";

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
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

const montar = (params, onNavigate = () => {}) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <DetalleActivo params={params} onNavigate={onNavigate} />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Detalle de activo en modo simulado", () => {
  it.each(["tanque", "bombeo", "distribucion", "electrico"])(
    "pinta el activo «%s», sin tocar la red",
    async (activo) => {
      const fetchTrampa = cortarLaRed();

      montar({ activo });

      await waitFor(() => expect(screen.getByText(/^Detalle ·/)).toBeTruthy(), { timeout: 4_000 });
      expect(fetchTrampa).not.toHaveBeenCalled();
    }
  );

  it("Bombeo no afirma «Historiador»: ninguna de sus dos señales tiene serie propia", async () => {
    const fetchTrampa = cortarLaRed();

    montar({ activo: "bombeo" });

    await waitFor(() => expect(screen.getByText(/^Detalle ·/)).toBeTruthy(), { timeout: 4_000 });
    expect(screen.queryByText(/Historiador/)).toBeNull();

    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("Tanque sí afirma «Historiador»: sus dos señales tienen serie propia", async () => {
    // El selector de rango (Plan 11) arranca en «Tiempo real», que lee del
    // búfer de sesión — ahí la insignia dice «Sesión actual», con razón.
    // Para probar que la señal SÍ tiene serie propia hay que mirarla contra
    // el historiador de verdad, así que se elige «Ayer» primero.
    const fetchTrampa = cortarLaRed();

    montar({ activo: "tanque" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Ayer" })).toBeTruthy(), { timeout: 4_000 });
    fireEvent.click(screen.getByRole("button", { name: "Ayer" }));

    await waitFor(() => expect(screen.getAllByText(/Historiador/).length).toBeGreaterThan(0), { timeout: 4_000 });

    expect(fetchTrampa).not.toHaveBeenCalled();
  });

  it("las cuatro pestañas están presentes, y elegir una navega a ese activo", async () => {
    cortarLaRed();
    const onNavigate = vi.fn();

    montar({ activo: "tanque" }, onNavigate);

    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy(), { timeout: 4_000 });

    const pestañas = screen.getAllByRole("tab");
    expect(pestañas.map((p) => p.textContent)).toEqual(["Tanque", "Bombeo", "Distribución", "Eléctrico"]);

    fireEvent.click(screen.getByRole("tab", { name: "Bombeo" }));
    // Plan 13 F7: el rango viaja también, para que cambiar de pestaña no lo
    // borre de la URL — "vivo" es el valor por defecto sin nada elegido aún.
    expect(onNavigate).toHaveBeenCalledWith("eva-detalle", { activo: "bombeo", rango: "vivo" });
  });
});

describe("Plan 13 F7: el rango sobrevive en la URL", () => {
  it("un enlace con ?rango=ayer abre ya con «Ayer» seleccionado, no en Tiempo real", async () => {
    cortarLaRed();
    montar({ activo: "tanque", rango: "ayer" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Ayer" })).toBeTruthy(), { timeout: 4_000 });
    expect(screen.getByRole("button", { name: "Ayer" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("un enlace con rango personalizado reconstruye las dos fechas, sin volver a preguntar", async () => {
    cortarLaRed();
    montar({ activo: "tanque", rango: "personalizado", desde: "2026-08-10", hasta: "2026-08-12" });

    await waitFor(
      () => expect(screen.getByRole("button", { name: /Personalizado/ }).getAttribute("aria-pressed")).toBe("true"),
      { timeout: 4_000 }
    );
  });

  it("un ?rango= desconocido no revienta la vista: cae en Tiempo real", async () => {
    cortarLaRed();
    montar({ activo: "tanque", rango: "el-mes-pasado" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Tiempo real" })).toBeTruthy(), { timeout: 4_000 });
    expect(screen.getByRole("button", { name: "Tiempo real" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("personalizado sin desde/hasta, o con fechas que no parsean, cae en Tiempo real igual", async () => {
    cortarLaRed();
    montar({ activo: "tanque", rango: "personalizado", desde: "no-es-una-fecha", hasta: "tampoco" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Tiempo real" })).toBeTruthy(), { timeout: 4_000 });
    expect(screen.getByRole("button", { name: "Tiempo real" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("elegir «Ayer» escribe el rango en la URL, junto con el activo", async () => {
    cortarLaRed();
    const onNavigate = vi.fn();
    montar({ activo: "tanque" }, onNavigate);

    await waitFor(() => expect(screen.getByRole("button", { name: "Ayer" })).toBeTruthy(), { timeout: 4_000 });
    fireEvent.click(screen.getByRole("button", { name: "Ayer" }));

    expect(onNavigate).toHaveBeenCalledWith("eva-detalle", { activo: "tanque", rango: "ayer" });
  });

  it("cambiar de pestaña con «Ayer» ya elegido conserva el rango — no lo resetea a vivo", async () => {
    cortarLaRed();
    const onNavigate = vi.fn();
    montar({ activo: "tanque", rango: "ayer" }, onNavigate);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Bombeo" })).toBeTruthy(), { timeout: 4_000 });
    fireEvent.click(screen.getByRole("tab", { name: "Bombeo" }));

    expect(onNavigate).toHaveBeenCalledWith("eva-detalle", { activo: "bombeo", rango: "ayer" });
  });

  it("aplicar un rango personalizado desde el calendario escribe desde/hasta como texto en la URL", async () => {
    cortarLaRed();
    const onNavigate = vi.fn();
    montar({ activo: "tanque" }, onNavigate);

    await waitFor(() => expect(screen.getByRole("button", { name: /Personalizado/ })).toBeTruthy(), { timeout: 4_000 });
    fireEvent.click(screen.getByRole("button", { name: /Personalizado/ }));

    // Dos días distintos y no futuros, dentro de un mismo mes visible.
    //
    // Cerca del día 1-3 del mes, «hoy menos unos días» cae en el mes
    // ANTERIOR, y el número de día que produce (28-31) es grande — coincide
    // con la comprobación `> 3` aunque esa fecha no esté en el mes que el
    // calendario tiene abierto. El calendario sólo pinta el mes visible, así
    // que el clic caía sobre el mismo NÚMERO de día pero de ESTE mes (un día
    // futuro, deshabilitado) y no hacía nada: «fin» nunca se completaba y
    // «Aplicar» se quedaba deshabilitado para siempre.
    //
    // Si hoy no da margen dentro de su propio mes, se retrocede uno con «Mes
    // anterior»: ahí ningún día es futuro y sobran candidatos.
    const hoy = new Date();
    let diaInicio, diaFin;
    if (hoy.getDate() > 3) {
      diaFin = hoy;
      diaInicio = new Date(hoy);
      diaInicio.setDate(diaInicio.getDate() - 2);
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
      diaInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 10);
      diaFin = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15);
    }

    fireEvent.click(await screen.findByRole("button", { name: String(diaInicio.getDate()) }));
    fireEvent.click(screen.getByRole("button", { name: String(diaFin.getDate()) }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Aplicar" }).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(onNavigate).toHaveBeenCalledWith("eva-detalle", {
      activo: "tanque",
      rango: "personalizado",
      // "2026-08-19", nunca un objeto Date: useNavegacion lo descartaría de la URL.
      desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      hasta: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("«atrás»/«adelante» del navegador (params nuevos, mismo montaje) re-sincroniza el rango", async () => {
    // `Shell` no desmonta `DetalleActivo` al cambiar sólo los parámetros
    // (su `key` es `nav.page`) — así que un popstate real llega como un
    // rerender con `params` distintos, no como un montaje nuevo.
    cortarLaRed();
    const { rerender } = montar({ activo: "tanque", rango: "vivo" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Tiempo real" })).toBeTruthy(), { timeout: 4_000 });
    expect(screen.getByRole("button", { name: "Tiempo real" }).getAttribute("aria-pressed")).toBe("true");

    rerender(
      <ThemeProvider>
        <DataSourceProvider>
          <EvaProvider>
            <DetalleActivo params={{ activo: "tanque", rango: "ayer" }} onNavigate={() => {}} />
          </EvaProvider>
        </DataSourceProvider>
      </ThemeProvider>
    );

    await waitFor(
      () => expect(screen.getByRole("button", { name: "Ayer" }).getAttribute("aria-pressed")).toBe("true"),
      { timeout: 4_000 }
    );
  });
});
