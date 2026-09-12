// @vitest-environment jsdom
/**
 * criterio-tactil.test.jsx
 * ------------------------------------------------------------------
 * Plan 24, F8 (`USO-08`): que los controles se puedan pulsar con guantes.
 *
 * ── QUÉ SE PUEDE PROBAR DE VERDAD AQUÍ, Y QUÉ NO ───────────────────
 *
 * jsdom no hace layout: `getBoundingClientRect()` devuelve ceros, así que la
 * altura REAL pintada no se puede medir ni aquí ni en `design:detect` (ver
 * `DESIGN.md` § «Lo que no se comprueba automáticamente»). Prometer que esta
 * suite mide píxeles sería justo el verificador que finge medir lo que no puede.
 *
 * Lo que SÍ se puede comprobar, y es lo que impide la regresión real: que el
 * estilo declarado lleve el suelo táctil. El fallo que esto ataja es que alguien
 * quite el `minHeight` del kit «porque el padding ya da bastante» — que es
 * exactamente lo que se creía antes de medirlo (36 px, no 44).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/theme";
import { Button } from "@/components/ui/Button.jsx";

afterEach(cleanup);

const montar = (props) =>
  render(
    <ThemeProvider>
      <Button {...props}>Accionar</Button>
    </ThemeProvider>
  );

/** El mínimo de `DESIGN.md` § Criterio táctil. */
const MIN = 44;

describe("todo botón del kit nace con el suelo táctil", () => {
  it("la altura mínima está declarada, no dejada al padding", () => {
    montar({});
    const boton = screen.getByRole("button");

    expect(parseFloat(boton.style.minHeight)).toBeGreaterThanOrEqual(MIN);
  });

  it("todas las variantes lo heredan: el suelo está en el `base`, no por variante", () => {
    for (const variant of ["primary", "danger-solid", "secondary", "ghost", "danger", "success"]) {
      cleanup();
      montar({ variant });
      expect(
        parseFloat(screen.getByRole("button").style.minHeight),
        `la variante ${variant} no llega al mínimo`
      ).toBeGreaterThanOrEqual(MIN);
    }
  });

  it("la variante `icon` es cuadrada, así que también declara ancho mínimo", () => {
    /*
     * Sin esto daba 32 px de ancho con 44 de alto. Un objetivo de 32 × 44 no es
     * un objetivo de 44: el dedo falla por el lado estrecho.
     */
    montar({ variant: "icon" });
    const boton = screen.getByRole("button");

    expect(parseFloat(boton.style.minWidth)).toBeGreaterThanOrEqual(MIN);
    expect(parseFloat(boton.style.minHeight)).toBeGreaterThanOrEqual(MIN);
  });

  it("el suelo no borra el padding: la forma sigue saliendo de él", () => {
    // `DESIGN.md` es explícito en que la altura del botón no es fija. El
    // `minHeight` pone un suelo; no sustituye la regla de forma.
    montar({});
    expect(screen.getByRole("button").style.padding).toBeTruthy();
  });

  it("un botón inactivo conserva su área: no se encoge al deshabilitarse", () => {
    // Un control que cambia de tamaño al desactivarse mueve lo que tiene al
    // lado, y en una pantalla táctil eso desplaza el objetivo de al lado.
    montar({ disabled: true });
    expect(parseFloat(screen.getByRole("button").style.minHeight)).toBeGreaterThanOrEqual(MIN);
  });
});
