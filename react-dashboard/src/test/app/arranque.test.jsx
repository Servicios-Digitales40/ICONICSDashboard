// @vitest-environment jsdom
/**
 * La ruta de arranque (Plan 42.5 F6, D19): un desvío al Inicio de la primera
 * máquina configurada en servicio, con `replace` para que «atrás» no vuelva a
 * él; sin máquinas lo dice y ofrece Configuración sólo a quien puede entrar;
 * mientras la lista no ha llegado, no decide nada.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let configuradas = { maquinas: [], listo: true, error: null };
let permisos = { esAdministrador: true, puedeOperar: true, puede: () => true, habilitada: true, rol: "administrador" };

vi.mock("@/Demo-EVA/data/comunes/MaquinasConfiguradas.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquinasConfiguradas: () => configuradas,
}));
vi.mock("@/app/providers/usePermisos.js", () => ({ usePermisos: () => permisos }));

import { ThemeProvider } from "@/theme";
import Arranque from "@/Demo-EVA/views/comunes/Arranque.jsx";

const montar = (onNavigate = vi.fn()) => {
  render(<ThemeProvider><Arranque onNavigate={onNavigate} /></ThemeProvider>);
  return onNavigate;
};

afterEach(() => {
  cleanup();
  configuradas = { maquinas: [], listo: true, error: null };
  permisos = { esAdministrador: true, puedeOperar: true, puede: () => true, habilitada: true, rol: "administrador" };
});

describe("con máquinas configuradas", () => {
  it("redirige al Inicio de la PRIMERA en servicio, con `replace`, y no pinta nada más", () => {
    configuradas = { maquinas: [{ id: "vib-motor-03", nombre: "Nuevo-Modor" }, { id: "vib-bomba-07", nombre: "Bomba" }], listo: true, error: null };
    const onNavigate = montar();

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("maq-inicio", { maquina: "vib-motor-03" }, { replace: true });
    expect(screen.queryByText(/Ninguna máquina configurada/)).toBeNull();
  });

  it("mientras la lista no ha llegado, no decide: dice que busca y no navega", () => {
    configuradas = { maquinas: [], listo: false, error: null };
    const onNavigate = montar();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByText(/Buscando la primera máquina/)).toBeTruthy();
    expect(screen.queryByText(/Ninguna máquina configurada/)).toBeNull();
  });
});

describe("sin ninguna configurada", () => {
  it("lo dice, y a quien administra le ofrece Configuración", () => {
    const onNavigate = montar();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByText("Ninguna máquina configurada en servicio")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ir a Configuración/ }));
    expect(onNavigate).toHaveBeenCalledWith("eva-configuracion");
  });

  it("a quien no administra le dice a quién pedírselo, sin un botón que va a fallar", () => {
    permisos = { ...permisos, esAdministrador: false, rol: "visualizador" };
    montar();

    expect(screen.getByText(/Pide a un administrador/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ir a Configuración/ })).toBeNull();
  });

  it("si la lista no se pudo leer, se dice el error, no «no hay máquinas»", () => {
    configuradas = { maquinas: [], listo: true, error: new Error("el puente no contesta") };
    montar();

    expect(screen.getByText("No se pudo leer la lista de máquinas")).toBeTruthy();
    expect(screen.queryByText("Ninguna máquina configurada en servicio")).toBeNull();
  });
});
