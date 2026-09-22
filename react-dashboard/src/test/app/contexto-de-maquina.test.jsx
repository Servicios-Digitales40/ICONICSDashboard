// @vitest-environment jsdom
/**
 * contexto-de-maquina.test.jsx — Plan 25 F4 (`NUE-06`).
 *
 * ── QUÉ PROTEGE, Y ES LO MISMO QUE PROTEGÍA ANTES ──────────────────
 *
 * `topbar-estado-maquina.test.jsx` ya vigila que el indicador de la bomba no
 * salga en vibraciones. Esto lo complementa por el otro lado: que la barra
 * **por sección** no haya reintroducido el cruce al generalizarse, y que cada
 * máquina enseñe lo SUYO.
 *
 * Y una que no existía y ahora importa: que una máquina que no contesta se vea
 * distinta de una máquina tranquila, **desde el Topbar**. Es el incidente del
 * 26-08-2026 que cita `estadoMaquina.js` —quince de veintiún puntos apagados a
 * la vez— llevado al sitio que está siempre a la vista.
 *
 * ── CORREGIDO EN PLAN 25 F10: `canales` MOCKEABA UNA FORMA QUE NUNCA EXISTIÓ ──
 *
 * Hasta el 12-09-2026 estas pruebas mockeaban `canales: { c1: { zona, nivel } }`
 * directamente. `ContextoDeVibraciones` calculaba `peorZona` filtrando
 * exactamente esos campos, así que pasaba en verde — pero `canales[id]` NUNCA
 * tiene `zona` ni `nivel` en el sistema real: `bandaISO()` se calcula aparte,
 * a partir de `vRMS` y `normaAplicable` de `evaluarRiesgosVibracion()`. El
 * indicador de contexto de vibraciones no mostraba nada en producción desde
 * que se escribió, y esta suite lo certificaba sin darse cuenta. Se descubrió
 * al construir F10, que necesita el mismo dato — ver la cabecera de
 * `peorZonaDe()` en `shared/eva/vibraciones/vibraciones.js`.
 *
 * ── VIBRACIONES ES UNA MÁQUINA CONFIGURADA (Plan 40 F2, 21-09-2026) ─
 *
 * La barra de vibraciones salía por sección (`sec-vibraciones`, la de la
 * máquina escrita a mano). Esa máquina se retiró: la barra sale ahora cuando
 * la máquina en contexto —`useMaquina().configurada`— es de tipo
 * `vibraciones`, sea cual sea su id, y lee su dominio con
 * `useDominioVibracion()`. El tanque sigue saliendo por sección
 * (`sec-llenado`), sin cambios.
 *
 * Por eso aquí se mockean `useMaquina` y `useDominioVibracion` en vez de
 * `useVibracion`, que ya no existe. La afirmación es la misma: cada máquina
 * enseña lo suyo y sólo lo suyo.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { ContextoDeMaquina } from "@/app/layout/ContextoDeMaquina.jsx";

const { useSistemaAgua, useDominioVibracion, useMaquina } = vi.hoisted(() => ({
  useSistemaAgua: vi.fn(),
  useDominioVibracion: vi.fn(),
  useMaquina: vi.fn(),
}));

vi.mock("@/Demo-EVA/data/comunes/hooks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useSistemaAgua,
}));
vi.mock("@/Demo-EVA/data/vibraciones/vibracion.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useDominioVibracion,
}));
vi.mock("@/Demo-EVA/data/comunes/MaquinaContext.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useMaquina,
}));

const CONFIGURADA = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true };

/** Lo que `useMaquina()` devuelve en una pantalla de esa máquina, o fuera de toda máquina. */
const enMaquina = (configurada) =>
  useMaquina.mockReturnValue({
    id: configurada?.id ?? null,
    configurada,
    registro: null,
    enServicio: Boolean(configurada),
    cerrada: null,
    enServicioIds: configurada ? [configurada.id] : [],
  });
/* Hay fuente montada: lo contrario tiene su propia prueba abajo. */
vi.mock("@/Demo-EVA/data/comunes/EvaProvider.jsx", async (importOriginal) => ({
  ...(await importOriginal()),
  useHayFuenteEva: () => true,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** El tag de la bomba se lee por `fetch`; encendida para que sea inconfundible. */
const conBombaEncendida = () =>
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, payload: { value: true, quality: 0 } }),
  })));

/*
 * `seccion` es lo que el Topbar pasa: `SECCION_DE_PAGINA[page]`. Las rutas de
 * máquina configurada no traen `nav`, así que en ellas es `null` y lo que
 * decide es la máquina en contexto.
 */
const montar = (seccion) =>
  render(
    <ThemeProvider>
      <ContextoDeMaquina seccion={seccion} />
    </ThemeProvider>
  );

/** Una pantalla de la máquina de vibraciones configurada. */
const montarEnVibraciones = () => {
  enMaquina(CONFIGURADA);
  return montar(null);
};

/** Una pantalla del tanque o general: sin máquina configurada en contexto. */
const montarSinMaquina = (seccion) => {
  enMaquina(null);
  return montar(seccion);
};

const tanque = (extra = {}) =>
  useSistemaAgua.mockReturnValue({
    sistema: { sinLectura: [], puntosPedidos: 8, ...extra },
  });

