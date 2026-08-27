// @vitest-environment jsdom
/**
 * origen.test.jsx
 * ------------------------------------------------------------------
 * Los DOS orígenes de datos y su señalización.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Durante un tiempo la aplicación mostró «En vivo» tanto leyendo ICONICS
 * como leyendo el simulador. No era un descuido de UI: el provider
 * calculaba `isLiveTransport` y ningún componente lo consumía, así que la
 * información existía y no llegaba a la pantalla.
 *
 * Los valores del simulador son plausibles a propósito —el OEE es el
 * producto real de sus factores, las piezas crecen, los estados rotan— de modo
 * que la confusión era indetectable a simple vista.
 *
 * Lo que se fija aquí es la regla de negocio: **todo origen que no sea el
 * servidor real tiene que anunciarse**. Si alguien añade un tercero y olvida
 * marcarlo, esta prueba lo caza.
 *
 * ── QUÉ CAMBIÓ EN EL PLAN 5 ────────────────────────────────────────
 *
 * Eran tres orígenes y ahora son dos: el modo demo se retiró porque su fuente
 * se saltaba el motor de polling —y con él la calidad OPC, los reintentos y la
 * marca de dato rancio—, que es justo lo que había que ejercitar. Lo único
 * valioso que aportaba, poder cambiar en caliente, lo hereda el simulador.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ORIGENES, origenActual } from "@/lib/datasource/DataSourceProvider.jsx";
import { TRANSPORTES } from "@/lib/iconics/transport.js";

afterEach(() => vi.unstubAllEnvs());

describe("orígenes de datos", () => {
  it("son exactamente dos y ninguno se llama igual", () => {
    expect(Object.keys(ORIGENES)).toEqual(["real", "simulado"]);
    expect(new Set(Object.values(ORIGENES).map((o) => o.label)).size).toBe(2);
  });

  it("SOLO el origen real se libra de avisar", () => {
    // La regla que evita que alguien confunda datos inventados con la planta.
    // Un tercer origen que se olvidara de `avisa: true` fallaría aquí y no en
    // una reunión con el proyector encendido.
    expect(ORIGENES.real.avisa).toBe(false);

    for (const [clave, origen] of Object.entries(ORIGENES)) {
      if (clave === "real") continue;
      expect(origen.avisa, `${clave} debe anunciarse`).toBe(true);
    }
  });

  it("cada origen dice sin ambigüedad si hay conexión", () => {
    expect(ORIGENES.real.descripcion).toMatch(/ICONICS/i);
    expect(ORIGENES.simulado.descripcion).toMatch(/sin conexión/i);
  });

  it("usa un color distinto por origen, y el real es el único 'bueno'", () => {
    expect(new Set(Object.values(ORIGENES).map((o) => o.token)).size).toBe(2);
    expect(ORIGENES.real.token).toBe("success");
  });
});

describe("derivación del origen activo", () => {
  // La primera versión de esta suite solo probaba las CONSTANTES, y una
  // edición descuidada dejó la derivación con «real» inalcanzable (sus dos
  // ramas finales devolvían simulado) sin que nada fallara.

  it("el transporte real es el origen real", () => {
    expect(origenActual(TRANSPORTES.REAL)).toBe(ORIGENES.real);
  });

  it("el transporte falso se anuncia como simulado", () => {
    expect(origenActual(TRANSPORTES.SIMULADO)).toBe(ORIGENES.simulado);
  });

  it("cualquier otra cosa cae en real, nunca en un falso silencioso", () => {
    // Un valor corrupto en localStorage no puede acabar enseñando datos
    // inventados sin que la cinta lo anuncie. Ante la duda, el servidor.
    for (const basura of [undefined, null, "", "demo", 42]) {
      expect(origenActual(basura)).toBe(ORIGENES.real);
    }
  });
});

describe("el transporte inicial", () => {
  const cargarCon = async (fake) => {
    vi.resetModules();
    vi.stubEnv("VITE_ICONICS_FAKE", fake ?? "");
    return import("@/lib/iconics/transport.js");
  };

  it("una instalación limpia apunta al servidor real", async () => {
    // Es el punto de la inversión: antes el defecto era el simulador, y un
    // build sin configurar quedaba enseñando datos inventados para siempre.
    const { transporteInicial, TRANSPORTES: T } = await cargarCon(undefined);
    expect(transporteInicial()).toBe(T.REAL);
  });

  it("el simulador solo se entra pidiéndolo explícitamente", async () => {
    const { transporteInicial, TRANSPORTES: T } = await cargarCon("true");
    expect(transporteInicial()).toBe(T.SIMULADO);
  });

  it("no lo enciende cualquier valor: sólo la cadena 'true'", async () => {
    for (const valor of ["1", "yes", "TRUE"]) {
      const { transporteInicial, TRANSPORTES: T } = await cargarCon(valor);
      expect(transporteInicial(), `valor "${valor}"`).toBe(T.REAL);
    }
  });
});

describe("el interruptor se compila bajo bandera", () => {
  /*
   * El interruptor sustituye la planta entera por datos inventados plausibles.
   * En un monitor de planta —sin teclado y sin nadie delante— sólo puede
   * activarse por accidente, y una vez activado nadie lo desactiva: la cinta
   * de aviso funciona con público delante, no en una pared.
   *
   * Por eso el cierre tiene que estar en el MODELO y no sólo en que el Topbar
   * oculte el botón; si viviera únicamente en la interfaz, cualquier consumidor
   * futuro lo reabriría sin enterarse. Se recarga el módulo porque la bandera
   * se resuelve al importarlo, igual que en el build.
   */
  const cargarCon = async (valor) => {
    vi.resetModules();
    vi.stubEnv("VITE_ENABLE_SIMULATOR", valor ?? "");
    return import("@/lib/datasource/DataSourceProvider.jsx");
  };

  it("está apagado si nadie lo pide", async () => {
    expect((await cargarCon(undefined)).SIMULADOR_CONMUTABLE).toBe(false);
  });

  it("no lo enciende cualquier valor: sólo la cadena 'true'", async () => {
    expect((await cargarCon("1")).SIMULADOR_CONMUTABLE).toBe(false);
    expect((await cargarCon("yes")).SIMULADOR_CONMUTABLE).toBe(false);
    expect((await cargarCon("true")).SIMULADOR_CONMUTABLE).toBe(true);
  });
});

