// @vitest-environment jsdom
/**
 * «Detalle» de una máquina configurada (Plan 42.5 F2), con los hooks doblados:
 * pestañas por activo con variables, gráfica sólo en las verificadas, la
 * causa persistida en las que no, el rango que viaja en la URL y sobrevive al
 * cambio de pestaña, y el contexto para el asistente.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const contexto = vi.fn();
vi.mock("@/features/asistente/lib/contextoDeVista.js", () => ({
  declararContextoDeVista: (ctx) => {
    contexto(ctx);
    return () => {};
  },
}));

let estadoDeMaquina = null;
const seriesPedidas = [];
let series = null;
vi.mock("@/Demo-EVA/data/comunes/useEstadoDeMaquina.js", () => ({
  useEstadoDeMaquina: () => estadoDeMaquina,
  useSeriesDeMaquina: (claves) => {
    seriesPedidas.push([...claves]);
    return series;
  },
}));

vi.mock("@/Demo-EVA/lib/exportarTodo.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, armarCSVGeneral: vi.fn(() => "csv-de-mentira") };
});
vi.mock("@/Demo-EVA/lib/exportar.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, descargarCSV: vi.fn() };
});

import { ThemeProvider } from "@/theme";
import DetalleMaquina from "@/Demo-EVA/views/maquina/DetalleMaquina.jsx";
import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { SIN_ACTIVO, activosConVariables, variablesDeActivo } from "@shared/eva/comun/vistaDeMaquina.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import * as exportar from "@/Demo-EVA/lib/exportar.js";
import * as exportarTodo from "@/Demo-EVA/lib/exportarTodo.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");
const LEIDO = new Date("2026-09-22T21:00:00Z");
const SERIES_VACIAS = { filas: [], porClave: {}, metaPorClave: {}, loading: false, error: null, hasMore: false, cobertura: null };

function maquinaLeida({ verificadas = true } = {}) {
  const { configurada } = configuracionEspejo({ verificadasDelCatalogo: verificadas });
  for (const v of configurada.variables) {
    v.historyCausa = v.historyVerified ? "serie-propia" : v.historyPointName ? "serie-compartida" : "sin-muestras";
    v.historyCompartidaCon = v.historyCausa === "serie-compartida" ? ["otra_variable"] : [];
  }
  const sistema = construirSistema(configurada, TIPO);
  const estado = sistema.estado(() => 1.5, sistema, LEIDO);
  const fuente = {
    sistema,
    buffer: { serie: () => [1, 2, 3], puntosDe: () => [{ t: LEIDO, valor: 1.5 }] },
    lecturaDe: () => ({ valor: 1.5, receivedAt: LEIDO, stale: false, motivo: null }),
    leerSerie: vi.fn(async () => ({ datos: [], motivo: null, hasMore: false, cobertura: null })),
    leerSeries: vi.fn(async () => ({})),
  };
  return { configurada, sistema, estado, fuente };
}

function conMaquina(extra = {}) {
  const { configurada, sistema, estado, fuente } = maquinaLeida(extra);
  estadoDeMaquina = {
    sistema, maquina: configurada, estado, dominio: null, buffer: fuente.buffer,
    lastUpdated: LEIDO, loading: false, error: null, fuente,
  };
  series = SERIES_VACIAS;
  return { configurada, sistema, estado, fuente };
}

const montar = (params = {}, onNavigate = vi.fn()) => {
  const utils = render(
    <ThemeProvider>
      <DetalleMaquina params={params} onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  return { ...utils, onNavigate };
};

afterEach(() => {
  cleanup();
  seriesPedidas.length = 0;
  vi.clearAllMocks();
});

describe("pestañas y tarjetas", () => {
  it("una pestaña por activo con variables más «Sin activo»; sin `activo` en la URL abre la primera", () => {
    const { configurada } = conMaquina();
    const activos = activosConVariables(configurada);

    montar({ maquina: configurada.id });

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([...activos.slice(0, -1).map((a) => a.nombre), "Sin activo"]);
    /* La fixture rotula S1 como «Lado acople»: el nombre del asset es el rótulo. */
    expect(screen.getByRole("heading", { name: `Detalle · ${activos[0].nombre}` })).toBeTruthy();
    expect(contexto).toHaveBeenCalledWith({ sistema: configurada.id, activo: "S1", rango: "vivo" });
  });

  it("un `activo` desconocido en la URL cae a la primera pestaña, no a una pantalla vacía", () => {
    const { configurada } = conMaquina();
    montar({ maquina: configurada.id, activo: "S9" });
    expect(screen.getByRole("heading", { name: `Detalle · ${activosConVariables(configurada)[0].nombre}` })).toBeTruthy();
    expect(contexto).toHaveBeenCalledWith({ sistema: configurada.id, activo: "S1", rango: "vivo" });
  });

  it("hay una tarjeta por variable del activo (sin las banderas), con su rótulo de `metaDe`", () => {
    const { configurada, sistema, estado } = conMaquina();
    const esperadas = variablesDeActivo(sistema, configurada, estado, "S2", TIPO);

    montar({ maquina: configurada.id, activo: "S2" });

    expect(screen.getByText(`${esperadas.length} variables en este activo`)).toBeTruthy();
    for (const v of esperadas) expect(screen.getAllByText(v.label).length).toBeGreaterThan(0);
  });

  it("las verificadas piden su serie; las no verificadas no la piden y enseñan la CAUSA con el enlace a Configuración", () => {
    const { configurada, sistema, estado, onNavigate } = { ...conMaquina(), onNavigate: vi.fn() };
    const vars = variablesDeActivo(sistema, configurada, estado, "S1", TIPO);
    const verificadas = vars.filter((v) => v.historizado).map((v) => v.key);
    const sinSerie = vars.filter((v) => !v.historizado);

    montar({ maquina: configurada.id, activo: "S1", rango: "ayer" }, onNavigate);

    expect(seriesPedidas.at(-1)).toEqual(verificadas);
    expect(sinSerie.length).toBeGreaterThan(0);
    const causas = screen.getAllByText(/indistinguible de la de otra_variable|Sin muestras en el historiador/);
    expect(causas.length).toBe(sinSerie.length);
    fireEvent.click(screen.getAllByRole("button", { name: "Ver en Configuración" })[0]);
    expect(onNavigate).toHaveBeenCalledWith("eva-configuracion", { maquina: configurada.id });
  });

  it("en «Tiempo real» no se le pide nada al historiador: claves vacías", () => {
    const { configurada } = conMaquina();
    montar({ maquina: configurada.id, activo: "S1" });
    expect(seriesPedidas.every((c) => c.length === 0)).toBe(true);
  });
});

