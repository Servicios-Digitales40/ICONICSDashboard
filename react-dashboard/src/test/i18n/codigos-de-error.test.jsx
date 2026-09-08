// @vitest-environment jsdom
/**
 * codigos-de-error.test.jsx
 * ------------------------------------------------------------------
 * Que un fallo del puente llegue a pantalla en el idioma del tablero.
 *
 * ── EL RECORRIDO COMPLETO, QUE ES LO QUE SE PRUEBA ─────────────────
 *
 * El contrato nuevo tiene cuatro tramos y cada uno puede romperse solo:
 *
 *   1. el servidor responde `{ ok:false, error, codigo }`
 *   2. el cliente HTTP construye un `ErrorDelPuente` que CONSERVA el código
 *   3. el hook de datos guarda el error entero, no su `.message`
 *   4. la vista lo pasa por `useMensajeDeError` y pinta la frase traducida
 *
 * Cortar cualquiera de ellos no rompe nada visible: sale el mensaje español
 * del servidor, que es exactamente lo que salía antes. Por eso hace falta
 * probar el recorrido y no cada pieza por su cuenta — una prueba unitaria de
 * `useMensajeDeError` pasaría con el tramo 2 roto.
 *
 * ── LO QUE NO SE PRUEBA AQUÍ ───────────────────────────────────────
 *
 * Que el backend emita el código. Eso es de `scripts/verificar-codigos.mjs`,
 * que además comprueba que ninguna ruta se deje uno — y de `backend/test/`,
 * que prueba las respuestas de verdad. Aquí el servidor es falso a propósito:
 * lo que se mira es qué hace el tablero con lo que reciba.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { errorDeRespuesta, ErrorDelPuente } from "@/lib/api/errorDelPuente.js";
import { ThemeProvider } from "@/theme";
import CasosRag from "@/Demo-EVA/views/comunes/CasosRag.jsx";

/** El texto de un código, en un idioma, tal y como lo tiene el diccionario. */
const frase = (idioma, codigo) => i18n.getFixedT(idioma, "errors")(`codes.${codigo}`);

/** Un servidor que siempre falla, con el cuerpo que se le diga. */
function servidorQueFalla(cuerpo, estado = 500) {
  globalThis.fetch = vi.fn(async () => ({
    ok: false,
    status: estado,
    text: async () => JSON.stringify(cuerpo),
  }));
}

const montar = () => render(<ThemeProvider><CasosRag /></ThemeProvider>);

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  delete globalThis.fetch;
  await i18n.changeLanguage("es");
});

describe("el error del puente conserva su código", () => {
  it("`errorDeRespuesta` guarda código y mensaje por separado", () => {
    const e = errorDeRespuesta({ ok: false, error: "Detalle del servidor.", codigo: "ERROR_BITACORA" }, 500);

    expect(e).toBeInstanceOf(ErrorDelPuente);
    expect(e.codigo).toBe("ERROR_BITACORA");
    expect(e.mensajeDelServidor).toBe("Detalle del servidor.");
    /*
     * `message` se queda con el texto del servidor y NO con el código: una
     * traza o un `console.error` tienen que seguir siendo legibles sin pasar
     * por el diccionario.
     */
    expect(e.message).toBe("Detalle del servidor.");
  });

  it("una respuesta sin código no inventa ninguno", () => {
    const e = errorDeRespuesta({ ok: false, error: "Algo falló." }, 500);
    expect(e.codigo).toBeNull();
    expect(e.message).toBe("Algo falló.");
  });
});

describe("la pantalla pinta el fallo en el idioma del tablero", () => {
  beforeEach(() => {
    servidorQueFalla({
      ok: false,
      error: "No se pudo escribir en datos/aprendizaje.json: EACCES",
      codigo: "ERROR_BITACORA",
    });
  });

  it("[es] enseña la frase del código, y el detalle del servidor debajo", async () => {
    montar();
    await screen.findByText(frase("es", "ERROR_BITACORA"));

    /*
     * El detalle NO es redundante: trae la ruta y el errno, que el diccionario
     * no puede conocer. Ésa es la razón de que `AlertBanner` tenga tres
     * niveles de texto y no dos.
     */
    expect(screen.getByText(/EACCES/)).toBeTruthy();
  });

  it("[en] la MISMA respuesta sale en inglés", async () => {
    await i18n.changeLanguage("en");
    montar();

    await screen.findByText(frase("en", "ERROR_BITACORA"));
    /* Y la frase española ya no está por ningún lado. */
    expect(screen.queryByText(frase("es", "ERROR_BITACORA"))).toBeNull();
    /* El detalle del servidor sí sigue: es dato, no interfaz. */
    expect(screen.getByText(/EACCES/)).toBeTruthy();
  });
});

describe("cuando no hay código se degrada a lo de siempre", () => {
  it("un backend que no manda `codigo` sigue enseñando su mensaje", async () => {
    /*
     * Es el caso de un servidor más viejo que este tablero. La degradación es
     * a lo que se pintaba ANTES de que existieran los códigos —no a un
     * genérico— para que un despliegue a medias no pierda información.
     */
    servidorQueFalla({ ok: false, error: "La bitácora no está disponible." });
    await i18n.changeLanguage("en");
    montar();

    await screen.findByText("La bitácora no está disponible.");
  });

  it("un código que este tablero no conoce cae en el mensaje del servidor", async () => {
    servidorQueFalla({
      ok: false,
      error: "Fallo de una versión más nueva del puente.",
      codigo: "ERROR_QUE_TODAVIA_NO_EXISTE",
    });
    montar();

    await waitFor(() => {
      expect(screen.getByText("Fallo de una versión más nueva del puente.")).toBeTruthy();
    });
    /* Y no se pinta la clave cruda, que es el fallo feo. */
    expect(screen.queryByText(/codes\.ERROR_QUE_TODAVIA_NO_EXISTE/)).toBeNull();
  });
});
