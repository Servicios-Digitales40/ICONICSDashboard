/**
 * prototypes/machine-cards/neonSkin.js
 * ------------------------------------------------------------------
 * Piel visual compartida por las dos propuestas Neon Cyber HUD (ancha y
 * vertical). A diferencia de `_shared.js` — que es solo semántica de
 * datos — este archivo SÍ es estilo: es la excepción justificada porque
 * las dos variantes son la misma piel en dos formatos, y mantener dos
 * copias de la adaptación claro/oscuro garantizaba que se desincronizaran.
 *
 * El problema que resuelve
 * ------------------------------------------------------------------
 * El HUD nació como pieza "de sala oscura": fondo casi negro y neón puro.
 * En tema claro eso no se puede traducir bajando el brillo, porque el neón
 * ES luz sobre oscuridad. La versión clara reinterpreta el concepto como
 * **plano técnico / panel de laboratorio**: papel blanco azulado, retícula
 * fina, tinta oscura y el color de estado como acento saturado. Se conserva
 * TODO el movimiento (radar, scan, barrido, esquinas, parpadeo): lo que
 * cambia es el soporte, no la personalidad.
 *
 * Reglas que aplica al cambiar de modo:
 *  • El resplandor (`glow`) casi desaparece en claro: un halo de color
 *    sobre blanco no brilla, solo emborrona el texto.
 *  • Las muescas que segmentan las barras se invierten: negras sobre
 *    fondo oscuro, blancas sobre fondo claro. Siempre son "el soporte
 *    asomando", no una tinta.
 *  • El número central pierde el filtro de brillo en claro y se dibuja
 *    con tinta plena, que es lo que lo mantiene nítido.
 */
import { useMemo } from "react";
import { useTheme } from "@/theme";

export function useNeonSkin() {
  const { theme: t, dark } = useTheme();

  return useMemo(() => {
    if (dark) {
      return {
        dark: true,
        // Superficie y tintas
        surface: "#070B12",
        ink: "#DBE4F0",
        inkSoft: "rgba(255,255,255,0.62)",
        inkFaint: "rgba(255,255,255,0.50)",
        // Pistas y marcas
        track: "rgba(255,255,255,0.06)",
        trackBorder: "rgba(255,255,255,0.08)",
        ringTrack: "rgba(255,255,255,0.08)",
        tickOff: "rgba(255,255,255,0.12)",
        notch: "rgba(0,0,0,0.60)",
        shine: "rgba(255,255,255,0.50)",
        // Número central del radial
        dialInk: "#FFFFFF",
        dialGlow: true,
        // Profundidad y transparencias de acento (sufijos hex de alfa)
        drop: "0 20px 50px rgba(0,0,0,0.6)",
        gridA: "0f",
        chipA: "0e",
        innerA: "12",
        borderA: "66",
        wedgeOpacity: 0.55,
        scanOpacity: 0.5,
        // Helpers dependientes de modo
        glow: (c, px = 8) => `0 0 ${px}px ${c}`,
        telemetry: (c) => `${c}bb`,
      };
    }

    return {
      dark: false,
      // Papel blanco con una caída azulada: da profundidad sin ensuciar.
      surface: "radial-gradient(130% 90% at 50% -10%, #FFFFFF 0%, #EBF0FA 100%)",
      ink: t.text,
      inkSoft: "rgba(16,24,40,0.62)",
      inkFaint: "rgba(16,24,40,0.48)",
      track: "rgba(16,24,40,0.05)",
      trackBorder: "rgba(16,24,40,0.10)",
      ringTrack: "rgba(16,24,40,0.09)",
      tickOff: "rgba(16,24,40,0.16)",
      // Muescas claras: es el papel asomando entre los segmentos.
      notch: "rgba(255,255,255,0.88)",
      shine: "rgba(255,255,255,0.80)",
      dialInk: t.text,
      dialGlow: false,
      drop: "0 10px 30px rgba(16,24,40,0.10)",
      // La retícula necesita más alfa para verse sobre blanco.
      gridA: "1c",
      chipA: "14",
      innerA: "08",
      borderA: "55",
      wedgeOpacity: 0.3,
      scanOpacity: 0.35,
      // Resplandor casi nulo: sobre blanco solo emborronaría.
      glow: (c, px = 8) => `0 0 ${px}px ${c}40`,
      telemetry: () => "rgba(16,24,40,0.48)",
    };
  }, [t, dark]);
}
