// @vitest-environment jsdom
/**
 * maquina-contexto.test.jsx
 * ------------------------------------------------------------------
 * `MaquinaContext`: de qué máquina va la pantalla. Plan 33 F6.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Que la RUTA mande sobre el parámetro.** En `eva-inicio` la máquina es
 *     el tanque, y un `?maquina=vib-02` pegado a mano no puede cambiar de qué
 *     habla esa pantalla. Al revés, un parámetro olvidado al navegar haría
 *     que una vista del tanque hablara de otra máquina con cifras reales y
 *     sin un error en ningún sitio.
 *  2. **Que una máquina desconocida NO caiga en otra de consuelo.** Es el
 *     fallo más caro de este proyecto: contestar correctamente sobre la
 *     instalación equivocada.
 *  3. **Que el provider no suscriba NADA.** Envuelve el Shell entero, así que
 *     si pidiera datos los pediría en todas las pantallas — la regresión de
 *     31-08-2026 (contador de alarmas) y 17-09-2026 (badge de hallazgos).
 *
 * ── SÓLO EL TANQUE TIENE RUTAS PROPIAS (Plan 40 F2) ────────────────
 *
 * La máquina de vibraciones escrita a mano salió del menú y su entrada del
 * registro declara `rutas: []`: `vib-inicio` ya no es de ninguna máquina. Una
 * máquina de vibraciones es una CONFIGURADA y llega SÓLO por `?maquina=<id>`.
 * Hasta esa fase estas pruebas usaban `vib-inicio → vibraciones` como la
 * máquina «real» de la ruta; ahora ese papel lo hace el tanque, y la
 * configurada se resuelve por el parámetro contra el provider de configuradas.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/* Las configuradas del tablero, fingidas: aquí se prueba cómo se RESUELVE una,
   no cómo se lee la lista (eso es `maquinas-configuradas.test.jsx`). */
let configuradas = [];
vi.mock("@/Demo-EVA/data/comunes/MaquinasConfiguradas.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquinasConfiguradas: () => ({ maquinas: configuradas, cargando: false, error: null, recargar: () => {} }),
}));

import {
  MaquinaProvider,
  maquinaDeNavegacion,
  useMaquina,
} from "@/Demo-EVA/data/comunes/MaquinaContext.jsx";

const RAIZ = "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/";
const CONFIGURADA = {
  id: "vib-motor-03",
  nombre: "Nuevo-Modor",
  tipo: "vibraciones",
  activa: true,
  assets: [{ id: "Vibraciones", pointName: RAIZ, rol: "raiz" }, { id: "S1", pointName: `${RAIZ}S1/`, rol: "secundario" }],
  variables: [
    { id: "vRMS_S1", pointName: `${RAIZ}S1/vRMS_S1`, historyPointName: null, historyVerified: false, assetId: "S1", rol: "medida:vRMS", acceso: "read" },
  ],
  cadenciaMs: 5000,
};

afterEach(() => {
  /* Sin esto el DOM del render anterior sigue montado y `getByText` encuentra
     dos coincidencias — varias pruebas de aquí pintan las mismas etiquetas. */
  cleanup();
  vi.clearAllMocks();
  configuradas = [];
});

/** Pinta lo que el contexto dice, para poder afirmarlo desde fuera. */
function Sonda() {
  const { id, registro, enServicio, cerrada } = useMaquina();
  return (
    <ul>
      <li>id:{String(id)}</li>
      <li>registro:{registro ? registro.id : "null"}</li>
      <li>servicio:{String(enServicio)}</li>
      <li>cerrada:{cerrada ? "si" : "no"}</li>
    </ul>
  );
}

const montar = (page, params = {}) =>
  render(
    <MaquinaProvider page={page} params={params}>
      <Sonda />
    </MaquinaProvider>,
  );

describe("de qué máquina va una navegación", () => {
  it("la saca de la RUTA cuando la ruta es de una máquina", () => {
    expect(maquinaDeNavegacion({ page: "eva-inicio", params: {} })).toBe("tanque");
    expect(maquinaDeNavegacion({ page: "eva-riesgos", params: {} })).toBe("tanque");
  });

  it("la sección de vibraciones escrita a mano ya no es de ninguna máquina", () => {
    /* `vib-inicio` salió del menú (Plan 40 F2). Si esto vuelve a dar
       `vibraciones`, alguien ha devuelto rutas a la entrada escrita a mano. */
    expect(maquinaDeNavegacion({ page: "vib-inicio", params: {} })).toBeNull();
  });

  /*
   * El orden importa y no es simetría: un `?maquina=` olvidado en la URL al
   * navegar desde otra pantalla haría que una vista del tanque hablara de otra
   * máquina, con cifras reales y sin un error en ningún log.
   */
  it("la RUTA manda sobre el parámetro, no al revés", () => {
    expect(maquinaDeNavegacion({ page: "eva-inicio", params: { maquina: "vib-motor-03" } })).toBe("tanque");
  });

  it("usa el parámetro sólo cuando la ruta no es de ninguna máquina", () => {
    expect(
      maquinaDeNavegacion({ page: "eva-configuracion", params: { maquina: "vib-02" } }),
    ).toBe("vib-02");
    expect(maquinaDeNavegacion({ page: "maq-inicio", params: { maquina: "vib-motor-03" } })).toBe("vib-motor-03");
  });

  it("sin ruta de máquina y sin parámetro, no inventa ninguna", () => {
    expect(maquinaDeNavegacion({ page: "eva-configuracion", params: {} })).toBeNull();
    expect(maquinaDeNavegacion({})).toBeNull();
    expect(maquinaDeNavegacion({ page: "eva-turno", params: { maquina: "  " } })).toBeNull();
  });
});