describe("el rango en la URL", () => {
  it("`ayer` desde la URL se refleja en el selector y en el contexto; cambiar de pestaña lo conserva", () => {
    const { configurada, onNavigate } = { ...conMaquina(), onNavigate: vi.fn() };

    montar({ maquina: configurada.id, activo: "S1", rango: "ayer" }, onNavigate);

    expect(contexto).toHaveBeenCalledWith({ sistema: configurada.id, activo: "S1", rango: "ayer" });
    fireEvent.click(screen.getByRole("tab", { name: activosConVariables(configurada).find((a) => a.id === "S2").nombre }));
    expect(onNavigate).toHaveBeenCalledWith("maq-detalle", { maquina: configurada.id, activo: "S2", rango: "ayer" });
  });

  it("un `personalizado` con fechas corruptas degrada a «vivo»", () => {
    const { configurada } = conMaquina();
    montar({ maquina: configurada.id, activo: "S1", rango: "personalizado", desde: "ayer", hasta: "hoy" });
    expect(contexto).toHaveBeenCalledWith({ sistema: configurada.id, activo: "S1", rango: "vivo" });
  });

  it("elegir «Ayer» navega con la máquina, el activo y el rango", () => {
    const { configurada, onNavigate } = { ...conMaquina(), onNavigate: vi.fn() };
    montar({ maquina: configurada.id, activo: "S1" }, onNavigate);

    fireEvent.click(screen.getByRole("button", { name: /Ayer/i }));

    expect(onNavigate).toHaveBeenCalledWith("maq-detalle", { maquina: configurada.id, activo: "S1", rango: "ayer" });
  });
});

describe("exportar todo", () => {
  it("con un rango histórico, el CSV lleva TODAS las series verificadas de la máquina, con su punto y su rótulo", async () => {
    const { configurada, sistema, fuente } = conMaquina();
    montar({ maquina: configurada.id, activo: "S1", rango: "semana" });

    fireEvent.click(screen.getByRole("button", { name: /Exportar todo/ }));

    await waitFor(() => expect(exportar.descargarCSV).toHaveBeenCalledTimes(1));
    const [series] = exportarTodo.armarCSVGeneral.mock.calls[0];
    const verificadasDeMedida = sistema.series.historizadas().filter((c) => sistema.metaDe(c)?.naturaleza === "medida");
    expect(series).toHaveLength(verificadasDeMedida.length);
    expect(fuente.leerSerie).toHaveBeenCalledTimes(verificadasDeMedida.length);
    for (const s of series) {
      expect(s.senal.corto).toBeTruthy();
      expect(s.punto).toMatch(/^ac:/);
    }
  });

  it("en «Tiempo real» no hay botón de exportar: sin rango del historiador no hay nada que pedir", () => {
    const { configurada } = conMaquina();
    montar({ maquina: configurada.id, activo: "S1" });
    expect(screen.queryByRole("button", { name: /Exportar todo/ })).toBeNull();
  });
});

describe("cuando falta algo", () => {
  it("una máquina sin ninguna serie verificada no ofrece selector de rango ni comparación", () => {
    const { configurada } = conMaquina({ verificadas: false });
    montar({ maquina: configurada.id });
    expect(screen.queryByRole("button", { name: /Ayer/i })).toBeNull();
    expect(screen.queryByText("Comparar señales")).toBeNull();
  });

  it("sin máquina en contexto, lo dice", () => {
    estadoDeMaquina = { sistema: null, maquina: null, estado: null, dominio: null, buffer: null, lastUpdated: null, loading: false, error: null, fuente: null };
    series = SERIES_VACIAS;
    montar({});
    expect(screen.getByText("Elige una máquina")).toBeTruthy();
    expect(contexto).not.toHaveBeenCalled();
  });

  it("«Sin activo» es una pestaña con sus variables sueltas", () => {
    const { configurada } = conMaquina();
    montar({ maquina: configurada.id, activo: SIN_ACTIVO });
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/variables en este activo/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Detalle · Sin activo/ })).toBeTruthy();
  });
});
