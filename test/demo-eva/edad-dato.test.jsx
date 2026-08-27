// @vitest-environment jsdom
/**
 * edad-dato.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 2 (F2): que la edad de un dato en vivo se vea EN LA PROPIA
 * CIFRA, no sólo exista en `estadoDelDato.js`. Esto prueba el cableado —
 * `BandaSenales`/`StatSenal` y `RejillaActivos`/`TarjetaActivo`/`FilaSenal`
 * consumiendo `presentarValor()` con un `ahora` real — no la lógica pura,
 * que ya tiene su propia suite en `estado-dato.test.js`.
 *
 * Se prueba contra los componentes exportados con datos de mentira
 * construidos con el `createSenal` REAL (`@shared/eva/sistema.js`), no con
 * un objeto a mano: así la forma de la señal no se puede desincronizar del
 * contrato real sin que las pruebas de `estado-dato.test.js` u otras ya lo
 * noten primero. Mismo criterio que ya usa `grafica-historia.test.jsx` para
 * `GraficaHistoria`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { createSenal } from "@/Demo-EVA/domain/sistema.js";
import { BandaSenales, RejillaActivos } from "@/Demo-EVA/components/tiles.jsx";
import { DetalleGrid } from "@/Demo-EVA/components/detalle/DetalleGrid.jsx";

afterEach(cleanup);

const AHORA = new Date("2026-08-21T12:00:00Z");

function ConTema({ children }) {
  const { theme: t, dark } = useTheme();
  return children(t, dark);
}

const montarBanda = (senal) =>
  render(
    <ThemeProvider>
      <ConTema>
        {(t, dark) => (
          <BandaSenales senales={[senal]} series={{ [senal.key]: [] }} t={t} dark={dark} ahora={AHORA} />
        )}
      </ConTema>
    </ThemeProvider>
  );

/** `RejillaActivos` espera activos ya armados (la forma que produce `createActivo`, no expuesta). */
const activoDe = (senal) => ({
  id: "tanque", label: "Tanque", corto: "Tanque", pregunta: "¿cómo va?",
  senales: [senal], estado: senal.estado, sinDato: 0,
});

const montarRejilla = (senal) =>
  render(
    <ThemeProvider>
      <ConTema>
        {(t, dark) => (
          <RejillaActivos
            activos={[activoDe(senal)]} seriesVivas={{}} ventana={{}}
            t={t} dark={dark} onNavigate={() => {}} ahora={AHORA}
          />
        )}
      </ConTema>
    </ThemeProvider>
  );

describe("StatSenal (BandaSenales): la cifra se sustituye por su edad al congelarse", () => {
  it("fresco: se ve el número, no una edad", () => {
    const senal = createSenal({
      key: "nivelTanque", valor: 62.5,
      receivedAt: new Date(AHORA.getTime() - 2_000), stale: false,
    });
    montarBanda(senal);
    expect(screen.getByText(/62[.,]5/)).toBeTruthy();
    expect(screen.queryByText(/hace/)).toBeNull();
  });

  it("congelado: la cifra desaparece y en su hueco queda «hace…», no un «62,5» viejo pasando por nuevo", () => {
    const senal = createSenal({
      key: "nivelTanque", valor: 62.5,
      receivedAt: new Date(AHORA.getTime() - 90_000), stale: true,
    });
    montarBanda(senal);
    expect(screen.queryByText(/62[.,]5/)).toBeNull();
    expect(screen.getByText(/hace/)).toBeTruthy();
  });
});

/** La forma que `useDetalleActivo` añade sobre la señal base (`data/detalleActivo.js`). */
const variableDe = (senal) => ({
  ...senal, historiaReal: [], historiaCargando: false, historiaEnVivo: true, bufferVivo: [], deltaBuffer: null,
});

const montarDetalle = (senal) =>
  render(
    <ThemeProvider>
      <ConTema>
        {(t, dark) => <DetalleGrid variables={[variableDe(senal)]} t={t} dark={dark} ahora={AHORA} />}
      </ConTema>
    </ThemeProvider>
  );

describe("TarjetaVariable (DetalleGrid): la cifra grande, misma regla", () => {
  it("congelado: la cifra grande del Detalle también se sustituye por su edad", () => {
    const senal = createSenal({
      key: "nivelTanque", valor: 62.5,
      receivedAt: new Date(AHORA.getTime() - 90_000), stale: true,
    });
    montarDetalle(senal);
    expect(screen.queryByText(/62[.,]5/)).toBeNull();
    expect(screen.getByText(/hace/)).toBeTruthy();
  });

  it("fresco: se ve el número", () => {
    const senal = createSenal({
      key: "nivelTanque", valor: 62.5,
      receivedAt: new Date(AHORA.getTime() - 2_000), stale: false,
    });
    montarDetalle(senal);
    expect(screen.getByText(/62[.,]5/)).toBeTruthy();
  });
});

describe("FilaSenal (RejillaActivos): mismo contrato, en la rejilla de activos", () => {
  it("congelado: la fila muestra la edad, no el valor", () => {
    const senal = createSenal({
      key: "nivelTanque", valor: 62.5,
      receivedAt: new Date(AHORA.getTime() - 90_000), stale: true,
    });
    montarRejilla(senal);
    expect(screen.getByText(/hace/)).toBeTruthy();
  });

  it("fresco: la fila muestra el valor formateado de siempre", () => {
    const senal = createSenal({
      key: "nivelTanque", valor: 62.5,
      receivedAt: new Date(AHORA.getTime() - 2_000), stale: false,
    });
    montarRejilla(senal);
    expect(screen.queryByText(/hace/)).toBeNull();
  });
});
