// @vitest-environment jsdom
/**
 * silencio.test.js
 * ------------------------------------------------------------------
 * El turno se cierra SOLO cuando el que habla se calla.
 *
 * ── POR QUÉ ESTAS PRUEBAS ──────────────────────────────────────────
 *
 * Es la promesa entera del modo manos libres: hablar y que el mensaje salga
 * sin tocar nada. Cuando falla no se ve ningún error —el micrófono graba, el
 * anillo se mueve— simplemente no se envía nunca, y desde fuera parece que el
 * asistente se quedó colgado.
 *
 * Los dos fallos que se fijan aquí llegaban al mismo sitio por caminos
 * distintos, y ninguno se ve leyendo el detector:
 *
 *  1. El `AudioContext` nace SUSPENDIDO cuando se crea fuera del gesto del
 *     usuario, que es siempre en este flujo. Suspendido, el analizador da un
 *     buffer plano y el nivel es 0 para siempre.
 *  2. El calibrado toma los primeros 300 ms como «ruido ambiente». Si el
 *     usuario empieza a hablar de inmediato —lo normal— su voz se toma por
 *     ruido y el umbral queda por encima de lo que pueda decir después.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { grabar } from "@/features/asistente/lib/audio.js";

/** Nivel que el analizador simulará en cada tick, en orden. */
let guion = [];
let resumeLlamado = false;
let estadoContexto = "suspended";

/*
 * El analizador devuelve muestras en 8 bits sin signo centradas en 128. Para
 * un nivel RMS objetivo basta alternar 128±d, con d = nivel * 128.
 */
function rellenar(muestras, nivel) {
  const d = Math.round(nivel * 128);
  for (let i = 0; i < muestras.length; i++) muestras[i] = i % 2 ? 128 + d : 128 - d;
}

beforeEach(() => {
  vi.useFakeTimers();
  guion = [];
  resumeLlamado = false;
  estadoContexto = "suspended";

  /*
   * `puedeGrabar()` exige contexto seguro: `navigator.mediaDevices` sólo existe
   * en HTTPS o localhost, y jsdom no marca la página como segura por su cuenta.
   */
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

  navigator.mediaDevices = {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
  };
  window.MediaRecorder = class {
    constructor() { this.state = "recording"; this.mimeType = "audio/webm"; }
    addEventListener() {}
    start() {}
    stop() { this.state = "inactive"; }
  };

  window.AudioContext = class {
    constructor() { this.state = estadoContexto; }
    resume() {
      resumeLlamado = true;
      this.state = "running";
      return Promise.resolve();
    }
    close() { return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() {
      const ctx = this;
      return {
        fftSize: 1024,
        connect() {},
        getByteTimeDomainData: (muestras) => {
          // Un contexto suspendido no procesa audio: buffer plano, nivel 0.
          if (ctx.state !== "running") return rellenar(muestras, 0);
          rellenar(muestras, guion.length ? guion.shift() : 0);
        },
      };
    }
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Avanza el reloj en ticks de 100 ms, que es el periodo del vigilante. */
const avanzar = async (ms) => { await vi.advanceTimersByTimeAsync(ms); };

describe("detección de fin de turno", () => {
  it("arranca el contexto de audio aunque nazca suspendido", async () => {
    await grabar({ alDetectarSilencio: vi.fn(), alNivel: vi.fn() });
    expect(resumeLlamado).toBe(true);
  });

  it("envía solo cuando te callas después de hablar", async () => {
    const alDetectarSilencio = vi.fn();
    // 300ms calibrando en silencio, 1s hablando, y luego callado.
    guion = [
      0.004, 0.004, 0.004,            // calibrado
      ...Array(10).fill(0.09),        // 1s de voz
      ...Array(20).fill(0.004),       // silencio sostenido
    ];

    await grabar({ alDetectarSilencio, alNivel: vi.fn() });

    await avanzar(1300);              // calibrado + voz, aún no debe cortar
    expect(alDetectarSilencio).not.toHaveBeenCalled();

    await avanzar(1400);              // 1,2s de silencio -> cierra
    expect(alDetectarSilencio).toHaveBeenCalledTimes(1);
  });

  /*
   * El caso que rompía el modo en la práctica: nadie espera 300 ms en silencio
   * antes de hablar; se pulsa el teléfono y se habla.
   */
  it("cierra el turno aunque empieces a hablar de inmediato", async () => {
    const alDetectarSilencio = vi.fn();
    guion = [
      0.02, 0.09, 0.11,               // calibrado CONTAMINADO por la voz
      ...Array(10).fill(0.08),        // sigue hablando
      ...Array(20).fill(0.004),       // se calla
    ];

    await grabar({ alDetectarSilencio, alNivel: vi.fn() });
    await avanzar(3000);

    expect(alDetectarSilencio).toHaveBeenCalledTimes(1);
  });

  it("no corta por el ruido de fondo si nadie ha hablado", async () => {
    const alDetectarSilencio = vi.fn();
    guion = Array(40).fill(0.004);    // sala en silencio, nadie dice nada

    await grabar({ alDetectarSilencio, alNivel: vi.fn() });
    await avanzar(4000);

    expect(alDetectarSilencio).not.toHaveBeenCalled();
  });

  it("avisa del nivel para que el anillo se mueva", async () => {
    const alNivel = vi.fn();
    guion = [0.004, 0.004, 0.004, 0.09, 0.09];

    await grabar({ alDetectarSilencio: vi.fn(), alNivel });
    await avanzar(500);

    expect(alNivel).toHaveBeenCalled();
    expect(Math.max(...alNivel.mock.calls.map(([v]) => v))).toBeGreaterThan(0.05);
  });
});
