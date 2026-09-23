// @vitest-environment jsdom
/**
 * El tablero respeta el rol de quien mira. Plan 35 F3.
 *
 * ── QUÉ DEFIENDE, Y QUÉ NO PRETENDE DEFENDER ───────────────────────
 *
 * **Esto no prueba seguridad.** El código de todas las vistas viaja al
 * navegador, y cualquiera puede llamar a la API con `curl` sin pasar por la
 * pantalla. Quien protege es `exigirRol` en el backend, y eso se comprueba en
 * `backend/test/rutas/guardas.test.mjs`.
 *
 * Lo que se defiende aquí es que la pantalla **no ofrezca un camino que
 * termina en un 403**, y que cuando alguien llegue igualmente —escribiendo la
 * URL— se le diga qué pasa en vez de dejarle una vista rota.
 *
 * Los dos errores están uno a cada lado, y los dos tienen prueba:
 *
 *   ESCONDER DE MÁS   un operador sin menú porque la pantalla decidió por su
 *                     cuenta. Con la autenticación apagada sería el tablero
 *                     entero.
 *   ESCONDER DE MENOS un visualizador con la entrada de Configuración, que
 *                     al pulsarla no carga nada.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildNav } from "@/app/routes/buildNav.js";
import { navParaRol, ROL_DE_PAGINA } from "@/app/routes/index.js";
import { alcanza, ROL } from "@shared/roles.js";
import SinPermiso from "@/app/SinPermiso.jsx";
import { ThemeProvider } from "@/theme";

afterEach(cleanup);

/** El `puede()` de un rol, con la MISMA tabla que usa el backend. */
const comoRol = (rol) => (rolMinimo) => alcanza([rol], rolMinimo);

/*
 * ── LAS MÁQUINAS SON CONFIGURADAS (Plan 40 F2) ─────────────────────
 *
 * Hasta el 21-09-2026 la máquina de vibraciones estaba escrita a mano y sus
 * vistas (`vib-inicio`, `eva-vibraciones`, `vib-3d`…) salían en el menú por sí
 * solas. Ya no: las vistas de una máquina son las genéricas `maq-*`, y sólo
 * aparecen cuando una máquina CONFIGURADA las reclama. Por eso el menú se pide
 * aquí con una máquina, igual que hace el Sidebar con las del provider — sin
 * ella el rol se estaría probando sobre un menú sin máquinas.
 */
const MAQUINA = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true };

/** Los ids que un rol ve en el menú, con una máquina configurada, aplanando los grupos. */
const menuDe = (rol) =>
  navParaRol(comoRol(rol), [MAQUINA]).flatMap((i) => (i.children ? i.children.map((c) => c.id) : [i.id]));

describe("el menú se acota al rol", () => {
  it("un visualizador NO ve el panel de administración", () => {
    expect(menuDe(ROL.VISUALIZADOR)).not.toContain("eva-configuracion");
  });

  /*
   * ── LO QUE UN VISUALIZADOR VE, ENTERO ──────────────────────────────
   *
   * La lista se escribe completa a propósito, y no como «no ve X»: es la
   * definición del rol —«sólo el apartado de visualización de cada máquina»—
   * y una ruta nueva sin `rol` declarado aparecería aquí sola, obligando a
   * decidir si le corresponde en vez de colarse por defecto.
   *
   * Es el mismo criterio que la prueba de inventario del backend: la lista de
   * lo permitido, no la de lo olvidado.
   */
  it("un visualizador ve EXACTAMENTE las vistas de visualización", () => {
    expect(menuDe(ROL.VISUALIZADOR).sort()).toEqual([
      /* Planta: lo que se mira, no lo que se decide. El arranque (`inicio`) no
         está: es un desvío sin menú (Plan 42.5 F6). */
      "eva-assets",
      /* La máquina configurada: su apartado de Visualización, nada más. */
      "maq-3d",
      "maq-graficas",
      "maq-inicio",
      "maq-planta",
      /*
       * Las seis de Predicción ya no salen (22-09-2026): se ocultaron del menú
       * —no se usan en esta demo, para NINGÚN rol— quitándoles `nav`. Eran
       * gráficas de otro backend, todas de lectura, y por eso las veía un
       * visualizador. Sus rutas siguen registradas y se abren por URL; vuelven
       * al menú en cuanto alguna recupere su `nav`, y entonces esta lista
       * vuelve a crecer.
       */
      "salud-sistema",
    ]);
  });

  it("lo que un visualizador NO ve son diagnóstico, registro y control", () => {
    const menu = menuDe(ROL.VISUALIZADOR);

    /* Diagnóstico: interpretar una medida es trabajo de operador. */
    expect(menu).not.toContain("eva-bandeja");
    expect(menu).not.toContain("eva-avisos");
    expect(menu).not.toContain("maq-hallazgos");
    expect(menu).not.toContain("maq-avisos");
    expect(menu).not.toContain("maq-riesgos");
    /* Registro: dejan rastro de quién hizo qué. */
    expect(menu).not.toContain("eva-cuaderno");
    expect(menu).not.toContain("eva-turno");
    /* Documentación del caso: se escribe, no sólo se lee. */
    expect(menu).not.toContain("rag-casos");
    expect(menu).not.toContain("rag-documentacion");
    expect(menu).not.toContain("maq-casos");
    expect(menu).not.toContain("maq-rag");
  });

  it("un operador ve todo lo del visualizador, y además lo suyo", () => {
    /* La jerarquía, comprobada sobre el menú y no sólo sobre la tabla: si
       alguien pusiera `rol: "visualizador"` en una vista, el operador
       seguiría viéndola. */
    const visor = menuDe(ROL.VISUALIZADOR);
    const oper = menuDe(ROL.OPERADOR);

    for (const id of visor) expect(oper).toContain(id);
    expect(oper).toContain("eva-cuaderno");
    expect(oper.length).toBeGreaterThan(visor.length);
  });

  it("un operador tampoco: el panel es del administrador", () => {
    /*
     * El criterio del usuario: «el operador tendrá acceso a la mayoría de
     * cosas menos al futuro panel de administración». Es la única entrada que
     * un operador no ve, y por eso se comprueba que las demás sí siguen ahí.
     */
    const ids = menuDe(ROL.OPERADOR);

    expect(ids).not.toContain("eva-configuracion");
    expect(ids).toContain("eva-assets");
    expect(ids).toContain("maq-inicio");
    expect(ids).toContain("maq-hallazgos");
  });

  it("un administrador lo ve todo", () => {
    const ids = navParaRol(comoRol(ROL.ADMINISTRADOR))
      .flatMap((i) => (i.children ? i.children.map((c) => c.id) : [i.id]));

    expect(ids).toContain("eva-configuracion");
  });

  it("sin filtro —la autenticación apagada— el menú está completo", () => {
    /*
     * El error de esconder DE MÁS. Con `AUTH_HABILITADA=false` el backend no
     * niega nada, así que la pantalla tampoco debe: un menú recortado dejaría
     * el tablero de hoy inservible.
     */
    const ids = navParaRol(() => true)
      .flatMap((i) => (i.children ? i.children.map((c) => c.id) : [i.id]));

    expect(ids).toContain("eva-configuracion");
  });
});

