// @vitest-environment jsdom
/**
 * origen.test.jsx
 * ------------------------------------------------------------------
 * Los TRES orígenes de datos y su señalización.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * Durante un tiempo la aplicación mostró «En vivo» tanto leyendo ICONICS
 * como leyendo el simulador. No era un descuido de UI: el provider
 * calculaba `isLiveTransport` y ningún componente lo consumía, así que la
 * información existía y no llegaba a la pantalla.
 *
 * Los valores del simulador son plausibles a propósito —el OEE es el
 * producto real de sus factores, las piezas crecen, los estados rotan—
 * de modo que la confusión era indetectable a simple vista. Es el mismo
 * riesgo que motivó la cinta del modo demo, y más peligroso, porque la
 * demo sí avisaba.
 *
 * Lo que se fija aquí es la regla de negocio: **todo origen que no sea el
 * servidor real tiene que anunciarse**. Si alguien añade un cuarto origen
 * y olvida marcarlo, esta prueba lo caza.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODOS, ORIGENES, origenActual } from "@/lib/datasource/DataSourceProvider.jsx";

afterEach(() => vi.unstubAllEnvs());

describe("orígenes de datos", () => {
  it("son exactamente tres y ninguno se llama igual", () => {
    const claves = Object.keys(ORIGENES);

    expect(claves).toEqual(["real", "simulado", "demo"]);
    expect(new Set(Object.values(ORIGENES).map((o) => o.label)).size).toBe(3);
  });

  it("SOLO el origen real se libra de avisar", () => {
    // La regla que evita que alguien confunda datos inventados con la
    // planta. Un cuarto origen que se olvidara de `avisa: true` fallaría
    // aquí y no en una reunión con el proyector encendido.
    expect(ORIGENES.real.avisa).toBe(false);

    for (const [clave, origen] of Object.entries(ORIGENES)) {
      if (clave === "real") continue;
      expect(origen.avisa, `${clave} debe anunciarse`).toBe(true);
    }
  });

  it("cada origen dice sin ambigüedad si hay conexión", () => {
    expect(ORIGENES.real.descripcion).toMatch(/ICONICS/i);
    expect(ORIGENES.simulado.descripcion).toMatch(/sin conexión/i);
    expect(ORIGENES.demo.descripcion).toMatch(/sin conexión/i);
  });

  it("usa un color distinto por origen, y el real es el único 'bueno'", () => {
    const tokens = Object.values(ORIGENES).map((o) => o.token);

    expect(new Set(tokens).size).toBe(3);
    expect(ORIGENES.real.token).toBe("success");
  });
});

describe("derivación del origen activo", () => {
  // La primera versión de esta suite solo probaba las CONSTANTES, y una
  // edición descuidada dejó la derivación con «real» inalcanzable (sus
  // dos ramas finales devolvían simulado) sin que nada fallara. Los tres
  // caminos, cada uno con su entorno:

  it("una instalación limpia apunta al servidor real", () => {
    // Sin VITE_ICONICS_FAKE. Es el punto de la inversión: antes el
    // defecto era el simulador, y un build sin configurar quedaba
    // enseñando datos inventados para siempre.
    expect(origenActual(MODOS.LIVE)).toBe(ORIGENES.real);
  });

  it("el simulador solo se entra pidiéndolo explícitamente", () => {
    vi.stubEnv("VITE_ICONICS_FAKE", "true");
    expect(origenActual(MODOS.LIVE)).toBe(ORIGENES.simulado);
  });

  it("la demo manda sobre el transporte: es demo aunque el fake esté activo", () => {
    vi.stubEnv("VITE_ICONICS_FAKE", "true");
    expect(origenActual(MODOS.DEMO)).toBe(ORIGENES.demo);
  });
});

describe("el modo demo se compila bajo bandera", () => {
  /*
   * El interruptor de demo sustituye la planta entera por datos inventados
   * plausibles. En un monitor de planta —sin teclado y sin nadie delante—
   * sólo puede activarse por accidente, y una vez activado nadie lo
   * desactiva: la cinta de aviso funciona con público delante, no en una
   * pared.
   *
   * Por eso el cierre tiene que estar en el MODELO y no sólo en que el
   * Topbar oculte el botón; si el cierre viviera únicamente en la interfaz,
   * cualquier consumidor futuro lo reabriría sin enterarse. Se recarga el
   * módulo porque la bandera se resuelve al importarlo, igual que en el build.
   */
  const cargarCon = async (valor) => {
    vi.resetModules();
    if (valor === undefined) vi.stubEnv("VITE_ENABLE_DEMO", "");
    else vi.stubEnv("VITE_ENABLE_DEMO", valor);
    return import("@/lib/datasource/DataSourceProvider.jsx");
  };

  it("está apagado si nadie lo pide", async () => {
    expect((await cargarCon(undefined)).DEMO_HABILITADO).toBe(false);
  });

  it("no lo enciende cualquier valor: sólo la cadena 'true'", async () => {
    expect((await cargarCon("1")).DEMO_HABILITADO).toBe(false);
    expect((await cargarCon("yes")).DEMO_HABILITADO).toBe(false);
    expect((await cargarCon("true")).DEMO_HABILITADO).toBe(true);
  });
});
