// @vitest-environment jsdom
/**
 * llenado-cerrado.test.jsx — rama `Vibraciones1.0` F1, reescrita en el
 * Plan 42.5 F4 (23-09-2026).
 *
 * ── QUÉ DEFIENDE ESTA PRUEBA ────────────────────────────────────────
 *
 * Que la estación de llenado no está en el tablero, y que el chrome no paga
 * su dato. Son tres cosas distintas:
 *
 *  1. **No tiene vistas propias.** Sus cinco rutas (`eva-inicio`,
 *     `eva-riesgos`, `eva-controles`, `eva-maqueta`, y `eva-alarmas`, que era
 *     suya por dentro) SALIERON del registro el 23-09-2026 por decisión del
 *     usuario: el tanque volverá como máquina CONFIGURADA con las vistas
 *     genéricas `maq-*` (Plan 43). Hasta el 22-09 esta prueba afirmaba lo
 *     contrario —«cerrado no es borrado», las rutas seguían sin `nav`— porque
 *     la rama sólo las escondía; la decisión cambió y la prueba con ella. Si
 *     alguien las devuelve escritas a mano, esto falla: el camino de vuelta
 *     es la configuración, no reescribir las vistas.
 *  2. **No se pide su dato.** Ésta es la que importa y la que casi se escapa:
 *     ocultar o borrar las rutas NO calla la red. El motor de sondeo arranca
 *     por conteo de referencias desde `subscribeSistema` (`evaSource.js`), y
 *     el sidebar —montado en TODAS las pantallas— llamaba a `useSistemaAgua()`
 *     para pintar un punto de estado. Con eso, abrir cualquier vista seguía
 *     leyendo los 52 puntos del tanque cada 3 s. Es el mismo defecto por el
 *     que se retiró el contador de alarmas del Topbar el 31-08-2026, y la
 *     razón de que esta prueba mire las SUSCRIPCIONES y no el menú. La fuente
 *     en vivo (`EvaProvider`) sigue montada hasta el Plan 43.
 *  3. **El arranque no cae en una pantalla del tanque.** Es el muro de
 *     planta, en «Planta».
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROUTES, DEFAULT_ROUTE } from "@/app/routes/routes.jsx";
import { NAV, PAGES } from "@/app/routes/index.js";

/** Las vistas que la estación de llenado tuvo, y ya no tiene. */
const DEL_TANQUE = ["eva-inicio", "eva-planta", "eva-detalle", "eva-riesgos", "eva-controles", "eva-maqueta", "eva-alarmas"];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("la estación de llenado no tiene vistas propias", () => {
  it("ninguna de sus rutas sigue en el registro", () => {
    for (const id of DEL_TANQUE) {
      expect(ROUTES.some((r) => r.id === id), `"${id}" volvió al registro: el tanque entra por configuración (Plan 43), no con vistas escritas a mano`).toBe(false);
      expect(PAGES[id], `"${id}" tiene componente`).toBeUndefined();
    }
  });

  it("su sección no existe en el sidebar, sin lista paralela que mantener", () => {
    // `buildNav` deriva las secciones de las rutas con `nav`: sin rutas del
    // tanque, «Estación de llenado» no existe.
    expect(NAV.map((n) => n.group ?? n.id)).not.toContain("sec-llenado");
  });

  it("el arranque es el muro de planta, no una pantalla del tanque", () => {
    /*
     * Era `eva-inicio`, la landing del tanque; fue `vib-inicio` hasta el Plan
     * 40 F2 (21-09-2026). Las máquinas son configuradas, cada una en su
     * sección, y ninguna es «la» de entrada: el arranque es el muro.
     */
    expect(DEFAULT_ROUTE).toBe("eva-muro");
    expect(DEL_TANQUE).not.toContain(DEFAULT_ROUTE);
    const arranque = ROUTES.find((r) => r.id === DEFAULT_ROUTE);
    expect(arranque?.nav?.group).toBe("sec-planta");
  });
});

describe("el chrome ya no pide el dato del tanque", () => {
  it("montar el Sidebar no abre ninguna suscripción al sistema del tanque", async () => {
    /*
     * La comprobación central. Se mira la SUSCRIPCIÓN y no un `fetch`, porque
     * es donde está el mecanismo: `subscribeSistema` es lo que llama a
     * `motor.start()`, y sin suscriptores el motor no arranca aunque
     * `EvaProvider` siga montado. Es lo que permite dejar el proveedor en su
     * sitio hasta el Plan 43 y aun así no pagar su sondeo en ninguna pantalla.
     */
    const subscribeSistema = vi.fn(() => () => {});

    vi.doMock("@/Demo-EVA/data/comunes/EvaProvider.jsx", () => ({
      EvaProvider: ({ children }) => children,
      useEvaSource: () => ({
        subscribeSistema,
        buffer: { serie: () => [], estado: () => null },
        leerSerie: async () => ({ datos: [], motivo: null }),
        leerSeries: async () => ({}),
      }),
      useHayFuenteEva: () => true,
    }));

    /*
     * El badge de hallazgos cuenta las máquinas CONFIGURADAS (Plan 40 F2,
     * `useMaquinasEnVivo`), que leen el transporte con el hook tolerante
     * `useTransporteActual` — sin proveedor cae al real y no abre nada porque
     * aquí no hay ninguna configurada. Se deja `useDataSource` declarado por si
     * algo del chrome vuelve a exigir el proveedor: lo que esta prueba vigila
     * es que NO se cuente el tanque, no cómo se cuenta lo demás.
     */
    vi.doMock("@/lib/datasource", async (original) => ({
      ...(await original()),
      useDataSource: () => ({ modo: "iconics", esSimulado: false }),
    }));

    const { Sidebar } = await import("@/app/layout/Sidebar.jsx");
    const { ThemeProvider } = await import("@/theme");

    render(
      <ThemeProvider>
        <Sidebar page="eva-muro" onNavigate={() => {}} />
      </ThemeProvider>
    );

    expect(
      subscribeSistema,
      "el sidebar volvió a suscribirse al tanque: el sondeo de 52 puntos cada 3 s regresa a todas las pantallas"
    ).not.toHaveBeenCalled();

    vi.doUnmock("@/Demo-EVA/data/comunes/EvaProvider.jsx");
  });
});
