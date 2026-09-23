// @vitest-environment jsdom
/**
 * configuracion-planta.test.jsx
 * ------------------------------------------------------------------
 * La vista «Planta › Configuración». Plan 33 F5 y F8.
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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/maquinasApi.js", () => ({
  listarMaquinas: vi.fn(),
  listarTipos: vi.fn(),
  verificarMaquina: vi.fn(),
  sondearMaquina: vi.fn(),
  problemasDeError: () => [],
}));

import { ThemeProvider } from "@/theme";
import {
  listarMaquinas,
  listarTipos,
  sondearMaquina,
  verificarMaquina,
} from "@/lib/api/maquinasApi.js";
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
   * ── EL ALTA YA SE OFRECE (Plan 36) ─────────────────────────────────
   *
   * Hasta el Plan 35 esta prueba defendía lo contrario: que la pantalla
   * DIJERA por qué no había botón de alta. Con la autenticación encendida el
   * botón existe, y lo que la pantalla tiene que decir ahora es lo que sigue
   * sin poderse decidir desde aquí: qué variables son escribibles.
   */
  it("ofrece dar de alta una máquina, y dice que todo entra como lectura", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 0, maquinas: [] });

    montar();

    expect(await screen.findByRole("button", { name: /Nueva máquina/i })).toBeTruthy();
    expect(screen.getByText(/entra como lectura/i)).toBeTruthy();
    expect(screen.getByText(/escribible/i)).toBeTruthy();
  });

  it("cada máquina configurada ofrece editar sus variables (Plan 36 F3)", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });

    montar();

    await screen.findByText("Motor conveyor 4");
    expect(screen.getByRole("button", { name: /Editar variables/i })).toBeTruthy();
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
 * ── LA DERIVA, EN PANTALLA (Plan 33 F8) ────────────────────────────
 *
 * Lo que se defiende aquí es que los cuatro estados se lean distinto, y sobre
 * todo que `UNKNOWN` NO se pinte como un fallo de la máquina: significa «no se
 * ha podido mirar», y presentarlo como error enseñaría a ignorar los errores
 * de verdad.
 */
describe("la comprobación contra ICONICS", () => {
  it("enseña qué puntos faltan, con su nombre", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });
    verificarMaquina.mockResolvedValue({
      ok: true,
      estado: "DEGRADED",
      motivo: "1 de 3 variables ya no existen en ICONICS: ac:PRUEBA/M/S1/DKW.",
      resumen: { total: 3, presentes: 2, ausentes: 1 },
      ausentes: [{ id: "DKW_S1", pointName: "ac:PRUEBA/M/S1/DKW" }],
      anotado: true,
    });

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Comprobar contra ICONICS/i }));

    /* El nombre del punto, no sólo el conteo: quien tiene que ir a buscarlo lo
       necesita. */
    expect(await screen.findByText("ac:PRUEBA/M/S1/DKW")).toBeTruthy();
    /* El motivo COMPLETO, no un fragmento: «/ya no existen/» también encaja en
       el rótulo «Puntos que ya no están» y devolvía dos coincidencias. */
    expect(
      screen.getByText(/1 de 3 variables ya no existen en ICONICS/i)
    ).toBeTruthy();
  });

  /*
   * La comprobación que justifica la fase. `UNKNOWN` y `INVALID` se ven igual
   * desde fuera —ninguna variable contestó— y significan cosas opuestas.
   */
  it("un UNKNOWN dice que no se pudo mirar, no que la máquina esté rota", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });
    verificarMaquina.mockResolvedValue({
      ok: true,
      estado: "UNKNOWN",
      motivo: "ICONICS no contestó a la lectura. No se ha podido mirar.",
      resumen: { total: 3, presentes: 0, ausentes: 0 },
      ausentes: [],
      anotado: false,
    });

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Comprobar contra ICONICS/i }));

    expect(await screen.findByText(/se conserva lo que se sabía antes/i)).toBeTruthy();
    /* Y NO se afirma que falten puntos: no se sabe. */
    expect(screen.queryByText(/ninguno de sus puntos/i)).toBeNull();
  });

  it("un fallo de red se pinta como «no se pudo», sin tumbar la pantalla", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });
    verificarMaquina.mockRejectedValue(new Error("el puente no contesta"));

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Comprobar contra ICONICS/i }));

    expect(await screen.findByText(/se conserva lo que se sabía antes/i)).toBeTruthy();
    expect(screen.getByText("Motor conveyor 4")).toBeTruthy();
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
/*
 * ── EL SONDEO DE SERIES (Plan 34 F4) ─────────────────────────────────
 *
 * Contesta una pregunta distinta de la comprobación: no si los puntos
 * EXISTEN, sino si la serie que el historiador devuelve por una variable es
 * de VERDAD suya. Hace falta porque el servidor contesta que sí y devuelve la
 * serie de otra señal, sin dar error.
 *
 * Lo que estas pruebas defienden es que esa diferencia se VEA. Una variable
 * cuya serie es la de otra no produce un hueco: produce una gráfica con el
 * número equivocado bajo el rótulo correcto, y si la pantalla no lo dice,
 * nadie lo descubre mirando.
 */
