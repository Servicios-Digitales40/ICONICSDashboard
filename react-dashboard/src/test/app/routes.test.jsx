/**
 * routes.test.jsx
 * ------------------------------------------------------------------
 * Qué vistas existen.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * El registro de rutas es lo que define la superficie de la aplicación en
 * planta: lo que un operador puede abrir en un monitor sin teclado. Sus modos
 * de fallo son silenciosos —el build pasa, la app arranca— y sólo se ven en la
 * pantalla equivocada, en la pared, cuando ya no hay nadie mirando.
 *
 * Hasta agosto de 2026 esta prueba cubría además dos mecanismos que ya no
 * existen: la bandera `VITE_ENABLE_PROTOTYPES`, que añadía doce propuestas de
 * diseño sobre las vistas de Resonac, y el modo `SOLO_DEMO_EVA`, que ocultaba
 * el resto del tablero sin borrarlo. Los dos se fueron con la sección que
 * gateaban. Lo que queda es la invariante que sobrevive a esa historia: el
 * registro tiene que ser coherente consigo mismo y con el sidebar que produce.
 */
import { describe, expect, it } from "vitest";

import { ROUTES, DEFAULT_ROUTE } from "@/app/routes/routes.jsx";
import { NAV, PAGES, ROUTE_IDS } from "@/app/routes/index.js";

const ids = ROUTES.map((r) => r.id);

describe("superficie de la aplicación", () => {
  it("son las nueve vistas de la demo de agua, en su orden", () => {
    // `eva-inicio` primero —la landing, y `DEFAULT_ROUTE`—, luego las cinco
    // del sidebar, y `eva-detalle` al final: sin `nav` porque no es una
    // pantalla a la que un operador llegue en frío —¿de qué activo?—, pero
    // sigue siendo superficie navegable y tiene que aparecer aquí igual. Si
    // alguien esconde una vista detrás de una bandera, aquí se ve — y el
    // sitio de esa decisión sería el catálogo de señales o los umbrales, no
    // el registro de rutas.
    //
    // `eva-alarmas` (Plan 13, Fase 9) entra antes de `eva-assets`: el
    // historial de eventos es una herramienta de OPERACIÓN — assets es de
    // diagnóstico, y va detrás por criterio de uso más frecuente primero.
    // `eva-riesgos` va inmediatamente detrás de `eva-planta` porque contesta la
    // pregunta siguiente: «Planta» dice qué está pasando y «Riesgos» qué puede
    // pasar si sigue así. Separarlas con las dos vistas 3D rompería esa
    // secuencia de lectura, que es la razón de que exista la pantalla.
    expect(ids).toEqual([
      "eva-inicio",
      "eva-planta",
      "eva-riesgos",
      "eva-vibraciones",
      "eva-maquina-3d",
      "eva-maqueta",
      "eva-alarmas",
      "eva-assets",
      "eva-detalle",
    ]);
  });

  it("no queda ninguna ruta de Resonac", () => {
    // La transición al modelo de agua retiró el tablero de OEE entero. Un id
    // suyo aquí significa que alguien lo revivió a medias: su vista ya no
    // existe y la ruta reventaría al abrirse.
    const deResonac = ids.filter(
      (id) => /^(dashboard|area-|maquina-3d|maqueta-3d|machine-detail|assets|sandbox)/.test(id)
    );
    expect(deResonac).toEqual([]);
  });

  it("ningún id se repite y toda ruta tiene componente", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ROUTE_IDS) {
      expect(PAGES[id], `"${id}" se quedó sin componente`).toBeTruthy();
    }
  });
});

describe("el sidebar que sale del registro", () => {
  it("las dos vistas 3D arman su grupo, y las 2D quedan sueltas", () => {
    // `buildNav` LANZA si una ruta referencia un grupo que no está declarado en
    // NAV_GROUPS, y ese fallo sólo aparece al importar el registro. Comprobarlo
    // aquí lo convierte en un fallo de la suite y no en una pantalla en blanco.
    expect(NAV.map((n) => n.group ?? n.id)).toEqual([
      "eva-inicio",
      "eva-planta",
      "eva-riesgos",
      "eva-vibraciones",
      "eva-3d",
      "eva-alarmas",
      "eva-assets",
    ]);

    const grupo = NAV.find((n) => n.group === "eva-3d");
    expect(grupo.label).toBe("3D");
    expect(grupo.children.map((c) => c.id)).toEqual(["eva-maquina-3d", "eva-maqueta"]);
  });

  it("la ruta por defecto está visible en el menú", () => {
    // Es el error clásico al reorganizar secciones: la app arranca en una vista
    // sin entrada de menú y ninguna queda resaltada, que se lee como que el
    // sidebar está roto.
    const visibles = NAV.flatMap((n) => (n.children ? n.children.map((c) => c.id) : [n.id]));
    expect(visibles).toContain(DEFAULT_ROUTE);
  });
});
