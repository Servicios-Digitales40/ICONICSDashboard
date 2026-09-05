// @vitest-environment jsdom
/**
 * La pantalla de Salud del sistema.
 *
 * Lo que se comprueba no es que pinte bonito: es que diga las tres cosas que
 * justifican que exista.
 *
 *   1. Que los datos son SIMULADOS, cuando lo son. Es el estado en el que
 *      ningún valor es real, y una pantalla de planta que lo calla es peor que
 *      una apagada.
 *   2. Que un servicio no configurado NO es una avería, y con qué variable se
 *      enciende — que es lo único accionable.
 *   3. Que si el propio puente no contesta, lo dice como lo que es: el
 *      diagnóstico, no un «error al cargar».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ThemeProvider } from "@/theme";
import SaludSistema from "@/Demo-EVA/views/comunes/SaludSistema.jsx";

/** Una respuesta de `/api/health` como la de un servidor bien montado. */
const SANO = {
  status: "ok",
  version: "1.4.2",
  iconicsReachable: true,
  tokenValid: true,
  readOnly: true,
  uptimeSeconds: 7380,
  timestamp: "2026-09-04T10:00:00.000Z",
  servicios: {
    datos: {
      nombre: "Origen de datos",
      estado: "ok",
      detalle: "Lecturas reales de https://planta.local.",
      soloLectura: true,
    },
    asistente: {
      nombre: "Asistente",
      estado: "ok",
      modelo: "qwen-3.5-4B",
      modelosDisponibles: ["qwen-3.5-4B", "qwen-3.5-9B"],
      maxPasos: 3,
      cola: { atendiendo: false, enEspera: 0 },
    },
    dictado: { nombre: "Dictado por voz", estado: "ok", idioma: "es" },
    documentacion: {
      nombre: "Manuales de planta",
      estado: "ok",
      cargado: true,
      indexando: false,
      modo: "embeddings + BM25",
      documentos: 6,
      fragmentos: 1016,
      ilegibles: 0,
    },
  },
};

/** El servidor a medio configurar: el caso para el que existe la pantalla. */
const A_MEDIAS = {
  ...SANO,
  status: "degraded",
  servicios: {
    datos: {
      nombre: "Origen de datos",
      estado: "simulado",
      detalle: "ICONICS_FAKE=true: los valores los genera el simulador. NINGÚN dato es real.",
      soloLectura: true,
    },
    asistente: {
      nombre: "Asistente",
      estado: "no_configurado",
      variable: "IA_BASE",
      detalle: "El chat responde 503 y el tablero funciona igual.",
    },
    dictado: { nombre: "Dictado por voz", estado: "no_configurado", variable: "IA_WHISPER_BASE" },
    documentacion: {
      nombre: "Manuales de planta",
      estado: "no_configurado",
      variable: "IA_DOCS_DIR",
    },
  },
};

function montar() {
  return render(
    <ThemeProvider>
      <SaludSistema />
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  delete globalThis.fetch;
});

describe("Salud del sistema", () => {
  it("enseña cada servicio con su estado", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => SANO,
    }));

    montar();

    expect(await screen.findByText("Asistente")).toBeTruthy();
    expect(screen.getByText("Manuales de planta")).toBeTruthy();
    expect(screen.getByText("Dictado por voz")).toBeTruthy();
    expect(screen.getByText("Puente hacia ICONICS")).toBeTruthy();
  });

  it("dice el modelo que tiene puesto el asistente y su cola", async () => {
    // Es lo que se busca cuando alguien pregunta por qué una respuesta tardó
    // dos minutos: qué modelo está cargado y cuántos hay esperando.
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => SANO }));

    montar();

    expect(await screen.findByText("qwen-3.5-4B")).toBeTruthy();
  });

  it("AVISA cuando los datos son simulados", async () => {
    /*
     * La comprobación más importante del archivo. `ICONICS_FAKE=true` es el
     * modo en el que ningún dato es real, y esta pantalla es donde tiene que
     * poder verse sin ambigüedad.
     */
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => A_MEDIAS }));

    montar();

    expect(await screen.findByText(/NINGÚN dato es real/)).toBeTruthy();
    expect(screen.getByText("Simulado")).toBeTruthy();
  });

  it("un servicio sin configurar dice con qué variable se enciende", async () => {
    // No es una avería: es una instalación que no lo tiene montado. Lo único
    // accionable es el nombre de la variable.
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => A_MEDIAS }));

    montar();

    expect(await screen.findByText("IA_BASE")).toBeTruthy();
    expect(screen.getByText("IA_WHISPER_BASE")).toBeTruthy();
    expect(screen.getByText("IA_DOCS_DIR")).toBeTruthy();
    expect(screen.getAllByText("No configurado").length).toBe(3);
  });

  it("cuenta el token inválido como degradado, no como caída", async () => {
    // Se llega a ICONICS y no se autentica: son dos arreglos distintos, y
    // confundirlos manda a revisar la red cuando el problema es una contraseña.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...SANO, status: "degraded", tokenValid: false }),
    }));

    montar();

    expect(await screen.findByText(/NO hay token válido/)).toBeTruthy();
  });

  it("si el puente no contesta, ESO es el diagnóstico", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });

    montar();

    expect(await screen.findByText("El puente no contesta")).toBeTruthy();
    expect(screen.getByText(/el problema no es de una vista/)).toBeTruthy();
  });
});
