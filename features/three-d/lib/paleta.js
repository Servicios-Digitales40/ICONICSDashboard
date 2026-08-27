/**
 * Los colores que usa la escena 3D, derivados del tema de la aplicación.
 *
 * ── POR QUÉ UNA PALETA PROPIA Y NO `useTheme()` DENTRO DEL CANVAS ──
 *
 * `<Canvas>` monta un reconciliador de React aparte. r3f v8 tiende un puente
 * de contexto (por eso arrastra `its-fine`), pero es una garantía frágil sobre
 * la que no conviene apoyar TODOS los colores de la vista: el día que falle,
 * falla en silencio y la escena sale con colores por defecto.
 *
 * Aquí el tema se lee UNA vez, fuera del canvas, se reduce a los pocos colores
 * que la escena necesita, y ese objeto entra por un contexto creado dentro.
 * Es además lo honesto: una escena 3D no necesita los 30 tokens de la interfaz.
 *
 * Se exporta el contexto pero no el Provider: lo monta `Escena.jsx`, que es
 * quien está a los dos lados de la frontera.
 */
import { createContext, useContext } from "react";

/**
 * Tokens de estado → color. Es la MISMA fuente que usan las tarjetas 2D
 * (`estadoInfo(key).token` → `theme[token]`), así que un cambio de tema o de
 * color de estado llega al 3D sin tocar nada de aquí.
 */
export function construirPaleta(theme, dark) {
  return {
    dark,

    // Fondo y suelo
    fondo: theme.page,
    suelo: dark ? "#141A26" : "#E9ECF3",
    rejilla: theme.grid,
    conector: dark ? "#2A3346" : theme.border,

    // Cuerpo de la máquina. No son tokens de interfaz: una carcasa industrial
    // pintada con `theme.panel` se funde con el fondo y la silueta se pierde.
    carcasa: dark ? "#8E99AE" : "#B9C1D0",
    // El depósito es azul en el equipo real, y es lo primero por lo que se
    // reconoce. Va aquí y no en el modelo porque es color de escena, no de
    // estado: el tinte del estado se le aplica encima con `tono()`.
    deposito: dark ? "#2F63C4" : "#27549F",
    // El AGUA de la columna (`ColumnaModel`), literal y no de marca. Vivía
    // como `theme.accent` — bastaba con que un tema tuviera el acento rojo
    // (Mitsubishi Electric) para que el líquido se pintara de rojo, como si
    // el sensor hubiera medido una alarma en vez de un nivel. El agua es
    // azul siempre, en los tres temas, igual que el depósito de abajo — es
    // color de escena, no de interfaz, así que no debe seguir al acento.
    agua: dark ? "#2F63C4" : "#27549F",
    // El cuerpo de la válvula instrumentada (`ValvulaModel`) es azul en el
    // dibujo del equipo real (ver la cabecera de ese archivo: «su cuerpo
    // azul y su cabezal negro»). Tenía el mismo fallo que el agua: coloreado
    // con `theme.accent`, se volvía rojo bajo Mitsubishi Electric.
    valvula: dark ? "#2F63C4" : "#27549F",
    // El cabezal del sensor de nivel. Turquesa porque lo es en el equipo, y
    // porque conviene que se distinga del resto del inoxidable: es la pieza que
    // explica de dónde sale el número que mueve el líquido de la columna.
    sensor: dark ? "#4CC7DF" : "#2C9EBC",
    carcasaOscura: dark ? "#5A6478" : "#8892A6",
    metal: dark ? "#C7CEDC" : "#9AA3B4",
    goma: dark ? "#2A3140" : "#3C4353",

    // Semánticos, tal cual los define el tema
    success: theme.success,
    coral: theme.coral,
    amber: theme.amber,
    accent: theme.accent,
    violet: theme.violet,
    textSoft: theme.textSoft,
    textFaint: theme.textFaint,
  };
}

/**
 * Token del tema → color, para lo que llega ya resuelto a un token.
 *
 * Los descriptores hablan en tokens (`"coral"`, `"success"`) y no en hexes,
 * igual que el dominio, así que la traducción vive en un solo sitio. Un token
 * que no exista devuelve el gris apagado en vez de `undefined`, que en three.js
 * se pintaría de blanco y parecería una máquina iluminada.
 */
export function colorDeToken(P, token, porDefecto = null) {
  if (!token) return porDefecto ?? P.textFaint;
  return P[token] ?? porDefecto ?? P.textFaint;
}

export const Paleta3DContext = createContext(null);

/** La paleta dentro de la escena. Falla ruidosamente si se usa fuera. */
export function usePaleta3D() {
  const p = useContext(Paleta3DContext);
  if (!p) throw new Error("usePaleta3D() debe usarse dentro de <Escena>");
  return p;
}
