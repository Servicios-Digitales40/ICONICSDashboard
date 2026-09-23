// @vitest-environment jsdom
/**
 * «Planta» de una máquina configurada (Plan 42.5 F1), con los hooks doblados:
 * lo que se afirma es la VISTA —qué banda aparece con qué datos, y qué dice
 * cuando falta algo—, no la fuente ni el historiador, que tienen sus pruebas.
 *
 * La máquina es la fixture espejo (73 variables, tres apoyos) con las series
 * del catálogo verificadas: 36 de 73, «a medias», que es el caso real.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const contexto = vi.fn();
vi.mock("@/features/asistente/lib/contextoDeVista.js", () => ({
  declararContextoDeVista: (ctx) => {
    contexto(ctx);
    return () => {};
  },
}));

let estadoDeMaquina = null;
let series = null;
vi.mock("@/Demo-EVA/data/comunes/useEstadoDeMaquina.js", () => ({
  useEstadoDeMaquina: () => estadoDeMaquina,
  useSeriesDeMaquina: (claves) => {
    seriesPedidas.push([...claves]);
    return series;
  },
}));
const seriesPedidas = [];

import { ThemeProvider } from "@/theme";
import PlantaMaquina from "@/Demo-EVA/views/maquina/PlantaMaquina.jsx";
import { construirSistema } from "@shared/eva/comun/construirSistema.js";
import { clavesConTendencia, filtrarClaves } from "@shared/eva/comun/vistaDeMaquina.js";
import { SIN_SERIE } from "@shared/eva/comun/historia.js";
import { tipoDe } from "@shared/eva/tipos/index.js";

import { configuracionEspejo } from "../../../../scripts/lib/configuracionEspejo.mjs";

const TIPO = tipoDe("vibraciones");
const LEIDO = new Date("2026-09-22T21:00:00Z");

const SIN_MAQUINA = {
  sistema: null, maquina: null, estado: null, dominio: null, buffer: null,
  lastUpdated: null, loading: false, error: null, fuente: null,
};

const SERIES_VACIAS = { filas: [], porClave: {}, metaPorClave: {}, loading: false, error: null, hasMore: false, cobertura: null };

const apoyo = (vRMS) => ({ vRMS, aRMS: 0.4, aPeak: 1.1, DKW: 1.0, alarma: 0, aviso: 0, offset: 0, vigilancias: {}, calidades: {}, sensor: null });

/** Una máquina configurada con lecturas en TODAS sus variables y las series del catálogo verificadas (o ninguna). */
function maquinaLeida({ verificadas = true, valor = 1.5 } = {}) {
  const { configurada } = configuracionEspejo({ verificadasDelCatalogo: verificadas });
  const sistema = construirSistema(configurada, TIPO);
  const estado = sistema.estado(() => valor, sistema, LEIDO);
  return { configurada, sistema, estado };
}

function conSeries(sistema, configurada, { puntos = 6, cobertura = null, error = null } = {}) {
  const claves = clavesConTendencia(sistema, configurada, TIPO);
  const porClave = Object.fromEntries(
    claves.map((c) => [c, Array.from({ length: puntos }, (_, i) => ({ t: new Date(LEIDO.getTime() - (puntos - i) * 900_000), valor: 1 + i * 0.1 }))]),
  );
  const metaPorClave = Object.fromEntries(claves.map((c) => [c, { motivo: null, error }]));
  return { ...SERIES_VACIAS, porClave, metaPorClave, cobertura, error: error ? new Error(error) : null };
}

const montar = (params = {}, onNavigate = vi.fn()) =>
  render(
    <ThemeProvider>
      <PlantaMaquina params={params} onNavigate={onNavigate} />
    </ThemeProvider>,
  );

/** Lo que la Planta enseña al arrancar: las MEDIDAS con tendencia (D16, «sólo medidas» encendido). */
const medidasDe = (sistema, configurada) =>
  filtrarClaves(sistema, configurada, clavesConTendencia(sistema, configurada, TIPO), { soloMedidas: true });

