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
  it("son las dieciséis vistas, agrupadas por SISTEMA", () => {
    // El array va en el MISMO orden que el sidebar, y eso no es cosmético:
    // `buildNav` coloca cada sección en la posición de su primer hijo, así
    // que un bloque declarado fuera de sitio saldría bien en el menú y
    // dejaría este archivo diciendo otra cosa que la pantalla.
    //
    // El corte por sistema (agosto de 2026) es lo que ordena todo lo demás:
    // la estación de llenado cuelga de PLC_1 y el sistema de vibraciones de
    // PLC_2, y no comparten nada. Antes iban en una sola lista y la
    // separación existía sólo en la cabeza de quien ya la sabía.
    //
    // `eva-detalle` cierra la lista sin `nav`: no es una pantalla a la que un
    // operador llegue en frío —¿de qué activo?—, pero sigue siendo superficie
    // navegable. Si alguien esconde una vista detrás de una bandera, aquí se
    // ve.
    expect(ids).toEqual([
      // Estación de llenado — el tanque y su grupo de bombeo.
      "eva-inicio",
      "eva-planta",
      "eva-riesgos",
      "eva-controles",
      "eva-maqueta",
      // Vibraciones — OTRA máquina: otro motor, otro variador, otro PLC.
      "vib-inicio",
      "eva-vibraciones",
      "vib-controles",
      "eva-riesgos-vibracion",
      "vib-3d",
      // General — del servidor, no de una máquina: valen para las dos.
      "eva-alarmas",
      "eva-assets",
      // Ni siquiera es de este servidor: consulta otro backend con el conjunto
      // MetroPT-3, que son compresores de metro. Va aquí justamente para no
      // afirmar que sus curvas son del tanque ni del motor de vibraciones.
      "eva-prediccion",
      // RAG — de dónde saca el asistente lo que sabe fuera de ICONICS. No es
      // de ninguna máquina, por eso tiene su propia sección y no cuelga de
      // «General».
      "rag-documentacion",
      // Sin `nav`: destinos de detalle, no pantallas a las que se llegue en
      // frío desde el sidebar.
      "eva-detalle",
      "cierre-diagnostico",
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
  it("las cuatro secciones salen del registro, con sus vistas dentro", () => {
    // `buildNav` LANZA si una ruta referencia un grupo que no está declarado en
    // NAV_GROUPS, y ese fallo sólo aparece al importar el registro. Comprobarlo
    // aquí lo convierte en un fallo de la suite y no en una pantalla en blanco.
    expect(NAV.map((n) => n.group ?? n.id)).toEqual([
      "sec-llenado",
      "sec-vibraciones",
      "sec-general",
      "sec-rag",
    ]);

    const llenado = NAV.find((n) => n.group === "sec-llenado");
    expect(llenado.label).toBe("Estación de llenado");
    expect(llenado.children.map((c) => c.id)).toEqual([
      "eva-inicio", "eva-planta", "eva-riesgos", "eva-controles", "eva-maqueta",
    ]);

    const vibraciones = NAV.find((n) => n.group === "sec-vibraciones");
    expect(vibraciones.label).toBe("Estación de vibraciones");
    expect(vibraciones.children.map((c) => c.id)).toEqual([
      "vib-inicio", "eva-vibraciones", "vib-controles",
      "eva-riesgos-vibracion", "vib-3d",
    ]);

    // Alarmas y Assets son del SERVIDOR, no de una máquina: si alguna acabara
    // dentro de un sistema, estaría diciendo que sus eventos son sólo de ése.
    //
    // «Predicción (Beta)» está aquí por una razón más fuerte todavía: no lee
    // este servidor en absoluto, sino otro backend con el conjunto MetroPT-3.
    // Colgarla de una de las dos estaciones afirmaría que sus curvas son de esa
    // máquina, y no lo son de ninguna de las dos.
    //
    // `eva-alarmas` no sale en esta lista: se ocultó del sidebar el
    // 2026-08-31 (temporal, ver la cabecera de su entrada en `routes.jsx`)
    // para cortar el sondeo de `/api/iconics/alarms` que el botón del Topbar
    // hacía en toda la aplicación. Sigue en ROUTES —comprobado en el test de
    // arriba—, sólo sin `nav`, mismo criterio que `eva-detalle`.
    const general = NAV.find((n) => n.group === "sec-general");
    expect(general.label).toBe("General");
    expect(general.children.map((c) => c.id)).toEqual([
      "eva-assets", "eva-prediccion",
    ]);

    // RAG es su propia sección por el mismo motivo que las otras tres NO se
    // mezclan entre sí: lo que hay aquí no describe una instalación de la
    // planta, describe de dónde saca el asistente lo que sabe fuera de lo
    // que mide ICONICS.
    const rag = NAV.find((n) => n.group === "sec-rag");
    expect(rag.label).toBe("RAG");
    expect(rag.children.map((c) => c.id)).toEqual(["rag-documentacion"]);
  });

  it("cada sistema tiene su propio «Riesgos», y no se mezclan", () => {
    // Son dos motores de reglas distintos sobre dos máquinas distintas:
    // `riesgos.js` evalúa el tanque —nivel, presión, caudal— y
    // `riesgosVibracion.js` un motor con acelerómetros. Una sola pantalla con
    // las dos listas invitaría a buscar entre ellas una relación que no
    // existe, que es el error que `shared/eva/sistemas.js` evita al asistente.
    const conRiesgos = NAV.flatMap((s) =>
      (s.children ?? []).filter((c) => c.label === "Riesgos").map((c) => [s.group, c.id])
    );
    expect(conRiesgos).toEqual([
      ["sec-llenado", "eva-riesgos"],
      ["sec-vibraciones", "eva-riesgos-vibracion"],
    ]);
  });

  it("la ruta por defecto está visible en el menú", () => {
    // Es el error clásico al reorganizar secciones: la app arranca en una vista
    // sin entrada de menú y ninguna queda resaltada, que se lee como que el
    // sidebar está roto.
    const visibles = NAV.flatMap((n) => (n.children ? n.children.map((c) => c.id) : [n.id]));
    expect(visibles).toContain(DEFAULT_ROUTE);
  });
});
