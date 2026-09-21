// @vitest-environment jsdom
/**
 * secciones-por-maquina.test.jsx
 * ------------------------------------------------------------------
 * Una sección del menú por máquina CONFIGURADA. Plan 37 F1.
 *
 * ── QUÉ DEFIENDE ───────────────────────────────────────────────────
 *
 *  1. **Sin máquinas configuradas el menú es el de siempre**, byte a byte:
 *     las rutas `maq-*` existen pero no aparecen solas.
 *  2. **Cada máquina en servicio produce su sección**, con su NOMBRE como
 *     rótulo y las tres vistas dentro, en el apartado de Visualización.
 *  3. **Navegar desde ella lleva el parámetro de máquina**, y la entrada
 *     activa es la pareja ruta+máquina: dos máquinas apuntan a la misma ruta
 *     y sólo una puede estar marcada.
 *  4. **El Sidebar no abre ninguna suscripción** por saber de máquinas.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildNav } from "@/app/routes/buildNav.js";
import { ROUTES, NAV_GROUPS } from "@/app/routes/routes.jsx";
import { NAV, RUTAS_POR_MAQUINA, navParaRol } from "@/app/routes/index.js";

const MAQUINAS = [
  { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true },
  { id: "vib-motor-04", nombre: "Segundo motor", tipo: "vibraciones", activa: true },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("el árbol del menú con máquinas configuradas", () => {
  it("sin máquinas, las rutas de máquina existen pero no salen en el menú", () => {
    expect(RUTAS_POR_MAQUINA).toEqual([
      "maq-inicio", "maq-graficas", "maq-3d",
      "maq-hallazgos", "maq-avisos", "maq-casos", "maq-rag",
    ]);
    const ids = NAV.flatMap((n) => (n.children ?? [n]).map((c) => c.id));
    for (const id of RUTAS_POR_MAQUINA) expect(ids).not.toContain(id);
    /* El árbol sin máquinas es idéntico al que devuelve `buildNav` a secas. */
    expect(navParaRol(() => true, [])).toEqual(NAV);
  });

  it("cada máquina en servicio produce su sección, con su nombre y sus tres vistas", () => {
    const nav = buildNav(ROUTES, NAV_GROUPS, () => true, MAQUINAS);
    const secciones = nav.filter((n) => n.group?.startsWith("maq:"));

    expect(secciones.map((s) => s.label)).toEqual(["Nuevo-Modor", "Segundo motor"]);
    for (const s of secciones) {
      expect(s.modulo).toBe("monitoreo");
      expect(s.children.map((c) => c.id)).toEqual([
        "maq-inicio", "maq-graficas", "maq-3d",
        "maq-hallazgos", "maq-avisos", "maq-casos", "maq-rag",
      ]);
      /* Los tres apartados, en el mismo orden que la máquina escrita a mano. */
      expect(s.children.map((c) => c.apartado)).toEqual([
        "visualizacion", "visualizacion", "visualizacion",
        "diagnostico", "diagnostico", "documentacion", "documentacion",
      ]);
    }
    /* El parámetro viaja en el hijo: es lo que el Sidebar manda al navegar. */
    expect(secciones[0].children[0].params).toEqual({ maquina: "vib-motor-03" });
    expect(secciones[1].children[0].params).toEqual({ maquina: "vib-motor-04" });
  });

  it("las secciones de máquina van delante, junto a la máquina escrita a mano", () => {
    const nav = buildNav(ROUTES, NAV_GROUPS, () => true, MAQUINAS);
    expect(nav[0].group).toBe("maq:vib-motor-03");
    expect(nav[1].group).toBe("maq:vib-motor-04");
    expect(nav[2].group).toBe("sec-vibraciones");
  });

  it("una máquina sin id no produce sección: no se inventa nada", () => {
    const nav = buildNav(ROUTES, NAV_GROUPS, () => true, [{ nombre: "sin id" }, null]);
    expect(nav.some((n) => n.group?.startsWith("maq:"))).toBe(false);
  });
});

describe("el Sidebar con una máquina configurada", () => {
  async function montarSidebar({ page, params = {}, onNavigate = vi.fn() }) {
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
    /* El badge de hallazgos no sale a la red y aquí tampoco hace falta. */
    vi.doMock("@/Demo-EVA/data/comunes/hallazgos.js", () => ({
      useConteoHallazgos: () => ({ total: 0 }),
    }));
    vi.doMock("@/Demo-EVA/data/comunes/MaquinasConfiguradas.jsx", () => ({
      useMaquinasConfiguradas: () => ({ maquinas: [MAQUINAS[0]], cargando: false, error: null, recargar: () => {} }),
      MaquinasConfiguradasProvider: ({ children }) => children,
      EVENTO_MAQUINAS_CAMBIARON: "eva:maquinas-cambiaron",
      avisarMaquinasCambiaron: () => {},
    }));
    vi.doMock("@/app/providers/usePermisos.js", () => ({
      usePermisos: () => ({ puede: () => true, rol: "administrador" }),
    }));

    const [{ ThemeProvider }, { Sidebar }] = await Promise.all([
      import("@/theme"),
      import("@/app/layout/Sidebar.jsx"),
    ]);
    render(
      <ThemeProvider>
        <Sidebar page={page} params={params} onNavigate={onNavigate} />
      </ThemeProvider>,
    );
    return { onNavigate, subscribeSistema };
  }

  it("pinta la sección con el nombre de la máquina y navega con su parámetro", async () => {
    const { onNavigate, subscribeSistema } = await montarSidebar({ page: "vib-inicio" });

    const seccion = await screen.findByRole("button", { name: /Nuevo-Modor/ });
    expect(seccion).toBeTruthy();

    /* Hay dos «Inicio»: el de vibraciones y el de la sección de la máquina.
       Los hijos de una sección van en el bloque que sigue a su cabecera. */
    const contenedor = seccion.nextElementSibling;
    fireEvent.click(within(contenedor).getByRole("button", { name: /^Inicio/ }));
    expect(onNavigate).toHaveBeenCalledWith("maq-inicio", { maquina: "vib-motor-03" });

    /* Saber de máquinas configuradas no abre ninguna suscripción. */
    expect(subscribeSistema).not.toHaveBeenCalled();
  });

  it("la entrada activa es la pareja ruta+máquina, no la ruta sola", async () => {
    await montarSidebar({ page: "maq-inicio", params: { maquina: "vib-motor-03" } });

    const seccion = await screen.findByRole("button", { name: /Nuevo-Modor/ });
    const inicio = within(seccion.nextElementSibling).getByRole("button", { name: /^Inicio/ });
    expect(inicio.className).toMatch(/nav-active/);

    /* Y el «Inicio» de la máquina escrita a mano, que es OTRA ruta, no. */
    const otros = screen.getAllByRole("button", { name: /^Inicio/ }).filter((b) => b !== inicio);
    expect(otros.length).toBeGreaterThan(0);
    for (const b of otros) expect(b.className).not.toMatch(/nav-active/);
  });
});
