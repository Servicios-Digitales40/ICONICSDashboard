// @vitest-environment jsdom
/**
 * «Detalle» de una máquina configurada, punta a punta y con la red CORTADA
 * (Plan 42.5 F2/F4): es el espejo de lo que probaban `detalle-activo-simulada`
 * y `selector-rango` sobre el tanque, escrito sobre la vista genérica antes de
 * borrar aquéllas.
 *
 *  - El rango viaja en la URL y vuelve: `ayer`, `personalizado` con fechas,
 *    valores corruptos que degradan a «Tiempo real», y «atrás»/«adelante».
 *  - «Tiempo real» lee del búfer de la fuente (insignia «Sesión actual») y
 *    «Ayer» del historiador simulado («Historiador»), sin tocar `fetch`.
 *  - El calendario: «Aplicar» deshabilitado hasta dos días, los días con
 *    muestras marcados, «Cancelar» sin tocar el rango.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    { id: "S1", pointName: `${RAIZ}S1/`, nombre: "Lado acople" },
    { id: "S2", pointName: `${RAIZ}S2/` },
  ],
  variables: [
    medida("S1", "vRMS", true),
    medida("S1", "aRMS", false),
    medida("S2", "vRMS", true),
    medida("S2", "aRMS", false),
  ],
});
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
import DetalleMaquina from "@/Demo-EVA/views/maquina/DetalleMaquina.jsx";

function cortarLaRed() {
  globalThis.fetch = vi.fn(() => {
    throw new Error("el origen simulado no debe salir a la red");
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
  cortarLaRed();
});

afterEach(() => {
  cleanup();
  olvidarFuentesDeMaquina();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

const arbol = (params, onNavigate = () => {}) => (
  <ThemeProvider>
    <DataSourceProvider>
      <DetalleMaquina params={{ maquina: CONFIGURADA.id, ...params }} onNavigate={onNavigate} />
    </DataSourceProvider>
  </ThemeProvider>
);
const montar = (params = {}, onNavigate = () => {}) => render(arbol(params, onNavigate));

const boton = (nombre) => screen.getByRole("button", { name: nombre });
const esperarSelector = () => waitFor(() => expect(boton("Tiempo real")).toBeTruthy(), { timeout: 4_000 });

describe("el rango sobrevive en la URL", () => {
  it("?rango=ayer abre con «Ayer» pulsado; un rango desconocido cae en «Tiempo real»", async () => {
    montar({ activo: "S1", rango: "ayer" });
    await waitFor(() => expect(boton("Ayer").getAttribute("aria-pressed")).toBe("true"), { timeout: 4_000 });
    cleanup();
    olvidarFuentesDeMaquina();

    montar({ activo: "S1", rango: "el-mes-pasado" });
    await esperarSelector();
    expect(boton("Tiempo real").getAttribute("aria-pressed")).toBe("true");
  });

  it("un personalizado con fechas reconstruye el rango sin preguntar; con basura, cae en «Tiempo real»", async () => {
    montar({ activo: "S1", rango: "personalizado", desde: "2026-08-10", hasta: "2026-08-12" });
    await waitFor(() => expect(boton(/Personalizado/).getAttribute("aria-pressed")).toBe("true"), { timeout: 4_000 });
    cleanup();
    olvidarFuentesDeMaquina();

    montar({ activo: "S1", rango: "personalizado", desde: "no-es-una-fecha", hasta: "tampoco" });
    await esperarSelector();
    expect(boton("Tiempo real").getAttribute("aria-pressed")).toBe("true");
  });

  it("elegir «Ayer» escribe máquina, activo y rango en la URL; cambiar de pestaña conserva el rango", async () => {
    const onNavigate = vi.fn();
    montar({ activo: "S1" }, onNavigate);
    await esperarSelector();

    fireEvent.click(boton("Ayer"));
    expect(onNavigate).toHaveBeenCalledWith("maq-detalle", { maquina: CONFIGURADA.id, activo: "S1", rango: "ayer" });

    fireEvent.click(screen.getByRole("tab", { name: "S2" }));
    expect(onNavigate).toHaveBeenCalledWith("maq-detalle", { maquina: CONFIGURADA.id, activo: "S2", rango: "ayer" });
  });

  it("«atrás»/«adelante» (params nuevos, mismo montaje) re-sincroniza el rango", async () => {
    const { rerender } = montar({ activo: "S1", rango: "vivo" });
    await esperarSelector();
    expect(boton("Tiempo real").getAttribute("aria-pressed")).toBe("true");

    rerender(arbol({ activo: "S1", rango: "ayer" }));

    await waitFor(() => expect(boton("Ayer").getAttribute("aria-pressed")).toBe("true"), { timeout: 4_000 });
  });
});

describe("«Tiempo real» lee del búfer, «Ayer» del historiador simulado", () => {
  it("al entrar la insignia dice «Sesión actual», y tras elegir «Ayer» dice «Historiador», sin red", async () => {
    montar({ activo: "S1" });
    await esperarSelector();
    expect(screen.getAllByText(/Sesión actual/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Historiador$/)).toBeNull();

    fireEvent.click(boton("Ayer"));

    await waitFor(() => expect(screen.getAllByText(/^Historiador$/).length).toBeGreaterThan(0), { timeout: 4_000 });
    expect(screen.queryByText(/Sesión actual/)).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("la variable sin serie verificada no promete historiador ni en vivo ni en «Ayer»", async () => {
    montar({ activo: "S1", rango: "ayer" });
    await waitFor(() => expect(screen.getAllByText(/^Historiador$/).length).toBeGreaterThan(0), { timeout: 4_000 });
    /* Dos variables en S1: vRMS (verificada) y aRMS (no). Una sola insignia de historiador. */
    expect(screen.getAllByText(/^Historiador$/).length).toBe(1);
    expect(screen.getByText(/Todavía no se ha sondeado/)).toBeTruthy();
  });
});

