// @vitest-environment jsdom
/**
 * edad-dato.test.jsx
 * ------------------------------------------------------------------
 * Plan 13, Fase 2 (F2): que la edad de un dato en vivo se vea EN LA PROPIA
 * CIFRA, no sólo exista en `estadoDelDato.js`. Esto prueba el cableado de
 * `TarjetaVariable` (`DetalleGrid`) consumiendo `presentarValor()` con un
 * `ahora` real — no la lógica pura, que ya tiene su propia suite en
 * `estado-dato.test.js`. Los tiles de Planta del tanque (`BandaSenales`,
 * `RejillaActivos`) se retiraron en el Plan 42.5 F4; el mismo contrato en la
 * Planta genérica se afirma en `planta-maquina.test.jsx`.
 *
 * Se prueba contra los componentes exportados con datos de mentira
 * construidos con el `createSenal` REAL (`@shared/eva/tanque/sistema.js`), no con
 * un objeto a mano: así la forma de la señal no se puede desincronizar del
 * contrato real sin que las pruebas de `estado-dato.test.js` u otras ya lo
 * noten primero. Mismo criterio que ya usa `grafica-historia.test.jsx` para
 * `GraficaHistoria`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "@/theme";
import { createSenal } from "@/Demo-EVA/domain/sistema.js";
import { DetalleGrid } from "@/Demo-EVA/components/detalle/DetalleGrid.jsx";

afterEach(cleanup);

const AHORA = new Date("2026-08-21T12:00:00Z");

function ConTema({ children }) {
  const { theme: t, dark } = useTheme();
  return children(t, dark);
}

/** La forma que el hook del Detalle añade sobre la señal base (hoy `useDetalleMaquina`; antes `useDetalleActivo`). */
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

    /*
     * `getAllByText` y la comprobación del `title`, no un `getByText(/hace/)`
     * a secas: desde el Plan 24 F1 la tarjeta tiene DOS edades legítimas —la
     * cifra grande sustituida, y la fila «Última lectura» del panel de
     * procedencia—, así que un `getByText` falla por ambigüedad.
     *
     * La aserción se estrecha en vez de relajarse: lo que esta prueba
     * comprueba es que LA CIFRA GRANDE se sustituye, y se identifica por el
     * `title` que sólo ella lleva. Aflojar a `getAllByText(...).length > 0`
     * habría pasado igual con la cifra intacta y sólo el panel abierto.
     */
    const edades = screen.getAllByText(/hace/);
    expect(edades.some((n) => n.getAttribute("title"))).toBe(true);
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
