// @vitest-environment jsdom
/**
 * badge-hallazgos.test.jsx — Plan 31 F1.
 *
 * ── LA AFIRMACIÓN CENTRAL: EL BADGE NO SALE A LA RED ────────────────
 *
 * Es la única condición bajo la que un contador puede vivir en el sidebar, y
 * no es una preferencia de rendimiento: el contador de la campana del Topbar
 * lleva retirado desde el 31-08-2026 exactamente por fallarla —«sondeaba el
 * conteo de eventos cada 30 s en TODAS las pantallas»— y la nota que dejaron
 * al quitarlo describe el badge que esta prueba protege.
 *
 * El sidebar está montado en cada pantalla por definición, así que una
 * petición aquí es una petición en todas. Por eso se cuenta `fetch`: no basta
 * con que hoy nadie la haya escrito, tiene que fallar el día que alguien la
 * escriba.
 *
 * ── LAS OTRAS TRES ──────────────────────────────────────────────────
 *
 *  2. **Cero no se pinta.** Un badge en «0» es ruido, y a las dos semanas se
 *     deja de mirar también el que sí tiene número.
 *  3. **Cuenta hallazgos, no diagnósticos.** Los diagnósticos no existen hasta
 *     que alguien abre la vista; prometerlos sería afirmar un trabajo que nadie
 *     ha hecho (§2.4).
 *  4. **Descartar lo apaga.** El badge y la Bandeja leen la MISMA clave de
 *     `vistoPorMi`; si divergieran, el número seguiría marcando lo que la
 *     persona ya descartó.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { evaluarRiesgos, evaluarRiesgosVibracion, useSistemaAgua, useVibracion } = vi.hoisted(() => ({
  evaluarRiesgos: vi.fn(),
  evaluarRiesgosVibracion: vi.fn(),
  useSistemaAgua: vi.fn(),
  useVibracion: vi.fn(),
}));

vi.mock("@/Demo-EVA/domain/riesgos.js", async (importOriginal) => ({
  ...(await importOriginal()),
  evaluarRiesgos,
}));
vi.mock("@/Demo-EVA/domain/riesgosVibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  evaluarRiesgosVibracion,
}));
vi.mock("@/Demo-EVA/data/comunes/hooks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useSistemaAgua,
}));
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useVibracion,
}));

import { Sidebar } from "@/app/layout/Sidebar.jsx";
import { crearVistoPorMi } from "@/lib/vistoPorMi.js";

const RIESGO_TANQUE = { id: "derrame", titulo: "Riesgo de derrame", severidad: "critico", evidencia: "Nivel al 98%" };
const RIESGO_VIB = { id: "desalineacion", titulo: "Desalineación", severidad: "atencion", evidencia: "Zona D" };

function conRiesgos({ tanque = [], vibraciones = [] } = {}) {
  useSistemaAgua.mockReturnValue({ sistema: { resumen: { medidas: 0, fueraDeLimite: 0, enAviso: 0 } } });
  useVibracion.mockReturnValue({ canales: {}, variador: {}, alarmas: {} });
  evaluarRiesgos.mockReturnValue({ activos: tanque, noEvaluables: [], evaluadas: tanque.length });
  evaluarRiesgosVibracion.mockReturnValue({ activos: vibraciones, noEvaluables: [], evaluadas: vibraciones.length });
}

const montar = () =>
  render(
    <ThemeProvider>
      <Sidebar page="eva-inicio" onNavigate={() => {}} />
    </ThemeProvider>
  );

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("el badge cuenta lo ya calculado: no añade ni una petición", () => {
  it("montar el sidebar con dos riesgos activos no llama a fetch ni una vez", () => {
    /*
     * Se cuenta `fetch` y no se comprueba una URL concreta a propósito: lo que
     * esta prueba defiende es que NO HAY llamada, y afirmarlo sobre una URL
     * dejaría pasar la siguiente que alguien añadiera a otra ruta.
     */
    const fetchEspia = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.stubGlobal("fetch", fetchEspia);

    /*
     * Dos riesgos de VIBRACIONES (rama `Vibraciones1.0`). Antes era uno de cada
     * máquina; el badge ya no cuenta la estación de llenado, así que un riesgo
     * del tanque aquí sumaría 0 y la prueba mediría el cierre en vez de las
     * peticiones. Lo que afirma no cambia: contar no sale a la red.
     */
    conRiesgos({ vibraciones: [RIESGO_VIB, { ...RIESGO_VIB, id: "desbalance" }] });
    montar();

    expect(screen.getByText("2")).toBeTruthy();
    expect(fetchEspia).not.toHaveBeenCalled();
  });
});

