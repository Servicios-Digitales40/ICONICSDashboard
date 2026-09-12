// @vitest-environment jsdom
/**
 * turno-eva.test.jsx — Plan 25 F2 (`NUE-01`).
 *
 * ── LAS TRES AFIRMACIONES QUE ESTA PANTALLA TIENE QUE CUMPLIR ──────
 *
 *  1. **No se inventa un turno.** Con `IA_TURNOS` configurado lee ESE horario;
 *     sin él, dice que no están configurados y nombra la variable. Un turno
 *     inventado devolvería datos verdaderos de las horas equivocadas.
 *  2. **Una fuente caída no vacía las otras dos.** Es lo que separa «el turno
 *     estuvo tranquilo» de «no pude preguntar», y sin esta prueba la diferencia
 *     desaparece en cuanto alguien toque el orden de los `useEffect`.
 *  3. **Un turno sin nada lo dice**, en vez de tres bloques vacíos que se leen
 *     como una pantalla rota.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataSourceProvider } from "@/lib/datasource";
import { ThemeProvider } from "@/theme";

const { fetchHealth, leerDiario, listarCasos, leerAlarmas } = vi.hoisted(() => ({
  fetchHealth: vi.fn(),
  leerDiario: vi.fn(),
  listarCasos: vi.fn(),
  leerAlarmas: vi.fn(),
}));

vi.mock("@/lib/iconics", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchHealth,
}));
vi.mock("@/lib/api/diarioApi.js", () => ({ leerDiario }));
vi.mock("@/lib/api/casosApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listarCasos,
}));
vi.mock("@/Demo-EVA/data/comunes/alarmas.js", async (importOriginal) => ({
  ...(await importOriginal()),
  leerAlarmas,
  ALARMAS_HISTORIZABLES: ["presionAlta"],
}));

import TurnoEva from "@/Demo-EVA/views/comunes/TurnoEva.jsx";

/** Todo en silencio y sin fallos: el suelo de cada prueba. */
function enCalma() {
  fetchHealth.mockResolvedValue({ turnos: {} });
  leerDiario.mockResolvedValue({ ok: true, entradas: [], total: 0, cursor: null, podas: 0 });
  listarCasos.mockResolvedValue({ ok: true, casos: [] });
  leerAlarmas.mockResolvedValue({ eventos: [], clave: "presionAlta" });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <TurnoEva />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("de dónde sale «un turno»", () => {
  it("con IA_TURNOS configurado, usa ESE horario y lo llama por su nombre", async () => {
    enCalma();
    // 6-14 / 14-22 / 22-6: sea cual sea la hora a la que corran las pruebas,
    // alguno de los tres cubre el instante, así que no hay reloj que simular.
    fetchHealth.mockResolvedValue({
      turnos: { manana: [6, 14], tarde: [14, 22], noche: [22, 6] },
    });

    montar();

    await waitFor(() => expect(leerDiario).toHaveBeenCalled());
    expect(screen.queryByText(/no están configurados/i)).toBeNull();
    expect(screen.getByText(/Turno de (mañana|tarde|noche)/)).toBeTruthy();
  });

  it("SIN turnos configurados lo dice, y nombra la variable que los configura", async () => {
    /*
     * §4.6: un mensaje dice qué falta y cómo resolverlo. Y sobre todo, la
     * ventana NO se llama «turno»: se llama «últimas 8 h», que es lo que es.
     */
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText(/no están configurados/i)).toBeTruthy());
    expect(screen.getByText(/IA_TURNOS/)).toBeTruthy();
    expect(screen.getByText(/Últimas 8 h/)).toBeTruthy();
    expect(screen.queryByText(/Turno de mañana/)).toBeNull();
  });

  it("pide cada fuente con la MISMA ventana que anuncia", async () => {
    enCalma();
    montar();

    await waitFor(() => expect(leerDiario).toHaveBeenCalled());
    const { desde, hasta } = leerDiario.mock.calls[0][0];

    expect(desde).toBeInstanceOf(Date);
    expect(hasta).toBeInstanceOf(Date);
    // Ocho horas, que es lo que dice el rótulo. Un rango distinto del anunciado
    // sería la misma mentira que un turno inventado, con otro nombre.
    expect(hasta.getTime() - desde.getTime()).toBeCloseTo(8 * 3_600_000, -4);
  });
});