afterEach(() => {
  cleanup();
  seriesPedidas.length = 0;
  vi.clearAllMocks();
});

describe("con una máquina de tres apoyos y series verificadas a medias", () => {
  it("arranca con las MEDIDAS con historia, dice cuántas de cuántas, y declara la máquina al asistente", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const claves = clavesConTendencia(sistema, configurada, TIPO);
    const medidas = medidasDe(sistema, configurada);
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, dominio: null, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    montar();

    expect(claves.length).toBeGreaterThan(0);
    expect(claves.length).toBeLessThan(configurada.variables.length); // a medias, de verdad
    expect(medidas.length).toBeLessThan(claves.length); // y el filtro deja menos
    expect(screen.getByText(`${medidas.length} series con historia`)).toBeTruthy();
    expect(screen.getByText(`${medidas.length} de ${claves.length} series`)).toBeTruthy();
    /* Las series se piden UNA vez, con exactamente las claves VISIBLES. */
    expect(seriesPedidas[0]).toEqual(medidas);
    expect(contexto).toHaveBeenCalledWith({ sistema: configurada.id });
  });

  it("cada serie visible tiene su sparkline; el estado lista TODAS las variables, también las sin serie", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const claves = medidasDe(sistema, configurada);
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    const { container } = montar();

    /* Un sparkline por serie con historia (el `Spark` es un <svg> plano). */
    const sparks = container.querySelectorAll("svg path.trazo-dibujo");
    expect(sparks.length).toBe(claves.length);

    const estadoCard = screen.getByText("Estado de las variables").closest("div");
    const filas = within(estadoCard.parentElement.parentElement).getAllByRole("listitem");
    expect(filas.length).toBe(estado.senales.length);
    expect(estado.senales.length).toBeGreaterThan(claves.length);
  });

  it("un rango a medias se declara: tantos tramos con dato de tantos", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada, {
      cobertura: { tramos: 7, tramosConDato: 3, completa: false, desde: null, hasta: null },
    });

    montar();

    expect(screen.getByText("3/7 tramos con dato")).toBeTruthy();
  });

  it("un fallo del historiador se dice en cada panel de tendencia, no como una serie vacía", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const claves = medidasDe(sistema, configurada);
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = { ...conSeries(sistema, configurada, { puntos: 0 }), error: new Error("el puente no responde") };

    montar();

    const avisos = screen.getAllByText("no se pudo consultar el historiador");
    expect(avisos.length).toBe(claves.length);
  });

  it("un riesgo activo del tipo abre la franja de atención con su tarjeta", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = {
      ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false,
      /* S1 en zona de daño a régimen nominal: dispara `vibracion-en-alarma`. */
      dominio: { canales: { S1: apoyo(20), S2: apoyo(0.6), S3: apoyo(0.5) }, variador: { velocidad: 1480 }, alarmas: {} },
    };
    series = conSeries(sistema, configurada);

    montar();

    expect(screen.getByText("Requiere atención · 1")).toBeTruthy();
    expect(screen.getAllByRole("article").length).toBe(1);
  });

  it("sin ningún riesgo activo, la franja no existe", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = {
      ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false,
      dominio: { canales: { S1: apoyo(0.4), S2: apoyo(0.6), S3: apoyo(0.5) }, variador: { velocidad: 1480 }, alarmas: {} },
    };
    series = conSeries(sistema, configurada);

    montar();

    expect(screen.queryByText(/Requiere atención/)).toBeNull();
  });

  it("el botón «Detalle» lleva al Detalle de ESTA máquina, sin activo fijo", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);
    const onNavigate = vi.fn();

    render(
      <ThemeProvider>
        <PlantaMaquina onNavigate={onNavigate} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Detalle$/ }));

    expect(onNavigate).toHaveBeenCalledWith("maq-detalle", { maquina: configurada.id });
  });

  it("el corto del estado acompaña al color de cada variable con estado (el color no es su único portador)", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const conEstado = { ...estado, senales: estado.senales.map((s, i) => (i === 0 ? { ...s, estado: "critico" } : s)) };
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado: conEstado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    montar();

    /* «Fuera» es el corto de `critico` en `machines:status`. */
    expect(screen.getAllByText("Fuera").length).toBeGreaterThan(0);
  });

  it("un valor congelado se enseña como su edad, no como una cifra que parece nueva", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const haceDosMinutos = new Date(Date.now() - 120_000);
    estadoDeMaquina = {
      ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: haceDosMinutos, loading: false,
      fuente: { lecturaDe: () => ({ valor: 1.5, receivedAt: haceDosMinutos, stale: true, motivo: null }) },
    };
    series = conSeries(sistema, configurada);

    montar();

    expect(screen.getAllByText(/^hace 2 m$/).length).toBeGreaterThan(0);
    /* Y ninguna fila enseña «1,5» como si acabara de llegar. */
    expect(screen.queryAllByText(/^1[.,]5(0+)?\s/).length).toBe(0);
  });

  it("con lecturas BOOLEANAS (banderas, contadores) no revienta: las rotula como activa/inactiva", () => {
    /* El 23-09-2026 la Planta de vib-motor-03 cayó entera en el navegador con
       «v.toFixed is not a function»: el lector devuelve `true`/`false` en las
       banderas y esto se formateaba como número. Aquí el lector es mixto. */
    const { configurada } = configuracionEspejo({ verificadasDelCatalogo: true });
    const sistema = construirSistema(configurada, TIPO);
    const estado = sistema.estado((p) => (/alarma|aviso|offset|QC_|Count/i.test(p) ? true : 1.5), sistema, LEIDO);
    expect(estado.senales.some((s) => typeof s.valor === "boolean")).toBe(true);
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    montar();

    expect(screen.getByText("Estado de las variables")).toBeTruthy();
    expect(screen.getAllByText("activa").length).toBeGreaterThan(0);
    expect(screen.queryByText(/No se pudo mostrar/)).toBeNull();
  });

  it("las limitaciones del registro se enseñan tal cual, sin recalcular", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    montar();

    expect(sistema.limitaciones.length).toBeGreaterThan(0);
    expect(screen.getByText("Lo que no se puede decir")).toBeTruthy();
    for (const l of sistema.limitaciones) expect(screen.getByText(l)).toBeTruthy();
  });
});

