// @vitest-environment jsdom
/**
 * topbar-estado-maquina.test.jsx
 * ------------------------------------------------------------------
 * Que el indicador de encendido del Topbar sólo salga en las pestañas de
 * SU máquina.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────
 *
 * `EstadoMaquinaBanner` lee `ac:TDCON/DEMO/SEGURIDAD/CONTROL`, que es el tag
 * de la bomba del TANQUE. Nació cuando toda la aplicación era la estación de
 * llenado y «la máquina» no era ambiguo; desde que la planta se partió en dos
 * sistemas, el mismo indicador junto al título de una pantalla de vibraciones
 * afirma «Encendida» sobre una instalación que no es la que se está mirando.
 *
 * Es el cruce que la separación en secciones existe para impedir, y el Topbar
 * es el peor sitio para cometerlo: se lee como contexto de todo lo que hay
 * debajo. La regresión además es silenciosa —el indicador funciona, el dato
 * es real, sólo es de otra máquina—, así que no hay nada que la delate
 * mirando la pantalla.
 *
 * La condición vive en el Topbar y sale del registro de rutas
 * (`SECCION_DE_PAGINA`), no de una lista de ids escrita a mano: por eso el
 * último caso comprueba que una pantalla NUEVA de vibraciones heredaría la
 * respuesta correcta sin tocar nada.
 *
 * ── LAS PANTALLAS DE VIBRACIONES SON DE UNA MÁQUINA CONFIGURADA ────
 *
 * Plan 40 F2 (21-09-2026): `eva-vibraciones` y `eva-riesgos-vibracion` —de la
 * máquina escrita a mano— ya no existen. Las pantallas de vibraciones son las
 * genéricas `maq-*`, que hablan de la máquina que llega por `?maquina=`, así
 * que aquí se montan con `MaquinaProvider` y una configurada de prueba. El
 * dominio en vivo de esa máquina se mockea: lo que se afirma es del Topbar,
 * no de la fuente, y así ningún caso abre un motor de sondeo.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RAIZ = "ac:TDCON/DEMO_VIBRACIONES/Vibraciones/";
const CONFIGURADA = {
  id: "vib-motor-03",
  nombre: "Nuevo-Modor",
  tipo: "vibraciones",
  activa: true,
  plc: "PLC_2 · ua:DEMO3",
  assets: [{ id: "Vibraciones", pointName: RAIZ, rol: "raiz" }, { id: "S1", pointName: `${RAIZ}S1/`, rol: "secundario" }],
  variables: [
    { id: "vRMS_S1", pointName: `${RAIZ}S1/vRMS_S1`, historyPointName: null, historyVerified: false, assetId: "S1", rol: "medida:vRMS", acceso: "read" },
  ],
  cadenciaMs: 5000,
  limitaciones: [],
};

vi.mock("@/Demo-EVA/data/comunes/MaquinasConfiguradas.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquinasConfiguradas: () => ({ maquinas: [CONFIGURADA], cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useDominioVibracion: () => ({
    canales: {}, variador: {}, alarmas: {}, loading: false, error: null, lastUpdated: null,
    puntosSinDato: [], canalesMeta: [],
    maquina: { id: CONFIGURADA.id, nombre: CONFIGURADA.nombre, configurada: true, area: null },
  }),
}));

import { ThemeProvider } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { MaquinaProvider } from "@/Demo-EVA/data/comunes/MaquinaContext.jsx";
import { Topbar } from "@/app/layout/Topbar.jsx";
import { SECCION_DE_PAGINA } from "@/app/routes/index.js";

beforeEach(() => {
  vi.stubEnv("VITE_ICONICS_FAKE", "true");
  vi.stubEnv("VITE_ICONICS_CHAOS", "none");
  // El indicador lee su punto por `fetch`; se le da la bomba ENCENDIDA para
  // que, de pintarse, sea inconfundible.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, payload: { value: true, quality: 0 } }),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/* `MaquinaProvider` resuelve `?maquina=` igual que en `App.jsx`: sin el
   parámetro no hay máquina en contexto, que es el caso de las pantallas
   generales y del tanque. */
const montar = (page, params = {}) =>
  render(
    <ThemeProvider>
      <DataSourceProvider>
        <MaquinaProvider page={page} params={params}>
          <Topbar page={page} onAbrirMenu={() => {}} onAbrirAlarmas={() => {}} />
        </MaquinaProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );

const EN_LA_MAQUINA = { maquina: CONFIGURADA.id };