describe("cero no se pinta", () => {
  it("sin riesgos activos no hay badge: cero es la ausencia, no un badge con un cero", () => {
    conRiesgos();
    montar();

    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("cuenta hallazgos, no diagnósticos", () => {
  it("el número es el de riesgos activos, y el texto accesible dice «hallazgos»", () => {
    conRiesgos({
      vibraciones: [RIESGO_VIB, { ...RIESGO_VIB, id: "desbalance" }, { ...RIESGO_VIB, id: "holgura" }],
    });
    montar();

    expect(screen.getByText("3")).toBeTruthy();
    /*
     * El rótulo importa tanto como el número: «3 diagnósticos» prometería un
     * trabajo que no se ha hecho —los diagnósticos se calculan al ABRIR la
     * Bandeja—, así que el vocabulario tiene que decir «hallazgos».
     */
    expect(screen.getAllByTitle(/3 hallazgos sin mirar/i).length).toBeGreaterThan(0);
  });

  /*
   * ── AHORA SE CUENTA LO CONTRARIO (rama `Vibraciones1.0`) ───────────
   *
   * Esto afirmaba que las dos máquinas suman en el mismo contador. Con la
   * estación de llenado cerrada, lo que hay que defender es justo lo inverso:
   * que sus riesgos NO suman — porque el badge cuelga del sidebar y contarlos
   * volvería a abrir su sondeo en todas las pantallas (ver
   * `llenado-cerrado.test.jsx`).
   *
   * Al reabrir, esta comprobación vuelve a ser la de antes.
   */
  it("un riesgo de la estación de llenado NO suma: está cerrada", () => {
    conRiesgos({ tanque: [RIESGO_TANQUE], vibraciones: [] });
    const { unmount } = montar();
    expect(screen.queryByText("1")).toBeNull();
    unmount();

    conRiesgos({ tanque: [RIESGO_TANQUE], vibraciones: [RIESGO_VIB] });
    montar();
    /* Uno, no dos: sólo cuenta el de vibraciones. */
    expect(screen.getByText("1")).toBeTruthy();
  });
});

describe("descartar en la Bandeja apaga el badge", () => {
  it("un riesgo ya descartado no cuenta: las dos pantallas leen la misma clave", () => {
    /*
     * Se marca con `crearVistoPorMi` sobre la MISMA clave que usa la Bandeja y
     * con el MISMO id que construye `hallazgoDeRiesgo`. Si el badge usara una
     * clave propia o formara el id a mano, esto seguiría contando 1 — que es
     * justo el fallo que se quiere atrapar.
     */
    crearVistoPorMi("eva:hallazgos").marcar(["riesgo:tanque:derrame"]);

    conRiesgos({ tanque: [RIESGO_TANQUE], vibraciones: [] });
    montar();

    expect(screen.queryByText("1")).toBeNull();
  });

  it("descartar uno de dos deja el badge en uno, no lo apaga entero", () => {
    crearVistoPorMi("eva:hallazgos").marcar(["riesgo:tanque:derrame"]);

    conRiesgos({ tanque: [RIESGO_TANQUE], vibraciones: [RIESGO_VIB] });
    montar();

    expect(screen.getByText("1")).toBeTruthy();
  });
});