/*
 * Con velocidad >= 600 rpm (`RPM_MINIMA_ISO`), `evaluarRiesgosVibracion`
 * afirma `normaAplicable: true` y `peorZonaDe()` puede evaluar. Sin
 * `variador.velocidad` a este nivel, cualquier `vRMS` que se mockee más abajo
 * no produce zona — es el mismo mecanismo real que corrigió el bug de F4.
 */
const vibracion = (extra = {}) =>
  useDominioVibracion.mockReturnValue({
    canales: {}, variador: { velocidad: 900 }, alarmas: {}, puntosSinDato: [],
    loading: false, error: null, lastUpdated: null, canalesMeta: [],
    maquina: { id: CONFIGURADA.id, nombre: CONFIGURADA.nombre, configurada: true, area: null },
    ...extra,
  });

describe("cada máquina enseña lo suyo, y sólo lo suyo", () => {
  it("en vibraciones NO aparece el estado de la bomba del tanque", async () => {
    /*
     * El cruce que la separación por máquina existe para impedir. La
     * regresión es silenciosa: el indicador funciona y el dato es real, sólo
     * que es de la otra instalación.
     */
    conBombaEncendida();
    tanque();
    // vRMS = 1.0 mm/s cae en zona B (0,71–1,8) con la norma aplicable.
    vibracion({ canales: { S1: { vRMS: 1.0 } } });

    montarEnVibraciones();

    await waitFor(() => expect(screen.getByText(/Zona B/)).toBeTruthy());
    expect(screen.queryByText(/Encendida|Apagada/i)).toBeNull();
  });

  it("en el tanque aparece su bomba", async () => {
    conBombaEncendida();
    tanque();
    vibracion();

    montarSinMaquina("sec-llenado");

    await waitFor(() => expect(screen.getByText(/Encendida/i)).toBeTruthy());
  });

  it("en vibraciones se enseña la PEOR zona de las que contestan", () => {
    conBombaEncendida();
    tanque();
    // S1 zona A (0,3), S2 zona D (5,0 > 4,5 de alarma), S3 zona B (1,2).
    vibracion({ canales: { S1: { vRMS: 0.3 }, S2: { vRMS: 5.0 }, S3: { vRMS: 1.2 } } });

    montarEnVibraciones();
    expect(screen.getByText(/Zona D/)).toBeTruthy();
  });

  it("sin ninguna zona evaluable no se pinta «todo bien»: no se pinta nada", () => {
    /*
     * §2.4. No haber podido evaluar ninguna zona no es un veredicto favorable,
     * y una pastilla verde ahí lo afirmaría. Aquí no se evalúa porque la
     * velocidad está por debajo del mínimo ISO (600 rpm): la norma no aplica.
     */
    conBombaEncendida();
    tanque();
    vibracion({ canales: { S1: { vRMS: 1.0 } }, variador: { velocidad: 100 } });

    montarEnVibraciones();
    expect(screen.queryByText(/Zona/)).toBeNull();
  });

  it("fuera de las dos máquinas no hay barra de contexto", () => {
    // «Alarmas», «Assets» o «Salud» hablan del servidor, no de una instalación.
    conBombaEncendida();
    tanque();
    vibracion();

    const { container } = montarSinMaquina("sec-general");
    expect(container.textContent).toBe("");
  });

  it("una máquina configurada de OTRO tipo no hereda la barra de vibraciones", () => {
    /*
     * La condición es el TIPO de la máquina, no «hay una configurada». Una de
     * otro tipo no tiene zonas ISO que enseñar, y pintarle la barra de
     * vibraciones sería el mismo cruce que el de la bomba, al revés.
     */
    conBombaEncendida();
    tanque();
    vibracion({ canales: { S1: { vRMS: 5.0 } } });
    enMaquina({ id: "otra-01", nombre: "Otra", tipo: "compresor", activa: true });

    const { container } = montar(null);
    expect(container.textContent).toBe("");
  });
});

describe("una máquina muda se ve distinta de una máquina tranquila", () => {
  it("el tanque avisa de cuántos puntos no contestan, con su total", () => {
    conBombaEncendida();
    tanque({ sinLectura: ["a", "b", "c"], puntosPedidos: 8 });
    vibracion();

    montarSinMaquina("sec-llenado");
    expect(screen.getByText(/3 de 8 sin dato/)).toBeTruthy();
  });

  it("vibraciones avisa sin inventarse un total que no publica", () => {
    // «3 de 0» sería peor que no dar denominador.
    conBombaEncendida();
    tanque();
    vibracion({ puntosSinDato: ["x", "y", "z"] });

    montarEnVibraciones();
    expect(screen.getByText(/3 sin dato/)).toBeTruthy();
    expect(screen.queryByText(/de 0/)).toBeNull();
  });

  it("sin puntos mudos NO hay pastilla: un «0 sin dato» permanente sería ruido", () => {
    conBombaEncendida();
    tanque({ sinLectura: [], puntosPedidos: 8 });
    vibracion();

    montarSinMaquina("sec-llenado");
    expect(screen.queryByText(/sin dato/)).toBeNull();
  });
});
