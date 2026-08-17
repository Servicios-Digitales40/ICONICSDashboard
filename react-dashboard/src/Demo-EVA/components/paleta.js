/**
 * Paleta de ESTADO de Demo EVA.
 *
 * ── POR QUÉ SE HEREDAN LOS HEX DE `dashboard-v2/palette.js` ────────
 *
 * Aquellos cinco tonos están **medidos**, no elegidos a ojo: pasaron el
 * validador de la skill `dataviz` (OKLab ΔE ×100) contra la superficie real de
 * panel de cada modo, con protanopía, deuteranopía y tritanopía, y corrigen dos
 * colisiones que el tablero antiguo aún tiene. Volver a inventar cinco colores
 * aquí significaría volver a validarlos, y lo más probable es acabar en los
 * mismos.
 *
 * Se toman **cinco de los seis**: se cae el azul de `setup`, que no tiene
 * equivalente en este vocabulario. Quitar un color de un juego validado sólo
 * puede aumentar la separación entre los que quedan, nunca reducirla, así que
 * la validación de origen sigue valiendo.
 *
 * El emparejamiento va por PAPEL SEMÁNTICO, no por parecido de nombre:
 *
 *   critico  ← «Alarma»            (coral · lo que hay que atender ya)
 *   atencion ← «Sin comunicación»  (ámbar · exige mirar, no correr)
 *   reposo   ← «Stand By»          (gris cálido de DATOS · parada prevista)
 *   nominal  ← «Operando»          (verde)
 *   sin_dato ← «Sin dato»          (gris apagado · ausencia, no estado)
 *
 * ── EL COLOR NUNCA VA SOLO ─────────────────────────────────────────
 *
 * Igual que en el resto de la aplicación, todo estado se pinta con **punto de
 * color + etiqueta de texto**. La identidad no depende del tono, así que los
 * dos avisos que el validador deja abiertos —el gris sin croma y los pasteles
 * del modo oscuro— siguen siendo aceptables por el mismo motivo que allí.
 */

/** Estado → color de DATO, por modo. Ver cabecera antes de tocar. */
const ESTADO_VIZ = {
  light: {
    critico: "#D9573F",
    atencion: "#C29A12",
    reposo: "#A39E96",
    nominal: "#1B9169",
    sin_dato: "#C6CBD6",
  },
  dark: {
    critico: "#E37A63",
    atencion: "#E8C05A",
    reposo: "#7E8AA3",
    nominal: "#3ED9A5",
    sin_dato: "#4A5468",
  },
};

/** Color de dato de un estado, para el modo activo. Desconocido → sin dato. */
export const estadoColor = (dark, estado) => {
  const juego = ESTADO_VIZ[dark ? "dark" : "light"];
  return juego[estado] ?? juego.sin_dato;
};

/**
 * Fondo suave semántico, POR TEMA.
 *
 * Se usan los tokens `*Soft` del tema y no tintes hex-alfa (`${color}12`): un
 * 7 % de coral sobre el panel oscuro #151B27 es invisible, y la franja de aviso
 * dejaría de distinguirse de una tarjeta normal en modo oscuro.
 */
export const TONO = {
  critico: (t) => ({ fondo: t.coralSoft, borde: t.coral, texto: t.coral }),
  aviso: (t) => ({ fondo: t.amberSoft, borde: t.amber, texto: t.amber }),
  ok: (t) => ({ fondo: t.successSoft, borde: t.success, texto: t.success }),
  info: (t) => ({ fondo: t.accentSoft, borde: t.accent, texto: t.accent }),
};

/**
 * Color de una BANDA de umbral, para barras y arcos de magnitud.
 *
 * Es el equivalente de `bandColor` de `lib/shiftModel.js`, que no sirve aquí:
 * aquél parte de que el número es un porcentaje de OEE y aplica cortes fijos en
 * 50 y 75. Nuestras señales son magnitudes con banda propia —una tensión de 122
 * es excelente y una de 50 sería catastrófica—, así que el color lo decide la
 * BANDA que ya calculó el dominio, nunca el valor en bruto.
 */
export const bandaColor = (t, dark, banda) => {
  if (banda === "critico") return estadoColor(dark, "critico");
  if (banda === "atencion") return estadoColor(dark, "atencion");
  if (banda === "nominal") return estadoColor(dark, "nominal");
  return t.textFaint;
};
