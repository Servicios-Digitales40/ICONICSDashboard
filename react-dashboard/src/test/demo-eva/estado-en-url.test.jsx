// @vitest-environment jsdom
/**
 * estado-en-url.test.jsx
 * ------------------------------------------------------------------
 * Plan 24, F4 (`USO-02`): que el estado que merece viajar, viaje — y que el
 * que no, no lo haga.
 *
 * ── LAS DOS MITADES, Y LA SEGUNDA ES LA QUE SE OLVIDA ───────────────
 *
 * El mecanismo (`app/routes/useNavegacion.js`) estaba hecho desde antes de este
 * plan, y bien: History API, normalización de la URL de arranque, `popstate`, y
 * un filtro que sólo deja pasar cadenas, números y booleanos. Lo que faltaba era
 * la ADOPCIÓN por vista, y adoptar tiene dos caras:
 *
 *   1. que un filtro elegido se pueda enviar por chat o dejar en un kiosco;
 *   2. que un texto a medio escribir NO acabe en el historial del navegador.
 *
 * La segunda no la echa nadie en falta hasta que el botón «atrás» necesita ocho
 * pulsaciones para salir de una pantalla, así que se prueba explícitamente.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import CasosRag from "@/Demo-EVA/views/comunes/CasosRag.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete globalThis.fetch;
});

/** Un servidor con dos casos: uno activo y uno archivado. */
function servidorConCasos() {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        ok: true,
        casos: [
          {
            id: "c1", fecha: "2026-09-01T10:00:00.000Z", sistema: "tanque",
            sintoma: "Caso vivo", origen: "chat", resuelto: true, archivado: false,
          },
          {
            id: "c2", fecha: "2026-08-01T10:00:00.000Z", sistema: "tanque",
            sintoma: "Caso guardado", origen: "voz", resuelto: true, archivado: true,
          },
        ],
      }),
  }));
}

const montar = (params, onNavigate = () => {}) =>
  render(
    <ThemeProvider>
      <CasosRag params={params} onNavigate={onNavigate} />
    </ThemeProvider>
  );

beforeEach(servidorConCasos);

describe("el filtro llega desde la URL, así que un enlace abre lo que prometía", () => {
  it("sin parámetro, arranca en «activos» — el de siempre", async () => {
    montar({});

    await waitFor(() => expect(screen.getByText("Caso vivo")).toBeTruthy());
    expect(screen.queryByText("Caso guardado")).toBeNull();
  });

  it("`?filtro=archivados` abre ya filtrado, sin tocar nada", async () => {
    montar({ filtro: "archivados" });

    await waitFor(() => expect(screen.getByText("Caso guardado")).toBeTruthy());
    // Y el activo NO está: el enlace no abre «todos» con el filtro marcado.
    expect(screen.queryByText("Caso vivo")).toBeNull();
  });

  it("`?filtro=todos` enseña los dos", async () => {
    montar({ filtro: "todos" });

    await waitFor(() => expect(screen.getByText("Caso vivo")).toBeTruthy());
    expect(screen.getByText("Caso guardado")).toBeTruthy();
  });

  it("un filtro corrupto no deja la pantalla vacía", async () => {
    /*
     * Pasa con un favorito viejo después de renombrar un filtro. Mismo criterio
     * que `useNavegacion` aplica a una ruta desconocida: degradar a algo que
     * funcione, nunca a una pantalla en blanco.
     */
    montar({ filtro: "un-filtro-que-no-existe" });

    await waitFor(() => expect(screen.getByText("Caso vivo")).toBeTruthy());
    expect(screen.getByText("Caso guardado")).toBeTruthy();
  });
});

describe("lo que NO viaja a la URL, y es una decisión", () => {
  it("la búsqueda no navega: se escribe letra a letra", async () => {
    const onNavigate = vi.fn();
    montar({}, onNavigate);

    await waitFor(() => expect(screen.getByText("Caso vivo")).toBeTruthy());

    const caja = screen.getByRole("searchbox", { hidden: true })
      ?? document.querySelector('input[type="search"], input[placeholder]');
    expect(caja).toBeTruthy();

    /*
     * Ocho caracteres serían ocho entradas de historial con `pushState`, y salir
     * con «atrás» pediría ocho pulsaciones. El filtro son tres botones y cada
     * pulsación es una intención completa; teclear no lo es hasta que alguien
     * para.
     */
    caja.value = "bomba";
    caja.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onNavigate).not.toHaveBeenCalled();
  });
});
