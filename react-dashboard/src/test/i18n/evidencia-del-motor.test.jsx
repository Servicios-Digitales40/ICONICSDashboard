// @vitest-environment jsdom
/**
 * evidencia-del-motor.test.jsx
 * ------------------------------------------------------------------
 * Que las frases con las que el motor de diagnóstico respalda una causa se
 * lean en el idioma del tablero — y que las que NO son nuestras se queden
 * como están.
 *
 * ── POR QUÉ HACE FALTA UNA PRUEBA, HABIENDO VERIFICADOR ────────────
 *
 * `verificar-diagnostico.mjs` comprueba el lado del motor: que cada entrada
 * que redactamos nosotros salga con su `plantilla`, y que la cita del manual y
 * las palabras de un técnico salgan sin ella. Lo que no puede comprobar es el
 * otro extremo: que el puente sepa reconstruir cada `clave`.
 *
 * Y ése es el que falla en silencio. Si `useEvidencia` no reconociera una
 * clave, la frase saldría igual —el `defaultValue` es el español que compuso
 * el backend— y no habría error, ni clave cruda, ni prueba roja. Un párrafo en
 * español dentro de un tablero en inglés, otra vez.
 *
 * ── LO QUE SE ESCRIBE AQUÍ, Y LO QUE NO ────────────────────────────
 *
 * No se escriben las frases: se piden al mismo diccionario que usa la
 * pantalla. Lo que sí se escribe es el ESPAÑOL que manda el backend, porque es
 * justo lo que NO tiene que quedar a la vista cuando el tablero está en
 * inglés.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { useEvidencia } from "@/i18n/useEvidencia.js";

afterEach(async () => {
  await i18n.changeLanguage("es");
});

/* ── Entradas tal y como las emite `backend/ia/motor/` ─────────────────── */

const TENDENCIA = {
  fuente: "temporal",
  texto: 'La señal "temperaturaTanque" subió en las últimas 2 h.',
  referencia: "temperaturaTanque",
  plantilla: { clave: "tendencia", senal: "temperaturaTanque", direccion: "sube", ventanaH: 2 },
};

const TENDENCIA_CONTRARIA = {
  fuente: "temporal",
  texto: 'La señal "temperaturaTanque" bajó en las últimas 2 h. La firma de esta causa declaraba dirección "sube".',
  referencia: "temperaturaTanque",
  plantilla: {
    clave: "tendenciaContraria", senal: "temperaturaTanque",
    direccion: "baja", ventanaH: 2, declarada: "sube",
  },
};

const CAUSA_DESCARTADA = {
  fuente: "casos",
  texto: 'Un técnico descartó esta causa en un cierre anterior — la causa real fue "sin-recirculacion-minima".',
  referencia: "c1",
  plantilla: { clave: "causaDescartada", causaReal: "sin-recirculacion-minima" },
};

/** Lo que escribió una persona al cerrar un caso: sin `plantilla`, a propósito. */
const PALABRAS_DE_UN_TECNICO = {
  fuente: "casos",
  texto: "La válvula estaba agarrotada por cal.",
  referencia: "c2",
};

const puente = () => renderHook(() => useEvidencia()).result.current;

describe("la evidencia del motor habla el idioma del tablero", () => {
  it("[es] sale la frase que compuso el backend", () => {
    const { texto } = puente();
    expect(texto(TENDENCIA)).toContain("subió");
    expect(texto(TENDENCIA)).toContain("2 h");
  });

  it("[en] la tendencia se rehace, con su señal y su ventana", async () => {
    await i18n.changeLanguage("en");
    const { texto, fuente } = puente();

    const frase = texto(TENDENCIA);
    expect(frase).toContain("rose over the last 2 h");
    /* El nombre de la señal, del catálogo — no la clave cruda. */
    expect(frase).toContain(i18n.getFixedT("en", "sensors")("signals.temperaturaTanque.label"));
    expect(frase).not.toContain("temperaturaTanque");
    expect(frase).not.toContain("subió");
    expect(frase).not.toMatch(/\{\{/);

    expect(fuente("temporal")).toBe("trend");
  });

  it("[en] la dirección elige la forma de la frase, no un hueco", async () => {
    await i18n.changeLanguage("en");
    const { texto } = puente();

    expect(texto(TENDENCIA_CONTRARIA)).toContain("fell over the last 2 h");
    expect(texto(TENDENCIA_CONTRARIA)).toContain("declared it rising");
    expect(texto(TENDENCIA_CONTRARIA)).not.toContain("bajó");
  });

  it("[en] la causa descartada se dice por su id, del catálogo de causas", async () => {
    await i18n.changeLanguage("en");
    const { texto } = puente();

    const frase = texto(CAUSA_DESCARTADA);
    expect(frase).toContain("ruled this cause out");
    expect(frase).toContain(
      i18n.getFixedT("en", "domain")("causes.sin-recirculacion-minima.titulo")
    );
    expect(frase).not.toContain("sin-recirculacion-minima");
  });

  it("[en] una causa escrita a mano se respeta tal cual", async () => {
    await i18n.changeLanguage("en");
    const { texto } = puente();

    /*
     * `causaReal` es un id del catálogo cuando el técnico eligió una candidata
     * y TEXTO LIBRE cuando escribió la suya. Lo segundo son sus palabras y no
     * hay clave que buscar: tienen que salir intactas dentro de la frase
     * inglesa.
     */
    const frase = texto({
      ...CAUSA_DESCARTADA,
      plantilla: { clave: "causaDescartada", causaReal: "Sello mecánico roto" },
    });

    expect(frase).toContain("ruled this cause out");
    expect(frase).toContain("Sello mecánico roto");
  });

  it("[en] sin causa real, la frase no deja el hueco a la vista", async () => {
    await i18n.changeLanguage("en");
    const { texto } = puente();

    const frase = texto({ ...CAUSA_DESCARTADA, plantilla: { clave: "causaDescartada", causaReal: null } });
    expect(frase).toContain("ruled this cause out");
    expect(frase).not.toContain("«»");
  });

  it("[en] lo que escribió otro NO se toca", async () => {
    await i18n.changeLanguage("en");
    const { texto } = puente();

    /*
     * Sin `plantilla` no hay nada que rehacer, y es deliberado: la cita de un
     * manual tiene que poder contrastarse con el papel, y lo que escribió un
     * técnico son sus palabras. Que salgan en español dentro de un tablero en
     * inglés es lo correcto aquí, no un fallo.
     */
    expect(texto(PALABRAS_DE_UN_TECNICO)).toBe(PALABRAS_DE_UN_TECNICO.texto);
  });
});
