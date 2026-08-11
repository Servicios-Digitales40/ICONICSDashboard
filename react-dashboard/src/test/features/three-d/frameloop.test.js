/**
 * frameloop.test.js
 * ------------------------------------------------------------------
 * Cuándo la escena tiene derecho a dibujar de continuo.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * `frameloop="always"` mantiene la GPU repintando 60 veces por segundo el
 * mismo fotograma. En un portátil no se nota; en una pantalla de planta
 * encendida ocho horas es calor, ventilador y, en un equipo pasivo,
 * limitación térmica.
 *
 * La regla —dibujar de continuo SÓLO si hay un bucle vivo— vale exactamente lo
 * que valga su cumplimiento, y es de las que se rompen sin que nada falle:
 * basta con que alguien deje `"always"` fijo mientras depura una animación.
 *
 * Se prueba la decisión, que es pura, y no el hook: montar un canvas en jsdom
 * mediría el mock, no el renderizador. Las dos cosas comparten la misma
 * función de `estadoVisual.js`, así que lo que se fija aquí es lo que ocurre
 * en pantalla.
 */
import { describe, expect, it } from "vitest";

import {
  CLAVES_CANONICAS,
  CLAVES_EXTENDIDAS,
  comportamiento,
  comportamientoReducido,
} from "@/features/three-d/lib/estadoVisual.js";

const TODAS = [...CLAVES_CANONICAS, ...CLAVES_EXTENDIDAS];

/**
 * La misma decisión que toma `useFrameloop`, sin React.
 * Si esta función y el hook se separan, el hook deja de estar cubierto — por
 * eso el hook no hace nada más que esto.
 */
const decidir = (claves, reduce = false) =>
  !reduce && claves.some((k) => comportamiento(k).bucle !== "ninguno") ? "always" : "demand";

describe("frameloop de la escena", () => {
  it("una planta entera parada no dibuja", () => {
    // El caso que importa: turno de noche, o el servidor caído. Diez máquinas
    // en pantalla y la GPU a cero.
    expect(decidir(["standby", "standby", "unknown", "commfail"])).toBe("demand");
    expect(decidir(Array(10).fill("standby"))).toBe("demand");
  });

  it("una sola máquina en bucle basta para dibujar", () => {
    expect(decidir(["standby", "standby", "running"])).toBe("always");
    expect(decidir(["unknown", "alarma"])).toBe("always");
  });

  it("sólo operando y alarma piden dibujado continuo", () => {
    for (const key of TODAS) {
      const esperado = key === "running" || key === "alarma" ? "always" : "demand";
      expect(decidir([key]), `estado "${key}"`).toBe(esperado);
    }
  });

  it("con movimiento reducido nunca se dibuja de continuo", () => {
    // No es una optimización aparte: sin bucles no hay nada que dibujar, así
    // que `prefers-reduced-motion` apaga la GPU además de las animaciones.
    for (const key of TODAS) {
      expect(comportamientoReducido(key).bucle).toBe("ninguno");
      expect(decidir([key], true)).toBe("demand");
    }
  });

  it("una lista vacía no dibuja", () => {
    // Pasa de verdad: primer render antes de que llegue el primer snapshot.
    expect(decidir([])).toBe("demand");
  });
});
