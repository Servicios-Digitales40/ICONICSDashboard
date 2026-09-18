// @vitest-environment jsdom
/**
 * topbar-estado-maquina.test.jsx
 * ------------------------------------------------------------------
 * Que el indicador de encendido del Topbar sólo salga en las pestañas de
 * SU máquina.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * `EstadoMaquinaBanner` lee `ac:TDCON/DEMO/SEGURIDAD/CONTROL`, que es el tag
 * de la bomba del TANQUE. Nació cuando toda la aplicación era la estación de
 * llenado y «la máquina» no era ambiguo; desde que la planta se partió en dos
 * sistemas, el mismo indicador junto al título de una pantalla de vibraciones
 * afirma «Encendida» sobre una instalación que no es la que se está mirando.
 *
 * Es el cruce que la separación en secciones existe para impedir, y el Topbar
 * es el peor sitio para cometerlo: se lee como contexto de todo lo que hay
 * debajo. La regresión además es silenciosa —el indicador funciona, el dato
 * es real, sólo es de otra máquina—, así que no hay nada que la delate
 * mirando la pantalla.
 *
 * La condición vive en el Topbar y sale del registro de rutas
 * (`SECCION_DE_PAGINA`), no de una lista de ids escrita a mano: por eso el
 * último caso comprueba que una pantalla NUEVA de vibraciones heredaría la
 * respuesta correcta sin tocar nada.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { Topbar } from "@/app/layout/Topbar.jsx";
import { SECCION_DE_PAGINA } from "@/app/routes/index.js";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
  // El indicador lee su punto por `fetch`; se le da la bomba ENCENDIDA para
  // que, de pintarse, sea inconfundible.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, payload: { value: true, quality: 0 } }),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const montar = (page) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <Topbar page={page} onAbrirMenu={() => {}} onAbrirAlarmas={() => {}} />
      </DataSourceProvider>
    </ThemeProvider>
  );

describe("Topbar: el indicador de encendido es de UNA máquina", () => {
  /*
   * ── OMITIDO: SU PANTALLA ESTÁ CERRADA (rama `Vibraciones1.0`) ──────
   *
   * El indicador se ve en `sec-llenado`, y esa sección ya no existe en el
   * sidebar. Los otros cuatro casos de este grupo siguen corriendo, y son los
   * que de verdad protegen la regla: que el indicador del tanque NO aparezca
   * en vibraciones ni en las pantallas generales.
   *
   * Para reabrir: quitar el `.skip`.
   */
  it.skip("en las pantallas de la estación de llenado, se ve", async () => {
    montar("eva-planta");
    await waitFor(() => {
      expect(screen.getByText(/Encendida|Apagada/i)).toBeTruthy();
    });
  });

  it("en las pantallas de vibraciones, NO se ve", async () => {
    montar("eva-vibraciones");

    // Se espera a que el Topbar termine de pintar antes de afirmar la
    // ausencia: comprobarla sobre un árbol a medio montar la daría por buena
    // aunque el indicador entrara un instante después.
    await screen.findByText(/Gráficas/i);
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("tampoco en «Riesgos» de vibraciones, que es donde se vio el fallo", async () => {
    montar("eva-riesgos-vibracion");
    await screen.findByText(/Riesgos/i);
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("en las pantallas generales tampoco: Alarmas y Assets son de las dos", async () => {
    // Un indicador de «la máquina» junto al título de una pantalla que habla
    // de las dos elegiría una sin decirlo.
    //
    // El título por `role`, no `findByText`: desde que la página tiene dos
    // pestañas (Plan 27), su subtítulo también dice «alarmas» en minúscula
    // («…el estado en vivo de las alarmas del PLC»), y un texto suelto ya no
    // basta para distinguir el `<h1>` del resto.
    montar("eva-alarmas");
    await screen.findByRole("heading", { name: /Alarmas/i });
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("la sección sale del registro, así que una vista nueva no hereda la respuesta del tanque", () => {
    // Si esta condición se implementara con una lista de ids escrita a mano,
    // una pantalla añadida a vibraciones caería fuera de la lista y el
    // indicador volvería a aparecer donde no debe.
    //
    // `eva-planta` ya no aparece aquí (rama `Vibraciones1.0`): sin `nav` no
    // tiene sección, y eso es EXACTAMENTE lo que esta prueba afirma — que la
    // sección se deriva del registro. Con una lista escrita a mano, cerrar la
    // estación de llenado no habría cambiado nada y el indicador seguiría
    // saliendo en sus pantallas. Al reabrir vuelve a valer "sec-llenado".
    expect(SECCION_DE_PAGINA["eva-planta"] ?? null).toBeNull();
    expect(SECCION_DE_PAGINA["eva-vibraciones"]).toBe("sec-vibraciones");
    /*
     * ── LA SEGUNDA RUTA CAMBIÓ (Plan 33 F10, 18-09-2026) ─────────────
     *
     * Era `eva-riesgos-vibracion`, que salió del menú al unificarse con
     * «Hallazgos»: sin `nav` no tiene sección, exactamente como `eva-planta`
     * arriba. Se sustituye por `eva-bandeja`, que ES la vista de hallazgos de
     * esta máquina desde F10.
     *
     * Y el cambio vuelve a demostrar lo que la prueba afirma, ahora por el
     * otro lado: `eva-bandeja` estaba en «General» esta mañana y hoy dice
     * «sec-vibraciones» sin que nadie tocara esta lista, porque la sección
     * sale del registro. Con una lista escrita a mano, mover una vista de
     * sección no habría cambiado nada aquí.
     */
    expect(SECCION_DE_PAGINA["eva-riesgos-vibracion"] ?? null).toBeNull();
    expect(SECCION_DE_PAGINA["eva-bandeja"]).toBe("sec-vibraciones");

    /*
     * ── ALARMAS PASÓ A LA MÁQUINA (Plan 33 F10, 18-09-2026) ──────────
     *
     * Estaba en «sec-general» desde el Plan 27, y ahora cuelga de la máquina:
     * un área de alarmas pertenece a un asset, no al servidor.
     *
     * El indicador sigue SIN verse ahí, y ahora por un motivo más fuerte: sólo
     * se pinta en `sec-llenado` —lee un tag del tanque—, así que una pantalla
     * de vibraciones lo excluye por partida doble. La comprobación de arriba
     * («en las pantallas de Alarmas, NO se ve») es la que lo fija de verdad;
     * ésta sólo verifica de dónde sale la sección.
     *
     * `eva-detalle` sigue sin `nav`, y por tanto sin sección: el indicador
     * tampoco debe dársela por supuesta.
     */
    expect(SECCION_DE_PAGINA["eva-alarmas"]).toBe("sec-vibraciones");
    expect(SECCION_DE_PAGINA["eva-detalle"]).toBeNull();
  });
});