describe("una fuente caída no vacía las otras dos", () => {
  it("si el diario falla, las alarmas y los casos se siguen viendo", async () => {
    /*
     * La prueba central. Sin ella, un backend sin diario haría creer que el
     * turno estuvo tranquilo — que es exactamente lo que esta pantalla existe
     * para no decir.
     */
    enCalma();
    leerDiario.mockRejectedValue(new Error("ECONNREFUSED"));
    listarCasos.mockResolvedValue({
      ok: true,
      casos: [{ id: "c1", fecha: new Date().toISOString(), sintoma: "La bomba vibraba" }],
    });

    montar();

    await waitFor(() => expect(screen.getByText(/La bomba vibraba/)).toBeTruthy());
    // Y el bloque que falló lo DICE: no se queda en blanco.
    expect(screen.queryByText(/Nadie accionó nada/)).toBeNull();
  });

  it("si una alarma de varias no se puede leer, se avisa de que la lista está incompleta", async () => {
    enCalma();
    leerAlarmas.mockRejectedValue(new Error("historiador caído"));

    montar();

    await waitFor(() => expect(screen.getByText(/no se pudieron leer/i)).toBeTruthy());
  });

  it("con TODAS las alarmas caídas no se dice «ninguna alarma entró»", async () => {
    /*
     * El fallo que destapó la prueba de arriba mientras se escribía: al contar
     * sólo los eventos, cero eventos por fallo total se pintaba igual que cero
     * eventos por calma. Un historiador caído se leía como un turno limpio, que
     * es el error que esta pantalla entera existe para no cometer (§2.4).
     */
    enCalma();
    leerAlarmas.mockRejectedValue(new Error("historiador caído"));

    montar();

    await waitFor(() => expect(screen.getByText(/no se pudieron leer/i)).toBeTruthy());
    expect(screen.queryByText(/Ninguna alarma entró/)).toBeNull();
    expect(screen.queryByText(/Sin accionamientos, alarmas ni casos/)).toBeNull();
  });
});

describe("la línea de tiempo no cruza las dos máquinas (NO_COMPARTEN)", () => {
  it("hay UNA línea por máquina, cada una con su nombre", async () => {
    /*
     * Y no un eje común aunque quepa: dos marcas alineadas en la misma vertical
     * se leen como relacionadas aunque nadie lo diga, y estas dos instalaciones
     * tienen PLC distinto y no comparten nada.
     */
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText("Línea de tiempo")).toBeTruthy());
    // Los nombres salen del dominio (`machines.json`), no de esta pantalla.
    expect(screen.getByText("Sistema de agua industrial")).toBeTruthy();
    expect(screen.getByText("Sistema de vibraciones")).toBeTruthy();
  });

  it("un caso del TANQUE no aparece en la línea de vibraciones", async () => {
    enCalma();
    listarCasos.mockResolvedValue({
      ok: true,
      casos: [
        {
          id: "c1",
          sistema: "tanque",
          fecha: new Date().toISOString(),
          sintoma: "SoloDelTanque",
        },
      ],
    });

    const { container } = montar();

    await waitFor(() => expect(screen.getByText(/SoloDelTanque/)).toBeTruthy());
    // Una sola marca en los ejes: la del tanque. Si saliera en los dos, serían dos.
    const marcas = container.querySelectorAll('[title*="SoloDelTanque"]');
    expect(marcas).toHaveLength(1);
  });

  it("las alarmas de vibraciones se declaran como «no hay», no como carril vacío", async () => {
    /*
     * Las nueve alarmas del catálogo son del tanque. En vibraciones ese carril
     * está vacío porque no hay nada que consultar, no porque no haya saltado
     * nada — y decir «sin hechos» ahí afirmaría que se miró.
     */
    enCalma();
    montar();

    await waitFor(() => expect(screen.getByText(/no hay alarmas declaradas/i)).toBeTruthy());
  });
});

describe("vacío y roto no son lo mismo", () => {
  it("un turno sin nada lo dice UNA vez, no con tres bloques mudos", async () => {
    enCalma();
    montar();

    await waitFor(() =>
      expect(screen.getByText(/Sin accionamientos, alarmas ni casos/)).toBeTruthy()
    );
  });

  it("con datos NO aparece el mensaje de turno tranquilo", async () => {
    enCalma();
    leerDiario.mockResolvedValue({
      ok: true,
      entradas: [{ instante: new Date().toISOString(), accion: "encender", resultado: "cumplida", usuario: "ana" }],
      total: 1, cursor: null, podas: 0,
    });

    montar();

    await waitFor(() => expect(screen.getByText("encender")).toBeTruthy());
    expect(screen.queryByText(/Sin accionamientos, alarmas ni casos/)).toBeNull();
  });

  it("una poda se avisa: «no pasó nada» y «ya no se guarda» son distintos", async () => {
    enCalma();
    leerDiario.mockResolvedValue({
      ok: true,
      entradas: [{ instante: new Date().toISOString(), accion: "encender" }],
      total: 1, cursor: null, podas: 1,
    });

    montar();

    await waitFor(() => expect(screen.getByText(/se podó por tamaño/)).toBeTruthy());
  });
});
