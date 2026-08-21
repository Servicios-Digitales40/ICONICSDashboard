/**
 * Modo muro: la aplicación en un monitor colgado a tres metros, sin teclado
 * ni ratón, encendido el turno entero — no un portátil a 60 cm.
 *
 * ── POR QUÉ ESTO NO ESCALA LA RAÍZ EN `rem` ──────────────────────────
 *
 * El plan original de esta fase proponía escalar `:root { font-size }` y
 * dejar que el resto del sistema, en `rem`, creciera con ella. Medido antes
 * de escribir nada: **199** declaraciones de `fontSize` en todo `src/`, y
 * **ninguna** en `rem` o `em` — todas en `px` sueltos dentro de objetos de
 * estilo en línea (`fontSize: 13`, `fontSize: 11.5`…), y sin un
 * `html { font-size }` del que partir. Escalar la raíz no habría movido ni
 * un píxel de nada: habría hecho falta reescribir las 199, un cambio muy
 * por encima de lo que pide esta fase y con mucho más riesgo de romper algo.
 *
 * En su lugar, `zoom` en el contenedor raíz del `Shell` (`app/App.jsx`):
 * escala TODO —tipografía, relleno, bordes, huecos— exactamente como el
 * zoom del propio navegador, sin tocar una sola declaración existente. La
 * frontera de `DESIGN.md` de "ningún texto pasa de 16px" se mantiene: sigue
 * siendo cierta en las UNIDADES DEL SISTEMA, que es lo que la regla protegía
 * — un texto de 13px con `zoom: 1.6` se PINTA a 20,8px porque cambió la
 * distancia de lectura, no porque el sistema haya dejado de tener un techo.
 *
 * ── LA ROTACIÓN ES OPCIONAL, Y APAGADA POR DEFECTO ───────────────────
 *
 * `?muro=1` solo ya vale: escala y quita el cromo. La rotación necesita DOS
 * parámetros más (`vistas`, `rotarCada`) porque elegir automáticamente qué
 * páginas rotar sería una decisión de producto que este archivo no puede
 * tomar por la instalación — `eva-assets` es una herramienta de diagnóstico
 * con valores en crudo, no algo para dejar puesto en la pared, y cuál de las
 * vistas 3D tiene sentido sin un equipo elegido depende de la planta.
 */
import { useEffect, useMemo } from "react";

/** Escala por defecto: legible a unos tres metros sin quedar absurda a medio metro, si alguien la revisa de cerca. */
const ESCALA_DEFECTO = 1.6;
const ESCALA_MIN = 1;
const ESCALA_MAX = 3;

/**
 * `params` de la URL → la configuración del modo muro.
 *
 * @returns {{ activo: boolean, vistas: string[], intervaloS: number, escala: number }}
 */
export function leerModoMuro(params) {
  const activo = params?.muro === "1";
  const vistas = typeof params?.vistas === "string"
    ? params.vistas.split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  const intervaloS = Math.max(0, Number(params?.rotarCada) || 0);

  const escalaPedida = Number(params?.escala);
  const escala = Number.isFinite(escalaPedida)
    ? Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escalaPedida))
    : ESCALA_DEFECTO;

  return { activo, vistas, intervaloS, escala };
}

/**
 * Cicla entre `vistas` cada `intervaloS` segundos, mientras el modo esté
 * activo. Con menos de dos vistas o sin intervalo, no hace nada — rotar
 * entre una sola página no es rotación, es la misma página con un temporizador
 * de más.
 */
export function useRotacionMuro({ activo, vistas, intervaloS, paginaActual, navigate }) {
  // `vistas` llega como un array nuevo en cada render (viene de `.split()`);
  // se memoiza por su contenido real para que el efecto de abajo no reinicie
  // el temporizador en cada repintado de la página que SÍ cambia cada pocos
  // segundos por el sondeo en vivo.
  const clave = vistas.join(",");
  const listaEstable = useMemo(() => vistas, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activo || listaEstable.length < 2 || intervaloS <= 0) return undefined;

    /*
     * `i` es una variable de cierre, no un estado de React: el propio
     * `setInterval` la actualiza en cada disparo, sin pasar por un
     * repintado. Es a propósito — si `i` viniera de `paginaActual` (una prop
     * que cambia cuando la rotación navega), ese cambio dispararía este
     * mismo efecto de nuevo por su regla de dependencias, y el temporizador
     * se reiniciaría justo antes de completar cada ciclo: la rotación
     * quedaría oscilando entre las dos primeras vistas y nunca llegaría a
     * la tercera.
     */
    let i = Math.max(0, listaEstable.indexOf(paginaActual));
    const id = setInterval(() => {
      i = (i + 1) % listaEstable.length;
      navigate(listaEstable[i]);
    }, intervaloS * 1000);

    return () => clearInterval(id);
    // `paginaActual` sólo fija el punto de partida al activarse el modo, y
    // no participa después — por el motivo de arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, listaEstable, intervaloS, navigate]);
}