/*
 * Visto en pantalla el 22-09-2026: el botón rojo de la ficha decía
 * `config.editor.remove` —la clave, no el texto— desde el Plan 37 F1, porque
 * las claves `remove*` viven en `config` y la vista las pedía en
 * `config.editor`. Los verificadores de i18n comprueban la paridad entre
 * idiomas, no que cada clave pedida exista; esto sí.
 */
it("el botón de quitar enseña su texto, no su clave", async () => {
  listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });

  montar();
  const boton = await screen.findByRole("button", { name: /Quitar del tablero/i });
  expect(boton).toBeTruthy();
  expect(screen.queryByText(/config\.editor\.remove/)).toBeNull();

  fireEvent.click(boton);
  expect(await screen.findByText(/¿Quitar «Motor conveyor 4» del tablero\?/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Sí, quitar/i })).toBeTruthy();
});

describe("el sondeo de series", () => {
  /** Una máquina con punto histórico: sin él no hay nada que sondear. */
  const conHistoria = () =>
    maquina({
      variables: [
        {
          id: "aPeak_S1",
          pointName: "ac:PRUEBA/M02/S1/aPeak",
          historyPointName: "hda:g:aPeak_S1",
          historyVerified: false,
          acceso: "read",
        },
      ],
    });

  it("nombra las variables cuya serie es la de OTRA señal", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [conHistoria()] });
    sondearMaquina.mockResolvedValue({
      ok: true,
      estado: "DEGRADED",
      motivo: "1 de 2 series verificadas como propias.",
      resumen: { total: 2, verificadas: 1, compartidas: 1, sinVariacion: 0, sinDatos: 0, fallos: 0 },
      pendientes: [
        {
          id: "aPeak_S1",
          causa: "serie-compartida",
          motivo: "El historiador devuelve la MISMA serie que para aRMS_S1.",
          compartidaCon: ["aRMS_S1"],
        },
      ],
      anotado: true,
    });

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Sondear sus series/i }));

    /* Con cuál la comparte, no sólo que «hay un problema»: es lo único
       accionable — dice qué gráfica no hay que creerse. */
    expect(await screen.findByText(/aPeak_S1 → aRMS_S1/)).toBeTruthy();
    /* El rótulo del resumen, no el motivo: los dos contienen «1 de 2 series
       verificadas» y `getByText` con eso solo devuelve dos coincidencias. */
    expect(screen.getByText("1 de 2 series verificadas como propias")).toBeTruthy();
  });

  /*
   * La distinción que justifica la fase, en pantalla. Una serie plana no
   * desmiente nada: con la máquina parada todas lo son, y pintarlo como
   * problema de la variable mandaría a buscar una avería que no existe.
   */
  it("«no varía» NO se pinta como serie compartida", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [conHistoria()] });
    sondearMaquina.mockResolvedValue({
      ok: true,
      estado: "UNKNOWN",
      motivo: "0 de 1 series verificadas: no varían en la ventana.",
      resumen: { total: 1, verificadas: 0, compartidas: 0, sinVariacion: 1, sinDatos: 0, fallos: 0 },
      pendientes: [
        { id: "aPeak_S1", causa: "sin-variacion", motivo: "No varía.", compartidaCon: null },
      ],
      anotado: true,
    });

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Sondear sus series/i }));

    await screen.findByText("0 de 1 series verificadas como propias");
    /* El rótulo de «serie de otra señal» NO aparece: no es ese problema. */
    expect(screen.queryByText(/indistinguible de la de otra señal/i)).toBeNull();
  });

  /*
   * Plan 42 F2. Una bandera que nunca cambió se verifica por sus marcas de
   * tiempo, y eso es una promesa más débil que «serie propia». La ficha lo
   * dice aparte: sumarla a «propias» sin decirlo la disfrazaría, y pintarla
   * como pendiente la confundiría con «sin sondear».
   */
  it("las constantes registradas se cuentan aparte, y no como pendientes", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [conHistoria()] });
    sondearMaquina.mockResolvedValue({
      ok: true,
      estado: "VALID",
      motivo: "3 de 3 series verificadas (1 propias y 2 constantes registradas por el historiador).",
      resumen: { total: 3, verificadas: 3, constantes: 2, compartidas: 0, sinVariacion: 0, sinDatos: 0, fallos: 0 },
      pendientes: [],
      anotado: true,
    });

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Sondear sus series/i }));

    expect(await screen.findByText("3 de 3 series verificadas como propias")).toBeTruthy();
    expect(screen.getByText(/De ellas, 2 son constantes registradas/)).toBeTruthy();
    expect(screen.queryByText(/indistinguible de la de otra señal/i)).toBeNull();
  });

  it("sin constantes, la ficha no habla de ellas", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [conHistoria()] });
    sondearMaquina.mockResolvedValue({
      ok: true, estado: "VALID", motivo: "1 de 1 series verificadas como propias.",
      resumen: { total: 1, verificadas: 1, constantes: 0, compartidas: 0, sinVariacion: 0, sinDatos: 0, fallos: 0 },
      pendientes: [], anotado: true,
    });

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Sondear sus series/i }));

    await screen.findByText("1 de 1 series verificadas como propias");
    expect(screen.queryByText(/constantes registradas/)).toBeNull();
  });

  it("un fallo de red se pinta como «no se pudo», sin tumbar la pantalla", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [conHistoria()] });
    sondearMaquina.mockRejectedValue(new Error("se cayó la red"));

    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Sondear sus series/i }));

    expect(await screen.findByText(/No se pudieron sondear las series/i)).toBeTruthy();
    /* La ficha sigue en pie: un sondeo fallido no es un veredicto. */
    expect(screen.getByText("Motor conveyor 4")).toBeTruthy();
  });

  /*
   * Sin punto histórico no hay series que comparar, y el botón prometería un
   * trabajo que no se puede hacer.
   */
  /*
   * Destapado usándola el 21-09-2026: el sondeo decía «9 de 43 verificadas» y
   * la cabecera de la MISMA ficha seguía diciendo «2 con serie verificada».
   * Cuando el servidor anota algo, la lista se vuelve a pedir.
   */
  it("tras un sondeo ANOTADO, la ficha se recarga con lo que el servidor guardó", async () => {
    listarMaquinas
      .mockResolvedValueOnce({ ok: true, cuantas: 1, maquinas: [conHistoria()] })
      .mockResolvedValueOnce({
        ok: true,
        cuantas: 1,
        maquinas: [maquina({ variables: [{ id: "aPeak_S1", pointName: "ac:PRUEBA/M02/S1/aPeak", historyPointName: "hda:g:aPeak_S1", historyVerified: true, acceso: "read" }] })],
      });
    sondearMaquina.mockResolvedValue({
      ok: true, estado: "VALID", motivo: "1 de 1 series verificadas.",
      resumen: { total: 1, verificadas: 1, compartidas: 0, sinVariacion: 0, sinDatos: 0, fallos: 0 },
      pendientes: [], anotado: true,
    });

    montar();
    await screen.findByText("Motor conveyor 4");
    expect(screen.getByText(/0 con serie verificada/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Sondear sus series/i }));

    await waitFor(() => expect(listarMaquinas).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/1 con serie verificada/)).toBeTruthy();
  });

  it("una máquina sin histórico NO ofrece el botón de sondear", async () => {
    listarMaquinas.mockResolvedValue({ ok: true, cuantas: 1, maquinas: [maquina()] });

    montar();
    await screen.findByText("Motor conveyor 4");

    expect(screen.queryByRole("button", { name: /Sondear sus series/i })).toBeNull();
    /* Pero sí el de comprobar: esa pregunta se puede contestar igualmente. */
    expect(screen.getByRole("button", { name: /Comprobar contra ICONICS/i })).toBeTruthy();
  });
});

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
