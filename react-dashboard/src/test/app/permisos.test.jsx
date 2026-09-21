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

describe("el menú se acota al rol", () => {
  it("un visualizador NO ve el panel de administración", () => {
    const ids = navParaRol(comoRol(ROL.VISUALIZADOR))
      .flatMap((i) => (i.children ? i.children.map((c) => c.id) : [i.id]));

    expect(ids).not.toContain("eva-configuracion");
  });

  it("un operador tampoco: el panel es del administrador", () => {
    /*
     * El criterio del usuario: «el operador tendrá acceso a la mayoría de
     * cosas menos al futuro panel de administración». Es la única entrada que
     * un operador no ve, y por eso se comprueba que las demás sí siguen ahí.
     */
    const ids = navParaRol(comoRol(ROL.OPERADOR))
      .flatMap((i) => (i.children ? i.children.map((c) => c.id) : [i.id]));

    expect(ids).not.toContain("eva-configuracion");
    expect(ids).toContain("vib-inicio");
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
    expect(ROL_DE_PAGINA["vib-inicio"]).toBeNull();
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
