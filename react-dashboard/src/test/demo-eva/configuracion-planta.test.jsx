// @vitest-environment jsdom
/**
 * configuracion-planta.test.jsx
 * ------------------------------------------------------------------
 * La vista «Planta › Configuración». Plan 33 F5.
 *
 * ── QUÉ DEFIENDE ESTA PRUEBA ───────────────────────────────────────
 *
 *  1. **Que las limitaciones se PINTEN.** Es lo que más importa: una máquina
 *     recién configurada es válida y está casi ciega —sin roles mapeados sus
 *     reglas no se evalúan, sin series no contesta por su pasado—. Enseñar
 *     sólo lo que sabe hacer la haría parecer completa, y entonces «no hay
 *     riesgos» se leería como «está bien» en vez de como «no se pudo mirar».
 *  2. **Que la lista vacía se EXPLIQUE.** Quien ve el tanque y vibraciones en
 *     el menú y esta lista vacía concluye que la pantalla está rota. No lo
 *     está: esas dos están escritas en código y no se configuran aquí.
 *  3. **Que se diga por qué no hay botón de alta.** Una vista sin acción y sin
 *     explicación se lee como una vista a medias.
 *  4. **Que NO despierte el sondeo de ninguna máquina.** Es la regresión que
 *     este proyecto ya ha cometido dos veces, y la prueba mira las
 *     SUSCRIPCIONES, no el menú — como `llenado-cerrado.test.jsx`.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/maquinasApi.js", () => ({
  listarMaquinas: vi.fn(),
  listarTipos: vi.fn(),
  problemasDeError: () => [],
}));

import { ThemeProvider } from "@/theme";
import { listarMaquinas, listarTipos } from "@/lib/api/maquinasApi.js";
import ConfiguracionPlanta from "@/Demo-EVA/views/comunes/ConfiguracionPlanta.jsx";

/** La vista pide el tema por contexto, como todas las de este tablero. */
function montar(Vista = ConfiguracionPlanta) {
  return render(
    <ThemeProvider>
      <Vista />
    </ThemeProvider>,
  );
}

/** Una máquina configurada como la devuelve el backend, con sus derivados. */
const maquina = (extra = {}) => ({
  id: "vib-motor-02",
  nombre: "Motor conveyor 4",
  tipo: "vibraciones",
  estado: "UNKNOWN",
  assets: [{ id: "a1", pointName: "ac:PRUEBA/M02/", rol: "raiz" }],
  variables: [
    { id: "vRMS_S1", pointName: "ac:PRUEBA/M02/S1/vRMS", historyVerified: false, acceso: "read" },
  ],
  capacidades: ["CURRENT_DATA", "DIAGNOSTICS"],
  limitaciones: [
    "Esta máquina no tiene mapeadas estas medidas: variador:velocidad. Las reglas de riesgo " +
      "que las necesitan NO se evalúan.",
  ],
  ...extra,
});

const tipos = [
  {
    id: "vibraciones",
    nombre: "Vigilancia de vibraciones",
    descripcion: "Motor vigilado por un módulo SIPLUS CMS SM 1281.",
    reglas: 18,
    rolesRequeridos: [],
    capacidadesPosibles: [],
  },
];

