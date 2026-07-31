// @vitest-environment jsdom
/**
 * subviews.test.jsx
 * ------------------------------------------------------------------
 * Las cinco subvistas del detalle, renderizadas con máquinas AGUJEREADAS.
 *
 * ── POR QUÉ NO EXISTÍAN ANTES ──────────────────────────────────────
 *
 * El detalle de máquina no tenía ninguna prueba. Cuando el rollup de
 * planta falló con un `null`, se arregló y se añadieron pruebas… del
 * rollup. Estas vistas quedaron fuera y tenían la MISMA clase de fallo,
 * unas 25 veces: `.toFixed()` directo sobre campos que ahora pueden
 * faltar, y aritmética que en JavaScript convierte `null` en 0 en vez de
 * NaN — un cero creíble donde no hubo medición.
 *
 * `OeeView` es además la pestaña por defecto: abrir cualquier máquina con
 * una lectura de mala calidad rompía la pantalla entera.
 *
 * La prueba renderiza de verdad (no inspecciona el código) porque el
 * fallo era de render. Cada caso comprueba dos cosas:
 *   · que no lanza;
 *   · que NO aparece un cero inventado donde debería haber un hueco.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMachine } from "@/lib/domain/index.js";
import { ThemeProvider } from "@/theme";
import { THEMES } from "@/theme/themes.js";

import OeeView from "@/features/machines/views/machine-detail/OeeView.jsx";
import CalidadView from "@/features/machines/views/machine-detail/CalidadView.jsx";
import DisponibilidadView from "@/features/machines/views/machine-detail/DisponibilidadView.jsx";
import RendimientoView from "@/features/machines/views/machine-detail/RendimientoView.jsx";
import ComparativoView from "@/features/machines/views/machine-detail/ComparativoView.jsx";

/**
 * `ComparativoView` lee del HISTORIADOR a través de `lib/datasource`, así
 * que necesita el provider… o un doble. Se dobla el módulo entero por dos
 * motivos:
 *
 *   · montar el provider real crearía un motor de polling y saldría a la
 *     red desde jsdom, que no es lo que aquí se prueba;
 *   · el valor de esta suite está en los ESTADOS DE LECTURA (leyendo,
 *     error, sin historia), y con un doble se entran a voluntad en lugar
 *     de intentar provocarlos con una fuente real.
 */
const lecturaDia = {
  actual: { serie: [], resumen: null, loading: false, error: null },
};

vi.mock("@/lib/datasource", () => ({
  useMachineDay: () => lecturaDia.actual,
  useMachineDailyOee: () => ({ porDia: new Map(), loading: false, error: null, oeeDe: () => null }),
}));

beforeEach(() => {
  lecturaDia.actual = { serie: [], resumen: null, loading: false, error: null };
});

afterEach(cleanup);

const t = THEMES.light;
const C = {
  disponibilidad: t.accent,
  calidad: t.success,
  rendimiento: t.amber,
  oee: t.violet,
};

const maquina = (readings) =>
  createMachine({ id: "LIN/1", areaId: "LIN", machineId: "1", equipo: "Lineal 1", readings });

/** Historia vacía: es lo que devuelve la fuente real hasta la Fase 7. */
const history = [];

/**
 * Las subvistas reciben el tema por prop, pero los átomos que montan
 * dentro (Panel, BandGauge, KpiTile) lo leen del contexto. Sin el
 * provider fallarían por una razón que no tiene nada que ver con lo que
 * aquí se prueba.
 */
const pintar = (Vista, machine) =>
  render(
    <ThemeProvider>
      <Vista machine={machine} history={history} t={t} C={C} />
    </ThemeProvider>
  );

const VISTAS = [
  ["OeeView", OeeView],
  ["CalidadView", CalidadView],
  ["DisponibilidadView", DisponibilidadView],
  ["RendimientoView", RendimientoView],
  ["ComparativoView", ComparativoView],
];

/* ── Los tres escenarios que produce un servidor real ───────────────── */

const ESCENARIOS = {
  "sin ninguna lectura": {},

  "solo mala calidad en un factor": {
    // Lo que deja el filtro de calidad 192 cuando falla un tag suelto.
    disponibilidad: 82, rendimiento: null, calidad: 95,
    aprobadas: 900, rechazadas: 100, estado: 1,
  },

  "Prod_Real_Total = 0 al inicio del turno": {
    // El Excel calcula OEE_Cal sin proteger la división: llega Infinity.
    disponibilidad: 80, rendimiento: 90, calidad: Infinity,
    aprobadas: 0, rechazadas: 0, estado: 0,
  },

  // ⚠ Este escenario se añadió DESPUÉS, y por un motivo concreto: al
  // validar la suite rompiendo `OeeView` a propósito, las pruebas seguían
  // pasando. La guarda de la vista salta si falta CUALQUIERA de las cinco
  // lecturas, y los tres casos de arriba siempre tumbaban algún factor —
  // así que el camino con factores presentes y conteos ausentes nunca se
  // ejecutaba. Es justo el que produce un tag `Pz_OK` con mala calidad.
  "factores OK pero sin conteo de piezas": {
    disponibilidad: 82, rendimiento: 88, calidad: 95,
    aprobadas: null, rechazadas: null, estado: 1,
  },

  "solo faltan los rechazos": {
    disponibilidad: 82, rendimiento: 88, calidad: 95,
    aprobadas: 900, rechazadas: null, estado: 1,
  },
};

