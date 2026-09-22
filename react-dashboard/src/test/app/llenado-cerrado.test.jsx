// @vitest-environment jsdom
/**
 * llenado-cerrado.test.jsx — rama `Vibraciones1.0`, F1.
 *
 * ── QUÉ DEFIENDE ESTA PRUEBA ────────────────────────────────────────
 *
 * Que la estación de llenado está cerrada DE VERDAD, y no sólo escondida del
 * menú. Son tres cosas distintas y sólo la primera es obvia:
 *
 *  1. **No sale en el sidebar.** Ninguna de sus cinco vistas trae `nav`, así
 *     que su sección entera desaparece —`buildNav` deriva las secciones de las
 *     rutas que la traen—.
 *  2. **No se pide su dato.** Ésta es la que importa y la que casi se escapa:
 *     ocultar las rutas NO calla la red. El motor de sondeo arranca por
 *     conteo de referencias desde `subscribeSistema` (`evaSource.js`), y el
 *     sidebar —montado en TODAS las pantallas— llamaba a `useSistemaAgua()`
 *     para pintar un punto de estado. Con eso, abrir cualquier vista de
 *     vibraciones seguía leyendo los 52 puntos del tanque cada 3 s.
 *
 *     Es el mismo defecto por el que se retiró el contador de alarmas del
 *     Topbar el 31-08-2026, y la razón de que esta prueba mire las
 *     SUSCRIPCIONES y no el menú.
 *  3. **Las rutas siguen existiendo.** Cerrado no es borrado: se llega
 *     escribiendo el id, y reabrir cuesta devolver un `nav`. Si alguien borra
 *     las vistas, esto falla.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROUTES, DEFAULT_ROUTE } from "@/app/routes/routes.jsx";
import { NAV, PAGES } from "@/app/routes/index.js";

/** Las cinco vistas de la estación de llenado, más su destino de detalle. */
const DEL_TANQUE = ["eva-inicio", "eva-planta", "eva-riesgos", "eva-controles", "eva-maqueta"];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("la estación de llenado no se ofrece", () => {
  it("ninguna de sus vistas trae `nav`", () => {
    for (const id of DEL_TANQUE) {
      const ruta = ROUTES.find((r) => r.id === id);
      expect(ruta, `"${id}" desapareció del registro`).toBeTruthy();
      expect(ruta.nav, `"${id}" sigue ofreciéndose en el sidebar`).toBeUndefined();
    }
  });

  it("su sección desaparece del sidebar, sin lista paralela que mantener", () => {
    // `buildNav` deriva las secciones de las rutas con `nav`: quitar el `nav`
    // de las cinco basta para que «Estación de llenado» no exista.
    expect(NAV.map((n) => n.group ?? n.id)).not.toContain("sec-llenado");
  });

  it("el arranque NO cae en una pantalla cerrada", () => {
    /*
     * Era `eva-inicio`, la landing del tanque. Con la máquina cerrada eso
     * dejaba el arranque en una vista fuera del menú: navegable pero huérfana,
     * y sondeando una máquina que nadie iba a mirar.
     *
     * Fue `vib-inicio` hasta el Plan 40 F2 (21-09-2026): la máquina de
     * vibraciones escrita a mano salió del registro de rutas, y las de
     * vibraciones son ahora configuradas, cada una en su sección. Ninguna es
     * «la» de entrada, así que el arranque es el muro de planta, en «Planta».
     */
    expect(DEFAULT_ROUTE).toBe("eva-muro");
    expect(DEL_TANQUE).not.toContain(DEFAULT_ROUTE);
    const arranque = ROUTES.find((r) => r.id === DEFAULT_ROUTE);
    expect(arranque?.nav?.group).toBe("sec-planta");
  });
});

describe("cerrado NO es borrado", () => {
  it("las cinco rutas siguen existiendo y con su componente", () => {
    // Reabrir tiene que costar devolver un `nav`, no reescribir las vistas.
    for (const id of DEL_TANQUE) {
      expect(ROUTES.some((r) => r.id === id), `"${id}" se borró`).toBe(true);
      expect(PAGES[id], `"${id}" se quedó sin componente`).toBeTruthy();
    }
  });
});

describe("el chrome ya no pide el dato del tanque", () => {
  it("montar el Sidebar no abre ninguna suscripción al sistema del tanque", async () => {
    /*
     * La comprobación central de esta fase. Se mira la SUSCRIPCIÓN y no un
     * `fetch`, porque es donde está el mecanismo: `subscribeSistema` es lo que
     * llama a `motor.start()`, y sin suscriptores el motor no arranca aunque
     * `EvaProvider` siga montado. Es lo que permite dejar el proveedor en su
     * sitio —lo necesita quien abra una vista del tanque a mano— y aun así no
     * pagar su sondeo en las pantallas de vibraciones.
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