describe("el calendario personalizado", () => {
  const elegirDosDias = () => {
    const hoy = new Date();
    let diaInicio, diaFin;
    if (hoy.getDate() > 3) {
      diaFin = hoy;
      diaInicio = new Date(hoy);
      diaInicio.setDate(diaInicio.getDate() - 2);
    } else {
      fireEvent.click(boton("Mes anterior"));
      diaInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 10);
      diaFin = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15);
    }
    fireEvent.click(boton(String(diaInicio.getDate())));
    fireEvent.click(boton(String(diaFin.getDate())));
  };

  it("«Aplicar» está deshabilitado hasta elegir los dos días, y confirmar escribe desde/hasta en la URL", async () => {
    const onNavigate = vi.fn();
    montar({ activo: "S1" }, onNavigate);
    await esperarSelector();

    fireEvent.click(boton(/Personalizado/));
    const aplicar = await waitFor(() => boton("Aplicar"));
    expect(aplicar.disabled).toBe(true);

    elegirDosDias();
    await waitFor(() => expect(boton("Aplicar").disabled).toBe(false));
    fireEvent.click(boton("Aplicar"));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Aplicar" })).toBeNull());
    expect(boton(/Personalizado/).getAttribute("aria-pressed")).toBe("true");
    expect(onNavigate).toHaveBeenCalledWith("maq-detalle", {
      maquina: CONFIGURADA.id,
      activo: "S1",
      rango: "personalizado",
      desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      hasta: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("marca con un punto los días que sí tienen muestras (el historiador simulado las tiene)", async () => {
    montar({ activo: "S1" });
    await esperarSelector();
    fireEvent.click(boton(/Personalizado/));

    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const diaSonda = ayer.getMonth() === hoy.getMonth() ? ayer : hoy;
    const dia = await waitFor(() => boton(String(diaSonda.getDate())));
    await waitFor(() => {
      const punto = dia.querySelector("span");
      expect(punto).toBeTruthy();
      expect(punto.style.background).not.toBe("transparent");
    }, { timeout: 4_000 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("«Cancelar» cierra sin tocar el rango vigente", async () => {
    montar({ activo: "S1" });
    await esperarSelector();
    fireEvent.click(boton(/Personalizado/));
    await waitFor(() => expect(boton("Cancelar")).toBeTruthy());

    fireEvent.click(boton("Cancelar"));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull());
    expect(boton("Tiempo real").getAttribute("aria-pressed")).toBe("true");
  });
});