describe("Topbar: el indicador de encendido es de UNA máquina", () => {
  /*
   * ── OMITIDO: SU PANTALLA ESTÁ CERRADA (rama `Vibraciones1.0`) ──────
   *
   * El indicador se ve en `sec-llenado`, y esa sección ya no existe en el
   * sidebar. Los otros cuatro casos de este grupo siguen corriendo, y son los
   * que de verdad protegen la regla: que el indicador del tanque NO aparezca
   * en vibraciones ni en las pantallas generales.
   *
   * Para reabrir: quitar el `.skip`.
   */
  it.skip("en las pantallas de la estación de llenado, se ve", async () => {
    montar("eva-planta");
    await waitFor(() => {
      expect(screen.getByText(/Encendida|Apagada/i)).toBeTruthy();
    });
  });

  it("en las pantallas de vibraciones, NO se ve", async () => {
    montar("maq-graficas", EN_LA_MAQUINA);

    // Se espera a que el Topbar termine de pintar antes de afirmar la
    // ausencia: comprobarla sobre un árbol a medio montar la daría por buena
    // aunque el indicador entrara un instante después.
    await screen.findByRole("heading", { name: /Estado mecánico/i });
    /* Y es la máquina configurada la que se está mirando: su nombre va junto
       al título, porque «Estado mecánico» solo no dice de cuál. */
    expect(screen.getByText(CONFIGURADA.nombre)).toBeTruthy();
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("tampoco en «Riesgos» de vibraciones, que es donde se vio el fallo", async () => {
    /* `maq-riesgos` no tiene entrada de menú, pero se navega con `?maquina=`
       y tiene título: el Topbar la pinta igual. Por `role`: el subtítulo
       también dice «riesgos». */
    montar("maq-riesgos", EN_LA_MAQUINA);
    await screen.findByRole("heading", { name: /Riesgos/i });
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("en las pantallas generales tampoco: Alarmas y Assets son de las dos", async () => {
    // Un indicador de «la máquina» junto al título de una pantalla que habla
    // de las dos elegiría una sin decirlo.
    //
    // El título por `role`, no `findByText`: desde que la página tiene dos
    // pestañas (Plan 27), su subtítulo también dice «alarmas» en minúscula
    // («…el estado en vivo de las alarmas del PLC»), y un texto suelto ya no
    // basta para distinguir el `<h1>` del resto.
    montar("eva-alarmas");
    await screen.findByRole("heading", { name: /Alarmas/i });
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("la sección sale del registro, así que una vista nueva no hereda la respuesta del tanque", () => {
    // Si esta condición se implementara con una lista de ids escrita a mano,
    // una pantalla añadida a vibraciones caería fuera de la lista y el
    // indicador volvería a aparecer donde no debe.
    //
    // `eva-planta` ya no aparece aquí (rama `Vibraciones1.0`): sin `nav` no
    // tiene sección, y eso es EXACTAMENTE lo que esta prueba afirma — que la
    // sección se deriva del registro. Con una lista escrita a mano, cerrar la
    // estación de llenado no habría cambiado nada y el indicador seguiría
    // saliendo en sus pantallas. Al reabrir vuelve a valer "sec-llenado".
    expect(SECCION_DE_PAGINA["eva-planta"] ?? null).toBeNull();
    /*
     * ── LAS DE VIBRACIONES NO TIENEN SECCIÓN FIJA (Plan 40 F2) ───────
     *
     * `maq-graficas` y `maq-riesgos` son de máquina configurada: no traen
     * `nav`, así que no tienen sección en el registro —su sección es
     * `maq:<id>`, la de la máquina que llegue por `?maquina=`—. Para ellas el
     * Topbar NO decide por sección: decide por la máquina en contexto
     * (`useMaquina().configurada?.tipo`), y los dos primeros casos de este
     * grupo son los que lo fijan. Aquí sólo se comprueba que el registro no
     * les inventa una.
     */
    expect(SECCION_DE_PAGINA["maq-graficas"]).toBeNull();
    expect(SECCION_DE_PAGINA["maq-riesgos"]).toBeNull();
    /*
     * ── «sec-vibraciones» ES «sec-planta» (Plan 40 F2, 21-09-2026) ───
     *
     * `eva-bandeja` y `eva-alarmas` estaban en «General» hasta el Plan 33
     * F10, pasaron a la sección de la máquina escrita a mano, y hoy dicen
     * «sec-planta» —sin que nadie tocara esta lista— porque esa sección se
     * renombró en el registro al retirarse la máquina. Tres cambios de sección
     * en una semana, y esta prueba se enteró sola las tres veces: es lo que
     * afirma. Con una lista escrita a mano, mover una vista de sección no
     * habría cambiado nada aquí.
     *
     * El indicador sigue SIN verse en ellas: sólo se pinta en `sec-llenado`
     * —lee un tag del tanque—. La comprobación de arriba («en las pantallas
     * generales tampoco») es la que lo fija de verdad; ésta sólo verifica de
     * dónde sale la sección.
     *
     * `eva-detalle` sigue sin `nav`, y por tanto sin sección: el indicador
     * tampoco debe dársela por supuesta.
     */
    expect(SECCION_DE_PAGINA["eva-bandeja"]).toBe("sec-planta");
    expect(SECCION_DE_PAGINA["eva-alarmas"]).toBe("sec-planta");
    expect(SECCION_DE_PAGINA["eva-detalle"]).toBeNull();
  });
});
