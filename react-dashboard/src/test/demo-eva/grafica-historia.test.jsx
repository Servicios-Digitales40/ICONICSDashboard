// @vitest-environment jsdom
/**
 * grafica-historia.test.jsx
 * ------------------------------------------------------------------
 * Plan 11, Fase 5: `GraficaHistoria` no debe vaciarse en blanco al cambiar
 * de rango, y su mensaje de ausencia tiene que distinguir "todavía no llegó
 * la respuesta" de "el servidor contestó y no hay nada en este rango" — son
 * hechos distintos y decirlos igual sería confundir carga con ausencia real.
 *
 * Se prueba el componente aislado, con datos de mentira, porque lo que
 * importa es esta distinción de mensajes — la integración con el historiador
 * real ya la cubre `detalle-activo-simulada.test.jsx`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { GraficaHistoria, TooltipHistoria, dominioY } from "@/Demo-EVA/components/detalle/piezas.jsx";

afterEach(cleanup);

const SENAL = { key: "nivelTanque", corto: "Nivel", banda: "nominal" };

const DOS_PUNTOS = [
  { t: new Date("2026-08-19T10:00:00Z"), valor: 50 },
  { t: new Date("2026-08-20T10:00:00Z"), valor: 55 },
];

function ConTema({ children }) {
  const { theme: t, dark } = useTheme();
  return children(t, dark);
}

const montar = (props) =>
  render(
    <ThemeProvider>
      <ConTema>{(t, dark) => <GraficaHistoria senal={SENAL} t={t} dark={dark} {...props} />}</ConTema>
    </ThemeProvider>
  );

describe("GraficaHistoria: mensaje según carga y datos", () => {
  it("sin datos y cargando: dice que está consultando, no que no hay muestras", () => {
    montar({ datos: [], cargando: true });
    expect(screen.getByText("Consultando el historiador…")).toBeTruthy();
  });

  it("sin datos y sin cargar: dice que no hay muestras en ESTE rango, no un genérico", () => {
    montar({ datos: [], cargando: false });
    expect(screen.getByText("No hay muestras del historiador en este rango.")).toBeTruthy();
  });

  it("con datos y cargando: conserva la gráfica anterior y añade la insignia, no la vacía", () => {
    montar({ datos: DOS_PUNTOS, cargando: true });
    expect(screen.queryByText(/Consultando|No hay muestras/)).toBeNull();
    expect(screen.getByText("Actualizando…")).toBeTruthy();
  });

  it("con datos y sin cargar: la gráfica se ve sin insignia de actualización", () => {
    montar({ datos: DOS_PUNTOS, cargando: false });
    expect(screen.queryByText("Actualizando…")).toBeNull();
  });

  it("sin datos y en vivo: el mensaje es de sesión, no del historiador ni de carga", () => {
    // `enVivo` manda sobre `cargando` — el búfer no tiene un estado de carga
    // de red, así que aunque llegara `cargando: true` por error no debería
    // verse el mensaje del historiador.
    montar({ datos: [], cargando: true, enVivo: true });
    expect(screen.getByText("Sin muestras todavía en esta sesión.")).toBeTruthy();
    expect(screen.queryByText(/Consultando|No hay muestras del historiador/)).toBeNull();
  });
});

describe("Plan 13 F9: un fallo de red no se confunde con un rango vacío", () => {
  // La distinción que importa: "no pasó nada ayer" (sinDato) y "no pude
  // preguntar por ayer" (sinConexion) llevan a conclusiones opuestas, y antes
  // de esta fase `useSeriesHistoricas` tragaba el error de cada señal
  // (`.catch(() => ({ datos: [], motivo: null }))`) así que las dos caían en
  // el mismo mensaje genérico.
  it("con error y sin datos: dice que no se pudo consultar, no que el rango está vacío", () => {
    montar({ datos: [], cargando: false, error: "ECONNREFUSED" });
    expect(screen.getByText(/No se pudo consultar el historiador/)).toBeTruthy();
    expect(screen.queryByText("No hay muestras del historiador en este rango.")).toBeNull();
  });

  it("el error manda incluso si además dice cargando: la causa no se pisa con el estado transitorio", () => {
    montar({ datos: [], cargando: true, error: "ECONNREFUSED" });
    expect(screen.getByText(/No se pudo consultar el historiador/)).toBeTruthy();
    expect(screen.queryByText("Consultando el historiador…")).toBeNull();
  });

  it("en vivo, un error del historiador no aplica: el búfer no depende de esa consulta", () => {
    montar({ datos: [], cargando: false, error: "ECONNREFUSED", enVivo: true });
    expect(screen.getByText("Sin muestras todavía en esta sesión.")).toBeTruthy();
    expect(screen.queryByText(/No se pudo consultar el historiador/)).toBeNull();
  });
});

describe("el eje Y usa la escala de la señal, no el rango de los propios datos", () => {
  // Regresión: con domain=["dataMin","dataMax"] una oscilación de 0.1 (p.
  // ej. 102.01 a 102.12, un valor forzado fuera del 0-100 normal) se
  // estiraba a la altura entera del recuadro y parecía un desplome.
  it("sin salirse de la escala, el dominio es exactamente la escala declarada", () => {
    // Datos que oscilan apenas entre 55 y 56, muy dentro del 0-100: el
    // dominio tiene que quedarse en [0, 100], no encogerse a [55, 56].
    const [minFn, maxFn] = dominioY({ min: 0, max: 100 });
    expect(minFn(55)).toBe(0);
    expect(maxFn(56)).toBe(100);
  });

  it("un valor fuera de rango expande el dominio en vez de recortarse", () => {
    const [minFn, maxFn] = dominioY({ min: 0, max: 100 });
    expect(minFn(-5)).toBe(-5);
    expect(maxFn(102.5)).toBe(102.5);
  });

  it("sin escala declarada, cae en dataMin/dataMax de Recharts", () => {
    expect(dominioY(null)).toEqual(["dataMin", "dataMax"]);
  });
});

describe("el tooltip del histórico muestra fecha legible, no el epoch crudo", () => {
  // Regresión: `labelFormatter` en <Tooltip> no se aplica cuando el `content`
  // es un componente propio (ChartTooltip) — Recharts le pasa el `label` tal
  // cual, y sin este envoltorio el tooltip mostraba el epoch en milisegundos
  // en vez de una fecha.
  it("un label numérico (epoch ms) sale formateado como fecha/hora", () => {
    const ms = new Date("2026-08-20T15:30:00Z").getTime();
    render(
      <ThemeProvider>
        <TooltipHistoria active payload={[{ name: "Nivel", value: 55, color: "#000" }]} label={ms} />
      </ThemeProvider>
    );

    expect(screen.queryByText(String(ms))).toBeNull();
    expect(screen.getByText(/ago/i)).toBeTruthy();
  });
});
