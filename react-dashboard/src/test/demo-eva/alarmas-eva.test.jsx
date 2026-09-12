// @vitest-environment jsdom
/**
 * alarmas-eva.test.jsx
 * ------------------------------------------------------------------
 * La pestaña «Historial» de la vista de Alarmas.
 *
 * ── POR QUÉ ESTA SUITE CAMBIÓ ENTERA (12-09-2026) ──────────────────
 *
 * Porque cambió la fuente. Esta pantalla pedía a `/AlarmHistory` y probaba el
 * acuse; medido con `scripts/sondear-alarmas.mjs` contra `bms-server`, ese
 * endpoint devuelve **500** — esta instalación no tiene Alarm Historian.
 *
 * Lo que sí hay es Hyper Historian con las nueve alarmas historizadas como
 * booleanos, así que los eventos se DERIVAN de los flancos de esa serie. Se
 * mockea `leerAlarmas` —la capa de datos— y no `fetch`: lo que se prueba aquí
 * es el cableado de la vista, y la derivación ya tiene su propia suite en
 * `eventos-de-alarma.test.js`.
 *
 * Y por eso desaparecieron las pruebas del acuse: reconocer es una operación
 * del Alarm Server sobre un `eventId` suyo, y un flanco no lo tiene. No es que
 * se hayan dejado de probar — es que el botón ya no existe, y hay una prueba
 * de que NO está.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { leerAlarmas, ALARMAS_HISTORIZABLES } = vi.hoisted(() => ({
  leerAlarmas: vi.fn(async () => ({ eventos: [], clave: "nivelAltoAlto", hasMore: false })),
  ALARMAS_HISTORIZABLES: ["nivelAltoAlto", "presionAlta", "bajoFlujo"],
}));

vi.mock("@/Demo-EVA/data/comunes/alarmas.js", async (importOriginal) => ({
  ...(await importOriginal()),
  leerAlarmas,
  ALARMAS_HISTORIZABLES,
}));

import AlarmasEva from "@/Demo-EVA/views/comunes/AlarmasEva.jsx";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () => render(<ThemeProvider><AlarmasEva /></ThemeProvider>);

const T0 = new Date("2026-09-11T02:00:00.000Z");
const min = (n) => new Date(T0.getTime() + n * 60_000);

/** Un evento ya derivado, como lo devuelve `eventosDeAlarma`. */
const evento = ({ inicio, fin, activa = false, desdeAntes = false }) => ({
  inicio,
  fin,
  duracionMs: fin ? fin.getTime() - inicio.getTime() : null,
  activa,
  desdeAntes,
});

const conEventos = (eventos) =>
  leerAlarmas.mockResolvedValue({ eventos, clave: "nivelAltoAlto", hasMore: false });

describe("la lista de eventos derivados", () => {
  it("sin eventos en la ventana, lo dice — no una tabla vacía muda", async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Sin eventos en esta ventana/)).toBeTruthy());
  });

  it("un evento cerrado enseña su entrada, su salida y su duración", async () => {
    conEventos([evento({ inicio: min(0), fin: min(4) })]);
    montar();

    await waitFor(() => expect(screen.getByText("4 min")).toBeTruthy());
  });

  it("se ordenan del más reciente al más antiguo", async () => {
    conEventos([
      evento({ inicio: min(0), fin: min(2) }),   // el viejo, 2 min
      evento({ inicio: min(30), fin: min(39) }), // el nuevo, 9 min
    ]);
    montar();

    await waitFor(() => expect(screen.getByText("9 min")).toBeTruthy());
    const filas = screen.getAllByText(/^\d+ min$/).map((n) => n.textContent);
    expect(filas).toEqual(["9 min", "2 min"]);
  });

  it("un fallo de red se cuenta como fallo, no como «sin eventos»", async () => {
    leerAlarmas.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    montar();

    await waitFor(() => expect(screen.getByText(/No se pudo leer el historial/)).toBeTruthy());
    expect(screen.queryByText(/Sin eventos/)).toBeNull();
  });
});

describe("lo que sigue activo no se cierra con una hora inventada", () => {
  it("una alarma aún activa lo dice, y no enseña duración", async () => {
    /*
     * La aserción que protege §2.4 en la pantalla: poner una duración
     * afirmaría que terminó. Es además el caso que más importa de la lista —
     * la alarma que sigue sonando.
     */
    conEventos([evento({ inicio: min(0), fin: null, activa: true })]);
    montar();

    await waitFor(() => expect(screen.getByText(/sigue activa/)).toBeTruthy());
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("una que venía de antes de la ventana se marca, para no dar su hora por exacta", async () => {
    conEventos([evento({ inicio: min(0), fin: min(5), desdeAntes: true })]);
    montar();

    await waitFor(() => expect(screen.getByText(/venía de antes/)).toBeTruthy());
  });
});

describe("el selector de alarma, y la ventana", () => {
  it("arranca pidiendo la primera alarma del catálogo, no una lista vacía", async () => {
    montar();

    await waitFor(() => expect(leerAlarmas).toHaveBeenCalled());
    expect(leerAlarmas.mock.calls[0][1]).toBe("nivelAltoAlto");
  });

  it("cambiar de alarma vuelve a pedir, con la clave nueva", async () => {
    montar();
    await waitFor(() => expect(leerAlarmas).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "presionAlta" } });

    await waitFor(() => expect(leerAlarmas).toHaveBeenCalledTimes(2));
    expect(leerAlarmas.mock.calls[1][1]).toBe("presionAlta");
  });

  it("cambiar de ventana vuelve a pedir con las horas nuevas", async () => {
    montar();
    await waitFor(() => expect(leerAlarmas).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "6 horas" }));

    await waitFor(() => expect(leerAlarmas).toHaveBeenCalledTimes(2));
    expect(leerAlarmas.mock.calls[1][0]).toBe(6);
  });
});

describe("no se ofrece lo que no se puede hacer", () => {
  it("NO hay botón de reconocer: un flanco no tiene eventId del Alarm Server", async () => {
    /*
     * La prueba que sustituye a las tres del acuse. Sin ella, alguien podría
     * volver a añadir el botón «porque antes estaba» y la suite no diría nada —
     * y el botón fallaría siempre contra este servidor.
     */
    conEventos([evento({ inicio: min(0), fin: min(4) })]);
    montar();

    await waitFor(() => expect(screen.getByText("4 min")).toBeTruthy());

    expect(screen.queryByRole("button", { name: /Reconocer/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("la pantalla dice de dónde salen estos eventos", async () => {
    // Que no son del Alarm Server, y por eso no traen mensaje ni severidad.
    montar();
    await waitFor(() => expect(screen.getByText(/se derivan de la serie/)).toBeTruthy());
  });
});