describe("`buildNav` filtra sin romper el árbol", () => {
  const GRUPOS = { g1: { icon: null, modulo: "monitoreo" } };

  it("una ruta sin `rol` la ve cualquiera", () => {
    const arbol = buildNav([{ id: "libre", nav: { icon: null } }], GRUPOS, () => false);
    expect(arbol.map((i) => i.id)).toEqual(["libre"]);
  });

  it("un grupo que se queda SIN hijos no se pinta", () => {
    /*
     * Sin esto, un visualizador vería la sección abierta y vacía — que se lee
     * como que algo se rompió al cargar, no como que no le toca.
     */
    const rutas = [
      { id: "a", rol: "administrador", nav: { icon: null, group: "g1" } },
      { id: "b", rol: "administrador", nav: { icon: null, group: "g1" } },
    ];
    expect(buildNav(rutas, GRUPOS, () => false)).toEqual([]);
  });

  it("un grupo con ALGÚN hijo permitido se queda, con sólo ésos", () => {
    const rutas = [
      { id: "vetada", rol: "administrador", nav: { icon: null, group: "g1" } },
      { id: "libre", nav: { icon: null, group: "g1" } },
    ];
    const arbol = buildNav(rutas, GRUPOS, (r) => r !== "administrador");

    expect(arbol).toHaveLength(1);
    expect(arbol[0].children.map((c) => c.id)).toEqual(["libre"]);
  });
});

describe("el rol de cada página sale del registro", () => {
  it("`ROL_DE_PAGINA` conoce el panel de administración", () => {
    expect(ROL_DE_PAGINA["eva-configuracion"]).toBe("administrador");
  });

  it("una vista sin rol declarado vale `null`, no `undefined`", () => {
    /* `undefined` sería indistinguible de una ruta que no existe, y quien lo
       lea trataría un descuido como «es para cualquiera». */
    expect(ROL_DE_PAGINA["maq-inicio"]).toBeNull();
    expect(ROL_DE_PAGINA["inicio"]).toBeNull();
  });
});

describe("llegar por URL a una vista que no te toca", () => {
  it("dice qué rol hace falta y cuál tienes", () => {
    /*
     * El caso que justifica la pantalla: ocultar no cierra, así que alguien
     * llegará. Lo que ve tiene que explicar, no parecer una avería.
     */
    render(
      <ThemeProvider>
        <SinPermiso rolExigido="administrador" rolActual="visualizador" />
      </ThemeProvider>,
    );

    expect(screen.getByText(/requiere el rol «Administrador»/i)).toBeTruthy();
    expect(screen.getByText(/Tu rol es «Visualizador»/i)).toBeTruthy();
  });

  it("sin rol propio no inventa uno", () => {
    /* Con la autenticación apagada no hay sesión. «Tu rol: null» sería ruido. */
    render(
      <ThemeProvider>
        <SinPermiso rolExigido="administrador" rolActual={null} />
      </ThemeProvider>,
    );

    expect(screen.queryByText(/Tu rol es/i)).toBeNull();
  });
});