beforeEach(() => {
  listarTipos.mockResolvedValue({ ok: true, tipos });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("la vista de configuración", () => {
  it("enseña las máquinas configuradas con sus cifras", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });

    montar();

    expect(await screen.findByText("Motor conveyor 4")).toBeTruthy();
    expect(screen.getByText("vib-motor-02")).toBeTruthy();
  });

  /*
   * La comprobación más importante del archivo. Sin ella, la vista podría
   * dejar de pintar las limitaciones y la suite seguiría en verde.
   */
  it("PINTA las limitaciones: una máquina ciega no puede parecer completa", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });

    montar();

    expect(await screen.findByText(/NO se evalúan/)).toBeTruthy();
  });

  it("enseña lo que la máquina SÍ sabe hacer, junto a lo que no", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });

    montar();

    expect(await screen.findByText(/CURRENT_DATA/)).toBeTruthy();
  });

  /*
   * `UNKNOWN` significa «nadie ha comprobado todavía», no «está roto».
   * Pintarlo como error enseñaría a ignorar los errores de verdad.
   */
  it("explica que UNKNOWN es «sin comprobar», no un fallo", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });

    montar();

    expect(await screen.findByText(/no se ha comprobado/i)).toBeTruthy();
  });

  it("con la lista vacía, explica por qué el tanque y vibraciones no salen", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 0, maquinas: [] });

    montar();

    expect(await screen.findByText(/no hay ninguna máquina configurada/i)).toBeTruthy();
    expect(screen.getByText(/escritas en el código/i)).toBeTruthy();
  });

  /*
   * Sin esta frase, la ausencia de un botón de «nueva máquina» se lee como una
   * pantalla sin terminar en vez de como una decisión.
   */
  it("dice por qué no se puede dar de alta desde aquí todavía", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 0, maquinas: [] });

    montar();

    expect(await screen.findByText(/sólo lectura/i)).toBeTruthy();
    expect(screen.getByText(/credenciales/i)).toBeTruthy();
  });

  it("enseña los tipos disponibles con sus reglas", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 0, maquinas: [] });

    montar();

    expect(await screen.findByText("Vigilancia de vibraciones")).toBeTruthy();
    expect(screen.getByText(/18/)).toBeTruthy();
  });

  it("un fallo del puente se pinta, sin dejar la pantalla en blanco", async () => {
    listarMaquinas.mockRejectedValue(new Error("el puente no contesta"));

    montar();

    await waitFor(() => {
      expect(screen.getByText(/el puente no contesta/i)).toBeTruthy();
    });
  });
});

/*
 * ── LA REGRESIÓN QUE YA OCURRIÓ DOS VECES ──────────────────────────
 *
 * El sondeo arranca por conteo de referencias en `subscribeSistema`, NO al
 * montar una vista. Una pantalla que llame a un hook de máquina —aunque sea
 * para pintar un punto de estado— despierta la lectura de esa máquina.
 *
 * Pasó con el contador de alarmas del Topbar (31-08-2026) y con el badge de
 * hallazgos (17-09-2026). Las dos veces la prueba existente seguía verde
 * porque miraba lo que se PINTA, no lo que se SUSCRIBE.
 *
 * Una vista de configuración no necesita valores en vivo. Esto lo fija.
 */
describe("no despierta el sondeo de ninguna máquina", () => {
  /*
   * Se sustituye el PROVIDER, que es por donde pasa cualquier lectura de
   * máquina, y se cuenta si alguien pidió una suscripción. Mismo mecanismo que
   * `llenado-cerrado.test.jsx`: espiar el módulo de `evaSource` desde fuera no
   * intercepta nada, porque quien lo consume es el provider.
   */
  it("montarla no abre ninguna suscripción", async () => {
    vi.resetModules();

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

    vi.doMock("@/lib/api/maquinasApi.js", () => ({
      listarMaquinas: async () => ({ ok: true, cuantas: 0, maquinas: [] }),
      listarTipos: async () => ({ ok: true, tipos }),
      problemasDeError: () => [],
    }));

    /*
     * El provider se importa DESPUÉS del `resetModules`, junto a la vista.
     * Con el de arriba, `ThemeProvider` y el `useTheme()` de la vista recién
     * cargada apuntarían a DOS contextos distintos —el módulo se reevaluó— y
     * la vista fallaría con «useTheme() debe usarse dentro de
     * <ThemeProvider>» estando envuelta en uno.
     */
    const [{ ThemeProvider: Provider }, { default: Vista }] = await Promise.all([
      import("@/theme"),
      import("@/Demo-EVA/views/comunes/ConfiguracionPlanta.jsx"),
    ]);

    render(
      <Provider>
        <Vista />
      </Provider>,
    );
    await screen.findByText(/no hay ninguna máquina configurada/i);

    expect(subscribeSistema).not.toHaveBeenCalled();

    vi.doUnmock("@/Demo-EVA/data/comunes/EvaProvider.jsx");
    vi.doUnmock("@/lib/api/maquinasApi.js");
  });
});
