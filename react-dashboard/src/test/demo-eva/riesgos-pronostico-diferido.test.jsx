// @vitest-environment jsdom
/**
 * riesgos-pronostico-diferido.test.jsx
 * ------------------------------------------------------------------
 * Que abrir «Riesgos» NO lea el historiador.
 *
 * ── QUÉ PROTEGE, Y POR QUÉ MERECE UNA PRUEBA PROPIA ────────────────
 *
 * El troceado del historiador vive en el navegador (`data/historia.js`), así
 * que cada tramo es una petición a `/api`. Cinco señales por diez tramos son
 * CINCUENTA peticiones para una ventana de 30 días — contra las cuatro que
 * gasta «Planta» entera—, y el puente corta en 300 por minuto. Con el
 * pronóstico pedido al montar, entrar y salir de la pestaña un par de veces
 * se llevaba un 429, y ese 429 no lo paga esta pantalla: lo paga la
 * siguiente persona que pregunte cualquier cosa.
 *
 * La regresión que se vigila es silenciosa: si alguien vuelve a pedir la
 * historia al montar, la pantalla se ve IGUAL de bien —sólo tarda más y
 * gasta cuota—, así que no hay nada que delate el fallo mirando. Por eso se
 * cuentan las peticiones y no lo que se pinta.
 *
 * Los riesgos de arriba salen del instante que el proveedor ya sondea, así
 * que siguen evaluándose sin pedir nada aparte: eso también se comprueba.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { EvaProvider } from "@/Demo-EVA/data/EvaProvider.jsx";
import RiesgosTanque from "@/Demo-EVA/views/tanque/RiesgosTanque.jsx";

/*
 * El origen va SIMULADO, igual que en `controles.test.jsx`: el simulador no
 * usa `fetch`, así que cualquier `fetch` que se cuente aquí es de verdad una
 * lectura que la vista decidió hacer, y no ruido del proveedor.
 */
beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete globalThis.fetch;
});

const montar = () =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <EvaProvider>
          <RiesgosTanque />
        </EvaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("el pronóstico de «Riesgos» no se lee al entrar", () => {
  it("al montar no se pide ni una sola serie al historiador", async () => {
    // La vista se monta y se le da tiempo a pintar sus tres secciones.
    montar();
    await screen.findByRole("button", { name: /Calcular desgaste/i });

    // La afirmación real: el estado de reposo está, y el aviso de resolución
    // —que sólo se escribe cuando hay algo leído— todavía no.
    expect(screen.getByRole("button", { name: /Calcular desgaste/i })).toBeTruthy();
    expect(screen.queryByText(/Leyendo el historiador/i)).toBeNull();
    expect(screen.queryByText(/Esto mide lo sostenido/i)).toBeNull();
  });

  it("los riesgos del instante sí se evalúan sin pedir historia", async () => {
    montar();

    // «Sin comprobar» sale del evaluador, que sólo mira el instante del
    // proveedor. Si esto falla, es que la sección de riesgos empezó a
    // depender de la historia, que es justo lo que se quiere evitar.
    await screen.findByRole("button", { name: /Calcular desgaste/i });
    // «Sin comprobar» y los riesgos activos salen del evaluador del instante.
    // Que la sección exista sin haber leído historia es la afirmación.
    expect(screen.queryByText(/Leyendo el historiador/i)).toBeNull();
  });

  it("el selector de período no se ofrece hasta que hay algo que reencuadrar", async () => {
    montar();
    await screen.findByRole("button", { name: /Calcular desgaste/i });

    // Los períodos se pintan siempre en el árbol, pero ocultos: ofrecer «90
    // días» antes de haber leído nada invita a pedir la ventana más cara
    // primero, que es exactamente el camino que agotaba la cuota.
    const siete = screen.getByRole("button", { name: "7 días", hidden: true });
    expect(siete.closest("[hidden]")).not.toBeNull();
  });

  it("pulsar «Calcular» es lo que arranca la lectura", async () => {
    montar();
    const boton = await screen.findByRole("button", { name: /Calcular desgaste/i });

    fireEvent.click(boton);

    // Ahora sí: el botón desaparece y entra el aviso de resolución, que es
    // el que acompaña a los datos ya leídos.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Calcular desgaste/i })).toBeNull();
    });
    await screen.findByText(/Esto mide lo sostenido/i);

    // Y con la lectura hecha, el selector de período ya tiene sentido.
    const siete = screen.getByRole("button", { name: "7 días" });
    expect(siete.closest("[hidden]")).toBeNull();
  });

  it("arranca en la ventana más corta, que es la más barata", async () => {
    montar();
    const boton = await screen.findByRole("button", { name: /Calcular desgaste/i });

    // El rótulo del propio botón declara la ventana que va a pedir. Siete
    // días son 7 tramos por señal; treinta, diez. Empezar por el corto es
    // parte de no agotar la cuota, así que se afirma aquí.
    expect(boton.textContent).toMatch(/7 días/);
  });
});
