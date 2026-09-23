// @vitest-environment jsdom
/**
 * prosa-del-dominio.test.jsx
 * ------------------------------------------------------------------
 * Que la prosa que escribe `shared/eva/` se lea en el idioma del tablero, con
 * las MISMAS cifras.
 *
 * ── POR QUÉ ESTO NO LO CUBRE `verificar-dominio.mjs` ───────────────
 *
 * Aquél comprueba que el inglés EXISTA y que las cifras que cita las ofrezca
 * la regla. Lo que no puede comprobar es que la cifra llegue: entre el
 * catálogo y la pantalla hay tres pasos que pueden romperse por separado —el
 * evaluador tiene que emitir `valores`, el puente tiene que formatearlos, y la
 * tarjeta tiene que llamar al puente— y ninguno de los tres falla ruidosamente.
 *
 * Si cualquiera se cae, la tarjeta sigue pintando: sale la frase ESPAÑOLA del
 * dominio, que es el `defaultValue`. Nada se rompe y en un tablero en inglés
 * aparece un párrafo en español. Es el mismo modo de fallo silencioso que ya
 * obligó a escribir `verificar-textos.mjs`, y por eso se prueba el recorrido.
 *
 * ── LO QUE FIJA, Y CÓMO ────────────────────────────────────────────
 *
 * No se escribe aquí ninguna frase: se piden al mismo diccionario que usa la
 * tarjeta. Lo que sí se escribe es la CIFRA —«12.3»— porque es lo que tiene
 * que sobrevivir al viaje, y comprobarla contra el propio dominio no probaría
 * nada.
 *
 * Hasta el 23-09-2026 la primera mitad probaba la tarjeta de riesgo del
 * TANQUE (`RiesgosTanque.jsx`), con sus cifras en crudo formateadas por el
 * puente y la asimetría del separador decimal entre idiomas. Esa vista se
 * borró en el Plan 42.5 F4; queda la tarjeta de vibración, que es la que
 * pinta cualquier máquina configurada. Cuando el tanque entre por
 * configuración (Plan 43) su prosa pasará por esta misma tarjeta.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { ThemeProvider, useTheme } from "@/theme";
import { TarjetaRiesgo as TarjetaVibracion } from "@/Demo-EVA/components/riesgoVibracion.jsx";
import { COMPOSICIONES } from "@/i18n/useProsa.js";
import { REGLAS as REGLAS_VIBRACION } from "@shared/eva/vibraciones/riesgosVibracion.js";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("es");
});

function ConTema({ children }) {
  const { theme } = useTheme();
  return children(theme);
}

/* ══ La otra máquina ═══════════════════════════════════════════════════ */

/**
 * Un riesgo de vibración tal y como lo devuelve `evaluarRiesgosVibracion`.
 *
 * Sus `valores` llegan YA FORMATEADOS —al revés que los del tanque— porque casi
 * ninguno es una señal del catálogo: son derivados, y sus decimales sólo los
 * conoce la regla que compuso la frase. Está explicado en la cabecera de
 * `shared/eva/vibraciones/riesgosVibracion.js`.
 */
const vibracion = (id, valores, extra = {}) => ({
  id,
  canal: null,
  canalLabel: null,
  nivel: "critico",
  titulo: "[título del dominio]",
  evidencia: "[evidencia del dominio]",
  consecuencia: "[consecuencia del dominio]",
  accion: "[acción del dominio]",
  norma: null,
  nota: null,
  valores,
  ...extra,
});

const pintarVibracion = (riesgo) =>
  render(
    <ThemeProvider>
      <ConTema>{(t) => <TarjetaVibracion riesgo={riesgo} t={t} />}</ConTema>
    </ThemeProvider>
  );

