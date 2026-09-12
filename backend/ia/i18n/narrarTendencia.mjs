/**
 * Traduce el resultado de `calcularTendencia()` (herramientas.mjs) al inglés.
 *
 * ── POR QUÉ ES UN CATÁLOGO PROPIO Y NO EL DE `domain.json` ─────────────
 *
 * El frontend ya tiene un `trend` en `diagnostics.json`
 * (`empeorando`/`mejorando`/`estable`/`sinDeterminar`), pero es otro
 * vocabulario: evalúa si la situación de RIESGO mejora o empeora, y eso
 * depende de la señal —una presión que sube puede ser buena o mala según
 * cuál—. `calcularTendencia()` no sabe nada de riesgo: sólo dice si el
 * NÚMERO sube, baja o se queda quieto. Mezclar los dos catálogos sería
 * forzar una palabra que no significa lo mismo.
 *
 * ── POR QUÉ NO SE LEE OTRO JSON DEL FRONTEND ───────────────────────────
 *
 * Porque no hay uno que ya diga esto. A diferencia de `narrarRiesgo.mjs`
 * —que reutiliza `domain.json`, ya escrito y probado por i18n del
 * frontend—, aquí no existía la traducción en ningún sitio: es vocabulario
 * nuevo que sólo necesita el asistente. Se declara aquí, chico y sin
 * dependencias, en vez de añadirlo a un JSON del frontend que no lo usa.
 */

const DIRECCION_EN = {
  estable: "steady",
  subiendo: "rising",
  bajando: "falling",
  "sin datos suficientes para calcularla": "not enough data to calculate it",
};

const NOTA_EN = {
  "El ajuste es bajo: hay mucho ruido y la tendencia no es muy fiable.":
    "The fit is weak: there is a lot of noise and the trend is not very reliable.",
  "El ajuste es razonable para esta ventana.":
    "The fit is reasonable for this window.",
};

/**
 * @param {{direccion: string, cambioPorHora?: number, ajuste?: string, nota?: string}} tendencia
 * @param {"es"|"en"} idioma
 * @returns {object} el mismo objeto, con `direccion`/`nota` en inglés cuando aplica
 */
export function narrarTendenciaEnIngles(tendencia, idioma) {
  if (!tendencia || idioma !== "en") return tendencia;
  return {
    ...tendencia,
    direccion: DIRECCION_EN[tendencia.direccion] ?? tendencia.direccion,
    ...(tendencia.nota ? { nota: NOTA_EN[tendencia.nota] ?? tendencia.nota } : {}),
  };
}