describe("la preferencia guardada", () => {
  /*
   * Sin esta regla, una pantalla que quedó en simulado antes de apagar la
   * bandera arrancaría en simulado PARA SIEMPRE, y ya sin botón para sacarla.
   * Es el modo de fallo más caro de todo este mecanismo: silencioso,
   * persistente y sin salida desde la propia pantalla.
   */
  const montarCon = async ({ bandera, guardado, fake }) => {
    vi.resetModules();
    vi.stubEnv("VITE_ENABLE_SIMULATOR", bandera ?? "");
    vi.stubEnv("VITE_ICONICS_FAKE", fake ?? "");
    globalThis.localStorage.clear();
    if (guardado) globalThis.localStorage.setItem("iconics.transporte", guardado);

    const { DataSourceProvider } = await import("@/lib/datasource/DataSourceProvider.jsx");
    const { useDataSource } = await import("@/lib/datasource/DataSourceProvider.jsx");
    return { DataSourceProvider, useDataSource };
  };

  it("se ignora si el interruptor no está compilado", async () => {
    const { DataSourceProvider, useDataSource } = await montarCon({
      bandera: "",
      guardado: "simulado",
    });

    const { render } = await import("@testing-library/react");
    let visto = null;
    function Sonda() {
      visto = useDataSource();
      return null;
    }
    render(
      <DataSourceProvider>
        <Sonda />
      </DataSourceProvider>
    );

    expect(visto.transporte).toBe("real");
    expect(visto.conmutable).toBe(false);
  });

  it("se respeta si el interruptor sí está compilado", async () => {
    const { DataSourceProvider, useDataSource } = await montarCon({
      bandera: "true",
      guardado: "simulado",
    });

    const { render } = await import("@testing-library/react");
    let visto = null;
    function Sonda() {
      visto = useDataSource();
      return null;
    }
    render(
      <DataSourceProvider>
        <Sonda />
      </DataSourceProvider>
    );

    expect(visto.transporte).toBe("simulado");
    expect(visto.conmutable).toBe(true);
  });
});
