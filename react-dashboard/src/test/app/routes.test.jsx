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
import { buildNav } from "@/app/routes/buildNav.js";

const ids = ROUTES.map((r) => r.id);

describe("superficie de la aplicación", () => {
  it("son las veintiséis vistas, agrupadas por MÓDULO y por SISTEMA", () => {
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
      // `salud-sistema` es la más «del servidor» de todas: no habla de ninguna
      // instalación, habla del PUENTE (Plan 20 F10).
      "eva-alarmas",
      "eva-assets",
      // `eva-turno` (Plan 25 F2) va en General por el mismo criterio que sus
      // vecinas: un turno no es de una máquina, quien entra se hace cargo de la
      // instalación entera.
      "eva-turno",
      // `eva-bandeja` (Plan 25 F6) — igual: un hallazgo puede ser de cualquiera
      // de las dos máquinas, así que la bandeja no es de ninguna.
      "eva-bandeja",
      // `eva-cuaderno` (Plan 25 F8) — igual: una nota puede ser de cualquiera
      // de las dos, o de ninguna en concreto.
      "eva-cuaderno",
      "salud-sistema",
      // RAG — de dónde saca el asistente lo que sabe fuera de ICONICS. No es
      // de ninguna máquina, por eso tiene su propia sección y no cuelga de
      // «General».
      // Son sus DOS fuentes. Los casos van primero porque son la única
      // que se llena sola: cada cierre de diagnóstico, cada reparación
      // contada por voz.
      //
      // Va ANTES de Predicción desde el 12-09-2026 (Plan 25 F5): pertenece al
      // módulo `monitoreo`, y las secciones de un mismo módulo van seguidas
      // para que el sidebar no abra su cabecera dos veces.
      "rag-casos",
      "rag-documentacion",
      // Predicción — OTRO MÓDULO, no una sección más: un compresor real cuyo
      // histórico sirve otro backend. No entra por ICONICS, así que no puede
      // colgar de ninguna de las dos estaciones ni de «General», que significa
      // «del servidor ICONICS, no de una máquina». Ver CLAUDE.md §4.7.
      //
      // Cierra la lista de lo navegable a propósito: es la frontera entre
      // fuentes de datos, y en el menú se ve como el último bloque.
      //
      // Las cuatro últimas son pantallas PENDIENTES: se abren y dicen qué
      // falta para construirlas, sin dibujar un solo dato de ejemplo. Están
      // registradas y no escondidas tras una bandera a propósito — la
      // estructura del módulo es lo que se entregó en el Plan 19 F2, y un
      // sidebar que la enseña dice de un vistazo cuánto falta.
      "pred-inicio",
      "pred-eventos",
      "pred-variables",
      "pred-historico",
      "pred-correlacion",
      "pred-pronostico",
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
  it("las cinco secciones salen del registro, con sus vistas dentro", () => {
    // `buildNav` LANZA si una ruta referencia un grupo que no está declarado en
    // NAV_GROUPS, y ese fallo sólo aparece al importar el registro. Comprobarlo
    // aquí lo convierte en un fallo de la suite y no en una pantalla en blanco.
    //
    // `sec-prediccion` es la quinta desde el 03-09-2026, y no es cosmética:
    // marca la frontera entre los dos MÓDULOS (CLAUDE.md §4.7). Las cuatro
    // primeras se sirven de ICONICS; esa quinta, no.
    expect(NAV.map((n) => n.group ?? n.id)).toEqual([
      "sec-llenado",
      "sec-vibraciones",
      "sec-general",
      /*
       * RAG subió por encima de Predicción el 12-09-2026 (Plan 25 F5). No es
       * preferencia de orden: las secciones de un mismo MÓDULO van seguidas,
       * porque el sidebar abre una cabecera cada vez que el módulo cambia. Con
       * RAG (monitoreo) declarado después de Predicción, el menú abría tres
       * cabeceras para dos módulos y Predicción partía en dos el bloque de
       * ICONICS — lo contrario de lo que la separación dice.
       */
      "sec-rag",
      "sec-prediccion",
    ]);

    const llenado = NAV.find((n) => n.group === "sec-llenado");
    expect(llenado.children.map((c) => c.id)).toEqual([
      "eva-inicio", "eva-planta", "eva-riesgos", "eva-controles", "eva-maqueta",
    ]);

    const vibraciones = NAV.find((n) => n.group === "sec-vibraciones");
    expect(vibraciones.children.map((c) => c.id)).toEqual([
      "vib-inicio", "eva-vibraciones", "vib-controles",
      "eva-riesgos-vibracion", "vib-3d",
    ]);

    // Alarmas y Assets son del SERVIDOR, no de una máquina: si alguna acabara
    // dentro de un sistema, estaría diciendo que sus eventos son sólo de ése.
    //
    // `eva-alarmas` volvió al sidebar el 10-09-2026 (Plan 27): dos
    // pestañas, Historial (lo de siempre) y En vivo (las alarmas del PLC).
    // Estuvo oculta del 2026-08-31 al 2026-09-10 para cortar el sondeo de
    // `/api/iconics/alarms` que el botón del Topbar hacía en toda la
    // aplicación — ese botón sigue sin volver, sólo la entrada del menú.
    const general = NAV.find((n) => n.group === "sec-general");
    expect(general.children.map((c) => c.id)).toEqual([
      "eva-alarmas", "eva-assets", "eva-turno", "eva-bandeja", "eva-cuaderno", "salud-sistema",
    ]);

    /*
     * Predicción ya NO cuelga de «General». Esta comprobación es la que
     * impide que vuelva: si alguien devuelve una ruta `pred-*` a esa sección,
     * las dos expectativas de arriba y de abajo fallan a la vez.
     *
     * No es una preferencia de orden. «General» significa «del servidor
     * ICONICS, no de una máquina concreta», y este módulo no lee ese
     * servidor en absoluto — es un compresor real servido por otro backend.
     * Mezclarlo ahí es el mismo cruce de fuentes que CLAUDE.md §2.1 prohíbe.
     */
    const prediccion = NAV.find((n) => n.group === "sec-prediccion");
    expect(prediccion.children.map((c) => c.id)).toEqual([
      "pred-inicio",
      "pred-eventos",
      "pred-variables",
      "pred-historico",
      "pred-correlacion",
      "pred-pronostico",
    ]);

    // RAG es su propia sección por el mismo motivo que las otras tres NO se
    // mezclan entre sí: lo que hay aquí no describe una instalación de la
    // planta, describe de dónde saca el asistente lo que sabe fuera de lo
    // que mide ICONICS.
    const rag = NAV.find((n) => n.group === "sec-rag");
    expect(rag.children.map((c) => c.id)).toEqual(["rag-casos", "rag-documentacion"]);
  });

  /**
   * ── EL MÓDULO, AHORA DECLARADO Y NO EN UN COMENTARIO (Plan 25 F5) ─
   *
   * La frontera entre módulos es la frontera entre FUENTES DE DATOS
   * (`CLAUDE.md` §2.1 y §4.7), y hasta el 12-09-2026 vivía sólo en la prosa de
   * `NAV_GROUPS`. El problema de un comentario es que una sección nueva no lo
   * hereda: quien añada `sec-loquesea` sin pensar en su fuente la cuelga junto
   * a las de ICONICS y el sidebar la presenta como una más — que es cómo
   * Predicción estuvo dentro de «General» hasta el 03-09-2026.
   */
  it("cada sección declara a qué MÓDULO pertenece", () => {
    const porModulo = Object.fromEntries(NAV.map((n) => [n.group ?? n.id, n.modulo]));

    expect(porModulo).toEqual({
      "sec-llenado": "monitoreo",
      "sec-vibraciones": "monitoreo",
      "sec-general": "monitoreo",
      // La única que NO es de ICONICS: un compresor real servido por otro
      // backend. Es la razón de ser de este campo.
      "sec-prediccion": "prediccion",
      // RAG es `monitoreo` aunque no sea una máquina: es el conocimiento con el
      // que se diagnostica ESTA planta, no una tercera fuente de datos.
      "sec-rag": "monitoreo",
    });
  });

  it("una sección SIN módulo declarado no se construye: falla al montar el árbol", () => {
    /*
     * La guarda que convierte el campo en una regla. Sin ella, `modulo` sería
     * un adorno que la siguiente sección puede olvidar sin consecuencias, y el
     * sidebar la pintaría bajo la cabecera del módulo anterior — afirmando que
     * comparte fuente de datos con él.
     */
    const rutas = [{ id: "x", nav: { icon: null, group: "sec-huerfana" } }];
    const grupos = { "sec-huerfana": { icon: null } }; // sin `modulo`

    expect(() => buildNav(rutas, grupos)).toThrow(/modulo/);
  });

  it("cada sistema tiene su propio «Riesgos», y no se mezclan", () => {
    // Son dos motores de reglas distintos sobre dos máquinas distintas:
    // `riesgos.js` evalúa el tanque —nivel, presión, caudal— y
    // `riesgosVibracion.js` un motor con acelerómetros. Una sola pantalla con
    // las dos listas invitaría a buscar entre ellas una relación que no
    // existe, que es el error que `shared/eva/comun/sistemas.js` evita al asistente.
    const conRiesgos = NAV.flatMap((s) =>
      (s.children ?? []).filter((c) => /riesgos/.test(c.id)).map((c) => [s.group, c.id])
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