describe("el contexto", () => {
  it("resuelve una máquina CONFIGURADA por su parámetro, construida desde su configuración", () => {
    configuradas = [CONFIGURADA];
    montar("maq-inicio", { maquina: "vib-motor-03" });

    expect(screen.getByText("id:vib-motor-03")).toBeTruthy();
    expect(screen.getByText("registro:vib-motor-03")).toBeTruthy();
    expect(screen.getByText("servicio:true")).toBeTruthy();
    expect(screen.getByText("cerrada:no")).toBeTruthy();
  });

  it("resuelve la entrada del registro escrito a mano por su ruta", () => {
    montar("eva-inicio");

    expect(screen.getByText("id:tanque")).toBeTruthy();
    expect(screen.getByText("registro:tanque")).toBeTruthy();
  });

  /*
   * `registro: null` con un `id` no nulo es un estado REAL: alguien guardó el
   * enlace de una máquina que ya no está configurada. Lo que NO puede pasar es
   * caer en otra.
   */
  it("una máquina desconocida deja `registro` en null, sin caer en otra", () => {
    configuradas = [CONFIGURADA];
    montar("eva-configuracion", { maquina: "no-existe" });

    expect(screen.getByText("id:no-existe")).toBeTruthy();
    expect(screen.getByText("registro:null")).toBeTruthy();
    expect(screen.getByText("servicio:false")).toBeTruthy();
  });

  /*
   * El tanque está CERRADO en esta rama. Una pantalla suya tiene que poder
   * decir por qué, no simplemente comportarse como si la máquina no existiera.
   */
  it("una máquina cerrada se distingue de una que no existe", () => {
    montar("eva-inicio");

    expect(screen.getByText("id:tanque")).toBeTruthy();
    expect(screen.getByText("registro:tanque")).toBeTruthy();
    expect(screen.getByText("servicio:false")).toBeTruthy();
    expect(screen.getByText("cerrada:si")).toBeTruthy();
  });

  it("fuera del provider devuelve la forma vacía en vez de lanzar", () => {
    expect(() => render(<Sonda />)).not.toThrow();
  });
});

/*
 * ── LA REGRESIÓN QUE YA OCURRIÓ DOS VECES ──────────────────────────
 *
 * El sondeo arranca por conteo de referencias en `subscribeSistema`, NO al
 * montar una vista. `MaquinaProvider` envuelve el Shell entero: si pidiera
 * datos, los pediría en TODAS las pantallas, y revivir una máquina cerrada
 * costaría abrir cualquiera.
 *
 * Esta prueba mira las SUSCRIPCIONES, no lo que se pinta — que es lo que las
 * dos veces anteriores se escapó. Y con una CONFIGURADA delante, además, que
 * no se abra su fuente: resolver quién es no es leerla.
 */
describe("el provider no despierta el sondeo de ninguna máquina", () => {
  it("montarlo no abre ninguna suscripción", async () => {
    vi.resetModules();

    const subscribeSistema = vi.fn(() => () => {});
    const fuenteDeMaquinaConfigurada = vi.fn();

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
    vi.doMock("@/Demo-EVA/data/comunes/fuenteDeMaquina.js", () => ({
      fuenteDeMaquinaConfigurada,
    }));

    const { MaquinaProvider: Provider, useMaquina: usar } = await import(
      "@/Demo-EVA/data/comunes/MaquinaContext.jsx"
    );

    function SondaAislada() {
      return <span>{String(usar().id)}</span>;
    }

    configuradas = [CONFIGURADA];
    render(
      <Provider page="maq-inicio" params={{ maquina: "vib-motor-03" }}>
        <SondaAislada />
      </Provider>,
    );

    expect(screen.getByText("vib-motor-03")).toBeTruthy();
    expect(subscribeSistema).not.toHaveBeenCalled();
    expect(fuenteDeMaquinaConfigurada).not.toHaveBeenCalled();

    vi.doUnmock("@/Demo-EVA/data/comunes/EvaProvider.jsx");
    vi.doUnmock("@/Demo-EVA/data/comunes/fuenteDeMaquina.js");
  });
});
