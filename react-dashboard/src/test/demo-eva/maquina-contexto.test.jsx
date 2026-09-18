// @vitest-environment jsdom
/**
 * maquina-contexto.test.jsx
 * ------------------------------------------------------------------
 * `MaquinaContext`: de qué máquina va la pantalla. Plan 33 F6.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Que la RUTA mande sobre el parámetro.** En `vib-inicio` la máquina es
 *     vibraciones, y un `?maquina=tanque` pegado a mano no puede cambiar de
 *     qué habla esa pantalla. Al revés, un parámetro olvidado al navegar haría
 *     que una vista del tanque hablara de vibraciones con cifras reales y sin
 *     un error en ningún sitio.
 *  2. **Que una máquina desconocida NO caiga en otra de consuelo.** Es el
 *     fallo más caro de este proyecto: contestar correctamente sobre la
 *     instalación equivocada.
 *  3. **Que el provider no suscriba NADA.** Envuelve el Shell entero, así que
 *     si pidiera datos los pediría en todas las pantallas — la regresión de
 *     31-08-2026 (contador de alarmas) y 17-09-2026 (badge de hallazgos).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MaquinaProvider,
  maquinaDeNavegacion,
  useMaquina,
} from "@/Demo-EVA/data/comunes/MaquinaContext.jsx";

afterEach(() => {
  /* Sin esto el DOM del render anterior sigue montado y `getByText` encuentra
     dos coincidencias — varias pruebas de aquí pintan las mismas etiquetas. */
  cleanup();
  vi.clearAllMocks();
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
    expect(maquinaDeNavegacion({ page: "vib-inicio", params: {} })).toBe("vibraciones");
    expect(maquinaDeNavegacion({ page: "eva-inicio", params: {} })).toBe("tanque");
  });

  /*
   * El orden importa y no es simetría: un `?maquina=` olvidado en la URL al
   * navegar desde otra pantalla haría que una vista del tanque hablara de
   * vibraciones, con cifras reales y sin un error en ningún log.
   */
  it("la RUTA manda sobre el parámetro, no al revés", () => {
    expect(maquinaDeNavegacion({ page: "vib-inicio", params: { maquina: "tanque" } })).toBe(
      "vibraciones",
    );
  });

  it("usa el parámetro sólo cuando la ruta no es de ninguna máquina", () => {
    expect(
      maquinaDeNavegacion({ page: "eva-configuracion", params: { maquina: "vib-02" } }),
    ).toBe("vib-02");
  });

  it("sin ruta de máquina y sin parámetro, no inventa ninguna", () => {
    expect(maquinaDeNavegacion({ page: "eva-configuracion", params: {} })).toBeNull();
    expect(maquinaDeNavegacion({})).toBeNull();
    expect(maquinaDeNavegacion({ page: "eva-turno", params: { maquina: "  " } })).toBeNull();
  });
});

describe("el contexto", () => {
  it("resuelve la entrada del registro de una máquina real", () => {
    montar("vib-inicio");

    expect(screen.getByText("id:vibraciones")).toBeTruthy();
    expect(screen.getByText("registro:vibraciones")).toBeTruthy();
    expect(screen.getByText("servicio:true")).toBeTruthy();
  });

  /*
   * `registro: null` con un `id` no nulo es un estado REAL: alguien guardó el
   * enlace de una máquina que ya no está configurada. Lo que NO puede pasar es
   * caer en otra.
   */
  it("una máquina desconocida deja `registro` en null, sin caer en otra", () => {
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
 * dos veces anteriores se escapó.
 */
describe("el provider no despierta el sondeo de ninguna máquina", () => {
  it("montarlo no abre ninguna suscripción", async () => {
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

    const { MaquinaProvider: Provider, useMaquina: usar } = await import(
      "@/Demo-EVA/data/comunes/MaquinaContext.jsx"
    );

    function SondaAislada() {
      return <span>{String(usar().id)}</span>;
    }

    render(
      <Provider page="vib-inicio" params={{}}>
        <SondaAislada />
      </Provider>,
    );

    expect(screen.getByText("vibraciones")).toBeTruthy();
    expect(subscribeSistema).not.toHaveBeenCalled();

    vi.doUnmock("@/Demo-EVA/data/comunes/EvaProvider.jsx");
  });
});
