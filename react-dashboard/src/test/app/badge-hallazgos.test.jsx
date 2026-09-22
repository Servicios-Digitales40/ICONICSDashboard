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
 *
 * ── EL BADGE CUENTA MÁQUINAS CONFIGURADAS (Plan 40 F2, 21-09-2026) ──
 *
 * Hasta hoy `useConteoHallazgos` leía la máquina de vibraciones escrita a mano
 * con `useVibracion()` y evaluaba sus riesgos aquí. Esa máquina se retiró:
 * ahora suma sobre `useMaquinasEnVivo()`, que trae cada máquina configurada
 * activa con sus riesgos YA evaluados por su tipo. Por eso lo que se mockea es
 * ese hook —la entrada del contador— y no la fuente ni el evaluador: lo que se
 * afirma es del contador, y la fuente tiene sus propias pruebas.
 *
 * El tanque no es una configurada y sigue cerrado: no hay camino por el que
 * un riesgo suyo llegue al contador, y `porSistema.tanque` es `0` fijo. Se
 * comprueba eso en vez de «un riesgo del tanque no suma», que ya no se puede
 * ni plantear.
 */
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";

const { useMaquinasEnVivo } = vi.hoisted(() => ({
  useMaquinasEnVivo: vi.fn(),
}));

vi.mock("@/Demo-EVA/data/comunes/maquinasEnVivo.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquinasEnVivo,
}));

import { Sidebar } from "@/app/layout/Sidebar.jsx";
import { useConteoHallazgos } from "@/Demo-EVA/data/comunes/hallazgos.js";
import { crearVistoPorMi } from "@/lib/vistoPorMi.js";

const MOTOR_03 = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true };
const MOTOR_04 = { id: "vib-motor-04", nombre: "Segundo motor", tipo: "vibraciones", activa: true };

const RIESGO_VIB = { id: "desalineacion", titulo: "Desalineación", severidad: "atencion", evidencia: "Zona D" };

/** Una entrada de `useMaquinasEnVivo` por máquina, con sus riesgos activos ya evaluados. */
const enVivo = (maquina, activos) => ({
  maquina,
  tipo: null,
  estado: { canales: {}, variador: {}, alarmas: {}, loading: false, puntosSinDato: [] },
  riesgos: { activos, noEvaluables: [], evaluadas: activos.length },
});

/** `{ [id de máquina]: riesgos activos }` → lo que devuelve el hook. */
function conRiesgos(porMaquina = {}) {
  const maquinas = [MOTOR_03, MOTOR_04].filter((m) => m.id in porMaquina);
  useMaquinasEnVivo.mockReturnValue(maquinas.map((m) => enVivo(m, porMaquina[m.id])));
}

const montar = () =>
  render(
    <ThemeProvider>
      <Sidebar page="eva-muro" onNavigate={() => {}} />
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

    conRiesgos({ [MOTOR_03.id]: [RIESGO_VIB, { ...RIESGO_VIB, id: "desbalance" }] });
    montar();

    expect(screen.getByText("2")).toBeTruthy();
    expect(fetchEspia).not.toHaveBeenCalled();
  });
});

describe("cero no se pinta", () => {
  it("sin riesgos activos no hay badge: cero es la ausencia, no un badge con un cero", () => {
    conRiesgos({ [MOTOR_03.id]: [] });
    montar();

    expect(screen.queryByText("0")).toBeNull();
  });

  it("sin máquinas configuradas tampoco: no hay nada que contar", () => {
    conRiesgos({});
    montar();

    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("cuenta hallazgos, no diagnósticos", () => {
  it("el número es el de riesgos activos, y el texto accesible dice «hallazgos»", () => {
    conRiesgos({
      [MOTOR_03.id]: [RIESGO_VIB, { ...RIESGO_VIB, id: "desbalance" }, { ...RIESGO_VIB, id: "holgura" }],
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

  it("las máquinas configuradas suman en el mismo contador, y el tanque queda a cero: está cerrado", () => {
    /*
     * Dos máquinas con un riesgo cada una → 2. Y `porSistema` dice de cuál es
     * cada uno, con el tanque a `0` fijo: no es una configurada y su sondeo no
     * puede volver a abrirse desde el chrome (ver `llenado-cerrado.test.jsx`).
     * Al reabrir la estación de llenado, esta comprobación vuelve a sumarlo.
     */
    conRiesgos({ [MOTOR_03.id]: [RIESGO_VIB], [MOTOR_04.id]: [{ ...RIESGO_VIB, id: "desbalance" }] });

    const { result } = renderHook(() => useConteoHallazgos());
    expect(result.current.total).toBe(2);
    expect(result.current.porSistema).toEqual({ tanque: 0, [MOTOR_03.id]: 1, [MOTOR_04.id]: 1 });

    montar();
    expect(screen.getByText("2")).toBeTruthy();
  });
});

describe("descartar en la Bandeja apaga el badge", () => {
  it("un riesgo ya descartado no cuenta: las dos pantallas leen la misma clave", () => {
    /*
     * Se marca con `crearVistoPorMi` sobre la MISMA clave que usa la Bandeja y
     * con el MISMO id que construye `hallazgoDeRiesgo` — con el id de LA
     * máquina, no con `vibraciones`. Si el badge usara una clave propia o
     * formara el id a mano, esto seguiría contando 1 — que es justo el fallo
     * que se quiere atrapar.
     */
    crearVistoPorMi("eva:hallazgos").marcar([`riesgo:${MOTOR_03.id}:desalineacion`]);

    conRiesgos({ [MOTOR_03.id]: [RIESGO_VIB] });
    montar();

    expect(screen.queryByText("1")).toBeNull();
  });

  it("descartar uno de dos deja el badge en uno, no lo apaga entero", () => {
    crearVistoPorMi("eva:hallazgos").marcar([`riesgo:${MOTOR_03.id}:desalineacion`]);

    conRiesgos({ [MOTOR_03.id]: [RIESGO_VIB], [MOTOR_04.id]: [RIESGO_VIB] });
    montar();

    /* El mismo riesgo en OTRA máquina es otro hallazgo: sigue contando. */
    expect(screen.getByText("1")).toBeTruthy();
  });
});
