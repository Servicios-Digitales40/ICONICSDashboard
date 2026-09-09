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
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { ThemeProvider, useTheme } from "@/theme";
import { TarjetaRiesgo } from "@/Demo-EVA/views/tanque/RiesgosTanque.jsx";

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("es");
});

/**
 * Un riesgo tal y como lo devuelve `evaluarRiesgos`: la prosa ya compuesta en
 * español —lo que consume el backend— y `valores` con las señales EN CRUDO.
 */
const RIESGO = {
  id: "derrame",
  severidad: "critico",
  titulo: "Riesgo de derrame",
  evidencia: "El tanque está al 92.4 % y la bomba sigue impulsando (carga del motor 84.1 %).",
  consecuencia: "Si la bomba no para, el nivel puede alcanzar el rebose y derramar agua en el cubeto.",
  accion: "Confirmar que el corte por nivel alto está operativo y que el lazo de control responde.",
  nota: null,
  valores: { nivelTanque: 92.4, cargaMotor: 84.1 },
};

/** El texto de una clave de `domain`, en un idioma, según el diccionario. */
const frase = (idioma, campo) =>
  i18n.getFixedT(idioma, "domain")(`risks.derrame.${campo}`, { nivelTanque: "", cargaMotor: "" });

function ConTema({ children }) {
  const { theme } = useTheme();
  return children(theme);
}

const pintar = () =>
  render(
    <ThemeProvider>
      <ConTema>{(t) => <TarjetaRiesgo riesgo={RIESGO} t={t} />}</ConTema>
    </ThemeProvider>
  );

describe("la tarjeta de riesgo habla el idioma del tablero", () => {
  it("[es] sale la prosa del dominio, tal cual", () => {
    pintar();

    /*
     * En español NO hay traducción en el diccionario: `es/domain.json` está
     * vacío a propósito y la frase llega por `defaultValue` desde
     * `shared/eva/`. Que salga literalmente la del dominio es la prueba de que
     * esa degradación funciona.
     */
    expect(screen.getByText(RIESGO.titulo)).toBeTruthy();
    expect(screen.getByText(RIESGO.evidencia)).toBeTruthy();
    expect(screen.getByText(RIESGO.consecuencia)).toBeTruthy();
  });

  it("[en] sale en inglés, y las cifras siguen ahí", async () => {
    await i18n.changeLanguage("en");
    pintar();

    const texto = document.body.textContent;

    /* El titular y la consecuencia, del diccionario. */
    expect(texto).toContain(frase("en", "titulo"));
    expect(texto).toContain(frase("en", "consecuencia"));

    /* Y ya no está el español del dominio. */
    expect(texto).not.toContain(RIESGO.titulo);
    expect(texto).not.toContain(RIESGO.consecuencia);

    /*
     * Las cifras son lo que tiene que sobrevivir al viaje: si el evaluador no
     * emitiera `valores`, o el puente no los pasara, la frase inglesa saldría
     * con `{{nivelTanque}}` literal.
     */
    expect(texto).toContain("92.4");
    expect(texto).toContain("84.1");
    expect(texto).not.toMatch(/\{\{/);
  });

  it("el separador decimal es el del idioma SÓLO donde hay plantilla", async () => {
    /*
     * ── UNA ASIMETRÍA QUE CONVIENE TENER FIJADA ────────────────────
     *
     * En INGLÉS la frase se recompone desde la plantilla, así que el puente
     * formatea cada cifra con las `decimales` de su señal y el separador del
     * idioma. En ESPAÑOL no hay plantilla —`es/domain.json` está vacío a
     * propósito— y llega la frase que ya compuso el dominio con `toFixed`,
     * que escribe punto.
     *
     * O sea: la tarjeta de riesgo en español dice «92.4» mientras la tarjeta
     * de señal, dos pantallas más allá, dice «92,4». Es una inconsistencia
     * real y conocida; el precio de no duplicar el párrafo español en dos
     * archivos. Se fija aquí para que se vea si alguien la cambia, y está
     * explicada en la cabecera de `useProsa`.
     */
    pintar();
    expect(document.body.textContent).toContain("92.4");
    cleanup();

    await i18n.changeLanguage("en");
    pintar();
    expect(document.body.textContent).toContain("92.4");
  });
});
