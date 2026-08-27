// @vitest-environment jsdom
/**
 * theme.test.jsx
 * ------------------------------------------------------------------
 * El interruptor de tema, con sus tres modos (claro, oscuro, Mitsubishi
 * Electric). Monta el `ThemeProvider` real con un consumidor mínimo real —
 * sin doble de `useTheme()` — y comprueba lo que un componente cualquiera de
 * la app da por hecho al pedir el tema.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";

afterEach(cleanup);

function SondaTema() {
  const { theme, dark, modo, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="modo">{modo}</span>
      <span data-testid="dark">{String(dark)}</span>
      <span data-testid="accent">{theme.accent}</span>
      <button onClick={toggleTheme}>cambiar</button>
    </div>
  );
}

const montar = () => render(<ThemeProvider><SondaTema /></ThemeProvider>);

describe("el interruptor de tema", () => {
  it("arranca en oscuro, y el ciclo va claro → oscuro → Mitsubishi → claro", () => {
    montar();

    // Arranque: oscuro, como siempre lo fue antes del tercer tema.
    expect(screen.getByTestId("modo").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(screen.getByText("cambiar"));
    expect(screen.getByTestId("modo").textContent).toBe("mitsubishi");
    expect(document.documentElement.getAttribute("data-theme")).toBe("mitsubishi");

    fireEvent.click(screen.getByText("cambiar"));
    expect(screen.getByTestId("modo").textContent).toBe("light");

    fireEvent.click(screen.getByText("cambiar"));
    expect(screen.getByTestId("modo").textContent).toBe("dark");
  });

  it("«dark» sigue siendo booleano y sólo es cierto en el modo oscuro — Mitsubishi es de superficie clara", () => {
    montar();
    expect(screen.getByTestId("dark").textContent).toBe("true"); // arranque: dark

    fireEvent.click(screen.getByText("cambiar")); // → mitsubishi
    expect(screen.getByTestId("dark").textContent).toBe("false");

    fireEvent.click(screen.getByText("cambiar")); // → light
    expect(screen.getByTestId("dark").textContent).toBe("false");
  });

  it("el acento de Mitsubishi es su rojo real, y nunca el mismo tono que la alarma coral", () => {
    montar();
    fireEvent.click(screen.getByText("cambiar")); // → mitsubishi

    expect(screen.getByTestId("accent").textContent).toBe("#C40001");
  });
});