describe("el filtro por activo y «sólo medidas» (F6, D16)", () => {
  it("un chip de activo navega con `filtro=<id>`; el interruptor apagado, con `series=todas`", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);
    const onNavigate = vi.fn();

    montar({}, onNavigate);

    const nombreS1 = configurada.assets.find((a) => a.id === "S1").nombre;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${nombreS1} · \\d+$`) }));
    expect(onNavigate).toHaveBeenCalledWith("maq-planta", { maquina: configurada.id, filtro: "S1" });

    fireEvent.click(screen.getByLabelText("Sólo medidas"));
    expect(onNavigate).toHaveBeenCalledWith("maq-planta", { maquina: configurada.id, series: "todas" });
  });

  it("con `filtro=S1` sólo se piden y pintan las medidas de ese apoyo, y el estado se acota a él", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const todas = clavesConTendencia(sistema, configurada, TIPO);
    const deS1 = filtrarClaves(sistema, configurada, todas, { activo: "S1", soloMedidas: true });
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    const { container } = montar({ filtro: "S1" });

    expect(deS1.length).toBeGreaterThan(0);
    expect(seriesPedidas[0]).toEqual(deS1);
    expect(container.querySelectorAll("svg path.trazo-dibujo").length).toBe(deS1.length);
    expect(screen.getByText(`${deS1.length} de ${todas.length} series`)).toBeTruthy();

    const estadoCard = screen.getByText("Estado de las variables").closest("div");
    const filas = within(estadoCard.parentElement.parentElement).getAllByRole("listitem");
    const senalesS1 = estado.senales.filter((s) => configurada.variables.find((v) => v.id === s.clave)?.assetId === "S1");
    expect(filas.length).toBe(senalesS1.length);
  });

  it("con `series=todas` vuelven las calidades y el variador: se piden todas las claves con tendencia", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const todas = clavesConTendencia(sistema, configurada, TIPO);
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    montar({ series: "todas" });

    expect(seriesPedidas[0]).toEqual(todas);
    expect(screen.getByText(`${todas.length} de ${todas.length} series`)).toBeTruthy();
  });

  it("un `filtro` que no es de esta máquina cae a toda la máquina, no a una pantalla vacía", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    montar({ filtro: "S9" });

    expect(seriesPedidas[0]).toEqual(medidasDe(sistema, configurada));
    expect(screen.getByRole("button", { name: "Toda la máquina" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("un activo que no deja ninguna serie con el interruptor encendido se ofrece apagado", () => {
    /* Las variables sueltas (variador, calidades) no son medidas: su chip dice 0 y no se puede pulsar. */
    const { configurada, sistema, estado } = maquinaLeida();
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = conSeries(sistema, configurada);

    montar();

    const sinActivo = screen.getByRole("button", { name: /^Sin activo · 0$/ });
    expect(sinActivo.disabled).toBe(true);
  });
});

describe("cuando falta algo, la pantalla lo dice en vez de inventar", () => {
  it("una máquina SIN ninguna serie verificada enseña el motivo y ninguna gráfica", () => {
    const { configurada, sistema, estado } = maquinaLeida({ verificadas: false });
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = SERIES_VACIAS;

    const { container } = montar();

    expect(screen.getByText("Ninguna serie verificada")).toBeTruthy();
    expect(screen.getByText(/Sondea sus series en Configuración/)).toBeTruthy();
    expect(container.querySelectorAll("svg path.trazo-dibujo").length).toBe(0);
    expect(screen.queryByText("Tendencias")).toBeNull();
    /* No se le pidió nada al historiador: cero claves. */
    expect(seriesPedidas[0]).toEqual([]);
    /* El estado en vivo sí se enseña: las variables existen aunque no tengan historia. */
    expect(screen.getByText("Estado de las variables")).toBeTruthy();
  });

  it("sin máquina en contexto dice que hay que elegir una, no cae en otra", () => {
    estadoDeMaquina = SIN_MAQUINA;
    series = SERIES_VACIAS;

    montar();

    expect(screen.getByText("Elige una máquina")).toBeTruthy();
    expect(contexto).not.toHaveBeenCalled();
  });

  it("una fuente que no se pudo construir se dice con su motivo", () => {
    const { configurada } = maquinaLeida();
    estadoDeMaquina = { ...SIN_MAQUINA, maquina: configurada, error: new Error("tipo «prensa» desconocido") };
    series = SERIES_VACIAS;

    montar();

    expect(screen.getByText("Esta máquina no se puede pintar")).toBeTruthy();
    expect(screen.getByText(/prensa/)).toBeTruthy();
  });

  it("una variable sin serie verificada NO aparece entre las tendencias aunque el historiador contestara", () => {
    const { configurada, sistema, estado } = maquinaLeida();
    const claves = clavesConTendencia(sistema, configurada, TIPO);
    const sinSerie = configurada.variables.find((v) => !v.historyVerified);
    estadoDeMaquina = { ...SIN_MAQUINA, sistema, maquina: configurada, estado, lastUpdated: LEIDO, loading: false };
    series = {
      ...conSeries(sistema, configurada),
      metaPorClave: { ...Object.fromEntries(claves.map((c) => [c, { motivo: null, error: null }])), [sinSerie.id]: { motivo: SIN_SERIE, error: null } },
    };

    montar();

    expect(claves).not.toContain(sinSerie.id);
    expect(seriesPedidas[0]).not.toContain(sinSerie.id);
  });
});