describe("subvistas del detalle · no revientan con huecos", () => {
  for (const [nombreVista, Vista] of VISTAS) {
    for (const [nombreCaso, readings] of Object.entries(ESCENARIOS)) {
      it(`${nombreVista} · ${nombreCaso}`, () => {
        expect(() => pintar(Vista, maquina(readings))).not.toThrow();
      });
    }
  }
});

describe("subvistas del detalle · no inventan ceros", () => {
  it("OeeView muestra un hueco, no 0.00 %, sin lecturas", () => {
    pintar(OeeView, maquina({}));

    // El guion de «sin dato» tiene que estar presente…
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    // …y no puede haber un OEE de 0.00 afirmado como medición.
    expect(screen.queryByText("0.00")).toBeNull();
  });

  it("CalidadView avisa de la falta de lecturas en vez de contar 0 piezas", () => {
    pintar(CalidadView, maquina({}));

    expect(screen.getByText(/sin lecturas de producción/i)).toBeTruthy();
  });

  it("RendimientoView avisa en vez de mostrar un ciclo de 0 s", () => {
    pintar(RendimientoView, maquina({}));

    expect(screen.getByText(/sin lecturas/i)).toBeTruthy();
    expect(screen.queryByText("0.00 s")).toBeNull();
  });

  it("DisponibilidadView no afirma que la meta está cumplida sin haber medido", () => {
    pintar(DisponibilidadView, maquina({}));

    // El fallo concreto: `faltan` valía null, null es falsy, y la vista
    // caía en la rama «Meta cumplida, con holgura de».
    expect(screen.queryByText(/meta cumplida/i)).toBeNull();
    expect(screen.getByText(/sin lectura de disponibilidad/i)).toBeTruthy();
  });
});

/* ── El comparativo y su lectura del historiador ─────────────────────
 *
 * Antes esta vista derivaba las dos fechas del valor EN VIVO con un
 * generador determinista: producía una comparación completa, creíble y
 * falsa. Ahora lee `hda:` de verdad, y lo que hay que fijar es que cada
 * forma de no tener datos se diga con palabras distintas — un día sin
 * historizar y un día malo son noticias opuestas.
 */
describe("ComparativoView · dice qué pasa con la lectura del historiador", () => {
  const completa = {
    disponibilidad: 82, rendimiento: 88, calidad: 95,
    aprobadas: 900, rechazadas: 100, estado: 1,
  };

  const dia = (oee) => ({
    serie: [{ t: "08:00", oee, disponibilidad: 80, rendimiento: 90, calidad: 95 }],
    resumen: { oee, disponibilidad: 80, rendimiento: 90, calidad: 95, aprobadas: 900, rechazadas: 100, muestras: 1 },
    loading: false,
    error: null,
  });

  it("mientras lee, no adelanta ninguna cifra", () => {
    lecturaDia.actual = { serie: [], resumen: null, loading: true, error: null };
    pintar(ComparativoView, maquina(completa));

    expect(screen.getByText(/leyendo el historiador/i)).toBeTruthy();
    expect(screen.queryByText(/superó a A|por debajo de A/i)).toBeNull();
  });

  it("un fallo de lectura se distingue de un día sin datos", () => {
    lecturaDia.actual = { serie: [], resumen: null, loading: false, error: "ICONICS History request failed." };
    pintar(ComparativoView, maquina(completa));

    expect(screen.getByText(/no se pudo leer el historiador/i)).toBeTruthy();
    // El mensaje del servidor se muestra tal cual: es lo que permite
    // distinguir "backend caído" de "ruta /History rota".
    expect(screen.getByText(/History request failed/i)).toBeTruthy();
  });

  it("sin muestras lo dice, en vez de comparar dos ceros", () => {
    pintar(ComparativoView, maquina(completa));

    expect(screen.getByText(/sin historia para estas dos fechas/i)).toBeTruthy();
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("con historia en ambos lados sí compara", () => {
    lecturaDia.actual = dia(71.4);
    pintar(ComparativoView, maquina(completa));

    expect(screen.queryByText(/sin historia|no se pudo leer/i)).toBeNull();
    expect(screen.getAllByText("71.4").length).toBeGreaterThan(0);
  });
});

describe("subvistas del detalle · siguen funcionando con datos completos", () => {
  const completa = {
    disponibilidad: 82, rendimiento: 88, calidad: 95,
    aprobadas: 900, rechazadas: 100, estado: 1,
    tCiclo: 45, tCicloTeo: 40, tDispPot: 28800, tInacPlan: 3600,
  };

  for (const [nombreVista, Vista] of VISTAS) {
    it(`${nombreVista} renderiza el caso normal`, () => {
      expect(() => pintar(Vista, maquina(completa))).not.toThrow();
    });
  }
});