describe("la tarjeta de riesgo de VIBRACIÓN habla el idioma del tablero", () => {
  it("[es] sale la prosa del dominio, tal cual", () => {
    pintarVibracion(vibracion("alarmas-sin-reconocer", { n: 4 }));

    expect(screen.getByText("[evidencia del dominio]")).toBeTruthy();
    expect(screen.getByText("[acción del dominio]")).toBeTruthy();
  });

  it("[en] elige la forma de la frase que dice el contexto", async () => {
    await i18n.changeLanguage("en");
    /*
     * Cuatro formas de la misma frase según lleguen o no las dos cifras
     * opcionales. Con `contexto: "ambos"` tienen que salir las dos; con una
     * plantilla única y huecos vacíos saldría «3 active alarm(s) in «DEMO
     * VIBRACIONES», unacknowledged.», con la coma colgando.
     */
    pintarVibracion(
      vibracion("alarmas-activas", { total: 3, sinReconocer: 2, severidad: "800", contexto: "ambos" })
    );

    const texto = document.body.textContent;
    expect(texto).toContain("3 active alarm(s)");
    expect(texto).toContain("2 unacknowledged");
    expect(texto).toContain("800");
    expect(texto).not.toContain("[evidencia del dominio]");
    expect(texto).not.toMatch(/\{\{/);
  });

  it("[en] sin la cifra opcional, la frase no deja el hueco a la vista", async () => {
    await i18n.changeLanguage("en");
    pintarVibracion(vibracion("alarmas-activas", { total: 1 }));

    const texto = document.body.textContent;
    expect(texto).toContain("1 active alarm(s)");
    expect(texto).not.toContain("unacknowledged");
    expect(texto).not.toContain("severity");
  });

  it("[en] la lista de vigilancias se compone palabra a palabra", async () => {
    await i18n.changeLanguage("en");
    /*
     * Lo que el dominio manda son CLAVES —la vigilancia y su estado— porque
     * las dos son palabras. Si el puente no las tradujera, aquí saldría
     * «[object Object]» o la etiqueta española; las dos se ven en esta prueba.
     */
    pintarVibracion(
      vibracion("vigilancia-en-aviso", {
        disparadas: [
          { clave: "bpfo", estado: "aviso" },
          { clave: "monVRMS", estado: "alarma" },
        ],
      })
    );

    const texto = document.body.textContent;
    expect(texto).toContain("Ball pass frequency, outer race (BPFO): Warning");
    expect(texto).toContain("RMS velocity against its threshold: Alarm");
    expect(texto).not.toContain("object Object");
  });

  it("[en] el apoyo se nombra por su id, no por el rótulo español", async () => {
    await i18n.changeLanguage("en");
    pintarVibracion(
      vibracion(
        "asimetria-entre-apoyos",
        { canal: "S1", valor: "1.234", veces: "3.5", referencia: "0.350" },
        { canal: "S1", canalLabel: "Lado acople" }
      )
    );

    const texto = document.body.textContent;
    /* Dos veces: en la evidencia y en la etiqueta de la cabecera. */
    expect(texto).toContain("Drive end");
    expect(texto).not.toContain("Lado acople");
    expect(texto).toContain("1.234");
    expect(texto).toContain("3.5");
  });
});

describe("el mapa de composición no se queda atrás", () => {
  /*
   * `COMPOSICIONES` está indexado por id de regla, y una regla se puede
   * renombrar en `shared/` sin que nada avise: la frase seguiría pintándose,
   * sólo que con la lista sin componer. Esto lo convierte en una prueba roja.
   */
  it("sus claves son ids de reglas que existen", () => {
    const ids = new Set(REGLAS_VIBRACION.map((r) => r.id));
    const huerfanas = Object.keys(COMPOSICIONES).filter((id) => !ids.has(id));

    expect(huerfanas).toEqual([]);
  });

  it("cada regla que compone algo lo declara en su `expone`", () => {
    const problemas = [];

    for (const [id, componer] of Object.entries(COMPOSICIONES)) {
      const regla = REGLAS_VIBRACION.find((r) => r.id === id);
      const compuesto = componer({}, { canal: (x) => x, vigilancia: (x) => x, estadoVigilancia: (x) => x });
      for (const clave of Object.keys(compuesto)) {
        if (!regla.expone?.includes(clave)) problemas.push(`${id}.${clave}`);
      }
    }

    expect(problemas).toEqual([]);
  });
});
