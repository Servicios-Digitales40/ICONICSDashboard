// @vitest-environment jsdom
/**
 * sesion-caducada.test.jsx
 * ------------------------------------------------------------------
 * Qué pasa cuando la sesión se cae con la persona dentro (Plan 20 Fase 4).
 *
 * ── POR QUÉ ESTO MERECE SU PROPIO ARCHIVO ──────────────────────────
 *
 * Porque es el caso que más cuesta a quien lo sufre y el que menos se prueba
 * solo. Una respuesta del asistente tarda entre 30 y 90 segundos; el TTL de la
 * sesión es de una hora de inactividad. La combinación —preguntar algo, irse a
 * mirar la máquina, volver— es lo NORMAL en planta, no un caso raro.
 *
 * Y la diferencia entre hacerlo bien y hacerlo mal no es técnica, es de trato:
 *
 *  - Mal: vuelve al login y la conversación desaparece. Se perdió lo que se
 *    había preguntado y el minuto y medio de espera.
 *  - Bien: vuelve al login, y al entrar la conversación sigue donde estaba.
 *
 * ── LA DISTINCIÓN QUE NO PUEDE PERDERSE ────────────────────────────
 *
 * Sólo un 401 con `motivo: "sesion"` expulsa. El 401 que devuelve ICONICS
 * cuando alguien pide un punto sobre el que no tiene permiso NO puede cerrar
 * la sesión: sería perder una conversación por consultar un dato prohibido.
 * Se prueba en `test/lib/iconics/apiClient.test.js`; aquí se prueba el otro
 * extremo del cable — que el aviso, cuando llega, se recoge.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/theme";
import { SesionProvider, useSesion } from "@/auth/SesionProvider.jsx";
import App from "@/app/App.jsx";
import { cargar, guardar } from "@/features/asistente/lib/persistencia.js";

function responde(cuerpo, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(cuerpo),
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
    clone() {
      return this;
    },
  };
}

const CADUCADA = responde(
  { ok: false, motivo: "sesion", error: "Tu sesión ha caducado." },
  { status: 401 }
);

const CONVERSACION = [
  { rol: "usuario", texto: "¿Cómo va el nivel del tanque?" },
  { rol: "asistente", texto: "Al 58 %, dentro de banda." },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/**
 * Un servidor que reconoce la sesión al arrancar y la pierde después.
 *
 * Es exactamente la secuencia real: se entró hace rato, y la petición de turno
 * se encuentra con que ya no vale.
 */
function servidorQueCaduca() {
  let sesionViva = true;

  return vi.fn((ruta) => {
    if (String(ruta).includes("/api/sesion")) {
      return Promise.resolve(
        sesionViva ? responde({ ok: true, usuario: "ana.tecnica" }) : CADUCADA
      );
    }
    // Cualquier otra ruta descubre la caducidad y la provoca.
    sesionViva = false;
    return Promise.resolve(CADUCADA);
  });
}

function montar() {
  return render(
    <ThemeProvider>
      <SesionProvider>
        <App />
      </SesionProvider>
    </ThemeProvider>
  );
}

describe("la sesión cae con la persona dentro", () => {
  it("vuelve al login sin borrar la conversación", async () => {
    guardar(CONVERSACION);
    vi.stubGlobal("fetch", servidorQueCaduca());

    montar();

    /*
     * El asistente pregunta al montar si hay modelo configurado
     * (`GET /api/chat`). Esa llamada es la que se topa con el 401 y dispara el
     * aviso — no hace falta simular una pregunta entera.
     */
    await waitFor(() => expect(screen.getByRole("button", { name: /entrar/i })).toBeTruthy());

    expect(
      cargar(),
      "el hilo tiene que sobrevivir: caducar no es lo mismo que salir"
    ).toHaveLength(CONVERSACION.length);
  });

  it("salir a propósito SÍ borra la conversación", async () => {
    /*
     * La otra mitad de la regla, y la que justifica que sean dos caminos: en un
     * equipo compartido de planta, quien pulsa «Salir» no espera que el
     * siguiente lea lo que preguntó.
     *
     * Se llama a `salir()` del proveedor de verdad —a través de una sonda que
     * sólo consume el contexto— en vez de a `borrar()` de la persistencia: lo
     * que se quiere fijar es que SALIR borre, no que borrar borre.
     */
    guardar(CONVERSACION);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(responde({ ok: true }))));

    let salir;
    function Sonda() {
      ({ salir } = useSesion());
      return null;
    }

    render(
      <ThemeProvider>
        <SesionProvider>
          <Sonda />
        </SesionProvider>
      </ThemeProvider>
    );

    await waitFor(() => expect(salir).toBeTypeOf("function"));
    await act(async () => {
      await salir();
    });

    expect(cargar()).toEqual([]);
  });
});
